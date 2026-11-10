'use strict';

const RECONNECT_MS = 4000;
const FLUSH_MS = 40;
const SPEAK_INTERVAL_MS = 50;

let SerialPort = null;
let serialPortError = null;
try {
  ({ SerialPort } = require('serialport'));
} catch (err) {
  serialPortError = err;
}

const PORT_HINTS = /(wch|ch34|ch910|silicon|cp210|espressif|ftdi|arduino|usb.?serial)/i;

function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  if (number < min) return min;
  if (number > max) return max;
  return number;
}

function pickPort(ports) {
  if (!Array.isArray(ports) || ports.length === 0) return null;
  const scored = ports.map((port) => {
    const text = [port.manufacturer, port.friendlyName, port.pnpId, port.path]
      .filter(Boolean)
      .join(' ');
    return { port, score: PORT_HINTS.test(text) ? 2 : 1 };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].port.path;
}

async function listPorts() {
  if (!SerialPort) {
    throw new Error('serialport module is not installed. Run: npm install serialport');
  }
  return SerialPort.list();
}

function openPort(port) {
  return new Promise((resolve, reject) => {
    port.open((err) => (err ? reject(err) : resolve()));
  });
}

function createFaceBridge(cfg, serialPortDriver = SerialPort) {
  const state = {
    cfg,
    port: null,
    path: null,
    connected: false,
    connecting: false,
    closed: false,
    stopping: false,
    pending: new Map(),
    flushTimer: null,
    reconnectTimer: null,
    celebrateTimer: null,
    lastWriteAt: 0,
    lastSpeakAt: 0,
    expression: 'idle',
    lastEvent: null,
    error: serialPortDriver ? null : serialPortError ? serialPortError.message : null,
    rx: '',
  };

  function scheduleReconnect(delay) {
    if (state.reconnectTimer || state.closed || state.stopping) return;
    if (!cfg.robotFaceEnabled) return;
    state.reconnectTimer = setTimeout(() => {
      state.reconnectTimer = null;
      connect();
    }, delay == null ? RECONNECT_MS : delay);
    if (typeof state.reconnectTimer.unref === 'function') state.reconnectTimer.unref();
  }

  function onData(chunk) {
    state.rx += chunk.toString('utf8');
    let index = state.rx.indexOf('\n');
    while (index >= 0) {
      const line = state.rx.slice(0, index).trim();
      state.rx = state.rx.slice(index + 1);
      if (line) {
        try {
          state.lastEvent = JSON.parse(line);
        } catch (_) {
          state.lastEvent = { t: 'text', v: line };
        }
      }
      index = state.rx.indexOf('\n');
    }
    if (state.rx.length > 1024) state.rx = '';
  }

  function onClose(port) {
    if (state.port !== port) return;
    state.connected = false;
    state.port = null;
    if (!state.stopping && !state.closed) scheduleReconnect();
  }

  function onError(err, port) {
    if (state.port !== port) return;
    state.error = err && err.message ? err.message : String(err);
    try {
      port.close(() => {});
    } catch (_) {
      /* yoksay */
    }
  }

  async function connect() {
    if (state.closed || state.connecting || state.connected || state.stopping) return;
    if (!cfg.robotFaceEnabled || !serialPortDriver) return;
    state.connecting = true;
    try {
      const ports = await serialPortDriver.list();
      let target = String(cfg.robotFacePort || 'auto');
      if (!target || target === 'auto') target = pickPort(ports);
      if (!target) {
        state.error = 'no serial port found';
        scheduleReconnect();
        return;
      }
      const port = new serialPortDriver({
        path: target,
        baudRate: Number(cfg.robotFaceBaud) || 115200,
        autoOpen: false,
      });
      await openPort(port);
      state.port = port;
      state.path = target;
      state.connected = true;
      state.error = null;
      state.rx = '';
      port.on('data', onData);
      port.on('close', () => onClose(port));
      port.on('error', (err) => onError(err, port));
      beginDeviceSession();
      sendJson({ t: 'ping' });
    } catch (err) {
      state.error = err && err.message ? err.message : String(err);
      scheduleReconnect();
    } finally {
      state.connecting = false;
    }
  }

  function flush() {
    state.flushTimer = null;
    if (!state.connected || !state.port || state.pending.size === 0) return;
    const lines = Array.from(state.pending.values());
    state.pending.clear();
    state.lastWriteAt = Date.now();
    for (const line of lines) {
      try {
        state.port.write(line);
      } catch (err) {
        state.error = err && err.message ? err.message : String(err);
      }
    }
  }

  function scheduleFlush() {
    if (state.flushTimer) return;
    const wait = Math.max(0, FLUSH_MS - (Date.now() - state.lastWriteAt));
    state.flushTimer = setTimeout(flush, wait);
    if (typeof state.flushTimer.unref === 'function') state.flushTimer.unref();
  }

  function sendJson(payload) {
    if (!cfg.robotFaceEnabled || !state.connected) return;
    state.pending.set(payload.t, JSON.stringify(payload) + '\n');
    scheduleFlush();
  }

  function beginDeviceSession() {
    sendJson({ t: 'session', v: 'start' });
    sendJson({ t: 'activate', v: 'fynext esp32' });
  }

  function clearCelebrateTimer() {
    if (!state.celebrateTimer) return;
    clearTimeout(state.celebrateTimer);
    state.celebrateTimer = null;
  }

  function stop() {
    state.stopping = true;
    if (state.reconnectTimer) {
      clearTimeout(state.reconnectTimer);
      state.reconnectTimer = null;
    }
    if (state.flushTimer) {
      clearTimeout(state.flushTimer);
      state.flushTimer = null;
    }
    clearCelebrateTimer();
    state.pending.clear();
    const port = state.port;
    const wasConnected = state.connected;
    state.port = null;
    state.connected = false;
    if (port && wasConnected) {
      const closePort = () => {
        try {
          if (port.isOpen) port.close(() => {});
        } catch (_) {
          /* yoksay */
        }
      };
      try {
        port.write('{"t":"session","v":"end"}\n', (writeError) => {
          if (writeError) {
            closePort();
            return;
          }
          port.drain(() => closePort());
        });
      } catch (_) {
        closePort();
      }
    } else if (port) {
      try {
        if (port.isOpen) port.close(() => {});
      } catch (_) {
        /* yoksay */
      }
    }
  }

  function start() {
    state.closed = false;
    state.stopping = false;
    if (cfg.robotFaceEnabled) connect();
  }

  function setEnabled(enabled) {
    cfg.robotFaceEnabled = !!enabled;
    if (enabled) {
      state.closed = false;
      state.stopping = false;
      scheduleReconnect(0);
    } else {
      stop();
    }
  }

  function setPort(port) {
    cfg.robotFacePort = port || 'auto';
    if (!cfg.robotFaceEnabled) return;
    stop();
    state.stopping = false;
    state.closed = false;
    scheduleReconnect(50);
  }

  function activate() {
    clearCelebrateTimer();
    if (state.connected) {
      beginDeviceSession();
      return;
    }
    if (cfg.robotFaceEnabled) scheduleReconnect(0);
  }

  function startSession() {
    activate();
  }

  function status(name) {
    sendJson({ t: 'status', v: String(name || 'idle') });
  }

  function task(name, text, options = {}) {
    const payload = { t: 'task', v: String(name || 'idle') };
    if (text != null) payload.text = String(text);
    if (options.direction) payload.direction = String(options.direction);
    if (Number.isFinite(Number(options.progress))) payload.progress = Number(options.progress);
    sendJson(payload);
  }

  function event(name, text, options = {}) {
    const payload = { t: 'event', v: String(name || '') };
    if (text != null) payload.text = String(text);
    if (options.direction) payload.direction = String(options.direction);
    if (Number.isFinite(Number(options.progress))) payload.progress = Number(options.progress);
    sendJson(payload);
  }

  function progress(value, text) {
    const payload = { t: 'progress', v: clamp(value, 0, 100) };
    if (text != null) payload.text = String(text);
    sendJson(payload);
  }

  function emotion(name) {
    const value = String(name || 'idle');
    state.expression = value;
    sendJson({ t: 'emotion', v: value });
  }

  function look(x, y) {
    sendJson({ t: 'look', x: clamp(x, -1, 1), y: clamp(y, -1, 1) });
  }

  function blink() {
    sendJson({ t: 'blink' });
  }

  function speak(level) {
    const value = clamp(level, 0, 1);
    const now = Date.now();
    if (now - state.lastSpeakAt < SPEAK_INTERVAL_MS) return;
    state.lastSpeakAt = now;
    sendJson({ t: 'speak', v: Number(value.toFixed(3)) });
  }

  function bright(value) {
    sendJson({ t: 'bright', v: Math.round(clamp(value, 0, 255)) });
  }

  function celebrate() {
    event('response_complete', 'Done', { progress: 100 });
    clearCelebrateTimer();
    state.celebrateTimer = setTimeout(() => {
      state.celebrateTimer = null;
      if (cfg.robotFaceEnabled) status('idle');
    }, 1800);
    if (typeof state.celebrateTimer.unref === 'function') state.celebrateTimer.unref();
  }

  function describe() {
    return {
      enabled: !!cfg.robotFaceEnabled,
      available: !!serialPortDriver,
      connected: state.connected,
      port: state.path || cfg.robotFacePort || 'auto',
      error: state.error,
      expression: state.expression,
      lastEvent: state.lastEvent,
    };
  }

  return {
    available: !!serialPortDriver,
    error: serialPortDriver ? null : serialPortError ? serialPortError.message : null,
    start,
    stop,
    close: () => {
      state.closed = true;
      stop();
    },
    setEnabled,
    setPort,
    activate,
    startSession,
    status,
    task,
    event,
    progress,
    emotion,
    look,
    blink,
    speak,
    bright,
    celebrate,
    describe,
    isEnabled: () => !!cfg.robotFaceEnabled,
    isConnected: () => state.connected,
    currentPort: () => state.path,
    lastEvent: () => state.lastEvent,
  };
}

module.exports = { createFaceBridge, listPorts, pickPort };
