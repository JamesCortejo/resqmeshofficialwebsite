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

function formatCompactDate(value) {
  if (!value) {
    return 'Not available';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }

  const month = parsed.toLocaleString('en-US', {
    month: 'short',
    timeZone: 'UTC'
  });
  const day = parsed.toLocaleString('en-US', {
    day: '2-digit',
    timeZone: 'UTC'
  });
  const year = parsed.toLocaleString('en-US', {
    year: 'numeric',
    timeZone: 'UTC'
  });

  return `${month} ${day} ${year}`;
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
    'Account governance, access actions, and successful cloud session activity across the selected reporting window.',
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
    { label: 'Account scope', value: payload.filters.sourceScopeLabel },
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

function drawMetricCards(doc, title, subtitle, items, columns = 3) {
  if (!items.length) {
    return;
  }

  const width = getContentWidth(doc);
  const gap = 12;
  const cardHeight = 86;
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
    doc.font('Helvetica-Bold').fontSize(18).fillColor(COLORS.ink).text(item.value, x + 14, y + 32, {
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

function drawRegistrationIntake(doc, summary) {
  drawMetricCards(doc, 'Registration intake', 'New cloud registrations and rescuer profiles created in the selected window.', [
    {
      label: 'Civilian registrations',
      value: String(summary.overview.civilianRegistrations || 0),
      note: 'New civilian accounts recorded'
    },
    {
      label: 'Rescuer profiles created',
      value: String(summary.overview.rescuerProfilesCreated || 0),
      note: 'New rescuer accounts recorded'
    },
    {
      label: 'Audit events',
      value: String(summary.overview.auditEventCount || 0),
      note: 'Lifecycle events in the report window'
    }
  ]);
}

function drawAccountStatusBreakdown(doc, summary, scope) {
  const cards = [];

  if (scope !== 'rescuer') {
    cards.push(
      { label: 'Pending civilians', value: String(summary.civilianStatus.pending || 0), note: 'Awaiting review' },
      { label: 'Approved civilians', value: String(summary.civilianStatus.approved || 0), note: 'Cloud-eligible civilian accounts' },
      { label: 'Declined civilians', value: String(summary.civilianStatus.declined || 0), note: 'Rejected registrations kept on record' },
      { label: 'Suspended civilians', value: String(summary.civilianStatus.suspended || 0), note: 'Currently blocked from access' }
    );
  }

  if (scope !== 'civilian') {
    cards.push(
      { label: 'Active rescuer access', value: String(summary.rescuerStatus.activeAccess || 0), note: 'Rescuer accounts with active access' },
      { label: 'Archived rescuers', value: String(summary.rescuerStatus.archivedAccess || 0), note: 'Archived rescuer accounts' },
      { label: 'Available rescuers', value: String(summary.rescuerStatus.available || 0), note: 'Current operational status' },
      { label: 'Dispatched rescuers', value: String(summary.rescuerStatus.dispatched || 0), note: 'Currently deployed responders' }
    );
  }

  drawMetricCards(doc, 'Account status breakdown', 'Current account state snapshot at export time.', cards, 4);
}

function drawAdminAccessActions(doc, summary) {
  drawMetricCards(doc, 'Admin access actions', 'Governance actions recorded in the selected reporting window.', [
    { label: 'Approvals', value: String(summary.adminActions.approved || 0), note: 'Pending registrations approved' },
    { label: 'Declines', value: String(summary.adminActions.declined || 0), note: 'Registrations declined' },
    { label: 'Suspensions', value: String(summary.adminActions.suspended || 0), note: 'Civilian accounts suspended' },
    { label: 'Reactivations', value: String(summary.adminActions.reactivated || 0), note: 'Suspended civilians restored' },
    { label: 'Rescuer created', value: String(summary.adminActions.rescuerCreated || 0), note: 'New rescuer accounts added' },
    { label: 'Rescuer archived', value: String(summary.adminActions.rescuerArchived || 0), note: 'Responder access archived' },
    { label: 'Access activated', value: String(summary.adminActions.accessStatusChanged || 0), note: 'Archived responder access restored' },
    { label: 'Password resets', value: String(summary.adminActions.passwordChanged || 0), note: 'Admin-initiated rescuer resets' }
  ], 4);
}

function drawLoginSessionActivity(doc, summary, scope) {
  const cards = [];

  if (scope !== 'rescuer') {
    cards.push(
      { label: 'Civilian logins', value: String(summary.sessions.civilianIssued || 0), note: 'Successful civilian mobile sessions issued' },
      { label: 'Civilian revokes', value: String(summary.sessions.civilianRevoked || 0), note: 'Civilian mobile sessions revoked' }
    );
  }

  if (scope !== 'civilian') {
    cards.push(
      { label: 'Rescuer logins', value: String(summary.sessions.rescuerIssued || 0), note: 'Successful rescuer mobile sessions issued' },
      { label: 'Rescuer revokes', value: String(summary.sessions.rescuerRevoked || 0), note: 'Rescuer mobile sessions revoked' }
    );
  }

  cards.push({
    label: 'Live mobile sessions',
    value: String(summary.sessions.liveMobileSessions || 0),
    note: 'Unrevoked mobile sessions at export time'
  });

  drawMetricCards(doc, 'Login session activity', 'Successful access-session activity derived from cloud auth sessions.', cards, 3);
}

function drawRescuerRoster(doc, rows) {
  doc.addPage();
  doc.y = doc.page.margins.top;
  drawTable(
    doc,
    'Rescuer access roster',
    'Current rescuer access, operational status, and team assignment snapshot.',
    [
      { key: 'rescuerCode', label: 'Code', widthRatio: 0.11 },
      { key: 'fullName', label: 'Responder', widthRatio: 0.22 },
      { key: 'agency', label: 'Agency', widthRatio: 0.15 },
      { key: 'accessStatus', label: 'Access', widthRatio: 0.11 },
      { key: 'operationalStatus', label: 'Status', widthRatio: 0.12 },
      { key: 'teamName', label: 'Team', widthRatio: 0.15 },
      { key: 'createdAt', label: 'Created', widthRatio: 0.14 }
    ],
    rows.length
      ? rows.map((row) => ({
          rescuerCode: row.rescuerCode,
          fullName: row.fullName,
          agency: row.agency,
          accessStatus: row.accessStatus,
          operationalStatus: row.operationalStatus,
          teamName: row.teamName,
          createdAt: formatCompactDate(row.createdAt)
        }))
      : [{
          rescuerCode: 'No rescuer rows',
          fullName: '-',
          agency: '-',
          accessStatus: '-',
          operationalStatus: '-',
          teamName: '-',
          createdAt: '-'
        }],
    { rowHeight: 26 }
  );
}

function drawRecentAuditEvents(doc, rows) {
  doc.addPage();
  doc.y = doc.page.margins.top;
  drawTable(
    doc,
    'Recent access events',
    'Latest admin account-governance actions captured in the selected reporting window.',
    [
      { key: 'occurredAt', label: 'Time', widthRatio: 0.18 },
      { key: 'actor', label: 'Actor', widthRatio: 0.12 },
      { key: 'subjectType', label: 'Type', widthRatio: 0.1 },
      { key: 'subject', label: 'Subject', widthRatio: 0.22 },
      { key: 'action', label: 'Action', widthRatio: 0.18 },
      { key: 'reason', label: 'Reason', widthRatio: 0.2 }
    ],
    rows.length
      ? rows.map((row) => ({
          occurredAt: formatAbsoluteDate(row.occurredAt),
          actor: row.actorAdminCode,
          subjectType: row.subjectTypeLabel,
          subject: `${row.subjectCode} - ${row.subjectName}`,
          action: row.actionLabel,
          reason: row.reasonText || '-'
        }))
      : [{
          occurredAt: 'No recent events',
          actor: '-',
          subjectType: '-',
          subject: '-',
          action: '-',
          reason: '-'
        }],
    { rowHeight: 28 }
  );
}

async function buildAccountsAccessAuditPdf(payload) {
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

    const sectionIds = new Set(payload.sectionIds || []);
    const summary = payload.summary || {};
    const scope = payload.filters?.sourceScope || 'all';

    if (sectionIds.has('registration-intake')) {
      drawRegistrationIntake(doc, summary);
    }

    if (sectionIds.has('account-status-breakdown')) {
      drawAccountStatusBreakdown(doc, summary, scope);
    }

    if (sectionIds.has('admin-access-actions')) {
      drawAdminAccessActions(doc, summary);
    }

    if (sectionIds.has('login-session-activity')) {
      drawLoginSessionActivity(doc, summary, scope);
    }

    if (sectionIds.has('rescuer-access-roster')) {
      drawRescuerRoster(doc, summary.rosterRows || []);
    }

    if (sectionIds.has('recent-access-events')) {
      drawRecentAuditEvents(doc, summary.recentAuditRows || []);
    }

    doc.end();
  });
}

module.exports = {
  buildAccountsAccessAuditPdf
};
