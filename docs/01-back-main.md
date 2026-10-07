# 1. `back/main.go` — запуск сервера

[← Оглавление](README.md)

Файл отвечает за три вещи:

1. открывает базу данных;
2. говорит, какой функции отвечать на какой адрес (маршруты);
3. запускает HTTP-сервер на порту 8080 с тайм-аутами и заголовками безопасности.

Запуск: из папки `back` командой `go run .` (Go сам соберёт все `.go`-файлы папки в одну программу).

---

## Шапка файла

```go
package main
```
Все файлы папки `back` — один пакет `main`. Поэтому функции из `api.go`, `db.go`, `events.go` видны в `main.go` без импорта: это одна программа, просто разложенная по файлам.

```go
import (
	"log"
	"net/http"
	"strings"
	"time"
)
```
| Пакет | Зачем |
|---|---|
| `log` | печать сообщений в консоль (`log.Println`, `log.Fatal`) |
| `net/http` | встроенный в Go веб-сервер: маршруты, запросы, ответы |
| `strings` | работа со строками (`strings.HasSuffix` в `noFolderList`) |
| `time` | тайм-ауты сервера (`5 * time.Second`) |

## Константа `frontDir`

```go
const frontDir = ".."
```
Папка с сайтом относительно папки, **из которой запущен сервер**. Сервер запускают из `back/`, значит сайт (`index.html`, `css/`, `js/`, `images/`) лежит на уровень выше — `..`. Эта же константа используется в `db.go`, чтобы прочитать `../js/data.js`.

> Если запустить сервер из другой папки (например, `go run ./back` из корня), `..` будет указывать не туда, и сервер не найдёт ни сайт, ни `data.js`. Поэтому запускать нужно именно из `back`.

## Функция `main()`

Точка входа программы — Go начинает выполнение с неё.

```go
openDB("studnet.db")
```
Открывает файл базы `back/studnet.db`. Если файла нет или он от старой версии схемы — создаёт заново и заполняет из `js/data.js` (подробно — [04-back-db.md](04-back-db.md)). Если что-то пошло не так, `openDB` сама завершит программу с ошибкой.

```go
mux := http.NewServeMux()
```
Создаёт **маршрутизатор** — таблицу «адрес → обработчик». Начиная с Go 1.22 маршрут можно писать вместе с методом (`"POST /api/login"`) и с параметрами в фигурных скобках (`{id}`), которые потом достаются через `r.PathValue("id")`.

### Маршруты API

