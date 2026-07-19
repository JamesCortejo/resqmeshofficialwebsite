const toggleBtn = document.getElementById('nav-toggle');
const navMenu = document.getElementById('nav-menu');

if (toggleBtn && navMenu) {
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

window.addEventListener('load', () => {
  setTimeout(() => document.body.classList.remove('site-loading'), 160);
});
