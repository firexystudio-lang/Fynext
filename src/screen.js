'use strict';

const { ART_WIDE, ART_COMPACT, ART_WIDE_WIDTH, ART_COMPACT_WIDTH } = require('./art');
const { C, S } = require('./theme');

const ESC = '\x1b[';
const MAX_INPUT_ROWS = 8;
const MAX_ITEM_CHARS = 200000;
const MAX_CHAT_LINES = 50000;
const SLASH_COMMANDS = [
  { name: 'yardım', description: 'Komutları ve kısayolları göster' },
  { name: 'help', description: 'Komutları ve kısayolları göster' },
  { name: 'model', description: 'Model seçme penceresini aç', takesArgs: true },
  { name: 'modeller', description: 'Yerel Ollama modellerini seç' },
  { name: 'models', description: 'Yerel Ollama modellerini seç' },
  { name: 'usage', description: 'Oturum token kullanımını göster' },
  { name: 'araçlar', description: 'Kullanılabilir araçları listele' },
  { name: 'tools', description: 'Kullanılabilir araçları listele' },
  { name: 'plan', description: 'Plan moduna geç (salt okunur; düzeltme önerir)' },
  { name: 'build', description: 'Build moduna geç' },
  { name: 'mode', description: 'Geçerli modu göster veya değiştir', takesArgs: true },
  { name: 'prompt', description: 'Sistem promptunu göster' },
  { name: 'yenile', description: 'Sistem promptunu yeniden yükle' },
  { name: 'reload', description: 'Sistem promptunu yeniden yükle' },
  { name: 'geçmiş', description: 'Sohbet geçmişini listele veya aç', takesArgs: true },
  { name: 'history', description: 'Sohbet geçmişini listele veya aç', takesArgs: true },
  { name: 'yeni', description: 'Yeni sohbet başlat' },
  { name: 'new', description: 'Yeni sohbet başlat' },
  { name: 'workspace', description: 'Çalışma alanını göster veya değiştir', takesArgs: true },
  { name: 'temp', description: 'Sıcaklığı göster veya ayarla', takesArgs: true },
  { name: 'temperature', description: 'Sıcaklığı göster veya ayarla', takesArgs: true },
  { name: 'approve', description: 'İşlem onayını aç veya kapat', takesArgs: true },
  { name: 'temizle', description: 'Sohbeti ve ekranı temizle' },
  { name: 'clear', description: 'Sohbeti ve ekranı temizle' },
  { name: 'çık', description: 'fynext’ten çık' },
  { name: 'exit', description: 'fynext’ten çık' }
];
const MODE_COLORS = {
  build: [114, 205, 154],
  plan: [111, 174, 225]
};

const CSI_KEYS = {
  '\x1b[A': 'up',
  '\x1b[B': 'down',
  '\x1b[C': 'right',
  '\x1b[D': 'left',
  '\x1b[H': 'home',
  '\x1b[F': 'end',
  '\x1b[1~': 'home',
  '\x1b[7~': 'home',
  '\x1b[4~': 'end',
  '\x1b[8~': 'end',
  '\x1b[3~': 'delete',
  '\x1b[5~': 'pageup',
  '\x1b[6~': 'pagedown',
  '\x1b[2~': null,
  '\x1b[Z': null,
  '\x1bOA': 'up',
  '\x1bOB': 'down',
  '\x1bOC': 'right',
  '\x1bOD': 'left',
  '\x1bOH': 'home',
  '\x1bOF': 'end'
};

const CONTROL_KEYS = {
  0x01: 'ctrl+a',
  0x02: 'ctrl+b',
  0x03: 'ctrl+c',
  0x04: 'ctrl+d',
  0x05: 'ctrl+e',
  0x06: 'ctrl+f',
  0x08: 'backspace',
  0x09: 'tab',
  0x0a: 'newline',
  0x0b: 'ctrl+k',
  0x0c: 'ctrl+l',
  0x0d: 'enter',
  0x0e: 'ctrl+n',
  0x0f: 'ctrl+o',
  0x10: 'ctrl+p',
  0x15: 'ctrl+u',
  0x17: 'ctrl+w',
  0x7f: 'backspace'
};

const ANSI_RE = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;

function stripAnsi(value) {
  return String(value == null ? '' : value).replace(ANSI_RE, '');
}

function charWidth(ch) {
  const cp = ch.codePointAt(0);
  if (cp === 0) return 0;
  if (cp < 32 || (cp >= 0x7f && cp < 0xa0)) return 0;
  if (
    (cp >= 0x0300 && cp <= 0x036f) ||
    (cp >= 0x1ab0 && cp <= 0x1aff) ||
    (cp >= 0x1dc0 && cp <= 0x1dff) ||
    (cp >= 0x20d0 && cp <= 0x20ff) ||
    (cp >= 0xfe20 && cp <= 0xfe2f)
  ) {
    return 0;
  }
  if (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe10 && cp <= 0xfe19) ||
    (cp >= 0xfe30 && cp <= 0xfe6f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f300 && cp <= 0x1faff) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
  ) {
    return 2;
  }
  return 1;
}

function visibleWidth(value) {
  let width = 0;
  for (const ch of stripAnsi(value)) width += charWidth(ch);
  return width;
}

function sanitize(value) {
  return String(value == null ? '' : value)
    .replace(/\x1b\][^\x07]*(\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[@-_]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
    .replace(/\t/g, '    ');
}

function sanitizeInput(value) {
  return sanitize(value).replace(/\x1b/g, '');
}

function truncatePlain(value, width) {
  let out = '';
  let used = 0;
  for (const ch of String(value == null ? '' : value)) {
    const cw = charWidth(ch);
    if (used + cw > width) break;
    out += ch;
    used += cw;
  }
  return out;
}

function truncateVisible(value, width) {
  const text = String(value == null ? '' : value);
  let out = '';
  let used = 0;
  let i = 0;
  while (i < text.length) {
    if (text[i] === '\x1b') {
      const match = /^\x1b\[[0-9;?]*[ -/]*[@-~]/.exec(text.slice(i));
      if (match) {
        out += match[0];
        i += match[0].length;
        continue;
      }
      out += text[i];
      i += 1;
      continue;
    }
    const cp = text.codePointAt(i);
    const ch = String.fromCodePoint(cp);
    const cw = charWidth(ch);
    if (used + cw > width) break;
    out += ch;
    used += cw;
    i += ch.length;
  }
  return out + C.reset;
}

function padVisible(value, width) {
  const diff = width - visibleWidth(value);
  return value + ' '.repeat(Math.max(0, diff));
}

function centerLine(value, width) {
  const text = String(value == null ? '' : value);
  const w = visibleWidth(text);
  if (w >= width) return truncateVisible(text, width);
  return ' '.repeat(Math.floor((width - w) / 2)) + text;
}

function wrapText(value, width) {
  const maxWidth = Math.max(1, Math.floor(width));
  const text = String(value == null ? '' : value).replace(/\r\n?/g, '\n');
  const out = [];
  for (const paragraph of text.split('\n')) {
    if (paragraph === '') {
      out.push('');
      continue;
    }
    const indentMatch = /^[ \t]*/.exec(paragraph);
    const indent = indentMatch ? indentMatch[0].replace(/\t/g, '    ') : '';
    const rest = paragraph.slice(indentMatch ? indentMatch[0].length : 0);
    const indentWidth = visibleWidth(indent);
    let line = indent;
    let lineWidth = indentWidth;
    for (const token of rest.split(/(\s+)/)) {
      if (!token) continue;
      const tokenWidth = visibleWidth(token);
      if (/^\s+$/.test(token)) {
        if (lineWidth + tokenWidth <= maxWidth) {
          line += token;
          lineWidth += tokenWidth;
        } else {
          out.push(line.replace(/\s+$/, ''));
          line = indent;
          lineWidth = indentWidth;
        }
        continue;
      }
      if (lineWidth + tokenWidth <= maxWidth) {
        line += token;
        lineWidth += tokenWidth;
        continue;
      }
      if (lineWidth > indentWidth) {
        out.push(line.replace(/\s+$/, ''));
        line = indent;
        lineWidth = indentWidth;
      }
      if (tokenWidth <= maxWidth - lineWidth) {
        line += token;
        lineWidth += tokenWidth;
        continue;
      }
      for (const ch of token) {
        const cw = charWidth(ch);
        if (lineWidth + cw > maxWidth && lineWidth > indentWidth) {
          out.push(line);
          line = indent;
          lineWidth = indentWidth;
        }
        line += ch;
        lineWidth += cw;
      }
    }
    out.push(line.replace(/\s+$/, ''));
  }
  return out.length ? out : [''];
}

function layoutInput(chars, cursor, width) {
  const maxWidth = Math.max(4, Math.floor(width));
  const rows = [];
  let row = { start: 0, end: 0, width: 0, text: '', breakType: 'end' };
  rows.push(row);
  let col = 0;
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i];
    if (ch === '\n') {
      row.end = i;
      row.breakType = 'newline';
      row = { start: i + 1, end: i + 1, width: 0, text: '', breakType: 'end' };
      rows.push(row);
      col = 0;
      continue;
    }
    const cw = charWidth(ch);
    if (col + cw > maxWidth && col > 0) {
      row.end = i;
      row.breakType = 'wrap';
      row = { start: i, end: i, width: 0, text: '', breakType: 'end' };
      rows.push(row);
      col = 0;
    }
    row.text += ch;
    row.width += cw;
    col += cw;
    row.end = i + 1;
  }
  rows[rows.length - 1].end = chars.length;

  let cursorRow = rows.length - 1;
  for (let r = 0; r < rows.length; r += 1) {
    if (cursor >= rows[r].start && cursor <= rows[r].end) {
      cursorRow = r;
      break;
    }
  }
  const active = rows[cursorRow];
  let cursorCol = 0;
  const limit = Math.min(cursor, active.end);
  for (let i = active.start; i < limit; i += 1) cursorCol += charWidth(chars[i]);

  const visibleRows = Math.min(rows.length, MAX_INPUT_ROWS);
  let scroll = 0;
  if (rows.length > visibleRows) {
    scroll = Math.max(0, Math.min(cursorRow - (visibleRows - 1), rows.length - visibleRows));
  }
  return { rows, cursorRow, cursorCol, visibleRows, scroll, width: maxWidth };
}

