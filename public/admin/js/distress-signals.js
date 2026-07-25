(function initDistressSignalsPage() {
  const context = window.ResQMeshDistressSignalsShared.createContext();

  window.ResQMeshDistressSignalsList.init(context);
  window.ResQMeshDistressSignalsView.init(context);
  context.list.loadSignals({ resetPage: true });

  const distressRefreshNotificationTypes = new Set([
    'distress.active',
    'distress.canceled',
    'deployment.created',
    'deployment.canceled',
    'deployment.accomplished'
  ]);
  let latestHandledDistressNotificationId = 0;

  window.addEventListener('resqmesh:admin-notifications-refreshed', (event) => {
    const notifications = Array.isArray(event.detail?.notifications)
      ? event.detail.notifications
      : [];
    const newestDistressNotificationId = notifications
      .filter((notification) => notification && distressRefreshNotificationTypes.has(notification.type))
      .map((notification) => Number(notification.id || 0))
      .filter((id) => Number.isFinite(id) && id > 0)
      .sort((left, right) => right - left)[0] || 0;

    if (newestDistressNotificationId <= latestHandledDistressNotificationId) {
      return;
    }

    latestHandledDistressNotificationId = newestDistressNotificationId;
    context.list.loadSignals().catch(() => {
      // Keep notification polling quiet if a background distress list refresh fails.
    });
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && context.dom.distressSignalModal?.classList.contains('is-open')) {
      context.ui.closeModal();
    }
  });
}());
