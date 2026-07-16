(function createDistressSignalsSharedModule() {
  const FILTER_OPTIONS = ['all', 'unassigned', 'deployed', 'canceled', 'accomplished'];

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatDate(value) {
    if (!value) {
      return 'Not available';
    }

    const date = new Date(value);
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

  function formatShortDate(value) {
    if (!value) {
      return 'Not available';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return date.toLocaleString([], {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function getPriorityDisplay(priority) {
    const normalized = String(priority || '').toLowerCase();
    if (normalized === 'high') return 'High';
    if (normalized === 'low') return 'Low';
    return 'Medium';
  }

  function getAssignmentDisplay(state) {
    const normalized = String(state || '').toLowerCase();
    if (normalized === 'deployed') return 'Deployed';
    if (normalized === 'canceled') return 'Canceled';
    if (normalized === 'accomplished') return 'Accomplished';
    return 'Unassigned';
  }

  function getTeamStatusDisplay(status) {
    const normalized = String(status || '').toLowerCase();
    if (normalized === 'dispatched') return 'Dispatched';
    if (normalized === 'inactive') return 'Inactive';
    return 'Active';
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

  function getDistressSearchText(signal, team) {
    return [
      signal.distressCode,
      signal.civilianName,
      signal.reason,
      signal.nodeName,
      signal.nodeId,
      team?.name || '',
      team?.teamCode || '',
      getAssignmentDisplay(signal.accessState)
    ].join(' ').toLowerCase();
  }

  function createToast(dom) {
    let timer = null;

    function show(message, tone = 'success') {
      if (!dom.adminReviewToast || !dom.adminReviewToastMessage || !dom.adminReviewToastIcon || !message) {
        return;
      }

      window.clearTimeout(timer);
      dom.adminReviewToastMessage.textContent = message;
      dom.adminReviewToast.dataset.tone = tone;
      dom.adminReviewToastIcon.innerHTML = tone === 'warning'
        ? '<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>'
        : '<i class="fa-solid fa-check" aria-hidden="true"></i>';
      dom.adminReviewToast.classList.add('is-visible');
      dom.adminReviewToast.setAttribute('aria-hidden', 'false');

      timer = window.setTimeout(() => {
        dom.adminReviewToast.classList.remove('is-visible');
        dom.adminReviewToast.setAttribute('aria-hidden', 'true');
      }, 4200);
    }

    return { show };
  }

  async function requestJson(url, options = {}) {
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
      requestError.isRequestFailure = true;
      throw requestError;
    }

    return payload;
  }

  function createContext() {
    const dom = {
      distressSignalsSearchInput: document.getElementById('distressSignalsSearchInput'),
      distressSignalsFilterGroup: document.getElementById('distressSignalsFilterGroup'),
      distressSignalsFeedback: document.getElementById('distressSignalsFeedback'),
      distressSignalsTableBody: document.getElementById('distressSignalsTableBody'),
      distressSignalsListEmpty: document.getElementById('distressSignalsListEmpty'),
      distressSignalsPagination: document.getElementById('distressSignalsPagination'),
      distressSignalsPaginationSummary: document.getElementById('distressSignalsPaginationSummary'),
      previousDistressSignalsButton: document.getElementById('previousDistressSignalsButton'),
      nextDistressSignalsButton: document.getElementById('nextDistressSignalsButton'),
      distressSignalsSummaryActive: document.getElementById('distressSignalsSummaryActive'),
      distressSignalsSummaryAssigned: document.getElementById('distressSignalsSummaryAssigned'),
      distressSignalsSummaryDeployed: document.getElementById('distressSignalsSummaryDeployed'),
      distressSignalModal: document.getElementById('distressSignalModal'),
      distressSignalModalCode: document.getElementById('distressSignalModalCode'),
      distressSignalModalBody: document.getElementById('distressSignalModalBody'),
      distressSignalActionMessage: document.getElementById('distressSignalActionMessage'),
      deployDistressTeamButton: document.getElementById('deployDistressTeamButton'),
      adminReviewToast: document.getElementById('adminReviewToast'),
      adminReviewToastIcon: document.getElementById('adminReviewToastIcon'),
      adminReviewToastMessage: document.getElementById('adminReviewToastMessage')
    };

    const state = {
      signals: [],
      filteredSignals: [],
      loading: false,
      selectedSignalId: null,
      selectedSignalDetails: null,
      selectedTeamId: null,
      selectedLeaderId: null,
      teamSearchQuery: '',
      filter: 'all',
      modalSubmitting: false
    };

    const toast = createToast(dom);

    function syncBodyLock() {
      document.body.classList.toggle('distress-signal-modal-open', dom.distressSignalModal?.classList.contains('is-open'));
    }

    function getSignalById(id) {
      return state.signals.find((signal) => String(signal.id) === String(id)) || null;
    }

    function getSelectedSignal() {
      return state.selectedSignalId ? getSignalById(state.selectedSignalId) : null;
    }

    function setFeedback(message, tone = 'error') {
      if (!dom.distressSignalsFeedback) {
        return;
      }

      if (!message) {
        dom.distressSignalsFeedback.hidden = true;
        dom.distressSignalsFeedback.textContent = '';
        dom.distressSignalsFeedback.removeAttribute('data-tone');
        return;
      }

      dom.distressSignalsFeedback.hidden = false;
      dom.distressSignalsFeedback.textContent = message;
      dom.distressSignalsFeedback.setAttribute('data-tone', tone);
    }

    function setActionMessage(message, tone = 'muted') {
      if (!dom.distressSignalActionMessage) {
        return;
      }

      dom.distressSignalActionMessage.textContent = message;
      dom.distressSignalActionMessage.setAttribute('data-tone', tone);
    }

    function setModalSubmitting(isSubmitting) {
      state.modalSubmitting = isSubmitting;

      if (dom.deployDistressTeamButton) {
        dom.deployDistressTeamButton.disabled = isSubmitting;
      }

      if (dom.distressSignalModalBody) {
        dom.distressSignalModalBody.querySelectorAll('button, input, select').forEach((element) => {
          element.disabled = isSubmitting;
        });
      }
    }

    function openModal() {
      if (!dom.distressSignalModal) {
        return;
      }

      dom.distressSignalModal.classList.add('is-open');
      dom.distressSignalModal.setAttribute('aria-hidden', 'false');
      syncBodyLock();
    }

    function closeModal() {
      if (!dom.distressSignalModal) {
        return;
      }

      dom.distressSignalModal.classList.remove('is-open');
      dom.distressSignalModal.setAttribute('aria-hidden', 'true');
      state.selectedSignalId = null;
      state.selectedSignalDetails = null;
      state.selectedTeamId = null;
      state.selectedLeaderId = null;
      state.teamSearchQuery = '';
      setActionMessage('Review the distress signal and choose a team to prepare deployment.');
      syncBodyLock();
    }

    function updateSignal(updatedSignal) {
      if (!updatedSignal || !updatedSignal.id) {
        return;
      }

      state.signals = state.signals.map((signal) => signal.id === updatedSignal.id ? updatedSignal : signal);
    }

    const context = {
      constants: {
        FILTER_OPTIONS
      },
      dom,
      state,
      helpers: {
        escapeHtml,
        formatDate,
        formatShortDate,
        getPriorityDisplay,
        getAssignmentDisplay,
        getTeamStatusDisplay,
        formatDistressReason,
        getDistressSearchText,
        requestJson
      },
      ui: {
        closeModal,
        openModal,
        setActionMessage,
        setFeedback,
        setModalSubmitting,
        updateSignal,
        toast
      },
      data: {
        getSignalById,
        getSelectedSignal
      }
    };

    return context;
  }

  window.ResQMeshDistressSignalsShared = {
    createContext
  };
}());
