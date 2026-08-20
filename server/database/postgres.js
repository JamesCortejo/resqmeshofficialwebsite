const client = require('./client');
const { hashApiKey, decryptText, lookupHash } = require('./securityHelpers');
const { initializeSchema } = require('./schema');
const {
  ensureUserPhoneLookupHashes,
  runCompatibilityMigrations,
  normalizeLegacyDistressStatuses
} = require('./migrations');
const {
  ensureSequenceTables,
  cleanupLegacySeededOnlineChatDepartments,
  ensureBootstrapSyncDevice,
  reconcileDeploymentOperationalStatuses
} = require('./bootstrap');

const db = {
  run: client.run,
  get: client.get,
  all: client.all,
  exec: client.exec,
  transaction: client.transaction
};

async function initializeDatabase() {
  await initializeSchema(db);
  await runCompatibilityMigrations(db);
  await ensureUserPhoneLookupHashes(db, decryptText, lookupHash);
  await ensureSequenceTables(db);
  await cleanupLegacySeededOnlineChatDepartments(db);
  await normalizeLegacyDistressStatuses(db);
  await ensureBootstrapSyncDevice(db, hashApiKey);
  await reconcileDeploymentOperationalStatuses(db);
}

module.exports = {
  run: client.run,
  get: client.get,
  all: client.all,
  exec: client.exec,
  transaction: client.transaction,
  hashApiKey,
  decryptText,
  lookupHash,
  initializeDatabase,
  close: client.close,
  pool: client.pool
};
