'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Screen, stripAnsi } = require('../../src/ui/screen');

function makeScreen() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'fynext-screen-'));
  fs.mkdirSync(path.join(cwd, 'src'), { recursive: true });
  fs.writeFileSync(path.join(cwd, 'src', 'index.js'), 'module.exports = 1;\n', 'utf8');
  fs.writeFileSync(path.join(cwd, 'README.md'), '# test\n', 'utf8');
  return new Screen({ tty: false, cols: 90, rows: 30, cwd });
}

test('command palette lists slash commands and fills the input', async () => {
  const screen = makeScreen();
  screen._openCommandPalette();
  assert.ok(screen.pendingSelection);
  assert.ok(screen.pendingSelection.options.length > 10);
  assert.equal(screen.pendingSelection.options[0].label, '/help');

  screen._handleKey('enter');
  await Promise.resolve();
  await Promise.resolve();
  assert.match(screen.getInput(), /^\/help/);
});

test('@ mention completes a workspace file', () => {
  const screen = makeScreen();
  screen.setInput('@src');

  const active = screen._activeSuggestions();
  assert.equal(active.kind, 'mention');
  assert.ok(active.items.some((item) => item.value === 'src/index.js'));

  screen._acceptMention('src/index.js');
  assert.equal(screen.getInput(), '@src/index.js ');
});

test('slash commands show matching argument options and complete them', () => {
  const screen = makeScreen();
  screen.setInput('/theme ');

  const active = screen._activeSuggestions();
  assert.equal(active.kind, 'slash-argument');
  assert.ok(active.items.some((item) => item.value === 'dark'));
  const rendered = stripAnsi(screen.renderToString(90, 30));
  assert.match(rendered, /fynext  Original Fynext theme/);
  assert.match(rendered, /dark/);

  screen.setInput('/theme d');
  assert.deepEqual(screen._activeSuggestions().items.map((item) => item.value), ['dark', 'default']);
  screen._handleKey('tab');
  assert.equal(screen.getInput(), '/theme dark ');
  assert.match(stripAnsi(screen.renderToString(90, 30)), /Press Enter to apply this theme/);
});

test('mode and approval commands offer filtered on/off choices', () => {
  const screen = makeScreen();
  screen.setInput('/mode p');
  assert.deepEqual(screen._activeSuggestions().items.map((item) => item.value), ['plan']);

  screen.setInput('/approve ');
  assert.deepEqual(screen._activeSuggestions().items.map((item) => item.value), ['on', 'off']);
});

test('slash argument suggestions render labels when typing a command and space', () => {
  const screen = makeScreen();

  screen.setInput('/gpu');
  screen._handleKey('tab');
  assert.equal(screen.getInput(), '/gpu ');
  const tabSuggestions = stripAnsi(screen.renderToString(90, 30));
  assert.match(tabSuggestions, /Use the GPU when available/);

  screen.setInput('/mode ');
  const modeSuggestions = stripAnsi(screen.renderToString(90, 30));
  assert.match(modeSuggestions, /plan/);
  assert.match(modeSuggestions, /Read-only planning mode/);

  screen.setInput('/gpu ');
  const gpuSuggestions = stripAnsi(screen.renderToString(90, 30));
  assert.match(gpuSuggestions, /auto/);
  assert.match(gpuSuggestions, /Use the GPU when available/);

  screen.setInput('/engine ');
  const engineSuggestions = stripAnsi(screen.renderToString(90, 30));
  assert.match(engineSuggestions, /ollama/);
});

test('port command suggests the Fynext ESP32 activation target', () => {
  const screen = makeScreen();
  screen.setInput('/port ');

  const active = screen._activeSuggestions();
  assert.equal(active.kind, 'slash-argument');
  assert.deepEqual(active.items.map((item) => item.value), ['fynext esp32']);
  screen._handleKey('tab');
  assert.equal(screen.getInput(), '/port fynext esp32 ');
});

test('Enter submits /mode without exiting and completes explicit mode arguments', () => {
  const screen = makeScreen();
  const submitted = [];
  let exitRequested = false;
  screen.submitHandler((text) => submitted.push(text));
  screen.exitHandler(() => { exitRequested = true; });

  screen.setInput('/mode');
  screen._handleKey('enter');
  assert.deepEqual(submitted, ['/mode']);
  assert.equal(exitRequested, false);

  screen.setInput('/mode ');
  screen._handleKey('enter');
  assert.equal(screen.getInput(), '/mode plan ');
  screen._handleKey('enter');
  assert.deepEqual(submitted, ['/mode', '/mode plan']);
  assert.equal(exitRequested, false);
});

test('Enter submits an exact command instead of its longer prefix match', () => {
  const screen = makeScreen();
  const submitted = [];
  screen.submitHandler((text) => submitted.push(text));

  for (const command of ['/model', '/models', '/mode']) {
    screen.setInput(command);
    screen._handleKey('enter');
  }

  assert.deepEqual(submitted, ['/model', '/models', '/mode']);
});

test('command suggestions include supported project commands, not unsupported entries', () => {
  const screen = makeScreen();
  for (const command of ['project', 'memory', 'git', 'status', 'roadmap', 'features']) {
    screen.setInput('/' + command);
    assert.ok(
      screen._activeSuggestions().items.some((item) => item.value.trim() === '/' + command),
      `/${command} should be suggested`
    );
  }

  screen.setInput('/model-check');
  assert.equal(screen._activeSuggestions(), null);
});

test('commands with free-form arguments show usage hints', () => {
  const screen = makeScreen();
  screen.setInput('/workspace ');

  assert.equal(screen._activeSuggestions(), null);
  assert.match(stripAnsi(screen.renderToString(90, 30)), /Enter a workspace directory path/);
});

test('ctrl+up and ctrl+down walk input history', () => {
  const screen = makeScreen();
  screen.history = ['first', 'second'];
  screen.histIndex = screen.history.length;

  screen._handleKey('ctrl+up');
  assert.equal(screen.getInput(), 'second');
  screen._handleKey('ctrl+up');
  assert.equal(screen.getInput(), 'first');
  screen._handleKey('ctrl+down');
  assert.equal(screen.getInput(), 'second');
});
