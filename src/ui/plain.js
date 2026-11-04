'use strict';

const readline = require('readline');
const { C, S, sweepText } = require('./theme');
const { sanitize } = require('./screen');
const { describeToolAction, normalizeStatus, liveStatusFromText } = require('../agent/tool-status');

const YES = new Set(['y', 'yes', 'e', 'evet', 'onay', 'onayla', '1']);
const ALWAYS = new Set(['a', 'always', 'hep', 'her zaman']);

class PlainPresenter {
  constructor(opts) {
    const options = opts || {};
    this.stdout = options.stdout || process.stdout;
    this.stdin = options.stdin || process.stdin;
    this.model = options.model || 'qwen2.5-coder:3b';
    this.cwd = options.cwd || process.cwd();
    this.status = options.status || 'ready';
    this.color = options.color !== false && !process.env.NO_COLOR && !!this.stdout.isTTY;
    this.busy = false;
    this.started = false;
    this.stopping = false;
    this.rl = null;
    this.pendingConfirm = null;
    this._thinking = false;
    this._thinkingStatus = '';
    this._thinkingSweepTick = 0;
    this._thinkingSweepTimer = null;
    this._streamed = false;
    this._streamText = '';
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
      this._stopThinkingSweep();
      if (this.stdout.isTTY) this._write('\r\x1b[2K');
    }
    if (this._streamed) {
      this._streamed = false;
      this._line();
    }
    this._streamText = '';
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
    this._stopThinkingSweep();
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
    this._stopThinkingSweep();
    this._streamed = false;
  }

  user() {}

  restoreConversation(messages) {
    for (const message of messages || []) {
      if (!message || !['user', 'assistant'].includes(message.role) || !message.content) continue;
      const label = message.role === 'user' ? 'you' : 'fynext';
      this._line(`${this._c(C.accent)}${label}:${this._reset()} ${sanitize(message.content)}`);
    }
    if (messages && messages.length) this._line();
  }

  beginThinking() {
    this._thinking = true;
    this._thinkingStatus = 'Reviewing the request';
    this._thinkingSweepTick = 0;
    this._streamed = false;
    this._streamText = '';
    if (this.stdout.isTTY) {
      this._write(this._thinkingLine());
      this._stopThinkingSweep();
      if (this.color) {
        this._thinkingSweepTimer = setInterval(() => {
          this._thinkingSweepTick += 1;
          this._write('\r\x1b[2K' + this._thinkingLine());
        }, 16);
        if (typeof this._thinkingSweepTimer.unref === 'function') this._thinkingSweepTimer.unref();
      }
    }
  }
  thinkingStatus(text) {
    this._thinkingStatus = String(text || '').replace(/\s+/g, ' ').trim();
    if (this._thinking && this.stdout.isTTY) {
      this._write('\r\x1b[2K' + this._thinkingLine());
    }
  }

  _thinkingLine() {
    const status = this._thinkingStatus
      ? sweepText(` ${this._thinkingStatus}`, this._thinkingSweepTick, this.color)
      : '';
    return this._c(C.grayDim) + S.sep + status + '…' + this._reset();
  }
  _stopThinkingSweep() {
    if (!this._thinkingSweepTimer) return;
    clearInterval(this._thinkingSweepTimer);
    this._thinkingSweepTimer = null;
  }

  assistantDelta(text) {
    const chunk = String(text == null ? '' : text);
    if (!chunk) return;
    if (this._thinking) {
      this._thinking = false;
      this._stopThinkingSweep();
      if (this.stdout.isTTY) this._write('\r\x1b[2K');
    }
    this._streamed = true;
    this._streamText += chunk;
    this._write(chunk);
  }

  assistantDone() {
    if (this._thinking) {
      this._thinking = false;
      this._stopThinkingSweep();
      if (this.stdout.isTTY) this._write('\r\x1b[2K');
    }
    if (this._streamed) {
      this._streamed = false;
      this._line();
    }
  }

  toolStart(name, args, status) {
    const streamed = String(this._streamText || '').trim();
    this._finishStream();
    const action = String(status || describeToolAction(name, args)).replace(/\s+/g, ' ').trim();
    const streamedStatus = liveStatusFromText(streamed) || normalizeStatus(streamed);
    if (streamed && streamedStatus === normalizeStatus(action)) return;
    this._line(
      this._c(C.yellow) +
        S.arrow +
        ' ' +
        this._reset() +
        this._c(C.accent) +
        action +
        this._reset()
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
      const approval = !!(options && options.approval);
      this.pendingConfirm = { allowAlways, approval, resolve };
      this._finishStream();
      this._clearPrompt();
      if (approval) {
        const width = 76;
        const bodyWidth = width - 4;
        const body = String(question || '')
          .replace(/\x1b\[[0-9;]*m/g, '')
          .split('\n')
          .flatMap((line) => {
            const chars = Array.from(line);
            const wrapped = [];
            while (chars.length > bodyWidth) wrapped.push(chars.splice(0, bodyWidth).join(''));
            if (chars.length) wrapped.push(chars.join(''));
            return wrapped;
          });
        const top = '╭─ ⚠ APPROVAL REQUIRED ' + '─'.repeat(width - 22) + '╮';
        const bottom = '╰' + '─'.repeat(width - 2) + '╯';
        this._line(this._c(C.orange) + top + this._reset());
        this._line(this._c(C.white) + '│ fynext is waiting for approval to continue' +
          ' '.repeat(Math.max(0, bodyWidth - 42)) + ' │' + this._reset());
        for (const line of body) {
          this._line(this._c(C.orange) + '│ ' + this._reset() + line +
            ' '.repeat(Math.max(0, bodyWidth - Array.from(line).length)) +
            this._c(C.orange) + ' │' + this._reset());
        }
        this._line(this._c(C.green) + '│ [Y] ALLOW' +
          this._reset() + '     ' + this._c(C.redBright) + '[N] DENY' +
          this._reset() + this._c(C.orange) +
          ' '.repeat(Math.max(0, width - 38)) + '│' + this._reset());
        this._line(this._c(C.orange) + bottom + this._reset());
        this.rl.setPrompt(this._c(C.yellow) + 'Allow this action? [Y/N] > ' + this._reset());
      } else {
        this.rl.setPrompt(
          this._c(C.yellow) +
            (allowAlways ? 'Approve [y/N/a=always] ' : 'Approve [y/N] ') +
            this._reset() +
            String(question || '').replace(/\s+/g, ' ').trim() +
            ' '
        );
      }
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
      this.note('A task is running; wait for it to finish or press Ctrl+C to stop.');
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
      this.setNotice('Stopping…');
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
