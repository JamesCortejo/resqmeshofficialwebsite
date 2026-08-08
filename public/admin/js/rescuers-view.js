(function createRescuersViewModule() {
  window.ResQMeshRescuerView = {
    init(context) {
      const { dom, state, helpers, ui, toast, constants } = context;

      function isDispatched(details) {
        return String(details?.assignment?.status || '').toLowerCase() === 'dispatched';
      }

      function isArchived(details) {
        return String(details?.accessStatus || '').toLowerCase() === 'archived';
      }

      function statusSelectOptions(selectedValue) {
        return constants.STATUS_OPTIONS.map((option) => `
          <option value="${helpers.escapeHtml(option.value)}"${option.value === selectedValue ? ' selected' : ''}>
            ${helpers.escapeHtml(option.label)}
          </option>
        `).join('');
      }

      function buildConfirmSummary(rows) {
        if (!Array.isArray(rows) || rows.length === 0) {
          return '';
        }

        return `
          <dl>
            ${rows.map((row) => `
              <div class="rescuer-confirm-summary-row">
                <dt>${helpers.escapeHtml(row.label)}</dt>
                <dd>${helpers.escapeHtml(row.value)}</dd>
              </div>
            `).join('')}
          </dl>
        `;
      }

      function setDefaultFooterMessage(details) {
        if (isArchived(details)) {
          ui.setViewActionMessage('Activate this rescuer before changing status or resetting password.');
          return;
        }

        if (isDispatched(details)) {
          ui.setViewActionMessage('Archive is unavailable while this rescuer is dispatched.');
          return;
        }

        ui.setViewActionMessage('');
      }

      function renderRescuerDetails(details) {
        if (!dom.rescuerViewModalBody || !dom.rescuerViewModalCode || !dom.rescuerViewPrimaryActionButton) {
          return;
        }

        const dispatched = isDispatched(details);
        const archived = isArchived(details);
        const currentStatusLabel = helpers.getStatusDisplay(details.assignment.status);
        const statusEditor = dispatched || archived
          ? `
            <div class="rescuer-inline-static">
              <span class="rescuer-inline-static-value">${helpers.escapeHtml(archived ? 'Archived' : currentStatusLabel)}</span>
              <span class="rescuer-inline-lock-note">${archived ? 'Activate this rescuer before changing status.' : 'Status is locked while this rescuer is dispatched.'}</span>
            </div>
          `
          : `
            <div class="rescuer-inline-edit">
              <select id="rescuerOperationalStatusSelect" class="rescuer-inline-select">
                ${statusSelectOptions(details.assignment.status)}
              </select>
              <button type="button" class="admin-secondary-button rescuer-inline-save-button" data-modal-action-button data-save-status>
                <i class="fa-solid fa-floppy-disk" aria-hidden="true"></i>
                <span>Save Status</span>
              </button>
            </div>
          `;

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
                  <dd>${statusEditor}</dd>
                </div>
                ${helpers.detailItem('Assigned team', details.assignment.team?.name || 'Unassigned')}
              </dl>
            `)}
            ${helpers.detailSection('Contact', [
              helpers.detailItem('Phone', details.contact.phone)
            ])}
            ${helpers.detailCustomSection('Password Reset', archived || dispatched
              ? `
                <div class="rescuer-inline-static">
                  <span class="rescuer-inline-static-value">Locked</span>
                  <span class="rescuer-inline-lock-note">${archived ? 'Activate this rescuer before resetting password.' : 'Password reset is locked while this rescuer is dispatched.'}</span>
                </div>
              `
              : `
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
        const archiveLocked = dispatched && nextAction === 'archived';
        state.modalPendingAction = nextAction;

        const icon = dom.rescuerViewPrimaryActionButton.querySelector('i');
        const label = dom.rescuerViewPrimaryActionButton.querySelector('span');

        if (nextAction === 'archived') {
          if (icon) icon.className = archiveLocked ? 'fa-solid fa-lock' : 'fa-solid fa-box-archive';
          if (label) label.textContent = archiveLocked ? 'Archive Locked' : 'Archive Rescuer';
        } else {
          if (icon) icon.className = 'fa-solid fa-circle-check';
          if (label) label.textContent = 'Activate Rescuer';
        }

        dom.rescuerViewPrimaryActionButton.disabled = archiveLocked;
        setDefaultFooterMessage(details);
      }

      function openConfirmModal(config) {
        if (!dom.rescuerConfirmModal || !dom.rescuerConfirmButton) {
          return;
        }

        state.confirmState = config;
        if (dom.rescuerConfirmKicker) dom.rescuerConfirmKicker.textContent = config.kicker || 'Confirmation';
        if (dom.rescuerConfirmTitle) dom.rescuerConfirmTitle.textContent = config.title || 'Confirm action';
        if (dom.rescuerConfirmCopy) dom.rescuerConfirmCopy.textContent = config.copy || 'Review this action before continuing.';

        if (dom.rescuerConfirmSummary) {
          const summaryHtml = buildConfirmSummary(config.summaryRows || []);
          dom.rescuerConfirmSummary.hidden = !summaryHtml;
          dom.rescuerConfirmSummary.innerHTML = summaryHtml;
        }

        if (dom.rescuerConfirmPasswordField) {
          const showPasswordField = Boolean(config.requiresAdminPassword);
          dom.rescuerConfirmPasswordField.hidden = !showPasswordField;
          dom.rescuerConfirmPasswordField.style.display = showPasswordField ? '' : 'none';
        }

        if (dom.rescuerConfirmButton) {
          dom.rescuerConfirmButton.className = config.confirmButtonClass || 'rescuer-confirm-submit';
          const icon = dom.rescuerConfirmButton.querySelector('i');
          const label = dom.rescuerConfirmButton.querySelector('span');
          if (icon) {
            icon.className = `fa-solid ${config.confirmIcon || 'fa-shield-halved'}`;
          }
          if (label) {
            label.textContent = config.confirmText || 'Confirm';
          }
        }

        if (dom.rescuerConfirmPasswordInput) {
          dom.rescuerConfirmPasswordInput.value = '';
        }

        ui.setConfirmMessage('');
        ui.openRescuerConfirmModal();
      }

      async function saveOperationalStatus(nextStatus) {
        if (!state.selectedRescuerId || state.modalSubmitting) {
          return;
        }

        ui.setViewActionState(true);
        ui.setViewActionMessage('Updating rescuer status...');

        try {
          const payload = await helpers.requestJson(`/api/admin/rescuers/${state.selectedRescuerId}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status: nextStatus })
          });

          ui.updateRescuerState(payload.data);
          renderRescuerDetails(payload.data);
          ui.closeRescuerConfirmModal();
          toast.show(payload.message || 'Rescuer operational status updated.', 'success');
          await helpers.refreshAdminNotifications();
        } catch (error) {
          if (error.routeMissing || error.statusCode >= 500) {
            ui.setViewActionMessage('');
            ui.setConfirmMessage('');
            ui.closeRescuerConfirmModal();
            toast.show(error.message || 'Unable to update rescuer status.', 'warning');
          } else {
            ui.setConfirmMessage(error.message || 'Unable to update rescuer status.');
          }
        } finally {
          ui.setViewActionState(false);
        }
      }

      async function resetRescuerPasswordFromModal(password, confirmPassword, adminPassword) {
        if (!state.selectedRescuerId || state.modalSubmitting) {
          return;
        }

        ui.setViewActionState(true);
        ui.setViewActionMessage('Resetting rescuer password...');

        try {
          const payload = await helpers.requestJson(`/api/admin/rescuers/${state.selectedRescuerId}/password`, {
            method: 'PATCH',
            body: JSON.stringify({ password, confirmPassword, adminPassword })
          });

          ui.updateRescuerState(payload.data);
          renderRescuerDetails(payload.data);
          ui.closeRescuerConfirmModal();
          toast.show(payload.message || 'Rescuer password reset successfully.', 'success');
          await helpers.refreshAdminNotifications();
        } catch (error) {
          if (error.routeMissing || error.statusCode >= 500) {
            ui.setViewActionMessage('');
            ui.setConfirmMessage('');
            ui.closeRescuerConfirmModal();
            toast.show(error.message || 'Unable to reset rescuer password.', 'warning');
          } else {
            ui.setConfirmMessage(error.message || 'Unable to reset rescuer password.');
          }
        } finally {
          ui.setViewActionState(false);
        }
      }

      async function openDetails(rescuerId) {
        state.selectedRescuerId = rescuerId;
        state.selectedRescuerDetails = null;
        state.modalPendingAction = '';
        state.confirmState = null;

        if (dom.rescuerViewModalBody) {
          dom.rescuerViewModalBody.innerHTML = '<div class="rescuer-view-status-message">Loading rescuer details...</div>';
        }
        if (dom.rescuerViewModalCode) {
          dom.rescuerViewModalCode.textContent = 'Rescuer details';
        }
        ui.setViewActionMessage('');
        ui.setViewActionState(false);
        ui.closeRescuerConfirmModal();
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

      async function confirmAccessChange(adminPassword) {
        if (!state.selectedRescuerId || !state.modalPendingAction || state.modalSubmitting) {
          return;
        }

        ui.setViewActionState(true);
        ui.setViewActionMessage(state.modalPendingAction === 'archived' ? 'Archiving rescuer...' : 'Activating rescuer...');

        try {
          const payload = await helpers.requestJson(`/api/admin/rescuers/${state.selectedRescuerId}/access-status`, {
            method: 'PATCH',
            body: JSON.stringify({ status: state.modalPendingAction, adminPassword })
          });

          const updated = payload.data;
          state.rescuers = state.rescuers.map((rescuer) => rescuer.id === updated.id ? updated : rescuer);
          context.list?.applySearchFilter?.();
          ui.closeRescuerConfirmModal();
          toast.show(payload.message || 'Rescuer access status updated.', payload.warning ? 'warning' : 'success');
          await helpers.refreshAdminNotifications();
          ui.closeRescuerViewModal();
        } catch (error) {
          if (error.routeMissing) {
            ui.setViewActionMessage('');
            ui.setConfirmMessage('');
            ui.closeRescuerConfirmModal();
            toast.show(error.message || 'Unable to update rescuer access status.', 'warning');
          } else if (error.statusCode >= 500) {
            ui.setConfirmMessage(error.message || 'Unable to update rescuer access status.');
          } else {
            ui.setConfirmMessage(error.message || 'Unable to update rescuer access status.');
          }
        } finally {
          ui.setViewActionState(false);
        }
      }

      async function handleConfirmAction() {
        if (!state.confirmState || state.modalSubmitting) {
          return;
        }

        if (state.confirmState.type === 'status-change') {
          await saveOperationalStatus(state.confirmState.nextStatus);
          return;
        }

        if (state.confirmState.type === 'password-reset') {
          const password = state.confirmState.password;
          const confirmPassword = state.confirmState.confirmPassword;
          const adminPassword = String(dom.rescuerConfirmPasswordInput?.value || '').trim();

          if (!adminPassword) {
            ui.setConfirmMessage('Enter your current admin password to continue.');
            return;
          }

          await resetRescuerPasswordFromModal(password, confirmPassword, adminPassword);
          return;
        }

        if (state.confirmState.type === 'access-status') {
          const adminPassword = String(dom.rescuerConfirmPasswordInput?.value || '').trim();

          if (!adminPassword) {
            ui.setConfirmMessage('Enter your current admin password to continue.');
            return;
          }

          await confirmAccessChange(adminPassword);
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

      if (dom.rescuerConfirmModal) {
        dom.rescuerConfirmModal.querySelectorAll('[data-close-rescuer-confirm]').forEach((button) => {
          button.addEventListener('click', ui.closeRescuerConfirmModal);
        });

        dom.rescuerConfirmModal.addEventListener('click', (event) => {
          if (event.target === dom.rescuerConfirmModal) {
            ui.closeRescuerConfirmModal();
          }
        });
      }

      if (dom.rescuerConfirmButton) {
        dom.rescuerConfirmButton.addEventListener('click', handleConfirmAction);
      }

      if (dom.rescuerViewPrimaryActionButton) {
        dom.rescuerViewPrimaryActionButton.addEventListener('click', () => {
          if (!state.modalPendingAction || state.modalSubmitting || dom.rescuerViewPrimaryActionButton.disabled) {
            return;
          }

          const isArchive = state.modalPendingAction === 'archived';
          openConfirmModal({
            type: 'access-status',
            kicker: isArchive ? 'Archive Access' : 'Activate Access',
            title: isArchive ? 'Archive this rescuer?' : 'Activate this rescuer?',
            copy: isArchive
              ? 'The rescuer will move to the archived list and can be activated again later.'
              : 'The rescuer will return to the active list.',
            summaryRows: [
              { label: 'Rescuer', value: state.selectedRescuerDetails?.profile?.fullName || 'Selected rescuer' },
              { label: 'Access status', value: isArchive ? 'Archived' : 'Active' }
            ],
            requiresAdminPassword: true,
            confirmText: isArchive ? 'Confirm Archive' : 'Confirm Activation',
            confirmIcon: isArchive ? 'fa-box-archive' : 'fa-circle-check',
            confirmButtonClass: isArchive ? 'rescuer-confirm-submit is-danger' : 'rescuer-confirm-submit'
          });
        });
      }

      if (dom.rescuerViewModalBody) {
        dom.rescuerViewModalBody.addEventListener('click', (event) => {
          if (event.target.closest('[data-save-status]')) {
            if (!state.selectedRescuerDetails || isArchived(state.selectedRescuerDetails)) {
              ui.setViewActionMessage('Activate this rescuer before changing operational status.');
              return;
            }

            if (isDispatched(state.selectedRescuerDetails)) {
              ui.setViewActionMessage('Operational status is locked while this rescuer is dispatched.');
              return;
            }

            const statusSelect = dom.rescuerViewModalBody.querySelector('#rescuerOperationalStatusSelect');

            if (!statusSelect) {
              return;
            }

            openConfirmModal({
              type: 'status-change',
              kicker: 'Status Change',
              title: 'Confirm operational status',
              copy: 'Save this operational status update for the selected rescuer.',
              summaryRows: [
                { label: 'Current status', value: helpers.getStatusDisplay(state.selectedRescuerDetails.assignment.status) },
                { label: 'New status', value: helpers.getStatusDisplay(statusSelect.value) }
              ],
              requiresAdminPassword: false,
              confirmText: 'Confirm Status',
              confirmIcon: 'fa-floppy-disk',
              confirmButtonClass: 'rescuer-confirm-submit',
              nextStatus: statusSelect.value
            });
            return;
          }

          if (event.target.closest('[data-reset-password]')) {
            if (!state.selectedRescuerDetails || isArchived(state.selectedRescuerDetails)) {
              ui.setViewActionMessage('Activate this rescuer before resetting password.');
              return;
            }

            if (isDispatched(state.selectedRescuerDetails)) {
              ui.setViewActionMessage('Password reset is locked while this rescuer is dispatched.');
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

            openConfirmModal({
              type: 'password-reset',
              kicker: 'Security Check',
              title: 'Confirm password reset',
              copy: 'Enter your current admin password before resetting this rescuer password.',
              summaryRows: [
                { label: 'Rescuer', value: state.selectedRescuerDetails?.profile?.fullName || 'Selected rescuer' },
                { label: 'Account', value: state.selectedRescuerDetails?.rescuerCode || 'Not available' }
              ],
              requiresAdminPassword: true,
              confirmText: 'Confirm and Reset',
              confirmIcon: 'fa-key',
              confirmButtonClass: 'rescuer-confirm-submit',
              password,
              confirmPassword
            });
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
