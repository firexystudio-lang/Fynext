'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const api = require('../../src/ai/api');
const config = require('../../src/config');
const setup = require('../../src/setup');

async function startServer(t, handler) {
  const server = http.createServer(handler);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  }));
  return `http://127.0.0.1:${server.address().port}`;
}

function sse(events) {
  return events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

const TOOLS = [{
  type: 'function',
  function: {
    name: 'fs_read',
    description: 'Read a file',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'File path' } },
      required: ['path']
    }
  }
}];

const MESSAGES = [
  { role: 'system', content: 'You are a coding agent.' },
  { role: 'user', content: 'Inspect README.md' },
  {
    role: 'assistant',
    content: '',
    tool_calls: [{ id: 'call_prev', function: { name: 'fs_list', arguments: { path: '.' } } }]
  },
  { role: 'tool', tool_name: 'fs_list', tool_call_id: 'call_prev', content: 'README.md' },
  { role: 'user', content: 'Read it.' }
];

test('resolves API keys from saved settings before environment variables', () => {
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'env-openai-key';
  try {
    assert.equal(api.resolveApiKey({ provider: 'openai' }), 'env-openai-key');
    assert.equal(
      api.resolveApiKey({ provider: 'openai', apiKeys: { openai: 'saved-openai-key' } }),
      'saved-openai-key'
    );
    assert.equal(api.resolveApiKey({ provider: 'anthropic' }), '');
    assert.equal(api.defaultModel('anthropic'), 'claude-sonnet-4-5');
    assert.equal(api.normalizeProviderId('claude'), 'anthropic');
    assert.equal(api.normalizeProviderId('google'), 'gemini');
    assert.equal(api.maskKey('sk-1234567890abcdef'), 'sk-12…cdef');
    assert.equal(
      api.resolveBaseUrl({ provider: 'openai', apiBaseUrl: 'http://127.0.0.1:1234/v1/' }),
      'http://127.0.0.1:1234/v1'
    );
    assert.equal(
      api.resolveBaseUrl({ provider: 'anthropic', apiBaseUrl: 'http://127.0.0.1:1234/v1' }),
      'https://api.anthropic.com/v1'
    );
    assert.equal(
      api.resolveBaseUrl({
        provider: 'anthropic',
        apiBaseUrl: 'http://127.0.0.1:1234/v1',
        apiBaseUrls: { anthropic: 'https://proxy.example.com/v1' }
      }),
      'https://proxy.example.com/v1'
    );
  } finally {
    if (previous == null) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous;
  }
});

test('OpenAI-compatible streaming supports text, tool calls, and usage', async (t) => {
  let requestBody;
  let authorization;
  const baseUrl = await startServer(t, async (request, response) => {
    authorization = request.headers.authorization;
    requestBody = JSON.parse(await readBody(request));
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    response.write(sse([
      { choices: [{ delta: { content: 'Hel' } }] },
      { choices: [{ delta: { content: 'lo' } }] },
      {
        choices: [{
          delta: {
            tool_calls: [{
              index: 0,
              id: 'call_1',
              function: { name: 'fs_read', arguments: '{"path":' }
            }]
          }
        }]
      },
      {
        choices: [{
          delta: {
            tool_calls: [{ index: 0, function: { arguments: '"README.md"}' } }]
          }
        }]
      },
      {
        choices: [{ delta: {}, finish_reason: 'tool_calls' }],
        usage: { prompt_tokens: 12, completion_tokens: 6 }
      }
    ]));
    response.end('data: [DONE]\n\n');
  });

  const deltas = [];
  const result = await api.chat({
    provider: 'openai',
    model: 'gpt-test',
    apiBaseUrl: baseUrl,
    apiKeys: { openai: 'test-key' },
    temperature: 0,
    maxNewTokens: 256,
    requestTimeoutSec: 30
  }, MESSAGES, TOOLS, (delta) => deltas.push(delta));

  assert.equal(authorization, 'Bearer test-key');
  assert.equal(requestBody.stream, true);
  assert.deepEqual(requestBody.stream_options, { include_usage: true });
  assert.equal(requestBody.tools[0].function.name, 'fs_read');
  assert.equal(requestBody.tool_choice, 'auto');
  assert.equal(requestBody.messages.at(-2).role, 'tool');
  assert.equal(requestBody.messages.at(-2).tool_call_id, 'call_prev');
  assert.equal(requestBody.messages.at(-1).content, 'Read it.');
  assert.deepEqual(deltas, ['Hel', 'lo']);
  assert.equal(result.content, '');
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0].name, 'fs_read');
  assert.deepEqual(result.toolCalls[0].arguments, { path: 'README.md' });
  assert.equal(result.stats.promptTokens, 12);
  assert.equal(result.stats.outputTokens, 6);
});

