const https = require('https');
const querystring = require('querystring');
const config = require('../config/env');

const VERIFY_HOST = 'www.google.com';
const VERIFY_PATH = '/recaptcha/api/siteverify';
const MIN_SCORE = 0.5;
const PUBLIC_FAILURE_MESSAGE = 'Security verification failed. Please refresh the page and try again.';

function isLocalDevelopmentHost(hostname) {
  const normalized = String(hostname || '').split(':')[0].toLowerCase();
  return ['localhost', '127.0.0.1', '::1'].includes(normalized);
}

function shouldBypassLocalVerification(hostname) {
  return process.env.NODE_ENV !== 'production' && isLocalDevelopmentHost(hostname);
}

function postVerifyRequest(payload) {
  const body = querystring.stringify(payload);

  return new Promise((resolve, reject) => {
    const request = https.request({
      hostname: VERIFY_HOST,
      path: VERIFY_PATH,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 5000
    }, (response) => {
      let data = '';

      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        data += chunk;
      });
      response.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (error) {
          reject(error);
        }
      });
    });

    request.on('timeout', () => {
      request.destroy(new Error('reCAPTCHA verification timed out.'));
    });
    request.on('error', reject);
    request.write(body);
    request.end();
  });
}

async function verifyRecaptcha(token, expectedAction, options = {}) {
  if (!config.recaptcha.secretKey) {
    return;
  }

  if (shouldBypassLocalVerification(options.hostname)) {
    return;
  }

  if (!token || String(token).trim() === '') {
    const error = new Error(PUBLIC_FAILURE_MESSAGE);
    error.statusCode = 400;
    throw error;
  }

  const result = await postVerifyRequest({
    secret: config.recaptcha.secretKey,
    response: String(token).trim(),
    remoteip: options.remoteIp || undefined
  });

  const score = Number(result.score || 0);

  if (!result.success || result.action !== expectedAction || score < MIN_SCORE) {
    console.warn('reCAPTCHA verification rejected:', {
      expectedAction,
      receivedAction: result.action || null,
      score: Number.isFinite(score) ? score : null,
      hostname: result.hostname || null,
      errors: result['error-codes'] || []
    });

    const error = new Error(PUBLIC_FAILURE_MESSAGE);
    error.statusCode = 400;
    throw error;
  }
}

module.exports = {
  verifyRecaptcha
};
