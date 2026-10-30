'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const tools = require('../src/tools/tools');

test('every exposed tool has a useful description and a valid parameter contract', () => {
  for (const definition of tools.definitionsForMode('build')) {
    const fn = definition.function;
    assert.ok(fn.description.length >= 30, `${fn.name} needs an actionable description`);
    assert.equal(fn.parameters.type, 'object');
    assert.ok(fn.parameters.properties && typeof fn.parameters.properties === 'object');
    for (const required of fn.parameters.required || []) {
      assert.ok(fn.parameters.properties[required], `${fn.name} requires an undeclared field: ${required}`);
    }
  }
});

test('tool argument validation rejects missing, unknown, and mistyped fields with repair guidance', () => {
  assert.match(tools.validateCall('fs_read', {}, 'build').error, /Eksik zorunlu/);
  assert.match(tools.validateCall('fs_read', { path: 'README.md', lines: 10 }, 'build').error, /Bilinmeyen parametre/);
  assert.match(tools.validateCall('web_search', { query: 42 }, 'build').error, /uygun tipte/);
  assert.equal(tools.validateCall('fs_write', { path: 'README.md', content: 'x' }, 'plan').valid, false);
  assert.equal(tools.validateCall('fs_read', { path: 'README.md' }, 'plan').valid, true);
});

test('request-aware tool selection keeps project inspection focused and exposes edits only for build work', () => {
  const summaryTools = tools.definitionsForRequest('plan', 'summarize this project')
    .map((entry) => entry.function.name);
  assert.ok(summaryTools.includes('fs_read'));
  assert.ok(!summaryTools.includes('fs_write'));
  assert.ok(!summaryTools.includes('web_search'));

  const editTools = tools.definitionsForRequest('build', 'fix this project bug')
    .map((entry) => entry.function.name);
  assert.ok(editTools.includes('fs_edit'));
  assert.ok(editTools.includes('shell_exec'));

  const webTools = tools.definitionsForRequest('plan', 'research the latest browser API')
    .map((entry) => entry.function.name);
  assert.ok(webTools.includes('web_search'));
  assert.ok(!webTools.includes('fs_write'));
});

test('quality scenarios retain their required tools and mode safety rules', () => {
  const cases = JSON.parse(fs.readFileSync(path.join(__dirname, 'agent-quality-cases.json'), 'utf8'));
  assert.ok(cases.length >= 4);
  for (const scenario of cases) {
    const visible = new Set(tools.definitionsForRequest(scenario.mode, scenario.request)
      .map((entry) => entry.function.name));
    for (const name of scenario.mustExpose) assert.ok(visible.has(name), `${scenario.id} misses ${name}`);
    for (const name of scenario.mustHide) assert.ok(!visible.has(name), `${scenario.id} exposes ${name}`);
    assert.ok(scenario.manualAcceptance.length > 30, `${scenario.id} needs a manual response-quality rubric`);
  }
});
