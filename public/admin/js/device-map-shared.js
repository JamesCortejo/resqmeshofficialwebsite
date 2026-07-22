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

  function formatDistance(value) {
    const numeric = Number(value);

    if (!Number.isFinite(numeric) || numeric <= 0) {
      return 'Not available';
    }

    if (numeric >= 1000) {
      return `${(numeric / 1000).toFixed(1)} km`;
    }

    return `${Math.round(numeric)} m`;
  }

  function formatSignalStrength(value, qualityLabel) {
    const numeric = Number(value);

    if (!Number.isFinite(numeric) || numeric < -140 || numeric > -20) {
      return 'RSSI unavailable';
    }

    return `${numeric} dBm${qualityLabel ? ` (${qualityLabel})` : ''}`;
  }

  function formatTemperature(value) {
    const numeric = Number(value);

    if (!Number.isFinite(numeric)) {
      return 'Not available';
    }

    return `${Math.round(numeric)}°C`;
  }

  function formatPercent(value) {
    const numeric = Number(value);

    if (!Number.isFinite(numeric)) {
      return 'Not available';
    }

    return `${Math.round(numeric)}%`;
  }

  function formatStorageRemaining(value) {
    const numeric = Number(value);

    if (!Number.isFinite(numeric) || numeric < 0) {
      return 'Not available';
    }

    if (numeric >= 1024) {
      return `${(numeric / 1024).toFixed(1)} GB`;
    }

    return `${Math.round(numeric)} MB`;
  }

  function getSignalLevel(value) {
    const numeric = Number(value);

    if (!Number.isFinite(numeric) || numeric < -140 || numeric > -20) {
      return 0;
    }

    if (numeric >= -70) return 4;
    if (numeric >= -85) return 3;
    if (numeric >= -100) return 2;
    return 1;
  }

  function signalDotsMarkup(value, qualityLabel) {
    const level = getSignalLevel(value);
    const label = formatSignalStrength(value, qualityLabel);

    return `
      <span class="device-card-signal" data-level="${level}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">
        <span class="device-card-signal-dots" aria-hidden="true">
          ${[1, 2, 3, 4].map((index) => `<span class="device-card-signal-dot${index <= level ? ' is-active' : ''}"></span>`).join('')}
        </span>
        <span>${escapeHtml(label)}</span>
      </span>
    `;
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

  function formatDistressReason(value) {
    const normalized = String(value || '').trim();

    if (!normalized) {
      return 'Not available';
    }

    return normalized
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();
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
      routes: [],
      selectedDeviceId: null,
      selectedDeviceDetails: null,
      selectedRouteDeploymentId: null,
      loading: false,
      map: null,
      tileLayer: null,
      markersLayer: null,
      connectionsLayer: null,
      routesLayer: null,
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
        formatDistance,
        formatSignalStrength,
        formatTemperature,
        formatPercent,
        formatStorageRemaining,
        signalDotsMarkup,
        getStatusDisplay,
        formatDistressReason,
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
