(function createDeviceManagerViewModule() {
  window.ResQMeshDeviceManagerView = {
    init(context) {
      const { dom, state, helpers, ui } = context;
      let detailsRequestInFlight = false;

      function renderConversationSummaries(conversations) {
        if (!Array.isArray(conversations) || conversations.length === 0) {
          return '<div class="device-message-empty">No synced offline mesh conversations yet.</div>';
        }

        return conversations.map((conversation) => `
          <article class="device-conversation-card">
            <div>
              <h4>${helpers.escapeHtml(conversation.label)}</h4>
              <p>${helpers.escapeHtml(conversation.participantCount)} participant${conversation.participantCount === 1 ? '' : 's'} in latest ${helpers.escapeHtml(conversation.visibleMessageCount)} synced message${conversation.visibleMessageCount === 1 ? '' : 's'}</p>
            </div>
            <span class="device-message-pill">${helpers.escapeHtml((conversation.messageTypes || []).join(', ') || 'Message')}</span>
          </article>
        `).join('');
      }

      function renderRecentMeshMessages(messages) {
        if (!Array.isArray(messages) || messages.length === 0) {
          return '<div class="device-message-empty">No recent synced messages for this device.</div>';
        }

        return messages.map((message) => `
          <article class="device-message-row">
            <div class="device-message-row-header">
              <div>
                <strong>${helpers.escapeHtml(message.senderName)}</strong>
                <span>${helpers.escapeHtml(message.senderCode || 'Unknown code')} · ${helpers.escapeHtml(message.senderRoleLabel)}</span>
              </div>
              <span class="device-message-pill">${helpers.escapeHtml(message.typeLabel)}</span>
            </div>
            <p>${helpers.escapeHtml(message.content || 'No message content synced.')}</p>
            <div class="device-message-row-footer">
              <span>${helpers.escapeHtml(message.conversationLabel)}</span>
              <span>${helpers.escapeHtml(helpers.formatDate(message.sentAt || message.uploadedAt))}</span>
            </div>
          </article>
        `).join('');
      }

      function renderMessages(payload) {
        if (!dom.deviceMessagesModalBody || !dom.deviceMessagesModalCode) {
          return;
        }

        state.selectedDeviceMessages = payload;
        const device = payload.device || {};
        dom.deviceMessagesModalCode.textContent = `${device.nodeId || 'Device'} - Offline mesh messages`;
        dom.deviceMessagesModalBody.innerHTML = `
          <div class="device-message-monitor-shell">
            <section class="device-detail-hero">
              <div>
                <h3>${helpers.escapeHtml(device.nodeName || device.nodeId || 'Mesh node')}</h3>
                <p>${helpers.escapeHtml(device.nodeId || 'Unknown node')}</p>
              </div>
              <div class="device-detail-badges">
                <span class="device-inline-pill" data-status="${helpers.escapeHtml(device.connectivityStatus || 'offline')}">${helpers.escapeHtml(device.connectivityStatusLabel || 'Unknown')}</span>
                <span class="device-message-pill">Latest ${helpers.escapeHtml(payload.limit || 30)}</span>
              </div>
            </section>

            <section class="device-detail-section device-message-monitor-section">
              <div class="device-message-section-heading">
                <div>
                  <h3>Conversation Summary</h3>
                  <p>Monitoring-only view of synced offline text and broadcast messages. Voice clips are not loaded here.</p>
                </div>
              </div>
              <div class="device-conversation-grid">
                ${renderConversationSummaries(payload.conversations)}
              </div>
            </section>

            <section class="device-detail-section device-message-monitor-section">
              <div class="device-message-section-heading">
                <div>
                  <h3>Recent Synced Messages</h3>
                  <p>Newest messages received from this mesh node through cloud sync.</p>
                </div>
              </div>
              <div class="device-message-list device-message-list-large">
                ${renderRecentMeshMessages(payload.recentMessages)}
              </div>
            </section>
          </div>
        `;
      }

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

      async function fetchMessages(deviceId, options = {}) {
        const { silent = false } = options;

        if (!deviceId) {
          return false;
        }

        try {
          const payload = await helpers.requestJson(`/api/admin/devices/${deviceId}/messages`);
          renderMessages(payload.data);
          return true;
        } catch (error) {
          if (error.statusCode === 404 && silent) {
            ui.closeDeviceMessagesModal();
            ui.setFeedback('The selected device is no longer available.', 'error');
            return false;
          }

          if (!silent && dom.deviceMessagesModalBody) {
            dom.deviceMessagesModalBody.innerHTML = `<div class="device-view-status-message" data-tone="error">${helpers.escapeHtml(error.message || 'Unable to load device messages.')}</div>`;
          }

          return false;
        }
      }

      async function openMessages(deviceId) {
        state.selectedMessagesDeviceId = deviceId;
        state.selectedDeviceMessages = null;

        if (dom.deviceMessagesModalBody) {
          dom.deviceMessagesModalBody.innerHTML = '<div class="device-view-status-message">Loading device messages...</div>';
        }

        if (dom.deviceMessagesModalCode) {
          dom.deviceMessagesModalCode.textContent = 'Offline mesh messages';
        }

        ui.setMessagesActionMessage('');
        ui.openDeviceMessagesModal();

        await fetchMessages(deviceId);
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

      async function refreshSelectedMessages(options = {}) {
        if (!state.selectedMessagesDeviceId || !dom.deviceMessagesModal?.classList.contains('is-open')) {
          return false;
        }

        return fetchMessages(state.selectedMessagesDeviceId, {
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

      if (dom.deviceMessagesModal) {
        dom.deviceMessagesModal.querySelectorAll('[data-close-device-messages-modal]').forEach((button) => {
          button.addEventListener('click', ui.closeDeviceMessagesModal);
        });

        dom.deviceMessagesModal.addEventListener('click', (event) => {
          if (event.target === dom.deviceMessagesModal) {
            ui.closeDeviceMessagesModal();
          }
        });
      }

      context.view = {
        openDetails,
        openMessages,
        refreshSelectedDetails,
        refreshSelectedMessages
      };

      return context.view;
    }
  };
}());
