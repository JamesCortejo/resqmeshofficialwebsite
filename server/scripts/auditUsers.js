const { initializeDatabase, all, get, close } = require('../database/postgres');

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
      STRING_AGG(id::text, ',') AS ids,
      STRING_AGG(user_code, ',') AS userCodes,
      STRING_AGG(status, ',') AS statuses
    FROM users
    WHERE ${columnName} IS NOT NULL AND ${columnName} <> ''
    GROUP BY ${columnName}
    HAVING COUNT(*) > 1
    ORDER BY count DESC, ${columnName} ASC
  `);
}

async function main() {
  await initializeDatabase();

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
      STRING_AGG(id::text, ',') AS ids,
      STRING_AGG(status, ',') AS statuses
    FROM users
    GROUP BY user_code
    HAVING COUNT(*) > 1
    ORDER BY count DESC, user_code ASC
  `);
  const duplicateUsernameHashes = await duplicateLookupRows('username_lookup_hash');
  const duplicateEmailHashes = await duplicateLookupRows('email_lookup_hash');
  const duplicateIdNumberHashes = await duplicateLookupRows('id_number_lookup_hash');
  const codeSequence = await get(`
    SELECT last_value AS lastValue
    FROM code_sequence
    WHERE id = 1
  `);

  console.log('ResQMesh PostgreSQL user audit');
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

  const hasAuditFindings = [
    duplicateUserCodes,
    duplicateUsernameHashes,
    duplicateEmailHashes,
    duplicateIdNumberHashes
  ].some((rows) => rows.length > 0);

  if (hasAuditFindings) {
    process.exitCode = 1;
    console.log('\nAudit completed with findings.');
  } else {
    console.log('\nAudit completed with no duplicate user identities.');
  }
}

main()
  .catch((error) => {
    process.exitCode = 1;
    console.error(`\nUser audit failed: ${error.message}`);
  })
  .finally(async () => {
    await close().catch((error) => {
      process.exitCode = 1;
      console.error(`Could not close database: ${error.message}`);
    });
  });
