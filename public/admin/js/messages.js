(function createMessagesManagerPage() {
  const POLL_MS = 5000;

  const state = {
    departments: [],
    conversations: [],
    messages: [],
    selectedDepartmentId: null,
    selectedConversationId: null,
    searchQuery: '',
    loading: false,
    sending: false,
    infoOpen: false,
    pollTimer: null
  };

  const dom = {
    scopeRail: document.getElementById('messagesScopeRail'),
    conversationList: document.getElementById('messagesConversationList'),
    conversationSearchInput: document.getElementById('messagesConversationSearchInput'),
    conversationPaneTitle: document.getElementById('messagesConversationPaneTitle'),
    chatHeader: document.getElementById('messagesChatHeader'),
    timeline: document.getElementById('messagesTimeline'),
    composerForm: document.getElementById('messagesComposerForm'),
    composerInput: document.getElementById('messagesComposerInput')
  };

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async function readJson(response) {
    return response.json().catch(() => ({}));
  }

  async function adminFetch(url, options = {}) {
    const requestOptions = await window.ResQMeshAdminAuth.prepareRequestOptions(options);
    const response = await fetch(url, requestOptions);
    const payload = await readJson(response);

    if (response.status === 401) {
      window.ResQMeshAdminAuth.handleUnauthorized(payload.message || 'Admin session expired.');
      throw new Error(payload.message || 'Admin session expired.');
    }

    if (!response.ok || payload.success === false) {
      throw new Error(payload.message || 'Request failed.');
    }

    return payload;
  }

  function getSelectedDepartment() {
    return state.departments.find((department) => department.id === state.selectedDepartmentId) || null;
  }

  function getSelectedConversation() {
    return state.conversations.find((conversation) => conversation.id === state.selectedConversationId) || null;
  }

  function formatTime(value) {
    if (!value) {
      return '';
    }

    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) {
      return '';
    }

    return parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function renderDepartmentTabs() {
    if (!dom.scopeRail) {
      return;
    }

    if (!state.departments.length) {
      dom.scopeRail.innerHTML = `
        <div class="messages-empty-state">
          No department chats yet. Add one from Department Chats.
        </div>
      `;
      return;
    }

    dom.scopeRail.innerHTML = state.departments
      .filter((department) => department.status !== 'archived')
      .map((department) => `
        <button
          type="button"
          class="messages-scope-chip${department.id === state.selectedDepartmentId ? ' is-active' : ''}"
          data-department-id="${department.id}"
        >
          <span class="messages-scope-chip-label">${escapeHtml(department.name)}</span>
          <small class="messages-scope-chip-meta">${escapeHtml(department.subtitle || '')}</small>
          ${department.unreadCount > 0 ? `<strong class="messages-scope-badge">${department.unreadCount}</strong>` : ''}
        </button>
      `).join('');
  }

  function renderConversations() {
    const department = getSelectedDepartment();
    dom.conversationPaneTitle.textContent = department?.name || 'Department';

    if (!state.departments.length) {
      dom.conversationList.innerHTML = `
        <div class="messages-empty-state">
          Create a department chat first.
        </div>
      `;
      return;
    }

    if (!state.conversations.length) {
      dom.conversationList.innerHTML = `
        <div class="messages-empty-state">
          No civilian messages in this department yet.
        </div>
      `;
      return;
    }

    dom.conversationList.innerHTML = state.conversations.map((conversation) => {
      const civilian = conversation.civilian || {};
      return `
        <button
          type="button"
          class="messages-conversation-card${conversation.id === state.selectedConversationId ? ' is-active' : ''}"
          data-conversation-id="${conversation.id}"
        >
          <span class="messages-conversation-main">
            <strong>${escapeHtml(civilian.fullName || 'Civilian')}</strong>
            <small>${escapeHtml(civilian.code || '')}</small>
          </span>
          ${conversation.unreadCount > 0 ? `<span class="messages-conversation-badge">${conversation.unreadCount}</span>` : ''}
        </button>
      `;
    }).join('');
  }

  function renderChatHeader() {
    const conversation = getSelectedConversation();
    const department = getSelectedDepartment();

    if (!conversation) {
      dom.chatHeader.innerHTML = `
        <div>
          <h3>${state.departments.length ? 'Select a civilian' : 'No department chats yet'}</h3>
          <p>${escapeHtml(department?.name || (state.departments.length ? 'Department' : 'Add a department chat to begin'))}</p>
        </div>
      `;
      return;
    }

    const civilian = conversation.civilian || {};
    dom.chatHeader.innerHTML = `
      <div>
        <h3>${escapeHtml(civilian.fullName || 'Civilian')}</h3>
        <p>${escapeHtml(department?.name || '')}</p>
      </div>
      <button type="button" class="messages-info-button" data-civilian-info-toggle aria-label="Show civilian details">
        <i class="fa-solid fa-ellipsis-vertical" aria-hidden="true"></i>
      </button>
      <div class="messages-civilian-popover${state.infoOpen ? ' is-open' : ''}" id="messagesCivilianPopover">
        <strong>${escapeHtml(civilian.fullName || 'Civilian')}</strong>
        <span>${escapeHtml(civilian.code || '')}</span>
        <span>${escapeHtml(civilian.phone || 'No phone listed')}</span>
        <span>${escapeHtml([civilian.age ? `${civilian.age} years old` : '', civilian.bloodType || ''].filter(Boolean).join(' | ') || 'No medical profile')}</span>
        <span>${escapeHtml(civilian.occupation || 'No occupation listed')}</span>
      </div>
    `;
  }

  function renderTimeline() {
    if (!state.selectedConversationId) {
      dom.timeline.innerHTML = `
        <div class="messages-empty-state">
          ${state.departments.length ? 'Select a civilian conversation to view messages.' : 'Department chats will appear here after you create one.'}
        </div>
      `;
      return;
    }

    if (!state.messages.length) {
      dom.timeline.innerHTML = `
        <div class="messages-empty-state">
          No messages yet.
        </div>
      `;
      return;
    }

    let lastDate = '';
    dom.timeline.innerHTML = state.messages.map((message) => {
      const parsed = new Date(message.createdAt);
      const dateLabel = Number.isNaN(parsed.getTime())
        ? ''
        : parsed.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
      const separator = dateLabel && dateLabel !== lastDate
        ? `<div class="messages-date-separator">${escapeHtml(dateLabel)}</div>`
        : '';

      if (dateLabel) {
        lastDate = dateLabel;
      }

      const outgoing = message.senderType === 'admin';
      return `
        ${separator}
        <article class="messages-bubble ${outgoing ? 'is-outgoing' : 'is-incoming'}">
          <span class="messages-bubble-author">${outgoing ? 'Admin' : 'Civilian'}</span>
          <p>${escapeHtml(message.body)}</p>
          <time>${escapeHtml(formatTime(message.createdAt))}</time>
        </article>
      `;
    }).join('');

    dom.timeline.scrollTop = dom.timeline.scrollHeight;
  }

  function syncComposer() {
    const disabled = !state.selectedConversationId || state.sending || !state.departments.length;
    dom.composerInput.disabled = disabled;
    dom.composerForm.querySelector('button[type="submit"]').disabled = disabled;
  }

  function render() {
    renderDepartmentTabs();
    renderConversations();
    renderChatHeader();
    renderTimeline();
    syncComposer();
  }

  async function loadDepartments({ preserveSelection = true } = {}) {
    const payload = await adminFetch('/api/admin/online-chat/departments?includeSystem=1');
    state.departments = payload.data || [];

    if (
      !preserveSelection
      || !state.selectedDepartmentId
      || !state.departments.some((department) => department.id === state.selectedDepartmentId)
    ) {
      state.selectedDepartmentId = state.departments.find((department) => department.status === 'active')?.id
        || state.departments[0]?.id
        || null;
    }
  }

  async function loadConversations({ preserveSelection = true } = {}) {
    if (!state.selectedDepartmentId) {
      state.conversations = [];
      state.selectedConversationId = null;
      return;
    }

    const query = new URLSearchParams({ departmentId: String(state.selectedDepartmentId) });
    if (state.searchQuery.trim()) {
      query.set('search', state.searchQuery.trim());
    }

    const payload = await adminFetch(`/api/admin/online-chat/conversations?${query.toString()}`);
    state.conversations = payload.data?.conversations || [];

    if (
      !preserveSelection
      || !state.selectedConversationId
      || !state.conversations.some((conversation) => conversation.id === state.selectedConversationId)
    ) {
      state.selectedConversationId = state.conversations[0]?.id || null;
    }
  }

  async function loadMessages() {
    if (!state.selectedConversationId) {
      state.messages = [];
      return;
    }

    const payload = await adminFetch(`/api/admin/online-chat/conversations/${state.selectedConversationId}/messages?limit=80`);
    state.messages = payload.data?.messages || [];
    await adminFetch(`/api/admin/online-chat/conversations/${state.selectedConversationId}/read`, {
      method: 'POST',
      body: JSON.stringify({})
    });
  }

  async function refresh({ preserveSelection = true } = {}) {
    if (state.loading) {
      return;
    }

    state.loading = true;
    try {
      await loadDepartments({ preserveSelection });
      await loadConversations({ preserveSelection });
      await loadMessages();
      state.infoOpen = false;
      render();
    } catch (error) {
      console.error('Unable to refresh online messages:', error.message);
    } finally {
      state.loading = false;
    }
  }

  async function sendMessage(body) {
    if (!state.selectedConversationId || state.sending) {
      return;
    }

    const trimmed = body.trim();
    if (!trimmed) {
      return;
    }

    state.sending = true;
    syncComposer();
    try {
      await adminFetch(`/api/admin/online-chat/conversations/${state.selectedConversationId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ body: trimmed })
      });
      dom.composerInput.value = '';
      await refresh({ preserveSelection: true });
    } catch (error) {
      console.error('Unable to send online message:', error.message);
    } finally {
      state.sending = false;
      syncComposer();
    }
  }

  function bindEvents() {
    dom.scopeRail.addEventListener('click', (event) => {
      const button = event.target.closest('[data-department-id]');
      if (!button) {
        return;
      }

      state.selectedDepartmentId = Number(button.getAttribute('data-department-id'));
      state.selectedConversationId = null;
      state.messages = [];
      refresh({ preserveSelection: false });
    });

    dom.conversationList.addEventListener('click', (event) => {
      const button = event.target.closest('[data-conversation-id]');
      if (!button) {
        return;
      }

      state.selectedConversationId = Number(button.getAttribute('data-conversation-id'));
      state.infoOpen = false;
      loadMessages().then(render).catch((error) => {
        console.error('Unable to load online conversation:', error.message);
      });
    });

    dom.chatHeader.addEventListener('click', (event) => {
      if (!event.target.closest('[data-civilian-info-toggle]')) {
        return;
      }

      state.infoOpen = !state.infoOpen;
      renderChatHeader();
    });

    let searchTimeout = null;
    dom.conversationSearchInput.addEventListener('input', () => {
      state.searchQuery = dom.conversationSearchInput.value;
      window.clearTimeout(searchTimeout);
      searchTimeout = window.setTimeout(() => {
        refresh({ preserveSelection: false });
      }, 250);
    });

    dom.composerForm.addEventListener('submit', (event) => {
      event.preventDefault();
      sendMessage(dom.composerInput.value);
    });
  }

  function startPolling() {
    window.clearInterval(state.pollTimer);
    state.pollTimer = window.setInterval(() => {
      refresh({ preserveSelection: true });
    }, POLL_MS);
  }

  bindEvents();
  refresh({ preserveSelection: false }).then(startPolling);
}());
