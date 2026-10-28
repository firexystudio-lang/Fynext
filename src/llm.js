'use strict';

const toolSupportCache = new Map();

async function* readLines(body) {
  const decoder = new TextDecoder();
  let buf = '';
  for await (const chunk of body) {
    buf += decoder.decode(chunk, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (line) yield line;
    }
  }
  if (buf.trim()) yield buf.trim();
}

function unwrapValue(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const keys = Object.keys(value);
  if (keys.length > 3) return value;
  if (Object.prototype.hasOwnProperty.call(value, 'content') && keys.includes('type')) {
    return unwrapValue(value.content);
  }
  if (Object.prototype.hasOwnProperty.call(value, 'value') && keys.includes('type')) {
    return unwrapValue(value.value);
  }
  return value;
}

function normalizeArgs(args) {
  let value = args;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch (_) {
      return {};
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out = {};
  for (const [key, item] of Object.entries(value)) out[key] = unwrapValue(item);
  return out;
}

function toToolCall(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const fn = obj.function && typeof obj.function === 'object' ? obj.function : obj;
  const name = fn.name || obj.name || obj.tool || obj.tool_name;
  if (!name || typeof name !== 'string') return null;
  let args = fn.arguments;
  if (args == null) args = fn.parameters;
  if (args == null) args = obj.arguments;
  if (args == null) args = obj.args;
  return { id: fn.id || obj.id, name, arguments: normalizeArgs(args) };
}

function isToolCallCandidate(call, valid) {
  return Boolean(call) &&
    ((valid && valid.has(call.name)) ||
      /^(?:fs|git|web|shell)_[a-z0-9_]+$/i.test(call.name));
}

function findJsonObjects(text) {
  const objs = [];
  const stack = [];
  let inStr = false;
  let esc = false;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{') {
      if (stack.length === 0) start = i;
      stack.push(1);
    } else if (ch === '}') {
      if (stack.length) {
        stack.pop();
        if (stack.length === 0 && start >= 0) {
          const sub = text.slice(start, i + 1);
          try { objs.push(JSON.parse(sub)); } catch (_) { /* ignore */ }
          start = -1;
        }
      }
    }
  }
  return objs;
}

function scanBlock(block, valid) {
  const calls = [];
  for (const obj of findJsonObjects(block)) {
    const call = toToolCall(obj);
    if (!call) continue;
    if (!isToolCallCandidate(call, valid)) continue;
    calls.push(call);
  }
  return calls;
}

