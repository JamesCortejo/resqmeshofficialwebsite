(function createDeviceMapSharedModule() {
  const LIVE_REFRESH_INTERVAL_MS = 5000;

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function parseTimestamp(value) {
    if (value === null || value === undefined || value === '') {
      return new Date('');
    }

    if (value instanceof Date) {
      return value;
    }

    const raw = String(value).trim();

    if (!raw) {
      return new Date('');
    }

    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)) {
      return new Date(raw.replace(' ', 'T') + 'Z');
    }

    return new Date(raw);
  }

  function formatDate(value) {
    if (!value) {
      return 'Not available';
    }

    const date = parseTimestamp(value);

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return date.toLocaleString([], {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function formatRelativeTime(value) {
    if (!value) {
      return 'No recent activity';
    }

    const date = parseTimestamp(value);

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    const diffMs = Date.now() - date.getTime();
    const diffMinutes = Math.round(diffMs / 60000);

    if (diffMinutes < 1) {
      return 'Just now';
    }

    if (diffMinutes < 60) {
      return `${diffMinutes}m ago`;
    }

    const diffHours = Math.round(diffMinutes / 60);
    if (diffHours < 24) {
      return `${diffHours}h ago`;
    }

    const diffDays = Math.round(diffHours / 24);
    return `${diffDays}d ago`;
  }

  function formatCoordinate(value) {
    if (value === null || value === undefined || value === '') {
      return 'Unavailable';
    }

    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric.toFixed(6) : String(value);
  }

  function getStatusDisplay(value) {
    const normalized = String(value || '').toLowerCase();

    if (normalized === 'online') return 'Online';
    if (normalized === 'stale') return 'Stale';
    if (normalized === 'offline') return 'Offline';
    if (normalized === 'revoked') return 'Revoked';
    if (normalized === 'active') return 'Active';
    if (normalized === 'inactive') return 'Inactive';
    if (normalized === 'dispatched') return 'Dispatched';
    if (normalized === 'distressed') return 'Distressed';

    return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : 'Unknown';
  }

  function detailItem(label, value) {
    return `
      <div class="device-detail-item">
        <dt>${escapeHtml(label)}</dt>
        <dd>${escapeHtml(value)}</dd>
      </div>
    `;
  }

  async function requestJson(url, options) {
    const requestOptions = window.ResQMeshAdminAuth
      ? await window.ResQMeshAdminAuth.prepareRequestOptions({
        headers: {
          'Content-Type': 'application/json'
        },
        ...options
      })
      : {
        headers: {
          'Content-Type': 'application/json'
        },
        ...options
      };
    const response = await fetch(url, requestOptions);
    const rawBody = await response.text();
    let payload;

    try {
      payload = rawBody ? JSON.parse(rawBody) : {};
    } catch (error) {
      payload = {
        success: false,
        message: rawBody.trim() || 'Unexpected server response.'
      };
    }

    if (response.status === 401) {
      window.ResQMeshAdminAuth?.handleUnauthorized(payload.message || 'Your admin session has expired.');
    }

    if (!response.ok || payload.success === false) {
      const requestError = new Error(payload.message || 'Request failed.');
      requestError.statusCode = response.status;
      throw requestError;
    }

    return payload;
  }

  function createContext() {
    const dom = {
      deviceMapFeedback: document.getElementById('deviceMapFeedback'),
      deviceMapCanvas: document.getElementById('deviceMapCanvas'),
      deviceMapEmpty: document.getElementById('deviceMapEmpty'),
      deviceMapUnavailableList: document.getElementById('deviceMapUnavailableList'),
      deviceMapUnavailableCount: document.getElementById('deviceMapUnavailableCount'),
      deviceViewModal: document.getElementById('deviceViewModal'),
      deviceViewModalCode: document.getElementById('deviceViewModalCode'),
      deviceViewModalBody: document.getElementById('deviceViewModalBody'),
      deviceViewActionMessage: document.getElementById('deviceViewActionMessage')
    };

    const state = {
      devices: [],
      filteredDevices: [],
      selectedDeviceId: null,
      selectedDeviceDetails: null,
      loading: false,
      map: null,
      tileLayer: null,
      markersLayer: null,
      connectionsLayer: null,
      liveRefreshIntervalId: null,
      hasInitializedViewport: false
    };

    function setFeedback(message, tone = 'error') {
      if (!dom.deviceMapFeedback) {
        return;
      }

      if (!message) {
        dom.deviceMapFeedback.hidden = true;
        dom.deviceMapFeedback.textContent = '';
        dom.deviceMapFeedback.removeAttribute('data-tone');
        return;
      }

      dom.deviceMapFeedback.hidden = false;
      dom.deviceMapFeedback.textContent = message;
      dom.deviceMapFeedback.setAttribute('data-tone', tone);
    }

    function setViewActionMessage(message) {
      if (dom.deviceViewActionMessage) {
        dom.deviceViewActionMessage.textContent = message || '';
      }
    }

    function setBodyLock() {
      const isLocked = dom.deviceViewModal?.classList.contains('is-open');
      document.body.classList.toggle('devices-modal-open', Boolean(isLocked));
    }

    function openDeviceViewModal() {
      if (!dom.deviceViewModal) {
        return;
      }

      dom.deviceViewModal.classList.add('is-open');
      dom.deviceViewModal.setAttribute('aria-hidden', 'false');
      setBodyLock();
    }

    function closeDeviceViewModal() {
      if (!dom.deviceViewModal) {
        return;
      }

      dom.deviceViewModal.classList.remove('is-open');
      dom.deviceViewModal.setAttribute('aria-hidden', 'true');
      state.selectedDeviceId = null;
      state.selectedDeviceDetails = null;
      setViewActionMessage('');
      setBodyLock();
    }

    return {
      dom,
      state,
      helpers: {
        escapeHtml,
        formatDate,
        formatRelativeTime,
        formatCoordinate,
        getStatusDisplay,
        detailItem,
        requestJson
      },
      ui: {
        setFeedback,
        setViewActionMessage,
        openDeviceViewModal,
        closeDeviceViewModal
      },
      constants: {
        LIVE_REFRESH_INTERVAL_MS
      },
      view: null
    };
  }

  window.ResQMeshDeviceMap = {
    createContext
  };
}());
