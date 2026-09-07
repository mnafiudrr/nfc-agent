import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  readerStatusMessage,
  cardDetectedMessage,
  cardRemovedMessage,
  serialize,
} from '../src/websocket/messages.js';

test('readerStatusMessage connected serializes correctly', () => {
  const msg = readerStatusMessage('connected', { name: 'ACS ACR122U' });
  assert.deepEqual(msg, { type: 'reader_status', status: 'connected', reader: 'ACS ACR122U' });
});

test('readerStatusMessage disconnected serializes correctly', () => {
  const msg = readerStatusMessage('disconnected', { name: 'ACS ACR122U' });
  assert.deepEqual(msg, { type: 'reader_status', status: 'disconnected', reader: 'ACS ACR122U' });
});

test('cardDetectedMessage serializes correctly', () => {
  const msg = cardDetectedMessage('047A218C916B80');
  assert.deepEqual(msg, { type: 'card_detected', uid: '047A218C916B80' });
});

test('cardRemovedMessage serializes correctly', () => {
  assert.deepEqual(cardRemovedMessage(), { type: 'card_removed' });
});

test('serialize produces valid JSON with the expected shape', () => {
  const raw = serialize(cardDetectedMessage('047A218C916B80'));
  assert.equal(typeof raw, 'string');
  assert.deepEqual(JSON.parse(raw), { type: 'card_detected', uid: '047A218C916B80' });
});
