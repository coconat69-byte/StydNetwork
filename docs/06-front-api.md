# 6. `js/api.js` — откуда сайт берёт данные

[← Оглавление](README.md)

В файле два объекта:

- **`API`** — единственная «дверь» между интерфейсом (`app.js`) и данными. У каждого действия свой метод: `API.login(code)`, `API.sendMessage(chatId, text)` и т.д.
- **`LOCAL`** — те же действия, но над данными из `js/data.js` в памяти. Нужен, когда сервер не запущен.

Каждый метод `API` устроен одинаково: «попробуй сервер, а если его нет — `LOCAL`».

Файл написан в «старом» стиле (`var`, `function`), без модулей: он подключается обычным `<script>`, и `API`, `LOCAL`, `findInList` становятся глобальными — их видит `app.js`.

---

## Объект `API`

### Поля

```js
TOKEN_KEY: 'studnet-token',
```
Под каким именем токен лежит в `sessionStorage`. То же имя проверяет `theme.js`.

```js
offline: false,
```
`true` — сервера нет, всё берётся из `data.js` (изменения живут до обновления страницы). Ставится один раз в `call`.

```js
connected: false,
```
`true` — сервер уже хоть раз ответил в этой вкладке. После этого режим без сервера **не включается** (см. `call`).

```js
URL: null,
serverSearch: null,
```
`URL` — адрес API, например `http://192.168.1.5:8080/api`. Его находит `findServer` при первом запросе. `serverSearch` — сам поиск (Promise): если первые запросы пришли одновременно, все ждут один и тот же поиск, а не запускают свой.

### `now()`
```js
return new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
```
Текущее время как `12:05` — для превью и сообщений без сервера.

### `serverCandidates()`
Где может быть сервер, по порядку:
```js
var list = [];
if (location.protocol === 'http:' || location.protocol === 'https:') {
  list.push(location.origin + '/api');
  list.push(location.protocol + '//' + location.hostname + ':8080/api');
}
list.push('http://localhost:8080/api');
return list.filter(function (url, i) { return list.indexOf(url) === i; });
```
1. `location.origin + '/api'` — **там же, откуда открыта страница.** Если страницу отдал сам сервер (`localhost:8080`, `192.168.1.5:8080` с телефона, туннель) — API там же.
2. `тот же хост, порт 8080` — страница открыта через Live Server (`192.168.1.5:5500`): сервер на том же компьютере, но на порту 8080. Это и есть случай «открыл с телефона».
3. `http://localhost:8080/api` — `index.html` открыт двойным щелчком (`file://`), у страницы нет адреса.
4. `filter` убирает повторы (например, если страница и так на `:8080`).

> Раньше всегда брался `localhost:8080`. Но на телефоне `localhost` — это сам телефон, сервер не находился, и сайт молча переходил в режим без сервера: сообщения пропадали после обновления.

### `findServer()`
```js
for (i = 0; i < list.length; i++) {
  try {
    var res = await fetch(list[i] + '/me');
    var type = res.headers.get('Content-Type') || '';
    if (type.indexOf('application/json') === 0) {
      return list[i];
    }
  } catch (e) { }
}
return null;
```
По очереди спрашивает `GET <адрес>/me`. **Наш** сервер всегда отвечает JSON-ом (без входа — `401 {"error":"Требуется вход"}`), а Live Server и прочие на неизвестный адрес отвечают HTML-страницей «404». Так отличаем свой сервер от чужого. Нет ответа (`catch`) — пробуем следующий адрес. Ничего не нашли → `null`.

### `request(path, body)` — один запрос к серверу
```js
if (!this.URL) {
  this.serverSearch = this.serverSearch || this.findServer();
  this.URL = await this.serverSearch;
}
if (!this.URL) {
  var notFound = new Error('Нет связи с сервером');
  notFound.offline = true;
  throw notFound;
}
```
1. Адрес ещё не известен → ищем сервер (один раз на всю вкладку).
2. Не нашли → ошибка с пометкой `offline` (по ней `call` переключится на `LOCAL`).

```js
res = await fetch(this.URL + path, {
  method: body ? 'POST' : 'GET',
  headers: {
    'Content-Type': 'application/json',
    Authorization: 'Bearer ' + (sessionStorage.getItem(this.TOKEN_KEY) || ''),
  },
  body: body ? JSON.stringify(body) : undefined,
});
```
3. Есть `body` → POST, нет → GET. Тело превращаем в JSON (`JSON.stringify`) — кавычки и спецсимволы в тексте сообщения не сломают запрос. К каждому запросу прикладываем токен.
4. `fetch` выбросил ошибку (сервер вообще не ответил) → ошибка `offline`.

```js
this.connected = true;
```
5. Сервер ответил — запоминаем: «сервер есть».

