const https = require('https');
const config = require('../config/env');
const {
  getRescuerLocationCurrentByRescuerId,
  getDeploymentRouteSnapshotByDeploymentId,
  upsertDeploymentRouteSnapshot
} = require('../repositories/deploymentRepository');

function haversineMeters(lat1, lon1, lat2, lon2) {
  const toRadians = (value) => (value * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;

  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function parseJson(value) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
}

function parseCoordinates(value) {
  const parsed = parseJson(value);
  return Array.isArray(parsed) ? parsed : [];
}

function firstCoordinate(value) {
  const coordinates = parseCoordinates(value);

  if (!coordinates.length || !Array.isArray(coordinates[0]) || coordinates[0].length < 2) {
    return null;
  }

  return {
    longitude: Number(coordinates[0][0]),
    latitude: Number(coordinates[0][1])
  };
}

function isFiniteCoordinate(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function postJson(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const request = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...headers
      }
    }, (response) => {
      let rawBody = '';

      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        rawBody += chunk;
      });
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`OpenRouteService request failed with status ${response.statusCode}: ${rawBody}`));
          return;
        }

        try {
          resolve(rawBody ? JSON.parse(rawBody) : {});
        } catch (error) {
          reject(new Error('OpenRouteService returned invalid JSON.'));
        }
      });
    });

    request.on('error', reject);
    request.setTimeout(15000, () => {
      request.destroy(new Error('OpenRouteService request timed out.'));
    });
    request.write(payload);
    request.end();
  });
}

async function fetchOpenRouteServiceRoute(origin, destination) {
  if (!config.openRouteServiceApiKey) {
    const error = new Error('Route service is not configured.');
    error.statusCode = 503;
    throw error;
  }

  const response = await postJson(
    'https://api.openrouteservice.org/v2/directions/driving-car/geojson',
    {
      coordinates: [
        [origin.longitude, origin.latitude],
        [destination.longitude, destination.latitude]
      ]
    },
    {
      Authorization: config.openRouteServiceApiKey
    }
  );

  const feature = Array.isArray(response.features) ? response.features[0] : null;
  const summary = feature?.properties?.summary || {};
  const coordinates = feature?.geometry?.coordinates;

  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    const error = new Error('Route service returned no route geometry.');
    error.statusCode = 502;
    throw error;
  }

  return {
    distanceM: Number(summary.distance || 0),
    durationS: Number(summary.duration || 0),
    etaMinutes: Math.max(1, Math.round(Number(summary.duration || 0) / 60)),
    geometryJson: JSON.stringify(coordinates),
    provider: 'openrouteservice'
  };
}

function needsRouteRefresh(snapshot, location, destination) {
  if (!snapshot) {
    return true;
  }

  const maxAgeMs = config.routeSync.snapshotMaxAgeSeconds * 1000;
  const computedAtMs = Date.parse(snapshot.computedAt || snapshot.updatedAt || '');

  if (Number.isNaN(computedAtMs)) {
    return true;
  }

  if (Date.now() - computedAtMs <= maxAgeMs) {
    return false;
  }

  const origin = firstCoordinate(snapshot.geometryJson);

  if (!origin) {
    return true;
  }

  const movedMeters = haversineMeters(
    origin.latitude,
    origin.longitude,
    location.latitude,
    location.longitude
  );

  const destinationChanged = !isFiniteCoordinate(snapshot.destinationLatitude)
    || !isFiniteCoordinate(snapshot.destinationLongitude)
    || haversineMeters(
      snapshot.destinationLatitude,
      snapshot.destinationLongitude,
      destination.latitude,
      destination.longitude
    ) > 5;

  if (destinationChanged) {
    return true;
  }

  return movedMeters > config.routeSync.movementThresholdMeters;
}

async function ensureDeploymentRouteSnapshot(assignment) {
  if (!assignment || !assignment.id) {
    return {
      location: null,
      snapshot: null
    };
  }

  const location = await getRescuerLocationCurrentByRescuerId(assignment.teamLeaderRescuerId);

  if (
    !location
    || !isFiniteCoordinate(location.latitude)
    || !isFiniteCoordinate(location.longitude)
    || !isFiniteCoordinate(assignment.latitude)
    || !isFiniteCoordinate(assignment.longitude)
  ) {
    return {
      location,
      snapshot: await getDeploymentRouteSnapshotByDeploymentId(assignment.id)
    };
  }

  const destination = {
    latitude: Number(assignment.latitude),
    longitude: Number(assignment.longitude)
  };
  const currentSnapshot = await getDeploymentRouteSnapshotByDeploymentId(assignment.id);

  if (!needsRouteRefresh(currentSnapshot, location, destination)) {
    return {
      location,
      snapshot: currentSnapshot
    };
  }

  const route = await fetchOpenRouteServiceRoute({
    latitude: Number(location.latitude),
    longitude: Number(location.longitude)
  }, destination);
  const timestamp = new Date().toISOString();

  await upsertDeploymentRouteSnapshot({
    deploymentId: assignment.id,
    leaderRescuerId: assignment.teamLeaderRescuerId,
    leaderRecordedAt: location.recordedAt,
    destinationLatitude: destination.latitude,
    destinationLongitude: destination.longitude,
    distanceM: route.distanceM,
    durationS: route.durationS,
    etaMinutes: route.etaMinutes,
    geometryJson: route.geometryJson,
    provider: route.provider,
    computedAt: timestamp,
    updatedAt: timestamp
  });

  return {
    location,
    snapshot: await getDeploymentRouteSnapshotByDeploymentId(assignment.id)
  };
}

function buildLiveRouteResponse(assignment, location, snapshot) {
  return {
    assignment: {
      id: assignment.id,
      distress_id: assignment.meshDistressSignalId,
      team_id: assignment.teamId,
      rescuer_id: assignment.teamLeaderRescuerId,
      assigned_at: assignment.deployedAt || assignment.createdAt,
      eta_minutes: snapshot?.etaMinutes ?? null,
      status: assignment.status,
      distress: {
        code: assignment.distressCode,
        reason: assignment.reason,
        latitude: assignment.latitude,
        longitude: assignment.longitude,
        timestamp: assignment.timestamp,
        priority: assignment.priority,
        user: {
          firstName: assignment.firstName,
          lastName: assignment.lastName,
          phone: assignment.phone,
          bloodType: assignment.bloodType,
          age: assignment.age
        }
      }
    },
    rescuer_location: {
      latitude: location?.latitude ?? null,
      longitude: location?.longitude ?? null,
      recorded_at: location?.recordedAt ?? null
    },
    route: {
      distance_m: snapshot?.distanceM ?? null,
      duration_s: snapshot?.durationS ?? null,
      eta_minutes: snapshot?.etaMinutes ?? null,
      coordinates: parseCoordinates(snapshot?.geometryJson)
    }
  };
}

module.exports = {
  buildLiveRouteResponse,
  ensureDeploymentRouteSnapshot,
  parseCoordinates
};
