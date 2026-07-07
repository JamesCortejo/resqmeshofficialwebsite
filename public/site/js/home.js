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

const updatesTrack = document.getElementById('updatesCarouselTrack');
const updatesPrevButton = document.getElementById('updatesCarouselPrev');
const updatesNextButton = document.getElementById('updatesCarouselNext');
const updatesDots = document.getElementById('updatesCarouselDots');

if (updatesTrack && updatesPrevButton && updatesNextButton && updatesDots) {
  const updateCards = Array.from(updatesTrack.querySelectorAll('.update-card'));
  let currentUpdateIndex = 0;

  if (updateCards.length === 0) {
    updatesPrevButton.disabled = true;
    updatesNextButton.disabled = true;
  } else {

    function visibleUpdateCount() {
      if (window.matchMedia('(max-width: 768px)').matches) {
        return 1;
      }

      if (window.matchMedia('(max-width: 992px)').matches) {
        return 2;
      }

      return 3;
    }

    function maxUpdateIndex() {
      return Math.max(updateCards.length - visibleUpdateCount(), 0);
    }

    function renderUpdateDots() {
      updatesDots.innerHTML = '';

      for (let index = 0; index <= maxUpdateIndex(); index += 1) {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'updates-carousel-dot';
        dot.setAttribute('aria-label', `Show update ${index + 1}`);
        dot.addEventListener('click', () => {
          currentUpdateIndex = index;
          updateCarousel();
        });
        updatesDots.appendChild(dot);
      }
    }

    function updateCarousel() {
      currentUpdateIndex = Math.min(currentUpdateIndex, maxUpdateIndex());
      const card = updateCards[0];
      const gap = parseFloat(window.getComputedStyle(updatesTrack).columnGap) || 0;
      const offset = currentUpdateIndex * (card.getBoundingClientRect().width + gap);

      updatesTrack.style.transform = `translateX(-${offset}px)`;
      updatesPrevButton.disabled = currentUpdateIndex === 0;
      updatesNextButton.disabled = currentUpdateIndex === maxUpdateIndex();

      Array.from(updatesDots.children).forEach((dot, index) => {
        dot.classList.toggle('is-active', index === currentUpdateIndex);
        dot.setAttribute('aria-current', index === currentUpdateIndex ? 'true' : 'false');
      });
    }

    updatesPrevButton.addEventListener('click', () => {
      currentUpdateIndex = Math.max(currentUpdateIndex - 1, 0);
      updateCarousel();
    });

    updatesNextButton.addEventListener('click', () => {
      currentUpdateIndex = Math.min(currentUpdateIndex + 1, maxUpdateIndex());
      updateCarousel();
    });

    window.addEventListener('resize', () => {
      renderUpdateDots();
      updateCarousel();
    });

    renderUpdateDots();
    updateCarousel();
  }
}

