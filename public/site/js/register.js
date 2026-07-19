const toggleBtn = document.getElementById('nav-toggle');
const navMenu = document.getElementById('nav-menu');
    
if (toggleBtn && navMenu) {
  toggleBtn.setAttribute('aria-expanded', 'false');

  const closeMenu = () => {
    navMenu.classList.remove('active');
    toggleBtn.setAttribute('aria-expanded', 'false');
  };

  toggleBtn.addEventListener('click', () => {
    const isOpen = navMenu.classList.toggle('active');
    toggleBtn.setAttribute('aria-expanded', String(isOpen));
  });

  navMenu.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', closeMenu);
  });

  document.addEventListener('click', (event) => {
    if (!navMenu.classList.contains('active')) {
      return;
    }

    if (!navMenu.contains(event.target) && !toggleBtn.contains(event.target)) {
      closeMenu();
    }
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 820) {
      closeMenu();
    }
  });
}

const registerRootElement = document.getElementById('register-root');

const showRegisterBootstrapError = (message) => {
  if (!registerRootElement) {
    return;
  }

  registerRootElement.innerHTML = `
    <main class="register-container">
      <div class="card register-fallback-card register-fallback-card-error" role="alert">
        <div class="register-fallback-icon" aria-hidden="true">
          <i class="fa-solid fa-triangle-exclamation"></i>
        </div>
        <h2 class="register-fallback-title">Registration form unavailable</h2>
        <p class="register-fallback-message">${message}</p>
        <p class="register-fallback-help">
          Refresh the page and try again. If the problem continues, check your internet connection or browser content settings.
        </p>
      </div>
    </main>
  `;
};

if (!window.React || !window.ReactDOM) {
  showRegisterBootstrapError('The registration page could not load its required interface libraries.');
  throw new Error('ResQMesh registration bootstrap failed: React or ReactDOM is unavailable.');
}

if (!registerRootElement) {
  throw new Error('ResQMesh registration bootstrap failed: #register-root was not found.');
}

