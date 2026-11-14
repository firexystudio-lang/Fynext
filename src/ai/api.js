'use strict';

// Cloud providers that use an API key. Each provider exposes either an
// OpenAI-compatible chat API, the Anthropic Messages API, or the Gemini API.
const PROVIDERS = Object.freeze({
  openai: {
    id: 'openai',
    label: 'OpenAI',
    protocol: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    envKeys: ['OPENAI_API_KEY'],
    defaultModel: 'gpt-4o-mini',
    models: ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4o', 'gpt-4o-mini', 'o4-mini', 'o3']
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic',
    protocol: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    envKeys: ['ANTHROPIC_API_KEY'],
    defaultModel: 'claude-sonnet-4-5',
    models: ['claude-sonnet-4-5', 'claude-opus-4-1', 'claude-haiku-4-5', 'claude-3-7-sonnet-latest']
  },
  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    protocol: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    envKeys: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
    defaultModel: 'gemini-2.5-pro',
    models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash']
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    protocol: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    envKeys: ['OPENROUTER_API_KEY'],
    defaultModel: 'openai/gpt-4o-mini',
    models: ['openai/gpt-4o-mini', 'anthropic/claude-sonnet-4', 'google/gemini-2.5-pro']
  },
  groq: {
    id: 'groq',
    label: 'Groq',
    protocol: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    envKeys: ['GROQ_API_KEY'],
    defaultModel: 'llama-3.3-70b-versatile',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'qwen-2.5-coder-32b']
  },
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    protocol: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    envKeys: ['DEEPSEEK_API_KEY'],
    defaultModel: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-reasoner']
  },
  mistral: {
    id: 'mistral',
    label: 'Mistral',
    protocol: 'openai',
    baseUrl: 'https://api.mistral.ai/v1',
    envKeys: ['MISTRAL_API_KEY'],
    defaultModel: 'mistral-large-latest',
    models: ['mistral-large-latest', 'mistral-medium-latest', 'codestral-latest', 'devstral-medium-latest']
  }
});

const ALIASES = Object.freeze({
  claude: 'anthropic',
  google: 'gemini',
  'google-gemini': 'gemini',
  'open-router': 'openrouter',
  'openai-compatible': 'openai',
  compatible: 'openai',
  custom: 'openai'
});

const ANTHROPIC_VERSION = '2023-06-01';

// Providers that accept `stream_options.include_usage` and report token usage
// in the final streaming chunk. Others either ignore it or reject the field.
const USAGE_STREAM_PROVIDERS = new Set(['openai', 'openrouter', 'groq', 'deepseek']);

function normalizeProviderId(value) {
  const id = String(value || '').trim().toLowerCase();
  return ALIASES[id] || id;
}

function getProvider(provider) {
  return PROVIDERS[normalizeProviderId(provider)] || null;
}

function isApiProvider(provider) {
  return !!getProvider(provider);
}

function providerIds() {
  return Object.keys(PROVIDERS);
}

function defaultModel(provider) {
  const info = getProvider(provider);
  return info ? info.defaultModel : '';
}

function resolveApiKey(cfg) {
  const provider = normalizeProviderId(cfg && cfg.provider);
  const info = PROVIDERS[provider];
  if (!info) return '';
  const keys = (cfg && cfg.apiKeys) || {};
  const stored = keys[provider];
  if (stored && String(stored).trim()) return String(stored).trim();
  if (cfg && cfg.apiKey && String(cfg.apiKey).trim()) return String(cfg.apiKey).trim();
  for (const name of info.envKeys) {
    const value = process.env[name];
    if (value && String(value).trim()) return String(value).trim();
  }
  return '';
}

