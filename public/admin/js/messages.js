(function createMessagesManagerPage() {
  const POLL_MS = 5000;
  const GLOBAL_SLUG = 'global-announcements';

  const state = {
    departments: [],
    conversations: [],
    messages: [],
    selectedDepartmentId: null,
    selectedConversationId: null,
    searchQuery: '',
    sending: false,
    infoOpen: false,
    pollTimer: null,
    refreshToken: 0
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

  function getSelectedDepartment() {
    return state.departments.find((department) => department.id === state.selectedDepartmentId) || null;
  }

  function getSelectedConversation() {
    return state.conversations.find((conversation) => conversation.id === state.selectedConversationId) || null;
  }

  function isGlobalDepartment(department = getSelectedDepartment()) {
    return department?.slug === GLOBAL_SLUG;
  }

  function getFallbackDepartmentId(departments) {
    return departments.find((department) => department.status === 'active')?.id
      || departments[0]?.id
      || null;
  }

  function resolveDepartmentId(departments, preferredId) {
    if (preferredId && departments.some((department) => department.id === preferredId)) {
      return preferredId;
    }

    return getFallbackDepartmentId(departments);
  }

  function resolveConversationId(conversations, preferredId) {
    if (preferredId && conversations.some((conversation) => conversation.id === preferredId)) {
      return preferredId;
    }

    return conversations[0]?.id || null;
  }

  async function fetchDepartments() {
    const payload = await adminFetch('/api/admin/online-chat/departments?includeSystem=1');
    return payload.data || [];
  }

  async function fetchConversations(department, searchQuery) {
    if (!department?.id) {
      return [];
    }

    if (department.slug === GLOBAL_SLUG) {
      return [];
    }

    const query = new URLSearchParams({ departmentId: String(department.id) });
    if (searchQuery.trim()) {
      query.set('search', searchQuery.trim());
    }

    const payload = await adminFetch(`/api/admin/online-chat/conversations?${query.toString()}`);
    return payload.data?.conversations || [];
  }

  async function fetchGlobalMessages() {
    const payload = await adminFetch('/api/admin/online-chat/global/messages?limit=80');
    await adminFetch('/api/admin/online-chat/global/read', {
      method: 'POST',
      body: JSON.stringify({})
    });
    return payload.data?.messages || [];
  }

  async function fetchConversationMessages(conversationId) {
    if (!conversationId) {
      return [];
    }

    const payload = await adminFetch(`/api/admin/online-chat/conversations/${conversationId}/messages?limit=80`);
    await adminFetch(`/api/admin/online-chat/conversations/${conversationId}/read`, {
      method: 'POST',
      body: JSON.stringify({})
    });
    return payload.data?.messages || [];
  }

  function renderDepartmentTabs() {
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
      `)
      .join('');
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
          ${isGlobalDepartment(department)
            ? 'Announcements are broadcast from the chat pane.'
            : 'No civilian messages in this department yet.'}
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
    const department = getSelectedDepartment();
    const conversation = getSelectedConversation();

    if (isGlobalDepartment(department)) {
      dom.chatHeader.innerHTML = `
        <div>
          <h3>Global Announcements</h3>
          <p>Broadcast to all civilians</p>
        </div>
      `;
      return;
    }

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
    const demographics = [civilian.age ? `${civilian.age} years old` : '', civilian.bloodType || '']
      .filter(Boolean)
      .join(' | ');

    dom.chatHeader.innerHTML = `
      <div>
        <h3>${escapeHtml(civilian.fullName || 'Civilian')}</h3>
        <p>${escapeHtml(department?.name || '')}</p>
      </div>
      <button type="button" class="messages-info-button" data-civilian-info-toggle aria-label="Show civilian details">
        <i class="fa-solid fa-ellipsis-vertical" aria-hidden="true"></i>
      </button>
      <div class="messages-civilian-popover${state.infoOpen ? ' is-open' : ''}">
        <strong>${escapeHtml(civilian.fullName || 'Civilian')}</strong>
        <span>${escapeHtml(civilian.code || '')}</span>
        <span>${escapeHtml(civilian.phone || 'No phone listed')}</span>
        <span>${escapeHtml(demographics || 'No medical profile')}</span>
        <span>${escapeHtml(civilian.occupation || 'No occupation listed')}</span>
      </div>
    `;
  }

  function renderTimeline() {
    const department = getSelectedDepartment();
    const viewingGlobal = isGlobalDepartment(department);

    if (viewingGlobal && !state.messages.length) {
      dom.timeline.innerHTML = `
        <div class="messages-empty-state">
          No announcements yet.
        </div>
      `;
      return;
    }

    if (!viewingGlobal && !state.selectedConversationId) {
      dom.timeline.innerHTML = `
        <div class="messages-empty-state">
          ${state.departments.length
            ? 'Select a civilian conversation to view messages.'
            : 'Department chats will appear here after you create one.'}
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
      const authorLabel = message.senderType === 'system'
        ? 'System'
        : outgoing
          ? 'Admin'
          : 'Civilian';

      return `
        ${separator}
        <article class="messages-bubble ${outgoing ? 'is-outgoing' : 'is-incoming'}">
          <span class="messages-bubble-author">${authorLabel}</span>
          <p>${escapeHtml(message.body)}</p>
          <time>${escapeHtml(formatTime(message.createdAt))}</time>
        </article>
      `;
    }).join('');

    dom.timeline.scrollTop = dom.timeline.scrollHeight;
  }

  function syncComposer() {
    const canSend = Boolean(state.departments.length) && (isGlobalDepartment() || Boolean(state.selectedConversationId));
    const submitButton = dom.composerForm.querySelector('button[type="submit"]');

    dom.composerInput.disabled = !canSend || state.sending;
    dom.composerInput.placeholder = isGlobalDepartment()
      ? 'Write an announcement for all civilians'
      : 'Type a message to the selected civilian';
    submitButton.disabled = !canSend || state.sending;
  }

  function render() {
    renderDepartmentTabs();
    renderConversations();
    renderChatHeader();
    renderTimeline();
    syncComposer();
  }

  async function refresh(options = {}) {
    const {
      keepDepartmentSelection = true,
      keepConversationSelection = true
    } = options;

    const refreshToken = ++state.refreshToken;

    try {
      const departments = await fetchDepartments();
      const nextDepartmentId = resolveDepartmentId(
        departments,
        keepDepartmentSelection ? state.selectedDepartmentId : null
      );
      const nextDepartment = departments.find((department) => department.id === nextDepartmentId) || null;
      const conversations = nextDepartment
        ? await fetchConversations(nextDepartment, state.searchQuery)
        : [];
      const nextConversationId = isGlobalDepartment(nextDepartment)
        ? null
        : resolveConversationId(
            conversations,
            keepConversationSelection ? state.selectedConversationId : null
          );
      const messages = isGlobalDepartment(nextDepartment)
        ? await fetchGlobalMessages()
        : await fetchConversationMessages(nextConversationId);

      if (refreshToken !== state.refreshToken) {
        return;
      }

      state.departments = departments;
      state.selectedDepartmentId = nextDepartmentId;
      state.conversations = conversations;
      state.selectedConversationId = nextConversationId;
      state.messages = messages;
      state.infoOpen = false;
      render();
    } catch (error) {
      console.error('Unable to refresh online messages:', error.message);
    }
  }

  async function sendMessage(body) {
    const trimmed = body.trim();
    if (!trimmed || state.sending) {
      return;
    }

    if (!isGlobalDepartment() && !state.selectedConversationId) {
      return;
    }

    state.sending = true;
    syncComposer();

    try {
      if (isGlobalDepartment()) {
        await adminFetch('/api/admin/online-chat/global/messages', {
          method: 'POST',
          body: JSON.stringify({ body: trimmed })
        });
      } else {
        await adminFetch(`/api/admin/online-chat/conversations/${state.selectedConversationId}/messages`, {
          method: 'POST',
          body: JSON.stringify({ body: trimmed })
        });
      }

      dom.composerInput.value = '';
      await refresh({
        keepDepartmentSelection: true,
        keepConversationSelection: true
      });
    } catch (error) {
      console.error('Unable to send online message:', error.message);
    } finally {
      state.sending = false;
      syncComposer();
    }
  }

  async function handleDepartmentSelect(departmentId) {
    if (!departmentId || departmentId === state.selectedDepartmentId) {
      return;
    }

    state.selectedDepartmentId = departmentId;
    state.selectedConversationId = null;
    state.messages = [];
    state.infoOpen = false;
    render();

    await refresh({
      keepDepartmentSelection: true,
      keepConversationSelection: false
    });
  }

  async function handleConversationSelect(conversationId) {
    if (!conversationId || conversationId === state.selectedConversationId) {
      return;
    }

    state.selectedConversationId = conversationId;
    state.messages = [];
    state.infoOpen = false;
    render();

    await refresh({
      keepDepartmentSelection: true,
      keepConversationSelection: true
    });
  }

  function bindEvents() {
    dom.scopeRail.addEventListener('click', (event) => {
      const button = event.target.closest('[data-department-id]');
      if (!button) {
        return;
      }

      void handleDepartmentSelect(Number(button.getAttribute('data-department-id')));
    });

    dom.conversationList.addEventListener('click', (event) => {
      const button = event.target.closest('[data-conversation-id]');
      if (!button) {
        return;
      }

      void handleConversationSelect(Number(button.getAttribute('data-conversation-id')));
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
        void refresh({
          keepDepartmentSelection: true,
          keepConversationSelection: false
        });
      }, 250);
    });

    dom.composerForm.addEventListener('submit', (event) => {
      event.preventDefault();
      void sendMessage(dom.composerInput.value);
    });
  }

  function startPolling() {
    window.clearInterval(state.pollTimer);
    state.pollTimer = window.setInterval(() => {
      void refresh({
        keepDepartmentSelection: true,
        keepConversationSelection: true
      });
    }, POLL_MS);
  }

  bindEvents();
  void refresh({
    keepDepartmentSelection: false,
    keepConversationSelection: false
  }).then(startPolling);
}());
