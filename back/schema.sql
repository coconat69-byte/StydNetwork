-- schema.sql — таблицы базы данных СтудСети (SQLite).
--
-- Названия колонок совпадают с полями в js/data.js (lastMessage, userId…),
-- поэтому сервер переносит данные оттуда в базу без ручного сопоставления (см. db.go),
-- а отдаёт браузеру в том же виде, в каком их ждёт сайт.
-- Списки (интересы, реакции) хранятся как JSON-текст — так не нужны лишние таблицы.
--
-- Поменяли что-то здесь — увеличьте schemaVersion в db.go, и база пересоздастся сама.

-- Группы и направления — для фильтров в поиске
CREATE TABLE study_groups (name TEXT PRIMARY KEY);
CREATE TABLE directions   (name TEXT PRIMARY KEY);

-- Пользователи: студенты и преподаватели
CREATE TABLE users (
  id        INTEGER PRIMARY KEY,
  name      TEXT NOT NULL,
  email     TEXT,
  avatar    TEXT,                       -- путь к картинке, например images/IgorAvatar.jpg
  "group"   TEXT,                       -- учебная группа (в кавычках: group — служебное слово SQL)
  direction TEXT,
  course    INTEGER,
  interests TEXT NOT NULL DEFAULT '[]', -- JSON-список: ["Python","Java"]
  online    INTEGER NOT NULL DEFAULT 0, -- 1 = в сети
  role      TEXT NOT NULL,              -- 'student' или 'teacher'
  bio       TEXT,
  isAdmin   INTEGER NOT NULL DEFAULT 0, -- 1 = есть доступ к админ-панели
  blocked   INTEGER NOT NULL DEFAULT 0, -- 1 = заблокирован администратором, войти нельзя

  -- Настройки (переключатели на экране «Настройки»), 1 = включено
  notifyUnread   INTEGER NOT NULL DEFAULT 1, -- показывать счётчики непрочитанных в чатах
  notifyChannels INTEGER NOT NULL DEFAULT 1, -- показывать счётчики в каналах
  notifyMentions INTEGER NOT NULL DEFAULT 1, -- подсвечивать сообщения с моим именем
  compact        INTEGER NOT NULL DEFAULT 0, -- компактный режим
  showOnline     INTEGER NOT NULL DEFAULT 1, -- другие видят, что я в сети
  showGroup      INTEGER NOT NULL DEFAULT 1, -- другие видят мою группу
  allowMessages  INTEGER NOT NULL DEFAULT 1  -- новые люди могут мне написать
);

-- Личные коды доступа: по коду пользователь входит на сайт
CREATE TABLE access_codes (
  code   TEXT PRIMARY KEY,              -- например 123-123-123
  userId INTEGER NOT NULL REFERENCES users(id)
);

-- Сессии: какой токен какому пользователю выдан при входе
CREATE TABLE sessions (
  token  TEXT PRIMARY KEY,
  userId INTEGER NOT NULL REFERENCES users(id)
);

-- Типы чатов: подпись и можно ли писать студентам
CREATE TABLE chat_types (
  type     TEXT PRIMARY KEY,            -- channel, group, direction, course, flood, dm
  label    TEXT NOT NULL,               -- как показывать: «Канал», «Группа»…
  readonly INTEGER NOT NULL DEFAULT 0   -- 1 = писать могут только преподаватели
);

-- Чаты. У личных чатов (dm) нет своего имени и картинки — их берут у собеседника
CREATE TABLE chats (
  id          INTEGER PRIMARY KEY,
  name        TEXT,
  type        TEXT NOT NULL REFERENCES chat_types(type),
  avatar      TEXT,
  icon        TEXT,                     -- эмодзи вместо картинки
  members     INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  lastMessage TEXT,                     -- последнее сообщение (для списка чатов)
  lastTime    TEXT,                     -- его время, например 12:03
  ownerId     INTEGER REFERENCES users(id), -- личный чат: кто начал переписку
  userId      INTEGER REFERENCES users(id)  -- личный чат: с кем
);

-- До какого сообщения человек дочитал каждый чат.
-- Непрочитанные = чужие сообщения в чате с id больше lastReadId
CREATE TABLE chat_reads (
  userId     INTEGER NOT NULL REFERENCES users(id),
  chatId     INTEGER NOT NULL REFERENCES chats(id),
  lastReadId INTEGER NOT NULL DEFAULT 0, -- id последнего прочитанного сообщения
  PRIMARY KEY (userId, chatId)
);

-- Сообщения в чатах
CREATE TABLE messages (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  chatId    INTEGER NOT NULL REFERENCES chats(id),
  userId    INTEGER NOT NULL REFERENCES users(id),
  text      TEXT NOT NULL,
  time      TEXT NOT NULL,              -- время отправки, например 11:45
  reactions TEXT NOT NULL DEFAULT '[]'  -- JSON-список: [{"emoji":"👍","count":3}]
);

-- Клубы по интересам
CREATE TABLE clubs (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  emoji       TEXT,
  description TEXT,
  category    TEXT,
  admin       TEXT                      -- имя руководителя клуба
);

-- Кто в каком клубе состоит
CREATE TABLE club_members (
  clubId INTEGER NOT NULL REFERENCES clubs(id),
  userId INTEGER NOT NULL REFERENCES users(id),
  PRIMARY KEY (clubId, userId)          -- в один клуб дважды не вступить
);

-- Жалобы на пользователей (раздел «Модерация» в админ-панели)
CREATE TABLE reports (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER NOT NULL REFERENCES users(id), -- на кого жалуются
  reason TEXT NOT NULL,                         -- за что
  time   TEXT NOT NULL                          -- когда, например «2 часа назад»
);

-- Сообщения в чатах клубов (у каждого клуба свой чат)
CREATE TABLE club_messages (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  clubId INTEGER NOT NULL REFERENCES clubs(id),
  userId INTEGER NOT NULL REFERENCES users(id),
  text   TEXT NOT NULL,
  time   TEXT NOT NULL
);
