function getPdfDocumentConstructor() {
  try {
    return require('pdfkit');
  } catch (error) {
    const dependencyError = new Error('PDF generation dependency is missing. Run npm install to add pdfkit.');
    dependencyError.statusCode = 500;
    throw dependencyError;
  }
}

const COLORS = Object.freeze({
  ink: '#182230',
  body: '#344255',
  muted: '#6b7a8d',
  border: '#d9e1ea',
  soft: '#f6f8fb',
  softAlt: '#fff4ef',
  accent: '#f45b3f',
  white: '#ffffff'
});

function formatAbsoluteDate(value) {
  if (!value) {
    return 'Not available';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }

  return parsed.toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'UTC'
  });
}

function formatShortDate(value) {
  if (!value) {
    return 'Not available';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }

  return parsed.toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'UTC'
  });
}

function formatNumber(value) {
  if (value == null || value === '') {
    return '--';
  }

  const number = Number(value);
  if (!Number.isFinite(number)) {
    return String(value);
  }

  return Number.isInteger(number) ? String(number) : number.toFixed(1);
}

function getContentWidth(doc) {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

function ensurePageSpace(doc, requiredHeight = 80) {
  if (doc.y + requiredHeight <= doc.page.height - doc.page.margins.bottom) {
    return;
  }

  doc.addPage();
}

function drawHeader(doc, payload) {
  const width = getContentWidth(doc);
  const startX = doc.page.margins.left;
  const topY = doc.y;

  doc.save();
  doc.roundedRect(startX, topY, width, 94, 16).fillAndStroke(COLORS.soft, COLORS.border);
  doc.restore();

  doc.font('Helvetica-Bold').fontSize(22).fillColor(COLORS.ink).text(payload.reportName, startX + 20, topY + 18);
  doc.font('Helvetica').fontSize(10.5).fillColor(COLORS.muted).text(
    'Infrastructure export covering node availability, sync freshness, telemetry, and command queue health.',
    startX + 20,
    topY + 48,
    { width: width - 40 }
  );

  doc.y = topY + 112;
}

function drawFilterChips(doc, payload) {
  const width = getContentWidth(doc);
  const startX = doc.page.margins.left;
  const startY = doc.y;
  const chips = [
    { label: 'Generated', value: formatAbsoluteDate(payload.generatedAt) },
    { label: 'Date range', value: payload.filters.dateRangeLabel },
    { label: 'Node scope', value: payload.filters.sourceScopeLabel },
    { label: 'Export format', value: 'PDF' }
  ];
  const chipWidth = (width - 24) / 2;
  const chipHeight = 42;
  const gap = 12;

  chips.forEach((chip, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = startX + col * (chipWidth + gap);
    const y = startY + row * (chipHeight + 10);

    doc.save();
    doc.roundedRect(x, y, chipWidth, chipHeight, 10).fillAndStroke(COLORS.white, COLORS.border);
    doc.restore();

    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLORS.muted).text(chip.label.toUpperCase(), x + 14, y + 10);
    doc.font('Helvetica').fontSize(10.5).fillColor(COLORS.ink).text(chip.value, x + 14, y + 22, {
      width: chipWidth - 28,
      ellipsis: true
    });
  });

  doc.y = startY + chipHeight * 2 + 22;
}

function drawDivider(doc) {
  const width = getContentWidth(doc);
  const startX = doc.page.margins.left;
  doc.save();
  doc.strokeColor(COLORS.border).lineWidth(1)
    .moveTo(startX, doc.y)
    .lineTo(startX + width, doc.y)
    .stroke();
  doc.restore();
  doc.moveDown(0.8);
}

