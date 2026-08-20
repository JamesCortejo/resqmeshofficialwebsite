(function defineMessagesApiModule() {
  const modules = window.ResQMeshMessagesModules = window.ResQMeshMessagesModules || {};

  function createApi(context) {
    const { constants, formatters } = context;

    async function adminFetch(url, options = {}) {
      const requestOptions = await window.ResQMeshAdminAuth.prepareRequestOptions(options);
      const response = await fetch(url, requestOptions);
      const payload = await formatters.readJson(response);

      if (response.status === 401) {
        window.ResQMeshAdminAuth.handleUnauthorized(payload.message || 'Admin session expired.');
        throw new Error(payload.message || 'Admin session expired.');
      }

      if (!response.ok || payload.success === false) {
        throw new Error(payload.message || 'Request failed.');
      }

      return payload;
    }

    async function fetchDepartments() {
      const payload = await adminFetch('/api/admin/online-chat/departments?includeSystem=1');
      return payload.data || [];
    }

    async function fetchConversations(department, searchQuery) {
      if (!department?.id) {
        return [];
      }

      if (department.slug === constants.GLOBAL_SLUG) {
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

    async function fetchGlobalMessagesPage({ beforeId = null, afterId = null, limit = constants.MESSAGE_PAGE_SIZE } = {}) {
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

    async function fetchConversationMessages(conversationId, { beforeId = null, afterId = null, limit = constants.MESSAGE_PAGE_SIZE } = {}) {
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

    async function fetchVoiceClip(messageId) {
      const payload = await adminFetch(`/api/admin/online-chat/messages/${messageId}/voice`);
      return payload.data || null;
    }

    function sendGlobalMessage(body) {
      return adminFetch('/api/admin/online-chat/global/messages', {
        method: 'POST',
        body: JSON.stringify({ body })
      });
    }

    function sendConversationMessage(conversationId, body) {
      return adminFetch(`/api/admin/online-chat/conversations/${conversationId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ body })
      });
    }

    return {
      adminFetch,
      fetchDepartments,
      fetchConversations,
      fetchGlobalMessages,
      fetchGlobalMessagesPage,
      fetchConversationMessages,
      fetchVoiceClip,
      sendGlobalMessage,
      sendConversationMessage
    };
  }

  modules.createApi = createApi;
}());
