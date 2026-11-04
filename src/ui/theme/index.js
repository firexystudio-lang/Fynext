'use strict';

const BASE = {
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

const THEMES = {
  fynext: { label: 'Fynext (varsayılan)', colors: BASE },
  dark: {
    label: 'Dark',
    colors: Object.assign({}, BASE, {
      accent: '\x1b[38;5;75m',
      accentBright: '\x1b[38;5;117m',
      accentDeep: '\x1b[38;5;33m',
      accentDark: '\x1b[38;5;24m',
      text: '\x1b[38;5;250m',
      grayDim: '\x1b[38;5;244m',
      border: '\x1b[38;5;238m',
      cyan: '\x1b[38;5;117m',
      blue: '\x1b[38;5;75m',
      green: '\x1b[38;5;78m',
      yellow: '\x1b[38;5;221m',
      orange: '\x1b[38;5;215m',
      bg: '\x1b[48;5;234m',
      bgDark: '\x1b[48;5;233m',
      bgPanel: '\x1b[48;5;235m'
    })
  },
  light: {
    label: 'Light',
    colors: Object.assign({}, BASE, {
      accent: '\x1b[38;5;130m',
      accentBright: '\x1b[38;5;166m',
      accentDeep: '\x1b[38;5;94m',
      accentDark: '\x1b[38;5;137m',
      red: '\x1b[38;5;160m',
      redBright: '\x1b[1m\x1b[38;5;124m',
      redDeep: '\x1b[38;5;124m',
      redDark: '\x1b[38;5;88m',
      text: '\x1b[38;5;236m',
      white: '\x1b[38;5;232m',
      gray: '\x1b[38;5;240m',
      grayDim: '\x1b[38;5;244m',
      border: '\x1b[38;5;250m',
      cyan: '\x1b[38;5;30m',
      blue: '\x1b[38;5;25m',
      green: '\x1b[38;5;28m',
      greenDim: '\x1b[38;5;22m',
      yellow: '\x1b[38;5;136m',
      orange: '\x1b[38;5;130m',
      bg: '\x1b[48;5;255m',
      bgDark: '\x1b[48;5;254m',
      bgPanel: '\x1b[48;5;253m'
    })
  },
  solarized: {
    label: 'Solarized',
    colors: Object.assign({}, BASE, {
      accent: '\x1b[38;5;136m',
      accentBright: '\x1b[38;5;178m',
      accentDeep: '\x1b[38;5;130m',
      accentDark: '\x1b[38;5;94m',
      red: '\x1b[38;5;160m',
      text: '\x1b[38;5;187m',
      white: '\x1b[38;5;230m',
      gray: '\x1b[38;5;245m',
      grayDim: '\x1b[38;5;240m',
      border: '\x1b[38;5;238m',
      cyan: '\x1b[38;5;37m',
      blue: '\x1b[38;5;33m',
      green: '\x1b[38;5;64m',
      yellow: '\x1b[38;5;136m',
      orange: '\x1b[38;5;166m',
      bg: '\x1b[48;5;234m',
      bgDark: '\x1b[48;5;235m',
      bgPanel: '\x1b[48;5;236m'
    })
  },
  mono: {
    label: 'Mono',
    colors: Object.assign({}, BASE, {
      accent: '\x1b[38;5;250m',
      accentBright: '\x1b[1m\x1b[38;5;255m',
      accentDeep: '\x1b[38;5;245m',
      accentDark: '\x1b[38;5;240m',
      red: '\x1b[38;5;203m',
      cyan: '\x1b[38;5;250m',
      blue: '\x1b[38;5;250m',
      green: '\x1b[38;5;250m',
      yellow: '\x1b[38;5;250m',
      orange: '\x1b[38;5;250m',
      text: '\x1b[38;5;252m',
      gray: '\x1b[38;5;245m',
      grayDim: '\x1b[38;5;242m',
      border: '\x1b[38;5;239m',
      bg: '\x1b[48;5;235m',
      bgDark: '\x1b[48;5;234m',
      bgPanel: '\x1b[48;5;236m'
    })
  }
};

const C = Object.assign({}, BASE);
let activeTheme = 'fynext';

function colorToRgb(value, fallback) {
  const color = String(value || '');
  const trueColor = /38;2;(\d+);(\d+);(\d+)/.exec(color);
  if (trueColor) return trueColor.slice(1).map(Number);
  const indexedColor = /38;5;(\d+)/.exec(color);
  if (!indexedColor) return fallback.slice();

  const index = Number(indexedColor[1]);
  if (index < 16) {
    const basic = [
      [0, 0, 0], [128, 0, 0], [0, 128, 0], [128, 128, 0],
      [0, 0, 128], [128, 0, 128], [0, 128, 128], [192, 192, 192],
      [128, 128, 128], [255, 0, 0], [0, 255, 0], [255, 255, 0],
      [0, 0, 255], [255, 0, 255], [0, 255, 255], [255, 255, 255]
    ];
    return basic[index] ? basic[index].slice() : fallback.slice();
  }
  if (index < 232) {
    const levels = [0, 95, 135, 175, 215, 255];
    const valueIndex = index - 16;
    return [
      levels[Math.floor(valueIndex / 36)],
      levels[Math.floor(valueIndex / 6) % 6],
      levels[valueIndex % 6]
    ];
  }
  if (index <= 255) {
    const gray = 8 + (index - 232) * 10;
    return [gray, gray, gray];
  }
  return fallback.slice();
}

function setTheme(name) {
  const requested = String(name || '').trim().toLowerCase();
  const key = requested === 'default' ? 'fynext' : requested;
  if (!THEMES[key]) return false;
  Object.assign(C, THEMES[key].colors);
  activeTheme = key;
  return true;
}

function getTheme() {
  return activeTheme;
}

function listThemes() {
  return Object.keys(THEMES);
}

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

const SWEEP_BASE_COLOR = 242;

function standardEase(progress) {
  const curve = (a, b, t) =>
    3 * (1 - t) * (1 - t) * t * a +
    3 * (1 - t) * t * t * b +
    t * t * t;
  let t = progress;
  for (let i = 0; i < 5; i += 1) {
    const x = curve(0.4, 0.2, t) - progress;
    const derivative = 3 * (1 - t) * (1 - t) * 0.4 +
      6 * (1 - t) * t * (0.2 - 0.4) +
      3 * t * t * (1 - 0.2);
    if (Math.abs(derivative) < 1e-5) break;
    t = Math.max(0, Math.min(1, t - x / derivative));
  }
  return curve(0, 1, t);
}

function sweepText(value, frame = 0, enabled = true) {
  const text = String(value == null ? '' : value);
  if (!enabled) return text;
  const chars = Array.from(text);
  // Duration scales with the distance travelled, at roughly one cell per frame.
  const passFrames = Math.max(36, chars.length + 6);
  const period = passFrames + 140;
  const tick = ((Math.floor(Number(frame) || 0) % period) + period) % period;
  const progress = tick < passFrames ? tick / (passFrames - 1) : -1;
  const center = progress >= 0
    ? -4 + ((chars.length + 8) * standardEase(progress))
    : -Infinity;
  const glow = progress >= 0 ? Math.sin(Math.PI * progress) : 0;
  const base = [108, 108, 108];
  const accent = colorToRgb(C.accentBright, [255, 175, 95]);

  return chars.map((char, index) => {
    const distance = Math.abs(index - center);
    const spatial = Math.exp(-(distance * distance) / 8);
    const strength = glow * spatial;
    if (strength < 0.025) return `\x1b[22;38;5;${SWEEP_BASE_COLOR}m${char}`;
    const rgb = base.map((channel, component) =>
      Math.round(channel + (accent[component] - channel) * strength)
    );
    const bright = strength > 0.85 ? '1;' : '22;';
    return `\x1b[${bright}38;2;${rgb.join(';')}m${char}`;
  }).join('') + C.reset;
}

module.exports = { C, S, sweepText, THEMES, setTheme, getTheme, listThemes, colorToRgb };