```go
mux.HandleFunc("POST /api/login", route(false, login))
```
- `"POST /api/login"` — отвечать только на POST по этому адресу. GET на тот же адрес получит `405 Method Not Allowed`.
- `route(false, login)` — обёртка из `api.go`. Первый аргумент `false` значит «можно без входа» (иначе как войти?). Обёртка находит пользователя по токену, вызывает `login` и превращает ошибки в ответ 500 (см. [02-back-api.md → route](02-back-api.md#route)).

Все остальные адреса используют `route(true, ...)` — без входа они отвечают `401 «Требуется вход»`:

| Маршрут | Обработчик | Что делает |
|---|---|---|
| `POST /api/logout` | `logout` | выход |
| `GET /api/me` | `me` | кто я |
| `POST /api/me` | `updateMe` | сохранить профиль |
| `POST /api/settings` | `saveSetting` | переключить настройку |
| `GET /api/data` | `allData` | все данные сайта одним запросом |
| `GET /api/chats/{id}/messages` | `messages` | сообщения чата |
| `POST /api/chats/{id}/messages` | `sendMessage` | отправить сообщение |
| `POST /api/chats/{id}/read` | `markRead` | отметить чат прочитанным |
| `POST /api/dm` | `openDm` | найти/создать личный чат |
| `POST /api/clubs/{id}/toggle` | `toggleClub` | вступить в клуб / выйти |
| `GET /api/clubs/{id}/messages` | `clubMessages` | сообщения чата клуба |
| `POST /api/clubs/{id}/messages` | `sendClubMessage` | написать в чат клуба |
| `GET /api/events` | `events` | мгновенные сообщения (долгий опрос, `events.go`) |

### Маршруты админ-панели

```go
mux.HandleFunc("GET /api/admin/stats", route(true, adminOnly(adminStats)))
```
Двойная обёртка: `route(true, ...)` требует вход, а `adminOnly(...)` пускает дальше только администратора (`isAdmin = 1`), остальным отвечает `403`. Так устроены все шесть адресов `/api/admin/...`: `stats`, `channels` (создать), `channels/{id}` (изменить), `reports`, `reports/{id}/dismiss`, `users/{id}/block`.

### Раздача сайта

```go
files := noFolderList(http.FileServer(http.Dir(frontDir)))
```
- `http.Dir(frontDir)` — «файловая система» с корнем в папке сайта.
- `http.FileServer(...)` — встроенный обработчик, который отдаёт файлы по пути запроса (`/css/base.css` → файл `../css/base.css`).
- `noFolderList(...)` — наша обёртка, запрещает смотреть список файлов в папке (см. ниже).

```go
mux.Handle("GET /css/", files)
mux.Handle("GET /js/", files)
mux.Handle("GET /images/", files)
```
Отдаём **только** эти три папки. Путь, оканчивающийся на `/`, в Go значит «этот адрес и всё внутри». Папка `back/` (код и файл базы) в список не входит, поэтому скачать `studnet.db` через сайт нельзя.

```go
mux.HandleFunc("GET /{$}", func(w http.ResponseWriter, r *http.Request) {
	http.ServeFile(w, r, frontDir+"/index.html")
})
```
`/{$}` — ровно корень сайта `/` (знак `{$}` значит «здесь адрес заканчивается»; без него `/` ловил бы вообще все адреса). На корень отдаём `index.html`.

### Настройка сервера

```go
server := &http.Server{
	Addr:              ":8080",
	Handler:           securityHeaders(allowOtherSites(mux)),
	ReadHeaderTimeout: 5 * time.Second,
	ReadTimeout:       10 * time.Second,
	WriteTimeout:      10 * time.Second,
	IdleTimeout:       60 * time.Second,
}
```
| Поле | Значение и зачем |
|---|---|
| `Addr: ":8080"` | слушать порт 8080 **на всех сетевых адресах** компьютера. Поэтому сайт открывается и как `localhost:8080`, и с телефона по адресу компьютера в сети (`192.168.x.x:8080`) |
| `Handler` | кто отвечает на запросы. Запрос проходит «матрёшку»: сначала `securityHeaders` (добавляет заголовки защиты), затем `allowOtherSites` (CORS), затем `mux` (выбирает обработчик) |
| `ReadHeaderTimeout` | сколько ждать заголовки запроса. Защита от «медленных» атак, когда клиент шлёт по байту в минуту |
| `ReadTimeout` | сколько ждать весь запрос целиком |
| `WriteTimeout` | сколько времени на ответ. Исключение — `/api/events`: он ждёт до 25 секунд и сам продлевает себе этот тайм-аут (см. [03-back-events.md](03-back-events.md)) |
| `IdleTimeout` | сколько держать открытым соединение без запросов (браузер переиспользует соединения) |

```go
log.Println("СтудСеть запущена: http://localhost:8080")
log.Fatal(server.ListenAndServe())
```
`ListenAndServe` запускает сервер и **не возвращается**, пока он работает. Если вернулась — значит ошибка (например, порт 8080 уже занят другой программой); `log.Fatal` печатает её и завершает программу.

---

## Функция `allowOtherSites(next)` — CORS

```go
func allowOtherSites(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
```
**Зачем.** Браузер по умолчанию не даёт странице с одного адреса (например, Live Server `localhost:5500`) читать ответы с другого (`localhost:8080`). Это правило называется Same-Origin Policy, а разрешение — CORS.

Построчно:
1. Функция принимает следующий обработчик `next` и возвращает новый — это «обёртка» (middleware).
2. `Access-Control-Allow-Origin: *` — читать ответы может страница с любого адреса.
3. `Access-Control-Allow-Methods` — разрешены GET и POST.
4. `Access-Control-Allow-Headers` — разрешено присылать заголовки `Content-Type` и `Authorization` (без этого браузер не отправит токен).
5. Перед «непростым» запросом (POST с JSON или с `Authorization`) браузер сначала шлёт запрос `OPTIONS` — «можно?». Отвечаем `204 No Content` и не идём дальше.
6. Для всех остальных запросов — передаём управление в `next`.

**Почему `*` не опасно.** Вход у нас не через cookie, а через токен в заголовке. Чужой сайт этот токен не знает (он лежит в `sessionStorage` нашей страницы), поэтому ничего не сможет сделать от имени пользователя.

## Константа `contentSecurityPolicy`

```go
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
```
Список правил для браузера: откуда странице можно что-то загружать. Это **вторая линия защиты от XSS**: даже если вредный `<script>` как-то попадёт на страницу, браузер его не выполнит.

| Правило | Значение |
|---|---|
| `default-src 'self'` | по умолчанию всё — только с нашего сервера |
| `script-src 'self'` | скрипты — только наши файлы из `js/`. Встроенные `<script>…</script>` и `onclick="..."` запрещены (поэтому код темы вынесен в `theme.js`) |
| `style-src 'self' https://fonts.googleapis.com` | стили наши + CSS шрифта Inter от Google |
| `font-src https://fonts.gstatic.com` | файлы шрифта |
| `img-src 'self'` | картинки — только из нашей папки `images` |
| `connect-src 'self'` | `fetch` — только на наш сервер |
| `object-src 'none'` | запрет `<object>`, `<embed>` (старые плагины) |
| `base-uri 'none'` | нельзя подменить базовый адрес страницы тегом `<base>` |
| `form-action 'self'` | формы отправляются только на наш сервер |
| `frame-ancestors 'none'` | нашу страницу нельзя встроить в чужую через `<iframe>` |

> Политика действует, только когда страницу отдаёт **наш сервер**. Если открыть `index.html` через Live Server, её нет — это нормально для разработки.

## Функция `securityHeaders(next)`

```go
w.Header().Set("Content-Security-Policy", contentSecurityPolicy)
w.Header().Set("X-Content-Type-Options", "nosniff")
w.Header().Set("X-Frame-Options", "DENY")
w.Header().Set("Referrer-Policy", "no-referrer")
next.ServeHTTP(w, r)
```
Добавляет к **каждому** ответу заголовки защиты:
- `Content-Security-Policy` — правила выше;
- `X-Content-Type-Options: nosniff` — браузер не будет «угадывать» тип файла (JSON с текстом `<script>` не превратится в HTML);
- `X-Frame-Options: DENY` — то же, что `frame-ancestors 'none'`, для старых браузеров (защита от «кликджекинга»);
- `Referrer-Policy: no-referrer` — при переходе по ссылке на другой сайт не сообщать ему адрес нашей страницы.

## Функция `noFolderList(next)`

```go
if strings.HasSuffix(r.URL.Path, "/") {
	http.NotFound(w, r)
	return
}
next.ServeHTTP(w, r)
```
`http.FileServer` на адрес папки (`/images/`) показывает список всех файлов в ней. Нам это не нужно: адрес папки всегда оканчивается на `/`, поэтому на такие адреса отвечаем `404`, а файлы отдаём как обычно.
