'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Transform, Readable } = require('stream');
const { pipeline } = require('stream/promises');
const { MODELS, getModel } = require('./models');

const GGUF_MAGIC = Buffer.from('GGUF');

function modelDirectory(cfg) {
  if (cfg && cfg.lumenModelDir) return path.resolve(cfg.lumenModelDir);
  const configRoot = process.env.XDG_CONFIG_HOME ||
    (process.platform === 'win32' && process.env.APPDATA) ||
    path.join(os.homedir(), '.config');
  return path.join(configRoot, 'fynext', 'models', 'lumen');
}

function modelPath(cfg, model) {
  if (!model || path.basename(model.file) !== model.file) {
    throw new Error('Invalid Lumen model catalog entry.');
  }
  return path.join(modelDirectory(cfg), model.file);
}

async function hasValidHeader(filePath) {
  let handle;
  try {
    handle = await fs.promises.open(filePath, 'r');
    const header = Buffer.alloc(GGUF_MAGIC.length);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    return bytesRead === GGUF_MAGIC.length && header.equals(GGUF_MAGIC);
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    throw err;
  } finally {
    if (handle) await handle.close();
  }
}

async function isModelInstalled(cfg, model) {
  const filePath = modelPath(cfg, model);
  try {
    const stat = await fs.promises.stat(filePath);
    return stat.isFile() && stat.size === model.size && await hasValidHeader(filePath);
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    throw err;
  }
}

async function hashFile(filePath) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

const RETRYABLE_ERROR_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ECONNABORTED',
  'EPIPE',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'ENETDOWN',
  'ENETRESET',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'UND_ERR_SOCKET',
  'UND_ERR_CLOSED',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT'
]);

const DEFAULT_MAX_ATTEMPTS = 6;
const DEFAULT_RETRY_DELAY_MS = 1500;
const DEFAULT_STALL_TIMEOUT_MS = 60000;

function cancelledDownloadError() {
  return new Error('Lumen model download was cancelled. The partial file was kept so it can resume next time.');
}

function isRetryableDownloadError(err) {
  if (!err || err.name === 'AbortError') return false;
  if (err.retryable === true) return true;
  if (err.code && RETRYABLE_ERROR_CODES.has(err.code)) return true;
  const message = String(err.message || '');
  return /terminated|other side closed|socket hang up|premature close|fetch failed|connection (?:reset|closed|refused)|Incomplete model download|stalled|HTTP (?:429|5\d\d)/i.test(message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function combineSignals(signals) {
  const active = signals.filter(Boolean);
  if (active.length === 1) return active[0];
  if (typeof AbortSignal.any === 'function') return AbortSignal.any(active);
  const controller = new AbortController();
  for (const signal of active) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
    signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
}

function createStallGuard(timeoutMs) {
  let timer = null;
  const state = { stalled: false };
  const arm = () => {
    if (!timeoutMs) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      state.stalled = true;
      if (state.controller) state.controller.abort();
    }, timeoutMs);
    if (timer.unref) timer.unref();
  };
  const disarm = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  return { state, arm, disarm };
}

