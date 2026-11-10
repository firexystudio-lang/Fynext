'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { renderInline, renderMarkdownLine, renderTable, isTableSeparator } = require('../../src/ui/markdown');
const { Screen, stripAnsi } = require('../../src/ui/screen');

test('renders inline markdown elements correctly', () => {
  // Bold
  const boldText = renderInline('This is **bold** text');
  assert.ok(boldText.includes('\x1b[1m'));
  assert.equal(stripAnsi(boldText), 'This is bold text');

  // Italic
  const italicText = renderInline('This is *italic* text');
  assert.ok(italicText.includes('\x1b[3m'));
  assert.equal(stripAnsi(italicText), 'This is italic text');

  // Inline code
  const codeText = renderInline('Use `npm install` command');
  assert.ok(codeText.includes('`npm install`'));
  assert.equal(stripAnsi(codeText), 'Use `npm install` command');

  // Strikethrough
  const strikeText = renderInline('This is ~~deleted~~ text');
  assert.ok(strikeText.includes('\x1b[9m'));
  assert.equal(stripAnsi(strikeText), 'This is deleted text');

  // Link
  const linkText = renderInline('Visit [Google](https://google.com) now');
  assert.ok(linkText.includes('Google'));
  assert.ok(linkText.includes('https://google.com'));
  assert.equal(stripAnsi(linkText), 'Visit Google (https://google.com) now');
});

test('renders block markdown elements (headings, lists, tasks, quotes)', () => {
  // Headings
  const h1 = renderMarkdownLine('# Project Title', 80);
  assert.equal(h1.type, 'h1');
  assert.ok(stripAnsi(h1.text).includes('PROJECT TITLE'));

  const h2 = renderMarkdownLine('## Architecture', 80);
  assert.equal(h2.type, 'h2');
  assert.ok(stripAnsi(h2.text).includes('Architecture'));

  // Task list
  const todo = renderMarkdownLine('- [ ] Pending item', 80);
  assert.equal(todo.type, 'task');
  assert.ok(stripAnsi(todo.text).includes('☐ Pending item'));

  const done = renderMarkdownLine('- [x] Completed item', 80);
  assert.equal(done.type, 'task');
  assert.ok(stripAnsi(done.text).includes('☑ Completed item'));

  // Lists
  const unordered = renderMarkdownLine('- First item', 80);
  assert.equal(unordered.type, 'unordered-list');
  assert.ok(stripAnsi(unordered.text).includes('• First item'));

  const ordered = renderMarkdownLine('1. Numbered item', 80);
  assert.equal(ordered.type, 'ordered-list');
  assert.ok(stripAnsi(ordered.text).includes('1. Numbered item'));

  // Blockquote
  const quote = renderMarkdownLine('> Important note', 80);
  assert.equal(quote.type, 'blockquote');
  assert.ok(stripAnsi(quote.text).includes('│ Important note'));

  // Horizontal Rule
  const hr = renderMarkdownLine('---', 80);
  assert.equal(hr.type, 'hr');
  assert.ok(stripAnsi(hr.text).includes('───'));
});

test('formats markdown tables with box borders', () => {
  const table = [
    '| Feature | Status |',
    '| --- | --- |',
    '| Parser | Complete |',
    '| Formatter | Active |'
  ];

  assert.equal(isTableSeparator(table[1]), true);
  const rendered = renderTable(table, 60);
  assert.ok(rendered.length >= 5);
  const plain = rendered.map(stripAnsi).join('\n');
  assert.ok(plain.includes('Feature'));
  assert.ok(plain.includes('Status'));
  assert.ok(plain.includes('Complete'));
  assert.ok(plain.includes('┌'));
  assert.ok(plain.includes('└'));
});

test('screen integrates markdown rendering seamlessly in chat lines', () => {
  const screen = new Screen({ tty: false, cols: 80, rows: 24 });
  screen.assistantDelta(
    '## Overview\n' +
    'Here are the **key features**:\n' +
    '- [x] Enhanced thinking\n' +
    '- [ ] Future item\n' +
    'Use `fynext` to start.'
  );

  const lines = screen._chatLines(76).map(stripAnsi).join('\n');
  assert.ok(lines.includes('■ Overview'));
  assert.ok(lines.includes('key features'));
  assert.ok(lines.includes('☑ Enhanced thinking'));
  assert.ok(lines.includes('☐ Future item'));
  assert.ok(lines.includes('`fynext`'));
});
