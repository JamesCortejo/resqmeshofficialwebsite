(function initDeviceManager() {
  const context = window.ResQMeshDeviceManager.createContext();
  const { constants, state } = context;

  window.ResQMeshDeviceManagerList.init(context);
  window.ResQMeshDeviceManagerView.init(context);

  async function refreshLiveData() {
    await context.list.loadDevices({ resetPage: false, background: true });

    if (context.dom.deviceViewModal?.classList.contains('is-open')) {
      await context.view.refreshSelectedDetails();
    }
  }

  function refreshNow() {
    refreshLiveData().catch(() => {
      // Keep the current device UI stable during background refresh failures.
    });
  }

  function stopLiveRefresh() {
    if (state.liveRefreshIntervalId) {
      window.clearInterval(state.liveRefreshIntervalId);
      state.liveRefreshIntervalId = null;
    }
  }

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && context.dom.deviceViewModal?.classList.contains('is-open')) {
      context.ui.closeDeviceViewModal();
    }
  });

  window.addEventListener('focus', refreshNow);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      refreshNow();
    }
  });
  window.addEventListener('beforeunload', stopLiveRefresh);

  context.list.loadDevices();
  state.liveRefreshIntervalId = window.setInterval(() => {
    if (!document.hidden) {
      refreshNow();
    }
  }, constants.LIVE_REFRESH_INTERVAL_MS);
}());
