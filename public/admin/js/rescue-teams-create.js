(function createRescueTeamsCreateModule() {
  window.ResQMeshRescueTeamCreate = {
    init(context) {
      const { dom, state, constants, helpers, ui, toast } = context;
      let selectedRescuerIds = [];

      function getRescuerById(id) {
        return state.assignableRescuers.find((rescuer) => String(rescuer.id) === String(id)) || null;
      }

      function updateRosterCount() {
        if (!dom.rescueTeamRosterCount) {
          return;
        }

        dom.rescueTeamRosterCount.textContent = `Selected ${selectedRescuerIds.length}/${constants.MAX_MEMBERS}`;
      }

      function selectedRescuerCard(rescuer) {
        const currentTeamLabel = rescuer.team?.name
          ? `Currently on ${rescuer.team.name}`
          : 'Currently unassigned';

        return `
          <article class="rescue-team-selected-item">
            <div class="rescue-team-selected-copy">
              <strong>${helpers.escapeHtml(rescuer.fullName)}</strong>
              <span>${helpers.escapeHtml(`${rescuer.rescuerCode} - ${helpers.getAgencyDisplay(rescuer.agency)}`)}</span>
              <span>${helpers.escapeHtml(currentTeamLabel)}</span>
            </div>
            <button
              type="button"
              class="rescue-team-selected-remove"
              data-remove-selected-rescuer-id="${helpers.escapeHtml(rescuer.id)}"
              aria-label="Remove ${helpers.escapeHtml(rescuer.fullName)}"
            >
              <i class="fa-solid fa-xmark" aria-hidden="true"></i>
            </button>
          </article>
        `;
      }

      function searchResultCard(rescuer, isAtCapacity) {
        const isSelected = selectedRescuerIds.includes(rescuer.id);
        const disabled = isSelected || isAtCapacity;
        const currentTeamLabel = 'Unassigned and ready to add.';

        return `
          <article class="rescue-team-search-result${disabled ? ' is-disabled' : ''}">
            <div class="rescue-team-search-result-copy">
              <strong>${helpers.escapeHtml(rescuer.fullName)}</strong>
              <span>${helpers.escapeHtml(`${rescuer.rescuerCode} - ${helpers.getAgencyDisplay(rescuer.agency)}`)}</span>
              <span>${helpers.escapeHtml(currentTeamLabel)}</span>
            </div>
            <button
              type="button"
              class="rescue-team-search-add"
              data-add-rescuer-id="${helpers.escapeHtml(rescuer.id)}"
              ${disabled ? 'disabled' : ''}
            >
              <i class="fa-solid fa-plus" aria-hidden="true"></i>
              <span>${isSelected ? 'Selected' : 'Add'}</span>
            </button>
          </article>
        `;
      }

      function renderSelectedList() {
        if (!dom.rescueTeamSelectedList) {
          return;
        }

        if (selectedRescuerIds.length === 0) {
          dom.rescueTeamSelectedList.innerHTML = '<div class="rescue-team-selected-empty">No rescuers selected yet.</div>';
          updateRosterCount();
          return;
        }

        dom.rescueTeamSelectedList.innerHTML = selectedRescuerIds
          .map((id) => getRescuerById(id))
          .filter(Boolean)
          .map(selectedRescuerCard)
          .join('');

        updateRosterCount();
      }

      function renderSearchResults() {
        if (!dom.rescueTeamRosterResults) {
          return;
        }

        const filtered = helpers.filterAssignableRescuers(
          state.assignableRescuers,
          dom.rescueTeamRescuerSearchInput?.value || ''
        );

        if (filtered.length === 0) {
          dom.rescueTeamRosterResults.innerHTML = '<div class="rescue-team-search-empty">No rescuers match this search.</div>';
          return;
        }

        const isAtCapacity = selectedRescuerIds.length >= constants.MAX_MEMBERS;
        dom.rescueTeamRosterResults.innerHTML = filtered
          .map((rescuer) => searchResultCard(rescuer, isAtCapacity))
          .join('');
      }

      function renderPicker() {
        renderSelectedList();
        renderSearchResults();
      }

      async function loadAssignableRescuers() {
        const payload = await helpers.requestJson('/api/admin/rescuers/assignable');
        state.assignableRescuers = Array.isArray(payload.data) ? payload.data : [];
        renderPicker();
      }

      function resetForm() {
        if (!dom.rescueTeamForm) {
          return;
        }

        selectedRescuerIds = [];
        dom.rescueTeamForm.reset();

        if (dom.rescueTeamRescuerSearchInput) {
          dom.rescueTeamRescuerSearchInput.value = '';
        }

        ui.setCreateActionMessage('Ready to save a new rescue team.', 'muted');
        renderPicker();
      }

      function readFormPayload() {
        const formData = new FormData(dom.rescueTeamForm);

        return {
          name: String(formData.get('name') || '').trim(),
          agency: String(formData.get('agency') || '').trim(),
          status: String(formData.get('status') || '').trim(),
          rescuerIds: [...selectedRescuerIds]
        };
      }

      async function openCreateModal() {
        try {
          await loadAssignableRescuers();
        } catch (error) {
          toast.show(error.message || 'Unable to load active rescuers.', 'warning');
        }

        resetForm();
        ui.openCreateModal();
      }

      function addRescuer(id) {
        const parsedId = Number.parseInt(String(id), 10);
        if (!Number.isInteger(parsedId) || selectedRescuerIds.includes(parsedId)) {
          return;
        }

        if (selectedRescuerIds.length >= constants.MAX_MEMBERS) {
          ui.setCreateActionMessage(`Only ${constants.MAX_MEMBERS} rescuers can be assigned to a team.`, 'error');
          renderSearchResults();
          return;
        }

        selectedRescuerIds.push(parsedId);
        ui.setCreateActionMessage('Rescuer added to the team roster.', 'info');
        renderPicker();
      }

      function removeRescuer(id) {
        const parsedId = Number.parseInt(String(id), 10);
        selectedRescuerIds = selectedRescuerIds.filter((rescuerId) => rescuerId !== parsedId);
        ui.setCreateActionMessage('Rescuer removed from the team roster.', 'info');
        renderPicker();
      }

      async function handleSubmit(event) {
        event.preventDefault();

        if (!dom.rescueTeamForm || state.submitting) {
          return;
        }

        const payload = readFormPayload();

        if (!payload.name) {
          ui.setCreateActionMessage('Rescue team name is required.', 'error');
          return;
        }

        if (!payload.agency) {
          ui.setCreateActionMessage('Agency is required.', 'error');
          return;
        }

        if (!payload.status) {
          ui.setCreateActionMessage('Team status is required.', 'error');
          return;
        }

        if (payload.rescuerIds.length > constants.MAX_MEMBERS) {
          ui.setCreateActionMessage(`Only ${constants.MAX_MEMBERS} rescuers can be assigned to a team.`, 'error');
          return;
        }

        ui.setCreateSubmitState(true);
        ui.setCreateActionMessage('Saving rescue team...', 'info');

        try {
          const response = await helpers.requestJson('/api/admin/rescue-teams', {
            method: 'POST',
            body: JSON.stringify(payload)
          });

          toast.show(response.message || `Rescue team ${response.data.teamCode} created successfully.`, 'success');
          await Promise.all([
            context.data.loadAssignableRescuers(),
            context.list.loadTeams({ resetPage: true, silent: true })
          ]);
          await helpers.refreshAdminNotifications();
          resetForm();
          ui.closeCreateModal();
        } catch (error) {
          if (error.routeMissing || error.statusCode >= 500) {
            toast.show(error.message || 'Unable to save rescue team.', 'warning');
          } else {
            ui.setCreateActionMessage(error.message || 'Unable to save rescue team.', 'error');
          }
        } finally {
          ui.setCreateSubmitState(false);
        }
      }

      if (dom.openAddRescueTeamButton) {
        dom.openAddRescueTeamButton.addEventListener('click', openCreateModal);
      }

      if (dom.rescueTeamModal) {
        dom.rescueTeamModal.querySelectorAll('[data-close-rescue-team-modal]').forEach((button) => {
          button.addEventListener('click', ui.closeCreateModal);
        });
      }

      if (dom.rescueTeamRescuerSearchInput) {
        dom.rescueTeamRescuerSearchInput.addEventListener('input', renderSearchResults);
      }

      if (dom.rescueTeamRosterResults) {
        dom.rescueTeamRosterResults.addEventListener('click', (event) => {
          const button = event.target.closest('[data-add-rescuer-id]');
          if (!button) {
            return;
          }

          addRescuer(button.dataset.addRescuerId);
        });
      }

      if (dom.rescueTeamSelectedList) {
        dom.rescueTeamSelectedList.addEventListener('click', (event) => {
          const button = event.target.closest('[data-remove-selected-rescuer-id]');
          if (!button) {
            return;
          }

          removeRescuer(button.dataset.removeSelectedRescuerId);
        });
      }

      if (dom.rescueTeamForm) {
        dom.rescueTeamForm.addEventListener('submit', handleSubmit);
      }

      context.data = {
        loadAssignableRescuers
      };

      context.create = {
        renderPicker,
        resetForm,
        loadAssignableRescuers
      };

      return context.create;
    }
  };
}());