function apiKeySource(cfg) {
  const provider = normalizeProviderId(cfg && cfg.provider);
  const info = PROVIDERS[provider];
  if (!info) return { source: 'none', env: '' };
  const keys = (cfg && cfg.apiKeys) || {};
  if (keys[provider] && String(keys[provider]).trim()) {
    return { source: 'settings', env: '' };
  }
  if (cfg && cfg.apiKey && String(cfg.apiKey).trim()) {
    return { source: 'session', env: '' };
  }
  for (const name of info.envKeys) {
    if (process.env[name] && String(process.env[name]).trim()) {
      return { source: 'environment', env: name };
    }
  }
  return { source: 'none', env: info.envKeys[0] || '' };
}

function maskKey(key) {
  const value = String(key || '');
  if (!value) return '';
  if (value.length <= 10) return value.slice(0, 2) + '…' + value.slice(-2);
  return value.slice(0, 5) + '…' + value.slice(-4);
}

function resolveBaseUrl(cfg) {
  const provider = normalizeProviderId(cfg && cfg.provider);
  const info = PROVIDERS[provider];
  if (!info) return '';
  const perProvider = (cfg && cfg.apiBaseUrls && cfg.apiBaseUrls[provider]) || '';
  // The plain `apiBaseUrl` setting targets OpenAI-compatible endpoints, so it
  // must not leak into Anthropic or Gemini when the user switches providers.
  const global = info.protocol === 'openai' ? (cfg && cfg.apiBaseUrl) || '' : '';
  const override = perProvider || global;
  return String(override || info.baseUrl).replace(/\/+$/, '');
}

function missingKeyMessage(cfg) {
  const info = getProvider(cfg && cfg.provider);
  const label = info ? info.label : String((cfg && cfg.provider) || 'Cloud');
  const env = info && info.envKeys[0] ? info.envKeys[0] : '';
  return `${label} API key is not set. Run /key <key>${env ? ` or set ${env}` : ''}.`;
}

function parseArguments(value) {
  if (value == null || value === '') return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (_) {
      return {};
    }
  }
  return {};
}

function normalizeToolCalls(calls) {
  if (!Array.isArray(calls)) return [];
  return calls.map((call, index) => {
    const fn = call && call.function ? call.function : call || {};
    return {
      id: fn.id || (call && call.id) || `call_${index}`,
      name: fn.name || (call && call.name) || '',
      arguments: parseArguments(fn.arguments != null ? fn.arguments : call && call.arguments)
    };
  }).filter((call) => call.name);
}

function textOf(content) {
  if (content == null) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((part) => (part && typeof part.text === 'string' ? part.text : '')).join('');
  }
  return String(content);
}

function makeSignal(cfg, timeoutMs) {
  const seconds = Math.max(180, (Number(cfg.requestTimeoutSec) || 30) * 60);
  const timeout = AbortSignal.timeout(timeoutMs || seconds * 1000);
  if (cfg.abortSignal) return AbortSignal.any([timeout, cfg.abortSignal]);
  return timeout;
}

async function fetchChecked(cfg, info, url, options, signal, timeoutMs) {
  let res;
  try {
    res = await fetch(url, Object.assign({}, options, {
      signal: signal || makeSignal(cfg, timeoutMs)
    }));
  } catch (err) {
    if (cfg.abortSignal && cfg.abortSignal.aborted) throw new Error('Request was cancelled.');
    if (err && (err.name === 'TimeoutError' || /timeout/i.test(String(err.message || '')))) {
      throw new Error(`${info.label} response timed out.`);
    }
    throw new Error(`Could not reach ${info.label}: ${err && err.message ? err.message : err}`);
  }
  if (!res.ok) throw await buildHttpError(info, res);
  return res;
}

async function buildHttpError(info, res) {
  let text = '';
  try {
    text = await res.text();
  } catch (_) {
    text = '';
  }
  let detail = text;
  try {
    const json = JSON.parse(text);
    const error = json && json.error;
    detail = (error && (error.message || error.type)) || (json && json.message) || text;
  } catch (_) {
    /* Keep the raw response text. */
  }
  detail = String(detail || '').replace(/\s+/g, ' ').trim().slice(0, 500);
  let hint = '';
  if (res.status === 401 || res.status === 403) {
    hint = 'The API key is missing, invalid, or does not have access.';
  } else if (res.status === 404) {
    hint = 'The model name may be wrong or unavailable with this key.';
  } else if (res.status === 409) {
    hint = 'The request conflicts with the provider state.';
  } else if (res.status === 429) {
    hint = 'Rate limit or quota exceeded.';
  } else if (res.status >= 500) {
    hint = 'The provider is temporarily unavailable.';
  }
  const pieces = [`${info.label} HTTP ${res.status}`];
  if (detail) pieces.push(detail);
  if (hint) pieces.push(hint);
  return new Error(pieces.join(': '));
}

