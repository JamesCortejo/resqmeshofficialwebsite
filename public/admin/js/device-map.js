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
  const LINKS_CASING_LAYER_ID = 'resqmesh-mesh-links-casing';
  const LINKS_LAYER_ID = 'resqmesh-mesh-links-line';
  const ROUTES_SOURCE_ID = 'resqmesh-rescue-routes';
  const ROUTES_CASING_LAYER_ID = 'resqmesh-rescue-routes-casing';
  const ROUTES_LAYER_ID = 'resqmesh-rescue-routes-line';
  const LINK_STALE_THRESHOLD_MS = 10 * 60 * 1000;
  const INSPECTOR_WIDTH_PX = 292;
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
  let currentMapDetails = new Map();
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
    dom.deviceMapUnavailableToggle?.setAttribute(
      'aria-label',
      `Location unavailable, ${devices.length} ${devices.length === 1 ? 'node' : 'nodes'}`
    );

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

  function routeInitialBearing(route) {
    const coordinates = Array.isArray(route.coordinates)
      ? route.coordinates.map(coordinateLngLat).filter(Boolean)
      : [];

    for (let index = 1; index < coordinates.length; index += 1) {
      const start = coordinates[index - 1];
      const end = coordinates[index];
      if (start[0] === end[0] && start[1] === end[1]) continue;

      const startLat = start[1] * Math.PI / 180;
      const endLat = end[1] * Math.PI / 180;
      const deltaLng = (end[0] - start[0]) * Math.PI / 180;
      const y = Math.sin(deltaLng) * Math.cos(endLat);
      const x = (Math.cos(startLat) * Math.sin(endLat))
        - (Math.sin(startLat) * Math.cos(endLat) * Math.cos(deltaLng));
      return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    }

    return 0;
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
        id: LINKS_CASING_LAYER_ID,
        type: 'line',
        source: LINKS_SOURCE_ID,
        layout: {
          'line-cap': 'round',
          'line-join': 'round'
        },
        paint: {
          'line-color': '#172533',
          'line-width': ['+', ['coalesce', ['get', 'width'], 3], 4],
          'line-opacity': ['*', ['coalesce', ['get', 'opacity'], 0.78], 0.28]
        }
      });

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
          'line-opacity': ['coalesce', ['get', 'opacity'], 0.78]
        }
      });
    }

    if (!state.map.getSource(ROUTES_SOURCE_ID)) {
      state.map.addSource(ROUTES_SOURCE_ID, { type: 'geojson', data: emptyFeatureCollection() });
    }

    if (!state.map.getLayer(ROUTES_LAYER_ID)) {
      state.map.addLayer({
        id: ROUTES_CASING_LAYER_ID,
        type: 'line',
        source: ROUTES_SOURCE_ID,
        layout: {
          'line-cap': 'round',
          'line-join': 'round'
        },
        paint: {
          'line-color': '#ffffff',
          'line-width': ['case', ['==', ['get', 'selected'], true], 10, 8],
          'line-opacity': ['case', ['==', ['get', 'selected'], true], 0.9, 0.72]
        }
      });

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
          'line-opacity': ['case', ['==', ['get', 'selected'], true], 1, 0.84]
        }
      });
    }
  }

  function createMarkerElement(wrapperClass, markerClass, options = {}) {
    const settings = typeof options === 'boolean' ? { isSelected: options } : options;
    const wrapper = document.createElement('div');
    const marker = document.createElement('div');
    wrapper.className = wrapperClass;
    marker.className = markerClass + (settings.isSelected ? ' is-selected' : '');

    if (settings.iconClass) {
      const icon = document.createElement('i');
      icon.className = `fa-solid ${settings.iconClass}`;
      icon.setAttribute('aria-hidden', 'true');
      marker.appendChild(icon);
    }

    wrapper.appendChild(marker);

    if (settings.label) {
      const label = document.createElement('span');
      label.className = 'device-map-marker-label';
      label.textContent = settings.label;
      wrapper.appendChild(label);
    }

    return wrapper;
  }

  function addDomMarker({
    key,
    lngLat,
    element,
    onClick,
    ariaLabel,
    zIndex = 300,
    rotation = 0,
    rotationAlignment = 'viewport'
  }) {
    if (!state.map || !lngLat) {
      return null;
    }

    element.style.zIndex = String(zIndex);
    const marker = new maptilersdk.Marker({
      element,
      anchor: 'center',
      rotation,
      rotationAlignment
    }).setLngLat(lngLat);

    if (onClick) element.addEventListener('click', onClick);
    if (onClick) {
      element.tabIndex = 0;
      element.setAttribute('role', 'button');
      element.setAttribute('aria-label', ariaLabel || 'Open map marker details');
      element.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onClick(event);
      });
    }
    marker.addTo(state.map);
    state.mapMarkers.push({ key, marker });
    return marker;
  }

  function clearMapMarkers() {
    state.mapMarkers.forEach(({ marker }) => marker.remove());
    state.mapMarkers = [];
  }

  function registerMapDetail(detail) {
    currentMapDetails.set(detail.key, detail);
    return detail;
  }

  function inspectorPadding(isOpen) {
    const width = dom.deviceMapInspector?.getBoundingClientRect().width || INSPECTOR_WIDTH_PX;
    return { top: 0, right: 0, bottom: 0, left: isOpen ? Math.round(width + 24) : 0 };
  }

  function updateInspectorMapOffset(isOpen, lngLat, animate = true) {
    const wrapper = dom.deviceMapCanvas?.closest('.device-map-canvas-wrap');
    const inspectorWidth = dom.deviceMapInspector?.getBoundingClientRect().width || INSPECTOR_WIDTH_PX;
    wrapper?.classList.toggle('has-open-inspector', isOpen);
    wrapper?.style.setProperty('--device-map-inspector-width', `${Math.round(inspectorWidth)}px`);

    if (!state.map || !state.mapStyleReady) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    state.map.easeTo({
      ...(isOpen && lngLat ? { center: lngLat } : {}),
      padding: inspectorPadding(isOpen),
      zoom: state.map.getZoom(),
      bearing: state.map.getBearing(),
      pitch: state.map.getPitch(),
      duration: animate && !reduceMotion ? 240 : 0
    });
  }

  function renderMapInspector(detail, options = {}) {
    if (!detail || !dom.deviceMapInspector) return;
    const { animate = true, focusClose = false } = options;
    const wasOpen = dom.deviceMapInspector.classList.contains('is-open');
    const selectionChanged = dom.deviceMapInspector.dataset.detailKey !== detail.key;

    dom.deviceMapInspectorIcon.innerHTML = `<i class="fa-solid ${detail.iconClass}" aria-hidden="true"></i>`;
    dom.deviceMapInspectorTitle.textContent = detail.title;
    dom.deviceMapInspectorSubtitle.textContent = detail.subtitle;
    dom.deviceMapInspectorBody.innerHTML = detail.html;
    dom.deviceMapInspector.dataset.detailKey = detail.key;
    dom.deviceMapInspector.classList.add('is-open');
    dom.deviceMapInspector.setAttribute('aria-hidden', 'false');
    dom.deviceMapInspector.inert = false;
    if (!wasOpen || selectionChanged) {
      updateInspectorMapOffset(true, detail.lngLat, animate);
    }

    if (focusClose) {
      window.setTimeout(() => dom.deviceMapInspectorClose?.focus(), 0);
    }
  }

  function openMapInspector(detailKey, options = {}) {
    const detail = currentMapDetails.get(detailKey);
    if (!detail) return;

    const nextRouteDeploymentId = detail.routeDeploymentId ?? null;
    const routeSelectionChanged = String(state.selectedRouteDeploymentId ?? '')
      !== String(nextRouteDeploymentId ?? '');
    state.selectedMapItem = {
      key: detailKey,
      openerKey: options.openerKey || detail.markerKey || null
    };

    if (routeSelectionChanged) {
      state.selectedRouteDeploymentId = nextRouteDeploymentId;
      renderMap({ preserveViewport: true });
      if (options.focusClose) {
        window.setTimeout(() => dom.deviceMapInspectorClose?.focus(), 0);
      }
      return;
    }

    renderMapInspector(detail, {
      focusClose: options.focusClose || false
    });
  }

  function closeMapInspector(options = {}) {
    const { restoreFocus = true, rerenderRoute = true } = options;
    const openerKey = state.selectedMapItem?.openerKey || null;
    const hadSelectedRoute = state.selectedRouteDeploymentId !== null;
    state.selectedMapItem = null;
    state.selectedRouteDeploymentId = null;

    dom.deviceMapInspector?.classList.remove('is-open');
    dom.deviceMapInspector?.setAttribute('aria-hidden', 'true');
    if (dom.deviceMapInspector) dom.deviceMapInspector.inert = true;
    if (dom.deviceMapInspector) delete dom.deviceMapInspector.dataset.detailKey;
    updateInspectorMapOffset(false, null);

    if (hadSelectedRoute && rerenderRoute) {
      renderMap({ preserveViewport: true });
    }

    if (restoreFocus && openerKey) {
      window.setTimeout(() => {
        const entry = state.mapMarkers.find((candidate) => candidate.key === openerKey);
        entry?.marker?.getElement?.().focus();
      }, 0);
    }
  }

  function syncMapInspector() {
    if (!state.selectedMapItem) return;
    const detail = currentMapDetails.get(state.selectedMapItem.key);
    if (!detail) {
      closeMapInspector({ restoreFocus: false });
      return;
    }
    renderMapInspector(detail, { animate: false });
  }

  function createDeviceMarker(device) {
    const status = deriveMapStatus(device);
    const distressedClass = device.hasActiveDistress ? ' is-flashing' : '';
    const element = createMarkerElement('device-map-marker-icon', `device-map-marker${distressedClass}`, {
      iconClass: 'fa-microchip',
      label: device.nodeId || device.id
    });
    element.firstElementChild.dataset.status = status;

    const markerKey = `device:${device.nodeId || device.id}`;
    const lngLat = numericLngLat(device.latitude, device.longitude);
    registerMapDetail({
      key: markerKey,
      markerKey,
      iconClass: 'fa-microchip',
      title: device.nodeName || device.nodeId || 'Mesh node',
      subtitle: `${device.nodeId || 'Unknown node'} - ${deriveMapStatusLabel(status)}`,
      html: popupMarkup(device, status),
      lngLat
    });

    return addDomMarker({
      key: markerKey,
      lngLat,
      element,
      ariaLabel: `Open details for ${device.nodeName || device.nodeId}`,
      zIndex: 400,
      onClick: (event) => openMapInspector(markerKey, {
        openerKey: markerKey,
        focusClose: event.type === 'keydown'
      })
    });
  }

  function classifyLinkSignal(rssi) {
    const numeric = Number(rssi);
    if (!Number.isFinite(numeric) || numeric < -140 || numeric > -20) return 'unknown';
    if (numeric >= -70) return 'strong';
    if (numeric >= -85) return 'good';
    if (numeric >= -100) return 'weak';
    return 'poor';
  }

  function linkVisualState(link) {
    const quality = classifyLinkSignal(link.rssi);
    const lastSeenAt = Date.parse(link.lastSeenAt || '');
    const stale = !Number.isFinite(lastSeenAt) || Date.now() - lastSeenAt > LINK_STALE_THRESHOLD_MS;
    const palette = {
      strong: { color: '#168a68', width: 4 },
      good: { color: '#1677a6', width: 3.5 },
      weak: { color: '#d08a18', width: 3 },
      poor: { color: '#c23d32', width: 2.5 },
      unknown: { color: '#6b7785', width: 2.5 }
    };
    return { quality, stale, opacity: stale ? 0.34 : 0.84, ...palette[quality] };
  }

  function signalQualityLabel(quality) {
    return quality === 'strong' ? 'Strong'
      : quality === 'good' ? 'Good'
        : quality === 'weak' ? 'Weak'
          : quality === 'poor' ? 'Poor'
            : 'Unknown';
  }

  function meshLinkPopupMarkup(link, visualState) {
    return `
      <div class="device-map-popup-card">
        <h3>Mesh Link</h3>
        <div class="device-map-popup-meta">
          <div class="device-map-popup-row"><span>From</span><strong>${helpers.escapeHtml(link.sourceNodeName || link.reportingNodeId)}</strong></div>
          <div class="device-map-popup-row"><span>To</span><strong>${helpers.escapeHtml(link.targetNodeName || link.neighborNodeId)}</strong></div>
          <div class="device-map-popup-row"><span>Signal quality</span><strong>${helpers.escapeHtml(signalQualityLabel(visualState.quality))}${visualState.stale ? ' (stale)' : ''}</strong></div>
          <div class="device-map-popup-row"><span>RSSI</span><strong>${helpers.escapeHtml(link.rssi != null ? `${link.rssi} dBm` : 'Not available')}</strong></div>
          <div class="device-map-popup-row"><span>Last seen</span><strong>${helpers.escapeHtml(helpers.formatRelativeTime(link.lastSeenAt))}</strong></div>
        </div>
      </div>
    `;
  }

  function renderConnections(devices) {
    const features = [];

    if (devices.length < 2) {
      setGeoJsonSourceData(LINKS_SOURCE_ID, emptyFeatureCollection());
      return;
    }

    const visibleIds = new Set(devices.map((device) => String(device.nodeId || device.id)));
    const realLinks = state.meshLinks.filter((link) =>
      visibleIds.has(String(link.reportingNodeId)) && visibleIds.has(String(link.neighborNodeId))
    );

    realLinks.forEach((link) => {
        const source = numericLngLat(link.sourceLatitude, link.sourceLongitude);
        const target = numericLngLat(link.targetLatitude, link.targetLongitude);
        if (!source || !target) return;

        const visualState = linkVisualState(link);
        const detailKey = `mesh-link:${link.reportingNodeId}:${link.neighborNodeId}`;
        registerMapDetail({
          key: detailKey,
          iconClass: 'fa-link',
          title: 'Mesh link',
          subtitle: `${link.reportingNodeId} to ${link.neighborNodeId}`,
          html: meshLinkPopupMarkup(link, visualState),
          lngLat: [(source[0] + target[0]) / 2, (source[1] + target[1]) / 2]
        });
        features.push({
          type: 'Feature',
          properties: { detailKey, ...visualState },
          geometry: { type: 'LineString', coordinates: [source, target] }
        });
      });

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
        const detailKey = `route:${deploymentId}`;
        registerMapDetail({
          key: detailKey,
          routeDeploymentId: route.deploymentId,
          iconClass: 'fa-route',
          title: route.teamName || route.teamCode || 'Rescue route',
          subtitle: route.deploymentCode || 'Active deployment',
          html: routePopupMarkup(route),
          lngLat: routeMarkerLngLat(route)
        });
        features.push({
          type: 'Feature',
          properties: { deploymentId, detailKey, selected: isSelected },
          geometry: {
            type: 'LineString',
            coordinates: route.coordinates.map(coordinateLngLat).filter(Boolean)
          }
        });
      }

      const teamLngLat = routeMarkerLngLat(route);
      if (teamLngLat) {
        const markerKey = `route-team:${deploymentId}`;
        const detailKey = `route:${deploymentId}`;
        const routeBearing = routeInitialBearing(route);
        registerMapDetail({
          key: detailKey,
          markerKey,
          routeDeploymentId: route.deploymentId,
          iconClass: 'fa-route',
          title: route.teamName || route.teamCode || 'Rescue route',
          subtitle: route.deploymentCode || 'Active deployment',
          html: routePopupMarkup(route),
          lngLat: teamLngLat
        });
        addDomMarker({
          key: markerKey,
          lngLat: teamLngLat,
          element: createMarkerElement('device-map-route-team-marker-icon', 'device-map-route-team-marker', {
            isSelected,
            iconClass: 'fa-location-arrow'
          }),
          rotation: (routeBearing - 45 + 360) % 360,
          rotationAlignment: 'map',
          ariaLabel: `Open route for ${route.teamName || route.teamCode || route.deploymentCode}`,
          zIndex: 350,
          onClick: (event) => openMapInspector(detailKey, {
            openerKey: markerKey,
            focusClose: event.type === 'keydown'
          })
        });
      }

      if (route.distressSource === 'online') {
        const distressLngLat = routeDistressLngLat(route);
        if (distressLngLat) {
          const markerKey = `route-distress:${deploymentId}`;
          const detailKey = `route-distress:${deploymentId}`;
          registerMapDetail({
            key: detailKey,
            markerKey,
            routeDeploymentId: route.deploymentId,
            iconClass: 'fa-triangle-exclamation',
            title: route.distressCode || 'Online distress',
            subtitle: route.sourceLabel || 'Active emergency',
            html: routeDistressPopupMarkup(route),
            lngLat: distressLngLat
          });
          addDomMarker({
            key: markerKey,
            lngLat: distressLngLat,
            element: createMarkerElement('device-map-online-distress-marker-icon', 'device-map-online-distress-marker', {
              isSelected,
              iconClass: 'fa-triangle-exclamation'
            }),
            ariaLabel: `Open distress details for ${route.distressCode}`,
            zIndex: 330,
            onClick: (event) => openMapInspector(detailKey, {
              openerKey: markerKey,
              focusClose: event.type === 'keydown'
            })
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

        const markerKey = `online-distress:${distress.id}`;
        registerMapDetail({
          key: markerKey,
          markerKey,
          iconClass: 'fa-triangle-exclamation',
          title: distress.distressCode || 'Online distress',
          subtitle: distress.isDeployed ? 'Team deployed' : 'Awaiting deployment',
          html: distressCivilianPopupMarkup(distress, {
            isDeployed: distress.isDeployed,
            deploymentCode: distress.deploymentCode,
            teamName: distress.teamName
          }),
          lngLat
        });
        addDomMarker({
          key: markerKey,
          lngLat,
          element: createMarkerElement('device-map-online-distress-marker-icon', 'device-map-online-distress-marker', {
            iconClass: 'fa-triangle-exclamation'
          }),
          ariaLabel: `Open distress details for ${distress.distressCode || 'active distress'}`,
          zIndex: 320,
          onClick: (event) => openMapInspector(markerKey, {
            openerKey: markerKey,
            focusClose: event.type === 'keydown'
          })
        });
      });
  }

  function renderSharedRescuerMarkers() {
    state.sharedRescuers.forEach((rescuer) => {
      const lngLat = numericLngLat(rescuer.latitude, rescuer.longitude);
      if (!lngLat) return;

      const markerKey = `shared-rescuer:${rescuer.id || rescuer.rescuerCode}`;
      registerMapDetail({
        key: markerKey,
        markerKey,
        iconClass: 'fa-user-shield',
        title: rescuer.firstName || rescuer.rescuerCode || 'Shared rescuer',
        subtitle: rescuer.teamName || rescuer.department || 'Sharing location',
        html: sharedRescuerPopupMarkup(rescuer),
        lngLat
      });
      addDomMarker({
        key: markerKey,
        lngLat,
        element: createMarkerElement('device-map-shared-rescuer-marker-icon', 'device-map-shared-rescuer-marker', {
          iconClass: 'fa-user-shield'
        }),
        ariaLabel: `Open shared location for ${rescuer.firstName || rescuer.rescuerCode || 'rescuer'}`,
        zIndex: 310,
        onClick: (event) => openMapInspector(markerKey, {
          openerKey: markerKey,
          focusClose: event.type === 'keydown'
        })
      });
    });
  }

  function bindMapInteractionEvents() {
    if (!state.map || mapEventsBound) return;
    mapEventsBound = true;

    state.map.on('click', (event) => {
      if (!state.mapStyleReady) return;
      const layerIds = [ROUTES_LAYER_ID, ROUTES_CASING_LAYER_ID, LINKS_LAYER_ID, LINKS_CASING_LAYER_ID]
        .filter((id) => state.map.getLayer(id));
      if (!layerIds.length) return;

      const feature = state.map.queryRenderedFeatures(event.point, { layers: layerIds })[0];
      if (!feature) return;

      if (feature.layer.id === ROUTES_LAYER_ID || feature.layer.id === ROUTES_CASING_LAYER_ID) {
        const route = currentRoutesById.get(String(feature.properties?.deploymentId));
        if (!route) return;
        openMapInspector(String(feature.properties?.detailKey || `route:${route.deploymentId}`));
        return;
      }

      const detailKey = String(feature.properties?.detailKey || '');
      if (detailKey) openMapInspector(detailKey);
    });

    state.map.on('mousemove', (event) => {
      if (!state.mapStyleReady) return;
      const layerIds = [ROUTES_LAYER_ID, ROUTES_CASING_LAYER_ID, LINKS_LAYER_ID, LINKS_CASING_LAYER_ID]
        .filter((id) => state.map.getLayer(id));
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
      currentMapDetails = new Map();
      if (state.selectedMapItem) {
        closeMapInspector({ restoreFocus: false, rerenderRoute: false });
      }
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
    currentMapDetails = new Map();

    renderConnections(visibleDevices);
    renderOnlineDistressMarkers();
    renderRoutes();
    renderSharedRescuerMarkers();
    visibleDevices.forEach(createDeviceMarker);
    syncMapInspector();

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
    if (event.key !== 'Escape') return;

    if (dom.deviceViewModal?.classList.contains('is-open')) {
      ui.closeDeviceViewModal();
      return;
    }

    if (dom.deviceMapInspector?.classList.contains('is-open')) {
      closeMapInspector();
    }
  });

  dom.deviceMapInspectorClose?.addEventListener('click', () => closeMapInspector());
  dom.deviceMapUnavailableToggle?.addEventListener('click', () => {
    const isExpanded = dom.deviceMapUnavailableToggle.getAttribute('aria-expanded') === 'true';
    dom.deviceMapUnavailableToggle.setAttribute('aria-expanded', String(!isExpanded));
    if (dom.deviceMapUnavailableContent) {
      dom.deviceMapUnavailableContent.hidden = isExpanded;
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
    window.requestAnimationFrame(() => {
      state.map?.resize();
      if (state.selectedMapItem) {
        updateInspectorMapOffset(true, null, false);
      }
    });
  });
  window.addEventListener('resize', () => {
    window.requestAnimationFrame(() => {
      state.map?.resize();
      if (state.selectedMapItem) {
        updateInspectorMapOffset(true, null, false);
      }
    });
  });
  window.addEventListener('beforeunload', stopLiveRefresh);

  loadMapDevices();
  state.liveRefreshIntervalId = window.setInterval(() => {
    if (!document.hidden) {
      refreshNow();
    }
  }, constants.LIVE_REFRESH_INTERVAL_MS);
}());
