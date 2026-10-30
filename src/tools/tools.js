'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const { exec } = require('child_process');
const web = require('./web');

let confirmFn = async () => false;
function setConfirm(fn) {
  if (typeof fn === 'function') confirmFn = fn;
}

async function confirmAction(cfg, description, forceConfirmation = false) {
  if (!cfg.approveDestructive && !forceConfirmation) return true;
  const answer = await confirmFn(description);
  if (answer === 'always') {
    cfg.approveDestructive = false;
    return true;
  }
  return answer === true;
}

function beginMutation(cfg, name, args) {
  return typeof cfg.beforeMutation === 'function'
    ? cfg.beforeMutation(name, args)
    : null;
}

function finishMutation(cfg, snapshot) {
  if (typeof cfg.afterMutation === 'function') cfg.afterMutation(snapshot);
}

function statSafe(p) {
  try {
    return fs.statSync(p);
  } catch (_) {
    return null;
  }
}

async function atomicWriteFile(filePath, content, mode) {
  const dir = path.dirname(filePath);
  const tempPath = path.join(dir, `.${path.basename(filePath)}.fynext-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`);
  try {
    await fsp.writeFile(tempPath, content, { encoding: 'utf8', mode });
    await fsp.rename(tempPath, filePath);
  } catch (err) {
    await fsp.rm(tempPath, { force: true }).catch(() => {});
    throw err;
  }
}

function resolvePath(cfg, p) {
  if (!p || typeof p !== 'string') throw new Error('Gecersiz yol');
  const abs = path.isAbsolute(p) ? path.normalize(p) : path.resolve(cfg.workspace, p);
  if (cfg.allowOutsideWorkspace) return abs;
  const rel = path.relative(cfg.workspace, abs);
  if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) return abs;
  throw new Error(`Calisma alani disinda erisim reddedildi: ${abs}`);
}

function clip(cfg, text) {
  const limit = Number(cfg.maxOutputChars) > 0 ? Number(cfg.maxOutputChars) : 12000;
  const s = String(text == null ? '' : text);
  if (s.length <= limit) return s;
  return s.slice(0, limit) + `\nâ€¦ [${s.length - limit} karakter kirpildi]`;
}

function rootOf(p) {
  return path.parse(path.resolve(p)).root;
}

function desktopDirectory() {
  const roots = [
    process.env.OneDriveCommercial,
    process.env.OneDriveConsumer,
    process.env.OneDrive,
    process.env.USERPROFILE,
    os.homedir()
  ].filter(Boolean);
  const candidates = roots.flatMap((root) => [
    path.join(root, 'Desktop'),
    path.join(root, 'MasaÃ¼stÃ¼')
  ]);
  const existing = candidates.find((candidate) => {
    const stat = statSafe(candidate);
    return stat && stat.isDirectory();
  });
  return existing || path.join(os.homedir(), 'Desktop');
}

function isFilesystemRoot(p) {
  const abs = path.resolve(p);
  return abs === rootOf(abs);
}

function readlineStream(filePath, start, end) {
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
    let buf = '';
    let lineNo = 0;
    let total = 0;
    const selected = [];
    stream.on('data', (chunk) => {
      buf += chunk;
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        lineNo += 1;
        if (lineNo >= start && lineNo <= end) selected.push(`${lineNo}: ${line}`);
      }
    });
    stream.on('error', reject);
    stream.on('end', () => {
      if (buf.length) {
        lineNo += 1;
        if (lineNo >= start && lineNo <= end) selected.push(`${lineNo}: ${buf}`);
      }
      total = lineNo;
      resolve({ lines: selected, total });
    });
  });
}

