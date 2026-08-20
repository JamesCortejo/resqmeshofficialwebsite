const { Pool, types } = require('pg');
const config = require('../config/env');
const { prepareSql } = require('./sqlCompat');

types.setTypeParser(1082, (value) => value);
types.setTypeParser(1114, (value) => new Date(`${value}Z`).toISOString());
types.setTypeParser(1184, (value) => new Date(value).toISOString());
types.setTypeParser(20, (value) => Number(value));

const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

pool.on('connect', (client) => {
  client.query("SET TIME ZONE 'UTC'").catch((error) => {
    console.error('Failed to set PostgreSQL timezone:', error);
  });
});

function createHelpers(client) {
  async function run(sql, params = []) {
    const result = await client.query(prepareSql(sql), params);
    const firstRow = result.rows && result.rows[0] ? result.rows[0] : null;

    return {
      lastID: firstRow ? firstRow.id || firstRow.lastID || firstRow.lastid : undefined,
      changes: result.rowCount,
      rows: result.rows
    };
  }

  async function get(sql, params = []) {
    const result = await client.query(prepareSql(sql), params);
    return result.rows[0];
  }

  async function all(sql, params = []) {
    const result = await client.query(prepareSql(sql), params);
    return result.rows;
  }

  async function exec(sql) {
    await client.query(sql);
  }

  return { run, get, all, exec };
}

async function withClient(callback) {
  const client = await pool.connect();

  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

async function run(sql, params = []) {
  return withClient((client) => createHelpers(client).run(sql, params));
}

async function get(sql, params = []) {
  return withClient((client) => createHelpers(client).get(sql, params));
}

async function all(sql, params = []) {
  return withClient((client) => createHelpers(client).all(sql, params));
}

async function exec(sql) {
  return withClient((client) => createHelpers(client).exec(sql));
}

async function transaction(callback) {
  return withClient(async (client) => {
    const helpers = createHelpers(client);

    await client.query('BEGIN');

    try {
      const result = await callback(helpers);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
}

async function close() {
  await pool.end();
}

module.exports = {
  run,
  get,
  all,
  exec,
  transaction,
  close,
  pool
};
