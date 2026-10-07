// main.go — запуск сервера СтудСети.
//
// Сервер делает две вещи:
//  1. Отдаёт сайт (index.html, css, js, images) из папки на уровень выше.
//  2. Отвечает на запросы /api/... — данные берёт из базы SQLite (см. db.go и api.go).
//     Базу при первом запуске заполняет данными из js/data.js.
//
// Запуск (из папки back):  go run .
// Затем открыть сайт: http://localhost:8080 — или как угодно ещё (Live Server,
// двойной щелчок по index.html): API всё равно будет на localhost:8080.
package main

import (
	"log"
	"net/http"
	"strings"
	"time"
)

// frontDir — папка с сайтом (относительно папки back, откуда запускается сервер).
// Оттуда же берётся js/data.js для заполнения базы.
const frontDir = ".."

func main() {
	openDB("studnet.db")

	mux := http.NewServeMux()

	// ── API ──
	// route(false, ...) — можно без входа (только сам вход),
	// route(true, ...)  — нужен вход, иначе ответ 401 «Требуется вход».
	mux.HandleFunc("POST /api/login", route(false, login))
	mux.HandleFunc("POST /api/logout", route(true, logout))
	mux.HandleFunc("GET /api/me", route(true, me))
	mux.HandleFunc("POST /api/me", route(true, updateMe))
	mux.HandleFunc("POST /api/settings", route(true, saveSetting))
	mux.HandleFunc("GET /api/data", route(true, allData))
	mux.HandleFunc("GET /api/chats/{id}/messages", route(true, messages))
	mux.HandleFunc("POST /api/chats/{id}/messages", route(true, sendMessage))
	mux.HandleFunc("POST /api/chats/{id}/read", route(true, markRead))
	mux.HandleFunc("POST /api/dm", route(true, openDm))
	mux.HandleFunc("POST /api/clubs/{id}/toggle", route(true, toggleClub))
	mux.HandleFunc("GET /api/clubs/{id}/messages", route(true, clubMessages))
	mux.HandleFunc("POST /api/clubs/{id}/messages", route(true, sendClubMessage))
	mux.HandleFunc("GET /api/events", route(true, events)) // новые сообщения без обновления страницы (events.go)

	// ── Админ-панель ── adminOnly пускает только администратора
	mux.HandleFunc("GET /api/admin/stats", route(true, adminOnly(adminStats)))
	mux.HandleFunc("POST /api/admin/channels", route(true, adminOnly(createChannel)))
	mux.HandleFunc("POST /api/admin/channels/{id}", route(true, adminOnly(updateChannel)))
	mux.HandleFunc("GET /api/admin/reports", route(true, adminOnly(reports)))
	mux.HandleFunc("POST /api/admin/reports/{id}/dismiss", route(true, adminOnly(dismissReport)))
	mux.HandleFunc("POST /api/admin/users/{id}/block", route(true, adminOnly(blockUser)))

	// ── Сайт ──
	// Отдаём только нужные папки. Папку back/ (там код и файл базы) скачать нельзя.
	files := noFolderList(http.FileServer(http.Dir(frontDir)))
	mux.Handle("GET /css/", files)
	mux.Handle("GET /js/", files)
	mux.Handle("GET /images/", files)
	mux.HandleFunc("GET /{$}", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, frontDir+"/index.html")
	})

	// Настраиваем сервер с тайм-аутами: если кто-то будет слать запрос очень медленно
	// (по байту в минуту), сервер не будет ждать его вечно и тратить на это память.
	// Исключение — долгий опрос /api/events: он продлевает тайм-аут сам для себя (см. events.go).
	server := &http.Server{
		Addr:              ":8080",
		Handler:           securityHeaders(allowOtherSites(mux)),
		ReadHeaderTimeout: 5 * time.Second,  // на заголовки запроса
		ReadTimeout:       10 * time.Second, // на весь запрос
		WriteTimeout:      10 * time.Second, // на ответ
		IdleTimeout:       60 * time.Second, // сколько держать открытым соединение без запросов
	}

	log.Println("СтудСеть запущена: http://localhost:8080")
	log.Fatal(server.ListenAndServe())
}

// allowOtherSites разрешает запросы к API со страниц, открытых не этим сервером
// (Live Server на localhost:5500, index.html двойным щелчком). Без этих заголовков
// браузер блокирует такие запросы (ошибка «CORS policy»).
//
// Почему разрешить всем («*») здесь не опасно: вход у нас не через cookie,
// а через токен в заголовке Authorization. Чужой сайт этот токен не знает
// (он лежит в sessionStorage нашей страницы), поэтому от имени пользователя
// ничего сделать не сможет.
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

// contentSecurityPolicy — список того, откуда странице можно загружать скрипты, стили,
// картинки и куда можно отправлять запросы. Это вторая линия защиты от XSS:
// даже если злоумышленник как-то вставит на страницу <script> или onerror="...",
// браузер его не выполнит — разрешены только скрипты из наших файлов js/.
//
//	default-src 'self'      — по умолчанию всё только с нашего сервера;
//	script-src 'self'       — скрипты только из наших файлов (встроенные запрещены);
//	style-src ... fonts...  — стили наши + стили шрифта Inter от Google;
//	font-src fonts.gstatic  — сами файлы шрифта;
//	img-src 'self'          — картинки только наши (папка images);
//	object-src 'none'       — никаких <object> и <embed>;
//	base-uri 'none'         — нельзя подменить адрес страницы тегом <base>;
//	frame-ancestors 'none'  — наш сайт нельзя встроить в чужую страницу через <iframe>.
const contentSecurityPolicy = "default-src 'self'; " +
	"script-src 'self'; " +
	"style-src 'self' https://fonts.googleapis.com; " +
	"font-src https://fonts.gstatic.com; " +
	"img-src 'self'; " +
	"connect-src 'self'; " +
	"object-src 'none'; " +
	"base-uri 'none'; " +
	"form-action 'self'; " +
	"frame-ancestors 'none'"

// securityHeaders добавляет к каждому ответу заголовки, которые включают
// встроенную защиту браузера.
func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Security-Policy", contentSecurityPolicy)
		// Браузер не будет «угадывать» тип файла: JSON останется JSON-ом,
		// а не превратится в HTML со скриптами внутри
		w.Header().Set("X-Content-Type-Options", "nosniff")
		// Запрет встраивать сайт в <iframe> (защита от «кликджекинга»), для старых браузеров
		w.Header().Set("X-Frame-Options", "DENY")
		// При переходе по ссылке на другой сайт не сообщать ему полный адрес нашей страницы
		w.Header().Set("Referrer-Policy", "no-referrer")
		next.ServeHTTP(w, r)
	})
}

// noFolderList запрещает смотреть список файлов в папке.
// Без этого по адресу /images/ сервер показал бы все файлы, что там лежат.
// Адрес папки всегда заканчивается на «/» — такие запросы отвечаем «не найдено».
func noFolderList(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/") {
			http.NotFound(w, r)
			return
		}
		next.ServeHTTP(w, r)
	})
}
