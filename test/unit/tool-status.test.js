'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  describeToolAction,
  isStatusLine,
  liveStatusFromText,
  stripStatusInstructions,
  stripStatusLine,
  StatusStreamFilter
} = require('../../src/agent/tool-status');
const { Screen, stripAnsi } = require('../../src/ui/screen');

test('turns tool calls into human-readable English status lines', () => {
  assert.equal(
    describeToolAction('fs_write', { path: 'test/math.test.js', content: 'x' }),
    'Creating test/math.test.js'
  );
  assert.equal(describeToolAction('fs_read', { path: 'src/math.js' }), 'Reading src/math.js');
  assert.equal(describeToolAction('shell_exec', { command: 'npm test' }), 'Running tests');
  assert.equal(
    describeToolAction('shell_exec', { command: 'npm install --save-dev jest' }),
    'Installing dependencies'
  );
  assert.equal(describeToolAction('fs_grep', { pattern: 'math.add' }), 'Searching file contents for “math.add”');
  assert.match(describeToolAction('fs_read', { path: 'C:/project/src/math.js' }), /^Reading …\/src\/math\.js$/);
});

test('removes STATUS instructions while keeping the rest of a system prompt', () => {
  const prompt = [
    'You are Fynext.',
    '- Only when you are about to call a tool, start your response with exactly one line in this format: STATUS: <short status>.',
    'Use tools to inspect the workspace.',
    '- Put STATUS on its own line, then call the tool.'
  ].join('\n');
  const stripped = stripStatusInstructions(prompt);

  assert.doesNotMatch(stripped, /STATUS/);
  assert.match(stripped, /You are Fynext\./);
  assert.match(stripped, /Use tools to inspect the workspace\./);
});

test('rejects JSON, tool names, and multi-line text as AI status lines', () => {
  assert.equal(isStatusLine('src/math.js dosyası oluşturuluyor'), true);
  assert.equal(isStatusLine('{"path":"src/math.js"}'), false);
  assert.equal(isStatusLine('fs_write src/math.js'), false);
  assert.equal(isStatusLine('tool_calls: fs_write'), false);
  assert.equal(isStatusLine('birinci satır\nikinci satır'), false);
  assert.equal(isStatusLine('x'.repeat(200)), false);
});

test('only an explicitly marked status line becomes the thinking status', () => {
  assert.equal(
    liveStatusFromText('STATUS: Creating src/math.js\nthen running tests'),
    'Creating src/math.js'
  );
  assert.equal(
    liveStatusFromText('<status>Reading src/math.js</status>\nthen continuing'),
    'Reading src/math.js'
  );
  assert.equal(liveStatusFromText('Creating src/math.js\nthen continuing'), '');
  assert.equal(liveStatusFromText('{"name":"fs_write","arguments":{}}'), '');
  assert.equal(liveStatusFromText('STATUS: src'), '');
  assert.equal(liveStatusFromText('STATUS: fs_write src/math.js'), '');
  assert.equal(liveStatusFromText('STATUS: ' + 'x'.repeat(120)), '');
});

test('rejects advice written as a status line and keeps it as normal text', () => {
  const advice = 'masaüstüne klasör oluşturmak için aşağıdaki komutları çalıştırabilirsiniz';
  assert.equal(liveStatusFromText('STATUS: ' + advice), '');
  assert.equal(liveStatusFromText(advice), '');
  assert.equal(stripStatusLine('STATUS: ' + advice), advice);
  assert.equal(stripStatusLine('STATUS: Reading src/math.js\nthen continuing'), 'then continuing');
});

test('stream filter hides the status line and updates the live status', () => {
  const filter = new StatusStreamFilter();
  let visible = '';
  for (const chunk of ['STA', 'TUS: Creating ', 'a new folder\n', '{"name":"fs_mkdir"}']) {
    visible += filter.push(chunk);
  }
  const held = filter.finish();
  assert.equal(filter.status, 'Creating a new folder');
  assert.equal(visible, '');
  assert.doesNotMatch(held, /STATUS:/);
  assert.match(held, /fs_mkdir/);

  const normal = new StatusStreamFilter();
  assert.equal(normal.push('Masaüstüne klasör oluşturmak için '), 'Masaüstüne klasör oluşturmak için ');
  assert.equal(normal.status, '');
});

test('TUI replaces the default thinking text with the live AI status', () => {
  const screen = new Screen({ tty: false, cols: 100, rows: 30 });
  screen.user('test');
  screen.beginThinking();
  screen.thinkingStatus(liveStatusFromText('STATUS: Creating src/math.js\nthen continuing'));
  const rendered = stripAnsi(screen.renderToString(100, 30));
  assert.match(rendered, /Creating src\/math\.js/);
  assert.doesNotMatch(rendered, /Reviewing the request and workspace context/);
});

test('TUI renders the natural status instead of tool name and arguments', () => {
  const screen = new Screen({ tty: false, cols: 100, rows: 30 });
  screen.user('test');
  screen.toolStart(
    'fs_write',
    { path: 'src/math.js', content: 'SECRET_CONTENT' },
    'Creating src/math.js'
  );
  screen.toolEnd('fs_write', true, 'Written');
  const rendered = stripAnsi(screen.renderToString(100, 30));
  assert.match(rendered, /Creating src\/math\.js/);
  assert.doesNotMatch(rendered, /SECRET_CONTENT/);
  assert.doesNotMatch(rendered, /fs_write/);
  assert.doesNotMatch(rendered, /"path"/);
});
