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
      : '(yanıt henüz yok)';
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

module.exports = { build, attach };
