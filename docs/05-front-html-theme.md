# 5. `index.html` и `js/theme.js` — страница и первый скрипт

[← Оглавление](README.md)

Сайт — **одна страница**. Все экраны (вход, чаты, поиск, клубы, профиль, настройки, админка) уже лежат в `index.html`, а `app.js` только показывает нужный и заполняет его данными. Переходов между страницами нет — поэтому всё работает быстро и без перезагрузки.

---

## `index.html`

### `<head>`

```html
<meta charset="UTF-8">
```
Кодировка — UTF-8, иначе русские буквы превратятся в «кракозябры».

```html
<meta name="viewport" content="width=device-width, initial-scale=1">
```
**Важно для телефона.** Говорит мобильному браузеру: «ширина страницы = ширина экрана, масштаб 1». Без этой строки телефон рисовал бы страницу шириной ~1000 px и уменьшал её, и мобильные стили из `@media` никогда бы не включились.

```html
<title>СтудСеть — соцсеть колледжа</title>
<link rel="icon" href="images/StydNetwork.ico">
```
Заголовок вкладки и иконка.

```html
<script src="js/theme.js"></script>
```
**Самый первый скрипт — до стилей.** Ставит тему и класс `logged-in`, пока страница ещё не нарисована (см. ниже `theme.js`). Если бы он стоял в конце, при обновлении страницы на долю секунды мелькала бы светлая тема и форма входа.

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
```
Шрифт Inter от Google. `preconnect` заранее открывает соединение с серверами шрифтов (быстрее загрузка). `display=swap` — пока шрифт грузится, текст показывается системным шрифтом, а не пропадает.

```html
<link rel="stylesheet" href="css/variables.css">
<link rel="stylesheet" href="css/base.css">
<link rel="stylesheet" href="css/components.css">
<link rel="stylesheet" href="css/screens.css">
```
Стили в порядке «от общего к частному»: переменные → основа → элементы → экраны. Более поздний файл может переопределить более ранний.

### `<body>` — общая структура

```
div.app
├── section#screen-auth          экран входа (виден, пока не вошли)
│   ├── aside.auth-brand         синяя половина: логотип и описание
│   └── form#form-login          форма: поле кода и кнопка «Войти»
├── div.app-shell                приложение (видно после входа)
│   ├── header.topbar            шапка
│   ├── div#offline-banner       плашка «Сервер не найден» (обычно скрыта)
│   └── main
│       ├── section#screen-main      чаты
│       ├── section#screen-profile   профиль
│       ├── section#screen-search    поиск людей
│       ├── section#screen-clubs     клубы
│       ├── section#screen-settings  настройки
│       └── section#screen-admin     админ-панель
└── footer.site-footer           футер (дисклеймер и авторы)
```
Что из этого видно — решает CSS (`base.css`): без класса `logged-in` на `<html>` виден экран входа, с ним — `app-shell`. Внутри `main` виден только экран с классом `is-active` (его ставит `navigate` в `app.js`).

### Экран входа `#screen-auth`
```html
<input type="text" id="login-code" placeholder="XXX-XXX-XXX" autocomplete="off"
       inputmode="numeric" maxlength="11" required pattern="\d{3}-\d{3}-\d{3}">
```
| Атрибут | Зачем |
|---|---|
| `inputmode="numeric"` | на телефоне открывается цифровая клавиатура |
| `maxlength="11"` | 9 цифр + 2 дефиса |
| `required` | пустую форму браузер не отправит |
| `pattern="\d{3}-\d{3}-\d{3}"` | браузер проверит формат `123-456-789` перед отправкой |
| `autocomplete="off"` | браузер не будет подсказывать старые коды |

Дефисы ставит сама функция `formatCode` в `app.js` при вводе.

### Шапка `.topbar`
| Элемент | Что делает |
|---|---|
| `button.logo[data-nav="main"]` | логотип; клик — к чатам |
| `nav.topnav` → `button[data-nav="main/search/clubs"]` | разделы. На телефоне это меню уезжает вниз экрана (`screens.css`) |
| `#global-search` | строка поиска людей по имени; ввод открывает экран поиска |
| `#theme-toggle` | смена темы. Внутри две иконки — солнце и луна; CSS показывает одну из них в зависимости от темы |
| `#my-avatar` в `button[data-nav="profile"]` | моя аватарка → мой профиль |
| `button[data-nav="settings"]` | настройки |
| `#admin-link` (`hidden`) | кнопка «Админ». `app.js` показывает её только администратору |

