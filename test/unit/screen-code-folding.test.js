'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Screen, stripAnsi } = require('../../src/ui/screen');

function clickCodeCard(screen, filename) {
  const { cols, rows } = screen.dimensions();
  const chatTop = rows >= 9 ? 3 : 2;
  const layout = screen._layout();
  const suggestions = screen._suggestionLines(cols);
  const boxLines = screen._boxLines(layout, cols);
  const boxTop = rows - 1 - boxLines.length - suggestions.length;
  const chatHeight = Math.max(0, boxTop - chatTop);
  const lines = screen._chatLines(Math.max(10, cols - 4));
  const start = Math.max(0, lines.length - chatHeight);
  const cardIndex = lines.findIndex((line) => {
    const text = stripAnsi(line);
    return text.includes(filename);
  });

  assert.ok(cardIndex >= start, `Expected visible code card for ${filename}`);
  screen._handleClick(chatTop + 1 + cardIndex - start, 1);
}

test('assistant code blocks collapse into clickable filename cards', () => {
  const screen = new Screen({ tty: false, cols: 80, rows: 24 });
  screen.note('Previous message');
  screen.assistantDelta(
    'Here is `index.html`:\n```html\n<html>\n  <body>Hello</body>\n</html>\n```'
  );

  const collapsed = stripAnsi(screen._chatLines(76).join('\n'));
  assert.match(collapsed, /Here is ▶ index\.html:/);
  assert.doesNotMatch(collapsed, /click to view|Code block/);
  assert.doesNotMatch(collapsed, /<html>/);
  assert.doesNotMatch(collapsed, /<\/html>/);

  clickCodeCard(screen, 'index.html');
  const expanded = stripAnsi(screen._chatLines(76).join('\n'));
  assert.match(expanded, /Here is ▼ index\.html:/);
  assert.match(expanded, /<html>/);
  assert.match(expanded, /<body>Hello<\/body>/);

  clickCodeCard(screen, 'index.html');
  assert.doesNotMatch(stripAnsi(screen._chatLines(76).join('\n')), /<html>/);
});

test('code blocks without a named file still collapse and can be expanded', () => {
  const screen = new Screen({ tty: false, cols: 80, rows: 24 });
  screen.note('Previous message');
  screen.assistantDelta('```javascript\nconst answer = 42;\n```');

  const collapsed = stripAnsi(screen._chatLines(76).join('\n'));
  assert.match(collapsed, /▶ script\.js/);
  assert.doesNotMatch(collapsed, /Code block/);
  assert.doesNotMatch(collapsed, /const answer/);

  clickCodeCard(screen, 'script.js');
  assert.match(stripAnsi(screen._chatLines(76).join('\n')), /const answer = 42/);
});

test('filename chips appear inline with surrounding assistant text', () => {
  const screen = new Screen({ tty: false, cols: 80, rows: 24 });
  screen.note('Previous message');
  screen.assistantDelta(
    'Created `src/index.html` for the landing page. Open it when ready:\n```html\n<h1>Hello</h1>\n```'
  );

  const lines = screen._chatLines(76);
  const rendered = stripAnsi(lines.join('\n'));
  assert.match(rendered, /Created ▶ index\.html for the landing page\. Open it when ready:/);
  assert.doesNotMatch(rendered, /click to view|Code block|▶ index\.html.*\n.*▶ index\.html/);

  clickCodeCard(screen, 'index.html');
  assert.match(stripAnsi(screen._chatLines(76).join('\n')), /Created ▼ index\.html/);
  assert.match(stripAnsi(screen._chatLines(76).join('\n')), /<h1>Hello<\/h1>/);
});

test('streaming assistant code stays collapsed before the closing fence arrives', () => {
  const screen = new Screen({ tty: false, cols: 80, rows: 24 });
  screen.assistantDelta('Writing `index.html`:\n```html\n<html>\n<body>Hello</body>');

  const streaming = stripAnsi(screen._chatLines(76).join('\n'));
  assert.match(streaming, /Writing ▶ index\.html:/);
  assert.doesNotMatch(streaming, /Code block/);
  assert.doesNotMatch(streaming, /<html>/);

  screen.assistantDelta('\n```');
  const complete = stripAnsi(screen._chatLines(76).join('\n'));
  assert.match(complete, /Writing ▶ index\.html:/);
  assert.doesNotMatch(complete, /<html>/);
});

test('code blocks in user messages remain visible and are not clickable cards', () => {
  const screen = new Screen({ tty: false, cols: 80, rows: 24 });
  screen.user('Please review:\n```html\n<html></html>\n```');

  const lines = stripAnsi(screen._chatLines(76).join('\n'));
  assert.match(lines, /<html><\/html>/);
  assert.doesNotMatch(lines, /click to view/);
});
