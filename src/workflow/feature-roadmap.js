'use strict';

const FEATURES = [
  {
    id: 'project-summaries',
    name: 'Project-aware AI summaries',
    status: 'implemented',
    description: 'Repository, module and folder summaries are cached in .fynext/project-memory.json.'
  },
  {
    id: 'task-automation',
    name: 'Task automation workflows',
    status: 'implemented',
    description: 'Common workflows such as review, build, status checks and action guides are available through commands and model prompts.'
  },
  {
    id: 'code-review',
    name: 'Better code review support',
    status: 'implemented',
    description: 'Review and audit modes flag risky code patterns, TODOs, secret-like strings and weak project practices.'
  },
  {
    id: 'multi-model',
    name: 'Multi-model switching',
    status: 'implemented',
    description: 'Models can be selected per workspace and saved in the user settings file.'
  },
  {
    id: 'context-indexing',
    name: 'Context indexing',
    status: 'implemented',
    description: 'Project snapshots keep file counts, language distribution and important files for faster and more precise answers.'
  },
  {
    id: 'git-integration',
    name: 'Git integration',
    status: 'implemented',
    description: 'Branch state, recent commits and repository status are surfaced with /git and /project.'
  },
  {
    id: 'autonomous-planning',
    name: 'Autonomous planning mode',
    status: 'implemented',
    description: 'PLAN mode helps analyze and propose fixes without mutating files.'
  },
  {
    id: 'documentation-generation',
    name: 'Documentation generation',
    status: 'planned',
    description: 'Project docs, API summaries and inline explanation generation can be layered on top of the existing context engine.'
  },
  {
    id: 'plugins',
    name: 'User-friendly plugins',
    status: 'planned',
    description: 'Custom tool and workflow presets can be added via config and local workspace extensions.'
  }
];

const WORKFLOW_PRESETS = [
  {
    id: 'review',
    label: 'Review & risk check',
    steps: ['/project', '/review', '/git']
  },
  {
    id: 'build-check',
    label: 'Build & validate',
    steps: ['/mode build', 'npm test', 'npm run build']
  },
  {
    id: 'changelog',
    label: 'Changelog summary',
    steps: ['/git', 'git log --oneline -10', 'Summarize changes']
  },
  {
    id: 'pr-summary',
    label: 'PR summary',
    steps: ['/project', '/git', 'Review changed files', 'Summarize impact']
  }
];

function buildFeatureRoadmapText() {
  const lines = [
    'Fynext roadmap:',
    '----------------',
    ...FEATURES.map((feature) => {
      const status = feature.status === 'implemented' ? '✓ implemented' : '○ planned';
      return `- ${status} ${feature.name}: ${feature.description}`;
    }),
    '',
    'Workflow presets:',
    ...WORKFLOW_PRESETS.map((preset) => `- ${preset.label}: ${preset.steps.join(' → ')}`)
  ];
  return lines.join('\n');
}

module.exports = {
  FEATURES,
  WORKFLOW_PRESETS,
  buildFeatureRoadmapText
};
