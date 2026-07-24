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

  let latestPendingRegistrationNotificationId = 0;

  window.addEventListener('resqmesh:admin-notifications-refreshed', (event) => {
    const notifications = Array.isArray(event.detail?.notifications)
      ? event.detail.notifications
      : [];
    const newestPendingRegistration = notifications
      .filter((notification) => notification && notification.type === 'registration.pending')
      .map((notification) => Number(notification.id || 0))
      .filter((id) => Number.isFinite(id) && id > 0)
      .sort((left, right) => right - left)[0] || 0;

    if (newestPendingRegistration <= latestPendingRegistrationNotificationId) {
      return;
    }

    latestPendingRegistrationNotificationId = newestPendingRegistration;
    context.pendingPanel.refresh().catch(() => {
      // Keep the notification flow quiet if a background account refresh fails.
    });
  });
}());
