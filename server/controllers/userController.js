const { REQUIRED_REGISTRATION_FIELDS } = require('../models/userModel');
const { encryptText, lookupHash } = require('../services/encryptionService');
const { hashPassword } = require('../services/passwordService');
const { convertAndEncryptIdImage } = require('../services/imageService');
const { notifyPendingRegistrationCreated } = require('../services/notificationService');
const { verifyRecaptcha } = require('../services/recaptchaService');
const {
  generateUserCode,
  createUser,
  findByLookupHashes,
  listUserSummaries
} = require('../repositories/userRepository');

function firstFile(files, fieldName) {
  return files && files[fieldName] && files[fieldName][0];
}

function missingFields(body) {
  return REQUIRED_REGISTRATION_FIELDS.filter((field) => {
    const value = body[field];
    return value === undefined || value === null || String(value).trim() === '';
  });
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPhone(phone) {
  return /^(09|\+639)\d{9}$/.test(phone);
}

function parseBirthDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) {
    return null;
  }

  const [year, month, day] = String(value).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

function ageFromBirthDate(date) {
  const now = new Date();
  let age = now.getFullYear() - date.getUTCFullYear();
  const monthDiff = now.getMonth() - date.getUTCMonth();

  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < date.getUTCDate())) {
    age -= 1;
  }

  return age;
}

function safeUserResponse(user) {
  return {
    id: user.id,
    userCode: user.userCode,
    status: user.status,
    createdAt: user.createdAt
  };
}

exports.registerUser = async (req, res) => {
  try {
    const missing = missingFields(req.body);

    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missing.join(', ')}.`
      });
    }

    if (!isValidEmail(req.body.email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address.'
      });
    }

    if (!isValidPhone(req.body.phone)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid Philippine mobile number.'
      });
    }

    const birthDate = parseBirthDate(req.body.birthDate);

    if (!birthDate) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid birthdate.'
      });
    }

    const today = new Date();

    if (birthDate > today) {
      return res.status(400).json({
        success: false,
        message: 'Birthdate cannot be in the future.'
      });
    }

    if (ageFromBirthDate(birthDate) < 18) {
      return res.status(400).json({
        success: false,
        message: 'You must be at least 18 years old to register.'
      });
    }

    if (String(req.body.password).length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long.'
      });
    }

    await verifyRecaptcha(req.body.recaptchaToken, 'register', {
      remoteIp: req.ip,
      hostname: req.hostname
    });

    const frontIdImageFile = firstFile(req.files, 'frontIdImageFile');
    const backIdImageFile = firstFile(req.files, 'backIdImageFile');

    if (!frontIdImageFile || !backIdImageFile) {
      return res.status(400).json({
        success: false,
        message: 'Front and back ID images are required.'
      });
    }

    const usernameLookupHash = lookupHash(req.body.username);
    const emailLookupHash = lookupHash(req.body.email);
    const idNumberLookupHash = lookupHash(req.body.idNumber);
    const existingUser = await findByLookupHashes(usernameLookupHash, emailLookupHash, idNumberLookupHash);

    if (existingUser) {
      let duplicateField = 'email';

      if (existingUser.usernameLookupHash === usernameLookupHash) {
        duplicateField = 'username';
      } else if (existingUser.idNumberLookupHash === idNumberLookupHash) {
        duplicateField = 'ID number';
      }

      return res.status(409).json({
        success: false,
        message: `A registration with this ${duplicateField} already exists.`
      });
    }

    const userCode = await generateUserCode();
    const [frontIdImage, backIdImage] = await Promise.all([
      convertAndEncryptIdImage(frontIdImageFile, userCode, 'front'),
      convertAndEncryptIdImage(backIdImageFile, userCode, 'back')
    ]);

    const createdUser = await createUser({
      userCode,
      firstNameEnc: encryptText(req.body.firstName),
      middleNameEnc: encryptText(req.body.middleName),
      lastNameEnc: encryptText(req.body.lastName),
      birthDateEnc: encryptText(req.body.birthDate),
      usernameEnc: encryptText(req.body.username),
      usernameLookupHash,
      streetAddressEnc: encryptText(req.body.streetAddress),
      barangayEnc: encryptText(req.body.barangay),
      occupationEnc: encryptText(req.body.occupation),
      bloodTypeEnc: encryptText(req.body.bloodType),
      medicalComplicationsEnc: encryptText(req.body.medicalComplications),
      allergiesEnc: encryptText(req.body.allergies),
      emailEnc: encryptText(req.body.email),
      emailLookupHash,
      phoneEnc: encryptText(req.body.phone),
      passwordHash: hashPassword(req.body.password),
      idTypeEnc: encryptText(req.body.idType),
      idNumberEnc: encryptText(req.body.idNumber),
      idNumberLookupHash,
      frontIdImage,
      backIdImage
    });

    notifyPendingRegistrationCreated(createdUser);

    return res.status(201).json({
      success: true,
      message: 'Registration submitted. Please verify your account and wait for admin approval.',
      data: safeUserResponse(createdUser)
    });
  } catch (error) {
    if (error.statusCode && error.statusCode < 500) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    if (error && error.code === 'SQLITE_CONSTRAINT') {
      return res.status(409).json({
        success: false,
        message: 'A registration with this username, email, or ID number already exists.'
      });
    }

    console.error('Registration controller error:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred during registration. Please try again.'
    });
  }
};

exports.getRegistrants = async (req, res) => {
  try {
    const users = await listUserSummaries();

    return res.json({
      success: true,
      count: users.length,
      data: users
    });
  } catch (error) {
    console.error('Registrant listing error:', error);
    return res.status(500).json({
      success: false,
      message: 'Unable to load registrants.'
    });
  }
};
