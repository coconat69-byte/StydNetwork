/**
 * api.js — отсюда сайт берёт данные.
 *
 * Как мы это сделали:
 * сначала пробуем сервер (папка back, команда go run .),
 * если сервер не запущен — берём данные из js/data.js.
 *
 * Токен входа кладём в sessionStorage:
 *   - обновление страницы (F5) — вход остаётся;
 *   - закрыли вкладку — токен стирается, снова нужен код.
 */

var API = {
  TOKEN_KEY: 'studnet-token',
  offline: false,

  // Если страницу открыл сам сервер (порт 8080) — короткий адрес.
  // Если открыли index.html сами — стучимся на localhost:8080.
  URL: location.port === '8080' ? '/api' : 'http://localhost:8080/api',

  // Время в формате «12:05» для сообщений
  now: function () {
    return new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  },

  // Один запрос к серверу. Если body есть — это POST, иначе GET.
  request: async function (path, body) {
    var res;
    var data;
    try {
      res = await fetch(this.URL + path, {
        method: body ? 'POST' : 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + sessionStorage.getItem(this.TOKEN_KEY),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      data = await res.json();
    } catch (e) {
      var err = new Error('Нет связи с сервером');
      err.offline = true;
      throw err;
    }
    if (!res.ok) {
      throw new Error(data.error);
    }
    return data;
  },

  // Сначала сервер, если его нет — локальные данные из data.js
  call: async function (fromServer, fromLocal) {
    if (!this.offline) {
      try {
        return await fromServer();
      } catch (err) {
        // Если сервер ответил ошибкой (неверный код и т.п.) — показываем её
        if (!err.offline) {
          throw err;
        }
        this.offline = true;
        console.info('Сервер не найден — работаем с data.js');
      }
    }
    return fromLocal();
  },

  hasToken: function () {
    return !!sessionStorage.getItem(this.TOKEN_KEY);
  },

  login: async function (code) {
    var result = await this.call(
      function () { return API.request('/login', { code: code }); },
      function () { return LOCAL.login(code); }
    );
    sessionStorage.setItem(this.TOKEN_KEY, result.token);
    return result.user;
  },

  logout: async function () {
    try {
      await this.call(
        function () { return API.request('/logout', {}); },
        function () { return LOCAL.logout(); }
      );
    } catch (e) {
      // при выходе ошибки не важны
    }
    sessionStorage.removeItem(this.TOKEN_KEY);
  },

  me: function () {
    return this.call(
      function () { return API.request('/me'); },
      function () { return LOCAL.me(); }
    );
  },

  updateMe: function (fields) {
    return this.call(
      function () { return API.request('/me', fields); },
      function () { return LOCAL.updateMe(fields); }
    );
  },

  saveSetting: function (key, value) {
    return this.call(
      function () { return API.request('/settings', { key: key, value: value }); },
      function () { return LOCAL.saveSetting(key, value); }
    );
  },

  data: function () {
    return this.call(
      function () { return API.request('/data'); },
      function () { return LOCAL.data(); }
    );
  },

  messages: function (chatId) {
    return this.call(
      function () { return API.request('/chats/' + chatId + '/messages'); },
      function () { return MOCK_DATA.messages[chatId] || []; }
    );
  },

  markRead: function (chatId) {
    return this.call(
      function () { return API.request('/chats/' + chatId + '/read', {}); },
      function () { return LOCAL.markRead(chatId); }
    );
  },

  sendMessage: function (chatId, text) {
    return this.call(
      function () { return API.request('/chats/' + chatId + '/messages', { text: text }); },
      function () { return LOCAL.sendMessage(chatId, text); }
    );
  },

  openDm: function (userId) {
    return this.call(
      function () { return API.request('/dm', { userId: userId }); },
      function () { return LOCAL.openDm(userId); }
    );
  },

  toggleClub: function (clubId) {
    return this.call(
      function () { return API.request('/clubs/' + clubId + '/toggle', {}); },
      function () { return LOCAL.toggleClub(clubId); }
    );
  },

  clubMessages: function (clubId) {
    return this.call(
      function () { return API.request('/clubs/' + clubId + '/messages'); },
      function () { return MOCK_DATA.clubMessages[clubId] || []; }
    );
  },

  sendClubMessage: function (clubId, text) {
    return this.call(
      function () { return API.request('/clubs/' + clubId + '/messages', { text: text }); },
      function () { return LOCAL.sendClubMessage(clubId, text); }
    );
  },

  adminStats: function () {
    return this.call(
      function () { return API.request('/admin/stats'); },
      function () { return LOCAL.adminStats(); }
    );
  },

  createChannel: function (fields) {
    return this.call(
      function () { return API.request('/admin/channels', fields); },
      function () { return LOCAL.createChannel(fields); }
    );
  },

  updateChannel: function (chatId, fields) {
    return this.call(
      function () { return API.request('/admin/channels/' + chatId, fields); },
      function () { return LOCAL.updateChannel(chatId, fields); }
    );
  },

  reports: function () {
    return this.call(
      function () { return API.request('/admin/reports'); },
      function () {
        var list = MOCK_DATA.reports.slice();
        list.sort(function (a, b) { return b.id - a.id; });
        return list;
      }
    );
  },

  dismissReport: function (reportId) {
    return this.call(
      function () { return API.request('/admin/reports/' + reportId + '/dismiss', {}); },
      function () { return LOCAL.dismissReport(reportId); }
    );
  },

  blockUser: function (userId, blocked) {
    return this.call(
      function () { return API.request('/admin/users/' + userId + '/block', { blocked: blocked }); },
      function () { return LOCAL.blockUser(userId, blocked); }
    );
  },
};

/**
 * LOCAL — те же действия, что и сервер, но с данными из data.js.
 * Нужен, когда go run . не запущен.
 */
var LOCAL = {
  login: function (code) {
    var id = MOCK_DATA.accessCodes[code.trim()];
    var user = findInList(MOCK_DATA.users, id);
    if (!user) {
      throw new Error('Неверный код доступа. Обратитесь в IT-отдел колледжа.');
    }
    if (user.blocked) {
      throw new Error('Аккаунт заблокирован администратором.');
    }
    user.online = true;
    return { token: 'local-' + user.id, user: user };
  },

  logout: function () {
    LOCAL.me().online = false;
  },

  // Токен без сервера выглядит так: local-1, local-7 и т.д.
  me: function () {
    var token = sessionStorage.getItem(API.TOKEN_KEY) || '';
    if (token.indexOf('local-') !== 0) {
      throw new Error('Требуется вход');
    }
    var id = Number(token.slice(6));
    var user = findInList(MOCK_DATA.users, id);
    if (!user || user.blocked) {
      throw new Error('Требуется вход');
    }
    user.online = true;
    return user;
  },

  updateMe: function (fields) {
    var name = (fields.name || '').trim();
    if (!name) {
      throw new Error('Имя не может быть пустым');
    }
    var me = LOCAL.me();
    me.name = name;
    me.email = (fields.email || '').trim();
    me.bio = (fields.bio || '').trim();
    me.interests = fields.interests;
    return me;
  },

  saveSetting: function (key, value) {
    LOCAL.me()[key] = value;
    return { ok: true };
  },

  // Запоминаем, до какого сообщения человек дочитал чат
  reads: {},

  data: function () {
    var me = LOCAL.me();
    var myId = me.id;
    var chats = [];
    var i;

    // Личные чаты показываем только свои
    for (i = 0; i < MOCK_DATA.chats.length; i++) {
      var chat = MOCK_DATA.chats[i];
      if (chat.type === 'dm' && chat.ownerId !== myId && chat.userId !== myId) {
        continue;
      }
      chats.push(chat);
    }

    // Считаем непрочитанные
    for (i = 0; i < chats.length; i++) {
      var msgs = MOCK_DATA.messages[chats[i].id] || [];
      var lastRead = LOCAL.reads[myId + ':' + chats[i].id] || 0;
      var unread = 0;
      var j;
      for (j = 0; j < msgs.length; j++) {
        if (msgs[j].userId !== myId && msgs[j].id > lastRead) {
          unread++;
        }
      }
      chats[i].unread = unread;
    }

    // Чужим не показываем скрытый онлайн и группу
    var users = [];
    for (i = 0; i < MOCK_DATA.users.length; i++) {
      var u = MOCK_DATA.users[i];
      if (u.id === myId) {
        users.push(u);
        continue;
      }
      var copy = Object.assign({}, u);
      if (u.showOnline === false) copy.online = false;
      if (u.showGroup === false) copy.group = '';
      users.push(copy);
    }

    return Object.assign({}, MOCK_DATA, { users: users, chats: chats });
  },

  markRead: function (chatId) {
    var msgs = MOCK_DATA.messages[chatId] || [];
    var maxId = 0;
    var i;
    for (i = 0; i < msgs.length; i++) {
      if (msgs[i].id > maxId) maxId = msgs[i].id;
    }
    LOCAL.reads[LOCAL.me().id + ':' + chatId] = maxId;
    return { ok: true };
  },

  sendMessage: function (chatId, text) {
    var chat = findInList(MOCK_DATA.chats, chatId);
    var user = LOCAL.me();
    var typeInfo = MOCK_DATA.chatTypes[chat.type];
    if (typeInfo.readonly && user.role !== 'teacher') {
      throw new Error('Этот чат доступен только для чтения');
    }
    if (!MOCK_DATA.messages[chatId]) {
      MOCK_DATA.messages[chatId] = [];
    }
    MOCK_DATA.messages[chatId].push({
      id: Date.now(),
      userId: user.id,
      text: text,
      time: API.now(),
      reactions: [],
    });
    return { ok: true };
  },

  openDm: function (userId) {
    var me = LOCAL.me().id;
    var chat = null;
    var i;
    for (i = 0; i < MOCK_DATA.chats.length; i++) {
      var c = MOCK_DATA.chats[i];
      if (c.type !== 'dm') continue;
      var mine = (c.ownerId === me && c.userId === userId) || (c.ownerId === userId && c.userId === me);
      if (mine) {
        chat = c;
        break;
      }
    }

    var other = findInList(MOCK_DATA.users, userId);
    if (!chat && other && other.allowMessages === false) {
      throw new Error('Пользователь ограничил личные сообщения');
    }

    if (!chat) {
      chat = {
        id: Date.now(),
        type: 'dm',
        ownerId: me,
        userId: userId,
        members: 2,
        description: 'Личная переписка',
        unread: 0,
        lastMessage: '',
        lastTime: '',
      };
      MOCK_DATA.chats.push(chat);
    }
    return chat;
  },

  toggleClub: function (clubId) {
    var club = findInList(MOCK_DATA.clubs, clubId);
    var me = LOCAL.me().id;
    var ids = club.memberIds || [];
    var index = ids.indexOf(me);
    if (index >= 0) {
      ids.splice(index, 1);
    } else {
      ids.push(me);
    }
    club.memberIds = ids;
    return { memberIds: ids };
  },

  sendClubMessage: function (clubId, text) {
    var user = LOCAL.me();
    var club = findInList(MOCK_DATA.clubs, clubId);
    if (!club.memberIds || club.memberIds.indexOf(user.id) === -1) {
      throw new Error('Сначала вступите в клуб');
    }
    if (!MOCK_DATA.clubMessages[clubId]) {
      MOCK_DATA.clubMessages[clubId] = [];
    }
    MOCK_DATA.clubMessages[clubId].push({
      id: Date.now(),
      userId: user.id,
      text: text,
      time: API.now(),
      reactions: [],
    });
    return { ok: true };
  },

  adminStats: function () {
    var online = 0;
    var i;
    for (i = 0; i < MOCK_DATA.users.length; i++) {
      if (MOCK_DATA.users[i].online) online++;
    }
    return {
      totalUsers: MOCK_DATA.users.length,
      onlineNow: online,
      activeChats: MOCK_DATA.chats.length,
      pendingReports: MOCK_DATA.reports.length,
    };
  },

  createChannel: function (fields) {
    var name = (fields.name || '').trim();
    if (!name) {
      throw new Error('Введите название канала');
    }
    var chat = {
      id: Date.now(),
      name: name,
      type: 'channel',
      icon: '📢',
      members: 0,
      description: (fields.description || '').trim(),
      unread: 0,
      lastMessage: '',
      lastTime: '',
    };
    MOCK_DATA.chats.push(chat);
    return chat;
  },

  updateChannel: function (chatId, fields) {
    var name = (fields.name || '').trim();
    if (!name) {
      throw new Error('Введите название канала');
    }
    var chat = findInList(MOCK_DATA.chats, chatId);
    chat.name = name;
    chat.description = (fields.description || '').trim();
    return chat;
  },

  dismissReport: function (reportId) {
    var next = [];
    var i;
    for (i = 0; i < MOCK_DATA.reports.length; i++) {
      if (MOCK_DATA.reports[i].id !== reportId) {
        next.push(MOCK_DATA.reports[i]);
      }
    }
    MOCK_DATA.reports = next;
    return { ok: true };
  },

  blockUser: function (userId, blocked) {
    var user = findInList(MOCK_DATA.users, userId);
    if (user.isAdmin) {
      throw new Error('Администратора заблокировать нельзя');
    }
    user.blocked = blocked;
    if (blocked) {
      user.online = false;
      var next = [];
      var i;
      for (i = 0; i < MOCK_DATA.reports.length; i++) {
        if (MOCK_DATA.reports[i].userId !== userId) {
          next.push(MOCK_DATA.reports[i]);
        }
      }
      MOCK_DATA.reports = next;
    }
    return { ok: true };
  },
};

// Ищем объект в массиве по id (пользователь, чат, клуб)
function findInList(list, id) {
  var i;
  for (i = 0; i < list.length; i++) {
    if (list[i].id === id) return list[i];
  }
  return null;
}
