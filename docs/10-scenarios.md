# 10. Сквозные сценарии

[← Оглавление](README.md)

Что происходит от действия пользователя до базы и обратно — функция за функцией. Ссылки ведут в подробные разделы.

---

## 1. Открытие страницы

1. Браузер загружает `index.html`.
2. `theme.js` (ещё до стилей): ставит `data-theme` из `localStorage`; если в `sessionStorage` есть токен — класс `logged-in` (CSS сразу покажет приложение, а не форму). → [05](05-front-html-theme.md#jsthemejs)
3. Загружаются стили, затем `data.js` → `api.js` → `app.js`.
4. `DOMContentLoaded` → `start()`: `bindEvents()` вешает все обработчики. → [07](07-front-app.md#start)
5. Токена нет → видна форма входа. Есть → `API.me()`.
6. `API.me()` → `call` → `request('/me')` → адреса ещё нет → `findServer()` перебирает кандидатов (адрес страницы, тот же хост `:8080`, `localhost:8080`) и выбирает тот, что отвечает JSON-ом. → [06](06-front-api.md#findserver)
7. Сервер: `route(true, me)` находит пользователя по токену → отдаёт его. → [02](02-back-api.md#route)
8. `enterApp(user)` → `API.data()` → `GET /api/data` → `allData` собирает пользователей, доступные чаты с непрочитанными, клубы… → интерфейс рисуется, запускается `API.listen`.

## 2. Вход по коду

1. Ввод в поле → `formatCode` ставит дефисы: `123-123-123`.
2. «Войти» → браузер проверяет `pattern` → `login(e)` → `API.login(code)`.
3. `POST /api/login {code}` → `route(false, login)`:
   1. `tooManyFails(ip)` — не больше 5 ошибок в минуту;
   2. поиск кода в `access_codes` (через `?`);
   3. заблокирован? → 403;
   4. `newToken()` → `INSERT INTO sessions` (срок 7 дней), `online = 1`;
   5. ответ `{token, user}`.
4. `API.login` кладёт токен в `sessionStorage` → `enterApp(user)`.

Без сервера: `LOCAL.login` ищет код в `MOCK_DATA.accessCodes`, «токен» = `local-<id>`, видна плашка «Сервер не найден».

## 3. Отправка сообщения и мгновенная доставка получателю

**У отправителя:**
1. Enter в поле → `submit` → `sendMessage(e)`. → [07](07-front-app.md#sendmessagee)
2. `API.sendMessage(chatId, text)` → `POST /api/chats/5/messages {"text": "Привет"}` с токеном.

**На сервере** (`sendMessage` в `api.go`): → [02](02-back-api.md#sendmessage--post-apichatsidmessages-text)
3. `route` — кто пишет (по токену).
4. Проверки: не пусто, не длиннее 2000, `findChat` → `canSeeChat` (чужая личка / чат группы для преподавателя → 404), канал и не преподаватель → 403.
5. `INSERT INTO messages`, `UPDATE chats SET lastMessage, lastTime`.
6. `publish({type: "message", chatId, message}, фильтр canSeeChat)` → событие получает номер, попадает в журнал, `close(newEvent)` будит все ждущие запросы. → [03](03-back-events.md#publishdata-allowed)
7. Ответ отправителю `{ok: true}`.

**Снова у отправителя:**
8. Поле очищается, превью обновляется, `openChat` перерисовывает переписку.

**У получателя** (в другом браузере, ничего не нажимая):
9. Его `API.listen` уже ждёт ответа на `GET /api/events?after=K-41`. На сервере его запрос проснулся от звонка, перебрал журнал: событие 42 есть, `canSeeChat(получатель, чат)` — можно → отвечает `{cursor: "K-42", events: [...]}`. → [03](03-back-events.md#events--get-apieventsafterкурсор)
10. `API.listen` передаёт событие в `onServerEvent` → `onNewMessage(5, message)`. → [07](07-front-app.md#onnewmessagechatid-msg)
11. - чат 5 открыт → `loadMessages` перечитывает переписку (с прокруткой вниз, если был внизу) и отмечает прочитанным;
    - другой чат → счётчик непрочитанных +1;
    - чата нет в списке (новая личка) → `reloadChats` перечитывает список.
12. `renderChatList` — превью и счётчик обновляются на глазах.
13. `API.listen` сразу задаёт следующий вопрос `?after=K-42`.

Всё это занимает доли секунды (в проверке — 75–100 мс).

**Если связь пропала:** запрос получателя падает → через 3 секунды новый вопрос с тем же курсором → сервер отдаёт всё, что было после него. **Если сервер перезапускали:** курсор от старого запуска → `resync: true` → `resync()` перечитывает чаты.

## 4. Преподаватель и чат группы

1. Преподаватель входит → `GET /api/data` → в `allData` условие `c.type != 'group' OR :role != 'teacher'` — чатов групп в ответе нет.
2. `renderChatFilters` не рисует кнопку «Группа».
3. Если вручную запросить `GET /api/chats/2/messages` → `findChat` → `canSeeChat` → `false` → `404 «Чат не найден»`. Написать туда — тоже 404.
4. Студент пишет в чат группы → `publish` с фильтром `canSeeChat` → преподавателю событие не уходит.

## 5. Вступление в клуб

1. Клубы → карточка → `renderClubPage` → «Вступить в клуб» → `toggleClub()`.
2. `POST /api/clubs/1/toggle` → `toggleClub` на сервере: не состоит → `INSERT INTO club_members` → ответ `{memberIds: [...]}`.
3. `club.memberIds = result.memberIds` → `renderClubPage` — кнопка становится «Выйти из клуба», в «Участниках» появляется человек.
4. После F5: `allData` снова собирает `memberIds` из `club_members` — вступление сохранилось.

## 6. Новая личка

1. Поиск → «Написать» (`data-write`) → `openDm(userId)`.
2. Чата нет → `POST /api/dm {userId}` → `openDm` на сервере: проверки (не себе, человек есть, разрешил сообщения) → `INSERT INTO chats (type='dm', ownerId, userId)` → чат.
3. Чат добавляется в список, открывается.
4. Первое сообщение → `publish` с фильтром `canSeeChat` (видят только двое) → у собеседника `onNewMessage` не находит чат → `reloadChats` → новый чат появляется в его списке со счётчиком.

## 7. Обновление страницы (F5)

1. `pagehide` → `saveState` кладёт `state` в `sessionStorage`.
2. Страница загружается заново → `theme.js` видит токен → `logged-in`.
3. `start` → `API.me` → `enterApp` → `restoreState` → тот же экран, чат, вкладка.
4. Все данные заново из базы: сообщения, клубы, настройки — всё на месте.

## 8. Блокировка пользователя администратором

1. Админка → «Пользователи» → «Заблокировать» → `confirm` → `API.blockUser(id, true)`.
2. `POST /api/admin/users/{id}/block` → `route` + `adminOnly` → `blockUser`:
   - `UPDATE users SET blocked = 1`;
   - `disconnect(id)` — его ждущий `/api/events` сразу отвечает;
   - удаляются его сессии, жалобы на него, `online = 0`.
3. У заблокированного: следующий запрос `/api/events` → `401` → `API.listen` останавливается; любой другой запрос → 401; после F5 — форма входа, войти нельзя (`login` → 403).

## 9. Выход

«Выйти» → `logout()` → `state.user = null`, стирается сохранённое состояние → `API.logout()` → `POST /api/logout` удаляет сессию, `online = 0` → токен стирается → `location.reload()` → форма входа.

## 10. Смена темы

Кнопка темы → `setTheme('dark')` → `<html data-theme="dark">` (все `var(--…)` из `variables.css` мгновенно меняют значения) → `localStorage` (запомнится навсегда) → при следующем открытии `theme.js` поставит тёмную тему ещё до отрисовки.
