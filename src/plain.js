'use strict';

const readline = require('readline');
const { C, S } = require('./theme');
const { sanitize } = require('./screen');

const YES = new Set(['e', 'evet', 'y', 'yes', 'onay', 'onayla', '1']);
const ALWAYS = new Set(['a', 'hep', 'her zaman', 'always']);

class PlainPresenter {
  constructor(opts) {
    const options = opts || {};
    this.stdout = options.stdout || process.stdout;
    this.stdin = options.stdin || process.stdin;
    this.model = options.model || 'qwen2.5-coder:3b';
    this.cwd = options.cwd || process.cwd();
    this.status = options.status || 'hazır';
    this.color = options.color !== false && !process.env.NO_COLOR && !!this.stdout.isTTY;
    this.busy = false;
    this.started = false;
    this.stopping = false;
    this.rl = null;
    this.pendingConfirm = null;
    this._thinking = false;
    this._thinkingStatus = '';
    this._streamed = false;
    this._promptActive = false;
    this.usage = '';
    this.onSubmit = null;
    this.onAbort = null;
    this.onExitRequest = null;
  }

  _c(code) {
    return this.color ? code : '';
  }

  _reset() {
    return this.color ? C.reset : '';
  }

  _write(text) {
    this.stdout.write(text);
  }

  _line(text) {
    this._write((text == null ? '' : text) + '\n');
  }

  _finishStream() {
    if (this._thinking) {
      this._thinking = false;
      if (this.stdout.isTTY) this._write('\r\x1b[2K');
    }
    if (this._streamed) {
      this._streamed = false;
      this._line();
    }
  }

  start() {
    if (this.started) return;
    this.started = true;
    if (!this.stdin.isTTY) return;
    this.rl = readline.createInterface({
      input: this.stdin,
      output: this.stdout,
      terminal: true,
      historySize: 200
    });
    this.rl.on('line', (line) => this._onLine(line));
    this.rl.on('SIGINT', () => this._onSigint());
    this.rl.on('close', () => {
      if (this.stopping) return;
      this.stopping = true;
      if (this.onExitRequest) {
        try {
          this.onExitRequest();
        } catch (_) {
          /* yoksay */
        }
      }
    });
    this._prompt();
  }

