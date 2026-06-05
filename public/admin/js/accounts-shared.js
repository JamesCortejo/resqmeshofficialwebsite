(function createAccountsSharedModule() {
  const pageSize = 10;

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
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

  function formatBytes(value) {
    const bytes = Number(value);

    if (!Number.isFinite(bytes) || bytes <= 0) {
      return 'Not available';
    }

    if (bytes < 1024) {
      return `${bytes} B`;
    }

    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function normalizeAccountId(value) {
    const id = Number.parseInt(value, 10);
    return Number.isInteger(id) && id > 0 ? String(id) : '';
  }

  function statusLabel(status) {
    const normalized = String(status || '').toLowerCase();

    if (normalized === 'approved') {
      return 'Active';
    }

    if (normalized === 'suspended') {
      return 'Suspended';
    }

    return normalized || 'Unknown';
  }

  async function fetchJson(url, options) {
    const response = await fetch(url, options);
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.message || 'Unable to complete request.');
    }

    return payload;
  }

  function createToast() {
    const reviewToast = document.getElementById('adminReviewToast');
    const reviewToastIcon = document.getElementById('adminReviewToastIcon');
    const reviewToastMessage = document.getElementById('adminReviewToastMessage');
    let reviewToastTimer = null;

    function show(message, tone) {
      window.clearTimeout(reviewToastTimer);
      reviewToastMessage.textContent = message;
      reviewToast.dataset.tone = tone || 'success';
      reviewToastIcon.innerHTML = tone === 'warning'
        ? '<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>'
        : '<i class="fa-solid fa-check" aria-hidden="true"></i>';
      reviewToast.classList.add('is-visible');
      reviewToast.setAttribute('aria-hidden', 'false');

      reviewToastTimer = window.setTimeout(() => {
        reviewToast.classList.remove('is-visible');
        reviewToast.setAttribute('aria-hidden', 'true');
      }, 4200);
    }

    return { show };
  }

  function createModal() {
    const modal = document.getElementById('accountModal');
    const modalBody = document.getElementById('accountModalBody');
    const modalCode = document.getElementById('accountModalCode');
    const actionMessage = document.getElementById('accountActionMessage');
    const actionButtons = document.querySelector('.account-action-buttons');
    const approveButton = document.getElementById('approveAccountButton');
    const declineButton = document.getElementById('declineAccountButton');

    let selectedAccountId = null;
    let pendingReviewAction = '';
    let activeReviewHandler = null;

    function detailItem(label, value) {
      return `
        <div class="account-detail-item">
          <dt>${escapeHtml(label)}</dt>
          <dd>${escapeHtml(value || 'Not provided')}</dd>
        </div>
      `;
    }

    function detailSection(title, items) {
      return `
        <section class="account-detail-section">
          <h3>${escapeHtml(title)}</h3>
          <dl>${items.join('')}</dl>
        </section>
      `;
    }

    function imageCard(title, image) {
      return `
        <figure class="account-id-card">
          <img src="${escapeHtml(image.previewUrl)}" alt="${escapeHtml(title)} preview">
          <figcaption>
            <strong>${escapeHtml(title)}</strong>
            <span>${escapeHtml(image.originalName || 'Encrypted ID image')}</span>
            <span>${escapeHtml(formatBytes(image.originalSize))} original</span>
          </figcaption>
        </figure>
      `;
    }

    function setButtonsDisabled(disabled) {
      actionButtons.querySelectorAll('button').forEach((button) => {
        button.disabled = disabled;
      });
    }

    function setActionMessage(message) {
      actionMessage.textContent = message;
    }

    function updateModalActions(account, options) {
      const actionMode = options.actionMode || 'view';

      if (actionMode === 'pending' && account.status === 'pending') {
        activeReviewHandler = options.onReview;
        actionButtons.hidden = false;
        actionButtons.innerHTML = `
          <button type="button" class="account-decline-button" data-modal-action="declined">
            <i class="fa-solid fa-xmark" aria-hidden="true"></i>
            <span>Decline</span>
          </button>
          <button type="button" class="account-approve-button" data-modal-action="approved">
            <i class="fa-solid fa-check" aria-hidden="true"></i>
            <span>Approve</span>
          </button>
        `;
        actionMessage.textContent = '';
        return;
      }

      if (actionMode === 'access' && ['approved', 'suspended'].includes(account.status)) {
        activeReviewHandler = options.onReview;
        actionButtons.hidden = false;
        actionButtons.innerHTML = account.status === 'approved'
          ? `
            <button type="button" class="account-decline-button" data-modal-action="suspended">
              <i class="fa-solid fa-ban" aria-hidden="true"></i>
              <span>Suspend Account</span>
            </button>
          `
          : `
            <button type="button" class="account-approve-button" data-modal-action="approved">
              <i class="fa-solid fa-circle-check" aria-hidden="true"></i>
              <span>Activate Account</span>
            </button>
          `;
        actionMessage.textContent = '';
        return;
      }

      activeReviewHandler = null;
      actionButtons.hidden = true;
      actionMessage.innerHTML = options.viewOnlyMessage || `
        <span class="account-view-only-note">
          <i class="fa-solid fa-circle-check" aria-hidden="true"></i>
          This account is view-only.
        </span>
      `;
    }

    function renderDetails(account, options) {
      modalCode.textContent = `${account.userCode} - ${statusLabel(account.status)}`;
      updateModalActions(account, options);

      modalBody.innerHTML = `
        <div class="account-detail-grid">
          ${detailSection('Account', [
            detailItem('Username', account.account.username),
            detailItem('Email', account.account.email),
            detailItem('Phone', account.account.phone),
            detailItem('Submitted', formatDate(account.createdAt))
          ])}
          ${detailSection('Personal', [
            detailItem('Full name', account.personal.fullName),
            detailItem('Birthdate', account.personal.birthDate),
            detailItem('Age', account.personal.age),
            detailItem('First name', account.personal.firstName),
            detailItem('Middle name', account.personal.middleName),
            detailItem('Last name', account.personal.lastName),
            detailItem('Occupation', account.personal.occupation)
          ])}
          ${detailSection('Address', [
            detailItem('Street address', account.address.streetAddress),
            detailItem('Barangay', account.address.barangay)
          ])}
          ${detailSection('Medical', [
            detailItem('Blood type', account.medical.bloodType),
            detailItem('Medical complications', account.medical.medicalComplications),
            detailItem('Allergies', account.medical.allergies)
          ])}
          ${detailSection('Identification', [
            detailItem('ID type', account.identification.idType),
            detailItem('ID number', account.identification.idNumber)
          ])}
        </div>
        <section class="account-id-section">
          <h3>ID Images</h3>
          <div class="account-id-grid">
            ${imageCard('Front ID', account.identification.frontImage)}
            ${imageCard('Back ID', account.identification.backImage)}
          </div>
        </section>
      `;
    }

    function openShell() {
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('account-modal-open');
    }

    function close() {
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('account-modal-open');
      selectedAccountId = null;
      pendingReviewAction = '';
      activeReviewHandler = null;
      actionButtons.hidden = false;
      actionMessage.textContent = '';
      setButtonsDisabled(false);
    }

    function clearReviewConfirmation() {
      pendingReviewAction = '';
      actionMessage.textContent = '';
    }

    function renderReviewConfirmation(status) {
      if (!activeReviewHandler || !selectedAccountId) {
        return;
      }

      pendingReviewAction = status;
      const isDecline = status === 'declined';
      const isSuspension = status === 'suspended';
      const needsReason = isDecline || isSuspension;
      const isActivation = status === 'approved' && actionButtons.querySelector('[data-modal-action="approved"] span')?.textContent.includes('Activate');
      const title = isDecline
        ? 'Decline this registration?'
        : isSuspension
          ? 'Suspend this account?'
          : isActivation
            ? 'Activate this account?'
            : 'Approve this registration?';
      const description = isDecline
        ? 'Write a reason before confirming. The user will receive this by email.'
        : isSuspension
          ? 'Write a reason before confirming. The user will receive this by email.'
          : isActivation
            ? 'The user will receive an activation email after confirmation.'
            : 'The user will receive an approval email after confirmation.';
      const confirmText = isDecline
        ? 'Confirm Decline'
        : isSuspension
          ? 'Confirm Suspension'
          : isActivation
            ? 'Confirm Activation'
            : 'Confirm Approval';

      actionMessage.innerHTML = `
        <div class="account-review-confirmation" data-review-action="${status}">
          <div class="account-review-copy">
            <strong>${title}</strong>
            <span>${description}</span>
          </div>
          ${needsReason ? `
            <label class="account-decline-reason">
              <span>${isSuspension ? 'Reason for suspension' : 'Reason for decline'}</span>
              <textarea id="declineReasonInput" rows="3" placeholder="${isSuspension ? 'Explain why this account was suspended.' : 'Explain why this registration was declined.'}"></textarea>
            </label>
          ` : ''}
          <div class="account-review-confirm-actions">
            <button type="button" class="admin-secondary-button" data-cancel-review>Cancel</button>
            <button type="button" class="${isDecline || isSuspension ? 'account-decline-button' : 'account-approve-button'}" data-confirm-review>
              <i class="fa-solid ${isDecline ? 'fa-xmark' : isSuspension ? 'fa-ban' : 'fa-check'}" aria-hidden="true"></i>
              <span>${confirmText}</span>
            </button>
          </div>
        </div>
      `;

      if (needsReason) {
        document.getElementById('declineReasonInput').focus();
      }
    }

    async function openDetails(options) {
      const accountId = normalizeAccountId(options.id);

      if (!accountId) {
        throw new Error('Invalid account id.');
      }

      selectedAccountId = accountId;
      modalCode.textContent = options.modalKicker || 'Account details';
      modalBody.innerHTML = '<div class="accounts-status-message">Loading account details...</div>';
      actionButtons.hidden = options.actionMode === 'view';
      actionMessage.textContent = '';
      openShell();

      try {
        const payload = await fetchJson(`/api/admin/accounts/${accountId}`);
        renderDetails(payload.data, options);
      } catch (error) {
        actionButtons.hidden = true;
        modalBody.innerHTML = `<div class="accounts-status-message" data-tone="error">${escapeHtml(error.message)}</div>`;
      }
    }

    actionButtons.addEventListener('click', (event) => {
      const button = event.target.closest('[data-modal-action]');

      if (!button) {
        return;
      }

      renderReviewConfirmation(button.dataset.modalAction);
    });

    actionMessage.addEventListener('click', (event) => {
      if (event.target.closest('[data-cancel-review]')) {
        clearReviewConfirmation();
        return;
      }

      if (!event.target.closest('[data-confirm-review]') || !pendingReviewAction || !activeReviewHandler) {
        return;
      }

      const reasonInput = document.getElementById('declineReasonInput');
      const reason = reasonInput ? reasonInput.value.trim() : '';

      if (['declined', 'suspended'].includes(pendingReviewAction) && !reason) {
        actionMessage.querySelector('.account-review-copy span').textContent = pendingReviewAction === 'suspended'
          ? 'A suspension reason is required before confirming.'
          : 'A decline reason is required before confirming.';
        reasonInput.focus();
        return;
      }

      activeReviewHandler(selectedAccountId, pendingReviewAction, reason);
    });

    modal.addEventListener('click', (event) => {
      if (event.target.closest('[data-close-modal]')) {
        close();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && modal.classList.contains('is-open')) {
        close();
      }
    });

    return {
      close,
      openDetails,
      setActionMessage,
      setButtonsDisabled
    };
  }

  function createListPanel(config) {
    const statusMessage = document.getElementById(config.statusId);
    const tableWrap = document.getElementById(config.tableWrapId);
    const tableBody = document.getElementById(config.tableBodyId);
    const refreshButton = document.getElementById(config.refreshButtonId);
    const searchInput = document.getElementById(config.searchInputId);
    const sortButton = document.getElementById(config.sortButtonId);
    const sortLabel = document.getElementById(config.sortLabelId);
    const pagination = document.getElementById(config.paginationId);
    const paginationSummary = document.getElementById(config.paginationSummaryId);
    const previousButton = document.getElementById(config.previousButtonId);
    const nextButton = document.getElementById(config.nextButtonId);

    let accounts = [];
    let sortDirection = 'desc';
    let currentPage = 1;

    function configValue(name, ...args) {
      const value = config[name];
      return typeof value === 'function' ? value(...args) : value;
    }

    function setStatus(message, tone) {
      statusMessage.textContent = message;
      statusMessage.dataset.tone = tone || 'neutral';
      statusMessage.hidden = false;
    }

    function searchText(account) {
      return [
        account.userCode,
        account.fullName,
        account.username,
        account.email,
        account.phone
      ].join(' ').toLowerCase();
    }

    function filteredAndSortedAccounts() {
      const query = searchInput.value.trim().toLowerCase();
      const statusFiltered = typeof config.filterAccount === 'function'
        ? accounts.filter(config.filterAccount)
        : [...accounts];
      const filtered = query
        ? statusFiltered.filter((account) => searchText(account).includes(query))
        : statusFiltered;

      filtered.sort((left, right) => {
        const leftTime = new Date(left.createdAt).getTime() || 0;
        const rightTime = new Date(right.createdAt).getTime() || 0;
        return sortDirection === 'desc' ? rightTime - leftTime : leftTime - rightTime;
      });

      return filtered;
    }

    function updateSortButton() {
      const newest = sortDirection === 'desc';
      sortButton.dataset.sortDirection = sortDirection;
      sortLabel.textContent = newest ? 'Newest first' : 'Oldest first';
      sortButton.querySelector('i').className = newest
        ? 'fa-solid fa-arrow-down-wide-short'
        : 'fa-solid fa-arrow-up-wide-short';
    }

    function viewButton(account) {
      const accountId = normalizeAccountId(account.id);

      if (!accountId) {
        return `
          <button type="button" class="account-view-button" disabled aria-label="Invalid account id">
            <i class="fa-regular fa-eye" aria-hidden="true"></i>
            <span>View</span>
          </button>
        `;
      }

      return `
        <button type="button" class="account-view-button" data-account-id="${accountId}" aria-label="View ${escapeHtml(account.userCode)}">
          <i class="fa-regular fa-eye" aria-hidden="true"></i>
          <span>View</span>
        </button>
      `;
    }

    function renderRows(pageAccounts) {
      tableBody.innerHTML = pageAccounts.map((account) => `
        <tr>
          <td data-label="Code"><strong>${escapeHtml(account.userCode)}</strong></td>
          <td data-label="Registrant">
            <span class="account-primary-text">${escapeHtml(account.fullName || 'Unnamed registrant')}</span>
            <span class="account-muted-text">@${escapeHtml(account.username || 'unknown')}</span>
          </td>
          <td data-label="Contact">
            <span class="account-primary-text">${escapeHtml(account.email)}</span>
            <span class="account-muted-text">${escapeHtml(account.phone)}</span>
          </td>
          <td data-label="Submitted">${escapeHtml(formatDate(account.createdAt))}</td>
          <td data-label="Status"><span class="account-status-pill" data-status="${escapeHtml(account.status)}">${escapeHtml(statusLabel(account.status))}</span></td>
          <td data-label="Action" class="accounts-action-cell">${viewButton(account)}</td>
        </tr>
      `).join('');
    }

    function render() {
      const filtered = filteredAndSortedAccounts();
      const query = searchInput.value.trim();
      const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

      if (currentPage > totalPages) {
        currentPage = totalPages;
      }

      if (accounts.length === 0) {
        tableBody.innerHTML = '';
        tableWrap.hidden = true;
        pagination.hidden = true;
        setStatus(configValue('emptyMessage'));
        return;
      }

      if (filtered.length === 0) {
        tableBody.innerHTML = '';
        tableWrap.hidden = true;
        pagination.hidden = true;
        setStatus(query ? configValue('searchEmptyMessage', query) : configValue('emptyMessage'));
        return;
      }

      const startIndex = (currentPage - 1) * pageSize;
      const pageAccounts = filtered.slice(startIndex, startIndex + pageSize);

      renderRows(pageAccounts);
      paginationSummary.textContent = `Showing ${startIndex + 1}-${Math.min(startIndex + pageSize, filtered.length)} of ${filtered.length} ${configValue('paginationLabel')}`;
      previousButton.disabled = currentPage === 1;
      nextButton.disabled = currentPage === totalPages;
      statusMessage.hidden = true;
      tableWrap.hidden = false;
      pagination.hidden = false;
    }

    async function load() {
      tableWrap.hidden = true;
      pagination.hidden = true;
      setStatus(config.loadingMessage);
      refreshButton.disabled = true;
      searchInput.value = '';
      sortDirection = 'desc';
      currentPage = 1;
      updateSortButton();

      try {
        const payload = await fetchJson(config.endpoint);
        accounts = payload.data || [];
        render();
      } catch (error) {
        accounts = [];
        tableBody.innerHTML = '';
        tableWrap.hidden = true;
        pagination.hidden = true;
        setStatus(error.message, 'error');
      } finally {
        refreshButton.disabled = false;
      }
    }

    tableBody.addEventListener('click', (event) => {
      const button = event.target.closest('[data-account-id]');

      if (!button) {
        return;
      }

      const accountId = normalizeAccountId(button.dataset.accountId);

      if (!accountId) {
        setStatus('Invalid account id.', 'error');
        return;
      }

      config.onView(accountId);
    });

    refreshButton.addEventListener('click', load);
    searchInput.addEventListener('input', () => {
      currentPage = 1;
      render();
    });
    sortButton.addEventListener('click', () => {
      sortDirection = sortDirection === 'desc' ? 'asc' : 'desc';
      currentPage = 1;
      updateSortButton();
      render();
    });
    previousButton.addEventListener('click', () => {
      currentPage = Math.max(1, currentPage - 1);
      render();
    });
    nextButton.addEventListener('click', () => {
      currentPage += 1;
      render();
    });

    updateSortButton();

    return {
      load,
      render,
      setStatus
    };
  }

  window.ResQMeshAccounts = {
    createListPanel,
    createModal,
    createToast,
    fetchJson,
    normalizeAccountId,
    statusLabel
  };
}());
