// Пакет session реализует простую токен-авторизацию.
//
// Как это работает "по-человечески":
//  1. Пользователь вводит код доступа -> сервер находит пользователя
//     -> генерирует случайную строку (токен) -> запоминает "токен
//     принадлежит пользователю X" -> отдаёт токен в ответе.
//  2. Браузер сохраняет токен (например, в localStorage) и присылает
//     его в каждом следующем запросе в заголовке:
//         Authorization: Bearer <токен>
//  3. Сервер смотрит в свою карту "токен -> пользователь" и понимает,
//     кто именно сейчас обращается — без этого любой мог бы прислать
//     чужой userId и притвориться другим человеком.
//
// Токены сейчас хранятся в памяти (пропадают при перезапуске сервера —
// пользователям просто нужно будет войти заново). Для прод-версии
// логичный следующий шаг — JWT или хранение сессий в Redis/БД, но для
// учебного/пет-проекта такого подхода более чем достаточно.
package session

import (
	"crypto/rand"
	"encoding/hex"
	"sync"
	"time"
)

// TTL — время жизни токена. По истечении пользователю нужно войти снова.
const TTL = 30 * 24 * time.Hour // 30 дней

type entry struct {
	userID    int
	expiresAt time.Time
}

// Manager — потокобезопасное хранилище активных токенов.
type Manager struct {
	mu     sync.RWMutex
	tokens map[string]entry
}

func NewManager() *Manager {
	return &Manager{tokens: map[string]entry{}}
}

// Issue создаёт новый токен для пользователя userID.
func (m *Manager) Issue(userID int) (string, error) {
	token, err := randomToken(32)
	if err != nil {
		return "", err
	}

	m.mu.Lock()
	defer m.mu.Unlock()
	m.tokens[token] = entry{userID: userID, expiresAt: time.Now().Add(TTL)}
	return token, nil
}

// Resolve возвращает userID, привязанный к токену, если он ещё жив.
func (m *Manager) Resolve(token string) (userID int, ok bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	e, found := m.tokens[token]
	if !found || time.Now().After(e.expiresAt) {
		return 0, false
	}
	return e.userID, true
}

// Revoke удаляет токен — используется при выходе (logout).
func (m *Manager) Revoke(token string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.tokens, token)
}

// randomToken генерирует криптографически случайную hex-строку —
// её невозможно угадать перебором, в отличие от, например,
// последовательного счётчика "1, 2, 3...".
func randomToken(nBytes int) (string, error) {
	buf := make([]byte, nBytes)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}