(function createRescuersViewModule() {
  window.ResQMeshRescuerView = {
    init(context) {
      const { dom, state, helpers, ui, toast, constants } = context;

      function statusSelectOptions(selectedValue) {
        return constants.STATUS_OPTIONS.map((option) => `
          <option value="${helpers.escapeHtml(option.value)}"${option.value === selectedValue ? ' selected' : ''}>
            ${helpers.escapeHtml(option.label)}
          </option>
        `).join('');
      }

      function renderRescuerDetails(details) {
        if (!dom.rescuerViewModalBody || !dom.rescuerViewModalCode || !dom.rescuerViewPrimaryActionButton) {
          return;
        }

        dom.rescuerViewModalCode.textContent = `${details.rescuerCode} - ${details.accessStatusLabel}`;
        dom.rescuerViewModalBody.innerHTML = `
          <div class="rescuer-detail-grid">
            ${helpers.detailSection('Account / Profile', [
              helpers.detailItem('Rescuer code', details.profile.rescuerCode),
              helpers.detailItem('Full name', details.profile.fullName),
              helpers.detailItem('First name', details.profile.firstName),
              helpers.detailItem('Middle name', details.profile.middleName),
              helpers.detailItem('Last name', details.profile.lastName),
              helpers.detailItem('Birthdate', details.profile.birthDate)
            ])}
            ${helpers.detailCustomSection('Assignment / Operations', `
              <dl class="rescuer-detail-edit-grid">
                ${helpers.detailItem('Agency', helpers.getAgencyDisplay(details.assignment.agency))}
                <div class="rescuer-detail-item rescuer-detail-item--full">
                  <dt>Operational status</dt>
                  <dd>
                    <div class="rescuer-inline-edit">
                      <select id="rescuerOperationalStatusSelect" class="rescuer-inline-select">
                        ${statusSelectOptions(details.assignment.status)}
                      </select>
                      <button type="button" class="admin-secondary-button rescuer-inline-save-button" data-modal-action-button data-save-status>
                        <i class="fa-solid fa-floppy-disk" aria-hidden="true"></i>
                        <span>Save Status</span>
                      </button>
                    </div>
                  </dd>
                </div>
                ${helpers.detailItem('Assigned team', details.assignment.team?.name || 'Unassigned')}
              </dl>
            `)}
            ${helpers.detailSection('Contact', [
              helpers.detailItem('Phone', details.contact.phone)
            ])}
            ${helpers.detailCustomSection('Password Reset', `
              <div class="rescuer-password-reset-grid">
                <label class="rescuer-field">
                  <span>New password</span>
                  <input type="password" id="rescuerResetPasswordInput" placeholder="Enter new password">
                </label>
                <label class="rescuer-field">
                  <span>Confirm password</span>
                  <input type="password" id="rescuerResetConfirmPasswordInput" placeholder="Confirm new password">
                </label>
              </div>
              <div class="rescuer-detail-section-actions">
                <button type="button" class="rescuer-view-primary-button" data-modal-action-button data-reset-password>
                  <i class="fa-solid fa-key" aria-hidden="true"></i>
                  <span>Reset Password</span>
                </button>
              </div>
            `)}
            ${helpers.detailSection('Audit / Meta', [
              helpers.detailItem('Access status', details.accessStatusLabel),
              helpers.detailItem('Created at', helpers.formatDate(details.meta.createdAt)),
              helpers.detailItem('Updated at', helpers.formatDate(details.meta.updatedAt)),
              helpers.detailItem('Archived at', helpers.formatDate(details.meta.archivedAt))
            ])}
          </div>
        `;

        const nextAction = details.accessStatus === 'archived' ? 'active' : 'archived';
        state.modalPendingAction = nextAction;

        const icon = dom.rescuerViewPrimaryActionButton.querySelector('i');
        const label = dom.rescuerViewPrimaryActionButton.querySelector('span');

        if (nextAction === 'archived') {
          if (icon) icon.className = 'fa-solid fa-box-archive';
          if (label) label.textContent = 'Archive Rescuer';
        } else {
          if (icon) icon.className = 'fa-solid fa-circle-check';
          if (label) label.textContent = 'Activate Rescuer';
        }

        ui.setViewActionMessage('');
      }

      async function saveOperationalStatus() {
        if (!state.selectedRescuerId || state.modalSubmitting || !dom.rescuerViewModalBody) {
          return;
        }

        const statusSelect = dom.rescuerViewModalBody.querySelector('#rescuerOperationalStatusSelect');

        if (!statusSelect) {
          return;
        }

        ui.setViewActionState(true);
        ui.setViewActionMessage('Updating rescuer status...');

        try {
          const payload = await helpers.requestJson(`/api/admin/rescuers/${state.selectedRescuerId}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status: statusSelect.value })
          });

          ui.updateRescuerState(payload.data);
          renderRescuerDetails(payload.data);
          ui.setViewActionMessage('');
          toast.show(payload.message || 'Rescuer operational status updated.', 'success');
          await helpers.refreshAdminNotifications();
        } catch (error) {
          if (error.routeMissing || error.statusCode >= 500) {
            ui.setViewActionMessage('');
            toast.show(error.message || 'Unable to update rescuer status.', 'warning');
          } else {
            ui.setViewActionMessage(`<span class="rescuer-view-inline-error">${helpers.escapeHtml(error.message || 'Unable to update rescuer status.')}</span>`);
          }
        } finally {
          ui.setViewActionState(false);
        }
      }

      async function resetRescuerPasswordFromModal() {
        if (!state.selectedRescuerId || state.modalSubmitting || !dom.rescuerViewModalBody) {
          return;
        }

        const passwordInput = dom.rescuerViewModalBody.querySelector('#rescuerResetPasswordInput');
        const confirmPasswordInput = dom.rescuerViewModalBody.querySelector('#rescuerResetConfirmPasswordInput');
        const password = String(passwordInput?.value || '');
        const confirmPassword = String(confirmPasswordInput?.value || '');

        if (!password) {
          ui.setViewActionMessage('<span class="rescuer-view-inline-error">New password is required.</span>');
          return;
        }

        if (!confirmPassword) {
          ui.setViewActionMessage('<span class="rescuer-view-inline-error">Confirm password is required.</span>');
          return;
        }

        if (password.length < 8) {
          ui.setViewActionMessage('<span class="rescuer-view-inline-error">Password must be at least 8 characters long.</span>');
          return;
        }

        if (password !== confirmPassword) {
          ui.setViewActionMessage('<span class="rescuer-view-inline-error">Password and confirm password do not match.</span>');
          return;
        }

        ui.setViewActionState(true);
        ui.setViewActionMessage('Resetting rescuer password...');

        try {
          const payload = await helpers.requestJson(`/api/admin/rescuers/${state.selectedRescuerId}/password`, {
            method: 'PATCH',
            body: JSON.stringify({ password, confirmPassword })
          });

          ui.updateRescuerState(payload.data);
          renderRescuerDetails(payload.data);
          ui.setViewActionMessage('');
          toast.show(payload.message || 'Rescuer password reset successfully.', 'success');
          await helpers.refreshAdminNotifications();
        } catch (error) {
          if (error.routeMissing || error.statusCode >= 500) {
            ui.setViewActionMessage('');
            toast.show(error.message || 'Unable to reset rescuer password.', 'warning');
          } else {
            ui.setViewActionMessage(`<span class="rescuer-view-inline-error">${helpers.escapeHtml(error.message || 'Unable to reset rescuer password.')}</span>`);
          }
        } finally {
          ui.setViewActionState(false);
        }
      }

      async function openDetails(rescuerId) {
        state.selectedRescuerId = rescuerId;
        state.selectedRescuerDetails = null;
        state.modalPendingAction = '';

        if (dom.rescuerViewModalBody) {
          dom.rescuerViewModalBody.innerHTML = '<div class="rescuer-view-status-message">Loading rescuer details...</div>';
        }
        if (dom.rescuerViewModalCode) {
          dom.rescuerViewModalCode.textContent = 'Rescuer details';
        }
        ui.setViewActionMessage('');
        ui.setViewActionState(false);
        ui.openRescuerViewModal();

        try {
          const payload = await helpers.requestJson(`/api/admin/rescuers/${rescuerId}`);
          state.selectedRescuerDetails = payload.data;
          renderRescuerDetails(payload.data);
        } catch (error) {
          if (dom.rescuerViewModalBody) {
            dom.rescuerViewModalBody.innerHTML = `<div class="rescuer-view-status-message" data-tone="error">${helpers.escapeHtml(error.message)}</div>`;
          }
          if (dom.rescuerViewActionButtons) {
            dom.rescuerViewActionButtons.hidden = true;
          }
          return;
        }

        if (dom.rescuerViewActionButtons) {
          dom.rescuerViewActionButtons.hidden = false;
        }
      }

      function renderAccessConfirmation(nextStatus) {
        const isArchive = nextStatus === 'archived';
        const title = isArchive ? 'Archive this rescuer?' : 'Activate this rescuer?';
        const description = isArchive
          ? 'The rescuer will move to the archived list and can be activated again later.'
          : 'The rescuer will return to the active list.';
        const confirmText = isArchive ? 'Confirm Archive' : 'Confirm Activation';
        const buttonClass = isArchive ? 'rescuer-view-danger-button' : 'rescuer-view-primary-button';
        const iconClass = isArchive ? 'fa-box-archive' : 'fa-circle-check';

        ui.setViewActionMessage(`
          <div class="rescuer-review-confirmation" data-review-action="${helpers.escapeHtml(nextStatus)}">
            <div class="rescuer-review-copy">
              <strong>${helpers.escapeHtml(title)}</strong>
              <span>${helpers.escapeHtml(description)}</span>
            </div>
            <div class="rescuer-review-confirm-actions">
              <button type="button" class="rescuer-view-secondary-button" data-cancel-review>Cancel</button>
              <button type="button" class="${buttonClass}" data-confirm-review>
                <i class="fa-solid ${iconClass}" aria-hidden="true"></i>
                <span>${helpers.escapeHtml(confirmText)}</span>
              </button>
            </div>
          </div>
        `);
      }

      async function confirmAccessChange() {
        if (!state.selectedRescuerId || !state.modalPendingAction || state.modalSubmitting) {
          return;
        }

        ui.setViewActionState(true);
        ui.setViewActionMessage(state.modalPendingAction === 'archived' ? 'Archiving rescuer...' : 'Activating rescuer...');

        try {
          const payload = await helpers.requestJson(`/api/admin/rescuers/${state.selectedRescuerId}/access-status`, {
            method: 'PATCH',
            body: JSON.stringify({ status: state.modalPendingAction })
          });

          const updated = payload.data;
          state.rescuers = state.rescuers.map((rescuer) => rescuer.id === updated.id ? updated : rescuer);
          context.list?.applySearchFilter?.();
          toast.show(payload.message || 'Rescuer access status updated.', 'success');
          await helpers.refreshAdminNotifications();
          ui.closeRescuerViewModal();
        } catch (error) {
          if (error.routeMissing || error.statusCode >= 500) {
            ui.setViewActionMessage('');
            toast.show(error.message || 'Unable to update rescuer access status.', 'warning');
          } else {
            ui.setViewActionMessage(`<span class="rescuer-view-inline-error">${helpers.escapeHtml(error.message || 'Unable to update rescuer access status.')}</span>`);
          }
        } finally {
          ui.setViewActionState(false);
        }
      }

      if (dom.rescuerViewModal) {
        dom.rescuerViewModal.querySelectorAll('[data-close-view-modal]').forEach((button) => {
          button.addEventListener('click', ui.closeRescuerViewModal);
        });

        dom.rescuerViewModal.addEventListener('click', (event) => {
          if (event.target === dom.rescuerViewModal) {
            ui.closeRescuerViewModal();
          }
        });
      }

      if (dom.rescuerViewPrimaryActionButton) {
        dom.rescuerViewPrimaryActionButton.addEventListener('click', () => {
          if (!state.modalPendingAction || state.modalSubmitting) {
            return;
          }

          renderAccessConfirmation(state.modalPendingAction);
        });
      }

      if (dom.rescuerViewActionMessage) {
        dom.rescuerViewActionMessage.addEventListener('click', (event) => {
          if (event.target.closest('[data-cancel-review]')) {
            ui.setViewActionMessage('');
            return;
          }

          if (event.target.closest('[data-confirm-review]')) {
            confirmAccessChange();
          }
        });
      }

      if (dom.rescuerViewModalBody) {
        dom.rescuerViewModalBody.addEventListener('click', (event) => {
          if (event.target.closest('[data-save-status]')) {
            saveOperationalStatus();
            return;
          }

          if (event.target.closest('[data-reset-password]')) {
            resetRescuerPasswordFromModal();
          }
        });
      }

      context.view = {
        openDetails
      };

      return context.view;
    }
  };
}());
