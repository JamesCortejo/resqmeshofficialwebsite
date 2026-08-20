(function defineRegisterValidationModule() {
  const modules = window.ResQMeshRegisterModules = window.ResQMeshRegisterModules || {};

  function createValidation(context) {
    const { state, registerUtils, markup } = context;

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

      if (!state.formData.privacyPolicyAccepted) {
        stepErrors.privacyPolicyAccepted = 'Please confirm that you have read and agree to the Privacy Policy.';
      }

      return stepErrors;
    }

    function showValidationErrors(errorMap, step = state.currentStep) {
      const field = registerUtils.firstErrorField(errorMap, step);
      const message = field && errorMap[field]
        ? errorMap[field]
        : 'Please complete the required fields before continuing.';

      markup.showToast(message, 'error');
      markup.scrollToField(field);
    }

    return {
      validateStep1,
      validateStep2,
      validateStep3,
      showValidationErrors
    };
  }

  modules.createValidation = createValidation;
}());
