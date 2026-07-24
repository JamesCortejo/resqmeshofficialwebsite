(function () {
  let configPromise = null;
  let scriptPromise = null;
  let cachedSiteKey = null;

  function loadPublicConfig() {
    if (!configPromise) {
      configPromise = fetch('/api/public-config')
        .then((response) => response.json())
        .then((result) => {
          if (!result || !result.success) {
            throw new Error('Unable to load security verification settings.');
          }

          cachedSiteKey = result.recaptchaSiteKey || '';
          return result;
        })
        .catch((error) => {
          configPromise = null;
          throw error;
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
        const existingScript = document.querySelector('script[data-resqmesh-recaptcha="true"]');

        if (existingScript) {
          existingScript.addEventListener('load', resolve, { once: true });
          existingScript.addEventListener('error', () => reject(new Error('Unable to load security verification.')), { once: true });
          return;
        }

        const script = document.createElement('script');
        script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`;
        script.async = true;
        script.defer = true;
        script.dataset.resqmeshRecaptcha = 'true';
        script.onload = resolve;
        script.onerror = () => reject(new Error('Unable to load security verification.'));
        document.head.appendChild(script);
      }).catch((error) => {
        scriptPromise = null;
        throw error;
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

  async function ready() {
    const config = await loadPublicConfig();
    const siteKey = config.recaptchaSiteKey;

    if (!siteKey) {
      updateNotices(false);
      return false;
    }

    await loadRecaptchaScript(siteKey);
    updateNotices(true);
    return true;
  }

  function updateNotices(isEnabled) {
    document.querySelectorAll('[data-recaptcha-notice]').forEach((notice) => {
      notice.hidden = false;
      notice.dataset.recaptchaReady = isEnabled ? 'true' : 'false';
      const state = notice.querySelector('[data-recaptcha-state]');

      if (state) {
        state.textContent = isEnabled ? 'Active' : 'Not configured';
      }
    });
  }

  function isConfigured() {
    return Boolean(cachedSiteKey);
  }

  window.ResQMeshRecaptcha = {
    getToken,
    ready,
    isConfigured
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      ready().catch(() => updateNotices(false));
    });
  } else {
    ready().catch(() => updateNotices(false));
  }
})();