function detectTrueColor() {
  if (process.env.NO_COLOR) return false;
  if (/truecolor|24bit/i.test(process.env.COLORTERM || '')) return true;
  try {
    return typeof process.stdout.hasColors === 'function' && process.stdout.hasColors(16777216);
  } catch (_) {
    return false;
  }
}

function formatArgs(name, args) {
  const obj = args && typeof args === 'object' ? args : {};
  const pick = [obj.command, obj.path, obj.query, obj.url, obj.source, obj.destination, obj.name];
  for (const value of pick) {
    if (typeof value === 'string' && value.trim()) {
      return truncatePlain(sanitize(value).replace(/\s+/g, ' ').trim(), 160);
    }
  }
  try {
    const text = sanitize(JSON.stringify(obj)).replace(/\s+/g, ' ');
    return text === '{}' ? '' : truncatePlain(text, 160);
  } catch (_) {
    return '';
  }
}

class Screen {
  constructor(opts) {
    const options = opts || {};
    this.stdout = options.stdout || process.stdout;
    this.stdin = options.stdin || process.stdin;
    this.interactive = options.tty !== false && !!this.stdout.isTTY;
    this.model = options.model || 'qwen2.5-coder:3b';
    this.usage = '';
    this.cwd = options.cwd || process.cwd();
    this.status = options.status || 'hazır';
    this.mode = options.mode || 'build';
    this.items = [];
    this.input = [];
    this.cursor = 0;
    this.slashSelection = 0;
    this.history = [];
    this.histIndex = 0;
    this.draft = null;
    this.busy = false;
    this.headerMode = true;
    this.scrollAnchor = null;
    this.notice = '';
    this.thinkingTick = 0;
    this.thinkingExpanded = false;
    this.pendingConfirm = null;
    this.pendingSelection = null;
    this.started = false;
    this.onSubmit = null;
    this.onAbort = null;
    this.onExitRequest = null;
    this.onModeToggle = null;
    this.onNewConversation = null;
    this._cols = options.cols || null;
    this._rows = options.rows || null;
    this._trueColor = detectTrueColor();
    this._renderScheduled = false;
    this._renderTimer = null;
    this._animTimer = null;
    this._logoAnimTimer = null;
    this._logoAnimTick = 0;
    this._noticeTimer = null;
    this._exitTimer = null;
    this._escTimer = null;
    this._modeTransitionTimer = null;
    this._modeColor = MODE_COLORS[this.mode].slice();
    this._raw = '';
    this._exitArmed = false;
    this._onData = (chunk) => this._ingest(chunk);
    this._onResize = () => this.scheduleRender();
  }

  start() {
    if (this.started) return;
    if (!this.interactive) return;
    this.started = true;
    this.stdout.write(ESC + '?1049h');
    this.stdout.write(ESC + '?25l');
    this.stdout.write(ESC + '?2004h');
    this.stdout.write(ESC + '?1000h');
    this.stdout.write(ESC + '?1006h');
    this.stdout.write('\x1b]0;fynext\x07');
    try {
      this.stdin.setRawMode(true);
    } catch (_) {
      /* yoksay */
    }
    this.stdin.setEncoding('utf8');
    this.stdin.resume();
    this.stdin.on('data', this._onData);
    this.stdout.on('resize', this._onResize);
    this._syncLogoAnimation();
    this.render();
  }

  stop() {
    if (!this.started) return;
    this.started = false;
    if (this.pendingSelection) {
      const pending = this.pendingSelection;
      this.pendingSelection = null;
      pending.resolve(null);
    }
    if (this.stdin.removeListener) this.stdin.removeListener('data', this._onData);
    if (this.stdout.removeListener) this.stdout.removeListener('resize', this._onResize);
    if (this._renderTimer) clearTimeout(this._renderTimer);
    if (this._animTimer) clearInterval(this._animTimer);
    if (this._logoAnimTimer) clearInterval(this._logoAnimTimer);
    if (this._noticeTimer) clearTimeout(this._noticeTimer);
    if (this._exitTimer) clearTimeout(this._exitTimer);
    if (this._escTimer) clearTimeout(this._escTimer);
    if (this._modeTransitionTimer) clearInterval(this._modeTransitionTimer);
    this._renderTimer = null;
    this._animTimer = null;
    this._logoAnimTimer = null;
    this._noticeTimer = null;
    this._exitTimer = null;
    this._escTimer = null;
    this._modeTransitionTimer = null;
    try {
      this.stdin.setRawMode(false);
    } catch (_) {
      /* yoksay */
    }
    this.stdout.write(ESC + '?1006l');
    this.stdout.write(ESC + '?1000l');
    this.stdout.write(ESC + '?2004l');
    this.stdout.write(ESC + '?25h');
    this.stdout.write(ESC + '?1049l');
    this.stdout.write('\x1b]0;Terminal\x07');
  }

  submitHandler(fn) {
    this.onSubmit = fn;
  }

  abortHandler(fn) {
    this.onAbort = fn;
  }

  exitHandler(fn) {
    this.onExitRequest = fn;
  }

  modeHandler(fn) {
    this.onModeToggle = fn;
  }

  newConversationHandler(fn) {
    this.onNewConversation = fn;
  }

  setMode(mode) {
    if (mode !== 'build' && mode !== 'plan') throw new Error('Gecersiz mod: ' + mode);
    if (this.mode === mode) return;
    const from = this._modeColor.slice();
    const to = MODE_COLORS[mode];
    this.mode = mode;
    if (this._modeTransitionTimer) clearInterval(this._modeTransitionTimer);
    let step = 0;
    const steps = 7;
    this._modeTransitionTimer = setInterval(() => {
      step += 1;
      const progress = step / steps;
      this._modeColor = from.map((value, index) =>
        Math.round(value + (to[index] - value) * progress)
      );
      this.scheduleRender();
      if (step >= steps) {
        clearInterval(this._modeTransitionTimer);
        this._modeTransitionTimer = null;
      }
    }, 28);
    this.scheduleRender();
  }

  setInfo(patch) {
    const next = patch || {};
    if (next.model != null) this.model = String(next.model);
    if (next.cwd != null) this.cwd = String(next.cwd);
    if (next.status != null) this.status = String(next.status);
    if (next.usage != null) this.usage = String(next.usage);
    this.scheduleRender();
  }

