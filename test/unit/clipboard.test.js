'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { extractCodeBlocks } = require('../../src/ui/clipboard');

test('extractCodeBlocks returns fenced code in order', () => {
  const text = 'Intro\n```js\nconst a = 1;\n```\nMiddle\n```html\n<h1>Hi</h1>\n```\n';
  assert.deepEqual(extractCodeBlocks(text), ['const a = 1;', '<h1>Hi</h1>']);
});

test('extractCodeBlocks handles indented fences and unclosed blocks', () => {
  const text = '  ```js\n  const a = 1;\n  ```\n```\nconst b = 2;';
  assert.deepEqual(extractCodeBlocks(text), ['  const a = 1;', 'const b = 2;']);
});

test('extractCodeBlocks returns an empty list when there is no code', () => {
  assert.deepEqual(extractCodeBlocks('plain text'), []);
  assert.deepEqual(extractCodeBlocks(''), []);
});
