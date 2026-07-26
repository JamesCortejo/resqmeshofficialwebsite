(function createMessagesManagerPage() {
  const POLL_MS = 5000;
  const GLOBAL_SLUG = 'global-announcements';
  const MESSAGE_PAGE_SIZE = 30;

  const state = {
    departments: [],
    conversations: [],
    messages: [],
    selectedDepartmentId: null,
    selectedConversationId: null,
    searchQuery: '',
    sending: false,
    infoOpen: false,
    loadingConversations: false,
    loadingMessages: false,
    loadingOlderMessages: false,
    hasOlderMessages: false,
    pollTimer: null,
    refreshToken: 0,
    lastNotificationSignature: ''
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

  function formatDateTime(value) {
    if (!value) {
      return '';
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return '';
    }

    return parsed.toLocaleString([], {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
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

  function resolveConversationId(conversations, preferredId, allowFirstFallback = false) {
    if (preferredId && conversations.some((conversation) => conversation.id === preferredId)) {
      return preferredId;
    }

    return allowFirstFallback ? (conversations[0]?.id || null) : null;
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

  async function fetchGlobalMessagesPage({ beforeId = null, afterId = null, limit = MESSAGE_PAGE_SIZE } = {}) {
    const query = new URLSearchParams({ limit: String(limit) });
    if (beforeId) {
      query.set('before', String(beforeId));
    }
    if (afterId) {
      query.set('after', String(afterId));
    }

    const payload = await adminFetch(`/api/admin/online-chat/global/messages?${query.toString()}`);
    await adminFetch('/api/admin/online-chat/global/read', {
      method: 'POST',
      body: JSON.stringify({})
    });
    return payload.data?.messages || [];
  }

  async function fetchConversationMessages(conversationId, { beforeId = null, afterId = null, limit = MESSAGE_PAGE_SIZE } = {}) {
    if (!conversationId) {
      return [];
    }

    const query = new URLSearchParams({ limit: String(limit) });
    if (beforeId) {
      query.set('before', String(beforeId));
    }
    if (afterId) {
      query.set('after', String(afterId));
    }

    const payload = await adminFetch(`/api/admin/online-chat/conversations/${conversationId}/messages?${query.toString()}`);
    await adminFetch(`/api/admin/online-chat/conversations/${conversationId}/read`, {
      method: 'POST',
      body: JSON.stringify({})
    });
    return payload.data?.messages || [];
  }

  function mergeMessages(currentMessages, incomingMessages) {
    if (!incomingMessages.length) {
      return currentMessages;
    }

    const seen = new Set(currentMessages.map((message) => message.id));
    const merged = [...currentMessages];

    incomingMessages.forEach((message) => {
      if (!seen.has(message.id)) {
        merged.push(message);
      }
    });

    return merged.sort((left, right) => left.id - right.id);
  }

  function prependMessages(currentMessages, olderMessages) {
    if (!olderMessages.length) {
      return currentMessages;
    }

    const seen = new Set(currentMessages.map((message) => message.id));
    const dedupedOlder = olderMessages.filter((message) => !seen.has(message.id));
    return [...dedupedOlder, ...currentMessages];
  }

  function isTimelineNearBottom() {
    const threshold = 96;
    return dom.timeline.scrollTop + dom.timeline.clientHeight >= dom.timeline.scrollHeight - threshold;
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

    if (state.loadingConversations) {
      dom.conversationList.innerHTML = `
        <div class="messages-loading-state">
          <span class="messages-loading-spinner" aria-hidden="true"></span>
          <strong>Loading civilians</strong>
          <p>Fetching department conversations.</p>
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
      const distressChip = conversation.hasActiveOnlineDistress
        ? '<span class="messages-conversation-distress-chip">Distress</span>'
        : '';

      return `
          <button
            type="button"
            class="messages-conversation-card${conversation.id === state.selectedConversationId ? ' is-active' : ''}${conversation.hasActiveOnlineDistress ? ' is-distress' : ''}"
            data-conversation-id="${conversation.id}"
          >
            <span class="messages-conversation-main">
              <span class="messages-conversation-name-row">
                <strong>${escapeHtml(civilian.fullName || 'Civilian')}</strong>
                ${distressChip}
              </span>
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
      const distress = conversation.activeOnlineDistress;
      const distressMeta = distress
        ? [
            distress.code || 'Online distress',
            distress.reason || '',
            distress.recordedAt ? formatDateTime(distress.recordedAt) : ''
          ].filter(Boolean).join(' | ')
        : '';

      dom.chatHeader.innerHTML = `
        <div>
          <h3 class="messages-chat-title-row">
            <span>${escapeHtml(civilian.fullName || 'Civilian')}</span>
            ${conversation.hasActiveOnlineDistress ? '<span class="messages-chat-distress-chip">Distress Active</span>' : ''}
          </h3>
          <p>${escapeHtml(department?.name || '')}</p>
          ${distressMeta ? `<small class="messages-chat-distress-meta">${escapeHtml(distressMeta)}</small>` : ''}
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

  function renderTimeline(options = {}) {
    const { scrollToBottom = false, preserveScroll = null } = options;
    const department = getSelectedDepartment();
    const viewingGlobal = isGlobalDepartment(department);

    if (state.loadingMessages) {
      dom.timeline.innerHTML = `
        <div class="messages-loading-state messages-loading-state-chat">
          <span class="messages-loading-spinner" aria-hidden="true"></span>
          <strong>Loading chat</strong>
          <p>${viewingGlobal ? 'Fetching announcements.' : 'Fetching conversation history.'}</p>
        </div>
      `;
      return;
    }

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
    const loadingOlderMarkup = state.loadingOlderMessages ? `
      <div class="messages-loading-older">
        <span class="messages-loading-spinner" aria-hidden="true"></span>
        <span>Loading older messages</span>
      </div>
    ` : '';

    dom.timeline.innerHTML = loadingOlderMarkup + state.messages.map((message) => {
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

    if (preserveScroll) {
      dom.timeline.scrollTop = dom.timeline.scrollHeight - preserveScroll.height + preserveScroll.offset;
    } else if (scrollToBottom) {
      dom.timeline.scrollTop = dom.timeline.scrollHeight;
    }
  }

  function syncComposer() {
    const canSend = Boolean(state.departments.length)
      && (isGlobalDepartment() || Boolean(state.selectedConversationId))
      && !state.loadingMessages;
    const submitButton = dom.composerForm.querySelector('button[type="submit"]');

    dom.composerInput.disabled = !canSend || state.sending;
    dom.composerInput.placeholder = isGlobalDepartment()
      ? 'Write an announcement for all civilians'
      : 'Type a message to the selected civilian';
    submitButton.disabled = !canSend || state.sending;
  }

  function render(options = {}) {
    renderDepartmentTabs();
    renderConversations();
    renderChatHeader();
    renderTimeline(options);
    syncComposer();
  }

  async function refresh(options = {}) {
    const {
      keepDepartmentSelection = true,
      keepConversationSelection = true,
      autoSelectConversation = false,
      forceMessageReload = false,
      scrollToBottom = false
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
      const previousDepartmentId = state.selectedDepartmentId;
      const previousConversationId = state.selectedConversationId;
      const sameDepartment = nextDepartmentId === previousDepartmentId;
      const nextConversationId = isGlobalDepartment(nextDepartment)
        ? null
        : resolveConversationId(
            conversations,
            keepConversationSelection ? state.selectedConversationId : null,
            autoSelectConversation
          );
      const sameConversation = nextConversationId === previousConversationId;
      const canAppendNewMessages =
        !forceMessageReload &&
        sameDepartment &&
        (isGlobalDepartment(nextDepartment) || sameConversation) &&
        state.messages.length > 0;
      const latestMessageId = canAppendNewMessages
        ? state.messages[state.messages.length - 1]?.id || null
        : null;
      const nearBottom = canAppendNewMessages ? isTimelineNearBottom() : false;
      const incomingMessages = isGlobalDepartment(nextDepartment)
        ? await fetchGlobalMessagesPage({
            afterId: latestMessageId,
            limit: latestMessageId ? 100 : MESSAGE_PAGE_SIZE
          })
        : await fetchConversationMessages(nextConversationId, {
            afterId: latestMessageId,
            limit: latestMessageId ? 100 : MESSAGE_PAGE_SIZE
          });
      const messages = latestMessageId
        ? mergeMessages(state.messages, incomingMessages)
        : incomingMessages;

      if (refreshToken !== state.refreshToken) {
        return;
      }

      state.departments = departments;
      state.selectedDepartmentId = nextDepartmentId;
      state.conversations = conversations;
      state.selectedConversationId = nextConversationId;
      state.messages = messages;
      if (!latestMessageId) {
        state.hasOlderMessages = incomingMessages.length >= MESSAGE_PAGE_SIZE;
      }
      state.infoOpen = false;
      state.loadingConversations = false;
      state.loadingMessages = false;
      render({
        scrollToBottom: latestMessageId ? nearBottom && incomingMessages.length > 0 : scrollToBottom || true
      });
    } catch (error) {
      if (refreshToken === state.refreshToken) {
        state.loadingConversations = false;
        state.loadingMessages = false;
        render();
      }
      console.error('Unable to refresh online messages:', error.message);
    }
  }

  async function loadOlderMessages() {
    if (state.loadingMessages || state.loadingOlderMessages || !state.hasOlderMessages) {
      return;
    }

    const oldestMessageId = state.messages[0]?.id;
    const department = getSelectedDepartment();
    if (!oldestMessageId || !department) {
      return;
    }

    state.loadingOlderMessages = true;
    render();

    const preserveScroll = {
      height: dom.timeline.scrollHeight,
      offset: dom.timeline.scrollTop
    };

    try {
      const olderMessages = isGlobalDepartment(department)
        ? await fetchGlobalMessagesPage({ beforeId: oldestMessageId, limit: MESSAGE_PAGE_SIZE })
        : await fetchConversationMessages(state.selectedConversationId, {
            beforeId: oldestMessageId,
            limit: MESSAGE_PAGE_SIZE
          });

      state.messages = prependMessages(state.messages, olderMessages);
      state.hasOlderMessages = olderMessages.length >= MESSAGE_PAGE_SIZE;
      state.loadingOlderMessages = false;
      render({ preserveScroll });
    } catch (error) {
      state.loadingOlderMessages = false;
      render();
      console.error('Unable to load older online messages:', error.message);
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
        keepConversationSelection: true,
        autoSelectConversation: false,
        scrollToBottom: true
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
    state.loadingConversations = true;
    state.loadingMessages = true;
    state.conversations = [];
    state.selectedConversationId = null;
    state.messages = [];
    state.infoOpen = false;
    render();

    await refresh({
      keepDepartmentSelection: true,
      keepConversationSelection: false,
      autoSelectConversation: false,
      forceMessageReload: true,
      scrollToBottom: true
    });
  }

  async function handleConversationSelect(conversationId) {
    if (!conversationId || conversationId === state.selectedConversationId) {
      return;
    }

    state.selectedConversationId = conversationId;
    state.loadingMessages = true;
    state.messages = [];
    state.infoOpen = false;
    render();

    await refresh({
      keepDepartmentSelection: true,
      keepConversationSelection: true,
      autoSelectConversation: false,
      forceMessageReload: true,
      scrollToBottom: true
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
        state.loadingConversations = true;
        state.loadingMessages = true;
        state.conversations = [];
        state.selectedConversationId = null;
        state.messages = [];
        render();
        void refresh({
          keepDepartmentSelection: true,
          keepConversationSelection: false,
          autoSelectConversation: false
        });
      }, 250);
    });

    dom.composerForm.addEventListener('submit', (event) => {
      event.preventDefault();
      void sendMessage(dom.composerInput.value);
    });

    dom.timeline.addEventListener('scroll', () => {
      if (dom.timeline.scrollTop <= 80) {
        void loadOlderMessages();
      }
    });

    window.addEventListener('resqmesh:admin-notifications-refreshed', (event) => {
      const notifications = Array.isArray(event.detail?.notifications)
        ? event.detail.notifications
        : [];
      const chatNotifications = notifications
        .filter((notification) => notification?.type === 'online-chat.message.received' && !notification.isRead)
        .map((notification) => `${notification.id}:${notification.relatedEntityId || ''}`)
        .join('|');

      if (chatNotifications === state.lastNotificationSignature) {
        return;
      }

      state.lastNotificationSignature = chatNotifications;
      void refresh({
        keepDepartmentSelection: true,
        keepConversationSelection: true,
        autoSelectConversation: false
      });
    });
  }

  function startPolling() {
    window.clearInterval(state.pollTimer);
    state.pollTimer = window.setInterval(() => {
      void refresh({
        keepDepartmentSelection: true,
        keepConversationSelection: true,
        autoSelectConversation: false
      });
    }, POLL_MS);
  }

  bindEvents();
  void refresh({
    keepDepartmentSelection: false,
    keepConversationSelection: false,
    autoSelectConversation: false,
    forceMessageReload: true,
    scrollToBottom: true
  }).then(startPolling);
}());
