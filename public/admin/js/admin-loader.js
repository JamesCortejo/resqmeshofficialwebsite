(function initAdminLoader() {
  window.addEventListener('load', () => {
    setTimeout(() => {
      document.body.classList.remove('admin-loading');
    }, 300);
  });
}());
