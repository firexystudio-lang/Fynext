'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const api = require('../ai/api');

const ROOT = path.resolve(__dirname, '../..');

const DEFAULTS = {
  agentName: 'fynext',
  provider: 'ollama',
  ollamaUrl: 'http://127.0.0.1:11434',
  model: 'qwen2.5-coder:3b',
  modelProfiles: {
    local: 'qwen2.5-coder:3b',
    remote: 'gpt-4o-mini'
  },
  providerModels: {},
  apiKey: '',
  apiKeys: {},
  apiBaseUrl: '',
  apiBaseUrls: {},
  autoPullModel: false,
  workflowPresets: [
    { id: 'review', label: 'Review & risk check', steps: ['/project', '/review', '/git'] },
    { id: 'build', label: 'Build & validate', steps: ['/mode build', 'npm test', 'npm run build'] },
    { id: 'changelog', label: 'Changelog summary', steps: ['/git', 'git log --oneline -10', 'Summarize changes'] },
    { id: 'pr-summary', label: 'PR summary', steps: ['/project', '/git', 'Review changed files', 'Summarize impact'] }
  ],
  systemPromptFile: 'config/system_prompt.txt',
  theme: 'fynext',
  thinkingExpanded: false,
  diffView: 'inline',
  notifications: true,
  editor: '',
  keybinds: {},
  numCtx: 8192,
  maxNewTokens: 4096,
  temperature: 0.2,
  topP: 0.9,
  repeatPenalty: 1.1,
  maxToolRounds: 10,
  approveDestructive: true,
  allowPackageInstall: false,
  allowOutsideWorkspace: true,
  keepAlive: '10m',
  lumenGpu: 'auto',
  searchProvider: 'duckduckgo',
  searxngUrl: '',
  robotFaceEnabled: false,
  robotFacePort: 'auto',
  robotFaceBaud: 115200,
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
    process.stderr.write(`[config] Could not read settings.json: ${err.message}\n`);
    fileSettings = {};
  }
  try {
    fileSettings = Object.assign(fileSettings, readSettings(userSettingsPath()));
  } catch (err) {
    process.stderr.write(`[config] Could not read user settings: ${err.message}\n`);
  }

  const cfg = Object.assign({}, DEFAULTS, fileSettings);
  delete cfg.braveApiKey;
  cfg.provider = api.normalizeProviderId(cfg.provider);
  const supportedProviders = ['ollama', 'lumen', ...api.providerIds()];
  if (!supportedProviders.includes(cfg.provider)) {
    throw new Error(
      `Unknown model provider "${cfg.provider}". Supported providers: ${supportedProviders.join(', ')}.`
    );
  }
  if (!cfg.apiKeys || typeof cfg.apiKeys !== 'object' || Array.isArray(cfg.apiKeys)) cfg.apiKeys = {};
  if (!cfg.apiBaseUrls || typeof cfg.apiBaseUrls !== 'object' || Array.isArray(cfg.apiBaseUrls)) {
    cfg.apiBaseUrls = {};
  }
  if (!cfg.providerModels || typeof cfg.providerModels !== 'object' || Array.isArray(cfg.providerModels)) {
    cfg.providerModels = {};
  }
  if (!Object.prototype.hasOwnProperty.call(fileSettings, 'model')) {
    if (cfg.provider === 'lumen') cfg.model = require('../lumen/models').DEFAULT_MODEL_ID;
    else if (api.isApiProvider(cfg.provider)) cfg.model = api.defaultModel(cfg.provider);
  }
  cfg.lumenGpu = String(cfg.lumenGpu || 'auto').toLowerCase();
  if (!['auto', 'cpu'].includes(cfg.lumenGpu)) {
    throw new Error(`Unknown Lumen GPU mode "${cfg.lumenGpu}". Use auto or cpu.`);
  }
  cfg.root = ROOT;
  cfg.workspace = process.cwd();
  const configRoot = process.env.XDG_CONFIG_HOME ||
    (process.platform === 'win32' && process.env.APPDATA) ||
    path.join(os.homedir(), '.config');
  cfg.lumenModelDir = process.env.FYNEXT_MODEL_DIR ||
    cfg.lumenModelDir ||
    path.join(configRoot, 'fynext', 'models', 'lumen');
  cfg.systemPromptPath = path.resolve(ROOT, cfg.systemPromptFile);
  return cfg;
}

function loadSystemPrompt(cfg) {
  try {
    return fs.readFileSync(cfg.systemPromptPath, 'utf8');
  } catch (err) {
    throw new Error(`Could not read system prompt (${cfg.systemPromptPath}): ${err.message}`);
  }
}

function saveSettingsPatch(patch) {
  const settingsPath = userSettingsPath();
  let settings;
  try {
    settings = readSettings(settingsPath);
  } catch (err) {
    throw new Error(`Could not read user settings: ${err.message}`);
  }
  const next = Object.assign(settings, patch);
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(next, null, 2) + '\n', {
    encoding: 'utf8',
    mode: 0o600
  });
  try {
    fs.chmodSync(settingsPath, 0o600);
  } catch (_) {
    /* Best effort on platforms without POSIX modes (Windows). */
  }
}

module.exports = { ROOT, loadConfig, loadSystemPrompt, saveSettingsPatch, userSettingsPath };
