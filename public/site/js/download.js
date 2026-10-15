(function initDownloadGuard() {
  const COOLDOWN_MS = 10000;
  const TOKEN_TIMEOUT_MS = 15000;
  const APK_FILENAME = 'ResQMesh-V1.14.3.apk';
  const buttons = Array.from(document.querySelectorAll('[data-secure-download]'));
  const status = document.getElementById('downloadSecurityStatus');
  const versionTarget = document.querySelector('[data-app-version]');
  const sizeTarget = document.querySelector('[data-app-size]');
  const updatedTarget = document.querySelector('[data-app-updated]');
  let cooldownUntil = 0;
  let cooldownTimer = null;

  function formatUpdatedDate(value) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }).format(date);
  }

  async function loadAppInfo() {
    try {
      const response = await fetch('/api/download/app-info', {
        headers: {
          Accept: 'application/json'
        }
      });
      const result = await response.json().catch(() => ({}));
      const data = result && result.data ? result.data : null;

      if (!response.ok || !result.success || !data) {
        return;
      }

      if (versionTarget && data.version) {
        versionTarget.textContent = data.version;
      }

      if (sizeTarget && data.sizeLabel) {
        sizeTarget.textContent = data.sizeLabel;
      }

      const updatedLabel = formatUpdatedDate(data.updatedAt);
      if (updatedTarget && updatedLabel) {
        updatedTarget.textContent = updatedLabel;
      }

      buttons.forEach((button) => {
        if (data.filename) {
          button.setAttribute('href', `/downloads/${encodeURIComponent(data.filename)}`);
        }
      });
    } catch {
      // Keep the static fallback values if metadata cannot be loaded.
    }
  }

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

  void loadAppInfo();
}());

