// main — точка входа приложения. Здесь мы:
//  1) создаём хранилище данных (store) и менеджер сессий (session);
//  2) создаём хендлеры, передав им эти зависимости;
//  3) регистрируем маршруты (какой URL + метод ведёт к какому хендлеру);
//  4) оборачиваем всё в middleware (CORS, логирование, авторизация);
//  5) запускаем сервер, слушающий на порту 8080.
//
// Запуск:  go run ./cmd/server
package main

import (
	"log"
	"net/http"
	"os"

	"studnet-backend/internal/handlers"
	"studnet-backend/internal/middleware"
	"studnet-backend/internal/session"
	"studnet-backend/internal/store"
)

func main() {
	// ── Зависимости ──────────────────────────────────────────
	dataStore := store.New()
	sessions := session.NewManager()

	authH := handlers.NewAuthHandler(dataStore, sessions)
	usersH := handlers.NewUsersHandler(dataStore)
	chatsH := handlers.NewChatsHandler(dataStore)
	clubsH := handlers.NewClubsHandler(dataStore)
	adminH := handlers.NewAdminHandler(dataStore)

	// http.NewServeMux — стандартный роутер Go. Начиная с Go 1.22 он
	// умеет разбирать метод ("GET "/"POST ") и переменные пути ("{id}")
	// без сторонних библиотек (раньше для этого ставили gorilla/mux,
	// chi и т.п. — теперь для простых случаев хватает стандартной).
	mux := http.NewServeMux()

	// ── Публичные маршруты (без токена) ─────────────────────
	mux.HandleFunc("POST /api/auth/login", authH.Login)
	mux.HandleFunc("GET /api/ref/groups", usersH.Groups)
	mux.HandleFunc("GET /api/ref/directions", usersH.Directions)

	// ── Защищённые маршруты (нужен заголовок Authorization) ──
	// requireAuth оборачивает каждый хендлер middleware.RequireAuth,
	// который проверяет токен ДО того, как хендлер вообще запустится.
	requireAuth := middleware.RequireAuth(sessions)

	mux.Handle("POST /api/auth/logout", requireAuth(http.HandlerFunc(authH.Logout)))
	mux.Handle("GET /api/auth/me", requireAuth(http.HandlerFunc(authH.Me)))

	mux.Handle("GET /api/users", requireAuth(http.HandlerFunc(usersH.List)))
	mux.Handle("GET /api/users/{id}", requireAuth(http.HandlerFunc(usersH.Get)))

	mux.Handle("GET /api/chats", requireAuth(http.HandlerFunc(chatsH.List)))
	mux.Handle("GET /api/chats/{id}/messages", requireAuth(http.HandlerFunc(chatsH.Messages)))
	mux.Handle("POST /api/chats/{id}/messages", requireAuth(http.HandlerFunc(chatsH.SendMessage)))

	mux.Handle("GET /api/clubs", requireAuth(http.HandlerFunc(clubsH.List)))
	mux.Handle("GET /api/clubs/{id}", requireAuth(http.HandlerFunc(clubsH.Get)))

	// Роли (student/teacher) дополнительно проверяются внутри самих
	// admin-хендлеров (см. AdminHandler.requireTeacher в admin.go).
	mux.Handle("GET /api/admin/stats", requireAuth(http.HandlerFunc(adminH.Stats)))
	mux.Handle("GET /api/admin/users", requireAuth(http.HandlerFunc(adminH.Users)))

	// ── Цепочка middleware, применяемая ко ВСЕМ маршрутам ────
	// Порядок важен: CORS должен сработать раньше всего (даже раньше
	// Logging), чтобы preflight-запросы браузера (OPTIONS) не долетали
	// до бизнес-логики. Читать цепочку удобно "изнутри наружу":
	// сначала выполняется CORS, он вызывает Logging, тот — сам mux.
	allowedOrigin := envOr("CORS_ORIGIN", "*")
	var handler http.Handler = mux
	handler = middleware.Logging(handler)
	handler = middleware.CORS(allowedOrigin)(handler)

	port := envOr("PORT", "8080")
	log.Printf("StudNet backend запущен на http://localhost:%s", port)
	log.Fatal(http.ListenAndServe(":"+port, handler))
}

// envOr читает переменную окружения или возвращает значение по умолчанию.
// Так порт и разрешённый CORS-домен можно менять при деплое без
// пересборки бинарника — просто задав переменные окружения.
func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}