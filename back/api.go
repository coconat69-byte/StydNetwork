// api.go — обработчики запросов /api/... (список адресов — в main.go).
//
// Как устроен вход:
//  1. Браузер отправляет код доступа на /api/login.
//  2. Сервер находит пользователя, придумывает случайный токен и сохраняет его в таблицу sessions
//     вместе со сроком действия (7 дней).
//  3. Дальше браузер присылает токен в каждом запросе в заголовке «Authorization: Bearer <токен>»,
//     и по нему сервер понимает, кто спрашивает.
//
// Защита от SQL-инъекций: во ВСЕХ запросах к базе данные от пользователя передаются
// через знаки «?» (параметры), а не вклеиваются в текст запроса. База получает текст
// запроса и значения отдельно, поэтому значение вроде «1; DROP TABLE users» так и
// останется просто строкой и никогда не выполнится как команда.
package main

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"log"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
	"unicode/utf8"
)

// ── Ограничения ──────────────────────────────────────────

// Самый большой запрос, который сервер согласен прочитать (64 КБ).
// Без ограничения можно было бы прислать гигабайт и занять всю память сервера.
const maxBodySize = 64 * 1024

// Сколько символов можно ввести в разные поля.
// В форме на сайте стоят такие же ограничения (атрибут maxlength), а здесь —
// на случай, если кто-то отправит запрос в обход сайта.
const (
	maxNameLen        = 50   // имя в профиле
	maxEmailLen       = 100  // email
	maxBioLen         = 500  // «О себе»
	maxMessageLen     = 2000 // сообщение в чате
	maxChannelNameLen = 60   // название канала
	maxDescriptionLen = 300  // описание канала
)

// Сколько живёт вход: через 7 дней токен перестаёт работать и нужно ввести код заново.
const sessionLifetime = 7 * 24 * time.Hour

// ── Общие помощники ──────────────────────────────────────

// handler — обработчик API. user — тот, кто вошёл (nil, если никто).
// Если вернуть ошибку, браузер получит ответ 500 «Ошибка сервера».
type handler func(w http.ResponseWriter, r *http.Request, user map[string]any) error

// route превращает handler в обычный обработчик net/http:
//   - находит пользователя по токену (токен должен быть не просрочен, а человек — не заблокирован);
//   - если loginRequired, а пользователя нет — отвечает 401 «Требуется вход»;
//   - если обработчик вернул ошибку — пишет её в лог и отвечает 500.
//
// Подробности ошибки в ответ не отправляем: незачем показывать посторонним, как устроен сервер.
func route(loginRequired bool, h handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user, err := queryOne(`SELECT * FROM users
			WHERE NOT blocked
			  AND id = (SELECT userId FROM sessions WHERE token = ? AND expiresAt > ?)`,
			tokenOf(r), time.Now().Unix())

		if err == nil && user == nil && loginRequired {
			fail(w, http.StatusUnauthorized, "Требуется вход")
			return
		}
		if err == nil {
			err = h(w, r, user)
		}
		if err != nil {
			log.Println("Ошибка:", err)
			fail(w, http.StatusInternalServerError, "Ошибка сервера")
		}
	}
}

// send отправляет value в ответ как JSON. Возвращает nil, чтобы можно было писать `return send(...)`.
// Go сам заменяет в JSON символы < > & на < и т.п., так что HTML в ответ «не просочится».
func send(w http.ResponseWriter, status int, value any) error {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(value)
	return nil
}

// fail отправляет ошибку {"error": "текст"} — этот текст сайт показывает пользователю.
func fail(w http.ResponseWriter, status int, message string) error {
	return send(w, status, map[string]string{"error": message})
}

// ok — короткий ответ «всё получилось»: {"ok": true}.
func ok(w http.ResponseWriter) error {
	return send(w, http.StatusOK, map[string]bool{"ok": true})
}

// tokenOf достаёт токен из заголовка «Authorization: Bearer <токен>».
func tokenOf(r *http.Request) string {
	return strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
}

