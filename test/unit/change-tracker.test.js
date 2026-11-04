'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const changeTracker = require('../../src/history/change-tracker');

function tempConfig() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'fynext-undo-'));
  return { workspace, allowOutsideWorkspace: false };
}

test('records and undoes an overwritten file', () => {
  const cfg = tempConfig();
  const target = path.join(cfg.workspace, 'a.txt');
  fs.writeFileSync(target, 'before\n', 'utf8');

  const captured = changeTracker.capture(cfg, 'fs_write', { path: 'a.txt' });
  fs.writeFileSync(target, 'after\n', 'utf8');
  const entry = changeTracker.record(captured);

  assert.ok(entry);
  assert.match(changeTracker.describe(entry, cfg.workspace), /a\.txt/);
  assert.deepEqual(changeTracker.undo(entry, cfg), ['a.txt']);
  assert.equal(fs.readFileSync(target, 'utf8'), 'before\n');
});

test('undo removes a file created by the tool', () => {
  const cfg = tempConfig();
  const target = path.join(cfg.workspace, 'new.txt');

  const captured = changeTracker.capture(cfg, 'fs_write', { path: 'new.txt' });
  fs.writeFileSync(target, 'created\n', 'utf8');
  const entry = changeTracker.record(captured);

  assert.ok(entry);
  changeTracker.undo(entry, cfg);
  assert.equal(fs.existsSync(target), false);
});

test('does not record a tool call that changed nothing', () => {
  const cfg = tempConfig();
  const target = path.join(cfg.workspace, 'same.txt');
  fs.writeFileSync(target, 'same\n', 'utf8');

  const captured = changeTracker.capture(cfg, 'fs_write', { path: 'same.txt' });
  assert.equal(changeTracker.record(captured), null);
});
