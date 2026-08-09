const nodemailer = require('nodemailer');
const config = require('../config/env');

const transporter = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  secure: config.smtp.secure,
  auth: {
    user: config.smtp.user,
    pass: config.smtp.pass
  }
});

function sender() {
  return `"${config.smtp.fromName}" <${config.smtp.fromEmail}>`;
}

function plainTextMessage(lines) {
  return lines.filter(Boolean).join('\n');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatMultiline(value) {
  return escapeHtml(value).replace(/\r?\n/g, '<br>');
}

const emailThemes = {
  approved: {
    label: 'Approved',
    color: '#0f8f68',
    soft: '#e8f7f1'
  },
  declined: {
    label: 'Declined',
    color: '#d83b2a',
    soft: '#fff0ed'
  },
  suspended: {
    label: 'Suspended',
    color: '#d83b2a',
    soft: '#fff0ed'
  },
  activated: {
    label: 'Activated',
    color: '#0f8f68',
    soft: '#e8f7f1'
  },
  reset: {
    label: 'Password Reset',
    color: '#d83b2a',
    soft: '#fff0ed'
  },
  contact: {
    label: 'Contact Message',
    color: '#1f5ea8',
    soft: '#edf5ff'
  }
};

function renderInfoRows(rows) {
  const visibleRows = rows.filter((row) => row && row.value !== undefined && row.value !== null && row.value !== '');

  if (!visibleRows.length) {
    return '';
  }

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 22px 0; border-collapse: collapse;">
      ${visibleRows.map((row) => `
        <tr>
          <td style="padding: 12px 0; border-bottom: 1px solid #e6edf4; color: #65758a; font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; width: 38%;">
            ${escapeHtml(row.label)}
          </td>
          <td style="padding: 12px 0; border-bottom: 1px solid #e6edf4; color: #182536; font-size: 15px; font-weight: 700; text-align: right;">
            ${escapeHtml(row.value)}
          </td>
        </tr>
      `).join('')}
    </table>
  `;
}

function renderReasonBox(title, reason) {
  if (!reason) {
    return '';
  }

  return `
    <div style="margin: 22px 0; padding: 16px 18px; border: 1px solid #ffd3ca; border-radius: 16px; background: #fff7f5;">
      <div style="margin-bottom: 8px; color: #d83b2a; font-size: 12px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase;">
        ${escapeHtml(title)}
      </div>
      <div style="color: #26364a; font-size: 15px; line-height: 1.6;">
        ${formatMultiline(reason)}
      </div>
    </div>
  `;
}

function renderCodeBlock(code) {
  return `
    <div style="margin: 24px 0; padding: 24px; border-radius: 20px; background: #101820; text-align: center;">
      <div style="margin-bottom: 10px; color: #ffb5a8; font-size: 12px; font-weight: 800; letter-spacing: .16em; text-transform: uppercase;">
        Verification Code
      </div>
      <div style="color: #ffffff; font-size: 38px; font-weight: 900; letter-spacing: .18em; line-height: 1;">
        ${escapeHtml(code)}
      </div>
    </div>
  `;
}

function renderMessageBox(message) {
  return `
    <div style="margin: 22px 0; padding: 18px; border: 1px solid #d8e2ed; border-radius: 16px; background: #f8fbfd;">
      <div style="margin-bottom: 8px; color: #65758a; font-size: 12px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase;">
        Message
      </div>
      <div style="color: #26364a; font-size: 15px; line-height: 1.6;">
        ${formatMultiline(message)}
      </div>
    </div>
  `;
}

function renderEmailShell({ themeKey, title, eyebrow, greeting, body, children, footerNote }) {
  const theme = emailThemes[themeKey] || emailThemes.contact;

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin: 0; padding: 0; background: #eef3f7; font-family: Arial, Helvetica, sans-serif; color: #182536;">
    <div style="display: none; overflow: hidden; line-height: 1px; opacity: 0; max-height: 0; max-width: 0;">
      ${escapeHtml(eyebrow || title)}
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: #eef3f7; border-collapse: collapse;">
      <tr>
        <td align="center" style="padding: 34px 14px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width: 100%; max-width: 640px; border-collapse: collapse;">
            <tr>
              <td style="padding: 0 0 14px;">
                <div style="color: #101820; font-size: 24px; font-weight: 900; letter-spacing: -.02em;">ResQMesh</div>
                <div style="color: #65758a; font-size: 13px; font-weight: 700;">Valencia City Emergency Mesh Portal</div>
              </td>
            </tr>
            <tr>
              <td style="overflow: hidden; border: 1px solid #d8e2ed; border-radius: 24px; background: #ffffff;">
                <div style="height: 8px; background: ${theme.color};"></div>
                <div style="padding: 30px;">
                  <span style="display: inline-block; margin-bottom: 18px; padding: 8px 12px; border-radius: 999px; background: ${theme.soft}; color: ${theme.color}; font-size: 12px; font-weight: 900; letter-spacing: .08em; text-transform: uppercase;">
                    ${escapeHtml(theme.label)}
                  </span>
                  <h1 style="margin: 0 0 16px; color: #101820; font-size: 28px; line-height: 1.15;">${escapeHtml(title)}</h1>
                  ${greeting ? `<p style="margin: 0 0 16px; color: #26364a; font-size: 16px; line-height: 1.6;">${escapeHtml(greeting)}</p>` : ''}
                  ${body ? `<p style="margin: 0 0 18px; color: #43546a; font-size: 15px; line-height: 1.7;">${formatMultiline(body)}</p>` : ''}
                  ${children || ''}
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding: 18px 4px 0; color: #758397; font-size: 12px; line-height: 1.6; text-align: center;">
                ${escapeHtml(footerNote || 'This is an automated ResQMesh notification.')}
                <br>
                ResQMesh Admin
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function displayName(user) {
  return user.fullName || user.username || 'ResQMesh user';
}

function sendApprovalEmail(user) {
  const text = plainTextMessage([
    `Hello ${displayName(user)},`,
    '',
    'Your ResQMesh account registration has been approved.',
    `Registration code: ${user.userCode}`,
    '',
    'You may now use your verified ResQMesh account.',
    '',
    'ResQMesh Admin'
  ]);
  const html = renderEmailShell({
    themeKey: 'approved',
    title: 'Registration approved',
    greeting: `Hello ${displayName(user)},`,
    body: 'Your ResQMesh account registration has been approved. You may now use your verified ResQMesh account.',
    children: renderInfoRows([
      { label: 'Registration code', value: user.userCode },
      { label: 'Account status', value: 'Approved' }
    ]),
    footerNote: 'Keep your account credentials private and use ResQMesh responsibly.'
  });

  return transporter.sendMail({
    from: sender(),
    to: user.email,
    subject: 'ResQMesh registration approved',
    text,
    html
  });
}

function sendDeclineEmail(user, reason) {
  const text = plainTextMessage([
    `Hello ${displayName(user)},`,
    '',
    'Your ResQMesh account registration has been declined after review.',
    `Registration code: ${user.userCode}`,
    '',
    'Reason:',
    reason,
    '',
    'Please review the reason above before submitting another registration.',
    '',
    'ResQMesh Admin'
  ]);
  const html = renderEmailShell({
    themeKey: 'declined',
    title: 'Registration declined',
    greeting: `Hello ${displayName(user)},`,
    body: 'Your ResQMesh account registration has been declined after admin review.',
    children: [
      renderInfoRows([
        { label: 'Registration code', value: user.userCode },
        { label: 'Account status', value: 'Declined' }
      ]),
      renderReasonBox('Review reason', reason),
      '<p style="margin: 0; color: #43546a; font-size: 15px; line-height: 1.7;">Please review the reason above before submitting another registration.</p>'
    ].join(''),
    footerNote: 'If you believe this was a mistake, contact the ResQMesh admin team.'
  });

  return transporter.sendMail({
    from: sender(),
    to: user.email,
    subject: 'ResQMesh registration declined',
    text,
    html
  });
}

function sendSuspensionEmail(user, reason) {
  const text = plainTextMessage([
    `Hello ${displayName(user)},`,
    '',
    'Your ResQMesh account has been suspended after admin review.',
    `Registration code: ${user.userCode}`,
    '',
    'Reason:',
    reason,
    '',
    'Please contact the ResQMesh admin team if you need assistance with your account.',
    '',
    'ResQMesh Admin'
  ]);
  const html = renderEmailShell({
    themeKey: 'suspended',
    title: 'Account suspended',
    greeting: `Hello ${displayName(user)},`,
    body: 'Your ResQMesh account has been suspended after admin review.',
    children: [
      renderInfoRows([
        { label: 'Registration code', value: user.userCode },
        { label: 'Access status', value: 'Suspended' }
      ]),
      renderReasonBox('Suspension reason', reason),
      '<p style="margin: 0; color: #43546a; font-size: 15px; line-height: 1.7;">Please contact the ResQMesh admin team if you need assistance with your account.</p>'
    ].join(''),
    footerNote: 'Account access remains restricted until an admin reactivates it.'
  });

  return transporter.sendMail({
    from: sender(),
    to: user.email,
    subject: 'ResQMesh account suspended',
    text,
    html
  });
}

function sendReactivationEmail(user) {
  const text = plainTextMessage([
    `Hello ${displayName(user)},`,
    '',
    'Your ResQMesh account has been activated again.',
    `Registration code: ${user.userCode}`,
    '',
    'You may now use your ResQMesh account.',
    '',
    'ResQMesh Admin'
  ]);
  const html = renderEmailShell({
    themeKey: 'activated',
    title: 'Account activated',
    greeting: `Hello ${displayName(user)},`,
    body: 'Your ResQMesh account has been activated again. You may now use your ResQMesh account.',
    children: renderInfoRows([
      { label: 'Registration code', value: user.userCode },
      { label: 'Access status', value: 'Active' }
    ]),
    footerNote: 'Keep your account credentials private and use ResQMesh responsibly.'
  });

  return transporter.sendMail({
    from: sender(),
    to: user.email,
    subject: 'ResQMesh account activated',
    text,
    html
  });
}

function sendCivilianPasswordResetCodeEmail(user, code) {
  const text = plainTextMessage([
    `Hello ${displayName(user)},`,
    '',
    'Use this code to reset your ResQMesh civilian password:',
    code,
    '',
    'This code expires in 10 minutes. If you did not request this, ignore this email.',
    '',
    'ResQMesh Admin'
  ]);
  const html = renderEmailShell({
    themeKey: 'reset',
    title: 'Password reset code',
    greeting: `Hello ${displayName(user)},`,
    body: 'Use the verification code below to reset your ResQMesh civilian password.',
    children: [
      renderCodeBlock(code),
      '<p style="margin: 0; color: #43546a; font-size: 15px; line-height: 1.7;">This code expires in 10 minutes. If you did not request this password reset, ignore this email.</p>'
    ].join(''),
    footerNote: 'Never share this reset code with anyone.'
  });

  return transporter.sendMail({
    from: sender(),
    to: user.email,
    subject: 'ResQMesh password reset code',
    text,
    html
  });
}

function sendContactEmail(contact) {
  const subjectLabel = contact.subjectLabel || 'General inquiry';
  const submittedAt = contact.submittedAt || new Date().toISOString();

  const text = plainTextMessage([
    'New ResQMesh public contact message',
    '',
    `Name: ${contact.name}`,
    `Email: ${contact.email}`,
    `Subject: ${subjectLabel}`,
    `Submitted at: ${submittedAt}`,
    `IP address: ${contact.ipAddress || 'Unavailable'}`,
    '',
    'Message:',
    contact.message,
    '',
    'Reply directly to this email to respond to the sender.'
  ]);
  const html = renderEmailShell({
    themeKey: 'contact',
    title: 'New contact message',
    body: 'A new message was submitted through the ResQMesh public contact form.',
    children: [
      renderInfoRows([
        { label: 'Name', value: contact.name },
        { label: 'Email', value: contact.email },
        { label: 'Subject', value: subjectLabel },
        { label: 'Submitted at', value: submittedAt },
        { label: 'IP address', value: contact.ipAddress || 'Unavailable' }
      ]),
      renderMessageBox(contact.message),
      '<p style="margin: 0; color: #43546a; font-size: 15px; line-height: 1.7;">Reply directly to this email to respond to the sender.</p>'
    ].join(''),
    footerNote: 'This message was generated from the ResQMesh website contact form.'
  });

  return transporter.sendMail({
    from: sender(),
    to: config.smtp.fromEmail,
    replyTo: contact.email,
    subject: `ResQMesh contact: ${subjectLabel}`,
    text,
    html
  });
}

module.exports = {
  sendApprovalEmail,
  sendDeclineEmail,
  sendSuspensionEmail,
  sendReactivationEmail,
  sendCivilianPasswordResetCodeEmail,
  sendContactEmail
};
