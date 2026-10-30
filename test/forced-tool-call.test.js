'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const llm = require('../src/ai/llm');
const tools = require('../src/tools/tools');

test('forced tool-call schema limits output to available tools', () => {
  const schema = llm.toolCallSchema(tools.definitionsForMode('build'));
  assert.equal(schema.type, 'object');
  assert.ok(schema.properties.name.enum.includes('fs_list'));
  assert.ok(schema.properties.name.enum.includes('fs_write'));
  assert.deepEqual(schema.required, ['name', 'arguments']);
});

test('a required tool call retries in constrained JSON mode when native tools are skipped', async () => {
  const originalFetch = global.fetch;
  const requests = [];
  global.fetch = async (url, options = {}) => {
    if (String(url).endsWith('/api/show')) {
      return new Response(JSON.stringify({ capabilities: ['tools'] }), { status: 200 });
    }
    const body = JSON.parse(options.body);
    requests.push(body);
    if (requests.length === 1) {
      const line = JSON.stringify({ message: { role: 'assistant', content: 'You can inspect the files.' }, done: true });
      return new Response(line + '\n', { status: 200 });
    }
    assert.ok(body.format, 'fallback request should use a constrained output schema');
    assert.equal(body.tools, undefined);
    const line = JSON.stringify({ message: { role: 'assistant', content: '{"name":"fs_list","arguments":{"path":"."}}' }, done: true });
    return new Response(line + '\n', { status: 200 });
  };

  try {
    const result = await llm.chat(
      { model: 'test-tool-fallback', ollamaUrl: 'http://test.local', numCtx: 8192, maxNewTokens: 256, requestTimeoutSec: 1 },
      [{ role: 'system', content: 'Use tools.' }, { role: 'user', content: 'Inspect this project.' }],
      tools.definitionsForMode('build'),
      null,
      { forceTool: true }
    );
    assert.equal(requests.length, 2);
    assert.equal(result.toolCalls.length, 1);
    assert.equal(result.toolCalls[0].name, 'fs_list');
    assert.deepEqual(result.toolCalls[0].arguments, { path: '.' });
  } finally {
    global.fetch = originalFetch;
  }
});
