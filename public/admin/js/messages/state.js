(function defineMessagesStateModule() {
  const modules = window.ResQMeshMessagesModules = window.ResQMeshMessagesModules || {};

  function createState() {
    const constants = {
      POLL_MS: 5000,
      GLOBAL_SLUG: 'global-announcements',
      MESSAGE_PAGE_SIZE: 30
    };

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
      lastNotificationSignature: '',
      activeVoiceMessageId: null,
      activeVoiceAudio: null,
      voiceLoadingMessageId: null,
      voiceErrorMessageId: null,
      voicePositionSeconds: 0,
      voiceDurationSeconds: 0
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

    function getSelectedDepartment() {
      return state.departments.find((department) => department.id === state.selectedDepartmentId) || null;
    }

    function getSelectedConversation() {
      return state.conversations.find((conversation) => conversation.id === state.selectedConversationId) || null;
    }

    function isGlobalDepartment(department = getSelectedDepartment()) {
      return department?.slug === constants.GLOBAL_SLUG;
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

    const helpers = {
      getSelectedDepartment,
      getSelectedConversation,
      isGlobalDepartment,
      resolveDepartmentId,
      resolveConversationId
    };

    return {
      constants,
      state,
      dom,
      helpers
    };
  }

  modules.createState = createState;
}());
