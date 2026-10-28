'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { requiresToolFollowThrough } = require('../src/task-intent');

test('requires tools for direct implementation and maintenance requests', () => {
  for (const request of [
    'Bu hatayı düzelt',
    'Bu hatayı düzeltir misin?',
    'Projeye giriş ekranı ekle',
    'Projeye giriş ekranı ekleyebilir misin?',
    'Testleri çalıştırabilir misin?',
    'Create a React component',
    'Run the test suite',
    'Check why the tests are failing',
    'Why are the tests failing?',
    'Can you explain how to fix this bug?',
    'Bu projede giriş nasıl çalışıyor?',
    'Search the web for current Ollama docs'
  ]) {
    assert.equal(requiresToolFollowThrough(request), true, request);
  }
});

test('does not require tools for informational questions', () => {
  for (const request of [
    'Nasıl test yazılır?',
    'How do I add an environment variable?',
    'Explain how to fix a bug',
    'Should I add tests for this?',
    'What is a React component?'
  ]) {
    assert.equal(requiresToolFollowThrough(request), false, request);
  }
});
