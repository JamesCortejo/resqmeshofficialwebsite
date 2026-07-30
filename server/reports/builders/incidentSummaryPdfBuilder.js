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

const OUTPUT_MODE_CONFIG = Object.freeze({
  briefing: {
    headerSubtitle: 'Operational summary of mesh and online incidents across the selected reporting window.',
    reasonSubtitle: 'Top reported incident reasons in the selected incident set.',
    recentSubtitle: 'Latest incidents with source, reason, current status, and assigned team.',
    responseCardOptions: { columns: 4, cardHeight: 84, valueFontSize: 13, noteTopOffset: 52 },
    recentColumns: [
      { key: 'code', label: 'Code', widthRatio: 0.14 },
      { key: 'source', label: 'Source', widthRatio: 0.12 },
      { key: 'reason', label: 'Reason', widthRatio: 0.27 },
      { key: 'status', label: 'Status', widthRatio: 0.16 },
      { key: 'team', label: 'Assigned team', widthRatio: 0.31 }
    ],
    recentLimit: 18
  },
  archive: {
    headerSubtitle: 'Archival incident export with detailed timestamps and deployment references for records retention.',
    reasonSubtitle: 'Recorded incident reasons preserved for archive and post-incident review.',
    recentSubtitle: 'Expanded incident register with timestamps, deployment references, and assignment state.',
    responseCardOptions: { columns: 2, cardHeight: 76, valueFontSize: 16, noteTopOffset: 48 },
    recentColumns: [
      { key: 'code', label: 'Code', widthRatio: 0.12 },
      { key: 'source', label: 'Source', widthRatio: 0.1 },
      { key: 'reason', label: 'Reason', widthRatio: 0.2 },
      { key: 'status', label: 'Status', widthRatio: 0.14 },
      { key: 'reportedAt', label: 'Reported', widthRatio: 0.18 },
      { key: 'deploymentCode', label: 'Deployment', widthRatio: 0.12 },
      { key: 'team', label: 'Assigned team', widthRatio: 0.14 }
    ],
    recentLimit: 28
  },
  field: {
    headerSubtitle: 'Condensed field handoff snapshot for rapid printing and responder briefing.',
    reasonSubtitle: 'Most common reasons in the selected field handoff window.',
    recentSubtitle: 'Compact incident list for quick field reference.',
    responseCardOptions: { columns: 4, cardHeight: 72, valueFontSize: 12, noteTopOffset: 46 },
    recentColumns: [
      { key: 'code', label: 'Code', widthRatio: 0.16 },
      { key: 'reason', label: 'Reason', widthRatio: 0.34 },
      { key: 'status', label: 'Status', widthRatio: 0.18 },
      { key: 'team', label: 'Team', widthRatio: 0.32 }
    ],
    recentLimit: 12
  }
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

function formatDuration(secondsValue) {
  const seconds = Number(secondsValue || 0);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '0m 00s';
  }

  const wholeSeconds = Math.round(seconds);
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const remainingSeconds = wholeSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(remainingSeconds).padStart(2, '0')}s`;
  }

  return `${minutes}m ${String(remainingSeconds).padStart(2, '0')}s`;
}

function formatMaybeDuration(secondsValue) {
  if (!Number.isFinite(Number(secondsValue)) || Number(secondsValue) <= 0) {
    return 'Not available';
  }

  return formatDuration(secondsValue);
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

function drawDivider(doc) {
  const width = getContentWidth(doc);
  doc.x = doc.page.margins.left;
  doc.save();
  doc.strokeColor(COLORS.border).lineWidth(1)
    .moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.margins.left + width, doc.y)
    .stroke();
  doc.restore();
  doc.moveDown(0.8);
}

function drawSectionHeading(doc, title, subtitle) {
  ensurePageSpace(doc, 54);
  const startX = doc.page.margins.left;
  const startY = doc.y + 4;
  const width = getContentWidth(doc);

  doc.x = startX;
  doc.font('Helvetica-Bold').fontSize(14).fillColor(COLORS.ink).text(title, startX, startY, {
    width,
    align: 'left'
  });

  let cursorY = doc.y;
  if (subtitle) {
    doc.font('Helvetica').fontSize(9.5).fillColor(COLORS.muted).text(subtitle, startX, cursorY + 2, {
      width,
      align: 'left'
    });
    cursorY = doc.y;
  }

  doc.x = startX;
  doc.y = cursorY + 10;
}

function drawHeader(doc, payload) {
  const width = getContentWidth(doc);
  const startX = doc.page.margins.left;
  const topY = doc.y;
  doc.x = startX;
  const modeConfig = OUTPUT_MODE_CONFIG[payload.filters.outputMode] || OUTPUT_MODE_CONFIG.briefing;

  doc.save();
  doc.roundedRect(startX, topY, width, 94, 16).fillAndStroke(COLORS.soft, COLORS.border);
  doc.restore();

  doc.font('Helvetica-Bold').fontSize(22).fillColor(COLORS.ink).text(payload.reportName, startX + 20, topY + 18);
  doc.font('Helvetica').fontSize(10.5).fillColor(COLORS.muted).text(
    modeConfig.headerSubtitle,
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
  doc.x = startX;
  const chips = [
    { label: 'Generated', value: formatAbsoluteDate(payload.generatedAt) },
    { label: 'Date range', value: payload.filters.dateRangeLabel },
    { label: 'Source scope', value: payload.filters.sourceScopeLabel },
    { label: 'Output mode', value: payload.filters.outputModeLabel }
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

function drawMetricCards(doc, title, items, options = {}) {
  const cols = options.columns || 3;
  const width = getContentWidth(doc);
  const gap = 12;
  const cardHeight = options.cardHeight || 72;
  const rows = Math.ceil(items.length / cols);
  const sectionTitleHeight = options.subtitle ? 64 : 42;
  const sectionHeight = sectionTitleHeight + rows * cardHeight + Math.max(0, rows - 1) * gap + 16;

  ensurePageSpace(doc, sectionHeight);
  drawSectionHeading(doc, title, options.subtitle || null);

  const startX = doc.page.margins.left;
  const startY = doc.y;
  doc.x = startX;
  const cardWidth = (width - gap * (cols - 1)) / cols;
  const valueFontSize = options.valueFontSize || 18;
  const noteTopOffset = options.noteTopOffset || 50;

  items.forEach((item, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = startX + col * (cardWidth + gap);
    const y = startY + row * (cardHeight + gap);

    doc.save();
    doc.roundedRect(x, y, cardWidth, cardHeight, 12).fillAndStroke(COLORS.white, COLORS.border);
    doc.restore();

    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLORS.muted).text(item.label.toUpperCase(), x + 14, y + 12);
    doc.font('Helvetica-Bold').fontSize(valueFontSize).fillColor(COLORS.ink).text(item.value, x + 14, y + 28, {
      width: cardWidth - 28
    });

    if (item.note) {
      doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.muted).text(item.note, x + 14, y + noteTopOffset, {
        width: cardWidth - 28
      });
    }
  });

  doc.y = startY + rows * cardHeight + Math.max(0, rows - 1) * gap;
  doc.x = startX;
  doc.moveDown(0.4);
}

function drawReasonTable(doc, rows, outputMode) {
  doc.addPage();
  doc.x = doc.page.margins.left;
  doc.y = doc.page.margins.top;
  const modeConfig = OUTPUT_MODE_CONFIG[outputMode] || OUTPUT_MODE_CONFIG.briefing;
  drawSectionHeading(doc, 'Reason breakdown', modeConfig.reasonSubtitle);

  const tableRows = rows.length > 0
    ? rows.map((row) => ({ reason: row.label, count: String(row.count) }))
    : [{ reason: 'No incidents in selected range', count: '-' }];

  drawTable(doc, {
    title: null,
    columns: [
      { key: 'reason', label: 'Reason', widthRatio: 0.76, align: 'left' },
      { key: 'count', label: 'Count', widthRatio: 0.24, align: 'right' }
    ],
    rows: tableRows,
    rowHeight: 24,
    headerHeight: 24
  });
}

function drawRecentIncidentsTable(doc, rows, outputMode) {
  doc.addPage();
  doc.x = doc.page.margins.left;
  doc.y = doc.page.margins.top;
  const modeConfig = OUTPUT_MODE_CONFIG[outputMode] || OUTPUT_MODE_CONFIG.briefing;
  drawSectionHeading(doc, 'Recent incidents', modeConfig.recentSubtitle);

  const tableRows = rows.length > 0
    ? rows.map((incident) => ({
        code: incident.distressCode,
        source: incident.sourceLabel,
        reason: incident.reasonLabel,
        status: incident.statusLabel,
        team: incident.teamName || 'Unassigned',
        reportedAt: formatAbsoluteDate(incident.reportedAt),
        deploymentCode: incident.deploymentCode || '-'
      }))
    : [{
        code: 'No incidents',
        source: '-',
        reason: '-',
        status: '-',
        team: '-',
        reportedAt: '-',
        deploymentCode: '-'
      }];

  drawTable(doc, {
    columns: modeConfig.recentColumns,
    rows: tableRows,
    rowHeight: 24,
    headerHeight: 24
  });
}

function drawTable(doc, options) {
  const columns = options.columns || [];
  const rows = options.rows || [];
  const startX = doc.page.margins.left;
  const tableWidth = getContentWidth(doc);
  doc.x = startX;
  const headerHeight = options.headerHeight || 24;
  const rowHeight = options.rowHeight || 24;
  const columnWidths = columns.map((column) => Math.floor(tableWidth * column.widthRatio));
  const totalWidth = columnWidths.reduce((sum, width) => sum + width, 0);
  columnWidths[columnWidths.length - 1] += tableWidth - totalWidth;

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
    ensurePageSpace(doc, rowHeight + 10);
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

  renderHeader();
  rows.forEach((row) => {
    if (doc.y + rowHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      doc.x = startX;
      renderHeader();
    }
    renderRow(row);
  });

  doc.x = startX;
  doc.moveDown(0.5);
}

async function buildIncidentSummaryPdf(payload) {
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

    if (payload.sectionIds.includes('incident-counts')) {
      drawMetricCards(doc, 'Incident counts', [
        {
          label: 'Total incidents',
          value: String(payload.summary.totals.totalIncidents),
          note: 'Combined mesh and online incidents'
        },
        {
          label: 'Deployed incidents',
          value: String(payload.summary.totals.deployedIncidents),
          note: 'Incidents with rescue-team deployment'
        },
        {
          label: 'Resolved incidents',
          value: String(payload.summary.totals.resolvedIncidents),
          note: 'Canceled or accomplished incidents'
        }
      ]);
    }

    if (payload.sectionIds.includes('source-breakdown')) {
      drawMetricCards(doc, 'Source breakdown', [
        {
          label: 'Mesh incidents',
          value: String(payload.summary.sources.mesh),
          note: 'Reported through mesh devices'
        },
        {
          label: 'Online incidents',
          value: String(payload.summary.sources.online),
          note: 'Reported through cloud-connected users'
        }
      ], { columns: 2 });
    }

    if (payload.sectionIds.includes('status-breakdown')) {
      drawMetricCards(doc, 'Status breakdown', [
        {
          label: 'Active',
          value: String(payload.summary.statuses.active),
          note: 'Still awaiting final closure'
        },
        {
          label: 'Canceled',
          value: String(payload.summary.statuses.canceled),
          note: 'Closed without accomplishment'
        },
        {
          label: 'Accomplished',
          value: String(payload.summary.statuses.accomplished),
          note: 'Successfully completed incidents'
        }
      ]);
    }

    if (payload.sectionIds.includes('response-timing')) {
      const responseCardOptions = (OUTPUT_MODE_CONFIG[payload.filters.outputMode] || OUTPUT_MODE_CONFIG.briefing).responseCardOptions;
      drawMetricCards(doc, 'Response timing', [
        {
          label: 'Average response',
          value: formatMaybeDuration(payload.summary.responseTiming.averageResponseSeconds),
          note: `Samples: ${payload.summary.responseTiming.responseSampleCount || 0}`
        },
        {
          label: 'Fastest response',
          value: formatMaybeDuration(payload.summary.responseTiming.fastestResponseSeconds),
          note: 'Shortest report-to-deploy interval'
        },
        {
          label: 'Slowest response',
          value: formatMaybeDuration(payload.summary.responseTiming.slowestResponseSeconds),
          note: 'Longest report-to-deploy interval'
        },
        {
          label: 'Average duration',
          value: formatMaybeDuration(payload.summary.responseTiming.averageClosureSeconds),
          note: `Closure samples: ${payload.summary.responseTiming.closureSampleCount || 0}`
        }
      ], responseCardOptions);
    }

    if (payload.sectionIds.includes('reason-breakdown')) {
      drawReasonTable(doc, payload.reasonBreakdown || [], payload.filters.outputMode);
    }

    if (payload.sectionIds.includes('recent-incidents')) {
      const modeConfig = OUTPUT_MODE_CONFIG[payload.filters.outputMode] || OUTPUT_MODE_CONFIG.briefing;
      drawRecentIncidentsTable(doc, (payload.recentIncidents || []).slice(0, modeConfig.recentLimit), payload.filters.outputMode);
    }

    doc.end();
  });
}

module.exports = {
  buildIncidentSummaryPdf
};
