'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const api = require('../ai/api');

function baseUrl(cfg) {
  return String(cfg.ollamaUrl || 'http://127.0.0.1:11434').replace(/\/+$/, '');
}

function isLocalUrl(cfg) {
  try {
    const host = new URL(baseUrl(cfg)).hostname.toLowerCase();
    return host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === '[::1]';
  } catch (_) {
    return false;
  }
}

async function* readLines(body) {
  const decoder = new TextDecoder();
  let buf = '';
  for await (const chunk of body) {
    buf += decoder.decode(chunk, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (line) yield line;
    }
  }
  if (buf.trim()) yield buf.trim();
}

async function fetchTags(cfg, timeoutMs) {
  try {
    const res = await fetch(baseUrl(cfg) + '/api/tags', {
      signal: AbortSignal.timeout(timeoutMs || 5000)
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.models || []).map((m) => String(m.name || '')).filter(Boolean);
  } catch (_) {
    return null;
  }
}

function formatBytes(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = n;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size >= 100 || unit === 0 ? Math.round(size) : size.toFixed(1)} ${units[unit]}`;
}

function progressText(event) {
  const status = event.status || 'Downloading';
  if (event.total && event.completed != null) {
    const pct = Math.max(0, Math.min(100, Math.floor((event.completed / event.total) * 100)));
    return `${status} %${pct} (${formatBytes(event.completed)} / ${formatBytes(event.total)})`;
  }
  return status;
}

function ollamaBinary() {
  if (process.platform === 'win32') {
    const candidates = [];
    if (process.env.LOCALAPPDATA) {
      candidates.push(path.join(process.env.LOCALAPPDATA, 'Programs', 'Ollama', 'ollama.exe'));
    }
    if (process.env.ProgramFiles) {
      candidates.push(path.join(process.env.ProgramFiles, 'Ollama', 'ollama.exe'));
    }
    for (const candidate of candidates) {
      try {
        if (fs.existsSync(candidate)) return candidate;
      } catch (_) {
        /* yoksay */
      }
    }
  }
  return 'ollama';
}

function startOllama() {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    try {
      const child = spawn(ollamaBinary(), ['serve'], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        env: process.env
      });
      child.once('error', () => finish(false));
      child.once('spawn', () => {
        child.unref();
        finish(true);
      });
      const timer = setTimeout(() => finish(true), 1500);
      if (timer && typeof timer.unref === 'function') timer.unref();
    } catch (_) {
      finish(false);
    }
  });
}

async function waitForOllama(cfg, seconds, onTick) {
  const deadline = Date.now() + Math.max(1, seconds) * 1000;
  while (Date.now() < deadline) {
    const models = await fetchTags(cfg, 2500);
    if (models) return models;
    if (onTick) onTick();
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
  return null;
}

function hasModel(models, target) {
  const wanted = String(target || '').trim();
  if (!wanted) return false;
  if (models.includes(wanted)) return true;
  if (!wanted.includes(':') && models.includes(wanted + ':latest')) return true;
  if (wanted.endsWith(':latest') && models.includes(wanted.slice(0, -7))) return true;
  return false;
}

async function pullModel(cfg, model, onProgress) {
  const res = await fetch(baseUrl(cfg) + '/api/pull', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, stream: true })
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Model indirilemedi (HTTP ${res.status}): ${text.slice(0, 300)}`);
  }
  for await (const line of readLines(res.body)) {
    let event;
    try {
      event = JSON.parse(line);
    } catch (_) {
      continue;
    }
    if (event.error) throw new Error('Ollama: ' + event.error);
    if (onProgress) onProgress(event);
    if (event.status === 'success') return;
  }
}

function emitWarning(options, message) {
  if (typeof options.warn === 'function') options.warn(message);
  else if (typeof options.log === 'function') options.log(message);
}

async function ensureReady(cfg, opts) {
  const options = opts || {};
  const log = options.log || ((line) => process.stdout.write(line + '\n'));
  const warn = (line) => emitWarning(options, line);
  const tty = options.tty !== undefined ? options.tty : !!process.stdout.isTTY;

  if (cfg.provider === 'lumen') {
    const lumen = require('../lumen');
    const model = lumen.getModel(cfg.model);
    if (!model) {
      warn(`Unknown Lumen model "${cfg.model}". Choose a supported model with /models.`);
      return [];
    }
    if (!await lumen.isModelInstalled(cfg, model)) {
      warn(`Lumen model "${model.name}" is not installed. Run /model ${model.id} to download it (${formatBytes(model.size)}).`);
    }
    return lumen.listModels(cfg);
  }

  if (api.isApiProvider(cfg.provider)) {
    const info = api.getProvider(cfg.provider);
    const key = api.resolveApiKey(cfg);
    if (!key) {
      warn(api.missingKeyMessage(cfg));
      return [];
    }
    if (options.validateApi === true) {
      try {
        const models = await api.listModels(cfg);
        return models;
      } catch (err) {
        warn(`Could not verify the ${info.label} API key: ${err.message}`);
        return [];
      }
    }
    return [];
  }

  if (cfg.provider !== 'ollama') {
    warn(`Unsupported model provider: ${cfg.provider}`);
    return [];
  }

  let models = await fetchTags(cfg, 1500);
  if (!models) {
    if (!isLocalUrl(cfg)) {
      warn(
        `Cannot reach Ollama at ${baseUrl(cfg)}. Check that the remote server is running; Fynext will still start.`
      );
      return [];
    }
    log('Starting Ollama…');
    if (await startOllama()) {
      let dots = 0;
      const waitSeconds = Number(options.waitSeconds) > 0 ? Number(options.waitSeconds) : 8;
      models = await waitForOllama(cfg, waitSeconds, () => {
        dots += 1;
        if (!tty && dots % 4 === 0) log('Waiting for Ollama…');
      });
    }
    if (!models) {
      warn(
        'Ollama is not running or installable. Fynext will start without a local model.\n' +
        'Install it from https://ollama.com/download, run "ollama serve", ' +
        'or switch to a cloud provider with /engine openai|anthropic|gemini.'
      );
      return [];
    }
  }

  if (!hasModel(models, cfg.model)) {
    if (cfg.autoPullModel === true) {
      log(`Downloading model: ${cfg.model}`);
      let last = '';
      const render = (event) => {
        const text = progressText(event);
        if (text === last) return;
        last = text;
        if (tty) process.stdout.write('\r\x1b[2K' + text);
        else log(text);
      };
      await pullModel(cfg, cfg.model, render);
      if (tty) process.stdout.write('\r\x1b[2K');
      log(`Model ready: ${cfg.model}`);
      models = (await fetchTags(cfg, 5000)) || models.concat([cfg.model]);
    } else {
      warn(
        `Ollama model "${cfg.model}" is not installed. ` +
        `Choose an installed model with /models or download it with /model ${cfg.model}.`
      );
    }
  }

  return models;
}

module.exports = {
  baseUrl,
  fetchTags,
  ensureReady,
  pullModel,
  hasModel,
  progressText,
  formatBytes,
  startOllama,
  waitForOllama
};
