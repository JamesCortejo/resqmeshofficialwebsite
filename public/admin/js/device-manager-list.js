(function createDeviceManagerListModule() {
  const pageSize = 10;

  window.ResQMeshDeviceManagerList = {
    init(context) {
      const { dom, state, helpers, ui, constants } = context;
      let currentPage = 1;

      function renderCards(pageDevices) {
        if (!dom.devicesGrid) {
          return;
        }

        dom.devicesGrid.innerHTML = pageDevices.map((device) => `
          <article class="device-card">
            <div class="device-card-header">
              <div>
                <h3 class="device-card-title">${helpers.escapeHtml(device.nodeName || device.nodeId)}</h3>
                <p class="device-card-subtitle">${helpers.escapeHtml(device.nodeId)}</p>
              </div>
              <span class="device-card-status-pill" data-status="${helpers.escapeHtml(device.connectivityStatus)}">
                ${helpers.escapeHtml(device.connectivityStatusLabel)}
              </span>
            </div>

            <div class="device-card-body">
              <div class="device-card-sync-grid">
                <div class="device-card-stat">
                  <strong>Last sync</strong>
                  <span>${helpers.escapeHtml(helpers.formatRelativeTime(device.lastSyncAt))}</span>
                </div>
                <div class="device-card-stat">
                  <strong>Last seen</strong>
                  <span>${helpers.escapeHtml(helpers.formatRelativeTime(device.lastSeenAt))}</span>
                </div>
              </div>

              <div class="device-card-meta">
                <div class="device-card-meta-row">
                  <span>Users connected</span>
                  <strong>${helpers.escapeHtml(device.usersConnected)}</strong>
                </div>
                <div class="device-card-meta-row">
                  <span>Node status</span>
                  <strong>${helpers.escapeHtml(device.nodeStatusLabel)}</strong>
                </div>
                <div class="device-card-meta-row">
                  <span>Coordinates</span>
                  <strong>${helpers.escapeHtml(`${helpers.formatCoordinate(device.latitude)}, ${helpers.formatCoordinate(device.longitude)}`)}</strong>
                </div>
              </div>

              <div class="device-card-activity">
                <div class="device-card-activity-chip">
                  <strong>${helpers.escapeHtml(device.recentDistressCount)}</strong>
                  <span>Distress</span>
                </div>
                <div class="device-card-activity-chip">
                  <strong>${helpers.escapeHtml(device.recentMessageCount)}</strong>
                  <span>Messages</span>
                </div>
                <div class="device-card-activity-chip">
                  <strong>${helpers.escapeHtml(device.pendingCommandCount)}</strong>
                  <span>Commands</span>
                </div>
                <div class="device-card-activity-chip">
                  <strong>${helpers.escapeHtml(device.recentAuditCount)}</strong>
                  <span>Audit</span>
                </div>
              </div>
            </div>

            <div class="device-card-actions">
              <button type="button" class="device-card-view-button" data-view-device-id="${helpers.escapeHtml(device.id)}">
                <i class="fa-regular fa-eye" aria-hidden="true"></i>
                <span>View More</span>
              </button>
            </div>
          </article>
        `).join('');
      }

      function render() {
        if (!dom.devicesGrid || !dom.devicesListEmpty) {
          return;
        }

        const filteredCount = state.filteredDevices.length;
        const totalPages = Math.max(1, Math.ceil(filteredCount / pageSize));

        if (currentPage > totalPages) {
          currentPage = totalPages;
        }

        if (filteredCount === 0) {
          dom.devicesGrid.innerHTML = '';
          dom.devicesListEmpty.hidden = false;
          dom.devicesListEmpty.textContent = state.loading
            ? 'Loading devices...'
            : state.devices.length === 0
              ? 'No synchronized devices yet.'
              : 'No devices match the current search or status filter.';

          if (dom.devicesPagination) {
            dom.devicesPagination.hidden = true;
          }

          return;
        }

        dom.devicesListEmpty.hidden = true;
        const startIndex = (currentPage - 1) * pageSize;
        const pageDevices = state.filteredDevices.slice(startIndex, startIndex + pageSize);
        renderCards(pageDevices);

        if (dom.devicesPaginationSummary) {
          dom.devicesPaginationSummary.textContent = `Showing ${startIndex + 1}-${Math.min(startIndex + pageSize, filteredCount)} of ${filteredCount} devices`;
        }

        if (dom.previousDevicesButton) {
          dom.previousDevicesButton.disabled = currentPage === 1;
        }

        if (dom.nextDevicesButton) {
          dom.nextDevicesButton.disabled = currentPage === totalPages;
        }

        if (dom.devicesPagination) {
          dom.devicesPagination.hidden = false;
        }
      }

      function updateFilterButtons() {
        if (!dom.devicesStatusFilters) {
          return;
        }

        dom.devicesStatusFilters.querySelectorAll('[data-device-filter]').forEach((button) => {
          button.classList.toggle('is-active', button.dataset.deviceFilter === state.statusFilter);
        });
      }

      function applyFilters() {
        const query = dom.devicesSearchInput ? dom.devicesSearchInput.value.trim().toLowerCase() : '';

        state.filteredDevices = state.devices.filter((device) => {
          if (state.statusFilter !== 'all' && device.connectivityStatus !== state.statusFilter) {
            return false;
          }

          if (!query) {
            return true;
          }

          const matchText = [
            device.nodeId,
            device.nodeName,
            device.connectivityStatus,
            device.deviceStatus,
            device.nodeStatus,
            device.usersConnected
          ].join(' ').toLowerCase();

          return matchText.includes(query);
        });

        render();
      }

      async function loadDevices(options = {}) {
        const { resetPage = true } = options;

        state.loading = true;
        if (resetPage) {
          currentPage = 1;
        }
        render();

        try {
          const payload = await helpers.requestJson('/api/admin/devices');
          state.devices = Array.isArray(payload.data) ? payload.data : [];
          applyFilters();
          ui.setFeedback('');
        } catch (error) {
          state.devices = [];
          state.filteredDevices = [];
          render();
          ui.setFeedback(error.message || 'Unable to load devices.', 'error');
        } finally {
          state.loading = false;
          render();
        }
      }

      if (dom.devicesSearchInput) {
        dom.devicesSearchInput.addEventListener('input', () => {
          currentPage = 1;
          applyFilters();
        });
      }

      if (dom.devicesStatusFilters) {
        dom.devicesStatusFilters.addEventListener('click', (event) => {
          const button = event.target.closest('[data-device-filter]');
          if (!button || !constants.FILTER_OPTIONS.includes(button.dataset.deviceFilter)) {
            return;
          }

          state.statusFilter = button.dataset.deviceFilter;
          currentPage = 1;
          updateFilterButtons();
          applyFilters();
        });
      }

      if (dom.devicesGrid) {
        dom.devicesGrid.addEventListener('click', (event) => {
          const button = event.target.closest('[data-view-device-id]');
          if (!button) {
            return;
          }

          context.view?.openDetails(button.dataset.viewDeviceId);
        });
      }

      if (dom.previousDevicesButton) {
        dom.previousDevicesButton.addEventListener('click', () => {
          currentPage = Math.max(1, currentPage - 1);
          render();
        });
      }

      if (dom.nextDevicesButton) {
        dom.nextDevicesButton.addEventListener('click', () => {
          currentPage += 1;
          render();
        });
      }

      updateFilterButtons();

      context.list = {
        loadDevices,
        render,
        applyFilters
      };

      return context.list;
    }
  };
}());
