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
const registerConfig = window.ResQMeshRegisterConfig;
const registerUtils = window.ResQMeshRegisterUtils;
const VALENCIA_BARANGAYS = registerConfig?.barangays || [];

const state = {
  currentStep: 1,
  submitted: false,
  hasAnimatedForm: false,
  isSubmitting: false,
  submitError: '',
  toast: null,
  uploadProgress: null,
  errors: {},
  formData: {
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
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    idType: 'National ID',
    idNumber: '',
    frontIdImageFile: null,
    frontIdImageName: '',
    frontIdImagePreview: '',
    backIdImageFile: null,
    backIdImageName: '',
    backIdImagePreview: ''
  }
};

let toastTimer = null;
const previewObjectUrls = {
  frontIdImagePreview: '',
  backIdImagePreview: ''
};

window.addEventListener('beforeunload', () => {
  Object.values(previewObjectUrls).forEach((url) => {
    if (url) {
      URL.revokeObjectURL(url);
    }
  });
});

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showRegisterBootstrapError(message) {
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
        <p class="register-fallback-message">${escapeHtml(message)}</p>
        <p class="register-fallback-help">
          Refresh the page and try again. If the problem continues, check your internet connection or browser content settings.
        </p>
      </div>
    </main>
  `;
}

function maxBirthDate() {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 18);
  return date.toISOString().split('T')[0];
}

function scrollRegistrationToTop() {
  window.requestAnimationFrame(() => {
    const target = document.querySelector('.register-card') || registerRootElement;

    if (!target) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const navbarOffset = 96;
    const top = target.getBoundingClientRect().top + window.pageYOffset - navbarOffset;

    window.scrollTo({
      top: Math.max(0, top),
      behavior: 'smooth'
    });
  });
}

function scrollToField(field) {
  if (!field) {
    scrollRegistrationToTop();
    return;
  }

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      const targetId = registerConfig.fieldTargets[field] || field;
      const target = document.getElementById(targetId) || document.querySelector('.register-card') || registerRootElement;

      if (!target) {
        return;
      }

      const navbarOffset = 106;
      const top = target.getBoundingClientRect().top + window.pageYOffset - navbarOffset;

      window.scrollTo({
        top: Math.max(0, top),
        behavior: 'smooth'
      });

      if (typeof target.focus === 'function') {
        window.setTimeout(() => target.focus({ preventScroll: true }), 250);
      }
    });
  });
}

function showToast(message, tone = 'error') {
  window.clearTimeout(toastTimer);
  state.toast = { message, tone };
  render();

  toastTimer = window.setTimeout(() => {
    state.toast = null;
    render();
  }, 4200);
}

function setErrors(errors) {
  state.errors = errors;
  render();
}

function fieldError(field) {
  return state.errors[field] || '';
}

function fieldClass(field, base = 'form-control') {
  return `${base}${fieldError(field) ? ' error-border' : ''}`;
}

function errorMarkup(field) {
  const message = fieldError(field);
  return message ? `<span class="form-error-msg" data-error-for="${escapeHtml(field)}">${escapeHtml(message)}</span>` : '';
}

function inputMarkup(field, options = {}) {
  const type = options.type || 'text';
  return `
    <input
      type="${escapeHtml(type)}"
      id="${escapeHtml(field)}"
      value="${escapeHtml(state.formData[field])}"
      class="${escapeHtml(fieldClass(field))}"
      placeholder="${escapeHtml(options.placeholder || '')}"
      ${options.autocomplete ? `autocomplete="${escapeHtml(options.autocomplete)}"` : ''}
    />
  `;
}

function textareaMarkup(field, options = {}) {
  return `
    <textarea
      id="${escapeHtml(field)}"
      class="form-control"
      rows="${escapeHtml(options.rows || 2)}"
      placeholder="${escapeHtml(options.placeholder || '')}"
    >${escapeHtml(state.formData[field])}</textarea>
  `;
}

function selectMarkup(field, options, placeholder = '') {
  return `
    <select id="${escapeHtml(field)}" class="${escapeHtml(fieldClass(field))}">
      ${placeholder ? `<option value="">${escapeHtml(placeholder)}</option>` : ''}
      ${options.map((option) => {
        const value = typeof option === 'string' ? option : option.value;
        const label = typeof option === 'string' ? option : option.label;
        const selected = state.formData[field] === value ? ' selected' : '';
        return `<option value="${escapeHtml(value)}"${selected}>${escapeHtml(label)}</option>`;
      }).join('')}
    </select>
  `;
}

function toastMarkup() {
  if (!state.toast) {
    return '';
  }

  const tone = state.toast.tone || 'error';
  const icon = tone === 'success' ? 'fa-circle-check' : 'fa-triangle-exclamation';

  return `
    <div class="register-toast register-toast-${escapeHtml(tone)}" role="status" aria-live="polite">
      <span class="register-toast-icon">
        <i class="fa-solid ${escapeHtml(icon)}" aria-hidden="true"></i>
      </span>
      <span>${escapeHtml(state.toast.message)}</span>
    </div>
  `;
}

function renderStepIndicators() {
  const progressPercent = ((state.currentStep - 1) / 2) * 100;

  return `
    <div class="steps-container">
      <div class="steps-progress-bar" style="width: ${progressPercent}%"></div>
      <div class="step-indicator ${state.currentStep >= 1 ? 'active' : ''} ${state.currentStep > 1 ? 'completed' : ''}">
        1
        <span class="step-label">Personal Info</span>
      </div>
      <div class="step-indicator ${state.currentStep >= 2 ? 'active' : ''} ${state.currentStep > 2 ? 'completed' : ''}">
        2
        <span class="step-label">Account details</span>
      </div>
      <div class="step-indicator ${state.currentStep >= 3 ? 'active' : ''}">
        3
        <span class="step-label">ID Verification</span>
      </div>
    </div>
  `;
}

function renderStepOne() {
  const computedAge = registerUtils.calculateAge(state.formData.birthDate);
  const ageHelp = computedAge !== null && computedAge >= 18 && !fieldError('birthDate')
    ? `<span class="form-help-msg">Age: ${computedAge}</span>`
    : '';

  return `
    <div class="form-step-content">
      <div class="form-grid">
        <div class="form-group">
          <label for="firstName" class="form-label">First Name <span class="required-indicator">*</span></label>
          ${inputMarkup('firstName', { placeholder: 'e.g. Juan' })}
          ${errorMarkup('firstName')}
        </div>
        <div class="form-group">
          <label for="middleName" class="form-label">Middle Name</label>
          ${inputMarkup('middleName', { placeholder: 'e.g. Santos' })}
        </div>
        <div class="form-group">
          <label for="lastName" class="form-label">Last Name <span class="required-indicator">*</span></label>
          ${inputMarkup('lastName', { placeholder: 'e.g. Dela Cruz' })}
          ${errorMarkup('lastName')}
        </div>
        <div class="form-group">
          <label for="username" class="form-label">Username <span class="required-indicator">*</span></label>
          ${inputMarkup('username', { placeholder: 'Choose a screen username' })}
          ${errorMarkup('username')}
        </div>
        <div class="form-group">
          <label for="birthDate" class="form-label">Birthdate <span class="required-indicator">*</span></label>
          <div class="birthdate-picker ${fieldError('birthDate') ? 'error-border' : ''}" id="birthDatePicker">
            <i class="fa-regular fa-calendar-days birthdate-picker-icon" aria-hidden="true"></i>
            <input
              type="date"
              id="birthDate"
              value="${escapeHtml(state.formData.birthDate)}"
              min="1900-01-01"
              max="${escapeHtml(maxBirthDate())}"
              class="birthdate-picker-input"
              aria-describedby="birthDateHelp"
            />
            <button type="button" class="birthdate-picker-button" id="birthDateButton" aria-label="Open birthdate calendar">
              <i class="fa-solid fa-chevron-down" aria-hidden="true"></i>
            </button>
          </div>
          <span id="birthDateHelp" class="form-help-msg">Open the calendar and select month, day, and year.</span>
          ${ageHelp}
          ${errorMarkup('birthDate')}
        </div>
        <div class="form-group form-grid-full">
          <label for="streetAddress" class="form-label">House No. / Street / Purok <span class="required-indicator">*</span></label>
          ${inputMarkup('streetAddress', { placeholder: 'e.g. Purok 4, Sayre Highway' })}
          ${errorMarkup('streetAddress')}
        </div>
        <div class="form-group">
          <label for="barangay" class="form-label">Barangay (Valencia City) <span class="required-indicator">*</span></label>
          ${selectMarkup('barangay', VALENCIA_BARANGAYS, '-- Select Barangay --')}
          ${errorMarkup('barangay')}
        </div>
        <div class="form-group">
          <label for="occupation" class="form-label">Occupation <span class="required-indicator">*</span></label>
          ${inputMarkup('occupation', { placeholder: 'e.g. Farmer, Teacher, Rescuer' })}
          ${errorMarkup('occupation')}
        </div>
        <div class="form-group">
          <label for="bloodType" class="form-label">Blood Type <span class="required-indicator">*</span></label>
          ${selectMarkup('bloodType', ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'], '-- Select Blood Type --')}
          ${errorMarkup('bloodType')}
        </div>
        <div class="form-group form-grid-full">
          <label for="medicalComplications" class="form-label">Medical Complications (Optional)</label>
          ${textareaMarkup('medicalComplications', { placeholder: 'List any existing conditions (e.g. Asthma, Hypertension)' })}
        </div>
        <div class="form-group form-grid-full">
          <label for="allergies" class="form-label">Allergies (Optional)</label>
          ${textareaMarkup('allergies', { placeholder: 'List any drug, food or environmental allergies' })}
        </div>
      </div>
    </div>
  `;
}

function renderStepTwo() {
  return `
    <div class="form-step-content">
      <div class="form-grid">
        <div class="form-group form-grid-full">
          <label for="email" class="form-label">Email Address <span class="required-indicator">*</span></label>
          ${inputMarkup('email', { type: 'email', placeholder: 'e.g. Juan@example.com', autocomplete: 'email' })}
          ${errorMarkup('email')}
        </div>
        <div class="form-group form-grid-full">
          <label for="phone" class="form-label">Phone Number <span class="required-indicator">*</span></label>
          ${inputMarkup('phone', { type: 'tel', placeholder: 'e.g. 09171234567', autocomplete: 'tel' })}
          ${errorMarkup('phone')}
        </div>
        <div class="form-group">
          <label for="password" class="form-label">Password <span class="required-indicator">*</span></label>
          ${inputMarkup('password', { type: 'password', placeholder: 'Min. 8 characters', autocomplete: 'new-password' })}
          ${errorMarkup('password')}
        </div>
        <div class="form-group">
          <label for="confirmPassword" class="form-label">Confirm Password <span class="required-indicator">*</span></label>
          ${inputMarkup('confirmPassword', { type: 'password', placeholder: 'Re-enter your password', autocomplete: 'new-password' })}
          ${errorMarkup('confirmPassword')}
        </div>
      </div>
    </div>
  `;
}

function renderFileUpload(fileKey, sideLabel, errorKey) {
  const previewKey = fileKey === 'frontIdImageFile' ? 'frontIdImagePreview' : 'backIdImagePreview';
  const nameKey = fileKey === 'frontIdImageFile' ? 'frontIdImageName' : 'backIdImageName';
  const inputId = fileKey === 'frontIdImageFile' ? 'frontIdImageFileInput' : 'backIdImageFileInput';
  const zoneId = fileKey === 'frontIdImageFile' ? 'frontIdImageUploadZone' : 'backIdImageUploadZone';
  const preview = state.formData[previewKey];

  if (!preview) {
    return `
      <div
        class="file-upload-zone ${fieldError(errorKey) ? 'error-border' : ''}"
        id="${zoneId}"
        role="button"
        tabindex="0"
        data-upload-zone="${fileKey}"
      >
        <div class="upload-icon">&#128203;</div>
        <span class="register-upload-text">Click to select ${escapeHtml(sideLabel)} image</span>
        <span class="register-upload-note">PNG, JPG, WebP or HEIC only</span>
        <input
          type="file"
          id="${inputId}"
          class="register-hidden-file-input"
          accept="image/*"
          data-file-input="${fileKey}"
        />
      </div>
    `;
  }

  return `
    <div class="preview-container">
      <button type="button" class="preview-remove-btn" data-remove-file="${fileKey}" aria-label="Remove ${escapeHtml(sideLabel)} ID image">&times;</button>
      <img src="${escapeHtml(preview)}" alt="${escapeHtml(sideLabel)} ID Preview" class="preview-image" />
      <span class="preview-filename">${escapeHtml(state.formData[nameKey])}</span>
    </div>
  `;
}

function renderUploadProgress() {
  if (!state.isSubmitting || state.uploadProgress === null) {
    return '';
  }

  const progress = Math.max(0, Math.min(100, Number(state.uploadProgress) || 0));

  return `
    <div class="register-upload-progress" role="status" aria-live="polite">
      <div class="register-upload-progress-copy">
        <span>Uploading ID images</span>
        <span data-upload-progress-value>${progress}%</span>
      </div>
      <div class="register-upload-progress-bar" aria-hidden="true">
        <span class="register-upload-progress-fill" style="width: ${progress}%"></span>
      </div>
    </div>
  `;
}

function renderStepThree() {
  return `
    <div class="form-step-content">
      <div class="form-group">
        <label for="idType" class="form-label">Select Valid Identity Document <span class="required-indicator">*</span></label>
        ${selectMarkup('idType', ['National ID', "Driver's License", 'PhilHealth ID'])}
        ${errorMarkup('idType')}
      </div>
      <div class="upload-grid">
        <div class="form-group">
          <label class="form-label">Upload ${escapeHtml(state.formData.idType)} Front Image <span class="required-indicator">*</span></label>
          ${renderFileUpload('frontIdImageFile', 'Front', 'frontIdImage')}
          ${errorMarkup('frontIdImage')}
        </div>
        <div class="form-group">
          <label class="form-label">Upload ${escapeHtml(state.formData.idType)} Back Image <span class="required-indicator">*</span></label>
          ${renderFileUpload('backIdImageFile', 'Back', 'backIdImage')}
          ${errorMarkup('backIdImage')}
        </div>
      </div>
      ${renderUploadProgress()}
      <div class="form-group register-id-number-group">
        <label for="idNumber" class="form-label">ID Number <span class="required-indicator">*</span></label>
        ${inputMarkup('idNumber', { placeholder: 'e.g. 1234-56789-0' })}
        ${errorMarkup('idNumber')}
      </div>
    </div>
  `;
}

function renderCurrentStep() {
  if (state.currentStep === 1) {
    return renderStepOne();
  }

  if (state.currentStep === 2) {
    return renderStepTwo();
  }

  return renderStepThree();
}

function renderNavigation() {
  const previous = state.currentStep > 1
    ? '<button type="button" class="btn btn-secondary" id="registerPrevButton">&larr; Previous</button>'
    : '<div></div>';
  const next = state.currentStep < 3
    ? '<button type="button" class="btn btn-primary" id="registerNextButton">Next &rarr;</button>'
    : `<button type="submit" class="btn btn-primary register-submit-success" ${state.isSubmitting ? 'disabled' : ''}>${state.isSubmitting ? 'Submitting...' : 'Submit Registration'}</button>`;

  return `
    <div class="form-navigation">
      ${previous}
      ${next}
    </div>
  `;
}

function renderSubmitted() {
  return `
    <main class="register-container">
      ${toastMarkup()}
      <div class="card success-card">
        <div class="success-icon-wrapper"><i class="fa-solid fa-circle-check"></i></div>
        <h2 class="success-title">Registration submitted</h2>
        <p class="success-message">
          Your civilian account request has been sent to the ResQMesh admin team for verification.
          Please wait for the approval or decline confirmation through the email address you entered.
        </p>
        <p class="success-message">
          Once approved, your account can be used for online access and mesh-supported emergency fallback access.
        </p>
        <a href="/" class="btn btn-primary">Return to Homepage</a>
      </div>
    </main>
  `;
}

function renderForm() {
  const alert = state.submitError
    ? `<div class="alert alert-warning"><i class="fa-solid fa-triangle-exclamation"></i><span>${escapeHtml(state.submitError)}</span></div>`
    : '';
  const cardClass = state.hasAnimatedForm ? 'card register-card register-card-stable' : 'card register-card';

  return `
    <main class="register-container">
      ${toastMarkup()}
      <div class="${cardClass}">
        <div class="register-intro">
          <span class="register-kicker">Civilian account registration</span>
          <h2>Prepare your ResQMesh access before an emergency</h2>
          <p>
            Submit your profile for admin approval. Approved civilian records can be used for online access when internet is available
            and for mesh-supported emergency access when internet service is unavailable.
          </p>
        </div>
        ${renderStepIndicators()}
        <form id="registrationForm" novalidate>
          ${alert}
          ${renderCurrentStep()}
          ${renderNavigation()}
          <div class="register-account-help">
            <a href="/forgot-password">Forgot your password? Reset it here.</a>
          </div>
        </form>
      </div>
    </main>
  `;
}

function render() {
  if (!registerRootElement) {
    return;
  }

  registerRootElement.innerHTML = state.submitted ? renderSubmitted() : renderForm();
  bindFormEvents();

  if (!state.submitted && !state.hasAnimatedForm) {
    state.hasAnimatedForm = true;
    window.setTimeout(() => {
      document.querySelector('.register-card')?.classList.add('register-card-stable');
    }, 580);
  }
}

function setPreviewFile(fileKey, file) {
  const isFront = fileKey === 'frontIdImageFile';
  const nameKey = isFront ? 'frontIdImageName' : 'backIdImageName';
  const previewKey = isFront ? 'frontIdImagePreview' : 'backIdImagePreview';
  const previousUrl = previewObjectUrls[previewKey];

  if (previousUrl) {
    URL.revokeObjectURL(previousUrl);
  }

  const previewUrl = URL.createObjectURL(file);
  previewObjectUrls[previewKey] = previewUrl;
  state.formData[fileKey] = file;
  state.formData[nameKey] = file.name;
  state.formData[previewKey] = previewUrl;
}

function clearPreviewFile(fileKey) {
  const isFront = fileKey === 'frontIdImageFile';
  const nameKey = isFront ? 'frontIdImageName' : 'backIdImageName';
  const previewKey = isFront ? 'frontIdImagePreview' : 'backIdImagePreview';
  const previousUrl = previewObjectUrls[previewKey];

  if (previousUrl) {
    URL.revokeObjectURL(previousUrl);
  }

  previewObjectUrls[previewKey] = '';
  state.formData[fileKey] = null;
  state.formData[nameKey] = '';
  state.formData[previewKey] = '';
}

function updateUploadProgressDom(percent) {
  const progress = Math.max(0, Math.min(100, Number(percent) || 0));
  const fill = document.querySelector('.register-upload-progress-fill');
  const value = document.querySelector('[data-upload-progress-value]');

  if (fill) {
    fill.style.width = `${progress}%`;
  }

  if (value) {
    value.textContent = `${progress}%`;
  }
}

function updateFieldErrorDom(field) {
  const input = document.getElementById(field);
  const errorElement = document.querySelector(`[data-error-for="${field}"]`);
  const uploadZone = ['frontIdImage', 'backIdImage'].includes(field)
    ? document.getElementById(registerConfig.fieldTargets[field])
    : null;

  input?.classList.remove('error-border');
  uploadZone?.classList.remove('error-border');
  errorElement?.remove();
}

function handleFieldInput(event) {
  const field = event.target.id;

  if (!Object.prototype.hasOwnProperty.call(state.formData, field)) {
    return;
  }

  state.formData[field] = event.target.value;

  if (state.errors[field]) {
    delete state.errors[field];
    updateFieldErrorDom(field);
  }

  if (field === 'birthDate') {
    render();
  }
}

function openBirthDatePicker(event) {
  if (event) {
    event.stopPropagation();
  }

  const input = document.getElementById('birthDate');

  if (!input) {
    return;
  }

  if (typeof input.showPicker === 'function') {
    input.showPicker();
    return;
  }

  input.focus();
}

function validateStep1() {
  const stepErrors = {};
  const required = ['firstName', 'lastName', 'birthDate', 'username', 'streetAddress', 'barangay', 'occupation', 'bloodType'];

  required.forEach((field) => {
    if (!state.formData[field] || state.formData[field].trim() === '') {
      stepErrors[field] = 'This field is required.';
    }
  });

  const birthDate = registerUtils.parseBirthDate(state.formData.birthDate);
  const age = registerUtils.calculateAge(state.formData.birthDate);

  if (state.formData.birthDate && !birthDate) {
    stepErrors.birthDate = 'Please enter a valid birthdate.';
  } else if (birthDate && birthDate > new Date()) {
    stepErrors.birthDate = 'Birthdate cannot be in the future.';
  } else if (age !== null && age < 18) {
    stepErrors.birthDate = 'You must be at least 18 years old to register.';
  }

  return stepErrors;
}

function validateStep2() {
  const stepErrors = {};
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phoneRegex = /^(09|\+639)\d{9}$/;

  if (!state.formData.email) {
    stepErrors.email = 'Email is required.';
  } else if (!emailRegex.test(state.formData.email)) {
    stepErrors.email = 'Please enter a valid email address.';
  }

  if (!state.formData.phone) {
    stepErrors.phone = 'Phone number is required.';
  } else if (!phoneRegex.test(state.formData.phone)) {
    stepErrors.phone = 'Please enter a valid mobile number (e.g., 09171234567).';
  }

  if (!state.formData.password) {
    stepErrors.password = 'Password is required.';
  } else if (state.formData.password.length < 8) {
    stepErrors.password = 'Password must be at least 8 characters long.';
  }

  if (!state.formData.confirmPassword) {
    stepErrors.confirmPassword = 'Please confirm your password.';
  } else if (state.formData.password !== state.formData.confirmPassword) {
    stepErrors.confirmPassword = 'Passwords do not match.';
  }

  return stepErrors;
}

function validateStep3() {
  const stepErrors = {};

  if (!state.formData.idType) {
    stepErrors.idType = 'ID Type is required.';
  }

  if (!state.formData.idNumber || state.formData.idNumber.trim() === '') {
    stepErrors.idNumber = 'ID Number is required.';
  }

  if (!state.formData.frontIdImageFile) {
    stepErrors.frontIdImage = 'Front ID image card is required.';
  }

  if (!state.formData.backIdImageFile) {
    stepErrors.backIdImage = 'Back ID image card is required.';
  }

  return stepErrors;
}

function showValidationErrors(errorMap, step = state.currentStep) {
  const field = registerUtils.firstErrorField(errorMap, step);
  const message = field && errorMap[field]
    ? errorMap[field]
    : 'Please complete the required fields before continuing.';

  showToast(message, 'error');
  scrollToField(field);
}

function handleNext() {
  const stepErrors = state.currentStep === 1 ? validateStep1() : validateStep2();

  if (Object.keys(stepErrors).length === 0) {
    state.errors = {};
    state.currentStep += 1;
    render();
    scrollRegistrationToTop();
    return;
  }

  setErrors(stepErrors);
  showValidationErrors(stepErrors, state.currentStep);
}

function handlePrev() {
  state.errors = {};
  state.currentStep -= 1;
  render();
  scrollRegistrationToTop();
}

function handleFileChange(event, fileKey) {
  const file = event.target.files[0];

  if (!file) {
    return;
  }

  const errorKey = fileKey === 'frontIdImageFile' ? 'frontIdImage' : 'backIdImage';

  if (!file.type.startsWith('image/')) {
    state.errors[errorKey] = 'Only image files are allowed.';
    event.target.value = '';
    render();
    showToast('Only image files are allowed.', 'error');
    scrollToField(errorKey);
    return;
  }

  if (file.size > registerConfig.maxIdImageSizeBytes) {
    const message = 'ID images must be 5MB or smaller.';
    state.errors[errorKey] = message;
    event.target.value = '';
    render();
    showToast(message, 'error');
    scrollToField(errorKey);
    return;
  }

  setPreviewFile(fileKey, file);
  delete state.errors[errorKey];
  render();
}

function removeFile(fileKey) {
  clearPreviewFile(fileKey);
  render();
}

function handleServerError(message) {
  const safeMessage = message || 'Registration failed. Please try again.';
  const field = registerUtils.mapServerErrorToField(safeMessage);

  state.submitError = safeMessage;
  showToast(safeMessage, 'error');

  if (!field) {
    render();
    scrollRegistrationToTop();
    return;
  }

  const fieldStep = registerConfig.fieldSteps[field] || state.currentStep;
  state.errors = {
    ...state.errors,
    [field]: safeMessage
  };

  if (fieldStep !== state.currentStep) {
    state.currentStep = fieldStep;
  }

  render();
  scrollToField(field);
}

async function handleSubmit(event) {
  event.preventDefault();

  if (state.isSubmitting) {
    return;
  }

  state.submitError = '';
  const stepErrors = validateStep3();

  if (Object.keys(stepErrors).length > 0) {
    setErrors(stepErrors);
    showValidationErrors(stepErrors, 3);
    return;
  }

  const payload = new FormData();
  [
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
  ].forEach((field) => {
    payload.append(field, state.formData[field] || '');
  });

  try {
    state.isSubmitting = true;
    state.uploadProgress = 0;
    render();

    const recaptchaToken = await registerUtils.timeoutPromise(
      window.ResQMeshRecaptcha.ready().then(() => window.ResQMeshRecaptcha.getToken('register')),
      registerConfig.recaptchaTimeoutMs,
      'Security verification timed out. Please refresh the page and try again.'
    );

    payload.append('recaptchaToken', recaptchaToken);
    payload.append('frontIdImageFile', state.formData.frontIdImageFile);
    payload.append('backIdImageFile', state.formData.backIdImageFile);

    await registerUtils.fetchRegistration(payload, {
      onProgress: (percent) => {
        state.uploadProgress = percent === null ? 100 : percent;
        updateUploadProgressDom(state.uploadProgress);
      }
    });

    state.uploadProgress = 100;
    state.submitted = true;
    state.submitError = '';
    showToast('Registration submitted. Please check your email for account confirmation after admin review.', 'success');
  } catch (error) {
    handleServerError(error.message);
  } finally {
    state.isSubmitting = false;
    window.setTimeout(() => {
      state.uploadProgress = null;
      render();
    }, 500);
  }
}

function bindFormEvents() {
  const form = document.getElementById('registrationForm');
  const nextButton = document.getElementById('registerNextButton');
  const prevButton = document.getElementById('registerPrevButton');
  const birthDatePicker = document.getElementById('birthDatePicker');
  const birthDateButton = document.getElementById('birthDateButton');

  if (form) {
    form.addEventListener('submit', handleSubmit);
  }

  if (nextButton) {
    nextButton.addEventListener('click', handleNext);
  }

  if (prevButton) {
    prevButton.addEventListener('click', handlePrev);
  }

  document.querySelectorAll('input[id], select[id], textarea[id]').forEach((input) => {
    if (input.type === 'file') {
      return;
    }

    input.addEventListener(input.tagName === 'SELECT' ? 'change' : 'input', handleFieldInput);
  });

  document.querySelectorAll('[data-file-input]').forEach((input) => {
    input.addEventListener('change', (event) => handleFileChange(event, input.dataset.fileInput));
  });

  document.querySelectorAll('[data-upload-zone]').forEach((zone) => {
    zone.addEventListener('click', () => {
      const input = document.querySelector(`[data-file-input="${zone.dataset.uploadZone}"]`);
      input?.click();
    });

    zone.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        const input = document.querySelector(`[data-file-input="${zone.dataset.uploadZone}"]`);
        input?.click();
      }
    });
  });

  document.querySelectorAll('[data-remove-file]').forEach((button) => {
    button.addEventListener('click', () => removeFile(button.dataset.removeFile));
  });

  if (birthDatePicker) {
    birthDatePicker.addEventListener('click', openBirthDatePicker);
  }

  if (birthDateButton) {
    birthDateButton.addEventListener('click', openBirthDatePicker);
  }
}

if (!registerConfig || !registerUtils) {
  showRegisterBootstrapError('The registration page could not load its required configuration.');
} else if (!registerRootElement) {
  throw new Error('ResQMesh registration bootstrap failed: #register-root was not found.');
} else {
  window.ResQMeshRecaptcha?.ready?.().catch(() => {
    // The submit handler will show the actionable security error if needed.
  });
  render();
}
