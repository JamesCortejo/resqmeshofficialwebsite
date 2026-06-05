const path = require('path');
const dotenv = require('dotenv');
const sqlite3 = require('sqlite3').verbose();

const appRoot = path.resolve(__dirname, '..', '..');

dotenv.config({ path: path.join(appRoot, '.env') });

const configuredDatabasePath = process.env.SQLITE_DB_PATH || 'data/resqmesh.sqlite';
const databasePath = path.isAbsolute(configuredDatabasePath)
  ? configuredDatabasePath
  : path.join(appRoot, configuredDatabasePath);

const db = new sqlite3.Database(databasePath, sqlite3.OPEN_READONLY, (error) => {
  if (error) {
    console.error(`Could not open SQLite database read-only: ${databasePath}`);
    console.error(error.message);
    process.exit(1);
  }
});

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(rows);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(row);
    });
  });
}

function closeDatabase() {
  return new Promise((resolve, reject) => {
    db.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function printRows(title, rows, emptyMessage, formatter) {
  console.log(`\n${title}`);

  if (rows.length === 0) {
    console.log(`  ${emptyMessage}`);
    return;
  }

  rows.forEach((row) => {
    console.log(`  ${formatter(row)}`);
  });
}

async function duplicateLookupRows(columnName) {
  return all(`
    SELECT
      ${columnName} AS lookupHash,
      COUNT(*) AS count,
      GROUP_CONCAT(id) AS ids,
      GROUP_CONCAT(user_code) AS userCodes,
      GROUP_CONCAT(status) AS statuses
    FROM users
    WHERE ${columnName} IS NOT NULL AND ${columnName} != ''
    GROUP BY ${columnName}
    HAVING COUNT(*) > 1
    ORDER BY count DESC, ${columnName} ASC
  `);
}

async function main() {
  const usersTable = await get(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name = 'users'
  `);

  if (!usersTable) {
    throw new Error('The users table does not exist.');
  }

  const totalUsers = await get('SELECT COUNT(*) AS count FROM users');
  const statusCounts = await all(`
    SELECT status, COUNT(*) AS count
    FROM users
    GROUP BY status
    ORDER BY status ASC
  `);
  const duplicateUserCodes = await all(`
    SELECT
      user_code AS userCode,
      COUNT(*) AS count,
      GROUP_CONCAT(id) AS ids,
      GROUP_CONCAT(status) AS statuses
    FROM users
    GROUP BY user_code
    HAVING COUNT(*) > 1
    ORDER BY count DESC, user_code ASC
  `);
  const duplicateUsernameHashes = await duplicateLookupRows('username_lookup_hash');
  const duplicateEmailHashes = await duplicateLookupRows('email_lookup_hash');
  const duplicateIdNumberHashes = await duplicateLookupRows('id_number_lookup_hash');
  const legacyTables = await all(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name LIKE 'users_legacy%'
    ORDER BY name ASC
  `);
  const codeSequence = await get(`
    SELECT last_value AS lastValue
    FROM code_sequence
    WHERE id = 1
  `);

  console.log('ResQMesh user audit');
  console.log(`Database: ${databasePath}`);
  console.log(`Total users: ${totalUsers.count}`);
  console.log(`Current code sequence: ${codeSequence ? codeSequence.lastValue : 'missing'}`);

  printRows(
    'Status counts',
    statusCounts,
    'No users found.',
    (row) => `${row.status}: ${row.count}`
  );

  printRows(
    'Duplicate user_code values',
    duplicateUserCodes,
    'None found.',
    (row) => `${row.userCode} count=${row.count} ids=${row.ids} statuses=${row.statuses}`
  );

  printRows(
    'Duplicate username lookup hashes',
    duplicateUsernameHashes,
    'None found.',
    (row) => `hash=${row.lookupHash} count=${row.count} ids=${row.ids} userCodes=${row.userCodes}`
  );

  printRows(
    'Duplicate email lookup hashes',
    duplicateEmailHashes,
    'None found.',
    (row) => `hash=${row.lookupHash} count=${row.count} ids=${row.ids} userCodes=${row.userCodes}`
  );

  printRows(
    'Duplicate ID number lookup hashes',
    duplicateIdNumberHashes,
    'None found.',
    (row) => `hash=${row.lookupHash} count=${row.count} ids=${row.ids} userCodes=${row.userCodes}`
  );

  printRows(
    'Legacy user migration tables',
    legacyTables,
    'None found.',
    (row) => row.name
  );

  const hasAuditFindings = [
    duplicateUserCodes,
    duplicateUsernameHashes,
    duplicateEmailHashes,
    duplicateIdNumberHashes,
    legacyTables
  ].some((rows) => rows.length > 0);

  if (hasAuditFindings) {
    process.exitCode = 1;
    console.log('\nAudit completed with findings.');
  } else {
    console.log('\nAudit completed with no duplicate user identities or legacy user tables.');
  }
}

main()
  .catch((error) => {
    process.exitCode = 1;
    console.error(`\nUser audit failed: ${error.message}`);
  })
  .finally(async () => {
    await closeDatabase().catch((error) => {
      process.exitCode = 1;
      console.error(`Could not close database: ${error.message}`);
    });
  });