function drawSectionHeading(doc, title, subtitle) {
  ensurePageSpace(doc, subtitle ? 58 : 38);
  const startX = doc.page.margins.left;
  const width = getContentWidth(doc);
  const startY = doc.y + 4;

  doc.font('Helvetica-Bold').fontSize(16).fillColor(COLORS.ink).text(title, startX, startY, {
    width,
    align: 'left'
  });

  if (subtitle) {
    doc.font('Helvetica').fontSize(9.5).fillColor(COLORS.muted).text(subtitle, startX, startY + 22, {
      width,
      align: 'left'
    });
  }

  doc.y = subtitle ? startY + 42 : startY + 24;
}

function drawMetricCards(doc, title, subtitle, items, columns = 4) {
  if (!items.length) {
    return;
  }

  const width = getContentWidth(doc);
  const gap = 12;
  const cardHeight = columns >= 5 ? 98 : 86;
  const startX = doc.page.margins.left;
  const rows = Math.ceil(items.length / columns);
  const sectionHeight = 54 + rows * cardHeight + Math.max(0, rows - 1) * gap + 10;

  ensurePageSpace(doc, sectionHeight);
  drawSectionHeading(doc, title, subtitle);
  const startY = doc.y;
  const cardWidth = (width - gap * (columns - 1)) / columns;

  items.forEach((item, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const x = startX + col * (cardWidth + gap);
    const y = startY + row * (cardHeight + gap);

    doc.save();
    doc.roundedRect(x, y, cardWidth, cardHeight, 12).fillAndStroke(COLORS.white, COLORS.border);
    doc.restore();

    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLORS.muted).text(item.label.toUpperCase(), x + 14, y + 12, {
      width: cardWidth - 28
    });
    doc.font('Helvetica-Bold').fontSize(17).fillColor(COLORS.ink).text(item.value, x + 14, y + 32, {
      width: cardWidth - 28
    });

    if (item.note) {
      doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.muted).text(item.note, x + 14, y + 56, {
        width: cardWidth - 28
      });
    }
  });

  doc.y = startY + rows * cardHeight + Math.max(0, rows - 1) * gap + 6;
}

function drawTable(doc, title, subtitle, columns, rows, options = {}) {
  const startX = doc.page.margins.left;
  const tableWidth = getContentWidth(doc);
  const headerHeight = options.headerHeight || 24;
  const rowHeight = options.rowHeight || 24;
  const repeatTitle = options.repeatTitle !== false;
  const columnWidths = columns.map((column) => Math.floor(tableWidth * column.widthRatio));
  const totalWidth = columnWidths.reduce((sum, width) => sum + width, 0);
  columnWidths[columnWidths.length - 1] += tableWidth - totalWidth;

  function renderTitle() {
    if (repeatTitle) {
      drawSectionHeading(doc, title, subtitle);
    }
  }

  function renderHeader() {
    ensurePageSpace(doc, headerHeight + rowHeight);
    const headerY = doc.y;

    doc.save();
    doc.roundedRect(startX, headerY, tableWidth, headerHeight, 8).fill(COLORS.softAlt);
    doc.restore();

    let cursorX = startX;
    columns.forEach((column, index) => {
      doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.ink).text(column.label, cursorX + 8, headerY + 8, {
        width: columnWidths[index] - 16,
        align: column.align || 'left',
        ellipsis: true
      });
      cursorX += columnWidths[index];
    });

    doc.y = headerY + headerHeight + 4;
  }

  function renderRow(row) {
    ensurePageSpace(doc, rowHeight + 4);
    const rowY = doc.y;

    doc.save();
    doc.roundedRect(startX, rowY, tableWidth, rowHeight, 6).fill(COLORS.white);
    doc.strokeColor(COLORS.border).lineWidth(0.7)
      .moveTo(startX, rowY + rowHeight)
      .lineTo(startX + tableWidth, rowY + rowHeight)
      .stroke();
    doc.restore();

    let cursorX = startX;
    columns.forEach((column, index) => {
      doc.font('Helvetica').fontSize(9).fillColor(COLORS.body).text(String(row[column.key] ?? ''), cursorX + 8, rowY + 7, {
        width: columnWidths[index] - 16,
        align: column.align || 'left',
        ellipsis: true
      });
      cursorX += columnWidths[index];
    });

    doc.y = rowY + rowHeight + 2;
  }

  renderTitle();
  renderHeader();

  rows.forEach((row) => {
    if (doc.y + rowHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      renderTitle();
      renderHeader();
    }

    renderRow(row);
  });

  doc.moveDown(0.5);
}

