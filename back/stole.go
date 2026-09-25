// Пакет store — это "база данных" приложения.
//
// Сейчас данные живут прямо в памяти процесса (в обычных Go-слайсах и
// картах), а не в PostgreSQL/MySQL — то есть при перезапуске сервера
// они сбрасываются к исходным (тем же, что были у вас в data.js).
//
// Так сделано специально: это даёт рабочий backend прямо сейчас, без
// установки СУБД, а структура кода (интерфейс Store) написана так,
// чтобы потом можно было подменить эту реализацию на настоящую БД,
// не переписывая handlers — им не важно, откуда данные приходят.
//
// Когда будете готовы подключить настоящую БД — смотрите комментарий
// "КАК ПОДКЛЮЧИТЬ НАСТОЯЩУЮ БД" в самом низу файла.
package store

import (
	"errors"
	"sync"
	"time"

	"studnet-backend/internal/models"
)

// ErrNotFound возвращается, когда запрошенной записи не существует —
// хендлеры проверяют её через errors.Is и отвечают клиенту 404.
var ErrNotFound = errors.New("запись не найдена")

// Store — вся "база" целиком. mu (mutex/мьютекс) защищает данные от
// одновременного доступа: Go-сервер обрабатывает много запросов
// параллельно (в отдельных горутинах), и без мьютекса два запроса
// могли бы одновременно менять один и тот же слайс и всё сломать.
type Store struct {
	mu sync.RWMutex // RWMutex: много читателей одновременно ИЛИ один писатель

	users       []models.User
	accessCodes map[string]int // код доступа -> id пользователя
	groups      []string
	directions  []string

	chatTypes map[string]models.ChatTypeInfo
	chats     []models.Chat
	messages  map[int][]models.Message // chatID -> сообщения

	clubs []models.Club
	stats models.AdminStats

	nextMessageID int64
}

// New создаёт хранилище и сразу заполняет его теми же данными,
// что раньше лежали у вас в data.js (seed-данные = "затравка").
func New() *Store {
	s := &Store{
		accessCodes: map[string]int{
			"123-123-123": 1, // Яша Кузнецов (студент)
			"456-456-456": 6, // ... в реальном примере это был Артём/Ольга — коды свои
		},
		groups: []string{"исп341", "исп342", "исп343", "ат231", "ат232", "э1031", "э1032", "тм241", "др351"},
		directions: []string{
			"Информационные системы и программирование",
			"Автомобили и автомобильное хозяйство",
			"Экономика и бухгалтерский учёт",
			"Технология транспортных процессов",
			"Дорожное строительство и эксплуатация автомобильных дорог",
		},
		chatTypes: map[string]models.ChatTypeInfo{
			"channel":   {Label: "Канал", ReadOnly: true},
			"group":     {Label: "Группа", ReadOnly: false},
			"direction": {Label: "Направление", ReadOnly: false},
			"course":    {Label: "Курс", ReadOnly: false},
			"flood":     {Label: "Флудилка", ReadOnly: false},
			"dm":        {Label: "ЛС", ReadOnly: false},
		},
		messages: map[int][]models.Message{},
		stats: models.AdminStats{
			TotalUsers:     980,
			OnlineNow:      214,
			ActiveChats:    67,
			PendingReports: 2,
			Announcements:  8,
		},
		nextMessageID: 1000,
	}

	s.users = seedUsers()
	s.chats = seedChats()
	s.messages = seedMessages()
	s.clubs = seedClubs()

	return s
}

// ───────────────────────── Пользователи ─────────────────────────

// UserByAccessCode ищет пользователя по коду доступа (для входа).
// Возвращает ErrNotFound, если код не найден.
func (s *Store) UserByAccessCode(code string) (models.User, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	id, ok := s.accessCodes[code]
	if !ok {
		return models.User{}, ErrNotFound
	}
	return s.findUserByID(id)
}

// UserByID возвращает пользователя по числовому id.
func (s *Store) UserByID(id int) (models.User, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.findUserByID(id)
}

// findUserByID — внутренний поиск без блокировки (вызывающий уже держит lock).
func (s *Store) findUserByID(id int) (models.User, error) {
	for _, u := range s.users {
		if u.ID == id {
			return u, nil
		}
	}
	return models.User{}, ErrNotFound
}

// UserFilter — параметры фильтрации списка пользователей (страница поиска).
type UserFilter struct {
	Group     string
	Direction string
	Course    int  // 0 = не фильтровать по курсу
	OnlyOnline bool
}

