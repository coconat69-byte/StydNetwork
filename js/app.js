/**
 * СтудСеть — главный модуль UI
 */

(function () {
  'use strict';

  // ── State ─────────────────────────────────────────
  const state = {
    currentUser: null,
    currentScreen: 'auth',
    activeChatId: null,
    chatFilter: 'all',
    settingsTab: 'profile',
    adminTab: 'dashboard',
    clubsView: 'all',
    selectedClubId: null,
    theme: localStorage.getItem('studnet-theme') || 'light',
  };

  // ── DOM refs ──────────────────────────────────────
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // ── Init ──────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', init);

  function init() {
    applyTheme(state.theme);
    populateSelects();
    bindEvents();
    lockAuth(true);
  }

  function lockAuth(locked) {
    document.body.classList.toggle('auth-locked', locked);
    $('#app-shell').classList.toggle('app-shell--visible', !locked);
  }

  function populateSelects() {
    const groupSelects = ['#filter-group'];
    const dirSelects = ['#filter-direction'];

    groupSelects.forEach(sel => {
      const el = $(sel);
      if (!el) return;
      MOCK_DATA.groups.forEach(g => {
        el.innerHTML += `<option value="${g}">${g}</option>`;
      });
    });

    dirSelects.forEach(sel => {
      const el = $(sel);
      if (!el) return;
      MOCK_DATA.directions.forEach(d => {
        el.innerHTML += `<option value="${d}">${d}</option>`;
      });
    });
  }

  // ── Events ────────────────────────────────────────
  function bindEvents() {
    $('#form-login').addEventListener('submit', handleLogin);

    // Theme
    $('#theme-toggle').addEventListener('click', toggleTheme);

    // Navigation
    $$('[data-nav]').forEach(btn => {
      btn.addEventListener('click', () => navigate(btn.dataset.nav));
    });

    // Chat filters
    // rendered dynamically

    // Send message
    $('#send-message').addEventListener('click', sendMessage);
    $('#message-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') sendMessage();
    });

    // Search filters
    ['#filter-group', '#filter-direction', '#filter-course', '#filter-online'].forEach(sel => {
      $(sel)?.addEventListener('change', renderSearchResults);
    });
    $('#reset-filters')?.addEventListener('click', resetSearchFilters);

    // Settings nav
    $$('[data-settings]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.settings === 'logout') { handleLogout(); return; }
        state.settingsTab = btn.dataset.settings;
        $$('.settings-nav__item').forEach(b => b.classList.toggle('settings-nav__item--active', b.dataset.settings === state.settingsTab));
        renderSettings();
      });
    });

    // Admin nav
    $$('[data-admin]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.adminTab = btn.dataset.admin;
        $$('.admin-nav__item').forEach(b => b.classList.toggle('admin-nav__item--active', b.dataset.admin === state.adminTab));
        renderAdmin();
      });
    });

    // Clubs tabs
    $$('[data-clubs-view]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.clubsView = btn.dataset.clubsView;
        $$('.clubs-tab').forEach(b => b.classList.toggle('clubs-tab--active', b.dataset.clubsView === state.clubsView));
        renderClubs();
      });
    });

    $('#clubs-back')?.addEventListener('click', () => {
      state.selectedClubId = null;
      $('#clubs-catalog').hidden = false;
      $('#clubs-detail').hidden = true;
    });
  }

  // ── Auth ──────────────────────────────────────────
  async function handleLogin(e) {
    e.preventDefault();
    const code = $('#login-code').value.trim();
    const result = await API.loginByCode(code);
    if (result.success) {
      state.currentUser = result.user;
      enterApp();
    } else {
      alert(result.error || 'Ошибка входа');
    }
  }

  function handleLogout() {
    state.currentUser = null;
    state.activeChatId = null;
    lockAuth(true);
    $('#screen-auth').classList.add('screen--active');
    $$('#app-shell .screen').forEach(s => s.classList.remove('screen--active'));
    $('#login-code').value = '';
    $('#admin-link').hidden = true;
  }

  function enterApp() {
    lockAuth(false);
    $('#screen-auth').classList.remove('screen--active');
    navigate('main');

    const user = state.currentUser;
    $('#current-user-avatar img').src = user.avatar;
    $('#current-user-avatar img').alt = user.name;

    $('#admin-link').hidden = user.role !== 'teacher';

    renderChatFilters();
    renderChatList();
    renderSearchResults();
    renderClubs();
    renderSettings();
  }

  // ── Navigation ────────────────────────────────────
  function navigate(screen) {
    if (!state.currentUser) return;
    state.currentScreen = screen;

    $$('#app-shell .screen').forEach(s => {
      s.classList.toggle('screen--active', s.id === `screen-${screen}`);
    });

    $$('.topnav__item').forEach(b => {
      b.classList.toggle('topnav__item--active', b.dataset.nav === screen);
    });

    if (screen === 'profile') renderProfile(state.currentUser.id);
    if (screen === 'search') renderSearchResults();
    if (screen === 'clubs') renderClubs();
    if (screen === 'settings') renderSettings();
    if (screen === 'admin') renderAdmin();
  }

  // ── Theme ─────────────────────────────────────────
  function toggleTheme() {
    state.theme = state.theme === 'light' ? 'dark' : 'light';
    applyTheme(state.theme);
    localStorage.setItem('studnet-theme', state.theme);
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
  }

  // ── Chats ─────────────────────────────────────────
  function renderChatFilters() {
    const container = $('#chat-type-filters');
    const types = [{ key: 'all', label: 'Все' }, ...Object.entries(MOCK_DATA.chatTypes).map(([key, val]) => ({ key, label: val.label }))];

    container.innerHTML = types.map(t => `
      <button class="chat-filter ${state.chatFilter === t.key ? 'chat-filter--active' : ''}" data-filter="${t.key}">${t.label}</button>
    `).join('');

    container.querySelectorAll('.chat-filter').forEach(btn => {
      btn.addEventListener('click', () => {
        state.chatFilter = btn.dataset.filter;
        renderChatFilters();
        renderChatList();
      });
    });
  }

  function renderChatList() {
    const container = $('#chat-list');
    let chats = MOCK_DATA.chats;

    if (state.chatFilter !== 'all') {
      chats = chats.filter(c => c.type === state.chatFilter);
    }

    container.innerHTML = chats.map(chat => {
      const typeInfo = MOCK_DATA.chatTypes[chat.type];
      const avatar = chat.avatar
        ? `<img src="${chat.avatar}" class="avatar avatar--md" alt="">`
        : `<div class="avatar avatar--md" style="display:flex;align-items:center;justify-content:center;font-size:1.2rem;background:var(--bg-hover)">${chat.icon || '💬'}</div>`;

      return `
        <div class="chat-item ${state.activeChatId === chat.id ? 'chat-item--active' : ''}" data-chat-id="${chat.id}">
          <div class="chat-item__avatar avatar-wrap">
            ${avatar}
          </div>
          <div class="chat-item__body">
            <div class="chat-item__top">
              <span class="chat-item__name">${chat.name}</span>
              <span class="chat-item__time">${chat.lastTime}</span>
            </div>
            <div class="chat-item__preview">${chat.lastMessage}</div>
            <div class="chat-item__meta">
              <span class="chat-type chat-type--${chat.type}">${typeInfo.label}</span>
              ${chat.unread ? `<span class="badge badge--unread">${chat.unread}</span>` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.chat-item').forEach(item => {
      item.addEventListener('click', () => selectChat(+item.dataset.chatId));
    });

    if (!state.activeChatId && chats.length) {
      selectChat(chats[0].id);
    }
  }

  async function selectChat(chatId) {
    state.activeChatId = chatId;
    const chat = MOCK_DATA.chats.find(c => c.id === chatId);
    if (!chat) return;

    renderChatList();

    const typeInfo = MOCK_DATA.chatTypes[chat.type];
    const canWrite = canWriteInChat(chat);
    $('#chat-title').textContent = chat.name;
    $('#chat-meta').textContent = `${typeInfo.label} · ${chat.members} участников`;

    updateChatInput(canWrite, chat.type);

    const messages = await API.getMessages(chatId);
    renderMessages(messages, chat);

    renderChatInfo(chat);
  }

  function renderMessages(messages, chat) {
    const container = $('#chat-messages');
    const currentUserId = state.currentUser?.id;

    if (!messages.length) {
      container.innerHTML = '<div class="empty-state"><p>Нет сообщений. Начните общение!</p></div>';
      return;
    }

    container.innerHTML = messages.map(msg => {
      const user = MOCK_DATA.users.find(u => u.id === msg.userId);
      const isOwn = msg.userId === currentUserId;
      const reactions = (msg.reactions || []).map(r =>
        `<span class="reaction">${r.emoji} ${r.count}</span>`
      ).join('');

      return `
        <div class="message ${isOwn ? 'message--own' : ''}">
          ${!isOwn ? `<img src="${user?.avatar}" class="avatar avatar--sm message__avatar" alt="">` : ''}
          <div class="message__bubble">
            ${!isOwn ? `<div class="message__author">${user?.name || 'Неизвестный'}</div>` : ''}
            <div class="message__text">${msg.text}</div>
            <div class="message__time">${msg.time}</div>
            ${reactions ? `<div class="reactions">${reactions}</div>` : ''}
          </div>
        </div>
      `;
    }).join('');

    container.scrollTop = container.scrollHeight;
  }

  function renderChatInfo(chat) {
    const empty = $('.chat-info__empty');
    const content = $('#chat-info-content');
    empty.hidden = true;
    content.hidden = false;

    const typeInfo = MOCK_DATA.chatTypes[chat.type];
    const members = MOCK_DATA.users.slice(0, 5);

    content.innerHTML = `
      <div class="chat-info__title">${chat.name}</div>
      <span class="chat-type chat-type--${chat.type}">${typeInfo.label}</span>
      <p class="chat-info__desc">${chat.description}</p>
      <div class="chat-info__section">
        <h4>Участники (${chat.members})</h4>
        <div class="member-list">
          ${members.map(u => `
            <div class="member-item" data-user-id="${u.id}">
              <div class="avatar-wrap">
                <img src="${u.avatar}" class="avatar avatar--xs" alt="">
                <span class="status-dot ${u.online ? 'status-dot--online' : ''}"></span>
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

    content.querySelectorAll('.member-item').forEach(item => {
      item.addEventListener('click', () => {
        navigate('profile');
        renderProfile(+item.dataset.userId);
      });
    });
  }

  function canWriteInChat(chat) {
    const typeInfo = MOCK_DATA.chatTypes[chat.type];
    if (!typeInfo.readonly) return true;
    return state.currentUser?.role === 'teacher';
  }

  function updateChatInput(canWrite, chatType) {
    const area = $('#chat-input-area');
    const notice = $('#chat-readonly-notice');
    const form = $('#chat-input-form');
    const input = $('#message-input');
    const sendBtn = $('#send-message');

    area.classList.toggle('chat-input--readonly', !canWrite);
    area.classList.toggle('chat-input--writable', canWrite);

    if (!canWrite) {
      notice.hidden = false;
      form.hidden = true;
      input.disabled = true;
      sendBtn.disabled = true;
      input.value = '';
    } else {
      notice.hidden = true;
      form.hidden = false;
      input.disabled = false;
      sendBtn.disabled = false;
      input.placeholder = chatType === 'dm' ? 'Написать сообщение…' : 'Написать сообщение…';
    }
  }

  async function sendMessage() {
    const input = $('#message-input');
    const text = input.value.trim();
    if (!text || !state.activeChatId || !state.currentUser) return;

    const chat = MOCK_DATA.chats.find(c => c.id === state.activeChatId);
    if (!chat || !canWriteInChat(chat)) return;

    const result = await API.sendMessage(
      state.activeChatId,
      state.currentUser.id,
      text,
      state.currentUser.role
    );
    if (result?.error) return;

    input.value = '';
    const messages = await API.getMessages(state.activeChatId);
    renderMessages(messages, chat);
  }

  // ── Profile ───────────────────────────────────────
  function renderProfile(userId) {
    const user = MOCK_DATA.users.find(u => u.id === userId);
    if (!user) return;

    const isOwn = user.id === state.currentUser?.id;
    const container = $('#profile-content');

    container.innerHTML = `
      <div class="profile-header">
        <div class="avatar-wrap">
          <img src="${user.avatar}" class="avatar avatar--xl" alt="${user.name}">
          <span class="status-dot ${user.online ? 'status-dot--online' : ''}" style="width:14px;height:14px;bottom:4px;right:4px"></span>
        </div>
        <div class="profile-header__info">
          <h1 class="profile-header__name">${user.name}</h1>
          <p class="profile-header__meta">${user.group}${user.course ? ` · ${user.course} курс` : ''} · ${user.direction}</p>
          <div class="profile-header__status">
            <span class="status-dot ${user.online ? 'status-dot--online' : ''}"></span>
            ${user.online ? 'В сети' : 'Не в сети'}
          </div>
          ${!isOwn ? `<button class="btn btn--primary" style="margin-top:16px" data-write-to="${user.id}">Написать</button>` : ''}
        </div>
      </div>
      ${user.bio ? `<div class="profile-section"><h3>О себе</h3><p>${user.bio}</p></div>` : ''}
      ${user.interests.length ? `
        <div class="profile-section">
          <h3>Интересы</h3>
          <div class="tag-list">${user.interests.map(i => `<span class="tag">${i}</span>`).join('')}</div>
        </div>
      ` : ''}
    `;

    container.querySelector('[data-write-to]')?.addEventListener('click', () => {
      const dmChat = MOCK_DATA.chats.find(c => c.type === 'dm' && c.userId === userId);
      if (dmChat) {
        navigate('main');
        selectChat(dmChat.id);
      }
    });
  }

  // ── Search ────────────────────────────────────────
  async function renderSearchResults() {
    const filters = {
      group: $('#filter-group').value,
      direction: $('#filter-direction').value,
      course: $('#filter-course').value,
      online: $('#filter-online').checked || undefined,
    };

    const users = await API.getUsers(filters);
    const filtered = users.filter(u => u.id !== state.currentUser?.id);

    $('#search-count').textContent = filtered.length;

    $('#user-cards').innerHTML = filtered.map(u => `
      <div class="user-card card--hover" data-user-id="${u.id}">
        <div class="avatar-wrap">
          <img src="${u.avatar}" class="avatar avatar--lg" alt="">
          <span class="status-dot ${u.online ? 'status-dot--online' : ''}"></span>
        </div>
        <div class="user-card__name">${u.name}</div>
        <div class="user-card__group">${u.group} · ${u.direction}</div>
        ${u.interests.length ? `<div class="user-card__interests tag-list">${u.interests.slice(0, 3).map(i => `<span class="tag">${i}</span>`).join('')}</div>` : ''}
        <button class="btn btn--secondary btn--sm" data-write-to="${u.id}">Написать</button>
      </div>
    `).join('');

    $('#user-cards').querySelectorAll('[data-user-id]').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('[data-write-to]')) return;
        renderProfile(+card.dataset.userId);
        navigate('profile');
      });
    });

    $('#user-cards').querySelectorAll('[data-write-to]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const userId = +btn.dataset.writeTo;
        const dmChat = MOCK_DATA.chats.find(c => c.type === 'dm' && c.userId === userId);
        if (dmChat) {
          navigate('main');
          selectChat(dmChat.id);
        }
      });
    });
  }

  function resetSearchFilters() {
    $('#filter-group').value = '';
    $('#filter-direction').value = '';
    $('#filter-course').value = '';
    $('#filter-online').checked = false;
    renderSearchResults();
  }

  // ── Clubs ─────────────────────────────────────────
  function renderClubs() {
    if (state.selectedClubId) {
      renderClubDetail(state.selectedClubId);
      return;
    }

    $('#clubs-catalog').hidden = false;
    $('#clubs-detail').hidden = true;

    let clubs = MOCK_DATA.clubs;
    if (state.clubsView === 'mine') {
      clubs = clubs.filter(c => c.joined);
    }

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

    $('#club-cards').querySelectorAll('.club-card').forEach(card => {
      card.addEventListener('click', () => {
        state.selectedClubId = +card.dataset.clubId;
        renderClubDetail(state.selectedClubId);
      });
    });
  }

  function renderClubDetail(clubId) {
    const club = MOCK_DATA.clubs.find(c => c.id === clubId);
    if (!club) return;

    $('#clubs-catalog').hidden = true;
    $('#clubs-detail').hidden = false;

    const members = MOCK_DATA.users.slice(0, 4);
    const clubMessages = MOCK_DATA.messages[2] || [];

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
        <button class="club-detail-tab club-detail-tab--active" data-club-tab="members">Участники</button>
        <button class="club-detail-tab" data-club-tab="chat">Чат клуба</button>
      </div>

      <div id="club-tab-content">
        <div class="club-members-grid">
          ${members.map(u => `
            <div class="club-member">
              <div class="avatar-wrap">
                <img src="${u.avatar}" class="avatar avatar--sm" alt="">
                <span class="status-dot ${u.online ? 'status-dot--online' : ''}"></span>
              </div>
              <div>
                <div style="font-weight:500;font-size:0.9rem">${u.name}</div>
                <div style="font-size:0.8rem;color:var(--text-muted)">${u.group}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    $$('.club-detail-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        $$('.club-detail-tab').forEach(t => t.classList.toggle('club-detail-tab--active', t === tab));
        const content = $('#club-tab-content');

        if (tab.dataset.clubTab === 'chat') {
          content.innerHTML = `
            <div class="club-chat-preview">
              ${clubMessages.map(msg => {
                const user = MOCK_DATA.users.find(u => u.id === msg.userId);
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
              <input type="text" placeholder="Написать в чат клуба…" style="flex:1;padding:10px 14px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg)">
              <button class="btn btn--primary btn--icon">
                <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m22 2-7 20-4-9-9-4Z"/></svg>
              </button>
            </div>
          `;
        } else {
          content.innerHTML = `
            <div class="club-members-grid">
              ${members.map(u => `
                <div class="club-member">
                  <div class="avatar-wrap">
                    <img src="${u.avatar}" class="avatar avatar--sm" alt="">
                    <span class="status-dot ${u.online ? 'status-dot--online' : ''}"></span>
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
      });
    });
  }

  // ── Settings ──────────────────────────────────────
  function renderSettings() {
    const user = state.currentUser;
    if (!user) return;

    const panels = {
      profile: `
        <h3>Профиль</h3>
        <div class="field"><label>Имя</label><input type="text" value="${user.name}"></div>
        <div class="field"><label>Email</label><input type="email" value="${user.email}"></div>
        <div class="field"><label>Группа</label><input type="text" value="${user.group}" disabled></div>
        <div class="field"><label>О себе</label><textarea rows="3">${user.bio || ''}</textarea></div>
        <button class="btn btn--primary">Сохранить</button>
      `,
      notifications: `
        <h3>Уведомления</h3>
        ${settingsToggle('Новые сообщения', 'Уведомления о входящих сообщениях', true)}
        ${settingsToggle('Упоминания', 'Когда вас упоминают в чате', true)}
        ${settingsToggle('Объявления', 'Объявления от преподавателей', true)}
        ${settingsToggle('Клубы', 'Новости и события клубов', false)}
        ${settingsToggle('Email-рассылка', 'Дублировать важные уведомления на email', false)}
      `,
      appearance: `
        <h3>Внешний вид</h3>
        <div class="field">
          <label>Тема оформления</label>
          <div class="theme-picker">
            <div class="theme-option ${state.theme === 'light' ? 'theme-option--active' : ''}" data-set-theme="light">
              <div class="theme-option__preview theme-option__preview--light"></div>
              <span>Светлая</span>
            </div>
            <div class="theme-option ${state.theme === 'dark' ? 'theme-option--active' : ''}" data-set-theme="dark">
              <div class="theme-option__preview theme-option__preview--dark"></div>
              <span>Тёмная</span>
            </div>
          </div>
        </div>
        ${settingsToggle('Компактный режим', 'Уменьшенные отступы в чатах', false)}
      `,
      privacy: `
        <h3>Приватность</h3>
        ${settingsToggle('Показывать статус онлайн', 'Другие пользователи видят, что вы в сети', true)}
        ${settingsToggle('Показывать группу', 'Группа видна в профиле', true)}
        ${settingsToggle('Разрешить сообщения', 'Любой студент может написать вам', true)}
      `,
    };

    $('#settings-content').innerHTML = panels[state.settingsTab] || '';

    $('#settings-content').querySelectorAll('[data-set-theme]').forEach(opt => {
      opt.addEventListener('click', () => {
        state.theme = opt.dataset.setTheme;
        applyTheme(state.theme);
        localStorage.setItem('studnet-theme', state.theme);
        renderSettings();
      });
    });

    $('#settings-content').querySelectorAll('.toggle').forEach(toggle => {
      toggle.addEventListener('click', () => toggle.classList.toggle('toggle--on'));
    });
  }

  function settingsToggle(label, desc, on) {
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

  // ── Admin ─────────────────────────────────────────
  async function renderAdmin() {
    const stats = await API.getAdminStats();
    const users = await API.getAdminUsers();

    const panels = {
      dashboard: `
        <h3>Обзор</h3>
        <div class="stat-grid">
          <div class="stat"><div class="stat__value">${stats.totalUsers}</div><div class="stat__label">Пользователей</div></div>
          <div class="stat"><div class="stat__value">${stats.onlineNow}</div><div class="stat__label">Онлайн сейчас</div></div>
          <div class="stat"><div class="stat__value">${stats.activeChats}</div><div class="stat__label">Активных чатов</div></div>
          <div class="stat"><div class="stat__value">${stats.pendingReports}</div><div class="stat__label">Жалоб</div></div>
        </div>
      `,
      channels: `
        <h3>Каналы</h3>
        <div class="admin-actions">
          <button class="btn btn--primary">Создать канал</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Название</th><th>Тип</th><th>Подписчиков</th><th>Действия</th></tr></thead>
            <tbody>
              ${MOCK_DATA.chats.filter(c => c.type === 'channel').map(c => `
                <tr>
                  <td>${c.name}</td>
                  <td><span class="chat-type chat-type--channel">Канал</span></td>
                  <td>${c.members}</td>
                  <td><button class="btn btn--ghost btn--sm">Редактировать</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `,
      users: `
        <h3>Пользователи</h3>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Имя</th><th>Email</th><th>Группа</th><th>Роль</th><th>Статус</th></tr></thead>
            <tbody>
              ${users.map(u => `
                <tr>
                  <td>${u.name}</td>
                  <td>${u.email}</td>
                  <td>${u.group}</td>
                  <td>${u.role === 'teacher' ? 'Преподаватель' : 'Студент'}</td>
                  <td><span class="status-dot ${u.online ? 'status-dot--online' : ''}"></span> ${u.online ? 'Онлайн' : 'Офлайн'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `,
      moderation: `
        <h3>Модерация</h3>
        <div class="card" style="margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
              <strong>Жалоба #142</strong>
              <p style="font-size:0.85rem;color:var(--text-secondary);margin-top:4px">Спам в чате «Флудилка» · 2 часа назад</p>
            </div>
            <div style="display:flex;gap:8px">
              <button class="btn btn--ghost btn--sm">Отклонить</button>
              <button class="btn btn--primary btn--sm">Заблокировать</button>
            </div>
          </div>
        </div>
        <div class="card" style="margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
              <strong>Жалоба #141</strong>
              <p style="font-size:0.85rem;color:var(--text-secondary);margin-top:4px">Оскорбление в ЛС · 5 часов назад</p>
            </div>
            <div style="display:flex;gap:8px">
              <button class="btn btn--ghost btn--sm">Отклонить</button>
              <button class="btn btn--primary btn--sm">Заблокировать</button>
            </div>
          </div>
        </div>
      `,
      announcements: `
        <h3>Объявления</h3>
        <div class="admin-actions">
          <button class="btn btn--primary">Новое объявление</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Заголовок</th><th>Канал</th><th>Дата</th><th>Просмотры</th></tr></thead>
            <tbody>
              <tr><td>Расписание на следующую неделю</td><td>Объявления колледжа</td><td>12.09.2026</td><td>890</td></tr>
              <tr><td>День открытых дверей</td><td>Объявления колледжа</td><td>10.09.2026</td><td>1240</td></tr>
              <tr><td>Хакатон «CodeFest 2026»</td><td>Информационные системы</td><td>08.09.2026</td><td>456</td></tr>
            </tbody>
          </table>
        </div>
      `,
    };

    $('#admin-content').innerHTML = panels[state.adminTab] || '';
  }

})();