async function attemptDownload(model, destination, partial, fetchImpl, onProgress, options) {
  let offset = 0;
  try {
    const stat = await fs.promises.stat(partial);
    if (stat.isFile() && stat.size < model.size) offset = stat.size;
    else await fs.promises.rm(partial, { force: true });
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  const controller = new AbortController();
  const stall = createStallGuard(options.stallTimeoutMs);
  stall.state.controller = controller;
  const signal = combineSignals([controller.signal, options.signal]);
  const headers = offset ? { Range: `bytes=${offset}-` } : {};

  let response;
  try {
    stall.arm();
    response = await fetchImpl(model.url, { headers, signal });
  } catch (err) {
    stall.disarm();
    if (options.signal && options.signal.aborted) throw cancelledDownloadError();
    if (stall.state.stalled) {
      const timeoutErr = new Error(`The model host stopped responding before the download started (stalled for ${Math.round(options.stallTimeoutMs / 1000)}s).`);
      timeoutErr.retryable = true;
      throw timeoutErr;
    }
    const wrapped = new Error(`Could not connect to the Lumen model host: ${err.message}`);
    wrapped.code = err.code;
    wrapped.cause = err;
    wrapped.retryable = isRetryableDownloadError(err);
    throw wrapped;
  }

  if (response.status !== 200 && response.status !== 206) {
    const detail = await response.text().catch(() => '');
    const error = new Error(`Lumen model download failed (HTTP ${response.status}): ${detail.slice(0, 300)}`);
    error.retryable = response.status === 429 || response.status >= 500;
    throw error;
  }

  if (offset && response.status === 206) {
    const contentRange = response.headers.get('content-range') || '';
    const match = contentRange.match(/^bytes\s+(\d+)-/i);
    if (!match || Number(match[1]) !== offset) {
      if (response.body && typeof response.body.cancel === 'function') {
        await response.body.cancel().catch(() => {});
      }
      const error = new Error('The model server returned an invalid range while resuming the download.');
      error.retryable = true;
      throw error;
    }
  } else {
    offset = 0;
  }

  if (!response.body) {
    const error = new Error('The model server returned an empty download.');
    error.retryable = true;
    throw error;
  }

  let completed = offset;
  const meter = new Transform({
    transform(chunk, encoding, callback) {
      stall.arm();
      completed += chunk.length;
      if (completed > model.size) {
        callback(new Error('The downloaded model is larger than expected.'));
        return;
      }
      if (onProgress) {
        try {
          onProgress({ completed, total: model.size });
        } catch (err) {
          callback(err);
          return;
        }
      }
      callback(null, chunk);
    }
  });

  try {
    await pipeline(
      Readable.fromWeb(response.body),
      meter,
      fs.createWriteStream(partial, { flags: offset ? 'a' : 'w' }),
      { signal }
    );
    if (completed !== model.size) {
      const error = new Error(`Incomplete model download: expected ${model.size} bytes, received ${completed}.`);
      error.retryable = true;
      throw error;
    }
    if (!await hasValidHeader(partial)) {
      throw new Error('The downloaded file is not a valid GGUF model.');
    }
    const actualHash = await hashFile(partial);
    if (actualHash.toLowerCase() !== model.sha256.toLowerCase()) {
      throw new Error('The downloaded model failed its SHA-256 integrity check.');
    }

    await fs.promises.rename(partial, destination);
    return destination;
  } catch (err) {
    if (options.signal && options.signal.aborted) throw cancelledDownloadError();
    if (stall.state.stalled) {
      const timeoutErr = new Error(`The model host stopped sending data (stalled for ${Math.round(options.stallTimeoutMs / 1000)}s).`);
      timeoutErr.retryable = true;
      throw timeoutErr;
    }
    throw err;
  } finally {
    stall.disarm();
  }
}

async function downloadModel(cfg, modelId, onProgress, options = {}) {
  const catalog = options.catalog || MODELS;
  const model = catalog.find((item) => item.id === modelId);
  if (!model || typeof model.file !== 'string' || !model.url ||
      !Number.isSafeInteger(model.size) || model.size <= 0 ||
      !/^[a-f0-9]{64}$/i.test(model.sha256 || '') ||
      path.basename(model.file) !== model.file) {
    throw new Error(`Unknown or invalid Lumen model: ${modelId}`);
  }

  const directory = options.modelDirectory || modelDirectory(cfg);
  const destination = path.join(directory, path.basename(model.file));
  const partial = destination + '.partial';
  const fetchImpl = options.fetchImpl || fetch;
  await fs.promises.mkdir(directory, { recursive: true });

  if (await isModelInstalled({ lumenModelDir: directory }, model)) {
    return destination;
  }

  const maxAttempts = Number.isSafeInteger(options.maxAttempts) && options.maxAttempts > 0
    ? options.maxAttempts
    : DEFAULT_MAX_ATTEMPTS;
  const retryDelayMs = Number.isFinite(options.retryDelayMs) && options.retryDelayMs >= 0
    ? options.retryDelayMs
    : DEFAULT_RETRY_DELAY_MS;
  const stallTimeoutMs = Number.isFinite(options.stallTimeoutMs) && options.stallTimeoutMs >= 0
    ? options.stallTimeoutMs
    : DEFAULT_STALL_TIMEOUT_MS;

  const downloadOptions = { ...options, stallTimeoutMs };
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await attemptDownload(model, destination, partial, fetchImpl, onProgress, downloadOptions);
    } catch (err) {
      if (options.signal && options.signal.aborted) throw cancelledDownloadError();
      lastError = err;
      if (!isRetryableDownloadError(err) || attempt >= maxAttempts) break;
      if (options.onRetry) {
        try {
          options.onRetry({ attempt, maxAttempts, error: err });
        } catch (_) { /* progress hooks must not break the download */ }
      }
      const delay = Math.min(15000, retryDelayMs * (2 ** (attempt - 1)));
      if (delay > 0) await sleep(delay);
    }
  }

  if (lastError) {
    if (!lastError.retryable && isRetryableDownloadError(lastError) === false) throw lastError;
    lastError.message = `${lastError.message} The partial file was kept, so the next attempt will resume from where it stopped.`;
  }
  throw lastError;
}

async function listInstalledModels(cfg) {
  const installed = [];
  for (const model of MODELS) {
    if (await isModelInstalled(cfg, model)) installed.push(model.id);
  }
  return installed;
}

function getModelStatus(cfg, modelId) {
  const model = getModel(modelId);
  if (!model) return null;
  return { ...model, path: modelPath(cfg, model) };
}

module.exports = {
  modelDirectory,
  modelPath,
  hasValidHeader,
  isModelInstalled,
  downloadModel,
  listInstalledModels,
  getModelStatus
};
