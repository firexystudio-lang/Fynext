'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DEFAULT_EXCLUDES = new Set([
  '.git',
  'node_modules',
  '.venv',
  'venv',
  'dist',
  'build',
  'coverage',
  '.next',
  '.cache',
  '.idea',
  '.vscode',
  '.fynext',
  '__pycache__'
]);

function readJsonSafe(filePath) {
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

function normalizeExt(name) {
  const ext = path.extname(name).toLowerCase();
  if (!ext) return 'no-extension';
  return ext.slice(1) || 'no-extension';
}

function collectProjectSnapshot(cfg) {
  const result = {
    fileCount: 0,
    dirCount: 0,
    languages: {},
    keyFiles: [],
    fileList: []
  };

  let visited = 0;
  const queue = [cfg.workspace];
  while (queue.length && visited < 250) {
    const current = queue.shift();
    if (!current) continue;
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (_) {
      continue;
    }

    const dirs = [];
    for (const entry of entries) {
      if (entry.name.startsWith('.') && !['.github', '.vscode', '.fynext'].includes(entry.name)) {
        continue;
      }
      if (entry.isDirectory()) {
        if (DEFAULT_EXCLUDES.has(entry.name)) continue;
        dirs.push(path.join(current, entry.name));
        result.dirCount += 1;
      } else if (entry.isFile()) {
        const fullPath = path.join(current, entry.name);
        result.fileCount += 1;
        result.fileList.push(fullPath);
        const ext = normalizeExt(entry.name);
        result.languages[ext] = (result.languages[ext] || 0) + 1;
        if (['json', 'md', 'js', 'ts', 'tsx', 'py', 'yml', 'yaml', 'sql', 'css'].includes(ext)) {
          result.keyFiles.push(path.relative(cfg.workspace, fullPath).replace(/\\/g, '/'));
        }
      }
    }

    for (const dir of dirs) queue.push(dir);
    visited += 1;
  }

  result.keyFiles = [...new Set(result.keyFiles)].slice(0, 12);
  return result;
}

function readPackageInfo(cfg) {
  const pkgPath = path.join(cfg.workspace, 'package.json');
  const pkg = readJsonSafe(pkgPath);
  if (!pkg) return null;
  return {
    name: pkg.name || path.basename(cfg.workspace),
    version: pkg.version || 'unknown',
    scripts: pkg.scripts || {},
    dependencies: Object.keys(pkg.dependencies || {}).slice(0, 10),
    devDependencies: Object.keys(pkg.devDependencies || {}).slice(0, 10)
  };
}

function readProjectFiles(cfg) {
  const packageInfo = readPackageInfo(cfg);
  const matches = [];
  for (const name of ['README.md', 'README.MD', 'package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod', 'Dockerfile']) {
    const filePath = path.join(cfg.workspace, name);
    if (fs.existsSync(filePath)) {
      matches.push(path.relative(cfg.workspace, filePath).replace(/\\/g, '/'));
    }
  }
  if (packageInfo && packageInfo.name) {
    matches.push(`package: ${packageInfo.name}`);
  }
  return matches;
}

function readGitInfo(cfg) {
  const gitRoot = path.join(cfg.workspace, '.git');
  if (!fs.existsSync(gitRoot)) {
    return { branch: 'not-a-git-repo', status: 'git bilgisi mevcut değil', recentCommits: [] };
  }

  try {
    const branch = execSync(
      `git -C "${cfg.workspace}" symbolic-ref --short -q HEAD || git -C "${cfg.workspace}" rev-parse --short HEAD`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    ).trim() || 'detached';
    const status = execSync(
      `git -C "${cfg.workspace}" status --short --branch 2>NUL`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    ).trim() || 'git durumu yok';
    const recentCommits = execSync(
      `git -C "${cfg.workspace}" log --oneline -5 2>NUL`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    ).trim();
    return {
      branch,
      status,
      recentCommits: recentCommits ? recentCommits.split(/\n+/).filter(Boolean) : []
    };
  } catch (_) {
    return { branch: 'git-unavailable', status: 'git durumu okunamadı', recentCommits: [] };
  }
}

function ensureProjectMemory(cfg) {
  const dir = path.join(cfg.workspace, '.fynext');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'project-memory.json');
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify({ createdAt: new Date().toISOString() }, null, 2));
  }
  return file;
}

