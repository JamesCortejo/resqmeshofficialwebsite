const { initializeDatabase, run, get, close } = require('../database/postgres');
const { encryptText, lookupHash } = require('../services/encryptionService');
const { hashPassword } = require('../services/passwordService');
const { generateUserCode } = require('../repositories/userRepository');
const { generateRescueTeamCode, findRescueTeamByName, createRescueTeam } = require('../repositories/rescueTeamRepository');
const { generateRescuerCode, createRescuer } = require('../repositories/rescuerRepository');
const { generateDeploymentCode, generateOnlineDistressCode } = require('../repositories/deploymentRepository');

const BARANGAYS = [
  'Bagontaas',
  'Poblacion',
  'Lumbo',
  'Tongantongan',
  'Pangantucan Road',
  'San Carlos',
  'Nabag-o',
  'Batangan'
];

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const OCCUPATIONS = ['Farmer', 'Teacher', 'Store Owner', 'Driver', 'Nurse', 'Electrician', 'Vendor', 'Student'];
const REASONS = ['FIRE', 'FLOODING', 'INJURY', 'LANDSLIDE', 'MEDICAL', 'MISSING PERSON', 'ROAD ACCIDENT', 'STRUCTURAL DAMAGE'];

const USER_NAMES = [
  ['James', 'Cortejo'],
  ['Maria', 'Lopez'],
  ['Ana', 'Dela Cruz'],
  ['Mark', 'Gelacio'],
  ['Rina', 'Santos'],
  ['Paolo', 'Rivera'],
  ['Jessa', 'Morales'],
  ['Kevin', 'Aquino'],
  ['Liza', 'Camacho'],
  ['Ralph', 'Tindoy'],
  ['Mika', 'Tan'],
  ['Carlo', 'Mendoza'],
  ['Faith', 'Bacalso'],
  ['Noel', 'Abad'],
  ['Trisha', 'Lacson'],
  ['Rico', 'Cabiles'],
  ['Hazel', 'Neri'],
  ['Benny', 'Soriano'],
  ['Ivy', 'Paderanga'],
  ['Jonas', 'Relucio'],
  ['Aira', 'Samson'],
  ['Nico', 'Velasco'],
  ['Leah', 'Bautista'],
  ['Omar', 'Tiu']
];

const RESCUER_PROFILES = [
  { firstName: 'Rex', lastName: 'Camuro Rusty', agency: 'fire-department', teamName: 'Rescue Team Fire 1' },
  { firstName: 'Zach', lastName: 'Gelacio', agency: 'cdrrmo', teamName: 'Rescue Team CDRRMO 1' },
  { firstName: 'Mae', lastName: 'Torres', agency: 'police-department', teamName: 'Rescue Team Police 1' },
  { firstName: 'Joel', lastName: 'Villacorta', agency: 'fire-department', teamName: 'Rescue Team Fire 1' },
  { firstName: 'Ian', lastName: 'Salvador', agency: 'cdrrmo', teamName: 'Rescue Team CDRRMO 1' },
  { firstName: 'Pia', lastName: 'Domingo', agency: 'police-department', teamName: 'Rescue Team Police 1' },
  { firstName: 'Kurt', lastName: 'Aguinaldo', agency: 'fire-department', teamName: 'Rescue Team Fire 2' },
  { firstName: 'Ella', lastName: 'Nabua', agency: 'cdrrmo', teamName: 'Rescue Team CDRRMO 2' },
  { firstName: 'Bryan', lastName: 'Sagun', agency: 'police-department', teamName: 'Rescue Team Police 2' },
  { firstName: 'Mara', lastName: 'Galvez', agency: 'fire-department', teamName: 'Rescue Team Fire 2' },
  { firstName: 'Troy', lastName: 'Panganiban', agency: 'cdrrmo', teamName: 'Rescue Team CDRRMO 2' },
  { firstName: 'Lani', lastName: 'Estillo', agency: 'police-department', teamName: 'Rescue Team Police 2' }
];

