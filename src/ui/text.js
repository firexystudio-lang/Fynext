'use strict';

const { C } = require('./theme');


const ANSI_RE = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;

function stripAnsi(value) {
  return String(value == null ? '' : value).replace(ANSI_RE, '');
}

function charWidth(ch) {
  const cp = ch.codePointAt(0);
  if (cp === 0) return 0;
  if (cp < 32 || (cp >= 0x7f && cp < 0xa0)) return 0;
  if (
    (cp >= 0x0300 && cp <= 0x036f) ||
    (cp >= 0x1ab0 && cp <= 0x1aff) ||
    (cp >= 0x1dc0 && cp <= 0x1dff) ||
    (cp >= 0x20d0 && cp <= 0x20ff) ||
    (cp >= 0xfe20 && cp <= 0xfe2f)
  ) {
    return 0;
  }
  if (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe10 && cp <= 0xfe19) ||
    (cp >= 0xfe30 && cp <= 0xfe6f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f300 && cp <= 0x1faff) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
  ) {
    return 2;
  }
  return 1;
}

function visibleWidth(value) {
  let width = 0;
  for (const ch of stripAnsi(value)) width += charWidth(ch);
  return width;
}

function sanitize(value) {
  return String(value == null ? '' : value)
    .replace(/\x1b\][^\x07]*(\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[@-_]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
    .replace(/\t/g, '    ');
}

function sanitizeInput(value) {
  return sanitize(value).replace(/\x1b/g, '');
}

function truncatePlain(value, width) {
  let out = '';
  let used = 0;
  for (const ch of String(value == null ? '' : value)) {
    const cw = charWidth(ch);
    if (used + cw > width) break;
    out += ch;
    used += cw;
  }
  return out;
}

function truncateVisible(value, width) {
  const text = String(value == null ? '' : value);
  let out = '';
  let used = 0;
  let i = 0;
  while (i < text.length) {
    if (text[i] === '\x1b') {
      const match = /^\x1b\[[0-9;?]*[ -/]*[@-~]/.exec(text.slice(i));
      if (match) {
        out += match[0];
        i += match[0].length;
        continue;
      }
      out += text[i];
      i += 1;
      continue;
    }
    const cp = text.codePointAt(i);
    const ch = String.fromCodePoint(cp);
    const cw = charWidth(ch);
    if (used + cw > width) break;
    out += ch;
    used += cw;
    i += ch.length;
  }
  return out + C.reset;
}

function padVisible(value, width) {
  const diff = width - visibleWidth(value);
  return value + ' '.repeat(Math.max(0, diff));
}

function centerLine(value, width) {
  const text = String(value == null ? '' : value);
  const w = visibleWidth(text);
  if (w >= width) return truncateVisible(text, width);
  return ' '.repeat(Math.floor((width - w) / 2)) + text;
}

function wrapText(value, width) {
  const maxWidth = Math.max(1, Math.floor(width));
  const text = String(value == null ? '' : value).replace(/\r\n?/g, '\n');
  const out = [];
  for (const paragraph of text.split('\n')) {
    if (paragraph === '') {
      out.push('');
      continue;
    }
    const indentMatch = /^[ \t]*/.exec(paragraph);
    const indent = indentMatch ? indentMatch[0].replace(/\t/g, '    ') : '';
    const rest = paragraph.slice(indentMatch ? indentMatch[0].length : 0);
    const indentWidth = visibleWidth(indent);
    let line = indent;
    let lineWidth = indentWidth;
    for (const token of rest.split(/(\s+)/)) {
      if (!token) continue;
      const tokenWidth = visibleWidth(token);
      if (/^\s+$/.test(token)) {
        if (lineWidth + tokenWidth <= maxWidth) {
          line += token;
          lineWidth += tokenWidth;
        } else {
          out.push(line.replace(/\s+$/, ''));
          line = indent;
          lineWidth = indentWidth;
        }
        continue;
      }
      if (lineWidth + tokenWidth <= maxWidth) {
        line += token;
        lineWidth += tokenWidth;
        continue;
      }
      if (lineWidth > indentWidth) {
        out.push(line.replace(/\s+$/, ''));
        line = indent;
        lineWidth = indentWidth;
      }
      if (tokenWidth <= maxWidth - lineWidth) {
        line += token;
        lineWidth += tokenWidth;
        continue;
      }
      for (const ch of token) {
        const cw = charWidth(ch);
        if (lineWidth + cw > maxWidth && lineWidth > indentWidth) {
          out.push(line);
          line = indent;
          lineWidth = indentWidth;
        }
        line += ch;
        lineWidth += cw;
      }
    }
    out.push(line.replace(/\s+$/, ''));
  }
  return out.length ? out : [''];
}

module.exports = { stripAnsi, charWidth, visibleWidth, sanitize, sanitizeInput, truncatePlain, truncateVisible, padVisible, centerLine, wrapText };
