(function initDeviceMap() {
  const context = window.ResQMeshDeviceMap.createContext();
  const { dom, state, helpers, ui } = context;

  window.ResQMeshDeviceManagerView.init(context);

  function initializeMap() {
    if (!dom.deviceMapCanvas || state.map) {
      return;
    }

    state.map = L.map(dom.deviceMapCanvas, {
      zoomControl: true,
      attributionControl: true
    }).setView([7.9067, 125.0948], 13);

    state.tileLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    });
    state.tileLayer.addTo(state.map);
    state.connectionsLayer = L.layerGroup().addTo(state.map);
    state.markersLayer = L.layerGroup().addTo(state.map);
  }

  function deriveMapStatus(device) {
    if (device.hasActiveDistress) {
      return 'distressed';
    }

    if (device.connectivityStatus === 'online') {
      return 'active';
    }

    if (device.connectivityStatus === 'stale') {
      return 'stale';
    }

    return 'offline';
  }

  function deriveMapStatusLabel(status) {
    if (status === 'distressed') return 'Distressed';
    if (status === 'active') return 'Active';
    if (status === 'stale') return 'Stale';
    return 'Offline';
  }

  function hasValidCoordinates(device) {
    const latitude = Number(device.latitude);
    const longitude = Number(device.longitude);

    return Number.isFinite(latitude) && Number.isFinite(longitude) && latitude !== 0 && longitude !== 0;
  }

  function getDeviceSearchText(device) {
    return [
      device.nodeId,
      device.nodeName,
      deriveMapStatus(device),
      deriveMapStatusLabel(deriveMapStatus(device)),
      device.connectivityStatus,
      device.deviceStatus
    ].join(' ').toLowerCase();
  }

  function renderUnavailableList(devices) {
    if (!dom.deviceMapUnavailableList || !dom.deviceMapUnavailableCount) {
      return;
    }

    dom.deviceMapUnavailableCount.textContent = String(devices.length);

    if (!devices.length) {
      dom.deviceMapUnavailableList.innerHTML = '<div class="device-map-unavailable-empty">Every visible mesh node currently has valid coordinates.</div>';
      return;
    }

    dom.deviceMapUnavailableList.innerHTML = devices.map((device) => `
      <div class="device-map-unavailable-item">
        <strong>${helpers.escapeHtml(device.nodeName || device.nodeId)}</strong>
        <span>${helpers.escapeHtml(device.nodeId)} · Location unavailable</span>
      </div>
    `).join('');
  }

  function setMapEmptyState(isVisible, message) {
    if (!dom.deviceMapEmpty) {
      return;
    }

    dom.deviceMapEmpty.hidden = !isVisible;
    dom.deviceMapEmpty.style.display = isVisible ? 'flex' : 'none';

    if (message) {
      dom.deviceMapEmpty.textContent = message;
    }
  }

  function popupMarkup(device, status) {
    const distressBadge = device.hasActiveDistress
      ? `<span class="device-map-popup-pill" data-status="distressed">Distress ${helpers.escapeHtml(device.activeDistressCount)}</span>`
      : '';
    const accessBadge = device.deviceStatus === 'revoked'
      ? `<span class="device-map-popup-pill" data-status="revoked">${helpers.escapeHtml(device.deviceStatusLabel)}</span>`
      : '';

    return `
      <div class="device-map-popup-card">
        <div>
          <h3>${helpers.escapeHtml(device.nodeName || device.nodeId)}</h3>
          <p class="device-map-popup-subtitle">${helpers.escapeHtml(device.nodeId)}</p>
        </div>
        <div class="device-map-popup-pills">
          <span class="device-map-popup-pill" data-status="${helpers.escapeHtml(status)}">${helpers.escapeHtml(deriveMapStatusLabel(status))}</span>
          ${accessBadge}
          ${distressBadge}
        </div>
        <div class="device-map-popup-meta">
          <div class="device-map-popup-row"><span>Last seen</span><strong>${helpers.escapeHtml(helpers.formatRelativeTime(device.lastSeenAt))}</strong></div>
          <div class="device-map-popup-row"><span>Last sync</span><strong>${helpers.escapeHtml(helpers.formatRelativeTime(device.lastSyncAt))}</strong></div>
          <div class="device-map-popup-row"><span>Users connected</span><strong>${helpers.escapeHtml(device.usersConnected)}</strong></div>
          <div class="device-map-popup-row"><span>Coordinates</span><strong>${helpers.escapeHtml(`${helpers.formatCoordinate(device.latitude)}, ${helpers.formatCoordinate(device.longitude)}`)}</strong></div>
        </div>
      </div>
    `;
  }

  function createMarker(device) {
    const status = deriveMapStatus(device);
    const distressedClass = device.hasActiveDistress ? ' is-flashing' : '';
    const icon = L.divIcon({
      className: 'device-map-marker-icon',
      html: `
        <div class="device-map-marker${distressedClass}" data-status="${helpers.escapeHtml(status)}">
          ${device.hasActiveDistress ? `<span class="device-map-marker-badge">${helpers.escapeHtml(device.activeDistressCount)}</span>` : ''}
        </div>
      `,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
      popupAnchor: [0, -12]
    });

    return L.marker([Number(device.latitude), Number(device.longitude)], { icon })
      .bindPopup(popupMarkup(device, status), {
        className: 'device-map-popup'
      });
  }

  function calculateDistance(a, b) {
    const latA = Number(a.latitude);
    const lngA = Number(a.longitude);
    const latB = Number(b.latitude);
    const lngB = Number(b.longitude);

    return ((latA - latB) ** 2) + ((lngA - lngB) ** 2);
  }

  function buildConnectionPairs(devices) {
    const links = new Map();

    devices.forEach((device) => {
      const nearestDevices = devices
        .filter((candidate) => candidate.id !== device.id)
        .sort((left, right) => calculateDistance(device, left) - calculateDistance(device, right))
        .slice(0, 2);

      nearestDevices.forEach((candidate) => {
        const [startId, endId] = [String(device.id), String(candidate.id)].sort();
        const key = `${startId}:${endId}`;

        if (!links.has(key)) {
          links.set(key, [device, candidate]);
        }
      });
    });

    return Array.from(links.values());
  }

  function renderConnections(devices) {
    if (!state.connectionsLayer) {
      return;
    }

    state.connectionsLayer.clearLayers();

    if (devices.length < 2) {
      return;
    }

    buildConnectionPairs(devices).forEach(([firstDevice, secondDevice]) => {
      const isDistressed = firstDevice.hasActiveDistress || secondDevice.hasActiveDistress;
      const lineClassName = isDistressed ? 'device-map-link is-distressed' : 'device-map-link';

      L.polyline([
        [Number(firstDevice.latitude), Number(firstDevice.longitude)],
        [Number(secondDevice.latitude), Number(secondDevice.longitude)]
      ], {
        className: lineClassName,
        color: isDistressed ? '#b22929' : '#e74b32',
        weight: isDistressed ? 4 : 3,
        opacity: isDistressed ? 0.72 : 0.48,
        dashArray: isDistressed ? '5 7' : '10 8',
        lineCap: 'round'
      }).addTo(state.connectionsLayer);
    });
  }

  function applyFilters() {
    state.filteredDevices = state.devices.slice();

    renderMap();
  }

  function renderMap() {
    initializeMap();

    if (!state.map || !state.markersLayer || !state.connectionsLayer) {
      return;
    }

    state.connectionsLayer.clearLayers();
    state.markersLayer.clearLayers();

    const visibleDevices = state.filteredDevices.filter(hasValidCoordinates);
    const unavailableDevices = state.filteredDevices.filter((device) => !hasValidCoordinates(device));

    renderUnavailableList(unavailableDevices);

    setMapEmptyState(visibleDevices.length === 0, 'No mesh nodes with valid coordinates are available right now.');

    if (!visibleDevices.length) {
      setTimeout(() => state.map?.invalidateSize?.(), 0);
      return;
    }

    const bounds = [];

    renderConnections(visibleDevices);

    visibleDevices.forEach((device) => {
      const marker = createMarker(device);
      marker.addTo(state.markersLayer);
      bounds.push([Number(device.latitude), Number(device.longitude)]);
    });

    if (bounds.length === 1) {
      state.map.setView(bounds[0], 15);
      return;
    }

    state.map.fitBounds(bounds, {
      padding: [36, 36],
      maxZoom: 15
    });

    setTimeout(() => state.map?.invalidateSize?.(), 0);
  }

  async function loadMapDevices() {
    state.loading = true;
    renderMap();

    try {
      const payload = await helpers.requestJson('/api/admin/devices/map');
      state.devices = Array.isArray(payload.data) ? payload.data : [];
      ui.setFeedback('');
      applyFilters();
    } catch (error) {
      state.devices = [];
      state.filteredDevices = [];
      renderUnavailableList([]);
      setMapEmptyState(true, 'Unable to load mesh node locations right now.');
      ui.setFeedback(error.message || 'Unable to load mesh node map data.', 'error');
    } finally {
      state.loading = false;
    }
  }

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && dom.deviceViewModal?.classList.contains('is-open')) {
      ui.closeDeviceViewModal();
    }
  });

  loadMapDevices();
}());
