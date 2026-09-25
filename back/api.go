// api.go — обработчики запросов /api/... (список адресов — в main.go).
//
// Как устроен вход:
//  1. Браузер отправляет код доступа на /api/login.
//  2. Сервер находит пользователя, придумывает случайный токен и сохраняет его в таблицу sessions.
//  3. Дальше браузер присылает токен в каждом запросе в заголовке «Authorization: Bearer <токен>»,
//     и по нему сервер понимает, кто спрашивает.
package main

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"
)

// ── Общие помощники ──────────────────────────────────────

// handler — обработчик API. user — тот, кто вошёл (nil, если никто).
// Если вернуть ошибку, браузер получит ответ 500 «Ошибка сервера».
type handler func(w http.ResponseWriter, r *http.Request, user map[string]any) error

// route превращает handler в обычный обработчик net/http:
// находит пользователя по токену, при loginRequired не пускает без входа и ловит ошибки.
func route(loginRequired bool, h handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user, err := queryOne("SELECT * FROM users WHERE id = (SELECT userId FROM sessions WHERE token = ?) AND NOT blocked", tokenOf(r))
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

// tokenOf достаёт токен из заголовка «Authorization: Bearer <токен>».
func tokenOf(r *http.Request) string {
	return strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
}

// readBody читает JSON из тела запроса в dst. Пустое или битое тело просто оставит поля пустыми.
func readBody(r *http.Request, dst any) {
	json.NewDecoder(r.Body).Decode(dst)
}

// readText достаёт текст сообщения из тела {"text": "..."} без пробелов по краям.
func readText(r *http.Request) string {
	var body struct{ Text string }
	readBody(r, &body)
	return strings.TrimSpace(body.Text)
}

// now — текущее время в виде «12:05», так время показывается у сообщений.
func now() string {
	return time.Now().Format("15:04")
}

// ── Вход и выход ─────────────────────────────────────────

// POST /api/login {code} — вход по коду доступа. Отвечает {token, user}.
func login(w http.ResponseWriter, r *http.Request, _ map[string]any) error {
	var body struct{ Code string }
	readBody(r, &body)

	user, err := queryOne("SELECT u.* FROM users u JOIN access_codes a ON a.userId = u.id WHERE a.code = ?", strings.TrimSpace(body.Code))
	if err != nil {
		return err
	}
	if user == nil {
		return fail(w, http.StatusUnauthorized, "Неверный код доступа. Обратитесь в IT-отдел колледжа.")
	}
	if user["blocked"] == int64(1) {
		return fail(w, http.StatusForbidden, "Аккаунт заблокирован администратором.")
	}

	// Токен — 32 случайных байта в виде hex-строки: угадать его невозможно
	bytes := make([]byte, 32)
	rand.Read(bytes)
	token := hex.EncodeToString(bytes)

	if _, err := db.Exec("INSERT INTO sessions (token, userId) VALUES (?, ?)", token, user["id"]); err != nil {
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
	return send(w, http.StatusOK, map[string]bool{"ok": true})
}

// GET /api/me — кто я. Сайт спрашивает это при обновлении страницы, чтобы проверить токен.
func me(w http.ResponseWriter, _ *http.Request, user map[string]any) error {
	return send(w, http.StatusOK, user)
}

// cleanInterests приводит список интересов в порядок: без пробелов по краям,
// без пустых и повторов, каждый не длиннее 30 символов, всего не больше 10.
func cleanInterests(list []string) []string {
	result := []string{}
	seen := map[string]bool{}
	for _, item := range list {
		item = strings.TrimSpace(item)
		if runes := []rune(item); len(runes) > 30 {
			item = string(runes[:30])
		}
		key := strings.ToLower(item)
		if item == "" || seen[key] || len(result) == 10 {
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
		Name, Email, Bio string
		Interests        []string
	}
	readBody(r, &body)
	name := strings.TrimSpace(body.Name)
	if name == "" {
		return fail(w, http.StatusBadRequest, "Имя не может быть пустым")
	}
	interests, _ := json.Marshal(cleanInterests(body.Interests)) // в базе интересы лежат JSON-текстом

	_, err := db.Exec("UPDATE users SET name = ?, email = ?, bio = ?, interests = ? WHERE id = ?",
		name, strings.TrimSpace(body.Email), strings.TrimSpace(body.Bio), string(interests), user["id"])
	if err != nil {
		return err
	}
	updated, err := queryOne("SELECT * FROM users WHERE id = ?", user["id"])
	if err != nil {
		return err
	}
	return send(w, http.StatusOK, updated)
}

// settingNames — настройки, которые можно менять (это колонки таблицы users, см. schema.sql)
var settingNames = map[string]bool{
	"notifyUnread": true, "notifyChannels": true, "notifyMentions": true,
	"compact": true, "showOnline": true, "showGroup": true, "allowMessages": true,
}

// POST /api/settings {key, value} — включить или выключить одну настройку.
func saveSetting(w http.ResponseWriter, r *http.Request, user map[string]any) error {
	var body struct {
		Key   string
		Value bool
	}
	readBody(r, &body)
	if !settingNames[body.Key] {
		return fail(w, http.StatusBadRequest, "Нет такой настройки")
	}
	// Имя колонки подставляем в запрос только после проверки по списку выше — так безопасно
	if _, err := db.Exec("UPDATE users SET "+body.Key+" = ? WHERE id = ?", body.Value, user["id"]); err != nil {
		return err
	}
	return send(w, http.StatusOK, map[string]bool{"ok": true})
}

// ── Данные для сайта ─────────────────────────────────────

// GET /api/data — все данные одним запросом, в том же виде, что MOCK_DATA в js/data.js.
// Личные чаты отдаём только их участникам. У каждого чата считаем unread —
// сколько в нём чужих сообщений, которые этот пользователь ещё не видел.
func allData(w http.ResponseWriter, _ *http.Request, user map[string]any) error {
	users, err := query("SELECT * FROM users ORDER BY id")
	if err != nil {
		return err
	}
	// Приватность: другим не показываем то, что человек скрыл в настройках
	for _, u := range users {
		if u["id"] == user["id"] {
			continue
		}
		if u["showOnline"] == int64(0) {
			u["online"] = int64(0)
		}
		if u["showGroup"] == int64(0) {
			u["group"] = ""
		}
	}
	chats, err := query(`SELECT c.*,
		(SELECT COUNT(*) FROM messages m
		  WHERE m.chatId = c.id AND m.userId != :me
		    AND m.id > COALESCE((SELECT lastReadId FROM chat_reads WHERE chatId = c.id AND userId = :me), 0)
		) AS unread
		FROM chats c WHERE c.type != 'dm' OR :me IN (c.ownerId, c.userId) ORDER BY c.id`,
		sql.Named("me", user["id"]))
	if err != nil {
		return err
	}
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

	// Типы чатов — объектом {тип: {...}}, группы и направления — просто списком строк
	chatTypes := map[string]any{}
	for _, t := range types {
		chatTypes[t["type"].(string)] = t
	}
	names := func(rows []map[string]any) (list []any) {
		for _, row := range rows {
			list = append(list, row["name"])
		}
		return list
	}

	return send(w, http.StatusOK, map[string]any{
		"users":      users,
		"chats":      chats,
		"clubs":      clubs,
		"chatTypes":  chatTypes,
		"groups":     names(groups),
		"directions": names(directions),
	})
}

// ── Чаты ─────────────────────────────────────────────────

// findChat возвращает чат, если пользователю можно в нём быть (личные — только двоим собеседникам).
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
	text := readText(r)
	if text == "" {
		return fail(w, http.StatusBadRequest, "Пустое сообщение")
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
	if _, err := db.Exec("INSERT INTO messages (chatId, userId, text, time) VALUES (?, ?, ?, ?)", chat["id"], user["id"], text, sentAt); err != nil {
		return err
	}
	if _, err := db.Exec("UPDATE chats SET lastMessage = ?, lastTime = ? WHERE id = ?", text, sentAt, chat["id"]); err != nil {
		return err
	}
	return send(w, http.StatusOK, map[string]bool{"ok": true})
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
	return send(w, http.StatusOK, map[string]bool{"ok": true})
}

// POST /api/dm {userId} — личный чат с человеком. Если его ещё нет — создаём.
func openDm(w http.ResponseWriter, r *http.Request, user map[string]any) error {
	var body struct{ UserID int64 }
	readBody(r, &body)
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

	// Ищем чат этих двоих — кто бы из них его ни начал
	find := func() (map[string]any, error) {
		return queryOne(`SELECT * FROM chats WHERE type = 'dm'
			AND ((ownerId = ? AND userId = ?) OR (ownerId = ? AND userId = ?))`,
			user["id"], body.UserID, body.UserID, user["id"])
	}
	chat, err := find()
	if err == nil && chat == nil && other["allowMessages"] == int64(0) {
		// Нового чата не создаём: человек запретил писать ему (старая переписка при этом остаётся)
		return fail(w, http.StatusForbidden, "Пользователь ограничил личные сообщения")
	}
	if err == nil && chat == nil {
		_, err = db.Exec(`INSERT INTO chats (type, members, description, lastMessage, lastTime, ownerId, userId)
			VALUES ('dm', 2, 'Личная переписка', '', '', ?, ?)`, user["id"], body.UserID)
		if err == nil {
			chat, err = find()
		}
	}
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
// Реакций у клубных сообщений нет — отдаём пустой список, чтобы формат был как у обычных чатов.
func clubMessages(w http.ResponseWriter, r *http.Request, _ map[string]any) error {
	list, err := query("SELECT id, userId, text, time, '[]' AS reactions FROM club_messages WHERE clubId = ? ORDER BY id", r.PathValue("id"))
	if err != nil {
		return err
	}
	return send(w, http.StatusOK, list)
}

// POST /api/clubs/{id}/messages {text} — написать в чат клуба. Могут только участники клуба.
func sendClubMessage(w http.ResponseWriter, r *http.Request, user map[string]any) error {
	text := readText(r)
	if text == "" {
		return fail(w, http.StatusBadRequest, "Пустое сообщение")
	}
	clubID := r.PathValue("id")
	member, err := isMember(user, clubID)
	if err != nil {
		return err
	}
	if !member {
		return fail(w, http.StatusForbidden, "Сначала вступите в клуб")
	}
	if _, err := db.Exec("INSERT INTO club_messages (clubId, userId, text, time) VALUES (?, ?, ?, ?)", clubID, user["id"], text, now()); err != nil {
		return err
	}
	return send(w, http.StatusOK, map[string]bool{"ok": true})
}

// ── Админ-панель (только для администратора) ─────────────

// adminOnly пускает к обработчику только администратора (isAdmin = 1), остальным — ошибка.
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

// channelBody — название и описание канала из формы в админ-панели.
func channelBody(r *http.Request) (name, description string) {
	var body struct{ Name, Description string }
	readBody(r, &body)
	return strings.TrimSpace(body.Name), strings.TrimSpace(body.Description)
}

// POST /api/admin/channels {name, description} — создать канал. Отвечает новым каналом.
func createChannel(w http.ResponseWriter, r *http.Request, _ map[string]any) error {
	name, description := channelBody(r)
	if name == "" {
		return fail(w, http.StatusBadRequest, "Введите название канала")
	}
	res, err := db.Exec(`INSERT INTO chats (name, type, icon, members, description, lastMessage, lastTime)
		VALUES (?, 'channel', '📢', 0, ?, '', '')`, name, description)
	if err != nil {
		return err
	}
	id, _ := res.LastInsertId()
	chat, err := queryOne("SELECT * FROM chats WHERE id = ?", id)
	if err != nil {
		return err
	}
	return send(w, http.StatusOK, chat)
}

// POST /api/admin/channels/{id} {name, description} — изменить канал. Отвечает обновлённым каналом.
func updateChannel(w http.ResponseWriter, r *http.Request, _ map[string]any) error {
	name, description := channelBody(r)
	if name == "" {
		return fail(w, http.StatusBadRequest, "Введите название канала")
	}
	id := r.PathValue("id")
	if _, err := db.Exec("UPDATE chats SET name = ?, description = ? WHERE id = ? AND type = 'channel'", name, description, id); err != nil {
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
	return send(w, http.StatusOK, map[string]bool{"ok": true})
}

// POST /api/admin/users/{id}/block {blocked: true/false} — заблокировать или разблокировать.
// Заблокированного выкидывает с сайта, а жалобы на него считаются решёнными и удаляются.
func blockUser(w http.ResponseWriter, r *http.Request, admin map[string]any) error {
	var body struct{ Blocked bool }
	readBody(r, &body)
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
	if body.Blocked {
		for _, q := range []string{
			"DELETE FROM sessions WHERE userId = ?",    // выкидываем с сайта
			"DELETE FROM reports WHERE userId = ?",     // жалобы решены
			"UPDATE users SET online = 0 WHERE id = ?", // и он больше не в сети
		} {
			if _, err := db.Exec(q, target["id"]); err != nil {
				return err
			}
		}
	}
	return send(w, http.StatusOK, map[string]bool{"ok": true})
}