// readBody читает JSON из тела запроса в dst.
// Читаем не больше maxBodySize байт. Пустое, слишком большое или битое тело
// просто оставит поля пустыми — дальше обработчик сам скажет, чего не хватает.
func readBody(w http.ResponseWriter, r *http.Request, dst any) {
	r.Body = http.MaxBytesReader(w, r.Body, maxBodySize)
	json.NewDecoder(r.Body).Decode(dst)
}

// readText достаёт текст сообщения из тела {"text": "..."} без пробелов по краям.
func readText(w http.ResponseWriter, r *http.Request) string {
	var body struct{ Text string }
	readBody(w, r, &body)
	return strings.TrimSpace(body.Text)
}

// tooLong — длиннее ли текст, чем max символов.
// Считаем именно символы (буквы), а не байты: русская буква занимает 2 байта.
func tooLong(text string, max int) bool {
	return utf8.RuneCountInString(text) > max
}

// isEmail — простая проверка, похож ли текст на адрес почты:
// ровно одна @, перед ней что-то есть, после неё есть точка, и нет пробелов и кавычек.
func isEmail(text string) bool {
	at := strings.Index(text, "@")
	if at <= 0 || at != strings.LastIndex(text, "@") {
		return false
	}
	if !strings.Contains(text[at:], ".") {
		return false
	}
	return !strings.ContainsAny(text, " <>\"'")
}

// now — текущее время в виде «12:05», так время показывается у сообщений.
func now() string {
	return time.Now().Format("15:04")
}

// ── Защита от перебора кодов ─────────────────────────────
//
// Код доступа — это всего 9 цифр. Без ограничений программа могла бы подбирать
// коды подряд тысячами в секунду и рано или поздно угадала бы чей-нибудь.
// Поэтому после 5 неудачных попыток с одного IP-адреса вход с него
// закрывается до конца минуты (считая от первой ошибки).

const maxLoginFails = 5             // сколько ошибок подряд можно сделать
const loginFailWindow = time.Minute // за какое время

// loginFails — сколько раз ошиблись с одного IP-адреса
type loginFails struct {
	count int       // сколько ошибок
	first time.Time // когда была первая из них
}

var (
	failsByIP  = map[string]*loginFails{} // IP-адрес -> его ошибки
	failsMutex sync.Mutex                 // запросы обрабатываются одновременно, а map нельзя менять из двух мест сразу
)

// ipOf — IP-адрес того, кто прислал запрос (без номера порта).
func ipOf(r *http.Request) string {
	ip, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return ip
}

// tooManyFails — закрыт ли сейчас вход для этого IP.
func tooManyFails(ip string) bool {
	failsMutex.Lock()
	defer failsMutex.Unlock()

	fails := failsByIP[ip]
	if fails == nil {
		return false
	}
	// Минута с первой ошибки прошла — забываем старые ошибки и начинаем счёт заново
	if time.Since(fails.first) > loginFailWindow {
		delete(failsByIP, ip)
		return false
	}
	return fails.count >= maxLoginFails
}

// rememberFail запоминает ещё одну неудачную попытку с этого IP.
func rememberFail(ip string) {
	failsMutex.Lock()
	defer failsMutex.Unlock()

	fails := failsByIP[ip]
	if fails == nil {
		fails = &loginFails{first: time.Now()}
		failsByIP[ip] = fails
	}
	fails.count++
}

// forgetFails стирает ошибки IP после удачного входа.
func forgetFails(ip string) {
	failsMutex.Lock()
	defer failsMutex.Unlock()
	delete(failsByIP, ip)
}

// newToken придумывает токен — 32 случайных байта в виде hex-строки (64 символа).
// crypto/rand — «настоящий» генератор случайных чисел, его значения угадать невозможно.
func newToken() string {
	bytes := make([]byte, 32)
	rand.Read(bytes)
	return hex.EncodeToString(bytes)
}

