(function initForgotPassword() {
  const form = document.getElementById('password-reset-form');
  const emailInput = document.getElementById('reset-email');
  const codeInput = document.getElementById('reset-code');
  const passwordInput = document.getElementById('reset-new-password');
  const confirmPasswordInput = document.getElementById('reset-confirm-password');
  const panels = Array.from(document.querySelectorAll('[data-step]'));
  const indicators = Array.from(document.querySelectorAll('[data-step-indicator]'));
  const progressBar = document.getElementById('password-reset-progress');
  let currentStep = 1;
  let resetToken = '';
  let redirectTimer = null;
  let toastTimer = null;
  let toastNode = null;

  if (!form || !emailInput || !codeInput || !passwordInput || !confirmPasswordInput) {
    return;
  }

  function setAlert(message, tone) {
    clearAlert();
    toastNode = document.createElement('div');
    toastNode.className = `register-toast ${tone === 'success' ? 'register-toast-success' : ''}`;
    toastNode.setAttribute('role', 'status');
    toastNode.setAttribute('aria-live', 'polite');
    toastNode.innerHTML = `
      <span class="register-toast-icon" aria-hidden="true">
        <i class="fa-solid ${tone === 'success' ? 'fa-check' : 'fa-triangle-exclamation'}"></i>
      </span>
      <span>${message}</span>
    `;
    document.body.appendChild(toastNode);
    toastTimer = window.setTimeout(clearAlert, tone === 'success' ? 2600 : 4200);
  }

  function clearAlert() {
    if (toastTimer) {
      window.clearTimeout(toastTimer);
      toastTimer = null;
    }

    if (toastNode) {
      toastNode.remove();
      toastNode = null;
    }
  }

  function setLoading(loading) {
    Array.from(form.querySelectorAll('button, input')).forEach((element) => {
      element.disabled = loading;
    });
  }

  function setStep(step) {
    currentStep = step;
    clearAlert();
    panels.forEach((panel) => {
      const isActive = Number(panel.dataset.step) === step;
      panel.hidden = !isActive;
      panel.classList.toggle('active', isActive);
    });
    indicators.forEach((indicator) => {
      const value = Number(indicator.dataset.stepIndicator);
      indicator.classList.toggle('active', value === step);
      indicator.classList.toggle('completed', value < step);
    });

    if (progressBar) {
      progressBar.style.width = `${((step - 1) / 2) * 100}%`;
    }
  }

  async function postJson(url, payload) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.message || 'Request failed. Please try again.');
    }

    return result;
  }

  async function getRecaptchaToken() {
    if (!window.ResQMeshRecaptcha) {
      throw new Error('Security verification is still loading. Please try again.');
    }

    await window.ResQMeshRecaptcha.ready();
    return window.ResQMeshRecaptcha.getToken('password_reset');
  }

  async function requestCode() {
    const email = emailInput.value.trim();

    if (!email) {
      throw new Error('Enter your registered email address.');
    }

    const recaptchaToken = await getRecaptchaToken();
    const result = await postJson('/api/users/password-reset/request', {
      email,
      recaptchaToken
    });

    setStep(2);
    setAlert(result.message || 'If this email is approved, a code has been sent.', 'success');
    codeInput.focus();
  }

  async function verifyCode() {
    const email = emailInput.value.trim();
    const code = codeInput.value.trim();

    if (!code || code.length !== 6) {
      throw new Error('Enter the 6-digit code from your email.');
    }

    const result = await postJson('/api/users/password-reset/verify', {
      email,
      code
    });

    resetToken = result.resetToken || '';
    setStep(3);
    setAlert(result.message || 'Code verified. Set a new password.', 'success');
    passwordInput.focus();
  }

  async function completeReset() {
    const newPassword = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    if (!resetToken) {
      throw new Error('Password reset session expired. Please request a new code.');
    }

    if (newPassword.length < 8) {
      throw new Error('Password must be at least 8 characters long.');
    }

    if (newPassword !== confirmPassword) {
      throw new Error('Passwords do not match.');
    }

    const result = await postJson('/api/users/password-reset/complete', {
      resetToken,
      newPassword,
      confirmPassword
    });

    resetToken = '';
    form.reset();
    setAlert('Password Successfully Resetted', 'success');
    redirectTimer = window.setTimeout(() => {
      window.location.href = '/';
    }, 2500);
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearAlert();
    setLoading(true);

    try {
      if (currentStep === 1) {
        await requestCode();
      } else if (currentStep === 2) {
        await verifyCode();
      } else {
        await completeReset();
      }
    } catch (error) {
      if (redirectTimer) {
        window.clearTimeout(redirectTimer);
        redirectTimer = null;
      }
      setAlert(error.message || 'Unable to complete password reset.', 'error');
    } finally {
      setLoading(false);
    }
  });

  document.querySelectorAll('[data-back-step]').forEach((button) => {
    button.addEventListener('click', () => {
      setStep(Number(button.dataset.backStep));
    });
  });

  codeInput.addEventListener('input', () => {
    codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 6);
  });
}());
