// main.go — запуск сервера СтудСети.
//
// Сервер делает две вещи:
//  1. Отдаёт сайт (index.html, css, js, images) из папки на уровень выше.
//  2. Отвечает на запросы /api/... — данные берёт из базы SQLite (см. db.go и api.go).
//
// Запуск (из папки back):  go run .
// Затем открыть сайт: http://localhost:8080 — или как угодно ещё (Live Server,
// двойной щелчок по index.html): API всё равно будет на localhost:8080.
package main

import (
	"log"
	"net/http"
)

// frontDir — папка с сайтом (относительно папки back, откуда запускается сервер).
const frontDir = ".."

func main() {
	openDB("studnet.db")

	mux := http.NewServeMux()

	// ── API ── route(true, ...) — нужен вход, route(false, ...) — можно без входа
	mux.HandleFunc("POST /api/login", route(false, login))
	mux.HandleFunc("POST /api/logout", route(true, logout))
	mux.HandleFunc("GET /api/me", route(true, me))
	mux.HandleFunc("GET /api/data", route(true, allData))
	mux.HandleFunc("GET /api/chats/{id}/messages", route(true, messages))
	mux.HandleFunc("POST /api/chats/{id}/messages", route(true, sendMessage))
	mux.HandleFunc("GET /api/clubs/{id}/messages", route(true, clubMessages))
	mux.HandleFunc("POST /api/clubs/{id}/messages", route(true, sendClubMessage))
	mux.HandleFunc("GET /api/admin/stats", route(true, adminStats))

	// ── Сайт ── отдаём только нужные папки, чтобы нельзя было скачать back/ с базой
	files := http.FileServer(http.Dir(frontDir))
	mux.Handle("GET /css/", files)
	mux.Handle("GET /js/", files)
	mux.Handle("GET /images/", files)
	mux.HandleFunc("GET /{$}", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, frontDir+"/index.html")
	})

	log.Println("СтудСеть запущена: http://localhost:8080")
	log.Fatal(http.ListenAndServe(":8080", allowOtherSites(mux)))
}

// allowOtherSites разрешает запросы к API со страниц, открытых не этим сервером
// (Live Server на localhost:5500, index.html двойным щелчком). Без этих заголовков
// браузер блокирует такие запросы (ошибка «CORS policy»).
func allowOtherSites(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		// Перед POST браузер сначала спрашивает разрешение запросом OPTIONS — просто отвечаем «можно»
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
