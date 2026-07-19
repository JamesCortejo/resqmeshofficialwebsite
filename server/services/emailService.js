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

function sendApprovalEmail(user) {
  const text = plainTextMessage([
    `Hello ${user.fullName || user.username},`,
    '',
    'Your ResQMesh account registration has been approved.',
    `Registration code: ${user.userCode}`,
    '',
    'You may now use your verified ResQMesh account.',
    '',
    'ResQMesh Admin'
  ]);

  return transporter.sendMail({
    from: sender(),
    to: user.email,
    subject: 'ResQMesh registration approved',
    text
  });
}

function sendDeclineEmail(user, reason) {
  const text = plainTextMessage([
    `Hello ${user.fullName || user.username},`,
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

  return transporter.sendMail({
    from: sender(),
    to: user.email,
    subject: 'ResQMesh registration declined',
    text
  });
}

function sendSuspensionEmail(user, reason) {
  const text = plainTextMessage([
    `Hello ${user.fullName || user.username},`,
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

  return transporter.sendMail({
    from: sender(),
    to: user.email,
    subject: 'ResQMesh account suspended',
    text
  });
}

function sendReactivationEmail(user) {
  const text = plainTextMessage([
    `Hello ${user.fullName || user.username},`,
    '',
    'Your ResQMesh account has been activated again.',
    `Registration code: ${user.userCode}`,
    '',
    'You may now use your ResQMesh account.',
    '',
    'ResQMesh Admin'
  ]);

  return transporter.sendMail({
    from: sender(),
    to: user.email,
    subject: 'ResQMesh account activated',
    text
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

  return transporter.sendMail({
    from: sender(),
    to: config.smtp.fromEmail,
    replyTo: contact.email,
    subject: `ResQMesh contact: ${subjectLabel}`,
    text
  });
}

module.exports = {
  sendApprovalEmail,
  sendDeclineEmail,
  sendSuspensionEmail,
  sendReactivationEmail,
  sendContactEmail
};
