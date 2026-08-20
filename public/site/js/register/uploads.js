(function defineRegisterUploadsModule() {
  const modules = window.ResQMeshRegisterModules = window.ResQMeshRegisterModules || {};

  function createUploads(context) {
    const {
      registerConfig,
      state,
      previewObjectUrls,
      markup
    } = context;

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

    function handleFileChange(event, fileKey) {
      const file = event.target.files[0];

      if (!file) {
        return;
      }

      const errorKey = fileKey === 'frontIdImageFile' ? 'frontIdImage' : 'backIdImage';

      if (!file.type.startsWith('image/')) {
        state.errors[errorKey] = 'Only image files are allowed.';
        event.target.value = '';
        markup.render();
        markup.showToast('Only image files are allowed.', 'error');
        markup.scrollToField(errorKey);
        return;
      }

      if (file.size > registerConfig.maxIdImageSizeBytes) {
        const message = 'ID images must be 5MB or smaller.';
        state.errors[errorKey] = message;
        event.target.value = '';
        markup.render();
        markup.showToast(message, 'error');
        markup.scrollToField(errorKey);
        return;
      }

      setPreviewFile(fileKey, file);
      delete state.errors[errorKey];
      markup.render();
    }

    function removeFile(fileKey) {
      clearPreviewFile(fileKey);
      markup.render();
    }

    return {
      setPreviewFile,
      clearPreviewFile,
      updateUploadProgressDom,
      handleFileChange,
      removeFile
    };
  }

  modules.createUploads = createUploads;
}());
