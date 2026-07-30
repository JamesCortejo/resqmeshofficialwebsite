(function createOverviewDashboard() {
  const REFRESH_INTERVAL_MS = 10000;
  const charts = {
    status: null,
    trend: null,
    readiness: null
  };

  const dom = {
    feedback: document.getElementById('overviewFeedback'),
    statGrid: document.getElementById('overviewStatGrid'),
    emergencyDonut: document.getElementById('overviewEmergencyDonut'),
    emergencyLegend: document.getElementById('overviewEmergencyLegend'),
    readinessBars: document.getElementById('overviewReadinessBars'),
    networkTrend: document.getElementById('overviewNetworkTrend'),
    hybridSummary: document.getElementById('overviewHybridSummary'),
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
    if (!value) return null;
    const raw = String(value).trim();
    const date = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(raw)
      ? new Date(`${raw.replace(' ', 'T')}Z`)
      : new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatRelativeTime(value) {
    const date = parseTimestamp(value);
    if (!date) return 'No sync';

    const diffMinutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;

    const diffHours = Math.round(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.round(diffHours / 24)}d ago`;
  }

  function toneColor(tone) {
    switch (tone) {
      case 'success':
        return '#0e8b70';
      case 'warning':
        return '#ed8a19';
      case 'danger':
        return '#e54b31';
      default:
        return '#144f9d';
    }
  }

  async function requestJson(url, options = {}) {
    const baseOptions = {
      headers: {
        'Content-Type': 'application/json'
      },
      ...options
    };

    const requestOptions = window.ResQMeshAdminAuth
      ? await window.ResQMeshAdminAuth.prepareRequestOptions(baseOptions)
      : baseOptions;

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
      throw new Error(payload.message || 'Unable to load overview dashboard.');
    }

    return payload;
  }

  function setFeedback(message) {
    if (!dom.feedback) return;
    dom.feedback.hidden = !message;
    dom.feedback.textContent = message || '';
  }

  function destroyChart(key) {
    if (!charts[key]) return;
    charts[key].destroy();
    charts[key] = null;
  }

  function renderStats(stats = []) {
    if (!dom.statGrid) return;

    dom.statGrid.innerHTML = stats.map((stat) => {
      const tone = stat.tone || 'neutral';
      return `
        <article class="overview-kpi-card" data-tone="${escapeHtml(tone)}" style="--overview-accent:${escapeHtml(toneColor(tone))}">
          <div class="overview-kpi-icon">
            <i class="fa-solid ${escapeHtml(stat.icon || 'fa-chart-simple')}" aria-hidden="true"></i>
          </div>
          <div class="overview-kpi-copy">
            <span class="overview-kpi-label">${escapeHtml(stat.label)}</span>
            <strong class="overview-kpi-value">${formatNumber(stat.value)}</strong>
            <span class="overview-kpi-detail">${escapeHtml(stat.detail)}</span>
          </div>
        </article>
      `;
    }).join('');
  }

  function renderChartFallback(element, message) {
    const shell = element?.closest('.overview-chart-box');
    if (!shell || typeof Chart !== 'undefined') return;
    shell.innerHTML = `<div class="overview-empty">${escapeHtml(message)}</div>`;
  }

  function renderStatusChart(items = []) {
    if (!dom.emergencyDonut) return;
    renderChartFallback(dom.emergencyDonut, 'Chart library unavailable.');
    if (typeof Chart === 'undefined') return;

    destroyChart('status');
    const rows = items.length ? items : [
      { label: 'Active', value: 0, color: '#e54b31' },
      { label: 'Canceled', value: 0, color: '#64717f' },
      { label: 'Accomplished', value: 0, color: '#0e8b70' }
    ];
    const total = rows.reduce((sum, item) => sum + Number(item.value || 0), 0);

    charts.status = new Chart(dom.emergencyDonut, {
      type: 'doughnut',
      data: {
        labels: rows.map((item) => item.label),
        datasets: [{
          data: rows.map((item) => Number(item.value || 0)),
          backgroundColor: rows.map((item) => item.color),
          borderWidth: 0,
          hoverOffset: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '68%',
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#17212b',
            titleColor: '#ffffff',
            bodyColor: '#ffffff'
          }
        }
      },
      plugins: [{
        id: 'overviewCenterText',
        afterDraw(chart) {
          const meta = chart.getDatasetMeta(0);
          if (!meta?.data?.length) return;
          const { ctx } = chart;
          const { x, y } = meta.data[0];
          ctx.save();
          ctx.textAlign = 'center';
          ctx.fillStyle = '#17212b';
          ctx.font = '900 28px Inter, sans-serif';
          ctx.fillText(String(total), x, y - 3);
          ctx.fillStyle = '#64717f';
          ctx.font = '800 11px Inter, sans-serif';
          ctx.fillText('total incidents', x, y + 18);
          ctx.restore();
        }
      }]
    });

    if (dom.emergencyLegend) {
      dom.emergencyLegend.innerHTML = rows.map((item) => `
        <div class="overview-legend-row">
          <span class="overview-color-dot" style="background:${escapeHtml(item.color)}"></span>
          <span class="overview-legend-label">${escapeHtml(item.label)}</span>
          <strong class="overview-legend-value">${formatNumber(item.value)}</strong>
        </div>
      `).join('');
    }
  }

  function renderTrendChart(rows = []) {
    if (!dom.networkTrend) return;
    renderChartFallback(dom.networkTrend, 'Chart library unavailable.');
    if (typeof Chart === 'undefined') return;

    destroyChart('trend');
    const data = rows || [];

    charts.trend = new Chart(dom.networkTrend, {
      type: 'line',
      data: {
        labels: data.map((row) => row.label),
        datasets: [
          {
            label: 'Incidents',
            data: data.map((row) => Number(row.distressCount || 0)),
            borderColor: '#e54b31',
            backgroundColor: 'rgba(229, 75, 49, 0.1)',
            pointBackgroundColor: '#e54b31',
            pointBorderWidth: 0,
            tension: 0.32
          },
          {
            label: 'Mesh messages',
            data: data.map((row) => Number(row.messageCount || 0)),
            borderColor: '#144f9d',
            backgroundColor: 'rgba(20, 79, 157, 0.1)',
            pointBackgroundColor: '#144f9d',
            pointBorderWidth: 0,
            tension: 0.32
          },
          {
            label: 'Cloud chat',
            data: data.map((row) => Number(row.chatCount || 0)),
            borderColor: '#0e8b70',
            backgroundColor: 'rgba(14, 139, 112, 0.1)',
            pointBackgroundColor: '#0e8b70',
            pointBorderWidth: 0,
            tension: 0.32
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          intersect: false,
          mode: 'index'
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#64717f', font: { weight: '700' } }
          },
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(100, 113, 127, 0.12)' },
            ticks: { color: '#64717f', precision: 0 }
          }
        },
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              usePointStyle: true,
              color: '#64717f',
              boxWidth: 9,
              font: { weight: '800' }
            }
          },
          tooltip: {
            backgroundColor: '#17212b',
            titleColor: '#ffffff',
            bodyColor: '#ffffff'
          }
        }
      }
    });
  }

  function renderReadinessChart(items = []) {
    if (!dom.readinessBars) return;
    renderChartFallback(dom.readinessBars, 'Chart library unavailable.');
    if (typeof Chart === 'undefined') return;

    destroyChart('readiness');
    const rows = items || [];

    charts.readiness = new Chart(dom.readinessBars, {
      type: 'bar',
      data: {
        labels: rows.map((item) => item.label),
        datasets: [{
          data: rows.map((item) => Number(item.value || 0)),
          backgroundColor: rows.map((item) => item.color),
          borderRadius: 8,
          borderSkipped: false,
          barThickness: 15
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            beginAtZero: true,
            grid: { color: 'rgba(100, 113, 127, 0.12)' },
            ticks: { color: '#64717f', precision: 0 }
          },
          y: {
            grid: { display: false },
            ticks: { color: '#17212b', font: { weight: '800' } }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#17212b',
            titleColor: '#ffffff',
            bodyColor: '#ffffff'
          }
        }
      }
    });
  }

  function renderHybridSummary(summary = {}) {
    if (!dom.hybridSummary) return;

    const hybrid = summary.hybrid || {};
    const items = [
      ['Online distress', formatNumber(hybrid.onlineDistress)],
      ['Mesh distress', formatNumber(hybrid.meshDistress)],
      ['Active chat rooms', formatNumber(hybrid.activeDepartmentChats)],
      ['Open chat threads', formatNumber(hybrid.openConversations)],
      ['Chat messages today', formatNumber(hybrid.chatMessages24h)],
      ['Shared rescuers live', formatNumber(hybrid.sharedRescuers)],
      ['Latest mesh sync', formatRelativeTime(hybrid.latestMeshSyncAt)],
      ['Stale/offline nodes', `${formatNumber(hybrid.staleMeshNodes)} / ${formatNumber(hybrid.offlineMeshNodes)}`]
    ];

    dom.hybridSummary.innerHTML = items.map(([label, value]) => `
      <div class="overview-pulse-item">
        <span class="overview-pulse-label">${escapeHtml(label)}</span>
        <strong class="overview-pulse-value">${escapeHtml(value)}</strong>
      </div>
    `).join('');
  }

  function renderRecentEmergencies(items = []) {
    if (!dom.recentEmergencies) return;

    if (!items.length) {
      dom.recentEmergencies.innerHTML = '<div class="overview-empty">No recent emergencies.</div>';
      return;
    }

    dom.recentEmergencies.innerHTML = items.slice(0, 5).map((item) => `
      <article class="overview-list-item">
        <div class="overview-list-topline">
          <span class="overview-list-title">${escapeHtml(item.distressCode)} - ${escapeHtml(item.reason)}</span>
          <span class="overview-list-meta">${escapeHtml(item.displayTime)}</span>
        </div>
        <div class="overview-list-meta">${escapeHtml(item.subjectName)}${item.teamName ? ` - ${escapeHtml(item.teamName)}` : ''}</div>
        <div class="overview-chip-row">
          <span class="overview-status-pill" data-status="${escapeHtml(item.sourceType)}">${escapeHtml(item.sourceLabel)}</span>
          <span class="overview-status-pill" data-status="${escapeHtml(item.status)}">${escapeHtml(item.statusLabel)}</span>
        </div>
      </article>
    `).join('');
  }

  function renderRecentActivity(items = []) {
    if (!dom.recentActivity) return;

    if (!items.length) {
      dom.recentActivity.innerHTML = '<div class="overview-empty">No recent activity.</div>';
      return;
    }

    dom.recentActivity.innerHTML = items.slice(0, 4).map((item) => `
      <article class="overview-list-item">
        <div class="overview-list-topline">
          <span class="overview-list-title">${escapeHtml(item.title)}</span>
          <span class="overview-list-meta">${escapeHtml(item.displayTime)}</span>
        </div>
        <div class="overview-list-meta">${escapeHtml(item.message)}</div>
      </article>
    `).join('');
  }

  function renderDashboard(data = {}) {
    renderStats(data.stats || []);
    renderStatusChart(data.charts?.emergencyOutcomes || []);
    renderTrendChart(data.charts?.networkTrend || []);
    renderReadinessChart(data.charts?.readiness || []);
    renderHybridSummary(data.summaries || {});
    renderRecentEmergencies(data.recentEmergencies || []);
    renderRecentActivity(data.recentNotifications || []);
  }

  async function loadOverview() {
    if (isLoading) return;
    isLoading = true;

    try {
      const payload = await requestJson('/api/admin/overview');
      renderDashboard(payload.data || {});
      setFeedback('');
    } catch (error) {
      setFeedback(error.message || 'Unable to load overview dashboard.');
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
