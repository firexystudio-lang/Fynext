'use strict';

const { C } = require('./theme');
const { stripAnsi, visibleWidth } = require('./text');

const HTML_ENTITIES = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' '
};

function decodeEntities(text) {
  return String(text || '').replace(/&(?:amp|lt|gt|quot|#39|apos|nbsp);/g, (m) => HTML_ENTITIES[m] || m);
}

/**
 * Render inline markdown (bold, italic, inline code, strike, links).
 * Preserves existing ANSI sequences and ensures base style is restored.
 */
function renderInline(text, baseStyle = '') {
  if (!text) return '';
  const base = baseStyle || '';
  const resetBase = C.reset + base;

  // Protect already-styled ANSI sequences with temporary tokens
  const ansiTokens = [];
  let s = String(text).replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, (match) => {
    ansiTokens.push(match);
    return `\x1a${ansiTokens.length - 1}\x1a`;
  });

  // Decode HTML entities
  s = decodeEntities(s);

  // Inline code: `code` (protect inside backticks from other markdown replacements)
  const codeTokens = [];
  s = s.replace(/`([^`\n]+)`/g, (_, code) => {
    codeTokens.push(C.yellow + '`' + code + '`' + resetBase);
    return `\x1bCODE${codeTokens.length - 1}\x1b`;
  });

  // Links: [text](url)
  s = s.replace(/\[([^\]\n]+)\]\(([^)\n]+)\)/g, (_, label, url) => {
    return C.blue + '\x1b[4m' + label + '\x1b[24m' + resetBase + ' ' + C.grayDim + '(' + url + ')' + resetBase;
  });

  // Bold & Italic: ***text*** or ___text___
  s = s.replace(/([*_]{3})([^*\n]+?)\1/g, (_, __, body) => {
    return C.bold + '\x1b[3m' + C.accentBright + body + '\x1b[23m' + '\x1b[22m' + resetBase;
  });

  // Bold: **text** or __text__
  s = s.replace(/([*_]{2})([^*\n]+?)\1/g, (_, __, body) => {
    return C.bold + C.accentBright + body + '\x1b[22m' + resetBase;
  });

  // Italic: *text* or _text_
  s = s.replace(/(^|[^\w*])\*([^*\n]+?)\*([^\w*]|$)/g, '$1\x1b[3m$2\x1b[23m$3');
  s = s.replace(/(^|[^\w_])_([^_\n]+?)_([^\w_]|$)/g, '$1\x1b[3m$2\x1b[23m$3');

  // Strikethrough: ~~text~~
  s = s.replace(/~~([^~\n]+?)~~/g, '\x1b[9m$1\x1b[29m');

  // Restore inline code tokens
  s = s.replace(/\x1bCODE(\d+)\x1b/g, (_, idx) => codeTokens[Number(idx)] || '');

  // Restore original ANSI tokens
  s = s.replace(/\x1a(\d+)\x1a/g, (_, idx) => ansiTokens[Number(idx)] || '');

  return s;
}

/**
 * Format markdown tables into aligned, clean terminal tables with box borders.
 */
function isTableSeparator(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') && !trimmed.includes('|')) return false;
  const cells = trimmed.split('|').map((c) => c.trim()).filter((c) => c.length > 0);
  if (!cells.length) return false;
  return cells.every((cell) => /^:?-+:?$/.test(cell));
}

function parseTableRow(line) {
  const trimmed = line.trim();
  const withoutEnds = trimmed.replace(/^\|/, '').replace(/\|$/, '');
  return withoutEnds.split('|').map((c) => c.trim());
}

function renderTable(tableLines, maxWidth) {
  if (tableLines.length < 2) return tableLines;
  const header = parseTableRow(tableLines[0]);
  const sep = tableLines[1];
  if (!isTableSeparator(sep)) return tableLines;

  const rows = [];
  for (let i = 2; i < tableLines.length; i++) {
    if (tableLines[i].includes('|')) {
      rows.push(parseTableRow(tableLines[i]));
    }
  }

  const numCols = header.length;
  if (numCols === 0) return tableLines;

  // Calculate maximum column widths based on content
  const colWidths = new Array(numCols).fill(0);
  header.forEach((cell, idx) => {
    colWidths[idx] = Math.max(colWidths[idx], visibleWidth(cell));
  });
  rows.forEach((row) => {
    row.forEach((cell, idx) => {
      if (idx < numCols) colWidths[idx] = Math.max(colWidths[idx], visibleWidth(cell));
    });
  });

  // Limit total width to maxWidth if needed
  const totalBorderWidth = numCols * 3 + 1;
  const availableForContent = Math.max(numCols * 4, maxWidth - totalBorderWidth);
  const totalContentWidth = colWidths.reduce((a, b) => a + b, 0);

  if (totalContentWidth > availableForContent) {
    const scale = availableForContent / totalContentWidth;
    for (let i = 0; i < numCols; i++) {
      colWidths[i] = Math.max(4, Math.floor(colWidths[i] * scale));
    }
  }

  const padCell = (text, width) => {
    const vWidth = visibleWidth(text);
    if (vWidth >= width) return text;
    return text + ' '.repeat(width - vWidth);
  };

  const output = [];
  const topBorder = C.border + '┌' + colWidths.map((w) => '─'.repeat(w + 2)).join('┬') + '┐' + C.reset;
  const midBorder = C.border + '├' + colWidths.map((w) => '─'.repeat(w + 2)).join('┼') + '┤' + C.reset;
  const botBorder = C.border + '└' + colWidths.map((w) => '─'.repeat(w + 2)).join('┴') + '┘' + C.reset;

  output.push(topBorder);

  // Header row
  const headerRow = C.border + '│ ' + header.map((h, i) => {
    const cellText = padCell(renderInline(h, C.bold + C.accentBright), colWidths[i]);
    return C.bold + C.accentBright + cellText + C.reset + C.border;
  }).join(' │ ') + ' │' + C.reset;
  output.push(headerRow);
  output.push(midBorder);

  // Body rows
  rows.forEach((row) => {
    const rowStr = C.border + '│ ' + colWidths.map((w, i) => {
      const cell = row[i] || '';
      return C.text + padCell(renderInline(cell, C.text), w) + C.reset + C.border;
    }).join(' │ ') + ' │' + C.reset;
    output.push(rowStr);
  });

  output.push(botBorder);
  return output;
}

/**
 * Main markdown line parser that handles headings, lists, blockquotes,
 * task checkboxes, rules, tables, and inline styles.
 */
function renderMarkdownLine(rawLine, width, baseStyle = '') {
  const trimmed = rawLine.trim();
  const base = baseStyle || C.text;

  // Empty line
  if (!trimmed) {
    return { type: 'empty', text: '', style: base };
  }

  // Horizontal Rule (---, ***, ___)
  if (/^(?:[-*_]\s*){3,}$/.test(trimmed)) {
    const ruleWidth = Math.min(Math.max(10, width - 4), 60);
    return {
      type: 'hr',
      text: C.border + '─'.repeat(ruleWidth) + C.reset,
      style: C.border
    };
  }

  // Headings (#, ##, ###, ####)
  const headingMatch = /^(#{1,4})\s+(.+)$/.exec(trimmed);
  if (headingMatch) {
    const level = headingMatch[1].length;
    const title = renderInline(headingMatch[2].trim(), C.bold);
    if (level === 1) {
      return {
        type: 'h1',
        text: C.accentBright + C.bold + '▌ ' + title.toUpperCase() + C.reset,
        style: C.accentBright + C.bold
      };
    }
    if (level === 2) {
      return {
        type: 'h2',
        text: C.cyan + C.bold + '■ ' + title + C.reset,
        style: C.cyan + C.bold
      };
    }
    if (level === 3) {
      return {
        type: 'h3',
        text: C.yellow + C.bold + '▪ ' + title + C.reset,
        style: C.yellow + C.bold
      };
    }
    return {
      type: 'h4',
      text: C.white + C.bold + '• ' + title + C.reset,
      style: C.white + C.bold
    };
  }

  // Task list items (- [ ] or - [x])
  const taskMatch = /^([-*+]\s+\[([ xX])\]\s+)(.*)$/.exec(trimmed);
  if (taskMatch) {
    const checked = taskMatch[2].toLowerCase() === 'x';
    const content = renderInline(taskMatch[3], checked ? C.grayDim : base);
    const box = checked
      ? C.green + '☑ ' + C.reset
      : C.grayDim + '☐ ' + C.reset;
    return {
      type: 'task',
      text: box + (checked ? C.grayDim + content + C.reset : content),
      style: checked ? C.grayDim : base
    };
  }

  // Unordered list items (- item, * item, + item)
  const unorderedMatch = /^([ \t]*)([-*+])\s+(.*)$/.exec(rawLine);
  if (unorderedMatch) {
    const indent = unorderedMatch[1].replace(/\t/g, '  ');
    const content = renderInline(unorderedMatch[3], base);
    return {
      type: 'unordered-list',
      text: indent + C.accent + '• ' + C.reset + content,
      style: base
    };
  }

  // Ordered list items (1. item, 2. item)
  const orderedMatch = /^([ \t]*)(\d+)[.)]\s+(.*)$/.exec(rawLine);
  if (orderedMatch) {
    const indent = orderedMatch[1].replace(/\t/g, '  ');
    const num = orderedMatch[2];
    const content = renderInline(orderedMatch[3], base);
    return {
      type: 'ordered-list',
      text: indent + C.accentBright + num + '. ' + C.reset + content,
      style: base
    };
  }

  // Blockquotes (> quote)
  if (/^>\s?/.test(trimmed)) {
    const content = renderInline(trimmed.replace(/^>\s?/, ''), C.gray);
    return {
      type: 'blockquote',
      text: C.border + '│ ' + C.gray + content + C.reset,
      style: C.gray
    };
  }

  // Diff lines (+, @@)
  if (/^\+\s/.test(rawLine)) {
    return {
      type: 'diff-add',
      text: C.green + rawLine + C.reset,
      style: C.green
    };
  }
  if (/^@@\s/.test(rawLine)) {
    return {
      type: 'diff-header',
      text: C.cyan + C.bold + rawLine + C.reset,
      style: C.cyan
    };
  }

  // Normal text line
  return {
    type: 'text',
    text: renderInline(rawLine, base),
    style: base
  };
}

module.exports = {
  renderInline,
  renderMarkdownLine,
  renderTable,
  isTableSeparator
};
