/**
 * API — слой подключения к базе данных
 * =====================================
 * Сейчас используются mock-данные из data.js.
 * Для подключения реальной БД замените методы ниже на fetch() к вашему backend.
 *
 * Пример подключения (PHP + MySQL):
 *   const res = await fetch('/api/users.php');
 *   return res.json();
 *
 * Пример подключения (Node.js + SQLite):
 *   const res = await fetch('http://localhost:3000/api/users');
 *   return res.json();
 */

const API = {
  /** Базовый URL вашего API — измените при деплое */
  baseUrl: '/api',

  /**
   * Универсальный запрос к серверу
   * @param {string} endpoint — путь, напр. '/users'
   * @param {object} options — fetch options
   */
  async request(endpoint, options = {}) {
    // TODO: раскомментируйте для реального API
    // const res = await fetch(`${this.baseUrl}${endpoint}`, {
    //   headers: { 'Content-Type': 'application/json' },
    //   ...options,
    // });
    // if (!res.ok) throw new Error(`API error: ${res.status}`);
    // return res.json();

    // Пока — mock через локальные данные
    console.warn(`[API stub] ${options.method || 'GET'} ${endpoint}`);
    return null;
  },

  // ── Авторизация ──────────────────────────────────────────
  async loginByCode(code) {
    // return this.request('/auth/login', { method: 'POST', body: JSON.stringify({ code }) });
    const normalized = code.trim();
    const userId = MOCK_DATA.accessCodes[normalized];
    if (!userId) {
      return { success: false, error: 'Неверный код доступа. Обратитесь в IT-отдел колледжа.' };
    }
    const user = MOCK_DATA.users.find(u => u.id === userId);
    if (!user) return { success: false, error: 'Аккаунт не найден' };
    return { success: true, user };
  },

  // ── Пользователи ─────────────────────────────────────────
  async getUsers(filters = {}) {
    // return this.request(`/users?${new URLSearchParams(filters)}`);
    let users = [...MOCK_DATA.users];
    if (filters.group) users = users.filter(u => u.group === filters.group);
    if (filters.direction) users = users.filter(u => u.direction === filters.direction);
    if (filters.course) users = users.filter(u => u.course === +filters.course);
    if (filters.online) users = users.filter(u => u.online);
    return users;
  },

  // ── Получение пользователя ─────────────────────────────────────────
  async getUser(id) {
    // return this.request(`/users/${id}`);
    return MOCK_DATA.users.find(u => u.id === id) || null;
  },

  // ── Чаты ─────────────────────────────────────────
  async getChats(userId) {
    // return this.request(`/chats?userId=${userId}`);
    return MOCK_DATA.chats;
  },

  // ── Сообщения ─────────────────────────────────────────
  async getMessages(chatId) {
    // return this.request(`/chats/${chatId}/messages`);
    return MOCK_DATA.messages[chatId] || [];
  },

  // ── Отправка сообщения ─────────────────────────────────────────
  async sendMessage(chatId, userId, text, userRole) {
    // return this.request(`/chats/${chatId}/messages`, { method: 'POST', body: JSON.stringify({ userId, text }) });
    const chat = MOCK_DATA.chats.find(c => c.id === chatId);
    if (chat) {
      const typeInfo = MOCK_DATA.chatTypes[chat.type];
      if (typeInfo.readonly && userRole !== 'teacher') {
        return { error: 'Этот чат доступен только для чтения' };
      }
    }
    const msg = {
      id: Date.now(),
      chatId,
      userId,
      text,
      time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
      reactions: [],
    };
    if (!MOCK_DATA.messages[chatId]) MOCK_DATA.messages[chatId] = [];
    MOCK_DATA.messages[chatId].push(msg);
    return msg;
  },

  // ── Клубы ─────────────────────────────────────────
  async getClubs() {
    // return this.request('/clubs');
    return MOCK_DATA.clubs;
  },

  // ── Получение клуба ─────────────────────────────────────────
  async getClub(id) {
    // return this.request(`/clubs/${id}`);
    return MOCK_DATA.clubs.find(c => c.id === id) || null;
  },

  // ── Админ-панель ─────────────────────────────────────────
  async getAdminStats() {
    // return this.request('/admin/stats');
    return MOCK_DATA.adminStats;
  },

  // ── Получение пользователей для админ-панели ─────────────────────────────────────────
  async getAdminUsers() {
    // return this.request('/admin/users');
    return MOCK_DATA.users;
  },

  // ── Справочные данные ────────────────────────────────
  async getGroups() {
    // return this.request('/ref/groups');
    return MOCK_DATA.groups;
  },

  // ── Получение направлений ─────────────────────────────────────────
  async getDirections() {
    // return this.request('/ref/directions');
    return MOCK_DATA.directions;
  },
};
