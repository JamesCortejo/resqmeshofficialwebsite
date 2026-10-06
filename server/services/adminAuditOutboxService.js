const {
  deferAdminAuditOutbox,
  promoteAdminAuditOutboxBatch
} = require('../repositories/adminActionAuditRepository');

const BATCH_SIZE = 100;
const POLL_INTERVAL_MS = 2000;
let timer = null;
let running = false;

async function processAuditOutbox() {
  if (running) {
    return;
  }

  running = true;
  try {
    let processed;
    do {
      processed = await promoteAdminAuditOutboxBatch(BATCH_SIZE);
    } while (processed === BATCH_SIZE);
  } catch (error) {
    console.error('Unable to promote admin audit outbox:', error);
    try {
      await deferAdminAuditOutbox(BATCH_SIZE, error);
    } catch (deferError) {
      console.error('Unable to defer admin audit outbox records:', deferError);
    }
  } finally {
    running = false;
  }
}

function startAdminAuditOutboxProcessor() {
  if (timer) {
    return;
  }

  void processAuditOutbox();
  timer = setInterval(() => void processAuditOutbox(), POLL_INTERVAL_MS);
  timer.unref?.();
}

function stopAdminAuditOutboxProcessor() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = {
  processAuditOutbox,
  startAdminAuditOutboxProcessor,
  stopAdminAuditOutboxProcessor
};