function startTablePage(doc) {
  doc.addPage();
  doc.y = doc.page.margins.top;
}

function drawDeviceStatusOverview(doc, summary) {
  drawMetricCards(doc, 'Device status overview', 'Current device registry and availability snapshot for the selected node scope.', [
    {
      label: 'Registered devices',
      value: String(summary.overview.registeredDevices || 0),
      note: 'Devices included by current node scope'
    },
    {
      label: 'Active devices',
      value: String(summary.overview.activeDevices || 0),
      note: 'Registry entries still allowed to sync'
    },
    {
      label: 'Revoked devices',
      value: String(summary.overview.revokedDevices || 0),
      note: 'Registry entries revoked from sync'
    },
    {
      label: 'Online recent',
      value: String(summary.overview.onlineRecentDevices || 0),
      note: 'Observed within the last 24 hours'
    },
    {
      label: 'Offline stale',
      value: String(summary.overview.offlineStaleDevices || 0),
      note: 'Active devices with stale or missing recent activity'
    }
  ], 3);
}

function drawSyncHealthSummary(doc, summary) {
  drawMetricCards(doc, 'Sync health summary', 'Current sync freshness and heartbeat coverage across the selected nodes.', [
    {
      label: 'Synced within 24h',
      value: String(summary.syncHealth.syncedWithinWindow || 0),
      note: 'Active devices with fresh sync timestamps'
    },
    {
      label: 'Stale syncs',
      value: String(summary.syncHealth.staleSyncCount || 0),
      note: 'Active devices with missing or old sync timestamps'
    },
    {
      label: 'Never synced',
      value: String(summary.syncHealth.neverSyncedCount || 0),
      note: 'Active devices with no sync timestamp yet'
    },
    {
      label: 'Missing heartbeat',
      value: String(summary.syncHealth.missingHeartbeatCount || 0),
      note: 'No recent device or node seen timestamp'
    },
    {
      label: 'Latest mesh sync',
      value: summary.syncHealth.latestMeshSyncAt ? formatShortDate(summary.syncHealth.latestMeshSyncAt) : 'Not available',
      note: 'Newest last-sync timestamp in scope'
    }
  ], 3);
}

function drawTelemetrySnapshot(doc, rows) {
  startTablePage(doc);
  drawTable(
    doc,
    'Telemetry snapshot',
    'Latest health snapshot per node using the newest stored health log for each device.',
    [
      { key: 'node', label: 'Node', widthRatio: 0.22 },
      { key: 'state', label: 'State', widthRatio: 0.13 },
      { key: 'battery', label: 'Battery', widthRatio: 0.09, align: 'right' },
      { key: 'rssi', label: 'RSSI', widthRatio: 0.07, align: 'right' },
      { key: 'gps', label: 'GPS', widthRatio: 0.09 },
      { key: 'cpu', label: 'CPU', widthRatio: 0.08, align: 'right' },
      { key: 'storage', label: 'Storage', widthRatio: 0.08, align: 'right' },
      { key: 'ram', label: 'RAM', widthRatio: 0.07, align: 'right' },
      { key: 'healthAt', label: 'Latest health', widthRatio: 0.17 }
    ],
    rows.length
      ? rows.map((row) => ({
          node: `${row.nodeId} - ${row.nodeName}`,
          state: row.liveStateLabel,
          battery: row.batteryVoltage == null ? '--' : `${formatNumber(row.batteryVoltage)}V`,
          rssi: row.signalStrength == null ? '--' : String(row.signalStrength),
          gps: row.gpsStatus || 'Unknown',
          cpu: row.cpuTemp == null ? '--' : `${formatNumber(row.cpuTemp)} C`,
          storage: row.storageRemaining == null ? '--' : String(row.storageRemaining),
          ram: row.ramUsage == null ? '--' : `${formatNumber(row.ramUsage)}%`,
          healthAt: formatShortDate(row.latestHealthRecordedAt)
        }))
      : [{
          node: 'No devices in selected scope',
          state: '-',
          battery: '-',
          rssi: '-',
          gps: '-',
          cpu: '-',
          storage: '-',
          ram: '-',
          healthAt: '-'
        }],
    { rowHeight: 34 }
  );
}

