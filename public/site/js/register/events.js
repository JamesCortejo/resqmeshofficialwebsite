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

      if (field === 'birthDate') {
        markup.render();
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

    function handleNext() {
      const stepErrors = state.currentStep === 1 ? validation.validateStep1() : validation.validateStep2();

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
      state.errors = {};
      state.currentStep -= 1;
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
      handlePrev
    };
  }

  modules.createEvents = createEvents;
}());
