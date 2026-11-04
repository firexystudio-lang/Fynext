#!/usr/bin/env node
'use strict';

const { main } = require('../src/cli/main');

main().catch((err) => {
  try {
    process.stdout.write('\x1b[?25h\x1b[?2004l\x1b[?1049l');
  } catch (_) {
    /* yoksay */
  }
  process.stderr.write(`fynext: ${err && err.stack ? err.stack : err}\n`);
  process.exit(1);
});
