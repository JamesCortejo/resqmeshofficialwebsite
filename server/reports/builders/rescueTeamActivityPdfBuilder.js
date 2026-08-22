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

function formatDuration(secondsValue) {
  const seconds = Number(secondsValue || 0);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return 'Not available';
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
    'Team-centered deployment export covering workload, response performance, and recent rescue activity.',
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
  const cardHeight = 86;
  const startX = doc.page.margins.left;
  const rows = Math.ceil(items.length / columns);
  const sectionHeight = 54 + rows * cardHeight + Math.max(0, rows - 1) * gap + 8;

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
      width: cardWidth - 28,
      ellipsis: true
    });
    doc.font('Helvetica-Bold').fontSize(18).fillColor(COLORS.ink).text(item.value, x + 14, y + 30, {
      width: cardWidth - 28
    });
    if (item.note) {
      doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.muted).text(item.note, x + 14, y + 54, {
        width: cardWidth - 28
      });
    }
  });

  doc.y = startY + rows * cardHeight + Math.max(0, rows - 1) * gap + 6;
}

function drawTable(doc, title, subtitle, columns, rows, options = {}) {
  const startX = doc.page.margins.left;
  const tableWidth = getContentWidth(doc);
  const minHeaderHeight = options.headerHeight || 24;
  const minRowHeight = options.rowHeight || 24;
  const maxRowHeight = options.maxRowHeight || 74;
  const cellPaddingX = 8;
  const cellPaddingY = 7;
  const headerFontSize = options.headerFontSize || 8.5;
  const bodyFontSize = options.bodyFontSize || 8.5;
  const repeatTitle = options.repeatTitle !== false;
  const columnWidths = columns.map((column) => Math.floor(tableWidth * column.widthRatio));
  const totalWidth = columnWidths.reduce((sum, width) => sum + width, 0);
  columnWidths[columnWidths.length - 1] += tableWidth - totalWidth;

  function getTextWidth(index) {
    return Math.max(18, columnWidths[index] - cellPaddingX * 2);
  }

  function measureTextHeight(text, index, fontName, fontSize, align = 'left') {
    doc.font(fontName).fontSize(fontSize);
    return doc.heightOfString(String(text ?? ''), {
      width: getTextWidth(index),
      align
    });
  }

  function measureHeaderHeight() {
    const contentHeight = Math.max(...columns.map((column, index) => (
      measureTextHeight(column.label, index, 'Helvetica-Bold', headerFontSize, column.align || 'left')
    )));
    return Math.max(minHeaderHeight, Math.ceil(contentHeight + cellPaddingY * 2));
  }

  function measureRowHeight(row) {
    const contentHeight = Math.max(...columns.map((column, index) => (
      measureTextHeight(row[column.key], index, 'Helvetica', bodyFontSize, column.align || 'left')
    )));
    return Math.min(maxRowHeight, Math.max(minRowHeight, Math.ceil(contentHeight + cellPaddingY * 2)));
  }

  function renderTitle() {
    if (!repeatTitle) {
      return;
    }
    drawSectionHeading(doc, title, subtitle);
  }

  function renderHeader() {
    const headerHeight = measureHeaderHeight();
    ensurePageSpace(doc, headerHeight + minRowHeight);
    const headerY = doc.y;

    doc.save();
    doc.roundedRect(startX, headerY, tableWidth, headerHeight, 8).fill(COLORS.softAlt);
    doc.restore();

    let cursorX = startX;
    columns.forEach((column, index) => {
      doc.font('Helvetica-Bold').fontSize(headerFontSize).fillColor(COLORS.ink).text(column.label, cursorX + cellPaddingX, headerY + cellPaddingY, {
        width: getTextWidth(index),
        height: headerHeight - cellPaddingY * 2,
        align: column.align || 'left'
      });
      cursorX += columnWidths[index];
    });

    doc.y = headerY + headerHeight + 4;
  }

  function renderRow(row) {
    const rowHeight = measureRowHeight(row);
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
      doc.font('Helvetica').fontSize(bodyFontSize).fillColor(COLORS.body).text(String(row[column.key] ?? ''), cursorX + cellPaddingX, rowY + cellPaddingY, {
        width: getTextWidth(index),
        height: rowHeight - cellPaddingY * 2,
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
    const rowHeight = measureRowHeight(row);
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

function drawTeamReasonCoverage(doc, teamRows) {
  doc.addPage();
  doc.y = doc.page.margins.top;
  drawTable(
    doc,
    'Team reason coverage',
    'Top distress reasons handled by each rescue team in the selected reporting window.',
    [
      { key: 'team', label: 'Team', widthRatio: 0.26 },
      { key: 'agency', label: 'Agency', widthRatio: 0.16 },
      { key: 'deployments', label: 'Deployments', widthRatio: 0.14, align: 'right' },
      { key: 'topReasons', label: 'Top reasons', widthRatio: 0.44 }
    ],
    teamRows.length
      ? teamRows.map((team) => ({
          team: team.teamName,
          agency: team.teamAgencyLabel,
          deployments: String(team.deploymentTotal),
          topReasons: team.topReasonSummary
        }))
      : [{
          team: 'No team deployments in selected range',
          agency: '-',
          deployments: '-',
          topReasons: '-'
        }],
    { rowHeight: 28 }
  );
}

function drawRecentTeamActivity(doc, rows) {
  doc.addPage();
  doc.y = doc.page.margins.top;
  drawTable(
    doc,
    'Recent team activity',
    'Latest deployment-linked team activity in the selected reporting window.',
    [
      { key: 'deploymentCode', label: 'Deployment', widthRatio: 0.14 },
      { key: 'team', label: 'Team', widthRatio: 0.2 },
      { key: 'leader', label: 'Leader', widthRatio: 0.18 },
      { key: 'source', label: 'Source', widthRatio: 0.1 },
      { key: 'reason', label: 'Reason', widthRatio: 0.16 },
      { key: 'status', label: 'Status', widthRatio: 0.1 },
      { key: 'deployedAt', label: 'Deployed', widthRatio: 0.12 }
    ],
    rows.length
      ? rows.map((row) => ({
          deploymentCode: row.deploymentCode,
          team: row.teamName,
          leader: row.leaderName,
          source: row.sourceLabel,
          reason: row.reasonLabel,
          status: row.statusLabel,
          deployedAt: formatAbsoluteDate(row.deployedAt || row.reportedAt)
        }))
      : [{
          deploymentCode: 'No activity',
          team: '-',
          leader: '-',
          source: '-',
          reason: '-',
          status: '-',
          deployedAt: '-'
        }],
    { rowHeight: 26 }
  );
}

function drawTeamRosterSnapshot(doc, rows) {
  doc.addPage();
  doc.y = doc.page.margins.top;
  drawTable(
    doc,
    'Team roster snapshot',
    'Current team composition and responder availability at export time.',
    [
      { key: 'team', label: 'Team', widthRatio: 0.24 },
      { key: 'agency', label: 'Agency', widthRatio: 0.16 },
      { key: 'leader', label: 'Leader', widthRatio: 0.22 },
      { key: 'members', label: 'Members', widthRatio: 0.09, align: 'right' },
      { key: 'activeMembers', label: 'Active', widthRatio: 0.09, align: 'right' },
      { key: 'dispatched', label: 'Dispatched', widthRatio: 0.1, align: 'right' },
      { key: 'status', label: 'Status', widthRatio: 0.1 }
    ],
    rows.length
      ? rows.map((row) => ({
          team: row.teamName,
          agency: row.teamAgencyLabel,
          leader: row.leaderName,
          members: String(row.memberCount),
          activeMembers: String(row.activeMemberCount),
          dispatched: String(row.dispatchedMemberCount),
          status: row.teamStatusLabel
        }))
      : [{
          team: 'No teams available',
          agency: '-',
          leader: '-',
          members: '-',
          activeMembers: '-',
          dispatched: '-',
          status: '-'
        }],
    { rowHeight: 26 }
  );
}

async function buildRescueTeamActivityPdf(payload) {
  const PDFDocument = getPdfDocumentConstructor();

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 40
    });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    drawHeader(doc, payload);
    drawFilterChips(doc, payload);
    drawDivider(doc);

    const teamRows = payload.summary.teamRows || [];
    const rosterRows = payload.summary.rosterRows || [];
    const overview = payload.summary.overview || {};

    drawMetricCards(doc, 'Report overview', 'Deployment-focused totals for the selected reporting window.', [
      {
        label: 'Teams in report',
        value: String(overview.teamCount || 0),
        note: 'Teams with deployment activity in range'
      },
      {
        label: 'Total deployments',
        value: String(overview.totalDeployments || 0),
        note: 'Deployment records included in this export'
      },
      {
        label: 'Active deployments',
        value: String(overview.activeDeployments || 0),
        note: 'Currently deployed at export time'
      },
      {
        label: 'Closed deployments',
        value: String(overview.closedDeployments || 0),
        note: 'Canceled or accomplished deployments'
      }
    ], 4);

    if (payload.sectionIds.includes('team-deployment-totals')) {
      startTablePage(doc);
      drawTable(
        doc,
        'Team deployment totals',
        'Deployment workload and outcome counts by rescue team.',
        [
          { key: 'team', label: 'Team', widthRatio: 0.24 },
          { key: 'agency', label: 'Agency', widthRatio: 0.16 },
          { key: 'leader', label: 'Leader', widthRatio: 0.2 },
          { key: 'total', label: 'Total', widthRatio: 0.1, align: 'right' },
          { key: 'active', label: 'Active', widthRatio: 0.1, align: 'right' },
          { key: 'canceled', label: 'Canceled', widthRatio: 0.1, align: 'right' },
          { key: 'accomplished', label: 'Accomplished', widthRatio: 0.1, align: 'right' }
        ],
        teamRows.length
          ? teamRows.map((team) => ({
              team: team.teamName,
              agency: team.teamAgencyLabel,
              leader: team.leaderName,
              total: String(team.deploymentTotal),
              active: String(team.activeDeploymentCount),
              canceled: String(team.canceledDeploymentCount),
              accomplished: String(team.accomplishedDeploymentCount)
            }))
          : [{
              team: 'No team deployments in selected range',
              agency: '-',
              leader: '-',
              total: '-',
              active: '-',
              canceled: '-',
              accomplished: '-'
            }],
        { rowHeight: 26 }
      );
    }

    if (payload.sectionIds.includes('team-response-performance')) {
      startTablePage(doc);
      drawTable(
        doc,
        'Team response performance',
        'Response and deployment duration metrics by rescue team.',
        [
          { key: 'team', label: 'Team', widthRatio: 0.24 },
          { key: 'agency', label: 'Agency', widthRatio: 0.16 },
          { key: 'avgResponse', label: 'Avg response', widthRatio: 0.15 },
          { key: 'fastest', label: 'Fastest', widthRatio: 0.15 },
          { key: 'slowest', label: 'Slowest', widthRatio: 0.15 },
          { key: 'avgDuration', label: 'Avg duration', widthRatio: 0.15 }
        ],
        teamRows.length
          ? teamRows.map((team) => ({
              team: team.teamName,
              agency: team.teamAgencyLabel,
              avgResponse: formatDuration(team.averageResponseSeconds),
              fastest: formatDuration(team.fastestResponseSeconds),
              slowest: formatDuration(team.slowestResponseSeconds),
              avgDuration: formatDuration(team.averageDeploymentDurationSeconds)
            }))
          : [{
              team: 'No response data in selected range',
              agency: '-',
              avgResponse: '-',
              fastest: '-',
              slowest: '-',
              avgDuration: '-'
            }],
        { rowHeight: 26 }
      );
    }

    if (payload.sectionIds.includes('team-source-coverage')) {
      startTablePage(doc);
      drawTable(
        doc,
        'Team source coverage',
        'Mesh and online deployment mix per rescue team.',
        [
          { key: 'team', label: 'Team', widthRatio: 0.3 },
          { key: 'agency', label: 'Agency', widthRatio: 0.2 },
          { key: 'mesh', label: 'Mesh', widthRatio: 0.16, align: 'right' },
          { key: 'online', label: 'Online', widthRatio: 0.16, align: 'right' },
          { key: 'total', label: 'Total', widthRatio: 0.18, align: 'right' }
        ],
        teamRows.length
          ? teamRows.map((team) => ({
              team: team.teamName,
              agency: team.teamAgencyLabel,
              mesh: String(team.meshDeploymentCount),
              online: String(team.onlineDeploymentCount),
              total: String(team.deploymentTotal)
            }))
          : [{
              team: 'No source activity in selected range',
              agency: '-',
              mesh: '-',
              online: '-',
              total: '-'
            }],
        { rowHeight: 26 }
      );
    }

    if (payload.sectionIds.includes('team-reason-coverage')) {
      drawTeamReasonCoverage(doc, teamRows);
    }

    if (payload.sectionIds.includes('recent-team-activity')) {
      drawRecentTeamActivity(doc, payload.summary.recentActivity || []);
    }

    if (payload.sectionIds.includes('team-roster-snapshot')) {
      drawTeamRosterSnapshot(doc, rosterRows);
    }

    doc.end();
  });
}

module.exports = {
  buildRescueTeamActivityPdf
};
