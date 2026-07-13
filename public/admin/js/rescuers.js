(function initRescuersManager() {
  const context = window.ResQMeshRescuers.createContext();

  window.ResQMeshRescuerCreate.init(context);
  window.ResQMeshRescuerList.init(context);
  window.ResQMeshRescuerView.init(context);

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (context.dom.rescuerViewModal?.classList.contains('is-open')) {
        context.ui.closeRescuerViewModal();
      } else if (context.dom.rescuerModal?.classList.contains('is-open')) {
        context.ui.closeRescuerModal();
      }
    }
  });

  Promise.allSettled([
    context.create.loadRescueTeams(),
    context.list.loadRescuers()
  ]).then((results) => {
    const teamResult = results[0];
    if (teamResult.status === 'rejected') {
      context.ui.setActionMessage('Teams could not be loaded. You can still create an unassigned rescuer.', 'error');
    }
  });
}());
