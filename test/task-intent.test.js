'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { requiresToolFollowThrough } = require('../src/task-intent');

test('requires tools for direct implementation and maintenance requests', () => {
  for (const request of [
    'Bu hatay\u0131 d\u00fczelt',
    'Bu hatay\u0131 d\u00fczeltir misin?',
    'Projeye giri\u015f ekran\u0131 ekle',
    'Projeye giri\u015f ekran\u0131 ekleyebilir misin?',
    'Testleri \u00e7al\u0131\u015ft\u0131rabilir misin?',
    'Bunu yapabilirsin?',
    'Projeyi inceleyebilirsin?',
    '\u015eu dosyay\u0131 de\u011fi\u015ftirebilirsin?',
    'Bize \u015funu yapabilir misin?',
    'suan acik olan fynext projemi tara ve oneriler ver',
    'Şu an açık olan Fynext projemi tara ve öneriler ver',
    'Scan the current Fynext project and recommend improvements',
    'Bu projeyi tara ve oneriler ver',
    'Create a React component',
    'Run the test suite',
    'Check why the tests are failing',
    'Why are the tests failing?',
    'Can you explain how to fix this bug?',
    'Bu projede giri\u015f nas\u0131l \u00e7al\u0131\u015f\u0131yor?',
    'Search the web for current Ollama docs'
  ]) {
    assert.equal(requiresToolFollowThrough(request), true, request);
  }
});

test('does not require tools for informational questions', () => {
  for (const request of [
    'Nas\u0131l test yaz\u0131l\u0131r?',
    'How do I add an environment variable?',
    'Explain how to fix a bug',
    'Should I add tests for this?',
    'What is a React component?'
  ]) {
    assert.equal(requiresToolFollowThrough(request), false, request);
  }
});