(function initScreenshotCarousel() {
  const carousel = document.querySelector('[data-screenshot-carousel]');
  if (!carousel) return;

  const slides = Array.from(carousel.querySelectorAll('[data-screenshot-slide]'));
  const dots = Array.from(carousel.querySelectorAll('[data-slide-dot]'));
  const previousButton = carousel.querySelector('[data-slide-previous]');
  const nextButton = carousel.querySelector('[data-slide-next]');
  const stage = carousel.querySelector('[data-screenshot-stage]');
  const currentTarget = carousel.querySelector('[data-slide-current]');
  const totalTarget = carousel.querySelector('[data-slide-total]');
  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const transitionDuration = 320;
  const slideStateClasses = [
    'is-active',
    'is-previous',
    'is-next',
    'is-promoting',
    'is-entering-previous',
    'is-entering-next',
    'is-exiting-left',
    'is-exiting-right'
  ];

  if (!slides.length) return;

  let activeIndex = Math.max(0, slides.findIndex((slide) => !slide.hidden));
  let pointerStart = null;
  let isAnimating = false;
  let transitionTimer = null;

  if (totalTarget) {
    totalTarget.textContent = String(slides.length);
  }

  function normalizeIndex(index) {
    return (index + slides.length) % slides.length;
  }

  function clearSlideState(slide) {
    slide.classList.remove(...slideStateClasses);
  }

  function updateControls() {
    dots.forEach((dot, dotIndex) => {
      const isActive = dotIndex === activeIndex;
      dot.classList.toggle('is-active', isActive);
      if (isActive) {
        dot.setAttribute('aria-current', 'true');
      } else {
        dot.removeAttribute('aria-current');
      }
    });

    if (currentTarget) {
      currentTarget.textContent = String(activeIndex + 1);
    }
  }

  function renderSlides() {
    const previousIndex = normalizeIndex(activeIndex - 1);
    const nextIndex = normalizeIndex(activeIndex + 1);

    slides.forEach((slide, slideIndex) => {
      const isActive = slideIndex === activeIndex;
      const isPrevious = slideIndex === previousIndex;
      const isNext = slideIndex === nextIndex;

      clearSlideState(slide);
      slide.hidden = !(isActive || isPrevious || isNext);
      slide.setAttribute('aria-hidden', String(!isActive));

      if (isActive) {
        slide.classList.add('is-active');
      } else if (isPrevious) {
        slide.classList.add('is-previous');
      } else if (isNext) {
        slide.classList.add('is-next');
      }
    });

    carousel.classList.add('has-card-stack');
    carousel.removeAttribute('aria-busy');
    updateControls();
  }

  function finishTransition() {
    window.clearTimeout(transitionTimer);
    transitionTimer = null;
    isAnimating = false;
    renderSlides();
  }

  function showSlide(index, direction = 0) {
    const requestedIndex = normalizeIndex(index);

    if (requestedIndex === activeIndex || isAnimating) {
      return;
    }

    if (reducedMotionQuery.matches || direction === 0) {
      activeIndex = requestedIndex;
      renderSlides();
      return;
    }

    const outgoingIndex = activeIndex;
    const trailingIndex = normalizeIndex(requestedIndex + direction);
    isAnimating = true;
    carousel.setAttribute('aria-busy', 'true');

    slides.forEach((slide, slideIndex) => {
      const isOutgoing = slideIndex === outgoingIndex;
      const isIncoming = slideIndex === requestedIndex;
      const isTrailing = slideIndex === trailingIndex;

      clearSlideState(slide);
      slide.hidden = !(isOutgoing || isIncoming || isTrailing);
      slide.setAttribute('aria-hidden', String(!isIncoming));

      if (isOutgoing) {
        slide.classList.add('is-active');
      } else if (isIncoming) {
        slide.classList.add(direction > 0 ? 'is-next' : 'is-previous');
      } else if (isTrailing) {
        slide.classList.add(direction > 0 ? 'is-entering-next' : 'is-entering-previous');
      }
    });

    // Commit the starting deck positions before moving the cards.
    void carousel.offsetWidth;

    slides[outgoingIndex].classList.add(direction > 0 ? 'is-exiting-left' : 'is-exiting-right');
    slides[requestedIndex].classList.add('is-promoting');
    slides[trailingIndex].classList.remove(direction > 0 ? 'is-entering-next' : 'is-entering-previous');
    slides[trailingIndex].classList.add(direction > 0 ? 'is-next' : 'is-previous');
    activeIndex = requestedIndex;
    updateControls();

    transitionTimer = window.setTimeout(finishTransition, transitionDuration);
  }

  function moveSlide(direction) {
    showSlide(activeIndex + direction, direction);
  }

  previousButton?.addEventListener('click', () => moveSlide(-1));
  nextButton?.addEventListener('click', () => moveSlide(1));

  dots.forEach((dot) => {
    dot.addEventListener('click', () => {
      const requestedIndex = Number.parseInt(dot.dataset.slideDot || '', 10);
      if (Number.isInteger(requestedIndex)) {
        const normalizedIndex = normalizeIndex(requestedIndex);
        const forwardDistance = normalizeIndex(normalizedIndex - activeIndex);
        const backwardDistance = normalizeIndex(activeIndex - normalizedIndex);
        const direction = forwardDistance <= backwardDistance ? 1 : -1;
        showSlide(normalizedIndex, direction);
      }
    });
  });

  carousel.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      moveSlide(-1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      moveSlide(1);
    }
  });

  stage?.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse') return;
    pointerStart = { x: event.clientX, y: event.clientY, id: event.pointerId };
    stage.setPointerCapture?.(event.pointerId);
  });

  stage?.addEventListener('pointerup', (event) => {
    if (!pointerStart || pointerStart.id !== event.pointerId) return;

    const deltaX = event.clientX - pointerStart.x;
    const deltaY = event.clientY - pointerStart.y;
    pointerStart = null;

    if (Math.abs(deltaX) < 48 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.2) {
      return;
    }

    moveSlide(deltaX < 0 ? 1 : -1);
  });

  stage?.addEventListener('pointercancel', () => {
    pointerStart = null;
  });

  function syncResponsiveLayout() {
    window.clearTimeout(transitionTimer);
    transitionTimer = null;
    isAnimating = false;
    renderSlides();
  }

  reducedMotionQuery.addEventListener?.('change', syncResponsiveLayout);

  renderSlides();
}());
