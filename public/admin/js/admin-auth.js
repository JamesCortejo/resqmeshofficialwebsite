(function createAdminAuthModule() {
  const loginPath = '/resqmeshadmin';
  const logoutSelector = '[data-admin-logout]';
  const modalId = 'adminLogoutModal';
  let sessionData = null;
  let sessionPromise = null;
  let redirectScheduled = false;
  let logoutInFlight = false;
  let logoutModal = null;
  let logoutConfirmButton = null;
  let logoutModalMessage = null;

  function isSafeMethod(method) {
    const normalizedMethod = String(method || 'GET').toUpperCase();
    return normalizedMethod === 'GET' || normalizedMethod === 'HEAD' || normalizedMethod === 'OPTIONS';
  }

  async function readJson(response) {
    return response.json().catch(() => ({}));
  }

  function handleUnauthorized(message) {
    if (redirectScheduled) {
      return;
    }

    redirectScheduled = true;
    const reason = encodeURIComponent(message || 'Please sign in to continue.');

    if (window.location.pathname === loginPath) {
      redirectScheduled = false;
      return;
    }

    window.location.assign(`${loginPath}?reason=${reason}`);
  }

  async function loadSession(forceRefresh) {
    if (!forceRefresh && sessionData) {
      return sessionData;
    }

    if (!forceRefresh && sessionPromise) {
      return sessionPromise;
    }

    sessionPromise = fetch('/api/admin/session', {
      method: 'GET',
      headers: {
        Accept: 'application/json'
      },
      credentials: 'same-origin'
    }).then(async (response) => {
      const payload = await readJson(response);

      if (response.status === 401) {
        handleUnauthorized(payload.message || 'Your admin session has expired.');
        throw new Error(payload.message || 'Admin authentication required.');
      }

      if (!response.ok || payload.success === false) {
        throw new Error(payload.message || 'Unable to verify admin session.');
      }

      sessionData = payload.data || {};
      return sessionData;
    }).finally(() => {
      sessionPromise = null;
    });

    return sessionPromise;
  }

  async function prepareRequestOptions(options = {}) {
    const method = String(options.method || 'GET').toUpperCase();
    const headers = new Headers(options.headers || {});

    if (!headers.has('Accept')) {
      headers.set('Accept', 'application/json');
    }

    if (options.body !== undefined && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    if (!isSafeMethod(method)) {
      const currentSession = await loadSession();

      if (currentSession?.csrfToken) {
        headers.set('X-CSRF-Token', currentSession.csrfToken);
      }
    }

    return {
      ...options,
      method,
      headers,
      credentials: 'same-origin'
    };
  }

  async function logout() {
    if (logoutInFlight) {
      return;
    }

    logoutInFlight = true;
    syncLogoutButtons();

    const requestOptions = await prepareRequestOptions({
      method: 'POST'
    });
    try {
      const response = await fetch('/api/admin/logout', requestOptions);
      const payload = await readJson(response);
      sessionData = null;

      if (!response.ok || payload.success === false) {
        throw new Error(payload.message || 'Unable to sign out.');
      }

      handleUnauthorized('Signed out.');
    } finally {
      logoutInFlight = false;
      syncLogoutButtons();
    }
  }

  function syncLogoutButtons() {
    document.querySelectorAll(logoutSelector).forEach((button) => {
      button.disabled = logoutInFlight;
      button.setAttribute('aria-busy', logoutInFlight ? 'true' : 'false');

      const label = button.querySelector('[data-admin-logout-label]');

      if (label) {
        label.textContent = logoutInFlight ? 'Logging out...' : 'Logout';
      }
    });

    if (logoutConfirmButton) {
      logoutConfirmButton.disabled = logoutInFlight;
      logoutConfirmButton.setAttribute('aria-busy', logoutInFlight ? 'true' : 'false');
      logoutConfirmButton.textContent = logoutInFlight ? 'Logging out...' : 'Logout';
    }
  }

  function closeLogoutModal() {
    if (!logoutModal) {
      return;
    }

    logoutModal.classList.remove('is-open');
    logoutModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('admin-modal-open');
    setLogoutModalMessage('');
  }

  function openLogoutModal() {
    if (!logoutModal || logoutInFlight) {
      return;
    }

    logoutModal.classList.add('is-open');
    logoutModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('admin-modal-open');
    window.setTimeout(() => {
      logoutConfirmButton?.focus();
    }, 0);
  }

  function ensureLogoutModal() {
    if (logoutModal || !document.body) {
      return;
    }

    const modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'admin-logout-modal';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
      <div class="admin-logout-modal-backdrop" data-admin-logout-close></div>
      <section class="admin-logout-dialog" role="dialog" aria-modal="true" aria-labelledby="adminLogoutTitle">
        <header class="admin-logout-dialog-header">
          <div>
            <span class="admin-logout-dialog-kicker">Confirm Logout</span>
            <h2 id="adminLogoutTitle">Leave admin session?</h2>
          </div>
          <button type="button" class="admin-logout-close-button" aria-label="Close logout dialog" data-admin-logout-close>
            <i class="fa-solid fa-xmark" aria-hidden="true"></i>
          </button>
        </header>
        <div class="admin-logout-dialog-body">
          <p>You are about to log out of the ResQMesh admin console. You will need to sign in again to continue managing the system.</p>
          <div class="admin-logout-dialog-message" data-admin-logout-message hidden></div>
        </div>
        <footer class="admin-logout-dialog-actions">
          <button type="button" class="admin-topbar-button admin-logout-cancel-button" data-admin-logout-close>
            Cancel
          </button>
          <button type="button" class="admin-topbar-button admin-logout-confirm-button" data-admin-logout-confirm>
            Logout
          </button>
        </footer>
      </section>
    `;

    document.body.appendChild(modal);
    logoutModal = modal;
    logoutConfirmButton = modal.querySelector('[data-admin-logout-confirm]');
    logoutModalMessage = modal.querySelector('[data-admin-logout-message]');

    modal.addEventListener('click', (event) => {
      const closeTarget = event.target.closest('[data-admin-logout-close]');
      const confirmTarget = event.target.closest('[data-admin-logout-confirm]');

      if (closeTarget && !logoutInFlight) {
        closeLogoutModal();
        return;
      }

      if (confirmTarget) {
        logout().catch((error) => {
          setLogoutModalMessage(error.message || 'Unable to log out right now.');
        });
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && logoutModal?.classList.contains('is-open') && !logoutInFlight) {
        closeLogoutModal();
      }
    });

    syncLogoutButtons();
  }

  function setLogoutModalMessage(message) {
    if (!logoutModalMessage) {
      return;
    }

    if (!message) {
      logoutModalMessage.hidden = true;
      logoutModalMessage.textContent = '';
      return;
    }

    logoutModalMessage.hidden = false;
    logoutModalMessage.textContent = message;
  }

  function bindLogoutButtons() {
    ensureLogoutModal();

    document.querySelectorAll(logoutSelector).forEach((button) => {
      if (button.dataset.logoutBound === 'true') {
        return;
      }

      button.dataset.logoutBound = 'true';
      button.addEventListener('click', () => {
        setLogoutModalMessage('');
        openLogoutModal();
      });
    });

    syncLogoutButtons();
  }

  bindLogoutButtons();

  window.ResQMeshAdminAuth = {
    bindLogoutButtons,
    handleUnauthorized,
    loadSession,
    logout,
    prepareRequestOptions
  };
}());