// ── Вход и выход ─────────────────────────────────────────

// POST /api/login {code} — вход по коду доступа. Отвечает {token, user}.
func login(w http.ResponseWriter, r *http.Request, _ map[string]any) error {
	ip := ipOf(r)
	if tooManyFails(ip) {
		return fail(w, http.StatusTooManyRequests, "Слишком много неверных попыток. Подождите минуту и попробуйте снова.")
	}

	var body struct{ Code string }
	readBody(w, r, &body)

	user, err := queryOne("SELECT u.* FROM users u JOIN access_codes a ON a.userId = u.id WHERE a.code = ?",
		strings.TrimSpace(body.Code))
	if err != nil {
		return err
	}
	if user == nil {
		rememberFail(ip)
		return fail(w, http.StatusUnauthorized, "Неверный код доступа. Обратитесь в IT-отдел колледжа.")
	}
	if user["blocked"] == int64(1) {
		return fail(w, http.StatusForbidden, "Аккаунт заблокирован администратором.")
	}
	forgetFails(ip)

	// Заодно убираем из базы просроченные входы, чтобы таблица sessions не росла бесконечно
	if _, err := db.Exec("DELETE FROM sessions WHERE expiresAt <= ?", time.Now().Unix()); err != nil {
		return err
	}

	token := newToken()
	expiresAt := time.Now().Add(sessionLifetime).Unix()
	if _, err := db.Exec("INSERT INTO sessions (token, userId, expiresAt) VALUES (?, ?, ?)", token, user["id"], expiresAt); err != nil {
		return err
	}

	// Вошёл — значит «в сети»
	if _, err := db.Exec("UPDATE users SET online = 1 WHERE id = ?", user["id"]); err != nil {
		return err
	}
	user["online"] = int64(1)
	return send(w, http.StatusOK, map[string]any{"token": token, "user": user})
}

// POST /api/logout — выход: удаляем токен (он больше не действует) и ставим «не в сети».
func logout(w http.ResponseWriter, r *http.Request, user map[string]any) error {
	if _, err := db.Exec("DELETE FROM sessions WHERE token = ?", tokenOf(r)); err != nil {
		return err
	}
	if _, err := db.Exec("UPDATE users SET online = 0 WHERE id = ?", user["id"]); err != nil {
		return err
	}
	return ok(w)
}

// GET /api/me — кто я. Сайт спрашивает это при обновлении страницы, чтобы проверить токен.
func me(w http.ResponseWriter, _ *http.Request, user map[string]any) error {
	return send(w, http.StatusOK, user)
}

// ── Профиль и настройки ──────────────────────────────────

// cleanInterests приводит список интересов в порядок: без пробелов по краям,
// без пустых и повторов, каждый не длиннее 30 символов, всего не больше 10.
func cleanInterests(list []string) []string {
	result := []string{}
	seen := map[string]bool{} // какие интересы уже добавили (в нижнем регистре)

	for _, item := range list {
		if len(result) == 10 {
			break
		}
		item = strings.TrimSpace(item)
		// Обрезаем до 30 символов. Режем по символам (rune), чтобы не разрезать русскую букву пополам
		runes := []rune(item)
		if len(runes) > 30 {
			item = string(runes[:30])
		}
		key := strings.ToLower(item)
		if item == "" || seen[key] {
			continue
		}
		seen[key] = true
		result = append(result, item)
	}
	return result
}