// ListUsers возвращает пользователей, подходящих под фильтр —
// аналог того, что делал API.getUsers(filters) в api.js.
func (s *Store) ListUsers(f UserFilter) []models.User {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make([]models.User, 0, len(s.users))
	for _, u := range s.users {
		if f.Group != "" && u.Group != f.Group {
			continue
		}
		if f.Direction != "" && u.Direction != f.Direction {
			continue
		}
		if f.Course != 0 && u.Course != f.Course {
			continue
		}
		if f.OnlyOnline && !u.Online {
			continue
		}
		result = append(result, u)
	}
	return result
}

// AllUsers — без фильтров, для админ-панели.
func (s *Store) AllUsers() []models.User {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]models.User, len(s.users))
	copy(out, s.users)
	return out
}

// Groups / Directions — справочники для выпадающих списков на фронте.
func (s *Store) Groups() []string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return append([]string{}, s.groups...)
}

func (s *Store) Directions() []string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return append([]string{}, s.directions...)
}

// ───────────────────────── Чаты и сообщения ─────────────────────────

// ChatsForUser возвращает список чатов, видимых пользователю.
// Сейчас (как и в старом api.js-стабе) отдаются все чаты — при
// подключении настоящей БД здесь появится фильтр "в каких чатах
// состоит именно этот userID".
func (s *Store) ChatsForUser(userID int) []models.Chat {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]models.Chat, len(s.chats))
	copy(out, s.chats)
	return out
}

// ChatByID нужен, чтобы проверить тип чата (например, read-only канал)
// перед тем как разрешить отправку сообщения.
func (s *Store) ChatByID(id int) (models.Chat, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, c := range s.chats {
		if c.ID == id {
			return c, nil
		}
	}
	return models.Chat{}, ErrNotFound
}

// ChatTypeInfo отдаёт правила (label/readonly) для типа чата.
func (s *Store) ChatTypeInfo(t string) (models.ChatTypeInfo, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	info, ok := s.chatTypes[t]
	return info, ok
}

// Messages — все сообщения чата в хронологическом порядке.
func (s *Store) Messages(chatID int) []models.Message {
	s.mu.RLock()
	defer s.mu.RUnlock()
	msgs := s.messages[chatID]
	out := make([]models.Message, len(msgs))
	copy(out, msgs)
	return out
}

// ErrReadOnlyChat возвращается, когда студент пытается писать в канал.
var ErrReadOnlyChat = errors.New("этот чат доступен только для чтения")

// AddMessage добавляет сообщение в чат и обновляет его "превью"
// (lastMessage/lastTime) в списке чатов — так же, как это делал
// sendMessage() в вашем api.js.
func (s *Store) AddMessage(chatID, userID int, text, userRole string) (models.Message, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Проверяем правило "каналы — только для преподавателей".
	for _, c := range s.chats {
		if c.ID == chatID {
			if info, ok := s.chatTypes[c.Type]; ok && info.ReadOnly && userRole != "teacher" {
				return models.Message{}, ErrReadOnlyChat
			}
			break
		}
	}

	now := time.Now()
	msg := models.Message{
		ID:        s.nextMessageID,
		ChatID:    chatID,
		UserID:    userID,
		Text:      text,
		Time:      now.Format("15:04"),
		Reactions: []models.Reaction{},
	}
	s.nextMessageID++

	s.messages[chatID] = append(s.messages[chatID], msg)

	for i := range s.chats {
		if s.chats[i].ID == chatID {
			s.chats[i].LastMessage = text
			s.chats[i].LastTime = msg.Time
			break
		}
	}

	return msg, nil
}

// ───────────────────────── Клубы ─────────────────────────

func (s *Store) Clubs() []models.Club {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]models.Club, len(s.clubs))
	copy(out, s.clubs)
	return out
}

func (s *Store) ClubByID(id int) (models.Club, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, c := range s.clubs {
		if c.ID == id {
			return c, nil
		}
	}
	return models.Club{}, ErrNotFound
}

// ───────────────────────── Админ-статистика ─────────────────────────

func (s *Store) AdminStats() models.AdminStats {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.stats
}

/*
КАК ПОДКЛЮЧИТЬ НАСТОЯЩУЮ БД (например, PostgreSQL)
====================================================
1. go get github.com/jackc/pgx/v5
2. Замените поля Store (слайсы/карты) на *pgxpool.Pool.
3. В каждом методе (UserByID, ListUsers, AddMessage...) вместо работы
   со слайсом напишите SQL-запрос через pool.QueryRow / pool.Query.
4. Сигнатуры методов (имя, параметры, что возвращают) можно оставить
   такими же — тогда handlers/*.go менять вообще не придётся, ведь
   они обращаются к Store через его методы, а не напрямую к данным.

Это и есть смысл "слоя store" — он прячет ЗА СОБОЙ детали хранения,
так что остальной код не знает и не должен знать, in-memory это,
Postgres или что-то ещё.
*/