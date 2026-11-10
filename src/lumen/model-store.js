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

  let offset = 0;
  try {
    const stat = await fs.promises.stat(partial);
    if (stat.isFile() && stat.size < model.size) offset = stat.size;
    else await fs.promises.rm(partial, { force: true });
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  const headers = offset ? { Range: `bytes=${offset}-` } : {};
  let response;
  try {
    response = await fetchImpl(model.url, { headers, signal: options.signal });
  } catch (err) {
    if (options.signal && options.signal.aborted) {
      throw new Error('Lumen model download was cancelled. The partial file was kept so it can resume next time.');
    }
    throw new Error(`Could not connect to the Lumen model host: ${err.message}`);
  }
  if (response.status !== 200 && response.status !== 206) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Lumen model download failed (HTTP ${response.status}): ${detail.slice(0, 300)}`);
  }

  if (offset && response.status === 206) {
    const contentRange = response.headers.get('content-range') || '';
    const match = contentRange.match(/^bytes\s+(\d+)-/i);
    if (!match || Number(match[1]) !== offset) {
      throw new Error('The model server returned an invalid range while resuming the download.');
    }
  } else {
    offset = 0;
  }

  if (!response.body) throw new Error('The model server returned an empty download.');
  let completed = offset;
  const meter = new Transform({
    transform(chunk, encoding, callback) {
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
      { signal: options.signal }
    );
    if (completed !== model.size) {
      throw new Error(`Incomplete model download: expected ${model.size} bytes, received ${completed}.`);
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
    if (err.name === 'AbortError' || (options.signal && options.signal.aborted)) {
      throw new Error('Lumen model download was cancelled. The partial file was kept so it can resume next time.');
    }
    throw err;
  }
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
