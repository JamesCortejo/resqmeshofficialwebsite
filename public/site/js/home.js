const toggleBtn = document.getElementById('nav-toggle');
const navMenu = document.getElementById('nav-menu');

if (toggleBtn && navMenu) {
  toggleBtn.addEventListener('click', () => {
    navMenu.classList.toggle('active');
  });
}

window.addEventListener('load', () => {
  setTimeout(() => document.body.classList.remove('site-loading'), 300);
});

const facebookFrameShell = document.querySelector('.facebook-frame-shell');
const facebookTimeline = document.querySelector('.facebook-timeline');

if (facebookFrameShell && facebookTimeline) {
  const fallbackTimer = window.setTimeout(() => {
    facebookFrameShell.classList.add('show-fallback');
  }, 4500);

  facebookTimeline.addEventListener('load', () => {
    window.clearTimeout(fallbackTimer);
    facebookFrameShell.classList.remove('show-fallback');
  });
}
