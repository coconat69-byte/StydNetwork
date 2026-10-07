# 4. `back/db.go` и `back/schema.sql` — база данных

[← Оглавление](README.md)

База — один файл `back/studnet.db` (SQLite). Отдельно устанавливать СУБД не нужно: драйвер `modernc.org/sqlite` написан на чистом Go и встроен в программу.

---

## `schema.sql` — таблицы

Названия колонок совпадают с полями в `js/data.js` (`lastMessage`, `userId`, …). Благодаря этому сервер переносит данные оттуда в базу без ручного сопоставления, а отдаёт браузеру в том же виде, в каком их ждёт сайт.

### `study_groups`, `directions`
```sql
CREATE TABLE study_groups (name TEXT PRIMARY KEY);
CREATE TABLE directions   (name TEXT PRIMARY KEY);
```
Списки групп и направлений для фильтров в поиске. `PRIMARY KEY` — без повторов.

### `users`
| Колонка | Тип | Что хранит |
|---|---|---|
| `id` | INTEGER PK | номер пользователя |
| `name` | TEXT NOT NULL | имя |
| `email` | TEXT | почта (другим не отдаётся, кроме админа) |
| `avatar` | TEXT | путь к картинке, `images/IgorAvatar.jpg` |
| `"group"` | TEXT | учебная группа. В кавычках, потому что `GROUP` — служебное слово SQL (`GROUP BY`) |
| `direction` | TEXT | направление |
| `course` | INTEGER | курс |
| `interests` | TEXT `'[]'` | JSON-список `["Python","Java"]` |
| `online` | INTEGER 0/1 | в сети |
| `role` | TEXT | `student` или `teacher` |
| `bio` | TEXT | «о себе» |
| `isAdmin` | INTEGER 0/1 | доступ к админ-панели |
| `blocked` | INTEGER 0/1 | заблокирован — войти нельзя |
| `notifyUnread`, `notifyChannels`, `notifyMentions`, `compact`, `showOnline`, `showGroup`, `allowMessages` | INTEGER 0/1 | переключатели на экране «Настройки» (по умолчанию все 1, кроме `compact`) |

В SQLite нет отдельного логического типа, поэтому «да/нет» хранится как 1/0. В Go они приходят как `int64`, отсюда сравнения вида `user["blocked"] == int64(1)`.

### `access_codes`
`code` (PK) → `userId`. По коду человек входит на сайт.

### `sessions`
`token` (PK) → `userId` и `expiresAt` — до какого момента вход действует, в секундах с 1970 года («unix-время»).

### `chat_types`
`type` (PK: `channel`, `group`, `direction`, `course`, `flood`, `dm`), `label` («Канал», «Группа»…), `readonly` (1 — писать могут только преподаватели).

### `chats`
| Колонка | Что хранит |
|---|---|
| `id` | номер чата |
| `name` | название (у личных пустое — берётся имя собеседника) |
| `type` | ссылка на `chat_types` |
| `avatar`, `icon` | картинка или эмодзи |
| `members` | число участников (для подписи) |
| `description` | описание (панель справа) |
| `lastMessage`, `lastTime` | превью последнего сообщения в списке чатов |
| `ownerId`, `userId` | только у личных: кто начал переписку и с кем |

### `chat_reads`
`(userId, chatId)` → `lastReadId`: до какого сообщения человек дочитал чат. Непрочитанные = чужие сообщения с `id` больше `lastReadId` (считает `allData`).

### `messages`
`id` (AUTOINCREMENT — номера никогда не повторяются, даже после удаления), `chatId`, `userId`, `text`, `time` («11:45»), `reactions` (JSON `[{"emoji":"👍","count":3}]`).

### `clubs`, `club_members`, `club_messages`
- `clubs` — клубы: `id`, `name`, `emoji`, `description`, `category`, `admin` (имя руководителя).
- `club_members` — кто в каком клубе. `PRIMARY KEY (clubId, userId)` — в один клуб дважды не вступить.
- `club_messages` — чат клуба: `id`, `clubId`, `userId`, `text`, `time`.

### `reports`
Жалобы: `id`, `userId` (на кого), `reason`, `time`.

> **Поменяли `schema.sql`?** Увеличьте `schemaVersion` в `db.go` — сервер увидит старую базу и пересоздаст её.

---

## `db.go`

### Импорты
| Пакет | Зачем |
|---|---|
| `bytes` | поиск `{` и `}` в `data.js` |
| `database/sql` | стандартный интерфейс Go к базам данных |
| `_ "embed"` | включает `//go:embed` (вшить файл в программу) |
| `encoding/json` | разбор `data.js`, JSON-колонки |
| `fmt` | тексты ошибок, сборка `PRAGMA` |
| `log` | `log.Fatal` при ошибках открытия |
| `os` | чтение и удаление файлов |
| `strings` | склейка списков колонок |
| `_ "modernc.org/sqlite"` | драйвер SQLite. Подчёркивание — «импортировать ради побочного эффекта»: пакет при загрузке регистрирует драйвер с именем `"sqlite"` |

### Вшитая схема
```go
//go:embed schema.sql
var schemaSQL string
```
При сборке Go кладёт текст `schema.sql` прямо в программу, в переменную `schemaSQL`. Файл рядом с программой потом не нужен.

### `schemaVersion`
```go
const schemaVersion = 7
```
Версия схемы. Хранится в самой базе (`PRAGMA user_version`) и сравнивается при запуске.

### `var db *sql.DB`
Одно подключение к базе на весь сервер. Все обработчики пользуются им.

