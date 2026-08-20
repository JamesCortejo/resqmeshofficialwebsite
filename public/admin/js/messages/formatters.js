(function defineMessagesFormattersModule() {
  const modules = window.ResQMeshMessagesModules = window.ResQMeshMessagesModules || {};

  function createFormatters() {
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

    function formatVoiceTime(secondsValue) {
      const seconds = Math.max(0, Math.floor(Number(secondsValue || 0)));
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
    }

    return {
      escapeHtml,
      readJson,
      formatTime,
      formatDateTime,
      formatVoiceTime
    };
  }

  modules.createFormatters = createFormatters;
}());
