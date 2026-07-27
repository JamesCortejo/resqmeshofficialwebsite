(function createDepartmentChatsManagerPage() {
  const state = {
    rooms: [],
    searchQuery: '',
    filter: 'all',
    editingRoomId: null,
    archiveTargetId: null,
    pendingLogoSrc: ''
  };

  const dom = {
    feedback: document.getElementById('departmentChatsFeedback'),
    tableBody: document.getElementById('departmentChatsTableBody'),
    emptyState: document.getElementById('departmentChatsEmpty'),
    searchInput: document.getElementById('departmentChatsSearchInput'),
    filterGroup: document.getElementById('departmentChatsFilterGroup'),
    openCreateButton: document.getElementById('openDepartmentChatCreateButton'),
    formModal: document.getElementById('departmentChatFormModal'),
    archiveModal: document.getElementById('departmentChatArchiveModal'),
    formTitle: document.getElementById('departmentChatFormTitle'),
    formKicker: document.getElementById('departmentChatFormKicker'),
    form: document.getElementById('departmentChatForm'),
    nameInput: document.getElementById('departmentChatNameInput'),
    subtitleInput: document.getElementById('departmentChatSubtitleInput'),
    statusInput: document.getElementById('departmentChatStatusInput'),
    rescuerAgencyInput: document.getElementById('departmentChatRescuerAgencyInput'),
    logoInput: document.getElementById('departmentChatLogoInput'),
    logoPreview: document.getElementById('departmentChatLogoPreview'),
    logoPreviewImage: document.getElementById('departmentChatLogoPreviewImage'),
    logoPreviewFallback: document.getElementById('departmentChatLogoPreviewFallback'),
    uploadProgress: document.getElementById('departmentChatUploadProgress'),
    uploadProgressFill: document.getElementById('departmentChatUploadProgressFill'),
    uploadProgressText: document.getElementById('departmentChatUploadProgressText'),
    colorInput: document.getElementById('departmentChatColorInput'),
    readOnlyInput: document.getElementById('departmentChatReadOnlyInput'),
    submitButton: document.getElementById('departmentChatFormSubmitButton'),
    archiveCopy: document.getElementById('departmentChatArchiveCopy'),
    confirmArchiveButton: document.getElementById('confirmDepartmentChatArchiveButton')
  };

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async function readJson(response) {
    return response.json().catch(() => ({}));
  }

  async function adminFetch(url, options = {}) {
    const requestOptions = await window.ResQMeshAdminAuth.prepareRequestOptions(options);
    const response = await fetch(url, requestOptions);
    const payload = await readJson(response);

    if (response.status === 401) {
      window.ResQMeshAdminAuth.handleUnauthorized(payload.message || 'Admin session expired.');
      throw new Error(payload.message || 'Admin session expired.');
    }

    if (!response.ok || payload.success === false) {
      throw new Error(payload.message || 'Request failed.');
    }

    return payload;
  }

  async function adminUploadFetch(url, { method = 'POST', body, onProgress } = {}) {
    const requestOptions = await window.ResQMeshAdminAuth.prepareRequestOptions({
      method,
      body
    });

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(requestOptions.method, url, true);
      xhr.withCredentials = true;

      requestOptions.headers.forEach((value, key) => {
        xhr.setRequestHeader(key, value);
      });

      if (xhr.upload && typeof onProgress === 'function') {
        xhr.upload.addEventListener('progress', (event) => {
          if (!event.lengthComputable) {
            onProgress(null);
            return;
          }

          const percent = Math.max(0, Math.min(100, Math.round((event.loaded / event.total) * 100)));
          onProgress(percent);
        });
      }

      xhr.onerror = () => reject(new Error('Network request failed.'));
      xhr.ontimeout = () => reject(new Error('Upload timed out.'));

      xhr.onload = () => {
        let payload = {};

        try {
          payload = xhr.responseText ? JSON.parse(xhr.responseText) : {};
        } catch (error) {
          payload = {};
        }

        if (xhr.status === 401) {
          window.ResQMeshAdminAuth.handleUnauthorized(payload.message || 'Admin session expired.');
          reject(new Error(payload.message || 'Admin session expired.'));
          return;
        }

        if (xhr.status < 200 || xhr.status >= 300 || payload.success === false) {
          reject(new Error(payload.message || 'Request failed.'));
          return;
        }

        resolve(payload);
      };

      xhr.send(requestOptions.body);
    });
  }

  function showFeedback(message, tone = 'success') {
    if (!dom.feedback) {
      return;
    }

    dom.feedback.hidden = false;
    dom.feedback.dataset.tone = tone;
    dom.feedback.textContent = message;

    window.clearTimeout(showFeedback.timeoutId);
    showFeedback.timeoutId = window.setTimeout(() => {
      dom.feedback.hidden = true;
    }, 3200);
  }

  function getRoomInitials(name) {
    return String(name || 'DP')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('') || 'DP';
  }

  function getAgencyLabel(value) {
    switch (String(value || '').toLowerCase()) {
      case 'cdrrmo':
        return 'CDRRMO';
      case 'fire-department':
        return 'Fire Department';
      case 'police-department':
        return 'Police Department';
      default:
        return 'Unmapped';
    }
  }

  function syncLogoPreview(name, logoSrc) {
    const initials = getRoomInitials(name || dom.nameInput.value);
    dom.logoPreviewFallback.textContent = initials;

    if (logoSrc) {
      dom.logoPreviewImage.src = logoSrc;
      dom.logoPreviewImage.hidden = false;
      dom.logoPreviewFallback.hidden = true;
      dom.logoPreview.classList.add('has-image');
      return;
    }

    dom.logoPreviewImage.removeAttribute('src');
    dom.logoPreviewImage.hidden = true;
    dom.logoPreviewFallback.hidden = false;
    dom.logoPreview.classList.remove('has-image');
  }

  function setUploadProgress(percent, message) {
    if (!dom.uploadProgress || !dom.uploadProgressFill || !dom.uploadProgressText) {
      return;
    }

    if (percent === null && !message) {
      dom.uploadProgress.hidden = true;
      dom.uploadProgressFill.style.width = '0%';
      dom.uploadProgressText.textContent = '';
      return;
    }

    dom.uploadProgress.hidden = false;

    if (typeof percent === 'number') {
      dom.uploadProgressFill.style.width = `${Math.max(0, Math.min(100, percent))}%`;
    }

    dom.uploadProgressText.textContent = message || `Uploading logo ${percent || 0}%`;
  }

  function getVisibleRooms() {
    return state.rooms.filter((room) => {
      if (state.filter !== 'all' && room.status !== state.filter) {
        return false;
      }

      if (!state.searchQuery) {
        return true;
      }

      return [
        room.name,
        room.subtitle,
        getAgencyLabel(room.rescuerAgency),
        room.status,
        room.colorTag
      ].join(' ').toLowerCase().includes(state.searchQuery);
    });
  }

  function renderTable() {
    const visibleRooms = getVisibleRooms();

    if (!visibleRooms.length) {
      dom.tableBody.innerHTML = '';
      dom.emptyState.hidden = false;
      dom.emptyState.textContent = 'No department chat rooms match the current search or status filter.';
      return;
    }

    dom.emptyState.hidden = true;
    dom.tableBody.innerHTML = visibleRooms.map((room) => `
      <tr>
        <td>
          <span class="department-chats-primary-text">
            <span class="department-chats-room-name">
              <span class="department-chats-room-icon${room.iconUrl ? ' has-image' : ''}" aria-hidden="true">
                ${room.iconUrl
                  ? `<img src="${escapeHtml(room.iconUrl)}" alt="">`
                  : `<span>${escapeHtml(getRoomInitials(room.name))}</span>`}
              </span>
              <span>${escapeHtml(room.name)}</span>
            </span>
          </span>
        </td>
        <td>
          <span class="department-chats-muted-text">${escapeHtml(room.subtitle || '')}</span>
          ${room.readOnly ? '<span class="department-chats-muted-text">Read-only</span>' : ''}
        </td>
        <td>
          <span class="department-chats-muted-text">${escapeHtml(getAgencyLabel(room.rescuerAgency))}</span>
        </td>
        <td>
          <span class="department-chats-logo-preview${room.iconUrl ? ' has-image' : ''}" aria-label="Department logo">
            ${room.iconUrl
              ? `<img src="${escapeHtml(room.iconUrl)}" alt="">`
              : `<span>${escapeHtml(getRoomInitials(room.name))}</span>`}
          </span>
        </td>
        <td>
          <span class="department-chats-status-pill" data-status="${escapeHtml(room.status)}">${escapeHtml(room.status)}</span>
        </td>
        <td>
          <span class="department-chats-color-pill" data-color="${escapeHtml(room.colorTag)}">${escapeHtml(room.colorTag)}</span>
        </td>
        <td>
          <div class="department-chats-action-stack">
            <button type="button" class="department-chat-action-button" data-action="edit" data-room-id="${room.id}">
              <i class="fa-solid fa-pen" aria-hidden="true"></i>
              <span>Edit</span>
            </button>
            <button type="button" class="department-chat-action-button" data-action="archive" data-room-id="${room.id}">
              <i class="fa-solid fa-box-archive" aria-hidden="true"></i>
              <span>Archive</span>
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  function syncFilterButtons() {
    const buttons = dom.filterGroup.querySelectorAll('[data-chat-filter]');
    buttons.forEach((button) => {
      button.classList.toggle('is-active', button.getAttribute('data-chat-filter') === state.filter);
    });
  }

  async function loadRooms() {
    try {
      const payload = await adminFetch('/api/admin/online-chat/departments');
      state.rooms = payload.data || [];
      renderTable();
    } catch (error) {
      showFeedback(error.message || 'Unable to load department chats.', 'error');
    }
  }

  function openFormModal(mode, room) {
    state.editingRoomId = room?.id || null;
    state.pendingLogoSrc = room?.iconUrl || '';
    dom.form.reset();

    if (mode === 'edit' && room) {
      dom.formTitle.textContent = 'Edit Department Chat';
      dom.formKicker.textContent = 'Update room';
      dom.submitButton.textContent = 'Save Changes';
      dom.nameInput.value = room.name;
      dom.subtitleInput.value = room.subtitle || '';
      dom.statusInput.value = room.status;
      dom.rescuerAgencyInput.value = room.rescuerAgency || '';
      dom.colorInput.value = room.colorTag;
      dom.readOnlyInput.checked = Boolean(room.readOnly);
    } else {
      dom.formTitle.textContent = 'Add Department Chat';
      dom.formKicker.textContent = 'New room';
      dom.submitButton.textContent = 'Save Room';
      dom.statusInput.value = 'active';
      dom.rescuerAgencyInput.value = '';
      dom.colorInput.value = 'red';
      dom.readOnlyInput.checked = false;
    }

    dom.logoInput.value = '';
    syncLogoPreview(dom.nameInput.value || room?.name || 'DP', state.pendingLogoSrc);
    setUploadProgress(null, '');

    dom.formModal.classList.add('is-open');
    dom.formModal.setAttribute('aria-hidden', 'false');
    window.setTimeout(() => dom.nameInput.focus(), 30);
  }

  function closeFormModal() {
    dom.formModal.classList.remove('is-open');
    dom.formModal.setAttribute('aria-hidden', 'true');
    state.editingRoomId = null;
    state.pendingLogoSrc = '';
    setUploadProgress(null, '');
  }

  function openArchiveModal(room) {
    state.archiveTargetId = room.id;
    dom.archiveCopy.textContent = `${room.name} will be marked as archived and hidden from civilian app chat selection.`;
    dom.archiveModal.classList.add('is-open');
    dom.archiveModal.setAttribute('aria-hidden', 'false');
  }

  function closeArchiveModal() {
    dom.archiveModal.classList.remove('is-open');
    dom.archiveModal.setAttribute('aria-hidden', 'true');
    state.archiveTargetId = null;
  }

  function buildFormData() {
    const data = new FormData();
    data.set('name', dom.nameInput.value.trim());
    data.set('subtitle', dom.subtitleInput.value.trim());
    data.set('status', dom.statusInput.value);
    data.set('rescuerAgency', dom.rescuerAgencyInput.value);
    data.set('colorTag', dom.colorInput.value);
    data.set('readOnly', dom.readOnlyInput.checked ? '1' : '0');

    const file = dom.logoInput.files && dom.logoInput.files[0];
    if (file) {
      data.set('icon', file);
    }

    return data;
  }

  async function handleFormSubmit(event) {
    event.preventDefault();

    if (!dom.nameInput.value.trim() || !dom.subtitleInput.value.trim() || !dom.rescuerAgencyInput.value) {
      showFeedback('Name, subtitle, and rescuer agency are required.', 'error');
      return;
    }

    dom.submitButton.disabled = true;
    dom.submitButton.textContent = state.editingRoomId ? 'Saving...' : 'Creating...';

    try {
      const url = state.editingRoomId
        ? `/api/admin/online-chat/departments/${state.editingRoomId}`
        : '/api/admin/online-chat/departments';
      const method = state.editingRoomId ? 'PATCH' : 'POST';
      const formData = buildFormData();
      const hasLogoFile = Boolean(dom.logoInput.files && dom.logoInput.files[0]);

      if (hasLogoFile) {
        setUploadProgress(0, 'Uploading logo 0%');
      } else {
        setUploadProgress(null, '');
      }

      const payload = hasLogoFile
        ? await adminUploadFetch(url, {
            method,
            body: formData,
            onProgress: (percent) => {
              if (percent === null) {
                setUploadProgress(100, 'Finishing upload...');
                return;
              }

              setUploadProgress(percent, `Uploading logo ${percent}%`);
            }
          })
        : await adminFetch(url, {
            method,
            body: formData
          });

      if (hasLogoFile) {
        setUploadProgress(100, 'Logo uploaded');
      }

      showFeedback(payload.message || 'Department chat saved.');
      closeFormModal();
      await loadRooms();
    } catch (error) {
      showFeedback(error.message || 'Unable to save department chat.', 'error');
    } finally {
      dom.submitButton.disabled = false;
      dom.submitButton.textContent = state.editingRoomId ? 'Save Changes' : 'Save Room';
      window.setTimeout(() => setUploadProgress(null, ''), 450);
    }
  }

  async function handleArchiveConfirm() {
    if (!state.archiveTargetId) {
      return;
    }

    dom.confirmArchiveButton.disabled = true;
    dom.confirmArchiveButton.textContent = 'Archiving...';

    try {
      const payload = await adminFetch(`/api/admin/online-chat/departments/${state.archiveTargetId}/archive`, {
        method: 'POST',
        body: JSON.stringify({})
      });
      showFeedback(payload.message || 'Department chat archived.');
      closeArchiveModal();
      await loadRooms();
    } catch (error) {
      showFeedback(error.message || 'Unable to archive department chat.', 'error');
    } finally {
      dom.confirmArchiveButton.disabled = false;
      dom.confirmArchiveButton.textContent = 'Archive Room';
    }
  }

  function bindEvents() {
    dom.openCreateButton.addEventListener('click', () => openFormModal('create'));
    dom.form.addEventListener('submit', handleFormSubmit);
    dom.confirmArchiveButton.addEventListener('click', handleArchiveConfirm);

    dom.nameInput.addEventListener('input', () => syncLogoPreview(dom.nameInput.value, state.pendingLogoSrc));

    dom.logoInput.addEventListener('change', () => {
      const file = dom.logoInput.files && dom.logoInput.files[0];

      if (!file) {
        syncLogoPreview(dom.nameInput.value, state.pendingLogoSrc);
        return;
      }

      if (!file.type.startsWith('image/')) {
        showFeedback('Department logo must be an image file.', 'error');
        dom.logoInput.value = '';
        return;
      }

      const previewUrl = URL.createObjectURL(file);
      syncLogoPreview(dom.nameInput.value, previewUrl);
    });

    document.querySelectorAll('[data-close-department-chat-form]').forEach((button) => {
      button.addEventListener('click', closeFormModal);
    });

    document.querySelectorAll('[data-close-department-chat-archive]').forEach((button) => {
      button.addEventListener('click', closeArchiveModal);
    });

    dom.tableBody.addEventListener('click', (event) => {
      const button = event.target.closest('[data-action]');

      if (!button) {
        return;
      }

      const roomId = Number(button.getAttribute('data-room-id'));
      const room = state.rooms.find((item) => item.id === roomId);

      if (!room) {
        return;
      }

      if (button.getAttribute('data-action') === 'edit') {
        openFormModal('edit', room);
      } else {
        openArchiveModal(room);
      }
    });

    dom.searchInput.addEventListener('input', () => {
      state.searchQuery = dom.searchInput.value.trim().toLowerCase();
      renderTable();
    });

    dom.filterGroup.addEventListener('click', (event) => {
      const button = event.target.closest('[data-chat-filter]');

      if (!button) {
        return;
      }

      state.filter = button.getAttribute('data-chat-filter');
      syncFilterButtons();
      renderTable();
    });
  }

  bindEvents();
  syncFilterButtons();
  loadRooms();
}());