// POST /api/me {name, email, bio, interests} — сохранить свой профиль (кнопка «Сохранить» в настройках).
// Отвечает обновлённым пользователем.
func updateMe(w http.ResponseWriter, r *http.Request, user map[string]any) error {
	var body struct {
		Name      string
		Email     string
		Bio       string
		Interests []string
	}
	readBody(w, r, &body)

	name := strings.TrimSpace(body.Name)
	email := strings.TrimSpace(body.Email)
	bio := strings.TrimSpace(body.Bio)

	// Проверяем всё, что прислали. Сайт проверяет то же самое, но запрос можно
	// отправить и в обход сайта — поэтому сервер обязан проверять сам.
	if name == "" {
		return fail(w, http.StatusBadRequest, "Имя не может быть пустым")
	}
	if tooLong(name, maxNameLen) {
		return fail(w, http.StatusBadRequest, "Слишком длинное имя")
	}
	if email != "" && (tooLong(email, maxEmailLen) || !isEmail(email)) {
		return fail(w, http.StatusBadRequest, "Проверьте адрес почты")
	}
	if tooLong(bio, maxBioLen) {
		return fail(w, http.StatusBadRequest, "Текст «О себе» слишком длинный")
	}

	// В базе интересы лежат JSON-текстом: ["Python","Java"]
	interests, _ := json.Marshal(cleanInterests(body.Interests))

	_, err := db.Exec("UPDATE users SET name = ?, email = ?, bio = ?, interests = ? WHERE id = ?",
		name, email, bio, string(interests), user["id"])
	if err != nil {
		return err
	}

	updated, err := queryOne("SELECT * FROM users WHERE id = ?", user["id"])
	if err != nil {
		return err
	}
	return send(w, http.StatusOK, updated)
}

// settingQueries — какие настройки можно менять и каким запросом.
// Для каждой настройки запрос написан целиком заранее. Так название колонки
// никогда не берётся из запроса пользователя, и подставить туда что-то своё
// (например, «isAdmin») невозможно: такой настройки просто нет в списке.
var settingQueries = map[string]string{
	"notifyUnread":   "UPDATE users SET notifyUnread = ? WHERE id = ?",
	"notifyChannels": "UPDATE users SET notifyChannels = ? WHERE id = ?",
	"notifyMentions": "UPDATE users SET notifyMentions = ? WHERE id = ?",
	"compact":        "UPDATE users SET compact = ? WHERE id = ?",
	"showOnline":     "UPDATE users SET showOnline = ? WHERE id = ?",
	"showGroup":      "UPDATE users SET showGroup = ? WHERE id = ?",
	"allowMessages":  "UPDATE users SET allowMessages = ? WHERE id = ?",
}

// POST /api/settings {key, value} — включить или выключить одну настройку.
func saveSetting(w http.ResponseWriter, r *http.Request, user map[string]any) error {
	var body struct {
		Key   string
		Value bool
	}
	readBody(w, r, &body)

	query, found := settingQueries[body.Key]
	if !found {
		return fail(w, http.StatusBadRequest, "Нет такой настройки")
	}
	if _, err := db.Exec(query, body.Value, user["id"]); err != nil {
		return err
	}
	return ok(w)
}

// ── Данные для сайта ─────────────────────────────────────

// privateSettings — настройки человека. Другим людям они не нужны, поэтому не отправляем.
var privateSettings = []string{
	"notifyUnread", "notifyChannels", "notifyMentions", "compact", "showOnline", "showGroup",
}

