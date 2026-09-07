import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUid } from '../src/utils/uid.js';

test('normalizes byte array to uppercase hex without separators', () => {
  assert.equal(normalizeUid([0x04, 0x7a, 0x21, 0x8c, 0x91, 0x6b, 0x80]), '047A218C916B80');
});

test('normalizes a Buffer to uppercase hex', () => {
  assert.equal(normalizeUid(Buffer.from([0x04, 0x7a, 0x21, 0x8c])), '047A218C');
});

test('normalizes a space-separated hex string', () => {
  assert.equal(normalizeUid('04 7a 21 8c 91 6b 80'), '047A218C916B80');
});

test('normalizes a hex string with separators to uppercase', () => {
  assert.equal(normalizeUid('04:7a:21:8c'), '047A218C');
});

test('normalizes a lowercase hex string to uppercase', () => {
  assert.equal(normalizeUid('047a218c'), '047A218C');
});

test('pads single hex digits with a leading zero', () => {
  assert.equal(normalizeUid([0x0a, 0x02]), '0A02');
});

test('keeps the UID as a string, never a number', () => {
  const uid = normalizeUid([0x04, 0x7a, 0x21, 0x8c, 0x91, 0x6b, 0x80]);
  assert.equal(typeof uid, 'string');
});
