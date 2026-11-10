'use strict';

const os = require('os');
const { MODELS, DEFAULT_MODEL_ID, getModel } = require('./models');
const modelStore = require('./model-store');

const MIN_NODE_MAJOR = 20;
let runtime = null;
let runtimeLoad = null;
let requestQueue = Promise.resolve();
let cpuFallback = false;

function isDeviceMemoryError(err) {
  return /out of (?:device )?memory|failed to allocate|allocation of size .* failed|memory allocation .* failed|ErrorOutOfDeviceMemory|allocateMemory|vk::Device|compute buffers|graph_reserve|failed to initialize the context/i.test(
    String(err && err.message ? err.message : err)
  );
}

function assertSupportedNode() {
  const major = Number(process.versions.node.split('.')[0]);
  if (!Number.isFinite(major) || major < MIN_NODE_MAJOR) {
    throw new Error(`Lumen requires Node.js ${MIN_NODE_MAJOR} or later. Current version: ${process.versions.node}.`);
  }
}

async function disposeRuntime() {
  if (!runtime) return;
  const current = runtime;
  runtime = null;
  await current.model.dispose();
  await current.llama.dispose();
}

function resetGpuPreference() {
  cpuFallback = false;
}

async function loadRuntime(cfg, options = {}) {
  assertSupportedNode();
  const model = getModel(cfg.model);
  if (!model) {
    throw new Error(
      `Unknown Lumen model "${cfg.model}". Choose a supported model with /models.`
    );
  }
  const modelPath = modelStore.modelPath(cfg, model);
  if (!await modelStore.isModelInstalled(cfg, model)) {
    throw new Error(`Lumen model "${model.name}" is not installed. Run /model ${model.id} to download it.`);
  }
  const contextSize = Math.max(2048, Number(cfg.numCtx) || 8192);
  const gpuEnv = String(process.env.FYNEXT_LUMEN_GPU || '');
  const forceCpuEnv = /^(?:cpu|off|false|0)$/i.test(gpuEnv);
  const forceGpuEnv = /^(?:gpu|auto|on|true|1)$/i.test(gpuEnv);
  const gpuSetting = String(cfg.lumenGpu || 'auto').toLowerCase();
  const useCpu = options.forceCpu === true || cpuFallback || forceCpuEnv ||
    (!forceGpuEnv && gpuSetting === 'cpu');
  const backend = useCpu ? 'cpu' : 'auto';
  const key = `${modelPath}\0${contextSize}\0${backend}`;
  if (runtime && runtime.key === key) return runtime;
  if (runtimeLoad) {
    await runtimeLoad;
    return loadRuntime(cfg, options);
  }

  runtimeLoad = (async () => {
    await disposeRuntime();
    const build = async (gpu) => {
      const { getLlama } = await import('node-llama-cpp');
      const llama = await getLlama({ gpu, logLevel: 'error' });
      try {
        const loadedModel = await llama.loadModel({ modelPath });
        return { llama, model: loadedModel };
      } catch (err) {
        await llama.dispose().catch(() => {});
        throw err;
      }
    };

    let built;
    try {
      built = await build(useCpu ? false : 'auto');
    } catch (err) {
      if (!useCpu && isDeviceMemoryError(err)) {
        cpuFallback = true;
        try {
          built = await build(false);
        } catch (cpuErr) {
          throw new Error(
            `Could not load Lumen model "${model.name}" on the GPU or the CPU: ${cpuErr.message}`
          );
        }
      } else {
        throw new Error(`Could not load Lumen model "${model.name}": ${err.message}`);
      }
    }

    const cpu = useCpu || cpuFallback;
    runtime = {
      key: `${modelPath}\0${contextSize}\0${cpu ? 'cpu' : 'auto'}`,
      llama: built.llama,
      model: built.model,
      cpu
    };
  })();

  try {
    await runtimeLoad;
    return runtime;
  } finally {
    runtimeLoad = null;
  }
}

