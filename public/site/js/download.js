(function initDownloadGuard() {
  const COOLDOWN_MS = 10000;
  const TOKEN_TIMEOUT_MS = 15000;
  const APK_FILENAME = 'ResQMesh-V1.2.apk';
  const buttons = Array.from(document.querySelectorAll('[data-secure-download]'));
  const status = document.getElementById('downloadSecurityStatus');
  let cooldownUntil = 0;
  let cooldownTimer = null;

  function setStatus(message, tone = 'neutral') {
    if (!status) {
      if (tone === 'error' || tone === 'warning') {
        window.alert(message);
      }
      return;
    }

    status.textContent = message;
    status.dataset.tone = tone;
    status.hidden = false;
  }

  function setButtonsDisabled(disabled, label) {
    buttons.forEach((button) => {
      button.classList.toggle('is-disabled', disabled);
      button.setAttribute('aria-disabled', String(disabled));

      const labelTarget = button.querySelector('[data-download-label]');
      if (labelTarget && label) {
        labelTarget.textContent = label;
      }
    });
  }

  function restoreLabels() {
    buttons.forEach((button) => {
      const labelTarget = button.querySelector('[data-download-label]');
      if (labelTarget) {
        labelTarget.textContent = labelTarget.dataset.defaultLabel || 'Download Android APK';
      }
    });
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

  function startCooldown() {
    cooldownUntil = Date.now() + COOLDOWN_MS;
    window.clearInterval(cooldownTimer);

    cooldownTimer = window.setInterval(() => {
      const remainingSeconds = Math.ceil((cooldownUntil - Date.now()) / 1000);

      if (remainingSeconds <= 0) {
        window.clearInterval(cooldownTimer);
        setButtonsDisabled(false);
        restoreLabels();
        setStatus('Download protection is active. You can download again if needed.', 'success');
        return;
      }

      setButtonsDisabled(true, `Please wait ${remainingSeconds}s`);
    }, 250);
  }

  async function verifyDownload() {
    const recaptchaToken = await timeoutPromise(
      window.ResQMeshRecaptcha.ready().then(() => window.ResQMeshRecaptcha.getToken('download')),
      TOKEN_TIMEOUT_MS,
      'Security verification timed out. Please refresh the page and try again.'
    );

    const response = await fetch('/api/download/request', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        filename: APK_FILENAME,
        recaptchaToken
      })
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result.success || !result.data || !result.data.url) {
      throw new Error(result.message || 'Unable to authorize download right now.');
    }

    return result.data.url;
  }

  buttons.forEach((button) => {
    const labelTarget = button.querySelector('[data-download-label]');
    if (labelTarget && !labelTarget.dataset.defaultLabel) {
      labelTarget.dataset.defaultLabel = labelTarget.textContent.trim();
    }

    button.addEventListener('click', async (event) => {
      event.preventDefault();

      if (Date.now() < cooldownUntil) {
        const remainingSeconds = Math.ceil((cooldownUntil - Date.now()) / 1000);
        setStatus(`Please wait ${remainingSeconds}s before downloading again.`, 'warning');
        return;
      }

      const url = button.getAttribute('href');
      if (!url) {
        setStatus('Download link is unavailable.', 'error');
        return;
      }

      try {
        setButtonsDisabled(true, 'Verifying...');
        setStatus('Checking download security...', 'neutral');
        const authorizedUrl = await verifyDownload();
        setStatus('Security check passed. Starting download...', 'success');
        startCooldown();
        window.location.href = authorizedUrl;
      } catch (error) {
        setButtonsDisabled(false);
        restoreLabels();
        setStatus(error.message || 'Security verification failed. Please try again.', 'error');
      }
    });
  });

  window.ResQMeshRecaptcha?.ready?.().catch(() => {
    setStatus('Security verification could not load yet. Try again in a moment.', 'warning');
  });
}());