function refreshProjectMemory(cfg) {
  const snapshot = collectProjectSnapshot(cfg);
  const packageInfo = readPackageInfo(cfg);
  const memory = {
    workspace: cfg.workspace,
    projectName: packageInfo ? packageInfo.name : path.basename(cfg.workspace),
    generatedAt: new Date().toISOString(),
    packageInfo,
    keyFiles: snapshot.keyFiles,
    fileCount: snapshot.fileCount,
    dirCount: snapshot.dirCount,
    languages: snapshot.languages,
    fileList: snapshot.fileList.slice(0, 200),
    git: readGitInfo(cfg),
    importantFiles: readProjectFiles(cfg)
  };

  const file = ensureProjectMemory(cfg);
  fs.writeFileSync(file, JSON.stringify(memory, null, 2));
  return memory;
}

function readProjectMemory(cfg) {
  const file = ensureProjectMemory(cfg);
  return readJsonSafe(file) || {};
}

function buildProjectMemoryText(memory) {
  const languageSummary = Object.entries(memory.languages || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([ext, count]) => `${ext}: ${count}`)
    .join(', ') || 'bilinmiyor';

  const keyFiles = (memory.keyFiles || []).slice(0, 5).join(', ') || 'yok';
  const gitStatus = memory.git && memory.git.status ? memory.git.status.split('\n').slice(0, 3).join(' | ') : 'git bilgisi yok';
  const recentCommits = memory.git && memory.git.recentCommits && memory.git.recentCommits.length
    ? memory.git.recentCommits.slice(0, 3).join(' | ')
    : 'commit yok';

  return [
    `- Proje: ${memory.projectName || path.basename(memory.workspace || process.cwd())}`,
    `- Dizin: ${memory.workspace || process.cwd()}`,
    `- Dosya sayısı: ${memory.fileCount || 0}`,
    `- Diller: ${languageSummary}`,
    `- Önemli dosyalar: ${keyFiles}`,
    `- Git: ${gitStatus}`,
    `- Son commitler: ${recentCommits}`
  ].join('\n');
}

function reviewProject(cfg, memory) {
  const files = (memory.fileList || []).slice(0, 120);
  const issues = [];
  const patterns = [
    { regex: /eval\s*\(/i, label: 'eval() kullanımı' },
    { regex: /innerHTML\s*=/i, label: 'innerHTML ataması' },
    { regex: /document\.write\s*\(|dangerouslySetInnerHTML/i, label: 'güvenlik riskli DOM işleme' },
    { regex: /child_process\.?exec|exec\s*\(/i, label: 'shell komutu çalıştırma' },
    { regex: /TODO|FIXME|HACK|XXX/i, label: 'teknik borç / işaretlenmiş not' },
    { regex: /password|secret|api[_-]?key|token/i, label: 'gizli veri veya anahtar benzeri metin' }
  ];

  for (const file of files) {
    const abs = path.join(cfg.workspace, file);
    if (!fs.existsSync(abs)) continue;
    let text;
    try {
      const stat = fs.statSync(abs);
      if (!stat.isFile() || stat.size > 200000) continue;
      text = fs.readFileSync(abs, 'utf8');
    } catch (_) {
      continue;
    }

    for (const pattern of patterns) {
      if (pattern.regex.test(text)) {
        issues.push(`${path.relative(cfg.workspace, abs).replace(/\\/g, '/')} :: ${pattern.label}`);
      }
    }
  }

  return [...new Set(issues)].slice(0, 12);
}

module.exports = {
  ensureProjectMemory,
  readProjectMemory,
  refreshProjectMemory,
  buildProjectMemoryText,
  reviewProject
};
