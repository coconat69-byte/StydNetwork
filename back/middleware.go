// Пакет middleware содержит "обёртки" вокруг хендлеров — код, который
// должен выполняться ДО (а иногда и после) каждого запроса: проверить
// заголовки, залогировать запрос, проверить токен авторизации и т.п.
//
// Middleware в net/http — это просто функция, которая принимает
// http.Handler и возвращает новый http.Handler, который что-то делает
// и затем (обычно) вызывает исходный. Так строится "цепочка":
//   CORS(Logging(Auth(realHandler)))
package middleware

import (
	"context"
	"log"
	"net/http"
	"strings"
	"time"

	"studnet-backend/internal/httpx"
	"studnet-backend/internal/session"
)

// ctxKey — приватный тип для ключей context.Context, чтобы избежать
// случайных коллизий с ключами других пакетов (антипаттерн — использовать
// голый string как ключ контекста, поэтому заводят такой тип-обёртку).
type ctxKey string

const userIDKey ctxKey = "userID"

// CORS разрешает вашему index.html (открытому из браузера, возможно
// с другого порта/домена, например http://localhost:5500, пока backend
// висит на :8080) обращаться к этому API. Без этих заголовков браузер
// заблокирует fetch() с ошибкой "CORS policy".
//
// allowedOrigin — адрес, с которого разрешено обращаться к API.
// На проде замените "*" на конкретный домен фронтенда.
func CORS(allowedOrigin string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Access-Control-Allow-Origin", allowedOrigin)
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

			// Браузер перед "настоящим" запросом с кастомными заголовками
			// сначала присылает OPTIONS ("preflight") — на него достаточно
			// ответить 200 без тела, дальше браузер уже шлёт реальный запрос.
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusOK)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// Logging печатает в консоль метод, путь и время выполнения каждого
// запроса — удобно во время разработки видеть, что вообще происходит.
func Logging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("%s %s — %s", r.Method, r.URL.Path, time.Since(start))
	})
}

// RequireAuth защищает хендлер: без валидного токена в заголовке
// Authorization: Bearer <токен> запрос получит 401 и дальше не пройдёт.
// Если токен верный — id пользователя кладётся в context, и хендлер
// дальше по цепочке достаёт его через middleware.UserID(r).
func RequireAuth(sessions *session.Manager) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			header := r.Header.Get("Authorization")
			token, ok := strings.CutPrefix(header, "Bearer ")
			if !ok || token == "" {
				httpx.Error(w, http.StatusUnauthorized, "Требуется авторизация")
				return
			}

			userID, ok := sessions.Resolve(token)
			if !ok {
				httpx.Error(w, http.StatusUnauthorized, "Сессия недействительна или истекла, войдите заново")
				return
			}

			ctx := context.WithValue(r.Context(), userIDKey, userID)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// UserID достаёт id авторизованного пользователя, который RequireAuth
// положил в контекст запроса. Вызывать только внутри хендлеров, обёрнутых
// в RequireAuth — иначе ok будет false.
func UserID(r *http.Request) (int, bool) {
	id, ok := r.Context().Value(userIDKey).(int)
	return id, ok
}