(function () {
  let configPromise = null;
  let scriptPromise = null;

  function loadPublicConfig() {
    if (!configPromise) {
      configPromise = fetch('/api/public-config')
        .then((response) => response.json())
        .then((result) => {
          if (!result || !result.success) {
            throw new Error('Unable to load security verification settings.');
          }

          return result;
        });
    }

    return configPromise;
  }

  function loadRecaptchaScript(siteKey) {
    if (!siteKey) {
      return Promise.resolve();
    }

    if (window.grecaptcha) {
      return Promise.resolve();
    }

    if (!scriptPromise) {
      scriptPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`;
        script.async = true;
        script.defer = true;
        script.onload = resolve;
        script.onerror = () => reject(new Error('Unable to load security verification.'));
        document.head.appendChild(script);
      });
    }

    return scriptPromise;
  }

  function executeRecaptcha(siteKey, action) {
    return new Promise((resolve, reject) => {
      window.grecaptcha.ready(() => {
        window.grecaptcha.execute(siteKey, { action })
          .then((token) => {
            if (!token || String(token).trim() === '') {
              reject(new Error('Security verification returned an empty token.'));
              return;
            }

            resolve(token);
          })
          .catch(reject);
      });
    });
  }

  async function getToken(action) {
    const config = await loadPublicConfig();
    const siteKey = config.recaptchaSiteKey;

    if (!siteKey) {
      return '';
    }

    await loadRecaptchaScript(siteKey);

    if (!window.grecaptcha) {
      throw new Error('Security verification is unavailable. Please refresh the page and try again.');
    }

    return executeRecaptcha(siteKey, action);
  }

  window.ResQMeshRecaptcha = {
    getToken
  };
})();
