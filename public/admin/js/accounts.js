(function initAccountsManager() {
  const statusMessage = document.getElementById('accountsStatusMessage');
  const tableWrap = document.getElementById('accountsTableWrap');
  const tableBody = document.getElementById('pendingAccountsBody');
  const refreshButton = document.getElementById('refreshAccountsButton');
  const searchInput = document.getElementById('accountsSearchInput');
  const sortButton = document.getElementById('sortAccountsButton');
  const sortLabel = document.getElementById('sortAccountsLabel');
  const pagination = document.getElementById('accountsPagination');
  const paginationSummary = document.getElementById('accountsPaginationSummary');
  const previousButton = document.getElementById('previousAccountsButton');
  const nextButton = document.getElementById('nextAccountsButton');
  const modal = document.getElementById('accountModal');
  const modalBody = document.getElementById('accountModalBody');
  const modalCode = document.getElementById('accountModalCode');
  const actionMessage = document.getElementById('accountActionMessage');
  const approveButton = document.getElementById('approveAccountButton');
  const declineButton = document.getElementById('declineAccountButton');
  const reviewToast = document.getElementById('adminReviewToast');
  const reviewToastIcon = document.getElementById('adminReviewToastIcon');
  const reviewToastMessage = document.getElementById('adminReviewToastMessage');

  let selectedAccountId = null;
  let pendingAccounts = [];
  let sortDirection = 'desc';
  let currentPage = 1;
  let pendingReviewAction = '';
  let reviewToastTimer = null;
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

  function setStatus(message, tone) {
    statusMessage.textContent = message;
    statusMessage.dataset.tone = tone || 'neutral';
    statusMessage.hidden = false;
  }

  function showReviewToast(message, tone) {
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
    const filtered = query
      ? pendingAccounts.filter((account) => searchText(account).includes(query))
      : [...pendingAccounts];

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

  async function fetchJson(url, options) {
    const response = await fetch(url, options);
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.message || 'Unable to complete request.');
    }

    return payload;
  }

  function renderRows(accounts) {
    tableBody.innerHTML = accounts.map((account) => `
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
        <td data-label="Status"><span class="account-status-pill">${escapeHtml(account.status)}</span></td>
        <td data-label="Action" class="accounts-action-cell">
          <button type="button" class="account-view-button" data-account-id="${account.id}" aria-label="View ${escapeHtml(account.userCode)}">
            <i class="fa-regular fa-eye" aria-hidden="true"></i>
            <span>View</span>
          </button>
        </td>
      </tr>
    `).join('');
  }

  function renderAccountList() {
    const accounts = filteredAndSortedAccounts();
    const query = searchInput.value.trim();
    const totalPages = Math.max(1, Math.ceil(accounts.length / pageSize));

    if (currentPage > totalPages) {
      currentPage = totalPages;
    }

    if (pendingAccounts.length === 0) {
      tableBody.innerHTML = '';
      tableWrap.hidden = true;
      pagination.hidden = true;
      setStatus('No pending accounts need review right now.');
      return;
    }

    if (accounts.length === 0) {
      tableBody.innerHTML = '';
      tableWrap.hidden = true;
      pagination.hidden = true;
      setStatus(`No pending accounts match "${query}".`);
      return;
    }

    const startIndex = (currentPage - 1) * pageSize;
    const pageAccounts = accounts.slice(startIndex, startIndex + pageSize);

    renderRows(pageAccounts);
    paginationSummary.textContent = `Showing ${startIndex + 1}-${Math.min(startIndex + pageSize, accounts.length)} of ${accounts.length} pending accounts`;
    previousButton.disabled = currentPage === 1;
    nextButton.disabled = currentPage === totalPages;
    statusMessage.hidden = true;
    tableWrap.hidden = false;
    pagination.hidden = false;
  }

  async function loadPendingAccounts() {
    tableWrap.hidden = true;
    setStatus('Loading pending accounts...');
    refreshButton.disabled = true;
    searchInput.value = '';
    sortDirection = 'desc';
    currentPage = 1;
    updateSortButton();

    try {
      const payload = await fetchJson('/api/admin/accounts/pending');
      pendingAccounts = payload.data || [];
      renderAccountList();
    } catch (error) {
      setStatus(error.message, 'error');
    } finally {
      refreshButton.disabled = false;
    }
  }

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

  function renderDetails(account) {
    modalCode.textContent = `${account.userCode} · ${account.status}`;

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

  function openModal() {
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('account-modal-open');
  }

  function closeModal() {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('account-modal-open');
    selectedAccountId = null;
    pendingReviewAction = '';
    actionMessage.textContent = '';
  }

  function clearReviewConfirmation() {
    pendingReviewAction = '';
    actionMessage.textContent = '';
  }

  function renderReviewConfirmation(status) {
    pendingReviewAction = status;
    const isDecline = status === 'declined';

    actionMessage.innerHTML = `
      <div class="account-review-confirmation" data-review-action="${status}">
        <div class="account-review-copy">
          <strong>${isDecline ? 'Decline this registration?' : 'Approve this registration?'}</strong>
          <span>${isDecline ? 'Write a reason before confirming. The user will receive this by email.' : 'The user will receive an approval email after confirmation.'}</span>
        </div>
        ${isDecline ? `
          <label class="account-decline-reason">
            <span>Reason for decline</span>
            <textarea id="declineReasonInput" rows="3" placeholder="Explain why this registration was declined."></textarea>
          </label>
        ` : ''}
        <div class="account-review-confirm-actions">
          <button type="button" class="admin-secondary-button" data-cancel-review>Cancel</button>
          <button type="button" class="${isDecline ? 'account-decline-button' : 'account-approve-button'}" data-confirm-review>
            <i class="fa-solid ${isDecline ? 'fa-xmark' : 'fa-check'}" aria-hidden="true"></i>
            <span>${isDecline ? 'Confirm Decline' : 'Confirm Approval'}</span>
          </button>
        </div>
      </div>
    `;

    if (isDecline) {
      document.getElementById('declineReasonInput').focus();
    }
  }

  async function openAccountDetails(id) {
    selectedAccountId = id;
    modalCode.textContent = 'Pending registration';
    modalBody.innerHTML = '<div class="accounts-status-message">Loading account details...</div>';
    actionMessage.textContent = '';
    openModal();

    try {
      const payload = await fetchJson(`/api/admin/accounts/${id}`);
      renderDetails(payload.data);
    } catch (error) {
      modalBody.innerHTML = `<div class="accounts-status-message" data-tone="error">${escapeHtml(error.message)}</div>`;
    }
  }

  async function updateStatus(status, reason = '') {
    if (!selectedAccountId) {
      return;
    }

    approveButton.disabled = true;
    declineButton.disabled = true;
    actionMessage.textContent = status === 'approved' ? 'Approving account...' : 'Declining account...';

    try {
      const payload = await fetchJson(`/api/admin/accounts/${selectedAccountId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, reason })
      });

      const warning = payload.warning || '';
      const successMessage = payload.message || 'Account status updated.';

      closeModal();
      await loadPendingAccounts();

      if (warning) {
        showReviewToast(warning, 'warning');
      } else {
        showReviewToast(successMessage, 'success');
      }
    } catch (error) {
      actionMessage.textContent = error.message;
    } finally {
      approveButton.disabled = false;
      declineButton.disabled = false;
    }
  }

  tableBody.addEventListener('click', (event) => {
    const button = event.target.closest('[data-account-id]');

    if (button) {
      openAccountDetails(button.dataset.accountId);
    }
  });

  refreshButton.addEventListener('click', loadPendingAccounts);
  searchInput.addEventListener('input', () => {
    currentPage = 1;
    renderAccountList();
  });
  sortButton.addEventListener('click', () => {
    sortDirection = sortDirection === 'desc' ? 'asc' : 'desc';
    currentPage = 1;
    updateSortButton();
    renderAccountList();
  });
  previousButton.addEventListener('click', () => {
    currentPage = Math.max(1, currentPage - 1);
    renderAccountList();
  });
  nextButton.addEventListener('click', () => {
    currentPage += 1;
    renderAccountList();
  });
  approveButton.addEventListener('click', () => renderReviewConfirmation('approved'));
  declineButton.addEventListener('click', () => renderReviewConfirmation('declined'));

  actionMessage.addEventListener('click', (event) => {
    if (event.target.closest('[data-cancel-review]')) {
      clearReviewConfirmation();
      return;
    }

    if (!event.target.closest('[data-confirm-review]') || !pendingReviewAction) {
      return;
    }

    const reasonInput = document.getElementById('declineReasonInput');
    const reason = reasonInput ? reasonInput.value.trim() : '';

    if (pendingReviewAction === 'declined' && !reason) {
      actionMessage.querySelector('.account-review-copy span').textContent = 'A decline reason is required before confirming.';
      reasonInput.focus();
      return;
    }

    updateStatus(pendingReviewAction, reason);
  });

  modal.addEventListener('click', (event) => {
    if (event.target.closest('[data-close-modal]')) {
      closeModal();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modal.classList.contains('is-open')) {
      closeModal();
    }
  });

  updateSortButton();
  loadPendingAccounts();
}());
