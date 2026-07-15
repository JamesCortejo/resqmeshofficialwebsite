(function initDistressSignalsPage() {
  const context = window.ResQMeshDistressSignalsShared.createContext();

  window.ResQMeshDistressSignalsList.init(context);
  window.ResQMeshDistressSignalsView.init(context);
  context.list.loadSignals({ resetPage: true });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && context.dom.distressSignalModal?.classList.contains('is-open')) {
      context.ui.closeModal();
    }
  });
}());