  stop() {
    this.stopping = true;
    this._promptActive = false;
    if (this.rl) {
      try {
        this.rl.close();
      } catch (_) {
        /* yoksay */
      }
      this.rl = null;
    }
    this.started = false;
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

  setInfo(patch) {
    const next = patch || {};
    if (next.model != null) this.model = String(next.model);
    if (next.cwd != null) this.cwd = String(next.cwd);
    if (next.status != null) this.status = String(next.status);
    if (next.usage != null) this.usage = String(next.usage);
  }

  setBusy(value) {
    const was = this.busy;
    this.busy = !!value;
    if (was && !this.busy) this._prompt();
  }

  _clearPrompt() {
    if (!this._promptActive || !this.rl) return;
    this._promptActive = false;
    try {
      this.rl.clearLine(0);
      this.rl.cursorTo(0);
    } catch (_) {
      /* yoksay */
    }
  }

  _beginOutput() {
    this._clearPrompt();
    this._finishStream();
  }

  setNotice(text, duration) {
    if (!text) return;
    this._beginOutput();
    this._line(this._c(C.grayDim) + S.sep + ' ' + text + this._reset());
    this._prompt();
  }

  reset() {
    this.busy = false;
    this._thinking = false;
    this._streamed = false;
  }

  user() {}

  restoreConversation(messages) {
    for (const message of messages || []) {
      if (!message || !['user', 'assistant'].includes(message.role) || !message.content) continue;
      const label = message.role === 'user' ? 'sen' : 'fynext';
      this._line(`${this._c(C.accent)}${label}:${this._reset()} ${sanitize(message.content)}`);
    }
    if (messages && messages.length) this._line();
  }

  beginThinking() {
    this._thinking = true;
    this._thinkingStatus = 'isteği değerlendiriyor';
    this._streamed = false;
    if (this.stdout.isTTY) {
      this._write(this._thinkingLine());
    }
  }

  thinkingStatus(text) {
    this._thinkingStatus = String(text || '').replace(/\s+/g, ' ').trim();
    if (this._thinking && this.stdout.isTTY) {
      this._write('\r\x1b[2K' + this._thinkingLine());
    }
  }

  _thinkingLine() {
    const status = this._thinkingStatus ? ` ${this._thinkingStatus}` : '';
    return this._c(C.grayDim) + S.sep + status + '…' + this._reset();
  }

  assistantDelta(text) {
    const chunk = String(text == null ? '' : text);
    if (!chunk) return;
    if (this._thinking) {
      this._thinking = false;
      if (this.stdout.isTTY) this._write('\r\x1b[2K');
    }
    this._streamed = true;
    this._write(chunk);
  }

  assistantDone() {
    if (this._thinking) {
      this._thinking = false;
      if (this.stdout.isTTY) this._write('\r\x1b[2K');
    }
    if (this._streamed) {
      this._streamed = false;
      this._line();
    }
  }

  toolStart(name, args) {
    this._finishStream();
    let arg = '';
    const obj = args && typeof args === 'object' ? args : {};
    for (const key of ['command', 'path', 'query', 'url', 'source', 'destination']) {
      if (typeof obj[key] === 'string' && obj[key].trim()) {
        arg = obj[key].replace(/\s+/g, ' ').trim();
        break;
      }
    }
    if (arg.length > 140) arg = arg.slice(0, 140) + '…';
    this._line(
      this._c(C.yellow) +
        S.arrow +
        ' ' +
        name +
        this._reset() +
        (arg ? '  ' + this._c(C.grayDim) + arg + this._reset() : '')
    );
  }

  toolEnd(name, ok, summary) {
    const text = String(summary || '').replace(/\s+/g, ' ').trim();
    const mark = ok ? this._c(C.green) + S.check : this._c(C.red) + S.cross;
    this._line('  ' + mark + this._reset() + ' ' + this._c(C.grayDim) + text + this._reset());
  }

  note(text) {
    this._beginOutput();
    const body = String(text == null ? '' : text);
    for (const line of body.split('\n')) {
      this._line('  ' + this._c(C.gray) + line + this._reset());
    }
    this._prompt();
  }

  error(text) {
    this._beginOutput();
    const body = String(text == null ? '' : text);
    body.split('\n').forEach((line, index) => {
      this._line(
        '  ' +
          this._c(C.red) +
          (index === 0 ? S.cross + ' ' : '  ') +
          line +
          this._reset()
      );
    });
    this._prompt();
  }

  confirm(question, options) {
    if (!this.rl) return Promise.resolve(false);
    return new Promise((resolve) => {
      const allowAlways = !options || options.allowAlways !== false;
      this.pendingConfirm = { allowAlways, resolve };
      this._finishStream();
      this._clearPrompt();
      this.rl.setPrompt(
        this._c(C.yellow) +
          (allowAlways ? 'onay [e/H/a=hep izin ver] ' : 'onay [e/H] ') +
          this._reset() +
          String(question || '').replace(/\s+/g, ' ').trim() +
          ' '
      );
      this._promptActive = true;
      this.rl.prompt();
    });
  }

  _prompt() {
    if (!this.rl || this.busy || this.pendingConfirm || this.stopping || this._promptActive) return;
    this._promptActive = true;
    this.rl.setPrompt(
      this._c(C.red) + 'fynext ' + S.arrow + ' ' + this._reset() +
      this._c(C.grayDim) + `[${this.model}${this.usage ? ' · ' + this.usage : ''}] ` + this._reset()
    );
    this.rl.prompt();
  }

  _onLine(line) {
    this._promptActive = false;
    if (this.pendingConfirm) {
      const pending = this.pendingConfirm;
      this.pendingConfirm = null;
      const answer = String(line).trim().toLowerCase();
      pending.resolve(pending.allowAlways && ALWAYS.has(answer) ? 'always' : YES.has(answer));
      this._prompt();
      return;
    }
    if (this.busy) {
      this.note('işlem sürüyor; bitmesini bekleyin veya Ctrl+C ile durdurun.');
      return;
    }
    const text = String(line == null ? '' : line).trim();
    if (!text) {
      this._prompt();
      return;
    }
    if (this.onSubmit) {
      try {
        const result = this.onSubmit(text);
        if (result && typeof result.then === 'function') {
          result.catch(() => {}).then(() => this._prompt());
          return;
        }
      } catch (_) {
        /* yoksay */
      }
    }
    if (!this.busy) this._prompt();
  }

  _onSigint() {
    this._promptActive = false;
    if (this.pendingConfirm) {
      const pending = this.pendingConfirm;
      this.pendingConfirm = null;
      pending.resolve(false);
      this._prompt();
      return;
    }
    if (this.busy) {
      if (this.onAbort) {
        try {
          this.onAbort();
        } catch (_) {
          /* yoksay */
        }
      }
      this.setNotice('durduruluyor…');
      return;
    }
    this._line();
    this.stopping = true;
    if (this.onExitRequest) {
      try {
        this.onExitRequest();
      } catch (_) {
        /* yoksay */
      }
    }
  }
}

module.exports = { PlainPresenter };
