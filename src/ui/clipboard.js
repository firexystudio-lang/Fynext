'use strict';

const { spawn } = require('child_process');

const POWERSHELL_CLIPBOARD_SCRIPT =
  '$b=[Console]::In.ReadToEnd(); ' +
  '$t=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b.Trim())); ' +
  'Set-Clipboard -Value $t';

function runCommand(command, args, input) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(command, args, {
        stdio: ['pipe', 'ignore', 'ignore'],
        windowsHide: true
      });
    } catch (err) {
      reject(err);
      return;
    }
    let settled = false;
    const finish = (err) => {
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else resolve();
    };
    child.on('error', finish);
    child.on('close', (code) => {
      if (code === 0) finish();
      else finish(new Error(`${command} exited with code ${code}`));
    });
    if (child.stdin) {
      child.stdin.on('error', () => {});
      child.stdin.end(input, 'utf8');
    }
  });
}

async function copyToClipboard(text) {
  const value = String(text == null ? '' : text);

  if (process.platform === 'win32') {
    if (/^[\x00-\x7f]*$/.test(value)) {
      return runCommand('clip.exe', [], value);
    }
    const encoded = Buffer.from(value, 'utf8').toString('base64');
    return runCommand(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', POWERSHELL_CLIPBOARD_SCRIPT],
      encoded
    );
  }

  if (process.platform === 'darwin') {
    return runCommand('pbcopy', [], value);
  }

  const candidates = [
    ['wl-copy', []],
    ['xclip', ['-selection', 'clipboard']],
    ['xsel', ['--clipboard', '--input']]
  ];
  let lastError = null;
  for (const [command, args] of candidates) {
    try {
      await runCommand(command, args, value);
      return;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('No clipboard tool found');
}

function extractCodeBlocks(text) {
  const source = String(text == null ? '' : text)
    .replace(/\r\n?/g, '\n')
    .split('\n');
  const blocks = [];
  let index = 0;
  while (index < source.length) {
    if (!/^\s*```/.test(source[index])) {
      index += 1;
      continue;
    }
    let end = index + 1;
    while (end < source.length && !/^\s*```\s*$/.test(source[end])) end += 1;
    blocks.push(source.slice(index + 1, end).join('\n'));
    index = end + 1;
  }
  return blocks;
}

module.exports = { copyToClipboard, extractCodeBlocks };
