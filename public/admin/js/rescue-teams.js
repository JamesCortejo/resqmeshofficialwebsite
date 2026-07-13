(function initRescueTeamsManager() {
  const context = window.ResQMeshRescueTeams.createContext();

  window.ResQMeshRescueTeamCreate.init(context);
  window.ResQMeshRescueTeamList.init(context);
  window.ResQMeshRescueTeamView.init(context);

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (context.dom.rescueTeamViewModal?.classList.contains('is-open')) {
        context.ui.closeViewModal();
      } else if (context.dom.rescueTeamModal?.classList.contains('is-open')) {
        context.ui.closeCreateModal();
      }
    }
  });

  Promise.allSettled([
    context.data.loadAssignableRescuers(),
    context.list.loadTeams({ resetPage: true })
  ]).then((results) => {
    if (results[0].status === 'rejected') {
      context.toast.show('Assignable rescuers could not be loaded yet.', 'warning');
    }
  });
}());
