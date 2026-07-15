(function initDeviceManager() {
  const context = window.ResQMeshDeviceManager.createContext();

  window.ResQMeshDeviceManagerList.init(context);
  window.ResQMeshDeviceManagerView.init(context);

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && context.dom.deviceViewModal?.classList.contains('is-open')) {
      context.ui.closeDeviceViewModal();
    }
  });

  context.list.loadDevices();
}());
