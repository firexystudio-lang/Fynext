'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { FEATURES, WORKFLOW_PRESETS, buildFeatureRoadmapText } = require('../src/feature-roadmap');

test('feature roadmap includes all recommended additions', () => {
  const names = FEATURES.map((feature) => feature.name);
  const expected = [
    'Project-aware AI summaries',
    'Task automation workflows',
    'Better code review support',
    'Multi-model switching',
    'Context indexing',
    'Git integration',
    'Autonomous planning mode',
    'Documentation generation',
    'User-friendly plugins'
  ];

  for (const name of expected) {
    assert.ok(names.includes(name), `missing: ${name}`);
  }

  assert.equal(WORKFLOW_PRESETS.length, 4);
  assert.match(buildFeatureRoadmapText(), /Project-aware AI summaries/);
  assert.match(buildFeatureRoadmapText(), /Workflow presets:/);
});
