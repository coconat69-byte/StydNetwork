-- Схема базы данных СтудСети (SQLite).
-- Выполняется один раз, когда файл базы создаётся впервые (см. db.go).
-- Списки (интересы, реакции) хранятся как JSON-текст — так не нужны лишние таблицы.

-- Группы и направления — справочники для фильтров в поиске
CREATE TABLE study_groups (name TEXT PRIMARY KEY);
CREATE TABLE directions   (name TEXT PRIMARY KEY);

-- Пользователи: студенты и преподаватели
CREATE TABLE users (
  id         INTEGER PRIMARY KEY,
  code       TEXT UNIQUE,              -- личный код доступа для входа (например 123-123-123)
  name       TEXT NOT NULL,
  email      TEXT,
  avatar     TEXT,                     -- путь к картинке, например images/IgorAvatar.jpg
  group_name TEXT,                     -- учебная группа ("group" — зарезервированное слово в SQL)
  direction  TEXT,
  course     INTEGER,
  interests  TEXT NOT NULL DEFAULT '[]', -- JSON-список: ["Python","Java"]
  online     INTEGER NOT NULL DEFAULT 0, -- 1 = в сети
  role       TEXT NOT NULL,            -- 'student' или 'teacher'
  bio        TEXT
);

-- Сессии: какой токен какому пользователю выдан при входе
CREATE TABLE sessions (
  token   TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id)
);

-- Типы чатов: подпись и можно ли писать студентам
CREATE TABLE chat_types (
  type     TEXT PRIMARY KEY,           -- channel, group, direction, course, flood, dm
  label    TEXT NOT NULL,              -- как показывать в интерфейсе: «Канал», «Группа»…
  readonly INTEGER NOT NULL DEFAULT 0  -- 1 = писать могут только преподаватели
);

-- Чаты
CREATE TABLE chats (
  id           INTEGER PRIMARY KEY,
  name         TEXT NOT NULL,
  type         TEXT NOT NULL REFERENCES chat_types(type),
  avatar       TEXT,                   -- картинка (у личных чатов)
  icon         TEXT,                   -- эмодзи вместо картинки
  members      INTEGER NOT NULL DEFAULT 0,
  description  TEXT,
  unread       INTEGER NOT NULL DEFAULT 0,
  last_message TEXT,                   -- текст последнего сообщения (для списка чатов)
  last_time    TEXT,                   -- время последнего сообщения, например 12:03
  user_id      INTEGER REFERENCES users(id) -- собеседник (только у личных чатов)
);

-- Сообщения в чатах
CREATE TABLE messages (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id   INTEGER NOT NULL REFERENCES chats(id),
  user_id   INTEGER NOT NULL REFERENCES users(id),
  text      TEXT NOT NULL,
  time      TEXT NOT NULL,             -- время отправки, например 11:45
  reactions TEXT NOT NULL DEFAULT '[]' -- JSON-список: [{"emoji":"👍","count":3}]
);

-- Клубы по интересам
CREATE TABLE clubs (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  emoji       TEXT,
  description TEXT,
  members     INTEGER NOT NULL DEFAULT 0,
  category    TEXT,
  joined      INTEGER NOT NULL DEFAULT 0, -- 1 = пользователь состоит в клубе
  admin       TEXT,                       -- имя руководителя клуба
  member_ids  TEXT NOT NULL DEFAULT '[]'  -- JSON-список id участников: [13, 2, 16]
);

-- Сообщения в чатах клубов (у каждого клуба свой чат)
CREATE TABLE club_messages (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  club_id INTEGER NOT NULL REFERENCES clubs(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  text    TEXT NOT NULL,
  time    TEXT NOT NULL                 -- время отправки, например 11:45
);
