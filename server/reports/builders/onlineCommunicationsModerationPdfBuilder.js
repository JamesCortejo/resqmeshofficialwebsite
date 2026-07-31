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
  const x = doc.page.margins.left;
  const y = doc.y;

  doc.save();
  doc.roundedRect(x, y, width, 94, 16).fillAndStroke(COLORS.soft, COLORS.border);
  doc.restore();

  doc.font('Helvetica-Bold').fontSize(22).fillColor(COLORS.ink).text(payload.reportName, x + 20, y + 18);
  doc.font('Helvetica').fontSize(10.5).fillColor(COLORS.muted).text(
    'Cloud communications export covering room activity, unread load, sender mix, and moderation events.',
    x + 20,
    y + 48,
    { width: width - 40 }
  );

  doc.y = y + 112;
}

function drawFilterChips(doc, payload) {
  const width = getContentWidth(doc);
  const startX = doc.page.margins.left;
  const startY = doc.y;
  const chips = [
    { label: 'Generated', value: formatAbsoluteDate(payload.generatedAt) },
    { label: 'Date range', value: payload.filters.dateRangeLabel },
    { label: 'Chat scope', value: payload.filters.sourceScopeLabel },
    { label: 'Export format', value: 'PDF' }
  ];
  const chipWidth = (width - 24) / 2;
  const chipHeight = 42;

  chips.forEach((chip, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = startX + col * (chipWidth + 12);
    const y = startY + row * 52;

    doc.save();
    doc.roundedRect(x, y, chipWidth, chipHeight, 10).fillAndStroke(COLORS.white, COLORS.border);
    doc.restore();

    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLORS.muted).text(chip.label.toUpperCase(), x + 14, y + 10);
    doc.font('Helvetica').fontSize(10.5).fillColor(COLORS.ink).text(chip.value, x + 14, y + 22, {
      width: chipWidth - 28,
      ellipsis: true
    });
  });

  doc.y = startY + 118;
}

function drawDivider(doc) {
  const width = getContentWidth(doc);
  const x = doc.page.margins.left;
  doc.save();
  doc.strokeColor(COLORS.border).lineWidth(1)
    .moveTo(x, doc.y)
    .lineTo(x + width, doc.y)
    .stroke();
  doc.restore();
  doc.moveDown(0.8);
}

function drawSectionHeading(doc, title, subtitle) {
  ensurePageSpace(doc, subtitle ? 58 : 34);
  const x = doc.page.margins.left;
  const width = getContentWidth(doc);
  const y = doc.y + 4;

  doc.font('Helvetica-Bold').fontSize(16).fillColor(COLORS.ink).text(title, x, y, { width });
  if (subtitle) {
    doc.font('Helvetica').fontSize(9.5).fillColor(COLORS.muted).text(subtitle, x, y + 22, { width });
    doc.y = y + 42;
    return;
  }

  doc.y = y + 24;
}

function drawMetricCards(doc, title, subtitle, items, columns = 3) {
  if (!items.length) {
    return;
  }

  const width = getContentWidth(doc);
  const startX = doc.page.margins.left;
  const gap = 12;
  const cardHeight = 84;
  const rows = Math.ceil(items.length / columns);
  const cardWidth = (width - gap * (columns - 1)) / columns;
  const estimatedHeight = 56 + rows * cardHeight + Math.max(0, rows - 1) * gap;

  ensurePageSpace(doc, estimatedHeight);
  drawSectionHeading(doc, title, subtitle);
  const startY = doc.y;

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
    doc.font('Helvetica-Bold').fontSize(18).fillColor(COLORS.ink).text(String(item.value ?? '0'), x + 14, y + 30, {
      width: cardWidth - 28
    });
    if (item.note) {
      doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.muted).text(item.note, x + 14, y + 54, {
        width: cardWidth - 28
      });
    }
  });

  doc.y = startY + rows * cardHeight + Math.max(0, rows - 1) * gap + 4;
}

