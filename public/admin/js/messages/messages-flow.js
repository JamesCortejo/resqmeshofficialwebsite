(function defineMessagesFlowModule() {
  const modules = window.ResQMeshMessagesModules = window.ResQMeshMessagesModules || {};

  function createMessagesFlow(context) {
    const { constants, state, dom, helpers, api, render, voice } = context;

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
        const departments = await api.fetchDepartments();
        const nextDepartmentId = helpers.resolveDepartmentId(
          departments,
          keepDepartmentSelection ? state.selectedDepartmentId : null
        );
        const nextDepartment = departments.find((department) => department.id === nextDepartmentId) || null;
        const conversations = nextDepartment
          ? await api.fetchConversations(nextDepartment, state.searchQuery)
          : [];
        const previousDepartmentId = state.selectedDepartmentId;
        const previousConversationId = state.selectedConversationId;
        const sameDepartment = nextDepartmentId === previousDepartmentId;
        const nextConversationId = helpers.isGlobalDepartment(nextDepartment)
          ? null
          : helpers.resolveConversationId(
              conversations,
              keepConversationSelection ? state.selectedConversationId : null,
              autoSelectConversation
            );
        const sameConversation = nextConversationId === previousConversationId;
        const canAppendNewMessages =
          !forceMessageReload &&
          sameDepartment &&
          (helpers.isGlobalDepartment(nextDepartment) || sameConversation) &&
          state.messages.length > 0;
        const latestMessageId = canAppendNewMessages
          ? state.messages[state.messages.length - 1]?.id || null
          : null;
        const nearBottom = canAppendNewMessages ? isTimelineNearBottom() : false;
        const incomingMessages = helpers.isGlobalDepartment(nextDepartment)
          ? await api.fetchGlobalMessagesPage({
              afterId: latestMessageId,
              limit: latestMessageId ? 100 : constants.MESSAGE_PAGE_SIZE
            })
          : await api.fetchConversationMessages(nextConversationId, {
              afterId: latestMessageId,
              limit: latestMessageId ? 100 : constants.MESSAGE_PAGE_SIZE
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
          state.hasOlderMessages = incomingMessages.length >= constants.MESSAGE_PAGE_SIZE;
        }
        state.infoOpen = false;
        state.loadingConversations = false;
        state.loadingMessages = false;
        render.render({
          scrollToBottom: latestMessageId ? nearBottom && incomingMessages.length > 0 : scrollToBottom || true
        });
      } catch (error) {
        if (refreshToken === state.refreshToken) {
          state.loadingConversations = false;
          state.loadingMessages = false;
          render.render();
        }
        console.error('Unable to refresh online messages:', error.message);
      }
    }

    async function loadOlderMessages() {
      if (state.loadingMessages || state.loadingOlderMessages || !state.hasOlderMessages) {
        return;
      }

      const oldestMessageId = state.messages[0]?.id;
      const department = helpers.getSelectedDepartment();
      if (!oldestMessageId || !department) {
        return;
      }

      state.loadingOlderMessages = true;
      render.render();

      const preserveScroll = {
        height: dom.timeline.scrollHeight,
        offset: dom.timeline.scrollTop
      };

      try {
        const olderMessages = helpers.isGlobalDepartment(department)
          ? await api.fetchGlobalMessagesPage({ beforeId: oldestMessageId, limit: constants.MESSAGE_PAGE_SIZE })
          : await api.fetchConversationMessages(state.selectedConversationId, {
              beforeId: oldestMessageId,
              limit: constants.MESSAGE_PAGE_SIZE
            });

        state.messages = prependMessages(state.messages, olderMessages);
        state.hasOlderMessages = olderMessages.length >= constants.MESSAGE_PAGE_SIZE;
        state.loadingOlderMessages = false;
        render.render({ preserveScroll });
      } catch (error) {
        state.loadingOlderMessages = false;
        render.render();
        console.error('Unable to load older online messages:', error.message);
      }
    }

    async function sendMessage(body) {
      const trimmed = body.trim();
      if (!trimmed || state.sending) {
        return;
      }

      if (!helpers.isGlobalDepartment() && !state.selectedConversationId) {
        return;
      }

      state.sending = true;
      render.syncComposer();

      try {
        if (helpers.isGlobalDepartment()) {
          await api.sendGlobalMessage(trimmed);
        } else {
          await api.sendConversationMessage(state.selectedConversationId, trimmed);
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
        render.syncComposer();
      }
    }

    async function handleDepartmentSelect(departmentId) {
      if (!departmentId || departmentId === state.selectedDepartmentId) {
        return;
      }

      voice.stopVoicePlayback();
      state.selectedDepartmentId = departmentId;
      state.loadingConversations = true;
      state.loadingMessages = true;
      state.conversations = [];
      state.selectedConversationId = null;
      state.messages = [];
      state.infoOpen = false;
      render.render();

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

      voice.stopVoicePlayback();
      state.selectedConversationId = conversationId;
      state.loadingMessages = true;
      state.messages = [];
      state.infoOpen = false;
      render.render();

      await refresh({
        keepDepartmentSelection: true,
        keepConversationSelection: true,
        autoSelectConversation: false,
        forceMessageReload: true,
        scrollToBottom: true
      });
    }

    return {
      mergeMessages,
      prependMessages,
      isTimelineNearBottom,
      refresh,
      loadOlderMessages,
      sendMessage,
      handleDepartmentSelect,
      handleConversationSelect
    };
  }

  modules.createMessagesFlow = createMessagesFlow;
}());
