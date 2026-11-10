'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  requiresToolFollowThrough,
  requiresWebSearch,
  promisesWebSearch,
  requiresImplementation
} = require('../../src/agent/task-intent');

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

test('explicit web searches require a tool call in either mode', () => {
  for (const request of [
    'web araması yap',
    'İnternette güncel Ollama belgelerini araştır',
    'Search the web for current Ollama docs',
    'Look up the latest browser API guidance online'
  ]) {
    assert.equal(requiresWebSearch(request), true, request);
    assert.equal(requiresToolFollowThrough(request), true, request);
  }

  assert.equal(requiresWebSearch('Explain what web search is.'), false);
});

test('requires implementation work for direct code changes', () => {
  for (const request of [
    'Bu hatayı düzelt',
    'Fix this bug',
    'Create a React component',
    'Add a login page',
    'Giriş ekranı ekle'
  ]) {
    assert.equal(requiresImplementation(request), true, request);
  }
});

test('does not require implementation work for inspection-only or informational requests', () => {
  for (const request of [
    'Nasıl test yazılır?',
    'How do I add an environment variable?',
    'Explain how to fix a bug',
    'Should I add tests for this?',
    'What is a React component?',
    'Projeyi inceleyebilir misin?',
    'Scan the current Fynext project and recommend improvements'
  ]) {
    assert.equal(requiresImplementation(request), false, request);
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

test('detects unfulfilled web search promises in assistant text', () => {
  assert.equal(promisesWebSearch('Bunun için web araması yapacağım ve bilgi toplayacağım.'), true);
  assert.equal(promisesWebSearch('I will search the web for the latest documentation.'), true);
  assert.equal(promisesWebSearch('Searching the web for modern Next.js 15 features...'), true);
  assert.equal(promisesWebSearch('İnternette araştırma yapıp döneceğim.'), true);
  assert.equal(promisesWebSearch('Here is the final answer with complete code.'), false);
});