// GET /api/data — все данные одним запросом, в том же виде, что MOCK_DATA в js/data.js.
// Личные чаты отдаём только их участникам. У каждого чата считаем unread —
// сколько в нём чужих сообщений, которые этот пользователь ещё не видел.
func allData(w http.ResponseWriter, _ *http.Request, user map[string]any) error {
	users, err := query("SELECT * FROM users ORDER BY id")
	if err != nil {
		return err
	}

	// Приватность: про других людей отправляем только то, что им разрешено видеть
	for _, u := range users {
		if u["id"] == user["id"] {
			continue // про себя человек видит всё
		}
		if u["showOnline"] == int64(0) {
			u["online"] = int64(0) // скрыл, что в сети
		}
		if u["showGroup"] == int64(0) {
			u["group"] = "" // скрыл группу
		}
		for _, name := range privateSettings {
			delete(u, name)
		}
		// Чужую почту видит только администратор (она нужна ему в списке пользователей)
		if user["isAdmin"] != int64(1) {
			delete(u, "email")
		}
	}

	// :me — именованный параметр, в запросе он встречается три раза
	chats, err := query(`SELECT c.*,
		(SELECT COUNT(*) FROM messages m
		  WHERE m.chatId = c.id AND m.userId != :me
		    AND m.id > COALESCE((SELECT lastReadId FROM chat_reads WHERE chatId = c.id AND userId = :me), 0)
		) AS unread
		FROM chats c
		WHERE c.type != 'dm' OR :me IN (c.ownerId, c.userId)
		ORDER BY c.id`,
		sql.Named("me", user["id"]))
	if err != nil {
		return err
	}

	// json_group_array собирает id участников клуба в список [1, 2, 3]
	clubs, err := query(`SELECT c.*, (SELECT json_group_array(userId) FROM club_members WHERE clubId = c.id) AS memberIds
		FROM clubs c ORDER BY c.id`)
	if err != nil {
		return err
	}

	types, err := query("SELECT * FROM chat_types")
	if err != nil {
		return err
	}

	// rowid — порядок, в котором строки добавлялись, то есть как в data.js
	groups, err := query("SELECT name FROM study_groups ORDER BY rowid")
	if err != nil {
		return err
	}
	directions, err := query("SELECT name FROM directions ORDER BY rowid")
	if err != nil {
		return err
	}

	// Типы чатов сайт ждёт объектом {тип: {...}}, а не списком
	chatTypes := map[string]any{}
	for _, t := range types {
		chatTypes[t["type"].(string)] = t
	}

	return send(w, http.StatusOK, map[string]any{
		"users":      users,
		"chats":      chats,
		"clubs":      clubs,
		"chatTypes":  chatTypes,
		"groups":     namesOf(groups),
		"directions": namesOf(directions),
	})
}

// namesOf превращает строки [{name: "исп341"}, ...] в простой список ["исп341", ...].
func namesOf(rows []map[string]any) []any {
	list := []any{}
	for _, row := range rows {
		list = append(list, row["name"])
	}
	return list
}

// ── Чаты ─────────────────────────────────────────────────

// findChat возвращает чат, если пользователю можно в нём быть (личные — только двоим собеседникам).
// Если чата нет или он чужой — вернёт nil.
func findChat(user map[string]any, chatID string) (map[string]any, error) {
	return queryOne(`SELECT c.id, t.readonly FROM chats c JOIN chat_types t ON t.type = c.type
		WHERE c.id = ? AND (c.type != 'dm' OR ? IN (c.ownerId, c.userId))`, chatID, user["id"])
}

// GET /api/chats/{id}/messages — сообщения чата по порядку.
func messages(w http.ResponseWriter, r *http.Request, user map[string]any) error {
	chat, err := findChat(user, r.PathValue("id"))
	if err != nil {
		return err
	}
	if chat == nil {
		return fail(w, http.StatusNotFound, "Чат не найден")
	}

	list, err := query("SELECT id, userId, text, time, reactions FROM messages WHERE chatId = ? ORDER BY id", chat["id"])
	if err != nil {
		return err
	}
	return send(w, http.StatusOK, list)
}

// POST /api/chats/{id}/messages {text} — отправить сообщение.
// В каналы (readonly) могут писать только преподаватели.
func sendMessage(w http.ResponseWriter, r *http.Request, user map[string]any) error {
	text := readText(w, r)
	if text == "" {
		return fail(w, http.StatusBadRequest, "Пустое сообщение")
	}
	if tooLong(text, maxMessageLen) {
		return fail(w, http.StatusBadRequest, "Слишком длинное сообщение")
	}

	chat, err := findChat(user, r.PathValue("id"))
	if err != nil {
		return err
	}
	if chat == nil {
		return fail(w, http.StatusNotFound, "Чат не найден")
	}
	if chat["readonly"] == int64(1) && user["role"] != "teacher" {
		return fail(w, http.StatusForbidden, "Этот чат доступен только для чтения")
	}

	// Сохраняем сообщение и обновляем «последнее сообщение» в списке чатов
	sentAt := now()
	if _, err := db.Exec("INSERT INTO messages (chatId, userId, text, time) VALUES (?, ?, ?, ?)",
		chat["id"], user["id"], text, sentAt); err != nil {
		return err
	}
	if _, err := db.Exec("UPDATE chats SET lastMessage = ?, lastTime = ? WHERE id = ?",
		text, sentAt, chat["id"]); err != nil {
		return err
	}
	return ok(w)
}

