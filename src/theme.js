'use strict';

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  undim: '\x1b[22m',
  accent: '\x1b[38;5;215m',
  accentBright: '\x1b[38;5;222m',
  accentDeep: '\x1b[38;5;208m',
  accentDark: '\x1b[38;5;94m',
  red: '\x1b[38;5;203m',
  redBright: '\x1b[1m\x1b[38;5;210m',
  redDeep: '\x1b[38;5;160m',
  redDark: '\x1b[38;5;88m',
  text: '\x1b[38;5;252m',
  white: '\x1b[38;5;255m',
  gray: '\x1b[38;5;245m',
  grayDim: '\x1b[38;5;242m',
  border: '\x1b[38;5;239m',
  cyan: '\x1b[38;5;109m',
  blue: '\x1b[38;5;111m',
  green: '\x1b[38;5;114m',
  greenDim: '\x1b[38;5;71m',
  yellow: '\x1b[38;5;179m',
  orange: '\x1b[38;5;215m',
  bg: '\x1b[48;5;235m',
  bgDark: '\x1b[48;5;234m',
  bgPanel: '\x1b[48;5;236m'
};

const S = {
  marker: '▌',
  dot: '●',
  ring: '○',
  check: '✓',
  cross: '✗',
  arrow: '»',
  enter: '⏎',
  sep: '·',
  up: '↑',
  down: '↓',
  prompt: '❯',
  logo: '◆',
  branch: '└'
};

module.exports = { C, S };
