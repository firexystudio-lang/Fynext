'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { pickPort } = require('../../src/robot/face-bridge');
const { createFaceBridge } = require('../../src/robot/face-bridge');

class FakeSerialPort extends EventEmitter {
  static async list() {
    return [{ path: 'COM9' }];
  }

  constructor(options) {
    super();
    this.options = options;
    this.isOpen = false;
    this.writes = [];
    FakeSerialPort.instance = this;
  }

  open(callback) {
    this.isOpen = true;
    callback(null);
  }

  write(value, callback) {
    this.writes.push(value);
    if (callback) callback(null);
  }

  drain(callback) {
    callback(null);
  }

  close(callback) {
    this.isOpen = false;
    this.emit('close');
    if (callback) callback(null);
  }
}

test('pickPort prefers a USB serial adapter over an unknown port', () => {
  const ports = [
    { path: 'COM1', manufacturer: 'Standard Ports' },
    { path: 'COM3', manufacturer: 'wch.cn' },
  ];
  assert.equal(pickPort(ports), 'COM3');
});

test('pickPort falls back to the first port and handles empty input', () => {
  assert.equal(pickPort([{ path: 'COM7', pnpId: 'ACPI\\PNP0501' }]), 'COM7');
  assert.equal(pickPort([]), null);
  assert.equal(pickPort(null), null);
});

test('face bridge activates each session and sends task progress', async () => {
  const face = createFaceBridge(
    { robotFaceEnabled: true, robotFacePort: 'auto', robotFaceBaud: 115200 },
    FakeSerialPort
  );
  face.start();
  await new Promise((resolve) => setTimeout(resolve, 20));
  face.startSession();
  face.task('coding', 'Editing src/main.js', { progress: 50 });
  face.event('tool_end', 'Action complete', { progress: 100 });
  await new Promise((resolve) => setTimeout(resolve, 100));

  const writes = FakeSerialPort.instance.writes.map((line) => JSON.parse(line));
  assert.equal(writes.filter((message) => message.t === 'session' && message.v === 'start').length, 2);
  assert.equal(writes.filter((message) => message.t === 'activate' && message.v === 'fynext esp32').length, 2);
  assert.ok(writes.some((message) =>
    message.t === 'task' &&
    message.v === 'coding' &&
    message.text === 'Editing src/main.js' &&
    message.progress === 50
  ));
  assert.ok(writes.some((message) =>
    message.t === 'event' &&
    message.v === 'tool_end' &&
    message.text === 'Action complete' &&
    message.progress === 100
  ));

  face.close();
  assert.equal(JSON.parse(FakeSerialPort.instance.writes.at(-1)).v, 'end');
});
