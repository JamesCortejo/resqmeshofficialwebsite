(function initDeviceMap() {
  const context = window.ResQMeshDeviceMap.createContext();
  const { dom, state, helpers, ui, constants } = context;
  const MAP_PREFERENCES_KEY = 'resqmesh.admin.deviceMap.maptiler.v2';
  const MAP_PREFERENCES_VERSION = 2;
  const DEFAULT_CENTER = [125.0948, 7.9067];
  const DEFAULT_ZOOM = 13;
  const MAX_ZOOM = 19;
  const THREE_D_PITCH = 55;
  const LINKS_SOURCE_ID = 'resqmesh-mesh-links';
  const LINKS_LAYER_ID = 'resqmesh-mesh-links-line';
  const ROUTES_SOURCE_ID = 'resqmesh-rescue-routes';
  const ROUTES_LAYER_ID = 'resqmesh-rescue-routes-line';
  const CUSTOM_BUILDINGS_LAYER_ID = 'resqmesh-3d-buildings';
  const STYLE_DEFINITIONS = Object.freeze({
    streets: { label: 'Streets', resolve: () => maptilersdk.MapStyle.STREETS },
    openstreetmap: { label: 'OpenStreetMap', resolve: () => maptilersdk.MapStyle.OPENSTREETMAP },
    satellite: { label: 'Satellite', resolve: () => maptilersdk.MapStyle.HYBRID },
    topographic: { label: 'Topographic', resolve: () => maptilersdk.MapStyle.TOPO }
  });
  let mapRequestInFlight = false;
  let publicMapConfigPromise = null;
  let mapTilerApiKey = '';
  let mapProviderWarning = '';
  let mapEventsBound = false;
  let currentLinkPopups = new Map();
  let currentRoutesById = new Map();

  window.ResQMeshDeviceManagerView.init(context);

  function createDefaultMapPreferences() {
    return {
      version: MAP_PREFERENCES_VERSION,
      style: 'streets',
      is3D: false
    };
  }

  function loadMapPreferences() {
    const defaults = createDefaultMapPreferences();

    try {
      const parsed = JSON.parse(window.localStorage.getItem(MAP_PREFERENCES_KEY) || 'null');
      const validStyle = typeof parsed?.style === 'string' && Boolean(STYLE_DEFINITIONS[parsed.style]);

      if (parsed?.version !== MAP_PREFERENCES_VERSION || !validStyle || typeof parsed.is3D !== 'boolean') {
        return defaults;
      }

      return {
        version: MAP_PREFERENCES_VERSION,
        style: parsed.style,
        is3D: parsed.is3D
      };
    } catch (error) {
      return defaults;
    }
  }

  function saveMapPreferences() {
    if (!state.layerPreferences) {
      return;
    }

    try {
      window.localStorage.setItem(MAP_PREFERENCES_KEY, JSON.stringify(state.layerPreferences));
    } catch (error) {
      // The map remains usable when browser storage is unavailable.
    }
  }

  function loadPublicMapConfiguration() {
    if (!publicMapConfigPromise) {
      publicMapConfigPromise = fetch('/api/public-config', {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' }
      })
        .then((response) => response.ok ? response.json() : null)
        .then((result) => {
          mapTilerApiKey = result?.success && typeof result.mapTilerApiKey === 'string'
            ? result.mapTilerApiKey.trim()
            : '';

          if (!mapTilerApiKey) {
            state.mapUnavailableReason = 'Map service configuration is unavailable. Device records will continue to refresh.';
          }
        })
        .catch(() => {
          mapTilerApiKey = '';
          state.mapUnavailableReason = 'The map service could not be initialized. Device records will continue to refresh.';
        });
    }

    return publicMapConfigPromise;
  }

  function setMapFeedback(message) {
    mapProviderWarning = message || '';
    ui.setFeedback(mapProviderWarning, mapProviderWarning ? 'warning' : 'error');
  }

  function mountStyleControl() {
    const host = document.getElementById('deviceMapStyleControlHost');
    if (!host) return;

    const container = document.createElement('div');
    const label = document.createElement('label');
    const select = document.createElement('select');

    container.className = 'device-map-style-control';
    label.className = 'device-map-control-label';
    label.textContent = 'Map style';
    label.htmlFor = 'deviceMapStyleSelect';
    select.id = 'deviceMapStyleSelect';
    select.className = 'device-map-style-select';
    select.setAttribute('aria-label', 'Map style');

    Object.entries(STYLE_DEFINITIONS).forEach(([id, definition]) => {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = definition.label;
      select.appendChild(option);
    });

    select.value = state.layerPreferences.style;
    select.addEventListener('change', () => selectMapStyle(select.value));
    container.append(label, select);
    container.addEventListener('mousedown', (event) => event.stopPropagation());
    container.addEventListener('dblclick', (event) => event.stopPropagation());
    state.styleControl = { container, select };
    host.replaceChildren(container);
  }

  function createDimensionControl() {
    return {
      onAdd() {
        const container = document.createElement('div');
        const button = document.createElement('button');

        container.className = 'maplibregl-ctrl maplibregl-ctrl-group device-map-dimension-control';
        button.type = 'button';
        button.className = 'device-map-dimension-button';
        button.addEventListener('click', () => {
          state.layerPreferences.is3D = !state.layerPreferences.is3D;
          saveMapPreferences();
          applyDimensionMode(true);
        });
        container.appendChild(button);
        state.dimensionControl = { container, button };
        syncDimensionControl();
        return container;
      },
      onRemove() {
        state.dimensionControl?.container?.remove();
        state.dimensionControl = null;
      }
    };
  }

  function syncDimensionControl() {
    const button = state.dimensionControl?.button;
    if (!button) return;

    const is3D = Boolean(state.layerPreferences?.is3D);
    button.textContent = is3D ? '2D' : '3D';
    button.setAttribute('aria-pressed', String(is3D));
    button.setAttribute('aria-label', is3D ? 'Switch to two-dimensional map' : 'Switch to three-dimensional buildings');
    button.title = is3D ? 'Switch to 2D' : 'Show 3D buildings';
  }

  function selectMapStyle(styleId) {
    const definition = STYLE_DEFINITIONS[styleId];
    if (!definition || !state.map || styleId === state.layerPreferences.style) {
      return;
    }

    state.layerPreferences.style = styleId;
    state.mapStyleReady = false;
    setMapFeedback('');
    saveMapPreferences();
    state.map.setStyle(definition.resolve());
  }

  function getBuildingExtrusionLayerIds() {
    const layers = state.map?.getStyle()?.layers || [];
    return layers
      .filter((layer) => layer.type === 'fill-extrusion' && (
        layer.id === CUSTOM_BUILDINGS_LAYER_ID
        || /building/i.test(layer.id)
        || /building/i.test(layer['source-layer'] || '')
      ))
      .map((layer) => layer.id);
  }

  function ensureBuildingExtrusionLayer() {
    if (!state.map || state.map.getLayer(CUSTOM_BUILDINGS_LAYER_ID)) {
      return;
    }

    const layers = state.map.getStyle()?.layers || [];
    const hasBuildingExtrusion = layers.some((layer) =>
      layer.type === 'fill-extrusion' && (
        /building/i.test(layer.id)
        || /building/i.test(layer['source-layer'] || '')
      )
    );

    if (hasBuildingExtrusion) {
      return;
    }

    const buildingLayer = layers.find((layer) =>
      layer.type === 'fill' && layer['source-layer'] === 'building' && layer.source
    );
    const vectorSources = state.map.getStyle()?.sources || {};
    const fallbackSourceId = Object.keys(vectorSources).find((sourceId) =>
      vectorSources[sourceId]?.type === 'vector' && /planet|openmaptiles/i.test(sourceId)
    );
    const buildingSourceId = buildingLayer?.source || fallbackSourceId;

    if (!buildingSourceId) {
      return;
    }

    const usesCurrentPlanetSchema = String(buildingSourceId).includes('v4');
    const heightProperty = usesCurrentPlanetSchema ? 'height' : 'render_height';
    const baseProperty = usesCurrentPlanetSchema ? 'height_min' : 'render_min_height';
    const firstSymbolLayer = layers.find((layer) => layer.type === 'symbol');

    state.map.addLayer({
      id: CUSTOM_BUILDINGS_LAYER_ID,
      type: 'fill-extrusion',
      source: buildingSourceId,
      'source-layer': 'building',
      minzoom: 15,
      layout: { visibility: 'none' },
      paint: {
        'fill-extrusion-base': ['coalesce', ['get', baseProperty], 0],
        'fill-extrusion-color': '#d4cbc0',
        'fill-extrusion-height': ['coalesce', ['get', heightProperty], 0],
        'fill-extrusion-opacity': 0.72,
        'fill-extrusion-vertical-gradient': true
      }
    }, firstSymbolLayer?.id);
  }

  function applyDimensionMode(animate) {
    if (!state.map || !state.mapStyleReady) {
      syncDimensionControl();
      return;
    }

    ensureBuildingExtrusionLayer();
    const is3D = Boolean(state.layerPreferences.is3D);
    const duration = animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 450 : 0;

    getBuildingExtrusionLayerIds().forEach((layerId) => {
      if (state.map.getLayer(layerId)) {
        state.map.setLayoutProperty(layerId, 'visibility', is3D ? 'visible' : 'none');
      }
    });

    state.map.easeTo({
      pitch: is3D ? THREE_D_PITCH : 0,
      zoom: is3D && animate ? Math.max(state.map.getZoom(), 15) : state.map.getZoom(),
      bearing: state.map.getBearing(),
      duration
    });
    syncDimensionControl();
  }

  function handleMapProviderError(event) {
    const message = String(event?.error?.message || '');
    if (!message || /cancel/i.test(message)) {
      return;
    }

    setMapFeedback('MapTiler could not load part of the map. Operational records will continue to refresh.');
  }

  function initializeMap() {
    if (!dom.deviceMapCanvas || state.map || state.mapUnavailableReason) {
      return;
    }

    if (!mapTilerApiKey) {
      state.mapUnavailableReason = 'Map service configuration is unavailable. Device records will continue to refresh.';
      return;
    }

    const webGlSupportError = window.maptilersdk && typeof maptilersdk.getWebGLSupportError === 'function'
      ? maptilersdk.getWebGLSupportError()
      : null;

    if (!window.maptilersdk || webGlSupportError) {
      state.mapUnavailableReason = 'This browser cannot display the WebGL map. Device records will continue to refresh.';
      return;
    }

    state.layerPreferences = loadMapPreferences();
    maptilersdk.config.apiKey = mapTilerApiKey;

    try {
      state.map = new maptilersdk.Map({
        container: dom.deviceMapCanvas,
        style: STYLE_DEFINITIONS[state.layerPreferences.style].resolve(),
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        maxZoom: MAX_ZOOM,
        pitch: state.layerPreferences.is3D ? THREE_D_PITCH : 0,
        bearing: 0,
        navigationControl: false,
        geolocateControl: false,
        terrain: false,
        maptilerLogo: true,
        attributionControl: {
          customAttribution: [
            '<a href="https://openrouteservice.org/" target="_blank" rel="noopener noreferrer">&copy; openrouteservice</a> by <a href="https://heigit.org/" target="_blank" rel="noopener noreferrer">HeiGIT</a> | Data from <a href="https://openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>'
          ]
        }
      });
    } catch (error) {
      state.map = null;
      state.mapUnavailableReason = 'The WebGL map could not be initialized. Device records will continue to refresh.';
      return;
    }

    const fullscreenContainer = dom.deviceMapCanvas.closest('.device-map-canvas-wrap');

    state.map.addControl(new maptilersdk.NavigationControl({ visualizePitch: true }), 'top-left');
    if (fullscreenContainer && typeof maptilersdk.FullscreenControl === 'function') {
      state.map.addControl(new maptilersdk.FullscreenControl({ container: fullscreenContainer }), 'top-left');
    }
    state.map.addControl(createDimensionControl(), 'top-left');
    mountStyleControl();
    state.map.on('error', handleMapProviderError);
    state.map.on('load', () => {
      state.mapLoaded = true;
    });
    state.map.on('style.load', () => {
      state.mapStyleReady = true;
      ensureOperationalLayers();
      applyDimensionMode(false);
      renderMap({ preserveViewport: state.hasInitializedViewport });
    });
    bindMapInteractionEvents();
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

  function emptyFeatureCollection() {
    return { type: 'FeatureCollection', features: [] };
  }

  function numericLngLat(latitudeValue, longitudeValue) {
    const latitude = Number(latitudeValue);
    const longitude = Number(longitudeValue);

    return Number.isFinite(latitude) && Number.isFinite(longitude) && latitude !== 0 && longitude !== 0
      ? [longitude, latitude]
      : null;
  }

  function coordinateLngLat(coordinate) {
    if (!Array.isArray(coordinate) || coordinate.length < 2) {
      return null;
    }

    const longitude = Number(coordinate[0]);
    const latitude = Number(coordinate[1]);
    return Number.isFinite(latitude) && Number.isFinite(longitude) && latitude !== 0 && longitude !== 0
      ? [longitude, latitude]
      : null;
  }

  function routeMarkerLngLat(route) {
    const firstCoordinate = Array.isArray(route.coordinates) ? route.coordinates[0] : null;
    return coordinateLngLat(firstCoordinate) || numericLngLat(route.leaderLatitude, route.leaderLongitude);
  }

  function routeDistressLngLat(route) {
    return numericLngLat(route.distressLatitude, route.distressLongitude);
  }

  function routeBoundsLngLats(route) {
    const coordinates = [];
    const leaderLngLat = routeMarkerLngLat(route);
    const distressLngLat = routeDistressLngLat(route);

    if (leaderLngLat) coordinates.push(leaderLngLat);
    if (distressLngLat) coordinates.push(distressLngLat);

    if (Array.isArray(route.coordinates)) {
      route.coordinates.forEach((coordinate) => {
        const lngLat = coordinateLngLat(coordinate);
        if (lngLat) coordinates.push(lngLat);
      });
    }

    return coordinates;
  }

  function hasRenderableRoute(route) {
    return Array.isArray(route.coordinates)
      && route.coordinates.filter(coordinateLngLat).length >= 2;
  }

  function setGeoJsonSourceData(sourceId, data) {
    const source = state.map?.getSource(sourceId);
    if (source && typeof source.setData === 'function') {
      source.setData(data);
    }
  }

  function ensureOperationalLayers() {
    if (!state.map || !state.mapStyleReady) {
      return;
    }

    if (!state.map.getSource(LINKS_SOURCE_ID)) {
      state.map.addSource(LINKS_SOURCE_ID, { type: 'geojson', data: emptyFeatureCollection() });
    }

    if (!state.map.getLayer(LINKS_LAYER_ID)) {
      state.map.addLayer({
        id: LINKS_LAYER_ID,
        type: 'line',
        source: LINKS_SOURCE_ID,
        layout: {
          'line-cap': 'round',
          'line-join': 'round'
        },
        paint: {
          'line-color': ['coalesce', ['get', 'color'], '#e74b32'],
          'line-width': ['coalesce', ['get', 'width'], 3],
          'line-opacity': ['coalesce', ['get', 'opacity'], 0.56],
          'line-dasharray': [2.5, 2]
        }
      });
    }

    if (!state.map.getSource(ROUTES_SOURCE_ID)) {
      state.map.addSource(ROUTES_SOURCE_ID, { type: 'geojson', data: emptyFeatureCollection() });
    }

    if (!state.map.getLayer(ROUTES_LAYER_ID)) {
      state.map.addLayer({
        id: ROUTES_LAYER_ID,
        type: 'line',
        source: ROUTES_SOURCE_ID,
        layout: {
          'line-cap': 'round',
          'line-join': 'round'
        },
        paint: {
          'line-color': ['case', ['==', ['get', 'selected'], true], '#c93f29', '#f26441'],
          'line-width': ['case', ['==', ['get', 'selected'], true], 6, 4],
          'line-opacity': ['case', ['==', ['get', 'selected'], true], 0.94, 0.72]
        }
      });
    }
  }

  function createMarkerElement(wrapperClass, markerClass, isSelected = false) {
    const wrapper = document.createElement('div');
    const marker = document.createElement('div');
    wrapper.className = wrapperClass;
    marker.className = markerClass + (isSelected ? ' is-selected' : '');
    wrapper.appendChild(marker);
    return wrapper;
  }

  function addDomMarker({ key, lngLat, element, popupHtml, popupClass = 'device-map-popup', onClick, zIndex = 300 }) {
    if (!state.map || !lngLat) {
      return null;
    }

    element.style.zIndex = String(zIndex);
    const popup = popupHtml
      ? new maptilersdk.Popup({
          className: popupClass,
          closeButton: true,
          closeOnClick: true,
          maxWidth: '360px',
          offset: 18
        }).setHTML(popupHtml)
      : null;
    const marker = new maptilersdk.Marker({ element, anchor: 'center' }).setLngLat(lngLat);

    if (popup) marker.setPopup(popup);
    if (onClick) element.addEventListener('click', onClick);
    marker.addTo(state.map);
    state.mapMarkers.push({ key, marker });
    return marker;
  }

  function clearMapMarkers() {
    state.mapMarkers.forEach(({ marker }) => marker.remove());
    state.mapMarkers = [];
  }

  function openMarkerPopup(key) {
    window.setTimeout(() => {
      const entry = state.mapMarkers.find((candidate) => candidate.key === key);
      const popup = entry?.marker?.getPopup?.();
      if (entry && popup && !popup.isOpen()) entry.marker.togglePopup();
    }, 0);
  }

  function openMapPopup(html, lngLat, className = 'device-map-popup') {
    if (!state.map || !html || !lngLat) return;
    state.mapPopup?.remove();
    state.mapPopup = new maptilersdk.Popup({
      className,
      closeButton: true,
      closeOnClick: true,
      maxWidth: '360px'
    }).setLngLat(lngLat).setHTML(html).addTo(state.map);
  }

  function createDeviceMarker(device) {
    const status = deriveMapStatus(device);
    const distressedClass = device.hasActiveDistress ? ' is-flashing' : '';
    const element = createMarkerElement('device-map-marker-icon', `device-map-marker${distressedClass}`);
    element.firstElementChild.dataset.status = status;

    return addDomMarker({
      key: `device:${device.nodeId || device.id}`,
      lngLat: numericLngLat(device.latitude, device.longitude),
      element,
      popupHtml: popupMarkup(device, status),
      zIndex: 400
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
      devices
        .filter((candidate) => candidate.id !== device.id)
        .sort((left, right) => calculateDistance(device, left) - calculateDistance(device, right))
        .slice(0, 2)
        .forEach((candidate) => {
          const [startId, endId] = [String(device.id), String(candidate.id)].sort();
          const key = `${startId}:${endId}`;
          if (!links.has(key)) links.set(key, [device, candidate]);
        });
    });

    return Array.from(links.values());
  }

  function meshLinkPopupMarkup(link) {
    return `
      <div class="device-map-popup-card">
        <h3>Mesh Link</h3>
        <div class="device-map-popup-meta">
          <div class="device-map-popup-row"><span>From</span><strong>${helpers.escapeHtml(link.sourceNodeName || link.reportingNodeId)}</strong></div>
          <div class="device-map-popup-row"><span>To</span><strong>${helpers.escapeHtml(link.targetNodeName || link.neighborNodeId)}</strong></div>
          <div class="device-map-popup-row"><span>RSSI</span><strong>${helpers.escapeHtml(link.rssi != null ? `${link.rssi} dBm` : 'Not available')}</strong></div>
          <div class="device-map-popup-row"><span>Last seen</span><strong>${helpers.escapeHtml(helpers.formatRelativeTime(link.lastSeenAt))}</strong></div>
        </div>
      </div>
    `;
  }

  function renderConnections(devices) {
    const features = [];
    currentLinkPopups = new Map();

    if (devices.length < 2) {
      setGeoJsonSourceData(LINKS_SOURCE_ID, emptyFeatureCollection());
      return;
    }

    const visibleIds = new Set(devices.map((device) => String(device.nodeId || device.id)));
    const realLinks = state.meshLinks.filter((link) =>
      visibleIds.has(String(link.reportingNodeId)) && visibleIds.has(String(link.neighborNodeId))
    );

    if (realLinks.length) {
      realLinks.forEach((link, index) => {
        const source = numericLngLat(link.sourceLatitude, link.sourceLongitude);
        const target = numericLngLat(link.targetLatitude, link.targetLongitude);
        if (!source || !target) return;

        const popupKey = `mesh-link:${index}`;
        currentLinkPopups.set(popupKey, meshLinkPopupMarkup(link));
        features.push({
          type: 'Feature',
          properties: { popupKey, color: '#e74b32', width: 3, opacity: 0.56 },
          geometry: { type: 'LineString', coordinates: [source, target] }
        });
      });
    } else {
      buildConnectionPairs(devices).forEach(([firstDevice, secondDevice]) => {
        const source = numericLngLat(firstDevice.latitude, firstDevice.longitude);
        const target = numericLngLat(secondDevice.latitude, secondDevice.longitude);
        if (!source || !target) return;

        const isDistressed = firstDevice.hasActiveDistress || secondDevice.hasActiveDistress;
        features.push({
          type: 'Feature',
          properties: {
            color: isDistressed ? '#b22929' : '#e74b32',
            width: isDistressed ? 4 : 3,
            opacity: isDistressed ? 0.72 : 0.48
          },
          geometry: { type: 'LineString', coordinates: [source, target] }
        });
      });
    }

    setGeoJsonSourceData(LINKS_SOURCE_ID, { type: 'FeatureCollection', features });
  }

  function renderRoutes() {
    const features = [];
    currentRoutesById = new Map();

    if (!state.routes.some((route) => String(route.deploymentId) === String(state.selectedRouteDeploymentId))) {
      state.selectedRouteDeploymentId = null;
    }

    state.routes.forEach((route) => {
      const deploymentId = String(route.deploymentId);
      const isSelected = String(state.selectedRouteDeploymentId) === deploymentId;
      currentRoutesById.set(deploymentId, route);

      if (hasRenderableRoute(route)) {
        features.push({
          type: 'Feature',
          properties: { deploymentId, selected: isSelected },
          geometry: {
            type: 'LineString',
            coordinates: route.coordinates.map(coordinateLngLat).filter(Boolean)
          }
        });
      }

      const teamLngLat = routeMarkerLngLat(route);
      if (teamLngLat) {
        const markerKey = `route-team:${deploymentId}`;
        addDomMarker({
          key: markerKey,
          lngLat: teamLngLat,
          element: createMarkerElement('device-map-route-team-marker-icon', 'device-map-route-team-marker', isSelected),
          popupHtml: routePopupMarkup(route),
          popupClass: 'device-map-popup device-map-route-popup',
          zIndex: 350,
          onClick: () => {
            state.selectedRouteDeploymentId = route.deploymentId;
            renderMap({ preserveViewport: true });
            openMarkerPopup(markerKey);
          }
        });
      }

      if (route.distressSource === 'online') {
        const distressLngLat = routeDistressLngLat(route);
        if (distressLngLat) {
          const markerKey = `route-distress:${deploymentId}`;
          addDomMarker({
            key: markerKey,
            lngLat: distressLngLat,
            element: createMarkerElement('device-map-online-distress-marker-icon', 'device-map-online-distress-marker', isSelected),
            popupHtml: routeDistressPopupMarkup(route),
            popupClass: 'device-map-popup device-map-route-popup',
            zIndex: 330,
            onClick: () => {
              state.selectedRouteDeploymentId = route.deploymentId;
              renderMap({ preserveViewport: true });
              openMarkerPopup(markerKey);
            }
          });
        }
      }
    });

    setGeoJsonSourceData(ROUTES_SOURCE_ID, { type: 'FeatureCollection', features });
  }

  function renderOnlineDistressMarkers() {
    const routeDistressIds = new Set(
      state.routes
        .filter((route) => route.distressSource === 'online')
        .map((route) => String(route.distressId))
    );

    state.onlineDistress
      .filter((distress) => !routeDistressIds.has(String(distress.id)))
      .forEach((distress) => {
        const lngLat = numericLngLat(distress.latitude, distress.longitude);
        if (!lngLat) return;

        addDomMarker({
          key: `online-distress:${distress.id}`,
          lngLat,
          element: createMarkerElement('device-map-online-distress-marker-icon', 'device-map-online-distress-marker'),
          popupHtml: distressCivilianPopupMarkup(distress, {
            isDeployed: distress.isDeployed,
            deploymentCode: distress.deploymentCode,
            teamName: distress.teamName
          }),
          popupClass: 'device-map-popup device-map-route-popup',
          zIndex: 320
        });
      });
  }

  function renderSharedRescuerMarkers() {
    state.sharedRescuers.forEach((rescuer) => {
      const lngLat = numericLngLat(rescuer.latitude, rescuer.longitude);
      if (!lngLat) return;

      addDomMarker({
        key: `shared-rescuer:${rescuer.id || rescuer.rescuerCode}`,
        lngLat,
        element: createMarkerElement('device-map-shared-rescuer-marker-icon', 'device-map-shared-rescuer-marker'),
        popupHtml: sharedRescuerPopupMarkup(rescuer),
        zIndex: 310
      });
    });
  }

  function bindMapInteractionEvents() {
    if (!state.map || mapEventsBound) return;
    mapEventsBound = true;

    state.map.on('click', (event) => {
      if (!state.mapStyleReady) return;
      const layerIds = [ROUTES_LAYER_ID, LINKS_LAYER_ID].filter((id) => state.map.getLayer(id));
      if (!layerIds.length) return;

      const feature = state.map.queryRenderedFeatures(event.point, { layers: layerIds })[0];
      if (!feature) return;

      if (feature.layer.id === ROUTES_LAYER_ID) {
        const route = currentRoutesById.get(String(feature.properties?.deploymentId));
        if (!route) return;
        state.selectedRouteDeploymentId = route.deploymentId;
        renderMap({ preserveViewport: true });
        openMapPopup(routePopupMarkup(route), event.lngLat, 'device-map-popup device-map-route-popup');
        return;
      }

      const popupHtml = currentLinkPopups.get(String(feature.properties?.popupKey || ''));
      if (popupHtml) openMapPopup(popupHtml, event.lngLat);
    });

    state.map.on('mousemove', (event) => {
      if (!state.mapStyleReady) return;
      const layerIds = [ROUTES_LAYER_ID, LINKS_LAYER_ID].filter((id) => state.map.getLayer(id));
      const hasInteractiveFeature = layerIds.length
        && state.map.queryRenderedFeatures(event.point, { layers: layerIds }).length > 0;
      state.map.getCanvas().style.cursor = hasInteractiveFeature ? 'pointer' : '';
    });
  }

  function renderMap(options = {}) {
    const { preserveViewport = false } = options;
    initializeMap();

    const visibleDevices = state.filteredDevices.filter(hasValidCoordinates);
    const unavailableDevices = state.filteredDevices.filter((device) => !hasValidCoordinates(device));
    renderUnavailableList(unavailableDevices);

    if (state.mapUnavailableReason) {
      setMapEmptyState(true, state.mapUnavailableReason);
      return;
    }

    if (!state.map || !state.mapStyleReady) {
      setMapEmptyState(false);
      return;
    }

    const hasVisibleMapContent = (
      visibleDevices.length > 0
      || state.routes.length > 0
      || state.onlineDistress.length > 0
      || state.sharedRescuers.length > 0
    );
    setMapEmptyState(!hasVisibleMapContent, 'No map data currently has a visible location.');

    ensureOperationalLayers();
    clearMapMarkers();
    state.mapPopup?.remove();
    state.mapPopup = null;

    renderConnections(visibleDevices);
    renderOnlineDistressMarkers();
    renderRoutes();
    renderSharedRescuerMarkers();
    visibleDevices.forEach(createDeviceMarker);

    const bounds = new maptilersdk.LngLatBounds();
    let boundsCount = 0;
    const extendBounds = (lngLat) => {
      if (!lngLat) return;
      bounds.extend(lngLat);
      boundsCount += 1;
    };

    visibleDevices.forEach((device) => extendBounds(numericLngLat(device.latitude, device.longitude)));
    state.routes.forEach((route) => routeBoundsLngLats(route).forEach(extendBounds));
    state.onlineDistress.forEach((distress) => extendBounds(numericLngLat(distress.latitude, distress.longitude)));
    state.sharedRescuers.forEach((rescuer) => extendBounds(numericLngLat(rescuer.latitude, rescuer.longitude)));

    state.map.resize();
    if (!boundsCount || preserveViewport || state.hasInitializedViewport) return;

    if (boundsCount === 1) {
      state.map.jumpTo({ center: bounds.getCenter(), zoom: 15 });
    } else {
      state.map.fitBounds(bounds, { padding: 36, maxZoom: 15, duration: 0 });
    }
    state.hasInitializedViewport = true;
  }
  async function loadMapDevices(options = {}) {
    const { background = false } = options;

    if (mapRequestInFlight) {
      return false;
    }

    mapRequestInFlight = true;

    if (!background) {
      state.loading = true;
    }

    try {
      await loadPublicMapConfiguration();
      renderMap();

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

      ui.setFeedback(mapProviderWarning, mapProviderWarning ? 'warning' : 'error');
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
  document.addEventListener('fullscreenchange', () => {
    window.requestAnimationFrame(() => state.map?.resize());
  });
  window.addEventListener('beforeunload', stopLiveRefresh);

  loadMapDevices();
  state.liveRefreshIntervalId = window.setInterval(() => {
    if (!document.hidden) {
      refreshNow();
    }
  }, constants.LIVE_REFRESH_INTERVAL_MS);
}());
