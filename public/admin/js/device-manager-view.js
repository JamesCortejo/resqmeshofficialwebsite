(function createDeviceManagerViewModule() {
  window.ResQMeshDeviceManagerView = {
    init(context) {
      const { dom, state, helpers, ui } = context;
      let detailsRequestInFlight = false;

      function renderDetails(details) {
        if (!dom.deviceViewModalBody || !dom.deviceViewModalCode) {
          return;
        }

        state.selectedDeviceDetails = details;
        dom.deviceViewModalCode.textContent = `${details.nodeId} - ${details.connectivityStatusLabel}`;
        dom.deviceViewModalBody.innerHTML = `
          <div class="device-detail-grid">
            <section class="device-detail-hero">
              <div>
                <h3>${helpers.escapeHtml(details.nodeName || details.nodeId)}</h3>
                <p>${helpers.escapeHtml(details.nodeId)}</p>
              </div>
              <div class="device-detail-badges">
                <span class="device-inline-pill" data-status="${helpers.escapeHtml(details.connectivityStatus)}">${helpers.escapeHtml(details.connectivityStatusLabel)}</span>
                <span class="device-inline-pill" data-status="${helpers.escapeHtml(details.deviceStatus)}">${helpers.escapeHtml(details.deviceStatusLabel)}</span>
              </div>
            </section>

            <section class="device-detail-section">
              <h3>Device Identity</h3>
              <dl>
                ${helpers.detailItem('Node ID', details.nodeId || 'Not available')}
                ${helpers.detailItem('Node Name', details.nodeName || 'Not available')}
                ${helpers.detailItem('Allowed IP', details.allowedIp || 'Not restricted')}
                ${helpers.detailItem('Created At', helpers.formatDate(details.createdAt))}
                ${helpers.detailItem('Updated At', helpers.formatDate(details.updatedAt))}
              </dl>
            </section>

            <section class="device-detail-section">
              <h3>Sync Status</h3>
              <dl>
                ${helpers.detailItem('Connectivity', details.connectivityStatusLabel)}
                ${helpers.detailItem('Device Access', details.deviceStatusLabel)}
                ${helpers.detailItem('Last Sync', `${helpers.formatRelativeTime(details.lastSyncAt)} (${helpers.formatDate(details.lastSyncAt)})`)}
                ${helpers.detailItem('Last Seen', `${helpers.formatRelativeTime(details.lastSeenAt)} (${helpers.formatDate(details.lastSeenAt)})`)}
              </dl>
            </section>

            <section class="device-detail-section">
              <h3>Node Snapshot</h3>
              <dl>
                ${helpers.detailItem('Node Status', details.latestNode?.statusLabel || helpers.getStatusDisplay(details.latestNode?.status))}
                ${helpers.detailItem('Users Connected', details.latestNode?.usersConnected ?? 0)}
                ${helpers.detailItem('Latitude', helpers.formatCoordinate(details.latestNode?.latitude))}
                ${helpers.detailItem('Longitude', helpers.formatCoordinate(details.latestNode?.longitude))}
                ${helpers.detailItem('Last Node Seen', helpers.formatDate(details.latestNode?.lastSeenAt))}
              </dl>
            </section>

            <section class="device-detail-section">
              <h3>Health Snapshot</h3>
              <dl>
                ${helpers.detailItem('Battery Voltage', details.latestHealth?.batteryVoltage ?? 'Not available')}
                ${helpers.detailItem('Signal Strength', details.latestHealth?.signalStrength ?? 'Not available')}
                ${helpers.detailItem('GPS Status', helpers.getStatusDisplay(details.latestHealth?.gpsStatus))}
                ${helpers.detailItem('CPU Temperature', details.latestHealth?.cpuTemp ?? 'Not available')}
                ${helpers.detailItem('Storage Remaining', details.latestHealth?.storageRemaining ?? 'Not available')}
                ${helpers.detailItem('RAM Usage', details.latestHealth?.ramUsage ?? 'Not available')}
                ${helpers.detailItem('Recorded At', helpers.formatDate(details.latestHealth?.recordedAt))}
              </dl>
            </section>

            <section class="device-detail-section">
              <h3>Activity Summary</h3>
              <dl>
                ${helpers.detailItem('Recent Active Distress', details.activity.recentActiveDistressCount)}
                ${helpers.detailItem('Recent Accomplished Distress', details.activity.recentSolvedDistressCount)}
                ${helpers.detailItem('Recent Canceled Distress', details.activity.recentCanceledDistressCount)}
                ${helpers.detailItem('Recent Messages', details.activity.recentMessageCount)}
                ${helpers.detailItem('Total Active Distress', details.activity.totalActiveDistressCount)}
                ${helpers.detailItem('Total Accomplished Distress', details.activity.totalSolvedDistressCount)}
                ${helpers.detailItem('Total Canceled Distress', details.activity.totalCanceledDistressCount)}
                ${helpers.detailItem('Total Messages', details.activity.totalMessageCount)}
              </dl>
            </section>
          </div>
        `;
      }

      async function fetchDetails(deviceId, options = {}) {
        const { silent = false } = options;

        if (!deviceId || detailsRequestInFlight) {
          return false;
        }

        detailsRequestInFlight = true;
        try {
          const payload = await helpers.requestJson(`/api/admin/devices/${deviceId}`);
          renderDetails(payload.data);
          return true;
        } catch (error) {
          if (error.statusCode === 404 && silent) {
            ui.closeDeviceViewModal();
            ui.setFeedback('The selected device is no longer available.', 'error');
            return false;
          }

          if (!silent && dom.deviceViewModalBody) {
            dom.deviceViewModalBody.innerHTML = `<div class="device-view-status-message" data-tone="error">${helpers.escapeHtml(error.message || 'Unable to load device details.')}</div>`;
          }

          return false;
        } finally {
          detailsRequestInFlight = false;
        }
      }

      async function openDetails(deviceId) {
        state.selectedDeviceId = deviceId;
        state.selectedDeviceDetails = null;

        if (dom.deviceViewModalBody) {
          dom.deviceViewModalBody.innerHTML = '<div class="device-view-status-message">Loading device details...</div>';
        }

        if (dom.deviceViewModalCode) {
          dom.deviceViewModalCode.textContent = 'Device details';
        }

        ui.setViewActionMessage('');
        ui.openDeviceViewModal();

        await fetchDetails(deviceId);
      }

      async function refreshSelectedDetails(options = {}) {
        if (!state.selectedDeviceId || !dom.deviceViewModal?.classList.contains('is-open')) {
          return false;
        }

        return fetchDetails(state.selectedDeviceId, {
          silent: true,
          ...options
        });
      }

      if (dom.deviceViewModal) {
        dom.deviceViewModal.querySelectorAll('[data-close-device-view-modal]').forEach((button) => {
          button.addEventListener('click', ui.closeDeviceViewModal);
        });

        dom.deviceViewModal.addEventListener('click', (event) => {
          if (event.target === dom.deviceViewModal) {
            ui.closeDeviceViewModal();
          }
        });
      }

      context.view = {
        openDetails,
        refreshSelectedDetails
      };

      return context.view;
    }
  };
}());
