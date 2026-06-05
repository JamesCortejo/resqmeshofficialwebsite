(function initAccountsManager() {
  const context = {
    modal: window.ResQMeshAccounts.createModal(),
    toast: window.ResQMeshAccounts.createToast(),
    pendingPanel: null,
    activePanel: null
  };

  context.activePanel = window.ResQMeshActiveAccounts.init(context);
  context.pendingPanel = window.ResQMeshPendingAccounts.init(context);

  context.pendingPanel.load();
  context.activePanel.load();
}());
