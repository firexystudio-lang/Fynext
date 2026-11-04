'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Screen, stripAnsi } = require('../../src/ui/screen');

test('slash command results render in a separate dialog without entering chat items', () => {
  const screen = new Screen({ tty: false, cols: 80, rows: 24 });
  screen.showCommandResult('Model: qwen2.5-coder');

  const rendered = stripAnsi(screen.renderToString(80, 24));
  assert.match(rendered, /Command result/);
  assert.match(rendered, /Model: qwen2\.5-coder/);
  assert.deepEqual(screen.items, []);

  screen._handleKey('enter');
  assert.equal(screen.commandResult, null);
});

test('long slash command results can be scrolled and closed with escape', () => {
  const screen = new Screen({ tty: false, cols: 40, rows: 10 });
  screen.showCommandResult(Array.from({ length: 20 }, (_, i) => `satır ${i + 1}`).join('\n'));

  screen._handleKey('pagedown');
  assert.ok(screen.commandResult.scroll > 0);
  assert.match(stripAnsi(screen.renderToString(40, 10)), /satır/);

  screen._handleKey('escape');
  assert.equal(screen.commandResult, null);
});

test('completion feedback appears briefly in the TUI and then clears', async () => {
  const screen = new Screen({ tty: false, cols: 80, rows: 24 });
  screen.setInput('next request');
  screen.setCompletionNotice('Response complete — Windows notification and sound', 25);

  const raw = screen.renderToString(80, 24);
  const rendered = stripAnsi(raw);
  assert.match(rendered, /Response complete/);
  assert.match(rendered, /Windows notification and sound/);
  assert.match(rendered, /╭─+╮/);
  assert.ok(rendered.indexOf('playing completion sound') < rendered.indexOf('next request'));
  assert.match(raw, /\x1b\[1m/);
  await new Promise((resolve) => setTimeout(resolve, 40));

  assert.equal(screen.completionNotice, '');
  assert.doesNotMatch(stripAnsi(screen.renderToString(80, 24)), /Windows notification and sound/);
});
