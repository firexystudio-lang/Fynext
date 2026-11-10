'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const lumen = require('../../src/lumen');
const setup = require('../../src/setup');
const llm = require('../../src/ai/llm');

async function createTempDir(t) {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'fynext-lumen-test-'));
  t.after(() => fs.promises.rm(directory, { recursive: true, force: true }));
  return directory;
}

async function startServer(t, handler) {
  const server = http.createServer(handler);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve, reject) => {
    server.close((err) => err ? reject(err) : resolve());
  }));
  return `http://127.0.0.1:${server.address().port}/model.gguf`;
}

function fixtureModel(url, data, sha256) {
  return {
    id: 'fixture',
    file: 'fixture.gguf',
    size: data.length,
    sha256: sha256 || crypto.createHash('sha256').update(data).digest('hex'),
    url
  };
}

test('builds model history while preserving tool calls and results', () => {
  const history = lumen.buildHistory([
    { role: 'system', content: 'System instructions' },
    { role: 'user', content: 'Inspect the project' },
    {
      role: 'assistant',
      content: '',
      tool_calls: [{ function: { name: 'fs_read', arguments: { path: 'README.md' } } }]
    },
    { role: 'tool', tool_name: 'fs_read', content: 'README contents' },
    { role: 'assistant', content: 'The project is a CLI.' },
    { role: 'user', content: 'Summarize it' }
  ]);

  assert.equal(history.systemPrompt, 'System instructions');
  assert.equal(history.prompt, 'Summarize it');
  assert.deepEqual(history.history.map((item) => item.type), ['system', 'user', 'model']);
  assert.equal(history.history[0].text, 'System instructions');
  assert.deepEqual(history.history[2].response[0], {
    type: 'functionCall',
    id: undefined,
    name: 'fs_read',
    params: { path: 'README.md' },
    result: 'README contents'
  });
  assert.equal(history.history[2].response[1], 'The project is a CLI.');
});

test('uses Gemma 4 E2B as the default model while retaining Qwen options', () => {
  assert.equal(lumen.DEFAULT_MODEL_ID, 'gemma-4-e2b-it-q4_0');
  assert.ok(lumen.getModel('qwen2.5-coder-1.5b-q4km'));
  assert.equal(lumen.getModel(lumen.DEFAULT_MODEL_ID).size, 2841481184);
});

test('continues from native tool results instead of repeating the original user prompt', () => {
  const history = lumen.buildHistory([
    { role: 'system', content: 'System instructions' },
    { role: 'user', content: 'Inspect the project' },
    {
      role: 'assistant',
      content: '',
      tool_calls: [{ id: 'call-1', function: { name: 'fs_read', arguments: { path: 'README.md' } } }]
    },
    { role: 'tool', tool_name: 'fs_read', tool_call_id: 'call-1', content: 'README contents' }
  ]);

  assert.equal(history.prompt, 'Continue the task using the tool results above.');
  assert.deepEqual(history.history.map((item) => item.type), ['system', 'user', 'model']);
  assert.deepEqual(history.history[2].response[0], {
    type: 'functionCall',
    id: 'call-1',
    name: 'fs_read',
    params: { path: 'README.md' },
    result: 'README contents'
  });
});

test('builds a constrained schema that forces one available tool call', () => {
  const schema = lumen.forcedToolSchema([
    { function: { name: 'fs_read' } },
    { function: { name: 'fs_write' } }
  ]);

  assert.deepEqual(schema.properties.name.enum, ['fs_read', 'fs_write']);
  assert.equal(schema.properties.arguments.type, 'object');
  assert.equal(schema.properties.arguments.additionalProperties, true);
  assert.deepEqual(schema.required, ['name', 'arguments']);
  assert.equal(schema.additionalProperties, false);
});

