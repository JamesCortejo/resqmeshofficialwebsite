(function createRescuersSharedModule() {
  const STATUS_OPTIONS = [
    { value: 'available', label: 'Available' },
    { value: 'dispatched', label: 'Dispatched' },
    { value: 'unavailable', label: 'Unavailable' }
  ];

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getStatusDisplay(status) {
    const value = String(status || '').toLowerCase();

    if (value === 'available') return 'Available';
    if (value === 'dispatched') return 'Dispatched';
    if (value === 'unavailable') return 'Unavailable';

    return value ? value.charAt(0).toUpperCase() + value.slice(1) : 'Unknown';
  }

  function getAgencyDisplay(agency) {
    const value = String(agency || '').toLowerCase();

    if (value === 'cdrrmo') return 'CDRRMO';
    if (value === 'fire-department') return 'Fire Department';
    if (value === 'police-department') return 'Police Department';

    return agency || 'Unknown agency';
  }

  function getAccessStatusDisplay(accessStatus) {
    return String(accessStatus || '').toLowerCase() === 'archived' ? 'Archived' : 'Active';
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

  function detailItem(label, value) {
    return `
      <div class="rescuer-detail-item">
        <dt>${escapeHtml(label)}</dt>
        <dd>${escapeHtml(value || 'Not provided')}</dd>
      </div>
    `;
  }

  function detailSection(title, items) {
    return `
      <section class="rescuer-detail-section">
        <h3>${escapeHtml(title)}</h3>
        <dl>${items.join('')}</dl>
      </section>
    `;
  }

  function detailCustomSection(title, content) {
    return `
      <section class="rescuer-detail-section">
        <h3>${escapeHtml(title)}</h3>
        ${content}
      </section>
    `;
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
      // Keep rescuer actions successful even if notification refresh fails.
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
      openAddRescuerButton: document.getElementById('openAddRescuerButton'),
      rescuerModal: document.getElementById('rescuerModal'),
      rescuerViewModal: document.getElementById('rescuerViewModal'),
      rescuersSearchInput: document.getElementById('rescuersSearchInput'),
      rescuersTableBody: document.getElementById('rescuersTableBody'),
      rescuersListEmpty: document.getElementById('rescuersListEmpty'),
      rescuersPagination: document.getElementById('rescuersPagination'),
      rescuersPaginationSummary: document.getElementById('rescuersPaginationSummary'),
      previousRescuersButton: document.getElementById('previousRescuersButton'),
      nextRescuersButton: document.getElementById('nextRescuersButton'),
      rescuersFeedback: document.getElementById('rescuersFeedback'),
      rescuerForm: document.getElementById('rescuerForm'),
      rescuerTeamSelect: document.getElementById('rescuerTeamSelect'),
      rescuerActionMessage: document.getElementById('rescuerActionMessage'),
      rescuerSubmitButton: document.getElementById('rescuerSubmitButton'),
      toggleRescuerStatusFilterButton: document.getElementById('toggleRescuerStatusFilterButton'),
      rescuerStatusFilterLabel: document.getElementById('rescuerStatusFilterLabel'),
      rescuerViewModalCode: document.getElementById('rescuerViewModalCode'),
      rescuerViewModalBody: document.getElementById('rescuerViewModalBody'),
      rescuerViewActionMessage: document.getElementById('rescuerViewActionMessage'),
      rescuerViewActionButtons: document.getElementById('rescuerViewActionButtons'),
      rescuerViewPrimaryActionButton: document.getElementById('rescuerViewPrimaryActionButton'),
      adminReviewToast: document.getElementById('adminReviewToast'),
      adminReviewToastIcon: document.getElementById('adminReviewToastIcon'),
      adminReviewToastMessage: document.getElementById('adminReviewToastMessage')
    };

    const state = {
      rescuers: [],
      filteredRescuers: [],
      teams: [],
      loading: false,
      submitting: false,
      accessFilter: 'active',
      selectedRescuerId: null,
      selectedRescuerDetails: null,
      modalPendingAction: '',
      modalSubmitting: false
    };

    const toast = createToast(dom);

    function setBodyLock() {
      const isLocked = dom.rescuerModal?.classList.contains('is-open') || dom.rescuerViewModal?.classList.contains('is-open');
      document.body.classList.toggle('rescuer-modal-open', Boolean(isLocked));
    }

    function setFeedback(message, tone = 'info') {
      if (!dom.rescuersFeedback) {
        return;
      }

      if (!message) {
        dom.rescuersFeedback.hidden = true;
        dom.rescuersFeedback.textContent = '';
        dom.rescuersFeedback.removeAttribute('data-tone');
        return;
      }

      dom.rescuersFeedback.hidden = false;
      dom.rescuersFeedback.textContent = message;
      dom.rescuersFeedback.setAttribute('data-tone', tone);
    }

    function setActionMessage(message, tone = 'muted') {
      if (!dom.rescuerActionMessage) {
        return;
      }

      dom.rescuerActionMessage.textContent = message;
      dom.rescuerActionMessage.setAttribute('data-tone', tone);
    }

    function setSubmitState(isSubmitting) {
      state.submitting = isSubmitting;

      if (dom.rescuerSubmitButton) {
        dom.rescuerSubmitButton.disabled = isSubmitting;
        dom.rescuerSubmitButton.textContent = isSubmitting ? 'Saving...' : 'Add Rescuer';
      }

      if (dom.rescuerForm) {
        Array.from(dom.rescuerForm.elements).forEach((field) => {
          field.disabled = isSubmitting;
        });
      }
    }

    function setViewActionMessage(message) {
      if (dom.rescuerViewActionMessage) {
        dom.rescuerViewActionMessage.innerHTML = message || '';
      }
    }

    function setViewActionState(disabled) {
      state.modalSubmitting = disabled;

      if (dom.rescuerViewActionButtons) {
        dom.rescuerViewActionButtons.querySelectorAll('button').forEach((button) => {
          button.disabled = disabled;
        });
      }

      if (dom.rescuerViewModalBody) {
        dom.rescuerViewModalBody.querySelectorAll('[data-modal-action-button], input, select').forEach((element) => {
          element.disabled = disabled;
        });
      }
    }

    function openRescuerModal() {
      if (!dom.rescuerModal) {
        return;
      }

      dom.rescuerModal.classList.add('is-open');
      dom.rescuerModal.setAttribute('aria-hidden', 'false');
      setBodyLock();
    }

    function closeRescuerModal() {
      if (!dom.rescuerModal) {
        return;
      }

      dom.rescuerModal.classList.remove('is-open');
      dom.rescuerModal.setAttribute('aria-hidden', 'true');
      setBodyLock();
    }

    function openRescuerViewModal() {
      if (!dom.rescuerViewModal) {
        return;
      }

      dom.rescuerViewModal.classList.add('is-open');
      dom.rescuerViewModal.setAttribute('aria-hidden', 'false');
      setBodyLock();
    }

    function closeRescuerViewModal() {
      if (!dom.rescuerViewModal) {
        return;
      }

      dom.rescuerViewModal.classList.remove('is-open');
      dom.rescuerViewModal.setAttribute('aria-hidden', 'true');
      state.selectedRescuerId = null;
      state.selectedRescuerDetails = null;
      state.modalPendingAction = '';
      setViewActionMessage('');
      setBodyLock();
    }

    function updateRescuerState(updatedRescuer) {
      if (!updatedRescuer || !updatedRescuer.id) {
        return;
      }

      state.rescuers = state.rescuers.map((rescuer) => rescuer.id === updatedRescuer.id ? updatedRescuer : rescuer);
      state.selectedRescuerDetails = updatedRescuer;

      if (context.list?.applySearchFilter) {
        context.list.applySearchFilter();
      }
    }

    const context = {
      dom,
      state,
      constants: {
        STATUS_OPTIONS
      },
      helpers: {
        escapeHtml,
        getStatusDisplay,
        getAgencyDisplay,
        getAccessStatusDisplay,
        formatDate,
        detailItem,
        detailSection,
        detailCustomSection,
        requestJson,
        refreshAdminNotifications
      },
      ui: {
        setBodyLock,
        setFeedback,
        setActionMessage,
        setSubmitState,
        setViewActionMessage,
        setViewActionState,
        openRescuerModal,
        closeRescuerModal,
        openRescuerViewModal,
        closeRescuerViewModal,
        updateRescuerState
      },
      toast,
      create: null,
      list: null,
      view: null
    };

    return context;
  }

  window.ResQMeshRescuers = {
    createContext
  };
}());