const { useState, useRef } = React;

    // List of 31 Barangays in Valencia City, Bukidnon
    const VALENCIA_BARANGAYS = [
      "Bagontaas", "Banlag", "Barobo", "Batangan", "Catumbalon", 
      "Colonia", "Concepcion", "Dagat-Kidavao", "Guinoyoran", "Kahaponan", 
      "Laligan", "Lilingayon", "Lourdes", "Lumbayao", "Lumbo", 
      "Luyungan", "Maapag", "Mabuhay", "Mailag", "Mount Nebo", 
      "Nabag-o", "Pinatilan", "Poblacion", "San Carlos", "San Isidro", 
      "Sinabuagan", "Sinayawan", "Sugod", "Tongantongan", "Tugaya", "Vintar"
    ];

    function ResQMeshRegistration() {
      const [currentStep, setCurrentStep] = useState(1);
      const [submitted, setSubmitted] = useState(false);
      const [isSubmitting, setIsSubmitting] = useState(false);
      const [submitError, setSubmitError] = useState('');
      const [registrationCode, setRegistrationCode] = useState('');
      
      // Form fields state
      const [formData, setFormData] = useState({
        // Step 1
        firstName: '',
        middleName: '',
        lastName: '',
        birthDate: '',
        username: '',
        streetAddress: '',
        barangay: '',
        occupation: '',
        bloodType: '',
        medicalComplications: '',
        allergies: '',
        
        // Step 2
        email: '',
        phone: '',
        password: '',
        confirmPassword: '',
        
        // Step 3
        idType: 'National ID',
        idNumber: '',
        frontIdImageFile: null,
        frontIdImageName: '',
        frontIdImagePreview: '',
        backIdImageFile: null,
        backIdImageName: '',
        backIdImagePreview: ''
      });

      // Error tracking state
      const [errors, setErrors] = useState({});
      const birthDateInputRef = useRef(null);

      const parseBirthDate = (value) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) {
          return null;
        }

        const [year, month, day] = value.split('-').map(Number);
        const date = new Date(Date.UTC(year, month - 1, day));

        if (
          date.getUTCFullYear() !== year ||
          date.getUTCMonth() !== month - 1 ||
          date.getUTCDate() !== day
        ) {
          return null;
        }

        return date;
      };

      const calculateAge = (value) => {
        const date = parseBirthDate(value);

        if (!date) {
          return null;
        }

        const now = new Date();
        let age = now.getFullYear() - date.getUTCFullYear();
        const monthDiff = now.getMonth() - date.getUTCMonth();

        if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < date.getUTCDate())) {
          age -= 1;
        }

        return age;
      };

      const openBirthDatePicker = (event) => {
        if (event) {
          event.stopPropagation();
        }

        const input = birthDateInputRef.current;

        if (!input) {
          return;
        }

        if (typeof input.showPicker === 'function') {
          input.showPicker();
          return;
        }

        input.focus();
      };

      const handleInputChange = (e) => {
        const { id, value } = e.target;
        setFormData(prev => ({
          ...prev,
          [id]: value
        }));
        
        // Clear error when user type/selects
        if (errors[id]) {
          setErrors(prev => {
            const nextErrors = {...prev};
            delete nextErrors[id];
            return nextErrors;
          });
        }
      };

      const validateStep1 = () => {
        const step1Errors = {};
        const required = ['firstName', 'lastName', 'birthDate', 'username', 'streetAddress', 'barangay', 'occupation', 'bloodType'];
        
        required.forEach(field => {
          if (!formData[field] || formData[field].trim() === '') {
            step1Errors[field] = 'This field is required.';
          }
        });

        const birthDate = parseBirthDate(formData.birthDate);
        const age = calculateAge(formData.birthDate);

        if (formData.birthDate && !birthDate) {
          step1Errors.birthDate = 'Please enter a valid birthdate.';
        } else if (birthDate && birthDate > new Date()) {
          step1Errors.birthDate = 'Birthdate cannot be in the future.';
        } else if (age !== null && age < 18) {
          step1Errors.birthDate = 'You must be at least 18 years old to register.';
        }

        setErrors(step1Errors);
        return Object.keys(step1Errors).length === 0;
      };

      const validateStep2 = () => {
        const step2Errors = {};
        
        // Email Validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!formData.email) {
          step2Errors.email = 'Email is required.';
        } else if (!emailRegex.test(formData.email)) {
          step2Errors.email = 'Please enter a valid email address.';
        }

        // Phone Validation (Philippine Standard e.g., 09xxxxxxxxx or +639xxxxxxxxx)
        const phoneRegex = /^(09|\+639)\d{9}$/;
        if (!formData.phone) {
          step2Errors.phone = 'Phone number is required.';
        } else if (!phoneRegex.test(formData.phone)) {
          step2Errors.phone = 'Please enter a valid mobile number (e.g., 09171234567).';
        }

        // Password Validation
        if (!formData.password) {
          step2Errors.password = 'Password is required.';
        } else if (formData.password.length < 8) {
          step2Errors.password = 'Password must be at least 8 characters long.';
        }

        // Password matching
        if (!formData.confirmPassword) {
          step2Errors.confirmPassword = 'Please confirm your password.';
        } else if (formData.password !== formData.confirmPassword) {
          step2Errors.confirmPassword = 'Passwords do not match.';
        }

        setErrors(step2Errors);
        return Object.keys(step2Errors).length === 0;
      };

      const validateStep3 = () => {
        const step3Errors = {};
        if (!formData.idType) {
          step3Errors.idType = 'ID Type is required.';
        }
        if (!formData.idNumber || formData.idNumber.trim() === '') {
          step3Errors.idNumber = 'ID Number is required.';
        }
        if (!formData.frontIdImageFile) {
          step3Errors.frontIdImage = 'Front ID image card is required.';
        }
        if (!formData.backIdImageFile) {
          step3Errors.backIdImage = 'Back ID image card is required.';
        }

        setErrors(step3Errors);
        return Object.keys(step3Errors).length === 0;
      };

      const handleNext = () => {
        if (currentStep === 1) {
          if (validateStep1()) setCurrentStep(2);
        } else if (currentStep === 2) {
          if (validateStep2()) setCurrentStep(3);
        }
      };

      const handlePrev = () => {
        setErrors({});
        setCurrentStep(prev => prev - 1);
      };

      const handleFileChange = (e, fileKey) => {
        const file = e.target.files[0];
        if (!file) return;

        // Ensure file is an image
        if (!file.type.startsWith('image/')) {
          setErrors(prev => ({
            ...prev,
            [fileKey === 'frontIdImageFile' ? 'frontIdImage' : 'backIdImage']: 'Only image files are allowed.'
          }));
          return;
        }

        const reader = new FileReader();
        reader.onloadend = () => {
          setFormData(prev => ({
            ...prev,
            [fileKey]: file,
            [fileKey === 'frontIdImageFile' ? 'frontIdImageName' : 'backIdImageName']: file.name,
            [fileKey === 'frontIdImageFile' ? 'frontIdImagePreview' : 'backIdImagePreview']: reader.result
          }));
          
          // Clear error
          setErrors(prev => {
            const nextErrors = {...prev};
            delete nextErrors[fileKey === 'frontIdImageFile' ? 'frontIdImage' : 'backIdImage'];
            return nextErrors;
          });
        };
        reader.readAsDataURL(file);
      };

      const removeFile = (fileKey) => {
        setFormData(prev => ({
          ...prev,
          [fileKey]: null,
          [fileKey === 'frontIdImageFile' ? 'frontIdImageName' : 'backIdImageName']: '',
          [fileKey === 'frontIdImageFile' ? 'frontIdImagePreview' : 'backIdImagePreview']: ''
        }));
      };

      const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitError('');

        if (!validateStep3()) {
          return;
        }

        const payload = new FormData();
        const textFields = [
          'firstName',
          'middleName',
          'lastName',
          'birthDate',
          'username',
          'streetAddress',
          'barangay',
          'occupation',
          'bloodType',
          'medicalComplications',
          'allergies',
          'email',
          'phone',
          'password',
          'idType',
          'idNumber'
        ];

        textFields.forEach((field) => {
          payload.append(field, formData[field] || '');
        });

        payload.append('frontIdImageFile', formData.frontIdImageFile);
        payload.append('backIdImageFile', formData.backIdImageFile);

        try {
          setIsSubmitting(true);
          const recaptchaToken = await window.ResQMeshRecaptcha.getToken('register');
          payload.append('recaptchaToken', recaptchaToken);

          const response = await fetch('/api/users/register', {
            method: 'POST',
            body: payload
          });
          const result = await response.json();

          if (!response.ok) {
            throw new Error(result.message || 'Registration failed. Please try again.');
          }

          setRegistrationCode(result.data?.userCode || '');
          setSubmitted(true);
        } catch (error) {
          setSubmitError(error.message);
        } finally {
          setIsSubmitting(false);
        }
      };

      // Progress bar percentage calculation
      const progressPercent = ((currentStep - 1) / 2) * 100;
      const computedAge = calculateAge(formData.birthDate);
      const maxBirthDate = (() => {
        const date = new Date();
        date.setFullYear(date.getFullYear() - 18);
        return date.toISOString().split('T')[0];
      })();

      if (submitted) {
        return (
          <main class="register-container">
            <div class="card success-card">
              <div class="success-icon-wrapper"><i class="fa-solid fa-circle-check"></i></div>
              <h2 class="success-title">Registration submitted</h2>
              <p class="success-message">
                Your civilian account request has been sent to the ResQMesh admin team for verification. Once approved,
                your account can be synced to mesh nodes for emergency app access.
              </p>
              {registrationCode && (
                <p class="success-message">
                  Your registration code is <strong class="text-primary">{registrationCode}</strong>.
                </p>
              )}
              <a href="/" class="btn btn-primary">Return to Homepage</a>
            </div>
          </main>
        );
      }

      return (
        <main class="register-container">
          <div class="card register-card">
            <div className="register-intro">
              <span className="register-kicker">Civilian account registration</span>
              <h2>Prepare your ResQMesh access before an emergency</h2>
              <p>
                Submit your profile for admin approval. Approved civilian records are synced to ResQMesh devices so the
                mobile app can be used through nearby mesh nodes when internet service is unavailable.
              </p>
            </div>

            {/* Steps Progress Indicator */}
            <div class="steps-container">
              <div class="steps-progress-bar" style={{ width: `${progressPercent}%` }}></div>
              
              <div class={`step-indicator ${currentStep >= 1 ? 'active' : ''} ${currentStep > 1 ? 'completed' : ''}`}>
                1
                <span class="step-label">Personal Info</span>
              </div>
              <div class={`step-indicator ${currentStep >= 2 ? 'active' : ''} ${currentStep > 2 ? 'completed' : ''}`}>
                2
                <span class="step-label">Account details</span>
              </div>
              <div class={`step-indicator ${currentStep >= 3 ? 'active' : ''}`}>
                3
                <span class="step-label">ID Verification</span>
              </div>
            </div>

            <form onSubmit={handleSubmit} noValidate>
              {submitError && (
                <div class="alert alert-warning">
                  <i class="fa-solid fa-triangle-exclamation"></i>
                  <span>{submitError}</span>
                </div>
              )}
              
              {/* STEP 1: PERSONAL INFORMATION */}
              {currentStep === 1 && (
                <div className="form-step-content">
                  <div class="form-grid">
                    <div class="form-group">
                      <label htmlFor="firstName" class="form-label">First Name <span class="required-indicator">*</span></label>
                      <input 
                        type="text" 
                        id="firstName" 
                        value={formData.firstName}
                        onChange={handleInputChange}
                        className={`form-control ${errors.firstName ? 'error-border' : ''}`}
                        placeholder="e.g. Juan" 
                      />
                      {errors.firstName && <span class="form-error-msg">{errors.firstName}</span>}
                    </div>

                    <div class="form-group">
                      <label htmlFor="middleName" class="form-label">Middle Name</label>
                      <input 
                        type="text" 
                        id="middleName" 
                        value={formData.middleName}
                        onChange={handleInputChange}
                        class="form-control" 
                        placeholder="e.g. Santos" 
                      />
                    </div>

                    <div class="form-group">
                      <label htmlFor="lastName" class="form-label">Last Name <span class="required-indicator">*</span></label>
                      <input 
                        type="text" 
                        id="lastName" 
                        value={formData.lastName}
                        onChange={handleInputChange}
                        className={`form-control ${errors.lastName ? 'error-border' : ''}`}
                        placeholder="e.g. Dela Cruz" 
                      />
                      {errors.lastName && <span class="form-error-msg">{errors.lastName}</span>}
                    </div>

                    <div class="form-group">
                      <label htmlFor="username" class="form-label">Username <span class="required-indicator">*</span></label>
                      <input 
                        type="text" 
                        id="username" 
                        value={formData.username}
                        onChange={handleInputChange}
                        className={`form-control ${errors.username ? 'error-border' : ''}`}
                        placeholder="Choose a screen username" 
                      />
                      {errors.username && <span class="form-error-msg">{errors.username}</span>}
                    </div>

                    <div class="form-group">
                      <label htmlFor="birthDate" class="form-label">Birthdate <span class="required-indicator">*</span></label>
                      <div className={`birthdate-picker ${errors.birthDate ? 'error-border' : ''}`} onClick={openBirthDatePicker}>
                        <i class="fa-regular fa-calendar-days birthdate-picker-icon" aria-hidden="true"></i>
                        <input
                          ref={birthDateInputRef}
                          type="date"
                          id="birthDate"
                          value={formData.birthDate}
                          min="1900-01-01"
                          max={maxBirthDate}
                          onChange={handleInputChange}
                          className="birthdate-picker-input"
                          aria-describedby="birthDateHelp"
                        />
                        <button type="button" class="birthdate-picker-button" onClick={openBirthDatePicker} aria-label="Open birthdate calendar">
                          <i class="fa-solid fa-chevron-down" aria-hidden="true"></i>
                        </button>
                      </div>
                      <span id="birthDateHelp" class="form-help-msg">Open the calendar and select month, day, and year.</span>
                      {computedAge !== null && computedAge >= 18 && !errors.birthDate && (
                        <span class="form-help-msg">Age: {computedAge}</span>
                      )}
                      {errors.birthDate && <span class="form-error-msg">{errors.birthDate}</span>}
                    </div>

                    <div class="form-group form-grid-full">
                      <label htmlFor="streetAddress" class="form-label">House No. / Street / Purok <span class="required-indicator">*</span></label>
                      <input 
                        type="text" 
                        id="streetAddress" 
                        value={formData.streetAddress}
                        onChange={handleInputChange}
                        className={`form-control ${errors.streetAddress ? 'error-border' : ''}`}
                        placeholder="e.g. Purok 4, Sayre Highway" 
                      />
                      {errors.streetAddress && <span class="form-error-msg">{errors.streetAddress}</span>}
                    </div>

                    <div class="form-group">
                      <label htmlFor="barangay" class="form-label">Barangay (Valencia City) <span class="required-indicator">*</span></label>
                      <select 
                        id="barangay" 
                        value={formData.barangay}
                        onChange={handleInputChange}
                        className={`form-control ${errors.barangay ? 'error-border' : ''}`}
                      >
                        <option value="">-- Select Barangay --</option>
                        {VALENCIA_BARANGAYS.map(brgy => (
                          <option key={brgy} value={brgy}>{brgy}</option>
                        ))}
                      </select>
                      {errors.barangay && <span class="form-error-msg">{errors.barangay}</span>}
                    </div>

                    <div class="form-group">
                      <label htmlFor="occupation" class="form-label">Occupation <span class="required-indicator">*</span></label>
                      <input 
                        type="text" 
                        id="occupation" 
                        value={formData.occupation}
                        onChange={handleInputChange}
                        className={`form-control ${errors.occupation ? 'error-border' : ''}`}
                        placeholder="e.g. Farmer, Teacher, Rescuer" 
                      />
                      {errors.occupation && <span class="form-error-msg">{errors.occupation}</span>}
                    </div>

                    <div class="form-group">
                      <label htmlFor="bloodType" class="form-label">Blood Type <span class="required-indicator">*</span></label>
                      <select 
                        id="bloodType" 
                        value={formData.bloodType}
                        onChange={handleInputChange}
                        className={`form-control ${errors.bloodType ? 'error-border' : ''}`}
                      >
                        <option value="">-- Select Blood Type --</option>
                        <option value="A+">A+</option>
                        <option value="A-">A-</option>
                        <option value="B+">B+</option>
                        <option value="B-">B-</option>
                        <option value="AB+">AB+</option>
                        <option value="AB-">AB-</option>
                        <option value="O+">O+</option>
                        <option value="O-">O-</option>
                      </select>
                      {errors.bloodType && <span class="form-error-msg">{errors.bloodType}</span>}
                    </div>

                    <div class="form-group form-grid-full">
                      <label htmlFor="medicalComplications" class="form-label">Medical Complications (Optional)</label>
                      <textarea 
                        id="medicalComplications" 
                        value={formData.medicalComplications}
                        onChange={handleInputChange}
                        class="form-control" 
                        rows="2" 
                        placeholder="List any existing conditions (e.g. Asthma, Hypertension)"
                      ></textarea>
                    </div>

                    <div class="form-group form-grid-full">
                      <label htmlFor="allergies" class="form-label">Allergies (Optional)</label>
                      <textarea 
                        id="allergies" 
                        value={formData.allergies}
                        onChange={handleInputChange}
                        class="form-control" 
                        rows="2" 
                        placeholder="List any drug, food or environmental allergies"
                      ></textarea>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 2: ACCOUNT INFORMATION */}
              {currentStep === 2 && (
                <div className="form-step-content">
                  <div class="form-grid">
                    <div class="form-group form-grid-full">
                      <label htmlFor="email" class="form-label">Email Address <span class="required-indicator">*</span></label>
                      <input 
                        type="email" 
                        id="email" 
                        value={formData.email}
                        onChange={handleInputChange}
                        className={`form-control ${errors.email ? 'error-border' : ''}`}
                        placeholder="e.g. Juan@example.com" 
                      />
                      {errors.email && <span class="form-error-msg">{errors.email}</span>}
                    </div>

                    <div class="form-group form-grid-full">
                      <label htmlFor="phone" class="form-label">Phone Number <span class="required-indicator">*</span></label>
                      <input 
                        type="tel" 
                        id="phone" 
                        value={formData.phone}
                        onChange={handleInputChange}
                        className={`form-control ${errors.phone ? 'error-border' : ''}`}
                        placeholder="e.g. 09171234567" 
                      />
                      {errors.phone && <span class="form-error-msg">{errors.phone}</span>}
                    </div>

                    <div class="form-group">
                      <label htmlFor="password" class="form-label">Password <span class="required-indicator">*</span></label>
                      <input 
                        type="password" 
                        id="password" 
                        value={formData.password}
                        onChange={handleInputChange}
                        className={`form-control ${errors.password ? 'error-border' : ''}`}
                        placeholder="Min. 8 characters" 
                      />
                      {errors.password && <span class="form-error-msg">{errors.password}</span>}
                    </div>

                    <div class="form-group">
                      <label htmlFor="confirmPassword" class="form-label">Confirm Password <span class="required-indicator">*</span></label>
                      <input 
                        type="password" 
                        id="confirmPassword" 
                        value={formData.confirmPassword}
                        onChange={handleInputChange}
                        className={`form-control ${errors.confirmPassword ? 'error-border' : ''}`}
                        placeholder="Re-enter your password" 
                      />
                      {errors.confirmPassword && <span class="form-error-msg">{errors.confirmPassword}</span>}
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 3: ID VERIFICATION */}
              {currentStep === 3 && (
                <div className="form-step-content">
                  <div class="form-group">
                    <label htmlFor="idType" class="form-label">Select Valid Identity Document <span class="required-indicator">*</span></label>
                    <select 
                      id="idType" 
                      value={formData.idType}
                      onChange={handleInputChange}
                      className={`form-control ${errors.idType ? 'error-border' : ''}`}
                    >
                      <option value="National ID">National ID</option>
                      <option value="Driver's License">Driver's License</option>
                      <option value="PhilHealth ID">PhilHealth ID</option>
                    </select>
                    {errors.idType && <span class="form-error-msg">{errors.idType}</span>}
                  </div>

                  <div class="upload-grid">
                    
                    {/* ID Card Front Image */}
                    <div class="form-group">
                      <label class="form-label">Upload {formData.idType} Front Image <span class="required-indicator">*</span></label>
                      
                      {!formData.frontIdImagePreview ? (
                        <div class="file-upload-zone" onClick={() => document.getElementById('frontIdImageFileInput').click()}>
                          <div class="upload-icon">&#128203;</div>
                          <span style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', display: 'block' }}>
                            Click to select Front image
                          </span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--color-secondary)' }}>
                            PNG, JPG or JPEG only
                          </span>
                          <input 
                            type="file" 
                            id="frontIdImageFileInput" 
                            style={{ display: 'none' }} 
                            accept="image/*"
                            onChange={(e) => handleFileChange(e, 'frontIdImageFile')}
                          />
                        </div>
                      ) : (
                        <div class="preview-container">
                          <button type="button" class="preview-remove-btn" onClick={() => removeFile('frontIdImageFile')}>&times;</button>
                          <img src={formData.frontIdImagePreview} alt="Front ID Preview" class="preview-image" />
                          <span class="preview-filename">{formData.frontIdImageName}</span>
                        </div>
                      )}
                      {errors.frontIdImage && <span class="form-error-msg">{errors.frontIdImage}</span>}
                    </div>

                    {/* ID Card Back Image */}
                    <div class="form-group">
                      <label class="form-label">Upload {formData.idType} Back Image <span class="required-indicator">*</span></label>
                      
                      {!formData.backIdImagePreview ? (
                        <div class="file-upload-zone" onClick={() => document.getElementById('backIdImageFileInput').click()}>
                          <div class="upload-icon">&#128203;</div>
                          <span style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', display: 'block' }}>
                            Click to select Back image
                          </span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--color-secondary)' }}>
                            PNG, JPG or JPEG only
                          </span>
                          <input 
                            type="file" 
                            id="backIdImageFileInput" 
                            style={{ display: 'none' }} 
                            accept="image/*"
                            onChange={(e) => handleFileChange(e, 'backIdImageFile')}
                          />
                        </div>
                      ) : (
                        <div class="preview-container">
                          <button type="button" class="preview-remove-btn" onClick={() => removeFile('backIdImageFile')}>&times;</button>
                          <img src={formData.backIdImagePreview} alt="Back ID Preview" class="preview-image" />
                          <span class="preview-filename">{formData.backIdImageName}</span>
                        </div>
                      )}
                      {errors.backIdImage && <span class="form-error-msg">{errors.backIdImage}</span>}
                    </div>

                  </div>

                  {/* ID Card Number Input field */}
                  <div class="form-group" style={{ marginTop: '1.5rem' }}>
                    <label htmlFor="idNumber" class="form-label">ID Number <span class="required-indicator">*</span></label>
                    <input 
                      type="text" 
                      id="idNumber" 
                      value={formData.idNumber}
                      onChange={handleInputChange}
                      className={`form-control ${errors.idNumber ? 'error-border' : ''}`}
                      placeholder="e.g. 1234-56789-0" 
                    />
                    {errors.idNumber && <span class="form-error-msg">{errors.idNumber}</span>}
                  </div>

                </div>
              )}

              {/* Navigation Controls */}
              <div class="form-navigation">
                {currentStep > 1 ? (
                  <button type="button" class="btn btn-secondary" onClick={handlePrev}>
                    &larr; Previous
                  </button>
                ) : (
                  <div></div> // Spacer to keep Next button aligned right
                )}

                {currentStep < 3 ? (
                  <button type="button" class="btn btn-primary" onClick={handleNext}>
                    Next &rarr;
                  </button>
                ) : (
                  <button type="submit" class="btn btn-primary" disabled={isSubmitting} style={{ backgroundColor: 'var(--color-success)' }}>
                    {isSubmitting ? 'Submitting...' : 'Submit Registration'}
                  </button>
                )}
              </div>

            </form>
          </div>
        </main>
      );
    }

    // Render the React application
    try {
      const root = ReactDOM.createRoot(registerRootElement);
      root.render(<React.StrictMode><ResQMeshRegistration /></React.StrictMode>);
    } catch (error) {
      showRegisterBootstrapError('The registration form could not finish loading.');
      console.error(error);
    }