test('OpenAI-compatible requests return readable key and quota errors', async (t) => {
  const baseUrl = await startServer(t, (_request, response) => {
    response.writeHead(401, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: { message: 'Incorrect API key provided' } }));
  });

  await assert.rejects(
    api.chat({
      provider: 'openai',
      model: 'gpt-test',
      apiBaseUrl: baseUrl,
      apiKeys: { openai: 'bad-key' },
      maxNewTokens: 256
    }, [{ role: 'user', content: 'Hi' }], []),
    /OpenAI HTTP 401.*Incorrect API key provided.*invalid/i
  );
});

test('OpenAI-compatible servers that reject optional fields are retried once', async (t) => {
  const bodies = [];
  const baseUrl = await startServer(t, async (request, response) => {
    const body = JSON.parse(await readBody(request));
    bodies.push(body);
    if (body.stream_options || body.tool_choice === 'required') {
      response.writeHead(400, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: { message: 'Unsupported field: stream_options' } }));
      return;
    }
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    response.write(sse([
      { choices: [{ delta: { content: 'ok' } }] },
      {
        choices: [{ delta: {}, finish_reason: 'stop' }],
        usage: { prompt_tokens: 3, completion_tokens: 1 }
      }
    ]));
    response.end('data: [DONE]\n\n');
  });

  const result = await api.chat({
    provider: 'openai',
    model: 'gpt-test',
    apiBaseUrl: baseUrl,
    apiKeys: { openai: 'test-key' },
    maxNewTokens: 256
  }, [{ role: 'user', content: 'Hi' }], TOOLS, null, { forceTool: true });

  assert.equal(bodies.length, 2);
  assert.deepEqual(bodies[0].stream_options, { include_usage: true });
  assert.equal(bodies[0].tool_choice, 'required');
  assert.equal(bodies[1].stream_options, undefined);
  assert.equal(bodies[1].tool_choice, 'auto');
  assert.equal(result.content, 'ok');
  assert.equal(result.stats.promptTokens, 3);
});

test('Anthropic streaming maps tools, system prompts, and tool results', async (t) => {
  let requestBody;
  let keyHeader;
  let versionHeader;
  const baseUrl = await startServer(t, async (request, response) => {
    keyHeader = request.headers['x-api-key'];
    versionHeader = request.headers['anthropic-version'];
    requestBody = JSON.parse(await readBody(request));
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    response.write([
      'data: {"type":"message_start","message":{"usage":{"input_tokens":15}}}',
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Checking."}}',
      'data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_1","name":"fs_read"}}',
      'data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\\"path\\":\\"README.md\\"}"}}',
      'data: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":8}}',
      ''
    ].join('\n\n'));
    response.end();
  });

  const result = await api.chat({
    provider: 'anthropic',
    model: 'claude-test',
    apiBaseUrls: { anthropic: baseUrl },
    apiKeys: { anthropic: 'anthropic-key' },
    maxNewTokens: 512,
    temperature: 0.2
  }, MESSAGES, TOOLS);

  assert.equal(keyHeader, 'anthropic-key');
  assert.equal(versionHeader, '2023-06-01');
  assert.equal(requestBody.system, 'You are a coding agent.');
  assert.equal(requestBody.tools[0].name, 'fs_read');
  assert.equal(requestBody.tools[0].input_schema.required[0], 'path');
  assert.equal(requestBody.tool_choice.type, 'auto');
  const toolResult = requestBody.messages.find((message) =>
    message.role === 'user' && message.content.some((block) => block.type === 'tool_result')
  );
  assert.equal(toolResult.content[0].tool_use_id, 'call_prev');
  assert.equal(result.toolCalls[0].name, 'fs_read');
  assert.deepEqual(result.toolCalls[0].arguments, { path: 'README.md' });
  assert.equal(result.stats.promptTokens, 15);
  assert.equal(result.stats.outputTokens, 8);
});

