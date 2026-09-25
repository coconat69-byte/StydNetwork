/**
 * API — откуда интерфейс берёт данные.
 *
 * Два режима, выбираются сами:
 *  - сервер запущен (в папке back: go run .) — данные из базы SQLite через запросы /api/...;
 *  - сервера нет — данные из js/data.js (LOCAL ниже), всё работает прямо в браузере.
 *    Отправленные сообщения в этом режиме живут до обновления страницы.
 *
 * Токен входа хранится в sessionStorage: он переживает обновление страницы,
 * но стирается при закрытии вкладки — тогда снова нужно ввести код.
 */

const API = {
  TOKEN_KEY: 'studnet-token',

  // Адрес сервера. Если сайт открыт самим сервером (порт 8080) — хватает '/api'.
  // Иначе (Live Server, двойной щелчок по index.html) идём на сервер напрямую.
  URL: location.port === '8080' ? '/api' : 'http://localhost:8080/api',

  // true — сервер не ответил, дальше сразу работаем с data.js
  offline: false,

  // Запрос к серверу: без body — GET, с body — POST с JSON.
  // Если сервер ответил ошибкой, бросает Error с её текстом (его можно показать пользователю).
  // Если сервер вообще недоступен — Error с пометкой offline.
  async request(path, body) {
    let res, data;
    try {
      res = await fetch(this.URL + path, {
        method: body ? 'POST' : 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + sessionStorage.getItem(this.TOKEN_KEY),
        },
        body: body && JSON.stringify(body),
      });
      data = await res.json();
    } catch {
      throw Object.assign(new Error('Нет связи с сервером'), { offline: true });
    }
    if (!res.ok) throw new Error(data.error);
    return data;
  },

  // Сначала пробуем сервер (fromServer), а если его нет — берём данные из data.js (fromLocal)
  async call(fromServer, fromLocal) {
    if (!this.offline) {
      try {
        return await fromServer();
      } catch (err) {
        if (!err.offline) throw err; // сервер есть, но ответил ошибкой — показываем её
        this.offline = true;
        console.info('Сервер не найден — работаем с данными из data.js');
      }
    }
    return fromLocal();
  },

  // Есть ли сохранённый токен (то есть вход уже был в этой вкладке)
  hasToken() {
    return !!sessionStorage.getItem(this.TOKEN_KEY);
  },

  // Вход по коду: сохраняем токен и возвращаем пользователя
  async login(code) {
    const { token, user } = await this.call(() => this.request('/login', { code }), () => LOCAL.login(code));
    sessionStorage.setItem(this.TOKEN_KEY, token);
    return user;
  },

  // Выход: просим сервер забыть токен (ошибки игнорируем) и стираем его у себя
  async logout() {
    await this.call(() => this.request('/logout', {}), () => {}).catch(() => {});
    sessionStorage.removeItem(this.TOKEN_KEY);
  },

  // Текущий пользователь (проверка, что токен ещё действует)
  me() {
    return this.call(() => this.request('/me'), () => LOCAL.me());
  },

  // Все данные для интерфейса: пользователи, чаты, типы чатов, клубы, группы, направления
  data() {
    return this.call(async () => {
      const d = await this.request('/data');
      // С сервера приходят списки строк таблиц — приводим к тому же виду, что в data.js
      d.chatTypes = Object.fromEntries(d.chatTypes.map(t => [t.type, t]));
      d.groups = d.groups.map(g => g.name);
      d.directions = d.directions.map(g => g.name);
      return d;
    }, () => MOCK_DATA);
  },

  // Сообщения чата
  messages(chatId) {
    return this.call(() => this.request(`/chats/${chatId}/messages`), () => MOCK_DATA.messages[chatId] || []);
  },

  // Отправить сообщение в чат
  sendMessage(chatId, text) {
    return this.call(() => this.request(`/chats/${chatId}/messages`, { text }), () => LOCAL.sendMessage(chatId, text));
  },

  // Сообщения чата клуба (у каждого клуба свой чат)
  clubMessages(clubId) {
    return this.call(() => this.request(`/clubs/${clubId}/messages`), () => MOCK_DATA.clubMessages[clubId] || []);
  },

  // Написать в чат клуба
  sendClubMessage(clubId, text) {
    return this.call(() => this.request(`/clubs/${clubId}/messages`, { text }), () => LOCAL.sendClubMessage(clubId, text));
  },

  // Статистика для админ-панели (только преподаватели)
  adminStats() {
    return this.call(() => this.request('/admin/stats'), () => MOCK_DATA.adminStats);
  },
};

/**
 * LOCAL — то же самое, что делает сервер, но на данных из data.js.
 * Используется, когда сервер не запущен.
 */
const LOCAL = {
  // Вход по коду из MOCK_DATA.accessCodes. Токен вида «local-5», где 5 — id пользователя
  login(code) {
    const user = MOCK_DATA.users.find(u => u.id === MOCK_DATA.accessCodes[code.trim()]);
    if (!user) throw new Error('Неверный код доступа. Обратитесь в IT-отдел колледжа.');
    return { token: 'local-' + user.id, user };
  },

  // Пользователь по сохранённому токену
  me() {
    const token = sessionStorage.getItem(API.TOKEN_KEY) || '';
    const user = token.startsWith('local-') && MOCK_DATA.users.find(u => u.id === +token.slice(6));
    if (!user) throw new Error('Требуется вход');
    return user;
  },

  // Добавить сообщение в чат (в каналы пишут только преподаватели)
  sendMessage(chatId, text) {
    const chat = MOCK_DATA.chats.find(c => c.id === chatId);
    const user = this.me();
    if (MOCK_DATA.chatTypes[chat.type].readonly && user.role !== 'teacher') {
      throw new Error('Этот чат доступен только для чтения');
    }
    const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    (MOCK_DATA.messages[chatId] ||= []).push({ id: Date.now(), userId: user.id, text, time, reactions: [] });
    chat.lastMessage = text;
    chat.lastTime = time;
    return { ok: true };
  },

  // Добавить сообщение в чат клуба
  sendClubMessage(clubId, text) {
    const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    (MOCK_DATA.clubMessages[clubId] ||= []).push({ id: Date.now(), userId: this.me().id, text, time, reactions: [] });
    return { ok: true };
  },
};
