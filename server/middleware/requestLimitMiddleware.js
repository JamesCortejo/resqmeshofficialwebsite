const express = require('express');

const NORMAL_JSON_LIMIT = '256kb';
const NORMAL_URLENCODED_LIMIT = '128kb';
const DEVICE_SYNC_JSON_LIMIT = '2mb';
const VOICE_JSON_LIMIT = '3mb';

const normalJsonParser = express.json({ limit: NORMAL_JSON_LIMIT });
const normalUrlencodedParser = express.urlencoded({ extended: true, limit: NORMAL_URLENCODED_LIMIT });
const deviceSyncJsonParser = express.json({ limit: DEVICE_SYNC_JSON_LIMIT });
const voiceJsonParser = express.json({ limit: VOICE_JSON_LIMIT });

function isJsonRequest(req) {
  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  return contentType.includes('application/json') || contentType.includes('+json');
}

function isUrlencodedRequest(req) {
  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  return contentType.includes('application/x-www-form-urlencoded');
}

function isOnlineVoiceRequest(req) {
  return req.method === 'POST'
    && /^\/api\/(?:civilian|rescuer)\/online-chat\/conversations\/[^/]+\/voice\/?$/i.test(req.path);
}

function isDeviceSyncRequest(req) {
  return req.method === 'POST'
    && /^\/api\/device-sync\/(?:nodes|node-health|node-neighbors|distress-signals|messages|audit-logs)\/batch\/?$/i.test(req.path);
}

function requestBodyParser(req, res, next) {
  if (isOnlineVoiceRequest(req) && isJsonRequest(req)) {
    voiceJsonParser(req, res, next);
    return;
  }

  if (isDeviceSyncRequest(req) && isJsonRequest(req)) {
    deviceSyncJsonParser(req, res, next);
    return;
  }

  if (isJsonRequest(req)) {
    normalJsonParser(req, res, next);
    return;
  }

  if (isUrlencodedRequest(req)) {
    normalUrlencodedParser(req, res, next);
    return;
  }

  next();
}

function handleBodyParserErrors(error, req, res, next) {
  if (!error) {
    next();
    return;
  }

  if (error.type === 'entity.too.large') {
    res.status(413).json({
      success: false,
      message: 'Request payload is too large.'
    });
    return;
  }

  if (error instanceof SyntaxError && 'body' in error) {
    res.status(400).json({
      success: false,
      message: 'Request body contains invalid JSON.'
    });
    return;
  }

  next(error);
}

module.exports = {
  handleBodyParserErrors,
  requestBodyParser
};