test('captures native Lumen function calls without running tool handlers', () => {
  const calls = [];
  const functions = lumen.createNativeFunctions([{
    type: 'function',
    function: {
      name: 'fs_read',
      description: 'Read a file',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path']
      }
    }
  }], calls);

  assert.equal(functions.fs_read.description, 'Read a file');
  assert.deepEqual(functions.fs_read.params.required, ['path']);
  assert.throws(() => functions.fs_read.handler({ path: 'README.md' }), {
    code: 'FYNEXT_TOOL_CALL_CAPTURED'
  });
  assert.deepEqual(calls, [{ name: 'fs_read', arguments: { path: 'README.md' } }]);
});

test('uses native function instructions instead of a competing XML tool format', () => {
  const tools = [{
    function: {
      name: 'fs_read',
      description: 'Read a file',
      parameters: { type: 'object', properties: { path: { type: 'string' } } }
    }
  }];
  const messages = llm.withNativeToolInstructions(
    [{ role: 'system', content: 'Base prompt' }],
    tools,
    true
  );

  assert.match(messages[0].content, /You must call one available function now/);
  assert.match(messages[0].content, /fs_read/);
  assert.doesNotMatch(messages[0].content, /<tool>/);
});

test('downloads a pinned GGUF model and reports byte progress', async (t) => {
  const directory = await createTempDir(t);
  const data = Buffer.concat([Buffer.from('GGUF'), Buffer.from('small model fixture')]);
  const url = await startServer(t, (_request, response) => {
    response.writeHead(200, { 'Content-Length': data.length });
    response.end(data);
  });
  const model = fixtureModel(url, data);
  const updates = [];

  const file = await lumen.downloadModel({}, model.id, (progress) => updates.push(progress), {
    catalog: [model],
    modelDirectory: directory
  });

  assert.equal(await fs.promises.readFile(file).then((value) => value.equals(data)), true);
  assert.equal(await lumen.isModelInstalled({ lumenModelDir: directory }, model), true);
  assert.equal(updates.at(-1).completed, data.length);
});

test('resumes an interrupted model download using a verified byte range', async (t) => {
  const directory = await createTempDir(t);
  const data = Buffer.concat([Buffer.from('GGUF'), Buffer.alloc(96, 7)]);
  const offset = 37;
  const url = await startServer(t, (request, response) => {
    assert.equal(request.headers.range, `bytes=${offset}-`);
    response.writeHead(206, {
      'Content-Length': data.length - offset,
      'Content-Range': `bytes ${offset}-${data.length - 1}/${data.length}`
    });
    response.end(data.subarray(offset));
  });
  const model = fixtureModel(url, data);
  await fs.promises.mkdir(directory, { recursive: true });
  await fs.promises.writeFile(path.join(directory, 'fixture.gguf.partial'), data.subarray(0, offset));

  const file = await lumen.downloadModel({}, model.id, null, {
    catalog: [model],
    modelDirectory: directory
  });

  assert.equal(await fs.promises.readFile(file).then((value) => value.equals(data)), true);
});

test('rejects a model whose downloaded bytes fail the catalog hash', async (t) => {
  const directory = await createTempDir(t);
  const data = Buffer.concat([Buffer.from('GGUF'), Buffer.from('changed')]);
  const url = await startServer(t, (_request, response) => response.end(data));
  const model = fixtureModel(url, data, '0'.repeat(64));

  await assert.rejects(
    lumen.downloadModel({}, model.id, null, { catalog: [model], modelDirectory: directory }),
    /SHA-256 integrity check/
  );
  await assert.rejects(fs.promises.access(path.join(directory, model.file)));
});

test('rejects unknown catalog IDs instead of downloading arbitrary URLs', async () => {
  await assert.rejects(lumen.downloadModel({}, 'unknown-model'), /Unknown or invalid Lumen model/);
});

test('Lumen startup reports a missing model without contacting Ollama', async (t) => {
  const directory = await createTempDir(t);
  const messages = [];

  const installed = await setup.ensureReady({
    provider: 'lumen',
    model: lumen.DEFAULT_MODEL_ID,
    lumenModelDir: directory
  }, {
    log: (message) => messages.push(message),
    tty: false
  });

  assert.deepEqual(installed, []);
  assert.match(messages.join('\n'), /\/model gemma-4-e2b-it-q4_0/);
});
