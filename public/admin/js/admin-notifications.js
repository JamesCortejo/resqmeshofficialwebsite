(function initAdminNotifications() {
  const ONLINE_CHAT_NOTIFICATION_TYPE = 'online-chat.message.received';
  const button = document.getElementById('adminNotificationButton');
  const badge = document.getElementById('adminNotificationBadge');
  const distressNavLink = document.querySelector('.admin-nav-link[href="/resqmeshadmin/distress-signals"]');
  const messagesNavLink = document.querySelector('.admin-nav-link[href="/resqmeshadmin/messages"]');

  if (!button || !badge) {
    return;
  }

  let messagesNavBadge = null;
  if (messagesNavLink) {
    messagesNavBadge = messagesNavLink.querySelector('.admin-nav-link-badge');
    if (!messagesNavBadge) {
      messagesNavBadge = document.createElement('span');
      messagesNavBadge.className = 'admin-nav-link-badge';
      messagesNavBadge.setAttribute('aria-hidden', 'true');
      messagesNavBadge.hidden = true;
      messagesNavLink.appendChild(messagesNavBadge);
    }
  }

  const panel = document.createElement('section');
  panel.id = 'adminNotificationsPanel';
  panel.className = 'admin-notifications-panel';
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-labelledby', 'adminNotificationsTitle');
  panel.innerHTML = `
    <header class="admin-notifications-header">
      <div class="admin-notifications-heading">
        <h2 id="adminNotificationsTitle">Notifications</h2>
        <p class="admin-notifications-summary" id="adminNotificationsSummary" aria-live="off">Checking notifications...</p>
      </div>
      <div class="admin-notifications-actions">
        <button type="button" class="admin-notifications-action" data-action="mark-all-read">Read all</button>
        <button type="button" class="admin-notifications-action is-danger" data-action="clear-all">Clear all</button>
      </div>
    </header>
    <div class="admin-notifications-list" id="adminNotificationsList">
      <div class="admin-notifications-state" data-state="loading" role="status">
        <span class="admin-notifications-state-icon"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i></span>
        <strong>Loading notifications</strong>
        <span>Please wait while the latest activity is checked.</span>
      </div>
    </div>
  `;
  button.setAttribute('aria-controls', panel.id);
  button.setAttribute('aria-haspopup', 'true');
  button.parentElement.appendChild(panel);

  const list = document.getElementById('adminNotificationsList');
  const summary = document.getElementById('adminNotificationsSummary');
  const readAllButton = panel.querySelector('[data-action="mark-all-read"]');
  const clearAllButton = panel.querySelector('[data-action="clear-all"]');
  const headsUp = document.createElement('div');

  headsUp.className = 'admin-notification-heads-up';
  headsUp.setAttribute('aria-live', 'polite');
  headsUp.setAttribute('aria-hidden', 'true');
  headsUp.innerHTML = `
    <span class="admin-notification-heads-up-icon" id="adminNotificationHeadsUpIcon">
      <i class="fa-regular fa-bell" aria-hidden="true"></i>
    </span>
    <span class="admin-notification-heads-up-copy">
      <strong id="adminNotificationHeadsUpTitle">New notification</strong>
      <span id="adminNotificationHeadsUpMessage">You have a new admin notification.</span>
    </span>
  `;
  document.body.appendChild(headsUp);

  const headsUpIcon = document.getElementById('adminNotificationHeadsUpIcon');
  const headsUpTitle = document.getElementById('adminNotificationHeadsUpTitle');
  const headsUpMessage = document.getElementById('adminNotificationHeadsUpMessage');
  let notifications = [];
  let previousUnreadCount = null;
  let currentUnreadCount = 0;
  let activeDistressCount = 0;
  let headsUpTimer = null;
  let markChatReadPromise = null;
  let actionPending = false;
  let lastRefreshAt = 0;
  const pollIntervalMs = 5000;
  const minManualRefreshGapMs = 1200;

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getNotificationPresentation(notification) {
    const type = String(notification?.type || 'system');

    if (type.startsWith('distress.')) {
      return {
        category: 'emergency',
        label: 'Emergency',
        icon: 'fa-triangle-exclamation',
        tone: type.endsWith('.active') ? 'danger' : 'neutral'
      };
    }

    if (type.startsWith('online-chat.')) {
      return { category: 'communication', label: 'Communication', icon: 'fa-comments', tone: 'info' };
    }

    if (type.startsWith('registration.') || type.startsWith('account.')) {
      const tone = type.endsWith('.approved') || type.endsWith('.activated')
        ? 'success'
        : type.endsWith('.pending')
          ? 'warning'
          : type.endsWith('.declined') || type.endsWith('.suspended')
            ? 'danger'
            : 'neutral';
      return { category: 'accounts', label: 'Account', icon: 'fa-user-check', tone };
    }

    if (type.startsWith('rescuer.')) {
      const tone = type.endsWith('.created') || type.endsWith('.activated')
        ? 'success'
        : type.endsWith('.password.reset')
          ? 'warning'
          : 'info';
      return { category: 'responders', label: 'Responder', icon: 'fa-user-shield', tone };
    }

    if (type.startsWith('rescue-team.')) {
      return { category: 'teams', label: 'Rescue team', icon: 'fa-people-group', tone: 'info' };
    }

    if (type.startsWith('deployment.')) {
      const tone = type.endsWith('.accomplished')
        ? 'success'
        : type.endsWith('.created')
          ? 'warning'
          : 'neutral';
      return { category: 'deployments', label: 'Deployment', icon: 'fa-truck-medical', tone };
    }

    return { category: 'system', label: 'System', icon: 'fa-bell', tone: 'neutral' };
  }

  function renderNotificationState(state, title, message) {
    const stateIcons = {
      loading: 'fa-spinner fa-spin',
      empty: 'fa-inbox',
      error: 'fa-circle-exclamation'
    };
    const icon = stateIcons[state] || stateIcons.empty;

    list.innerHTML = `
      <div class="admin-notifications-state" data-state="${escapeHtml(state)}" role="status">
        <span class="admin-notifications-state-icon"><i class="fa-solid ${icon}" aria-hidden="true"></i></span>
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(message)}</span>
      </div>
    `;
  }

  function syncNotificationControls() {
    if (summary) {
      let summaryText = `All caught up / ${notifications.length} total`;

      if (actionPending) {
        summaryText = 'Updating notifications...';
      } else if (notifications.length === 0) {
        summaryText = 'No notifications';
      } else if (currentUnreadCount > 0) {
        summaryText = `${currentUnreadCount} unread / ${notifications.length} total`;
      }

      if (summary.textContent !== summaryText) {
        summary.textContent = summaryText;
      }
    }

    if (readAllButton) {
      readAllButton.disabled = actionPending || currentUnreadCount === 0;
    }
    if (clearAllButton) {
      clearAllButton.disabled = actionPending || notifications.length === 0;
    }

    panel.querySelectorAll('.admin-notification-control').forEach((control) => {
      control.disabled = actionPending;
    });
    panel.setAttribute('aria-busy', String(actionPending));
  }

  function setActionPending(isPending) {
    actionPending = Boolean(isPending);
    syncNotificationControls();
  }

  function formatTime(value) {
    if (!value) {
      return '';
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return date.toLocaleString([], {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  async function fetchJson(url, options) {
    const requestOptions = window.ResQMeshAdminAuth
      ? await window.ResQMeshAdminAuth.prepareRequestOptions(options)
      : options;
    const response = await fetch(url, requestOptions);
    const payload = await response.json().catch(() => ({}));

    if (response.status === 401) {
      window.ResQMeshAdminAuth?.handleUnauthorized(payload.message || 'Your admin session has expired.');
    }

    if (!response.ok) {
      throw new Error(payload.message || 'Unable to complete notification request.');
    }

    return payload;
  }

  function showHeadsUp(notification) {
    if (!notification || panel.classList.contains('is-open')) {
      return;
    }

    const presentation = getNotificationPresentation(notification);
    window.clearTimeout(headsUpTimer);
    headsUp.dataset.category = presentation.category;
    headsUp.dataset.tone = presentation.tone;
    headsUpIcon.innerHTML = `<i class="fa-solid ${presentation.icon}" aria-hidden="true"></i>`;
    headsUpTitle.textContent = notification.title || 'New notification';
    headsUpMessage.textContent = notification.message || 'You have a new admin notification.';
    headsUp.classList.add('is-visible');
    headsUp.setAttribute('aria-hidden', 'false');

    headsUpTimer = window.setTimeout(() => {
      headsUp.classList.remove('is-visible');
      headsUp.setAttribute('aria-hidden', 'true');
    }, 4200);
  }

  function renderDistressAlertState() {
    if (!distressNavLink) {
      return;
    }

    const shouldAlert = activeDistressCount > 0 && !distressNavLink.classList.contains('is-active');

    distressNavLink.classList.toggle('is-alerting', shouldAlert);
    distressNavLink.setAttribute('data-alerting', shouldAlert ? 'true' : 'false');
  }

  function renderBadge(count) {
    const normalizedCount = Number(count || 0);

    if (previousUnreadCount !== null && normalizedCount > previousUnreadCount) {
      const newestUnread = notifications.find((notification) => !notification.isRead);
      showHeadsUp(newestUnread);
    }

    previousUnreadCount = normalizedCount;
    currentUnreadCount = normalizedCount;
    button.setAttribute(
      'aria-label',
      normalizedCount > 0
        ? `Notifications, ${normalizedCount} unread`
        : 'Notifications, no unread items'
    );

    if (!normalizedCount) {
      badge.hidden = true;
      badge.textContent = '0';
      syncNotificationControls();
      return;
    }

    badge.hidden = false;
    badge.textContent = normalizedCount > 99 ? '99+' : String(normalizedCount);
    syncNotificationControls();
  }

  function renderMessagesNavBadge() {
    if (!messagesNavBadge) {
      return;
    }

    const onlineChatUnreadCount = notifications.filter((notification) =>
      notification &&
      !notification.isRead &&
      notification.type === ONLINE_CHAT_NOTIFICATION_TYPE
    ).length;

    const isMessagesPage = messagesNavLink?.classList.contains('is-active');
    if (!onlineChatUnreadCount || isMessagesPage) {
      messagesNavBadge.hidden = true;
      messagesNavBadge.textContent = '';
      return;
    }

    messagesNavBadge.hidden = false;
    messagesNavBadge.textContent = '';
  }

  function getUnreadOnlineChatNotifications() {
    return notifications.filter((notification) =>
      notification &&
      !notification.isRead &&
      notification.type === ONLINE_CHAT_NOTIFICATION_TYPE
    );
  }

  async function markOnlineChatNotificationsRead() {
    const isMessagesPage = messagesNavLink?.classList.contains('is-active');
    const unreadChatNotifications = getUnreadOnlineChatNotifications();

    if (!isMessagesPage || unreadChatNotifications.length === 0) {
      return false;
    }

    if (markChatReadPromise) {
      return markChatReadPromise;
    }

    markChatReadPromise = Promise.all(
      unreadChatNotifications.map((notification) =>
        fetchJson(`/api/admin/notifications/${notification.id}/read`, { method: 'PATCH' }).catch(() => null)
      )
    )
      .then(async () => {
        await refreshCountOnly();
        return true;
      })
      .finally(() => {
        markChatReadPromise = null;
      });

    return markChatReadPromise;
  }

  function dispatchNotificationsRefreshed(count) {
    const onlineChatUnreadCount = notifications.filter((notification) =>
      notification &&
      !notification.isRead &&
      notification.type === ONLINE_CHAT_NOTIFICATION_TYPE
    ).length;

    window.dispatchEvent(new CustomEvent('resqmesh:admin-notifications-refreshed', {
      detail: {
        unreadCount: count || 0,
        onlineChatUnreadCount,
        notifications
      }
    }));
  }

  function renderNotifications() {
    if (notifications.length === 0) {
      renderNotificationState('empty', 'No notifications yet', 'New admin activity will appear here.');
      renderDistressAlertState();
      renderMessagesNavBadge();
      syncNotificationControls();
      return;
    }

    list.innerHTML = notifications.map((notification) => {
      const presentation = getNotificationPresentation(notification);
      const unreadBadge = notification.isRead
        ? ''
        : '<span class="admin-notification-unread">Unread</span>';
      const readButton = notification.isRead
        ? ''
        : '<button type="button" class="admin-notification-control" data-action="mark-read">Mark read</button>';

      return `
        <article class="admin-notification-item ${notification.isRead ? '' : 'is-unread'}" data-notification-id="${escapeHtml(notification.id)}" data-category="${escapeHtml(presentation.category)}" data-tone="${escapeHtml(presentation.tone)}">
          <span class="admin-notification-type-icon" aria-hidden="true">
            <i class="fa-solid ${presentation.icon}"></i>
          </span>
          <div class="admin-notification-content">
            <div class="admin-notification-title-row">
              <div class="admin-notification-title-wrap">
                <strong class="admin-notification-title">${escapeHtml(notification.title)}</strong>
                ${unreadBadge}
              </div>
              <time class="admin-notification-time" datetime="${escapeHtml(notification.createdAt || '')}">${escapeHtml(formatTime(notification.createdAt))}</time>
            </div>
            <p class="admin-notification-message">${escapeHtml(notification.message)}</p>
            <div class="admin-notification-footer-row">
              <span class="admin-notification-category">${escapeHtml(presentation.label)}</span>
              <div class="admin-notification-controls">
                ${readButton}
                <button type="button" class="admin-notification-control is-danger" data-action="delete">Delete</button>
              </div>
            </div>
          </div>
        </article>
      `;
    }).join('');
    renderDistressAlertState();
    renderMessagesNavBadge();
    syncNotificationControls();
  }

  async function refreshNotifications({ showLoading = false } = {}) {
    lastRefreshAt = Date.now();

    if (showLoading && notifications.length === 0) {
      renderNotificationState('loading', 'Loading notifications', 'Please wait while the latest activity is checked.');
    }

    try {
      const [itemsPayload, countPayload, distressCountPayload] = await Promise.all([
        fetchJson('/api/admin/notifications'),
        fetchJson('/api/admin/notifications/unread-count'),
        fetchJson('/api/admin/distress-signals/active-count')
      ]);

      notifications = itemsPayload.data || [];
      activeDistressCount = Number(distressCountPayload.count || 0);
      renderNotifications();
      renderBadge(countPayload.count || 0);
      dispatchNotificationsRefreshed(countPayload.count || 0);
      void markOnlineChatNotificationsRead();
    } catch (error) {
      renderNotificationState('error', 'Notifications unavailable', error.message || 'Unable to load notifications right now.');
      syncNotificationControls();
    }
  }

  async function refreshCountOnly() {
    lastRefreshAt = Date.now();

    try {
      const [itemsPayload, countPayload, distressCountPayload] = await Promise.all([
        fetchJson('/api/admin/notifications'),
        fetchJson('/api/admin/notifications/unread-count'),
        fetchJson('/api/admin/distress-signals/active-count')
      ]);

      notifications = itemsPayload.data || [];
      activeDistressCount = Number(distressCountPayload.count || 0);
      renderDistressAlertState();
      renderMessagesNavBadge();
      renderBadge(countPayload.count || 0);
      dispatchNotificationsRefreshed(countPayload.count || 0);
      void markOnlineChatNotificationsRead();
    } catch (error) {
      // Keep badge state stable if a background poll fails.
    }
  }

  async function runAction(action, id) {
    if (actionPending) {
      return;
    }

    setActionPending(true);
    try {
      if (action === 'mark-read') {
        await fetchJson(`/api/admin/notifications/${id}/read`, { method: 'PATCH' });
      } else if (action === 'delete') {
        await fetchJson(`/api/admin/notifications/${id}`, { method: 'DELETE' });
      } else if (action === 'mark-all-read') {
        await fetchJson('/api/admin/notifications/read-all', { method: 'PATCH' });
      } else if (action === 'clear-all') {
        await fetchJson('/api/admin/notifications', { method: 'DELETE' });
      }

      await refreshNotifications();
    } finally {
      setActionPending(false);
    }
  }

  function refreshNow() {
    if (Date.now() - lastRefreshAt < minManualRefreshGapMs) {
      return;
    }

    if (panel.classList.contains('is-open')) {
      refreshNotifications();
    } else {
      refreshCountOnly();
    }
  }

  function closePanel({ restoreFocus = false } = {}) {
    if (!panel.classList.contains('is-open')) {
      return;
    }

    panel.classList.remove('is-open');
    summary?.setAttribute('aria-live', 'off');
    button.setAttribute('aria-expanded', 'false');
    if (restoreFocus) {
      button.focus();
    }
  }

  button.addEventListener('click', () => {
    if (panel.classList.contains('is-open')) {
      closePanel();
      return;
    }

    panel.classList.add('is-open');
    summary?.setAttribute('aria-live', 'polite');
    button.setAttribute('aria-expanded', 'true');
    syncNotificationControls();
    void refreshNotifications({ showLoading: notifications.length === 0 });
  });

  panel.addEventListener('click', (event) => {
    const actionTarget = event.target.closest('[data-action]');

    if (!actionTarget || actionTarget.disabled || actionPending) {
      return;
    }

    const item = event.target.closest('[data-notification-id]');
    runAction(actionTarget.dataset.action, item ? item.dataset.notificationId : null).catch((error) => {
      renderNotificationState('error', 'Action unsuccessful', error.message || 'Unable to update notifications.');
      syncNotificationControls();
    });
  });

  document.addEventListener('click', (event) => {
    if (!panel.contains(event.target) && !button.contains(event.target)) {
      closePanel();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && panel.classList.contains('is-open')) {
      event.preventDefault();
      closePanel({ restoreFocus: true });
    }
  });

  window.addEventListener('focus', refreshNow);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      refreshNow();
    }
  });

  window.ResQMeshAdminNotifications = {
    refresh: refreshNotifications,
    refreshCount: refreshCountOnly
  };

  refreshNotifications();
  window.setInterval(() => {
    if (panel.classList.contains('is-open')) {
      refreshNotifications();
    } else {
      refreshCountOnly();
    }
  }, pollIntervalMs);
}());
