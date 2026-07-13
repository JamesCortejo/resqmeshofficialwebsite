(function createRescuersCreateModule() {
  window.ResQMeshRescuerCreate = {
    init(context) {
      const { dom, state, helpers, ui, toast } = context;

      function populateTeamOptions() {
        if (!dom.rescuerTeamSelect) {
          return;
        }

        const currentValue = dom.rescuerTeamSelect.value;
        const options = ['<option value="">No team assigned</option>'];

        state.teams.forEach((team) => {
          options.push(`<option value="${helpers.escapeHtml(team.id)}">${helpers.escapeHtml(team.name)}</option>`);
        });

        dom.rescuerTeamSelect.innerHTML = options.join('');
        dom.rescuerTeamSelect.value = currentValue && state.teams.some((team) => String(team.id) === currentValue)
          ? currentValue
          : '';
        dom.rescuerTeamSelect.classList.toggle('has-value', Boolean(dom.rescuerTeamSelect.value));
      }

      async function loadRescueTeams() {
        const payload = await helpers.requestJson('/api/admin/rescue-teams');
        state.teams = Array.isArray(payload.data) ? payload.data : [];
        populateTeamOptions();
      }

      function resetRescuerForm() {
        if (!dom.rescuerForm) {
          return;
        }

        dom.rescuerForm.reset();
        Array.from(dom.rescuerForm.querySelectorAll('select')).forEach((select) => {
          select.classList.toggle('has-value', Boolean(select.value));
        });
        ui.setActionMessage('Ready to save a new rescuer.', 'muted');
      }

      function readFormPayload() {
        const formData = new FormData(dom.rescuerForm);
        const teamId = String(formData.get('teamId') || '').trim();

        return {
          firstName: String(formData.get('firstName') || '').trim(),
          middleName: String(formData.get('middleName') || '').trim(),
          lastName: String(formData.get('lastName') || '').trim(),
          birthDate: String(formData.get('birthDate') || '').trim(),
          agency: String(formData.get('agency') || '').trim(),
          status: String(formData.get('status') || '').trim(),
          phone: String(formData.get('phone') || '').trim(),
          password: String(formData.get('password') || ''),
          confirmPassword: String(formData.get('confirmPassword') || ''),
          teamId: teamId || null
        };
      }

      async function handleRescuerSubmit(event) {
        event.preventDefault();

        if (!dom.rescuerForm || state.submitting) {
          return;
        }

        const payload = readFormPayload();

        if (!payload.password) {
          ui.setActionMessage('Password is required.', 'error');
          return;
        }

        if (!payload.confirmPassword) {
          ui.setActionMessage('Confirm password is required.', 'error');
          return;
        }

        if (payload.password.length < 8) {
          ui.setActionMessage('Password must be at least 8 characters long.', 'error');
          return;
        }

        if (payload.password !== payload.confirmPassword) {
          ui.setActionMessage('Password and confirm password do not match.', 'error');
          return;
        }

        ui.setSubmitState(true);
        ui.setActionMessage('Saving rescuer profile...', 'info');

        try {
          const response = await helpers.requestJson('/api/admin/rescuers', {
            method: 'POST',
            body: JSON.stringify(payload)
          });

          state.rescuers.unshift(response.data);
          context.list?.applySearchFilter?.();
          toast.show(response.message || `Rescuer ${response.data.rescuerCode} created successfully.`, 'success');
          await helpers.refreshAdminNotifications();
          resetRescuerForm();
          ui.closeRescuerModal();
        } catch (error) {
          if (error.routeMissing || error.statusCode >= 500) {
            toast.show(error.message || 'Unable to save rescuer.', 'warning');
          } else {
            ui.setActionMessage(error.message || 'Unable to save rescuer.', 'error');
          }
        } finally {
          ui.setSubmitState(false);
        }
      }

      if (dom.openAddRescuerButton) {
        dom.openAddRescuerButton.addEventListener('click', () => {
          resetRescuerForm();
          ui.openRescuerModal();
        });
      }

      if (dom.rescuerModal) {
        dom.rescuerModal.querySelectorAll('[data-close-rescuer-modal]').forEach((button) => {
          button.addEventListener('click', ui.closeRescuerModal);
        });

        dom.rescuerModal.addEventListener('click', (event) => {
          if (event.target === dom.rescuerModal) {
            ui.closeRescuerModal();
          }
        });
      }

      if (dom.rescuerForm) {
        dom.rescuerForm.addEventListener('submit', handleRescuerSubmit);
      }

      Array.from(document.querySelectorAll('.rescuer-field select')).forEach((select) => {
        select.classList.toggle('has-value', Boolean(select.value));
        select.addEventListener('change', () => {
          select.classList.toggle('has-value', Boolean(select.value));
        });
      });

      context.create = {
        loadRescueTeams,
        resetRescuerForm,
        populateTeamOptions
      };

      return context.create;
    }
  };
}());
