// Пакет models описывает структуры данных приложения.
//
// Это "чертежи" объектов, с которыми работает вся программа: пользователь,
// чат, сообщение, клуб и т.д. Они один в один повторяют объекты, которые
// раньше лежали в вашем data.js — просто теперь у каждого поля есть тип
// (string, int, bool...), а Go это строго проверяет на этапе компиляции.
//
// Тег `json:"name"` возле каждого поля говорит стандартной библиотеке Go,
// как называть это поле при превращении структуры в JSON (то, что отдаётся
// в ответ на fetch() из браузера) и наоборот — при разборе JSON из запроса.
package models

// User — пользователь (студент или преподаватель).
type User struct {
	ID        int      `json:"id"`
	Name      string   `json:"name"`
	Email     string   `json:"email"`
	Avatar    string   `json:"avatar"`
	Group     string   `json:"group"`
	Direction string   `json:"direction"`
	Course    int      `json:"course"`
	Interests []string `json:"interests"`
	Online    bool     `json:"online"`
	// Role: "student" | "teacher" — от роли зависит доступ к админке
	// и право писать в read-only каналы (см. internal/store/store.go).
	Role string `json:"role"`
	Bio  string `json:"bio"`

	// PasswordHash никогда не попадёт в JSON-ответ клиенту благодаря
	// тегу "-": так помечают поля, которые нужны серверу, но не должны
	// "утекать" в браузер (пароли, внутренние флаги и т.п.).
	PasswordHash string `json:"-"`
}

// Reaction — эмодзи-реакция под сообщением ("🔥" x2 и т.п.).
type Reaction struct {
	Emoji string `json:"emoji"`
	Count int    `json:"count"`
}

// Message — одно сообщение в чате.
type Message struct {
	ID        int64      `json:"id"`
	ChatID    int        `json:"chatId"`
	UserID    int        `json:"userId"`
	Text      string     `json:"text"`
	Time      string     `json:"time"`
	Reactions []Reaction `json:"reactions"`
}

// Chat — канал/группа/направление/курс/флудилка/личка.
// Тип чата (Type) определяет его поведение — см. ChatTypeInfo ниже.
type Chat struct {
	ID          int    `json:"id"`
	Name        string `json:"name"`
	Type        string `json:"type"` // channel | group | direction | course | flood | dm
	Avatar      string `json:"avatar"`
	Icon        string `json:"icon"`
	Members     int    `json:"members"`
	Description string `json:"description"`
	Unread      int    `json:"unread"`
	LastMessage string `json:"lastMessage"`
	LastTime    string `json:"lastTime"`
	// UserID заполнен только для личных чатов (type == "dm") —
	// это id собеседника.
	UserID int `json:"userId,omitempty"`
}

// ChatTypeInfo — метаданные типа чата (человекочитаемое имя + правило
// "можно ли обычным студентам сюда писать"). Каналы — read-only для
// студентов: писать могут только преподаватели.
type ChatTypeInfo struct {
	Label    string `json:"label"`
	ReadOnly bool   `json:"readonly"`
}

// Club — студенческий клуб/секция.
type Club struct {
	ID          int    `json:"id"`
	Name        string `json:"name"`
	Emoji       string `json:"emoji"`
	Description string `json:"description"`
	Members     int    `json:"members"`
	Category    string `json:"category"`
	Joined      bool   `json:"joined"`
	Admin       string `json:"admin"`
}

// AdminStats — цифры для дашборда админ-панели.
type AdminStats struct {
	TotalUsers      int `json:"totalUsers"`
	OnlineNow       int `json:"onlineNow"`
	ActiveChats     int `json:"activeChats"`
	PendingReports  int `json:"pendingReports"`
	Announcements   int `json:"announcements"`
}