test('Gemini streaming maps text, function calls, and generation config', async (t) => {
  let requestBody;
  let apiKeyHeader;
  let requestUrl;
  const baseUrl = await startServer(t, async (request, response) => {
    requestUrl = request.url;
    apiKeyHeader = request.headers['x-goog-api-key'];
    requestBody = JSON.parse(await readBody(request));
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    response.write(sse([
      { candidates: [{ content: { parts: [{ text: 'Mer' }] } }] },
      { candidates: [{ content: { parts: [{ text: 'haba' }] } }] },
      {
        candidates: [{
          content: {
            parts: [{ functionCall: { name: 'fs_read', args: { path: 'README.md' } } }]
          }
        }],
        usageMetadata: { promptTokenCount: 9, candidatesTokenCount: 4 }
      }
    ]));
    response.end();
  });

  const deltas = [];
  const result = await api.chat({
    provider: 'gemini',
    model: 'gemini-test',
    apiBaseUrls: { gemini: baseUrl },
    apiKeys: { gemini: 'gemini-key' },
    maxNewTokens: 512
  }, MESSAGES, TOOLS, (delta) => deltas.push(delta));

  assert.equal(apiKeyHeader, 'gemini-key');
  assert.match(requestUrl, /\/models\/gemini-test:streamGenerateContent\?alt=sse/);
  assert.equal(requestBody.systemInstruction.parts[0].text, 'You are a coding agent.');
  assert.equal(requestBody.tools[0].functionDeclarations[0].name, 'fs_read');
  assert.equal(requestBody.generationConfig.maxOutputTokens, 512);
  assert.deepEqual(deltas, ['Mer', 'haba']);
  assert.equal(result.toolCalls[0].name, 'fs_read');
  assert.deepEqual(result.toolCalls[0].arguments, { path: 'README.md' });
  assert.equal(result.stats.promptTokens, 9);
  assert.equal(result.stats.outputTokens, 4);
});

test('startup warns about a missing cloud API key instead of failing', async () => {
  const warnings = [];
  const models = await setup.ensureReady({
    provider: 'openai',
    model: 'gpt-4o-mini',
    apiKeys: {}
  }, {
    log: () => {},
    warn: (line) => warnings.push(line)
  });

  assert.deepEqual(models, []);
  assert.match(warnings.join('\n'), /OpenAI API key is not set/);
});

test('startup keeps running with an existing Ollama model list but no configured model', async (t) => {
  let pullRequests = 0;
  const baseUrl = await startServer(t, (request, response) => {
    if (request.method === 'POST' && request.url === '/api/pull') {
      pullRequests += 1;
      response.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
      response.end('{"status":"success"}\n');
      return;
    }
    if (request.url === '/api/tags') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ models: [{ name: 'other:latest' }] }));
      return;
    }
    response.writeHead(404);
    response.end();
  });

  const warnings = [];
  const models = await setup.ensureReady({
    provider: 'ollama',
    ollamaUrl: baseUrl,
    model: 'missing-model',
    autoPullModel: false
  }, {
    log: () => {},
    warn: (line) => warnings.push(line)
  });

  assert.deepEqual(models, ['other:latest']);
  assert.match(warnings.join('\n'), /missing-model.*not installed/);
  assert.equal(pullRequests, 0);
});

test('saved API keys use owner-only permissions when the platform supports it', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fynext-settings-test-'));
  const previous = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = directory;
  t.after(() => {
    if (previous == null) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = previous;
    fs.rmSync(directory, { recursive: true, force: true });
  });

  config.saveSettingsPatch({ apiKeys: { openai: 'secret-key' } });
  const file = path.join(directory, 'fynext', 'settings.json');
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(saved.apiKeys.openai, 'secret-key');
  if (process.platform !== 'win32') {
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  }
});

test('startup does not fail when Ollama is unreachable and no model exists', async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async () => {
    throw new Error('connect ECONNREFUSED');
  };
  t.after(() => {
    global.fetch = originalFetch;
  });

  const warnings = [];
  const models = await setup.ensureReady({
    provider: 'ollama',
    ollamaUrl: 'http://127.0.0.1:9',
    model: 'missing-model',
    autoPullModel: false
  }, {
    log: () => {},
    warn: (line) => warnings.push(line),
    waitSeconds: 0.1
  });

  assert.deepEqual(models, []);
  assert.match(warnings.join('\n'), /Ollama is not running|Cannot reach Ollama/);
});