async function createOptimizedContext(loadedModel, contextSize) {
  const cpus = os.cpus() || [];
  const threads = Math.max(1, Math.min(8, cpus.length - 1 || 4));
  const batchSize = Math.min(512, Math.max(64, Math.floor(contextSize / 4)));

  const tryCreate = async (size, useFlash) => {
    return loadedModel.createContext({
      contextSize: size,
      batchSize,
      threads,
      flashAttention: useFlash
    });
  };

  try {
    return await tryCreate(contextSize, true);
  } catch (err) {
    if (isDeviceMemoryError(err) && contextSize > 2048) {
      const reducedSize = Math.max(2048, Math.floor(contextSize / 2));
      try {
        return await tryCreate(reducedSize, true);
      } catch (_) {
        return await tryCreate(reducedSize, false);
      }
    }
    try {
      return await tryCreate(contextSize, false);
    } catch (fallbackErr) {
      if (isDeviceMemoryError(fallbackErr) && contextSize > 2048) {
        return await tryCreate(Math.max(2048, Math.floor(contextSize / 2)), false);
      }
      throw fallbackErr;
    }
  }
}

function appendHistoryItem(history, item) {
  const previous = history[history.length - 1];
  if (previous && previous.type === item.type) {
    if (item.type === 'user') previous.text += `\n${item.text}`;
    else previous.response.push(...item.response);
  } else {
    history.push(item);
  }
}

function toolCallItem(call) {
  const fn = call.function || call;
  return {
    type: 'functionCall',
    id: fn.id || call.id,
    name: fn.name || call.name,
    params: fn.arguments == null ? {} : normalizeArgs(fn.arguments)
  };
}

function normalizeArgs(args) {
  if (typeof args === 'string') {
    try {
      args = JSON.parse(args);
    } catch (_) {
      return {};
    }
  }
  return args && typeof args === 'object' && !Array.isArray(args) ? args : {};
}

function buildHistory(messages) {
  const normalized = Array.isArray(messages) ? messages : [];
  let promptStart = normalized.length - 1;
  const promptMessage = normalized[promptStart];
  if (promptMessage && promptMessage.role === 'tool') {
    while (promptStart > 0 && normalized[promptStart - 1] &&
        normalized[promptStart - 1].role === 'tool') {
      promptStart -= 1;
    }
  } else if (!promptMessage || promptMessage.role !== 'user') {
    throw new Error('Lumen requires a user message or tool result to generate a response.');
  }

  const system = normalized.find((message) => message && message.role === 'system');
  const history = system && system.content
    ? [{ type: 'system', text: system.content }]
    : [];
  const continuingFromTools = promptMessage && promptMessage.role === 'tool';
  const historyEnd = continuingFromTools ? normalized.length : promptStart;
  const pendingById = new Map();
  const pendingByName = new Map();
  for (const message of normalized.slice(0, historyEnd)) {
    if (!message || typeof message.content !== 'string') continue;
    if (message.role === 'user') {
      appendHistoryItem(history, { type: 'user', text: message.content });
    } else if (message.role === 'assistant') {
      const response = [];
      if (message.content) response.push(message.content);
      if (Array.isArray(message.tool_calls) && message.tool_calls.length) {
        for (const call of message.tool_calls) {
          const item = toolCallItem(call);
          if (!item.name) continue;
          response.push(item);
          if (item.id) pendingById.set(item.id, item);
          if (!pendingByName.has(item.name)) pendingByName.set(item.name, []);
          pendingByName.get(item.name).push(item);
        }
      }
      if (response.length) appendHistoryItem(history, { type: 'model', response });
    } else if (message.role === 'tool') {
      const call = (message.tool_call_id && pendingById.get(message.tool_call_id)) ||
        (pendingByName.get(message.tool_name) || []).find((item) => item.result == null);
      if (call) {
        call.result = message.content;
      } else {
        const label = message.tool_name ? `Tool result (${message.tool_name}):\n` : 'Tool result:\n';
        appendHistoryItem(history, { type: 'user', text: `${label}${message.content}` });
      }
    }
  }
  return {
    systemPrompt: system ? system.content : '',
    history,
    prompt: continuingFromTools
      ? 'Continue the task using the tool results above.'
      : normalized.slice(promptStart).map((message) => {
      if (message.role === 'tool') {
        const label = message.tool_name ? `Tool result (${message.tool_name}):\n` : 'Tool result:\n';
        return `${label}${message.content || ''}`;
      }
      return message.content || '';
    }).join('\n\n')
  };
}

