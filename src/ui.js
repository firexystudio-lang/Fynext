'use strict';

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

let writer = null;
function setWriter(fn) {
  writer = typeof fn === 'function' ? fn : null;
}
function out(s) {
  if (writer) writer(s);
  else process.stdout.write(s);
}

function line(text) {
  out(text + '\n');
}

function info(text) {
  line(`${C.cyan}●${C.reset} ${text}`);
}

function ok(text) {
  line(`${C.green}✓${C.reset} ${text}`);
}

function warn(text) {
  line(`${C.yellow}!${C.reset} ${text}`);
}

function error(text) {
  line(`${C.red}✗${C.reset} ${text}`);
}

function dim(text) {
  line(`${C.dim}${text}${C.reset}`);
}

function agentLabel(name) {
  return `${C.bold}${C.green}${name}${C.reset}`;
}

function toolStart(name, args) {
  let a = '';
  try {
    a = JSON.stringify(args);
  } catch (_) {
    a = String(args);
  }
  if (a.length > 160) a = a.slice(0, 160) + '…';
  line(`${C.yellow}⚙ ${name}${C.reset} ${C.dim}${a}${C.reset}`);
}

function toolEnd(name, summary) {
  line(`${C.dim}  ↳ ${name}: ${summary}${C.reset}`);
}

function banner(cfg) {
  out(`${C.cyan}  ______   ${C.reset}\n`);
  out(`${C.cyan} |  ___|_   _ _ __   ___ _ __ ${C.reset}\n`);
  out(`${C.cyan} | |_  | | | | '_ \\ / _ \\ '__|${C.reset}\n`);
  out(`${C.cyan} |  _| | |_| | | | |  __/ |   ${C.reset}\n`);
  out(`${C.cyan} |_|    \\__, |_| |_|\\___|_|   ${C.reset}\n`);
  out(`${C.cyan}        |___/${C.reset}  ${C.bold}${cfg.agentName}${C.reset} ${C.dim}| ${cfg.model} | ${cfg.workspace}${C.reset}\n\n`);
}

module.exports = { C, setWriter, line, info, ok, warn, error, dim, agentLabel, toolStart, toolEnd, banner };
