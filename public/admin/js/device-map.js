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
    state.onlineDistressLayer = L.layerGroup().addTo(state.map);
    state.sharedRescuersLayer = L.layerGroup().addTo(state.map);
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
    const latestHealth = device.latestHealth || null;
    const healthDetails = latestHealth ? `
      <div class="device-map-popup-health">
        <strong>Latest Health</strong>
        <div class="device-map-popup-row"><span>Battery</span><strong>${helpers.escapeHtml(helpers.formatPercent(latestHealth.batteryPercent))}</strong></div>
        <div class="device-map-popup-row"><span>Voltage</span><strong>${helpers.escapeHtml(latestHealth.batteryVoltage != null ? `${Number(latestHealth.batteryVoltage).toFixed(2)}V` : 'Not available')}</strong></div>
        <div class="device-map-popup-row"><span>GPS</span><strong>${helpers.escapeHtml(latestHealth.gpsStatus || 'unknown')}</strong></div>
        <div class="device-map-popup-row"><span>CPU</span><strong>${helpers.escapeHtml(helpers.formatTemperature(latestHealth.cpuTemp))}</strong></div>
        <div class="device-map-popup-row"><span>RAM</span><strong>${helpers.escapeHtml(helpers.formatPercent(latestHealth.ramUsage))}</strong></div>
        <div class="device-map-popup-row"><span>Storage</span><strong>${helpers.escapeHtml(helpers.formatStorageRemaining(latestHealth.storageRemaining))}</strong></div>
        <div class="device-map-popup-row"><span>Recorded</span><strong>${helpers.escapeHtml(helpers.formatRelativeTime(latestHealth.recordedAt))}</strong></div>
      </div>
    ` : '';
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
          <div class="device-map-popup-row"><span>Pending commands</span><strong>${helpers.escapeHtml(device.pendingCommandCount || 0)}</strong></div>
          <div class="device-map-popup-row"><span>Battery</span><strong>${helpers.escapeHtml(helpers.formatPercent(device.batteryPercent))}</strong></div>
          <div class="device-map-popup-row device-map-popup-row-signal"><span>Signal</span>${helpers.signalDotsMarkup(device.signalStrengthDbm, device.signalQualityLabel)}</div>
          <div class="device-map-popup-row"><span>Coordinates</span><strong>${helpers.escapeHtml(`${helpers.formatCoordinate(device.latitude)}, ${helpers.formatCoordinate(device.longitude)}`)}</strong></div>
        </div>
        ${healthDetails}
        ${distressDetails}
      </div>
    `;
  }

  function routePopupMarkup(route) {
    const sourceLabel = route.sourceLabel || (route.distressSource === 'online' ? 'ONLINE' : 'MESH');
    const routeStatus = route.routeStatus === 'ready'
      ? 'Route Ready'
      : (route.routeMessage || 'Route Calculating');

    return `
      <div class="device-map-popup-card device-map-route-popup-card">
        <div>
          <h3>${helpers.escapeHtml(route.teamName || route.teamCode || route.deploymentCode)}</h3>
          <p class="device-map-popup-subtitle">${helpers.escapeHtml(route.deploymentCode)}</p>
        </div>
        <div class="device-map-popup-pills">
          <span class="device-map-popup-pill" data-status="route">Active team route</span>
          <span class="device-map-popup-pill" data-status="${helpers.escapeHtml(route.distressSource === 'online' ? 'online' : 'distressed')}">${helpers.escapeHtml(sourceLabel)}</span>
          <span class="device-map-popup-pill" data-status="distressed">${helpers.escapeHtml(route.distressCode)}</span>
        </div>
        <div class="device-map-popup-meta">
          <div class="device-map-popup-row"><span>Team</span><strong>${helpers.escapeHtml(route.teamName || 'Unknown team')}</strong></div>
          <div class="device-map-popup-row"><span>Leader</span><strong>${helpers.escapeHtml(route.teamLeaderName || 'Unknown leader')}</strong></div>
          <div class="device-map-popup-row"><span>Source</span><strong>${helpers.escapeHtml(route.distressSource === 'online' ? 'Online distress signal' : (route.originNodeName || 'Mesh distress signal'))}</strong></div>
          <div class="device-map-popup-row"><span>Distress</span><strong>${helpers.escapeHtml(helpers.formatDistressReason(route.distressReason))}</strong></div>
          <div class="device-map-popup-row"><span>Status</span><strong>${helpers.escapeHtml(routeStatus)}</strong></div>
          <div class="device-map-popup-row"><span>ETA</span><strong>${helpers.escapeHtml(route.etaMinutes != null ? `${route.etaMinutes} min` : 'Not available')}</strong></div>
          <div class="device-map-popup-row"><span>Distance</span><strong>${helpers.escapeHtml(helpers.formatDistance(route.distanceM))}</strong></div>
          <div class="device-map-popup-row"><span>Updated</span><strong>${helpers.escapeHtml(helpers.formatRelativeTime(route.routeUpdatedAt))}</strong></div>
        </div>
      </div>
    `;
  }

  function distressCivilianPopupMarkup(distress, extra = {}) {
    const deploymentText = extra.deploymentCode
      ? `${extra.deploymentCode}${extra.teamName ? ` · ${extra.teamName}` : ''}`
      : (extra.isDeployed ? 'Team deployed' : 'Awaiting deployment');

    return `
      <div class="device-map-popup-card device-map-distress-popup-card">
        <div>
          <h3>${helpers.escapeHtml(distress.distressCode || 'Distress signal')}</h3>
          <p class="device-map-popup-subtitle">${helpers.escapeHtml(distress.sourceLabel || 'ONLINE')}</p>
        </div>
        <div class="device-map-popup-pills">
          <span class="device-map-popup-pill" data-status="online">Online distress</span>
          <span class="device-map-popup-pill" data-status="${extra.isDeployed ? 'route' : 'distressed'}">${helpers.escapeHtml(extra.isDeployed ? 'Deployed' : 'Active')}</span>
        </div>
        <div class="device-map-popup-distress">
          <strong>Civilian Details</strong>
          <div class="device-map-popup-row"><span>Name</span><strong>${helpers.escapeHtml(distress.civilianName || 'Unknown civilian')}</strong></div>
          <div class="device-map-popup-row"><span>User code</span><strong>${helpers.escapeHtml(distress.userCode || 'Not available')}</strong></div>
          <div class="device-map-popup-row"><span>Phone</span><strong>${helpers.escapeHtml(distress.phone || distress.civilianPhone || 'Not available')}</strong></div>
          <div class="device-map-popup-row"><span>Reason</span><strong>${helpers.escapeHtml(helpers.formatDistressReason(distress.reason || distress.distressReason))}</strong></div>
          <div class="device-map-popup-row"><span>Reported</span><strong>${helpers.escapeHtml(helpers.formatRelativeTime(distress.recordedAt || distress.routeUpdatedAt))}</strong></div>
          <div class="device-map-popup-row"><span>Deployment</span><strong>${helpers.escapeHtml(deploymentText)}</strong></div>
        </div>
      </div>
    `;
  }

  function routeDistressPopupMarkup(route) {
    return distressCivilianPopupMarkup({
      distressCode: route.distressCode,
      sourceLabel: route.sourceLabel || (route.distressSource === 'online' ? 'ONLINE' : 'MESH'),
      civilianName: route.civilianName,
      userCode: route.userCode || '',
      civilianPhone: route.civilianPhone,
      distressReason: route.distressReason,
      routeUpdatedAt: route.routeUpdatedAt
    }, {
      isDeployed: true,
      deploymentCode: route.deploymentCode,
      teamName: route.teamName
    });
  }

  function sharedRescuerPopupMarkup(rescuer) {
    return `
      <div class="device-map-popup-card device-map-shared-rescuer-popup-card">
        <div>
          <h3>${helpers.escapeHtml(rescuer.firstName || 'Rescuer')}</h3>
          <p class="device-map-popup-subtitle">${helpers.escapeHtml(rescuer.department || 'Rescue Department')}</p>
        </div>
        <div class="device-map-popup-pills">
          <span class="device-map-popup-pill" data-status="shared-rescuer">Sharing location</span>
        </div>
        <div class="device-map-popup-meta">
          <div class="device-map-popup-row"><span>Phone</span><strong>${helpers.escapeHtml(rescuer.phone || 'Not available')}</strong></div>
          <div class="device-map-popup-row"><span>Team</span><strong>${helpers.escapeHtml(rescuer.teamName || rescuer.teamCode || 'Not assigned')}</strong></div>
          <div class="device-map-popup-row"><span>Last updated</span><strong>${helpers.escapeHtml(helpers.formatRelativeTime(rescuer.lastUpdated))}</strong></div>
          <div class="device-map-popup-row"><span>Coordinates</span><strong>${helpers.escapeHtml(`${helpers.formatCoordinate(rescuer.latitude)}, ${helpers.formatCoordinate(rescuer.longitude)}`)}</strong></div>
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

    const visibleIds = new Set(devices.map((device) => String(device.nodeId || device.id)));
    const realLinks = state.meshLinks.filter((link) =>
      visibleIds.has(String(link.reportingNodeId)) && visibleIds.has(String(link.neighborNodeId))
    );

    if (realLinks.length) {
      realLinks.forEach((link) => {
        L.polyline([
          [Number(link.sourceLatitude), Number(link.sourceLongitude)],
          [Number(link.targetLatitude), Number(link.targetLongitude)]
        ], {
          className: 'device-map-link',
          color: '#e74b32',
          weight: 3,
          opacity: 0.56,
          dashArray: '8 7',
          lineCap: 'round'
        }).bindPopup(`
          <div class="device-map-popup-card">
            <h3>Mesh Link</h3>
            <div class="device-map-popup-meta">
              <div class="device-map-popup-row"><span>From</span><strong>${helpers.escapeHtml(link.sourceNodeName || link.reportingNodeId)}</strong></div>
              <div class="device-map-popup-row"><span>To</span><strong>${helpers.escapeHtml(link.targetNodeName || link.neighborNodeId)}</strong></div>
              <div class="device-map-popup-row"><span>RSSI</span><strong>${helpers.escapeHtml(link.rssi != null ? `${link.rssi} dBm` : 'Not available')}</strong></div>
              <div class="device-map-popup-row"><span>Last seen</span><strong>${helpers.escapeHtml(helpers.formatRelativeTime(link.lastSeenAt))}</strong></div>
            </div>
          </div>
        `, { className: 'device-map-popup' }).addTo(state.connectionsLayer);
      });
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

  function numericLatLng(latitudeValue, longitudeValue) {
    const latitude = Number(latitudeValue);
    const longitude = Number(longitudeValue);

    return Number.isFinite(latitude) && Number.isFinite(longitude) && latitude !== 0 && longitude !== 0
      ? [latitude, longitude]
      : null;
  }

  function coordinateLatLng(coordinate) {
    if (!Array.isArray(coordinate) || coordinate.length < 2) {
      return null;
    }

    return numericLatLng(coordinate[1], coordinate[0]);
  }

  function routeMarkerLatLng(route) {
    const firstCoordinate = Array.isArray(route.coordinates) ? route.coordinates[0] : null;
    const routeStartLatLng = coordinateLatLng(firstCoordinate);

    return routeStartLatLng || numericLatLng(route.leaderLatitude, route.leaderLongitude);
  }

  function routeDistressLatLng(route) {
    return numericLatLng(route.distressLatitude, route.distressLongitude);
  }

  function routeBoundsLatLngs(route) {
    const bounds = [];
    const leaderLatLng = routeMarkerLatLng(route);
    const distressLatLng = routeDistressLatLng(route);

    if (leaderLatLng) {
      bounds.push(leaderLatLng);
    }

    if (distressLatLng) {
      bounds.push(distressLatLng);
    }

    if (Array.isArray(route.coordinates)) {
      route.coordinates.forEach((coordinate) => {
        const latLng = coordinateLatLng(coordinate);

        if (latLng) {
          bounds.push(latLng);
        }
      });
    }

    return bounds;
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

    if (!state.routes.some((route) => route.deploymentId === state.selectedRouteDeploymentId)) {
      state.selectedRouteDeploymentId = null;
    }

    state.routes.forEach((route) => {
      const isSelected = state.selectedRouteDeploymentId === route.deploymentId;

      if (hasRenderableRoute(route)) {
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
      }

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

      if (route.distressSource === 'online') {
        const distressLatLng = routeDistressLatLng(route);

        if (distressLatLng) {
          const distressMarker = L.marker(distressLatLng, {
            zIndexOffset: 320,
            icon: L.divIcon({
              className: 'device-map-online-distress-marker-icon',
              html: `<div class="device-map-online-distress-marker${isSelected ? ' is-selected' : ''}"></div>`,
              iconSize: [30, 30],
              iconAnchor: [15, 15],
              popupAnchor: [0, -14]
            })
          }).bindPopup(routeDistressPopupMarkup(route), {
            className: 'device-map-popup device-map-route-popup'
          });

          distressMarker.on('click', (event) => {
            state.selectedRouteDeploymentId = route.deploymentId;
            renderMap({ preserveViewport: true });
            openRoutePopupAfterRender(route, event.latlng, 'distress-marker');
          });

          distressMarker.__routeDeploymentId = route.deploymentId;
          distressMarker.__routeLayerType = 'distress-marker';
          distressMarker.addTo(state.routesLayer);
        }
      }
    });
  }

  function renderOnlineDistressMarkers() {
    if (!state.onlineDistressLayer) {
      return;
    }

    state.onlineDistressLayer.clearLayers();

    const routeDistressIds = new Set(
      state.routes
        .filter((route) => route.distressSource === 'online')
        .map((route) => String(route.distressId))
    );

    state.onlineDistress
      .filter((distress) => !routeDistressIds.has(String(distress.id)))
      .forEach((distress) => {
        const latLng = numericLatLng(distress.latitude, distress.longitude);
        if (!latLng) return;

        L.marker(latLng, {
          zIndexOffset: 300,
          icon: L.divIcon({
            className: 'device-map-online-distress-marker-icon',
            html: '<div class="device-map-online-distress-marker"></div>',
            iconSize: [30, 30],
            iconAnchor: [15, 15],
            popupAnchor: [0, -14]
          })
        }).bindPopup(distressCivilianPopupMarkup(distress, {
          isDeployed: distress.isDeployed,
          deploymentCode: distress.deploymentCode,
          teamName: distress.teamName
        }), {
          className: 'device-map-popup device-map-route-popup'
        }).addTo(state.onlineDistressLayer);
      });
  }

  function renderSharedRescuerMarkers() {
    if (!state.sharedRescuersLayer) {
      return;
    }

    state.sharedRescuersLayer.clearLayers();

    state.sharedRescuers.forEach((rescuer) => {
      const latLng = numericLatLng(rescuer.latitude, rescuer.longitude);
      if (!latLng) return;

      L.marker(latLng, {
        zIndexOffset: 280,
        icon: L.divIcon({
          className: 'device-map-shared-rescuer-marker-icon',
          html: '<div class="device-map-shared-rescuer-marker"></div>',
          iconSize: [30, 30],
          iconAnchor: [15, 15],
          popupAnchor: [0, -14]
        })
      }).bindPopup(sharedRescuerPopupMarkup(rescuer), {
        className: 'device-map-popup'
      }).addTo(state.sharedRescuersLayer);
    });
  }

  function renderMap(options = {}) {
    const { preserveViewport = false } = options;

    initializeMap();

    if (
      !state.map
      || !state.markersLayer
      || !state.connectionsLayer
      || !state.routesLayer
      || !state.onlineDistressLayer
      || !state.sharedRescuersLayer
    ) {
      return;
    }

    state.connectionsLayer.clearLayers();
    state.routesLayer.clearLayers();
    state.onlineDistressLayer.clearLayers();
    state.sharedRescuersLayer.clearLayers();
    state.markersLayer.clearLayers();

    const visibleDevices = state.filteredDevices.filter(hasValidCoordinates);
    const unavailableDevices = state.filteredDevices.filter((device) => !hasValidCoordinates(device));
    const hasOverlayContent = state.routes.length > 0 || state.onlineDistress.length > 0 || state.sharedRescuers.length > 0;

    renderUnavailableList(unavailableDevices);

    setMapEmptyState(visibleDevices.length === 0 && !hasOverlayContent, 'No map markers with valid coordinates are available right now.');

    const bounds = [];

    renderConnections(visibleDevices);
    renderRoutes();
    renderOnlineDistressMarkers();
    renderSharedRescuerMarkers();

    visibleDevices.forEach((device) => {
      const marker = createMarker(device);
      marker.addTo(state.markersLayer);
      bounds.push([Number(device.latitude), Number(device.longitude)]);
    });

    state.routes.forEach((route) => {
      routeBoundsLatLngs(route).forEach((latLng) => {
        bounds.push(latLng);
      });
    });

    state.onlineDistress.forEach((distress) => {
      const latLng = numericLatLng(distress.latitude, distress.longitude);
      if (latLng) bounds.push(latLng);
    });

    state.sharedRescuers.forEach((rescuer) => {
      const latLng = numericLatLng(rescuer.latitude, rescuer.longitude);
      if (latLng) bounds.push(latLng);
    });

    if (!bounds.length) {
      setTimeout(() => state.map?.invalidateSize?.(), 0);
      return;
    }

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
      const [
        devicesResult,
        routesResult,
        onlineDistressResult,
        sharedRescuersResult,
        linksResult
      ] = await Promise.allSettled([
        helpers.requestJson('/api/admin/devices/map'),
        helpers.requestJson('/api/admin/device-map/routes'),
        helpers.requestJson('/api/admin/device-map/online-distress'),
        helpers.requestJson('/api/admin/device-map/shared-rescuers'),
        helpers.requestJson('/api/admin/device-map/links')
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

      if (onlineDistressResult.status === 'fulfilled') {
        state.onlineDistress = Array.isArray(onlineDistressResult.value.data) ? onlineDistressResult.value.data : [];
      } else if (!background || state.onlineDistress.length === 0) {
        state.onlineDistress = [];
      }

      if (sharedRescuersResult.status === 'fulfilled') {
        state.sharedRescuers = Array.isArray(sharedRescuersResult.value.data) ? sharedRescuersResult.value.data : [];
      } else if (!background || state.sharedRescuers.length === 0) {
        state.sharedRescuers = [];
      }

      if (linksResult.status === 'fulfilled') {
        state.meshLinks = Array.isArray(linksResult.value.data) ? linksResult.value.data : [];
      } else if (!background || state.meshLinks.length === 0) {
        state.meshLinks = [];
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