function drawMeshCommandQueue(doc, summary) {
  drawMetricCards(doc, 'Mesh command queue', 'Current queue totals plus command activity recorded in the selected reporting window.', [
    {
      label: 'Pending now',
      value: String(summary.queue.pendingCount || 0),
      note: 'Commands still waiting for device pull/ack'
    },
    {
      label: 'Processed now',
      value: String(summary.queue.processedCount || 0),
      note: 'Processed command rows in current queue state'
    },
    {
      label: 'Cancelled now',
      value: String(summary.queue.cancelledCount || 0),
      note: 'Cancelled command rows in current queue state'
    },
    {
      label: 'Commands in range',
      value: String(summary.queue.commandRangeCount || 0),
      note: 'Command records created during the selected date window'
    },
    {
      label: 'Pending > 30m',
      value: String(summary.queue.stalePendingCount || 0),
      note: 'Potentially stuck pending commands'
    },
    {
      label: 'Oldest pending',
      value: summary.queue.oldestPendingAt ? formatShortDate(summary.queue.oldestPendingAt) : 'Not available',
      note: 'Oldest still-pending command timestamp'
    }
  ], 2);

  startTablePage(doc);
  drawTable(
    doc,
    'Command type breakdown',
    'Command distribution across the selected node scope and reporting window.',
    [
      { key: 'commandType', label: 'Command type', widthRatio: 0.34 },
      { key: 'totalCount', label: 'Total', widthRatio: 0.16, align: 'right' },
      { key: 'pendingCount', label: 'Pending', widthRatio: 0.16, align: 'right' },
      { key: 'processedCount', label: 'Processed', widthRatio: 0.17, align: 'right' },
      { key: 'cancelledCount', label: 'Cancelled', widthRatio: 0.17, align: 'right' }
    ],
    summary.commandTypeRows.length
      ? summary.commandTypeRows.map((row) => ({
          commandType: row.commandType,
          totalCount: String(row.totalCount),
          pendingCount: String(row.pendingCount),
          processedCount: String(row.processedCount),
          cancelledCount: String(row.cancelledCount)
        }))
      : [{
          commandType: 'No commands in selected date range',
          totalCount: '-',
          pendingCount: '-',
          processedCount: '-',
          cancelledCount: '-'
        }],
    { rowHeight: 30, repeatTitle: false }
  );
}

function drawRecentDeviceActivity(doc, rows) {
  startTablePage(doc);
  drawTable(
    doc,
    'Recent device activity',
    'Per-node operational summary using the latest activity, sync, health, and queue values.',
    [
      { key: 'node', label: 'Node', widthRatio: 0.25 },
      { key: 'status', label: 'Status', widthRatio: 0.15 },
      { key: 'lastSync', label: 'Last sync', widthRatio: 0.16 },
      { key: 'lastSeen', label: 'Last seen', widthRatio: 0.16 },
      { key: 'latestHealth', label: 'Health log', widthRatio: 0.14 },
      { key: 'pending', label: 'Pending', widthRatio: 0.07, align: 'right' },
      { key: 'users', label: 'Users', widthRatio: 0.07, align: 'right' }
    ],
    rows.length
      ? rows.map((row) => ({
          node: `${row.nodeId} - ${row.nodeName}`,
          status: row.liveStateLabel,
          lastSync: formatShortDate(row.lastSyncAt),
          lastSeen: formatShortDate(row.latestSeenAt),
          latestHealth: formatShortDate(row.latestHealthRecordedAt),
          pending: String(row.pendingCommandCount),
          users: String(row.usersConnected)
        }))
      : [{
          node: 'No devices in selected scope',
          status: '-',
          lastSync: '-',
          lastSeen: '-',
          latestHealth: '-',
          pending: '-',
          users: '-'
        }],
    { rowHeight: 34 }
  );
}