  setBusy(value) {
    this.busy = !!value;
    this.scheduleRender();
  }

  setNotice(text, duration) {
    this.notice = sanitize(text || '');
    if (this._noticeTimer) clearTimeout(this._noticeTimer);
    if (this.notice) {
      this._noticeTimer = setTimeout(() => {
        this.notice = '';
        this._noticeTimer = null;
        this.scheduleRender();
      }, duration || 1800);
    }
    this.scheduleRender();
  }

  reset() {
    this.items = [];
    this.input = [];
    this.cursor = 0;
    this.busy = false;
    this.headerMode = true;
    this.scrollAnchor = null;
    this.pendingConfirm = null;
    this.notice = '';
    this.thinkingExpanded = false;
    this.histIndex = this.history.length;
    this.draft = null;
    this._syncLogoAnimation();
    if (this._noticeTimer) clearTimeout(this._noticeTimer);
    this._noticeTimer = null;
    this._syncTimer();
    this.scheduleRender();
  }

  user(text) {
    this.items.push({ kind: 'user', text: String(text == null ? '' : text) });
    this.headerMode = false;
    this._syncLogoAnimation();
    this.scrollAnchor = null;
    this.scheduleRender();
  }

  restoreConversation(messages) {
    this.items = [];
    for (const message of messages || []) {
      if (!message || !['user', 'assistant'].includes(message.role) || !message.content) continue;
      this.items.push({ kind: message.role, text: String(message.content) });
    }
    this.headerMode = this.items.length === 0;
    this._syncLogoAnimation();
    this.scrollAnchor = null;
    this.scheduleRender();
  }

  beginThinking() {
    const last = this.items[this.items.length - 1];
    if (!last || last.kind !== 'assistant') {
      this.items.push({ kind: 'assistant', text: '', thinking: true, progress: '' });
    } else {
      last.thinking = true;
      last.progress = '';
    }
    this._syncTimer();
    this.scheduleRender();
  }

  thinkingStatus(text) {
    const last = this.items[this.items.length - 1];
    if (!last || last.kind !== 'assistant' || !last.thinking) return;
    last.progress = sanitize(text || '');
    this.scheduleRender();
  }

  assistantDelta(text) {
    const chunk = String(text == null ? '' : text);
    if (!chunk) return;
    let last = this.items[this.items.length - 1];
    if (!last || last.kind !== 'assistant') {
      last = { kind: 'assistant', text: '', thinking: false };
      this.items.push(last);
    }
    last.thinking = false;
    last.text += chunk;
    if (last.text.length > MAX_ITEM_CHARS) {
      last.text = last.text.slice(0, MAX_ITEM_CHARS) + '\n…';
    }
    this._syncTimer();
    this.scheduleRender();
  }

  assistantDone() {
    const last = this.items[this.items.length - 1];
    if (last && last.kind === 'assistant') {
      last.thinking = false;
      if (!last.text) this.items.pop();
    }
    this._syncTimer();
    this.scheduleRender();
  }

  toolStart(name, args) {
    const last = this.items[this.items.length - 1];
    if (last && last.kind === 'assistant' && !last.text) this.items.pop();
    this.items.push({
      kind: 'tool',
      name: String(name || 'araç'),
      arg: formatArgs(name, args),
      status: 'running',
      summary: ''
    });
    this._syncTimer();
    this.scheduleRender();
  }

  toolEnd(name, ok, summary) {
    for (let i = this.items.length - 1; i >= 0; i -= 1) {
      const item = this.items[i];
      if (item.kind === 'tool' && item.status === 'running') {
        item.status = ok ? 'ok' : 'error';
        item.summary = truncatePlain(sanitize(summary || '').replace(/\s+/g, ' ').trim(), 240);
        break;
      }
    }
    this._syncTimer();
    this.scheduleRender();
  }

  note(text) {
    this.items.push({ kind: 'note', text: String(text == null ? '' : text) });
    this.headerMode = false;
    this._syncLogoAnimation();
    this.scrollAnchor = null;
    this.scheduleRender();
  }

  error(text) {
    this.items.push({ kind: 'error', text: String(text == null ? '' : text) });
    this.headerMode = false;
    this._syncLogoAnimation();
    this.scrollAnchor = null;
    this.scheduleRender();
  }

  confirm(question, options) {
    return new Promise((resolve) => {
      this.pendingConfirm = {
        question: String(question == null ? 'Onay?' : question),
        allowAlways: !options || options.allowAlways !== false,
        centered: !!(options && options.centered),
        resolve
      };
      this.input = [];
      this.cursor = 0;
      this.scheduleRender();
    });
  }

  selectOption(question, options, current) {
    const choices = Array.from(new Set((options || []).filter((option) => typeof option === 'string' && option)));
    if (!choices.length) return Promise.resolve(null);
    return new Promise((resolve) => {
      this.input = [];
      this.cursor = 0;
      this.pendingSelection = {
        question: String(question || 'Seçim'),
        options: choices,
        selected: Math.max(0, choices.indexOf(current)),
        current,
        resolve
      };
      this.scheduleRender();
    });
  }

  getInput() {
    return this.input.join('');
  }

  setInput(text) {
    this.input = Array.from(sanitizeInput(text));
    this.cursor = this.input.length;
    this.slashSelection = 0;
    this.histIndex = this.history.length;
    this.draft = null;
    this.scheduleRender();
  }

  dimensions() {
    const cols = this._cols || this.stdout.columns || 80;
    const rows = this._rows || this.stdout.rows || 24;
    return { cols: Math.max(20, cols), rows: Math.max(6, rows) };
  }

  scheduleRender() {
    if (!this.started || this._renderScheduled) return;
    this._renderScheduled = true;
    this._renderTimer = setTimeout(() => {
      this._renderScheduled = false;
      this._renderTimer = null;
      this.render();
    }, 12);
  }

  _syncLogoAnimation() {
    const shouldAnimate = this.started && this.headerMode;
    if (shouldAnimate && !this._logoAnimTimer) {
      this._logoAnimTimer = setInterval(() => {
        const cursorVisible =
          !(this.pendingConfirm && this.pendingConfirm.centered) &&
          (!this.busy || this.pendingConfirm) &&
          !this.pendingSelection;
        if (cursorVisible) return;
        this._logoAnimTick = (this._logoAnimTick + 1) % 32;
        this.scheduleRender();
      }, 90);
    } else if (!shouldAnimate && this._logoAnimTimer) {
      clearInterval(this._logoAnimTimer);
      this._logoAnimTimer = null;
      this._logoAnimTick = 0;
    }
  }