// POST /api/chats/{id}/read — пользователь открыл чат: всё, что в нём есть, теперь прочитано.
func markRead(w http.ResponseWriter, r *http.Request, user map[string]any) error {
	chat, err := findChat(user, r.PathValue("id"))
	if err != nil {
		return err
	}
	if chat == nil {
		return fail(w, http.StatusNotFound, "Чат не найден")
	}

	// Запоминаем id последнего сообщения в чате (INSERT OR REPLACE — добавит или перезапишет)
	_, err = db.Exec(`INSERT OR REPLACE INTO chat_reads (userId, chatId, lastReadId)
		VALUES (?, ?, (SELECT COALESCE(MAX(id), 0) FROM messages WHERE chatId = ?))`,
		user["id"], chat["id"], chat["id"])
	if err != nil {
		return err
	}
	return ok(w)
}

// findDm ищет личный чат двух людей — кто бы из них его ни начал. Если чата нет — nil.
func findDm(firstID, secondID any) (map[string]any, error) {
	return queryOne(`SELECT * FROM chats WHERE type = 'dm'
		AND ((ownerId = ? AND userId = ?) OR (ownerId = ? AND userId = ?))`,
		firstID, secondID, secondID, firstID)
}

// POST /api/dm {userId} — личный чат с человеком. Если его ещё нет — создаём.
func openDm(w http.ResponseWriter, r *http.Request, user map[string]any) error {
	var body struct{ UserID int64 }
	readBody(w, r, &body)

	if body.UserID == user["id"] {
		return fail(w, http.StatusBadRequest, "Нельзя написать самому себе")
	}
	other, err := queryOne("SELECT id, allowMessages FROM users WHERE id = ?", body.UserID)
	if err != nil {
		return err
	}
	if other == nil {
		return fail(w, http.StatusNotFound, "Пользователь не найден")
	}

	// Переписка уже есть — просто отдаём её
	chat, err := findDm(user["id"], body.UserID)
	if err != nil {
		return err
	}
	if chat != nil {
		return send(w, http.StatusOK, chat)
	}

	// Переписки нет. Новую не создаём, если человек запретил писать ему
	if other["allowMessages"] == int64(0) {
		return fail(w, http.StatusForbidden, "Пользователь ограничил личные сообщения")
	}
	_, err = db.Exec(`INSERT INTO chats (type, members, description, lastMessage, lastTime, ownerId, userId)
		VALUES ('dm', 2, 'Личная переписка', '', '', ?, ?)`, user["id"], body.UserID)
	if err != nil {
		return err
	}
	chat, err = findDm(user["id"], body.UserID)
	if err != nil {
		return err
	}
	return send(w, http.StatusOK, chat)
}

// ── Клубы ────────────────────────────────────────────────

// isMember — состоит ли пользователь в клубе.
func isMember(user map[string]any, clubID string) (bool, error) {
	row, err := queryOne("SELECT 1 FROM club_members WHERE clubId = ? AND userId = ?", clubID, user["id"])
	return row != nil, err
}

