(function bootstrapRegistrationPage() {
  function initializeNavigationMenu() {
    const toggleBtn = document.getElementById('nav-toggle');
    const navMenu = document.getElementById('nav-menu');

    if (!toggleBtn || !navMenu) {
      return;
    }

    toggleBtn.setAttribute('aria-expanded', 'false');

    const closeMenu = () => {
      navMenu.classList.remove('active');
      toggleBtn.setAttribute('aria-expanded', 'false');
    };

    toggleBtn.addEventListener('click', () => {
      const isOpen = navMenu.classList.toggle('active');
      toggleBtn.setAttribute('aria-expanded', String(isOpen));
    });

    navMenu.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', closeMenu);
    });

    document.addEventListener('click', (event) => {
      if (!navMenu.classList.contains('active')) {
        return;
      }

      if (!navMenu.contains(event.target) && !toggleBtn.contains(event.target)) {
        closeMenu();
      }
    });

    window.addEventListener('resize', () => {
      if (window.innerWidth > 820) {
        closeMenu();
      }
    });
  }

  function missingModuleNames(modules) {
    return [
      'createState',
      'createMarkup',
      'createValidation',
      'createUploads',
      'createSubmit',
      'createEvents'
    ].filter((name) => typeof modules[name] !== 'function');
  }

  initializeNavigationMenu();

  const registerRootElement = document.getElementById('register-root');
  const registerConfig = window.ResQMeshRegisterConfig;
  const registerUtils = window.ResQMeshRegisterUtils;
  const modules = window.ResQMeshRegisterModules || {};
  const missingModules = missingModuleNames(modules);

  if (!registerRootElement) {
    throw new Error('ResQMesh registration bootstrap failed: #register-root was not found.');
  }

  if (missingModules.length > 0) {
    registerRootElement.innerHTML = `
      <main class="register-container">
        <div class="card register-fallback-card register-fallback-card-error" role="alert">
          <div class="register-fallback-icon" aria-hidden="true">
            <i class="fa-solid fa-triangle-exclamation"></i>
          </div>
          <h2 class="register-fallback-title">Registration form unavailable</h2>
          <p class="register-fallback-message">The registration page could not load its required modules.</p>
          <p class="register-fallback-help">Refresh the page and try again. If the problem continues, check your browser console.</p>
        </div>
      </main>
    `;
    return;
  }

  const context = {
    registerRootElement,
    registerConfig,
    registerUtils,
    ...modules.createState()
  };

  context.markup = modules.createMarkup(context);

  if (!registerConfig || !registerUtils) {
    context.markup.showRegisterBootstrapError('The registration page could not load its required configuration.');
    return;
  }

  context.validation = modules.createValidation(context);
  context.uploads = modules.createUploads(context);
  context.submit = modules.createSubmit(context);
  context.events = modules.createEvents(context);
  context.markup.setBindFormEvents(context.events.bindFormEvents);

  window.ResQMeshRecaptcha?.ready?.().catch(() => {
    // The submit handler will show the actionable security error if needed.
  });

  context.markup.render();
}());
