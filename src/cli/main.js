#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const pkg = require('../../package.json');
const { loadConfig, loadSystemPrompt, saveSettingsPatch } = require('../config');
const llm = require('../ai/llm');
const lumen = require('../lumen');
const tools = require('../tools');
const setup = require('../setup');
const projectContext = require('../context/project-context');
const { Screen, sanitize } = require('../ui/screen');
const { copyToClipboard, extractCodeBlocks } = require('../ui/clipboard');
const { PlainPresenter } = require('../ui/plain');
const chatHistory = require('../history/chat-history');
const changeTracker = require('../history/change-tracker');
const { requiresToolFollowThrough, requiresWebSearch, promisesWebSearch, requiresImplementation } = require('../agent/task-intent');
const { resolveMentions } = require('../context/mention-resolver');
const { autoCompactMessages } = require('../context/conversation-memory');
const { describeToolAction, liveStatusFromText, stripStatusInstructions, stripStatusLine, StatusStreamFilter } = require('../agent/tool-status');
const featureRoadmap = require('../workflow/feature-roadmap');
const theme = require('../ui/theme');
const { playCompletionSound, showCompletionNotification } = require('../ui/completion-sound');
const faceBridge = require('../robot/face-bridge');

const MAX_CALLS = 30;

const COMMAND_HELP = [
  'Commands:',
  '  /help                   Show this help',
  '  /model [name]           Select or switch the model',
  '  /models                 Select a local model for the current engine',
  '  /engine [ollama|lumen]  Switch the local model engine',
  '  /gpu [auto|cpu]         Show or set Lumen GPU usage (cpu is more stable)',
  '  /usage                  Show session token usage',
  '  /tools                  List available tools',
  '  /project, /memory       Show or refresh project context',
  '  /git, /status           Show Git status and recent changes',
  '  /review                 Review the project for risks',
  '  /plan                   Switch to read-only planning mode',
  '  /build                  Switch to build mode',
  '  /mode                   Show or change the current mode',
  '  /prompt                 Show the system prompt',
  '  /roadmap, /features     Show the Fynext feature roadmap',
  '  /reload                 Reload system_prompt.txt',
  '  /workspace [path]       Show or change the workspace',
  '  /temp [0-2]             Show or set the temperature',
  '  /approve on|off         Enable or disable action approvals',
  '  /history [number]       List or open conversation history',
  '  /new                    Start a new conversation',
  '  /changes                List file changes made this session',
  '  /diff [path]            Show a colored Git diff',
  '  /undo [count]           Undo recent file changes',
  '  /redo [count]           Redo undone file changes',
  '  /theme [name]           Show or change the theme (default restores Fynext)',
  '  /port fynext esp32      Enable and activate the Fynext ESP32 face',
  '  /face on|off|ports|port|test Control the ESP32 robot face',
  '  /details on|off         Show or hide thinking details',
  '  /compact                Summarize the conversation context',
  '  /export [file]          Export the conversation as Markdown or JSON',
  '  /copy [n]               Copy the last (or nth) code block to the clipboard',
  '  /editor [file]          Open a file in an external editor (default: AGENTS.md)',
  '  /init [--force]         Create AGENTS.md for the workspace',
  '  /keybind [action key]   Show or change a keyboard shortcut',
  '  /clear                  Clear the conversation and screen',
  '  /exit                   Exit',
  '',
  'Shortcuts (full-screen mode):',
  '  Enter                 Send the message',
  '  Tab                   Switch between Plan and Build modes',
  '  Thinking indicator    Expand or collapse the activity summary',
  '  Alt+Enter / Ctrl+J    Insert a new line',
  '  PageUp / PageDown     Scroll the conversation',
  '  Mouse wheel           Scroll up or down',
  '  Up / Down             Move the cursor between lines',
  '  Ctrl+P / Ctrl+N       Open the command palette',
  '  Ctrl+Up / Ctrl+Down   Navigate message history',
  '  @file                 Attach file context to a message',
  '  !command              Run a shell command',
  '  Ctrl+T                Toggle thinking details',
  '  Ctrl+Y                Copy the last code block to the clipboard',
  '  Ctrl+O                Start a new conversation',
  '  /keybind              Customize keyboard shortcuts',
  '  Ctrl+A / Ctrl+E       Move to the start or end of the line',
  '  Ctrl+B / Ctrl+F       Move the cursor left or right',
  '  Ctrl+W                Delete the previous word',
  '  Ctrl+U                Clear the message',
  '  Ctrl+K                Delete to the end of the line',
  '  Ctrl+L                Redraw the screen',
  '  Ctrl+C                Stop a task; press twice to exit when idle',
  '  Ctrl+D                Exit'
].join('\n');

const FLAG_HELP = [
  'Usage:',
  '  fynext [options]',
  '  fynext --prompt "task"',
  '  echo "task" | fynext',
  '',
  'Options:',
  '  --model <name>        Model name (default: qwen2.5-coder:3b)',
  '  --workspace, -w <path> Workspace directory',
  '  --plain               Use the plain terminal instead of the full-screen UI',
  '  --prompt <text>       Run a one-shot task',
  '  --restricted          Restrict access to the workspace and require approvals',
  '  --approve             Require approval for destructive actions (default)',
  '  --no-approve          Do not ask for destructive-action approval',
  '  --no-color            Disable colors',
  '  --help, -h            Show this help',
  '  --version, -v         Show the version',
  '',
  'Shortcuts (full-screen mode):',
  '  Enter                 Send',
  '  Tab                   Switch between Plan and Build modes',
  '  Alt+Enter / Ctrl+J    Insert a new line',
  '  PageUp / PageDown     Scroll the conversation',
  '  Ctrl+C                Stop a task; press twice to exit when idle',
  '  Ctrl+D                Exit',
  '  Ctrl+P / Ctrl+N       Open the command palette',
  '  Ctrl+Up / Ctrl+Down   Navigate command history',
  '  @file                 Attach file context',
  '  !command              Run a shell command',
  '  Ctrl+O                Start a new conversation',
  '  Ctrl+Y                Copy the last code block',
  '  Ctrl+L                Redraw the screen'
].join('\n');

