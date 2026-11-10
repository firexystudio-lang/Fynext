'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Screen, stripAnsi } = require('../../src/ui/screen');

function chatWindow(screen) {
  const { cols, rows } = screen.dimensions();
  const chatTop = rows >= 9 ? 3 : 2;
  const layout = screen._layout();
  const suggestions = screen._suggestionLines(cols);
  const boxLines = screen._boxLines(layout, cols);
  const boxTop = rows - 1 - boxLines.length - suggestions.length;
  const chatHeight = Math.max(0, boxTop - chatTop);
  const lines = screen._chatLines(Math.max(10, cols - 4));
  const start = Math.max(0, lines.length - chatHeight);
  return { chatTop, start, lines };
}

test('code block headers expose a copy hint', () => {
  const screen = new Screen({ tty: false, cols: 80, rows: 24 });
  screen.assistantDelta('Here:\n```js\nconst a = 1;\n```');
  const header = chatWindow(screen).lines.find((line) => stripAnsi(line).includes('script.js'));
  assert.ok(header, 'expected a code block header');
  assert.match(stripAnsi(header), /\[kopyala\]/);
});

test('clicking the copy hint copies the code block', () => {
  const screen = new Screen({ tty: false, cols: 80, rows: 24 });
  screen.note('Previous message');
  screen.assistantDelta('Here:\n```js\nconst a = 1;\n```');
  let copied = null;
  screen.copyCodeBlock = (item, blockIndex) => {
    copied = { item, blockIndex };
    return true;
  };
  const { chatTop, start, lines } = chatWindow(screen);
  const headerIndex = lines.findIndex((line) => stripAnsi(line).includes('[kopyala]'));
  assert.ok(headerIndex >= start);
  const hintIndex = stripAnsi(lines[headerIndex]).indexOf('[kopyala]');
  screen._handleClick(chatTop + 1 + headerIndex - start, hintIndex + 3);
  const assistant = screen.items.find((item) => item.kind === 'assistant');
  assert.deepEqual(copied, { item: assistant, blockIndex: 0 });
});

test('copyLastCodeBlock copies the last fenced block', () => {
  const screen = new Screen({ tty: false, cols: 80, rows: 24 });
  screen.assistantDelta('one\n```js\nconst a = 1;\n```\ntwo\n```js\nconst b = 2;\n```');
  let copied = null;
  screen._copyCode = (code) => {
    copied = code;
  };
  assert.equal(screen.copyLastCodeBlock(), true);
  assert.equal(copied, 'const b = 2;');
});

test('copyLastCodeBlock reports when there is no code', () => {
  const screen = new Screen({ tty: false, cols: 80, rows: 24 });
  screen.note('hello');
  let notice = null;
  screen.setNotice = (text) => {
    notice = text;
  };
  assert.equal(screen.copyLastCodeBlock(), false);
  assert.equal(notice, 'No code block to copy');
});
