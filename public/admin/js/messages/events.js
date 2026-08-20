(function defineMessagesEventsModule() {
  const modules = window.ResQMeshMessagesModules = window.ResQMeshMessagesModules || {};

  function createEvents(context) {
    const { constants, state, dom, render, flow, voice } = context;

    function bindEvents() {
      dom.scopeRail.addEventListener('click', (event) => {
        const button = event.target.closest('[data-department-id]');
        if (!button) {
          return;
        }

        void flow.handleDepartmentSelect(Number(button.getAttribute('data-department-id')));
      });

      dom.conversationList.addEventListener('click', (event) => {
        const button = event.target.closest('[data-conversation-id]');
        if (!button) {
          return;
        }

        void flow.handleConversationSelect(Number(button.getAttribute('data-conversation-id')));
      });

      dom.chatHeader.addEventListener('click', (event) => {
        if (!event.target.closest('[data-civilian-info-toggle]')) {
          return;
        }

        state.infoOpen = !state.infoOpen;
        render.renderChatHeader();
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
          render.render();
          void flow.refresh({
            keepDepartmentSelection: true,
            keepConversationSelection: false,
            autoSelectConversation: false
          });
        }, 250);
      });

      dom.composerForm.addEventListener('submit', (event) => {
        event.preventDefault();
        void flow.sendMessage(dom.composerInput.value);
      });

      dom.timeline.addEventListener('scroll', () => {
        if (dom.timeline.scrollTop <= 80) {
          void flow.loadOlderMessages();
        }
      });

      dom.timeline.addEventListener('click', (event) => {
        const voiceControl = event.target.closest('[data-voice-control-id]');
        if (!voiceControl) {
          return;
        }

        void voice.playVoiceClip(Number(voiceControl.dataset.voiceControlId));
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
        void flow.refresh({
          keepDepartmentSelection: true,
          keepConversationSelection: true,
          autoSelectConversation: false
        });
      });
    }

    function startPolling() {
      window.clearInterval(state.pollTimer);
      state.pollTimer = window.setInterval(() => {
        void flow.refresh({
          keepDepartmentSelection: true,
          keepConversationSelection: true,
          autoSelectConversation: false
        });
      }, constants.POLL_MS);
    }

    return {
      bindEvents,
      startPolling
    };
  }

  modules.createEvents = createEvents;
}());
