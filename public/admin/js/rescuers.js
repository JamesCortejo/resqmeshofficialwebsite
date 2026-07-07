const openAddRescuerButton = document.getElementById('openAddRescuerButton');
const rescuerModal = document.getElementById('rescuerModal');
const rescuersSearchInput = document.getElementById('rescuersSearchInput');
const rescuersRows = Array.from(document.querySelectorAll('.rescuers-table tbody tr'));
const rescuersListEmpty = document.querySelector('.rescuers-list-empty');

function setBodyLock(isLocked) {
  document.body.classList.toggle('rescuer-modal-open', isLocked);
}

function openRescuerModal() {
  if (!rescuerModal) {
    return;
  }

  rescuerModal.classList.add('is-open');
  rescuerModal.setAttribute('aria-hidden', 'false');
  setBodyLock(true);
}

function closeRescuerModal() {
  if (!rescuerModal) {
    return;
  }

  rescuerModal.classList.remove('is-open');
  rescuerModal.setAttribute('aria-hidden', 'true');
  setBodyLock(false);
}

if (openAddRescuerButton) {
  openAddRescuerButton.addEventListener('click', openRescuerModal);
}

if (rescuerModal) {
  rescuerModal.querySelectorAll('[data-close-rescuer-modal]').forEach((button) => {
    button.addEventListener('click', closeRescuerModal);
  });

  rescuerModal.addEventListener('click', (event) => {
    if (event.target === rescuerModal) {
      closeRescuerModal();
    }
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && rescuerModal.classList.contains('is-open')) {
      closeRescuerModal();
    }
  });
}

if (rescuerRows.length > 0 && rescuersSearchInput && rescuersListEmpty) {
  rescuersSearchInput.addEventListener('input', () => {
    const query = rescuersSearchInput.value.trim().toLowerCase();
    let visibleCount = 0;

    rescuersRows.forEach((row) => {
      const matchText = row.textContent.toLowerCase();
      const isVisible = !query || matchText.includes(query);
      row.hidden = !isVisible;

      if (isVisible) {
        visibleCount += 1;
      }
    });

    rescuersListEmpty.hidden = visibleCount > 0;
    rescuersListEmpty.textContent = visibleCount > 0
      ? 'Frontend rescuer list placeholder ready for future data binding.'
      : 'No rescuers match the current search.';
  });
}

const rescuerFormSelects = Array.from(document.querySelectorAll('.rescuer-field select'));

rescuerFormSelects.forEach((select) => {
  select.classList.toggle('has-value', Boolean(select.value));
  select.addEventListener('change', () => {
    select.classList.toggle('has-value', Boolean(select.value));
  });
});
