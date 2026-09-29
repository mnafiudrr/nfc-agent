import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ReaderProbe } from '../src/reader/ReaderProbe.js';
import { decodeReaderNames } from '../src/reader/winscard.js';
import { Logger } from '../src/logger.js';

const silent = new Logger('error', []);

test('probe reports unsupported off Windows so behaviour there is unchanged', () => {
  for (const platform of ['darwin', 'linux'] as NodeJS.Platform[]) {
    assert.equal(new ReaderProbe(silent, 10, platform).check(), 'unsupported');
  }
});

test('waitForReaders starts immediately when the platform is unsupported', () => {
  let called = 0;
  new ReaderProbe(silent, 10, 'darwin').waitForReaders(() => {
    called += 1;
  });
  assert.equal(called, 1, 'macOS must not wait for a probe that cannot run');
});

test('decodes the multi-string reader list winscard returns', () => {
  const raw = 'ACS ACR122U PICC Interface 0\0Another Reader 1\0\0';
  const buf = new Uint16Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    buf[i] = raw.charCodeAt(i);
  }
  assert.deepEqual(decodeReaderNames(buf, raw.length), [
    'ACS ACR122U PICC Interface 0',
    'Another Reader 1',
  ]);
});

test('decoding an empty reader list yields no names', () => {
  assert.deepEqual(decodeReaderNames(new Uint16Array([0, 0]), 2), []);
});

test('probe stop is safe to call when never started', () => {
  assert.doesNotThrow(() => new ReaderProbe(silent, 10, 'win32').stop());
});