  render() {
    if (!this.started) return;
    const { cols, rows } = this.dimensions();
    const frame = this._compose(cols, rows);
    const dimBackground = !!(this.pendingConfirm && this.pendingConfirm.centered);
    const background = dimBackground ? '\x1b[48;5;233m' : C.bgDark;
    let out = ESC + '?25l';
    for (let i = 0; i < rows; i += 1) {
      const line = frame.lines[i] || '';
      const isDialogRow = frame.dialogRows && frame.dialogRows.has(i);
      const dim = dimBackground && !isDialogRow ? '\x1b[2m' : '';
      const restoreStyle = '\x1b[0m' + dim + background;
      const painted = isDialogRow
        ? background + line
        : background + dim + line.replace(/\x1b\[0m/g, restoreStyle);
      out += ESC + (i + 1) + ';1H' + painted + background + ESC + 'K' + C.reset;
    }
    if (frame.cursor) {
      out += ESC + frame.cursor.row + ';' + frame.cursor.col + 'H';
      out += ESC + '?25h';
    } else {
      out += ESC + '?25l';
    }
    this.stdout.write(out);
  }

  renderToString(cols, rows) {
    const oldCols = this._cols;
    const oldRows = this._rows;
    this._cols = cols;
    this._rows = rows;
    const frame = this._compose(cols, rows);
    this._cols = oldCols;
    this._rows = oldRows;
    return frame.lines.join('\n');
  }

  _compose(cols, rows) {
    const frame = this.headerMode ? this._composeHeader(cols, rows) : this._composeChat(cols, rows);
    if (this.pendingConfirm && this.pendingConfirm.centered) {
      frame.dialogRows = this._drawConfirmDialog(frame.lines, cols, rows);
    }
    return frame;
  }

  _drawConfirmDialog(lines, cols, rows) {
    const width = Math.max(12, Math.min(68, cols - 2));
    const innerWidth = width - 4;
    const question = wrapText(this.pendingConfirm.question, innerWidth);
    const answer = this.getInput();
    const content = [
      C.accent + C.bold + 'Önceki sohbet' + C.reset,
      ...question,
      '',
      C.green + '[E] Evet' + C.reset + '    ' + C.red + '[H] Hayır' + C.reset,
      'Yanıt: ' + (answer || C.grayDim + '(e/h yazıp Enter’a basın)' + C.reset),
      C.grayDim + 'Boşken Enter: Hayır · Esc: Hayır' + C.reset
    ];
    const height = Math.min(rows, content.length + 2);
    const startRow = Math.max(0, Math.floor((rows - height) / 2));
    const topPrefix = '╭─ ' + C.accent + 'fynext' + C.reset + ' ';
    const top = topPrefix + '─'.repeat(Math.max(0, width - visibleWidth(topPrefix) - 1)) + '╮';
    const bottom = '╰' + '─'.repeat(width - 2) + '╯';
    const panelize = (text) =>
      C.bgPanel + text.replace(/\x1b\[0m/g, '\x1b[0m' + C.bgPanel) + C.bgPanel;
    const modalLines = [panelize(top)];
    for (const text of content.slice(0, height - 2)) {
      const line = truncateVisible(text, innerWidth);
      modalLines.push(
        panelize(C.border + '│' + C.reset + ' ' + line +
        ' '.repeat(Math.max(0, innerWidth - visibleWidth(line))) + ' ' +
        C.border + '│' + C.reset)
      );
    }
    modalLines.push(panelize(bottom));
    const dialogRows = new Set();
    for (let i = 0; i < modalLines.length && startRow + i < rows; i += 1) {
      const line = modalLines[i];
      const row = startRow + i;
      lines[row] = ' '.repeat(Math.max(0, Math.floor((cols - visibleWidth(line)) / 2))) + line;
      dialogRows.add(row);
    }
    return dialogRows;
  }

  _boxGeometry(cols) {
    const boxW = Math.min(96, Math.max(24, cols - 4));
    const boxX = Math.max(0, Math.floor((cols - boxW) / 2));
    return { boxW, boxX, innerW: Math.max(4, boxW - 6) };
  }

  _showBox() {
    return true;
  }

  _boxTitle() {
    if (this.pendingConfirm) return 'onay';
    if (this.pendingSelection) return this.pendingSelection.question;
    if (this.busy) return 'yanıt';
    return 'mesaj';
  }

  _boxHint() {
    if (this.pendingConfirm) {
      return this.pendingConfirm.allowAlways
        ? 'e / h / a (hep izin ver)  ' + S.sep + '  Enter'
        : 'e / h  ' + S.sep + '  Enter';
    }
    if (this.pendingSelection) return '↑/↓ seç  ' + S.sep + '  Enter onayla  ' + S.sep + '  Esc iptal';
    if (this.busy) return 'Ctrl+C durdur';
    return 'Enter gönder  ' + S.sep + '  Tab mod  ' + S.sep + '  Alt+Enter satır';
  }

  _selectionVisibleRows() {
    if (!this.pendingSelection) return 1;
    return Math.max(
      1,
      Math.min(MAX_INPUT_ROWS, this.pendingSelection.options.length, this.dimensions().rows - 7)
    );
  }

  _slashSuggestions() {
    if (this.busy || this.pendingConfirm || this.pendingSelection) return [];
    const text = this.getInput();
    const beforeCursor = text.slice(0, this.cursor);
    if (!beforeCursor.startsWith('/') || /\s/.test(beforeCursor)) return [];
    const query = beforeCursor.slice(1).toLocaleLowerCase('tr');
    const matches = SLASH_COMMANDS.filter((command) =>
      command.name.toLocaleLowerCase('tr').startsWith(query)
    );
    if (this.slashSelection >= matches.length) this.slashSelection = Math.max(0, matches.length - 1);
    return matches;
  }

  _acceptSlashSuggestion(suggestions) {
    const command = suggestions[this.slashSelection];
    if (!command) return false;
    const value = '/' + command.name + (command.takesArgs ? ' ' : '');
    this.input = Array.from(value);
    this.cursor = this.input.length;
    this.slashSelection = 0;
    this.scheduleRender();
    return true;
  }

  _suggestionLines(cols) {
    const suggestions = this._slashSuggestions();
    if (!suggestions.length) return [];
    const { boxW } = this._boxGeometry(cols);
    const { rows } = this.dimensions();
    const layout = this._layout();
    const maxRows = Math.max(1, Math.min(6, rows - layout.visibleRows - 7));
    const start = Math.max(
      0,
      Math.min(this.slashSelection - maxRows + 1, suggestions.length - maxRows)
    );
    const visible = suggestions.slice(start, start + maxRows);
    return visible.map((command, index) => {
      const selected = start + index === this.slashSelection;
      const marker = selected ? '› ' : '  ';
      const label = '/' + command.name;
      const suffix = '  ' + command.description;
      const plain = marker + label + suffix;
      const clipped = truncatePlain(plain, Math.max(1, boxW - 4));
      const padding = ' '.repeat(Math.max(0, boxW - 2 - visibleWidth(clipped)));
      const visibleLabel = clipped.slice(0, marker.length + label.length);
      const visibleSuffix = clipped.slice(marker.length + label.length);
      const styled =
        selected
          ? C.bgPanel + C.cyan + C.bold + visibleLabel + C.reset + C.bgPanel + C.grayDim + visibleSuffix + C.reset
          : C.grayDim + marker + C.text + visibleLabel.slice(marker.length) + C.reset + C.grayDim + visibleSuffix + C.reset;
      return C.border + '│' + C.reset + ' ' + styled +
        padding + C.border + '│' + C.reset;
    });
  }

  _boxLines(layout, cols) {
    const { boxW, innerW } = this._boxGeometry(cols);
    const border = C.border;
    const title = truncatePlain(this._boxTitle(), Math.max(4, boxW - 12));
    const label = ' ' + title + ' ';
    const topUsed = 2 + visibleWidth(label);
    const topFill = Math.max(0, boxW - topUsed - 1);
    const top =
      border + '╭─' + C.accent + label + border + '─'.repeat(topFill) + '╮' + C.reset;

    const rows = [];
    if (this.pendingSelection) {
      const selection = this.pendingSelection;
      const visibleRows = this._selectionVisibleRows();
      const start = Math.max(0, Math.min(
        selection.selected - Math.floor(visibleRows / 2),
        selection.options.length - visibleRows
      ));
      for (let i = 0; i < visibleRows; i += 1) {
        const index = start + i;
        const option = selection.options[index];
        if (!option) {
          rows.push('');
          continue;
        }
        const marker = index === selection.selected ? '› ' : '  ';
        const current = option === selection.current ? ' (seçili)' : '';
        rows.push(
          (index === selection.selected ? C.cyan + C.bold : C.text) +
          marker + truncatePlain(option + current, Math.max(1, innerW - 2)) + C.reset
        );
      }
    } else if (this.pendingConfirm) {
      const typed = this.getInput();
      rows.push(typed || '');
    } else if (this.busy) {
      rows.push(
        C.grayDim + 'yanıt yazılıyor' + '.'.repeat(1 + (this.thinkingTick % 3)) + C.reset
      );
    } else {
      const start = layout.scroll;
      const end = start + layout.visibleRows;
      for (let i = start; i < end; i += 1) rows.push((layout.rows[i] && layout.rows[i].text) || '');
    }

    while (rows.length < layout.visibleRows) rows.push('');

    const marker = this.pendingSelection ? '  ' : this.pendingConfirm ? '? ' : this.busy ? '◐ ' : S.prompt + ' ';
    const content = rows.map((row, index) => {
      const isStyled = row.includes('\x1b[');
      const plain = isStyled ? stripAnsi(row) : row;
      const pad = Math.max(0, innerW - visibleWidth(plain));
      const lead =
        index === 0
          ? (this.pendingConfirm ? C.yellow : C.accent) + marker + C.reset
          : '  ';
      const body = isStyled ? row : C.text + row + C.reset;
      return (
        border +
        '│' +
        C.reset +
        ' ' +
        lead +
        body +
        ' '.repeat(pad) +
        ' ' +
        border +
        '│' +
        C.reset
      );
    });

    const hint = truncatePlain(this._boxHint(), Math.max(4, boxW - 8));
    const hintFill = Math.max(0, boxW - visibleWidth(hint) - 5);
    const bottom =
      border +
      '╰─' +
      C.grayDim +
      ' ' +
      hint +
      ' ' +
      border +
      '─'.repeat(hintFill) +
      '╯' +
      C.reset;

    return [top, ...content, bottom];
  }

  _paintArt(lines, maxWidth) {
    if (!lines || !lines.length) return [];
    const palette = [C.accentBright, C.accent, C.accentDeep, C.accentDark, C.accentDeep, C.accent];
    const glowRadius = Math.max(3, maxWidth * 0.07);
    const glowCenter =
      -3 * glowRadius +
      (this._logoAnimTick / 31) * (maxWidth + 6 * glowRadius);
    return lines.map((line, row) => {
      if (!this._trueColor) {
        let out = '';
        let position = 0;
        const baseColor = palette[row % palette.length];
        for (const ch of line) {
          const distance = Math.abs(position - glowCenter);
          const glow = 0.42 * Math.exp(-0.5 * (distance / glowRadius) ** 2);
          const color = glow > 0.24
            ? '\x1b[38;5;203m'
            : glow > 0.07
              ? '\x1b[38;5;167m'
              : baseColor;
          out += color + ch;
          position += charWidth(ch);
        }
        return out + C.reset + ' '.repeat(Math.max(0, maxWidth - visibleWidth(line)));
      }

      let out = '';
      let position = 0;
      for (const ch of line) {
        const t = Math.min(
          1,
          (position / Math.max(1, maxWidth)) * 0.72 +
            (row / Math.max(1, lines.length)) * 0.28
        );
        let red = Math.round(255 - (255 - 178) * t);
        let green = Math.round(196 - (196 - 64) * t);
        let blue = Math.round(118 - (118 - 18) * t);
        const distance = Math.abs(position - glowCenter);
        const glow = 0.42 * Math.exp(-0.5 * (distance / glowRadius) ** 2);
        if (glow > 0.01) {
          red = Math.round(red + (255 - red) * glow);
          green = Math.round(green + (65 - green) * glow);
          blue = Math.round(blue + (48 - blue) * glow);
        }
        const color = '\x1b[38;2;' + red + ';' + green + ';' + blue + 'm';
        out += color + ch;
        position += charWidth(ch);
      }
      out += C.reset;
      return out + ' '.repeat(Math.max(0, maxWidth - visibleWidth(line)));
    });
  }

  _topBar(cols) {
    const tagline = cols >= 64 ? '  yerel kod ajanı' : '';
    const leftPlain = S.logo + ' fynext' + tagline;
    const modeLabel = this.mode === 'plan' ? 'PLAN' : 'BUILD';
    let rightPlain = this.model + '  ' + S.sep + '  ' + modeLabel + '  ' + S.sep + '  ' + this.status;
    let showModel = true;
    if (visibleWidth(leftPlain) + visibleWidth(rightPlain) + 6 > cols) {
      showModel = false;
      rightPlain = modeLabel + '  ' + S.sep + '  ' + this.status;
    }
    if (visibleWidth(leftPlain) + visibleWidth(rightPlain) + 4 > cols) rightPlain = '';
    const gap = Math.max(1, cols - 2 - visibleWidth(leftPlain) - visibleWidth(rightPlain));
    const modeColor =
      this._trueColor
        ? `\x1b[38;2;${this._modeColor[0]};${this._modeColor[1]};${this._modeColor[2]}m`
        : this.mode === 'plan' ? C.blue : C.green;
    const left =
      modeColor +
      S.logo +
      ' ' +
      C.accentBright +
      C.bold +
      'fynext' +
      C.reset +
      C.grayDim +
      tagline +
      C.reset;
    const right = rightPlain
      ? (showModel
          ? C.gray + this.model + C.grayDim + '  ' + S.sep + '  '
          : '') +
        modeColor +
        C.bold +
        modeLabel +
        C.reset +
        C.grayDim +
        '  ' +
        S.sep +
        '  ' +
        C.gray +
        this.status +
        C.reset
      : '';
    return ' ' + left + ' '.repeat(gap) + right + ' ';
  }

  _rule(cols, char) {
    const line = (char || '─').repeat(Math.max(0, cols - 2));
    return ' ' + C.border + line + ' ' + C.reset;
  }

  _welcomeLines(cols, maxRows) {
    const wide = cols >= ART_WIDE_WIDTH + 38 && maxRows >= 16;
    const compact = !wide && cols >= ART_COMPACT_WIDTH + 30 && maxRows >= 11;
    const art = wide ? ART_WIDE : compact ? ART_COMPACT : null;
    const artW = wide ? ART_WIDE_WIDTH : compact ? ART_COMPACT_WIDTH : 0;

    const block = [];
    if (art && cols >= artW + 10) {
      for (const line of this._paintArt(art, artW)) block.push(centerLine(line, cols));
      block.push('');
      block.push(centerLine(C.grayDim + 'Made By:FirexyTeam' + C.reset, cols));
    } else if (art) {
      for (const line of this._paintArt(art, artW)) block.push(centerLine(line, cols));
      block.push('');
      block.push(centerLine(C.grayDim + 'Made By:FirexyTeam' + C.reset, cols));
    } else {
      block.push(centerLine(C.accentBright + C.bold + 'fynext' + C.reset, cols));
      block.push('');
      block.push(centerLine(C.grayDim + 'Made By:FirexyTeam' + C.reset, cols));
    }
    return block.slice(0, Math.max(1, maxRows));
  }

  _composeHeader(cols, rows) {
    const lines = new Array(rows).fill('');
    lines[0] = this._topBar(cols);
    lines[1] = this._rule(cols);
    const { boxX, innerW } = this._boxGeometry(cols);
    const layout = layoutInput(this.input, this.cursor, innerW);
    const boxLines = this.pendingConfirm && this.pendingConfirm.centered
      ? []
      : this._boxLines(layout, cols);
    const suggestions = this.pendingConfirm && this.pendingConfirm.centered
      ? []
      : this._suggestionLines(cols);
    const boxTop = rows - 1 - boxLines.length - suggestions.length;
    for (let i = 0; i < suggestions.length && boxTop + i < rows - 1; i += 1) {
      lines[boxTop + i] = ' '.repeat(boxX) + suggestions[i];
    }
    for (let i = 0; i < boxLines.length && boxTop + i < rows - 1; i += 1) {
      lines[boxTop + suggestions.length + i] = ' '.repeat(boxX) + boxLines[i];
    }

    const avail = Math.max(0, boxTop - 3);
    if (avail > 0) {
      const welcome = this._welcomeLines(Math.max(20, cols - 4), avail);
      let start = 2 + Math.max(0, Math.floor((avail - welcome.length) / 2));
      if (start + welcome.length > boxTop) start = boxTop - welcome.length;
      for (let i = 0; i < welcome.length && start + i < boxTop; i += 1) {
        lines[start + i] = '  ' + welcome[i];
      }
    }
    lines[rows - 1] = this._statusLine(cols);

    let cursor = null;
    if (
      !(this.pendingConfirm && this.pendingConfirm.centered) &&
      (!this.busy || this.pendingConfirm) &&
      !this.pendingSelection
    ) {
      const row = boxTop + suggestions.length + 2 + (layout.cursorRow - layout.scroll);
      const col = boxX + 5 + layout.cursorCol;
      cursor = {
        row: Math.max(1, Math.min(rows - 1, row)),
        col: Math.max(1, Math.min(cols, col))
      };
    }
    return { lines, cursor };
  }

  _composeChat(cols, rows) {
    const lines = new Array(rows).fill('');
    lines[0] = this._topBar(cols);
    lines[1] = this._rule(cols);
    const { boxX, innerW } = this._boxGeometry(cols);
    const layout = layoutInput(this.input, this.cursor, innerW);
    const boxLines = this.pendingConfirm && this.pendingConfirm.centered
      ? []
      : this._boxLines(layout, cols);
    const suggestions = this.pendingConfirm && this.pendingConfirm.centered
      ? []
      : this._suggestionLines(cols);
    const boxTop = rows - 1 - boxLines.length - suggestions.length;
    const chatTop = rows >= 9 ? 3 : 2;
    const chatH = Math.max(0, boxTop - chatTop);
    const contentCols = Math.max(10, cols - 4);

    if (chatH > 0) {
      const all = this._chatLines(contentCols);
      const end =
        this.scrollAnchor == null ? all.length : Math.min(all.length, Math.max(0, this.scrollAnchor));
      const slice = all.slice(Math.max(0, end - chatH), end);
      for (let i = 0; i < chatH; i += 1) lines[chatTop + i] = '  ' + (slice[i] || '');
    }

    for (let i = 0; i < suggestions.length && boxTop + i < rows - 1; i += 1) {
      lines[boxTop + i] = ' '.repeat(boxX) + suggestions[i];
    }
    for (let i = 0; i < boxLines.length && boxTop + i < rows - 1; i += 1) {
      lines[boxTop + suggestions.length + i] = ' '.repeat(boxX) + boxLines[i];
    }
    lines[rows - 1] = this._statusLine(cols);

    let cursor = null;
    if (
      !(this.pendingConfirm && this.pendingConfirm.centered) &&
      (!this.busy || this.pendingConfirm) &&
      !this.pendingSelection
    ) {
      const row = boxTop + suggestions.length + 2 + (layout.cursorRow - layout.scroll);
      const col = boxX + 5 + layout.cursorCol;
      cursor = {
        row: Math.max(1, Math.min(rows - 1, row)),
        col: Math.max(1, Math.min(cols, col))
      };
    }
    return { lines, cursor };
  }

  _statusLine(cols) {
    const sep = '  ' + S.sep + '  ';
    let rightPlain;
    if (this.notice) rightPlain = this.notice;
    else if (this.busy) rightPlain = 'Ctrl+C durdur';
    else rightPlain = 'Enter gönder  ' + S.sep + '  Alt+Enter satır  ' + S.sep + '  /yardım';
    if (this.scrollAnchor != null) {
      rightPlain = S.up + ' geçmiş' + (rightPlain ? sep + rightPlain : '');
    }
    if (cols < 58 && !this.notice) {
      rightPlain = this.busy ? 'Ctrl+C durdur' : '';
    }
    if (cols < 36) rightPlain = this.notice || '';

    let leftPlain = S.dot + ' fynext';
    if (this.usage) leftPlain += sep + this.usage;
    else leftPlain += sep + this.model;
    const cwdPart = sep + this.cwd;
    if (visibleWidth(leftPlain + cwdPart) + visibleWidth(rightPlain) + 4 <= cols) {
      leftPlain += cwdPart;
    }

    const rightMax = Math.max(0, Math.floor(cols / 2));
    rightPlain = truncatePlain(rightPlain, rightMax);
    const leftMax = Math.max(0, cols - 2 - visibleWidth(rightPlain) - 1);
    leftPlain = truncatePlain(leftPlain, leftMax);
    let gap = cols - 2 - visibleWidth(leftPlain) - visibleWidth(rightPlain);
    if (gap < 0) gap = 0;

    let leftStyled = '';
    if (leftPlain) {
      if (leftPlain.startsWith(S.dot)) {
        leftStyled = C.accent + S.dot + C.gray + leftPlain.slice(S.dot.length);
      } else {
        leftStyled = C.gray + leftPlain;
      }
    }
    const rightStyled = rightPlain ? (this.notice ? C.yellow : C.grayDim) + rightPlain : '';
    return C.bg + ' ' + leftStyled + ' '.repeat(gap) + rightStyled + ' ' + C.reset;
  }

  _chatLines(cols) {
    const width = Math.max(10, cols);
    const lines = [];
    let first = true;
    let prevKind = null;
    const push = (line) => lines.push(line);
    const blank = () => {
      if (lines.length && lines[lines.length - 1] !== '') lines.push('');
    };

    for (const item of this.items) {
      if (item.kind === 'user') {
        if (!first) blank();
        push(C.accent + C.bold + S.prompt + ' ' + C.white + 'sen' + C.reset);
        for (const line of this._messageBody(item.text, width, C.text)) push(line);
        first = false;
      } else if (item.kind === 'assistant') {
        if (!item.text && !item.thinking) continue;
        if (!first) blank();
        let head = C.accent + S.dot + ' ' + C.accentBright + C.bold + 'fynext' + C.reset;
        if (item.thinking) {
          head +=
            C.grayDim +
            '  ' +
            S.sep +
            (item.progress || 'düşünüyor') +
            '.'.repeat(1 + (this.thinkingTick % 3)) +
            C.reset;
        }
        push(head);
        if (item.thinking && this.thinkingExpanded) {
          let requestIndex = this.items.length - 1;
          while (requestIndex >= 0 && this.items[requestIndex].kind !== 'user') requestIndex -= 1;
          const request = requestIndex >= 0 ? this.items[requestIndex].text : '';
          const tools = requestIndex >= 0
            ? this.items.slice(requestIndex + 1).filter((entry) => entry.kind === 'tool')
            : [];
          const detailLines = request
            ? wrapText('İstek: ' + request, Math.max(8, width - 4))
            : ['İstek değerlendiriliyor.'];
          if (tools.length) {
            detailLines.push('Adımlar:');
            for (const tool of tools) {
              const status = tool.status === 'running'
                ? 'çalışıyor'
                : tool.status === 'ok' ? 'tamamlandı' : 'hata';
              const result = tool.summary ? ` — ${tool.summary}` : '';
              detailLines.push(...wrapText(`- ${tool.name}: ${status}${result}`, Math.max(8, width - 4)));
            }
          } else {
            detailLines.push('İlgili bağlam inceleniyor ve sonraki adımlar belirleniyor.');
          }
          for (const line of detailLines) {
            push('    ' + C.grayDim + line + C.reset);
          }
        }
        if (item.text) {
          for (const line of this._messageBody(item.text, width, C.text)) push(line);
        }
        first = false;
      } else if (item.kind === 'tool') {
        if (prevKind !== 'tool' && !first) blank();
        let head = '  ' + C.grayDim + S.branch + ' ' + C.accent + item.name + C.reset;
        if (item.arg) head += '  ' + C.grayDim + item.arg + C.reset;
        push(head);
        if (item.status === 'running') {
          push(
            '    ' +
              C.grayDim +
              'çalışıyor' +
              '.'.repeat(1 + (this.thinkingTick % 3)) +
              C.reset
          );
        } else if (item.status === 'ok') {
          push('    ' + C.green + S.check + C.reset + ' ' + C.grayDim + item.summary + C.reset);
        } else {
          push('    ' + C.red + S.cross + C.reset + ' ' + C.redDeep + item.summary + C.reset);
        }
        first = false;
      } else if (item.kind === 'note') {
        if (!first) blank();
        const body = wrapText(sanitize(item.text), Math.max(8, width - 2));
        for (const line of body) push('  ' + C.gray + line + C.reset);
        first = false;
      } else if (item.kind === 'error') {
        if (!first) blank();
        const body = wrapText(sanitize(item.text), Math.max(8, width - 2));
        body.forEach((line, index) => {
          push('  ' + C.red + (index === 0 ? S.cross + ' ' : '  ') + line + C.reset);
        });
        first = false;
      }
      prevKind = item.kind;
    }

    while (lines.length > MAX_CHAT_LINES) lines.shift();
    return lines;
  }

  _messageBody(text, cols, style) {
    const width = Math.max(8, cols - 2);
    const raw = sanitize(text);
    const clipped = raw.length > MAX_ITEM_CHARS ? raw.slice(0, MAX_ITEM_CHARS) + '\n…' : raw;
    const out = [];
    let inCode = false;
    for (const rawLine of clipped.split('\n')) {
      const trimmed = rawLine.trim();
      if (/^```/.test(trimmed)) {
        inCode = !inCode;
        out.push('  ' + C.grayDim + rawLine + C.reset);
        continue;
      }
      const wrapped = wrapText(rawLine, width);
      const active = inCode ? C.blue : style;
      for (const line of wrapped) out.push('  ' + active + line + C.reset);
    }
    return out;
  }

  _syncTimer() {
    const need = this.items.some(
      (item) =>
        (item.kind === 'assistant' && item.thinking) ||
        (item.kind === 'tool' && item.status === 'running')
    );
    if (need && !this._animTimer && this.started) {
      this._animTimer = setInterval(() => {
        this.thinkingTick += 1;
        this.render();
      }, 320);
    } else if (!need && this._animTimer) {
      clearInterval(this._animTimer);
      this._animTimer = null;
    }
  }

  _layout() {
    const { cols } = this.dimensions();
    const { innerW } = this._boxGeometry(cols);
    return layoutInput(this.input, this.cursor, innerW);
  }

  _indexAt(row, targetCol) {
    let best = row.start;
    let used = 0;
    for (let i = row.start; i < row.end; i += 1) {
      const cw = charWidth(this.input[i]);
      if (used + cw > targetCol) break;
      used += cw;
      best = i + 1;
    }
    return best;
  }

  _moveVertical(delta) {
    const layout = this._layout();
    const targetRowIndex = layout.cursorRow + delta;
    if (targetRowIndex < 0 || targetRowIndex >= layout.rows.length) return;
    this.cursor = this._indexAt(layout.rows[targetRowIndex], layout.cursorCol);
    this.scheduleRender();
  }

  _moveHorizontal(delta) {
    this.cursor = Math.max(0, Math.min(this.input.length, this.cursor + delta));
    this.scheduleRender();
  }

  _goHome() {
    const layout = this._layout();
    this.cursor = layout.rows[layout.cursorRow].start;
    this.scheduleRender();
  }

  _goEnd() {
    const layout = this._layout();
    this.cursor = layout.rows[layout.cursorRow].end;
    this.scheduleRender();
  }

  _insertText(text) {
    if (this.busy && !this.pendingConfirm) return;
    const chars = Array.from(sanitizeInput(text));
    if (!chars.length) return;
    this.input = this.input.slice(0, this.cursor).concat(chars, this.input.slice(this.cursor));
    this.cursor += chars.length;
    this.slashSelection = 0;
    this.scheduleRender();
  }

  _backspace() {
    if (this.cursor <= 0) return;
    this.input.splice(this.cursor - 1, 1);
    this.cursor -= 1;
    this.slashSelection = 0;
    this.scheduleRender();
  }

  _delete() {
    if (this.cursor >= this.input.length) return;
    this.input.splice(this.cursor, 1);
    this.slashSelection = 0;
    this.scheduleRender();
  }

  _deleteWord() {
    let index = this.cursor;
    while (index > 0 && /\s/.test(this.input[index - 1])) index -= 1;
    while (index > 0 && !/\s/.test(this.input[index - 1])) index -= 1;
    this.input.splice(index, this.cursor - index);
    this.cursor = index;
    this.scheduleRender();
  }

  _killLine() {
    let index = this.cursor;
    while (index < this.input.length && this.input[index] !== '\n') index += 1;
    this.input.splice(this.cursor, index - this.cursor);
    this.scheduleRender();
  }

  _history(dir) {
    if (!this.history.length) return;
    if (this.histIndex >= this.history.length && dir < 0) this.draft = this.input.slice();
    let index = this.histIndex + dir;
    if (index < 0) index = 0;
    if (index > this.history.length) index = this.history.length;
    this.histIndex = index;
    if (index === this.history.length) {
      this.input = this.draft ? this.draft.slice() : [];
    } else {
      this.input = Array.from(this.history[index]);
    }
    this.cursor = this.input.length;
    this.scheduleRender();
  }

  _scrollChat(direction) {
    if (this.headerMode) return;
    const { cols, rows } = this.dimensions();
    const layout = this._layout();
    const showBox = this._showBox();
    const suggestionsH = this._suggestionLines(cols).length;
    const boxH = showBox ? layout.visibleRows + 2 + suggestionsH : 0;
    const chatH = Math.max(1, rows - 1 - boxH);
    const total = this._chatLines(cols).length;
    if (total <= chatH) {
      this.scrollAnchor = null;
      return;
    }
    if (this.pendingSelection) {
      const pending = this.pendingSelection;
      this.pendingSelection = null;
      pending.resolve(null);
      this.scheduleRender();
      return;
    }
    const page = Math.max(1, chatH - 2);
    let end = this.scrollAnchor == null ? total : this.scrollAnchor;
    end = Math.max(0, Math.min(total, end + direction * page));
    this.scrollAnchor = end >= total ? null : Math.max(chatH, end);
    this.scheduleRender();
  }

  _handleClick(row) {
    if (this.headerMode || row < 1) return;
    const { cols, rows } = this.dimensions();
    const layout = this._layout();
    const boxLines = this._boxLines(layout, cols);
    const suggestions = this._suggestionLines(cols);
    const boxTop = rows - 1 - boxLines.length - suggestions.length;
    const chatTop = rows >= 9 ? 3 : 2;
    if (row < chatTop + 1 || row >= boxTop + 1) return;

    const chatH = Math.max(0, boxTop - chatTop);
    const all = this._chatLines(Math.max(10, cols - 4));
    const end = this.scrollAnchor == null ? all.length : Math.min(all.length, this.scrollAnchor);
    const start = Math.max(0, end - chatH);
    const line = all[start + row - chatTop - 1];
    if (!line || !stripAnsi(line).includes('\u0064\u00fc\u015f\u00fcn\u00fcyor')) return;

    const thinkingItem = this.items.slice().reverse().find(
      (item) => item.kind === 'assistant' && item.thinking
    );
    if (!thinkingItem) return;
    this.thinkingExpanded = !this.thinkingExpanded;
    this.scheduleRender();
  }

  _submit() {
    if (this.pendingConfirm) {
      const answer = this.getInput().trim().toLowerCase();
      const pending = this.pendingConfirm;
      const always =
        pending.allowAlways && ['a', 'hep', 'her zaman', 'always'].includes(answer);
      const ok = always || ['e', 'evet', 'y', 'yes', 'onay', 'onayla', '1'].includes(answer);
      this.pendingConfirm = null;
      this.input = [];
      this.cursor = 0;
      pending.resolve(always ? 'always' : ok);
      this.scheduleRender();
      return;
    }
    const suggestions = this._slashSuggestions();
    const selected = suggestions[this.slashSelection];
    if (selected) {
      const typed = this.getInput().trim().toLocaleLowerCase('tr');
      const exact = typed === '/' + selected.name.toLocaleLowerCase('tr');
      if (!exact) {
        this._acceptSlashSuggestion(suggestions);
        return;
      }
    }
    if (this.busy) return;
    const text = this.getInput().trim();
    if (!text) return;
    if (this.history[this.history.length - 1] !== text) this.history.push(text);
    this.histIndex = this.history.length;
    this.draft = null;
    this.input = [];
    this.cursor = 0;
    this.scrollAnchor = null;
    this.scheduleRender();
    if (this.onSubmit) {
      try {
        const result = this.onSubmit(text);
        if (result && typeof result.catch === 'function') result.catch(() => {});
      } catch (_) {
        /* yoksay */
      }
    }
  }

  _abort() {
    if (this.onAbort) {
      try {
        this.onAbort();
      } catch (_) {
        /* yoksay */
      }
    }
    this.setNotice('durduruluyor…', 1500);
  }

  _requestExit() {
    if (this.onExitRequest) {
      try {
        this.onExitRequest();
      } catch (_) {
        /* yoksay */
      }
    }
  }

  _ctrlC() {
    if (this.pendingConfirm) {
      const pending = this.pendingConfirm;
      this.pendingConfirm = null;
      this.input = [];
      this.cursor = 0;
      pending.resolve(false);
      this.scheduleRender();
      return;
    }
    if (this.busy) {
      this._abort();
      return;
    }
    if (this.input.length) {
      this.input = [];
      this.cursor = 0;
      this._exitArmed = false;
      if (this._exitTimer) clearTimeout(this._exitTimer);
      this.scheduleRender();
      return;
    }
    if (this._exitArmed) {
      this._requestExit();
      return;
    }
    this._exitArmed = true;
    this.setNotice('çıkmak için tekrar Ctrl+C', 1600);
    if (this._exitTimer) clearTimeout(this._exitTimer);
    this._exitTimer = setTimeout(() => {
      this._exitArmed = false;
      this._exitTimer = null;
    }, 1600);
  }

  _handleKey(key) {
    if (!key) return;
    if (this.pendingSelection) {
      const selection = this.pendingSelection;
      if (key === 'up' || key === 'wheelup') {
        selection.selected = (selection.selected - 1 + selection.options.length) % selection.options.length;
        return this.scheduleRender();
      }
      if (key === 'down' || key === 'wheeldown') {
        selection.selected = (selection.selected + 1) % selection.options.length;
        return this.scheduleRender();
      }
      if (key === 'pageup') {
        selection.selected = Math.max(0, selection.selected - Math.max(1, this._selectionVisibleRows() - 1));
        return this.scheduleRender();
      }
      if (key === 'pagedown') {
        selection.selected = Math.min(selection.options.length - 1, selection.selected + Math.max(1, this._selectionVisibleRows() - 1));
        return this.scheduleRender();
      }
      if (key === 'enter') {
        this.pendingSelection = null;
        selection.resolve(selection.options[selection.selected]);
        return this.scheduleRender();
      }
      if (key === 'escape' || key === 'ctrl+c') {
        this.pendingSelection = null;
        selection.resolve(null);
        return this.scheduleRender();
      }
      return;
    }
    if (key === 'wheelup') return this._scrollChat(-1);
    if (key === 'wheeldown') return this._scrollChat(1);
    if (this.pendingConfirm) {
      if (key === 'enter') return this._submit();
      if (key === 'ctrl+c') return this._ctrlC();
      if (key === 'escape') {
        const pending = this.pendingConfirm;
        this.pendingConfirm = null;
        this.input = [];
        this.cursor = 0;
        pending.resolve(false);
        return this.scheduleRender();
      }
      if (key === 'backspace') return this._backspace();
      if (key === 'delete') return this._delete();
      if (key === 'left' || key === 'ctrl+b') return this._moveHorizontal(-1);
      if (key === 'right' || key === 'ctrl+f') return this._moveHorizontal(1);
      if (key === 'home' || key === 'ctrl+a') return this._goHome();
      if (key === 'end' || key === 'ctrl+e') return this._goEnd();
      if (key === 'ctrl+u') {
        this.input = [];
        this.cursor = 0;
        this.scheduleRender();
      }
      return;
    }
    if (this.busy) {
      if (key === 'ctrl+c') return this._ctrlC();
      if (key === 'pageup') return this._scrollChat(-1);
      if (key === 'pagedown') return this._scrollChat(1);
      return;
    }
    const suggestions = this._slashSuggestions();
    if (suggestions.length && key === 'up') {
      this.slashSelection =
        (this.slashSelection - 1 + suggestions.length) % suggestions.length;
      return this.scheduleRender();
    }
    if (suggestions.length && key === 'down') {
      this.slashSelection = (this.slashSelection + 1) % suggestions.length;
      return this.scheduleRender();
    }
    switch (key) {
      case 'enter':
        return this._submit();
      case 'newline':
        return this._insertText('\n');
      case 'backspace':
        return this._backspace();
      case 'delete':
        return this._delete();
      case 'left':
      case 'ctrl+b':
        return this._moveHorizontal(-1);
      case 'right':
      case 'ctrl+f':
        return this._moveHorizontal(1);
      case 'up':
        return this._moveVertical(-1);
      case 'down':
        return this._moveVertical(1);
      case 'home':
      case 'ctrl+a':
        return this._goHome();
      case 'end':
      case 'ctrl+e':
        return this._goEnd();
      case 'ctrl+u':
        this.input = [];
        this.cursor = 0;
        return this.scheduleRender();
      case 'ctrl+k':
        return this._killLine();
      case 'ctrl+w':
        return this._deleteWord();
      case 'ctrl+p':
        return this._history(-1);
      case 'ctrl+n':
        return this._history(1);
      case 'ctrl+o':
        return this.onNewConversation ? this.onNewConversation() : undefined;
      case 'ctrl+l':
        return this.render();
      case 'ctrl+c':
        return this._ctrlC();
      case 'ctrl+d':
        return this._requestExit();
      case 'tab':
        if (suggestions.length) return this._acceptSlashSuggestion(suggestions);
        return this.onModeToggle ? this.onModeToggle() : undefined;
      case 'pageup':
        return this._scrollChat(-1);
      case 'pagedown':
        return this._scrollChat(1);
      default:
        return undefined;
    }
  }

  _handleChar(ch) {
    const code = ch.codePointAt(0);
    if (CONTROL_KEYS[code]) {
      this._handleKey(CONTROL_KEYS[code]);
      return;
    }
    if (code < 0x20) return;
    if (this.pendingSelection || (this.busy && !this.pendingConfirm)) return;
    this._insertText(ch);
  }

  _parseEscape(buf) {
    if (buf.startsWith('\x1b[200~')) return null;
    const mouse = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])/.exec(buf);
    if (mouse) {
      const button = Number(mouse[1]);
      const key = button & 64 ? (button & 1 ? 'wheeldown' : 'wheelup') : null;
      return {
        len: mouse[0].length,
        key,
        click: button === 0 && mouse[4] === 'M'
          ? { row: Number(mouse[3]) }
          : null
      };
    }
    if (/^\x1b\[<\d*(?:;\d*){0,2}$/.test(buf)) return null;
    const csi = /^\x1b\[([0-9;?]*)([ -/]*)([@-~])/.exec(buf);
    if (csi) {
      const seq = csi[0];
      const key = Object.prototype.hasOwnProperty.call(CSI_KEYS, seq) ? CSI_KEYS[seq] : null;
      return { len: seq.length, key };
    }
    if (/^\x1b\[[0-9;?]*$/.test(buf)) return null;
    if (buf.startsWith('\x1bO')) {
      if (buf.length < 3) return null;
      const seq = buf.slice(0, 3);
      return { len: 3, key: Object.prototype.hasOwnProperty.call(CSI_KEYS, seq) ? CSI_KEYS[seq] : null };
    }
    if (buf.startsWith('\x1b\r') || buf.startsWith('\x1b\n')) return { len: 2, key: 'newline' };
    if (buf.length < 2) return null;
    return { len: 2, key: null };
  }

  _armEscapeFlush() {
    if (this._escTimer) return;
    this._escTimer = setTimeout(() => {
      this._escTimer = null;
      if (!this._raw) return;
      if (this._raw[0] === '\x1b' && this._raw.length < 3) {
        if (this._raw.length === 1) {
          this._raw = '';
          this._handleKey('escape');
          return;
        }
        const rest = this._raw.slice(1);
        this._raw = rest;
        this._processRaw();
      }
    }, 35);
  }

  _processRaw() {
    let guard = 0;
    while (this._raw && guard < 20000) {
      guard += 1;
      if (this._raw.startsWith('\x1b[200~')) {
        const end = this._raw.indexOf('\x1b[201~', 6);
        if (end < 0) return;
        const pasted = this._raw.slice(6, end);
        this._raw = this._raw.slice(end + 6);
        this._insertText(pasted);
        continue;
      }
      if (this._raw.codePointAt(0) === 0x1b) {
        const parsed = this._parseEscape(this._raw);
        if (parsed === null) {
          this._armEscapeFlush();
          return;
        }
        this._raw = this._raw.slice(parsed.len);
        if (parsed.click) this._handleClick(parsed.click.row);
        this._handleKey(parsed.key);
        continue;
      }
      const cp = this._raw.codePointAt(0);
      const ch = String.fromCodePoint(cp);
      this._raw = this._raw.slice(ch.length);
      this._handleChar(ch);
    }
  }

  _ingest(chunk) {
    if (!this.started) return;
    if (this._escTimer) {
      clearTimeout(this._escTimer);
      this._escTimer = null;
    }
    this._raw += chunk;
    this._processRaw();
  }
}

module.exports = {
  Screen,
  stripAnsi,
  visibleWidth,
  charWidth,
  sanitize,
  wrapText,
  layoutInput,
  truncatePlain,
  truncateVisible,
  centerLine
};