function drawFailureAndGapIndicators(doc, summary) {
  drawMetricCards(doc, 'Failure and gap indicators', 'Derived infrastructure gaps based on missing freshness and stale pending queue state.', [
    {
      label: 'No recent health logs',
      value: String(summary.failureSummary.noRecentHealthCount || 0),
      note: 'Active devices with no recent health snapshot'
    },
    {
      label: 'No recent sync',
      value: String(summary.failureSummary.noRecentSyncCount || 0),
      note: 'Active devices with missing or stale sync timestamps'
    },
    {
      label: 'Missing heartbeat',
      value: String(summary.failureSummary.missingHeartbeatCount || 0),
      note: 'No recent device or node presence'
    },
    {
      label: 'Stale pending devices',
      value: String(summary.failureSummary.stalePendingCommandDeviceCount || 0),
      note: 'Devices carrying pending commands older than 30 minutes'
    }
  ], 2);

  startTablePage(doc);
  drawTable(
    doc,
    'Flagged device rows',
    'Only devices currently carrying one or more stale or missing-health indicators.',
    [
      { key: 'node', label: 'Node', widthRatio: 0.24 },
      { key: 'issues', label: 'Issues', widthRatio: 0.4 },
      { key: 'lastSync', label: 'Last sync', widthRatio: 0.18 },
      { key: 'lastSeen', label: 'Last seen', widthRatio: 0.18 }
    ],
    summary.failureRows.length
      ? summary.failureRows.map((row) => ({
          node: `${row.nodeId} - ${row.nodeName}`,
          issues: row.issueSummary,
          lastSync: formatShortDate(row.lastSyncAt),
          lastSeen: formatShortDate(row.latestSeenAt)
        }))
      : [{
          node: 'No current failure or gap indicators',
          issues: 'All selected nodes currently have recent sync, heartbeat, health, and no stale pending commands.',
          lastSync: '-',
          lastSeen: '-'
        }],
    { rowHeight: 34, repeatTitle: false }
  );
}

async function buildMeshDeviceSyncHealthPdf(payload) {
  const PDFDocument = getPdfDocumentConstructor();

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 40
    });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    drawHeader(doc, payload);
    drawFilterChips(doc, payload);
    drawDivider(doc);

    const summary = payload.summary || {};
    const sectionIds = new Set(payload.sectionIds || []);

    if (sectionIds.has('device-status-overview')) {
      drawDeviceStatusOverview(doc, summary);
    }

    if (sectionIds.has('sync-health-summary')) {
      drawSyncHealthSummary(doc, summary);
    }

    if (sectionIds.has('telemetry-snapshot')) {
      drawTelemetrySnapshot(doc, summary.telemetryRows || []);
    }

    if (sectionIds.has('mesh-command-queue')) {
      drawMeshCommandQueue(doc, summary);
    }

    if (sectionIds.has('recent-device-activity')) {
      drawRecentDeviceActivity(doc, summary.recentActivityRows || []);
    }

    if (sectionIds.has('failure-and-gap-indicators')) {
      drawFailureAndGapIndicators(doc, summary);
    }

    doc.end();
  });
}

module.exports = {
  buildMeshDeviceSyncHealthPdf
};