function drawTable(doc, title, subtitle, columns, rows, options = {}) {
  const startX = doc.page.margins.left;
  const tableWidth = getContentWidth(doc);
  const headerHeight = options.headerHeight || 24;
  const rowHeight = options.rowHeight || 24;
  const repeatTitle = options.repeatTitle !== false;
  const widths = columns.map((column) => Math.floor(tableWidth * column.widthRatio));
  const totalWidth = widths.reduce((sum, width) => sum + width, 0);
  widths[widths.length - 1] += tableWidth - totalWidth;

  function renderTitle() {
    if (repeatTitle) {
      drawSectionHeading(doc, title, subtitle);
    }
  }

  function renderHeader() {
    ensurePageSpace(doc, headerHeight + rowHeight);
    const y = doc.y;

    doc.save();
    doc.roundedRect(startX, y, tableWidth, headerHeight, 8).fill(COLORS.softAlt);
    doc.restore();

    let cursor = startX;
    columns.forEach((column, index) => {
      doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.ink).text(column.label, cursor + 8, y + 8, {
        width: widths[index] - 16,
        align: column.align || 'left',
        ellipsis: true
      });
      cursor += widths[index];
    });

    doc.y = y + headerHeight + 4;
  }

  function renderRow(row) {
    ensurePageSpace(doc, rowHeight + 4);
    const y = doc.y;

    doc.save();
    doc.roundedRect(startX, y, tableWidth, rowHeight, 6).fill(COLORS.white);
    doc.strokeColor(COLORS.border).lineWidth(0.7)
      .moveTo(startX, y + rowHeight)
      .lineTo(startX + tableWidth, y + rowHeight)
      .stroke();
    doc.restore();

    let cursor = startX;
    columns.forEach((column, index) => {
      doc.font('Helvetica').fontSize(9).fillColor(COLORS.body).text(String(row[column.key] ?? ''), cursor + 8, y + 7, {
        width: widths[index] - 16,
        align: column.align || 'left',
        ellipsis: true
      });
      cursor += widths[index];
    });

    doc.y = y + rowHeight + 2;
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

function drawDepartmentChatVolume(doc, summary) {
  drawTable(
    doc,
    'Department chat volume',
    'Per-room conversation and sender mix for department chats in the selected window.',
    [
      { key: 'department', label: 'Department', widthRatio: 0.24 },
      { key: 'openConversations', label: 'Open', widthRatio: 0.1, align: 'right' },
      { key: 'activeConversations', label: 'Active', widthRatio: 0.1, align: 'right' },
      { key: 'messages', label: 'Messages', widthRatio: 0.1, align: 'right' },
      { key: 'civilian', label: 'Civilian', widthRatio: 0.1, align: 'right' },
      { key: 'admin', label: 'Admin', widthRatio: 0.08, align: 'right' },
      { key: 'rescuer', label: 'Rescuer', widthRatio: 0.09, align: 'right' },
      { key: 'latest', label: 'Latest', widthRatio: 0.19 }
    ],
    summary.departmentRows.length
      ? summary.departmentRows.map((row) => ({
          department: row.name,
          openConversations: row.openConversationCount,
          activeConversations: row.activeConversationCount,
          messages: row.messageCount,
          civilian: row.civilianMessageCount,
          admin: row.adminMessageCount,
          rescuer: row.rescuerMessageCount,
          latest: formatAbsoluteDate(row.latestMessageAt)
        }))
      : [{
          department: 'No department chat activity',
          openConversations: '-',
          activeConversations: '-',
          messages: '-',
          civilian: '-',
          admin: '-',
          rescuer: '-',
          latest: '-'
        }],
    { rowHeight: 28 }
  );
}

function drawGlobalAnnouncementActivity(doc, summary) {
  drawMetricCards(doc, 'Global announcement activity', 'Global broadcast volume and current read snapshot.', [
    { label: 'Messages', value: summary.globalActivity.messageCount, note: 'Global announcement posts in range' },
    { label: 'Admin posts', value: summary.globalActivity.adminMessageCount, note: 'Admin-origin global messages' },
    { label: 'System posts', value: summary.globalActivity.systemMessageCount, note: 'System-origin global messages' },
    { label: 'Civilian readers', value: summary.globalActivity.civilianReaderCount, note: 'Read-state rows for civilians' },
    { label: 'Rescuer readers', value: summary.globalActivity.rescuerReaderCount, note: 'Read-state rows for rescuers' },
    { label: 'Latest post', value: formatAbsoluteDate(summary.globalActivity.latestMessageAt), note: 'Newest global message in range' }
  ], 3);
}

function drawConversationLoad(doc, summary) {
  drawMetricCards(doc, 'Conversation load', 'Open thread totals and unread snapshot at export time.', [
    { label: 'Open conversations', value: summary.conversationLoad.openConversationCount, note: 'Currently open department threads' },
    { label: 'Active conversations', value: summary.conversationLoad.activeConversationCount, note: 'Threads with messages in range' },
    { label: 'Admin unread dept', value: summary.conversationLoad.departmentUnread.admin, note: 'Unread department messages for admin readers' },
    { label: 'Civilian unread dept', value: summary.conversationLoad.departmentUnread.civilian, note: 'Unread department messages for civilians' },
    { label: 'Rescuer unread dept', value: summary.conversationLoad.departmentUnread.rescuer, note: 'Unread department messages for rescuers' },
    { label: 'Admin unread global', value: summary.conversationLoad.globalUnread.admin, note: 'Unread global messages for admin readers' },
    { label: 'Civilian unread global', value: summary.conversationLoad.globalUnread.civilian, note: 'Unread global messages for civilians' },
    { label: 'Rescuer unread global', value: summary.conversationLoad.globalUnread.rescuer, note: 'Unread global messages for rescuers' }
  ], 4);
}

function drawSenderActivityBreakdown(doc, summary) {
  drawMetricCards(doc, 'Sender activity breakdown', 'Message totals by sender type plus top rooms and conversations.', [
    { label: 'Civilian dept', value: summary.senderActivity.departmentSenderTotals.civilian || 0, note: 'Department messages from civilians' },
    { label: 'Admin dept', value: summary.senderActivity.departmentSenderTotals.admin || 0, note: 'Department replies from admins' },
    { label: 'Rescuer dept', value: summary.senderActivity.departmentSenderTotals.rescuer || 0, note: 'Department replies from rescuers' },
    { label: 'Admin global', value: summary.senderActivity.globalSenderTotals.admin || 0, note: 'Global announcement posts by admins' },
    { label: 'System messages', value: (summary.senderActivity.departmentSenderTotals.system || 0) + (summary.senderActivity.globalSenderTotals.system || 0), note: 'System-origin chat records' }
  ], 3);

  startTablePage(doc);
  drawTable(
    doc,
    'Top active departments',
    'Rooms with the highest message volume in the selected range.',
    [
      { key: 'department', label: 'Department', widthRatio: 0.62 },
      { key: 'messages', label: 'Messages', widthRatio: 0.18, align: 'right' },
      { key: 'rank', label: 'Rank', widthRatio: 0.2, align: 'right' }
    ],
    summary.senderActivity.topDepartmentRows.length
      ? summary.senderActivity.topDepartmentRows.map((row, index) => ({
          department: row.name,
          messages: row.messageCount,
          rank: index + 1
        }))
      : [{
          department: 'No department message activity',
          messages: '-',
          rank: '-'
        }],
    { rowHeight: 26 }
  );

  startTablePage(doc);
  drawTable(
    doc,
    'Top civilian conversations',
    'Highest-volume department conversations in the selected window.',
    [
      { key: 'civilian', label: 'Civilian', widthRatio: 0.32 },
      { key: 'department', label: 'Department', widthRatio: 0.26 },
      { key: 'messages', label: 'Messages', widthRatio: 0.12, align: 'right' },
      { key: 'latest', label: 'Latest', widthRatio: 0.3 }
    ],
    summary.senderActivity.topConversationRows.length
      ? summary.senderActivity.topConversationRows.map((row) => ({
          civilian: `${row.civilianName} (${row.civilianCode})`,
          department: row.departmentName,
          messages: row.messageCount,
          latest: formatAbsoluteDate(row.latestMessageAt)
        }))
      : [{
          civilian: 'No active conversations',
          department: '-',
          messages: '-',
          latest: '-'
        }],
    { rowHeight: 28 }
  );
}

function drawModerationActions(doc, summary) {
  drawMetricCards(doc, 'Moderation actions', 'Persisted moderation blocks and current active timeout guards.', [
    { label: 'Profanity blocked', value: summary.moderation.profanityBlockedCount, note: 'Messages blocked for prohibited language' },
    { label: 'Links blocked', value: summary.moderation.linkBlockedCount, note: 'Messages blocked for link detection' },
    { label: 'Duplicate blocked', value: summary.moderation.duplicateBlockedCount, note: 'Rapid duplicate message blocks' },
    { label: 'Spam timeouts', value: summary.moderation.spamTimeoutCount, note: 'Timeouts triggered by burst limits' },
    { label: 'Active civilian timeout', value: summary.moderation.activeCivilianTimeoutCount, note: 'Currently timed-out civilian senders' },
    { label: 'Active rescuer timeout', value: summary.moderation.activeRescuerTimeoutCount, note: 'Currently timed-out rescuer senders' }
  ], 3);

  startTablePage(doc);
  drawTable(
    doc,
    'Moderation event breakdown',
    'Stored moderation event totals by event type and actor group.',
    [
      { key: 'event', label: 'Event', widthRatio: 0.32 },
      { key: 'reason', label: 'Reason', widthRatio: 0.22 },
      { key: 'total', label: 'Total', widthRatio: 0.12, align: 'right' },
      { key: 'civilian', label: 'Civilian', widthRatio: 0.12, align: 'right' },
      { key: 'rescuer', label: 'Rescuer', widthRatio: 0.1, align: 'right' },
      { key: 'latest', label: 'Latest', widthRatio: 0.12 }
    ],
    summary.moderation.eventRows.length
      ? summary.moderation.eventRows.map((row) => ({
          event: row.eventLabel,
          reason: row.reasonLabel,
          total: row.totalCount,
          civilian: row.civilianCount,
          rescuer: row.rescuerCount,
          latest: formatAbsoluteDate(row.latestEventAt)
        }))
      : [{
          event: 'No moderation events',
          reason: '-',
          total: '-',
          civilian: '-',
          rescuer: '-',
          latest: '-'
        }],
    { rowHeight: 28 }
  );
}

function drawRecentCommunicationEvents(doc, summary) {
  startTablePage(doc);
  drawTable(
    doc,
    'Recent communication events',
    'Combined recent department, global, and moderation activity rows for the selected scope.',
    [
      { key: 'kind', label: 'Kind', widthRatio: 0.14 },
      { key: 'room', label: 'Room', widthRatio: 0.18 },
      { key: 'sender', label: 'Sender', widthRatio: 0.2 },
      { key: 'type', label: 'Type', widthRatio: 0.12 },
      { key: 'detail', label: 'Detail', widthRatio: 0.22 },
      { key: 'time', label: 'Time', widthRatio: 0.14 }
    ],
    summary.recentEventRows.length
      ? summary.recentEventRows.map((row) => ({
          kind: row.eventKindLabel,
          room: row.roomName,
          sender: row.senderDisplay,
          type: row.senderTypeLabel,
          detail: row.preview,
          time: formatAbsoluteDate(row.eventAt)
        }))
      : [{
          kind: 'No recent events',
          room: '-',
          sender: '-',
          type: '-',
          detail: '-',
          time: '-'
        }],
    { rowHeight: 32 }
  );
}

async function buildOnlineCommunicationsModerationPdf(payload) {
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

    const sectionIds = new Set(payload.sectionIds || []);
    const summary = payload.summary || {};

    if (sectionIds.has('department-chat-volume')) {
      drawDepartmentChatVolume(doc, summary);
    }

    if (sectionIds.has('global-announcement-activity')) {
      drawGlobalAnnouncementActivity(doc, summary);
    }

    if (sectionIds.has('conversation-load')) {
      drawConversationLoad(doc, summary);
    }

    if (sectionIds.has('sender-activity-breakdown')) {
      drawSenderActivityBreakdown(doc, summary);
    }

    if (sectionIds.has('moderation-actions')) {
      drawModerationActions(doc, summary);
    }

    if (sectionIds.has('recent-communication-events')) {
      drawRecentCommunicationEvents(doc, summary);
    }

    doc.end();
  });
}

module.exports = {
  buildOnlineCommunicationsModerationPdf
};
