(function defineRegisterMarkupModule() {
  const modules = window.ResQMeshRegisterModules = window.ResQMeshRegisterModules || {};

  function createMarkup(context) {
    const {
      registerRootElement,
      registerConfig,
      registerUtils,
      state,
      transient
    } = context;
    const valenciaBarangays = registerConfig?.barangays || [];
    let bindFormEvents = () => {};

    function escapeHtml(value) {
      return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    function setBindFormEvents(nextBindFormEvents) {
      bindFormEvents = typeof nextBindFormEvents === 'function' ? nextBindFormEvents : () => {};
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
      window.clearTimeout(transient.toastTimer);
      state.toast = { message, tone };
      render();

      transient.toastTimer = window.setTimeout(() => {
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
      return message
        ? `<span class="form-error-msg" id="${escapeHtml(field)}Error" data-error-for="${escapeHtml(field)}">${escapeHtml(message)}</span>`
        : '';
    }

    function fieldAccessibilityMarkup(field, describedBy = '') {
      const ids = [describedBy, fieldError(field) ? `${field}Error` : ''].filter(Boolean).join(' ');
      return `${fieldError(field) ? 'aria-invalid="true"' : 'aria-invalid="false"'}${ids ? ` aria-describedby="${escapeHtml(ids)}"` : ''}`;
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
          ${fieldAccessibilityMarkup(field, options.describedBy || '')}
        />
      `;
    }

    function textareaMarkup(field, options = {}) {
      return `
        <textarea
          id="${escapeHtml(field)}"
          class="${escapeHtml(fieldClass(field))}"
          rows="${escapeHtml(options.rows || 2)}"
          placeholder="${escapeHtml(options.placeholder || '')}"
          ${fieldAccessibilityMarkup(field, options.describedBy || '')}
        >${escapeHtml(state.formData[field])}</textarea>
      `;
    }

    function selectMarkup(field, options, placeholder = '') {
      return `
        <select
          id="${escapeHtml(field)}"
          class="${escapeHtml(fieldClass(field))}"
          ${fieldAccessibilityMarkup(field)}
        >
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
      const steps = ['Personal Information', 'Account Details', 'ID Verification', 'Review and Submit'];
      const progressPercent = ((state.currentStep - 1) / (steps.length - 1)) * 100;

      return `
        <nav class="register-progress" aria-label="Registration progress">
          <ol class="steps-container">
            <li class="steps-progress-bar" style="width: ${progressPercent}%" aria-hidden="true"></li>
            ${steps.map((label, index) => {
              const step = index + 1;
              const completed = state.currentStep > step;
              const current = state.currentStep === step;
              return `
                <li
                  class="step-indicator${current ? ' active' : ''}${completed ? ' completed' : ''}"
                  ${current ? 'aria-current="step"' : ''}
                  aria-label="Step ${step}: ${escapeHtml(label)}${completed ? ', completed' : current ? ', current' : ''}"
                >
                  <span aria-hidden="true">${completed ? '<i class="fa-solid fa-check"></i>' : step}</span>
                  <span class="step-label">${escapeHtml(label)}</span>
                </li>
              `;
            }).join('')}
          </ol>
        </nav>
      `;
    }

    function renderCurrentStepHeading() {
      const steps = [
        ['Personal Information', 'Tell us who you are and provide information responders may need.'],
        ['Account Details', 'Add your contact details and create a password for the ResQMesh app.'],
        ['ID Verification', 'Upload a clear copy of your selected identity document.'],
        ['Review and Submit', 'Confirm your information before sending it for administrator approval.']
      ];
      const [title, description] = steps[state.currentStep - 1];

      return `
        <header class="register-step-heading">
          <span>Step ${state.currentStep} of ${steps.length}</span>
          <h3>${escapeHtml(title)}</h3>
          <p>${escapeHtml(description)}</p>
        </header>
      `;
    }

    function renderStepOne() {
      const computedAge = registerUtils.calculateAge(state.formData.birthDate);
      const ageHelp = computedAge !== null && computedAge >= 18 && !fieldError('birthDate')
        ? `<span class="form-help-msg">Age: ${computedAge}</span>`
        : '';

      return `
        <div class="form-step-content">
          <section class="register-field-section" aria-labelledby="personalDetailsHeading">
            <div class="register-section-header">
              <i class="fa-solid fa-user" aria-hidden="true"></i>
              <div><h4 id="personalDetailsHeading">Personal details</h4><p>Your legal name and civilian profile identity.</p></div>
            </div>
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
              <div class="form-group form-grid-full">
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
                    ${fieldAccessibilityMarkup('birthDate', 'birthDateHelp')}
                  />
                  <button type="button" class="birthdate-picker-button" id="birthDateButton" aria-label="Open birthdate calendar">
                    <i class="fa-solid fa-chevron-down" aria-hidden="true"></i>
                  </button>
                </div>
                <span id="birthDateHelp" class="form-help-msg">Open the calendar and select month, day, and year.</span>
                ${ageHelp}
                ${errorMarkup('birthDate')}
              </div>
            </div>
          </section>
          <section class="register-field-section" aria-labelledby="addressDetailsHeading">
            <div class="register-section-header">
              <i class="fa-solid fa-location-dot" aria-hidden="true"></i>
              <div><h4 id="addressDetailsHeading">Address and occupation</h4><p>Information used to identify your Valencia City location.</p></div>
            </div>
            <div class="form-grid">
              <div class="form-group form-grid-full">
                <label for="streetAddress" class="form-label">House No. / Street / Purok <span class="required-indicator">*</span></label>
                ${inputMarkup('streetAddress', { placeholder: 'e.g. Purok 4, Sayre Highway' })}
                ${errorMarkup('streetAddress')}
              </div>
              <div class="form-group">
                <label for="barangay" class="form-label">Barangay (Valencia City) <span class="required-indicator">*</span></label>
                ${selectMarkup('barangay', valenciaBarangays, '-- Select Barangay --')}
                ${errorMarkup('barangay')}
              </div>
              <div class="form-group">
                <label for="occupation" class="form-label">Occupation <span class="required-indicator">*</span></label>
                ${inputMarkup('occupation', { placeholder: 'e.g. Farmer, Teacher, Rescuer' })}
                ${errorMarkup('occupation')}
              </div>
            </div>
          </section>
          <section class="register-field-section" aria-labelledby="medicalDetailsHeading">
            <div class="register-section-header">
              <i class="fa-solid fa-notes-medical" aria-hidden="true"></i>
              <div><h4 id="medicalDetailsHeading">Medical information</h4><p>Details that may assist authorized responders during an emergency.</p></div>
            </div>
            <div class="form-grid">
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
          </section>
        </div>
      `;
    }

    function renderPasswordField(field, label, placeholder) {
      const visible = Boolean(state.passwordVisibility[field]);
      const inputType = visible ? 'text' : 'password';
      const error = fieldError(field);
      const isPassword = field === 'password';
      const hasValue = state.formData[field].length > 0;
      const ruleIsValid = isPassword
        ? state.formData.password.length >= 8
        : state.formData.confirmPassword.length > 0 && state.formData.password === state.formData.confirmPassword;
      const ruleId = isPassword ? 'passwordLengthRequirement' : 'passwordMatchRequirement';
      const ruleName = isPassword ? 'length' : 'match';
      const ruleText = isPassword
        ? 'At least 8 characters'
        : hasValue && !ruleIsValid ? 'Passwords do not match' : 'Passwords match';
      const statusText = isPassword
        ? ruleIsValid ? 'Password length requirement met.' : 'Password must contain at least 8 characters.'
        : !hasValue ? '' : ruleIsValid ? 'Passwords match.' : 'Passwords do not match.';

      return `
        <div class="form-group">
          <label for="${field}" class="form-label">${escapeHtml(label)} <span class="required-indicator">*</span></label>
          <div class="register-password-control${error ? ' error-border' : ''}">
            <input
              type="${inputType}"
              id="${field}"
              value="${escapeHtml(state.formData[field])}"
              class="form-control"
              placeholder="${escapeHtml(placeholder)}"
              autocomplete="new-password"
              ${fieldAccessibilityMarkup(field, ruleId)}
            />
            <button
              type="button"
              class="register-password-toggle"
              data-password-toggle="${field}"
              aria-controls="${field}"
              aria-pressed="${visible}"
              aria-label="${visible ? 'Hide' : 'Show'} ${escapeHtml(label.toLowerCase())}"
            >
              <i class="fa-solid ${visible ? 'fa-eye-slash' : 'fa-eye'}" aria-hidden="true"></i>
            </button>
          </div>
          <p
            class="register-password-rule ${passwordFeedbackClass(ruleIsValid, hasValue)}"
            id="${ruleId}"
            data-password-rule="${ruleName}"
            aria-live="polite"
          >
            <i class="fa-solid ${passwordFeedbackIcon(ruleIsValid, hasValue)}" aria-hidden="true"></i>
            <span${isPassword ? '' : ' data-password-match-label'}>${ruleText}</span>
            <span class="sr-only" data-password-rule-status="${ruleName}">${statusText}</span>
          </p>
          ${errorMarkup(field)}
        </div>
      `;
    }

    function passwordFeedbackClass(condition, hasValue) {
      if (!hasValue) return 'is-pending';
      return condition ? 'is-valid' : 'is-invalid';
    }

    function passwordFeedbackIcon(condition, hasValue) {
      if (!hasValue) return 'fa-circle';
      return condition ? 'fa-circle-check' : 'fa-circle-xmark';
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
            ${renderPasswordField('password', 'Password', 'Min. 8 characters')}
            ${renderPasswordField('confirmPassword', 'Confirm Password', 'Re-enter your password')}
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
            ${fieldAccessibilityMarkup(errorKey, `${zoneId}Help`)}
          >
            <div class="upload-icon"><i class="fa-solid fa-id-card" aria-hidden="true"></i></div>
            <span class="register-upload-text">Click to select ${escapeHtml(sideLabel)} image</span>
            <span class="register-upload-note" id="${zoneId}Help">Clear, readable and uncropped. PNG, JPG, WebP or HEIC, up to 5 MB.</span>
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
        <div class="preview-container is-uploaded" role="group" aria-label="${escapeHtml(sideLabel)} ID image uploaded">
          <button type="button" class="preview-remove-btn" data-remove-file="${fileKey}" aria-label="Remove ${escapeHtml(sideLabel)} ID image">&times;</button>
          <img src="${escapeHtml(preview)}" alt="${escapeHtml(sideLabel)} ID Preview" class="preview-image" />
          <span class="register-upload-status"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> ${escapeHtml(sideLabel)} uploaded</span>
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

    function renderPrivacyConsent() {
      return `
        <div class="register-privacy-consent ${fieldError('privacyPolicyAccepted') ? 'error-border' : ''}">
          <input
            type="checkbox"
            id="privacyPolicyAccepted"
            ${state.formData.privacyPolicyAccepted ? 'checked' : ''}
            ${fieldAccessibilityMarkup('privacyPolicyAccepted')}
          />
          <label for="privacyPolicyAccepted">
            I have read and agree to the ResQMesh
            <a href="/privacy-policy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.
            <span class="required-indicator">*</span>
          </label>
        </div>
        ${errorMarkup('privacyPolicyAccepted')}
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
          ${renderPrivacyConsent()}
        </div>
      `;
    }

    function reviewValue(value, fallback = 'Not provided') {
      const normalized = String(value || '').trim();
      return escapeHtml(normalized || fallback);
    }

    function renderReviewRows(rows) {
      return rows.map(([label, value]) => `
        <div class="register-review-row">
          <dt>${escapeHtml(label)}</dt>
          <dd>${reviewValue(value)}</dd>
        </div>
      `).join('');
    }

    function renderReviewCard(title, icon, step, rows, extra = '', className = '') {
      return `
        <section class="register-review-card${className ? ` ${escapeHtml(className)}` : ''}">
          <div class="register-review-card-header">
            <span><i class="fa-solid ${escapeHtml(icon)}" aria-hidden="true"></i></span>
            <h4>${escapeHtml(title)}</h4>
            <button type="button" data-review-edit-step="${step}" aria-label="Edit ${escapeHtml(title)}" ${state.isSubmitting ? 'disabled' : ''}>Edit</button>
          </div>
          ${rows.length ? `<dl>${renderReviewRows(rows)}</dl>` : ''}
          ${extra}
        </section>
      `;
    }

    function renderReviewImage(side, preview, filename) {
      return `
        <figure class="register-review-image">
          <img src="${escapeHtml(preview)}" alt="${escapeHtml(side)} ID image selected for registration" />
          <figcaption><strong>${escapeHtml(side)}</strong><span>${reviewValue(filename)}</span></figcaption>
        </figure>
      `;
    }

    function renderStepFour() {
      const fullName = [state.formData.firstName, state.formData.middleName, state.formData.lastName]
        .filter(Boolean)
        .join(' ');
      const address = `${state.formData.streetAddress}, Barangay ${state.formData.barangay}, Valencia City`;
      const idImages = `
        <div class="register-review-images">
          ${renderReviewImage('Front', state.formData.frontIdImagePreview, state.formData.frontIdImageName)}
          ${renderReviewImage('Back', state.formData.backIdImagePreview, state.formData.backIdImageName)}
        </div>
      `;

      return `
        <div class="form-step-content register-review-step">
          <div class="register-review-grid">
            ${renderReviewCard('Personal details', 'fa-user', 1, [
              ['Full name', fullName],
              ['Birthdate', state.formData.birthDate]
            ])}
            ${renderReviewCard('Address and occupation', 'fa-location-dot', 1, [
              ['Address', address],
              ['Occupation', state.formData.occupation]
            ])}
            ${renderReviewCard('Medical information', 'fa-notes-medical', 1, [
              ['Blood type', state.formData.bloodType],
              ['Medical complications', state.formData.medicalComplications || 'None provided'],
              ['Allergies', state.formData.allergies || 'None provided']
            ])}
            ${renderReviewCard('Account details', 'fa-shield-halved', 2, [
              ['Username', state.formData.username],
              ['Email', state.formData.email],
              ['Phone', state.formData.phone],
              ['Password', 'Created and hidden for security']
            ])}
            ${renderReviewCard('Identity verification', 'fa-id-card', 3, [
              ['ID type', state.formData.idType],
              ['ID number', state.formData.idNumber]
            ], idImages)}
            ${renderReviewCard('Privacy consent', 'fa-file-shield', 3, [], `
              <p class="register-review-consent"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> Privacy Policy accepted</p>
            `, 'is-compact')}
          </div>
          ${renderUploadProgress()}
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

      if (state.currentStep === 3) {
        return renderStepThree();
      }

      return renderStepFour();
    }

    function renderNavigation() {
      const previous = state.currentStep > 1
        ? `<button type="button" class="btn btn-secondary" id="registerPrevButton" ${state.isSubmitting ? 'disabled' : ''}>&larr; Previous</button>`
        : '<span class="form-navigation-spacer" aria-hidden="true"></span>';
      const next = state.currentStep < 4
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
              <h2>Create your civilian account</h2>
              <p>Complete the four steps below to submit your profile for administrator approval.</p>
            </div>
            ${renderStepIndicators()}
            <form id="registrationForm" novalidate>
              ${alert}
              ${renderCurrentStepHeading()}
              ${renderCurrentStep()}
              ${renderNavigation()}
              <div class="register-account-help">
                <span>Already registered?</span>
                <a href="/download">Download the app to sign in.</a>
                <span class="register-account-divider" aria-hidden="true">&bull;</span>
                <a href="/forgot-password">Forgot your password?</a>
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

    function updateFieldErrorDom(field) {
      const input = document.getElementById(field);
      const errorElement = document.querySelector(`[data-error-for="${field}"]`);
      const uploadZone = ['frontIdImage', 'backIdImage'].includes(field)
        ? document.getElementById(registerConfig.fieldTargets[field])
        : null;

      input?.classList.remove('error-border');
      input?.setAttribute('aria-invalid', 'false');
      const persistentDescriptions = {
        birthDate: 'birthDateHelp',
        password: 'passwordLengthRequirement',
        confirmPassword: 'passwordMatchRequirement'
      };
      if (input && persistentDescriptions[field]) {
        input.setAttribute('aria-describedby', persistentDescriptions[field]);
      } else {
        input?.removeAttribute('aria-describedby');
      }
      input?.closest('.register-password-control')?.classList.remove('error-border');
      uploadZone?.classList.remove('error-border');
      uploadZone?.setAttribute('aria-invalid', 'false');
      if (uploadZone) {
        uploadZone.setAttribute('aria-describedby', `${uploadZone.id}Help`);
      }
      errorElement?.remove();
    }

    return {
      escapeHtml,
      showRegisterBootstrapError,
      scrollRegistrationToTop,
      scrollToField,
      showToast,
      setErrors,
      render,
      setBindFormEvents,
      updateFieldErrorDom
    };
  }

  modules.createMarkup = createMarkup;
}());
