'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PLAY_MP3_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  'Add-Type -AssemblyName PresentationCore',
  'Add-Type -AssemblyName WindowsBase',
  '$player = New-Object System.Windows.Media.MediaPlayer',
  '$player.Open([Uri]::new($env:FYNEXT_COMPLETION_SOUND, [UriKind]::Absolute))',
  '$player.add_MediaEnded({',
  '  $player.Close()',
  '  [System.Windows.Threading.Dispatcher]::CurrentDispatcher.InvokeShutdown()',
  '})',
  '$player.add_MediaFailed({',
  '  [System.Windows.Threading.Dispatcher]::CurrentDispatcher.InvokeShutdown()',
  '})',
  '$player.Play()',
  '[System.Windows.Threading.Dispatcher]::Run()'
].join('\n');

const WINDOWS_NOTIFICATION_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  'Add-Type -AssemblyName System.Windows.Forms',
  'Add-Type -AssemblyName System.Drawing',
  '$notification = New-Object System.Windows.Forms.NotifyIcon',
  '$notification.Icon = [System.Drawing.SystemIcons]::Information',
  '$notification.Visible = $true',
  '$notification.BalloonTipTitle = \'Fynext\'',
  '$notification.BalloonTipText = \'Response complete. The completion sound is playing.\'',
  '$notification.BalloonTipIcon = [System.Windows.Forms.ToolTipIcon]::Info',
  '$notification.ShowBalloonTip(5000)',
  'Start-Sleep -Seconds 7',
  '$notification.Visible = $false',
  '$notification.Dispose()'
].join('\n');

function showCompletionNotification(onError) {
  if (process.platform !== 'win32') return false;

  let child;
  try {
    child = spawn('powershell.exe', [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-WindowStyle',
      'Hidden',
      '-STA',
      '-Command',
      WINDOWS_NOTIFICATION_SCRIPT
    ], {
      windowsHide: true,
      stdio: 'ignore'
    });
  } catch (err) {
    if (onError) onError(err);
    return false;
  }

  let failureReported = false;
  const reportFailure = (err) => {
    if (failureReported) return;
    failureReported = true;
    if (onError) onError(err);
  };
  child.on('error', reportFailure);
  child.on('close', (code) => {
    if (code !== 0) {
      reportFailure(new Error(`Windows notification exited with code ${code}.`));
    }
  });
  return true;
}

function playCompletionSound(root, onError) {
  if (process.platform !== 'win32') return false;
  const soundPath = path.join(root, 'sounds', 'complate.mp3');
  if (!fs.existsSync(soundPath)) {
    if (onError) onError(new Error(`Completion sound not found: ${soundPath}`));
    return false;
  }

  let child;
  try {
    child = spawn('powershell.exe', [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-WindowStyle',
      'Hidden',
      '-STA',
      '-Command',
      PLAY_MP3_SCRIPT
    ], {
      windowsHide: true,
      stdio: 'ignore',
      env: Object.assign({}, process.env, { FYNEXT_COMPLETION_SOUND: soundPath })
    });
  } catch (err) {
    if (onError) onError(err);
    return false;
  }

  let failureReported = false;
  const reportFailure = (err) => {
    if (failureReported) return;
    failureReported = true;
    if (onError) onError(err);
  };
  child.on('error', reportFailure);
  child.on('close', (code) => {
    if (code !== 0) {
      reportFailure(new Error(`Completion sound player exited with code ${code}.`));
    }
  });
  return true;
}

module.exports = { playCompletionSound, showCompletionNotification };