function decodeXml(value) {
  return String(value || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(?:39|x27);/gi, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

function xmlAttributes(value) {
  const attributes = {};
  const re = /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match;
  while ((match = re.exec(value))) {
    attributes[match[1].toLowerCase()] = decodeXml(match[2] == null ? match[3] : match[2]);
  }
  return attributes;
}

function xmlScalar(value, type) {
  const text = decodeXml(value);
  if (type === 'boolean' || /^(true|false)$/i.test(text)) return /^true$/i.test(text);
  if (type === 'number' || type === 'integer') {
    const number = Number(text);
    if (Number.isFinite(number)) return number;
  }
  try {
    return JSON.parse(text);
  } catch (_) {
    return text.replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1');
  }
}

function parseXmlArguments(value) {
  const body = decodeXml(value);
  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch (_) {
    // Parameters can also be represented as individual XML elements.
  }

  const args = {};
  const paired = /<(arg|param|parameter)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi;
  let match;
  while ((match = paired.exec(value))) {
    const attrs = xmlAttributes(match[2]);
    const name = attrs.name || attrs.key;
    if (name) args[name] = xmlScalar(match[3], attrs.type);
  }
  const selfClosing = /<(arg|param|parameter)\b([^>]*?)\/>/gi;
  while ((match = selfClosing.exec(value))) {
    const attrs = xmlAttributes(match[2]);
    const name = attrs.name || attrs.key;
    if (name && Object.prototype.hasOwnProperty.call(attrs, 'value')) {
      args[name] = xmlScalar(attrs.value, attrs.type);
    }
  }
  if (Object.keys(args).length) return args;

  const namedElements = /<([:\w-]+)\b[^>]*>([\s\S]*?)<\/\1\s*>/g;
  while ((match = namedElements.exec(value))) {
    const key = match[1].toLowerCase();
    if (key !== 'name' && key !== 'arguments' && key !== 'args' && key !== 'parameters') {
      args[match[1]] = xmlScalar(match[2]);
    }
  }
  return args;
}

function parseXmlTool(block) {
  const match = block.match(/^\s*<tool\b([^>]*)>([\s\S]*?)<\/tool\s*>\s*$/i);
  if (!match) return null;
  const attrs = xmlAttributes(match[1]);
  const body = match[2].trim();
  try {
    const objectCall = toToolCall(JSON.parse(decodeXml(body)));
    if (objectCall) return objectCall;
  } catch (_) {
    // The XML wrapper may contain named arguments instead of a JSON call.
  }
  const nameMatch = body.match(/<name\b[^>]*>([\s\S]*?)<\/name\s*>/i);
  const name = attrs.name || (nameMatch && decodeXml(nameMatch[1]));
  if (!name) {
    const directCall = body.match(/^\s*([A-Za-z_][\w.-]*)\s*\(([\s\S]*)\)\s*$/);
    if (directCall) {
      try {
        return { name: directCall[1], arguments: normalizeArgs(JSON.parse(decodeXml(directCall[2]))) };
      } catch (_) {
        return null;
      }
    }
    return null;
  }
  const argsMatch = body.match(/<(?:arguments|args|parameters)\b[^>]*>([\s\S]*?)<\/(?:arguments|args|parameters)\s*>/i);
  const args = argsMatch ? parseXmlArguments(argsMatch[1]) : parseXmlArguments(body);
  return { name, arguments: normalizeArgs(args) };
}

function extractToolCalls(text, validNames) {
  if (!text) return [];
  const valid = validNames && validNames.length ? new Set(validNames) : null;
  const blocks = [];
  
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const call = toToolCall(JSON.parse(trimmed));
      if (isToolCallCandidate(call, valid)) return [call];
    } catch (_) {
      // The response may contain malformed or non-call JSON.
    }
  }
  
  let m;
  const fenceRe = /```(?:json)?\s*([\s\S]*?)```/gi;
  while ((m = fenceRe.exec(text)) !== null) blocks.push(m[1]);
  const xmlRe = /<(tool_call|tool)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi;
  const xmlCalls = [];
  while ((m = xmlRe.exec(text)) !== null) {
    const block = m[0];
    if (m[1].toLowerCase() === 'tool') {
      const call = parseXmlTool(block);
      if (isToolCallCandidate(call, valid)) xmlCalls.push(call);
    } else {
      blocks.push(m[3]);
    }
  }
  if (xmlCalls.length) return xmlCalls;
  blocks.push(text);
  
  for (const block of blocks) {
    const calls = scanBlock(block, valid);
    if (calls.length) return calls;
  }
  return [];
}

function toolNamesOf(tools) {
  if (!Array.isArray(tools)) return [];
  return tools
    .map((t) => (t && t.function ? t.function.name : t && t.name))
    .filter(Boolean);
}

function toolInstructions(tools) {
  const lines = tools.map((t) => {
    const fn = t.function || t;
    const props = (fn.parameters && fn.parameters.properties) || {};
    const params = Object.keys(props)
      .map((k) => {
        const detail = props[k].description ? ` - ${props[k].description}` : '';
        return `  - ${k} (${props[k].type || 'any'})${detail}`;
      })
      .join(', ');
    return `- ${fn.name}: ${fn.description || 'Aciklama yok.'}\n${params}`;
  });
  return [
    '',
    'ARAC KULLANIMI:',
    'Once kullanicinin bilgi mi istedigini, yoksa bir isi yapmani mi istedigini ayirt et. Build modunda "X yap/olustur/ekle/duzelt" gibi dogrudan isteklerde, kullanici nasil yapilacagini sormadiysa genel tavsiye verip durma; gerekli araclari cagir, sonuclari bekle ve isi gercekten tamamla. Ornegin "blog web sitesi yap" icin once fs_list ile calisma alanini incele, sonra mevcut projeye uygun dosyalari fs_write/fs_edit ile olustur veya duzenle ve sonucu dogrula. Dosya ya da kodu kullanicidan elle olusturmasini/kopyalamasini isteme.',
    'Bir arac gerekiyorsa hemen cagir. Arac cagrilarinda yalnizca asagidaki XML bicimini kullan; birden fazla arac icin birden fazla <tool> blogu yaz:',
    '<tool>',
    '  <name>arac_adi</name>',
    '  <arguments>{"parametre":"deger"}</arguments>',
    '</tool>',
    'XML blogunun disina aciklama veya markdown ekleme. JSON degerlerini XML icinde JSON olarak ver ve XML ozel karakterlerini kacir. Arac gerekmiyorsa normal yanit ver.',
    '',
    'Kullanilabilir araclar:',
    ...lines,
    '',
    'Arac sonucunu aldiktan sonra onu incele ve kullaniciya gorevi tamamlayan yaniti ver. Sonucu uydurma; kullaniciya uzun ic dusunce dokumu verme.'
  ].join('\n');
}

