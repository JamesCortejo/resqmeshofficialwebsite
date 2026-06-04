const fs = require('fs/promises');
const path = require('path');
const config = require('../config/env');
const { USER_STATUSES } = require('../models/userModel');
const { decryptBuffer, decryptText, encryptText } = require('./encryptionService');
const { sendApprovalEmail, sendDeclineEmail } = require('./emailService');
const { notifyRegistrationReviewed } = require('./notificationService');
const {
  listPendingAccounts,
  getPendingAccountById,
  getAccountStatusById,
  updatePendingAccountStatus
} = require('../repositories/adminAccountsRepository');

function fullName(row) {
  return [decryptText(row.firstNameEnc), decryptText(row.middleNameEnc), decryptText(row.lastNameEnc)]
    .filter(Boolean)
    .join(' ');
}

function calculateAge(birthDate) {
  if (!birthDate) {
    return '';
  }

  const [year, month, day] = birthDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    !year ||
    !month ||
    !day ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return '';
  }

  const now = new Date();
  let age = now.getFullYear() - date.getUTCFullYear();
  const monthDiff = now.getMonth() - date.getUTCMonth();

  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < date.getUTCDate())) {
    age -= 1;
  }

  return String(age);
}

function imageMetadata(row, side) {
  const prefix = side === 'front' ? 'frontId' : 'backId';

  return {
    originalName: row[`${prefix}OriginalName`],
    sourceMimeType: row[`${prefix}MimeType`],
    originalSize: row[`${prefix}OriginalSize`],
    encryptedSize: row[`${prefix}EncryptedSize`],
    previewUrl: `/api/admin/accounts/${row.id}/id/${side}`
  };
}

function summaryResponse(row) {
  return {
    id: row.id,
    userCode: row.userCode,
    fullName: fullName(row),
    username: decryptText(row.usernameEnc),
    email: decryptText(row.emailEnc),
    phone: decryptText(row.phoneEnc),
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function detailResponse(row) {
  const birthDate = decryptText(row.birthDateEnc);

  return {
    id: row.id,
    userCode: row.userCode,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    account: {
      username: decryptText(row.usernameEnc),
      email: decryptText(row.emailEnc),
      phone: decryptText(row.phoneEnc)
    },
    personal: {
      firstName: decryptText(row.firstNameEnc),
      middleName: decryptText(row.middleNameEnc),
      lastName: decryptText(row.lastNameEnc),
      fullName: fullName(row),
      birthDate,
      age: calculateAge(birthDate),
      occupation: decryptText(row.occupationEnc)
    },
    address: {
      streetAddress: decryptText(row.streetAddressEnc),
      barangay: decryptText(row.barangayEnc)
    },
    medical: {
      bloodType: decryptText(row.bloodTypeEnc),
      medicalComplications: decryptText(row.medicalComplicationsEnc),
      allergies: decryptText(row.allergiesEnc)
    },
    identification: {
      idType: decryptText(row.idTypeEnc),
      idNumber: decryptText(row.idNumberEnc),
      frontImage: imageMetadata(row, 'front'),
      backImage: imageMetadata(row, 'back')
    }
  };
}

function reviewEmailUser(row) {
  return {
    userCode: row.userCode,
    fullName: fullName(row),
    username: decryptText(row.usernameEnc),
    email: decryptText(row.emailEnc)
  };
}

async function getPendingAccountSummaries() {
  const rows = await listPendingAccounts();
  return rows.map(summaryResponse);
}

async function getPendingAccountDetails(id) {
  const row = await getPendingAccountById(id);

  if (!row) {
    return null;
  }

  return detailResponse(row);
}

async function getPendingAccountIdImage(id, side) {
  if (!['front', 'back'].includes(side)) {
    const error = new Error('Invalid ID image side.');
    error.statusCode = 400;
    throw error;
  }

  const row = await getPendingAccountById(id);

  if (!row) {
    return null;
  }

  const relativePath = side === 'front' ? row.frontIdImagePath : row.backIdImagePath;
  const absolutePath = path.resolve(config.appRoot, relativePath);

  if (!absolutePath.startsWith(config.appRoot)) {
    const error = new Error('Invalid stored image path.');
    error.statusCode = 500;
    throw error;
  }

  const encryptedPayload = await fs.readFile(absolutePath);
  return decryptBuffer(encryptedPayload);
}

async function updateAccountReviewStatus(id, status, reason = '') {
  if (![USER_STATUSES.APPROVED, USER_STATUSES.DECLINED].includes(status)) {
    const error = new Error('Status must be approved or declined.');
    error.statusCode = 400;
    throw error;
  }

  const normalizedReason = String(reason || '').trim();

  if (status === USER_STATUSES.DECLINED && !normalizedReason) {
    const error = new Error('Decline reason is required.');
    error.statusCode = 400;
    throw error;
  }

  const pendingAccount = await getPendingAccountById(id);

  if (!pendingAccount) {
    const existing = await getAccountStatusById(id);

    if (!existing) {
      const error = new Error('Pending account not found.');
      error.statusCode = 404;
      throw error;
    }

    const error = new Error(`Account is already ${existing.status}.`);
    error.statusCode = 409;
    throw error;
  }

  const result = await updatePendingAccountStatus(
    id,
    status,
    status === USER_STATUSES.DECLINED ? encryptText(normalizedReason) : null
  );

  if (result.changes > 0) {
    const account = await getAccountStatusById(id);
    const emailUser = reviewEmailUser(pendingAccount);
    let emailWarning = '';

    try {
      if (status === USER_STATUSES.APPROVED) {
        await sendApprovalEmail(emailUser);
      } else {
        await sendDeclineEmail(emailUser, normalizedReason);
      }
    } catch (error) {
      console.error('Review email failed:', error);
      emailWarning = 'Account status was updated, but the email notification could not be sent.';
    }

    notifyRegistrationReviewed(account, status);

    return {
      ...account,
      emailWarning
    };
  }

  const existing = await getAccountStatusById(id);

  if (!existing) {
    const error = new Error('Pending account not found.');
    error.statusCode = 404;
    throw error;
  }

  const error = new Error(`Account is already ${existing.status}.`);
  error.statusCode = 409;
  throw error;
}

module.exports = {
  getPendingAccountSummaries,
  getPendingAccountDetails,
  getPendingAccountIdImage,
  updateAccountReviewStatus
};
