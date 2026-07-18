(function createDeviceManagerMessagesModule() {
  const MESSAGE_PAGE_SIZE = 20;

  window.ResQMeshDeviceManagerMessages = {
    init(context) {
      const { dom, state, helpers, ui } = context;
      let messagesRequestInFlight = false;
      let latestRecentMessageCount = 0;
      let acknowledgedRecentMessageCount = 0;

      function setActiveTab(tab) {
        state.activeTab = tab === 'messages' ? 'messages' : 'nodes';

        const isMessages = state.activeTab === 'messages';

        if (dom.devicesNodesPanel) {
          dom.devicesNodesPanel.hidden = isMessages;
          dom.devicesNodesPanel.classList.toggle('is-active', !isMessages);
        }

        if (dom.devicesMessagesPanel) {
          dom.devicesMessagesPanel.hidden = !isMessages;
          dom.devicesMessagesPanel.classList.toggle('is-active', isMessages);
        }

        if (dom.devicesNodesTab) {
          dom.devicesNodesTab.classList.toggle('is-active', !isMessages);
          dom.devicesNodesTab.setAttribute('aria-selected', String(!isMessages));
        }

        if (dom.devicesMessagesTab) {
          dom.devicesMessagesTab.classList.toggle('is-active', isMessages);
          dom.devicesMessagesTab.setAttribute('aria-selected', String(isMessages));
        }

        if (isMessages) {
          clearBadge();

          if (!state.messagesLoading && state.meshMessages.length === 0) {
            loadMessages({ reset: true });
          }
        }
      }

      function updateBadge(count) {
        if (!dom.devicesMessagesTabBadge) {
          return;
        }

        const safeCount = Number(count || 0);
        dom.devicesMessagesTabBadge.hidden = safeCount <= 0;
        dom.devicesMessagesTabBadge.textContent = safeCount > 99 ? '99+' : String(safeCount);
      }

      function clearBadge() {
        acknowledgedRecentMessageCount = latestRecentMessageCount;
        updateBadge(0);
      }

      function updateBadgeFromDevices() {
        latestRecentMessageCount = state.devices.reduce((total, device) => total + Number(device.recentMessageCount || 0), 0);

        if (latestRecentMessageCount < acknowledgedRecentMessageCount) {
          acknowledgedRecentMessageCount = latestRecentMessageCount;
        }

        if (state.activeTab === 'messages') {
          clearBadge();
          return;
        }

        updateBadge(Math.max(0, latestRecentMessageCount - acknowledgedRecentMessageCount));
      }

      function getMessageKey(message) {
        if (message.hasSourceMessageCode && message.messageCode) {
          return `code:${message.messageCode}`;
        }

        return [
          message.type || '',
          message.sourceNodeId || '',
          message.destinationNodeId || '',
          message.senderCode || '',
          message.sentAt || '',
          message.content || ''
        ].join('|');
      }

      function mergeMessages(primary, secondary) {
        const seen = new Set();
        const merged = [];

        [...primary, ...secondary].forEach((message) => {
          const key = getMessageKey(message);

          if (seen.has(key)) {
            return;
          }

          seen.add(key);
          merged.push(message);
        });

        return merged;
      }

      function applyMessageFilters() {
        const query = dom.deviceMessagesSearchInput
          ? dom.deviceMessagesSearchInput.value.trim().toLowerCase()
          : '';

        state.filteredMeshMessages = state.meshMessages.filter((message) => {
          if (!query) {
            return true;
          }

          const matchText = [
            message.messageCode,
            message.typeLabel,
            message.fromLabel,
            message.toLabel,
            message.syncedFromLabel,
            message.senderCode,
            message.senderName,
            message.sourceNodeId,
            message.destinationNodeId,
            message.originNodeId,
            message.content
          ].join(' ').toLowerCase();

          return matchText.includes(query);
        });

        renderMessages();
      }

      function renderMessages() {
        if (!dom.deviceMessagesFeed || !dom.deviceMessagesEmpty) {
          return;
        }

        const count = state.filteredMeshMessages.length;

        if (dom.deviceMessagesSummary) {
          dom.deviceMessagesSummary.textContent = state.messagesLoading && state.meshMessages.length === 0
            ? 'Loading messages'
            : `${count} loaded message${count === 1 ? '' : 's'}`;
        }

        if (dom.deviceMessagesLoadMoreWrapper) {
          dom.deviceMessagesLoadMoreWrapper.hidden = count === 0 || !state.messagesHasMore;
        }

        if (dom.deviceMessagesLoadMoreButton) {
          dom.deviceMessagesLoadMoreButton.disabled = state.messagesLoadingMore;
          const label = dom.deviceMessagesLoadMoreButton.querySelector('span');
          if (label) {
            label.textContent = state.messagesLoadingMore ? 'Loading more messages...' : 'Load more messages';
          }
        }

        if (count === 0) {
          dom.deviceMessagesFeed.innerHTML = '';
          dom.deviceMessagesEmpty.hidden = false;
          dom.deviceMessagesEmpty.textContent = state.messagesLoading
            ? 'Loading synced offline messages...'
            : state.meshMessages.length === 0
              ? 'No synced offline text or broadcast messages yet.'
              : 'No messages match the current search.';
          return;
        }

        dom.deviceMessagesEmpty.hidden = true;
        dom.deviceMessagesFeed.innerHTML = state.filteredMeshMessages.map((message) => `
          <article class="device-message-row device-message-feed-row">
            <div class="device-message-row-header">
              <div>
                <strong>${helpers.escapeHtml(message.senderName || 'Unknown sender')}</strong>
                <span>${helpers.escapeHtml(message.senderCode || 'Unknown code')} &middot; ${helpers.escapeHtml(message.senderRoleLabel || 'Unknown role')}</span>
              </div>
              <span class="device-message-pill">${helpers.escapeHtml(message.typeLabel || 'Message')}</span>
            </div>

            <div class="device-message-route">
              <div class="device-message-route-item">
                <span>From</span>
                <strong>${helpers.escapeHtml(message.fromLabel || 'Unknown source')}</strong>
              </div>
              <i class="fa-solid fa-arrow-right-long" aria-hidden="true"></i>
              <div class="device-message-route-item">
                <span>To</span>
                <strong>${helpers.escapeHtml(message.toLabel || 'Mesh network')}</strong>
              </div>
            </div>

            <p>${helpers.escapeHtml(message.content || 'No message content synced.')}</p>

            <div class="device-message-row-footer">
              <span>${helpers.escapeHtml(message.syncedFromLabel || 'Sync source unknown')}</span>
              <span>${helpers.escapeHtml(helpers.formatDate(message.sentAt || message.uploadedAt))}</span>
            </div>
          </article>
        `).join('');
      }

      async function loadMessages(options = {}) {
        const {
          background = false,
          append = false,
          reset = false
        } = options;

        if (messagesRequestInFlight) {
          return false;
        }

        const offset = append ? state.messagesNextOffset : 0;
        messagesRequestInFlight = true;

        if (append) {
          state.messagesLoadingMore = true;
          renderMessages();
        } else if (!background) {
          state.messagesLoading = true;
          renderMessages();
        }

        try {
          const params = new URLSearchParams({
            limit: String(MESSAGE_PAGE_SIZE),
            offset: String(offset)
          });
          const payload = await helpers.requestJson(`/api/admin/devices/messages?${params.toString()}`);
          const data = payload.data || {};
          const incomingMessages = Array.isArray(data.messages) ? data.messages : [];

          if (append) {
            state.meshMessages = mergeMessages(state.meshMessages, incomingMessages);
          } else if (background && !reset && state.meshMessages.length > 0) {
            state.meshMessages = mergeMessages(incomingMessages, state.meshMessages);
          } else {
            state.meshMessages = incomingMessages;
          }

          if (!background || append || reset || state.meshMessages.length <= incomingMessages.length) {
            state.messagesNextOffset = Number(data.nextOffset || incomingMessages.length || 0);
            state.messagesHasMore = Boolean(data.hasMore);
          }

          if (state.activeTab === 'messages') {
            clearBadge();
          }
          applyMessageFilters();
          ui.setFeedback('');
          return true;
        } catch (error) {
          if (append) {
            ui.setFeedback(error.message || 'Unable to load more mesh messages.', 'error');
          } else if (!background || state.meshMessages.length === 0) {
            state.meshMessages = [];
            state.filteredMeshMessages = [];
            renderMessages();
            ui.setFeedback(error.message || 'Unable to load mesh messages.', 'error');
          }

          return false;
        } finally {
          messagesRequestInFlight = false;
          state.messagesLoadingMore = false;
          state.messagesLoading = false;
          renderMessages();
        }
      }

      if (dom.devicesNodesTab) {
        dom.devicesNodesTab.addEventListener('click', () => setActiveTab('nodes'));
      }

      if (dom.devicesMessagesTab) {
        dom.devicesMessagesTab.addEventListener('click', () => setActiveTab('messages'));
      }

      if (dom.deviceMessagesSearchInput) {
        dom.deviceMessagesSearchInput.addEventListener('input', applyMessageFilters);
      }

      if (dom.deviceMessagesLoadMoreButton) {
        dom.deviceMessagesLoadMoreButton.addEventListener('click', () => {
          loadMessages({ append: true });
        });
      }

      context.messages = {
        loadMessages,
        renderMessages,
        setActiveTab,
        updateBadgeFromDevices
      };

      return context.messages;
    }
  };
}());
