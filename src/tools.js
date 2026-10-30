'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { exec } = require('child_process');
const web = require('./web');

let confirmFn = async () => false;
function setConfirm(fn) {
  if (typeof fn === 'function') confirmFn = fn;
}

async function confirmAction(cfg, description) {
  if (!cfg.approveDestructive) return true;
  const answer = await confirmFn(description);
  if (answer === 'always') {
    cfg.approveDestructive = false;
    return true;
  }
  return answer === true;
}

function statSafe(p) {
  try {
    return fs.statSync(p);
  } catch (_) {
    return null;
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
  return s.slice(0, limit) + `\n… [${s.length - limit} karakter kirpildi]`;
}

function rootOf(p) {
  return path.parse(path.resolve(p)).root;
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
      description: 'List files and folders in a directory.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory path, relative to the workspace or absolute. Defaults to .' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'fs_read',
      description: 'Read a file, optionally limited to a line range.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path' },
          start_line: { type: 'number', description: 'Starting line (1-based)' },
          end_line: { type: 'number', description: 'Ending line' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'fs_write',
      description: 'Create a file or overwrite it. Set append=true to add content to the end.',
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
      description: 'Delete a file. Set recursive=true to delete a directory and its contents.',
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
      description: 'Move or rename a file or directory.',
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
        'Run a shell command and return its output. PLAN mode permits read-only commands; BUILD mode permits the available command set.',
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
      description: 'Search the web and return titles, URLs, and snippets.',
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
      description: 'Fetch a web page and return its text.',
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
      description: 'Replace the first matching text in a file.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path' },
          search: { type: 'string', description: 'Text to find' },
          replace: { type: 'string', description: 'Replacement text' }
        },
        required: ['path', 'search', 'replace']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'fs_glob',
      description: 'Find files by glob pattern, for example **/*.js.',
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
      description: 'Search file contents with plain text or a regular expression. Skips node_modules and .git.',
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
    const extra = entries.length > shown.length ? `\n… ${entries.length - shown.length} kayıt daha var` : '';
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
    if (statSafe(abs) && !(await confirmAction(cfg, `Uzerine yazilacak: ${abs}`))) {
      return 'Kullanici yazma islemini reddetti.';
    }
    await fsp.mkdir(path.dirname(abs), { recursive: true });
    if (args.append) await fsp.appendFile(abs, content, 'utf8');
    else await fsp.writeFile(abs, content, 'utf8');
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
    await fsp.rm(abs, { recursive: !!args.recursive, force: false });
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
    await fsp.mkdir(path.dirname(dst), { recursive: true });
    try {
      await fsp.rename(src, dst);
    } catch (err) {
      if (err.code !== 'EXDEV') throw err;
      await fsp.cp(src, dst, { recursive: true, force: true });
      await fsp.rm(src, { recursive: st.isDirectory(), force: true });
    }
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
    if (!(await confirmAction(cfg, `Komut: ${command}`))) return 'Kullanici komutu reddetti.';
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
    if (!raw.includes(search)) throw new Error('Eslesme bulunamadi');
    const next = raw.replace(search, replace);
    if (next === raw) throw new Error('Degisiklik yapilmadi');
    if (!(await confirmAction(cfg, `Dosya duzenlenecek: ${abs}`))) {
      return 'Kullanici duzenleme islemini reddetti.';
    }
    await fsp.writeFile(abs, next, 'utf8');
    return `Duzenlendi: ${abs} (ilk eslesme degistirildi)`;
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
    const extra = results.length >= (Number(cfg.maxListEntries) || 1000) ? `\n… daha fazla olabilir` : '';
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
    return `# ${base}\n${results.join('\n')}\n… (max 80)`;
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

async function run(cfg, name, args, mode) {
  if (mode === 'plan' && !PLAN_TOOL_NAMES.has(name)) {
    throw new Error('PLAN modunda bu araca izin verilmiyor; dosya degisikligi BUILD modunda yapilabilir.');
  }
  const fn = handlers[name];
  if (!fn) throw new Error('Bilinmeyen arac: ' + name);
  const toolConfig = mode === 'plan'
    ? Object.assign({}, cfg, { mode: 'plan' })
    : cfg;
  return fn(toolConfig, args || {});
}

function toolNames() {
  return definitions.map((d) => d.function.name);
}

module.exports = {
  setConfirm,
  definitions,
  definitionsForMode,
  run,
  toolNames,
  resolvePath,
  clip,
  sleep
};
