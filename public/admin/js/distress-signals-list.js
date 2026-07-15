(function createDistressSignalsListModule() {
  const PAGE_SIZE = 10;

  window.ResQMeshDistressSignalsList = {
    init(context) {
      const { dom, state, helpers, ui, data, constants } = context;
      let currentPage = 1;

      function updateSummaryCards() {
        const activeCount = state.signals.filter((signal) => ['unassigned', 'deployed'].includes(signal.accessState)).length;
        const canceledCount = state.signals.filter((signal) => signal.accessState === 'canceled').length;
        const accomplishedCount = state.signals.filter((signal) => signal.accessState === 'accomplished').length;

        if (dom.distressSignalsSummaryActive) {
          dom.distressSignalsSummaryActive.textContent = String(activeCount);
        }

        if (dom.distressSignalsSummaryAssigned) {
          dom.distressSignalsSummaryAssigned.textContent = String(canceledCount);
        }

        if (dom.distressSignalsSummaryDeployed) {
          dom.distressSignalsSummaryDeployed.textContent = String(accomplishedCount);
        }
      }

      function renderRows(pageSignals) {
        dom.distressSignalsTableBody.innerHTML = pageSignals.map((signal) => `
          <tr>
            <td>
              <span class="distress-signals-primary-text">${helpers.escapeHtml(signal.distressCode)}</span>
              <span class="distress-signals-muted-text">${helpers.escapeHtml(helpers.formatShortDate(signal.reportedAt))}</span>
            </td>
            <td>
              <span class="distress-signals-primary-text">${helpers.escapeHtml(signal.civilianName)}</span>
              <span class="distress-signals-muted-text">${helpers.escapeHtml(signal.civilianPhone)}</span>
            </td>
            <td>
              <span class="distress-signals-primary-text">${helpers.escapeHtml(signal.reason)}</span>
            </td>
            <td>
              <span class="distress-signals-location-line">${helpers.escapeHtml(signal.nodeName)}</span>
              <span class="distress-signals-muted-text">${helpers.escapeHtml(signal.nodeId || 'Unknown node')}</span>
            </td>
            <td>
              <span class="distress-signals-assignment-pill" data-state="${helpers.escapeHtml(signal.accessState)}">${helpers.escapeHtml(signal.assignmentLabel)}</span>
              <span class="distress-signals-muted-text">${helpers.escapeHtml(signal.team?.name || 'No team selected')}</span>
            </td>
            <td class="distress-signals-action-cell">
              <button type="button" class="distress-signal-view-button" data-view-distress-id="${helpers.escapeHtml(signal.id)}">
                <i class="fa-regular fa-eye" aria-hidden="true"></i>
                <span>Manage</span>
              </button>
            </td>
          </tr>
        `).join('');
      }

      function render() {
        const count = state.filteredSignals.length;
        const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

        if (currentPage > totalPages) {
          currentPage = totalPages;
        }

        updateSummaryCards();

        if (count === 0) {
          dom.distressSignalsTableBody.innerHTML = '';
          dom.distressSignalsListEmpty.hidden = false;
          dom.distressSignalsListEmpty.textContent = 'No distress signals match the current filters.';
          dom.distressSignalsPagination.hidden = true;
          return;
        }

        dom.distressSignalsListEmpty.hidden = true;

        const startIndex = (currentPage - 1) * PAGE_SIZE;
        const pageSignals = state.filteredSignals.slice(startIndex, startIndex + PAGE_SIZE);
        renderRows(pageSignals);

        dom.distressSignalsPaginationSummary.textContent = `Showing ${startIndex + 1}-${Math.min(startIndex + PAGE_SIZE, count)} of ${count} distress signals`;
        dom.previousDistressSignalsButton.disabled = currentPage === 1;
        dom.nextDistressSignalsButton.disabled = currentPage === totalPages;
        dom.distressSignalsPagination.hidden = false;
      }

      function updateFilterButtons() {
        dom.distressSignalsFilterGroup.querySelectorAll('[data-distress-filter]').forEach((button) => {
          button.classList.toggle('is-active', button.dataset.distressFilter === state.filter);
        });
      }

      function applyFilters() {
        const query = dom.distressSignalsSearchInput.value.trim().toLowerCase();

        state.filteredSignals = state.signals.filter((signal) => {
          if (state.filter !== 'all' && signal.accessState !== state.filter) {
            return false;
          }

          if (!query) {
            return true;
          }

          return helpers.getDistressSearchText(signal, signal.team).includes(query);
        });

        render();
      }

      async function loadSignals({ resetPage = false } = {}) {
        if (resetPage) {
          currentPage = 1;
        }

        state.loading = true;
        ui.setFeedback('');

        try {
          const payload = await helpers.requestJson('/api/admin/distress-signals', {
            method: 'GET'
          });

          state.signals = Array.isArray(payload.data) ? payload.data : [];
          applyFilters();
        } catch (error) {
          state.signals = [];
          state.filteredSignals = [];
          render();
          ui.setFeedback(error.message || 'Unable to load distress signals.', 'error');
        } finally {
          state.loading = false;
        }
      }

      dom.distressSignalsSearchInput.addEventListener('input', () => {
        currentPage = 1;
        applyFilters();
      });

      dom.distressSignalsFilterGroup.addEventListener('click', (event) => {
        const button = event.target.closest('[data-distress-filter]');

        if (!button || !constants.FILTER_OPTIONS.includes(button.dataset.distressFilter)) {
          return;
        }

        state.filter = button.dataset.distressFilter;
        currentPage = 1;
        updateFilterButtons();
        applyFilters();
      });

      dom.distressSignalsTableBody.addEventListener('click', (event) => {
        const button = event.target.closest('[data-view-distress-id]');

        if (!button) {
          return;
        }

        context.view.openDetails(button.dataset.viewDistressId);
      });

      dom.previousDistressSignalsButton.addEventListener('click', () => {
        currentPage = Math.max(1, currentPage - 1);
        render();
      });

      dom.nextDistressSignalsButton.addEventListener('click', () => {
        currentPage += 1;
        render();
      });

      updateFilterButtons();

      context.list = {
        applyFilters,
        loadSignals
      };
    }
  };
}());
