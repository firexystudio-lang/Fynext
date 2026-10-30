'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MAX_SNAPSHOT_BYTES = 5 * 1024 * 1024;

function pathsFor(cfg, name, args) {
  if (name === 'fs_write' || name === 'fs_edit' || name === 'fs_delete') return [args.path];
  if (name === 'fs_move') return [args.source, args.destination];
  return [];
}

function resolveTrackedPath(cfg, value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('invalid path');
  const filePath = path.isAbsolute(value) ? path.normalize(value) : path.resolve(cfg.workspace, value);
  if (!cfg.allowOutsideWorkspace) {
    const relative = path.relative(cfg.workspace, filePath);
    if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
      throw new Error('path outside workspace');
    }
  }
  return filePath;
}

function snapshot(filePath, remainingBytes) {
  let stat;
  try {
    stat = fs.lstatSync(filePath);
  } catch (err) {
    if (err.code === 'ENOENT') return { path: filePath, exists: false };
    throw err;
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error('only regular files can be recorded for undo');
  }
  if (stat.size > remainingBytes) throw new Error('file exceeds the undo snapshot size limit');
  return {
    path: filePath,
    exists: true,
    mode: stat.mode & 0o777,
    content: fs.readFileSync(filePath)
  };
}

function capture(cfg, name, args) {
  const paths = pathsFor(cfg, name, args || {});
  if (!paths.length) return null;
  try {
    let remaining = MAX_SNAPSHOT_BYTES;
    const createdDirectories = new Set();
    const entries = paths.map((value) => {
      const filePath = resolveTrackedPath(cfg, value);
      const state = snapshot(filePath, remaining);
      if (state.content) remaining -= state.content.length;
      if (!state.exists) {
        let directory = path.dirname(filePath);
        while (!fs.existsSync(directory)) {
          createdDirectories.add(directory);
          const parent = path.dirname(directory);
          if (parent === directory) break;
          directory = parent;
        }
      }
      return state;
    });
    return { workspace: cfg.workspace, action: name, before: entries, createdDirectories: [...createdDirectories] };
  } catch (_) {
    return null;
  }
}

function sameState(left, right) {
  if (left.exists !== right.exists) return false;
  if (!left.exists) return true;
  return left.mode === right.mode && left.content.equals(right.content);
}

function lineCounts(before, after) {
  const oldLines = before.length ? before.toString('utf8').split(/\r?\n/) : [];
  const newLines = after.length ? after.toString('utf8').split(/\r?\n/) : [];
  let prefix = 0;
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < oldLines.length - prefix &&
    suffix < newLines.length - prefix &&
    oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) suffix += 1;
  return {
    added: newLines.length - prefix - suffix,
    removed: oldLines.length - prefix - suffix
  };
}

function record(captured) {
  if (!captured) return null;
  const after = [];
  for (const previous of captured.before) {
    try {
      after.push(snapshot(previous.path, MAX_SNAPSHOT_BYTES));
    } catch (_) {
      return false;
    }
  }
  if (captured.before.every((previous, index) => sameState(previous, after[index]))) return null;
  return {
    workspace: captured.workspace,
    action: captured.action,
    createdAt: new Date().toISOString(),
    before: captured.before,
    after,
    createdDirectories: captured.createdDirectories,
    files: captured.before.map((previous, index) => ({
      path: previous.path,
      ...lineCounts(previous.content || Buffer.alloc(0), after[index].content || Buffer.alloc(0))
    }))
  };
}

function displayPath(workspace, filePath) {
  const relative = path.relative(workspace, filePath);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative)
    ? relative.replace(/\\/g, '/')
    : filePath;
}

function describe(entry, workspace, index) {
  const files = entry.files.map((file) => {
    const change = `+${file.added} -${file.removed} satır`;
    return `${displayPath(workspace || entry.workspace, file.path)} (${change})`;
  });
  const date = new Date(entry.createdAt).toLocaleTimeString('tr-TR');
  return `${index == null ? '' : `${index + 1}. `}${date} · ${entry.action} · ${files.join(', ')}`;
}

function restore(state) {
  if (!state.exists) {
    try {
      fs.unlinkSync(state.path);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
    return;
  }
  fs.mkdirSync(path.dirname(state.path), { recursive: true });
  const temporaryPath = `${state.path}.fynext-undo-${process.pid}-${crypto.randomBytes(5).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, state.content, { mode: state.mode });
    fs.renameSync(temporaryPath, state.path);
  } catch (err) {
    try { fs.unlinkSync(temporaryPath); } catch (_) { /* cleanup best effort */ }
    throw err;
  }
}

function undo(entry, cfg) {
  if (path.resolve(cfg.workspace) !== path.resolve(entry.workspace)) {
    throw new Error('Bu değişiklik başka bir çalışma alanında yapıldı; önce o çalışma alanına geçin.');
  }
  if (!cfg.allowOutsideWorkspace && entry.after.some((state) => {
    const relative = path.relative(cfg.workspace, state.path);
    return relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative);
  })) {
    throw new Error('Geri alınacak değişiklik çalışma alanı dışında; mevcut erişim ayarı buna izin vermiyor.');
  }
  const current = entry.after.map((state) => snapshot(state.path, MAX_SNAPSHOT_BYTES));
  const changed = current.some((state, index) => !sameState(state, entry.after[index]));
  if (changed) {
    throw new Error('Dosyalar Fynext değişikliğinden sonra yeniden değişmiş. Başka düzenlemeleri ezmemek için geri alma yapılmadı.');
  }
  for (const state of entry.before) restore(state);
  for (const directory of (entry.createdDirectories || []).slice().sort((a, b) => b.length - a.length)) {
    try {
      fs.rmdirSync(directory);
    } catch (err) {
      if (err.code !== 'ENOENT' && err.code !== 'ENOTEMPTY' && err.code !== 'EEXIST') throw err;
    }
  }
  return entry.files.map((file) => displayPath(entry.workspace, file.path));
}

module.exports = { capture, record, describe, undo };
