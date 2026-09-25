/**
 * api.js — откуда сайт берёт данные.
 *
 * Два режима, выбираются сами:
 *  - сервер запущен (в папке back: go run .) — данные из базы через запросы /api/...;
 *  - сервера нет — данные из js/data.js (объект LOCAL ниже), всё работает прямо в браузере.
 *    Всё, что изменили в этом режиме (сообщения, клубы), живёт до обновления страницы.
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

  // Текущее время в виде «12:05» — так показывается время у сообщений
  now() {
    return new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  },

  // Запрос к серверу: без body — GET, с body — POST с JSON.
  // Сервер ответил ошибкой — бросаем её текст (его покажем пользователю).
  // Сервер вообще недоступен — бросаем ошибку с пометкой offline.
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

  // ── Вход и выход ──────────────────────────────────────

  // Входили ли уже в этой вкладке (есть сохранённый токен)
  hasToken() {
    return !!sessionStorage.getItem(this.TOKEN_KEY);
  },

  // Вход по коду: сохраняем токен и возвращаем пользователя
  async login(code) {
    const { token, user } = await this.call(() => this.request('/login', { code }), () => LOCAL.login(code));
    sessionStorage.setItem(this.TOKEN_KEY, token);
    return user;
  },

  // Выход: просим сервер забыть токен (ошибки не важны) и стираем его у себя
  async logout() {
    await this.call(() => this.request('/logout', {}), () => LOCAL.logout()).catch(() => {});
    sessionStorage.removeItem(this.TOKEN_KEY);
  },

  // Кто вошёл (заодно проверка, что токен ещё действует)
  me() {
    return this.call(() => this.request('/me'), () => LOCAL.me());
  },

  // Сохранить свой профиль: {name, email, bio, interests}. Возвращает обновлённого пользователя
  updateMe(fields) {
    return this.call(() => this.request('/me', fields), () => LOCAL.updateMe(fields));
  },

  // Включить или выключить одну настройку (key — её название, value — true/false)
  saveSetting(key, value) {
    return this.call(() => this.request('/settings', { key, value }), () => LOCAL.saveSetting(key, value));
  },

  // ── Данные ────────────────────────────────────────────

  // Всё для интерфейса: пользователи, чаты, клубы, типы чатов, группы, направления
  data() {
    return this.call(() => this.request('/data'), () => LOCAL.data());
  },

  // Сообщения чата
  messages(chatId) {
    return this.call(() => this.request(`/chats/${chatId}/messages`), () => MOCK_DATA.messages[chatId] || []);
  },

  // Отметить чат прочитанным (вызывается при открытии чата)
  markRead(chatId) {
    return this.call(() => this.request(`/chats/${chatId}/read`, {}), () => LOCAL.markRead(chatId));
  },

  // Отправить сообщение в чат
  sendMessage(chatId, text) {
    return this.call(() => this.request(`/chats/${chatId}/messages`, { text }), () => LOCAL.sendMessage(chatId, text));
  },

  // Личный чат с пользователем (если его ещё нет — создастся)
  openDm(userId) {
    return this.call(() => this.request('/dm', { userId }), () => LOCAL.openDm(userId));
  },

  // Вступить в клуб или выйти из него. Возвращает {memberIds} — новый список участников
  toggleClub(clubId) {
    return this.call(() => this.request(`/clubs/${clubId}/toggle`, {}), () => LOCAL.toggleClub(clubId));
  },

  // Сообщения чата клуба
  clubMessages(clubId) {
    return this.call(() => this.request(`/clubs/${clubId}/messages`), () => MOCK_DATA.clubMessages[clubId] || []);
  },

  // Написать в чат клуба
  sendClubMessage(clubId, text) {
    return this.call(() => this.request(`/clubs/${clubId}/messages`, { text }), () => LOCAL.sendClubMessage(clubId, text));
  },

  // ── Админ-панель (только администратор) ──────────────

  // Цифры для вкладки «Обзор»
  adminStats() {
    return this.call(() => this.request('/admin/stats'), () => LOCAL.adminStats());
  },

  // Создать канал: {name, description}. Возвращает новый канал
  createChannel(fields) {
    return this.call(() => this.request('/admin/channels', fields), () => LOCAL.createChannel(fields));
  },

  // Изменить канал: {name, description}. Возвращает обновлённый канал
  updateChannel(chatId, fields) {
    return this.call(() => this.request(`/admin/channels/${chatId}`, fields), () => LOCAL.updateChannel(chatId, fields));
  },

  // Жалобы на пользователей
  reports() {
    return this.call(() => this.request('/admin/reports'), () => [...MOCK_DATA.reports].sort((a, b) => b.id - a.id));
  },

  // Отклонить жалобу
  dismissReport(reportId) {
    return this.call(() => this.request(`/admin/reports/${reportId}/dismiss`, {}), () => LOCAL.dismissReport(reportId));
  },

  // Заблокировать (blocked = true) или разблокировать пользователя
  blockUser(userId, blocked) {
    return this.call(() => this.request(`/admin/users/${userId}/block`, { blocked }), () => LOCAL.blockUser(userId, blocked));
  },
};

/**
 * LOCAL — то же самое, что делает сервер, но на данных из data.js.
 * Используется, когда сервер не запущен.
 */
