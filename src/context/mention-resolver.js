'use strict';

const fs = require('fs');
const path = require('path');

const MAX_ATTACHED_FILE_CHARS = 16000;
const MAX_TOTAL_ATTACHED_CHARS = 40000;

function resolveMentions(workspace, text, options = {}) {
  const rawText = String(text || '').trim();
  if (!rawText.includes('@')) {
    return { text: rawText, attached: [] };
  }

  // Match @filename, @dir/file.ext, @"path with spaces"
  const mentionRe = /(?:^|\s)@(?:"([^"]+)"|([^\s"',;?!()[\]{}<>]+))/g;
  const attached = [];
  const foundPaths = new Set();
  let m;

  while ((m = mentionRe.exec(rawText)) !== null) {
    const rawPath = m[1] || m[2];
    if (!rawPath || rawPath.length < 2) continue;

    const normalized = rawPath.replace(/^['"]|['"]$/g, '').trim();
    if (foundPaths.has(normalized)) continue;
    foundPaths.add(normalized);

    const fullPath = path.isAbsolute(normalized)
      ? path.normalize(normalized)
      : path.resolve(workspace, normalized);

    // Prevent directory traversal outside workspace if restricted
    if (!options.allowOutsideWorkspace) {
      const rel = path.relative(workspace, fullPath);
      if (rel.startsWith('..') || path.isAbsolute(rel)) continue;
    }

    try {
      const stat = fs.statSync(fullPath);
      const relPath = path.relative(workspace, fullPath).replace(/\\/g, '/');

      if (stat.isFile()) {
        const raw = fs.readFileSync(fullPath, 'utf8');
        const clipped = raw.length > MAX_ATTACHED_FILE_CHARS
          ? raw.slice(0, MAX_ATTACHED_FILE_CHARS) + `\n… [${raw.length - MAX_ATTACHED_FILE_CHARS} chars truncated]`
          : raw;
        const ext = path.extname(fullPath).replace(/^\./, '') || 'text';
        attached.push({
          type: 'file',
          path: relPath,
          content: clipped,
          ext
        });
      } else if (stat.isDirectory()) {
        const entries = fs.readdirSync(fullPath, { withFileTypes: true });
        const list = entries
          .slice(0, 50)
          .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
          .join('\n');
        attached.push({
          type: 'directory',
          path: relPath || '.',
          content: list,
          total: entries.length
        });
      }
    } catch (_) {
      // Mentioned file does not exist; leave as normal text
    }
  }

  if (!attached.length) {
    return { text: rawText, attached: [] };
  }

  // Format context attachments
  const sections = [];
  let remainingChars = MAX_TOTAL_ATTACHED_CHARS;

  for (const item of attached) {
    if (remainingChars <= 500) break;
    if (item.type === 'file') {
      const block = `[Attached Context: ${item.path}]\n\`\`\`${item.ext}\n${item.content}\n\`\`\``;
      sections.push(block);
      remainingChars -= block.length;
    } else if (item.type === 'directory') {
      const block = `[Attached Context: ${item.path}/ (Directory listing)]\n${item.content}`;
      sections.push(block);
      remainingChars -= block.length;
    }
  }

  const enrichedText = `${rawText}\n\n${sections.join('\n\n')}`;
  return {
    text: enrichedText,
    attached
  };
}

module.exports = {
  resolveMentions,
  MAX_ATTACHED_FILE_CHARS,
  MAX_TOTAL_ATTACHED_CHARS
};
