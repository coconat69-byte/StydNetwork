/**
 * app.js — интерфейс СтудСети: рисует экраны и отвечает на клики.
 * Данные берёт через API (js/api.js): с сервера, а если его нет — из js/data.js.
 *
 * Как тут всё устроено:
 *  - DATA  — данные, полученные после входа (пользователи, чаты, клубы…);
 *  - state — где сейчас пользователь: экран, открытый чат, клуб, вкладки.
 *            Сохраняется при обновлении страницы, так что вы остаётесь там же;
 *  - render…() — функции, которые рисуют части экрана по DATA и state;
 *  - bindEvents() — все обработчики кликов, вешаются один раз при запуске.
 *
 * ВАЖНО про безопасность (XSS).
 * Экран мы рисуем так: собираем HTML-строку и кладём её в innerHTML.
 * Если вставить в такую строку чужой текст как есть, то сообщение
 * «<img src=x onerror=alert(1)>» стало бы настоящей картинкой со скриптом
 * и выполнилось бы у всех, кто его увидел. Поэтому ЛЮБОЕ значение из данных
 * (имя, текст сообщения, название, путь к картинке, даже число) вставляем
 * только через esc(...). Без esc можно вставлять только наш собственный HTML,
 * написанный прямо в этом файле.
 */

(function () {
  'use strict';

  // ════════ Данные и состояние ════════

  let DATA = null; // все данные сайта, заполняются в enterApp()

  const state = {
    user: null,             // кто вошёл
    screen: 'main',         // открытый экран: main, search, clubs, settings, admin, profile
    backTo: 'main',         // куда вернёт кнопка «Назад» в профиле
    profileId: null,        // чей профиль открыт
    chatId: null,           // открытый чат
    chatFilter: 'all',      // фильтр над списком чатов
    chatOpen: false,        // на телефоне: открыта переписка (true) или список чатов (false)
    clubsView: 'all',       // «Все» или «Мои» клубы
    clubId: null,           // открытый клуб
    clubTab: 'members',     // вкладка клуба: members или chat
    settingsTab: 'profile', // вкладка настроек
    adminTab: 'dashboard',  // вкладка админ-панели
  };

  // state кладётся в sessionStorage, когда страница обновляется, и достаётся после входа.
  // При закрытии вкладки sessionStorage очищается — и всё начинается сначала.
  const STATE_KEY = 'studnet-ui';

  function saveState() {
    if (!state.user) {
      return; // не вошли или выходим — сохранять нечего
    }
    // Сохраняем копию state без пользователя: его всё равно заново спросим у сервера
    const copy = Object.assign({}, state);
    delete copy.user;
    sessionStorage.setItem(STATE_KEY, JSON.stringify(copy));
  }

  function restoreState() {
    const saved = sessionStorage.getItem(STATE_KEY);
    if (!saved) {
      return;
    }
    try {
      Object.assign(state, JSON.parse(saved));
    } catch (e) {
      // данные испорчены — оставляем обычные значения из state
    }
  }

  // ════════ Помощники ════════

  // Найти элемент на странице по CSS-селектору: $('#chat-list')
  function $(selector) {
    return document.querySelector(selector);
  }

  // Защита от XSS: превращает опасные символы в безопасные «HTML-сущности».
  // Например, «<b>» станет «&lt;b&gt;» — браузер покажет это как текст, а не как тег.
  // Кавычки тоже заменяем, потому что значения вставляются и в атрибуты: data-x="...".
  function esc(text) {
    if (text === null || text === undefined) {
      return '';
    }
    return String(text)
      .replace(/&/g, '&amp;') // & — первым, иначе испортим уже заменённые символы
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Найти пользователя, чат или клуб по id
  function userById(id) {
    return DATA.users.find(function (u) { return u.id === id; });
  }
  function chatById(id) {
    return DATA.chats.find(function (c) { return c.id === id; });
  }
  function clubById(id) {
    return DATA.clubs.find(function (c) { return c.id === id; });
  }

  function isTeacher(user) {
    return user.role === 'teacher';
  }

  // Состою ли я в клубе
  function inClub(club) {
    const ids = club.memberIds || [];
    return ids.includes(state.user.id);
  }

  // Прокрутить блок с сообщениями в самый низ (к последнему сообщению)
  function scrollToBottom(element) {
    element.scrollTop = element.scrollHeight;
  }

  // Прокручен ли блок почти до низа. Если человек поднялся читать старые сообщения,
  // новое сообщение не должно утаскивать его вниз
  function nearBottom(element) {
    return element.scrollHeight - element.scrollTop - element.clientHeight < 80;
  }

  // Настройки человека (переключатели на экране «Настройки») и их значения по умолчанию.
  // С сервера приходят 1/0, без сервера — true/false, а если настройку ещё не трогали — её нет вовсе
  const SETTING_DEFAULTS = {
    notifyUnread: true,
    notifyChannels: true,
    notifyMentions: true,
    compact: false,
    showOnline: true,
    showGroup: true,
    allowMessages: true,
  };

  // Включена ли настройка key у пользователя user
  function setting(user, key) {
    if (user[key] === undefined || user[key] === null) {
      return SETTING_DEFAULTS[key];
    }
    return Boolean(user[key]);
  }

  // Можно ли написать человеку: он разрешил сообщения или переписка с ним уже есть
  function canMessage(user) {
    if (setting(user, 'allowMessages')) {
      return true;
    }
    return DATA.chats.some(function (chat) {
      const other = partner(chat);
      return other && other.id === user.id;
    });
  }

  // Число со словом в нужной форме: «1 участник», «3 участника», «25 участников»
  function plural(n, one, few, many) {
    const last = n % 10;      // последняя цифра
    const lastTwo = n % 100;  // две последние цифры (11–14 — особый случай)
    if (last === 1 && lastTwo !== 11) {
      return n + ' ' + one;
    }
    if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) {
      return n + ' ' + few;
    }
    return n + ' ' + many;
  }

  function membersText(n) {
    return plural(n, 'участник', 'участника', 'участников');
  }

  // Точка «в сети / не в сети»
  function dot(user) {
    const online = user.online ? 'status-dot--online' : '';
    return `<span class="status-dot ${online}"></span>`;
  }

  // Аватарка с точкой статуса. size — размер: xs, sm, md, lg, xl
  function avatar(user, size) {
    return `
      <div class="avatar-wrap">
        <img src="${esc(user.avatar)}" class="avatar avatar--${size}" alt="">
        ${dot(user)}
      </div>`;
  }

  // Кто этот человек: «ИСП341 · 3 курс · Информационные системы…» или «Преподаватель · …»
  function about(user) {
    let parts;
    if (isTeacher(user)) {
      parts = ['Преподаватель', user.direction];
    } else {
      parts = [user.group, user.course ? user.course + ' курс' : '', user.direction];
    }
    // Пустые части (например, скрытую группу) пропускаем
    return parts.filter(Boolean).join(' · ');
  }

  // Теги-интересы (пустые пропускаем)
  function tags(list) {
    return (list || [])
      .filter(Boolean)
      .map(function (item) { return `<span class="tag">${esc(item)}</span>`; })
      .join('');
  }

  // Иконки для кнопок «Написать» и «Отправить»
  const ICON_MESSAGE = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  const ICON_SEND = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>';

  // Подсветить активную кнопку среди кнопок с атрибутом data-<attr> внутри root
  function markTab(root, attr, value) {
    root.querySelectorAll(`[data-${attr}]`).forEach(function (button) {
      const active = button.getAttribute(`data-${attr}`) === String(value);
      button.classList.toggle('is-active', active);
    });
  }

  // Клик по элементу с атрибутом data-<attr> внутри root → handler(значение атрибута).
  // Обработчик висит на root, поэтому работает и для элементов, нарисованных позже.
  function onClick(root, attr, handler) {
    root.addEventListener('click', function (e) {
      const element = e.target.closest(`[data-${attr}]`);
      if (element) {
        handler(element.getAttribute(`data-${attr}`));
      }
    });
  }

  // ════════ Запуск, вход и выход ════════

  document.addEventListener('DOMContentLoaded', start);

  // Если в этой вкладке уже входили (есть токен) — проверяем его и сразу открываем приложение
  async function start() {
    bindEvents();
    if (!API.hasToken()) {
      return; // токена нет — остаётся форма входа
    }
    try {
      const user = await API.me();
      await enterApp(user);
    } catch (e) {
      // Токен устарел или сервер пропал — просим войти заново
      await API.logout();
      document.documentElement.classList.remove('logged-in');
    }
  }

  // Код доступа: оставляем только цифры (не больше 9) и сами ставим дефис после каждых трёх — 123-456-789
  function formatCode(e) {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 9); // \D — всё, что не цифра
    const groups = digits.match(/.{1,3}/g) || [];                  // ['123', '456', '7']
    e.target.value = groups.join('-');
  }

  // Отправка формы входа
  async function login(e) {
    e.preventDefault(); // не перезагружать страницу
    try {
      const user = await API.login($('#login-code').value);
      await enterApp(user);
    } catch (err) {
      alert(err.message);
    }
  }

  // Выход: забываем токен и состояние, перезагружаем страницу — так проще всего всё сбросить
  async function logout() {
    state.user = null;
    sessionStorage.removeItem(STATE_KEY);
    await API.logout();
    location.reload();
  }

  // Вход выполнен: загружаем данные, возвращаем пользователя туда, где он был, и рисуем всё
  async function enterApp(user) {
    restoreState();
    state.user = user;
    DATA = await API.data();

    $('#my-avatar').src = user.avatar;
    $('#offline-banner').hidden = !API.offline; // предупреждаем, что изменения не сохранятся
    $('#admin-link').hidden = !user.isAdmin; // админ-панель — только администратору
    if (state.screen === 'admin' && !user.isAdmin) {
      state.screen = 'main';
    }

    // Варианты для фильтров поиска
    $('#filter-group').innerHTML += DATA.groups.map(function (g) {
      return `<option>${esc(g)}</option>`;
    }).join('');
    $('#filter-direction').innerHTML += DATA.directions.map(function (d) {
      return `<option>${esc(d)}</option>`;
    }).join('');

    // Подсвечиваем сохранённые вкладки
    markTab($('#clubs-tabs'), 'clubs-view', state.clubsView);
    markTab($('#settings-nav'), 'settings', state.settingsTab);
    markTab($('#admin-nav'), 'admin', state.adminTab);

    document.documentElement.classList.add('logged-in');
    document.documentElement.classList.toggle('compact', setting(user, 'compact')); // компактный режим из настроек
    renderChatFilters();

    // Открываем чат, который был открыт до обновления страницы, а если его нет — первый
    if (chatById(state.chatId)) {
      openChat(state.chatId);
    } else {
      state.chatOpen = false; // на телефоне начинаем со списка чатов
      if (DATA.chats.length > 0) {
        openChat(DATA.chats[0].id);
      }
    }
    showChat(state.chatOpen);
    navigate(state.screen, state.profileId);

    // Новые сообщения приходят сами, без обновления страницы (см. API.listen)
    API.listen(onServerEvent);
  }

  // ════════ Обработчики событий ════════

  function bindEvents() {
    window.addEventListener('pagehide', saveState); // страница обновляется или закрывается
    $('#form-login').addEventListener('submit', login);
    $('#login-code').addEventListener('input', formatCode);
    $('#logout').addEventListener('click', logout);
    $('#theme-toggle').addEventListener('click', function () {
      setTheme(theme() === 'light' ? 'dark' : 'light');
    });
    onClick(document, 'nav', function (screen) { navigate(screen); });

    // Люди в любом месте сайта:
    //  «Написать» (data-write) → личный чат,
    //  аватарка / имя / карточка (data-user) → профиль,
    //  «Назад» в профиле (data-back) → на экран, откуда пришли
    document.addEventListener('click', function (e) {
      const write = e.target.closest('[data-write]');
      const person = e.target.closest('[data-user]');
      const back = e.target.closest('[data-back]');
      if (write) {
        openDm(Number(write.dataset.write));
      } else if (person) {
        navigate('profile', Number(person.dataset.user));
      } else if (back) {
        navigate(state.backTo);
      }
    });

    // ── Чаты ──
    onClick($('#chat-filters'), 'filter', function (type) {
      state.chatFilter = type;
      markTab($('#chat-filters'), 'filter', type);
      renderChatList();
    });
    onClick($('#chat-list'), 'chat', function (id) {
      openChat(Number(id));
      showChat(true);
    });
    $('#chat-back').addEventListener('click', function () { showChat(false); });
    $('#chat-form').addEventListener('submit', sendMessage);

    // ── Поиск: строка в шапке и фильтры слева ──
    $('#global-search').addEventListener('input', function () {
      if (state.screen === 'search') {
        renderSearch();
      } else {
        navigate('search');
      }
    });
    ['#filter-group', '#filter-direction', '#filter-course', '#filter-online'].forEach(function (selector) {
      $(selector).addEventListener('change', renderSearch);
    });
    $('#reset-filters').addEventListener('click', function () {
      $('#global-search').value = '';
      $('#filter-group').value = '';
      $('#filter-direction').value = '';
      $('#filter-course').value = '';
      $('#filter-online').checked = false;
      renderSearch();
    });

    // ── Клубы: вкладки «Все / Мои», карточки, страница клуба ──
    onClick($('#clubs-tabs'), 'clubs-view', function (view) {
      state.clubsView = view;
      markTab($('#clubs-tabs'), 'clubs-view', view);
      renderClubs();
    });
    onClick($('#club-cards'), 'club', function (id) {
      state.clubId = Number(id);
      state.clubTab = 'members';
      renderClubs();
      window.scrollTo(0, 0);
    });
    onClick($('#club-page'), 'club-back', function () {
      state.clubId = null;
      renderClubs();
    });
    onClick($('#club-page'), 'club-toggle', toggleClub);
    onClick($('#club-page'), 'club-tab', function (tab) {
      state.clubTab = tab;
      markTab($('#club-tabs'), 'club-tab', tab);
      renderClubTab(clubById(state.clubId));
    });
    $('#club-page').addEventListener('submit', sendClubMessage);

    // ── Настройки ──
    const settings = $('#settings-content');
    onClick($('#settings-nav'), 'settings', function (tab) {
      state.settingsTab = tab;
      markTab($('#settings-nav'), 'settings', tab);
      renderSettings();
    });
    onClick(settings, 'set-theme', setTheme);
    onClick(settings, 'setting', toggleSetting);
    settings.addEventListener('submit', saveProfile);

    // Интересы в профиле: удалить, выбрать из подсказок, вписать свой
    onClick(settings, 'remove-interest', removeInterest);
    onClick(settings, 'pick-interest', addInterest);
    onClick(settings, 'add-interest', function () {
      addInterest($('#interest-input').value);
    });
    settings.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.id === 'interest-input') {
        e.preventDefault(); // Enter в этом поле добавляет интерес, а не сохраняет всю форму
        addInterest(e.target.value);
      }
    });

    // ── Админ-панель: вкладки, формы и кнопки в таблицах ──
    const admin = $('#admin-content');
    onClick($('#admin-nav'), 'admin', function (tab) {
      state.adminTab = tab;
      editingChannelId = null;
      markTab($('#admin-nav'), 'admin', tab);
      renderAdmin();
    });
    admin.addEventListener('submit', function (e) {
      e.preventDefault(); // не перезагружать страницу
      if (e.target.id === 'channel-form') {
        saveChannel(e.target);
      }
      if (e.target.id === 'announce-form') {
        postAnnouncement(e.target);
      }
    });
    onClick(admin, 'edit-channel', function (id) {
      editingChannelId = Number(id);
      renderAdmin();
    });
    onClick(admin, 'cancel-edit', function () {
      editingChannelId = null;
      renderAdmin();
    });
    onClick(admin, 'block', function (id) { toggleBlock(Number(id)); });
    onClick(admin, 'dismiss', function (id) { dismissReport(Number(id)); });
  }

  // ════════ Навигация и тема ════════

  // Показать экран и нарисовать его. Для профиля — id человека (по умолчанию свой)
  function navigate(screen, profileId) {
    if (screen === 'profile') {
      if (state.screen !== 'profile') {
        state.backTo = state.screen; // запоминаем, откуда пришли
      }
      state.profileId = profileId || state.user.id;
    }
    state.screen = screen;

    // Виден только экран с id="screen-<имя>"
    document.querySelectorAll('.screen').forEach(function (section) {
      section.classList.toggle('is-active', section.id === 'screen-' + screen);
    });
    markTab($('.topnav'), 'nav', screen);
    window.scrollTo(0, 0); // новый экран — с самого верха

    if (screen === 'profile') renderProfile();
    if (screen === 'search') renderSearch();
    if (screen === 'clubs') renderClubs();
    if (screen === 'settings') renderSettings();
    if (screen === 'admin') renderAdmin();
  }

  // Текущая тема: 'light' или 'dark' (её ставит js/theme.js при загрузке)
  function theme() {
    return document.documentElement.dataset.theme;
  }

  // Сменить тему и запомнить её навсегда (localStorage не стирается при закрытии вкладки)
  function setTheme(value) {
    document.documentElement.dataset.theme = value;
    localStorage.setItem('studnet-theme', value);
    if (state.screen === 'settings') {
      renderSettings(); // обновить выбор темы в настройках
    }
  }

  // ════════ Чаты ════════

  // Собеседник в личном чате. У остальных чатов собеседника нет — вернёт undefined
  function partner(chat) {
    if (chat.type !== 'dm') {
      return undefined;
    }
    const otherId = chat.ownerId === state.user.id ? chat.userId : chat.ownerId;
    return userById(otherId);
  }

  // Название чата: у личного — имя собеседника
  function chatName(chat) {
    const other = partner(chat);
    return other ? other.name : chat.name;
  }

  // Картинка чата: у личного — фото собеседника, у остальных — картинка или эмодзи
  function chatPicture(chat) {
    const other = partner(chat);
    const src = other ? other.avatar : chat.avatar;
    if (src) {
      return `<img src="${esc(src)}" class="avatar avatar--md" alt="">`;
    }
    return `<div class="avatar avatar--md avatar--icon">${esc(chat.icon || '💬')}</div>`;
  }

  // Подпись типа чата: «Канал», «Группа»…
  function typeLabel(chat) {
    const info = DATA.chatTypes[chat.type];
    return info ? info.label : chat.type;
  }

  // Ярлык типа чата (цветной значок)
  function typeBadge(chat) {
    return `<span class="chat-type chat-type--${esc(chat.type)}">${esc(typeLabel(chat))}</span>`;
  }

  // Можно ли писать в чат: в каналы (readonly) — только преподавателям
  function canWrite(chat) {
    const info = DATA.chatTypes[chat.type];
    const readonly = info && info.readonly;
    return !readonly || isTeacher(state.user);
  }

  // Кнопки-фильтры над списком чатов: «Все», «Канал», «Группа»…
  // Чаты групп преподавателям не показываются (их не отдаёт сервер), поэтому и фильтра «Группа» у них нет
  function renderChatFilters() {
    const types = Object.keys(DATA.chatTypes).filter(function (type) {
      return type !== 'group' || !isTeacher(state.user);
    });
    if (state.chatFilter !== 'all' && !types.includes(state.chatFilter)) {
      state.chatFilter = 'all';
    }
    let html = '<button class="chat-filter" data-filter="all">Все</button>';
    types.forEach(function (type) {
      const label = DATA.chatTypes[type].label;
      html += `<button class="chat-filter" data-filter="${esc(type)}">${esc(label)}</button>`;
    });
    $('#chat-filters').innerHTML = html;
    markTab($('#chat-filters'), 'filter', state.chatFilter);
  }

  // Показывать ли счётчик непрочитанных: для каналов и остальных чатов — отдельные настройки
  function showUnread(chat) {
    if (!chat.unread) {
      return false;
    }
    const key = chat.type === 'channel' ? 'notifyChannels' : 'notifyUnread';
    return setting(state.user, key);
  }

  // Список чатов слева (с учётом фильтра)
  function renderChatList() {
    const chats = DATA.chats.filter(function (chat) {
      return state.chatFilter === 'all' || chat.type === state.chatFilter;
    });

    if (chats.length === 0) {
      $('#chat-list').innerHTML = '<div class="empty-state">Здесь пока пусто</div>';
      return;
    }

    $('#chat-list').innerHTML = chats.map(function (chat) {
      const active = chat.id === state.chatId ? 'is-active' : '';
      const preview = chat.lastMessage ? esc(chat.lastMessage) : 'Нет сообщений';
      const badge = showUnread(chat) ? `<span class="badge badge--unread">${esc(chat.unread)}</span>` : '';
      return `
        <div class="chat-item ${active}" data-chat="${esc(chat.id)}">
          ${chatPicture(chat)}
          <div class="chat-item__body">
            <div class="chat-item__top">
              <span class="chat-item__name">${esc(chatName(chat))}</span>
              <span class="chat-item__time">${esc(chat.lastTime)}</span>
            </div>
            <div class="chat-item__preview">${preview}</div>
            <div class="chat-item__meta">
              ${typeBadge(chat)}
              ${badge}
            </div>
          </div>
        </div>`;
    }).join('');
  }

  // Открыть чат: заголовок, поле ввода (или «только чтение»), сообщения и панель справа
  async function openChat(chatId) {
    const chat = chatById(chatId);
    if (!chat) {
      return;
    }
    state.chatId = chatId;
    renderChatList();

    // textContent (а не innerHTML) вставляет только текст, поэтому esc здесь не нужен
    $('#chat-title').textContent = chatName(chat);
    $('#chat-meta').textContent = typeLabel(chat) + ' · ' + membersText(chat.members);
    $('#chat-readonly').hidden = canWrite(chat);
    $('#chat-form').hidden = !canWrite(chat);

    await loadMessages(chat, true);
  }

  // Загрузить и нарисовать сообщения чата и панель справа.
  // toBottom = true — прокрутить к последнему сообщению; иначе прокручиваем,
  // только если человек и так был внизу (см. nearBottom)
  async function loadMessages(chat, toBottom) {
    const messages = await API.messages(chat.id);
    if (state.chatId !== chat.id) {
      return; // пока грузили, пользователь открыл другой чат
    }

    // Чат открыт — значит прочитан: убираем счётчик и сообщаем серверу
    if (chat.unread) {
      chat.unread = 0;
      renderChatList();
    }
    API.markRead(chat.id).catch(function () {
      // не получилось — не страшно, отметится в следующий раз
    });

    const box = $('#chat-messages');
    const stick = toBottom || nearBottom(box);
    box.innerHTML = messagesHtml(messages);
    if (stick) {
      scrollToBottom(box);
    }
    renderChatInfo(chat, messages);
  }

  // На телефоне видно что-то одно: список чатов или переписка.
  // Класс is-chat-open на .chat-layout переключает их (см. @media в screens.css)
  function showChat(open) {
    state.chatOpen = open;
    $('.chat-layout').classList.toggle('is-chat-open', open);
  }

  // ════════ Мгновенные сообщения ════════

  // Событие с сервера (см. API.listen и back/events.go)
  function onServerEvent(event) {
    if (event.type === 'message') {
      onNewMessage(event.chatId, event.message);
    } else if (event.type === 'club') {
      onNewClubMessage(Number(event.clubId));
    } else if (event.type === 'resync') {
      resync();
    }
  }

  // Новое сообщение в чате: открытый чат перерисовываем, у остальных обновляем превью и счётчик
  function onNewMessage(chatId, msg) {
    const chat = chatById(chatId);
    if (!chat) {
      reloadChats(); // нам впервые написали в личку — такого чата в списке ещё нет
      return;
    }
    chat.lastMessage = msg.text;
    chat.lastTime = msg.time;
    if (chatId === state.chatId) {
      loadMessages(chat, msg.userId === state.user.id);
    } else if (msg.userId !== state.user.id) {
      chat.unread = (chat.unread || 0) + 1;
    }
    renderChatList();
  }

  // Новое сообщение в чате клуба: обновляем ленту, если этот чат сейчас открыт
  function onNewClubMessage(clubId) {
    const club = clubById(clubId);
    if (club && state.screen === 'clubs' && state.clubId === clubId && state.clubTab === 'chat') {
      refreshClubChat(club);
    }
  }

  // Заново берём список чатов и людей с сервера (новая личка, или связь пропадала и что-то пропустили)
  async function reloadChats() {
    try {
      const fresh = await API.data();
      DATA.chats = fresh.chats;
      DATA.users = fresh.users;
    } catch (e) {
      return; // не вышло — список останется прежним
    }
    renderChatList();
  }

  // Связь с сервером восстановилась: подтягиваем всё, что могли пропустить
  async function resync() {
    await reloadChats();
    const chat = chatById(state.chatId);
    if (chat) {
      loadMessages(chat, false);
    }
    onNewClubMessage(state.clubId);
  }

  // Реакции под сообщением: «👍 3  🔥 2»
  function reactionsHtml(reactions) {
    return (reactions || []).map(function (r) {
      return `<span class="reaction">${esc(r.emoji)} ${esc(r.count)}</span>`;
    }).join('');
  }

  // Одно сообщение. Чужое — слева с аватаркой и именем (по ним можно открыть профиль), своё — справа
  function messageHtml(msg, myName) {
    const author = userById(msg.userId);
    const own = msg.userId === state.user.id;

    // Подсветка, если в чужом сообщении есть моё имя (и включена настройка «Упоминания»)
    const mention = !own && setting(state.user, 'notifyMentions') && msg.text.toLowerCase().includes(myName);

    let classes = 'message';
    if (own) classes += ' message--own';
    if (mention) classes += ' message--mention';

    let authorPhoto = '';
    let authorName = '';
    if (!own) {
      const photo = author ? author.avatar : '';
      const name = author ? author.name : 'Неизвестный';
      authorPhoto = `<img src="${esc(photo)}" class="avatar avatar--sm" alt="" data-user="${esc(msg.userId)}">`;
      authorName = `<div class="message__author" data-user="${esc(msg.userId)}">${esc(name)}</div>`;
    }

    const reactions = reactionsHtml(msg.reactions);
    return `
      <div class="${classes}">
        ${authorPhoto}
        <div class="message__bubble">
          ${authorName}
          <div class="message__text">${esc(msg.text)}</div>
          <div class="message__time">${esc(msg.time)}</div>
          ${reactions ? `<div class="reactions">${reactions}</div>` : ''}
        </div>
      </div>`;
  }

  // Все сообщения чата
  function messagesHtml(messages) {
    if (messages.length === 0) {
      return '<div class="empty-state">Сообщений пока нет. Напишите первым!</div>';
    }
    const myName = state.user.name.split(' ')[0].toLowerCase(); // имя без фамилии: «яша»
    return messages.map(function (msg) { return messageHtml(msg, myName); }).join('');
  }

  // Человек строкой: аватарка, имя и группа. Клик — открыть профиль
  function personHtml(user, extraClass) {
    const subtitle = isTeacher(user) ? 'Преподаватель' : user.group;
    return `
      <div class="person ${extraClass || ''}" data-user="${esc(user.id)}">
        ${avatar(user, 'sm')}
        <div>
          <div class="person__name">${esc(user.name)}</div>
          <div class="person__about">${esc(subtitle)}</div>
        </div>
      </div>`;
  }

  // Панель справа: описание чата и люди в нём.
  // В личном чате — двое собеседников, в остальных — те, кто писал в чат
  function renderChatInfo(chat, messages) {
    let ids;
    if (chat.type === 'dm') {
      ids = [chat.ownerId, chat.userId];
    } else {
      ids = messages.map(function (m) { return m.userId; });
    }
    // new Set убирает повторы: один человек мог написать много сообщений
    const people = Array.from(new Set(ids)).map(userById).filter(Boolean);
    const peopleHtml = people.map(function (u) { return personHtml(u); }).join('');

    $('#chat-info').innerHTML = `
      <div class="chat-info__title">${esc(chatName(chat))}</div>
      ${typeBadge(chat)}
      <p class="chat-info__desc">${esc(chat.description)}</p>
      <h4 class="section-title">${chat.type === 'dm' ? 'Участники' : 'Писали в чат'}</h4>
      ${peopleHtml || '<p class="muted">Пока никто не писал</p>'}`;
  }

  // Отправка сообщения (кнопка или Enter)
  async function sendMessage(e) {
    e.preventDefault();
    const input = $('#message-input');
    const text = input.value.trim();
    const chat = chatById(state.chatId);
    if (!text || !chat) {
      return;
    }

    try {
      await API.sendMessage(chat.id, text);
    } catch (err) {
      alert(err.message);
      return;
    }
    input.value = '';
    // Обновляем превью в списке чатов и перерисовываем переписку
    chat.lastMessage = text;
    chat.lastTime = API.now();
    openChat(chat.id);
  }

  // Открыть личный чат с человеком. Если его ещё нет — сервер (или LOCAL) создаст
  async function openDm(userId) {
    let chat = DATA.chats.find(function (c) {
      const other = partner(c);
      return other && other.id === userId;
    });

    if (!chat) {
      try {
        chat = await API.openDm(userId);
      } catch (err) {
        alert(err.message);
        return;
      }
      DATA.chats.push(chat);
    }

    state.chatFilter = 'all'; // чтобы чат точно был виден в списке
    renderChatFilters();
    navigate('main');
    openChat(chat.id);
    showChat(true);
  }

  // ════════ Профиль ════════

  // Профиль: кнопка «Назад», фото, кто это, статус, «Написать» (у чужого), о себе и интересы
  function renderProfile() {
    const user = userById(state.profileId) || state.user;
    const own = user.id === state.user.id;

    // Кнопка «Написать» — только в чужом профиле и только если человек разрешил
    let writeButton = '';
    if (!own && canMessage(user)) {
      writeButton = `<button class="btn btn--primary btn--pill" data-write="${esc(user.id)}">${ICON_MESSAGE} Написать сообщение</button>`;
    } else if (!own) {
      writeButton = '<p class="muted">Пользователь ограничил личные сообщения</p>';
    }

    let bioHtml = '';
    if (user.bio) {
      bioHtml = `<h3 class="section-title">О себе</h3><p>${esc(user.bio)}</p>`;
    }

    let interestsHtml = '';
    if (tags(user.interests)) {
      interestsHtml = `<h3 class="section-title">Интересы</h3><div class="tag-list">${tags(user.interests)}</div>`;
    }

    $('#profile').innerHTML = `
      <button class="btn btn--ghost btn--sm back-btn" data-back>← Назад</button>
      <div class="profile-header">
        ${avatar(user, 'xl')}
        <div>
          <h1 class="profile-header__name">${esc(user.name)}</h1>
          <p class="profile-header__about">${esc(about(user))}</p>
          <p class="profile-header__status">${dot(user)} ${user.online ? 'В сети' : 'Не в сети'}</p>
          ${writeButton}
        </div>
      </div>
      ${bioHtml}
      ${interestsHtml}`;
  }

  // ════════ Поиск ════════

  // Карточка человека в поиске
  function userCardHtml(user) {
    let writeButton;
    if (canMessage(user)) {
      writeButton = `<button class="btn btn--secondary btn--sm btn--pill" data-write="${esc(user.id)}">${ICON_MESSAGE} Написать</button>`;
    } else {
      writeButton = '<span class="muted">Не принимает сообщения</span>';
    }
    const firstInterests = (user.interests || []).slice(0, 3); // на карточке — только три интереса
    return `
      <div class="user-card" data-user="${esc(user.id)}">
        ${avatar(user, 'lg')}
        <div class="user-card__name">${esc(user.name)}</div>
        <div class="user-card__about">${esc(about(user))}</div>
        <div class="tag-list">${tags(firstInterests)}</div>
        ${writeButton}
      </div>`;
  }

  // Карточки людей по строке поиска в шапке и фильтрам слева (себя не показываем).
  // Группы сравниваем без учёта регистра: в фильтре «исп341», у людей «ИСП341»
  function renderSearch() {
    const name = $('#global-search').value.trim().toLowerCase();
    const group = $('#filter-group').value.toLowerCase();
    const direction = $('#filter-direction').value;
    const course = Number($('#filter-course').value); // 0, если выбрано «Все курсы»
    const onlineOnly = $('#filter-online').checked;

    const users = DATA.users.filter(function (u) {
      if (u.id === state.user.id) return false;
      if (name && !u.name.toLowerCase().includes(name)) return false;
      if (group && (u.group || '').toLowerCase() !== group) return false;
      if (direction && u.direction !== direction) return false;
      if (course && u.course !== course) return false;
      if (onlineOnly && !u.online) return false;
      return true;
    });

    $('#search-count').textContent = users.length;
    if (users.length === 0) {
      $('#user-cards').innerHTML = '<div class="empty-state">Никого не нашли — попробуйте изменить фильтры</div>';
    } else {
      $('#user-cards').innerHTML = users.map(userCardHtml).join('');
    }
  }

  // ════════ Клубы ════════

  // Карточка клуба в каталоге
  function clubCardHtml(club) {
    const myBadge = inClub(club) ? '<span class="badge badge--accent">Вы в клубе</span>' : '';
    return `
      <div class="club-card" data-club="${esc(club.id)}">
        <div class="club-card__banner">${esc(club.emoji)}</div>
        <div class="club-card__body">
          <div class="club-card__name">${esc(club.name)}</div>
          <div class="club-card__desc">${esc(club.description)}</div>
          <div class="club-card__footer">
            <span>${esc(membersText(club.memberIds.length))}</span>
            <span>
              ${myBadge}
              <span class="badge">${esc(club.category)}</span>
            </span>
          </div>
        </div>
      </div>`;
  }

  // Каталог клубов или страница открытого клуба
  function renderClubs() {
    const club = clubById(state.clubId);
    $('#clubs-catalog').hidden = Boolean(club);
    $('#club-page').hidden = !club;
    if (club) {
      renderClubPage(club);
      return;
    }

    const clubs = DATA.clubs.filter(function (c) {
      return state.clubsView === 'all' || inClub(c);
    });
    if (clubs.length === 0) {
      $('#club-cards').innerHTML = '<div class="empty-state">Вы пока не вступили ни в один клуб</div>';
    } else {
      $('#club-cards').innerHTML = clubs.map(clubCardHtml).join('');
    }
  }

  // Страница клуба: шапка с кнопкой «Вступить / Выйти», вкладки «Участники» и «Чат клуба»
  function renderClubPage(club) {
    const member = inClub(club);
    const buttonClass = member ? 'btn--secondary' : 'btn--primary';
    const buttonText = member ? 'Выйти из клуба' : 'Вступить в клуб';

    $('#club-page').innerHTML = `
      <button class="btn btn--ghost btn--sm back-btn" data-club-back>← Назад к каталогу</button>
      <div class="club-header">
        <div class="club-header__banner">${esc(club.emoji)}</div>
        <div>
          <h2 class="club-header__name">${esc(club.name)}</h2>
          <p class="club-header__desc">${esc(club.description)}</p>
          <div class="club-header__meta">
            <span class="badge">${esc(club.category)}</span>
            <span class="badge">${esc(membersText(club.memberIds.length))}</span>
            <span class="muted">Админ: ${esc(club.admin)}</span>
          </div>
          <button class="btn btn--pill ${buttonClass}" data-club-toggle>${buttonText}</button>
        </div>
      </div>
      <div class="tabs" id="club-tabs">
        <button data-club-tab="members">Участники</button>
        <button data-club-tab="chat">Чат клуба</button>
      </div>
      <div id="club-tab"></div>`;

    markTab($('#club-tabs'), 'club-tab', state.clubTab);
    renderClubTab(club);
  }

  // Содержимое вкладки клуба: участники или чат (писать могут только участники)
  async function renderClubTab(club) {
    // Вкладка «Участники»
    if (state.clubTab !== 'chat') {
      const people = club.memberIds.map(userById).filter(Boolean);
      if (people.length === 0) {
        $('#club-tab').innerHTML = '<div class="empty-state">В клубе пока никого нет</div>';
      } else {
        const cards = people.map(function (u) { return personHtml(u, 'person--card'); }).join('');
        $('#club-tab').innerHTML = `<div class="people-grid">${cards}</div>`;
      }
      return;
    }

    // Вкладка «Чат клуба»
    const messages = await API.clubMessages(club.id);
    if (state.clubId !== club.id || state.clubTab !== 'chat') {
      return; // пока грузили, открыли другое
    }

    let inputHtml;
    if (inClub(club)) {
      inputHtml = `
        <form class="chat-input__form club-chat__input">
          <input type="text" id="club-input" placeholder="Написать в чат клуба…" autocomplete="off" maxlength="2000">
          <button class="btn btn--primary btn--icon" title="Отправить">${ICON_SEND}</button>
        </form>`;
    } else {
      inputHtml = '<div class="chat-input__readonly club-chat__input">Вступите в клуб, чтобы писать в чат</div>';
    }

    $('#club-tab').innerHTML = `
      <div class="chat-messages club-chat">${messagesHtml(messages)}</div>
      ${inputHtml}`;
    scrollToBottom($('.club-chat'));
  }

  // Пришло новое сообщение в открытый чат клуба: обновляем только ленту,
  // чтобы не стереть то, что человек сейчас набирает в поле ввода
  async function refreshClubChat(club) {
    const messages = await API.clubMessages(club.id);
    const box = $('.club-chat');
    if (!box || state.clubId !== club.id || state.clubTab !== 'chat') {
      return; // пока грузили, открыли другое
    }
    const stick = nearBottom(box);
    box.innerHTML = messagesHtml(messages);
    if (stick) {
      scrollToBottom(box);
    }
  }

  // Вступить в открытый клуб или выйти из него
  async function toggleClub() {
    const club = clubById(state.clubId);
    try {
      const result = await API.toggleClub(club.id);
      club.memberIds = result.memberIds;
    } catch (err) {
      alert(err.message);
      return;
    }
    renderClubPage(club);
  }

  // Отправка сообщения в чат клуба
  async function sendClubMessage(e) {
    e.preventDefault();
    const text = $('#club-input').value.trim();
    if (!text) {
      return;
    }
    try {
      await API.sendClubMessage(state.clubId, text);
    } catch (err) {
      alert(err.message);
      return;
    }
    await renderClubTab(clubById(state.clubId));
    $('#club-input').focus();
  }

  // ════════ Настройки ════════

  // ── Интересы ──
  // Пока человек редактирует профиль, интересы копятся здесь, а сохраняются кнопкой «Сохранить»
  let myInterests = [];
  const MAX_INTERESTS = 10;

  // Подсказки: интересы других людей, самые популярные первыми (кроме уже выбранных)
  function suggestedInterests() {
    // Считаем, сколько раз встречается каждый интерес: {"Python": 3, "Кошки": 2, ...}
    const count = {};
    DATA.users.forEach(function (u) {
      (u.interests || []).filter(Boolean).forEach(function (item) {
        count[item] = (count[item] || 0) + 1;
      });
    });

    const chosen = myInterests.map(function (i) { return i.toLowerCase(); });
    return Object.keys(count)
      .filter(function (item) { return !chosen.includes(item.toLowerCase()); })
      .sort(function (a, b) { return count[b] - count[a]; })
      .slice(0, 15);
  }

  // Добавить интерес: без пробелов по краям, не пустой, без повторов, не больше MAX_INTERESTS
  function addInterest(text) {
    const item = text.trim().slice(0, 30);
    if (!item) {
      return;
    }
    const alreadyAdded = myInterests.some(function (i) { return i.toLowerCase() === item.toLowerCase(); });
    if (alreadyAdded) {
      return;
    }
    if (myInterests.length >= MAX_INTERESTS) {
      alert('Можно выбрать не больше ' + MAX_INTERESTS + ' интересов');
      return;
    }
    myInterests.push(item);
    renderInterests();
    $('#interest-input').focus();
  }

  // Убрать интерес из списка
  function removeInterest(item) {
    myInterests = myInterests.filter(function (i) { return i !== item; });
    renderInterests();
  }

  // Блок «Интересы» в настройках: выбранные (клик — удалить), поле для своего, подсказки.
  // Перерисовываем только его, чтобы не стереть то, что человек уже ввёл в других полях
  function renderInterests() {
    let chosenHtml = myInterests.map(function (item) {
      return `<button type="button" class="tag tag--removable" data-remove-interest="${esc(item)}" title="Убрать">${esc(item)} ✕</button>`;
    }).join('');
    if (!chosenHtml) {
      chosenHtml = '<span class="muted">Пока ничего не выбрано</span>';
    }

    const suggestHtml = suggestedInterests().map(function (item) {
      return `<button type="button" class="tag tag--suggest" data-pick-interest="${esc(item)}">+ ${esc(item)}</button>`;
    }).join('');

    $('#interests-editor').innerHTML = `
      <div class="tag-list">${chosenHtml}</div>
      <div class="interest-input">
        <input type="text" id="interest-input" placeholder="Свой интерес, например «Гитара»" maxlength="30" autocomplete="off">
        <button type="button" class="btn btn--secondary" data-add-interest>Добавить</button>
      </div>
      <p class="muted">Или выберите из популярных:</p>
      <div class="tag-list">${suggestHtml}</div>`;
  }

  // Кнопка «Сохранить» в настройках профиля: отправляем имя, email, «о себе» и интересы
  async function saveProfile(e) {
    e.preventDefault(); // не перезагружать страницу
    const form = e.target;
    const fields = {
      name: form.elements.name.value,
      email: form.elements.email.value,
      bio: form.elements.bio.value,
      interests: myInterests,
    };

    let updated;
    try {
      updated = await API.updateMe(fields);
    } catch (err) {
      alert(err.message);
      return;
    }

    // Обновляем себя везде: в state и в списке пользователей (там имя видят чаты, поиск, клубы)
    Object.assign(state.user, updated);
    Object.assign(userById(state.user.id), updated);
    renderSettings();
    $('#save-status').textContent = '✓ Изменения сохранены';
  }

  // Строка настроек с переключателем; key — название настройки (см. SETTING_DEFAULTS).
  // Здесь все тексты — наши собственные, поэтому esc не нужен
  function toggleRow(key, label, description) {
    const on = setting(state.user, key) ? 'toggle--on' : '';
    return `
      <div class="settings-row">
        <div>
          <div class="settings-row__label">${label}</div>
          <p class="muted">${description}</p>
        </div>
        <div class="toggle ${on}" data-setting="${key}"></div>
      </div>`;
  }

  // Клик по переключателю: сохраняем новое значение и сразу применяем
  async function toggleSetting(key) {
    const value = !setting(state.user, key);
    try {
      await API.saveSetting(key, value);
    } catch (err) {
      alert(err.message);
      return;
    }
    state.user[key] = value;
    userById(state.user.id)[key] = value;
    applySettings();
    renderSettings();
  }

  // Применить настройки к интерфейсу: компактный режим, счётчики, подсветка упоминаний
  function applySettings() {
    document.documentElement.classList.toggle('compact', setting(state.user, 'compact'));
    renderChatList();
    if (state.chatId) {
      openChat(state.chatId); // перерисовать сообщения (подсветку упоминаний)
    }
  }

  // Карточка выбора темы
  function themeOption(value, label) {
    const active = theme() === value ? 'is-active' : '';
    return `
      <div class="theme-option ${active}" data-set-theme="${value}">
        <div class="theme-option__preview theme-option__preview--${value}"></div>
        ${label}
      </div>`;
  }

  // Вкладка «Профиль». maxlength — такие же ограничения, как на сервере (back/api.go)
  function profilePanel(user) {
    return `
      <h3>Профиль</h3>
      <form id="profile-form">
        <div class="field"><label>Имя</label><input type="text" name="name" value="${esc(user.name)}" maxlength="50" required></div>
        <div class="field"><label>Email</label><input type="email" name="email" value="${esc(user.email)}" maxlength="100"></div>
        <div class="field"><label>Группа</label><input type="text" value="${esc(user.group)}" disabled></div>
        <div class="field"><label>О себе</label><textarea name="bio" rows="3" maxlength="500">${esc(user.bio)}</textarea></div>
        <div class="field"><label>Интересы</label><div id="interests-editor"></div></div>
        <button class="btn btn--primary">Сохранить</button>
        <span class="save-status" id="save-status"></span>
      </form>`;
  }

  function notificationsPanel() {
    return `
      <h3>Уведомления</h3>
      ${toggleRow('notifyUnread', 'Новые сообщения', 'Показывать число непрочитанных сообщений в чатах')}
      ${toggleRow('notifyChannels', 'Объявления', 'Показывать число новых объявлений в каналах')}
      ${toggleRow('notifyMentions', 'Упоминания', 'Подсвечивать сообщения, где упоминается ваше имя')}`;
  }

  function appearancePanel() {
    return `
      <h3>Внешний вид</h3>
      <div class="field">
        <label>Тема оформления</label>
        <div class="theme-picker">${themeOption('light', 'Светлая')}${themeOption('dark', 'Тёмная')}</div>
      </div>
      ${toggleRow('compact', 'Компактный режим', 'Уменьшенные отступы в чатах')}`;
  }

  function privacyPanel() {
    return `
      <h3>Приватность</h3>
      ${toggleRow('showOnline', 'Показывать статус онлайн', 'Если выключить, другие будут видеть вас «не в сети»')}
      ${toggleRow('showGroup', 'Показывать группу', 'Если выключить, группу не будет видно в профиле и поиске')}
      ${toggleRow('allowMessages', 'Разрешить личные сообщения', 'Если выключить, новые люди не смогут вам написать')}`;
  }

  // Содержимое выбранной вкладки настроек
  function renderSettings() {
    const tab = state.settingsTab;
    let html;
    if (tab === 'notifications') {
      html = notificationsPanel();
    } else if (tab === 'appearance') {
      html = appearancePanel();
    } else if (tab === 'privacy') {
      html = privacyPanel();
    } else {
      html = profilePanel(state.user);
    }
    $('#settings-content').innerHTML = html;

    // На вкладке «Профиль» заполняем блок интересов текущими интересами человека
    if ($('#interests-editor')) {
      myInterests = (state.user.interests || []).filter(Boolean);
      renderInterests();
    }
  }

  // ════════ Админ-панель (видит только администратор) ════════
  // Кнопку «Админ» видит только администратор, но настоящая проверка — на сервере
  // (adminOnly в back/api.go): спрятанную кнопку легко «показать» через инструменты браузера.

  // Какой канал сейчас редактируется в форме (null — форма создаёт новый)
  let editingChannelId = null;

  // Таблица: headers — заголовки, rows — строки (каждая строка — массив ячеек).
  // Ячейки должны быть уже безопасным HTML (с esc там, где есть данные)
  function table(headers, rows) {
    const head = headers.map(function (h) { return `<th>${h}</th>`; }).join('');
    const body = rows.map(function (row) {
      const cells = row.map(function (cell) { return `<td>${cell}</td>`; }).join('');
      return `<tr>${cells}</tr>`;
    }).join('');
    return `
      <div class="table-wrap">
        <table>
          <thead><tr>${head}</tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>`;
  }

  // Карточка с цифрой для «Обзора»
  function stat(value, label) {
    return `<div class="stat"><div class="stat__value">${esc(value)}</div><div class="muted">${label}</div></div>`;
  }

  // Имя человека-ссылкой (клик — профиль)
  function userLink(user) {
    if (!user) {
      return '<span class="muted">Удалённый пользователь</span>';
    }
    return `<span class="link" data-user="${esc(user.id)}">${esc(user.name)}</span>`;
  }

  // Кнопка «Заблокировать / Разблокировать» (администратора заблокировать нельзя)
  function blockButton(user) {
    if (user.isAdmin) {
      return '<span class="muted">Администратор</span>';
    }
    const color = user.blocked ? 'btn--secondary' : 'btn--danger';
    const text = user.blocked ? 'Разблокировать' : 'Заблокировать';
    return `<button class="btn btn--sm ${color}" data-block="${esc(user.id)}">${text}</button>`;
  }

  // Каналы — это чаты с типом channel
  function allChannels() {
    return DATA.chats.filter(function (c) { return c.type === 'channel'; });
  }

  // Вкладка «Обзор»: главные цифры
  async function dashboardTab() {
    const s = await API.adminStats();
    return `
      <h3>Обзор</h3>
      <div class="stat-grid">
        ${stat(s.totalUsers, 'Пользователей')}
        ${stat(s.onlineNow, 'Онлайн сейчас')}
        ${stat(s.activeChats, 'Чатов')}
        ${stat(s.pendingReports, 'Жалоб')}
      </div>`;
  }

  // Вкладка «Каналы»: форма (создать новый или изменить выбранный) и список каналов
  function channelsTab() {
    const editing = chatById(editingChannelId);
    const title = editing ? 'Редактирование: ' + esc(editing.name) : 'Новый канал';
    const name = editing ? editing.name : '';
    const description = editing ? editing.description : '';
    const buttonText = editing ? 'Сохранить' : 'Создать канал';
    const cancelButton = editing ? '<button type="button" class="btn btn--ghost" data-cancel-edit>Отмена</button>' : '';

    const rows = allChannels().map(function (c) {
      return [
        esc(c.name),
        esc(c.description),
        esc(c.members),
        `<button class="btn btn--ghost btn--sm" data-edit-channel="${esc(c.id)}">Редактировать</button>`,
      ];
    });

    return `
      <h3>Каналы</h3>
      <form class="card admin-form" id="channel-form">
        <h4>${title}</h4>
        <div class="field"><label>Название</label><input name="name" value="${esc(name)}" maxlength="60" required></div>
        <div class="field"><label>Описание</label><textarea name="description" rows="2" maxlength="300">${esc(description)}</textarea></div>
        <button class="btn btn--primary">${buttonText}</button>
        ${cancelButton}
      </form>
      ${table(['Название', 'Описание', 'Подписчиков', ''], rows)}`;
  }

  // Вкладка «Пользователи»: все, с кнопкой блокировки
  function usersTab() {
    const rows = DATA.users.map(function (u) {
      let status;
      if (u.blocked) {
        status = '<span class="badge badge--danger">Заблокирован</span>';
      } else {
        status = dot(u) + (u.online ? ' Онлайн' : ' Офлайн');
      }
      return [
        userLink(u),
        esc(u.email),
        esc(u.group),
        isTeacher(u) ? 'Преподаватель' : 'Студент',
        status,
        blockButton(u),
      ];
    });
    return `
      <h3>Пользователи</h3>
      ${table(['Имя', 'Email', 'Группа', 'Роль', 'Статус', ''], rows)}`;
  }

  // Вкладка «Модерация»: жалобы. «Отклонить» — убрать жалобу, «Заблокировать» — заблокировать нарушителя
  async function moderationTab() {
    const list = await API.reports();
    if (list.length === 0) {
      return '<h3>Модерация</h3><div class="empty-state">Жалоб нет 🎉</div>';
    }
    const rows = list.map(function (r) {
      return [
        userLink(userById(r.userId)),
        esc(r.reason),
        esc(r.time),
        `<div class="actions">
           <button class="btn btn--ghost btn--sm" data-dismiss="${esc(r.id)}">Отклонить</button>
           <button class="btn btn--danger btn--sm" data-block="${esc(r.userId)}">Заблокировать</button>
         </div>`,
      ];
    });
    return '<h3>Модерация</h3>' + table(['На кого', 'Причина', 'Когда', ''], rows);
  }

  // Вкладка «Объявления»: форма (сообщение в канал) и все сообщения из каналов, новые сверху
  async function announcementsTab() {
    const channels = allChannels();

    // Загружаем сообщения всех каналов сразу (параллельно), а не по очереди
    const lists = await Promise.all(channels.map(function (c) { return API.messages(c.id); }));

    const rows = [];
    channels.forEach(function (channel, i) {
      lists[i].forEach(function (m) {
        const author = userById(m.userId);
        rows.push([esc(m.text), esc(channel.name), esc(author ? author.name : ''), esc(m.time)]);
      });
    });
    rows.reverse(); // новые сверху

    const options = channels.map(function (c) {
      return `<option value="${esc(c.id)}">${esc(c.name)}</option>`;
    }).join('');

    return `
      <h3>Объявления</h3>
      <form class="card admin-form" id="announce-form">
        <h4>Новое объявление</h4>
        <div class="field">
          <label>Канал</label>
          <select name="chatId">${options}</select>
        </div>
        <div class="field"><label>Текст</label><textarea name="text" rows="3" maxlength="2000" required></textarea></div>
        <button class="btn btn--primary">Опубликовать</button>
      </form>
      ${table(['Текст', 'Канал', 'Автор', 'Время'], rows)}`;
  }

  // Содержимое выбранной вкладки админ-панели
  async function renderAdmin() {
    const tab = state.adminTab;
    let html = '';
    if (tab === 'dashboard') html = await dashboardTab();
    if (tab === 'channels') html = channelsTab();
    if (tab === 'users') html = usersTab();
    if (tab === 'moderation') html = await moderationTab();
    if (tab === 'announcements') html = await announcementsTab();

    // Пока грузили данные, человек мог переключить вкладку — тогда старое не рисуем
    if (state.adminTab === tab) {
      $('#admin-content').innerHTML = html;
    }
  }

  // Форма канала: создать новый или сохранить изменения
  async function saveChannel(form) {
    const fields = {
      name: form.elements.name.value,
      description: form.elements.description.value,
    };
    try {
      if (editingChannelId) {
        const updated = await API.updateChannel(editingChannelId, fields);
        Object.assign(chatById(editingChannelId), updated);
      } else {
        const created = await API.createChannel(fields);
        DATA.chats.push(created);
      }
    } catch (err) {
      alert(err.message);
      return;
    }
    editingChannelId = null;
    renderChatList(); // новый или переименованный канал сразу виден в чатах
    renderAdmin();
  }

  // Форма объявления: отправляем сообщение в выбранный канал
  async function postAnnouncement(form) {
    const chat = chatById(Number(form.elements.chatId.value));
    const text = form.elements.text.value.trim();
    if (!chat) {
      alert('Сначала создайте канал');
      return;
    }
    try {
      await API.sendMessage(chat.id, text);
    } catch (err) {
      alert(err.message);
      return;
    }
    chat.lastMessage = text;
    chat.lastTime = API.now();
    renderChatList();
    renderAdmin();
  }

  // Заблокировать или разблокировать человека (с подтверждением)
  async function toggleBlock(userId) {
    const user = userById(userId);
    if (!user) {
      return;
    }
    const blocked = !user.blocked; // что хотим сделать: true — заблокировать
    const action = blocked ? 'Заблокировать' : 'Разблокировать';
    // confirm показывает обычный текст, а не HTML, поэтому имя тут безопасно
    if (!confirm(action + ' пользователя ' + user.name + '?')) {
      return;
    }
    try {
      await API.blockUser(userId, blocked);
    } catch (err) {
      alert(err.message);
      return;
    }
    user.blocked = blocked;
    if (blocked) {
      user.online = false;
    }
    renderAdmin();
  }

  // Отклонить жалобу
  async function dismissReport(reportId) {
    try {
      await API.dismissReport(reportId);
    } catch (err) {
      alert(err.message);
      return;
    }
    renderAdmin();
  }

})();
