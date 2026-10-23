(function initAdminSettings() {
  const form = document.getElementById('notificationSettingsForm');

  if (!form) {
    return;
  }

  const toast = document.getElementById('adminReviewToast');
  const toastIcon = document.getElementById('adminReviewToastIcon');
  const toastMessage = document.getElementById('adminReviewToastMessage');
  const saveButton = document.getElementById('saveNotificationSettingsButton');
  const saveButtonLabel = saveButton.querySelector('span');
  const soundEnabledInput = form.elements.soundEnabled;
  const volumeInput = form.elements.soundVolume;
  const volumeOutput = document.getElementById('notificationVolumeOutput');
  const volumeControl = document.getElementById('settingsVolumeControl');
  const testSoundButton = document.getElementById('testNotificationSoundButton');
  const testDistressSoundButton = document.getElementById('testDistressSoundButton');
  let loading = true;
  let saving = false;
  let settingsAvailable = false;
  let toastTimer = null;

  async function fetchJson(url, options) {
    const requestOptions = window.ResQMeshAdminAuth
      ? await window.ResQMeshAdminAuth.prepareRequestOptions(options)
      : options;
    const response = await fetch(url, requestOptions);
    const payload = await response.json().catch(() => ({}));

    if (response.status === 401) {
      window.ResQMeshAdminAuth?.handleUnauthorized(payload.message || 'Your admin session has expired.');
    }

    if (!response.ok || payload.success === false) {
      throw new Error(payload.message || 'Unable to update notification settings.');
    }

    return payload;
  }

  function showToast(message, tone = 'success') {
    if (!message) return;

    window.clearTimeout(toastTimer);
    toastMessage.textContent = message;
    toast.dataset.tone = tone;
    toastIcon.innerHTML = tone === 'warning'
      ? '<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>'
      : '<i class="fa-solid fa-check" aria-hidden="true"></i>';
    toast.classList.add('is-visible');
    toast.setAttribute('aria-hidden', 'false');

    toastTimer = window.setTimeout(() => {
      toast.classList.remove('is-visible');
      toast.setAttribute('aria-hidden', 'true');
    }, 4200);
  }

  function syncSoundControls() {
    const enabled = soundEnabledInput.checked && settingsAvailable && !loading && !saving;
    volumeInput.disabled = !enabled;
    testSoundButton.disabled = !enabled;
    testDistressSoundButton.disabled = !enabled;
    volumeControl.classList.toggle('is-disabled', !soundEnabledInput.checked);
    volumeOutput.value = `${volumeInput.value}%`;
    volumeOutput.textContent = `${volumeInput.value}%`;
  }

  function setBusy(nextLoading, nextSaving = false) {
    loading = nextLoading;
    saving = nextSaving;
    const controlsDisabled = loading || saving || !settingsAvailable;
    saveButton.disabled = controlsDisabled;
    saveButtonLabel.textContent = saving ? 'Saving...' : 'Save Settings';
    Array.from(form.elements).forEach((element) => {
      if (element === saveButton || !element.name) {
        return;
      }
      if (element !== volumeInput && element !== testSoundButton) {
        element.disabled = controlsDisabled;
      }
    });
    syncSoundControls();
    form.setAttribute('aria-busy', String(loading || saving));
  }

  function applyPreferences(preferences) {
    const headsUp = preferences?.headsUp || {};
    form.elements.communication.checked = headsUp.communication !== false;
    form.elements.accounts.checked = headsUp.accounts !== false;
    form.elements.responders.checked = headsUp.responders !== false;
    form.elements.teams.checked = headsUp.teams !== false;
    form.elements.deployments.checked = headsUp.deployments !== false;
    form.elements.system.checked = headsUp.system !== false;
    soundEnabledInput.checked = Boolean(preferences?.sound?.enabled);
    volumeInput.value = String(Number.isInteger(preferences?.sound?.volume) ? preferences.sound.volume : 60);
    syncSoundControls();
  }

  function collectPreferences() {
    return {
      headsUp: {
        communication: form.elements.communication.checked,
        accounts: form.elements.accounts.checked,
        responders: form.elements.responders.checked,
        teams: form.elements.teams.checked,
        deployments: form.elements.deployments.checked,
        system: form.elements.system.checked
      },
      sound: {
        enabled: soundEnabledInput.checked,
        volume: Number.parseInt(volumeInput.value, 10)
      }
    };
  }

  async function loadSettings() {
    setBusy(true);

    try {
      const payload = await fetchJson('/api/admin/settings/notifications');
      applyPreferences(payload.data);
      settingsAvailable = true;
    } catch (error) {
      showToast(error.message || 'Unable to load notification settings.', 'warning');
    } finally {
      // Keep controls disabled if persisted values could not be loaded safely.
      setBusy(false);
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (saving || loading) return;

    setBusy(false, true);

    try {
      const payload = await fetchJson('/api/admin/settings/notifications', {
        method: 'PATCH',
        body: JSON.stringify(collectPreferences())
      });
      applyPreferences(payload.data);
      window.ResQMeshAdminNotifications?.applyPreferences?.(payload.data);
      showToast(payload.message || 'Notification settings saved.', 'success');
    } catch (error) {
      showToast(error.message || 'Unable to save notification settings.', 'warning');
    } finally {
      setBusy(false);
    }
  });

  soundEnabledInput.addEventListener('change', syncSoundControls);
  volumeInput.addEventListener('input', syncSoundControls);
  testSoundButton.addEventListener('click', () => {
    window.ResQMeshAdminNotifications?.playTestSound?.(Number.parseInt(volumeInput.value, 10));
  });
  testDistressSoundButton.addEventListener('click', () => {
    window.ResQMeshAdminNotifications?.playTestDistressSound?.(Number.parseInt(volumeInput.value, 10));
  });

  void loadSettings();
}());
