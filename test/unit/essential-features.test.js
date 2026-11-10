'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { generateDiff } = require('../../src/history/change-tracker');
const { resolveMentions } = require('../../src/context/mention-resolver');
const { autoCompactMessages, shouldAutoCompact } = require('../../src/context/conversation-memory');

test('generateDiff produces clean unified diffs for file changes', () => {
  const before = Buffer.from('const x = 1;\nconst y = 2;\nconsole.log(x + y);');
  const after = Buffer.from('const x = 1;\nconst y = 20;\nconst z = 30;\nconsole.log(x + y + z);');

  const diff = generateDiff(before, after, 'src/math.js');
  assert.ok(diff.includes('- const y = 2;'));
  assert.ok(diff.includes('+ const y = 20;'));
  assert.ok(diff.includes('+ const z = 30;'));

  // Test new file creation diff
  const newFileDiff = generateDiff(Buffer.alloc(0), Buffer.from('hello world\nline 2'), 'test.txt');
  assert.ok(newFileDiff.includes('+ hello world'));
  assert.ok(newFileDiff.includes('+ line 2'));
});

test('resolveMentions attaches file and directory contents into user messages', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fynext-mention-test-'));
  try {
    const sampleFile = path.join(tempDir, 'sample.js');
    fs.writeFileSync(sampleFile, 'function greet() { return "hello"; }', 'utf8');

    // Test @file mention
    const res = resolveMentions(tempDir, 'Check @sample.js and fix bugs');
    assert.equal(res.attached.length, 1);
    assert.equal(res.attached[0].path, 'sample.js');
    assert.ok(res.text.includes('function greet()'));
    assert.ok(res.text.includes('[Attached Context: sample.js]'));

    // Test text without mention
    const noMention = resolveMentions(tempDir, 'Just a regular message without mentions');
    assert.equal(noMention.attached.length, 0);
    assert.equal(noMention.text, 'Just a regular message without mentions');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('autoCompactMessages compacts older turns when context threshold is reached', () => {
  const messages = [
    { role: 'system', content: 'System prompt' }
  ];

  // Add 30 turns of messages
  for (let i = 1; i <= 25; i++) {
    messages.push({ role: 'user', content: `Turn ${i} user request asking for some code feature` });
    messages.push({ role: 'assistant', content: `Turn ${i} assistant answer providing complete code and analysis` });
  }

  assert.equal(shouldAutoCompact(messages, 8192), true);
  const result = autoCompactMessages(messages, 8192);
  assert.equal(result.compacted, true);
  assert.ok(result.messages.length < messages.length);
  assert.equal(result.messages[0].role, 'system');
  assert.ok(result.messages[1].content.includes('auto-compacted into memory'));
  // Recent turns are preserved
  const last = result.messages[result.messages.length - 1];
  assert.ok(last.content.includes('Turn 25'));
});
