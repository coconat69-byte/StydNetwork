# 2. `back/api.go` — обработчики API

[← Оглавление](README.md)

Здесь живут все функции, которые отвечают на адреса `/api/...` (список адресов — в `main.go`, см. [01-back-main.md](01-back-main.md)). Файл разбит на разделы:

1. [Ограничения](#ограничения) — константы длины полей и срока входа
2. [Общие помощники](#общие-помощники) — `route`, `send`, `fail`, `ok`, `tokenOf`, `readBody`, `readText`, `tooLong`, `isEmail`, `now`
3. [Защита от перебора кодов](#защита-от-перебора-кодов) — `tooManyFails`, `rememberFail`, `forgetFails`, `newToken`
4. [Вход и выход](#вход-и-выход) — `login`, `logout`, `me`
5. [Профиль и настройки](#профиль-и-настройки) — `cleanInterests`, `updateMe`, `saveSetting`
6. [Данные для сайта](#данные-для-сайта) — `allData`, `namesOf`
7. [Чаты](#чаты) — `canSeeChat`, `findChat`, `messages`, `sendMessage`, `markRead`, `findDm`, `openDm`
8. [Клубы](#клубы) — `isMember`, `toggleClub`, `clubMessages`, `sendClubMessage`
9. [Админ-панель](#админ-панель) — `adminOnly`, `adminStats`, `readChannel`, `createChannel`, `updateChannel`, `reports`, `dismissReport`, `blockUser`

**Как устроен любой обработчик.** У всех одна «подпись»:

```go
func имя(w http.ResponseWriter, r *http.Request, user map[string]any) error
```
- `w` — куда писать ответ;
- `r` — запрос (адрес, заголовки, тело);
- `user` — кто вошёл: строка из таблицы `users` в виде словаря `{"id": 1, "name": "Яша", ...}` (или `nil`, если никто — бывает только у `login`);
- возвращает `error`: если не `nil`, обёртка `route` запишет ошибку в лог и ответит `500 «Ошибка сервера»`.

**Как устроена защита от SQL-инъекций.** Во всех запросах данные пользователя передаются отдельно от текста запроса — через знаки `?`:
```go
db.Exec("UPDATE users SET name = ? WHERE id = ?", name, user["id"])
```
База получает текст и значения по отдельности, поэтому значение `1; DROP TABLE users` так и останется строкой.

---

## Импорты

| Пакет | Где используется |
|---|---|
| `crypto/rand` | `newToken` — криптостойкие случайные байты для токена |
| `database/sql` | `sql.Named` — именованные параметры в `allData` |
| `encoding/hex` | `newToken` — байты → строка из 0-9a-f |
| `encoding/json` | чтение тела запроса и отправка ответов |
| `log` | `route` пишет ошибки в консоль |
| `net` | `ipOf` — отделить IP от порта |
| `net/http` | всё про запросы и ответы, коды статусов |
| `strings` | обрезка пробелов, поиск `@` и т.п. |
| `sync` | `sync.Mutex` для счётчика неудачных входов |
| `time` | срок сессии, время сообщений |
| `unicode/utf8` | `tooLong` считает буквы, а не байты |

---

## Ограничения

```go
const maxBodySize = 64 * 1024
```
Самый большой запрос, который сервер согласен прочитать, — 64 КБ. Без ограничения можно было бы прислать гигабайт и занять всю память.

```go
const (
	maxNameLen        = 50   // имя в профиле
	maxEmailLen       = 100  // email
	maxBioLen         = 500  // «О себе»
	maxMessageLen     = 2000 // сообщение в чате
	maxChannelNameLen = 60   // название канала
	maxDescriptionLen = 300  // описание канала
)
```
Сколько **символов** можно ввести в каждое поле. На сайте стоят такие же атрибуты `maxlength`, но сервер обязан проверять сам — запрос можно отправить в обход сайта.

```go
const sessionLifetime = 7 * 24 * time.Hour
```
Вход действует 7 дней, потом токен перестаёт работать.

---

## Общие помощники

### `type handler`
```go
type handler func(w http.ResponseWriter, r *http.Request, user map[string]any) error
```
Тип «обработчик API». Отличается от стандартного обработчика Go двумя вещами: получает уже найденного `user` и может вернуть ошибку.

### `route`
```go
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
```
Превращает наш `handler` в обычный обработчик `net/http`. Построчно:
1. **Один SQL-запрос находит пользователя по токену.** Вложенный `SELECT` ищет сессию с этим токеном, у которой срок ещё не вышел (`expiresAt > сейчас`), и берёт её `userId`. Внешний — берёт этого пользователя, если он **не заблокирован**. Так одной проверкой отсекаются: нет токена, чужой/выдуманный токен, просроченный вход, заблокированный человек.
2. Если пользователя нет, а адрес требует входа (`loginRequired`) — ответ `401 «Требуется вход»`. Сайт, получив такой ответ при запуске, покажет форму входа.
3. Иначе вызываем сам обработчик `h`.
4. Если на любом шаге случилась ошибка (база, код) — пишем подробности в консоль сервера, а пользователю отвечаем коротко `500 «Ошибка сервера»`: незачем показывать посторонним, как устроен сервер.

### `send`, `fail`, `ok`
```go
func send(w http.ResponseWriter, status int, value any) error {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(value)
	return nil
}
```
- `send` ставит заголовок «это JSON в UTF-8», код ответа и превращает `value` в JSON. Возвращает `nil`, чтобы в обработчиках писать коротко: `return send(...)`. Go сам заменяет в JSON символы `<`, `>`, `&` на `<` и т.п., так что HTML из ответа «не просочится».
- `fail(w, status, message)` — ответ-ошибка `{"error": "текст"}`. Этот текст сайт показывает пользователю в `alert`.
- `ok(w)` — короткий ответ «всё получилось»: `{"ok": true}`.

### `tokenOf`
```go
return strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
```
Достаёт токен из заголовка `Authorization: Bearer <токен>`. Если заголовка нет — пустая строка (такой сессии нет, `route` вернёт 401).

### `readBody`
```go
r.Body = http.MaxBytesReader(w, r.Body, maxBodySize)
json.NewDecoder(r.Body).Decode(dst)
```
Читает JSON из тела запроса в структуру `dst`, но не больше 64 КБ. Ошибку разбора специально не проверяем: пустое, слишком большое или битое тело просто оставит поля пустыми, и обработчик сам скажет, чего не хватает («Пустое сообщение», «Введите название»…).

### `readText`
```go
var body struct{ Text string }
readBody(w, r, &body)
return strings.TrimSpace(body.Text)
```
Читает тело вида `{"text": "..."}` и убирает пробелы по краям. JSON-поле `text` попадает в `Text`, потому что пакет `encoding/json` сравнивает имена без учёта регистра.

### `tooLong`
```go
return utf8.RuneCountInString(text) > max
```
Длиннее ли текст, чем `max` **символов**. `len(text)` в Go считает байты, а русская буква — 2 байта, поэтому считаем руны (символы).

### `isEmail`
Простая проверка «похоже на почту»:
1. `@` есть, не в начале и ровно одна (`Index == LastIndex`);
2. после `@` есть точка;
3. нет пробелов, угловых скобок и кавычек.

### `now`
```go
return time.Now().Format("15:04")
```
Текущее время как `12:05` — так время показывается у сообщений. `"15:04"` — это не время, а «образец» формата в Go (часы в 24-часовом формате и минуты).

---

## Защита от перебора кодов

Код доступа — 9 цифр. Без ограничений программа могла бы перебирать коды тысячами в секунду. Поэтому после **5 неудачных попыток с одного IP** вход с него закрыт **до конца минуты** от первой ошибки.

```go
const maxLoginFails = 5
const loginFailWindow = time.Minute

type loginFails struct {
	count int
	first time.Time
}

var (
	failsByIP  = map[string]*loginFails{}
	failsMutex sync.Mutex
)
```
- `failsByIP` — словарь «IP → сколько ошибок и когда была первая».
- `failsMutex` — «замок». Запросы обрабатываются одновременно в разных потоках, а менять один `map` из двух потоков сразу нельзя (программа упадёт). Поэтому каждая функция ниже сначала берёт замок (`Lock`), а в конце отпускает (`defer Unlock` — выполнится при выходе из функции).

### `ipOf(r)`
`r.RemoteAddr` выглядит как `192.168.1.5:53422`. `net.SplitHostPort` отделяет IP от порта; если не получилось — возвращаем как есть.

### `tooManyFails(ip)`
1. Берём замок.
2. Нет записи об ошибках — вход открыт (`false`).
3. Если с первой ошибки прошло больше минуты — забываем все ошибки этого IP и открываем вход.
4. Иначе закрыто, если ошибок уже 5 или больше.

### `rememberFail(ip)`
Добавляет ещё одну ошибку. Если записи не было — создаёт её с временем первой ошибки «сейчас».

### `forgetFails(ip)`
После удачного входа стирает ошибки этого IP.

### `newToken()`
```go
bytes := make([]byte, 32)
rand.Read(bytes)
return hex.EncodeToString(bytes)
```
32 случайных байта из `crypto/rand` (это криптостойкий генератор — угадать значение невозможно) → строка из 64 шестнадцатеричных символов.

---

## Вход и выход

### `login` — `POST /api/login {code}`
1. **Проверка перебора.** `tooManyFails(ip)` → если да, `429 «Слишком много неверных попыток…»`.
2. Читаем тело `{code}`.
3. **Ищем пользователя по коду**: `JOIN access_codes` по `userId`, код — через `?`, пробелы по краям убраны.
4. **Нет такого кода** → `rememberFail(ip)` и `401 «Неверный код доступа…»`.
5. **Заблокирован** → `403 «Аккаунт заблокирован администратором.»`. С сервера числа приходят как `int64`, поэтому сравниваем с `int64(1)`.
6. Удачно → `forgetFails(ip)`.
7. **Уборка:** удаляем из `sessions` все просроченные входы, чтобы таблица не росла бесконечно.
8. **Новая сессия:** `newToken()`, срок = сейчас + 7 дней, `INSERT INTO sessions`.
9. Ставим пользователю `online = 1` («в сети»).
10. Отвечаем `{token, user}`. Сайт кладёт токен в `sessionStorage` и дальше прикладывает его к каждому запросу.

### `logout` — `POST /api/logout`
Удаляет сессию с этим токеном (токен больше не действует) и ставит `online = 0`.

### `me` — `GET /api/me`
Просто отдаёт `user`, которого нашёл `route`. Сайт спрашивает это при обновлении страницы, чтобы проверить, что токен ещё живой.

---

## Профиль и настройки

### `cleanInterests(list)`
Приводит список интересов в порядок:
1. не больше 10 штук (как только набралось 10 — `break`);
2. пробелы по краям убираются;
3. каждый обрезается до 30 **символов** (режем `[]rune`, чтобы не разрезать русскую букву пополам);
4. пустые и повторы (без учёта регистра, словарь `seen`) пропускаются.

### `updateMe` — `POST /api/me {name, email, bio, interests}`
1. Читает тело в структуру с четырьмя полями.
2. Убирает пробелы по краям у имени, почты и «о себе».
3. **Проверки** (каждая — свой ответ `400` с понятным текстом):
   - имя пустое → «Имя не может быть пустым»;
   - имя длиннее 50 → «Слишком длинное имя»;
   - почта не пустая, но длиннее 100 или не похожа на почту → «Проверьте адрес почты»;
   - «о себе» длиннее 500 → «Текст «О себе» слишком длинный».
4. Интересы чистит `cleanInterests` и превращает в JSON-текст `["Python","Java"]` — в базе они хранятся строкой.
5. `UPDATE users SET name, email, bio, interests WHERE id = <я>` — менять можно только себя: `id` берётся из `user`, а не из запроса.
6. Перечитывает себя из базы и отдаёт — сайт обновит данные на экране.

### `settingQueries` и `saveSetting` — `POST /api/settings {key, value}`
```go
var settingQueries = map[string]string{
	"notifyUnread":   "UPDATE users SET notifyUnread = ? WHERE id = ?",
	...
	"allowMessages":  "UPDATE users SET allowMessages = ? WHERE id = ?",
}
```
Для **каждой** настройки SQL-запрос написан целиком заранее. Имя колонки нельзя передать через `?` (так передаются только значения), а вклеивать в запрос имя из запроса пользователя опасно: можно было бы прислать `key: "isAdmin"` и стать администратором. Здесь такой настройки просто нет в словаре → `400 «Нет такой настройки»`.

`saveSetting`: читает `{key, value}`, ищет запрос в словаре, выполняет его с `value` (true/false → 1/0) и своим `id`, отвечает `{ok: true}`.

---

## Данные для сайта

### `privateSettings`
Список настроек, которые **другим** людям не отдаём: `notifyUnread`, `notifyChannels`, `notifyMentions`, `compact`, `showOnline`, `showGroup`. (`allowMessages` отдаём: по нему сайт решает, показывать ли кнопку «Написать».)

### `allData` — `GET /api/data`
Все данные сайта одним запросом — в том же виде, что `MOCK_DATA` в `js/data.js`, чтобы сайту было всё равно, откуда они пришли.

**1. Пользователи** — `SELECT * FROM users ORDER BY id`, затем для каждого **чужого** пользователя:
- `showOnline = 0` → `online` отдаём как 0 (человек скрыл, что в сети);
- `showGroup = 0` → `group` отдаём пустой строкой;
- удаляем все поля из `privateSettings`;
- удаляем `email`, если спрашивает не администратор.

Про себя человек видит всё.

**2. Чаты:**
```sql
SELECT c.*,
	(SELECT COUNT(*) FROM messages m
	  WHERE m.chatId = c.id AND m.userId != :me
	    AND m.id > COALESCE((SELECT lastReadId FROM chat_reads WHERE chatId = c.id AND userId = :me), 0)
	) AS unread
FROM chats c
WHERE (c.type != 'dm' OR :me IN (c.ownerId, c.userId))
  AND (c.type != 'group' OR :role != 'teacher')
ORDER BY c.id
```
- `:me`, `:role` — **именованные** параметры (`sql.Named`). `:me` встречается три раза, и с именем его не нужно передавать трижды.
- Подзапрос `unread` считает непрочитанные: чужие (`userId != я`) сообщения этого чата с `id` больше, чем «дочитал до» из `chat_reads`. `COALESCE(..., 0)` — если человек ещё ни разу не открывал чат, записи нет, считаем от нуля.
- `WHERE` — правила доступа (те же, что в `canSeeChat`):
  - личный чат (`dm`) — только если я один из двоих собеседников;
  - чат группы (`group`) — только если я не преподаватель.

**3. Клубы:**
```sql
SELECT c.*, (SELECT json_group_array(userId) FROM club_members WHERE clubId = c.id) AS memberIds
FROM clubs c ORDER BY c.id
```
`json_group_array` — функция SQLite, собирает id участников в JSON-список `[1,2,3]`. Колонка `memberIds` отмечена в `jsonColumns` (`db.go`), поэтому уйдёт браузеру списком, а не строкой.

**4. Типы чатов, группы, направления** — простые `SELECT`. `ORDER BY rowid` — в порядке добавления, то есть как в `data.js`.

**5. Сборка ответа.** Типы чатов сайт ждёт объектом `{"channel": {...}, "group": {...}}`, а не списком — перекладываем в словарь. Группы и направления превращаем из `[{name: "исп341"}]` в `["исп341"]` функцией `namesOf`.

### `namesOf(rows)`
Из списка строк `[{name: ...}, ...]` делает простой список значений `name`.

---

## Чаты

### `canSeeChat(user, chat)` — главное правило доступа к чатам
```go
switch chat["type"] {
case "dm":
	return user["id"] == chat["ownerId"] || user["id"] == chat["userId"]
case "group":
	return user["role"] != "teacher"
}
return true
```
- **Личный чат** — видят только двое: кто начал (`ownerId`) и с кем (`userId`).
- **Чат группы** — видят только студенты. Это место, где группа общается между собой, поэтому преподаватели его не видят ни в списке, ни по прямому адресу, и не получают из него мгновенных сообщений.
- Остальные чаты (каналы, направления, курсы, флудилка) — общие.

Используется в трёх местах: `findChat` (чтение, отправка, «прочитано»), `sendMessage` (кому рассылать событие) и — тем же условием в SQL — `allData`.

### `findChat(user, chatID)`
```go
chat, err := queryOne(`SELECT c.id, c.type, c.ownerId, c.userId, t.readonly
	FROM chats c JOIN chat_types t ON t.type = c.type WHERE c.id = ?`, chatID)
if err != nil || chat == nil || !canSeeChat(user, chat) {
	return nil, err
}
return chat, nil
```
Берёт чат вместе с флагом `readonly` его типа (`JOIN chat_types`). Если чата нет **или** пользователю его видеть нельзя — возвращает `nil`, и обработчик ответит `404 «Чат не найден»`. Специально не `403`: чужому незачем знать, что такой чат вообще существует.

### `messages` — `GET /api/chats/{id}/messages`
`findChat` → `404`, если нельзя. Иначе все сообщения чата по порядку `id`: `id, userId, text, time, reactions`.

### `sendMessage` — `POST /api/chats/{id}/messages {text}`
1. `readText` → пусто? `400 «Пустое сообщение»`. Длиннее 2000? `400 «Слишком длинное сообщение»`.
2. `findChat` → `404`, если чат чужой.
3. **Каналы только для преподавателей:** если у типа чата `readonly = 1`, а пишет не преподаватель → `403 «Этот чат доступен только для чтения»`.
4. `sentAt := now()` — одно время и для сообщения, и для превью в списке чатов.
5. `INSERT INTO messages` → сохранили; `res` хранит id новой строки.
6. `UPDATE chats SET lastMessage, lastTime` — превью «последнее сообщение» в списке чатов.
7. **Мгновенная рассылка:**
   ```go
   id, _ := res.LastInsertId()
   publish(map[string]any{
   	"type":    "message",
   	"chatId":  chat["id"],
   	"message": map[string]any{"id": id, "userId": user["id"], "text": text, "time": sentAt, "reactions": []any{}},
   }, func(listener map[string]any) bool { return canSeeChat(listener, chat) })
   ```
   `publish` (из `events.go`) запоминает событие и будит все ждущие запросы `/api/events`. Второй аргумент — функция-фильтр: событие получит только тот, кому `canSeeChat` разрешает видеть этот чат. Подробно — [03-back-events.md](03-back-events.md).
8. `{ok: true}`.

### `markRead` — `POST /api/chats/{id}/read`
```sql
INSERT OR REPLACE INTO chat_reads (userId, chatId, lastReadId)
VALUES (?, ?, (SELECT COALESCE(MAX(id), 0) FROM messages WHERE chatId = ?))
```
Запоминает: «этот человек дочитал этот чат до самого последнего сообщения». `INSERT OR REPLACE` добавит строку, а если она уже есть (тот же первичный ключ `userId+chatId`) — перезапишет.

### `findDm(firstID, secondID)`
Ищет личный чат двух людей — **кто бы из них его ни начал**: `(owner=A и user=B) или (owner=B и user=A)`.

### `openDm` — `POST /api/dm {userId}`
1. Написать самому себе нельзя → `400`.
2. Собеседника нет → `404 «Пользователь не найден»`.
3. Переписка уже есть → отдаём её (даже если собеседник потом запретил новые сообщения — старая переписка остаётся).
4. Переписки нет, а собеседник запретил писать (`allowMessages = 0`) → `403 «Пользователь ограничил личные сообщения»`.
5. Создаём чат `type='dm'`, `members=2`, `ownerId=я`, `userId=он` и отдаём его.

Новый личный чат собеседник увидит, когда в нём появится первое сообщение: сайт получит событие о чате, которого нет в его списке, и перечитает список (`reloadChats` в `app.js`).

---

## Клубы

### `isMember(user, clubID)`
`SELECT 1 FROM club_members WHERE clubId = ? AND userId = ?` — есть строка → состоит.

### `toggleClub` — `POST /api/clubs/{id}/toggle`
1. Клуба нет → `404`.
2. Состоит → `DELETE` из `club_members`; не состоит → `INSERT`. Дважды вступить невозможно: первичный ключ `(clubId, userId)`.
3. Отвечает новым списком участников `{memberIds: [...]}` (опять через `json_group_array`).

### `clubMessages` — `GET /api/clubs/{id}/messages`
Сообщения чата клуба. Читать могут все. Колонка `'[]' AS reactions` добавлена, чтобы формат совпадал с обычными сообщениями (у клубных реакций нет) — тогда сайт рисует их той же функцией `messagesHtml`.

### `sendClubMessage` — `POST /api/clubs/{id}/messages {text}`
1. Те же проверки текста, что в `sendMessage`.
2. Не участник → `403 «Сначала вступите в клуб»`.
3. `INSERT INTO club_messages`.
4. `publish({"type": "club", "clubId": clubID}, nil)` — чат клуба читать могут все, поэтому фильтр `nil` (всем). Сайт, у которого открыт чат этого клуба, перечитает его ленту.

---

## Админ-панель

### `adminOnly(h)`
Обёртка: пропускает к `h` только пользователя с `isAdmin = 1`, остальным — `403 «Только для администратора»`. Кнопку «Админ» на сайте обычный пользователь не видит, но прислать запрос вручную может — поэтому проверка обязательна здесь.

### `adminStats` — `GET /api/admin/stats`
Четыре подзапроса `COUNT(*)` в одном `SELECT`: всего пользователей, в сети сейчас, чатов, жалоб.

### `readChannel(w, r)`
Читает `{name, description}` из формы, убирает пробелы и проверяет: название не пустое и не длиннее 60, описание не длиннее 300. Возвращает текст ошибки (`problem`) или пустую строку. Имена результатов (`name, description, problem string`) объявлены прямо в заголовке функции — в Go их можно просто присвоить и написать `return`.

### `createChannel` — `POST /api/admin/channels {name, description}`
`INSERT INTO chats` с `type='channel'`, иконкой `📢`, 0 подписчиков. `res.LastInsertId()` — id, который база выдала новому каналу; по нему перечитываем и отдаём канал целиком.

### `updateChannel` — `POST /api/admin/channels/{id} {name, description}`
`UPDATE chats ... WHERE id = ? AND type = 'channel'` — условие по типу не даёт этим адресом переименовать чужой личный чат или группу. Потом перечитываем; не нашёлся → `404 «Канал не найден»`.

### `reports` — `GET /api/admin/reports`
Все жалобы, новые сверху (`ORDER BY id DESC`).

### `dismissReport` — `POST /api/admin/reports/{id}/dismiss`
«Отклонить жалобу» = удалить её.

### `blockUser` — `POST /api/admin/users/{id}/block {blocked}`
1. Человека нет → `404`. Администратора блокировать нельзя → `400`.
2. `UPDATE users SET blocked = ?`.
3. Если **разблокировали** — всё, `{ok: true}`.
4. Если **заблокировали**:
   - `disconnect(id)` (из `events.go`) — сразу отвечаем на его ждущий запрос `/api/events`, чтобы новые сообщения ему больше не приходили;
   - удаляем все его сессии — выкидывает с сайта (следующий запрос получит 401);
   - удаляем жалобы на него (считаются решёнными);
   - ставим «не в сети».
