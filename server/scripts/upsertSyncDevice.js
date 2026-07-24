const crypto = require('crypto');
const { initializeDatabase, close } = require('../database/postgres');
const {
  createSyncDevice,
  findSyncDeviceByNodeId,
  updateSyncDevice
} = require('../repositories/syncDeviceRepository');

function parseArg(name) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : null;
}

function requiredValue(value, name) {
  if (!value || !String(value).trim()) {
    throw new Error(`Missing --${name}=...`);
  }

  return String(value).trim();
}

function hashApiKey(apiKey) {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

async function main() {
  await initializeDatabase();

  const nodeId = requiredValue(parseArg('node-id') || process.env.DEVICE_NODE_ID, 'node-id');
  const nodeName = requiredValue(parseArg('node-name') || process.env.DEVICE_NODE_NAME, 'node-name');
  const apiKey = requiredValue(parseArg('api-key') || process.env.DEVICE_API_KEY, 'api-key');
  const allowedIp = parseArg('allowed-ip') || process.env.DEVICE_ALLOWED_IP || null;
  const existing = await findSyncDeviceByNodeId(nodeId);
  const payload = {
    nodeId,
    nodeName,
    status: 'active',
    apiKeyHash: hashApiKey(apiKey),
    allowedIp,
    updatedAt: new Date().toISOString()
  };

  if (existing) {
    await updateSyncDevice(existing.id, payload);
    console.log(`Updated sync device ${nodeId}.`);
    return;
  }

  const result = await createSyncDevice(payload);
  console.log(`Created sync device ${nodeId} with id ${result.lastID}.`);
}

main()
  .catch((error) => {
    process.exitCode = 1;
    console.error(`Unable to upsert sync device: ${error.message}`);
  })
  .finally(async () => {
    await close();
  });