const TEAM_DEFINITIONS = [
  { name: 'Rescue Team CDRRMO 1', agency: 'cdrrmo' },
  { name: 'Rescue Team CDRRMO 2', agency: 'cdrrmo' },
  { name: 'Rescue Team Fire 1', agency: 'fire-department' },
  { name: 'Rescue Team Fire 2', agency: 'fire-department' },
  { name: 'Rescue Team Police 1', agency: 'police-department' },
  { name: 'Rescue Team Police 2', agency: 'police-department' }
];

function parseNumberArg(name, fallback) {
  const prefix = `--${name}=`;
  const value = process.argv.find((arg) => arg.startsWith(prefix));
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value.slice(prefix.length), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function pick(list, index) {
  return list[index % list.length];
}

function isoAtOffsetDays(daysAgo, minuteOffset = 0) {
  const now = new Date();
  return new Date(now.getTime() - (daysAgo * 24 * 60 + minuteOffset) * 60 * 1000).toISOString();
}

function latFor(index) {
  return 7.9602 + (index % 8) * 0.00019 + Math.floor(index / 8) * 0.00007;
}

function lngFor(index) {
  return 125.1125 + (index % 6) * 0.00018 + Math.floor(index / 6) * 0.00005;
}

async function ensureAdminUser() {
  const existing = await get(`
    SELECT id, user_code AS "userCode"
    FROM users
    WHERE status = 'admin'
    ORDER BY id ASC
    LIMIT 1
  `);

  if (existing) {
    return existing;
  }

  const userCode = await generateUserCode();
  const username = 'localreportadmin';
  const email = `${username}@resqmesh.local`;
  const idNumber = `ADMIN-${userCode}`;
  const now = new Date().toISOString();
  const result = await run(`
    INSERT INTO users (
      user_code,
      first_name_enc,
      middle_name_enc,
      last_name_enc,
      birth_date_enc,
      username_enc,
      username_lookup_hash,
      street_address_enc,
      barangay_enc,
      occupation_enc,
      blood_type_enc,
      medical_complications_enc,
      allergies_enc,
      email_enc,
      email_lookup_hash,
      phone_enc,
      phone_lookup_hash,
      password_hash,
      id_type_enc,
      id_number_enc,
      id_number_lookup_hash,
      front_id_image_path,
      front_id_original_name,
      front_id_mime_type,
      front_id_original_size,
      front_id_encrypted_size,
      back_id_image_path,
      back_id_original_name,
      back_id_mime_type,
      back_id_original_size,
      back_id_encrypted_size,
      status,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'admin', ?, ?)
    RETURNING id
  `, [
    userCode,
    encryptText('Local'),
    null,
    encryptText('Admin'),
    encryptText('1970-01-01'),
    encryptText(username),
    lookupHash(username),
    encryptText('ResQMesh Local Office'),
    encryptText('Poblacion'),
    encryptText('Administrator'),
    encryptText('N/A'),
    null,
    null,
    encryptText(email),
    lookupHash(email),
    encryptText('09999999999'),
    lookupHash('09999999999'),
    hashPassword('LocalSeed123!'),
    encryptText('System Bootstrap'),
    encryptText(idNumber),
    lookupHash(idNumber),
    'admin/local-seed-front',
    'local-seed-front.txt',
    'text/plain',
    0,
    0,
    'admin/local-seed-back',
    'local-seed-back.txt',
    'text/plain',
    0,
    0,
    now,
    now
  ]);

  return {
    id: result.lastID,
    userCode
  };
}

async function createApprovedUser(index) {
  const [firstName, lastName] = pick(USER_NAMES, index);
  const userCode = await generateUserCode();
  const username = `seedcivilian${index + 1}`;
  const email = `seedcivilian${index + 1}@resqmesh.local`;
  const phone = `09${String(810000000 + index).padStart(9, '0')}`;
  const idNumber = `SEED-ID-${String(index + 1).padStart(4, '0')}`;
  const createdAt = isoAtOffsetDays(30 - (index % 18), index * 7);

  const result = await run(`
    INSERT INTO users (
      user_code,
      first_name_enc,
      middle_name_enc,
      last_name_enc,
      birth_date_enc,
      username_enc,
      username_lookup_hash,
      street_address_enc,
      barangay_enc,
      occupation_enc,
      blood_type_enc,
      medical_complications_enc,
      allergies_enc,
      email_enc,
      email_lookup_hash,
      phone_enc,
      phone_lookup_hash,
      password_hash,
      id_type_enc,
      id_number_enc,
      id_number_lookup_hash,
      front_id_image_path,
      front_id_original_name,
      front_id_mime_type,
      front_id_original_size,
      front_id_encrypted_size,
      back_id_image_path,
      back_id_original_name,
      back_id_mime_type,
      back_id_original_size,
      back_id_encrypted_size,
      status,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?)
    RETURNING id
  `, [
    userCode,
    encryptText(firstName),
    null,
    encryptText(lastName),
    encryptText(`19${80 + (index % 15)}-${String((index % 12) + 1).padStart(2, '0')}-${String((index % 27) + 1).padStart(2, '0')}`),
    encryptText(username),
    lookupHash(username),
    encryptText(`Purok ${index + 1}`),
    encryptText(pick(BARANGAYS, index)),
    encryptText(pick(OCCUPATIONS, index)),
    encryptText(pick(BLOOD_TYPES, index)),
    null,
    null,
    encryptText(email),
    lookupHash(email),
    encryptText(phone),
    lookupHash(phone),
    hashPassword('SeedCivilian123!'),
    encryptText('National ID'),
    encryptText(idNumber),
    lookupHash(idNumber),
    'seed/front-id',
    'seed-front-id.webp',
    'image/webp',
    0,
    0,
    'seed/back-id',
    'seed-back-id.webp',
    'image/webp',
    0,
    0,
    createdAt,
    createdAt
  ]);

  return {
    id: result.lastID,
    userCode,
    firstName,
    lastName,
    phone,
    bloodType: pick(BLOOD_TYPES, index),
    age: 22 + (index % 31),
    occupation: pick(OCCUPATIONS, index)
  };
}

async function ensureRescueTeams() {
  const teams = [];

  for (const definition of TEAM_DEFINITIONS) {
    const existing = await findRescueTeamByName(definition.name);
    if (existing) {
      teams.push(existing);
      continue;
    }

    const result = await createRescueTeam({
      teamCode: await generateRescueTeamCode(),
      name: definition.name,
      agency: definition.agency,
      status: 'active'
    });

    teams.push({
      id: result.lastID,
      teamCode: definition.teamCode,
      name: definition.name,
      agency: definition.agency,
      status: 'active'
    });
  }

  return teams;
}

async function ensureRescuers(teamsByName) {
  const rescuers = [];

  for (let index = 0; index < RESCUER_PROFILES.length; index += 1) {
    const profile = RESCUER_PROFILES[index];
    const phone = `09${String(920000000 + index).padStart(9, '0')}`;
    const phoneLookupHash = lookupHash(phone);
    const existing = await get(`
      SELECT id, rescuer_code AS "rescuerCode", agency, team_id AS "teamId"
      FROM rescuers
      WHERE phone_lookup_hash = ?
      LIMIT 1
    `, [phoneLookupHash]);

    if (existing) {
      rescuers.push({
        id: existing.id,
        rescuerCode: existing.rescuerCode,
        firstName: profile.firstName,
        lastName: profile.lastName,
        agency: existing.agency,
        teamId: existing.teamId
      });
      continue;
    }

    const created = await createRescuer({
      rescuerCode: await generateRescuerCode(),
      firstNameEnc: encryptText(profile.firstName),
      middleNameEnc: null,
      lastNameEnc: encryptText(profile.lastName),
      birthDateEnc: encryptText(`19${82 + (index % 10)}-0${(index % 8) + 1}-1${index % 9}`),
      phoneEnc: encryptText(phone),
      passwordHash: hashPassword('SeedRescuer123!'),
      phoneLookupHash,
      agency: profile.agency,
      status: 'available',
      teamId: teamsByName.get(profile.teamName).id
    });

    rescuers.push({
      id: created.lastID,
      rescuerCode: `RSC-${String(index + 1).padStart(3, '0')}`,
      firstName: profile.firstName,
      lastName: profile.lastName,
      agency: profile.agency,
      teamId: teamsByName.get(profile.teamName).id
    });
  }

  return rescuers;
}

async function insertDeployment({
  distressSource,
  meshDistressSignalId,
  onlineDistressSignalId,
  originNodeId,
  originDistressId,
  team,
  leader,
  adminUserId,
  status,
  createdAt,
  deployedAt,
  endedAt
}, teamMembers) {
  const deploymentCode = await generateDeploymentCode();
  const result = await run(`
    INSERT INTO distress_deployments (
      deployment_code,
      mesh_distress_signal_id,
      online_distress_signal_id,
      distress_source,
      origin_node_id,
      origin_distress_id,
      team_id,
      team_leader_rescuer_id,
      created_by_admin_user_id,
      status,
      created_at,
      deployed_at,
      canceled_at,
      accomplished_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING id
  `, [
    deploymentCode,
    meshDistressSignalId,
    onlineDistressSignalId,
    distressSource,
    originNodeId,
    originDistressId,
    team.id,
    leader.id,
    adminUserId,
    status,
    createdAt,
    deployedAt,
    status === 'canceled' ? endedAt : null,
    status === 'accomplished' ? endedAt : null,
    endedAt || deployedAt
  ]);

  for (const member of teamMembers) {
    await run(`
      INSERT INTO distress_deployment_members (
        deployment_id,
        rescuer_id,
        rescuer_code,
        created_at
      ) VALUES (?, ?, ?, ?)
    `, [result.lastID, member.id, member.rescuerCode, createdAt]);
  }

  return result.lastID;
}

function onlineStatusFor(index) {
  if (index < 4) {
    return 'active';
  }
  if (index % 5 === 0) {
    return 'canceled';
  }
  return 'accomplished';
}

function meshStatusFor(index) {
  if (index < 3) {
    return 'active';
  }
  if (index % 4 === 0) {
    return 'canceled';
  }
  return 'accomplished';
}

async function seedOnlineIncidents(civilians, teams, rescuersByTeamId, adminUserId, count) {
  let deploymentsCreated = 0;

  for (let index = 0; index < count; index += 1) {
    const civilian = civilians[index % civilians.length];
    const status = onlineStatusFor(index);
    const reportedAt = isoAtOffsetDays(1 + (index % 28), index * 11);
    const onlineCode = await generateOnlineDistressCode();
    const reason = pick(REASONS, index);
    const accuracy = 6 + (index % 9);
    const result = await run(`
      INSERT INTO online_distress_signals (
        distress_code,
        user_id,
        user_code,
        first_name,
        last_name,
        phone,
        blood_type,
        age,
        occupation,
        reason,
        latitude,
        longitude,
        accuracy_m,
        recorded_at,
        status,
        canceled_at,
        accomplished_at,
        updated_at,
        deleted,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
      RETURNING id
    `, [
      onlineCode,
      civilian.id,
      civilian.userCode,
      civilian.firstName,
      civilian.lastName,
      civilian.phone,
      civilian.bloodType,
      civilian.age,
      civilian.occupation,
      reason,
      latFor(index + 30),
      lngFor(index + 30),
      accuracy,
      reportedAt,
      status,
      status === 'canceled' ? new Date(new Date(reportedAt).getTime() + (90 + index * 3) * 60000).toISOString() : null,
      status === 'accomplished' ? new Date(new Date(reportedAt).getTime() + (120 + index * 4) * 60000).toISOString() : null,
      reportedAt,
      reportedAt
    ]);

    const shouldDeploy = status !== 'active' || index % 2 === 0;
    if (!shouldDeploy) {
      continue;
    }

    const team = teams[index % teams.length];
    const teamMembers = rescuersByTeamId.get(team.id) || [];
    const leader = teamMembers[0];
    if (!leader) {
      continue;
    }

    const deployedAt = new Date(new Date(reportedAt).getTime() + (8 + (index % 6) * 7) * 60000).toISOString();
    const endedAt = status === 'active'
      ? null
      : new Date(new Date(deployedAt).getTime() + (18 + (index % 7) * 11) * 60000).toISOString();

    await insertDeployment({
      distressSource: 'online',
      meshDistressSignalId: null,
      onlineDistressSignalId: result.lastID,
      originNodeId: `ONLINE-${result.lastID}`,
      originDistressId: result.lastID,
      team,
      leader,
      adminUserId,
      status: status === 'active' ? 'deployed' : status,
      createdAt: deployedAt,
      deployedAt,
      endedAt
    }, teamMembers.slice(0, 2));

    deploymentsCreated += 1;
  }

  return deploymentsCreated;
}

async function seedMeshIncidents(teams, rescuersByTeamId, adminUserId, count) {
  const originNodes = ['MN00001', 'MN00002', 'MN00003'];
  let deploymentsCreated = 0;

  for (let index = 0; index < count; index += 1) {
    const status = meshStatusFor(index);
    const reportedAt = isoAtOffsetDays(2 + (index % 26), index * 13);
    const distressCode = `MDS-${String(index + 1).padStart(3, '0')}`;
    const originNodeId = originNodes[index % originNodes.length];
    const row = await run(`
      INSERT INTO mesh_distress_signals (
        origin_node_id,
        origin_distress_id,
        distress_code,
        user_code,
        first_name,
        last_name,
        phone,
        blood_type,
        age,
        node_id,
        reason,
        latitude,
        longitude,
        timestamp,
        status,
        priority,
        ack_received,
        updated_at,
        deleted,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 0, ?)
      RETURNING id
    `, [
      originNodeId,
      500 + index + 1,
      distressCode,
      `RMU${String((index % 24) + 1).padStart(3, '0')}`,
      pick(USER_NAMES, index)[0],
      pick(USER_NAMES, index)[1],
      `09${String(830000000 + index).padStart(9, '0')}`,
      pick(BLOOD_TYPES, index + 3),
      20 + (index % 37),
      originNodeId,
      pick(REASONS, index + 2),
      latFor(index),
      lngFor(index),
      reportedAt,
      status,
      index % 3 === 0 ? 'high' : 'medium',
      reportedAt,
      reportedAt
    ]);

    const shouldDeploy = status !== 'active' || index % 2 === 1;
    if (!shouldDeploy) {
      continue;
    }

    const team = teams[(index + 1) % teams.length];
    const teamMembers = rescuersByTeamId.get(team.id) || [];
    const leader = teamMembers[0];
    if (!leader) {
      continue;
    }

    const deployedAt = new Date(new Date(reportedAt).getTime() + (6 + (index % 5) * 9) * 60000).toISOString();
    const endedAt = status === 'active'
      ? null
      : new Date(new Date(deployedAt).getTime() + (20 + (index % 8) * 10) * 60000).toISOString();

    await insertDeployment({
      distressSource: 'mesh',
      meshDistressSignalId: row.lastID,
      onlineDistressSignalId: null,
      originNodeId,
      originDistressId: 500 + index + 1,
      team,
      leader,
      adminUserId,
      status: status === 'active' ? 'deployed' : status,
      createdAt: deployedAt,
      deployedAt,
      endedAt
    }, teamMembers.slice(0, 2));

    deploymentsCreated += 1;
  }

  return deploymentsCreated;
}

async function normalizeResponderStatuses() {
  await run(`UPDATE rescue_teams SET status = 'active', updated_at = CURRENT_TIMESTAMP`);
  await run(`UPDATE rescuers SET status = 'available', updated_at = CURRENT_TIMESTAMP WHERE access_status = 'active'`);

  await run(`
    UPDATE rescue_teams t
    SET status = 'dispatched',
        updated_at = CURRENT_TIMESTAMP
    WHERE EXISTS (
      SELECT 1
      FROM distress_deployments d
      WHERE d.team_id = t.id
        AND d.status = 'deployed'
    )
  `);

  await run(`
    UPDATE rescuers r
    SET status = 'dispatched',
        updated_at = CURRENT_TIMESTAMP
    WHERE EXISTS (
      SELECT 1
      FROM distress_deployment_members m
      INNER JOIN distress_deployments d ON d.id = m.deployment_id
      WHERE m.rescuer_id = r.id
        AND d.status = 'deployed'
    )
  `);
}

async function main() {
  await initializeDatabase();

  const onlineCount = parseNumberArg('online', 24);
  const meshCount = parseNumberArg('mesh', 24);
  const civilianCount = parseNumberArg('users', Math.max(onlineCount, 24));
  const force = hasFlag('force');

  const existingCounts = await get(`
    SELECT
      (SELECT COUNT(*)::int FROM mesh_distress_signals) AS "meshCount",
      (SELECT COUNT(*)::int FROM online_distress_signals) AS "onlineCount"
  `);

  if (!force && (existingCounts.meshCount > 0 || existingCounts.onlineCount > 0)) {
    throw new Error('Local distress tables already contain data. Re-run with --force only if you intentionally want to add more seeded incidents.');
  }

  const admin = await ensureAdminUser();
  const teams = await ensureRescueTeams();
  const teamsByName = new Map(teams.map((team) => [team.name, team]));
  const rescuers = await ensureRescuers(teamsByName);
  const rescuersByTeamId = new Map();

  for (const rescuer of rescuers) {
    if (!rescuersByTeamId.has(rescuer.teamId)) {
      rescuersByTeamId.set(rescuer.teamId, []);
    }
    rescuersByTeamId.get(rescuer.teamId).push(rescuer);
  }

  const civilians = [];
  for (let index = 0; index < civilianCount; index += 1) {
    civilians.push(await createApprovedUser(index));
  }

  const onlineDeployments = await seedOnlineIncidents(civilians, teams, rescuersByTeamId, admin.id, onlineCount);
  const meshDeployments = await seedMeshIncidents(teams, rescuersByTeamId, admin.id, meshCount);
  await normalizeResponderStatuses();

  const summary = await get(`
    SELECT
      (SELECT COUNT(*)::int FROM users WHERE status = 'approved') AS "approvedUsers",
      (SELECT COUNT(*)::int FROM rescuers) AS "rescuers",
      (SELECT COUNT(*)::int FROM rescue_teams) AS "rescueTeams",
      (SELECT COUNT(*)::int FROM mesh_distress_signals) AS "meshIncidents",
      (SELECT COUNT(*)::int FROM online_distress_signals) AS "onlineIncidents",
      (SELECT COUNT(*)::int FROM distress_deployments) AS "deployments"
  `);

  console.log('Seeded local report data successfully.');
  console.log(JSON.stringify({
    approvedUsersCreated: civilians.length,
    onlineIncidentsCreated: onlineCount,
    meshIncidentsCreated: meshCount,
    onlineDeploymentsCreated: onlineDeployments,
    meshDeploymentsCreated: meshDeployments,
    totals: summary
  }, null, 2));
}

main()
  .catch((error) => {
    process.exitCode = 1;
    console.error(`Unable to seed local report data: ${error.message}`);
  })
  .finally(async () => {
    await close();
  });