const definitions = [
  {
    type: 'function',
    function: {
      name: 'fs_list',
      description: 'Inspect the workspace. Lists one directory level; use fs_glob to find files recursively and fs_read to inspect their contents.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory to list, relative to the workspace (usually . or src). Must be a directory.' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'fs_read',
      description: 'Read real file contents. Use after fs_glob/fs_list identifies a relevant file; use line ranges for large files.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Existing file path relative to the workspace.' },
          start_line: { type: 'number', description: 'Optional first line, 1-based.' },
          end_line: { type: 'number', description: 'Optional last line, inclusive.' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'fs_write',
      description: 'Create a new file or replace a file with complete content. Use fs_write for file creation; if no content was requested, create it empty. Existing files require approval. Use fs_edit only to change known text in an existing file.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path' },
          content: { type: 'string', description: 'Content to write' },
          append: { type: 'boolean', description: 'Append to the file when true' }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'fs_delete',
      description: 'Delete a file or directory. This is destructive and requires approval; recursive=true is required for non-empty directories.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to delete' },
          recursive: { type: 'boolean', description: 'Recursively delete the directory' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'fs_move',
      description: 'Move or rename a workspace file or directory. Destination collisions and destructive effects require approval.',
      parameters: {
        type: 'object',
        properties: {
          source: { type: 'string', description: 'Source path' },
          destination: { type: 'string', description: 'Destination path' }
        },
        required: ['source', 'destination']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'fs_mkdir',
      description: 'Create a directory, including missing parent directories.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Directory path' } },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'shell_exec',
      description:
        'Run a shell command in the workspace and return stdout, stderr, exit status, or timeout. Use for build/test/lint/git commands. PLAN mode accepts only allowlisted read-only commands.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Command to run' },
          cwd: { type: 'string', description: 'Working directory (optional)' },
          timeout_sec: { type: 'number', description: 'Timeout in seconds; defaults to 60' }
        },
        required: ['command']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web for current or external information; returns titles, URLs, and snippets. Use web_fetch to verify a result.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          max_results: { type: 'number', description: 'Maximum results; defaults to 6' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'web_fetch',
      description: 'Fetch and extract readable text from one HTTP/HTTPS page. Use after web_search or when the user supplies a URL.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Page URL' },
          max_chars: { type: 'number', description: 'Maximum characters to return' }
        },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'fs_edit',
      description: 'Edit an existing file with a targeted text patch. Never use this to create a file. The search text must match exactly once unless replace_all=true; expected_count can guard against stale edits. Read the file first.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path' },
          search: { type: 'string', description: 'Text to find' },
          replace: { type: 'string', description: 'Replacement text' },
          replace_all: { type: 'boolean', description: 'Replace every exact occurrence. Defaults to false.' },
          expected_count: { type: 'number', description: 'Optional expected number of matches; reject if the current file differs.' }
        },
        required: ['path', 'search', 'replace']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'fs_glob',
      description: 'Find workspace-relative file paths recursively with a glob, e.g. **/*.js or src/**/*.ts. Prefer this over repeatedly listing folders.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Glob pattern' },
          path: { type: 'string', description: 'Search directory; defaults to .' }
        },
        required: ['pattern']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'fs_grep',
      description: 'Search workspace text files by literal text or regular expression. Skips generated/dependency folders; include can narrow file extensions, e.g. *.js.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Text or regular expression to find' },
          path: { type: 'string', description: 'Search directory; defaults to .' },
          include: { type: 'string', description: 'File filter, for example *.js' }
        },
        required: ['pattern']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'git_status',
      description: 'Show Git repository status.',
      parameters: {
        type: 'object',
        properties: {
          cwd: { type: 'string', description: 'Working directory (optional)' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'git_diff',
      description: 'Show Git diff, optionally staged or limited to a path.',
      parameters: {
        type: 'object',
        properties: {
          cwd: { type: 'string', description: 'Working directory (optional)' },
          staged: { type: 'boolean', description: 'Show staged changes when true' },
          path: { type: 'string', description: 'Specific file path (optional)' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'git_log',
      description: 'Show recent Git commits.',
      parameters: {
        type: 'object',
        properties: {
          cwd: { type: 'string', description: 'Working directory (optional)' },
          count: { type: 'number', description: 'Number of commits; defaults to 10' }
        },
        required: []
      }
    }
  }
];

const PLAN_TOOL_NAMES = new Set([
  'fs_list',
  'fs_read',
  'fs_glob',
  'fs_grep',
  'shell_exec',
  'git_status',
  'git_diff',
  'git_log',
  'web_search',
  'web_fetch'
]);

const PLAN_SHELL_COMMANDS = new Set([
  'cd',
  'dir',
  'echo',
  'fc',
  'findstr',
  'hostname',
  'more',
  'tree',
  'type',
  'ver',
  'where',
  'whoami'
]);
const PLAN_GIT_COMMANDS = new Set([
  'branch',
  'diff',
  'log',
  'ls-files',
  'rev-parse',
  'show',
  'status'
]);

function assertPlanShellCommand(command) {
  const value = String(command || '').trim();
  if (!value) throw new Error('Bos komut');
  if (/[&|<>^%!\r\n]/.test(value)) {
    throw new Error('PLAN modunda shell komut zincirleri ve yonlendirmeler kullanilamaz.');
  }

  const match = value.match(/^("[^"]+"|\S+)(?:\s+([\s\S]*))?$/);
  if (!match) throw new Error('PLAN modunda bu shell komutuna izin verilmiyor.');
  const executable = path.basename(match[1].replace(/^"|"$/g, '')).toLowerCase().replace(/\.exe$/, '');
  const args = (match[2] || '').trim();

  if (executable === 'git') {
    const subcommandMatch = args.match(/^(\S+)(?:\s+([\s\S]*))?$/);
    if (!subcommandMatch || !PLAN_GIT_COMMANDS.has(subcommandMatch[1].toLowerCase())) {
      throw new Error('PLAN modunda yalnizca salt-okunur git komutlarina izin verilir.');
    }
    const gitArgs = subcommandMatch[2] || '';
    if (/(^|\s)(?:-o(?=\s|$)|--output(?=\s|=|$)|--exec-path(?=\s|$)|--git-dir(?=\s|=|$)|--work-tree(?=\s|=|$)|--config(?:-env)?(?=\s|=|$)|--ext-diff(?=\s|$)|--textconv(?=\s|$))/i.test(gitArgs)) {
      throw new Error('PLAN modunda dosyaya cikti yazan git seceneklerine izin verilmiyor.');
    }
    if (subcommandMatch[1].toLowerCase() === 'branch' &&
        /(^|\s)(?:-d|-D|-m|-M|-c|-C|--delete|--move|--copy)(?=\s|=|$)/i.test(gitArgs)) {
      throw new Error('PLAN modunda git branch degistiren seceneklere izin verilmiyor.');
    }
    return;
  }

  if (!PLAN_SHELL_COMMANDS.has(executable)) {
    throw new Error('PLAN modunda yalnizca salt-okunur shell komutlarina izin verilir.');
  }
}

function preparePlanShellCommand(command) {
  assertPlanShellCommand(command);
  const value = String(command).trim();
  const match = value.match(/^("[^"]+"|\S+)\s+(diff)(?=\s|$)([\s\S]*)$/i);
  if (!match) return value;
  const executable = path.basename(match[1].replace(/^"|"$/g, '')).toLowerCase().replace(/\.exe$/, '');
  return executable === 'git'
    ? `${match[1]} ${match[2]} --no-ext-diff --no-textconv${match[3]}`
    : value;
}

function definitionsForMode(mode) {
  return mode === 'plan'
    ? definitions.filter((entry) => PLAN_TOOL_NAMES.has(entry.function.name))
    : definitions;
}

function definitionsForRequest(mode, request) {
  const text = String(request || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[Ä±Ä°]/g, 'i').toLowerCase();
  const project = /\b(project|repo|repository|codebase|code|file|folder|workspace|proje|repo|kod|dosya|klasor|uygulama|hata|bug)\w*\b/.test(text);
  const webSearch = /\b(web|internet|online|url|link|source|sources|latest|current|news|website|site|research|ara\w*|guncel|kaynak|internet|webde)\b/.test(text);
  const git = /\b(git|commit|branch|diff|history|log|durum|degisiklikler)\b/.test(text);
  const shell = /\b(run|execute|test|build|lint|install|terminal|command|calistir|test|derle|kur|komut)\b/.test(text);
  const mutate = /\b(fix|implement|add|edit|write|change|create|delete|remove|rename|move|refactor|update|duzelt|ekle|yaz|degistir|olustur|sil|tasi|duzenle|iyilestir)\w*\b/.test(text);
  if (!project && !webSearch && !git && !shell && !mutate) return definitionsForMode(mode);

  const names = new Set();
  if (project || mutate) {
    ['fs_list', 'fs_read', 'fs_glob', 'fs_grep'].forEach((name) => names.add(name));
    if (mutate && mode !== 'plan') {
      ['fs_edit', 'fs_write', 'fs_delete', 'fs_move', 'fs_mkdir'].forEach((name) => names.add(name));
      names.add('shell_exec');
    }
  }
  if (webSearch) ['web_search', 'web_fetch'].forEach((name) => names.add(name));
  if (git) ['git_status', 'git_diff', 'git_log'].forEach((name) => names.add(name));
  if (shell) names.add('shell_exec');
  if (!names.size) return definitionsForMode(mode);
  return definitionsForMode(mode).filter((entry) => names.has(entry.function.name));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function shellCommand(command) {
  if (process.platform !== 'win32') return command;
  if (/^\s*chcp\b/i.test(command)) return command;
  return 'chcp 65001>nul & ' + command;
}

async function runShell(command, cwd, timeoutSec, signal, readOnly) {
  const timeout = (Number(timeoutSec) > 0 ? Number(timeoutSec) : 60) * 1000;
  return new Promise((resolve) => {
    exec(
      shellCommand(command),
      {
        cwd,
        timeout,
        maxBuffer: 16 * 1024 * 1024,
        windowsHide: true,
        encoding: 'utf8',
        signal,
        env: Object.assign({}, process.env, {
          PYTHONUTF8: '1',
          PYTHONIOENCODING: 'utf-8',
          ...(readOnly ? { GIT_OPTIONAL_LOCKS: '0' } : {})
        })
      },
      (err, stdout, stderr) => {
        const parts = [];
        if (stdout) parts.push(stdout.replace(/\s+$/, ''));
        if (stderr) parts.push('[stderr] ' + stderr.replace(/\s+$/, ''));
        if (err) {
          if (err.name === 'AbortError' || (signal && signal.aborted)) {
            parts.push('[iptal edildi]');
          } else if (err.killed) {
            parts.push(`[zaman asimi: ${Math.round(timeout / 1000)}s]`);
          } else if (!stdout && !stderr) {
            parts.push('[hata] ' + err.message);
          }
          parts.push('[cikis kodu: ' + (err.code != null ? err.code : 'hata') + ']');
        } else {
          parts.push('[cikis kodu: 0]');
        }
        resolve(parts.filter(Boolean).join('\n'));
      }
    );
  });
}

const handlers = {
  async fs_list(cfg, args) {
    const abs = resolvePath(cfg, args.path || '.');
    const st = statSafe(abs);
    if (!st) throw new Error('Bulunamadi: ' + abs);
    if (!st.isDirectory()) throw new Error('Dizin degil: ' + abs);
    const entries = await fsp.readdir(abs, { withFileTypes: true });
    const limit = Math.max(1, Number(cfg.maxListEntries) || 1000);
    const shown = entries.slice(0, limit);
    shown.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
    const rows = shown.map((e) => {
      const full = path.join(abs, e.name);
      const s = statSafe(full);
      const kind = e.isDirectory() ? '[D]' : '[F]';
      const size = e.isDirectory() ? '-' : s ? String(s.size) : '?';
      return `${kind} ${size.padStart(10)}  ${e.name}`;
    });
    const extra = entries.length > shown.length ? `\nâ€¦ ${entries.length - shown.length} kayÄ±t daha var` : '';
    return `# ${abs}\n${rows.join('\n') || '(bos)'}${extra}`;
  },

  async fs_read(cfg, args) {
    const abs = resolvePath(cfg, args.path);
    const st = statSafe(abs);
    if (!st) throw new Error('Bulunamadi: ' + abs);
    if (st.isDirectory()) throw new Error('Dizin okunmaz, fs_list kullan: ' + abs);
    const maxBytes = Math.max(65536, Number(cfg.maxReadBytes) || 4 * 1024 * 1024);
    const hasRange = args.start_line || args.end_line;
    if (st.size > maxBytes) {
      const s = Math.max(1, Number(args.start_line) || 1);
      const e = Math.max(s, Number(args.end_line) || s + 1999);
      const { lines, total } = await readlineStream(abs, s, e);
      const last = Math.min(e, total);
      const body = lines.join('\n') || '(bos)';
      return clip(
        cfg,
        `# ${abs} (satir ${s}-${last} / ${total}, buyuk dosya)\n${body}`
      );
    }
    const raw = await fsp.readFile(abs, 'utf8');
    const lines = raw.split('\n');
    if (hasRange) {
      const s = Math.max(1, Number(args.start_line) || 1);
      const e = Math.min(lines.length, Number(args.end_line) || lines.length);
      const slice = lines.slice(s - 1, e).map((l, i) => `${s + i}: ${l}`).join('\n');
      return clip(cfg, `# ${abs} (satir ${s}-${e} / ${lines.length})\n${slice}`);
    }
    return clip(cfg, `# ${abs} (${lines.length} satir)\n${raw}`);
  },

  async fs_write(cfg, args) {
    const abs = resolvePath(cfg, args.path);
    const content = String(args.content == null ? '' : args.content);
    const existing = statSafe(abs);
    if (existing && !(await confirmAction(cfg, `Uzerine yazilacak: ${abs}`))) {
      return 'Kullanici yazma islemini reddetti.';
    }
    const undoSnapshot = beginMutation(cfg, 'fs_write', args);
    await fsp.mkdir(path.dirname(abs), { recursive: true });
    if (args.append) await fsp.appendFile(abs, content, 'utf8');
    else await atomicWriteFile(abs, content, existing ? existing.mode & 0o777 : undefined);
    finishMutation(cfg, undoSnapshot);
    const st = statSafe(abs);
    return `Yazildi: ${abs} (${st ? st.size : content.length} bayt${args.append ? ', eklendi' : ''})`;
  },

  async fs_delete(cfg, args) {
    const abs = resolvePath(cfg, args.path);
    if (isFilesystemRoot(abs)) throw new Error('Surucu kok dizini silinemez: ' + abs);
    const st = statSafe(abs);
    if (!st) throw new Error('Bulunamadi: ' + abs);
    if (!(await confirmAction(cfg, `Silinecek: ${abs} (${st.isDirectory() ? 'klasor' : 'dosya'})`))) {
      return 'Kullanici silme islemini reddetti.';
    }
    const undoSnapshot = beginMutation(cfg, 'fs_delete', args);
    await fsp.rm(abs, { recursive: !!args.recursive, force: false });
    finishMutation(cfg, undoSnapshot);
    return `Silindi: ${abs}`;
  },

  async fs_move(cfg, args) {
    const src = resolvePath(cfg, args.source);
    const dst = resolvePath(cfg, args.destination);
    const st = statSafe(src);
    if (!st) throw new Error('Kaynak bulunamadi: ' + src);
    if (!(await confirmAction(cfg, `Tasinacak: ${src} -> ${dst}`))) {
      return 'Kullanici tasima islemini reddetti.';
    }
    const undoSnapshot = beginMutation(cfg, 'fs_move', args);
    await fsp.mkdir(path.dirname(dst), { recursive: true });
    try {
      await fsp.rename(src, dst);
    } catch (err) {
      if (err.code !== 'EXDEV') throw err;
      await fsp.cp(src, dst, { recursive: true, force: true });
      await fsp.rm(src, { recursive: st.isDirectory(), force: true });
    }
    finishMutation(cfg, undoSnapshot);
    return `Tasindi: ${src} -> ${dst}`;
  },

  async fs_mkdir(cfg, args) {
    const abs = resolvePath(cfg, args.path);
    await fsp.mkdir(abs, { recursive: true });
    return `Klasor hazir: ${abs}`;
  },

  async shell_exec(cfg, args) {
    let command = String(args.command || '').trim();
    if (!command) throw new Error('Bos komut');
    if (cfg.mode === 'plan') command = preparePlanShellCommand(command);
    const cwd = args.cwd ? resolvePath(cfg, args.cwd) : cfg.workspace;
    const highImpact = /(?:^|[;&|]\s*)(?:sudo\b|rm\s+-(?=[^\n]*r)(?=[^\n]*f)[^\n]*|rmdir\b|del\b[^\n]*\/s|erase\b[^\n]*\/s|remove-item\b[^\n]*-recurse|format\b|diskpart\b|git\s+reset\s+--hard|git\s+clean\s+-[^\n]*f|git\s+checkout\s+--|(?:drop|truncate)\s+(?:table|database)\b)/i.test(command) || /\s>{1,2}\s*\S+/.test(command);
    const risk = highImpact
      ? 'YÃœKSEK: silme, sÄ±fÄ±rlama veya dosya Ã¼zerine yazma etkisi olabilir.'
      : 'Komut Ã§alÄ±ÅŸma alanÄ±nda Ã§alÄ±ÅŸtÄ±rÄ±lacak.';
    const safePreview = (value) => String(value).replace(/[\x00-\x1f\x7f]/g, ' ');
    if (!(await confirmAction(cfg, `Komut Ã¶nizlemesi\nDizin: ${safePreview(cwd)}\nEtki: ${risk}\nKomut: ${safePreview(command)}`, highImpact))) {
      return 'Kullanici komutu reddetti.';
    }
    return clip(cfg, await runShell(command, cwd, args.timeout_sec, cfg.abortSignal, cfg.mode === 'plan'));
  },

  async web_search(cfg, args) {
    const query = String(args.query || '').trim();
    if (!query) throw new Error('Bos sorgu');
    const max = Math.min(Math.max(Number(args.max_results) || 6, 1), 10);
    const results = await web.webSearch(cfg, query, max, cfg.requestTimeoutSec);
    if (!results.length) return `Sonuc bulunamadi: ${query}`;
    const out = results
      .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`)
      .join('\n\n');
    return clip(cfg, `# Arama: ${query}\n${out}`);
  },

  async web_fetch(cfg, args) {
    const url = String(args.url || '').trim();
    if (!url) throw new Error('Bos url');
    const r = await web.webFetch(cfg, url, Number(args.max_chars) || 0, cfg.requestTimeoutSec);
    const header = `# ${r.finalUrl} (HTTP ${r.status}${r.truncated ? ', kirpildi' : ''})`;
    return clip(cfg, `${header}\n${r.text}`);
  },

  async fs_edit(cfg, args) {
    const abs = resolvePath(cfg, args.path);
    const search = String(args.search == null ? '' : args.search);
    const replace = String(args.replace == null ? '' : args.replace);
    if (!search) throw new Error('search bos olamaz');
    const raw = await fsp.readFile(abs, 'utf8');
    const matches = raw.split(search).length - 1;
    if (!matches) throw new Error('Eslesme bulunamadi. Dosya icerigini yeniden oku ve guncel baglamla patch olustur.');
    if (args.expected_count != null && Number(args.expected_count) !== matches) {
      throw new Error(`Beklenen eslesme sayisi ${args.expected_count}, dosyadaki sayi ${matches}. Degisiklik uygulanmadi; dosyayi yeniden oku.`);
    }
    if (matches > 1 && !args.replace_all) {
      throw new Error(`Patch belirsiz: metin ${matches} kez eslesiyor. Daha fazla baglam ekle veya replace_all=true ile expected_count belirt.`);
    }
    const next = args.replace_all ? raw.split(search).join(replace) : raw.replace(search, replace);
    if (next === raw) throw new Error('Degisiklik yapilmadi');
    if (!(await confirmAction(cfg, `Dosya duzenlenecek: ${abs}`))) {
      return 'Kullanici duzenleme islemini reddetti.';
    }
    const undoSnapshot = beginMutation(cfg, 'fs_edit', args);
    const stat = statSafe(abs);
    await atomicWriteFile(abs, next, stat ? stat.mode & 0o777 : undefined);
    finishMutation(cfg, undoSnapshot);
    return `Duzenlendi: ${abs} (${args.replace_all ? matches : 1} eslesme; atomik yazim)`;
  },

  async fs_glob(cfg, args) {
    const pattern = String(args.pattern || '').trim();
    if (!pattern) throw new Error('Bos paterni');
    const base = args.path ? resolvePath(cfg, args.path) : cfg.workspace;
    const st = statSafe(base);
    if (!st || !st.isDirectory()) throw new Error('Dizin bulunamadi: ' + base);
    const ignore = ['node_modules', '.git', 'dist', 'build', 'out', '.next', '.turbo', 'coverage'];
    const results = [];
    const walk = async (dir) => {
      const entries = await fsp.readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        if (e.isDirectory()) {
          if (ignore.includes(e.name)) continue;
          await walk(path.join(dir, e.name));
          continue;
        }
        const full = path.join(dir, e.name);
        const rel = path.relative(base, full).replace(/\\/g, '/');
        const name = e.name;
        let match = false;
        if (pattern.includes('*')) {
          const re = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*\*/g, '___DOUBLE___').replace(/\*/g, '[^/\\\\]*').replace(/___DOUBLE___/g, '.*') + '$');
          if (re.test(rel) || re.test(name)) match = true;
        } else {
          if (rel === pattern || name === pattern) match = true;
        }
        if (match) results.push(rel || name);
        if (results.length >= Math.max(1, Number(cfg.maxListEntries) || 1000)) break;
      }
    };
    await walk(base);
    results.sort((a, b) => a.localeCompare(b));
    if (!results.length) return `Eslesme yok: ${pattern}`;
    const extra = results.length >= (Number(cfg.maxListEntries) || 1000) ? `\nâ€¦ daha fazla olabilir` : '';
    return `# ${base}\n${results.join('\n')}${extra}`;
  },

  async fs_grep(cfg, args) {
    const pattern = String(args.pattern || '').trim();
    if (!pattern) throw new Error('Bos paterni');
    const base = args.path ? resolvePath(cfg, args.path) : cfg.workspace;
    const include = args.include ? String(args.include) : null;
    const st = statSafe(base);
    if (!st || !st.isDirectory()) throw new Error('Dizin bulunamadi: ' + base);
    const ignore = ['node_modules', '.git', 'dist', 'build', 'out', '.next', '.turbo', 'coverage'];
    let re;
    try {
      re = new RegExp(pattern, 'i');
    } catch (_) {
      re = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    }
    const results = [];
    const walk = async (dir) => {
      const entries = await fsp.readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        if (e.isDirectory()) {
          if (ignore.includes(e.name)) continue;
          await walk(path.join(dir, e.name));
          continue;
        }
        const name = e.name;
        if (include) {
          const incRe = new RegExp('^' + include.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$', 'i');
          if (!incRe.test(name)) continue;
        }
        const full = path.join(dir, e.name);
        try {
          const raw = await fsp.readFile(full, 'utf8');
          if (raw.length > 512000) continue;
          const lines = raw.split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (re.test(lines[i])) {
              const rel = path.relative(base, full).replace(/\\/g, '/');
              results.push(`${rel}:${i + 1}: ${lines[i].slice(0, 200)}`);
              if (results.length >= 80) break;
            }
          }
        } catch (_) {
          /* skip */
        }
        if (results.length >= 80) break;
      }
      if (results.length >= 80) return;
    };
    await walk(base);
    if (!results.length) return `Eslesme yok: ${pattern}`;
    return `# ${base}\n${results.join('\n')}\nâ€¦ (max 80)`;
  },

  async git_status(cfg, args) {
    const cwd = args.cwd ? resolvePath(cfg, args.cwd) : cfg.workspace;
    return clip(cfg, await runShell('git status --short --branch', cwd, 30, cfg.abortSignal, cfg.mode === 'plan'));
  },

  async git_diff(cfg, args) {
    const cwd = args.cwd ? resolvePath(cfg, args.cwd) : cfg.workspace;
    const staged = args.staged ? '--cached' : '';
    const pathArg = args.path ? ' -- ' + String(args.path) : '';
    let cmd = `git diff ${staged}${pathArg}`.trim();
    if (cfg.mode === 'plan') cmd = preparePlanShellCommand(cmd);
    return clip(cfg, await runShell(cmd, cwd, 60, cfg.abortSignal, cfg.mode === 'plan'));
  },

  async git_log(cfg, args) {
    const cwd = args.cwd ? resolvePath(cfg, args.cwd) : cfg.workspace;
    const count = Math.max(1, Math.min(50, Number(args.count) || 10));
    return clip(cfg, await runShell(`git log -n ${count} --oneline --graph`, cwd, 30, cfg.abortSignal, cfg.mode === 'plan'));
  }
};

async function run(cfg, name, args, mode, lifecycle) {
  if (mode === 'plan' && !PLAN_TOOL_NAMES.has(name)) {
    throw new Error('PLAN modunda bu araca izin verilmiyor; dosya degisikligi BUILD modunda yapilabilir.');
  }
  const fn = handlers[name];
  if (!fn) throw new Error('Bilinmeyen arac: ' + name);
  const toolConfig = Object.assign(
    {},
    cfg,
    mode === 'plan' ? { mode: 'plan' } : {},
    lifecycle || {}
  );
  return fn(toolConfig, args || {});
}

function validateCall(name, args, mode) {
  const definition = definitionsForMode(mode).find((entry) => entry.function.name === name);
  if (!definition) return { valid: false, error: `Arac '${name}' bu modda kullanilabilir degil. Aktif araclar: ${toolNamesForMode(mode).join(', ')}.` };
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    return { valid: false, error: `'${name}' arguments bir JSON object olmali.` };
  }
  const schema = definition.function.parameters || {};
  const properties = schema.properties || {};
  const unknown = Object.keys(args).filter((key) => !Object.prototype.hasOwnProperty.call(properties, key));
  if (unknown.length) return { valid: false, error: `Bilinmeyen parametre: ${unknown.join(', ')}. Gecerli parametreler: ${Object.keys(properties).join(', ') || '(yok)'}.` };
  const missing = (schema.required || []).filter((key) => args[key] == null || args[key] === '');
  if (missing.length) return { valid: false, error: `Eksik zorunlu parametre: ${missing.join(', ')}.` };
  for (const [key, value] of Object.entries(args)) {
    if (value == null) continue;
    const expected = properties[key] && properties[key].type;
    const valid = expected === 'string' ? typeof value === 'string'
      : expected === 'number' ? typeof value === 'number' && Number.isFinite(value)
        : expected === 'boolean' ? typeof value === 'boolean'
          : expected === 'array' ? Array.isArray(value)
            : expected === 'object' ? typeof value === 'object' && !Array.isArray(value)
              : true;
    if (!valid) return { valid: false, error: `Parametre '${key}' ${expected || 'uygun tipte'} olmali; gelen tip ${Array.isArray(value) ? 'array' : typeof value}.` };
  }
  return { valid: true };
}

function toolNamesForMode(mode) {
  return definitionsForMode(mode).map((entry) => entry.function.name);
}

function toolNames() {
  return definitions.map((d) => d.function.name);
}

module.exports = {
  setConfirm,
  definitions,
  definitionsForMode,
  definitionsForRequest,
  validateCall,
  run,
  desktopDirectory,
  toolNames,
  resolvePath,
  clip,
  sleep
};

