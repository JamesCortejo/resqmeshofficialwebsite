(function createPendingAccountsModule() {
  const shared = window.ResQMeshAccounts;

  window.ResQMeshPendingAccounts = {
    init(context) {
      const pendingPanel = shared.createListPanel({
        endpoint: '/api/admin/accounts/pending',
        loadingMessage: 'Loading pending accounts...',
        emptyMessage: 'No pending accounts need review right now.',
        searchEmptyMessage: (query) => `No pending accounts match "${query}".`,
        paginationLabel: 'pending accounts',
        statusId: 'pendingAccountsStatusMessage',
        tableWrapId: 'pendingAccountsTableWrap',
        tableBodyId: 'pendingAccountsTableBody',
        refreshButtonId: 'refreshPendingAccountsButton',
        searchInputId: 'pendingAccountsSearchInput',
        sortButtonId: 'sortPendingAccountsButton',
        sortLabelId: 'sortPendingAccountsLabel',
        paginationId: 'pendingAccountsPagination',
        paginationSummaryId: 'pendingAccountsPaginationSummary',
        previousButtonId: 'previousPendingAccountsButton',
        nextButtonId: 'nextPendingAccountsButton',
        onView(accountId) {
          context.modal.openDetails({
            id: accountId,
            modalKicker: 'Pending registration',
            actionMode: 'pending',
            onReview: updateStatus
          }).catch((error) => pendingPanel.setStatus(error.message, 'error'));
        }
      });

      async function updateStatus(accountId, status, reason = '') {
        context.modal.setButtonsDisabled(true);
        context.modal.setActionMessage(status === 'approved' ? 'Approving account...' : 'Declining account...');

        try {
          const payload = await shared.fetchJson(`/api/admin/accounts/${accountId}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status, reason })
          });

          const warning = payload.warning || '';
          const successMessage = payload.message || 'Account status updated.';

          context.modal.close();
          await pendingPanel.load();
          await context.activePanel.load();

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

      context.pendingPanel = pendingPanel;
      return pendingPanel;
    }
  };
}());
