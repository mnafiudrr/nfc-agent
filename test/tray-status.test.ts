import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_TOOLTIP_LENGTH, statusLabel, tooltip } from '../src/tray/status.js';
import { NoopTrayController } from '../src/tray/NoopTrayController.js';
import { createTrayController } from '../src/tray/createTray.js';
import { Logger } from '../src/logger.js';
import type { TrayStatus } from '../src/tray/types.js';

const reader = { name: 'ACS ACR122U PICC Interface 0' };

test('status label covers every reader state', () => {
  const cases: [TrayStatus, string][] = [
    [{ state: 'STARTING', reader: null }, 'Starting...'],
    [{ state: 'WAITING_FOR_READER', reader: null }, 'Waiting for reader'],
    [{ state: 'READER_CONNECTED', reader }, `Ready - ${reader.name}`],
    [{ state: 'WAITING_FOR_CARD', reader }, `Ready - ${reader.name}`],
    [{ state: 'CARD_PRESENT', reader }, `Card present - ${reader.name}`],
  ];
  for (const [status, expected] of cases) {
    assert.equal(statusLabel(status), expected);
  }
});

test('status label degrades gracefully when the reader is unknown', () => {
  assert.equal(statusLabel({ state: 'WAITING_FOR_CARD', reader: null }), 'Ready');
  assert.equal(statusLabel({ state: 'CARD_PRESENT', reader: null }), 'Card present');
});

test('tooltip carries the app name and the state', () => {
  const text = tooltip({ state: 'CARD_PRESENT', reader });
  assert.match(text, /^ACR122U Agent\n/);
  assert.match(text, /Card present/);
});

test('tooltip is truncated to what Shell_NotifyIcon accepts', () => {
  const long = { name: 'R'.repeat(400) };
  const text = tooltip({ state: 'CARD_PRESENT', reader: long });
  assert.ok(
    text.length <= MAX_TOOLTIP_LENGTH,
    `expected <= ${MAX_TOOLTIP_LENGTH}, got ${text.length}`,
  );
  assert.ok(text.endsWith('...'));
});

test('noop controller satisfies the interface without side effects', () => {
  const tray = new NoopTrayController();
  assert.doesNotThrow(() => {
    tray.start();
    tray.setStatus({ state: 'CARD_PRESENT', reader });
    tray.stop();
  });
});

test('non-windows platforms get the noop controller', async () => {
  const log = new Logger('error', []);
  const options = { wsUrl: 'ws://127.0.0.1:8765', logFile: null, onQuit: () => {} };
  for (const platform of ['darwin', 'linux'] as NodeJS.Platform[]) {
    const tray = createTrayController(options, log, 'unused', platform);
    assert.ok(tray instanceof NoopTrayController, `${platform} should not build a Win32 tray`);
  }
});

test('noop controller accepts notifications without side effects', () => {
  const tray = new NoopTrayController();
  assert.doesNotThrow(() => tray.notify('ACR122U Agent', 'Device is plugged'));
});
