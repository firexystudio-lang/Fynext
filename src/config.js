'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const DEFAULTS = {
  agentName: 'fynext',
  ollamaUrl: 'http://127.0.0.1:11434',
  model: 'qwen2.5-coder:3b',
  modelProfiles: {
    local: 'qwen2.5-coder:3b',
    remote: 'gpt-4o-mini'
  },
  workflowPresets: [
    { id: 'review', label: 'Review & risk check', steps: ['/project', '/review', '/git'] },
    { id: 'build', label: 'Build & validate', steps: ['/mode build', 'npm test', 'npm run build'] },
    { id: 'changelog', label: 'Changelog summary', steps: ['/git', 'git log --oneline -10', 'Summarize changes'] },
    { id: 'pr-summary', label: 'PR summary', steps: ['/project', '/git', 'Review changed files', 'Summarize impact'] }
  ],
  systemPromptFile: 'config/system_prompt.txt',
  numCtx: 8192,
  maxNewTokens: 4096,
  temperature: 0.2,
  maxToolRounds: 10,
  approveDestructive: true,
  allowOutsideWorkspace: true,
  keepAlive: '10m',
  searchProvider: 'duckduckgo',
  searxngUrl: '',
  requestTimeoutSec: 30,
  maxOutputChars: 20000,
  maxReadBytes: 4194304,
  maxListEntries: 1000
};

function userSettingsPath() {
  const configRoot = process.env.XDG_CONFIG_HOME ||
    (process.platform === 'win32' && process.env.APPDATA) ||
    path.join(os.homedir(), '.config');
  return path.join(configRoot, 'fynext', 'settings.json');
}

function readSettings(settingsPath) {
  try {
    return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
}

function loadConfig() {
  let fileSettings;
  try {
    fileSettings = readSettings(path.join(ROOT, 'config', 'settings.json'));
  } catch (err) {
    process.stderr.write(`[config] settings.json okunamadi: ${err.message}\n`);
    fileSettings = {};
  }
  try {
    fileSettings = Object.assign(fileSettings, readSettings(userSettingsPath()));
  } catch (err) {
    process.stderr.write(`[config] kullanici ayarlari okunamadi: ${err.message}\n`);
  }

  const cfg = Object.assign({}, DEFAULTS, fileSettings);
  delete cfg.provider;
  delete cfg.apiBaseUrl;
  delete cfg.braveApiKey;
  cfg.root = ROOT;
  cfg.workspace = process.cwd();
  cfg.systemPromptPath = path.resolve(ROOT, cfg.systemPromptFile);
  return cfg;
}

function loadSystemPrompt(cfg) {
  try {
    return fs.readFileSync(cfg.systemPromptPath, 'utf8');
  } catch (err) {
    throw new Error(`Sistem promptu okunamadi (${cfg.systemPromptPath}): ${err.message}`);
  }
}

function saveSettingsPatch(patch) {
  const settingsPath = userSettingsPath();
  let settings;
  try {
    settings = readSettings(settingsPath);
  } catch (err) {
    throw new Error(`Kullanici ayarlari okunamadi: ${err.message}`);
  }
  const next = Object.assign(settings, patch);
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(next, null, 2) + '\n', 'utf8');
}

module.exports = { ROOT, loadConfig, loadSystemPrompt, saveSettingsPatch };