// POST /api/clubs/{id}/toggle — вступить в клуб, а если уже состоишь — выйти.
// Отвечает новым списком участников {memberIds: [...]}.
func toggleClub(w http.ResponseWriter, r *http.Request, user map[string]any) error {
	clubID := r.PathValue("id")
	club, err := queryOne("SELECT id FROM clubs WHERE id = ?", clubID)
	if err != nil {
		return err
	}
	if club == nil {
		return fail(w, http.StatusNotFound, "Клуб не найден")
	}

	member, err := isMember(user, clubID)
	if err != nil {
		return err
	}
	if member {
		_, err = db.Exec("DELETE FROM club_members WHERE clubId = ? AND userId = ?", clubID, user["id"])
	} else {
		_, err = db.Exec("INSERT INTO club_members (clubId, userId) VALUES (?, ?)", clubID, user["id"])
	}
	if err != nil {
		return err
	}

	result, err := queryOne("SELECT json_group_array(userId) AS memberIds FROM club_members WHERE clubId = ?", clubID)
	if err != nil {
		return err
	}
	return send(w, http.StatusOK, result)
}

// GET /api/clubs/{id}/messages — сообщения чата клуба (у каждого клуба свой чат).
// Читать могут все, писать — только участники.
// Реакций у клубных сообщений нет — отдаём пустой список, чтобы формат был как у обычных чатов.
func clubMessages(w http.ResponseWriter, r *http.Request, _ map[string]any) error {
	list, err := query("SELECT id, userId, text, time, '[]' AS reactions FROM club_messages WHERE clubId = ? ORDER BY id",
		r.PathValue("id"))
	if err != nil {
		return err
	}
	return send(w, http.StatusOK, list)
}

// POST /api/clubs/{id}/messages {text} — написать в чат клуба. Могут только участники клуба.
func sendClubMessage(w http.ResponseWriter, r *http.Request, user map[string]any) error {
	text := readText(w, r)
	if text == "" {
		return fail(w, http.StatusBadRequest, "Пустое сообщение")
	}
	if tooLong(text, maxMessageLen) {
		return fail(w, http.StatusBadRequest, "Слишком длинное сообщение")
	}

	clubID := r.PathValue("id")
	member, err := isMember(user, clubID)
	if err != nil {
		return err
	}
	if !member {
		return fail(w, http.StatusForbidden, "Сначала вступите в клуб")
	}

	if _, err := db.Exec("INSERT INTO club_messages (clubId, userId, text, time) VALUES (?, ?, ?, ?)",
		clubID, user["id"], text, now()); err != nil {
		return err
	}
	return ok(w)
}

// ── Админ-панель (только для администратора) ─────────────

// adminOnly пускает к обработчику только администратора (isAdmin = 1), остальным — ошибка 403.
// Кнопку «Админ» на сайте обычный пользователь не видит, но прислать запрос вручную может —
// поэтому проверка обязательно должна быть здесь, на сервере.
func adminOnly(h handler) handler {
	return func(w http.ResponseWriter, r *http.Request, user map[string]any) error {
		if user["isAdmin"] != int64(1) {
			return fail(w, http.StatusForbidden, "Только для администратора")
		}
		return h(w, r, user)
	}
}

// GET /api/admin/stats — цифры для вкладки «Обзор».
func adminStats(w http.ResponseWriter, _ *http.Request, _ map[string]any) error {
	stats, err := queryOne(`SELECT
		(SELECT COUNT(*) FROM users)              AS totalUsers,
		(SELECT COUNT(*) FROM users WHERE online) AS onlineNow,
		(SELECT COUNT(*) FROM chats)              AS activeChats,
		(SELECT COUNT(*) FROM reports)            AS pendingReports`)
	if err != nil {
		return err
	}
	return send(w, http.StatusOK, stats)
}

// readChannel читает название и описание канала из формы в админ-панели и проверяет их.
// Если что-то не так — возвращает текст ошибки для пользователя (иначе пустую строку).
func readChannel(w http.ResponseWriter, r *http.Request) (name, description, problem string) {
	var body struct{ Name, Description string }
	readBody(w, r, &body)
	name = strings.TrimSpace(body.Name)
	description = strings.TrimSpace(body.Description)

	if name == "" {
		problem = "Введите название канала"
	} else if tooLong(name, maxChannelNameLen) {
		problem = "Слишком длинное название"
	} else if tooLong(description, maxDescriptionLen) {
		problem = "Слишком длинное описание"
	}
	return name, description, problem
}

