(function createRescuersListModule() {
  const pageSize = 10;

  window.ResQMeshRescuerList = {
    init(context) {
      const { dom, state, helpers, ui } = context;
      let currentPage = 1;

      function paginationLabel() {
        if (state.accessFilter === 'archived') {
          return 'archived rescuers';
        }

        if (state.accessFilter === 'active') {
          return 'active rescuers';
        }

        if (state.accessFilter === 'dispatched') {
          return 'dispatched rescuers';
        }

        return 'rescuers';
      }

      function renderRescuerRows(pageRescuers) {
        if (!dom.rescuersTableBody || !dom.rescuersListEmpty || !Array.isArray(pageRescuers)) {
          return;
        }

        dom.rescuersListEmpty.hidden = true;
        dom.rescuersTableBody.innerHTML = pageRescuers.map((rescuer) => {
          const isArchived = String(rescuer.accessStatus || '').toLowerCase() === 'archived';
          const visibleStatus = isArchived ? 'archived' : rescuer.status;
          const visibleStatusLabel = isArchived ? 'Archived' : helpers.getStatusDisplay(rescuer.status);

          return `
          <tr>
            <td data-label="ID">${helpers.escapeHtml(rescuer.rescuerCode)}</td>
            <td data-label="Rescuer">
              <span class="rescuers-primary-text">${helpers.escapeHtml(rescuer.fullName)}</span>
              <span class="rescuers-muted-text">${helpers.escapeHtml(helpers.getAgencyDisplay(rescuer.agency))}</span>
            </td>
            <td data-label="Contact">
              <span class="rescuers-primary-text">${helpers.escapeHtml(rescuer.phone)}</span>
              <span class="rescuers-muted-text">${helpers.escapeHtml(helpers.getAccessStatusDisplay(rescuer.accessStatus))}</span>
            </td>
            <td data-label="Team">${helpers.escapeHtml(rescuer.team?.name || 'Unassigned')}</td>
            <td data-label="Status">
              <span class="rescuers-status-pill" data-status="${helpers.escapeHtml(visibleStatus)}">
                ${helpers.escapeHtml(visibleStatusLabel)}
              </span>
            </td>
            <td data-label="Action" class="rescuers-action-cell">
              <button type="button" class="rescuers-view-button" data-view-rescuer-id="${helpers.escapeHtml(rescuer.id)}">
                <i class="fa-regular fa-eye" aria-hidden="true"></i>
                <span>View</span>
              </button>
            </td>
          </tr>
        `;
        }).join('');
      }

      function render() {
        if (!dom.rescuersTableBody || !dom.rescuersListEmpty) {
          return;
        }

        const filteredCount = state.filteredRescuers.length;
        const totalPages = Math.max(1, Math.ceil(filteredCount / pageSize));

        if (currentPage > totalPages) {
          currentPage = totalPages;
        }

        if (filteredCount === 0) {
          dom.rescuersTableBody.innerHTML = '';
          dom.rescuersListEmpty.hidden = false;
          dom.rescuersListEmpty.textContent = state.loading
            ? 'Loading rescuers...'
            : state.rescuers.length === 0
              ? 'No rescuers added yet.'
              : 'No rescuers match the current filters.';

          if (dom.rescuersPagination) {
            dom.rescuersPagination.hidden = true;
          }

          return;
        }

        const startIndex = (currentPage - 1) * pageSize;
        const pageRescuers = state.filteredRescuers.slice(startIndex, startIndex + pageSize);

        renderRescuerRows(pageRescuers);

        if (dom.rescuersPaginationSummary) {
          dom.rescuersPaginationSummary.textContent = `Showing ${startIndex + 1}-${Math.min(startIndex + pageSize, filteredCount)} of ${filteredCount} ${paginationLabel()}`;
        }

        if (dom.previousRescuersButton) {
          dom.previousRescuersButton.disabled = currentPage === 1;
        }

        if (dom.nextRescuersButton) {
          dom.nextRescuersButton.disabled = currentPage === totalPages;
        }

        if (dom.rescuersPagination) {
          dom.rescuersPagination.hidden = false;
        }
      }

      function applySearchFilter() {
        const query = dom.rescuersSearchInput ? dom.rescuersSearchInput.value.trim().toLowerCase() : '';
        state.accessFilter = dom.rescuersStatusFilter
          ? String(dom.rescuersStatusFilter.value || 'all')
          : state.accessFilter;

        state.filteredRescuers = state.rescuers.filter((rescuer) => {
          const accessStatus = String(rescuer.accessStatus || '').toLowerCase();
          const operationalStatus = String(rescuer.status || '').toLowerCase();

          if (state.accessFilter === 'active' && accessStatus !== 'active') {
            return false;
          }

          if (state.accessFilter === 'archived' && accessStatus !== 'archived') {
            return false;
          }

          if (state.accessFilter === 'dispatched' && !(accessStatus === 'active' && operationalStatus === 'dispatched')) {
            return false;
          }

          if (!query) {
            return true;
          }

          const matchText = [
            rescuer.rescuerCode,
            rescuer.fullName,
            rescuer.phone,
            rescuer.team?.name || '',
            rescuer.status,
            rescuer.agency,
            rescuer.accessStatus
          ].join(' ').toLowerCase();

          return matchText.includes(query);
        });

        render();
      }

      async function loadRescuers() {
        state.loading = true;
        currentPage = 1;
        render();

        try {
          const payload = await helpers.requestJson('/api/admin/rescuers');
          state.rescuers = Array.isArray(payload.data) ? payload.data : [];
          applySearchFilter();
          ui.setFeedback('');
        } catch (error) {
          state.rescuers = [];
          state.filteredRescuers = [];
          render();
          ui.setFeedback(error.message || 'Unable to load rescuers.', 'error');
        } finally {
          state.loading = false;
          render();
        }
      }

      if (dom.rescuersSearchInput) {
        dom.rescuersSearchInput.addEventListener('input', () => {
          currentPage = 1;
          applySearchFilter();
        });
      }

      if (dom.rescuersStatusFilter) {
        dom.rescuersStatusFilter.addEventListener('change', () => {
          state.accessFilter = dom.rescuersStatusFilter.value || 'all';
          currentPage = 1;
          applySearchFilter();
        });
      }

      if (dom.rescuersTableBody) {
        dom.rescuersTableBody.addEventListener('click', (event) => {
          const button = event.target.closest('[data-view-rescuer-id]');
          if (!button) {
            return;
          }

          context.view?.openDetails(button.dataset.viewRescuerId);
        });
      }

      if (dom.previousRescuersButton) {
        dom.previousRescuersButton.addEventListener('click', () => {
          currentPage = Math.max(1, currentPage - 1);
          render();
        });
      }

      if (dom.nextRescuersButton) {
        dom.nextRescuersButton.addEventListener('click', () => {
          currentPage += 1;
          render();
        });
      }

      context.list = {
        loadRescuers,
        renderRescuerRows,
        render,
        applySearchFilter
      };

      return context.list;
    }
  };
}());
