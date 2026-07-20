(function initDeviceMap() {
  const context = window.ResQMeshDeviceMap.createContext();
  const { dom, state, helpers, ui, constants } = context;
  let mapRequestInFlight = false;

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
    state.routesLayer = L.layerGroup().addTo(state.map);
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
    const accessBadge = device.deviceStatus === 'revoked'
      ? `<span class="device-map-popup-pill" data-status="revoked">${helpers.escapeHtml(device.deviceStatusLabel)}</span>`
      : '';
    const activeDistress = device.activeDistress || null;
    const distressDetails = device.hasActiveDistress && activeDistress ? `
      <div class="device-map-popup-distress">
        <strong>Active Distress</strong>
        <div class="device-map-popup-row"><span>Activated by</span><strong>${helpers.escapeHtml(activeDistress.fullName || activeDistress.userCode || 'Unknown user')}</strong></div>
        <div class="device-map-popup-row"><span>User code</span><strong>${helpers.escapeHtml(activeDistress.userCode || 'Not available')}</strong></div>
        <div class="device-map-popup-row"><span>Reason</span><strong>${helpers.escapeHtml(helpers.formatDistressReason(activeDistress.reason))}</strong></div>
        <div class="device-map-popup-row"><span>Triggered</span><strong>${helpers.escapeHtml(activeDistress.timestamp ? helpers.formatRelativeTime(activeDistress.timestamp) : 'Not available')}</strong></div>
      </div>
    ` : '';

    return `
      <div class="device-map-popup-card">
        <div>
          <h3>${helpers.escapeHtml(device.nodeName || device.nodeId)}</h3>
          <p class="device-map-popup-subtitle">${helpers.escapeHtml(device.nodeId)}</p>
        </div>
        <div class="device-map-popup-pills">
          <span class="device-map-popup-pill" data-status="${helpers.escapeHtml(status)}">${helpers.escapeHtml(deriveMapStatusLabel(status))}</span>
          ${accessBadge}
        </div>
        <div class="device-map-popup-meta">
          <div class="device-map-popup-row"><span>Last seen</span><strong>${helpers.escapeHtml(helpers.formatRelativeTime(device.lastSeenAt))}</strong></div>
          <div class="device-map-popup-row"><span>Last sync</span><strong>${helpers.escapeHtml(helpers.formatRelativeTime(device.lastSyncAt))}</strong></div>
          <div class="device-map-popup-row"><span>Users connected</span><strong>${helpers.escapeHtml(device.usersConnected)}</strong></div>
          <div class="device-map-popup-row device-map-popup-row-signal"><span>Signal</span>${helpers.signalDotsMarkup(device.signalStrengthDbm, device.signalQualityLabel)}</div>
          <div class="device-map-popup-row"><span>Coordinates</span><strong>${helpers.escapeHtml(`${helpers.formatCoordinate(device.latitude)}, ${helpers.formatCoordinate(device.longitude)}`)}</strong></div>
        </div>
        ${distressDetails}
      </div>
    `;
  }

  function routePopupMarkup(route) {
    return `
      <div class="device-map-popup-card device-map-route-popup-card">
        <div>
          <h3>${helpers.escapeHtml(route.teamName || route.teamCode || route.deploymentCode)}</h3>
          <p class="device-map-popup-subtitle">${helpers.escapeHtml(route.deploymentCode)}</p>
        </div>
        <div class="device-map-popup-pills">
          <span class="device-map-popup-pill" data-status="route">Active team route</span>
          <span class="device-map-popup-pill" data-status="distressed">${helpers.escapeHtml(route.distressCode)}</span>
        </div>
        <div class="device-map-popup-meta">
          <div class="device-map-popup-row"><span>Team</span><strong>${helpers.escapeHtml(route.teamName || 'Unknown team')}</strong></div>
          <div class="device-map-popup-row"><span>Leader</span><strong>${helpers.escapeHtml(route.teamLeaderName || 'Unknown leader')}</strong></div>
          <div class="device-map-popup-row"><span>Distress</span><strong>${helpers.escapeHtml(helpers.formatDistressReason(route.distressReason))}</strong></div>
          <div class="device-map-popup-row"><span>ETA</span><strong>${helpers.escapeHtml(route.etaMinutes != null ? `${route.etaMinutes} min` : 'Not available')}</strong></div>
          <div class="device-map-popup-row"><span>Distance</span><strong>${helpers.escapeHtml(helpers.formatDistance(route.distanceM))}</strong></div>
          <div class="device-map-popup-row"><span>Updated</span><strong>${helpers.escapeHtml(helpers.formatRelativeTime(route.routeUpdatedAt))}</strong></div>
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

  function hasRenderableRoute(route) {
    return Array.isArray(route.coordinates) && route.coordinates.length >= 2;
  }

  function routeMarkerLatLng(route) {
    const firstCoordinate = Array.isArray(route.coordinates) ? route.coordinates[0] : null;

    if (!Array.isArray(firstCoordinate) || firstCoordinate.length < 2) {
      return null;
    }

    const longitude = Number(firstCoordinate[0]);
    const latitude = Number(firstCoordinate[1]);

    return Number.isFinite(latitude) && Number.isFinite(longitude) ? [latitude, longitude] : null;
  }

  function openRoutePopupAfterRender(route, latlng, layerType = 'polyline') {
    window.setTimeout(() => {
      state.routesLayer?.eachLayer((layer) => {
        if (layer.__routeDeploymentId === route.deploymentId && layer.__routeLayerType === layerType) {
          layer.openPopup(latlng);
        }
      });
    }, 0);
  }

  function renderRoutes() {
    if (!state.routesLayer) {
      return;
    }

    state.routesLayer.clearLayers();

    const visibleRoutes = state.routes.filter(hasRenderableRoute);

    if (!visibleRoutes.some((route) => route.deploymentId === state.selectedRouteDeploymentId)) {
      state.selectedRouteDeploymentId = null;
    }

    visibleRoutes.forEach((route) => {
      const isSelected = state.selectedRouteDeploymentId === route.deploymentId;
      const polyline = L.polyline(
        route.coordinates.map((coordinate) => [Number(coordinate[1]), Number(coordinate[0])]),
        {
          className: `device-map-route${isSelected ? ' is-selected' : ''}`,
          color: isSelected ? '#c93f29' : '#f26441',
          weight: isSelected ? 6 : 4,
          opacity: isSelected ? 0.94 : 0.66,
          lineCap: 'round',
          lineJoin: 'round'
        }
      ).bindPopup(routePopupMarkup(route), {
        className: 'device-map-popup device-map-route-popup'
      });

      polyline.on('click', (event) => {
        state.selectedRouteDeploymentId = route.deploymentId;
        renderMap({ preserveViewport: true });
        openRoutePopupAfterRender(route, event.latlng, 'polyline');
      });

      polyline.__routeDeploymentId = route.deploymentId;
      polyline.__routeLayerType = 'polyline';
      polyline.addTo(state.routesLayer);

      const markerLatLng = routeMarkerLatLng(route);

      if (markerLatLng) {
        const marker = L.marker(markerLatLng, {
          zIndexOffset: 350,
          icon: L.divIcon({
            className: 'device-map-route-team-marker-icon',
            html: `<div class="device-map-route-team-marker${isSelected ? ' is-selected' : ''}"></div>`,
            iconSize: [34, 34],
            iconAnchor: [17, 17],
            popupAnchor: [0, -16]
          })
        }).bindPopup(routePopupMarkup(route), {
          className: 'device-map-popup device-map-route-popup'
        });

        marker.on('click', (event) => {
          state.selectedRouteDeploymentId = route.deploymentId;
          renderMap({ preserveViewport: true });
          openRoutePopupAfterRender(route, event.latlng, 'marker');
        });

        marker.__routeDeploymentId = route.deploymentId;
        marker.__routeLayerType = 'marker';
        marker.addTo(state.routesLayer);
      }
    });
  }

  function renderMap(options = {}) {
    const { preserveViewport = false } = options;

    initializeMap();

    if (!state.map || !state.markersLayer || !state.connectionsLayer || !state.routesLayer) {
      return;
    }

    state.connectionsLayer.clearLayers();
    state.routesLayer.clearLayers();
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
    renderRoutes();

    visibleDevices.forEach((device) => {
      const marker = createMarker(device);
      marker.addTo(state.markersLayer);
      bounds.push([Number(device.latitude), Number(device.longitude)]);
    });

    if (preserveViewport || state.hasInitializedViewport) {
      setTimeout(() => state.map?.invalidateSize?.(), 0);
      return;
    }

    if (bounds.length === 1) {
      state.map.setView(bounds[0], 15);
      state.hasInitializedViewport = true;
      return;
    }

    state.map.fitBounds(bounds, {
      padding: [36, 36],
      maxZoom: 15
    });
    state.hasInitializedViewport = true;

    setTimeout(() => state.map?.invalidateSize?.(), 0);
  }

  async function loadMapDevices(options = {}) {
    const { background = false } = options;

    if (mapRequestInFlight) {
      return false;
    }

    mapRequestInFlight = true;

    if (!background) {
      state.loading = true;
      renderMap();
    }

    try {
      const [devicesResult, routesResult] = await Promise.allSettled([
        helpers.requestJson('/api/admin/devices/map'),
        helpers.requestJson('/api/admin/device-map/routes')
      ]);

      if (devicesResult.status !== 'fulfilled') {
        throw devicesResult.reason;
      }

      state.devices = Array.isArray(devicesResult.value.data) ? devicesResult.value.data : [];

      if (routesResult.status === 'fulfilled') {
        state.routes = Array.isArray(routesResult.value.data) ? routesResult.value.data : [];
      } else if (!background || state.routes.length === 0) {
        state.routes = [];
      }

      ui.setFeedback('');
      applyFilters();
      return true;
    } catch (error) {
      if (!background || state.devices.length === 0) {
        state.devices = [];
        state.filteredDevices = [];
        renderUnavailableList([]);
        setMapEmptyState(true, 'Unable to load mesh node locations right now.');
        ui.setFeedback(error.message || 'Unable to load mesh node map data.', 'error');
      }

      return false;
    } finally {
      mapRequestInFlight = false;

      if (!background) {
        state.loading = false;
      }
    }
  }

  function applyFilters() {
    state.filteredDevices = state.devices.slice();

    renderMap({
      preserveViewport: state.hasInitializedViewport
    });
  }

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && dom.deviceViewModal?.classList.contains('is-open')) {
      ui.closeDeviceViewModal();
    }
  });

  function refreshNow() {
    loadMapDevices({ background: true }).catch(() => {
      // Keep the current map state visible during transient polling failures.
    });
  }

  function stopLiveRefresh() {
    if (state.liveRefreshIntervalId) {
      window.clearInterval(state.liveRefreshIntervalId);
      state.liveRefreshIntervalId = null;
    }
  }

  window.addEventListener('focus', refreshNow);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      refreshNow();
    }
  });
  window.addEventListener('beforeunload', stopLiveRefresh);

  loadMapDevices();
  state.liveRefreshIntervalId = window.setInterval(() => {
    if (!document.hidden) {
      refreshNow();
    }
  }, constants.LIVE_REFRESH_INTERVAL_MS);
}());
