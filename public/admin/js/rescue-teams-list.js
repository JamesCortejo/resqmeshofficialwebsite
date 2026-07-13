(function createRescueTeamsListModule() {
  const pageSize = 10;

  window.ResQMeshRescueTeamList = {
    init(context) {
      const { dom, state, helpers, ui } = context;
      let currentPage = 1;

      function renderRows(pageTeams) {
        if (!dom.rescueTeamsTableBody || !Array.isArray(pageTeams)) {
          return;
        }

        dom.rescueTeamsTableBody.innerHTML = pageTeams.map((team) => `
          <tr>
            <td data-label="Code">${helpers.escapeHtml(team.teamCode)}</td>
            <td data-label="Team">
              <span class="rescue-teams-primary-text">${helpers.escapeHtml(team.name)}</span>
              <span class="rescue-teams-muted-text">${helpers.escapeHtml(helpers.getStatusDisplay(team.status))}</span>
            </td>
            <td data-label="Agency">${helpers.escapeHtml(helpers.getAgencyDisplay(team.agency))}</td>
            <td data-label="Members">
              <span class="rescue-teams-count-pill">${helpers.escapeHtml(`${team.memberCount}/5`)}</span>
            </td>
            <td data-label="Status">
              <span class="rescue-teams-status-pill" data-status="${helpers.escapeHtml(team.status)}">
                ${helpers.escapeHtml(helpers.getStatusDisplay(team.status))}
              </span>
            </td>
            <td data-label="Action" class="rescue-teams-action-cell">
              <button type="button" class="rescue-teams-view-button" data-view-team-id="${helpers.escapeHtml(team.id)}">
                <i class="fa-regular fa-eye" aria-hidden="true"></i>
                <span>View</span>
              </button>
            </td>
          </tr>
        `).join('');
      }

      function render() {
        if (!dom.rescueTeamsTableBody || !dom.rescueTeamsListEmpty) {
          return;
        }

        const filteredCount = state.filteredTeams.length;
        const totalPages = Math.max(1, Math.ceil(filteredCount / pageSize));

        if (currentPage > totalPages) {
          currentPage = totalPages;
        }

        if (filteredCount === 0) {
          dom.rescueTeamsTableBody.innerHTML = '';
          dom.rescueTeamsListEmpty.hidden = false;
          dom.rescueTeamsListEmpty.textContent = state.loading
            ? 'Loading rescue teams...'
            : state.teams.length === 0
              ? 'No rescue teams added yet.'
              : 'No rescue teams match the current search.';

          if (dom.rescueTeamsPagination) {
            dom.rescueTeamsPagination.hidden = true;
          }

          return;
        }

        dom.rescueTeamsListEmpty.hidden = true;
        const startIndex = (currentPage - 1) * pageSize;
        const pageTeams = state.filteredTeams.slice(startIndex, startIndex + pageSize);
        renderRows(pageTeams);

        if (dom.rescueTeamsPaginationSummary) {
          dom.rescueTeamsPaginationSummary.textContent = `Showing ${startIndex + 1}-${Math.min(startIndex + pageSize, filteredCount)} of ${filteredCount} rescue teams`;
        }

        if (dom.previousRescueTeamsButton) {
          dom.previousRescueTeamsButton.disabled = currentPage === 1;
        }

        if (dom.nextRescueTeamsButton) {
          dom.nextRescueTeamsButton.disabled = currentPage === totalPages;
        }

        if (dom.rescueTeamsPagination) {
          dom.rescueTeamsPagination.hidden = false;
        }
      }

      function applySearchFilter() {
        const query = dom.rescueTeamsSearchInput ? dom.rescueTeamsSearchInput.value.trim().toLowerCase() : '';

        state.filteredTeams = state.teams.filter((team) => {
          if (!query) {
            return true;
          }

          const matchText = [
            team.teamCode,
            team.name,
            team.agency,
            team.status,
            team.memberCount
          ].join(' ').toLowerCase();

          return matchText.includes(query);
        });

        render();
      }

      async function loadTeams(options = {}) {
        const { resetPage = true, silent = false } = options;

        state.loading = true;
        if (resetPage) {
          currentPage = 1;
        }
        render();

        try {
          const payload = await helpers.requestJson('/api/admin/rescue-teams');
          state.teams = Array.isArray(payload.data) ? payload.data : [];
          applySearchFilter();
          ui.setFeedback('');
        } catch (error) {
          state.teams = [];
          state.filteredTeams = [];
          render();
          if (!silent) {
            ui.setFeedback(error.message || 'Unable to load rescue teams.', 'error');
          }
        } finally {
          state.loading = false;
          render();
        }
      }

      if (dom.rescueTeamsSearchInput) {
        dom.rescueTeamsSearchInput.addEventListener('input', () => {
          currentPage = 1;
          applySearchFilter();
        });
      }

      if (dom.rescueTeamsTableBody) {
        dom.rescueTeamsTableBody.addEventListener('click', (event) => {
          const button = event.target.closest('[data-view-team-id]');
          if (!button) {
            return;
          }

          context.view?.openDetails(button.dataset.viewTeamId);
        });
      }

      if (dom.previousRescueTeamsButton) {
        dom.previousRescueTeamsButton.addEventListener('click', () => {
          currentPage = Math.max(1, currentPage - 1);
          render();
        });
      }

      if (dom.nextRescueTeamsButton) {
        dom.nextRescueTeamsButton.addEventListener('click', () => {
          currentPage += 1;
          render();
        });
      }

      context.list = {
        render,
        applySearchFilter,
        loadTeams
      };

      return context.list;
    }
  };
}());
