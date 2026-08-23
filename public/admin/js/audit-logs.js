(function initializeAuditLogsPage() {
  'use strict';

  var ACTION_OPTIONS = [
    ['civilian_account_suspended', 'Civilian account suspended'],
    ['civilian_account_activated', 'Civilian account activated'],
    ['rescuer_archived', 'Rescuer archived'],
    ['rescuer_activated', 'Rescuer activated'],
    ['rescuer_password_reset', 'Rescuer password reset'],
    ['rescuer_operational_status_changed', 'Rescuer status changed'],
    ['report_export_generated', 'Report export generated'],
    ['deployment_canceled', 'Deployment canceled'],
    ['deployment_accomplished', 'Deployment accomplished'],
    ['department_chat_created', 'Department chat created'],
    ['department_chat_updated', 'Department chat updated'],
    ['department_chat_archived', 'Department chat archived'],
    ['rescue_team_created', 'Rescue team created'],
    ['rescue_team_updated', 'Rescue team updated'],
    ['admin_session_required_failed', 'Admin session required failed'],
    ['admin_csrf_failed', 'Admin CSRF failed']
  ];

  var TARGET_OPTIONS = [
    ['civilian_account', 'Civilian account'],
    ['account', 'Account'],
    ['rescuer', 'Rescuer'],
    ['report', 'Report'],
    ['report_export', 'Report export'],
    ['deployment', 'Deployment'],
    ['department_chat', 'Department chat'],
    ['rescue_team', 'Rescue team'],
    ['admin_permission', 'Admin permission'],
    ['admin_session', 'Admin session'],
    ['admin_csrf', 'Admin CSRF']
  ];

  var state = {
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 1,
    logs: [],
    loading: false
  };

  var dom = {};
  var actionLabels = buildLabelMap(ACTION_OPTIONS);
  var targetLabels = buildLabelMap(TARGET_OPTIONS);

  function buildLabelMap(options) {
    return options.reduce(function mapOption(labels, option) {
      labels[option[0]] = option[1];
      return labels;
    }, {});
  }

  function getById(id) {
    return document.getElementById(id);
  }

  function collectDom() {
    dom.form = getById('auditLogsFilterForm');
    dom.search = getById('auditLogsSearchInput');
    dom.result = getById('auditLogsResultFilter');
    dom.action = getById('auditLogsActionFilter');
    dom.targetType = getById('auditLogsTargetFilter');
    dom.admin = getById('auditLogsAdminFilter');
    dom.dateFrom = getById('auditLogsDateFromFilter');
    dom.dateTo = getById('auditLogsDateToFilter');
    dom.limit = getById('auditLogsLimitFilter');
    dom.feedback = getById('auditLogsFeedback');
    dom.tableBody = getById('auditLogsTableBody');
    dom.empty = getById('auditLogsEmpty');
    dom.prev = getById('auditLogsPrevButton');
    dom.next = getById('auditLogsNextButton');
    dom.pageLabel = getById('auditLogsPageLabel');
    dom.modal = getById('auditLogDetailsModal');
    dom.detailsGrid = getById('auditLogDetailsGrid');
    dom.metadataBlock = getById('auditLogMetadataBlock');
  }

  function hasRequiredDom() {
    return dom.form && dom.tableBody && dom.feedback && dom.empty && dom.prev && dom.next && dom.pageLabel && dom.modal && dom.detailsGrid && dom.metadataBlock;
  }

  function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function safeText(value, fallback) {
    if (value === null || value === undefined || value === '') {
      return fallback || 'Not available';
    }
    return String(value);
  }

  function titleize(value) {
    return safeText(value, 'Unknown')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, function capitalize(match) { return match.toUpperCase(); });
  }

  function formatAction(action) {
    return actionLabels[action] || titleize(action);
  }

  function formatTargetType(targetType) {
    return targetLabels[targetType] || titleize(targetType);
  }

  function formatDate(value) {
    if (!value) {
      return 'Not available';
    }

    var date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return safeText(value);
    }

    return new Intl.DateTimeFormat('en-PH', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(date);
  }

  function formatStatusCode(value) {
    if (value === null || value === undefined || value === '') {
      return 'N/A';
    }
    return String(value);
  }

  function normalizeMetadata(metadata) {
    if (!metadata) {
      return null;
    }

    if (typeof metadata === 'object') {
      return metadata;
    }

    try {
      return JSON.parse(metadata);
    } catch (error) {
      return { value: String(metadata) };
    }
  }

  function metadataPreview(metadata) {
    var normalized = normalizeMetadata(metadata);
    if (!normalized || Object.keys(normalized).length === 0) {
      return 'No metadata';
    }

    var entries = Object.keys(normalized).slice(0, 3).map(function mapEntry(key) {
      var value = normalized[key];
      var displayValue = typeof value === 'object' && value !== null
        ? JSON.stringify(value)
        : String(value);
      return key + ': ' + displayValue;
    });

    var suffix = Object.keys(normalized).length > entries.length ? '...' : '';
    return entries.join(' | ') + suffix;
  }

  function renderOptions(select, options) {
    if (!select) {
      return;
    }

    options.forEach(function appendOption(option) {
      var element = document.createElement('option');
      element.value = option[0];
      element.textContent = option[1];
      select.appendChild(element);
    });
  }

  function setFeedback(message, type) {
    if (!dom.feedback) {
      return;
    }

    if (!message) {
      dom.feedback.hidden = true;
      dom.feedback.textContent = '';
      dom.feedback.className = 'audit-logs-feedback';
      return;
    }

    dom.feedback.hidden = false;
    dom.feedback.textContent = message;
    dom.feedback.className = 'audit-logs-feedback is-' + (type || 'info');
  }

  function setLoading(isLoading) {
    state.loading = isLoading;
    document.body.classList.toggle('audit-logs-loading', isLoading);

    [dom.prev, dom.next].forEach(function toggleButton(button) {
      if (button) {
        button.disabled = isLoading;
      }
    });
  }

  async function parseJsonResponse(response) {
    var text = await response.text();
    if (!text) {
      return {};
    }

    try {
      return JSON.parse(text);
    } catch (error) {
      return { success: false, message: 'The server returned an invalid response.' };
    }
  }

  async function adminFetch(url, options) {
    if (!window.ResQMeshAdminAuth || typeof window.ResQMeshAdminAuth.prepareRequestOptions !== 'function') {
      throw new Error('Admin authentication helpers are unavailable.');
    }

    var requestOptions = await window.ResQMeshAdminAuth.prepareRequestOptions(options || {});
    var response = await fetch(url, requestOptions);
    var payload = await parseJsonResponse(response);

    if (response.status === 401 && window.ResQMeshAdminAuth.handleUnauthorized) {
      window.ResQMeshAdminAuth.handleUnauthorized(payload.message || 'Your admin session has expired.');
      throw new Error(payload.message || 'Your admin session has expired.');
    }

    if (!response.ok || payload.success === false) {
      throw new Error(payload.message || 'Unable to load audit logs.');
    }

    return payload;
  }

  function readFilters(page) {
    var params = new URLSearchParams();
    params.set('page', String(page || state.page));
    params.set('limit', dom.limit && dom.limit.value ? dom.limit.value : '50');

    [
      ['search', dom.search],
      ['result', dom.result],
      ['action', dom.action],
      ['targetType', dom.targetType],
      ['admin', dom.admin],
      ['dateFrom', dom.dateFrom],
      ['dateTo', dom.dateTo]
    ].forEach(function addFilter(item) {
      var key = item[0];
      var input = item[1];
      var value = input && input.value ? input.value.trim() : '';
      if (value) {
        params.set(key, value);
      }
    });

    return params;
  }

  async function loadLogs(page) {
    if (state.loading) {
      return;
    }

    setLoading(true);
    setFeedback('', 'info');

    try {
      var payload = await adminFetch('/api/admin/audit-logs?' + readFilters(page || 1).toString());
      state.logs = Array.isArray(payload.data) ? payload.data : [];
      state.page = Number(payload.page) || 1;
      state.limit = Number(payload.limit) || 50;
      state.total = Number(payload.total) || 0;
      state.totalPages = Number(payload.totalPages) || 1;
      renderLogs();
    } catch (error) {
      state.logs = [];
      renderLogs();
      setFeedback(error.message || 'Unable to load audit logs.', 'error');
    } finally {
      setLoading(false);
    }
  }

  function resultBadge(result) {
    var normalized = result === 'success' ? 'success' : result === 'failure' ? 'failure' : 'neutral';
    return '<span class="audit-log-badge audit-log-badge-' + normalized + '">' + escapeHtml(titleize(result || 'unknown')) + '</span>';
  }

  function renderLogs() {
    if (!dom.tableBody) {
      return;
    }

    dom.tableBody.innerHTML = '';

    if (!state.logs.length) {
      dom.empty.hidden = false;
    } else {
      dom.empty.hidden = true;
    }

    state.logs.forEach(function renderRow(log) {
      var row = document.createElement('tr');
      row.className = 'audit-log-row';
      row.tabIndex = 0;
      row.dataset.logId = String(log.id || '');
      row.innerHTML = [
        '<td><span class="audit-log-time">' + escapeHtml(formatDate(log.createdAt)) + '</span></td>',
        '<td><strong>' + escapeHtml(safeText(log.adminUserCode, 'Unknown admin')) + '</strong></td>',
        '<td><span class="audit-log-action">' + escapeHtml(formatAction(log.action)) + '</span><small>' + escapeHtml(log.action || '') + '</small></td>',
        '<td><span>' + escapeHtml(formatTargetType(log.targetType)) + '</span><small>' + escapeHtml(safeText(log.targetCode || log.targetId, 'No target')) + '</small></td>',
        '<td>' + resultBadge(log.result) + '</td>',
        '<td>' + escapeHtml(formatStatusCode(log.statusCode)) + '</td>',
        '<td>' + escapeHtml(safeText(log.ipAddress, 'N/A')) + '</td>',
        '<td><span class="audit-log-reason">' + escapeHtml(safeText(log.reason, 'No reason')) + '</span><small>' + escapeHtml(metadataPreview(log.metadata)) + '</small></td>'
      ].join('');
      dom.tableBody.appendChild(row);
    });

    renderPagination();
  }

  function renderPagination() {
    dom.pageLabel.textContent = 'Page ' + state.page + ' of ' + state.totalPages + ' | ' + state.total + ' records';
    dom.prev.disabled = state.loading || state.page <= 1;
    dom.next.disabled = state.loading || state.page >= state.totalPages;
  }

  function findLogById(logId) {
    return state.logs.find(function findLog(log) {
      return String(log.id) === String(logId);
    });
  }

  function detailRow(label, value) {
    return '<div class="audit-log-detail-item">'
      + '<span>' + escapeHtml(label) + '</span>'
      + '<strong>' + escapeHtml(safeText(value, 'N/A')) + '</strong>'
      + '</div>';
  }

  function openDetails(log) {
    if (!log) {
      return;
    }

    dom.detailsGrid.innerHTML = [
      detailRow('Timestamp', formatDate(log.createdAt)),
      detailRow('Admin', log.adminUserCode || log.adminUserId || 'Unknown admin'),
      detailRow('Action', formatAction(log.action) + ' (' + safeText(log.action, 'unknown') + ')'),
      detailRow('Target', formatTargetType(log.targetType) + ' - ' + safeText(log.targetCode || log.targetId, 'No target')),
      detailRow('Result', titleize(log.result || 'unknown')),
      detailRow('Status code', formatStatusCode(log.statusCode)),
      detailRow('IP address', log.ipAddress || 'N/A'),
      detailRow('User agent', log.userAgent || 'N/A'),
      detailRow('Reason', log.reason || 'No reason')
    ].join('');

    var metadata = normalizeMetadata(log.metadata) || {};
    dom.metadataBlock.textContent = Object.keys(metadata).length
      ? JSON.stringify(metadata, null, 2)
      : 'No metadata was recorded for this audit event.';

    dom.modal.hidden = false;
    dom.modal.setAttribute('aria-hidden', 'false');
    dom.modal.classList.add('is-open');
    document.body.classList.add('admin-modal-open');
  }

  function closeDetails() {
    dom.modal.classList.remove('is-open');
    dom.modal.setAttribute('aria-hidden', 'true');
    dom.modal.hidden = true;
    document.body.classList.remove('admin-modal-open');
  }

  function debounce(callback, delay) {
    var timeoutId = null;

    return function debouncedCallback() {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(callback, delay);
    };
  }

  function bindEvents() {
    dom.form.addEventListener('submit', function handleSubmit(event) {
      event.preventDefault();
    });

    var debouncedLoad = debounce(function handleDebouncedFilter() {
      loadLogs(1);
    }, 350);

    [dom.search, dom.admin].forEach(function bindTextFilter(input) {
      if (input) {
        input.addEventListener('input', debouncedLoad);
      }
    });

    [dom.dateFrom, dom.dateTo].forEach(function bindDateFilter(input) {
      if (input) {
        input.addEventListener('change', function handleChange() {
          loadLogs(1);
        });
      }
    });

    dom.prev.addEventListener('click', function handlePrev() {
      if (state.page > 1) {
        loadLogs(state.page - 1);
      }
    });

    dom.next.addEventListener('click', function handleNext() {
      if (state.page < state.totalPages) {
        loadLogs(state.page + 1);
      }
    });

    [dom.result, dom.action, dom.targetType, dom.limit].forEach(function bindAutoFilter(input) {
      if (input) {
        input.addEventListener('change', function handleChange() {
          loadLogs(1);
        });
      }
    });

    dom.tableBody.addEventListener('click', function handleRowClick(event) {
      var row = event.target.closest('.audit-log-row');
      if (row) {
        openDetails(findLogById(row.dataset.logId));
      }
    });

    dom.tableBody.addEventListener('keydown', function handleRowKeydown(event) {
      if (event.key !== 'Enter' && event.key !== ' ') {
        return;
      }

      var row = event.target.closest('.audit-log-row');
      if (row) {
        event.preventDefault();
        openDetails(findLogById(row.dataset.logId));
      }
    });

    dom.modal.addEventListener('click', function handleModalClick(event) {
      if (event.target.matches('[data-close-audit-log-details]') || event.target === dom.modal) {
        closeDetails();
      }
    });

    document.addEventListener('keydown', function handleDocumentKeydown(event) {
      if (event.key === 'Escape' && dom.modal.classList.contains('is-open')) {
        closeDetails();
      }
    });
  }

  function init() {
    collectDom();

    if (!hasRequiredDom()) {
      console.error('Audit logs page is missing required DOM elements.');
      return;
    }

    renderOptions(dom.action, ACTION_OPTIONS);
    renderOptions(dom.targetType, TARGET_OPTIONS);
    bindEvents();
    loadLogs(1);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}());