function parseArgs(argv) {
  const flags = {
    help: false,
    version: false,
    plain: false,
    prompt: null,
    model: null,
    workspace: null,
    restricted: false,
    approve: null,
    color: true
  };

  for (let i = 0; i < argv.length; i += 1) {
    let arg = argv[i];
    let value = null;
    if (arg.startsWith('--') && arg.includes('=')) {
      const eq = arg.indexOf('=');
      value = arg.slice(eq + 1);
      arg = arg.slice(0, eq);
    }
    switch (arg) {
      case '--help':
      case '-h':
        flags.help = true;
        break;
      case '--version':
      case '-v':
        flags.version = true;
        break;
      case '--plain':
      case '--no-tui':
        flags.plain = true;
        break;
      case '--prompt':
        if (value == null) value = argv[++i];
        if (value == null) throw new Error('--prompt requires text');
        flags.prompt = value;
        break;
      case '--model':
        if (value == null) value = argv[++i];
        if (!value) throw new Error('--model requires a name');
        flags.model = value;
        break;
      case '--workspace':
      case '-w':
        if (value == null) value = argv[++i];
        if (!value) throw new Error('--workspace requires a path');
        flags.workspace = value;
        break;
      case '--restricted':
        flags.restricted = true;
        break;
      case '--approve':
        flags.approve = true;
        break;
      case '--no-approve':
        flags.approve = false;
        break;
      case '--no-color':
        flags.color = false;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return flags;
}

function summarize(text, max) {
  const value = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  const limit = max || 160;
  return value.length > limit ? value.slice(0, limit) + '…' : value;
}

function callSignature(cfg, call) {
  const args = Object.assign({}, call.arguments || {});
  if (call.name === 'fs_write' && !args.append) delete args.append;
  for (const key of ['path', 'source', 'destination']) {
    if (typeof args[key] === 'string' && args[key]) {
      try {
        args[key] = path.resolve(cfg.workspace, args[key]).replace(/\//g, '\\').toLowerCase();
      } catch (_) {
        /* yoksay */
      }
    }
  }
  return call.name + ':' + JSON.stringify(args);
}

function isAbort(err) {
  if (!err) return false;
  return /iptal|abort|cancel/i.test(String(err.message || err));
}

function isNodeTestCommand(command) {
  return /\b(?:npm\s+(?:test|run\s+test)|node\s+--test|npx\s+(?:jest|mocha|vitest)|yarn\s+test|pnpm\s+test)\b/i.test(
    String(command || '')
  );
}

function collectNodeTestFiles(root) {
  const files = [];
  const visit = (dir, depth) => {
    if (depth > 3) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
      return;
    }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.fynext') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(full, depth + 1);
      else if (/\.(?:test|spec)\.(?:js|cjs|mjs|ts)$/i.test(entry.name)) files.push(full);
    }
  };
  visit(root, 0);
  return files;
}

function auditNodeTestFiles(root) {
  const files = collectNodeTestFiles(root);
  const unregistered = [];
  const notImporting = [];
  for (const file of files) {
    let content;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch (_) {
      continue;
    }
    const relative = path.relative(root, file);
    const registered =
      /\b(?:test|it)\s*\(\s*['"`]/.test(content) || /\bdescribe\s*\(\s*['"`]/.test(content);
    const importsLocal =
      /\brequire\s*\(\s*['"`]\.{1,2}[\\/]/.test(content) ||
      /\bimport\s+(?:[\s\S]*?\s+from\s+)?['"`]\.{1,2}[\\/]/.test(content) ||
      /\bimport\s*\(\s*['"`]\.{1,2}[\\/]/.test(content);
    if (!registered) unregistered.push(relative);
    else if (!importsLocal) notImporting.push(relative);
  }
  return { unregistered, notImporting };
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

function startStartupSplash(stdout) {
  const word = 'fynext';
  const colors = [196, 202, 208, 202];
  let frame = 0;
  let stopped = false;

  function draw() {
    const columns = stdout.columns || 80;
    const rows = stdout.rows || 24;
    const row = Math.max(1, Math.ceil(rows / 2));
    const column = Math.max(1, Math.floor((columns - word.length) / 2) + 1);
    let text = '';
    for (let i = 0; i < word.length; i += 1) {
      const color = colors[(i + frame) % colors.length];
      text += `\x1b[38;5;${color}m${word[i]}`;
    }
    stdout.write(`\x1b[${row};${column}H\x1b[2K${text}\x1b[0m`);
    frame += 1;
  }

  stdout.write('\x1b[?25l\x1b[2J');
  draw();
  const timer = setInterval(draw, 100);
  const onResize = () => draw();
  const onExit = () => stop();
  stdout.on('resize', onResize);
  process.once('exit', onExit);

  function stop() {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    stdout.removeListener('resize', onResize);
    process.removeListener('exit', onExit);
    stdout.write('\x1b[0m\x1b[2J\x1b[H\x1b[?25h');
  }

  return stop;
}

function buildSystemPrompt(cfg, base, mode) {
  const projectMemory = cfg.projectContext
    ? projectContext.buildProjectMemoryText(cfg.projectContext)
    : 'Project memory has not been generated.';
  let agentInstructions = '';
  try {
    agentInstructions = fs.readFileSync(path.join(cfg.workspace, 'AGENTS.md'), 'utf8').trim();
  } catch (_) {
    agentInstructions = '';
  }
  const env = [
    '',
    'RUNTIME CONTEXT:',
    `- Mode: ${mode === 'plan' ? 'PLAN (read only; inspect and recommend, do not modify)' : `BUILD (carry out the requested work; destructive changes ${cfg.approveDestructive ? 'require approval' : 'do not require approval'})`}`,
    `- Workspace: ${cfg.workspace}`,
    `- Platform: ${process.platform} ${process.arch}`,
    `- Date: ${new Date().toISOString()}`,
    `- Model: ${cfg.model}`,
    `- Shell: ${process.platform === 'win32' ? 'cmd.exe' : process.env.SHELL || 'sh'}`,
    `- Destructive action approval: ${cfg.approveDestructive ? 'enabled' : 'disabled'}`,
    `- Access outside workspace: ${cfg.allowOutsideWorkspace ? 'enabled' : 'disabled'}`,
    '- Prefer workspace-relative paths for file tools.',
    'PROJECT SNAPSHOT (possibly incomplete; verify with tools):',
    projectMemory,
    ...(agentInstructions ? ['WORKSPACE AGENTS.md (must follow):', agentInstructions] : []),
    mode === 'plan'
      ? '- In PLAN mode, inspect the project and return findings or a concrete plan. Do not modify files.'
      : '- In BUILD mode, use tools to complete requested project work. Do not stop at suggestions or instructions for the user.',
    ...(mode === 'plan'
      ? ['- Use only read-only tools and commands. Never create, edit, delete, or move files.']
      : [
          '- For repository-specific analysis or recommendations, inspect the relevant project files before answering.',
          '- For implementation requests, inspect existing conventions, make the change, read it back, and run relevant checks.',
          '- Never ask the user to inspect or edit files that you can handle with available tools.',
          '- Do not claim completion or verification without successful tool results.'
        ])
  ].join('\n');
  const promptBase = cfg.provider === 'lumen'
    ? stripStatusInstructions(base)
    : String(base || '');
  return `${promptBase.trim()}\n${env}`;
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));

  if (flags.help) {
    process.stdout.write(FLAG_HELP + '\n');
    return;
  }
  if (flags.version) {
    process.stdout.write(`fynext ${pkg.version}\n`);
    return;
  }

  if (!flags.color) process.env.NO_COLOR = '1';

  const cfg = loadConfig();
  theme.setTheme(cfg.theme);
  if (flags.model) cfg.model = flags.model;
  if (flags.workspace) cfg.workspace = path.resolve(flags.workspace);
  if (flags.restricted) {
    cfg.allowOutsideWorkspace = false;
    cfg.approveDestructive = true;
  }
  if (flags.approve != null) cfg.approveDestructive = flags.approve;

  let stat = null;
  try {
    stat = fs.statSync(cfg.workspace);
  } catch (_) {
    stat = null;
  }
  if (!stat || !stat.isDirectory()) {
    throw new Error(`Workspace not found: ${cfg.workspace}`);
  }

  const interactive = !!process.stdin.isTTY && !!process.stdout.isTTY && !flags.plain && flags.prompt == null;
  const plainRepl = !interactive && flags.plain && !!process.stdin.isTTY && flags.prompt == null;

  const uiMode = interactive || plainRepl;
  const startupSplash = uiMode && process.stdout.isTTY
    ? startStartupSplash(process.stdout)
    : null;
  const setupLog = uiMode && process.stdout.isTTY
    ? (startupSplash ? () => {} : (line) => process.stdout.write(line + '\n'))
    : (line) => process.stderr.write(line + '\n');
  try {
    await setup.ensureReady(cfg, {
      tty: uiMode && !!process.stdout.isTTY && !startupSplash,
      log: setupLog
    });
  } catch (err) {
    if (startupSplash) startupSplash();
    process.stderr.write(`fynext: ${err.message}\n`);
    process.exitCode = 1;
    return;
  }
  if (startupSplash) startupSplash();

  let systemPromptBase = loadSystemPrompt(cfg);
  try {
    cfg.projectContext = projectContext.refreshProjectMemory(cfg);
  } catch (_) {
    cfg.projectContext = projectContext.readProjectMemory(cfg);
  }
  let mode = 'build';
  const sessionUsage = {
    promptTokens: 0,
    outputTokens: 0,
    latestRate: 0,
    latestEstimated: false,
  };
  let systemPrompt = buildSystemPrompt(cfg, systemPromptBase, mode);
  let messages = [{ role: 'system', content: systemPrompt }];
  const changeHistory = [];
  const redoHistory = [];
  const MAX_CHANGE_HISTORY = 50;

  const presenter = interactive
    ? new Screen({ model: cfg.model, cwd: cfg.workspace, status: mode, mode, thinkingExpanded: cfg.thinkingExpanded })
    : new PlainPresenter({
        model: cfg.model,
        cwd: cfg.workspace,
        status: mode,
        color: flags.color && !!process.stdout.isTTY
      });

  if (typeof presenter.setKeybinds === 'function') presenter.setKeybinds(cfg.keybinds);

  const face = faceBridge.createFaceBridge(cfg);
  face.start();

  let historyFile = null;
  let conversations = [];
  let currentConversation = null;
  if (uiMode) {
    historyFile = chatHistory.historyPath();
  }

  async function loadStartupConversation() {
    if (!historyFile) return;
    try {
      conversations = chatHistory.loadHistory(historyFile);
      conversations.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
      const latestConversation = conversations[0];
      if (latestConversation && latestConversation.messages.length) {
        const shouldRestore = await presenter.confirm(
          'Restore the previous conversation?',
          { allowAlways: false, centered: true }
        );
        if (shouldRestore) {
          currentConversation = latestConversation;
          messages = [{ role: 'system', content: systemPrompt }].concat(latestConversation.messages);
          presenter.restoreConversation(messages.slice(1));
          presenter.note('Previous conversation restored. Use /history to open another conversation.');
          return;
        }
      }
      currentConversation = chatHistory.createConversation();
    } catch (err) {
      presenter.error(err.message);
      currentConversation = chatHistory.createConversation();
    }
  }

  let activeController = null;
  let exiting = false;

  function abortRun() {
    if (activeController) activeController.abort();
  }

  function shutdown(code) {
    if (exiting) return;
    exiting = true;
    if (activeController) activeController.abort();
    try {
      face.close();
    } catch (_) {
      /* yoksay */
    }
    try {
      presenter.stop();
    } catch (_) {
      /* yoksay */
    }
    process.exitCode = code == null ? 0 : code;
    if (interactive || plainRepl) {
      setTimeout(() => process.exit(process.exitCode), 10);
    }
  }

  tools.setConfirm(async (description) => {
    const answer = await presenter.confirm(description);
    if (answer === 'always') {
      cfg.approveDestructive = false;
      refreshSystem();
    }
    return answer;
  });

  function refreshSystem() {
    cfg.projectContext = cfg.projectContext || projectContext.readProjectMemory(cfg);
    systemPrompt = buildSystemPrompt(cfg, systemPromptBase, mode);
    messages[0] = { role: 'system', content: systemPrompt };
  }

  function persistConversation() {
    if (!historyFile || !currentConversation || messages.length <= 1) return;
    const conversationMessages = messages.slice(1);
    const firstUserMessage = conversationMessages.find((message) => message.role === 'user');
    const title = firstUserMessage ? summarize(sanitize(firstUserMessage.content), 80) : '';
    const updated = Object.assign({}, currentConversation, {
      updatedAt: new Date().toISOString(),
      title,
      messages: conversationMessages
    });
    conversations = chatHistory.saveHistory(historyFile, conversations, updated);
    currentConversation = updated;
  }

  function startNewConversation() {
    persistConversation();
    currentConversation = chatHistory.createConversation();
    messages = [{ role: 'system', content: systemPrompt }];
    presenter.reset();
    face.startSession();
    presenter.setNotice('New conversation started');
  }

  function inverseChange(entry) {
    return {
      workspace: entry.workspace,
      action: entry.action,
      createdAt: new Date().toISOString(),
      before: entry.after,
      after: entry.before,
      createdDirectories: [],
      files: entry.files.map((file) => ({
        path: file.path,
        added: file.removed,
        removed: file.added
      }))
    };
  }

  function describeChanges() {
    if (!changeHistory.length) return 'No file changes to undo.';
    return [
      'File changes (newest first):',
      ...changeHistory
        .slice()
        .reverse()
        .map((entry, index) => '  ' + changeTracker.describe(entry, cfg.workspace, changeHistory.length - 1 - index)),
      'Undo changes with: /undo [count]'
    ].join('\n');
  }

  function applyChangeHistory(source, target, arg) {
    if (!source.length) return { error: 'No changes to apply.' };
    let count = arg ? Number(arg) : 1;
    if (!Number.isInteger(count) || count < 1) return { error: 'Usage: /undo [count] or /redo [count]' };
    count = Math.min(count, source.length);
    const files = [];
    for (let i = 0; i < count; i += 1) {
      const entry = source[source.length - 1];
      try {
        files.push(...changeTracker.undo(entry, cfg));
      } catch (err) {
        return { error: err.message, files };
      }
      source.pop();
      target.push(inverseChange(entry));
      if (target.length > MAX_CHANGE_HISTORY) target.shift();
    }
    return { files: [...new Set(files)] };
  }

  function switchMode(nextMode) {
    if (nextMode !== 'build' && nextMode !== 'plan') return;
    mode = nextMode;
    refreshSystem();
    if (typeof presenter.setMode === 'function') presenter.setMode(mode);
    presenter.setInfo({ status: mode });
  }

  function recordUsage(stats) {
    if (!stats) return;
    sessionUsage.promptTokens += Number(stats.promptTokens) || 0;
    sessionUsage.outputTokens += Number(stats.outputTokens) || 0;
    if (Number(stats.tokensPerMinute) > 0) sessionUsage.latestRate = Number(stats.tokensPerMinute);
    sessionUsage.latestEstimated = !!stats.estimatedTokens;
    const total = sessionUsage.promptTokens + sessionUsage.outputTokens;
    presenter.setInfo({
      usage: `tokens ${total.toLocaleString('en-US')} · ${sessionUsage.latestEstimated ? '~' : ''}${sessionUsage.latestRate.toLocaleString('en-US')} tokens/min`
    });
  }

  function setThinkingStatus(status) {
    if (typeof presenter.thinkingStatus === 'function') presenter.thinkingStatus(status);
    face.task('thinking', status);
  }

  function faceTaskForTool(name, action) {
    if (['web_search', 'web_fetch', 'fs_glob', 'fs_grep'].includes(name)) {
      return { status: 'searching', direction: 'up_left' };
    }
    if (['fs_write', 'fs_edit', 'fs_delete', 'fs_move', 'fs_mkdir'].includes(name)) {
      return { status: 'coding', direction: 'down_right' };
    }
    if (/tests|build|code checks/i.test(action)) {
      return { status: 'testing', direction: 'right' };
    }
    return { status: 'tool', direction: 'center' };
  }

  function notifyComplete() {
    face.celebrate();
    if (!cfg.notifications || !process.stdout.isTTY) return;
    if (interactive && typeof presenter.setCompletionNotice === 'function') {
      presenter.setCompletionNotice('Response complete — Windows notification and sound', 5000);
    } else if (typeof presenter.setNotice === 'function') {
      presenter.setNotice('Response complete — Windows notification and sound', 5000);
    }
    showCompletionNotification((err) => {
      if (interactive && typeof presenter.setCompletionNotice === 'function') {
        presenter.setCompletionNotice(`Windows notification failed: ${err.message}`, 5000);
      }
    });
    playCompletionSound(cfg.root, (err) => {
      if (interactive && typeof presenter.setCompletionNotice === 'function') {
        presenter.setCompletionNotice(`Completion sound failed: ${err.message}`, 5000);
      } else if (typeof presenter.setNotice === 'function') {
        presenter.setNotice(`Completion sound failed: ${err.message}`, 4000);
      }
    });
  }

  function aiStatusLine(content) {
    return liveStatusFromText(content);
  }

  if (typeof presenter.modeHandler === 'function') {
    presenter.modeHandler(() => switchMode(mode === 'build' ? 'plan' : 'build'));
  }
  if (typeof presenter.newConversationHandler === 'function') {
    presenter.newConversationHandler(startNewConversation);
  }

  async function chatWithUsage(history, availableTools, showDeltas = true, chatOptions = undefined) {
    let streamedChars = 0;
    let statusBuffer = '';
    let liveStatus = '';
    const statusFilter = showDeltas ? new StatusStreamFilter() : null;
    const startedAt = Date.now();
    const result = await llm.chat(cfg, history, availableTools, (delta) => {
      const chunk = String(delta);
      streamedChars += chunk.length;
      face.speak(Math.min(1, 0.45 + chunk.length / 120));
      if (statusFilter) {
        const visible = statusFilter.push(chunk);
        if (statusFilter.status && statusFilter.status !== liveStatus) {
          liveStatus = statusFilter.status;
          setThinkingStatus(liveStatus);
        }
        if (visible) presenter.assistantDelta(visible);
      } else {
        statusBuffer += chunk;
        const status = liveStatusFromText(statusBuffer);
        if (status && status !== liveStatus) {
          liveStatus = status;
          setThinkingStatus(status);
        }
      }
      const liveTokens = Math.ceil(streamedChars / 4);
      const liveRate = Math.round(liveTokens * 60000 / Math.max(1, Date.now() - startedAt));
      const completedTokens = sessionUsage.promptTokens + sessionUsage.outputTokens;
      presenter.setInfo({
        usage: `tokens ${(completedTokens + liveTokens).toLocaleString('en-US')} · ~${liveRate.toLocaleString('en-US')} tokens/min`
      });
    }, chatOptions);
    let heldTail = '';
    if (statusFilter) {
      heldTail = statusFilter.finish();
      if (statusFilter.status) liveStatus = statusFilter.status;
    }
    const originalContent = String(result.content || '');
    result.content = stripStatusLine(originalContent);
    if (!result.content && liveStatus && !(result.toolCalls && result.toolCalls.length)) {
      result.content = liveStatus;
    }
    if (heldTail && !(result.toolCalls && result.toolCalls.length)) {
      presenter.assistantDelta(heldTail);
    }
    result.status = liveStatus;
    result.stats = result.stats || {};
    if (!result.stats.outputTokens && streamedChars > 0) {
      result.stats.outputTokens = Math.ceil(streamedChars / 4);
      result.stats.estimatedTokens = true;
      result.stats.tokensPerMinute = Math.round(
        result.stats.outputTokens * 60000 / Math.max(1, result.stats.totalMs || Date.now() - startedAt)
      );
    }
    recordUsage(result.stats);
    return result;
  }

  async function runAgent() {
    if (cfg.provider === 'lumen') {
      const model = lumen.getModel(cfg.model);
      if (!model) {
        throw new Error(`Unknown Lumen model "${cfg.model}". Choose one with /models.`);
      }
      if (!await lumen.isModelInstalled(cfg, model) && !await installModel(model.id)) {
        throw new Error(`Lumen model "${model.name}" is required. Run /model ${model.id} to try again.`);
      }
    }
    activeController = new AbortController();
    cfg.abortSignal = activeController.signal;

    const compactResult = autoCompactMessages(messages, cfg.numCtx);
    if (compactResult.compacted) {
      messages.length = 0;
      messages.push(...compactResult.messages);
      presenter.note('Context window optimized (auto-compacted older turns).');
    }
    const currentRequest = messages[messages.length - 1];
    const requiresWebTools = currentRequest &&
      currentRequest.role === 'user' &&
      requiresWebSearch(currentRequest.content);
    const requiresTools = currentRequest &&
      currentRequest.role === 'user' &&
      (requiresToolFollowThrough(currentRequest.content) || requiresWebTools);
    const requestTools = tools.definitionsForRequest(
      mode,
      currentRequest && currentRequest.role === 'user' ? currentRequest.content : ''
    );
    const requiresImplementationWork = mode === 'build' &&
      currentRequest &&
      currentRequest.role === 'user' &&
      requiresImplementation(currentRequest.content);
    const seen = new Map();
    const mutationTools = new Set(['fs_write', 'fs_edit', 'fs_delete', 'fs_move', 'fs_mkdir']);
    const shellFailed = (text) => {
      const match = String(text || '').match(/\[exit code:\s*(\d+|error)\]/i);
      return !!match && match[1] !== '0';
    };
    let totalCalls = 0;
    let rounds = 0;
    let toolRetries = 0;
    let executedTool = false;
    let retryHistory = null;
    let mutationVersion = 0;
    let failedCheck = null;
    let verificationHint = '';
    let checkRetries = 0;
    let modifiedSinceCheck = false;

    try {
      for (;;) {
        rounds += 1;
        presenter.beginThinking();
        setThinkingStatus(rounds === 1
          ? 'Reviewing the request and workspace context'
          : 'Reviewing tool results and choosing the next step');
        let out;
        try {
          const mustForceTool = (requiresTools && !executedTool) ||
            (requiresImplementationWork && mutationVersion === 0 && executedTool && toolRetries > 0);
          out = await chatWithUsage(
            retryHistory || messages,
            requestTools,
            !requiresTools || executedTool,
            mustForceTool ? { forceTool: true } : undefined
          );
        } catch (err) {
          presenter.assistantDone();
          throw err;
        }
        presenter.assistantDone();

        const content = out && out.content ? out.content : '';
        const calls = out && Array.isArray(out.toolCalls) ? out.toolCalls : [];
        calls.forEach((call, index) => {
          if (!call.id) call.id = `fynext_${rounds}_${index}`;
        });
        const aiStatus = aiStatusLine(content) || (out && out.status) || '';
        if (process.env.FYNEXT_DEBUG) {
          process.stderr.write(`[debug] tur ${rounds} calls ${JSON.stringify(calls)}\n`);
        }
        if (calls.length) {
          retryHistory = null;
          const message = { role: 'assistant', content: '' };
          message.tool_calls = calls.map((call) => ({
            id: call.id,
            function: { name: call.name, arguments: call.arguments }
          }));
          messages.push(message);
        }
        if (!calls.length) {
          if (promisesWebSearch(content) && toolRetries < 2) {
            toolRetries += 1;
            // Ensure web_search and web_fetch are available in requestTools
            const webToolDefs = tools.definitions.filter((d) =>
              d && d.function && (d.function.name === 'web_search' || d.function.name === 'web_fetch')
            );
            for (const def of webToolDefs) {
              if (!requestTools.some((t) => (t.function ? t.function.name : t.name) === def.function.name)) {
                requestTools.push(def);
              }
            }
            const retryMessages = retryHistory || messages;
            retryHistory = retryMessages.concat(
              ...(content ? [{ role: 'assistant', content }] : []),
              {
                role: 'user',
                content:
                  'SYSTEM: You stated that you would search the web or check documentation online, but you did not execute any tool call. DO NOT tell the user what you will do in the future. Execute the web_search tool NOW with your specific search query.'
              }
            );
            presenter.note(`Enforcing web search tool execution (${toolRetries}/2)`);
            continue;
          }
          if (requiresTools && !executedTool) {
            if (toolRetries < 2) {
              toolRetries += 1;
              const retryMessages = retryHistory || messages;
              retryHistory = retryMessages.concat(
                ...(content ? [{ role: 'assistant', content }] : []),
                {
                  role: 'user',
                  content:
                    'SYSTEM: This is an actionable request. Your previous response did not use any tools and did not complete the task. Call the relevant tools now. For repository work, inspect the relevant files, perform the requested work when in BUILD mode, and verify the result. Do not claim completion without tool results.'
                }
              );
              presenter.note(
                `No tool call was made; retrying with tools (${toolRetries}/2)`
              );
              continue;
            }

            const warning =
              'The model did not call a tool after two retries. No tools were run and no changes were made.';
            messages.push({ role: 'assistant', content: warning });
            return warning;
          }
          if (requiresImplementationWork && mutationVersion === 0 && toolRetries < 2) {
            toolRetries += 1;
            const retryMessages = retryHistory || messages;
            retryHistory = retryMessages.concat(
              ...(content ? [{ role: 'assistant', content }] : []),
              {
                role: 'user',
                content:
                  'SYSTEM: You are in BUILD mode and were asked to implement or modify code. You have inspected files, but you have not made any edits yet. Do not merely suggest code or explain steps in chat. Use fs_write or fs_edit now to apply the changes directly to the project files.'
              }
            );
            presenter.note(`Enforcing code implementation in BUILD mode (${toolRetries}/2)`);
            continue;
          }
          if (failedCheck && (modifiedSinceCheck || requiresImplementationWork) && checkRetries < 2) {
            checkRetries += 1;
            if (content) messages.push({ role: 'assistant', content });
            const reason = verificationHint || `The last verification command failed: ${failedCheck}.`;
            messages.push({
              role: 'user',
              content:
                `SYSTEM: ${reason} Inspect the failing output and the relevant files, fix the root cause yourself, and re-run the exact command. Do not ask the user to make the fix and do not finish or claim success before the verification passes.`
            });
            presenter.note(`Fixing and rerunning after failed verification (${checkRetries}/2)`);
            continue;
          }
          if (content) messages.push({ role: 'assistant', content });
          return content;
        }

        let overLimit = false;
        let firstAction = true;
        const roundSeen = new Set();
        for (let toolIndex = 0; toolIndex < calls.length; toolIndex += 1) {
          const call = calls[toolIndex];
          const toolProgress = Math.round((toolIndex / calls.length) * 100);
          const signature = callSignature(cfg, call);
          if (roundSeen.has(signature)) {
            presenter.note(`Skipped duplicate tool call: ${call.name}`);
            messages.push({
              role: 'tool',
              tool_name: call.name,
              tool_call_id: call.id,
              content: 'WARNING: This tool call already ran in this turn. Use its result.'
            });
            face.progress(Math.round(((toolIndex + 1) / calls.length) * 100));
            continue;
          }
          roundSeen.add(signature);

          totalCalls += 1;
          if (totalCalls > MAX_CALLS) {
            messages.push({
              role: 'tool',
              tool_name: call.name,
              tool_call_id: call.id,
              content: 'SKIPPED: Tool call limit reached.'
            });
            overLimit = true;
            face.progress(Math.round(((toolIndex + 1) / calls.length) * 100));
            continue;
          }

          const previous = seen.get(signature);
          const count = (previous ? previous.count : 0) + 1;
          if (previous && count > 1 && previous.version === mutationVersion) {
            presenter.note(`Skipped repeated tool call: ${call.name}`);
            messages.push({
              role: 'tool',
              tool_name: call.name,
              tool_call_id: call.id,
              content:
                'WARNING: This tool already ran with the same arguments and no files have changed since. Use its result and provide your final answer; do not call it again.'
            });
            face.progress(Math.round(((toolIndex + 1) / calls.length) * 100));
            continue;
          }
          seen.set(signature, { count, version: mutationVersion });

          const action = firstAction && aiStatus
            ? aiStatus
            : describeToolAction(call.name, call.arguments);
          firstAction = false;
          if (typeof presenter.thinkingStatus === 'function') presenter.thinkingStatus(action);
          const faceTask = faceTaskForTool(call.name, action);
          face.task(faceTask.status, action, {
            progress: toolProgress,
            direction: faceTask.direction
          });
          presenter.toolStart(call.name, call.arguments, action);
          let resultText;
          let ok = true;
          const capturedChange = changeTracker.capture(cfg, call.name, call.arguments);
          try {
            resultText = await tools.run(cfg, call.name, call.arguments, mode);
            executedTool = true;
          } catch (err) {
            executedTool = true;
            ok = false;
            resultText = 'ERROR: ' + (err && err.message ? err.message : String(err));
          }
          if (ok && capturedChange) {
            const entry = changeTracker.record(capturedChange);
            if (entry) {
              changeHistory.push(entry);
              if (changeHistory.length > MAX_CHANGE_HISTORY) changeHistory.shift();
              redoHistory.length = 0;
              for (const file of entry.files) {
                if (file.diff) {
                  presenter.note(`Diff preview (${path.basename(file.path)}):\n${file.diff}`);
                }
              }
            }
          }
          if (ok && mutationTools.has(call.name)) {
            mutationVersion += 1;
            if (failedCheck) modifiedSinceCheck = true;
          }
          if (call.name === 'shell_exec' && ok) {
            const command = String(call.arguments && call.arguments.command || '').trim();
            if (shellFailed(resultText)) {
              failedCheck = command || 'last verification command';
              verificationHint = '';
              modifiedSinceCheck = false;
            } else if (failedCheck && command === failedCheck) {
              failedCheck = null;
              verificationHint = '';
              modifiedSinceCheck = false;
            }
            if (isNodeTestCommand(command)) {
              const audit = auditNodeTestFiles(cfg.workspace);
              if (audit.unregistered.length) {
                failedCheck = command;
                modifiedSinceCheck = true;
                verificationHint =
                  `The command exited 0, but these test files do not register any tests: ${audit.unregistered.join(', ')}. ` +
                  'They only define or export functions, so they prove nothing. Rewrite them using node:test, for example: ' +
                  "const test = require('node:test'); const assert = require('node:assert/strict'); " +
                  "test('add', () => { assert.equal(add(2, 3), 5); });";
              } else if (audit.notImporting.length) {
                failedCheck = command;
                modifiedSinceCheck = true;
                verificationHint =
                  `The command exited 0, but these test files do not import any project module: ${audit.notImporting.join(', ')}. ` +
                  'They may be testing duplicated code instead of the real implementation. Import the project module ' +
                  "(for example: const math = require('../src/math');) and test that module against the real source file.";
              }
            }
          }
          presenter.toolEnd(call.name, ok, summarize(resultText, 240));
          messages.push({
            role: 'tool',
            tool_name: call.name,
            tool_call_id: call.id,
            content: String(resultText == null ? '' : resultText)
          });
          const completedProgress = Math.round(((toolIndex + 1) / calls.length) * 100);
          face.event(ok ? 'tool_end' : 'tool_error', ok ? 'Action complete' : 'Action failed', {
            progress: completedProgress
          });
        }

        if (overLimit) {
          presenter.note('Tool call limit reached; requesting a final response.');
          break;
        }
        if (rounds > Math.max(1, Number(cfg.maxToolRounds) || 10)) {
          presenter.note('Tool round limit reached; requesting a final response.');
          break;
        }
      }

      presenter.beginThinking();
      setThinkingStatus('Preparing the final response');
      const guard = {
        role: 'user',
        content:
          'SYSTEM: Do not call tools in this turn. Answer the user using the conversation and verified tool results. Follow the user\'s language and tone; be direct and concise. Clearly distinguish completed work from recommendations and unverified claims. Never say work was completed unless tool results show it.'
      };
      let final;
      try {
        final = await chatWithUsage(messages.concat([guard]), null);
      } catch (err) {
        presenter.assistantDone();
        throw err;
      }
      presenter.assistantDone();
      const finalText = final && final.content ? final.content : '';
      if (finalText) messages.push({ role: 'assistant', content: finalText });
      return finalText;
    } finally {
      activeController = null;
      cfg.abortSignal = null;
    }
  }

  async function installModel(name) {
    const list = await llm.listModels(cfg);
    if (setup.hasModel(list, name)) return true;
    const lumenModel = cfg.provider === 'lumen' ? lumen.getModel(name) : null;
    if (cfg.provider === 'lumen' && !lumenModel) {
      presenter.error(`Unknown Lumen model: ${name}`);
      return false;
    }
    if (lumenModel) {
      const accepted = await presenter.confirm(
        `Download ${lumenModel.name} (${setup.formatBytes(lumenModel.size)}) from Hugging Face?\n` +
        `License: ${lumenModel.license}\n` +
        `The model will be saved to: ${cfg.lumenModelDir}`,
        { approval: true, allowAlways: false }
      );
      if (!accepted) {
        presenter.note('Model download cancelled.');
        return false;
      }
    }
    presenter.setBusy(true);
    presenter.setInfo({ status: 'Downloading model' });
    let lastPct = -1;
    const controller = cfg.provider === 'lumen' ? new AbortController() : null;
    if (controller) {
      activeController = controller;
      cfg.abortSignal = controller.signal;
    }
    try {
      if (cfg.provider === 'lumen') {
        await lumen.downloadModel(cfg, name, (event) => {
          if (!event.total || event.completed == null) return;
          const pct = Math.floor((event.completed / event.total) * 100);
          if (pct === lastPct) return;
          lastPct = pct;
          presenter.setInfo({
            status: `Downloading Lumen model ${pct}% (${setup.formatBytes(event.completed)} / ${setup.formatBytes(event.total)})`
          });
        }, { signal: controller.signal });
      } else {
        await setup.pullModel(cfg, name, (event) => {
          if (!event.total || event.completed == null) return;
          const pct = Math.floor((event.completed / event.total) * 100);
          if (pct === lastPct) return;
          lastPct = pct;
          presenter.setInfo({ status: `Downloading model ${pct}%` });
        });
      }
      return true;
    } catch (err) {
      if (typeof presenter.showCommandResult === 'function') {
        presenter.showCommandResult(`Could not download model: ${err.message}`, { error: true });
      } else {
        presenter.error(`Could not download model: ${err.message}`);
      }
      return false;
    } finally {
      if (controller) {
        if (activeController === controller) activeController = null;
        cfg.abortSignal = null;
      }
      presenter.setBusy(false);
      presenter.setInfo({ status: mode });
    }
  }

  async function handleCommand(input) {
    const commandNote = (text, options) => {
      if (typeof presenter.showCommandResult === 'function') presenter.showCommandResult(text, options);
      else presenter.note(options && options.markup ? sanitize(text) : text);
    };
    const commandError = (text) => {
      if (typeof presenter.showCommandResult === 'function') presenter.showCommandResult(text, { error: true });
      else presenter.error(text);
    };
    const raw = input.replace(/^\//, '').trim();
    if (!raw) return;
    const parts = raw.split(/\s+/);
    const cmd = parts.shift().toLowerCase();
    const arg = parts.join(' ').trim();

    if (['exit', 'quit', 'q', 'çık', 'çik', 'cik'].includes(cmd)) {
      shutdown(0);
      return;
    }

    if (['help', 'yardım', 'yardim', '?', 'h'].includes(cmd)) {
      commandNote(COMMAND_HELP);
      return;
    }

    if (cmd === 'port') {
      if (arg.toLowerCase() !== 'fynext esp32') {
        commandError('Usage: /port fynext esp32');
        return;
      }
      if (!face.available) {
        commandError(face.error || 'serialport module is not installed. Run: npm install serialport');
        return;
      }
      saveSettingsPatch({ robotFaceEnabled: true });
      face.setEnabled(true);
      face.activate();
      commandNote(
        'Fynext ESP32 face enabled. It will reactivate for each new or restored conversation. ' +
        'If auto-detection selects the wrong port, use /face ports and /face port COM5.'
      );
      return;
    }

    if (['engine', 'provider', 'motor'].includes(cmd)) {
      if (!arg) {
        commandNote(`Model engine: ${cfg.provider}\nOptions: ollama, lumen\nUse /engine <name> to switch.`);
        return;
      }
      const provider = arg.toLowerCase();
      if (!['ollama', 'lumen'].includes(provider)) {
        commandError(`Unknown model engine: ${arg}. Options: ollama, lumen.`);
        return;
      }
      if (provider === cfg.provider) {
        commandNote(`Model engine is already ${provider}.`);
        return;
      }
      let selectedModel = cfg.model;
      if (provider === 'lumen') {
        if (!lumen.getModel(selectedModel)) selectedModel = lumen.DEFAULT_MODEL_ID;
      } else if (lumen.getModel(cfg.model)) {
        selectedModel = 'qwen2.5-coder:7b';
      }
      saveSettingsPatch({ provider, model: selectedModel });
      cfg.provider = provider;
      cfg.model = selectedModel;
      presenter.setInfo({ model: cfg.model });
      commandNote(
        provider === 'lumen'
          ? `Model engine: Lumen\nChoose a model with /models.`
          : `Model engine: Ollama\nChoose a model with /models. If Ollama was not running when Fynext started, restart Fynext to initialize it.`
      );
      return;
    }

    if (['gpu', 'ekran-kartı', 'ekran-karti'].includes(cmd)) {
      if (!arg) {
        commandNote(
          `Lumen GPU: ${cfg.lumenGpu}\nUse /gpu auto or /gpu cpu (cpu is slower but more stable).`
        );
        return;
      }
      const value = arg.toLowerCase();
      if (!['auto', 'cpu'].includes(value)) {
        commandError('Usage: /gpu auto|cpu');
        return;
      }
      cfg.lumenGpu = value;
      saveSettingsPatch({ lumenGpu: value });
      if (value === 'auto' && typeof lumen.resetGpuPreference === 'function') {
        lumen.resetGpuPreference();
      }
      commandNote(
        `Lumen GPU: ${value}${value === 'cpu' ? ' (CPU only)' : ''}\n` +
          'This applies the next time the model is loaded.'
      );
      return;
    }

    if (['new', 'yeni'].includes(cmd)) {
      startNewConversation();
      return;
    }

    if (['history', 'geçmiş', 'gecmis'].includes(cmd)) {
      if (!historyFile) {
        commandNote('Conversation history is available only in interactive sessions.');
        return;
      }
      if (!arg) {
        if (!conversations.length) {
          commandNote('No saved conversations.');
          return;
        }
        commandNote(
          'Conversation history (newest first):\n' +
            conversations
              .map((conversation, index) => {
                const title = conversation.title || 'Untitled conversation';
                const date = new Date(conversation.updatedAt).toLocaleString('en-US');
                const current = currentConversation && conversation.id === currentConversation.id ? '  (current)' : '';
                return `${index + 1}. ${date}  ${title}${current}`;
              })
              .join('\n') +
            '\nOpen a conversation with: /history <number>'
        );
        return;
      }
      const selection = Number(arg);
      if (!Number.isInteger(selection) || selection < 1 || selection > conversations.length) {
        commandError(`Enter a valid conversation number: 1-${conversations.length}`);
        return;
      }
      const selectedId = conversations[selection - 1].id;
      persistConversation();
      conversations.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
      currentConversation = conversations.find((conversation) => conversation.id === selectedId);
      messages = [{ role: 'system', content: systemPrompt }].concat(currentConversation.messages);
      presenter.reset();
      presenter.restoreConversation(messages.slice(1));
      face.startSession();
      commandNote(`Conversation loaded: ${currentConversation.title || 'Untitled conversation'}`);
      return;
    }

    if (['changes', 'değişiklikler', 'degisiklikler'].includes(cmd)) {
      commandNote(describeChanges());
      return;
    }

    if (['diff', 'fark', 'farklar'].includes(cmd)) {
      try {
        const args = arg ? { path: arg } : {};
        const result = await tools.run(
          Object.assign({}, cfg, { toolCallApproved: true }),
          'git_diff',
          args,
          mode
        );
        const text = String(result == null ? '' : result).trim();
        if (!text) {
          commandNote('No Git diff.');
          return;
        }
        const c = theme.C;
        const colored = text
          .split('\n')
          .map((line) => {
            if (/^(diff --git|index |--- |\+\+\+ )/.test(line)) return c.grayDim + line + c.reset;
            if (line.startsWith('@@')) return c.cyan + line + c.reset;
            if (line.startsWith('+')) return c.green + line + c.reset;
            if (line.startsWith('-')) return c.red + line + c.reset;
            return c.text + line + c.reset;
          })
          .join('\n');
        commandNote(colored, { markup: true });
      } catch (err) {
        commandError(`Could not get diff: ${err.message}`);
      }
      return;
    }

    if (['theme', 'tema'].includes(cmd)) {
      if (!arg) {
        commandNote(
          `Theme: ${theme.getTheme()}\nOptions: ${theme.listThemes().join(', ')}\nUse /theme default to restore the original Fynext theme.`
        );
        return;
      }
      if (!theme.setTheme(arg)) {
        commandError(`Unknown theme: ${arg}`);
        return;
      }
      cfg.theme = theme.getTheme();
      saveSettingsPatch({ theme: cfg.theme });
      if (typeof presenter.render === 'function') presenter.render();
      commandNote(`Theme: ${cfg.theme}`);
      return;
    }

    if (['face', 'yüz', 'yuz'].includes(cmd)) {
      const sub = (parts[0] || '').toLowerCase();
      const subArg = parts.slice(1).join(' ').trim();
      if (!sub) {
        const info = face.describe();
        const lines = [
          `Robot face: ${info.enabled ? 'enabled' : 'disabled'}`,
          `Port: ${info.port}${info.connected ? ' (connected)' : ''}`,
          `serialport: ${info.available ? 'available' : 'missing'}`
        ];
        if (info.error) lines.push(`Last error: ${info.error}`);
        if (info.lastEvent) lines.push(`Last event: ${JSON.stringify(info.lastEvent)}`);
        commandNote(lines.join('\n'));
        return;
      }
      if (sub === 'on' || sub === 'off') {
        const enabled = sub === 'on';
        saveSettingsPatch({ robotFaceEnabled: enabled });
        face.setEnabled(enabled);
        if (enabled) face.activate();
        commandNote(`Robot face ${enabled ? 'enabled' : 'disabled'}.`);
        return;
      }
      if (sub === 'ports') {
        try {
          const ports = await faceBridge.listPorts();
          if (!ports.length) {
            commandNote('No serial ports found.');
            return;
          }
          commandNote(
            ports
              .map((port) => {
                const label = port.friendlyName || port.manufacturer || 'serial device';
                return `${port.path} — ${label}`;
              })
              .join('\n')
          );
        } catch (err) {
          commandError(err.message);
        }
        return;
      }
      if (sub === 'port') {
        if (!subArg) {
          commandError('Usage: /face port COM5');
          return;
        }
        saveSettingsPatch({ robotFacePort: subArg });
        face.setPort(subArg);
        commandNote(`Robot face port: ${subArg}`);
        return;
      }
      if (sub === 'test' || sub === 'emotion') {
        const name = subArg || 'happy';
        face.emotion(name);
        commandNote(`Robot face expression: ${name}`);
        return;
      }
      if (sub === 'status') {
        const name = subArg || 'thinking';
        face.status(name);
        commandNote(`Robot face status: ${name}`);
        return;
      }
      commandError('Usage: /face [on|off|ports|port <path>|test <emotion>|emotion <name>|status <name>]');
      return;
    }

    if (['compact', 'sıkıştır', 'sikistir'].includes(cmd)) {
      if (messages.length <= 2) {
        commandNote('There is no conversation to compact.');
        return;
      }
      if (typeof presenter.setBusy === 'function') presenter.setBusy(true);
      presenter.setInfo({ status: 'Summarizing conversation' });
      try {
        const transcript = messages
          .slice(1)
          .map((message) => {
            const role = message.role === 'user' ? 'User' : message.role === 'tool' ? 'Tool' : 'Assistant';
            return `${role}: ${sanitize(message.content || '')}`;
          })
          .join('\n\n');
        const result = await llm.chat(
          cfg,
          [
            {
              role: 'system',
              content:
                'Summarize the following conversation concisely for use in future steps. ' +
                'Preserve decisions, modified files, commands run, and outstanding work. Output only the summary.'
            },
            { role: 'user', content: transcript }
          ],
          [],
          null,
          {}
        );
        const summary = sanitize(String(result.content || '').trim());
        if (!summary) throw new Error('The model returned an empty summary.');
        messages = [
          { role: 'system', content: systemPrompt },
          { role: 'assistant', content: `Summary of the previous conversation:\n${summary}` }
        ];
        presenter.reset();
        presenter.restoreConversation(messages.slice(1));
        persistConversation();
        commandNote('Conversation summarized and context compacted.');
      } catch (err) {
        commandError(`Could not summarize conversation: ${err.message}`);
      } finally {
        if (typeof presenter.setBusy === 'function') presenter.setBusy(false);
        presenter.setInfo({ status: mode });
      }
      return;
    }

    if (['export', 'dışa', 'disa'].includes(cmd)) {
      try {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const isJson = /\.json$/i.test(arg || '');
        const target = path.resolve(
          cfg.workspace,
          arg || `fynext-export-${stamp}.${isJson ? 'json' : 'md'}`
        );
        const body = messages.slice(1);
        const content = isJson
          ? JSON.stringify(body, null, 2) + '\n'
          : body
              .map((message) => {
                const role = message.role === 'user' ? 'User' : message.role === 'tool' ? 'Tool' : 'Assistant';
                return `## ${role}\n\n${sanitize(message.content || '')}`;
              })
              .join('\n\n') + '\n';
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, content, 'utf8');
        commandNote(`Exported to: ${target}`);
      } catch (err) {
        commandError(`Could not export conversation: ${err.message}`);
      }
      return;
    }

    if (['copy', 'kopyala'].includes(cmd)) {
      const blocks = [];
      for (const message of messages) {
        if (!message || message.role !== 'assistant') continue;
        blocks.push(...extractCodeBlocks(message.content || ''));
      }
      if (!blocks.length) {
        if (typeof presenter.setNotice === 'function') presenter.setNotice('No code block to copy.', 2000);
        else commandError('No code block to copy.');
        return;
      }
      let position = blocks.length - 1;
      if (arg) {
        const count = Number(arg);
        if (!Number.isInteger(count) || count < 1 || count > blocks.length) {
          commandError(`Enter a code block number between 1 and ${blocks.length}.`);
          return;
        }
        position = blocks.length - count;
      }
      try {
        await copyToClipboard(blocks[position]);
        const lines = blocks[position].split('\n').length;
        const message =
          `Copied code block ${blocks.length - position} of ${blocks.length} to the clipboard (${lines} lines).`;
        if (typeof presenter.setNotice === 'function') presenter.setNotice(message, 2400);
        else commandNote(message);
      } catch (err) {
        commandError(`Could not copy to the clipboard: ${err.message}`);
      }
      return;
    }

    if (['editor', 'düzenle', 'duzenle'].includes(cmd)) {
      const target = path.resolve(cfg.workspace, arg || 'AGENTS.md');
      try {
        if (!fs.existsSync(target)) fs.writeFileSync(target, '', 'utf8');
        const editorCommand =
          cfg.editor || process.env.VISUAL || process.env.EDITOR || (process.platform === 'win32' ? 'notepad' : 'vi');
        const tokens = editorCommand.match(/(?:[^\s"]+|"[^"]*")+/g) || [editorCommand];
        const command = tokens[0].replace(/^"|"$/g, '');
        const args = tokens.slice(1).map((token) => token.replace(/^"|"$/g, '')).concat(target);
        const result = spawnSync(command, args, { cwd: cfg.workspace, stdio: 'inherit' });
        if (result.error) throw result.error;
        commandNote(`Opened in editor: ${target}`);
      } catch (err) {
        commandError(`Could not open editor: ${err.message}`);
      }
      return;
    }

    if (['init', 'başlat', 'baslat'].includes(cmd)) {
      const target = path.join(cfg.workspace, 'AGENTS.md');
      if (fs.existsSync(target) && arg !== '--force') {
        commandNote(`AGENTS.md already exists: ${target}\nOverwrite it with: /init --force`);
        return;
      }
      try {
        const memory = projectContext.refreshProjectMemory(cfg);
        const body = [
          '# AGENTS.md',
          '',
          'This file contains workspace instructions for the Fynext agent.',
          '',
          '## Project Overview',
          '',
          projectContext.buildProjectMemoryText(memory),
          '',
          '## Agent Guidelines',
          '',
          '- Inspect relevant files before making changes.',
          '- Follow the existing code style, libraries, and directory structure.',
          '- Run relevant tests, lint, and type checks after making changes.',
          '- Never write secrets, tokens, or credentials to files or commits.',
          '- Do not create commits unless requested by the user.',
          ''
        ].join('\n');
        fs.writeFileSync(target, body, 'utf8');
        cfg.projectContext = memory;
        refreshSystem();
        commandNote(`Created AGENTS.md: ${target}`);
      } catch (err) {
        commandError(`Could not create AGENTS.md: ${err.message}`);
      }
      return;
    }

    if (['keybind', 'kısayol', 'kisayol'].includes(cmd)) {
      const actions = ['palette', 'details', 'new', 'historyPrev', 'historyNext', 'refresh', 'copy', 'mode'];
      if (!arg) {
        const lines = actions.map((action) => {
          const value = cfg.keybinds && cfg.keybinds[action];
          return `  ${action}: ${value || '(default)'}`;
        });
        commandNote(['Keyboard shortcuts:', ...lines, 'Change one with: /keybind <action> <key>'].join('\n'));
        return;
      }
      const [action, key] = arg.split(/\s+/);
      if (!actions.includes(action) || !key) {
        commandError(`Usage: /keybind <action> <key>\nActions: ${actions.join(', ')}`);
        return;
      }
      cfg.keybinds = Object.assign({}, cfg.keybinds, { [action]: key });
      saveSettingsPatch({ keybinds: cfg.keybinds });
      if (typeof presenter.setKeybinds === 'function') presenter.setKeybinds(cfg.keybinds);
      commandNote(`Shortcut: ${action} = ${key}`);
      return;
    }

    if (['details', 'detay'].includes(cmd)) {
      const truthy = ['on', '1', 'true', 'yes', 'y', 'açık', 'acik', 'evet', 'e'];
      const falsy = ['off', '0', 'false', 'no', 'n', 'kapalı', 'kapali', 'hayır', 'hayir', 'h'];
      if (arg && !truthy.includes(arg.toLowerCase()) && !falsy.includes(arg.toLowerCase())) {
        commandError('Usage: /details on|off');
        return;
      }
      const current = typeof presenter.isThinkingExpanded === 'function'
        ? presenter.isThinkingExpanded()
        : cfg.thinkingExpanded;
      const next = arg ? truthy.includes(arg.toLowerCase()) : !current;
      cfg.thinkingExpanded = next;
      saveSettingsPatch({ thinkingExpanded: next });
      if (typeof presenter.setThinkingExpanded === 'function') presenter.setThinkingExpanded(next);
      commandNote(`Thinking details: ${next ? 'on' : 'off'}`);
      return;
    }

    if (['undo', 'geri', 'revert'].includes(cmd)) {
      const result = applyChangeHistory(changeHistory, redoHistory, arg);
      if (result.error) commandError(result.error);
      if (result.files && result.files.length) commandNote('Undone: ' + result.files.join(', '));
      else if (!result.error) commandNote('There are no changes to undo.');
      return;
    }

    if (['redo', 'yinele'].includes(cmd)) {
      const result = applyChangeHistory(redoHistory, changeHistory, arg);
      if (result.error) commandError(result.error);
      if (result.files && result.files.length) commandNote('Redone: ' + result.files.join(', '));
      else if (!result.error) commandNote('There are no changes to redo.');
      return;
    }

    if (['model', 'models', 'modeller'].includes(cmd)) {
      let requestedModel = arg;
      if (!requestedModel) {
        if (cfg.provider === 'lumen') {
          const availableModels = await llm.listAvailableModels(cfg);
          if (typeof presenter.selectOption === 'function') {
            requestedModel = await presenter.selectOption(
              'Select a Lumen GGUF model',
              availableModels,
              cfg.model
            );
            if (!requestedModel) return;
          } else {
            commandNote(
              'Lumen models:\n' +
              lumen.MODELS.map((model) =>
                `  ${model.id} — ${model.name}, ${setup.formatBytes(model.size)}, ${model.license}`
              ).join('\n') +
              '\nDownloads require confirmation. Choose a model with /model <id>.'
            );
            return;
          }
        } else {
          let availableModels;
          presenter.setBusy(true);
          presenter.setInfo({ status: 'Loading models' });
          try {
            availableModels = await llm.listAvailableModels(cfg);
          } catch (err) {
            commandError(`Could not list models: ${err.message}`);
            return;
          } finally {
            presenter.setBusy(false);
            presenter.setInfo({ status: mode });
          }
          if (typeof presenter.selectOption === 'function') {
            requestedModel = await presenter.selectOption(
              'Select a local Ollama model',
              availableModels,
              cfg.model
            );
            if (!requestedModel) return;
          } else {
            commandNote(
              `Local models:\n${availableModels.map((name) => `${name === cfg.model ? '* ' : '  '}${name}`).join('\n')}\nSelect one with /model <name>.`
            );
            return;
          }
        }
      }
      const installed = await installModel(requestedModel);
      if (!installed) return;
      cfg.model = requestedModel;
      saveSettingsPatch({ model: cfg.model });
      refreshSystem();
      presenter.setInfo({ model: cfg.model });
      commandNote(`Model: ${cfg.model}`);
      return;
    }

    if (['project', 'proje', 'memory', 'hafıza'].includes(cmd)) {
      try {
        cfg.projectContext = projectContext.refreshProjectMemory(cfg);
      } catch (_) {
        cfg.projectContext = projectContext.readProjectMemory(cfg);
      }
      refreshSystem();
      commandNote(projectContext.buildProjectMemoryText(cfg.projectContext));
      return;
    }

    if (['git', 'status', 'değişiklikler', 'degisiklikler'].includes(cmd)) {
      try {
        cfg.projectContext = projectContext.refreshProjectMemory(cfg);
      } catch (_) {
        cfg.projectContext = projectContext.readProjectMemory(cfg);
      }
      const gitInfo = cfg.projectContext.git || {};
      const lines = [
        `Branch: ${gitInfo.branch || 'unknown'}`,
        `Status: ${gitInfo.status || 'no Git information'}`
      ];
      if (Array.isArray(gitInfo.recentCommits) && gitInfo.recentCommits.length) {
        lines.push('Recent commits:');
        lines.push(...gitInfo.recentCommits.slice(0, 5).map((entry) => `  ${entry}`));
      }
      commandNote(lines.join('\n'));
      return;
    }

    if (['review', 'incele', 'audit'].includes(cmd)) {
      try {
        cfg.projectContext = projectContext.refreshProjectMemory(cfg);
      } catch (_) {
        cfg.projectContext = projectContext.readProjectMemory(cfg);
      }
      const issues = projectContext.reviewProject(cfg, cfg.projectContext);
      if (!issues.length) {
        commandNote('Review result: no significant risks or technical debt found.');
        return;
      }
      commandNote(['Potential risks:', ...issues.map((issue) => `- ${issue}`)].join('\n'));
      return;
    }

    if (cmd === 'usage' || cmd === 'kullanım' || cmd === 'kullanim') {
      const total = sessionUsage.promptTokens + sessionUsage.outputTokens;
      const tokenText = sessionUsage.latestEstimated ? 'Estimated generation speed' : 'Latest generation speed';
      const details = [
        `Session tokens: ${total.toLocaleString('en-US')} (input ${sessionUsage.promptTokens.toLocaleString('en-US')} · output ${sessionUsage.outputTokens.toLocaleString('en-US')})`,
        `${tokenText}: ${sessionUsage.latestRate.toLocaleString('en-US')} tokens/min`
      ];
      commandNote(details.join('\n'));
      return;
    }

    if (['tools', 'araçlar', 'araclar'].includes(cmd)) {
      commandNote(
        'Tools:\n' +
          tools.definitionsForMode(mode)
            .map((entry) => {
              const fn = entry.function;
              return `${fn.name}: ${summarize(fn.description, 110)}`;
            })
            .join('\n')
      );
      return;
    }

    if (['mode', 'mod'].includes(cmd) && !arg) {
      commandNote(`Mode: ${mode}`);
      return;
    }

    if (['mode', 'mod', 'plan', 'build'].includes(cmd)) {
      const requested = ['plan', 'build'].includes(cmd) ? cmd : arg.toLowerCase();
      if (!['plan', 'build'].includes(requested)) {
        commandError('Usage: /mode plan or /mode build');
        return;
      }
      switchMode(requested);
      presenter.setNotice(`Mode: ${mode}`);
      return;
    }

    if (['roadmap', 'features', 'özellikler', 'ozellikler'].includes(cmd)) {
      commandNote(featureRoadmap.buildFeatureRoadmapText());
      return;
    }

    if (cmd === 'prompt') {
      commandNote(`# ${cfg.systemPromptPath}\n${systemPromptBase}`);
      return;
    }

    if (['reload', 'yenile'].includes(cmd)) {
      systemPromptBase = loadSystemPrompt(cfg);
      refreshSystem();
      commandNote('System prompt reloaded.');
      return;
    }

    if (cmd === 'workspace') {
      if (!arg) {
        commandNote(`workspace: ${cfg.workspace}`);
        return;
      }
      const target = path.resolve(cfg.workspace, arg);
      let targetStat = null;
      try {
        targetStat = fs.statSync(target);
      } catch (_) {
        targetStat = null;
      }
      if (!targetStat || !targetStat.isDirectory()) {
        commandError(`Directory not found: ${target}`);
        return;
      }
      cfg.workspace = target;
      refreshSystem();
      presenter.setInfo({ cwd: cfg.workspace });
      commandNote(`workspace: ${cfg.workspace}`);
      return;
    }

    if (['temp', 'temperature', 'sıcaklık', 'sicaklik'].includes(cmd)) {
      if (!arg) {
        commandNote(`temperature: ${cfg.temperature}`);
        return;
      }
      const value = Number(arg);
      if (!Number.isFinite(value) || value < 0 || value > 2) {
        commandError('Enter a valid value between 0 and 2.');
        return;
      }
      cfg.temperature = value;
      saveSettingsPatch({ temperature: value });
      commandNote(`temperature: ${cfg.temperature}`);
      return;
    }

    if (['approve', 'onay'].includes(cmd)) {
      if (!arg) {
        commandNote(`Action approval: ${cfg.approveDestructive ? 'on' : 'off'}`);
        return;
      }
      const value = arg.toLowerCase();
      const truthy = ['on', '1', 'true', 'yes', 'y', 'açık', 'acik', 'evet', 'e'];
      const falsy = ['off', '0', 'false', 'no', 'n', 'kapalı', 'kapali', 'hayır', 'hayir', 'h'];
      if (!truthy.includes(value) && !falsy.includes(value)) {
        commandError('Usage: /approve on|off');
        return;
      }
      cfg.approveDestructive = truthy.includes(value);
      saveSettingsPatch({ approveDestructive: cfg.approveDestructive });
      refreshSystem();
      commandNote(
        `Destructive action approval: ${cfg.approveDestructive ? 'on' : 'off'}`
      );
      return;
    }

    if (['clear', 'temizle', 'reset'].includes(cmd)) {
      startNewConversation();
      presenter.setNotice('Conversation cleared');
      return;
    }

    commandError(`Unknown command: /${cmd}`);
  }

  async function handleInput(text) {
    const input = String(text == null ? '' : text).trim();
    if (!input || exiting) return;

    if (input.startsWith('!')) {
      const command = input.slice(1).trim();
      if (!command) {
        presenter.error('Usage: !<command>');
        return;
      }
      if (typeof presenter.setBusy === 'function') presenter.setBusy(true);
      presenter.setInfo({ status: 'Running command' });
      try {
        const commandConfig = Object.assign({}, cfg, { toolCallApproved: true, approveDestructive: false });
        const result = await tools.run(commandConfig, 'shell_exec', { command }, 'build');
        const output = String(result == null ? '' : result).trim() || '(no output)';
        if (typeof presenter.showCommandResult === 'function') presenter.showCommandResult(output);
        else presenter.note(output);
      } catch (err) {
        const message = err && err.message ? err.message : String(err);
        if (typeof presenter.showCommandResult === 'function') presenter.showCommandResult(message, { error: true });
        else presenter.error(message);
      } finally {
        if (typeof presenter.setBusy === 'function') presenter.setBusy(false);
        presenter.setInfo({ status: mode });
      }
      return;
    }

    if (input.startsWith('/')) {
      try {
        await handleCommand(input);
      } catch (err) {
        const message = err && err.message ? err.message : String(err);
        if (typeof presenter.showCommandResult === 'function') {
          presenter.showCommandResult(message, { error: true });
        } else {
          presenter.error(message);
        }
      }
      return;
    }

    const { text: enrichedInput, attached } = resolveMentions(cfg.workspace, input, {
      allowOutsideWorkspace: cfg.allowOutsideWorkspace
    });
    if (attached && attached.length) {
      const summary = attached.map((a) => a.path).join(', ');
      presenter.note(`Attached context: ${summary}`);
    }

    messages.push({ role: 'user', content: enrichedInput });
    presenter.user(input);
    face.task('listening', 'Listening');
    try {
      persistConversation();
    } catch (err) {
      presenter.error(err.message);
    }
    presenter.setBusy(true);
    presenter.setInfo({ status: 'thinking' });

    let completed = false;
    try {
      const answer = await runAgent();
      if (!answer) presenter.note('The model returned an empty response.');
      else completed = true;
    } catch (err) {
      if (isAbort(err)) {
        face.emotion('idle');
        presenter.note('Stopped.');
      } else {
        face.emotion('sad');
        presenter.error(err && err.message ? err.message : String(err));
      }
    } finally {
      try {
        persistConversation();
      } catch (err) {
        presenter.error(err.message);
      }
      presenter.setInfo({ status: mode });
      presenter.setBusy(false);
      if (completed) notifyComplete();
    }
  }

  presenter.submitHandler((text) => {
    handleInput(text).catch((err) => presenter.error(err && err.stack ? err.stack : String(err)));
  });
  presenter.abortHandler(abortRun);
  presenter.exitHandler(() => shutdown(0));

  process.on('SIGINT', () => {
    if (activeController) abortRun();
    else shutdown(130);
  });
  process.on('SIGTERM', () => shutdown(143));
  process.on('uncaughtException', (err) => {
    try {
      presenter.stop();
    } catch (_) {
      /* yoksay */
    }
    process.stderr.write(`fynext: ${err && err.stack ? err.stack : err}\n`);
    process.exit(1);
  });
  process.on('unhandledRejection', (err) => {
    try {
      presenter.stop();
    } catch (_) {
      /* yoksay */
    }
    process.stderr.write(`fynext: ${err && err.stack ? err.stack : err}\n`);
    process.exit(1);
  });

  if (interactive || plainRepl) {
    presenter.start();
    await loadStartupConversation();
    if (cfg.provider === 'ollama') llm.warmup(cfg).catch(() => {});
    if (plainRepl) {
      presenter.note(`fynext ${pkg.version}  ·  ${cfg.model}  ·  ${cfg.workspace}`);
      presenter.note('Type /help to see available commands.');
    }
    await new Promise(() => {});
    return;
  }

  let prompt = flags.prompt;
  if (prompt == null) prompt = await readStdin();
  if (prompt && prompt.trim()) {
    await handleInput(prompt);
  } else {
    process.exitCode = 0;
  }
  shutdown(process.exitCode || 0);
}

if (require.main === module) {
  main().catch((err) => {
    try {
      process.stdout.write('\x1b[?25h\x1b[?2004l\x1b[?1049l');
    } catch (_) {
      /* yoksay */
    }
    process.stderr.write(`fynext: ${err && err.stack ? err.stack : err}\n`);
    process.exit(1);
  });
}

module.exports = { main };