async function* readSSE(body) {
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    let index;
    while ((index = buffer.indexOf('\n')) >= 0) {
      let line = buffer.slice(0, index);
      buffer = buffer.slice(index + 1);
      if (line.endsWith('\r')) line = line.slice(0, -1);
      if (line.startsWith('data:')) yield line.slice(5).trimStart();
    }
  }
  const rest = buffer.trim();
  if (rest.startsWith('data:')) yield rest.slice(5).trimStart();
}

function isEventStream(res) {
  const type = String((res.headers && res.headers.get && res.headers.get('content-type')) || '');
  return /text\/event-stream/i.test(type);
}

function statsFor(model, startedAt, promptTokens, outputTokens) {
  const stats = {
    model,
    promptTokens: Number(promptTokens) || 0,
    outputTokens: Number(outputTokens) || 0
  };
  stats.totalMs = Date.now() - startedAt;
  if (stats.outputTokens && stats.totalMs > 0) {
    stats.tokensPerMinute = Math.round((stats.outputTokens * 60000) / stats.totalMs);
  }
  return stats;
}

// ---------------------------------------------------------------------------
// OpenAI-compatible providers (OpenAI, OpenRouter, Groq, DeepSeek, Mistral,
// and any custom server that implements /chat/completions).
// ---------------------------------------------------------------------------

function toOpenAIMessages(messages) {
  const out = [];
  for (const message of Array.isArray(messages) ? messages : []) {
    if (!message || !message.role) continue;
    if (message.role === 'tool') {
      out.push({
        role: 'tool',
        tool_call_id: message.tool_call_id || message.tool_name || 'tool',
        content: textOf(message.content)
      });
      continue;
    }
    if (message.role === 'assistant') {
      const entry = { role: 'assistant', content: textOf(message.content) };
      const calls = normalizeToolCalls(message.tool_calls);
      if (calls.length) {
        entry.tool_calls = calls.map((call) => ({
          id: call.id,
          type: 'function',
          function: {
            name: call.name,
            arguments: JSON.stringify(call.arguments || {})
          }
        }));
      }
      if (!entry.content && !entry.tool_calls) continue;
      out.push(entry);
      continue;
    }
    const content = textOf(message.content);
    if (!content) continue;
    out.push({ role: message.role, content });
  }
  return out;
}

function openAIToolDefinitions(tools) {
  return (Array.isArray(tools) ? tools : []).map((tool) => {
    if (tool && tool.type === 'function' && tool.function) return tool;
    const fn = tool && tool.function ? tool.function : tool;
    return { type: 'function', function: fn };
  }).filter((tool) => tool && tool.function && tool.function.name);
}

function maxTokensField(provider, model) {
  const id = String(model || '');
  if (provider === 'openai' && /^(?:o\d|gpt-5)/i.test(id)) return 'max_completion_tokens';
  return 'max_tokens';
}

function openAIToolCalls(entries) {
  return [...entries.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, call]) => ({
      id: call.id || `call_${Math.random().toString(36).slice(2, 10)}`,
      name: call.name,
      arguments: parseArguments(call.arguments)
    }))
    .filter((call) => call.name);
}

