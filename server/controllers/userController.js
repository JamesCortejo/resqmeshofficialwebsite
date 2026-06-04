/**
 * User Controller
 * Handles incoming API requests for registration and verification management.
 */
const User = require('../models/userModel');

// Mock Database Store
const mockDb = [];

exports.registerUser = (req, res) => {
  try {
    const { 
      firstName, middleName, lastName, username, 
      streetAddress, barangay, occupation, bloodType, 
      medicalComplications, allergies, email, phone, password, idType 
    } = req.body;

    // Server-side validation logic placeholder
    if (!firstName || !lastName || !username || !barangay || !email || !phone || !password || !idType) {
      return res.status(400).json({ 
        success: false, 
        message: 'Required fields are missing.' 
      });
    }

    // Hash password placeholder (e.g. bcrypt.hash)
    const passwordHash = `hashed_${password}`;

    // Mock file paths for uploaded documents
    const idImageRef = req.files && req.files.idImage ? req.files.idImage[0].path : 'uploads/mock-id.png';
    const selfieImageRef = req.files && req.files.selfieImage ? req.files.selfieImage[0].path : 'uploads/mock-selfie.png';

    const newUser = new User({
      firstName,
      middleName,
      lastName,
      username,
      streetAddress,
      barangay,
      occupation,
      bloodType,
      medicalComplications,
      allergies,
      email,
      phone,
      passwordHash,
      idType,
      idImageRef,
      selfieImageRef
    });

    mockDb.push(newUser);

    return res.status(201).json({
      success: true,
      message: 'Registration submitted. Please verify your account and wait for admin approval.',
      data: newUser
    });
  } catch (error) {
    console.error('Registration controller error:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred during registration. Please try again.'
    });
  }
};

exports.getRegistrants = (req, res) => {
  // Placeholder to display all registrants in administrative panel (to be implemented later)
  return res.json({
    success: true,
    count: mockDb.length,
    data: mockDb
  });
};
