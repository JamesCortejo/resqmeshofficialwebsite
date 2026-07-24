(function defineRegisterConfig() {
  window.ResQMeshRegisterConfig = {
    barangays: [
      'Bagontaas', 'Banlag', 'Barobo', 'Batangan', 'Catumbalon',
      'Colonia', 'Concepcion', 'Dagat-Kidavao', 'Guinoyoran', 'Kahaponan',
      'Laligan', 'Lilingayon', 'Lourdes', 'Lumbayao', 'Lumbo',
      'Luyungan', 'Maapag', 'Mabuhay', 'Mailag', 'Mount Nebo',
      'Nabag-o', 'Pinatilan', 'Poblacion', 'San Carlos', 'San Isidro',
      'Sinabuagan', 'Sinayawan', 'Sugod', 'Tongantongan', 'Tugaya', 'Vintar'
    ],
    maxIdImageSizeBytes: 5 * 1024 * 1024,
    submitTimeoutMs: 45000,
    recaptchaTimeoutMs: 15000,
    fieldSteps: {
      firstName: 1,
      lastName: 1,
      birthDate: 1,
      username: 1,
      streetAddress: 1,
      barangay: 1,
      occupation: 1,
      bloodType: 1,
      email: 2,
      phone: 2,
      password: 2,
      confirmPassword: 2,
      idType: 3,
      frontIdImage: 3,
      backIdImage: 3,
      idNumber: 3
    },
    fieldTargets: {
      birthDate: 'birthDate',
      frontIdImage: 'frontIdImageUploadZone',
      backIdImage: 'backIdImageUploadZone'
    },
    stepFieldOrder: {
      1: ['firstName', 'lastName', 'birthDate', 'username', 'streetAddress', 'barangay', 'occupation', 'bloodType'],
      2: ['email', 'phone', 'password', 'confirmPassword'],
      3: ['idType', 'frontIdImage', 'backIdImage', 'idNumber']
    }
  };
}());