async function chatOpenAI(cfg, info, messages, tools, onDelta, chatOptions, key, signal) {
  const url = `${resolveBaseUrl(cfg)}/chat/completions`;
  const reasoningModel = info.id === 'openai' && /^(?:o\d|gpt-5)/i.test(String(cfg.model || ''));
  const body = {
    model: cfg.model,
    messages: toOpenAIMessages(messages),
    stream: true
  };
  if (!reasoningModel) {
    body.temperature = Number.isFinite(Number(cfg.temperature)) ? Number(cfg.temperature) : 0.2;
    if (Number.isFinite(Number(cfg.topP))) body.top_p = Number(cfg.topP);
  }
  body[maxTokensField(info.id, cfg.model)] = Math.max(256, Number(cfg.maxNewTokens) || 2048);

  const toolDefinitions = openAIToolDefinitions(tools);
  if (toolDefinitions.length) {
    body.tools = toolDefinitions;
    body.tool_choice = chatOptions.forceTool === true ? 'required' : 'auto';
  }
  if (USAGE_STREAM_PROVIDERS.has(info.id)) {
    body.stream_options = { include_usage: true };
  }

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${key}`
  };
  if (info.id === 'openrouter') {
    headers['HTTP-Referer'] = 'https://firexy.ct.ws';
    headers['X-Title'] = 'Fynext';
  }

  const startedAt = Date.now();
  const post = () => fetchChecked(cfg, info, url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  }, signal);
  let res;
  try {
    res = await post();
  } catch (err) {
    // Some OpenAI-compatible servers reject optional fields they do not
    // implement. Retry once with the optional fields removed, but never for
    // auth, rate-limit, or server errors.
    const shapeError = /HTTP 400|HTTP 422/.test(String(err.message));
    let changed = false;
    if (shapeError && body.stream_options) {
      delete body.stream_options;
      changed = true;
    }
    if (shapeError && body.tool_choice === 'required') {
      body.tool_choice = 'auto';
      changed = true;
    }
    if (!changed) throw err;
    res = await post();
  }

  let content = '';
  let promptTokens = 0;
  let outputTokens = 0;
  const toolEntries = new Map();

  if (!isEventStream(res)) {
    const data = await res.json();
    const choice = data && data.choices && data.choices[0];
    const message = (choice && choice.message) || {};
    content = textOf(message.content);
    if (content && onDelta) onDelta(content);
    const calls = normalizeToolCalls(message.tool_calls);
    if (data && data.usage) {
      promptTokens = data.usage.prompt_tokens || 0;
      outputTokens = data.usage.completion_tokens || 0;
    }
    return {
      content: calls.length ? '' : content,
      toolCalls: calls,
      stats: statsFor(cfg.model, startedAt, promptTokens, outputTokens)
    };
  }

  try {
    for await (const data of readSSE(res.body)) {
      if (!data || data === '[DONE]') continue;
      let json;
      try {
        json = JSON.parse(data);
      } catch (_) {
        continue;
      }
      if (json.error) {
        const message = json.error.message || json.error.type || JSON.stringify(json.error);
        throw new Error(`${info.label}: ${message}`);
      }
      if (json.usage) {
        promptTokens = json.usage.prompt_tokens || promptTokens;
        outputTokens = json.usage.completion_tokens || outputTokens;
      }
      const choice = json.choices && json.choices[0];
      if (!choice) continue;
      const delta = choice.delta || {};
      const piece = textOf(delta.content);
      if (piece) {
        content += piece;
        if (onDelta) onDelta(piece);
      }
      if (Array.isArray(delta.tool_calls)) {
        for (let index = 0; index < delta.tool_calls.length; index += 1) {
          const item = delta.tool_calls[index] || {};
          const slot = Number.isFinite(Number(item.index)) ? Number(item.index) : index;
          const existing = toolEntries.get(slot) || { id: '', name: '', arguments: '' };
          if (item.id) existing.id = item.id;
          if (item.function && item.function.name) existing.name += item.function.name;
          if (item.function && item.function.arguments) existing.arguments += item.function.arguments;
          toolEntries.set(slot, existing);
        }
      }
    }
  } catch (err) {
    if (cfg.abortSignal && cfg.abortSignal.aborted) throw new Error('Request was cancelled.');
    if (err && err.name === 'TimeoutError') throw new Error(`${info.label} response timed out.`);
    throw err;
  }

  const calls = openAIToolCalls(toolEntries);
  return {
    content: calls.length ? '' : content,
    toolCalls: calls,
    stats: statsFor(cfg.model, startedAt, promptTokens, outputTokens)
  };
}

// ---------------------------------------------------------------------------
// Anthropic Messages API
// ---------------------------------------------------------------------------

function toAnthropicRequest(messages, tools, forceTool, cfg) {
  const system = [];
  const output = [];
  const push = (role, blocks) => {
    if (!blocks.length) return;
    const last = output[output.length - 1];
    if (last && last.role === role) last.content.push(...blocks);
    else output.push({ role, content: blocks });
  };

  for (const message of Array.isArray(messages) ? messages : []) {
    if (!message || !message.role) continue;
    if (message.role === 'system') {
      const text = textOf(message.content);
      if (text) system.push(text);
      continue;
    }
    if (message.role === 'tool') {
      push('user', [{
        type: 'tool_result',
        tool_use_id: message.tool_call_id || message.tool_name || 'tool',
        content: textOf(message.content)
      }]);
      continue;
    }
    if (message.role === 'assistant') {
      const blocks = [];
      const text = textOf(message.content);
      if (text) blocks.push({ type: 'text', text });
      for (const call of normalizeToolCalls(message.tool_calls)) {
        blocks.push({
          type: 'tool_use',
          id: call.id,
          name: call.name,
          input: call.arguments || {}
        });
      }
      push('assistant', blocks);
      continue;
    }
    const text = textOf(message.content);
    if (text) push('user', [{ type: 'text', text }]);
  }

  if (output.length && output[0].role !== 'user') {
    output.unshift({ role: 'user', content: [{ type: 'text', text: 'Continue.' }] });
  }

  const body = {
    model: cfg.model,
    max_tokens: Math.max(256, Number(cfg.maxNewTokens) || 2048),
    messages: output,
    stream: true
  };
  if (system.length) body.system = system.join('\n\n');
  if (Number.isFinite(Number(cfg.temperature))) body.temperature = Number(cfg.temperature);
  if (Number.isFinite(Number(cfg.topP))) body.top_p = Number(cfg.topP);

  const definitions = (Array.isArray(tools) ? tools : []).map((tool) => {
    const fn = tool && tool.function ? tool.function : tool;
    if (!fn || !fn.name) return null;
    return {
      name: fn.name,
      description: fn.description || '',
      input_schema: fn.parameters || { type: 'object', properties: {} }
    };
  }).filter(Boolean);
  if (definitions.length) {
    body.tools = definitions;
    body.tool_choice = forceTool ? { type: 'any' } : { type: 'auto' };
  }
  return body;
}

async function chatAnthropic(cfg, info, messages, tools, onDelta, chatOptions, key, signal) {
  const url = `${resolveBaseUrl(cfg)}/messages`;
  const body = toAnthropicRequest(messages, tools, chatOptions.forceTool === true, cfg);
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': key,
    'anthropic-version': ANTHROPIC_VERSION
  };

  const startedAt = Date.now();
  const res = await fetchChecked(cfg, info, url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  }, signal);

  let content = '';
  let promptTokens = 0;
  let outputTokens = 0;
  const toolBlocks = new Map();

  if (!isEventStream(res)) {
    const data = await res.json();
    for (const block of data.content || []) {
      if (block.type === 'text') {
        content += block.text || '';
        if (block.text && onDelta) onDelta(block.text);
      } else if (block.type === 'tool_use') {
        toolBlocks.set(toolBlocks.size, {
          id: block.id,
          name: block.name,
          json: JSON.stringify(block.input || {})
        });
      }
    }
    if (data.usage) {
      promptTokens = data.usage.input_tokens || 0;
      outputTokens = data.usage.output_tokens || 0;
    }
  } else {
    try {
      for await (const data of readSSE(res.body)) {
        if (!data || data === '[DONE]') continue;
        let event;
        try {
          event = JSON.parse(data);
        } catch (_) {
          continue;
        }
        if (event.type === 'error') {
          const message = (event.error && event.error.message) || 'Unknown Anthropic error.';
          throw new Error(`${info.label}: ${message}`);
        }
        if (event.type === 'message_start' && event.message && event.message.usage) {
          promptTokens = event.message.usage.input_tokens || promptTokens;
        }
        if (event.type === 'content_block_start') {
          const block = event.content_block || {};
          if (block.type === 'tool_use') {
            toolBlocks.set(event.index, {
              id: block.id,
              name: block.name,
              json: '',
              input: block.input && typeof block.input === 'object' ? block.input : null
            });
          }
        }
        if (event.type === 'content_block_delta') {
          const delta = event.delta || {};
          if (delta.type === 'text_delta' && delta.text) {
            content += delta.text;
            if (onDelta) onDelta(delta.text);
          } else if (delta.type === 'input_json_delta') {
            const block = toolBlocks.get(event.index);
            if (block) block.json += delta.partial_json || '';
          }
        }
        if (event.type === 'message_delta') {
          if (event.usage) outputTokens = event.usage.output_tokens || outputTokens;
        }
      }
    } catch (err) {
      if (cfg.abortSignal && cfg.abortSignal.aborted) throw new Error('Request was cancelled.');
      if (err && err.name === 'TimeoutError') throw new Error(`${info.label} response timed out.`);
      throw err;
    }
  }

  const calls = [...toolBlocks.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, block]) => ({
      id: block.id || `toolu_${Math.random().toString(36).slice(2, 10)}`,
      name: block.name,
      arguments: block.json ? parseArguments(block.json) : (block.input || {})
    }))
    .filter((call) => call.name);

  return {
    content: calls.length ? '' : content,
    toolCalls: calls,
    stats: statsFor(cfg.model, startedAt, promptTokens, outputTokens)
  };
}

// ---------------------------------------------------------------------------
// Google Gemini API
// ---------------------------------------------------------------------------

function sanitizeGeminiSchema(schema, depth) {
  const level = depth || 0;
  if (!schema || typeof schema !== 'object' || level > 10) return schema;
  if (Array.isArray(schema)) return schema.map((entry) => sanitizeGeminiSchema(entry, level + 1));
  const out = {};
  for (const [key, value] of Object.entries(schema)) {
    if (['additionalProperties', '$schema', '$id', 'title', 'default', 'examples', 'definitions', '$defs'].includes(key)) {
      continue;
    }
    if (key === 'properties' && value && typeof value === 'object') {
      out.properties = {};
      for (const [name, property] of Object.entries(value)) {
        out.properties[name] = sanitizeGeminiSchema(property, level + 1);
      }
    } else if (key === 'items') {
      out.items = sanitizeGeminiSchema(value, level + 1);
    } else if ((key === 'anyOf' || key === 'oneOf' || key === 'allOf') && Array.isArray(value)) {
      out[key] = value.map((entry) => sanitizeGeminiSchema(entry, level + 1));
    } else {
      out[key] = value;
    }
  }
  if (out.type === 'object' && !out.properties) out.properties = {};
  return out;
}

function toGeminiRequest(messages, tools, forceTool, cfg) {
  const system = [];
  const contents = [];
  const push = (role, parts) => {
    if (!parts.length) return;
    const last = contents[contents.length - 1];
    if (last && last.role === role) last.parts.push(...parts);
    else contents.push({ role, parts });
  };

  for (const message of Array.isArray(messages) ? messages : []) {
    if (!message || !message.role) continue;
    if (message.role === 'system') {
      const text = textOf(message.content);
      if (text) system.push(text);
      continue;
    }
    if (message.role === 'tool') {
      push('user', [{
        functionResponse: {
          name: message.tool_name || 'tool',
          response: { result: textOf(message.content) }
        }
      }]);
      continue;
    }
    if (message.role === 'assistant') {
      const parts = [];
      const text = textOf(message.content);
      if (text) parts.push({ text });
      for (const call of normalizeToolCalls(message.tool_calls)) {
        parts.push({ functionCall: { name: call.name, args: call.arguments || {} } });
      }
      push('model', parts);
      continue;
    }
    const text = textOf(message.content);
    if (text) push('user', [{ text }]);
  }

  const body = {
    contents,
    generationConfig: {
      temperature: Number.isFinite(Number(cfg.temperature)) ? Number(cfg.temperature) : 0.2,
      maxOutputTokens: Math.max(256, Number(cfg.maxNewTokens) || 2048),
      candidateCount: 1
    }
  };
  if (Number.isFinite(Number(cfg.topP))) body.generationConfig.topP = Number(cfg.topP);
  if (system.length) body.systemInstruction = { parts: [{ text: system.join('\n\n') }] };

  const declarations = (Array.isArray(tools) ? tools : []).map((tool) => {
    const fn = tool && tool.function ? tool.function : tool;
    if (!fn || !fn.name) return null;
    return {
      name: fn.name,
      description: fn.description || '',
      parameters: sanitizeGeminiSchema(fn.parameters || { type: 'object', properties: {} })
    };
  }).filter(Boolean);
  if (declarations.length) {
    body.tools = [{ functionDeclarations: declarations }];
    body.toolConfig = {
      functionCallingConfig: { mode: forceTool ? 'ANY' : 'AUTO' }
    };
  }
  return body;
}

function geminiCalls(parts) {
  const calls = [];
  for (const part of parts || []) {
    const call = part && part.functionCall;
    if (!call || !call.name) continue;
    calls.push({
      id: call.id || `call_${Math.random().toString(36).slice(2, 10)}`,
      name: call.name,
      arguments: parseArguments(call.args)
    });
  }
  return calls;
}

function consumeGeminiPayload(payload, state) {
  const feedback = payload && payload.promptFeedback;
  if (feedback && feedback.blockReason) {
    throw new Error(`Google Gemini blocked the request: ${feedback.blockReason}`);
  }
  const candidates = (payload && payload.candidates) || [];
  for (const candidate of candidates) {
    const parts = (candidate.content && candidate.content.parts) || [];
    for (const part of parts) {
      if (part.thought === true) continue;
      if (typeof part.text === 'string' && part.text) {
        state.content += part.text;
        if (state.onDelta) state.onDelta(part.text);
      }
    }
    state.calls.push(...geminiCalls(parts));
  }
  if (payload && payload.usageMetadata) {
    state.promptTokens = payload.usageMetadata.promptTokenCount || state.promptTokens;
    state.outputTokens = payload.usageMetadata.candidatesTokenCount || state.outputTokens;
  }
}

async function chatGemini(cfg, info, messages, tools, onDelta, chatOptions, key, signal) {
  const base = resolveBaseUrl(cfg);
  const model = String(cfg.model || '').replace(/^models\//, '');
  const url = `${base}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;
  const body = toGeminiRequest(messages, tools, chatOptions.forceTool === true, cfg);
  const headers = {
    'Content-Type': 'application/json',
    'x-goog-api-key': key
  };

  const startedAt = Date.now();
  const res = await fetchChecked(cfg, info, url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  }, signal);

  const state = {
    content: '',
    calls: [],
    promptTokens: 0,
    outputTokens: 0,
    onDelta
  };

  if (!isEventStream(res)) {
    const payload = await res.json();
    for (const item of Array.isArray(payload) ? payload : [payload]) {
      consumeGeminiPayload(item, state);
    }
  } else {
    try {
      for await (const data of readSSE(res.body)) {
        if (!data || data === '[DONE]') continue;
        let payload;
        try {
          payload = JSON.parse(data);
        } catch (_) {
          continue;
        }
        if (payload.error) {
          const message = payload.error.message || payload.error.status || 'Unknown Gemini error.';
          throw new Error(`${info.label}: ${message}`);
        }
        consumeGeminiPayload(payload, state);
      }
    } catch (err) {
      if (cfg.abortSignal && cfg.abortSignal.aborted) throw new Error('Request was cancelled.');
      if (err && err.name === 'TimeoutError') throw new Error(`${info.label} response timed out.`);
      throw err;
    }
  }

  return {
    content: state.calls.length ? '' : state.content,
    toolCalls: state.calls,
    stats: statsFor(cfg.model, startedAt, state.promptTokens, state.outputTokens)
  };
}

