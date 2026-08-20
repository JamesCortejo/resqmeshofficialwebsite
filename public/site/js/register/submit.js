(function defineRegisterSubmitModule() {
  const modules = window.ResQMeshRegisterModules = window.ResQMeshRegisterModules || {};

  function createSubmit(context) {
    const {
      registerConfig,
      registerUtils,
      state,
      markup,
      validation,
      uploads
    } = context;

    function handleServerError(message) {
      const safeMessage = message || 'Registration failed. Please try again.';
      const field = registerUtils.mapServerErrorToField(safeMessage);

      state.submitError = safeMessage;
      markup.showToast(safeMessage, 'error');

      if (!field) {
        markup.render();
        markup.scrollRegistrationToTop();
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

      markup.render();
      markup.scrollToField(field);
    }

    function buildRegistrationPayload() {
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
      payload.append('privacyPolicyAccepted', state.formData.privacyPolicyAccepted ? 'true' : 'false');

      return payload;
    }

    async function handleSubmit(event) {
      event.preventDefault();

      if (state.isSubmitting) {
        return;
      }

      state.submitError = '';
      const stepErrors = validation.validateStep3();

      if (Object.keys(stepErrors).length > 0) {
        markup.setErrors(stepErrors);
        validation.showValidationErrors(stepErrors, 3);
        return;
      }

      const payload = buildRegistrationPayload();

      try {
        state.isSubmitting = true;
        state.uploadProgress = 0;
        markup.render();

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
            uploads.updateUploadProgressDom(state.uploadProgress);
          }
        });

        state.uploadProgress = 100;
        state.submitted = true;
        state.submitError = '';
        markup.showToast('Registration submitted. Please check your email for account confirmation after admin review.', 'success');
      } catch (error) {
        handleServerError(error.message);
      } finally {
        state.isSubmitting = false;
        window.setTimeout(() => {
          state.uploadProgress = null;
          markup.render();
        }, 500);
      }
    }

    return {
      handleServerError,
      buildRegistrationPayload,
      handleSubmit
    };
  }

  modules.createSubmit = createSubmit;
}());
