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
 */

(function () {
  'use strict';

  // ════════ Данные и состояние ════════

  let DATA = null;

  const state = {
    user: null,             // кто вошёл
    screen: 'main',         // открытый экран: main, search, clubs, settings, admin, profile
    backTo: 'main',         // куда вернёт кнопка «Назад» в профиле
    profileId: null,        // чей профиль открыт
    chatId: null,           // открытый чат
    chatFilter: 'all',      // фильтр над списком чатов
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
    if (!state.user) return; // не вошли или выходим — сохранять нечего
    const { user, ...rest } = state;
    sessionStorage.setItem(STATE_KEY, JSON.stringify(rest));
  }

  function restoreState() {
    try {
      Object.assign(state, JSON.parse(sessionStorage.getItem(STATE_KEY)));
    } catch {
      // сохранённого нет или оно испорчено — остаёмся на значениях по умолчанию
    }
  }

  // ════════ Помощники ════════

  const $ = (selector) => document.querySelector(selector);

  // Защита от «вредного» текста: превращает < > & и кавычки в безопасные символы.
  // Без этого сообщение вида <img onerror=...> выполнилось бы у всех, кто его увидит.
  const esc = (text) => String(text ?? '').replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

  const userById = (id) => DATA.users.find(u => u.id === id);
  const chatById = (id) => DATA.chats.find(c => c.id === id);
  const clubById = (id) => DATA.clubs.find(c => c.id === id);
  const isTeacher = (user) => user.role === 'teacher';
  const inClub = (club) => club.memberIds.includes(state.user.id);
  const scrollToBottom = (el) => { el.scrollTop = el.scrollHeight; };

  // Настройки человека (переключатели на экране «Настройки»).
  // С сервера приходят 1/0, без сервера — true/false, а если настройку не трогали — берём значение по умолчанию
  const SETTING_DEFAULTS = {
    notifyUnread: true, notifyChannels: true, notifyMentions: true,
    compact: false, showOnline: true, showGroup: true, allowMessages: true,
  };
  const setting = (user, key) => Boolean(user[key] ?? SETTING_DEFAULTS[key]);

  // Можно ли написать человеку: он разрешил сообщения или переписка с ним уже есть
  const canMessage = (user) => setting(user, 'allowMessages') || DATA.chats.some(c => partner(c)?.id === user.id);

  // Число со словом в нужной форме: «1 участник», «3 участника», «25 участников»
  function plural(n, one, few, many) {
    const last = n % 10, lastTwo = n % 100;
    if (last === 1 && lastTwo !== 11) return `${n} ${one}`;
    if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return `${n} ${few}`;
    return `${n} ${many}`;
  }
  const members = (n) => plural(n, 'участник', 'участника', 'участников');

  // Точка «в сети / не в сети» и аватарка с ней (size: xs, sm, md, lg, xl)
  const dot = (user) => `<span class="status-dot ${user.online ? 'status-dot--online' : ''}"></span>`;
  const avatar = (user, size) => `
    <div class="avatar-wrap">
      <img src="${user.avatar}" class="avatar avatar--${size}" alt="">
      ${dot(user)}
    </div>`;

  // Кто этот человек: «ИСП341 · 3 курс · Информационные системы…» или «Преподаватель · …»
  function about(user) {
    const parts = isTeacher(user)
      ? ['Преподаватель', user.direction]
      : [user.group, user.course && `${user.course} курс`, user.direction];
    return parts.filter(Boolean).join(' · ');
  }

  // Теги-интересы (пустые пропускаем)
  const tags = (list) => list.filter(Boolean).map(i => `<span class="tag">${esc(i)}</span>`).join('');

  // Иконки для кнопок «Написать» и «Отправить»
  const ICON_MESSAGE = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  const ICON_SEND = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>';

  // Подсветить активную кнопку среди кнопок с атрибутом data-<attr> внутри root
  function markTab(root, attr, value) {
    root.querySelectorAll(`[data-${attr}]`).forEach(btn => {
      btn.classList.toggle('is-active', btn.getAttribute(`data-${attr}`) === value);
    });
  }

  // Клик по элементу с атрибутом data-<attr> внутри root → handler(значение атрибута).
  // Обработчик висит на root, поэтому работает и для элементов, нарисованных позже.
  function onClick(root, attr, handler) {
    root.addEventListener('click', (e) => {
      const el = e.target.closest(`[data-${attr}]`);
      if (el) handler(el.getAttribute(`data-${attr}`));
    });
  }

  // ════════ Запуск, вход и выход ════════

  document.addEventListener('DOMContentLoaded', start);

  // Если в этой вкладке уже входили (есть токен) — проверяем его и сразу открываем приложение
  async function start() {
    bindEvents();
    if (!API.hasToken()) return;
    try {
      await enterApp(await API.me());
    } catch {
      await API.logout(); // токен устарел или сервер пропал — просим войти заново
      document.documentElement.classList.remove('logged-in');
    }
  }

  // Код доступа: оставляем только цифры (не больше 9) и сами ставим дефис после каждых трёх — 123-456-789
  function formatCode(e) {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 9);
    e.target.value = digits.match(/.{1,3}/g)?.join('-') ?? '';
  }

  // Отправка формы входа
  async function login(e) {
    e.preventDefault(); // не перезагружать страницу
    try {
      await enterApp(await API.login($('#login-code').value));
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
    $('#admin-link').hidden = !user.isAdmin; // админ-панель — только администратору
    if (state.screen === 'admin' && !user.isAdmin) state.screen = 'main';

    // Варианты для фильтров поиска
    $('#filter-group').innerHTML += DATA.groups.map(g => `<option>${esc(g)}</option>`).join('');
    $('#filter-direction').innerHTML += DATA.directions.map(d => `<option>${esc(d)}</option>`).join('');

    // Подсвечиваем сохранённые вкладки
    markTab($('#clubs-tabs'), 'clubs-view', state.clubsView);
    markTab($('#settings-nav'), 'settings', state.settingsTab);
    markTab($('#admin-nav'), 'admin', state.adminTab);

    document.documentElement.classList.add('logged-in');
    document.documentElement.classList.toggle('compact', setting(user, 'compact')); // компактный режим из настроек
    renderChatFilters();
    openChat(chatById(state.chatId) ? state.chatId : DATA.chats[0]?.id);
    navigate(state.screen, state.profileId);
  }

  // ════════ Обработчики событий ════════

  function bindEvents() {
    window.addEventListener('pagehide', saveState); // страница обновляется или закрывается
    $('#form-login').addEventListener('submit', login);
    $('#login-code').addEventListener('input', formatCode);
    $('#logout').addEventListener('click', logout);
    $('#theme-toggle').addEventListener('click', () => setTheme(theme() === 'light' ? 'dark' : 'light'));
    onClick(document, 'nav', (screen) => navigate(screen));

    // Люди в любом месте сайта: «Написать» → личный чат, аватарка / имя / карточка → профиль.
    // «Назад» в профиле → на экран, откуда пришли
    document.addEventListener('click', (e) => {
      const write = e.target.closest('[data-write]');
      const person = e.target.closest('[data-user]');
      if (write) openDm(+write.dataset.write);
      else if (person) navigate('profile', +person.dataset.user);
      else if (e.target.closest('[data-back]')) navigate(state.backTo);
    });

    // Чаты
    onClick($('#chat-filters'), 'filter', (type) => {
      state.chatFilter = type;
      markTab($('#chat-filters'), 'filter', type);
      renderChatList();
    });
    onClick($('#chat-list'), 'chat', (id) => openChat(+id));
    $('#chat-form').addEventListener('submit', sendMessage);

    // Поиск: строка в шапке и фильтры слева
    $('#global-search').addEventListener('input', () => state.screen === 'search' ? renderSearch() : navigate('search'));
    ['#filter-group', '#filter-direction', '#filter-course', '#filter-online'].forEach(sel => {
      $(sel).addEventListener('change', renderSearch);
    });
    $('#reset-filters').addEventListener('click', () => {
      $('#global-search').value = $('#filter-group').value = $('#filter-direction').value = $('#filter-course').value = '';
      $('#filter-online').checked = false;
      renderSearch();
    });

    // Клубы: вкладки «Все / Мои», карточки, страница клуба
    onClick($('#clubs-tabs'), 'clubs-view', (view) => {
      state.clubsView = view;
      markTab($('#clubs-tabs'), 'clubs-view', view);
      renderClubs();
    });
    onClick($('#club-cards'), 'club', (id) => {
      state.clubId = +id;
      state.clubTab = 'members';
      renderClubs();
      window.scrollTo(0, 0);
    });
    onClick($('#club-page'), 'club-back', () => { state.clubId = null; renderClubs(); });
    onClick($('#club-page'), 'club-toggle', toggleClub);
    onClick($('#club-page'), 'club-tab', (tab) => {
      state.clubTab = tab;
      markTab($('#club-tabs'), 'club-tab', tab);
      renderClubTab(clubById(state.clubId));
    });
    $('#club-page').addEventListener('submit', sendClubMessage);

    // Настройки
    onClick($('#settings-nav'), 'settings', (tab) => {
      state.settingsTab = tab;
      markTab($('#settings-nav'), 'settings', tab);
      renderSettings();
    });
    onClick($('#settings-content'), 'set-theme', setTheme);
    $('#settings-content').addEventListener('submit', saveProfile);

    // Интересы в настройках профиля: удалить, выбрать из подсказок, вписать свой
    const settings = $('#settings-content');
    onClick(settings, 'remove-interest', (item) => { myInterests = myInterests.filter(i => i !== item); renderInterests(); });
    onClick(settings, 'pick-interest', addInterest);
    onClick(settings, 'add-interest', () => addInterest($('#interest-input').value));
    settings.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.id === 'interest-input') {
        e.preventDefault(); // Enter в этом поле добавляет интерес, а не сохраняет всю форму
        addInterest(e.target.value);
      }
    });
    onClick($('#settings-content'), 'setting', toggleSetting);

    // Админ-панель: вкладки, формы и кнопки в таблицах
    onClick($('#admin-nav'), 'admin', (tab) => {
      state.adminTab = tab;
      editingChannelId = null;
      markTab($('#admin-nav'), 'admin', tab);
      renderAdmin();
    });
    const admin = $('#admin-content');
    admin.addEventListener('submit', (e) => {
      e.preventDefault(); // не перезагружать страницу
      if (e.target.id === 'channel-form') saveChannel(e.target);
      if (e.target.id === 'announce-form') postAnnouncement(e.target);
    });
    onClick(admin, 'edit-channel', (id) => { editingChannelId = +id; renderAdmin(); });
    onClick(admin, 'cancel-edit', () => { editingChannelId = null; renderAdmin(); });
    onClick(admin, 'block', (id) => toggleBlock(+id));
    onClick(admin, 'dismiss', (id) => dismissReport(+id));
  }

  // ════════ Навигация и тема ════════

  // Показать экран и нарисовать его. Для профиля — id человека (по умолчанию свой)
  function navigate(screen, profileId) {
    if (screen === 'profile') {
      if (state.screen !== 'profile') state.backTo = state.screen; // запоминаем, откуда пришли
      state.profileId = profileId ?? state.user.id;
    }
    state.screen = screen;

    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('is-active', s.id === `screen-${screen}`));
    markTab($('.topnav'), 'nav', screen);
    window.scrollTo(0, 0); // новый экран — с самого верха

    if (screen === 'profile') renderProfile();
    if (screen === 'search') renderSearch();
    if (screen === 'clubs') renderClubs();
    if (screen === 'settings') renderSettings();
    if (screen === 'admin') renderAdmin();
  }

  // Тема ставится ещё в <head> index.html; здесь — смена с запоминанием
  const theme = () => document.documentElement.dataset.theme;

  function setTheme(value) {
    document.documentElement.dataset.theme = value;
    localStorage.setItem('studnet-theme', value);
    if (state.screen === 'settings') renderSettings(); // обновить выбор темы в настройках
  }

  // ════════ Чаты ════════

  // Собеседник в личном чате (у остальных чатов — нет)
  function partner(chat) {
    if (chat.type !== 'dm') return;
    return userById(chat.ownerId === state.user.id ? chat.userId : chat.ownerId);
  }

  // Название и картинка чата: у личного — имя и фото собеседника
  const chatName = (chat) => partner(chat)?.name ?? chat.name;
  function chatPicture(chat) {
    const src = partner(chat)?.avatar ?? chat.avatar;
    return src
      ? `<img src="${src}" class="avatar avatar--md" alt="">`
      : `<div class="avatar avatar--md avatar--icon">${chat.icon || '💬'}</div>`;
  }

  // Можно ли писать в чат: в каналы — только преподавателям
  const canWrite = (chat) => !DATA.chatTypes[chat.type].readonly || isTeacher(state.user);

  // Кнопки-фильтры над списком чатов: «Все», «Канал», «Группа»…
  function renderChatFilters() {
    const types = [['all', 'Все'], ...Object.entries(DATA.chatTypes).map(([type, t]) => [type, t.label])];
    $('#chat-filters').innerHTML = types.map(([type, label]) =>
      `<button class="chat-filter" data-filter="${type}">${label}</button>`).join('');
    markTab($('#chat-filters'), 'filter', state.chatFilter);
  }

  // Показывать ли счётчик непрочитанных: для каналов и остальных чатов — отдельные настройки
  const showUnread = (chat) => chat.unread > 0 && setting(state.user, chat.type === 'channel' ? 'notifyChannels' : 'notifyUnread');

  // Список чатов слева (с учётом фильтра)
  function renderChatList() {
    const chats = DATA.chats.filter(c => state.chatFilter === 'all' || c.type === state.chatFilter);
    $('#chat-list').innerHTML = chats.map(chat => `
      <div class="chat-item ${chat.id === state.chatId ? 'is-active' : ''}" data-chat="${chat.id}">
        ${chatPicture(chat)}
        <div class="chat-item__body">
          <div class="chat-item__top">
            <span class="chat-item__name">${esc(chatName(chat))}</span>
            <span class="chat-item__time">${esc(chat.lastTime)}</span>
          </div>
          <div class="chat-item__preview">${esc(chat.lastMessage) || 'Нет сообщений'}</div>
          <div class="chat-item__meta">
            <span class="chat-type chat-type--${chat.type}">${DATA.chatTypes[chat.type].label}</span>
            ${showUnread(chat) ? `<span class="badge badge--unread">${chat.unread}</span>` : ''}
          </div>
        </div>
      </div>`).join('') || '<div class="empty-state">Здесь пока пусто</div>';
  }

  // Открыть чат: заголовок, поле ввода (или «только чтение»), сообщения и панель справа
  async function openChat(chatId) {
    const chat = chatById(chatId);
    if (!chat) return;
    state.chatId = chatId;
    renderChatList();

    $('#chat-title').textContent = chatName(chat);
    $('#chat-meta').textContent = `${DATA.chatTypes[chat.type].label} · ${members(chat.members)}`;
    $('#chat-readonly').hidden = canWrite(chat);
    $('#chat-form').hidden = !canWrite(chat);

    const messages = await API.messages(chatId);
    if (state.chatId !== chatId) return; // пока грузили, пользователь открыл другой чат

    // Чат открыт — значит прочитан: убираем счётчик и сообщаем серверу
    if (chat.unread) {
      chat.unread = 0;
      renderChatList();
    }
    API.markRead(chatId).catch(() => {}); // не получилось — не страшно, отметится в следующий раз

    $('#chat-messages').innerHTML = messagesHtml(messages);
    scrollToBottom($('#chat-messages'));
    renderChatInfo(chat, messages);
  }

  // Сообщения: чужие — слева с аватаркой и именем (по ним можно открыть профиль), свои — справа.
  // Если включена настройка «Упоминания», чужие сообщения с моим именем подсвечиваются
  function messagesHtml(messages) {
    if (!messages.length) return '<div class="empty-state">Сообщений пока нет. Напишите первым!</div>';
    const myName = state.user.name.split(' ')[0].toLowerCase();
    return messages.map(msg => {
      const author = userById(msg.userId);
      const own = msg.userId === state.user.id;
      const mention = !own && setting(state.user, 'notifyMentions') && msg.text.toLowerCase().includes(myName);
      const reactions = (msg.reactions || []).map(r => `<span class="reaction">${r.emoji} ${r.count}</span>`).join('');
      return `
        <div class="message ${own ? 'message--own' : ''} ${mention ? 'message--mention' : ''}">
          ${own ? '' : `<img src="${author?.avatar}" class="avatar avatar--sm" alt="" data-user="${msg.userId}">`}
          <div class="message__bubble">
            ${own ? '' : `<div class="message__author" data-user="${msg.userId}">${esc(author?.name ?? 'Неизвестный')}</div>`}
            <div class="message__text">${esc(msg.text)}</div>
            <div class="message__time">${esc(msg.time)}</div>
            ${reactions ? `<div class="reactions">${reactions}</div>` : ''}
          </div>
        </div>`;
    }).join('');
  }

  // Человек строкой: аватарка, имя и группа. Клик — открыть профиль
  const personHtml = (user, extraClass = '') => `
    <div class="person ${extraClass}" data-user="${user.id}">
      ${avatar(user, 'sm')}
      <div>
        <div class="person__name">${esc(user.name)}</div>
        <div class="person__about">${esc(isTeacher(user) ? 'Преподаватель' : user.group)}</div>
      </div>
    </div>`;

  // Панель справа: описание чата и люди в нём.
  // В личном чате — двое собеседников, в остальных — те, кто писал в чат
  function renderChatInfo(chat, messages) {
    const ids = chat.type === 'dm' ? [chat.ownerId, chat.userId] : messages.map(m => m.userId);
    const people = [...new Set(ids)].map(userById).filter(Boolean);
    $('#chat-info').innerHTML = `
      <div class="chat-info__title">${esc(chatName(chat))}</div>
      <span class="chat-type chat-type--${chat.type}">${DATA.chatTypes[chat.type].label}</span>
      <p class="chat-info__desc">${esc(chat.description)}</p>
      <h4 class="section-title">${chat.type === 'dm' ? 'Участники' : 'Писали в чат'}</h4>
      ${people.map(u => personHtml(u)).join('') || '<p class="muted">Пока никто не писал</p>'}`;
  }

  // Отправка сообщения (кнопка или Enter)
  async function sendMessage(e) {
    e.preventDefault();
    const input = $('#message-input');
    const text = input.value.trim();
    const chat = chatById(state.chatId);
    if (!text || !chat) return;

    try {
      await API.sendMessage(chat.id, text);
    } catch (err) {
      return alert(err.message);
    }
    input.value = '';
    // Обновляем превью в списке чатов и перерисовываем переписку
    chat.lastMessage = text;
    chat.lastTime = API.now();
    openChat(chat.id);
  }

  // Открыть личный чат с человеком. Если его ещё нет — сервер (или LOCAL) создаст
  async function openDm(userId) {
    let chat = DATA.chats.find(c => partner(c)?.id === userId);
    if (!chat) {
      try {
        chat = await API.openDm(userId);
      } catch (err) {
        return alert(err.message);
      }
      DATA.chats.push(chat);
    }
    state.chatFilter = 'all'; // чтобы чат точно был виден в списке
    renderChatFilters();
    navigate('main');
    openChat(chat.id);
  }

  // ════════ Профиль ════════

  // Профиль: кнопка «Назад», фото, кто это, статус, «Написать» (у чужого), о себе и интересы
  function renderProfile() {
    const user = userById(state.profileId) ?? state.user;
    const own = user.id === state.user.id;
    $('#profile').innerHTML = `
      <button class="btn btn--ghost btn--sm back-btn" data-back>← Назад</button>
      <div class="profile-header">
        ${avatar(user, 'xl')}
        <div>
          <h1 class="profile-header__name">${esc(user.name)}</h1>
          <p class="profile-header__about">${esc(about(user))}</p>
          <p class="profile-header__status">${dot(user)} ${user.online ? 'В сети' : 'Не в сети'}</p>
          ${own ? '' : canMessage(user)
            ? `<button class="btn btn--primary btn--pill" data-write="${user.id}">${ICON_MESSAGE} Написать сообщение</button>`
            : '<p class="muted">Пользователь ограничил личные сообщения</p>'}
        </div>
      </div>
      ${user.bio ? `<h3 class="section-title">О себе</h3><p>${esc(user.bio)}</p>` : ''}
      ${tags(user.interests) ? `<h3 class="section-title">Интересы</h3><div class="tag-list">${tags(user.interests)}</div>` : ''}`;
  }

  // ════════ Поиск ════════

  // Карточки людей по строке поиска в шапке и фильтрам слева (себя не показываем).
  // Группы сравниваем без учёта регистра: в фильтре «исп341», у людей «ИСП341»
  function renderSearch() {
    const name = $('#global-search').value.trim().toLowerCase();
    const group = $('#filter-group').value.toLowerCase();
    const direction = $('#filter-direction').value;
    const course = +$('#filter-course').value;
    const online = $('#filter-online').checked;

    const users = DATA.users.filter(u =>
      u.id !== state.user.id &&
      (!name || u.name.toLowerCase().includes(name)) &&
      (!group || (u.group || '').toLowerCase() === group) &&
      (!direction || u.direction === direction) &&
      (!course || u.course === course) &&
      (!online || u.online)
    );

    $('#search-count').textContent = users.length;
    $('#user-cards').innerHTML = users.map(u => `
      <div class="user-card" data-user="${u.id}">
        ${avatar(u, 'lg')}
        <div class="user-card__name">${esc(u.name)}</div>
        <div class="user-card__about">${esc(about(u))}</div>
        <div class="tag-list">${tags(u.interests.slice(0, 3))}</div>
        ${canMessage(u)
          ? `<button class="btn btn--secondary btn--sm btn--pill" data-write="${u.id}">${ICON_MESSAGE} Написать</button>`
          : '<span class="muted">Не принимает сообщения</span>'}
      </div>`).join('') || '<div class="empty-state">Никого не нашли — попробуйте изменить фильтры</div>';
  }

  // ════════ Клубы ════════

  // Каталог клубов или страница открытого клуба
  function renderClubs() {
    const club = clubById(state.clubId);
    $('#clubs-catalog').hidden = !!club;
    $('#club-page').hidden = !club;
    if (club) return renderClubPage(club);

    const clubs = DATA.clubs.filter(c => state.clubsView === 'all' || inClub(c));
    $('#club-cards').innerHTML = clubs.map(c => `
      <div class="club-card" data-club="${c.id}">
        <div class="club-card__banner">${c.emoji}</div>
        <div class="club-card__body">
          <div class="club-card__name">${esc(c.name)}</div>
          <div class="club-card__desc">${esc(c.description)}</div>
          <div class="club-card__footer">
            <span>${members(c.memberIds.length)}</span>
            <span>
              ${inClub(c) ? '<span class="badge badge--accent">Вы в клубе</span>' : ''}
              <span class="badge">${esc(c.category)}</span>
            </span>
          </div>
        </div>
      </div>`).join('') || '<div class="empty-state">Вы пока не вступили ни в один клуб</div>';
  }

  // Страница клуба: шапка с кнопкой «Вступить / Выйти», вкладки «Участники» и «Чат клуба»
  function renderClubPage(club) {
    const member = inClub(club);
    $('#club-page').innerHTML = `
      <button class="btn btn--ghost btn--sm back-btn" data-club-back>← Назад к каталогу</button>
      <div class="club-header">
        <div class="club-header__banner">${club.emoji}</div>
        <div>
          <h2 class="club-header__name">${esc(club.name)}</h2>
          <p class="club-header__desc">${esc(club.description)}</p>
          <div class="club-header__meta">
            <span class="badge">${esc(club.category)}</span>
            <span class="badge">${members(club.memberIds.length)}</span>
            <span class="muted">Админ: ${esc(club.admin)}</span>
          </div>
          <button class="btn btn--pill ${member ? 'btn--secondary' : 'btn--primary'}" data-club-toggle>
            ${member ? 'Выйти из клуба' : 'Вступить в клуб'}
          </button>
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
    if (state.clubTab !== 'chat') {
      const people = club.memberIds.map(userById).filter(Boolean);
      $('#club-tab').innerHTML = people.length
        ? `<div class="people-grid">${people.map(u => personHtml(u, 'person--card')).join('')}</div>`
        : '<div class="empty-state">В клубе пока никого нет</div>';
      return;
    }

    const messages = await API.clubMessages(club.id);
    if (state.clubId !== club.id || state.clubTab !== 'chat') return; // пока грузили, открыли другое
    $('#club-tab').innerHTML = `
      <div class="chat-messages club-chat">${messagesHtml(messages)}</div>
      ${inClub(club)
        ? `<form class="chat-input__form club-chat__input">
             <input type="text" id="club-input" placeholder="Написать в чат клуба…" autocomplete="off">
             <button class="btn btn--primary btn--icon" title="Отправить">${ICON_SEND}</button>
           </form>`
        : '<div class="chat-input__readonly club-chat__input">Вступите в клуб, чтобы писать в чат</div>'}`;
    scrollToBottom($('.club-chat'));
  }

  // Вступить в открытый клуб или выйти из него
  async function toggleClub() {
    const club = clubById(state.clubId);
    try {
      club.memberIds = (await API.toggleClub(club.id)).memberIds;
    } catch (err) {
      return alert(err.message);
    }
    renderClubPage(club);
  }

  // Отправка сообщения в чат клуба
  async function sendClubMessage(e) {
    e.preventDefault();
    const text = $('#club-input').value.trim();
    if (!text) return;
    try {
      await API.sendClubMessage(state.clubId, text);
    } catch (err) {
      return alert(err.message);
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
    const count = {};
    DATA.users.flatMap(u => u.interests).filter(Boolean).forEach(i => { count[i] = (count[i] || 0) + 1; });
    const chosen = myInterests.map(i => i.toLowerCase());
    return Object.keys(count)
      .filter(i => !chosen.includes(i.toLowerCase()))
      .sort((a, b) => count[b] - count[a])
      .slice(0, 15);
  }

  // Добавить интерес: без пробелов по краям, не пустой, без повторов, не больше MAX_INTERESTS
  function addInterest(text) {
    const item = text.trim().slice(0, 30);
    if (!item || myInterests.some(i => i.toLowerCase() === item.toLowerCase())) return;
    if (myInterests.length >= MAX_INTERESTS) return alert(`Можно выбрать не больше ${MAX_INTERESTS} интересов`);
    myInterests.push(item);
    renderInterests();
    $('#interest-input').focus();
  }

  // Блок «Интересы» в настройках: выбранные (клик — удалить), поле для своего, подсказки.
  // Перерисовываем только его, чтобы не стереть то, что человек уже ввёл в других полях
  function renderInterests() {
    $('#interests-editor').innerHTML = `
      <div class="tag-list">
        ${myInterests.map(i => `<button type="button" class="tag tag--removable" data-remove-interest="${esc(i)}" title="Убрать">${esc(i)} ✕</button>`).join('')
          || '<span class="muted">Пока ничего не выбрано</span>'}
      </div>
      <div class="interest-input">
        <input type="text" id="interest-input" placeholder="Свой интерес, например «Гитара»" maxlength="30" autocomplete="off">
        <button type="button" class="btn btn--secondary" data-add-interest>Добавить</button>
      </div>
      <p class="muted">Или выберите из популярных:</p>
      <div class="tag-list">
        ${suggestedInterests().map(i => `<button type="button" class="tag tag--suggest" data-pick-interest="${esc(i)}">+ ${esc(i)}</button>`).join('')}
      </div>`;
  }

  // Кнопка «Сохранить» в настройках профиля: отправляем имя, email, «о себе» и интересы
  async function saveProfile(e) {
    e.preventDefault(); // не перезагружать страницу
    const fields = { ...Object.fromEntries(new FormData(e.target)), interests: myInterests }; // {name, email, bio, interests}
    let updated;
    try {
      updated = await API.updateMe(fields);
    } catch (err) {
      return alert(err.message);
    }
    // Обновляем себя везде: в state и в списке пользователей (там имя видят чаты, поиск, клубы)
    Object.assign(state.user, updated);
    Object.assign(userById(state.user.id), updated);
    renderSettings();
    $('#save-status').textContent = '✓ Изменения сохранены';
  }

  // Строка настроек с переключателем; key — название настройки (см. SETTING_DEFAULTS)
  const toggleRow = (key, label, description) => `
    <div class="settings-row">
      <div>
        <div class="settings-row__label">${label}</div>
        <p class="muted">${description}</p>
      </div>
      <div class="toggle ${setting(state.user, key) ? 'toggle--on' : ''}" data-setting="${key}"></div>
    </div>`;

  // Клик по переключателю: сохраняем новое значение и сразу применяем
  async function toggleSetting(key) {
    const value = !setting(state.user, key);
    try {
      await API.saveSetting(key, value);
    } catch (err) {
      return alert(err.message);
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
    if (state.chatId) openChat(state.chatId); // перерисовать сообщения (подсветку упоминаний)
  }

  // Карточка выбора темы
  const themeOption = (value, label) => `
    <div class="theme-option ${theme() === value ? 'is-active' : ''}" data-set-theme="${value}">
      <div class="theme-option__preview theme-option__preview--${value}"></div>
      ${label}
    </div>`;

  // Содержимое выбранной вкладки настроек
  function renderSettings() {
    const user = state.user;
    const panels = {
      profile: `
        <h3>Профиль</h3>
        <form id="profile-form">
          <div class="field"><label>Имя</label><input type="text" name="name" value="${esc(user.name)}" required></div>
          <div class="field"><label>Email</label><input type="email" name="email" value="${esc(user.email)}"></div>
          <div class="field"><label>Группа</label><input type="text" value="${esc(user.group)}" disabled></div>
          <div class="field"><label>О себе</label><textarea name="bio" rows="3">${esc(user.bio)}</textarea></div>
          <div class="field"><label>Интересы</label><div id="interests-editor"></div></div>
          <button class="btn btn--primary">Сохранить</button>
          <span class="save-status" id="save-status"></span>
        </form>`,
      notifications: `
        <h3>Уведомления</h3>
        ${toggleRow('notifyUnread', 'Новые сообщения', 'Показывать число непрочитанных сообщений в чатах')}
        ${toggleRow('notifyChannels', 'Объявления', 'Показывать число новых объявлений в каналах')}
        ${toggleRow('notifyMentions', 'Упоминания', 'Подсвечивать сообщения, где упоминается ваше имя')}`,
      appearance: `
        <h3>Внешний вид</h3>
        <div class="field">
          <label>Тема оформления</label>
          <div class="theme-picker">${themeOption('light', 'Светлая')}${themeOption('dark', 'Тёмная')}</div>
        </div>
        ${toggleRow('compact', 'Компактный режим', 'Уменьшенные отступы в чатах')}`,
      privacy: `
        <h3>Приватность</h3>
        ${toggleRow('showOnline', 'Показывать статус онлайн', 'Если выключить, другие будут видеть вас «не в сети»')}
        ${toggleRow('showGroup', 'Показывать группу', 'Если выключить, группу не будет видно в профиле и поиске')}
        ${toggleRow('allowMessages', 'Разрешить личные сообщения', 'Если выключить, новые люди не смогут вам написать')}`,
    };
    $('#settings-content').innerHTML = panels[state.settingsTab] ?? panels.profile;

    // На вкладке «Профиль» заполняем блок интересов текущими интересами человека
    if ($('#interests-editor')) {
      myInterests = user.interests.filter(Boolean);
      renderInterests();
    }
  }

  // ════════ Админ-панель (видит только администратор) ════════

  // Какой канал сейчас редактируется в форме (null — форма создаёт новый)
  let editingChannelId = null;

  // Таблица: заголовки + строки (каждая строка — массив ячеек)
  const table = (headers, rows) => `
    <div class="table-wrap">
      <table>
        <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
        <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
    </div>`;

  // Карточка с цифрой для «Обзора»
  const stat = (value, label) => `<div class="stat"><div class="stat__value">${value}</div><div class="muted">${label}</div></div>`;

  // Имя человека-ссылкой (клик — профиль) и кнопка «Заблокировать / Разблокировать»
  const userLink = (user) => `<span class="link" data-user="${user.id}">${esc(user.name)}</span>`;
  const blockButton = (user) => user.isAdmin
    ? '<span class="muted">Администратор</span>'
    : `<button class="btn btn--sm ${user.blocked ? 'btn--secondary' : 'btn--danger'}" data-block="${user.id}">
         ${user.blocked ? 'Разблокировать' : 'Заблокировать'}
       </button>`;

  // Содержимое выбранной вкладки админ-панели
  async function renderAdmin() {
    const tab = state.adminTab;
    const channels = DATA.chats.filter(c => c.type === 'channel');
    let html = '';

    // Обзор: главные цифры
    if (tab === 'dashboard') {
      const s = await API.adminStats();
      html = `
        <h3>Обзор</h3>
        <div class="stat-grid">
          ${stat(s.totalUsers, 'Пользователей')}${stat(s.onlineNow, 'Онлайн сейчас')}
          ${stat(s.activeChats, 'Чатов')}${stat(s.pendingReports, 'Жалоб')}
        </div>`;
    }

    // Каналы: форма (создать новый или изменить выбранный) и список каналов
    if (tab === 'channels') {
      const editing = chatById(editingChannelId);
      html = `
        <h3>Каналы</h3>
        <form class="card admin-form" id="channel-form">
          <h4>${editing ? `Редактирование: ${esc(editing.name)}` : 'Новый канал'}</h4>
          <div class="field"><label>Название</label><input name="name" value="${esc(editing?.name)}" required></div>
          <div class="field"><label>Описание</label><textarea name="description" rows="2">${esc(editing?.description)}</textarea></div>
          <button class="btn btn--primary">${editing ? 'Сохранить' : 'Создать канал'}</button>
          ${editing ? '<button type="button" class="btn btn--ghost" data-cancel-edit>Отмена</button>' : ''}
        </form>
        ${table(['Название', 'Описание', 'Подписчиков', ''], channels.map(c => [
          esc(c.name),
          esc(c.description),
          c.members,
          `<button class="btn btn--ghost btn--sm" data-edit-channel="${c.id}">Редактировать</button>`,
        ]))}`;
    }

    // Пользователи: все, с кнопкой блокировки
    if (tab === 'users') {
      html = `
        <h3>Пользователи</h3>
        ${table(['Имя', 'Email', 'Группа', 'Роль', 'Статус', ''], DATA.users.map(u => [
          userLink(u),
          esc(u.email),
          esc(u.group),
          isTeacher(u) ? 'Преподаватель' : 'Студент',
          u.blocked ? '<span class="badge badge--danger">Заблокирован</span>' : `${dot(u)} ${u.online ? 'Онлайн' : 'Офлайн'}`,
          blockButton(u),
        ]))}`;
    }

    // Модерация: жалобы. «Отклонить» — убрать жалобу, «Заблокировать» — заблокировать нарушителя
    if (tab === 'moderation') {
      const list = await API.reports();
      html = '<h3>Модерация</h3>' + (list.length
        ? table(['На кого', 'Причина', 'Когда', ''], list.map(r => [
            userLink(userById(r.userId)),
            esc(r.reason),
            esc(r.time),
            `<div class="actions">
               <button class="btn btn--ghost btn--sm" data-dismiss="${r.id}">Отклонить</button>
               <button class="btn btn--danger btn--sm" data-block="${r.userId}">Заблокировать</button>
             </div>`,
          ]))
        : '<div class="empty-state">Жалоб нет 🎉</div>');
    }

    // Объявления: форма (сообщение в канал) и все сообщения из каналов, новые сверху
    if (tab === 'announcements') {
      const lists = await Promise.all(channels.map(c => API.messages(c.id)));
      const rows = channels.flatMap((c, i) => lists[i].map(m => [esc(m.text), esc(c.name), esc(userById(m.userId)?.name), esc(m.time)]));
      html = `
        <h3>Объявления</h3>
        <form class="card admin-form" id="announce-form">
          <h4>Новое объявление</h4>
          <div class="field">
            <label>Канал</label>
            <select name="chatId">${channels.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>
          </div>
          <div class="field"><label>Текст</label><textarea name="text" rows="3" required></textarea></div>
          <button class="btn btn--primary">Опубликовать</button>
        </form>
        ${table(['Текст', 'Канал', 'Автор', 'Время'], rows.reverse())}`;
    }

    if (state.adminTab === tab) $('#admin-content').innerHTML = html; // пока грузили, могли переключить вкладку
  }

  // Форма канала: создать новый или сохранить изменения
  async function saveChannel(form) {
    const fields = Object.fromEntries(new FormData(form)); // {name, description}
    try {
      if (editingChannelId) Object.assign(chatById(editingChannelId), await API.updateChannel(editingChannelId, fields));
      else DATA.chats.push(await API.createChannel(fields));
    } catch (err) {
      return alert(err.message);
    }
    editingChannelId = null;
    renderChatList(); // новый или переименованный канал сразу виден в чатах
    renderAdmin();
  }

  // Форма объявления: отправляем сообщение в выбранный канал
  async function postAnnouncement(form) {
    const { chatId, text } = Object.fromEntries(new FormData(form));
    const chat = chatById(+chatId);
    try {
      await API.sendMessage(chat.id, text.trim());
    } catch (err) {
      return alert(err.message);
    }
    chat.lastMessage = text.trim();
    chat.lastTime = API.now();
    renderChatList();
    renderAdmin();
  }

  // Заблокировать или разблокировать человека (с подтверждением)
  async function toggleBlock(userId) {
    const user = userById(userId);
    const blocked = !user.blocked; // что хотим сделать: true — заблокировать
    if (!confirm(`${blocked ? 'Заблокировать' : 'Разблокировать'} пользователя ${user.name}?`)) return;
    try {
      await API.blockUser(userId, blocked);
    } catch (err) {
      return alert(err.message);
    }
    user.blocked = blocked;
    if (blocked) user.online = false;
    renderAdmin();
  }

  // Отклонить жалобу
  async function dismissReport(reportId) {
    try {
      await API.dismissReport(reportId);
    } catch (err) {
      return alert(err.message);
    }
    renderAdmin();
  }

})();
