(function initAdminNotifications() {
  const button = document.getElementById('adminNotificationButton');
  const badge = document.getElementById('adminNotificationBadge');

  if (!button || !badge) {
    return;
  }

  const panel = document.createElement('section');
  panel.className = 'admin-notifications-panel';
  panel.setAttribute('aria-label', 'Admin notifications');
  panel.innerHTML = `
    <header class="admin-notifications-header">
      <h2>Notifications</h2>
      <div class="admin-notifications-actions">
        <button type="button" class="admin-notifications-action" data-action="mark-all-read">Read all</button>
        <button type="button" class="admin-notifications-action" data-action="clear-all">Clear all</button>
      </div>
    </header>
    <div class="admin-notifications-list" id="adminNotificationsList">
      <div class="admin-notifications-empty">Loading notifications...</div>
    </div>
  `;
  button.parentElement.appendChild(panel);

  const list = document.getElementById('adminNotificationsList');
  const headsUp = document.createElement('div');

  headsUp.className = 'admin-notification-heads-up';
  headsUp.setAttribute('aria-live', 'polite');
  headsUp.setAttribute('aria-hidden', 'true');
  headsUp.innerHTML = `
    <span class="admin-notification-heads-up-icon">
      <i class="fa-regular fa-bell" aria-hidden="true"></i>
    </span>
    <span>
      <strong id="adminNotificationHeadsUpTitle">New notification</strong>
      <span id="adminNotificationHeadsUpMessage">You have a new admin notification.</span>
    </span>
  `;
  document.body.appendChild(headsUp);

  const headsUpTitle = document.getElementById('adminNotificationHeadsUpTitle');
  const headsUpMessage = document.getElementById('adminNotificationHeadsUpMessage');
  let notifications = [];
  let previousUnreadCount = null;
  let headsUpTimer = null;
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
    const response = await fetch(url, options);
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.message || 'Unable to complete notification request.');
    }

    return payload;
  }

  function showHeadsUp(notification) {
    if (!notification || panel.classList.contains('is-open')) {
      return;
    }

    window.clearTimeout(headsUpTimer);
    headsUpTitle.textContent = notification.title || 'New notification';
    headsUpMessage.textContent = notification.message || 'You have a new admin notification.';
    headsUp.classList.add('is-visible');
    headsUp.setAttribute('aria-hidden', 'false');

    headsUpTimer = window.setTimeout(() => {
      headsUp.classList.remove('is-visible');
      headsUp.setAttribute('aria-hidden', 'true');
    }, 4200);
  }

  function renderBadge(count) {
    if (previousUnreadCount !== null && count > previousUnreadCount) {
      const newestUnread = notifications.find((notification) => !notification.isRead);
      showHeadsUp(newestUnread);
    }

    previousUnreadCount = count;

    if (!count) {
      badge.hidden = true;
      badge.textContent = '0';
      return;
    }

    badge.hidden = false;
    badge.textContent = count > 99 ? '99+' : String(count);
  }

  function renderNotifications() {
    if (notifications.length === 0) {
      list.innerHTML = '<div class="admin-notifications-empty">No notifications yet.</div>';
      return;
    }

    list.innerHTML = notifications.map((notification) => `
      <article class="admin-notification-item ${notification.isRead ? '' : 'is-unread'}" data-notification-id="${notification.id}">
        <div class="admin-notification-title-row">
          <strong class="admin-notification-title">${escapeHtml(notification.title)}</strong>
          <span class="admin-notification-time">${escapeHtml(formatTime(notification.createdAt))}</span>
        </div>
        <p class="admin-notification-message">${escapeHtml(notification.message)}</p>
        <div class="admin-notification-controls">
          ${notification.isRead ? '' : '<button type="button" class="admin-notification-control" data-action="mark-read">Mark read</button>'}
          <button type="button" class="admin-notification-control" data-action="delete">Delete</button>
        </div>
      </article>
    `).join('');
  }

  async function refreshNotifications() {
    lastRefreshAt = Date.now();

    try {
      const [itemsPayload, countPayload] = await Promise.all([
        fetchJson('/api/admin/notifications'),
        fetchJson('/api/admin/notifications/unread-count')
      ]);

      notifications = itemsPayload.data || [];
      renderNotifications();
      renderBadge(countPayload.count || 0);
    } catch (error) {
      list.innerHTML = `<div class="admin-notifications-empty">${escapeHtml(error.message)}</div>`;
    }
  }

  async function refreshCountOnly() {
    lastRefreshAt = Date.now();

    try {
      const [itemsPayload, countPayload] = await Promise.all([
        fetchJson('/api/admin/notifications'),
        fetchJson('/api/admin/notifications/unread-count')
      ]);

      notifications = itemsPayload.data || [];
      renderBadge(countPayload.count || 0);
    } catch (error) {
      // Keep badge state stable if a background poll fails.
    }
  }

  async function runAction(action, id) {
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

  button.addEventListener('click', async () => {
    const isOpen = panel.classList.toggle('is-open');
    button.setAttribute('aria-expanded', String(isOpen));

    if (isOpen) {
      await refreshNotifications();
    }
  });

  panel.addEventListener('click', (event) => {
    const actionTarget = event.target.closest('[data-action]');

    if (!actionTarget) {
      return;
    }

    const item = event.target.closest('[data-notification-id]');
    runAction(actionTarget.dataset.action, item ? item.dataset.notificationId : null).catch((error) => {
      list.innerHTML = `<div class="admin-notifications-empty">${escapeHtml(error.message)}</div>`;
    });
  });

  document.addEventListener('click', (event) => {
    if (!panel.contains(event.target) && !button.contains(event.target)) {
      panel.classList.remove('is-open');
      button.setAttribute('aria-expanded', 'false');
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