```js
try { data = await res.json(); } catch (e) { data = {}; }
if (!res.ok) {
  throw new Error(data.error || 'Ошибка сервера (код ' + res.status + ')');
}
return data;
```
6. Читаем JSON. Не JSON (например, HTML-страница 404) — пустой объект.
7. Код ответа не 2xx → обычная ошибка с текстом от сервера («Неверный код доступа», «Пустое сообщение»…). Её `app.js` покажет в `alert`. Это **не** режим без сервера: сервер есть, просто ответил ошибкой.
8. Иначе возвращаем данные.

### `call(fromServer, fromLocal)` — «сервер, а если его нет — data.js»
```js
if (!this.offline) {
  try {
    return await fromServer();
  } catch (err) {
    if (!err.offline || this.connected) {
      throw err;
    }
    this.offline = true;
    console.info('Сервер не найден — работаем с data.js');
  }
}
return fromLocal();
```
1. Пока не в режиме без сервера — пробуем сервер.
2. Ошибка **от сервера** (`!err.offline`) → пробрасываем дальше, её покажут человеку.
3. Сервер **пропал, но раньше отвечал** (`this.connected`) → тоже пробрасываем («Нет связи с сервером»). Иначе сообщение «отправилось» бы только на экране и исчезло после обновления страницы.
4. Сервера не было с самого начала → включаем режим без сервера навсегда (до обновления страницы).
5. Выполняем локальный вариант.

### `hasToken()`
Есть ли токен в этой вкладке (`!!` превращает строку в `true/false`).

### Методы-действия

Все устроены одинаково: `return this.call(сСервера, безСервера)`.

| Метод | Сервер | Без сервера |
|---|---|---|
| `login(code)` | `POST /login {code}` | `LOCAL.login(code)` |
| `logout()` | `POST /logout` | `LOCAL.logout()` |
| `me()` | `GET /me` | `LOCAL.me()` |
| `updateMe(fields)` | `POST /me` | `LOCAL.updateMe` |
| `saveSetting(key, value)` | `POST /settings` | `LOCAL.saveSetting` |
| `data()` | `GET /data` | `LOCAL.data()` |
| `messages(chatId)` | `GET /chats/{id}/messages` | `MOCK_DATA.messages[chatId]` |
| `markRead(chatId)` | `POST /chats/{id}/read` | `LOCAL.markRead` |
| `sendMessage(chatId, text)` | `POST /chats/{id}/messages` | `LOCAL.sendMessage` |
| `openDm(userId)` | `POST /dm` | `LOCAL.openDm` |
| `toggleClub(clubId)` | `POST /clubs/{id}/toggle` | `LOCAL.toggleClub` |
| `clubMessages(clubId)` | `GET /clubs/{id}/messages` | `MOCK_DATA.clubMessages[clubId]` |
| `sendClubMessage(clubId, text)` | `POST /clubs/{id}/messages` | `LOCAL.sendClubMessage` |
| `adminStats()` | `GET /admin/stats` | `LOCAL.adminStats` |
| `createChannel(fields)` | `POST /admin/channels` | `LOCAL.createChannel` |
| `updateChannel(chatId, fields)` | `POST /admin/channels/{id}` | `LOCAL.updateChannel` |
| `reports()` | `GET /admin/reports` | копия `MOCK_DATA.reports`, новые сверху |
| `dismissReport(id)` | `POST /admin/reports/{id}/dismiss` | `LOCAL.dismissReport` |
| `blockUser(userId, blocked)` | `POST /admin/users/{id}/block` | `LOCAL.blockUser` |

Особенности:
- **`login`** после успеха кладёт `result.token` в `sessionStorage` и возвращает только пользователя.
- **`logout`** ошибки игнорирует (при выходе они не важны) и в любом случае стирает токен.
- Внутри функций используется `API.request`, а не `this.request`: функция передаётся в `call` и вызывается там без привязки к объекту, поэтому `this` внутри неё был бы другим.

### `listen(onEvent)` — мгновенные сообщения

Бесконечный цикл «долгого опроса» (как это устроено на сервере — [03-back-events.md](03-back-events.md)).

```js
var after = null;
while (!this.offline && this.hasToken()) {
```
`after` — курсор: до какого события уже всё получили. `null` — ещё не спрашивали. Цикл идёт, пока есть сервер и вход.

```js
res = await fetch(this.URL + '/events' + (after === null ? '' : '?after=' + encodeURIComponent(after)), {
  headers: { Authorization: 'Bearer ' + sessionStorage.getItem(this.TOKEN_KEY) },
  cache: 'no-store',
});
```
Спрашиваем «что нового после `after`?». `encodeURIComponent` — безопасно вставить курсор в адрес. `cache: 'no-store'` — не брать ответ из кэша браузера. Этот `await` может длиться до 25 секунд — сервер отвечает, когда появится событие.

