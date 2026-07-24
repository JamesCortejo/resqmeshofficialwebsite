(function defineRegisterUtils() {
  function firstErrorField(errorMap, step) {
    const config = window.ResQMeshRegisterConfig || {};
    const order = (config.stepFieldOrder && config.stepFieldOrder[step]) || Object.keys(config.fieldSteps || {});
    return order.find((field) => errorMap[field]);
  }

  function timeoutPromise(promise, timeoutMs, message) {
    let timerId;
    const timeout = new Promise((_, reject) => {
      timerId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    });

    return Promise.race([promise, timeout]).finally(() => {
      window.clearTimeout(timerId);
    });
  }

  function parseBirthDate(value) {
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
  }

  function calculateAge(value) {
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
  }

  function mapServerErrorToField(message) {
    const normalized = String(message || '').toLowerCase();

    if (normalized.includes('username')) {
      return 'username';
    }

    if (normalized.includes('email')) {
      return 'email';
    }

    if (normalized.includes('id number') || normalized.includes('idnumber')) {
      return 'idNumber';
    }

    if (normalized.includes('front') && (normalized.includes('id') || normalized.includes('image'))) {
      return 'frontIdImage';
    }

    if (normalized.includes('back') && (normalized.includes('id') || normalized.includes('image'))) {
      return 'backIdImage';
    }

    if (normalized.includes('image') || normalized.includes('upload')) {
      return 'frontIdImage';
    }

    return '';
  }

  async function fetchRegistration(payload) {
    const config = window.ResQMeshRegisterConfig || {};
    const timeoutMs = config.submitTimeoutMs || 45000;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch('/api/users/register', {
        method: 'POST',
        body: payload,
        signal: controller.signal
      });
      const rawBody = await response.text();
      let result = {};

      try {
        result = rawBody ? JSON.parse(rawBody) : {};
      } catch (error) {
        result = {
          success: false,
          message: rawBody.trim() || 'Unexpected server response.'
        };
      }

      if (!response.ok) {
        throw new Error(result.message || 'Registration failed. Please try again.');
      }

      return result;
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Registration request timed out. Please check your connection and try again.');
      }

      throw error;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  window.ResQMeshRegisterUtils = {
    calculateAge,
    fetchRegistration,
    firstErrorField,
    mapServerErrorToField,
    parseBirthDate,
    timeoutPromise
  };
}());
