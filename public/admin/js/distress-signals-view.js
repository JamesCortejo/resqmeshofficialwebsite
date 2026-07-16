(function createDistressSignalsViewModule() {
  window.ResQMeshDistressSignalsView = {
    init(context) {
      const { dom, state, helpers, ui, data } = context;
      const VISIBLE_TEAM_LIMIT = 3;

      function getSelectedSignalDetails() {
        return state.selectedSignalDetails;
      }

      function getFilteredTeams() {
        const details = getSelectedSignalDetails();
        const teams = Array.isArray(details?.availableTeams) ? details.availableTeams : [];
        const query = String(state.teamSearchQuery || '').trim().toLowerCase();

        if (!query) {
          return teams;
        }

        return teams.filter((team) => [
          team.name,
          team.teamCode,
          team.agency,
          helpers.getTeamStatusDisplay(team.status),
          ...(team.members || []).map((member) => `${member.fullName} ${member.rescuerCode}`)
        ].join(' ').toLowerCase().includes(query));
      }

      function selectedTeam() {
        return getFilteredTeams().concat(getSelectedSignalDetails()?.availableTeams || []).find((team) => team.id === state.selectedTeamId) || null;
      }

      function getDeploymentStatus(details = getSelectedSignalDetails()) {
        return details?.deployment?.status || details?.accessState || 'unassigned';
      }

      function isReadOnlyEmergency(details = getSelectedSignalDetails()) {
        const status = getDeploymentStatus(details);
        return status === 'canceled' || status === 'accomplished';
      }

      function renderTeamOptions() {
        const visibleTeams = getFilteredTeams().slice(0, VISIBLE_TEAM_LIMIT);

        if (!visibleTeams.length) {
          return `
            <div class="distress-signal-team-empty">
              No rescue teams match the current search.
            </div>
          `;
        }

        return visibleTeams.map((team) => {
          const isSelected = state.selectedTeamId === team.id;
          const roster = (team.members || []).map((member) => `
            <span class="distress-signal-team-roster-chip">${helpers.escapeHtml(member.fullName)}</span>
          `).join('');

          return `
            <article class="distress-signal-team-option">
              <div class="distress-signal-team-header">
                <div>
                  <div class="distress-signal-team-title">${helpers.escapeHtml(team.name)}</div>
                  <div class="distress-signal-team-meta">${helpers.escapeHtml(team.teamCode)} • ${helpers.escapeHtml(team.agency)} • ${helpers.escapeHtml(helpers.getTeamStatusDisplay(team.status))}</div>
                </div>
                <span class="distress-signals-assignment-pill" data-state="${helpers.escapeHtml(team.assignable ? 'deployed' : 'canceled')}">${helpers.escapeHtml(team.memberCount)}/${helpers.escapeHtml(team.capacity)}</span>
              </div>
              <div class="distress-signal-team-roster">${roster || '<span class="distress-signal-team-empty">No active roster available.</span>'}</div>
              <div class="distress-signal-team-footer">
                <span class="distress-signal-team-footnote">${helpers.escapeHtml(team.assignable ? 'Team is ready for deployment.' : 'Inactive teams cannot be deployed.')}</span>
                <button type="button" class="distress-signal-team-button ${isSelected ? 'is-selected' : ''}" data-select-distress-team="${helpers.escapeHtml(team.id)}" ${team.assignable ? '' : 'disabled'}>
                  <i class="fa-solid fa-people-group" aria-hidden="true"></i>
                  <span>${isSelected ? 'Selected Team' : 'Select Team'}</span>
                </button>
              </div>
            </article>
          `;
        }).join('');
      }

      function renderLeaderOptions() {
        const team = selectedTeam();

        if (!team) {
          return '<div class="distress-signal-team-empty">Select a rescue team first to choose the team leader.</div>';
        }

        const members = Array.isArray(team.members) ? team.members : [];

        if (!members.length) {
          return '<div class="distress-signal-team-empty">No active rescuers are available in this team.</div>';
        }

        return members.map((member) => {
          const isSelected = state.selectedLeaderId === member.id;

          return `
            <button type="button" class="distress-signal-team-button ${isSelected ? 'is-selected' : ''}" data-select-team-leader="${helpers.escapeHtml(member.id)}">
              <i class="fa-solid fa-user-shield" aria-hidden="true"></i>
              <span>${helpers.escapeHtml(member.fullName)} (${helpers.escapeHtml(member.rescuerCode)})</span>
            </button>
          `;
        }).join('');
      }

      function syncActionButtons() {
        const details = getSelectedSignalDetails();
        const deploymentStatus = getDeploymentStatus(details);
        const isReadOnly = isReadOnlyEmergency(details);
        const cancelButton = dom.distressSignalModal?.querySelector('[data-cancel-deployment]');
        const canDeploy = Boolean(state.selectedTeamId && state.selectedLeaderId) && deploymentStatus !== 'deployed' && !isReadOnly;

        if (dom.deployDistressTeamButton) {
          dom.deployDistressTeamButton.hidden = isReadOnly;
          dom.deployDistressTeamButton.disabled = isReadOnly || state.modalSubmitting || !canDeploy;
          dom.deployDistressTeamButton.textContent = deploymentStatus === 'deployed' ? 'Team Deployed' : 'Deploy Team';
        }

        if (cancelButton) {
          cancelButton.hidden = isReadOnly;
          cancelButton.disabled = isReadOnly || state.modalSubmitting || deploymentStatus !== 'deployed';
        }
      }

      function renderSignal(details) {
        const teamName = details.team?.name || 'No rescue team selected yet.';
        const leaderDisplay = details.deployment?.teamLeaderName || 'Not assigned';
        const readOnly = isReadOnlyEmergency(details);
        const deploymentControls = readOnly ? `
              <div>
                <h3>Final Deployment Record</h3>
                <div class="distress-signal-status-message">
                  This emergency is already ${helpers.escapeHtml(details.assignmentLabel.toLowerCase())}. Deployment controls are no longer available.
                </div>
              </div>
            ` : `
              <div>
                <h3>Available Rescue Teams</h3>
                <label class="distress-signal-team-search" for="distressSignalTeamSearchInput">
                  <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
                  <input type="search" id="distressSignalTeamSearchInput" placeholder="Search rescue team name, code, agency, or member" value="${helpers.escapeHtml(state.teamSearchQuery)}">
                </label>
                <p class="distress-signal-team-search-note">Showing up to 3 rescue teams at a time for this deployment picker.</p>
                <div class="distress-signal-team-grid" id="distressSignalTeamGrid">
                  ${renderTeamOptions()}
                </div>
              </div>

              <div>
                <h3>Team Leader</h3>
                <div class="distress-signal-team-grid" id="distressSignalLeaderGrid">
                  ${renderLeaderOptions()}
                </div>
              </div>
            `;

        dom.distressSignalModalCode.textContent = details.distressCode;
        dom.distressSignalModalBody.innerHTML = `
          <div class="distress-signal-modal-layout">
            <div class="distress-signal-modal-top-row">
              <section class="distress-signal-detail-card">
                <div class="distress-signal-detail-section">
                  <h3>Emergency Profile</h3>
                  <div class="distress-signal-detail-grid">
                    <div class="distress-signal-detail-item">
                      <span>Civilian</span>
                      <strong>${helpers.escapeHtml(details.civilianName)}</strong>
                    </div>
                    <div class="distress-signal-detail-item">
                      <span>Phone</span>
                      <strong>${helpers.escapeHtml(details.civilianPhone)}</strong>
                    </div>
                    <div class="distress-signal-detail-item">
                      <span>Reason</span>
                      <strong>${helpers.escapeHtml(helpers.formatDistressReason(details.reason))}</strong>
                    </div>
                    <div class="distress-signal-detail-item">
                      <span>Age</span>
                      <strong>${helpers.escapeHtml(details.age)}</strong>
                    </div>
                    <div class="distress-signal-detail-item">
                      <span>Blood Type</span>
                      <strong>${helpers.escapeHtml(details.bloodType)}</strong>
                    </div>
                  </div>
                </div>
              </section>

              <section class="distress-signal-detail-card distress-signal-location-card">
                <div class="distress-signal-detail-section">
                  <h3>Location</h3>
                  <div class="distress-signal-detail-grid">
                    <div class="distress-signal-detail-item">
                      <span>Mesh node</span>
                      <strong>${helpers.escapeHtml(details.nodeName)}</strong>
                    </div>
                    <div class="distress-signal-detail-item">
                      <span>Node ID</span>
                      <strong>${helpers.escapeHtml(details.nodeId || 'Unknown node')}</strong>
                    </div>
                    <div class="distress-signal-detail-item">
                      <span>Coordinates</span>
                      <strong>${helpers.escapeHtml(`${details.latitude}, ${details.longitude}`)}</strong>
                    </div>
                    <div class="distress-signal-detail-item">
                      <span>Reported at</span>
                      <strong>${helpers.escapeHtml(helpers.formatDate(details.reportedAt))}</strong>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <section class="distress-signal-assignment-card distress-signal-deployment-card">
              <div id="distressSignalStatusBlock">
                <h3>Deployment Status</h3>
                <p><span class="distress-signals-assignment-pill" data-state="${helpers.escapeHtml(details.accessState)}">${helpers.escapeHtml(details.assignmentLabel)}</span></p>
                <p class="distress-signals-muted-text">${helpers.escapeHtml(`Current team: ${teamName}`)}</p>
                <p class="distress-signals-muted-text">${helpers.escapeHtml(`Team leader: ${leaderDisplay}`)}</p>
              </div>
              ${deploymentControls}
            </section>
          </div>
        `;

        syncActionButtons();
      }

      function preserveSearchInputFocus(cursorStart, cursorEnd) {
        const input = dom.distressSignalModal?.querySelector('#distressSignalTeamSearchInput');

        if (!input) {
          return;
        }

        input.focus();

        if (typeof cursorStart === 'number' && typeof cursorEnd === 'number') {
          input.setSelectionRange(cursorStart, cursorEnd);
        }
      }

      async function openDetails(signalId) {
        state.selectedSignalId = Number(signalId);
        state.selectedSignalDetails = null;
        state.selectedTeamId = null;
        state.selectedLeaderId = null;
        state.teamSearchQuery = '';
        ui.setActionMessage('Loading distress signal details...');
        dom.distressSignalModalBody.innerHTML = '<div class="distress-signal-status-message">Loading distress signal details...</div>';
        ui.openModal();

        try {
          const payload = await helpers.requestJson(`/api/admin/distress-signals/${signalId}`, {
            method: 'GET'
          });
          const details = payload.data;
          state.selectedSignalDetails = details;
          state.selectedTeamId = details.team?.id || null;
          state.selectedLeaderId = details.deployment?.teamLeaderRescuerId || null;
          renderSignal(details);
          ui.setActionMessage(details.accessState === 'deployed'
            ? 'Deployment is currently active for this distress signal.'
            : details.accessState === 'canceled'
              ? 'This emergency was canceled. Deployment controls are no longer available.'
              : details.accessState === 'accomplished'
                ? 'This emergency was accomplished. You can review the final team assignment.'
                : 'Select a rescue team and leader, then deploy right away.');
        } catch (error) {
          ui.setActionMessage(error.message || 'Unable to load distress signal details.', 'error');
          dom.distressSignalModalBody.innerHTML = `<div class="distress-signal-status-message">${helpers.escapeHtml(error.message || 'Unable to load distress signal details.')}</div>`;
          ui.toast.show(error.message || 'Unable to load distress signal details.', 'warning');
        }
      }

      async function deployTeam() {
        const details = getSelectedSignalDetails();

        if (isReadOnlyEmergency(details)) {
          ui.setActionMessage('Finished emergencies are view-only.', 'warning');
          ui.toast.show('This emergency can no longer be deployed.', 'warning');
          return;
        }

        if (!details || !state.selectedTeamId || !state.selectedLeaderId) {
          ui.setActionMessage('Select both a rescue team and a team leader before deploying.', 'warning');
          ui.toast.show('Select a rescue team and leader first.', 'warning');
          return;
        }

        ui.setModalSubmitting(true);

        try {
          const payload = await helpers.requestJson(`/api/admin/distress-signals/${details.id}/deploy`, {
            method: 'POST',
            body: JSON.stringify({
              teamId: state.selectedTeamId,
              teamLeaderRescuerId: state.selectedLeaderId
            })
          });

          state.selectedSignalDetails = payload.data;
          renderSignal(payload.data);
          ui.setActionMessage(payload.message || 'Deployment created successfully.', 'success');
          ui.toast.show(payload.message || 'Deployment created successfully.', 'success');
          await context.list.loadSignals();
          window.ResQMeshAdminNotifications?.refresh?.();
        } catch (error) {
          ui.setActionMessage(error.message || 'Unable to deploy the selected team.', 'error');
          ui.toast.show(error.message || 'Unable to deploy the selected team.', 'warning');
        } finally {
          ui.setModalSubmitting(false);
          syncActionButtons();
        }
      }

      async function cancelDeployment() {
        const details = getSelectedSignalDetails();
        const deploymentId = details?.deployment?.id;

        if (!deploymentId || details?.accessState !== 'deployed') {
          ui.setActionMessage('Only active deployed distress signals can be canceled.', 'warning');
          ui.toast.show('No deployed distress signal to cancel.', 'warning');
          return;
        }

        ui.setModalSubmitting(true);

        try {
          const payload = await helpers.requestJson(`/api/admin/deployments/${deploymentId}/cancel`, {
            method: 'POST',
            body: JSON.stringify({})
          });

          ui.setActionMessage(payload.message || 'Deployment canceled.', 'success');
          ui.toast.show(payload.message || 'Deployment canceled.', 'success');
          await context.list.loadSignals();
          await openDetails(details.id);
          window.ResQMeshAdminNotifications?.refresh?.();
        } catch (error) {
          ui.setActionMessage(error.message || 'Unable to cancel deployment.', 'error');
          ui.toast.show(error.message || 'Unable to cancel deployment.', 'warning');
        } finally {
          ui.setModalSubmitting(false);
          syncActionButtons();
        }
      }

      dom.distressSignalModal.addEventListener('click', (event) => {
        if (event.target.closest('[data-close-distress-signal-modal]')) {
          ui.closeModal();
          return;
        }

        if (event.target.closest('[data-cancel-deployment]')) {
          cancelDeployment();
          return;
        }

        const teamButton = event.target.closest('[data-select-distress-team]');
        if (teamButton) {
          if (isReadOnlyEmergency()) {
            return;
          }

          state.selectedTeamId = Number(teamButton.dataset.selectDistressTeam);
          state.selectedLeaderId = null;

          if (state.selectedSignalDetails) {
            renderSignal(state.selectedSignalDetails);
            ui.setActionMessage('Rescue team selected. Choose the team leader next.', 'muted');
          }
          return;
        }

        const leaderButton = event.target.closest('[data-select-team-leader]');
        if (leaderButton) {
          if (isReadOnlyEmergency()) {
            return;
          }

          state.selectedLeaderId = Number(leaderButton.dataset.selectTeamLeader);

          if (state.selectedSignalDetails) {
            renderSignal(state.selectedSignalDetails);
            ui.setActionMessage('Team leader selected. You can now deploy right away.', 'muted');
          }
        }
      });

      dom.deployDistressTeamButton.addEventListener('click', deployTeam);

      dom.distressSignalModal.addEventListener('input', (event) => {
        const input = event.target.closest('#distressSignalTeamSearchInput');
        if (!input) {
          return;
        }

        const cursorStart = input.selectionStart;
        const cursorEnd = input.selectionEnd;
        state.teamSearchQuery = input.value;

        if (state.selectedSignalDetails) {
          renderSignal(state.selectedSignalDetails);
          preserveSearchInputFocus(cursorStart, cursorEnd);
        }
      });

      dom.distressSignalModal.addEventListener('keydown', (event) => {
        if (event.target.closest('#distressSignalTeamSearchInput') && event.key === 'Enter') {
          event.preventDefault();
        }
      });

      context.view = {
        openDetails
      };
    }
  };
}());
