'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const tools = require('../../src/tools');

test('a tool call approved by the agent does not prompt twice', async () => {
  let confirmations = 0;
  tools.setConfirm(async () => {
    confirmations += 1;
    return true;
  });

  const result = await tools.run(
    {
      workspace: process.cwd(),
      approveDestructive: true,
      allowOutsideWorkspace: false
    },
    'shell_exec',
    { command: 'echo approval-test' },
    'build',
    { toolCallApproved: true }
  );

  assert.match(result, /approval-test/i);
  assert.equal(confirmations, 0);
});

test('direct shell tool calls still require confirmation when enabled', async () => {
  let confirmations = 0;
  tools.setConfirm(async () => {
    confirmations += 1;
    return false;
  });

  const result = await tools.run(
    {
      workspace: process.cwd(),
      approveDestructive: true,
      allowOutsideWorkspace: false
    },
    'shell_exec',
    { command: 'echo approval-test' },
    'build'
  );

  assert.match(result, /declined/i);
  assert.equal(confirmations, 1);
});