// POST /api/admin/channels {name, description} — создать канал. Отвечает новым каналом.
func createChannel(w http.ResponseWriter, r *http.Request, _ map[string]any) error {
	name, description, problem := readChannel(w, r)
	if problem != "" {
		return fail(w, http.StatusBadRequest, problem)
	}

	res, err := db.Exec(`INSERT INTO chats (name, type, icon, members, description, lastMessage, lastTime)
		VALUES (?, 'channel', '📢', 0, ?, '', '')`, name, description)
	if err != nil {
		return err
	}
	id, _ := res.LastInsertId() // id, который база выдала новому каналу

	chat, err := queryOne("SELECT * FROM chats WHERE id = ?", id)
	if err != nil {
		return err
	}
	return send(w, http.StatusOK, chat)
}

// POST /api/admin/channels/{id} {name, description} — изменить канал. Отвечает обновлённым каналом.
func updateChannel(w http.ResponseWriter, r *http.Request, _ map[string]any) error {
	name, description, problem := readChannel(w, r)
	if problem != "" {
		return fail(w, http.StatusBadRequest, problem)
	}

	id := r.PathValue("id")
	// «AND type = 'channel'» — чтобы так нельзя было переименовать чужой личный чат или группу
	if _, err := db.Exec("UPDATE chats SET name = ?, description = ? WHERE id = ? AND type = 'channel'",
		name, description, id); err != nil {
		return err
	}

	chat, err := queryOne("SELECT * FROM chats WHERE id = ? AND type = 'channel'", id)
	if err != nil {
		return err
	}
	if chat == nil {
		return fail(w, http.StatusNotFound, "Канал не найден")
	}
	return send(w, http.StatusOK, chat)
}

// GET /api/admin/reports — жалобы, новые сверху.
func reports(w http.ResponseWriter, _ *http.Request, _ map[string]any) error {
	list, err := query("SELECT * FROM reports ORDER BY id DESC")
	if err != nil {
		return err
	}
	return send(w, http.StatusOK, list)
}

// POST /api/admin/reports/{id}/dismiss — отклонить жалобу (просто удаляем её).
func dismissReport(w http.ResponseWriter, r *http.Request, _ map[string]any) error {
	if _, err := db.Exec("DELETE FROM reports WHERE id = ?", r.PathValue("id")); err != nil {
		return err
	}
	return ok(w)
}

// POST /api/admin/users/{id}/block {blocked: true/false} — заблокировать или разблокировать.
// Заблокированного выкидывает с сайта, а жалобы на него считаются решёнными и удаляются.
func blockUser(w http.ResponseWriter, r *http.Request, _ map[string]any) error {
	var body struct{ Blocked bool }
	readBody(w, r, &body)

	target, err := queryOne("SELECT id, isAdmin FROM users WHERE id = ?", r.PathValue("id"))
	if err != nil {
		return err
	}
	if target == nil {
		return fail(w, http.StatusNotFound, "Пользователь не найден")
	}
	if target["isAdmin"] == int64(1) {
		return fail(w, http.StatusBadRequest, "Администратора заблокировать нельзя")
	}

	if _, err := db.Exec("UPDATE users SET blocked = ? WHERE id = ?", body.Blocked, target["id"]); err != nil {
		return err
	}
	if !body.Blocked {
		return ok(w)
	}

	// Заблокировали — выкидываем с сайта, закрываем жалобы и ставим «не в сети»
	queries := []string{
		"DELETE FROM sessions WHERE userId = ?",
		"DELETE FROM reports WHERE userId = ?",
		"UPDATE users SET online = 0 WHERE id = ?",
	}
	for _, q := range queries {
		if _, err := db.Exec(q, target["id"]); err != nil {
			return err
		}
	}
	return ok(w)
}