function withToolInstructions(messages, tools) {
  const instr = toolInstructions(tools);
  let injected = false;
  const out = messages.map((m) => {
    if (!injected && m.role === 'system') {
      injected = true;
      return { ...m, content: (m.content || '') + instr };
    }
    return m;
  });
  if (!injected) out.unshift({ role: 'system', content: instr.trim() });
  return out;
}

async function modelSupportsTools(cfg) {
  const key = cfg.model;
  if (toolSupportCache.has(key)) return toolSupportCache.get(key);
  let supported = false;
  try {
    const res = await fetch(cfg.ollamaUrl.replace(/\/$/, '') + '/api/show', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: cfg.model }),
      signal: AbortSignal.timeout(15000)
    });
    if (res.ok) {
      const j = await res.json();
      supported = Array.isArray(j.capabilities) && j.capabilities.includes('tools');
    }
  } catch (_) {
    supported = false;
  }
  toolSupportCache.set(key, supported);
  return supported;
}

function messageSize(message) {
  if (!message) return 0;
  let size = String(message.content || '').length + 64;
  if (message.tool_calls) {
    try {
      size += JSON.stringify(message.tool_calls).length;
    } catch (_) {
      size += 256;
    }
  }
  return size;
}

function trimMessages(cfg, messages) {
  if (!Array.isArray(messages) || messages.length < 2) return messages;
  const budget = Math.max(4000, Math.floor((Number(cfg.numCtx) || 8192) * 3));
  const system = messages[0] && messages[0].role === 'system' ? messages[0] : null;
  const body = system ? messages.slice(1) : messages;
  const groups = [];

  for (let i = body.length - 1; i >= 0; ) {
    const message = body[i];
    if (message.role === 'tool') {
      let start = i;
      while (start > 0 && body[start - 1].role === 'tool') start -= 1;
      if (start > 0) {
        const before = body[start - 1];
        if (before.role === 'assistant' && Array.isArray(before.tool_calls)) start -= 1;
      }
      groups.unshift(body.slice(start, i + 1));
      i = start - 1;
    } else {
      groups.unshift([message]);
      i -= 1;
    }
  }

  let total = system ? messageSize(system) : 0;
  const kept = [];
  for (let i = groups.length - 1; i >= 0; i -= 1) {
    const group = groups[i];
    let size = 0;
    for (const message of group) size += messageSize(message);
    if (kept.length && total + size > budget) break;
    kept.unshift(...group);
    total += size;
  }

  while (kept.length && kept[0].role === 'tool') kept.shift();
  return system ? [system, ...kept] : kept;
}

async function doRequest(cfg, messages, tools, signal) {
  const url = cfg.ollamaUrl.replace(/\/$/, '') + '/api/chat';
  const body = {
    model: cfg.model,
    messages,
    stream: true,
    keep_alive: cfg.keepAlive || '10m',
    options: {
      temperature: Number(cfg.temperature),
      num_ctx: Number(cfg.numCtx),
      num_predict: Math.max(256, Number(cfg.maxNewTokens) || 2048)
    }
  };
  if (tools && tools.length) body.tools = tools;

  try {
    return await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal
    });
  } catch (err) {
    if (cfg.abortSignal && cfg.abortSignal.aborted) throw new Error('Istek iptal edildi.');
    if (err.name === 'TimeoutError' || /timeout/i.test(String(err.message || ''))) {
      throw new Error('Model yanit zaman asimina ugradi.');
    }
    throw new Error(`Ollama sunucusuna baglanilamadi (${url}): ${err.message}`);
  }
}

