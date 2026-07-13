(function createRescueTeamsSharedModule() {
  const MAX_MEMBERS = 5;
  const AGENCY_OPTIONS = [
    { value: 'cdrrmo', label: 'CDRRMO' },
    { value: 'fire-department', label: 'Fire Department' },
    { value: 'police-department', label: 'Police Department' }
  ];
  const STATUS_OPTIONS = [
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
    { value: 'dispatched', label: 'Dispatched' }
  ];

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getAgencyDisplay(agency) {
    const value = String(agency || '').toLowerCase();

    if (value === 'cdrrmo') return 'CDRRMO';
    if (value === 'fire-department') return 'Fire Department';
    if (value === 'police-department') return 'Police Department';

    return agency || 'Unknown agency';
  }

  function getStatusDisplay(status) {
    const value = String(status || '').toLowerCase();

    if (value === 'inactive') return 'Inactive';
    if (value === 'dispatched') return 'Dispatched';

    return 'Active';
  }

  function getRescuerSearchText(rescuer) {
    return [
      rescuer.fullName,
      rescuer.rescuerCode,
      getAgencyDisplay(rescuer.agency),
      rescuer.team?.name || 'Unassigned'
    ]
      .join(' ')
      .toLowerCase();
  }

  function filterAssignableRescuers(rescuers, query) {
    const normalizedQuery = String(query || '').trim().toLowerCase();

    if (!normalizedQuery) {
      return rescuers;
    }

    return rescuers.filter((rescuer) => getRescuerSearchText(rescuer).includes(normalizedQuery));
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

  function createToast(dom) {
    let reviewToastTimer = null;

    function show(message, tone = 'success') {
      if (!dom.adminReviewToast || !dom.adminReviewToastMessage || !dom.adminReviewToastIcon || !message) {
        return;
      }

      window.clearTimeout(reviewToastTimer);
      dom.adminReviewToastMessage.textContent = message;
      dom.adminReviewToast.dataset.tone = tone;
      dom.adminReviewToastIcon.innerHTML = tone === 'warning'
        ? '<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>'
        : '<i class="fa-solid fa-check" aria-hidden="true"></i>';
      dom.adminReviewToast.classList.add('is-visible');
      dom.adminReviewToast.setAttribute('aria-hidden', 'false');

      reviewToastTimer = window.setTimeout(() => {
        dom.adminReviewToast.classList.remove('is-visible');
        dom.adminReviewToast.setAttribute('aria-hidden', 'true');
      }, 4200);
    }

    return { show };
  }

  async function refreshAdminNotifications() {
    try {
      await window.ResQMeshAdminNotifications?.refresh?.();
    } catch (error) {
      // Rescue team actions should not fail if notifications cannot refresh.
    }
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
      const trimmedBody = rawBody.trim();
      const routeMissing = trimmedBody.includes('Cannot PATCH')
        || trimmedBody.includes('Cannot GET')
        || trimmedBody.includes('Cannot POST');

      payload = {
        success: false,
        message: routeMissing
          ? 'The server is still using the old route map. Restart the ResQMesh website server and try again.'
          : trimmedBody || 'Unexpected server response.'
      };
    }

    if (response.status === 401) {
      window.ResQMeshAdminAuth?.handleUnauthorized(payload.message || 'Your admin session has expired.');
    }

    if (!response.ok || payload.success === false) {
      const requestError = new Error(payload.message || 'Request failed.');
      requestError.statusCode = response.status;
      requestError.routeMissing = payload.message === 'The server is still using the old route map. Restart the ResQMesh website server and try again.';
      requestError.isRequestFailure = true;
      throw requestError;
    }

    return payload;
  }

  function createContext() {
    const dom = {
      openAddRescueTeamButton: document.getElementById('openAddRescueTeamButton'),
      rescueTeamsSearchInput: document.getElementById('rescueTeamsSearchInput'),
      rescueTeamsFeedback: document.getElementById('rescueTeamsFeedback'),
      rescueTeamsTableBody: document.getElementById('rescueTeamsTableBody'),
      rescueTeamsListEmpty: document.getElementById('rescueTeamsListEmpty'),
      rescueTeamsPagination: document.getElementById('rescueTeamsPagination'),
      rescueTeamsPaginationSummary: document.getElementById('rescueTeamsPaginationSummary'),
      previousRescueTeamsButton: document.getElementById('previousRescueTeamsButton'),
      nextRescueTeamsButton: document.getElementById('nextRescueTeamsButton'),
      rescueTeamModal: document.getElementById('rescueTeamModal'),
      rescueTeamForm: document.getElementById('rescueTeamForm'),
      rescueTeamRescuerSearchInput: document.getElementById('rescueTeamRescuerSearchInput'),
      rescueTeamRosterResults: document.getElementById('rescueTeamRosterResults'),
      rescueTeamSelectedList: document.getElementById('rescueTeamSelectedList'),
      rescueTeamRosterCount: document.getElementById('rescueTeamRosterCount'),
      rescueTeamActionMessage: document.getElementById('rescueTeamActionMessage'),
      rescueTeamSubmitButton: document.getElementById('rescueTeamSubmitButton'),
      rescueTeamViewModal: document.getElementById('rescueTeamViewModal'),
      rescueTeamViewModalCode: document.getElementById('rescueTeamViewModalCode'),
      rescueTeamViewModalBody: document.getElementById('rescueTeamViewModalBody'),
      rescueTeamViewActionMessage: document.getElementById('rescueTeamViewActionMessage'),
      saveRescueTeamChangesButton: document.getElementById('saveRescueTeamChangesButton'),
      adminReviewToast: document.getElementById('adminReviewToast'),
      adminReviewToastIcon: document.getElementById('adminReviewToastIcon'),
      adminReviewToastMessage: document.getElementById('adminReviewToastMessage')
    };

    const state = {
      teams: [],
      filteredTeams: [],
      assignableRescuers: [],
      loading: false,
      submitting: false,
      selectedTeamId: null,
      selectedTeamDetails: null,
      viewSubmitting: false
    };

    const toast = createToast(dom);

    function setBodyLock() {
      const isLocked = dom.rescueTeamModal?.classList.contains('is-open')
        || dom.rescueTeamViewModal?.classList.contains('is-open');
      document.body.classList.toggle('rescue-team-modal-open', Boolean(isLocked));
    }

    function setFeedback(message, tone = 'error') {
      if (!dom.rescueTeamsFeedback) {
        return;
      }

      if (!message) {
        dom.rescueTeamsFeedback.hidden = true;
        dom.rescueTeamsFeedback.textContent = '';
        dom.rescueTeamsFeedback.removeAttribute('data-tone');
        return;
      }

      dom.rescueTeamsFeedback.hidden = false;
      dom.rescueTeamsFeedback.textContent = message;
      dom.rescueTeamsFeedback.setAttribute('data-tone', tone);
    }

    function setCreateActionMessage(message, tone = 'muted') {
      if (!dom.rescueTeamActionMessage) {
        return;
      }

      dom.rescueTeamActionMessage.textContent = message;
      dom.rescueTeamActionMessage.setAttribute('data-tone', tone);
    }

    function setCreateSubmitState(isSubmitting) {
      state.submitting = isSubmitting;

      if (dom.rescueTeamSubmitButton) {
        dom.rescueTeamSubmitButton.disabled = isSubmitting;
        dom.rescueTeamSubmitButton.textContent = isSubmitting ? 'Saving...' : 'Add Rescue Team';
      }

      if (dom.rescueTeamForm) {
        Array.from(dom.rescueTeamForm.elements).forEach((field) => {
          field.disabled = isSubmitting;
        });
      }
    }

    function setViewActionMessage(message, tone = 'muted') {
      if (!dom.rescueTeamViewActionMessage) {
        return;
      }

      dom.rescueTeamViewActionMessage.textContent = message || '';
      dom.rescueTeamViewActionMessage.setAttribute('data-tone', tone);
    }

    function setViewSubmitState(isSubmitting) {
      state.viewSubmitting = isSubmitting;

      if (dom.saveRescueTeamChangesButton) {
        dom.saveRescueTeamChangesButton.disabled = isSubmitting;
      }

      if (dom.rescueTeamViewModalBody) {
        dom.rescueTeamViewModalBody.querySelectorAll('input, select').forEach((field) => {
          field.disabled = isSubmitting;
        });
      }
    }

    function openCreateModal() {
      if (!dom.rescueTeamModal) {
        return;
      }

      dom.rescueTeamModal.classList.add('is-open');
      dom.rescueTeamModal.setAttribute('aria-hidden', 'false');
      setBodyLock();
    }

    function closeCreateModal() {
      if (!dom.rescueTeamModal) {
        return;
      }

      dom.rescueTeamModal.classList.remove('is-open');
      dom.rescueTeamModal.setAttribute('aria-hidden', 'true');
      setBodyLock();
    }

    function openViewModal() {
      if (!dom.rescueTeamViewModal) {
        return;
      }

      dom.rescueTeamViewModal.classList.add('is-open');
      dom.rescueTeamViewModal.setAttribute('aria-hidden', 'false');
      setBodyLock();
    }

    function closeViewModal() {
      if (!dom.rescueTeamViewModal) {
        return;
      }

      dom.rescueTeamViewModal.classList.remove('is-open');
      dom.rescueTeamViewModal.setAttribute('aria-hidden', 'true');
      state.selectedTeamId = null;
      state.selectedTeamDetails = null;
      setViewActionMessage('');
      setBodyLock();
    }

    const context = {
      dom,
      state,
      constants: {
        MAX_MEMBERS,
        AGENCY_OPTIONS,
        STATUS_OPTIONS
      },
      helpers: {
        escapeHtml,
        getAgencyDisplay,
        getStatusDisplay,
        formatDate,
        getRescuerSearchText,
        filterAssignableRescuers,
        requestJson,
        refreshAdminNotifications
      },
      ui: {
        setBodyLock,
        setFeedback,
        setCreateActionMessage,
        setCreateSubmitState,
        setViewActionMessage,
        setViewSubmitState,
        openCreateModal,
        closeCreateModal,
        openViewModal,
        closeViewModal
      },
      toast,
      data: null,
      create: null,
      list: null,
      view: null
    };

    return context;
  }

  window.ResQMeshRescueTeams = {
    createContext
  };
}());
