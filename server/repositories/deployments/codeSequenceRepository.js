const { transaction } = require('../../database/postgres');

function formatDeploymentCode(value) {
  return `DPL-${String(value).padStart(3, '0')}`;
}

function formatOnlineDistressCode(value) {
  return `ODR-${String(value).padStart(3, '0')}`;
}

async function generateDeploymentCode() {
  return transaction(async (trx) => {
    const row = await trx.get('SELECT last_value FROM deployment_code_sequence WHERE id = 1 FOR UPDATE');
    const nextValue = row.last_value + 1;

    await trx.run('UPDATE deployment_code_sequence SET last_value = ? WHERE id = 1', [nextValue]);

    return formatDeploymentCode(nextValue);
  });
}

async function generateOnlineDistressCode() {
  return transaction(async (trx) => {
    const row = await trx.get('SELECT last_value FROM online_distress_code_sequence WHERE id = 1 FOR UPDATE');
    const nextValue = row.last_value + 1;

    await trx.run('UPDATE online_distress_code_sequence SET last_value = ? WHERE id = 1', [nextValue]);

    return formatOnlineDistressCode(nextValue);
  });
}

module.exports = {
  generateDeploymentCode,
  generateOnlineDistressCode
};
