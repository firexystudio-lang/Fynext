'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Screen, stripAnsi } = require('../../src/ui/screen');

test('tool approval is displayed as a centered, prominent permission dialog', () => {
  const screen = new Screen({ tty: false, cols: 100, rows: 30 });
  screen.user('Review the file');
  screen.beginThinking();
  screen.confirm('File will be read\nPath: src/app.js', {
    allowAlways: false,
    centered: true,
    approval: true
  });

  const rendered = stripAnsi(screen.renderToString(100, 30));
  assert.match(rendered, /TOOL APPROVAL/);
  assert.match(rendered, /APPROVAL REQUIRED/);
  assert.match(rendered, /fynext is waiting for approval to continue/);
  assert.match(rendered, /\[Y\] ALLOW/);
  assert.match(rendered, /\[N\] DENY/);
  assert.match(rendered, /src\/app\.js/);
});
