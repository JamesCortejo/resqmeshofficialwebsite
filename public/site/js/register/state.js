(function defineRegisterStateModule() {
  const modules = window.ResQMeshRegisterModules = window.ResQMeshRegisterModules || {};

  function createState() {
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
        backIdImagePreview: '',
        privacyPolicyAccepted: false
      }
    };

    const previewObjectUrls = {
      frontIdImagePreview: '',
      backIdImagePreview: ''
    };

    const transient = {
      toastTimer: null
    };

    function cleanupPreviewUrls() {
      Object.values(previewObjectUrls).forEach((url) => {
        if (url) {
          URL.revokeObjectURL(url);
        }
      });
    }

    window.addEventListener('beforeunload', cleanupPreviewUrls);

    return {
      state,
      previewObjectUrls,
      transient,
      cleanupPreviewUrls
    };
  }

  modules.createState = createState;
}());