const LOCAL = {
  // Вход по коду из accessCodes. Токен вида «local-5», где 5 — id пользователя
  login(code) {
    const user = MOCK_DATA.users.find(u => u.id === MOCK_DATA.accessCodes[code.trim()]);
    if (!user) throw new Error('Неверный код доступа. Обратитесь в IT-отдел колледжа.');
    if (user.blocked) throw new Error('Аккаунт заблокирован администратором.');
    user.online = true; // вошёл — значит «в сети»
    return { token: 'local-' + user.id, user };
  },

  // Выход — больше не «в сети»
  logout() {
    this.me().online = false;
  },

  // Кто вошёл — по сохранённому токену
  me() {
    const token = sessionStorage.getItem(API.TOKEN_KEY) || '';
    const user = token.startsWith('local-') && MOCK_DATA.users.find(u => u.id === +token.slice(6));
    if (!user || user.blocked) throw new Error('Требуется вход');
    user.online = true;
    return user;
  },

  // Сохранить свой профиль
  updateMe({ name, email, bio, interests }) {
    if (!name.trim()) throw new Error('Имя не может быть пустым');
    return Object.assign(this.me(), { name: name.trim(), email: email.trim(), bio: bio.trim(), interests });
  },

  // Включить или выключить настройку
  saveSetting(key, value) {
    this.me()[key] = value;
    return { ok: true };
  },

  // До какого сообщения дочитан каждый чат: {'<id человека>:<id чата>': id сообщения}
  reads: {},

  // Все данные, но личные чаты — только свои (как делает сервер).
  // unread — сколько в чате чужих сообщений после последнего прочитанного
  data() {
    const me = this.me().id;
    const chats = MOCK_DATA.chats.filter(c => c.type !== 'dm' || c.ownerId === me || c.userId === me);
    for (const chat of chats) {
      const lastRead = this.reads[`${me}:${chat.id}`] || 0;
      chat.unread = (MOCK_DATA.messages[chat.id] || []).filter(m => m.userId !== me && m.id > lastRead).length;
    }
    // Приватность (как на сервере): другим не показываем то, что человек скрыл.
    // Делаем копии, чтобы не испортить исходные данные
    const users = MOCK_DATA.users.map(u => u.id === me ? u : {
      ...u,
      online: u.showOnline === false ? false : u.online,
      group: u.showGroup === false ? '' : u.group,
    });
    return { ...MOCK_DATA, users, chats };
  },

  // Чат открыт — запоминаем его последнее сообщение как прочитанное
  markRead(chatId) {
    const ids = (MOCK_DATA.messages[chatId] || []).map(m => m.id);
    this.reads[`${this.me().id}:${chatId}`] = Math.max(0, ...ids);
    return { ok: true };
  },

  // Добавить сообщение в чат (в каналы пишут только преподаватели)
  sendMessage(chatId, text) {
    const chat = MOCK_DATA.chats.find(c => c.id === chatId);
    const user = this.me();
    if (MOCK_DATA.chatTypes[chat.type].readonly && user.role !== 'teacher') {
      throw new Error('Этот чат доступен только для чтения');
    }
    (MOCK_DATA.messages[chatId] ||= []).push({ id: Date.now(), userId: user.id, text, time: API.now(), reactions: [] });
    return { ok: true };
  },

  // Найти личный чат с пользователем или создать новый
  openDm(userId) {
    const me = this.me().id;
    let chat = MOCK_DATA.chats.find(c => c.type === 'dm' &&
      ((c.ownerId === me && c.userId === userId) || (c.ownerId === userId && c.userId === me)));
    if (!chat && MOCK_DATA.users.find(u => u.id === userId).allowMessages === false) {
      throw new Error('Пользователь ограничил личные сообщения');
    }
    if (!chat) {
      chat = { id: Date.now(), type: 'dm', ownerId: me, userId, members: 2, description: 'Личная переписка', unread: 0, lastMessage: '', lastTime: '' };
      MOCK_DATA.chats.push(chat);
    }
    return chat;
  },

  // Вступить в клуб или выйти из него
  toggleClub(clubId) {
    const club = MOCK_DATA.clubs.find(c => c.id === clubId);
    const me = this.me().id;
    club.memberIds = club.memberIds.includes(me) ? club.memberIds.filter(id => id !== me) : [...club.memberIds, me];
    return { memberIds: club.memberIds };
  },

  // Добавить сообщение в чат клуба (только участникам)
  sendClubMessage(clubId, text) {
    const user = this.me();
    if (!MOCK_DATA.clubs.find(c => c.id === clubId).memberIds.includes(user.id)) {
      throw new Error('Сначала вступите в клуб');
    }
    (MOCK_DATA.clubMessages[clubId] ||= []).push({ id: Date.now(), userId: user.id, text, time: API.now(), reactions: [] });
    return { ok: true };
  },

  // Цифры для вкладки «Обзор» — считаем по данным
  adminStats() {
    return {
      totalUsers: MOCK_DATA.users.length,
      onlineNow: MOCK_DATA.users.filter(u => u.online).length,
      activeChats: MOCK_DATA.chats.length,
      pendingReports: MOCK_DATA.reports.length,
    };
  },

  // Создать канал
  createChannel({ name, description }) {
    if (!name.trim()) throw new Error('Введите название канала');
    const chat = { id: Date.now(), name: name.trim(), type: 'channel', icon: '📢', members: 0, description: description.trim(), unread: 0, lastMessage: '', lastTime: '' };
    MOCK_DATA.chats.push(chat);
    return chat;
  },

  // Изменить канал
  updateChannel(chatId, { name, description }) {
    if (!name.trim()) throw new Error('Введите название канала');
    return Object.assign(MOCK_DATA.chats.find(c => c.id === chatId), { name: name.trim(), description: description.trim() });
  },

  // Отклонить жалобу — убрать её из списка
  dismissReport(reportId) {
    MOCK_DATA.reports = MOCK_DATA.reports.filter(r => r.id !== reportId);
    return { ok: true };
  },

  // Заблокировать или разблокировать. Жалобы на заблокированного считаются решёнными
  blockUser(userId, blocked) {
    const user = MOCK_DATA.users.find(u => u.id === userId);
    if (user.isAdmin) throw new Error('Администратора заблокировать нельзя');
    user.blocked = blocked;
    if (blocked) {
      user.online = false;
      MOCK_DATA.reports = MOCK_DATA.reports.filter(r => r.userId !== userId);
    }
    return { ok: true };
  },
};
