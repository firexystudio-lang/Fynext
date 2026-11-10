'use strict';

const USER_TURNS = 6;
const MAX_CONTEXT_CHARS = 5200;

function compact(value, limit) {
  const text = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  if (text.length <= limit) return text;
  if (limit <= 3) return text.slice(0, Math.max(0, limit));
  const keep = limit - 3;
  const head = Math.ceil(keep * 0.75);
  const tail = keep - head;
  return text.slice(0, head) + '...' + (tail ? text.slice(-tail) : '');
}

function turnsFrom(messages) {
  const turns = [];
  let turn = null;
  for (const message of messages || []) {
    if (!message || message.role === 'system' || message.role === 'tool') continue;
    if (message.role === 'user') {
      if (turn) turns.push(turn);
      turn = { user: String(message.content || ''), assistant: '' };
    } else if (message.role === 'assistant' && turn && message.content) {
      turn.assistant = String(message.content);
    }
  }
  if (turn) turns.push(turn);
  return turns;
}

function build(messages) {
  const turns = turnsFrom(messages);
  if (!turns.length) return '';
  const recent = turns.slice(-USER_TURNS);
  const lines = [
    'CONVERSATION CONTINUITY (use this to understand the current message; it is a compact transcript summary):',
    '- Follow the latest user message and its constraints. A correction or change of direction overrides the earlier answer or plan.',
    '- Do not repeat an earlier answer verbatim. If the user returns to an earlier topic, use the prior context and add the requested new information or action.',
    '- Treat earlier assistant statements as claims, not proof. Use tool results for project facts and completion status.',
    'Recent turns:'
  ];
  let remaining = MAX_CONTEXT_CHARS - lines.join('\n').length;
  for (let index = recent.length - 1; index >= 0 && remaining > 0; index -= 1) {
    const turn = recent[index];
    const userText = compact(turn.user, Math.min(650, Math.floor(remaining * 0.6)));
    const assistantText = turn.assistant
      ? compact(turn.assistant, Math.min(420, Math.max(100, remaining - userText.length - 24)))
      : '(no response yet)';
    const section = `- User: ${userText}\n  Fynext: ${assistantText}`;
    if (section.length > remaining && lines.length > 5) continue;
    lines.push(section);
    remaining -= section.length + 1;
  }
  return lines.join('\n');
}

function attach(history, conversation) {
  if (!Array.isArray(history) || !history.length || history[0].role !== 'system') return history;
  const continuity = build(conversation);
  if (!continuity) return history;
  const result = history.slice();
  result[0] = {
    ...history[0],
    content: `${history[0].content || ''}\n\n${continuity}`
  };
  return result;
}

function shouldAutoCompact(messages, numCtx = 8192) {
  if (!Array.isArray(messages) || messages.length < 12) return false;
  let totalChars = 0;
  for (const m of messages) {
    if (!m) continue;
    totalChars += (m.content ? m.content.length : 0);
    if (Array.isArray(m.tool_calls)) {
      totalChars += JSON.stringify(m.tool_calls).length;
    }
  }
  const maxSafeChars = Math.floor(Number(numCtx || 8192) * 2.2);
  return totalChars > maxSafeChars || messages.length >= 24;
}

function autoCompactMessages(messages, numCtx = 8192) {
  if (!shouldAutoCompact(messages, numCtx)) {
    return { compacted: false, messages };
  }

  const systemMessage = messages[0] && messages[0].role === 'system' ? messages[0] : null;
  const nonSystem = systemMessage ? messages.slice(1) : messages.slice();

  const KEEP_RECENT = 6;
  if (nonSystem.length <= KEEP_RECENT + 2) {
    return { compacted: false, messages };
  }

  // Ensure recentMessages begins cleanly with a 'user' message so tool-call chains are never severed
  let cutIndex = nonSystem.length - KEEP_RECENT;
  while (cutIndex < nonSystem.length && nonSystem[cutIndex].role !== 'user') {
    cutIndex++;
  }
  if (cutIndex >= nonSystem.length) {
    cutIndex = nonSystem.length - KEEP_RECENT;
    while (cutIndex > 0 && nonSystem[cutIndex].role !== 'user') {
      cutIndex--;
    }
  }
  if (cutIndex <= 0 || cutIndex >= nonSystem.length) {
    return { compacted: false, messages };
  }

  const olderMessages = nonSystem.slice(0, cutIndex);
  const recentMessages = nonSystem.slice(cutIndex);

  const summary = build(olderMessages);
  if (!summary) {
    return { compacted: false, messages };
  }

  const compactedOlder = [
    {
      role: 'user',
      content: `[System Note: Older conversation turns auto-compacted into memory]:\n${summary}`
    },
    {
      role: 'assistant',
      content: 'Understood. I retain the full context, technical decisions, and file paths from the earlier conversation.'
    }
  ];

  const newMessages = systemMessage
    ? [systemMessage, ...compactedOlder, ...recentMessages]
    : [...compactedOlder, ...recentMessages];

  return {
    compacted: true,
    messages: newMessages
  };
}

module.exports = { build, attach, shouldAutoCompact, autoCompactMessages };
