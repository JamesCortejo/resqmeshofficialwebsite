const fs = require('fs');
const {
  RELEASE_STATE_PATH,
  getPublishedRelease,
  inspectRelease,
  publishRelease,
  unpublishRelease
} = require('../services/mobileReleaseService');

function parseArguments(values) {
  const args = {};
  for (let index = 0; index < values.length; index += 1) {
    const token = values[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith('--')) throw new Error(`Missing value for --${key}.`);
    args[key] = next;
    index += 1;
  }
  return args;
}

function readOptions(args) {
  const notesFile = args['notes-file'];
  if (!notesFile || !fs.existsSync(notesFile)) {
    throw new Error('--notes-file must reference an existing text file.');
  }
  return {
    apkPath: args.apk,
    versionName: args['version-name'],
    versionCode: args['version-code'],
    releaseNotes: fs.readFileSync(notesFile, 'utf8')
  };
}

function printRelease(label, release) {
  console.log(label);
  console.log(`- Version: ${release.versionName} (${release.versionCode})`);
  console.log(`- File: ${release.filename}`);
  console.log(`- Size: ${release.sizeBytes} bytes`);
  console.log(`- MD5: ${release.md5}`);
  console.log(`- SHA-256: ${release.sha256}`);
  if (release.publishedAt) console.log(`- Published: ${release.publishedAt}`);
}

async function main() {
  const [command, ...values] = process.argv.slice(2);
  const args = parseArguments(values);

  if (command === 'status') {
    const release = getPublishedRelease();
    if (!release) {
      console.log('No Android mobile release is published.');
      return;
    }
    printRelease('Published Android mobile release', release);
    return;
  }

  if (command === 'unpublish') {
    console.log(unpublishRelease()
      ? `Release unpublished. Previous metadata retained beside ${RELEASE_STATE_PATH}.`
      : 'No Android mobile release was published.');
    return;
  }

  if (command === 'check' || command === 'publish') {
    const options = readOptions(args);
    const release = command === 'publish'
      ? await publishRelease(options)
      : await inspectRelease(options);
    printRelease(command === 'publish' ? 'Android release published' : 'Android release validation passed', release);
    return;
  }

  throw new Error('Usage: mobile:release -- <check|publish|status|unpublish> [options]');
}

main().catch((error) => {
  console.error(`Mobile release command failed: ${error.message}`);
  process.exitCode = 1;
});