| Ответ | Что делаем |
|---|---|
| нет связи (`fetch` выбросил ошибку) | ждём 3 секунды и пробуем снова (с тем же курсором — пропущенное придёт) |
| `401` | вход больше не действует (вышли, заблокировали) → выходим из цикла |
| `404` | сервер старый, `/api/events` у него нет → `onEvent({type: 'resync'})` (перечитать чаты) и через 3 секунды снова. Получается обновление раз в 3 секунды |
| другая ошибка или не JSON | ждём 3 секунды и снова |
| `200 {cursor, events, resync}` | см. ниже |

```js
if (data.resync && after !== null) {
  onEvent({ type: 'resync' });
}
after = data.cursor;
(data.events || []).forEach(function (event) {
  try { onEvent(event); } catch (e) { console.error(e); }
});
```
- `resync` (сервер перезапускали или вкладка сильно отстала) → просим интерфейс перечитать всё. На самый первый ответ (`after === null`) не реагируем: данные только что загружены.
- Запоминаем новый курсор.
- Каждое событие передаём в `onEvent` (это `onServerEvent` из `app.js`). `try/catch` — ошибка в одном событии не должна остановить приём остальных.
- И сразу — на следующий круг цикла, новый вопрос.

Без сервера (`offline`) цикл не запускается: других людей нет, слушать некого.

### `sleep(ms)`
```js
return new Promise(function (resolve) { setTimeout(resolve, ms); });
```
«Подождать»: `await API.sleep(3000)` — пауза 3 секунды, не блокируя страницу.

---

## Объект `LOCAL` — то же самое без сервера

Работает напрямую с `MOCK_DATA` из `data.js`. Изменения живут, пока открыта страница.

### `login(code)`
1. Убирает пробелы.
2. Ищет код в `MOCK_DATA.accessCodes` через `Object.prototype.hasOwnProperty.call` — чтобы код вроде `"constructor"` не нашёл встроенное свойство объекта.
3. Нет кода или пользователя → ошибка «Неверный код доступа». Заблокирован → «Аккаунт заблокирован».
4. Ставит `online = true` и возвращает `{token: 'local-<id>', user}` — «токен» без сервера просто содержит id.

### `logout()`
Ставит себе `online = false`.

### `me()`
Берёт токен из `sessionStorage`. Если он не начинается с `local-` (например, остался серверный) — «Требуется вход». Иначе `Number(token.slice(6))` — id после `local-`, находит пользователя, проверяет, что не заблокирован.

### `updateMe(fields)`
Проверяет имя (не пустое) и записывает имя, почту, «о себе» и интересы прямо в объект пользователя.

### `saveSetting(key, value)`
Менять можно только настройки из списка `allowed` — как на сервере. Иначе можно было бы «сохранить настройку» `isAdmin`.

### `reads`
Словарь `"<мой id>:<id чата>" → id последнего прочитанного сообщения` — аналог таблицы `chat_reads`.

### `data()` — аналог `GET /api/data`
1. **Чаты:** пропускает чужие личные (`dm`, где я не `ownerId` и не `userId`) и — если я преподаватель — чаты групп (`group`). Те же правила, что `canSeeChat` на сервере.
2. **Непрочитанные:** для каждого чата считает чужие сообщения с `id` больше `reads[...]`.
3. **Пользователи:** себя — как есть; чужих копирует (`Object.assign({}, u)`, чтобы не испортить оригинал) и прячет `online`/`group`, если человек это скрыл.
4. Возвращает `Object.assign({}, MOCK_DATA, {users, chats})` — все данные, но с отфильтрованными пользователями и чатами.

### `markRead(chatId)`
Находит самый большой `id` сообщения в чате и запоминает его в `reads`.

### `sendMessage(chatId, text)`
Проверяет `readonly` (каналы — только преподавателям), создаёт список сообщений чата, если его не было, и добавляет сообщение с `id: Date.now()` (миллисекунды — уникально) и временем `API.now()`.

### `openDm(userId)`
Ищет личный чат со мной и этим человеком (кто бы его ни начал). Нет, а человек запретил сообщения → ошибка. Нет → создаёт новый чат `type: 'dm'` и добавляет в `MOCK_DATA.chats`.

### `toggleClub(clubId)`
Есть я в `memberIds` → `splice` (удалить), нет → `push` (добавить). Возвращает `{memberIds}`.

### `sendClubMessage(clubId, text)`
Только участникам клуба; добавляет сообщение в `MOCK_DATA.clubMessages[clubId]`.

### `adminStats()`
Считает пользователей, онлайн, чаты и жалобы.

### `createChannel(fields)` / `updateChannel(chatId, fields)`
Проверяют название и создают/меняют объект канала в `MOCK_DATA.chats`.

### `dismissReport(reportId)`
Оставляет все жалобы, кроме этой.

### `blockUser(userId, blocked)`
Администратора нельзя. Ставит `blocked`; при блокировке — `online = false` и удаляет жалобы на этого человека.

---

## `findInList(list, id)`
Обычный цикл: возвращает объект из массива по `id` или `null`. Используется в `LOCAL`.
