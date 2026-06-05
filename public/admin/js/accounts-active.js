(function createActiveAccountsModule() {
  const shared = window.ResQMeshAccounts;

  window.ResQMeshActiveAccounts = {
    init(context) {
      const statusFilterButton = document.getElementById('toggleActiveStatusFilterButton');
      const statusFilterLabel = document.getElementById('activeStatusFilterLabel');
      let statusFilter = 'approved';

      function updateStatusFilterButton() {
        const showingSuspended = statusFilter === 'suspended';
        statusFilterButton.dataset.statusFilter = statusFilter;
        statusFilterLabel.textContent = showingSuspended ? 'Suspended accounts' : 'Active accounts';
        statusFilterButton.querySelector('i').className = showingSuspended
          ? 'fa-solid fa-user-slash'
          : 'fa-solid fa-user-check';
      }

      const activePanel = shared.createListPanel({
        endpoint: '/api/admin/accounts/active',
        loadingMessage: 'Loading active accounts...',
        emptyMessage: () => statusFilter === 'suspended'
          ? 'No suspended accounts are available right now.'
          : 'No active accounts are available yet.',
        searchEmptyMessage: (query) => statusFilter === 'suspended'
          ? `No suspended accounts match "${query}".`
          : `No active accounts match "${query}".`,
        paginationLabel: () => statusFilter === 'suspended' ? 'suspended accounts' : 'active accounts',
        filterAccount: (account) => account.status === statusFilter,
        statusId: 'activeAccountsStatusMessage',
        tableWrapId: 'activeAccountsTableWrap',
        tableBodyId: 'activeAccountsTableBody',
        refreshButtonId: 'refreshActiveAccountsButton',
        searchInputId: 'activeAccountsSearchInput',
        sortButtonId: 'sortActiveAccountsButton',
        sortLabelId: 'sortActiveAccountsLabel',
        paginationId: 'activeAccountsPagination',
        paginationSummaryId: 'activeAccountsPaginationSummary',
        previousButtonId: 'previousActiveAccountsButton',
        nextButtonId: 'nextActiveAccountsButton',
        onView(accountId) {
          context.modal.openDetails({
            id: accountId,
            modalKicker: statusFilter === 'suspended' ? 'Suspended account' : 'Active account',
            actionMode: 'access',
            onReview: updateAccessStatus
          }).catch((error) => activePanel.setStatus(error.message, 'error'));
        }
      });

      async function updateAccessStatus(accountId, status, reason = '') {
        context.modal.setButtonsDisabled(true);
        context.modal.setActionMessage(status === 'suspended' ? 'Suspending account...' : 'Activating account...');

        try {
          const payload = await shared.fetchJson(`/api/admin/accounts/${accountId}/access-status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status, reason })
          });

          const warning = payload.warning || '';
          const successMessage = payload.message || 'Account access status updated.';

          context.modal.close();
          await activePanel.load();
          await window.ResQMeshAdminNotifications?.refresh?.();

          if (warning) {
            context.toast.show(warning, 'warning');
          } else {
            context.toast.show(successMessage, 'success');
          }
        } catch (error) {
          context.modal.setActionMessage(error.message);
        } finally {
          context.modal.setButtonsDisabled(false);
        }
      }

      statusFilterButton.addEventListener('click', () => {
        statusFilter = statusFilter === 'approved' ? 'suspended' : 'approved';
        updateStatusFilterButton();
        activePanel.render();
      });

      updateStatusFilterButton();
      context.activePanel = activePanel;
      return activePanel;
    }
  };
}());