// ---------------------------------------------------------------------------
// Model listing and validation
// ---------------------------------------------------------------------------

async function listOpenAIModels(cfg, info, key) {
  const res = await fetchChecked(cfg, info, `${resolveBaseUrl(cfg)}/models`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${key}` }
  }, null, 20000);
  const data = await res.json();
  return ((data && data.data) || [])
    .map((model) => model && (model.id || model.name))
    .filter((id) => typeof id === 'string' && id);
}

async function listAnthropicModels(cfg, info, key) {
  const res = await fetchChecked(cfg, info, `${resolveBaseUrl(cfg)}/models?limit=1000`, {
    method: 'GET',
    headers: {
      'x-api-key': key,
      'anthropic-version': ANTHROPIC_VERSION
    }
  }, null, 20000);
  const data = await res.json();
  return ((data && data.data) || [])
    .map((model) => model && model.id)
    .filter((id) => typeof id === 'string' && id);
}

async function listGeminiModels(cfg, info, key) {
  const res = await fetchChecked(cfg, info, `${resolveBaseUrl(cfg)}/models?pageSize=1000`, {
    method: 'GET',
    headers: { 'x-goog-api-key': key }
  }, null, 20000);
  const data = await res.json();
  return ((data && data.models) || [])
    .filter((model) => {
      const methods = model && model.supportedGenerationMethods;
      return !Array.isArray(methods) || methods.includes('generateContent');
    })
    .map((model) => String(model.name || '').replace(/^models\//, ''))
    .filter(Boolean);
}

async function listModels(cfg) {
  const info = getProvider(cfg.provider);
  if (!info) return [];
  const key = resolveApiKey(cfg);
  if (!key) throw new Error(missingKeyMessage(cfg));
  let models;
  if (info.protocol === 'anthropic') models = await listAnthropicModels(cfg, info, key);
  else if (info.protocol === 'gemini') models = await listGeminiModels(cfg, info, key);
  else models = await listOpenAIModels(cfg, info, key);
  return [...new Set(models)].sort((a, b) => a.localeCompare(b));
}

async function listAvailableModels(cfg) {
  const info = getProvider(cfg.provider);
  if (!info) return [];
  try {
    const models = await listModels(cfg);
    if (models.length) return models;
  } catch (err) {
    if (!resolveApiKey(cfg)) throw err;
  }
  return info.models.slice();
}

async function validate(cfg) {
  const models = await listModels(cfg);
  return { models };
}

async function chat(cfg, messages, tools, onDelta, chatOptions) {
  const info = getProvider(cfg.provider);
  if (!info) throw new Error(`Unsupported cloud provider: ${cfg.provider}`);
  const key = resolveApiKey(cfg);
  if (!key) throw new Error(missingKeyMessage(cfg));
  const options = chatOptions || {};
  const signal = makeSignal(cfg);
  if (info.protocol === 'anthropic') {
    return chatAnthropic(cfg, info, messages, tools, onDelta, options, key, signal);
  }
  if (info.protocol === 'gemini') {
    return chatGemini(cfg, info, messages, tools, onDelta, options, key, signal);
  }
  return chatOpenAI(cfg, info, messages, tools, onDelta, options, key, signal);
}

function warmup() {
  return Promise.resolve(true);
}

module.exports = {
  PROVIDERS,
  providerIds,
  normalizeProviderId,
  getProvider,
  isApiProvider,
  defaultModel,
  resolveApiKey,
  apiKeySource,
  resolveBaseUrl,
  maskKey,
  missingKeyMessage,
  listModels,
  listAvailableModels,
  validate,
  chat,
  warmup
};
