(function createReportsPage() {
  const RANGE_LABELS = {
    today: 'Today',
    '7d': 'Last 7 days',
    '30d': 'Last 30 days',
    month: 'This month',
    custom: 'Custom range'
  };

  const SCOPE_LABELS = {
    all: 'All sources',
    mesh: 'Mesh only',
    online: 'Online only'
  };

  const ACCOUNT_SCOPE_LABELS = {
    all: 'All accounts',
    civilian: 'Civilian only',
    rescuer: 'Rescuer only'
  };

  const NODE_SCOPE_LABELS = {
    all: 'All nodes',
    active: 'Active nodes',
    offline: 'Offline nodes'
  };

  const CHAT_SCOPE_LABELS = {
    all: 'All chat activity',
    department: 'Department chats only',
    global: 'Global announcements only'
  };

  const GENERATE_ENDPOINTS = Object.freeze({
    'incident-summary': '/api/admin/reports/incident-summary/generate',
    'rescue-team-activity': '/api/admin/reports/rescue-team-activity/generate',
    'accounts-access-audit': '/api/admin/reports/accounts-access-audit/generate',
    'mesh-device-sync-health': '/api/admin/reports/mesh-device-sync-health/generate',
    'online-communications-moderation': '/api/admin/reports/online-communications-moderation/generate'
  });

  const state = {
    catalog: [],
    recentExports: [],
    selectedReportId: null,
    includeSections: new Set(),
    loadingCatalog: true,
    generating: false,
    passwordModalOpen: false
  };

  const dom = {
    catalogList: document.getElementById('reportsCatalogList'),
    includeGrid: document.getElementById('reportsIncludeGrid'),
    feedback: document.getElementById('reportsFeedback'),
    dateRangeInput: document.getElementById('reportsDateRangeInput'),
    customRangeFields: document.getElementById('reportsCustomRangeFields'),
    customDateFromInput: document.getElementById('reportsCustomDateFromInput'),
    customDateToInput: document.getElementById('reportsCustomDateToInput'),
    scopeLabel: document.getElementById('reportsScopeLabel'),
    sourceScopeInput: document.getElementById('reportsSourceScopeInput'),
    previewName: document.getElementById('reportsPreviewName'),
    previewSubtitle: document.getElementById('reportsPreviewSubtitle'),
    previewRange: document.getElementById('reportsPreviewRange'),
    previewScopeLabel: document.getElementById('reportsPreviewScopeLabel'),
    previewScope: document.getElementById('reportsPreviewScope'),
    previewSections: document.getElementById('reportsPreviewSections'),
    generateButton: document.getElementById('reportsGenerateButton'),
    recentList: document.getElementById('reportsRecentList'),
    toast: document.getElementById('adminReviewToast'),
    toastMessage: document.getElementById('adminReviewToastMessage'),
    passwordModal: document.getElementById('reportsPasswordModal'),
    passwordInput: document.getElementById('reportsPasswordInput'),
    passwordMessage: document.getElementById('reportsPasswordMessage'),
    passwordConfirmButton: document.getElementById('reportsPasswordConfirmButton')
  };

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async function fetchJson(url, options) {
    const requestOptions = window.ResQMeshAdminAuth
      ? await window.ResQMeshAdminAuth.prepareRequestOptions(options)
      : options;
    const response = await fetch(url, requestOptions);
    const payload = await response.json().catch(() => ({}));

    if (response.status === 401) {
      window.ResQMeshAdminAuth?.handleUnauthorized(payload.message || 'Your admin session has expired.');
    }

    if (!response.ok || payload.success === false) {
      throw new Error(payload.message || 'Unable to load report data.');
    }

    return payload;
  }

  async function fetchBinary(url, options) {
    const requestOptions = window.ResQMeshAdminAuth
      ? await window.ResQMeshAdminAuth.prepareRequestOptions(options)
      : options;
    const response = await fetch(url, requestOptions);

    if (!response.ok) {
      let message = 'Unable to generate report.';
      try {
        const payload = await response.json();
        message = payload.message || message;
      } catch (error) {
        // Ignore JSON parse failures for binary responses.
      }

      if (response.status === 401) {
        window.ResQMeshAdminAuth?.handleUnauthorized(message);
      }

      throw new Error(message);
    }

    const blob = await response.blob();
    return {
      blob,
      filename: extractFilename(response.headers.get('Content-Disposition'))
    };
  }

  function extractFilename(headerValue) {
    const match = String(headerValue || '').match(/filename="?([^"]+)"?/i);
    return match ? match[1] : 'resqmesh-report.pdf';
  }

  function selectedReport() {
    return state.catalog.find((report) => report.id === state.selectedReportId) || null;
  }

  function defaultIncludeSectionIds(report) {
    return (report?.include || [])
      .filter((item) => item.defaultSelected)
      .map((item) => item.id);
  }

  function syncSelectedSections(report) {
    state.includeSections = new Set(defaultIncludeSectionIds(report));
  }

  function scopeLabelsForReport(report) {
    if (report?.id === 'accounts-access-audit') {
      return ACCOUNT_SCOPE_LABELS;
    }

    if (report?.id === 'mesh-device-sync-health') {
      return NODE_SCOPE_LABELS;
    }

    if (report?.id === 'online-communications-moderation') {
      return CHAT_SCOPE_LABELS;
    }

    return SCOPE_LABELS;
  }

  function formatDateInputLabel(value) {
    if (!value) {
      return '';
    }

    const date = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC'
    });
  }

  function customRangeError() {
    if (dom.dateRangeInput.value !== 'custom') {
      return '';
    }

    const fromValue = dom.customDateFromInput?.value || '';
    const toValue = dom.customDateToInput?.value || '';

    if (!fromValue || !toValue) {
      return 'Select both start and end dates for the custom range.';
    }

    if (fromValue > toValue) {
      return 'Custom start date cannot be later than custom end date.';
    }

    return '';
  }

  function buildReportRequestPayload(confirmPassword) {
    const payload = {
      dateRange: dom.dateRangeInput.value,
      sourceScope: dom.sourceScopeInput.value,
      outputMode: 'briefing',
      includeSections: Array.from(state.includeSections),
      confirmPassword
    };

    if (payload.dateRange === 'custom') {
      payload.customDateFrom = dom.customDateFromInput?.value || '';
      payload.customDateTo = dom.customDateToInput?.value || '';
    }

    return payload;
  }

  function selectedDateRangeLabel() {
    if (dom.dateRangeInput.value !== 'custom') {
      return RANGE_LABELS[dom.dateRangeInput.value] || 'Selected range';
    }

    const error = customRangeError();
    if (error) {
      return 'Custom range';
    }

    return `Custom range (${formatDateInputLabel(dom.customDateFromInput.value)} to ${formatDateInputLabel(dom.customDateToInput.value)})`;
  }

  function syncCustomRangeFields() {
    if (!dom.customRangeFields) {
      return;
    }

    dom.customRangeFields.hidden = dom.dateRangeInput.value !== 'custom';
  }
  function updateScopeField(report) {
    const labels = scopeLabelsForReport(report);
    const supportedScopes = Array.isArray(report?.supportedSourceScopes) && report.supportedSourceScopes.length
      ? report.supportedSourceScopes
      : Object.keys(labels);
    const currentValue = supportedScopes.includes(dom.sourceScopeInput.value)
      ? dom.sourceScopeInput.value
      : supportedScopes[0];

    dom.sourceScopeInput.innerHTML = supportedScopes.map((value) => `
      <option value="${escapeHtml(value)}">${escapeHtml(labels[value] || value)}</option>
    `).join('');
    dom.sourceScopeInput.value = currentValue || 'all';
    if (dom.scopeLabel) {
      dom.scopeLabel.textContent = report?.scopeLabel || 'Source scope';
    }
    if (dom.previewScopeLabel) {
      dom.previewScopeLabel.textContent = report?.scopeLabel || 'Source scope';
    }
  }

  function showFeedback(message, tone = 'warning') {
    dom.feedback.hidden = false;
    dom.feedback.dataset.tone = tone;
    dom.feedback.textContent = message;
  }

  function hideFeedback() {
    dom.feedback.hidden = true;
    dom.feedback.textContent = '';
    delete dom.feedback.dataset.tone;
  }

  function showToast(message) {
    if (!dom.toast || !dom.toastMessage) {
      return;
    }

    dom.toastMessage.textContent = message;
    dom.toast.classList.add('is-visible');
    dom.toast.setAttribute('aria-hidden', 'false');
    window.clearTimeout(showToast.timeoutId);
    showToast.timeoutId = window.setTimeout(() => {
      dom.toast.classList.remove('is-visible');
      dom.toast.setAttribute('aria-hidden', 'true');
    }, 3200);
  }

  function renderCatalog() {
    if (state.loadingCatalog) {
      dom.catalogList.innerHTML = `
        <article class="reports-catalog-card is-active">
          <div class="reports-catalog-head">
            <div><div class="reports-catalog-title">Loading reports...</div></div>
          </div>
          <p class="reports-catalog-desc">Preparing the live report catalog.</p>
        </article>
      `;
      return;
    }

    dom.catalogList.innerHTML = state.catalog.map((report) => `
      <button type="button" class="reports-catalog-card ${report.id === state.selectedReportId ? 'is-active' : ''}" data-report-id="${escapeHtml(report.id)}">
        <div class="reports-catalog-head">
          <div>
            <div class="reports-catalog-title">${escapeHtml(report.name)}</div>
          </div>
          <span class="reports-catalog-icon" aria-hidden="true">
            <i class="fa-solid ${escapeHtml(report.icon || 'fa-file-pdf')}"></i>
          </span>
        </div>
        <p class="reports-catalog-desc">${escapeHtml(report.description)}</p>
      </button>
    `).join('');
  }

  function renderIncludes() {
    const report = selectedReport();

    if (!report) {
      dom.includeGrid.innerHTML = '';
      return;
    }

    if (!report.available) {
      dom.includeGrid.innerHTML = `
        <article class="reports-checkbox-card">
          <span class="reports-checkbox-copy">
            <strong>${escapeHtml(report.pendingMessage || 'This report is not available yet.')}</strong>
            <p>This report card is visible in the workspace, but its PDF backend has not been wired yet.</p>
          </span>
        </article>
      `;
      return;
    }

    dom.includeGrid.innerHTML = (report.include || []).map((item) => `
      <label class="reports-checkbox-card">
        <input type="checkbox" data-include-id="${escapeHtml(item.id)}" ${state.includeSections.has(item.id) ? 'checked' : ''}>
        <span class="reports-checkbox-copy">
          <strong>${escapeHtml(item.label)}</strong>
          <p>${escapeHtml(item.description)}</p>
        </span>
      </label>
    `).join('');
  }

  function renderRecentExports() {
    if (!state.recentExports.length) {
      dom.recentList.innerHTML = `
        <article class="reports-recent-item">
          <strong>No exports yet</strong>
          <span>Generate a report PDF to start the export history.</span>
        </article>
      `;
      return;
    }

    dom.recentList.innerHTML = state.recentExports.map((item) => `
      <article class="reports-recent-item">
        <strong>${escapeHtml(item.reportName)}</strong>
        <span>${escapeHtml(item.dateRangeLabel)} - ${escapeHtml(item.sourceScopeLabel)}</span>
      </article>
    `).join('');
  }

  function renderPreview() {
    const report = selectedReport();

    if (!report) {
      dom.previewName.textContent = 'Select a report';
      dom.previewSubtitle.textContent = 'No report selected.';
      dom.previewRange.textContent = '-';
      dom.previewScope.textContent = '-';
      dom.previewSections.innerHTML = '';
      dom.generateButton.disabled = true;
      return;
    }

    dom.previewName.textContent = report.name;
    dom.previewSubtitle.textContent = report.available
      ? report.description
      : (report.pendingMessage || 'Backend generation is not available yet.');
    dom.previewRange.textContent = selectedDateRangeLabel();
    dom.previewScope.textContent = scopeLabelsForReport(report)[dom.sourceScopeInput.value] || 'Selected scope';

    const selectedLabels = report.available
      ? (report.include || [])
        .filter((item) => state.includeSections.has(item.id))
        .map((item) => item.label)
      : ['Backend generation pending'];

    dom.previewSections.innerHTML = (selectedLabels.length
      ? selectedLabels
      : ['Select at least one PDF section']).map((label) => `<li>${escapeHtml(label)}</li>`).join('');
    dom.generateButton.disabled = !report.available
      || state.generating
      || !state.includeSections.size
      || Boolean(customRangeError());
    dom.generateButton.querySelector('span').textContent = state.generating ? 'Generating PDF...' : 'Generate PDF';
  }

  function setPasswordMessage(message) {
    if (!dom.passwordMessage) {
      return;
    }

    if (!message) {
      dom.passwordMessage.hidden = true;
      dom.passwordMessage.textContent = '';
      return;
    }

    dom.passwordMessage.hidden = false;
    dom.passwordMessage.textContent = message;
  }

  function closePasswordModal() {
    if (!dom.passwordModal) {
      return;
    }

    state.passwordModalOpen = false;
    dom.passwordModal.classList.remove('is-open');
    dom.passwordModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('admin-modal-open');
    if (dom.passwordInput) {
      dom.passwordInput.value = '';
    }
    setPasswordMessage('');
  }

  function openPasswordModal() {
    if (!dom.passwordModal || state.generating) {
      return;
    }

    state.passwordModalOpen = true;
    dom.passwordModal.classList.add('is-open');
    dom.passwordModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('admin-modal-open');
    setPasswordMessage('');
    window.setTimeout(() => {
      dom.passwordInput?.focus();
    }, 0);
  }

  function applyReportConstraints(report) {
    updateScopeField(report);
    const dateOptions = new Set(report?.supportedDateRanges || ['today', '7d', '30d', 'month', 'custom']);
    Array.from(dom.dateRangeInput.options).forEach((option) => {
      option.disabled = !dateOptions.has(option.value);
    });
    if (!dateOptions.has(dom.dateRangeInput.value)) {
      dom.dateRangeInput.value = '7d';
    }
    syncCustomRangeFields();

    const scopeOptions = new Set(report?.supportedSourceScopes || ['all', 'mesh', 'online']);
    if (!scopeOptions.has(dom.sourceScopeInput.value)) {
      dom.sourceScopeInput.value = Array.from(scopeOptions)[0] || 'all';
    }
  }

  function refreshUi() {
    const report = selectedReport();
    renderCatalog();
    applyReportConstraints(report);
    renderIncludes();
    renderRecentExports();
    renderPreview();

    if (!report) {
      hideFeedback();
      return;
    }

    if (!report.available) {
      showFeedback(report.pendingMessage || 'This report backend is not available yet.');
      return;
    }

    if (!state.includeSections.size) {
      showFeedback('Select at least one PDF section.');
      return;
    }

    const dateError = customRangeError();
    if (dateError) {
      showFeedback(dateError);
      return;
    }

    hideFeedback();
  }

  async function loadCatalog() {
    state.loadingCatalog = true;
    refreshUi();

    try {
      const payload = await fetchJson('/api/admin/reports/catalog');
      state.catalog = payload.data?.reports || [];
      state.selectedReportId = state.catalog.find((report) => report.available)?.id || state.catalog[0]?.id || null;
      syncSelectedSections(selectedReport());
      state.loadingCatalog = false;
      refreshUi();
    } catch (error) {
      state.loadingCatalog = false;
      showFeedback(error.message || 'Unable to load report catalog.');
      renderCatalog();
      renderPreview();
    }
  }

  async function loadRecentExports() {
    try {
      const payload = await fetchJson('/api/admin/reports/exports');
      state.recentExports = payload.data || [];
      renderRecentExports();
    } catch (error) {
      dom.recentList.innerHTML = `
        <article class="reports-recent-item">
          <strong>Unable to load exports</strong>
          <span>${escapeHtml(error.message)}</span>
        </article>
      `;
    }
  }

  function downloadBlob(blob, filename) {
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename || 'resqmesh-report.pdf';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }

  async function generateSelectedReport(confirmPassword) {
    const report = selectedReport();
    if (!report || !report.available || state.generating || !state.includeSections.size) {
      return;
    }
    const dateError = customRangeError();
    if (dateError) {
      if (state.passwordModalOpen) {
        setPasswordMessage(dateError);
      } else {
        showFeedback(dateError);
      }
      return;
    }


    const endpoint = GENERATE_ENDPOINTS[report.id];
    if (!endpoint) {
      showFeedback('This report generator is not available yet.');
      return;
    }

    state.generating = true;
    refreshUi();

    try {
      const result = await fetchBinary(endpoint, {
        method: 'POST',
        body: JSON.stringify(buildReportRequestPayload(confirmPassword))
      });

      downloadBlob(result.blob, result.filename);
      closePasswordModal();
      showToast(`${report.name} generated successfully.`);
      await loadRecentExports();
    } catch (error) {
      if (state.passwordModalOpen) {
        setPasswordMessage(error.message || 'Unable to confirm admin password.');
      } else {
        showFeedback(error.message || `Unable to generate ${report.name}.`);
      }
    } finally {
      state.generating = false;
      refreshUi();
    }
  }

  dom.catalogList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-report-id]');
    if (!button) {
      return;
    }

    state.selectedReportId = button.getAttribute('data-report-id');
    syncSelectedSections(selectedReport());
    refreshUi();
  });

  dom.includeGrid.addEventListener('change', (event) => {
    const input = event.target.closest('[data-include-id]');
    if (!input) {
      return;
    }

    const includeId = input.getAttribute('data-include-id');
    if (input.checked) {
      state.includeSections.add(includeId);
    } else {
      state.includeSections.delete(includeId);
    }
    refreshUi();
  });

  [dom.dateRangeInput, dom.sourceScopeInput, dom.customDateFromInput, dom.customDateToInput].forEach((input) => {
    input?.addEventListener('change', refreshUi);
  });

  dom.generateButton.addEventListener('click', () => {
    const dateError = customRangeError();
    if (dateError) {
      showFeedback(dateError);
      return;
    }

    openPasswordModal();
  });

  dom.passwordModal?.addEventListener('click', (event) => {
    if (event.target.closest('[data-close-reports-password]') && !state.generating) {
      closePasswordModal();
    }
  });

  dom.passwordConfirmButton?.addEventListener('click', () => {
    const password = String(dom.passwordInput?.value || '');
    if (!password.trim()) {
      setPasswordMessage('Enter your current admin password to continue.');
      dom.passwordInput?.focus();
      return;
    }

    void generateSelectedReport(password);
  });

  dom.passwordInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      dom.passwordConfirmButton?.click();
      return;
    }

    if (event.key === 'Escape' && !state.generating) {
      closePasswordModal();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.passwordModalOpen && !state.generating) {
      closePasswordModal();
    }
  });

  void Promise.all([
    loadCatalog(),
    loadRecentExports()
  ]);
}());
