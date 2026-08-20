(function defineMessagesRenderModule() {
  const modules = window.ResQMeshMessagesModules = window.ResQMeshMessagesModules || {};

  function createRender(context) {
    const { state, dom, helpers, formatters, voice } = context;
    const { escapeHtml, formatDateTime, formatTime, formatVoiceTime } = formatters;

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
      const department = helpers.getSelectedDepartment();
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
            ${helpers.isGlobalDepartment(department)
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
      const department = helpers.getSelectedDepartment();
      const conversation = helpers.getSelectedConversation();

      if (helpers.isGlobalDepartment(department)) {
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
      const department = helpers.getSelectedDepartment();
      const viewingGlobal = helpers.isGlobalDepartment(department);

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
          : message.senderType === 'admin'
            ? 'Admin'
            : message.senderType === 'rescuer'
              ? 'Rescuer'
              : (message.senderDisplayName || 'Civilian');
        const isVoice = message.messageType === 'voice';
        const voiceDuration = Number(message.voiceClip?.durationSeconds || 0);
        const bodyMarkup = isVoice
          ? `
            <button type="button" class="messages-voice-control" data-voice-control-id="${message.id}">
              <span class="messages-voice-play">
                <i class="fa-solid fa-play" data-voice-icon aria-hidden="true"></i>
              </span>
              <span class="messages-voice-main">
                <span class="messages-voice-topline">
                  <strong data-voice-status>Voice message</strong>
                  <small data-voice-time>${voiceDuration > 0 ? `0:00 / ${formatVoiceTime(voiceDuration)}` : '0:00'}</small>
                </span>
                <span class="messages-voice-track" aria-hidden="true">
                  <span class="messages-voice-fill" data-voice-progress style="width: 0%"></span>
                </span>
              </span>
            </button>
          `
          : `<p>${escapeHtml(message.body)}</p>`;

        return `
          ${separator}
          <article class="messages-bubble ${outgoing ? 'is-outgoing' : 'is-incoming'}">
            <span class="messages-bubble-author">${escapeHtml(authorLabel)}</span>
            ${bodyMarkup}
            <time>${escapeHtml(formatTime(message.createdAt))}</time>
          </article>
        `;
      }).join('');

      if (preserveScroll) {
        dom.timeline.scrollTop = dom.timeline.scrollHeight - preserveScroll.height + preserveScroll.offset;
      } else if (scrollToBottom) {
        dom.timeline.scrollTop = dom.timeline.scrollHeight;
      }

      voice.syncVoiceControls();
    }

    function syncComposer() {
      const canSend = Boolean(state.departments.length)
        && (helpers.isGlobalDepartment() || Boolean(state.selectedConversationId))
        && !state.loadingMessages;
      const submitButton = dom.composerForm.querySelector('button[type="submit"]');

      dom.composerInput.disabled = !canSend || state.sending;
      dom.composerInput.placeholder = helpers.isGlobalDepartment()
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

    return {
      renderDepartmentTabs,
      renderConversations,
      renderChatHeader,
      renderTimeline,
      syncComposer,
      render
    };
  }

  modules.createRender = createRender;
}());