async function chat(cfg, messages, tools, onDelta) {
  const validNames = toolNamesOf(tools);
  const timeoutSignal = AbortSignal.timeout(Math.max(180, Number(cfg.requestTimeoutSec) * 60) * 1000);
  const signal = cfg.abortSignal ? AbortSignal.any([timeoutSignal, cfg.abortSignal]) : timeoutSignal;
  let useNativeTools = !!(tools && tools.length) && (await modelSupportsTools(cfg));
  const trimmed = trimMessages(cfg, messages);
  let payload = trimmed;
  if (!useNativeTools && tools && tools.length) payload = withToolInstructions(trimmed, tools);

  let res = await doRequest(cfg, payload, useNativeTools ? tools : null, signal);
  if (!res.ok && useNativeTools) {
    const text = await res.text().catch(() => '');
    if (/does not support tools/i.test(text)) {
      toolSupportCache.set(cfg.model, false);
      useNativeTools = false;
      payload = withToolInstructions(trimmed, tools);
      res = await doRequest(cfg, payload, null, signal);
    } else {
      throw new Error(`Ollama HTTP ${res.status}: ${text.slice(0, 500)}`);
    }
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Ollama HTTP ${res.status}: ${text.slice(0, 500)}`);
  }

  let content = '';
  let mode = tools && tools.length ? 'undecided' : 'stream';
  let pending = '';
  const nativeCalls = [];
  let rejectedToolCall = false;
  const startedAt = Date.now();
  const stats = {};

  try {
    for await (const line of readLines(res.body)) {
      let json;
      try {
        json = JSON.parse(line);
      } catch (_) {
        continue;
      }
      if (json.error) throw new Error('Ollama: ' + json.error);
      const message = json.message || {};

      if (Array.isArray(message.tool_calls)) {
        for (const toolCall of message.tool_calls) {
          const call = toToolCall(toolCall);
          if (!call) continue;
          if (!validNames.length || validNames.includes(call.name)) nativeCalls.push(call);
          else rejectedToolCall = true;
        }
      }
      if (message.content) {
        content += message.content;
        if (mode === 'stream') {
          if (onDelta) onDelta(message.content);
        } else if (mode !== 'buffered') {
          pending += message.content;
          const text = pending.replace(/^\s+/, '');
          const toolTagStarts = ['<tool_call>', '<tool>'];
          const looksLikeToolTag = text[0] === '<' &&
            (text.startsWith('<tool') || toolTagStarts.some((tag) => tag.startsWith(text)));
          if (text && text[0] !== '{' && text[0] !== '[' && text[0] !== '`' &&
              !looksLikeToolTag) {
            mode = 'stream';
            if (onDelta) onDelta(pending);
            pending = '';
          } else if (text) {
            mode = 'buffered';
          }
        }
      }
      if (json.done) {
        if (json.prompt_eval_count != null) stats.promptTokens = json.prompt_eval_count;
        if (json.eval_count != null) stats.outputTokens = json.eval_count;
        if (json.total_duration != null) stats.totalMs = Math.round(json.total_duration / 1e6);
      }
    }
  } catch (err) {
    if (cfg.abortSignal && cfg.abortSignal.aborted) throw new Error('Istek iptal edildi.');
    if (err.name === 'TimeoutError') throw new Error('Ollama yanit zaman asimina ugradi.');
    throw err;
  }

  let toolCalls = nativeCalls;
  if (tools && tools.length && !toolCalls.length) {
    const extracted = extractToolCalls(content, validNames);
    if (extracted.length) toolCalls = extracted;
  }
  if (toolCalls.length) return { content: nativeCalls.length ? content : '', toolCalls, stats };
  if (rejectedToolCall && !content.trim()) {
    content = 'Bu arac mevcut modda kullanilamaz. Plan modunda yalnizca salt okunur araclar aciktir.';
  }
  stats.totalMs = stats.totalMs || Date.now() - startedAt;
  stats.model = cfg.model;
  if (stats.outputTokens && stats.totalMs > 0) {
    stats.tokensPerMinute = Math.round((stats.outputTokens * 60000) / stats.totalMs);
  }
  if (mode === 'buffered' && content && onDelta) onDelta(content);
  return { content, toolCalls: [], stats };
}

async function listModels(cfg) {
  try {
    const res = await fetch(cfg.ollamaUrl.replace(/\/$/, '') + '/api/tags', {
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) return [];
    const j = await res.json();
    return (j.models || []).map((m) => m.name);
  } catch (_) {
    return [];
  }
}

async function listAvailableModels(cfg) {
  const models = await listModels(cfg);
  if (!models.length) throw new Error('Ollama model listesi alinamadi; Ollama calisiyor mu kontrol edin.');
  return models.sort((a, b) => a.localeCompare(b));
}

async function warmup(cfg) {
  try {
    const res = await fetch(cfg.ollamaUrl.replace(/\/$/, '') + '/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: cfg.model,
        prompt: 'ping',
        stream: false,
        keep_alive: cfg.keepAlive || '10m',
        options: { num_ctx: Number(cfg.numCtx) || 8192, num_predict: 1 }
      }),
      signal: AbortSignal.timeout(180000)
    });
    return res.ok;
  } catch (_) {
    return false;
  }
}

module.exports = {
  chat,
  listModels,
  listAvailableModels,
  modelSupportsTools,
  warmup,
  trimMessages,
  extractToolCalls
};