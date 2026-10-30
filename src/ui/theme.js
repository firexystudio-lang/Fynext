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
  const orange = [255, 135, 0];

  return chars.map((char, index) => {
    const distance = Math.abs(index - center);
    const spatial = Math.exp(-(distance * distance) / 8);
    const strength = glow * spatial;
    if (strength < 0.025) return `\x1b[0;38;5;${SWEEP_BASE_COLOR}m${char}`;
    const rgb = base.map((channel, component) =>
      Math.round(channel + (orange[component] - channel) * strength)
    );
    const bright = strength > 0.88 ? '1;' : '';
    return `\x1b[0;${bright}38;2;${rgb.join(';')}m${char}`;
  }).join('') + C.reset;
}

module.exports = { C, S, sweepText };
