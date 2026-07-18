(function createOverviewDashboard() {
  const REFRESH_INTERVAL_MS = 10000;

  const dom = {
    refreshLabel: document.getElementById('overviewRefreshLabel'),
    feedback: document.getElementById('overviewFeedback'),
    statGrid: document.getElementById('overviewStatGrid'),
    emergencyDonut: document.getElementById('overviewEmergencyDonut'),
    emergencyLegend: document.getElementById('overviewEmergencyLegend'),
    readinessBars: document.getElementById('overviewReadinessBars'),
    networkTrend: document.getElementById('overviewNetworkTrend'),
    syncSummary: document.getElementById('overviewSyncSummary'),
    recentEmergencies: document.getElementById('overviewRecentEmergencies'),
    recentActivity: document.getElementById('overviewRecentActivity')
  };

  let isLoading = false;

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatNumber(value) {
    const numeric = Number(value || 0);
    return Number.isFinite(numeric) ? numeric.toLocaleString() : '0';
  }

  function parseTimestamp(value) {
    if (!value) return new Date('');
    const raw = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(raw)) {
      return new Date(`${raw.replace(' ', 'T')}Z`);
    }
    return new Date(raw);
  }

  function formatRelativeTime(value) {
    if (!value) return 'No sync yet';
    const date = parseTimestamp(value);
    if (Number.isNaN(date.getTime())) return value;

    const diffMs = Date.now() - date.getTime();
    const diffMinutes = Math.round(diffMs / 60000);
    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;

    const diffHours = Math.round(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    return `${Math.round(diffHours / 24)}d ago`;
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
      throw requestError;
    }

    return payload;
  }

  function setFeedback(message) {
    if (!dom.feedback) return;

    if (!message) {
      dom.feedback.hidden = true;
      dom.feedback.textContent = '';
      return;
    }

    dom.feedback.hidden = false;
    dom.feedback.textContent = message;
  }

  function renderStats(stats) {
    if (!dom.statGrid) return;

    dom.statGrid.innerHTML = (stats || []).map((stat) => `
      <article class="overview-stat-card" data-tone="${escapeHtml(stat.tone || 'neutral')}">
        <div class="overview-stat-header">
          <span class="overview-stat-icon"><i class="fa-solid ${escapeHtml(stat.icon || 'fa-chart-simple')}" aria-hidden="true"></i></span>
        </div>
        <span class="overview-stat-label">${escapeHtml(stat.label)}</span>
        <strong class="overview-stat-value">${formatNumber(stat.value)}</strong>
        <div class="overview-stat-detail">${escapeHtml(stat.detail)}</div>
      </article>
    `).join('');
  }

  function renderDonut(items) {
    if (!dom.emergencyDonut || !dom.emergencyLegend) return;

    const rows = items || [];
    const total = rows.reduce((sum, item) => sum + Number(item.value || 0), 0);
    let cursor = 0;
    const segments = rows.map((item) => {
      const degrees = total > 0 ? (Number(item.value || 0) / total) * 360 : 360 / Math.max(rows.length, 1);
      const start = cursor;
      cursor += degrees;
      return `${item.color} ${start}deg ${cursor}deg`;
    });

    dom.emergencyDonut.style.setProperty('--donut-bg', `conic-gradient(${segments.join(', ')})`);
    dom.emergencyDonut.dataset.total = formatNumber(total);

    dom.emergencyLegend.innerHTML = rows.map((item) => `
      <div class="overview-legend-row">
        <span class="overview-color-dot" style="background:${escapeHtml(item.color)}"></span>
        <span class="overview-legend-label">${escapeHtml(item.label)}</span>
        <strong class="overview-legend-value">${formatNumber(item.value)}</strong>
      </div>
    `).join('');
  }

  function renderBars(items) {
    if (!dom.readinessBars) return;

    const rows = items || [];
    const maxValue = Math.max(...rows.map((item) => Number(item.value || 0)), 1);

    dom.readinessBars.innerHTML = rows.map((item) => {
      const value = Number(item.value || 0);
      const width = Math.max(4, Math.round((value / maxValue) * 100));
      return `
        <div class="overview-bar-row">
          <div class="overview-bar-meta">
            <span>${escapeHtml(item.label)}</span>
            <strong>${formatNumber(value)}</strong>
          </div>
          <div class="overview-bar-track">
            <div class="overview-bar-fill" style="width:${width}%;background:${escapeHtml(item.color)}"></div>
          </div>
        </div>
      `;
    }).join('');
  }

  function buildLinePoints(rows, key, width, height, padding, maxValue) {
    if (!rows.length) return '';
    const usableWidth = width - padding * 2;
    const usableHeight = height - padding * 2;
    const divisor = Math.max(rows.length - 1, 1);

    return rows.map((row, index) => {
      const x = padding + (index / divisor) * usableWidth;
      const y = height - padding - (Number(row[key] || 0) / maxValue) * usableHeight;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(' ');
  }

  function renderLineChart(rows) {
    if (!dom.networkTrend) return;

    const data = rows || [];
    const width = 640;
    const height = 220;
    const padding = 28;
    const maxValue = Math.max(
      ...data.map((row) => Number(row.distressCount || 0)),
      ...data.map((row) => Number(row.messageCount || 0)),
      1
    );
    const distressPoints = buildLinePoints(data, 'distressCount', width, height, padding, maxValue);
    const messagePoints = buildLinePoints(data, 'messageCount', width, height, padding, maxValue);
    const labelStep = Math.max(data.length - 1, 1);

    dom.networkTrend.innerHTML = `
      <svg class="overview-line-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Seven day distress and message trend">
        <line class="overview-line-axis" x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}"></line>
        <line class="overview-line-axis" x1="${padding}" y1="${padding}" x2="${padding}" y2="${height - padding}"></line>
        <polyline class="overview-line-path" points="${distressPoints}" stroke="#e54b31"></polyline>
        <polyline class="overview-line-path" points="${messagePoints}" stroke="#144f9d"></polyline>
        ${data.map((row, index) => {
          const x = padding + (index / labelStep) * (width - padding * 2);
          return `<text class="overview-line-label" x="${x.toFixed(2)}" y="${height - 6}" text-anchor="middle">${escapeHtml(row.label)}</text>`;
        }).join('')}
        ${data.map((row, index) => {
          const x = padding + (index / labelStep) * (width - padding * 2);
          const distressY = height - padding - (Number(row.distressCount || 0) / maxValue) * (height - padding * 2);
          const messageY = height - padding - (Number(row.messageCount || 0) / maxValue) * (height - padding * 2);
          return `
            <circle class="overview-line-point" cx="${x.toFixed(2)}" cy="${distressY.toFixed(2)}" r="4" fill="#e54b31"></circle>
            <circle class="overview-line-point" cx="${x.toFixed(2)}" cy="${messageY.toFixed(2)}" r="4" fill="#144f9d"></circle>
          `;
        }).join('')}
      </svg>
      <div class="overview-line-legend">
        <span><span class="overview-color-dot" style="background:#e54b31"></span> Distress reports</span>
        <span><span class="overview-color-dot" style="background:#144f9d"></span> Mesh messages</span>
      </div>
    `;
  }

  function renderSyncSummary(summary) {
    if (!dom.syncSummary) return;

    const mesh = summary?.mesh || {};
    const sync = summary?.sync || {};

    dom.syncSummary.innerHTML = [
      ['Registered devices', formatNumber(mesh.total)],
      ['Online nodes', formatNumber(mesh.online)],
      ['Stale nodes', formatNumber(mesh.stale)],
      ['Offline nodes', formatNumber(mesh.offline)],
      ['Synced messages', formatNumber(sync.totalMessages)],
      ['Health logs today', formatNumber(sync.healthLogs24h)],
      ['Latest sync', formatRelativeTime(sync.latestSyncAt)]
    ].map(([label, value]) => `
      <div class="overview-mini-item">
        <span class="overview-mini-label">${escapeHtml(label)}</span>
        <strong class="overview-mini-value">${escapeHtml(value)}</strong>
      </div>
    `).join('');
  }

  function renderRecentEmergencies(items) {
    if (!dom.recentEmergencies) return;

    if (!items || items.length === 0) {
      dom.recentEmergencies.innerHTML = '<div class="overview-empty">No distress reports have been synced yet.</div>';
      return;
    }

    dom.recentEmergencies.innerHTML = items.map((item) => `
      <article class="overview-list-item">
        <div class="overview-list-title">${escapeHtml(item.distressCode)} · ${escapeHtml(item.reason)}</div>
        <div class="overview-list-meta">${escapeHtml(item.nodeName)} ${item.teamName ? `· ${escapeHtml(item.teamName)}` : ''}</div>
        <span class="overview-status-pill" data-status="${escapeHtml(item.status)}">${escapeHtml(item.statusLabel)}</span>
        <div class="overview-list-meta">${escapeHtml(item.displayTime)}</div>
      </article>
    `).join('');
  }

  function renderRecentActivity(items) {
    if (!dom.recentActivity) return;

    if (!items || items.length === 0) {
      dom.recentActivity.innerHTML = '<div class="overview-empty">No admin notifications yet.</div>';
      return;
    }

    dom.recentActivity.innerHTML = items.map((item) => `
      <article class="overview-list-item">
        <div class="overview-list-title">${escapeHtml(item.title)}</div>
        <div class="overview-list-meta">${escapeHtml(item.message)}</div>
        <div class="overview-list-meta">${escapeHtml(item.displayTime)}</div>
      </article>
    `).join('');
  }

  function renderDashboard(data) {
    renderStats(data.stats);
    renderDonut(data.charts?.emergencyOutcomes);
    renderBars(data.charts?.readiness);
    renderLineChart(data.charts?.networkTrend);
    renderSyncSummary(data.summaries);
    renderRecentEmergencies(data.recentEmergencies);
    renderRecentActivity(data.recentNotifications);

    if (dom.refreshLabel) {
      dom.refreshLabel.textContent = `Updated ${formatRelativeTime(data.generatedAt)}`;
    }
  }

  async function loadOverview() {
    if (isLoading) return;
    isLoading = true;

    try {
      const payload = await requestJson('/api/admin/overview');
      renderDashboard(payload.data || {});
      setFeedback('');
    } catch (error) {
      setFeedback(error.message || 'Unable to load dashboard.');
    } finally {
      isLoading = false;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    void loadOverview();
    window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void loadOverview();
      }
    }, REFRESH_INTERVAL_MS);
  });
}());
