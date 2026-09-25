/**
 * СтудСеть — главный модуль интерфейса.
 * Данные приходят с сервера через API (js/api.js), здесь только отрисовка и обработка кликов.
 */

(function () {
  'use strict';

  // Данные с сервера (пользователи, чаты, клубы…) — загружаются после входа
  let DATA = null;

  // Текущее состояние интерфейса: где пользователь находится и что у него открыто
  const state = {
    user: null,
    screen: 'main',         // открытый экран: main, search, clubs, settings, admin, profile
    profileId: null,        // чей профиль открыт
    activeChatId: null,     // открытый чат
    chatFilter: 'all',      // фильтр над списком чатов
    settingsTab: 'profile', // вкладка настроек
    adminTab: 'dashboard',  // вкладка админ-панели
    clubsView: 'all',       // «Все» или «Мои» клубы
    selectedClubId: null,   // открытый клуб
    clubTab: 'members',     // вкладка клуба: members или chat
  };

  // Состояние сохраняется в sessionStorage перед обновлением страницы и восстанавливается после.
  // При закрытии вкладки sessionStorage очищается — и всё начинается с начала.
  const UI_KEY = 'studnet-ui';

  function saveUi() {
    if (!state.user) return; // не вошли или выходим — сохранять нечего
    const { user, ...ui } = state;
    sessionStorage.setItem(UI_KEY, JSON.stringify(ui));
  }

  function restoreUi() {
    try {
      Object.assign(state, JSON.parse(sessionStorage.getItem(UI_KEY)));
    } catch {
      // сохранённого состояния нет или оно испорчено — остаёмся на значениях по умолчанию
    }
  }

  // ── Мелкие помощники ────────────────────────────────────
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);
  const userById = (id) => DATA.users.find(u => u.id === id);
  const chatById = (id) => DATA.chats.find(c => c.id === id);
  // Точка «в сети / не в сети» и список тегов-интересов
  const dot = (u) => `<span class="status-dot ${u.online ? 'status-dot--online' : ''}"></span>`;
  const tags = (list) => list.map(i => `<span class="tag">${i}</span>`).join('');

  document.addEventListener('DOMContentLoaded', init);

  // Старт: если в этой вкладке уже входили (есть токен) — проверяем его и открываем приложение
  async function init() {
    bindEvents();
    if (!API.hasToken()) return showLogin();
    try {
      await enterApp(await API.me());
    } catch {
      await API.logout(); // токен устарел или сервер недоступен — просим войти заново
      showLogin();
    }
  }

  // ── Вход и выход ────────────────────────────────────────
  async function handleLogin(e) {
    e.preventDefault();
    try {
      await enterApp(await API.login($('#login-code').value));
    } catch (err) {
      alert(err.message);
    }
  }

  // Показать экран входа (класс logged-in управляет видимостью, см. css/base.css)
  function showLogin() {
    document.documentElement.classList.remove('logged-in');
  }

  // Выход: забываем токен и сохранённое состояние, перезагружаем страницу — так сбрасывается всё
  async function logout() {
    state.user = null;
    sessionStorage.removeItem(UI_KEY);
    await API.logout();
    location.reload();
  }

  // Вход выполнен: загружаем данные, восстанавливаем, где был пользователь, и рисуем интерфейс
  async function enterApp(user) {
    restoreUi();
    state.user = user;
    DATA = await API.data();
    $('#filter-group').innerHTML += DATA.groups.map(g => `<option>${g}</option>`).join('');
    $('#filter-direction').innerHTML += DATA.directions.map(d => `<option>${d}</option>`).join('');

    document.documentElement.classList.add('logged-in');
    $('#current-user-avatar img').src = user.avatar;
    $('#current-user-avatar img').alt = user.name;
    $('#admin-link').hidden = user.role !== 'teacher';

    // Подсвечиваем сохранённые вкладки
    markTab($('.clubs-tabs'), 'clubs-view', 'clubs-tab--active', state.clubsView);
    markTab($('.settings-nav'), 'settings', 'settings-nav__item--active', state.settingsTab);
    markTab($('.admin-nav'), 'admin', 'admin-nav__item--active', state.adminTab);

    renderChatFilters();
    renderChatList();
    if (state.activeChatId) selectChat(state.activeChatId);
    if (state.screen === 'admin' && user.role !== 'teacher') state.screen = 'main';
    navigate(state.screen, state.profileId ?? user.id);
  }

  // ── События (все обработчики кликов вешаются один раз при старте) ──
  // Подсветить вкладку со значением value среди кнопок [data-attr] внутри root
  function markTab(root, attr, activeClass, value) {
    root.querySelectorAll(`[data-${attr}]`).forEach(b => b.classList.toggle(activeClass, b.getAttribute(`data-${attr}`) === value));
  }

  // Вкладки: подсвечиваем нажатую кнопку и передаём её значение в onPick
  function bindTabs(root, attr, activeClass, onPick) {
    root.addEventListener('click', (e) => {
      const btn = e.target.closest(`[data-${attr}]`);
      if (!btn) return;
      const value = btn.getAttribute(`data-${attr}`);
      markTab(root, attr, activeClass, value);
      onPick(value);
    });
  }

  // Здесь навешиваются все обработчики. Клики внутри списков ловим на самом списке
  // (e.target.closest(...)), поэтому после перерисовки ничего перевешивать не нужно.
  function bindEvents() {
    window.addEventListener('pagehide', saveUi); // страница обновляется или закрывается
    $('#form-login').addEventListener('submit', handleLogin);
    $('#logout').addEventListener('click', logout);
    $('#theme-toggle').addEventListener('click', () => setTheme(theme() === 'light' ? 'dark' : 'light'));
    $$('[data-nav]').forEach(btn => btn.addEventListener('click', () => navigate(btn.dataset.nav)));

    // Чаты
    $('#chat-type-filters').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-filter]');
      if (!btn) return;
      state.chatFilter = btn.dataset.filter;
      renderChatFilters();
      renderChatList();
    });
    $('#chat-list').addEventListener('click', (e) => {
      const item = e.target.closest('[data-chat-id]');
      if (item) selectChat(+item.dataset.chatId);
    });
    $('#chat-info-content').addEventListener('click', (e) => {
      const item = e.target.closest('[data-user-id]');
      if (item) navigate('profile', +item.dataset.userId);
    });
    $('#send-message').addEventListener('click', sendMessage);
    $('#message-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMessage(); });

    // Профиль и поиск: «Написать» и клик по карточке
    $('#profile-content').addEventListener('click', onUserClick);
    $('#user-cards').addEventListener('click', onUserClick);
    ['#filter-group', '#filter-direction', '#filter-course', '#filter-online'].forEach(sel => {
      $(sel).addEventListener('change', renderSearchResults);
    });
    $('#reset-filters').addEventListener('click', () => {
      $('#filter-group').value = $('#filter-direction').value = $('#filter-course').value = '';
      $('#filter-online').checked = false;
      renderSearchResults();
    });

    // Клубы
    bindTabs($('.clubs-tabs'), 'clubs-view', 'clubs-tab--active', (v) => { state.clubsView = v; renderClubs(); });
    $('#club-cards').addEventListener('click', (e) => {
      const card = e.target.closest('[data-club-id]');
      if (!card) return;
      state.selectedClubId = +card.dataset.clubId;
      state.clubTab = 'members';
      renderClubs();
    });
    $('#clubs-back').addEventListener('click', () => { state.selectedClubId = null; renderClubs(); });
    bindTabs($('#club-detail-content'), 'club-tab', 'club-detail-tab--active', (tab) => { state.clubTab = tab; renderClubTab(); });
    // Чат клуба: кнопка отправки или Enter в поле ввода
    $('#club-detail-content').addEventListener('click', (e) => { if (e.target.closest('[data-club-send]')) sendClubMessage(); });
    $('#club-detail-content').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'club-message-input') sendClubMessage(); });

    // Настройки
    bindTabs($('.settings-nav'), 'settings', 'settings-nav__item--active', (v) => { state.settingsTab = v; renderSettings(); });
    $('#settings-content').addEventListener('click', (e) => {
      const opt = e.target.closest('[data-set-theme]');
      if (opt) { setTheme(opt.dataset.setTheme); renderSettings(); }
      e.target.closest('.toggle')?.classList.toggle('toggle--on');
    });

    // Админ-панель
    bindTabs($('.admin-nav'), 'admin', 'admin-nav__item--active', (v) => { state.adminTab = v; renderAdmin(); });
  }

  // Клик в профиле или карточке пользователя: «Написать» открывает ЛС, иначе — профиль
  function onUserClick(e) {
    const writeBtn = e.target.closest('[data-write-to]');
    if (writeBtn) return openDm(+writeBtn.dataset.writeTo);
    const card = e.target.closest('[data-user-id]');
    if (card) navigate('profile', +card.dataset.userId);
  }

  // Открыть личный чат с пользователем
  function openDm(userId) {
    const dm = DATA.chats.find(c => c.type === 'dm' && c.userId === userId);
    if (!dm) return;
    navigate('main');
    selectChat(dm.id);
  }

  // ── Навигация ───────────────────────────────────────────
  // Показать экран screen (main, search, clubs, settings, admin, profile) и отрисовать его
  function navigate(screen, profileId = state.user.id) {
    state.screen = screen;
    state.profileId = screen === 'profile' ? profileId : null;
    $$('.screen').forEach(s => s.classList.toggle('screen--active', s.id === `screen-${screen}`));
    $$('.topnav__item').forEach(b => b.classList.toggle('topnav__item--active', b.dataset.nav === screen));

    if (screen === 'profile') renderProfile(profileId);
    if (screen === 'search') renderSearchResults();
    if (screen === 'clubs') renderClubs();
    if (screen === 'settings') renderSettings();
    if (screen === 'admin') renderAdmin();
  }

  // ── Тема ────────────────────────────────────────────────
  // Текущая тема (ставится ещё в <head> index.html) и её смена с запоминанием
  const theme = () => document.documentElement.dataset.theme;

  function setTheme(value) {
    document.documentElement.dataset.theme = value;
    localStorage.setItem('studnet-theme', value);
  }

  // ── Чаты ────────────────────────────────────────────────
  // Кнопки-фильтры над списком чатов: «Все», «Канал», «Группа»…
  function renderChatFilters() {
    const types = [['all', 'Все'], ...Object.entries(DATA.chatTypes).map(([key, t]) => [key, t.label])];
    $('#chat-type-filters').innerHTML = types.map(([key, label]) => `
      <button class="chat-filter ${state.chatFilter === key ? 'chat-filter--active' : ''}" data-filter="${key}">${label}</button>
    `).join('');
  }

  // Список чатов слева (с учётом фильтра). Если чат ещё не выбран — открываем первый
  function renderChatList() {
    const chats = DATA.chats.filter(c => state.chatFilter === 'all' || c.type === state.chatFilter);

    $('#chat-list').innerHTML = chats.map(chat => `
      <div class="chat-item ${state.activeChatId === chat.id ? 'chat-item--active' : ''}" data-chat-id="${chat.id}">
        <div class="chat-item__avatar avatar-wrap">
          ${chat.avatar
            ? `<img src="${chat.avatar}" class="avatar avatar--md" alt="">`
            : `<div class="avatar avatar--md" style="display:flex;align-items:center;justify-content:center;font-size:1.2rem;background:var(--bg-hover)">${chat.icon || '💬'}</div>`}
        </div>
        <div class="chat-item__body">
          <div class="chat-item__top">
            <span class="chat-item__name">${chat.name}</span>
            <span class="chat-item__time">${chat.lastTime}</span>
          </div>
          <div class="chat-item__preview">${chat.lastMessage}</div>
          <div class="chat-item__meta">
            <span class="chat-type chat-type--${chat.type}">${DATA.chatTypes[chat.type].label}</span>
            ${chat.unread ? `<span class="badge badge--unread">${chat.unread}</span>` : ''}
          </div>
        </div>
      </div>
    `).join('');

    if (!state.activeChatId && chats.length) selectChat(chats[0].id);
  }

  // Можно ли писать в чат: в каналы (readonly) — только преподавателям
  const canWrite = (chat) => !DATA.chatTypes[chat.type].readonly || state.user.role === 'teacher';

  // Открыть чат: заголовок, поле ввода (или «только чтение»), сообщения и панель справа
  async function selectChat(chatId) {
    const chat = chatById(chatId);
    if (!chat) return;
    state.activeChatId = chatId;
    renderChatList();

    const label = DATA.chatTypes[chat.type].label;
    $('#chat-title').textContent = chat.name;
    $('#chat-meta').textContent = `${label} · ${chat.members} участников`;

    const writable = canWrite(chat);
    const area = $('#chat-input-area');
    area.classList.toggle('chat-input--readonly', !writable);
    area.classList.toggle('chat-input--writable', writable);
    $('#chat-readonly-notice').hidden = writable;
    $('#chat-input-form').hidden = !writable;
    $('#message-input').disabled = $('#send-message').disabled = !writable;
    if (!writable) $('#message-input').value = '';

    renderMessages(await API.messages(chatId));

    // Панель справа: описание чата и участники
    $('.chat-info__empty').hidden = true;
    $('#chat-info-content').hidden = false;
    $('#chat-info-content').innerHTML = `
      <div class="chat-info__title">${chat.name}</div>
      <span class="chat-type chat-type--${chat.type}">${label}</span>
      <p class="chat-info__desc">${chat.description}</p>
      <div class="chat-info__section">
        <h4>Участники (${chat.members})</h4>
        <div class="member-list">
          ${DATA.users.slice(0, 5).map(u => `
            <div class="member-item" data-user-id="${u.id}">
              <div class="avatar-wrap">
                <img src="${u.avatar}" class="avatar avatar--xs" alt="">
                ${dot(u)}
              </div>
              <div>
                <div class="member-item__name">${u.name}</div>
                <div class="member-item__role">${u.group}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // Сообщения в центре; свои — справа, без аватарки
  function renderMessages(messages) {
    const container = $('#chat-messages');
    if (!messages.length) {
      container.innerHTML = '<div class="empty-state"><p>Нет сообщений. Начните общение!</p></div>';
      return;
    }

    container.innerHTML = messages.map(msg => {
      const user = userById(msg.userId);
      const isOwn = msg.userId === state.user.id;
      const reactions = (msg.reactions || []).map(r => `<span class="reaction">${r.emoji} ${r.count}</span>`).join('');
      return `
        <div class="message ${isOwn ? 'message--own' : ''}">
          ${isOwn ? '' : `<img src="${user?.avatar}" class="avatar avatar--sm message__avatar" alt="">`}
          <div class="message__bubble">
            ${isOwn ? '' : `<div class="message__author">${user?.name || 'Неизвестный'}</div>`}
            <div class="message__text">${msg.text}</div>
            <div class="message__time">${msg.time}</div>
            ${reactions ? `<div class="reactions">${reactions}</div>` : ''}
          </div>
        </div>
      `;
    }).join('');
    container.scrollTop = container.scrollHeight;
  }

  // Отправка сообщения из поля ввода (кнопка или Enter)
  async function sendMessage() {
    const input = $('#message-input');
    const text = input.value.trim();
    if (!text || !state.activeChatId) return;

    try {
      await API.sendMessage(state.activeChatId, text);
    } catch (err) {
      return alert(err.message);
    }
    input.value = '';
    renderMessages(await API.messages(state.activeChatId));
  }

  // ── Профиль ─────────────────────────────────────────────
  // Профиль пользователя; у чужого профиля есть кнопка «Написать»
  function renderProfile(userId) {
    const user = userById(userId);
    if (!user) return;

    $('#profile-content').innerHTML = `
      <div class="profile-header">
        <div class="avatar-wrap">
          <img src="${user.avatar}" class="avatar avatar--xl" alt="${user.name}">
          <span class="status-dot ${user.online ? 'status-dot--online' : ''}" style="width:14px;height:14px;bottom:4px;right:4px"></span>
        </div>
        <div class="profile-header__info">
          <h1 class="profile-header__name">${user.name}</h1>
          <p class="profile-header__meta">${user.group}${user.course ? ` · ${user.course} курс` : ''} · ${user.direction}</p>
          <div class="profile-header__status">${dot(user)} ${user.online ? 'В сети' : 'Не в сети'}</div>
          ${user.id === state.user.id ? '' : `<button class="btn btn--primary" style="margin-top:16px" data-write-to="${user.id}">Написать</button>`}
        </div>
      </div>
      ${user.bio ? `<div class="profile-section"><h3>О себе</h3><p>${user.bio}</p></div>` : ''}
      ${user.interests.length ? `<div class="profile-section"><h3>Интересы</h3><div class="tag-list">${tags(user.interests)}</div></div>` : ''}
    `;
  }

  // ── Поиск ───────────────────────────────────────────────
  // Карточки людей по фильтрам слева (себя не показываем). Группы сравниваем без учёта регистра
  function renderSearchResults() {
    const group = $('#filter-group').value.toLowerCase();
    const direction = $('#filter-direction').value;
    const course = +$('#filter-course').value;
    const online = $('#filter-online').checked;

    const users = DATA.users.filter(u =>
      u.id !== state.user.id &&
      (!group || u.group.toLowerCase() === group) &&
      (!direction || u.direction === direction) &&
      (!course || u.course === course) &&
      (!online || u.online)
    );

    $('#search-count').textContent = users.length;
    $('#user-cards').innerHTML = users.map(u => `
      <div class="user-card card--hover" data-user-id="${u.id}">
        <div class="avatar-wrap">
          <img src="${u.avatar}" class="avatar avatar--lg" alt="">
          ${dot(u)}
        </div>
        <div class="user-card__name">${u.name}</div>
        <div class="user-card__group">${u.group} · ${u.direction}</div>
        ${u.interests.length ? `<div class="user-card__interests tag-list">${tags(u.interests.slice(0, 3))}</div>` : ''}
        <button class="btn btn--secondary btn--sm" data-write-to="${u.id}">Написать</button>
      </div>
    `).join('');
  }

  // ── Клубы ───────────────────────────────────────────────
  // Клубы: каталог карточек или страница выбранного клуба
  function renderClubs() {
    const club = DATA.clubs.find(c => c.id === state.selectedClubId);
    $('#clubs-catalog').hidden = !!club;
    $('#clubs-detail').hidden = !club;
    if (club) return renderClubDetail(club);

    const clubs = DATA.clubs.filter(c => state.clubsView !== 'mine' || c.joined);
    $('#club-cards').innerHTML = clubs.map(c => `
      <div class="club-card" data-club-id="${c.id}">
        <div class="club-card__banner">${c.emoji}</div>
        <div class="club-card__body">
          <div class="club-card__name">${c.name}</div>
          <div class="club-card__desc">${c.description}</div>
          <div class="club-card__footer">
            <span>${c.members} участников</span>
            <span class="badge">${c.category}</span>
          </div>
        </div>
      </div>
    `).join('');
  }

  // Страница клуба: шапка, вкладки «Участники» / «Чат клуба»
  function renderClubDetail(club) {
    $('#club-detail-content').innerHTML = `
      <div class="club-detail-header">
        <div class="club-detail-banner">${club.emoji}</div>
        <div class="club-detail-info">
          <h2>${club.name}</h2>
          <p>${club.description}</p>
          <div style="margin-top:12px;display:flex;gap:8px;align-items:center">
            <span class="badge">${club.category}</span>
            <span class="badge">${club.members} участников</span>
            <span style="font-size:0.85rem;color:var(--text-secondary)">Админ: ${club.admin}</span>
          </div>
          <button class="btn ${club.joined ? 'btn--secondary' : 'btn--primary'}" style="margin-top:16px">
            ${club.joined ? 'Вы участник' : 'Вступить'}
          </button>
        </div>
      </div>

      <div class="club-detail-tabs">
        <button class="club-detail-tab" data-club-tab="members">Участники</button>
        <button class="club-detail-tab" data-club-tab="chat">Чат клуба</button>
      </div>

      <div id="club-tab-content"></div>
    `;
    markTab($('#club-detail-content'), 'club-tab', 'club-detail-tab--active', state.clubTab);
    renderClubTab();
  }

  // Содержимое открытой вкладки клуба: участники или чат
  async function renderClubTab() {
    const club = DATA.clubs.find(c => c.id === state.selectedClubId);
    if (state.clubTab !== 'chat') {
      $('#club-tab-content').innerHTML = clubMembers(club);
      return;
    }
    $('#club-tab-content').innerHTML = clubChat(await API.clubMessages(club.id));
    const box = $('.club-chat-preview');
    box.scrollTop = box.scrollHeight; // прокручиваем к последним сообщениям
  }

  // Отправить сообщение в чат открытого клуба
  async function sendClubMessage() {
    const text = $('#club-message-input').value.trim();
    if (!text) return;
    try {
      await API.sendClubMessage(state.selectedClubId, text);
    } catch (err) {
      return alert(err.message);
    }
    await renderClubTab();
    $('#club-message-input').focus();
  }

  // Вкладка «Участники» клуба — у каждого клуба свой список (memberIds)
  function clubMembers(club) {
    return `
      <div class="club-members-grid">
        ${club.memberIds.map(userById).filter(Boolean).map(u => `
          <div class="club-member">
            <div class="avatar-wrap">
              <img src="${u.avatar}" class="avatar avatar--sm" alt="">
              ${dot(u)}
            </div>
            <div>
              <div style="font-weight:500;font-size:0.9rem">${u.name}</div>
              <div style="font-size:0.8rem;color:var(--text-muted)">${u.group}</div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  // Вкладка «Чат клуба» — у каждого клуба свои сообщения
  function clubChat(messages) {
    return `
      <div class="club-chat-preview">
        ${messages.length ? '' : '<div class="empty-state"><p>Пока никто не писал. Будьте первым!</p></div>'}
        ${messages.map(msg => {
          const user = userById(msg.userId);
          return `
            <div class="message" style="max-width:100%;margin-bottom:12px">
              <img src="${user?.avatar}" class="avatar avatar--xs message__avatar" alt="">
              <div class="message__bubble">
                <div class="message__author">${user?.name}</div>
                <div class="message__text">${msg.text}</div>
                <div class="message__time">${msg.time}</div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
      <div class="chat-input__form" style="margin-top:12px">
        <input type="text" id="club-message-input" placeholder="Написать в чат клуба…" style="flex:1;padding:10px 14px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg)">
        <button class="btn btn--primary btn--icon" data-club-send>
          <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m22 2-7 20-4-9-9-4Z"/></svg>
        </button>
      </div>
    `;
  }

  // ── Настройки ───────────────────────────────────────────
  // Строка настроек с переключателем
  function toggleRow(label, desc, on) {
    return `
      <div class="settings-row">
        <div class="settings-row__info">
          <label>${label}</label>
          <p>${desc}</p>
        </div>
        <div class="toggle ${on ? 'toggle--on' : ''}"><div class="toggle__knob"></div></div>
      </div>
    `;
  }

  // Карточка выбора темы (светлая / тёмная)
  function themeOption(value, label) {
    return `
      <div class="theme-option ${theme() === value ? 'theme-option--active' : ''}" data-set-theme="${value}">
        <div class="theme-option__preview theme-option__preview--${value}"></div>
        <span>${label}</span>
      </div>
    `;
  }

  // Настройки: содержимое выбранной вкладки слева
  function renderSettings() {
    const user = state.user;
    const panels = {
      profile: () => `
        <h3>Профиль</h3>
        <div class="field"><label>Имя</label><input type="text" value="${user.name}"></div>
        <div class="field"><label>Email</label><input type="email" value="${user.email}"></div>
        <div class="field"><label>Группа</label><input type="text" value="${user.group}" disabled></div>
        <div class="field"><label>О себе</label><textarea rows="3">${user.bio || ''}</textarea></div>
        <button class="btn btn--primary">Сохранить</button>
      `,
      notifications: () => `
        <h3>Уведомления</h3>
        ${toggleRow('Новые сообщения', 'Уведомления о входящих сообщениях', true)}
        ${toggleRow('Упоминания', 'Когда вас упоминают в чате', true)}
        ${toggleRow('Объявления', 'Объявления от преподавателей', true)}
        ${toggleRow('Клубы', 'Новости и события клубов', false)}
        ${toggleRow('Email-рассылка', 'Дублировать важные уведомления на email', false)}
      `,
      appearance: () => `
        <h3>Внешний вид</h3>
        <div class="field">
          <label>Тема оформления</label>
          <div class="theme-picker">${themeOption('light', 'Светлая')}${themeOption('dark', 'Тёмная')}</div>
        </div>
        ${toggleRow('Компактный режим', 'Уменьшенные отступы в чатах', false)}
      `,
      privacy: () => `
        <h3>Приватность</h3>
        ${toggleRow('Показывать статус онлайн', 'Другие пользователи видят, что вы в сети', true)}
        ${toggleRow('Показывать группу', 'Группа видна в профиле', true)}
        ${toggleRow('Разрешить сообщения', 'Любой студент может написать вам', true)}
      `,
    };
    $('#settings-content').innerHTML = panels[state.settingsTab]();
  }

  // ── Админ-панель ────────────────────────────────────────
  // Жалобы и объявления пока примерные — в базе их нет
  const REPORTS = [
    ['#142', 'Спам в чате «Флудилка» · 2 часа назад'],
    ['#141', 'Оскорбление в ЛС · 5 часов назад'],
  ];

  const ANNOUNCEMENTS = [
    ['Расписание на следующую неделю', 'Объявления колледжа', '12.09.2026', 890],
    ['День открытых дверей', 'Объявления колледжа', '10.09.2026', 1240],
    ['Хакатон «CodeFest 2026»', 'Информационные системы', '08.09.2026', 456],
  ];

  // Таблица: заголовки + строки (каждая строка — массив ячеек)
  function table(headers, rows) {
    return `
      <div class="table-wrap">
        <table>
          <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
          <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>
      </div>
    `;
  }

  // Админ-панель: содержимое выбранной вкладки (только для преподавателей)
  async function renderAdmin() {
    const stat = (value, label) => `<div class="stat"><div class="stat__value">${value}</div><div class="stat__label">${label}</div></div>`;
    const action = (label) => `<div class="admin-actions"><button class="btn btn--primary">${label}</button></div>`;

    const panels = {
      dashboard: async () => {
        const s = await API.adminStats();
        return `
          <h3>Обзор</h3>
          <div class="stat-grid">
            ${stat(s.totalUsers, 'Пользователей')}${stat(s.onlineNow, 'Онлайн сейчас')}
            ${stat(s.activeChats, 'Активных чатов')}${stat(s.pendingReports, 'Жалоб')}
          </div>
        `;
      },
      channels: async () => `
        <h3>Каналы</h3>
        ${action('Создать канал')}
        ${table(['Название', 'Тип', 'Подписчиков', 'Действия'], DATA.chats.filter(c => c.type === 'channel').map(c => [
          c.name,
          '<span class="chat-type chat-type--channel">Канал</span>',
          c.members,
          '<button class="btn btn--ghost btn--sm">Редактировать</button>',
        ]))}
      `,
      users: async () => `
        <h3>Пользователи</h3>
        ${table(['Имя', 'Email', 'Группа', 'Роль', 'Статус'], DATA.users.map(u => [
          u.name,
          u.email,
          u.group,
          u.role === 'teacher' ? 'Преподаватель' : 'Студент',
          `${dot(u)} ${u.online ? 'Онлайн' : 'Офлайн'}`,
        ]))}
      `,
      moderation: async () => `
        <h3>Модерация</h3>
        ${REPORTS.map(([id, desc]) => `
          <div class="card" style="margin-bottom:12px">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <div>
                <strong>Жалоба ${id}</strong>
                <p style="font-size:0.85rem;color:var(--text-secondary);margin-top:4px">${desc}</p>
              </div>
              <div style="display:flex;gap:8px">
                <button class="btn btn--ghost btn--sm">Отклонить</button>
                <button class="btn btn--primary btn--sm">Заблокировать</button>
              </div>
            </div>
          </div>
        `).join('')}
      `,
      announcements: async () => `
        <h3>Объявления</h3>
        ${action('Новое объявление')}
        ${table(['Заголовок', 'Канал', 'Дата', 'Просмотры'], ANNOUNCEMENTS)}
      `,
    };
    $('#admin-content').innerHTML = await panels[state.adminTab]();
  }

})();
