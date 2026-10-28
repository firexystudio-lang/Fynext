'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { extractToolCalls } = require('../src/llm');
const tools = require('../src/tools');

test('parses a hallucinated filesystem tool call instead of showing it as plain text', () => {
  const calls = extractToolCalls(
    '{"name":"fs_create","arguments":{"path":"yeni_dosya.txt"}}',
    ['fs_list', 'fs_read']
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'fs_create');
  assert.deepEqual(calls[0].arguments, { path: 'yeni_dosya.txt' });
});

test('does not interpret unrelated JSON as a tool call', () => {
  assert.deepEqual(
    extractToolCalls('{"name":"custom_action","arguments":{}}', ['fs_list']),
    []
  );
});

test('PLAN mode rejects both real and hallucinated write tools before dispatch', async () => {
  for (const name of ['fs_write', 'fs_create']) {
    await assert.rejects(
      tools.run({}, name, { path: 'yeni_dosya.txt', content: 'test' }, 'plan'),
      /PLAN modunda bu araca izin verilmiyor/
    );
  }
});