Атрибут `data-nav="..."` — общий для всех кнопок перехода: один обработчик в `bindEvents` (`onClick(document, 'nav', ...)`) ловит клик по любой из них.

### Плашка `#offline-banner`
Изначально `hidden`. `enterApp` показывает её, если сайт работает **без сервера** (`API.offline`): предупреждает, что изменения пропадут после обновления страницы.

### Экран чатов `#screen-main`
```
div.chat-layout                      сетка из трёх колонок
├── aside.chat-sidebar               левая: «Чаты», фильтры, список
│   ├── div#chat-filters             кнопки «Все / Канал / Группа…» (рисует renderChatFilters)
│   └── div#chat-list                список чатов (рисует renderChatList)
├── div.chat-main                    центральная: переписка
│   ├── header.chat-header
│   │   ├── button#chat-back         «‹ к списку» — только на телефоне
│   │   └── div.chat-header__text → h2#chat-title, span#chat-meta
│   ├── div#chat-messages            лента сообщений (рисует loadMessages)
│   └── footer.chat-input
│       ├── div#chat-readonly        «Канал — только чтение» (вместо поля ввода)
│       └── form#chat-form → input#message-input, button «Отправить»
└── aside#chat-info                  правая: описание чата и участники (renderChatInfo)
```
`maxlength="2000"` у поля сообщения — как `maxMessageLen` на сервере.

### Остальные экраны
- `#screen-profile` → `div#profile` — целиком рисует `renderProfile`.
- `#screen-search` → фильтры (`#filter-group`, `#filter-direction`, `#filter-course`, `#filter-online`, кнопка `#reset-filters`) и `#user-cards` (карточки, `renderSearch`), счётчик `#search-count`. Варианты групп и направлений добавляет `enterApp`.
- `#screen-clubs` → `#clubs-catalog` (вкладки «Все / Мои» `#clubs-tabs` и карточки `#club-cards`) или `#club-page` (страница одного клуба). Рисует `renderClubs`.
- `#screen-settings` → меню `#settings-nav` (кнопки `data-settings="..."` и «Выйти» `#logout`) и `#settings-content` (`renderSettings`).
- `#screen-admin` → меню `#admin-nav` (`data-admin="..."`) и `#admin-content` (`renderAdmin`).

### Футер `.site-footer`
Текст-дисклеймер и авторы. Стоит **ниже** приложения: экран занимает ровно высоту окна, поэтому футер видно, только если прокрутить страницу вниз.

### Подключение скриптов (в самом конце)
```html
<script src="js/data.js"></script>
<script src="js/api.js"></script>
<script src="js/app.js"></script>
```
Порядок важен: `api.js` использует `MOCK_DATA` из `data.js`, а `app.js` — объект `API` из `api.js`. Скрипты в конце `<body>` выполняются, когда вся разметка выше уже есть.

> **Нет ни одного встроенного скрипта и `onclick="..."`** — этого требует `Content-Security-Policy` (см. [01-back-main.md](01-back-main.md#константа-contentsecuritypolicy)). Все обработчики вешает `app.js`.

---

## `js/theme.js`

```js
document.documentElement.dataset.theme = localStorage.getItem('studnet-theme') || 'light';
```
- `document.documentElement` — тег `<html>`.
- `dataset.theme = ...` — ставит атрибут `data-theme="light"` или `"dark"`. По нему `variables.css` выбирает цвета.
- Тема берётся из `localStorage` (её туда кладёт `setTheme` в `app.js`); если там пусто — светлая.

```js
if (sessionStorage.getItem('studnet-token')) {
  document.documentElement.classList.add('logged-in');
}
```
Если в этой вкладке уже входили (есть токен) — сразу ставим класс `logged-in`, и CSS покажет приложение, а не форму входа. Проверять, живой ли токен, будет уже `app.js`; если нет — уберёт класс обратно.

**Почему отдельный файл, а не `<script>` в `index.html`:** сервер запрещает встроенные скрипты (CSP) — это защита от XSS.
