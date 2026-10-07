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
  offline: false,   // true — сервера нет, работаем с data.js (изменения живут до обновления страницы)
  connected: false, // true — сервер уже хоть раз ответил в этой вкладке

  // Адрес API. Его ищет findServer при первом запросе
  URL: null,
  serverSearch: null, // поиск идёт один раз, все первые запросы ждут его вместе

  // Где может быть сервер — по порядку:
  //  1) там же, откуда открыта страница (её отдал сам сервер: localhost:8080,
  //     адрес компьютера в сети с телефона, туннель и т.п.);
  //  2) на том же компьютере, порт 8080 (страница открыта через Live Server —
  //     в том числе с телефона по адресу вида 192.168.1.5:5500);
  //  3) localhost:8080 (index.html открыт двойным щелчком).
  // Раньше всегда брался localhost:8080 — а на телефоне localhost это сам телефон,
  // сервер не находился, и сайт молча переходил в режим без сервера.
  serverCandidates: function () {
    var list = [];
    if (location.protocol === 'http:' || location.protocol === 'https:') {
      list.push(location.origin + '/api');
      list.push(location.protocol + '//' + location.hostname + ':8080/api');
    }
    list.push('http://localhost:8080/api');
    // убираем повторы (например, страница и так открыта на :8080)
    return list.filter(function (url, i) { return list.indexOf(url) === i; });
  },

  // Ищем сервер: спрашиваем /api/me по каждому адресу. Наш сервер отвечает JSON-ом
  // (без входа — {"error": "Требуется вход"}), а Live Server и прочие — HTML-страницей.
  findServer: async function () {
    var list = this.serverCandidates();
    var i;
    for (i = 0; i < list.length; i++) {
      try {
        var res = await fetch(list[i] + '/me');
        var type = res.headers.get('Content-Type') || '';
        if (type.indexOf('application/json') === 0) {
          return list[i];
        }
      } catch (e) {
        // по этому адресу никого — пробуем следующий
      }
    }
    return null;
  },

  // Время в формате «12:05» для сообщений
  now: function () {
    return new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  },

  // Один запрос к серверу. Если body есть — это POST, иначе GET.
  // Данные отправляем как JSON (JSON.stringify), поэтому кавычки и спецсимволы
  // в тексте сообщений не ломают запрос.
  request: async function (path, body) {
    if (!this.URL) {
      this.serverSearch = this.serverSearch || this.findServer();
      this.URL = await this.serverSearch;
    }
    if (!this.URL) {
      var notFound = new Error('Нет связи с сервером');
      notFound.offline = true;
      throw notFound;
    }

    var res;
    try {
      res = await fetch(this.URL + path, {
        method: body ? 'POST' : 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + (sessionStorage.getItem(this.TOKEN_KEY) || ''),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      // Сюда попадаем, только если сервер вообще не ответил (не запущен)
      var err = new Error('Нет связи с сервером');
      err.offline = true;
      throw err;
    }

    this.connected = true;

    // Сервер ответил. Если ответ почему-то не JSON (например, страница «404 not found»),
    // это ошибка сервера, а не «сервера нет» — поэтому в режим без сервера не переходим
    var data;
    try {
      data = await res.json();
    } catch (e) {
      data = {};
    }
    if (!res.ok) {
      throw new Error(data.error || 'Ошибка сервера (код ' + res.status + ')');
    }
    return data;
  },

  // Сначала сервер, если его нет — локальные данные из data.js
  call: async function (fromServer, fromLocal) {
    if (!this.offline) {
      try {
        return await fromServer();
      } catch (err) {
        // Если сервер ответил ошибкой (неверный код и т.п.) — показываем её.
        // Если сервер уже отвечал, а сейчас пропал (перезапускают, пропала сеть) —
        // тоже показываем ошибку, а не переходим тихо на data.js: иначе сообщение
        // «отправилось» бы только на экране и исчезло после обновления страницы
        if (!err.offline || this.connected) {
          throw err;
        }
        this.offline = true;
        console.info('Сервер не найден — работаем с data.js');
      }
    }
    return fromLocal();
  },

  // Есть ли токен входа в этой вкладке
  hasToken: function () {
    return !!sessionStorage.getItem(this.TOKEN_KEY);
  },

  // Вход по коду доступа. Запоминаем токен и возвращаем пользователя
  login: async function (code) {
    var result = await this.call(
      function () { return API.request('/login', { code: code }); },
      function () { return LOCAL.login(code); }
    );
    sessionStorage.setItem(this.TOKEN_KEY, result.token);
    return result.user;
  },

  // Выход: сообщаем серверу и стираем токен
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

  // Кто я (проверка токена при обновлении страницы)
  me: function () {
    return this.call(
      function () { return API.request('/me'); },
      function () { return LOCAL.me(); }
    );
  },

  // Сохранить свой профиль: {name, email, bio, interests}
  updateMe: function (fields) {
    return this.call(
      function () { return API.request('/me', fields); },
      function () { return LOCAL.updateMe(fields); }
    );
  },

  // Включить или выключить одну настройку
  saveSetting: function (key, value) {
    return this.call(
      function () { return API.request('/settings', { key: key, value: value }); },
      function () { return LOCAL.saveSetting(key, value); }
    );
  },

  // Все данные сайта одним запросом: пользователи, чаты, клубы…
  data: function () {
    return this.call(
      function () { return API.request('/data'); },
      function () { return LOCAL.data(); }
    );
  },

  // Сообщения чата
  messages: function (chatId) {
    return this.call(
      function () { return API.request('/chats/' + chatId + '/messages'); },
      function () { return MOCK_DATA.messages[chatId] || []; }
    );
  },

  // Отметить чат прочитанным
  markRead: function (chatId) {
    return this.call(
      function () { return API.request('/chats/' + chatId + '/read', {}); },
      function () { return LOCAL.markRead(chatId); }
    );
  },

  // Отправить сообщение в чат
  sendMessage: function (chatId, text) {
    return this.call(
      function () { return API.request('/chats/' + chatId + '/messages', { text: text }); },
      function () { return LOCAL.sendMessage(chatId, text); }
    );
  },

  // Личный чат с человеком (создаётся, если его ещё нет)
  openDm: function (userId) {
    return this.call(
      function () { return API.request('/dm', { userId: userId }); },
      function () { return LOCAL.openDm(userId); }
    );
  },

  // Вступить в клуб или выйти из него
  toggleClub: function (clubId) {
    return this.call(
      function () { return API.request('/clubs/' + clubId + '/toggle', {}); },
      function () { return LOCAL.toggleClub(clubId); }
    );
  },

  // Сообщения чата клуба
  clubMessages: function (clubId) {
    return this.call(
      function () { return API.request('/clubs/' + clubId + '/messages'); },
      function () { return MOCK_DATA.clubMessages[clubId] || []; }
    );
  },

  // Написать в чат клуба
  sendClubMessage: function (clubId, text) {
    return this.call(
      function () { return API.request('/clubs/' + clubId + '/messages', { text: text }); },
      function () { return LOCAL.sendClubMessage(clubId, text); }
    );
  },

  // Мгновенные сообщения: держим открытым поток GET /api/events (см. back/events.go)
  // и для каждого события вызываем onEvent({type: 'message' | 'club', ...}).
  // Связь оборвалась — подключаемся снова через 3 секунды, а после переподключения
  // вызываем onEvent({type: 'resync'}): за время обрыва могли прийти сообщения.
  //
  // Используем fetch, а не встроенный EventSource: EventSource не умеет
  // отправлять заголовок Authorization, и токен пришлось бы класть в адрес.
  // Без сервера (data.js) других людей нет, поэтому и слушать нечего.
  listen: async function (onEvent) {
    var connectedBefore = false;
    while (!this.offline && this.hasToken()) {
      try {
        var res = await fetch(this.URL + '/events', {
          headers: { Authorization: 'Bearer ' + sessionStorage.getItem(this.TOKEN_KEY) },
        });
        if (res.status === 401) {
          return; // вход больше не действует
        }
        if (res.ok && res.body) {
          if (connectedBefore) {
            onEvent({ type: 'resync' });
          }
          connectedBefore = true;
          await this.readEvents(res.body, onEvent);
        }
      } catch (e) {
        // нет связи — попробуем ещё раз ниже
      }
      await new Promise(function (resolve) { setTimeout(resolve, 3000); });
    }
  },

  // Читаем поток по кусочкам. События разделены пустой строкой, нужная строка начинается с «data: »
  readEvents: async function (body, onEvent) {
    var reader = body.getReader();
    var decoder = new TextDecoder();
    var buffer = '';
    while (true) {
      var chunk = await reader.read();
      if (chunk.done) {
        return;
      }
      buffer += decoder.decode(chunk.value, { stream: true });
      var blocks = buffer.split('\n\n');
      buffer = blocks.pop(); // последний кусок может быть недописан — ждём продолжения
      blocks.forEach(function (block) {
        if (block.indexOf('data: ') !== 0) {
          return; // «: ping» и прочие комментарии
        }
        try {
          onEvent(JSON.parse(block.slice(6)));
        } catch (e) {
          console.error(e);
        }
      });
    }
  },

  // Админ: цифры для «Обзора»
  adminStats: function () {
    return this.call(
      function () { return API.request('/admin/stats'); },
      function () { return LOCAL.adminStats(); }
    );
  },

  // Админ: создать канал {name, description}
  createChannel: function (fields) {
    return this.call(
      function () { return API.request('/admin/channels', fields); },
      function () { return LOCAL.createChannel(fields); }
    );
  },

  // Админ: изменить канал
  updateChannel: function (chatId, fields) {
    return this.call(
      function () { return API.request('/admin/channels/' + chatId, fields); },
      function () { return LOCAL.updateChannel(chatId, fields); }
    );
  },

  // Админ: жалобы, новые сверху
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

  // Админ: отклонить жалобу
  dismissReport: function (reportId) {
    return this.call(
      function () { return API.request('/admin/reports/' + reportId + '/dismiss', {}); },
      function () { return LOCAL.dismissReport(reportId); }
    );
  },

  // Админ: заблокировать (blocked = true) или разблокировать человека
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
  // Вход: ищем код в MOCK_DATA.accessCodes. Токен без сервера — просто «local-<id>»
  login: function (code) {
    code = code.trim();
    // hasOwnProperty — чтобы код вроде «constructor» не нашёл встроенное свойство объекта
    if (!Object.prototype.hasOwnProperty.call(MOCK_DATA.accessCodes, code)) {
      throw new Error('Неверный код доступа. Обратитесь в IT-отдел колледжа.');
    }
    var id = MOCK_DATA.accessCodes[code];
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

  // Выход: ставим «не в сети»
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

  // Сохранить свой профиль (те же проверки имени, что и на сервере)
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

  // Менять можно только настройки из списка — как и на сервере.
  // Иначе можно было бы «сохранить настройку» isAdmin и стать администратором
  saveSetting: function (key, value) {
    var allowed = ['notifyUnread', 'notifyChannels', 'notifyMentions', 'compact', 'showOnline', 'showGroup', 'allowMessages'];
    if (allowed.indexOf(key) === -1) {
      throw new Error('Нет такой настройки');
    }
    LOCAL.me()[key] = Boolean(value);
    return { ok: true };
  },

  // Запоминаем, до какого сообщения человек дочитал чат
  reads: {},

  // Все данные — как ответ сервера на /api/data
  data: function () {
    var me = LOCAL.me();
    var myId = me.id;
    var chats = [];
    var i;

    // Личные чаты показываем только свои, чаты групп — только студентам (как на сервере)
    for (i = 0; i < MOCK_DATA.chats.length; i++) {
      var chat = MOCK_DATA.chats[i];
      if (chat.type === 'dm' && chat.ownerId !== myId && chat.userId !== myId) {
        continue;
      }
      if (chat.type === 'group' && me.role === 'teacher') {
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

  // Отметить чат прочитанным: запоминаем самый большой id сообщения в нём
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

  // Отправить сообщение (в каналы — только преподаватели)
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

  // Найти личный чат с человеком или создать новый
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

  // Вступить в клуб или выйти: добавляем/убираем себя из memberIds
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

  // Написать в чат клуба (только участникам)
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

  // Цифры для «Обзора» в админ-панели
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

  // Создать канал
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

  // Изменить название и описание канала
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

  // Отклонить жалобу: оставляем все жалобы, кроме этой
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

  // Заблокировать/разблокировать. При блокировке убираем и жалобы на человека
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
