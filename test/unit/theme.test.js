'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const theme = require('../../src/ui/theme');
const { Screen } = require('../../src/ui/screen');

test('thinking animation uses the active theme accent', () => {
  try {
    theme.setTheme('dark');
    const darkSweep = theme.sweepText('fynext animation', 18);

    theme.setTheme('light');
    const lightSweep = theme.sweepText('fynext animation', 18);

    assert.notEqual(darkSweep, lightSweep);
    assert.match(darkSweep, /38;2;135;215;255/);
    assert.match(lightSweep, /38;2;215;95;0/);
  } finally {
    theme.setTheme('fynext');
  }
});

test('large Fynext logo uses the active theme accent colors', () => {
  try {
    theme.setTheme('dark');
    const screen = new Screen({ tty: false });
    screen._trueColor = true;

    assert.match(screen._paintArt(['X'], 1)[0], /38;2;135;215;255/);
  } finally {
    theme.setTheme('fynext');
  }
});

test('default theme alias restores the original Fynext palette', () => {
  theme.setTheme('dark');

  assert.equal(theme.setTheme('default'), true);
  assert.equal(theme.getTheme(), 'fynext');
  assert.equal(theme.C.accentBright, theme.THEMES.fynext.colors.accentBright);
});