### `openDB(path)`
```go
connect(path)
var version int
db.QueryRow("PRAGMA user_version").Scan(&version)
if version == schemaVersion {
	return
}
db.Close()
os.Remove(path)
connect(path)
if err := createDB(); err != nil {
	db.Close()
	os.Remove(path)
	log.Fatal("Не удалось создать базу: ", err)
}
log.Println("Создана новая база:", path)
```
1. Открываем файл (если его нет, SQLite создаст пустой).
2. Читаем версию из базы. У нового пустого файла она 0.
3. Версия совпала → база в порядке, работаем с ней.
4. Не совпала (или файла не было) → закрываем, **удаляем файл** и создаём заново через `createDB`.
5. Создание не удалось → удаляем недоделанную базу (чтобы в следующий раз не подумать, что она в порядке) и завершаем программу с ошибкой.

### `connect(path)`
```go
db, err = sql.Open("sqlite", path)
...
db.SetMaxOpenConns(1)
```
`sql.Open` готовит подключение. `SetMaxOpenConns(1)` — держим одно соединение: SQLite не любит одновременную запись из нескольких соединений («database is locked»). Запросы просто выстраиваются в очередь.

### `createDB()` — создание и заполнение базы
1. **Таблицы:** `db.Exec(schemaSQL)` выполняет весь `schema.sql` разом.
2. **Читаем `../js/data.js`.** Там сначала комментарий, потом `const MOCK_DATA = {...};`. Всё от первой `{` до последней `}` — обычный JSON:
   ```go
   start := bytes.IndexByte(raw, '{')
   end := bytes.LastIndexByte(raw, '}')
   raw = raw[start : end+1]
   ```
3. **Разбираем JSON** в структуру с полями `AccessCodes`, `Groups`, `Directions`, `Users`, `ChatTypes`, `Chats`, `Messages`, `Clubs`, `ClubMessages`, `Reports`. Пользователи, чаты и т.п. разбираются в `map[string]any` — так не нужно описывать каждое поле: какие поля есть в `data.js`, такие колонки и заполнятся.
4. **Транзакция:** `tx, err := db.Begin()` и `defer tx.Rollback()`. Все вставки идут одной транзакцией — так в разы быстрее, и при ошибке не запишется ничего (`Rollback` отменит всё, если до `Commit` не дошли).
5. **Собираем строки** в список `rows` (таблица + поля) функцией `add`:
   - группы и направления → `{name}`;
   - пользователи — как есть;
   - коды `{"123-123-123": 1}` → строки `{code, userId}`;
   - типы чатов `{"channel": {...}}` → к каждому добавляем поле `type`;
   - чаты — как есть;
   - сообщения `{"1": [...]}` → к каждому сообщению добавляем `chatId`;
   - клубы: список `memberIds` переносим в отдельную таблицу `club_members` (строка на каждого участника) и удаляем из самого клуба;
   - сообщения клубов → добавляем `clubId`, удаляем `reactions` (у клубных их нет);
   - жалобы — как есть.
6. **Вставляем** каждую строку функцией `insert`. Ошибка → в тексте будет имя таблицы.
7. **Записываем версию** `PRAGMA user_version = 7` и `tx.Commit()` — всё сохраняется разом.

### `isSafeName(name)`
Имена таблиц и колонок нельзя передать через `?`, поэтому `insert` вклеивает их в текст запроса. Чтобы туда не попало ничего лишнего (кавычка, пробел, `;`), имя сначала проверяется: только латинские буквы и `_`, не пустое.

### `insert(tx, table, fields)`
Из словаря `{"id": 1, "name": "IT"}` строит и выполняет
```sql
INSERT INTO clubs ("id", "name") VALUES (?, ?)
```
1. Проверяет имя таблицы и каждой колонки `isSafeName`.
2. Значения-списки и объекты (`interests`, `reactions`) превращает в JSON-текст.
3. Имена колонок берёт в кавычки — из-за колонки `group`.
4. Значения передаёт отдельно через `?` — инъекция невозможна.

### `jsonColumns`
```go
var jsonColumns = map[string]bool{"interests": true, "reactions": true, "memberIds": true}
```
Колонки, где лежит JSON-текст. При чтении их отдаём браузеру как настоящие списки, а не как строку `"[\"Python\"]"`.

### `query(q, args...)` — SELECT → список словарей
```go
rows, err := db.Query(q, args...)
defer rows.Close()
cols, _ := rows.Columns()
for rows.Next() {
	values := make([]any, len(cols))
	pointers := make([]any, len(cols))
	for i := range values { pointers[i] = &values[i] }
	rows.Scan(pointers...)
	row := map[string]any{}
	for i, col := range cols {
		if text, ok := values[i].(string); ok && jsonColumns[col] {
			row[col] = json.RawMessage(text)
		} else {
			row[col] = values[i]
		}
	}
	list = append(list, row)
}
```
1. Выполняет запрос, `defer rows.Close()` — освободит соединение при выходе.
2. Узнаёт имена колонок результата.
3. Для каждой строки: `Scan` хочет указатели — готовим по одному на колонку и читаем значения.
4. Складываем в словарь «колонка → значение». JSON-колонки оборачиваем в `json.RawMessage` — «это уже готовый JSON, вставь как есть».
5. Возвращает `[]map[string]any` — его сразу можно отдать браузеру через `send`, отдельные структуры не нужны. Пустой результат — пустой список `[]`, а не `null`.

### `queryOne(q, args...)`
То же, но для одной строки: первая строка или `nil`, если ничего не нашлось.

---

## Как вернуть базу к стартовым данным
Остановить сервер → удалить `back/studnet.db` → запустить снова. База создастся из `js/data.js`.

## Про `back/seed.sql`
Старый вариант стартовых данных. **Сервер его не читает** — данные берутся только из `js/data.js`. Файл можно удалить.