function forcedToolSchema(tools) {
  const names = (tools || [])
    .map((tool) => (tool && tool.function ? tool.function.name : tool && tool.name))
    .filter(Boolean);
  return {
    type: 'object',
    properties: {
      name: { type: 'string', enum: names },
      arguments: { type: 'object', additionalProperties: true }
    },
    required: ['name', 'arguments'],
    additionalProperties: false
  };
}

function createNativeFunctions(tools, calls) {
  const functions = {};
  for (const tool of tools || []) {
    const definition = tool && tool.function ? tool.function : tool;
    if (!definition || !definition.name) continue;
    functions[definition.name] = {
      description: definition.description || '',
      params: definition.parameters || { type: 'object', properties: {} },
      handler: (params) => {
        calls.push({ name: definition.name, arguments: normalizeArgs(params) });
        const error = new Error('Lumen yielded control for a Fynext tool call.');
        error.code = 'FYNEXT_TOOL_CALL_CAPTURED';
        throw error;
      }
    };
  }
  return functions;
}

function queued(task) {
  const previous = requestQueue;
  let release;
  requestQueue = new Promise((resolve) => { release = resolve; });
  return previous.then(task).finally(release);
}

async function chat(cfg, messages, tools, onDelta, chatOptions = {}) {
  return queued(async () => {
    const api = require('../ai/llm');
    const hasTools = !!(tools && tools.length);
    const forceTool = chatOptions.forceTool === true;
    const structuredToolCall = hasTools && forceTool;
    const trimmed = api.trimMessages(cfg, messages);
    const prepared = structuredToolCall
      ? api.withToolInstructions(trimmed, tools, true)
      : hasTools
        ? api.withNativeToolInstructions(trimmed, tools, false)
        : trimmed;
    const { systemPrompt, history, prompt } = buildHistory(prepared);
    let loaded = await loadRuntime(cfg);
    const startedAt = Date.now();
    const contextSize = Math.max(2048, Number(cfg.numCtx) || 8192);
    let retriedCpu = false;

    const attempt = async () => {
      let context;
      let session;
      let streamMode = hasTools ? 'undecided' : 'stream';
      let pending = '';
      let streamedText = '';
      let visibleOutput = false;
      const capturedCalls = [];
      const emit = (text) => {
        if (!text) return;
        visibleOutput = true;
        if (onDelta) onDelta(text);
      };

      try {
        context = await createOptimizedContext(loaded.model, contextSize);
        const { LlamaChatSession } = await import('node-llama-cpp');
        session = new LlamaChatSession({
          contextSequence: context.getSequence(),
          systemPrompt,
          autoDisposeSequence: true
        });
        session.setChatHistory(history);

        const timeoutMs = Math.max(180, Number(cfg.requestTimeoutSec) * 60) * 1000;
        const timeoutSignal = AbortSignal.timeout(timeoutMs);
        const signal = cfg.abortSignal
          ? AbortSignal.any([timeoutSignal, cfg.abortSignal])
          : timeoutSignal;
        const promptOptions = {
          signal,
          maxTokens: Math.max(1, Number(cfg.maxNewTokens) || 2048),
          temperature: Number.isFinite(Number(cfg.temperature)) ? Number(cfg.temperature) : 0.1,
          topP: Number.isFinite(Number(cfg.topP)) ? Number(cfg.topP) : 0.95,
          minP: 0.05,
          repeatPenalty: {
            penalty: Number(cfg.repeatPenalty) || 1.12,
            lastTokens: 64
          },
          onTextChunk: (chunk) => {
            streamedText += chunk;
            if (!onDelta) return;
            if (streamMode === 'stream') {
              emit(chunk);
              return;
            }
            pending += chunk;
            const text = pending.replace(/^\s+/, '');
            const possibleToolCall = !text || text[0] === '{' || text[0] === '[' || text[0] === '`' ||
              (text[0] === '<' && (
                text.startsWith('<tool') || '<tool_call>'.startsWith(text) || '<tool>'.startsWith(text)
              )) ||
              /^STATUS:/i.test(text);
            if (!possibleToolCall) {
              streamMode = 'stream';
              emit(pending);
              pending = '';
            } else {
              streamMode = 'buffered';
            }
          }
        };
        let content;
        let nativeCalls = [];
        if (structuredToolCall) {
          const grammar = await loaded.llama.createGrammarForJsonSchema(forcedToolSchema(tools));
          content = await session.prompt(prompt, { ...promptOptions, grammar });
        } else if (hasTools) {
          try {
            const response = await session.promptWithMeta(prompt, {
              ...promptOptions,
              functions: createNativeFunctions(tools, capturedCalls),
              maxParallelFunctionCalls: 1
            });
            content = response.responseText;
            nativeCalls = response.response
              .filter((item) => item && typeof item === 'object' && item.type === 'functionCall')
              .map((item) => ({ name: item.name, arguments: normalizeArgs(item.params) }));
          } catch (err) {
            if (err.code !== 'FYNEXT_TOOL_CALL_CAPTURED' || !capturedCalls.length) throw err;
            content = streamedText;
            nativeCalls = capturedCalls;
          }
        } else {
          content = await session.prompt(prompt, promptOptions);
        }
        const validNames = tools
          ? tools.map((tool) => (tool && tool.function ? tool.function.name : tool && tool.name)).filter(Boolean)
          : [];
        let toolCalls = nativeCalls;
        if (!toolCalls.length && tools && tools.length) {
          toolCalls = api.extractToolCalls(content, validNames);
          if (!toolCalls.length && streamedText && streamedText !== content) {
            toolCalls = api.extractToolCalls(streamedText, validNames);
          }
        }
        if (toolCalls.length === 0 && streamMode !== 'stream') {
          emit(pending || content);
        }
        const stats = {
          model: cfg.model,
          promptTokens: Math.ceil(JSON.stringify(prepared).length / 4),
          outputTokens: Math.ceil(content.length / 4),
          estimatedTokens: true,
          totalMs: Date.now() - startedAt
        };
        return {
          content: toolCalls.length ? '' : content,
          toolCalls,
          stats
        };
      } catch (err) {
        if (err && typeof err === 'object') err.visibleOutput = visibleOutput;
        throw err;
      } finally {
        if (session) session.dispose({ disposeSequence: true });
        if (context) await context.dispose();
      }
    };

    try {
      try {
        return await attempt();
      } catch (err) {
        if (loaded.cpu || retriedCpu || err.visibleOutput || !isDeviceMemoryError(err)) throw err;
        retriedCpu = true;
        await disposeRuntime();
        cpuFallback = true;
        loaded = await loadRuntime(cfg, { forceCpu: true });
        return await attempt();
      }
    } catch (err) {
      if (cfg.abortSignal && cfg.abortSignal.aborted) {
        throw new Error('Request was cancelled.');
      }
      if (err.name === 'TimeoutError') throw new Error('Lumen response timed out.');
      throw err;
    }
  });
}

async function warmup(cfg) {
  await loadRuntime(cfg);
  return true;
}

async function listModels(cfg) {
  return modelStore.listInstalledModels(cfg);
}

async function listAvailableModels() {
  return MODELS.map((model) => model.id);
}

module.exports = {
  MODELS,
  DEFAULT_MODEL_ID,
  getModel,
  forcedToolSchema,
  createNativeFunctions,
  buildHistory,
  chat,
  warmup,
  listModels,
  listAvailableModels,
  resetGpuPreference,
  ...modelStore
};
