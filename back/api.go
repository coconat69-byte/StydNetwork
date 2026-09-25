// api.go — обработчики запросов /api/... (что делает каждый адрес, см. в main.go).
//
// Вход устроен так:
//  1. Браузер отправляет код доступа на /api/login.
//  2. Сервер находит пользователя, придумывает случайный токен и сохраняет его в таблицу sessions.
//  3. Браузер присылает этот токен в каждом запросе в заголовке «Authorization: Bearer <токен>»,
//     и по нему сервер понимает, кто спрашивает.
package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"
)

// userColumns — поля пользователя, которые можно показывать браузеру.
// Код доступа (code) сюда специально не входит.
const userColumns = `id, name, email, avatar, group_name AS "group", direction, course, interests, online, role, bio`

// handler — обработчик API. user — текущий пользователь (nil, если не вошёл).
// Если вернуть ошибку, клиент получит ответ 500 «Ошибка сервера».
type handler func(w http.ResponseWriter, r *http.Request, user map[string]any) error

// route превращает handler в обычный обработчик net/http:
// находит пользователя по токену, при loginRequired не пускает без входа, ловит ошибки.
func route(loginRequired bool, h handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user, err := queryOne(
			"SELECT "+userColumns+" FROM users WHERE id = (SELECT user_id FROM sessions WHERE token = ?)",
			tokenOf(r))
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

// fail отправляет ошибку в формате {"error": "текст"} — этот текст фронтенд показывает пользователю.
func fail(w http.ResponseWriter, status int, message string) error {
	return send(w, status, map[string]string{"error": message})
}

// tokenOf достаёт токен из заголовка «Authorization: Bearer <токен>».
func tokenOf(r *http.Request) string {
	return strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
}

// readText достаёт текст сообщения из тела запроса {"text": "..."} без пробелов по краям.
func readText(r *http.Request) string {
	var body struct{ Text string }
	json.NewDecoder(r.Body).Decode(&body) // пустое или битое тело просто даст пустой текст
	return strings.TrimSpace(body.Text)
}

// POST /api/login {code} — вход по коду доступа. Отвечает {token, user}.
func login(w http.ResponseWriter, r *http.Request, _ map[string]any) error {
	var body struct{ Code string }
	json.NewDecoder(r.Body).Decode(&body)

	user, err := queryOne("SELECT "+userColumns+" FROM users WHERE code = ?", strings.TrimSpace(body.Code))
	if err != nil {
		return err
	}
	if user == nil {
		return fail(w, http.StatusUnauthorized, "Неверный код доступа. Обратитесь в IT-отдел колледжа.")
	}

	// Токен — 32 случайных байта в виде hex-строки: угадать его невозможно
	bytes := make([]byte, 32)
	rand.Read(bytes)
	token := hex.EncodeToString(bytes)

	if _, err := db.Exec("INSERT INTO sessions (token, user_id) VALUES (?, ?)", token, user["id"]); err != nil {
		return err
	}
	return send(w, http.StatusOK, map[string]any{"token": token, "user": user})
}

// POST /api/logout — выход: удаляем токен, и он больше не действует.
func logout(w http.ResponseWriter, r *http.Request, _ map[string]any) error {
	if _, err := db.Exec("DELETE FROM sessions WHERE token = ?", tokenOf(r)); err != nil {
		return err
	}
	return send(w, http.StatusOK, map[string]bool{"ok": true})
}

// GET /api/me — кто я. Фронтенд вызывает это при обновлении страницы, чтобы проверить токен.
func me(w http.ResponseWriter, _ *http.Request, user map[string]any) error {
	return send(w, http.StatusOK, user)
}

// GET /api/data — все данные для интерфейса одним запросом:
// пользователи, чаты, типы чатов, клубы, группы и направления.
func allData(w http.ResponseWriter, _ *http.Request, _ map[string]any) error {
	queries := map[string]string{
		"users":      "SELECT " + userColumns + " FROM users ORDER BY id",
		"chats":      "SELECT id, name, type, avatar, icon, members, description, unread, last_message AS lastMessage, last_time AS lastTime, user_id AS userId FROM chats ORDER BY id",
		"chatTypes":  "SELECT type, label, readonly FROM chat_types",
		"clubs":      "SELECT id, name, emoji, description, members, category, joined, admin, member_ids AS memberIds FROM clubs ORDER BY id",
		"groups":     "SELECT name FROM study_groups ORDER BY name",
		"directions": "SELECT name FROM directions ORDER BY name",
	}

	data := map[string]any{}
	for key, q := range queries {
		rows, err := query(q)
		if err != nil {
			return err
		}
		data[key] = rows
	}
	return send(w, http.StatusOK, data)
}

// GET /api/chats/{id}/messages — сообщения чата по порядку.
func messages(w http.ResponseWriter, r *http.Request, _ map[string]any) error {
	list, err := query("SELECT id, user_id AS userId, text, time, reactions FROM messages WHERE chat_id = ? ORDER BY id", r.PathValue("id"))
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

	chatID := r.PathValue("id")
	chat, err := queryOne("SELECT t.readonly FROM chats c JOIN chat_types t ON t.type = c.type WHERE c.id = ?", chatID)
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
	now := time.Now().Format("15:04")
	if _, err := db.Exec("INSERT INTO messages (chat_id, user_id, text, time) VALUES (?, ?, ?, ?)", chatID, user["id"], text, now); err != nil {
		return err
	}
	if _, err := db.Exec("UPDATE chats SET last_message = ?, last_time = ? WHERE id = ?", text, now, chatID); err != nil {
		return err
	}
	return send(w, http.StatusOK, map[string]bool{"ok": true})
}

// GET /api/clubs/{id}/messages — сообщения чата клуба (у каждого клуба свой чат).
// reactions у клубных сообщений нет — отдаём пустой список, чтобы формат был как у обычных чатов.
func clubMessages(w http.ResponseWriter, r *http.Request, _ map[string]any) error {
	list, err := query("SELECT id, user_id AS userId, text, time, '[]' AS reactions FROM club_messages WHERE club_id = ? ORDER BY id", r.PathValue("id"))
	if err != nil {
		return err
	}
	return send(w, http.StatusOK, list)
}

// POST /api/clubs/{id}/messages {text} — написать в чат клуба.
func sendClubMessage(w http.ResponseWriter, r *http.Request, user map[string]any) error {
	text := readText(r)
	if text == "" {
		return fail(w, http.StatusBadRequest, "Пустое сообщение")
	}

	clubID := r.PathValue("id")
	club, err := queryOne("SELECT id FROM clubs WHERE id = ?", clubID)
	if err != nil {
		return err
	}
	if club == nil {
		return fail(w, http.StatusNotFound, "Клуб не найден")
	}

	now := time.Now().Format("15:04")
	if _, err := db.Exec("INSERT INTO club_messages (club_id, user_id, text, time) VALUES (?, ?, ?, ?)", clubID, user["id"], text, now); err != nil {
		return err
	}
	return send(w, http.StatusOK, map[string]bool{"ok": true})
}

// GET /api/admin/stats — цифры для админ-панели. Только для преподавателей.
func adminStats(w http.ResponseWriter, _ *http.Request, user map[string]any) error {
	if user["role"] != "teacher" {
		return fail(w, http.StatusForbidden, "Только для преподавателей")
	}
	stats, err := queryOne(`SELECT
		(SELECT COUNT(*) FROM users)               AS totalUsers,
		(SELECT COUNT(*) FROM users WHERE online)  AS onlineNow,
		(SELECT COUNT(*) FROM chats)               AS activeChats,
		2                                          AS pendingReports -- жалоб пока нет в базе, число для примера`)
	if err != nil {
		return err
	}
	return send(w, http.StatusOK, stats)
}
