(function defineRegisterEventsModule() {
  const modules = window.ResQMeshRegisterModules = window.ResQMeshRegisterModules || {};

  function createEvents(context) {
    const {
      state,
      markup,
      validation,
      uploads,
      submit
    } = context;

    function handleFieldInput(event) {
      const field = event.target.id;

      if (!Object.prototype.hasOwnProperty.call(state.formData, field)) {
        return;
      }

      state.formData[field] = event.target.type === 'checkbox'
        ? event.target.checked
        : event.target.value;

      if (state.errors[field]) {
        delete state.errors[field];
        markup.updateFieldErrorDom(field);
      }

      if (field === 'birthDate' || field === 'idType') {
        markup.render();
        return;
      }

      if (field === 'password' || field === 'confirmPassword') {
        updatePasswordFeedback();
      }
    }

    function updatePasswordFeedback() {
      const password = state.formData.password;
      const confirmation = state.formData.confirmPassword;
      const rules = {
        length: {
          element: document.querySelector('[data-password-rule="length"]'),
          valid: password.length >= 8,
          hasValue: password.length > 0
        },
        match: {
          element: document.querySelector('[data-password-rule="match"]'),
          valid: confirmation.length > 0 && password === confirmation,
          hasValue: confirmation.length > 0
        }
      };

      Object.values(rules).forEach(({ element, valid, hasValue }) => {
        if (!element) return;
        element.classList.toggle('is-valid', hasValue && valid);
        element.classList.toggle('is-invalid', hasValue && !valid);
        element.classList.toggle('is-pending', !hasValue);
        const icon = element.querySelector('i');
        icon?.classList.remove('fa-circle', 'fa-circle-check', 'fa-circle-xmark');
        icon?.classList.add(!hasValue ? 'fa-circle' : valid ? 'fa-circle-check' : 'fa-circle-xmark');
      });

      const matchLabel = document.querySelector('[data-password-match-label]');
      if (matchLabel) {
        matchLabel.textContent = rules.match.hasValue && !rules.match.valid
          ? 'Passwords do not match'
          : 'Passwords match';
      }

      const lengthStatus = document.querySelector('[data-password-rule-status="length"]');
      if (lengthStatus) {
        lengthStatus.textContent = rules.length.valid
          ? 'Password length requirement met.'
          : 'Password must contain at least 8 characters.';
      }

      const matchStatus = document.querySelector('[data-password-rule-status="match"]');
      if (matchStatus) {
        matchStatus.textContent = !rules.match.hasValue
          ? ''
          : rules.match.valid ? 'Passwords match.' : 'Passwords do not match.';
      }
    }

    function togglePasswordVisibility(button) {
      const field = button.dataset.passwordToggle;
      const input = document.getElementById(field);

      if (!input || !Object.prototype.hasOwnProperty.call(state.passwordVisibility, field)) {
        return;
      }

      const visible = !state.passwordVisibility[field];
      state.passwordVisibility[field] = visible;
      input.type = visible ? 'text' : 'password';
      button.setAttribute('aria-pressed', String(visible));
      button.setAttribute('aria-label', `${visible ? 'Hide' : 'Show'} ${field === 'password' ? 'password' : 'confirm password'}`);
      const icon = button.querySelector('i');
      icon?.classList.toggle('fa-eye', !visible);
      icon?.classList.toggle('fa-eye-slash', visible);
      input.focus({ preventScroll: true });
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

    function handleNext() {
      const validators = {
        1: validation.validateStep1,
        2: validation.validateStep2,
        3: validation.validateStep3
      };
      const validate = validators[state.currentStep];

      if (!validate) {
        return;
      }

      const stepErrors = validate();

      if (Object.keys(stepErrors).length === 0) {
        state.errors = {};
        state.currentStep += 1;
        markup.render();
        markup.scrollRegistrationToTop();
        return;
      }

      markup.setErrors(stepErrors);
      validation.showValidationErrors(stepErrors, state.currentStep);
    }

    function handlePrev() {
      if (state.isSubmitting) {
        return;
      }

      state.errors = {};
      state.currentStep -= 1;
      markup.render();
      markup.scrollRegistrationToTop();
    }

    function editReviewStep(step) {
      if (state.isSubmitting || ![1, 2, 3].includes(step)) {
        return;
      }

      state.errors = {};
      state.currentStep = step;
      markup.render();
      markup.scrollRegistrationToTop();
    }

    function bindFormEvents() {
      const form = document.getElementById('registrationForm');
      const nextButton = document.getElementById('registerNextButton');
      const prevButton = document.getElementById('registerPrevButton');
      const birthDatePicker = document.getElementById('birthDatePicker');
      const birthDateButton = document.getElementById('birthDateButton');

      if (form) {
        form.addEventListener('submit', submit.handleSubmit);
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
        input.addEventListener('change', (event) => uploads.handleFileChange(event, input.dataset.fileInput));
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
        button.addEventListener('click', () => uploads.removeFile(button.dataset.removeFile));
      });

      document.querySelectorAll('[data-password-toggle]').forEach((button) => {
        button.addEventListener('click', () => togglePasswordVisibility(button));
      });

      document.querySelectorAll('[data-review-edit-step]').forEach((button) => {
        button.addEventListener('click', () => editReviewStep(Number(button.dataset.reviewEditStep)));
      });

      if (birthDatePicker) {
        birthDatePicker.addEventListener('click', openBirthDatePicker);
      }

      if (birthDateButton) {
        birthDateButton.addEventListener('click', openBirthDatePicker);
      }
    }

    return {
      bindFormEvents,
      handleFieldInput,
      openBirthDatePicker,
      handleNext,
      handlePrev,
      updatePasswordFeedback,
      togglePasswordVisibility,
      editReviewStep
    };
  }

  modules.createEvents = createEvents;
}());
