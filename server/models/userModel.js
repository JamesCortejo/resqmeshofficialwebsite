/**
 * ResQMesh User/Registrant Model Scaffold
 * This file serves as a blueprint for database implementation (e.g. Mongoose / Sequelize).
 */

class User {
  constructor(data) {
    // Personal Information
    this.firstName = data.firstName;
    this.middleName = data.middleName || '';
    this.lastName = data.lastName;
    this.username = data.username;
    this.streetAddress = data.streetAddress;
    this.barangay = data.barangay; // One of 31 Valencia City barangays
    this.city = 'Valencia City';
    this.province = 'Bukidnon';
    this.occupation = data.occupation;
    this.bloodType = data.bloodType; // A+, A-, B+, B-, AB+, AB-, O+, O-
    this.medicalComplications = data.medicalComplications || '';
    this.allergies = data.allergies || '';

    // Account Information
    this.email = data.email;
    this.phone = data.phone;
    this.passwordHash = data.passwordHash; // Hash using bcrypt

    // ID Verification Details
    this.idType = data.idType; // National ID, Driver's License, PhilHealth ID
    this.idImageRef = data.idImageRef; // URL/Path to stored ID image
    this.selfieImageRef = data.selfieImageRef; // URL/Path to stored selfie image

    // System Status
    this.isVerified = false;
    this.status = 'pending_approval'; // pending_approval, verified, rejected
    this.createdAt = new Date();
  }

  // Method helper to validate user data structure
  static isValid(user) {
    return (
      user.firstName &&
      user.lastName &&
      user.username &&
      user.barangay &&
      user.email &&
      user.phone &&
      user.passwordHash &&
      user.idType &&
      user.idImageRef &&
      user.selfieImageRef
    );
  }
}

module.exports = User;
