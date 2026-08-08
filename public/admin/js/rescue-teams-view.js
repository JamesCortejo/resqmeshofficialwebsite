(function createRescueTeamsViewModule() {
  window.ResQMeshRescueTeamView = {
    init(context) {
      const { dom, state, constants, helpers, ui, toast } = context;
      let selectedRescuerIds = [];

      function isDispatchedTeam(details = state.selectedTeamDetails) {
        return String(details?.status || '').toLowerCase() === 'dispatched';
      }

      function rosterChanged(nextIds) {
        const previous = (state.selectedTeamDetails?.members || [])
          .map((rescuer) => Number.parseInt(String(rescuer.id), 10))
          .filter(Number.isInteger)
          .sort((left, right) => left - right);
        const next = [...nextIds].sort((left, right) => left - right);

        return previous.length !== next.length
          || previous.some((value, index) => value !== next[index]);
      }

      function buildRosterPool(details) {
        const byId = new Map();

        state.assignableRescuers.forEach((rescuer) => {
          byId.set(String(rescuer.id), rescuer);
        });

        (details.members || []).forEach((rescuer) => {
          byId.set(String(rescuer.id), rescuer);
        });

        return Array.from(byId.values());
      }

      function getRescuerFromPool(id) {
        if (!state.selectedTeamDetails) {
          return null;
        }

        return buildRosterPool(state.selectedTeamDetails).find((rescuer) => String(rescuer.id) === String(id)) || null;
      }

      function updateSelectedCount() {
        if (!dom.rescueTeamViewModalBody) {
          return;
        }

        const countElement = dom.rescueTeamViewModalBody.querySelector('#rescueTeamEditRosterCount');
        if (countElement) {
          countElement.textContent = `Selected ${selectedRescuerIds.length}/${constants.MAX_MEMBERS}`;
        }
      }

      function selectedRescuerCard(rescuer, currentTeamId) {
        const isCurrentTeam = rescuer.team?.id === currentTeamId;
        const isLocked = isDispatchedTeam();
        let note = isCurrentTeam
          ? 'Currently assigned to this team.'
          : 'Currently unassigned.';

        if (isLocked) {
          note = 'Roster locked while this team is dispatched.';
        }

        return `
          <article class="rescue-team-selected-item">
            <div class="rescue-team-selected-copy">
              <strong>${helpers.escapeHtml(rescuer.fullName)}</strong>
              <span>${helpers.escapeHtml(`${rescuer.rescuerCode} - ${helpers.getAgencyDisplay(rescuer.agency)}`)}</span>
              <span>${helpers.escapeHtml(note)}</span>
            </div>
            ${isLocked ? '' : `
              <button
                type="button"
                class="rescue-team-selected-remove"
                data-remove-view-selected-rescuer-id="${helpers.escapeHtml(rescuer.id)}"
                aria-label="Remove ${helpers.escapeHtml(rescuer.fullName)}"
              >
                <i class="fa-solid fa-xmark" aria-hidden="true"></i>
              </button>
            `}
          </article>
        `;
      }

      function searchResultCard(rescuer, currentTeamId) {
        const isSelected = selectedRescuerIds.includes(rescuer.id);
        const isAtCapacity = selectedRescuerIds.length >= constants.MAX_MEMBERS;
        const isLocked = isDispatchedTeam();
        const disabled = isLocked || isSelected || isAtCapacity;
        const isCurrentTeam = rescuer.team?.id === currentTeamId;
        let note = isCurrentTeam
          ? 'Already part of this team.'
          : 'Unassigned and ready to add.';

        if (isLocked) {
          note = 'Team is dispatched; roster changes are locked.';
        }

        return `
          <article class="rescue-team-search-result${disabled ? ' is-disabled' : ''}">
            <div class="rescue-team-search-result-copy">
              <strong>${helpers.escapeHtml(rescuer.fullName)}</strong>
              <span>${helpers.escapeHtml(`${rescuer.rescuerCode} - ${helpers.getAgencyDisplay(rescuer.agency)}`)}</span>
              <span>${helpers.escapeHtml(note)}</span>
            </div>
            <button
              type="button"
              class="rescue-team-search-add"
              data-add-view-rescuer-id="${helpers.escapeHtml(rescuer.id)}"
              ${disabled ? 'disabled' : ''}
            >
              <i class="fa-solid fa-plus" aria-hidden="true"></i>
              <span>${isLocked ? 'Locked' : isSelected ? 'Selected' : 'Add'}</span>
            </button>
          </article>
        `;
      }

      function renderSelectedList() {
        if (!dom.rescueTeamViewModalBody || !state.selectedTeamDetails) {
          return;
        }

        const selectedList = dom.rescueTeamViewModalBody.querySelector('#rescueTeamEditSelectedList');
        if (!selectedList) {
          return;
        }

        if (selectedRescuerIds.length === 0) {
          selectedList.innerHTML = '<div class="rescue-team-selected-empty">No rescuers selected yet.</div>';
          updateSelectedCount();
          return;
        }

        selectedList.innerHTML = selectedRescuerIds
          .map((id) => getRescuerFromPool(id))
          .filter(Boolean)
          .map((rescuer) => selectedRescuerCard(rescuer, state.selectedTeamDetails.id))
          .join('');

        updateSelectedCount();
      }

      function renderSearchResults() {
        if (!dom.rescueTeamViewModalBody || !state.selectedTeamDetails) {
          return;
        }

        const resultsElement = dom.rescueTeamViewModalBody.querySelector('#rescueTeamEditRosterResults');
        const searchInput = dom.rescueTeamViewModalBody.querySelector('#rescueTeamEditRescuerSearchInput');

        if (!resultsElement) {
          return;
        }

        const filtered = helpers.filterAssignableRescuers(
          buildRosterPool(state.selectedTeamDetails),
          searchInput?.value || ''
        );

        if (filtered.length === 0) {
          resultsElement.innerHTML = '<div class="rescue-team-search-empty">No rescuers match this search.</div>';
          return;
        }

        resultsElement.innerHTML = filtered
          .map((rescuer) => searchResultCard(rescuer, state.selectedTeamDetails.id))
          .join('');
      }

      function renderPicker() {
        renderSelectedList();
        renderSearchResults();
      }

      function applyDispatchedLockState() {
        if (!dom.rescueTeamViewModalBody || !isDispatchedTeam()) {
          return;
        }

        const statusSelect = dom.rescueTeamViewModalBody.querySelector('#rescueTeamEditStatusSelect');
        const searchInput = dom.rescueTeamViewModalBody.querySelector('#rescueTeamEditRescuerSearchInput');

        if (statusSelect) {
          statusSelect.disabled = true;
        }

        if (searchInput) {
          searchInput.disabled = true;
        }
      }

      function renderDetails(details) {
        if (!dom.rescueTeamViewModalBody || !dom.rescueTeamViewModalCode) {
          return;
        }

        state.selectedTeamDetails = details;
        selectedRescuerIds = (details.members || []).map((rescuer) => rescuer.id);
        const isLocked = isDispatchedTeam(details);
        const statusOptions = isLocked
          ? [{ value: 'dispatched', label: 'Dispatched' }]
          : constants.STATUS_OPTIONS;

        dom.rescueTeamViewModalCode.textContent = `${details.teamCode} - ${helpers.getStatusDisplay(details.status)}`;
        dom.rescueTeamViewModalBody.innerHTML = `
          <div class="rescue-team-detail-grid">
            <section class="rescue-team-detail-section">
              <h3>Team profile</h3>
              <div class="rescue-team-form-grid">
                <label class="rescue-team-field">
                  <span>Team code</span>
                  <input type="text" value="${helpers.escapeHtml(details.teamCode)}" readonly>
                </label>
                <label class="rescue-team-field">
                  <span>Team name</span>
                  <input type="text" id="rescueTeamEditNameInput" value="${helpers.escapeHtml(details.name)}">
                </label>
                <label class="rescue-team-field">
                  <span>Agency</span>
                  <select id="rescueTeamEditAgencySelect">
                    ${constants.AGENCY_OPTIONS.map((option) => `
                      <option value="${helpers.escapeHtml(option.value)}"${option.value === details.agency ? ' selected' : ''}>
                        ${helpers.escapeHtml(option.label)}
                      </option>
                    `).join('')}
                  </select>
                </label>
                <label class="rescue-team-field">
                  <span>Team status</span>
                  <select id="rescueTeamEditStatusSelect" ${isLocked ? 'disabled' : ''}>
                    ${statusOptions.map((option) => `
                      <option value="${helpers.escapeHtml(option.value)}"${option.value === details.status ? ' selected' : ''}>
                        ${helpers.escapeHtml(option.label)}
                      </option>
                    `).join('')}
                  </select>
                  ${isLocked ? '<em class="rescue-team-lock-note">Status is locked while the team is dispatched.</em>' : ''}
                </label>
              </div>
            </section>

            <section class="rescue-team-detail-section">
              <div class="rescue-team-roster-header">
                <div>
                  <h3>Team roster</h3>
                  <p>${isLocked ? 'Roster is locked while this team is dispatched.' : 'Search active rescuers and add them to this team.'}</p>
                </div>
                <span class="rescue-team-roster-count" id="rescueTeamEditRosterCount">Selected ${selectedRescuerIds.length}/${constants.MAX_MEMBERS}</span>
              </div>
              <div class="rescue-team-picker">
                <label class="rescue-team-picker-search" for="rescueTeamEditRescuerSearchInput">
                  <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
                  <input type="search" id="rescueTeamEditRescuerSearchInput" placeholder="Search rescuer name, code, agency, or current team" ${isLocked ? 'disabled' : ''}>
                </label>
                <div class="rescue-team-picker-results" id="rescueTeamEditRosterResults"></div>
                <div class="rescue-team-selected">
                  <h4>Selected rescuers</h4>
                  <div class="rescue-team-selected-list" id="rescueTeamEditSelectedList"></div>
                </div>
              </div>
            </section>

            <section class="rescue-team-detail-section">
              <h3>Audit / Meta</h3>
              <dl>
                <div class="rescue-team-detail-item">
                  <dt>Members</dt>
                  <dd>${helpers.escapeHtml(`${details.memberCount}/5`)}</dd>
                </div>
                <div class="rescue-team-detail-item">
                  <dt>Created at</dt>
                  <dd>${helpers.escapeHtml(helpers.formatDate(details.createdAt))}</dd>
                </div>
                <div class="rescue-team-detail-item">
                  <dt>Updated at</dt>
                  <dd>${helpers.escapeHtml(helpers.formatDate(details.updatedAt))}</dd>
                </div>
              </dl>
            </section>
          </div>
        `;

        renderPicker();
        ui.setViewActionMessage('');
      }

      function readPayload() {
        if (!dom.rescueTeamViewModalBody) {
          return null;
        }

        return {
          name: String(dom.rescueTeamViewModalBody.querySelector('#rescueTeamEditNameInput')?.value || '').trim(),
          agency: String(dom.rescueTeamViewModalBody.querySelector('#rescueTeamEditAgencySelect')?.value || '').trim(),
          status: String(dom.rescueTeamViewModalBody.querySelector('#rescueTeamEditStatusSelect')?.value || '').trim(),
          rescuerIds: [...selectedRescuerIds]
        };
      }

      function addRescuer(id) {
        if (isDispatchedTeam()) {
          ui.setViewActionMessage('Roster changes are locked while this team is dispatched.', 'error');
          return;
        }

        const parsedId = Number.parseInt(String(id), 10);
        if (!Number.isInteger(parsedId) || selectedRescuerIds.includes(parsedId)) {
          return;
        }

        if (selectedRescuerIds.length >= constants.MAX_MEMBERS) {
          ui.setViewActionMessage(`Only ${constants.MAX_MEMBERS} rescuers can be assigned to a team.`, 'error');
          renderSearchResults();
          return;
        }

        selectedRescuerIds.push(parsedId);
        ui.setViewActionMessage('Rescuer added to the team roster.', 'info');
        renderPicker();
      }

      function removeRescuer(id) {
        if (isDispatchedTeam()) {
          ui.setViewActionMessage('Roster changes are locked while this team is dispatched.', 'error');
          return;
        }

        const parsedId = Number.parseInt(String(id), 10);
        selectedRescuerIds = selectedRescuerIds.filter((rescuerId) => rescuerId !== parsedId);
        ui.setViewActionMessage('Rescuer removed from the team roster.', 'info');
        renderPicker();
      }

      async function openDetails(teamId) {
        state.selectedTeamId = teamId;
        state.selectedTeamDetails = null;
        selectedRescuerIds = [];

        if (dom.rescueTeamViewModalBody) {
          dom.rescueTeamViewModalBody.innerHTML = '<div class="rescue-team-view-status-message">Loading rescue team details...</div>';
        }
        if (dom.rescueTeamViewModalCode) {
          dom.rescueTeamViewModalCode.textContent = 'Rescue team details';
        }

        ui.setViewActionMessage('');
        ui.setViewSubmitState(false);
        ui.openViewModal();

        try {
          await context.data.loadAssignableRescuers();
        } catch (error) {
          toast.show(error.message || 'Assignable rescuers could not be refreshed.', 'warning');
        }

        try {
          const payload = await helpers.requestJson(`/api/admin/rescue-teams/${teamId}`);
          renderDetails(payload.data);
        } catch (error) {
          if (dom.rescueTeamViewModalBody) {
            dom.rescueTeamViewModalBody.innerHTML = `<div class="rescue-team-view-status-message">${helpers.escapeHtml(error.message || 'Unable to load rescue team details.')}</div>`;
          }
          ui.setViewActionMessage('', 'muted');
        }
      }

      function validatePayload(payload) {
        if (!payload || !payload.name) {
          return 'Rescue team name is required.';
        }

        if (!payload.agency) {
          return 'Agency is required.';
        }

        if (!payload.status) {
          return 'Team status is required.';
        }

        if (payload.rescuerIds.length > constants.MAX_MEMBERS) {
          return `Only ${constants.MAX_MEMBERS} rescuers can be assigned to a team.`;
        }

        if (isDispatchedTeam()) {
          const statusChanged = payload.status !== state.selectedTeamDetails.status;
          if (statusChanged || rosterChanged(payload.rescuerIds)) {
            return 'Dispatched teams cannot change status or roster until the active response is closed.';
          }
        }

        return '';
      }

      function openSaveConfirm() {
        if (!state.selectedTeamId || state.viewSubmitting) {
          return;
        }

        const payload = readPayload();
        const validationMessage = validatePayload(payload);

        if (validationMessage) {
          ui.setViewActionMessage(validationMessage, 'error');
          return;
        }

        if (dom.rescueTeamSaveConfirmMessage) {
          dom.rescueTeamSaveConfirmMessage.textContent = `Save changes to ${payload.name}?`;
        }

        dom.rescueTeamSaveConfirmModal?.classList.add('is-open');
        dom.rescueTeamSaveConfirmModal?.setAttribute('aria-hidden', 'false');
        ui.setBodyLock();
      }

      function closeSaveConfirm() {
        dom.rescueTeamSaveConfirmModal?.classList.remove('is-open');
        dom.rescueTeamSaveConfirmModal?.setAttribute('aria-hidden', 'true');
        ui.setBodyLock();
      }

      async function saveChanges() {
        if (!state.selectedTeamId || state.viewSubmitting) {
          return;
        }

        const payload = readPayload();
        const validationMessage = validatePayload(payload);

        if (validationMessage) {
          closeSaveConfirm();
          ui.setViewActionMessage(validationMessage, 'error');
          return;
        }

        closeSaveConfirm();
        ui.setViewSubmitState(true);
        ui.setViewActionMessage('Saving rescue team changes...', 'info');

        try {
          const response = await helpers.requestJson(`/api/admin/rescue-teams/${state.selectedTeamId}`, {
            method: 'PATCH',
            body: JSON.stringify(payload)
          });

          toast.show(response.message || 'Rescue team updated successfully.', 'success');
          await Promise.all([
            context.data.loadAssignableRescuers(),
            context.list.loadTeams({ resetPage: false, silent: true })
          ]);
          await helpers.refreshAdminNotifications();
          ui.closeViewModal();
        } catch (error) {
          if (error.routeMissing || error.statusCode >= 500) {
            ui.setViewActionMessage('', 'muted');
            toast.show(error.message || 'Unable to update rescue team.', 'warning');
          } else {
            ui.setViewActionMessage(error.message || 'Unable to update rescue team.', 'error');
          }
        } finally {
          ui.setViewSubmitState(false);
          applyDispatchedLockState();
        }
      }

      if (dom.rescueTeamViewModal) {
        dom.rescueTeamViewModal.querySelectorAll('[data-close-rescue-team-view-modal]').forEach((button) => {
          button.addEventListener('click', () => {
            closeSaveConfirm();
            ui.closeViewModal();
          });
        });
      }

      if (dom.rescueTeamSaveConfirmModal) {
        dom.rescueTeamSaveConfirmModal.querySelectorAll('[data-close-rescue-team-save-confirm]').forEach((button) => {
          button.addEventListener('click', closeSaveConfirm);
        });
      }

      if (dom.rescueTeamViewModalBody) {
        dom.rescueTeamViewModalBody.addEventListener('input', (event) => {
          if (event.target.matches('#rescueTeamEditRescuerSearchInput')) {
            renderSearchResults();
          }
        });

        dom.rescueTeamViewModalBody.addEventListener('click', (event) => {
          const addButton = event.target.closest('[data-add-view-rescuer-id]');
          if (addButton) {
            addRescuer(addButton.dataset.addViewRescuerId);
            return;
          }

          const removeButton = event.target.closest('[data-remove-view-selected-rescuer-id]');
          if (removeButton) {
            removeRescuer(removeButton.dataset.removeViewSelectedRescuerId);
          }
        });
      }

      if (dom.saveRescueTeamChangesButton) {
        dom.saveRescueTeamChangesButton.addEventListener('click', openSaveConfirm);
      }

      if (dom.confirmSaveRescueTeamButton) {
        dom.confirmSaveRescueTeamButton.addEventListener('click', saveChanges);
      }

      context.view = {
        openDetails,
        closeSaveConfirm
      };

      return context.view;
    }
  };
}());
