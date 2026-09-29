import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildBadgedIcon,
  CONNECTED_COLOR,
  DISCONNECTED_COLOR,
  decodeIco,
  drawStatusDot,
  encodeIco,
  type Rgba,
} from '../src/tray/badge.js';
import { isReaderConnected } from '../src/tray/status.js';

function solid(width: number, height: number): Rgba {
  const pixels = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    pixels[i * 4] = 10;
    pixels[i * 4 + 1] = 20;
    pixels[i * 4 + 2] = 30;
    pixels[i * 4 + 3] = 255;
  }
  return { width, height, pixels };
}

function pixelAt(image: Rgba, x: number, y: number): number[] {
  const i = (y * image.width + x) * 4;
  return [image.pixels[i]!, image.pixels[i + 1]!, image.pixels[i + 2]!, image.pixels[i + 3]!];
}

test('decodes the shipped brand icon', () => {
  const decoded = decodeIco(readFileSync('assets/asliv.ico'));
  assert.ok(decoded, 'asliv.ico must decode, otherwise no badge can be drawn');
  assert.equal(decoded.width, 32);
  assert.equal(decoded.height, 32);
  assert.equal(decoded.pixels.length, 32 * 32 * 4);
});

test('encode then decode round-trips pixels', () => {
  const original = solid(32, 32);
  const decoded = decodeIco(encodeIco(original));
  assert.ok(decoded);
  assert.equal(decoded.width, 32);
  assert.deepEqual(pixelAt(decoded, 5, 7), [10, 20, 30, 255]);
});

test('the status dot lands in the bottom-right, not the top-left', () => {
  const image = drawStatusDot(solid(32, 32), CONNECTED_COLOR);
  const [tr, tg, tb] = pixelAt(image, 2, 2);
  assert.deepEqual([tr, tg, tb], [10, 20, 30], 'top-left must be untouched');

  const [br, bg, bb] = pixelAt(image, 25, 25);
  assert.ok(bg > br && bg > bb, `bottom-right should be green, got ${br},${bg},${bb}`);
});

test('connected and disconnected badges differ in colour', () => {
  const green = drawStatusDot(solid(32, 32), CONNECTED_COLOR);
  const red = drawStatusDot(solid(32, 32), DISCONNECTED_COLOR);
  const g = pixelAt(green, 25, 25);
  const r = pixelAt(red, 25, 25);
  assert.notDeepEqual(g, r);
  assert.ok(g[1]! > g[0]!, 'connected badge is green-dominant');
  assert.ok(r[0]! > r[1]!, 'disconnected badge is red-dominant');
});

test('the dot leaves most of the icon visible', () => {
  const image = drawStatusDot(solid(32, 32), CONNECTED_COLOR);
  let changed = 0;
  const original = solid(32, 32);
  for (let i = 0; i < image.pixels.length; i += 4) {
    if (image.pixels[i] !== original.pixels[i] || image.pixels[i + 1] !== original.pixels[i + 1]) {
      changed += 1;
    }
  }
  const ratio = changed / (32 * 32);
  assert.ok(
    ratio < 0.25,
    `badge should cover under 25% of the icon, covers ${Math.round(ratio * 100)}%`,
  );
});

test('a PNG-compressed icon is rejected rather than corrupted', () => {
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header.writeUInt8(32, 6);
  header.writeUInt8(32, 7);
  header.writeUInt32LE(8, 14);
  header.writeUInt32LE(22, 18);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(buildBadgedIcon(Buffer.concat([header, png]), CONNECTED_COLOR), null);
});

test('garbage input is rejected', () => {
  assert.equal(decodeIco(Buffer.alloc(4)), null);
  assert.equal(decodeIco(Buffer.from('not an icon at all, really')), null);
});

test('badge colour follows the reader connection state', () => {
  assert.equal(isReaderConnected({ state: 'CARD_PRESENT', reader: { name: 'r' } }), true);
  assert.equal(isReaderConnected({ state: 'WAITING_FOR_CARD', reader: { name: 'r' } }), true);
  assert.equal(isReaderConnected({ state: 'READER_CONNECTED', reader: { name: 'r' } }), true);
  assert.equal(isReaderConnected({ state: 'WAITING_FOR_READER', reader: null }), false);
  assert.equal(isReaderConnected({ state: 'STARTING', reader: null }), false);
});
