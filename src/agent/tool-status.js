'use strict';

function clean(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function clip(value, max) {
  const text = clean(value);
  if (text.length <= max) return text;
  return text.slice(0, Math.max(1, max - 1)).trimEnd() + '…';
}

function shortPath(value) {
  const text = clean(value).replace(/\\/g, '/');
  if (!text) return '';
  const parts = text.split('/').filter(Boolean);
  if (parts.length > 2) return '…/' + parts.slice(-2).join('/');
  return text;
}

function quote(value, max) {
  return '“' + clip(value, max || 42) + '”';
}

function hostOf(url) {
  try {
    return new URL(String(url)).host.replace(/^www\./, '');
  } catch (_) {
    return clip(url, 36);
  }
}

function commandAction(command) {
  const raw = clean(command);
  if (!raw) return 'Running command';
  const lower = raw.toLowerCase();
  if (
    /\b(npm|pnpm|yarn)\s+(run\s+)?test\b/.test(lower) ||
    /\bnode\b[^&|;]*\s--test\b/.test(lower)
  ) {
    return 'Running tests';
  }
  if (/\b(npm|pnpm|yarn)\s+(install|i|add)\b/.test(lower)) {
    return 'Installing dependencies';
  }
  if (/\b(npm|pnpm|yarn)\s+run\s+build\b/.test(lower)) {
    return 'Building project';
  }
  if (/\b(npm|pnpm|yarn)\s+run\s+(lint|typecheck|check)\b/.test(lower)) {
    return 'Running code checks';
  }
  if (/^\s*git\s+(status|diff|log|show)\b/.test(lower)) {
    return 'Reviewing Git changes';
  }
  if (/^\s*(dir|ls|get-childitem)\b/.test(lower)) {
    return 'Listing directory contents';
  }
  if (/^\s*node\b/.test(lower)) {
    return 'Running Node.js script';
  }
  return 'Running ' + quote(raw, 52);
}

function describeToolAction(name, args) {
  const a = args && typeof args === 'object' ? args : {};
  switch (String(name || '')) {
    case 'fs_list':
      return 'Listing directory ' + (shortPath(a.path || '.') || '.');
    case 'fs_read':
      return 'Reading ' + (shortPath(a.path) || 'file');
    case 'fs_write':
      return a.append
        ? 'Appending to ' + (shortPath(a.path) || 'file')
        : 'Creating ' + (shortPath(a.path) || 'file');
    case 'fs_edit':
      return 'Editing ' + (shortPath(a.path) || 'file');
    case 'fs_delete':
      return 'Deleting ' + (shortPath(a.path) || 'file');
    case 'fs_move': {
      const source = shortPath(a.source) || 'Source';
      const destination = shortPath(a.destination) || 'hedef';
      return 'Moving ' + source + ' → ' + destination;
    }
    case 'fs_mkdir':
      return 'Creating directory ' + (shortPath(a.path) || 'directory');
    case 'shell_exec':
      return commandAction(a.command);
    case 'web_search':
      return 'Searching the web for ' + quote(a.query || 'topic');
    case 'web_fetch':
      return 'Fetching ' + (hostOf(a.url) || 'page');
    case 'fs_glob':
      return 'Searching for file pattern ' + quote(a.pattern || '*');
    case 'fs_grep':
      return 'Searching file contents for ' + quote(a.pattern || 'text');
    case 'git_status':
      return 'Checking Git status';
    case 'git_diff':
      return 'Reviewing changes';
    case 'git_log':
      return 'Reviewing commit history';
    default:
      return 'Running action';
  }
}

function isStatusLine(value) {
  const raw = String(value == null ? '' : value).trim();
  if (!raw || raw.includes('\n')) return false;
  const text = clean(raw);
  if (!text || text.length > 110) return false;
  if (text.split(/\s+/).length > 16) return false;
  if (/^[[{`]/.test(text)) return false;
  if (/(tool_calls?|arguments|json|fs_(write|edit|read|list|glob|grep|mkdir|move|delete)|shell_exec|git_(status|diff|log)|web_(search|fetch))/i.test(text)) {
    return false;
  }
  return true;
}

function normalizeStatus(value) {
  return clean(value)
    .replace(/^[-*>]\s*/, '')
    .replace(/^`+|`+$/g, '')
    .replace(/[.。!]+$/, '')
    .trim();
}

const STATUS_ADVICE = /(aşağıdaki|aşağıda|yapabilirsiniz|yapabilirsin|çalıştırabilirsiniz|çalıştırabilirsin|deneyebilirsiniz|öneririm|here are|here is|you can|you should|run the following|following commands)/i;

function isUsefulStatus(value) {
  const text = normalizeStatus(value);
  if (!text || !isStatusLine(text)) return false;
  if (/[?:]\s*$/.test(text)) return false;
  if (STATUS_ADVICE.test(text)) return false;
  if (/^(merhaba|selam|elbette|tabii|tamam|işte|hello|hi|sure|okay|here)(?:\s|$)/i.test(text)) return false;
  return true;
}

function stripStatusInstructions(text) {
  return String(text || '')
    .split('\n')
    .filter((line) => !/\bSTATUS\b/.test(line))
    .join('\n');
}

function parseMarkedStatus(value, allowEof) {
  const text = String(value == null ? '' : value).replace(/\r/g, '');
  const leading = text.match(/^\s*/);
  const offset = leading ? leading[0].length : 0;
  const body = text.slice(offset);
  if (!body) return null;

  const prefix = body.match(/^(DURUM|STATUS)\s*:/i);
  if (prefix) {
    const start = offset + prefix[0].length;
    const newline = text.indexOf('\n', start);
    if (newline === -1) {
      if (!allowEof) return { complete: false, status: '', rest: '' };
      return { complete: true, status: normalizeStatus(text.slice(start)), rest: '' };
    }
    return {
      complete: true,
      status: normalizeStatus(text.slice(start, newline)),
      rest: text.slice(newline + 1)
    };
  }

  const tag = body.match(/^<(durum|status)>/i);
  if (tag) {
    const start = offset + tag[0].length;
    const closeRe = new RegExp('</' + tag[1] + '>', 'i');
    const match = closeRe.exec(text.slice(start));
    if (!match) {
      if (!allowEof) return { complete: false, status: '', rest: '' };
      return { complete: true, status: normalizeStatus(text.slice(start)), rest: '' };
    }
    const end = start + match.index;
    return {
      complete: true,
      status: normalizeStatus(text.slice(start, end)),
      rest: text.slice(end + match[0].length)
    };
  }

  return null;
}

function liveStatusFromText(value) {
  const parsed = parseMarkedStatus(value, true);
  if (!parsed || !parsed.complete) return '';
  const status = normalizeStatus(parsed.status);
  if (!isUsefulStatus(status) || status.length < 8) return '';
  return status.length > 90 ? status.slice(0, 89).trimEnd() + '…' : status;
}

function stripStatusLine(value) {
  const text = String(value == null ? '' : value).replace(/\r/g, '');
  const parsed = parseMarkedStatus(text, true);
  if (!parsed || !parsed.complete) return text;
  const status = normalizeStatus(parsed.status);
  if (isUsefulStatus(status)) return parsed.rest;
  return parsed.rest || parsed.status;
}

class StatusStreamFilter {
  constructor() {
    this.mode = 'decide';
    this.buffer = '';
    this.status = '';
  }

  _isMarkerPrefix(value) {
    const text = String(value || '').replace(/^\s+/, '').toLowerCase();
    if (!text) return false;
    return ['durum:', 'status:', '<durum>', '<status>'].some((marker) => marker.startsWith(text));
  }

  _finishStatus(parsed) {
    const status = normalizeStatus(parsed.status);
    const useful = isUsefulStatus(status) && status.length >= 8;
    this.status = useful
      ? (status.length > 90 ? status.slice(0, 89).trimEnd() + '…' : status)
      : '';
    this.mode = 'hold';
    this.buffer = parsed.rest || '';
    return '';
  }

  push(chunk) {
    const text = String(chunk == null ? '' : chunk);
    if (!text) return '';
    if (this.mode === 'pass') return text;
    if (this.mode === 'hold') {
      this.buffer += text;
      return '';
    }
    this.buffer += text;
    const parsed = parseMarkedStatus(this.buffer, false);
    if (parsed && parsed.complete) return this._finishStatus(parsed);
    if (parsed && !parsed.complete) {
      this.mode = 'status';
      return '';
    }
    const lead = this.buffer.replace(/^\s+/, '');
    if (!lead) return '';
    if (this._isMarkerPrefix(lead)) return '';
    const out = this.buffer;
    this.mode = 'pass';
    this.buffer = '';
    return out;
  }

  finish() {
    if (this.mode === 'pass') return '';
    if (this.mode === 'hold') {
      const held = this.buffer;
      this.buffer = '';
      this.mode = 'pass';
      return held;
    }
    const pending = this.buffer;
    this.buffer = '';
    this.mode = 'pass';
    if (!pending) return '';
    const parsed = parseMarkedStatus(pending, true);
    if (parsed && parsed.complete) {
      this._finishStatus(parsed);
      const held = this.buffer;
      this.buffer = '';
      this.mode = 'pass';
      return held;
    }
    if (this._isMarkerPrefix(pending.replace(/^\s+/, ''))) return '';
    return pending;
  }
}

module.exports = {
  describeToolAction,
  commandAction,
  isStatusLine,
  isUsefulStatus,
  normalizeStatus,
  liveStatusFromText,
  parseMarkedStatus,
  stripStatusInstructions,
  stripStatusLine,
  StatusStreamFilter,
  shortPath
};
