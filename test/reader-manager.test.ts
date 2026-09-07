import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PcscReader, PcscReaderEvents } from '../src/reader/PcscReader.js';
import { ReaderManagerImpl } from '../src/reader/ReaderManager.js';
import type { Logger } from '../src/logger.js';

const noopLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
} as unknown as Logger;

class FakePcsc {
  private listeners = new Map<keyof PcscReaderEvents, ((...args: unknown[]) => void)[]>();

  on<K extends keyof PcscReaderEvents>(event: K, listener: PcscReaderEvents[K]): void {
    const list = this.listeners.get(event) ?? [];
    list.push(listener as (...args: unknown[]) => void);
    this.listeners.set(event, list);
  }

  start(): void {}
  stop(): void {
    this.listeners.clear();
  }

  emit<K extends keyof PcscReaderEvents>(event: K, ...args: Parameters<PcscReaderEvents[K]>): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(...args);
    }
  }
}

type EventLog = { event: string; data?: unknown }[];

function makeManager() {
  const pcsc = new FakePcsc() as unknown as PcscReader;
  const manager = new ReaderManagerImpl(pcsc, noopLogger);
  const log: EventLog = [];
  manager.on('readerConnected', (r) => log.push({ event: 'readerConnected', data: r.name }));
  manager.on('readerDisconnected', (r) => log.push({ event: 'readerDisconnected', data: r.name }));
  manager.on('cardDetected', (c) => log.push({ event: 'cardDetected', data: c.uid }));
  manager.on('cardRemoved', () => log.push({ event: 'cardRemoved' }));
  return { pcsc, manager, log };
}

test('starts in WAITING_FOR_READER with no reader', async () => {
  const { manager } = makeManager();
  await manager.start();
  assert.equal(manager.getState(), 'WAITING_FOR_READER');
  assert.equal(manager.getCurrentReader(), null);
});

test('reader connect transitions to WAITING_FOR_CARD and emits connected', async () => {
  const { pcsc, manager, log } = makeManager();
  await manager.start();
  pcsc.emit('readerConnected', 'ACS ACR122U');
  assert.equal(manager.getState(), 'WAITING_FOR_CARD');
  assert.deepEqual(manager.getCurrentReader(), { name: 'ACS ACR122U' });
  assert.deepEqual(log, [{ event: 'readerConnected', data: 'ACS ACR122U' }]);
});

test('card insert emits cardDetected once and transitions to CARD_PRESENT', async () => {
  const { pcsc, manager, log } = makeManager();
  await manager.start();
  pcsc.emit('readerConnected', 'ACS ACR122U');
  pcsc.emit('cardInserted', '047A218C916B80');
  assert.equal(manager.getState(), 'CARD_PRESENT');
  assert.deepEqual(log.at(-1), { event: 'cardDetected', data: '047A218C916B80' });
});

test('duplicate card insert does not emit a second cardDetected', async () => {
  const { pcsc, manager, log } = makeManager();
  await manager.start();
  pcsc.emit('readerConnected', 'ACS ACR122U');
  pcsc.emit('cardInserted', '047A218C916B80');
  pcsc.emit('cardInserted', '047A218C916B80');
  const detected = log.filter((e) => e.event === 'cardDetected');
  assert.equal(detected.length, 1);
});

test('different card on the reader emits a new cardDetected', async () => {
  const { pcsc, manager, log } = makeManager();
  await manager.start();
  pcsc.emit('readerConnected', 'ACS ACR122U');
  pcsc.emit('cardInserted', '047A218C916B80');
  pcsc.emit('cardInserted', 'AABBCCDD');
  const detected = log.filter((e) => e.event === 'cardDetected');
  assert.equal(detected.length, 2);
});

test('card remove then re-insert emits cardDetected again (new tap)', async () => {
  const { pcsc, manager, log } = makeManager();
  await manager.start();
  pcsc.emit('readerConnected', 'ACS ACR122U');
  pcsc.emit('cardInserted', '047A218C916B80');
  pcsc.emit('cardRemoved');
  assert.equal(manager.getState(), 'WAITING_FOR_CARD');
  pcsc.emit('cardInserted', '047A218C916B80');
  const detected = log.filter((e) => e.event === 'cardDetected');
  assert.equal(detected.length, 2);
});

test('card removed emits cardRemoved only when a card was present', async () => {
  const { pcsc, manager, log } = makeManager();
  await manager.start();
  pcsc.emit('cardRemoved');
  assert.equal(log.filter((e) => e.event === 'cardRemoved').length, 0);
  pcsc.emit('readerConnected', 'ACS ACR122U');
  pcsc.emit('cardInserted', '047A218C916B80');
  pcsc.emit('cardRemoved');
  assert.equal(log.filter((e) => e.event === 'cardRemoved').length, 1);
});

test('reader disconnect from CARD_PRESENT returns to WAITING_FOR_READER', async () => {
  const { pcsc, manager, log } = makeManager();
  await manager.start();
  pcsc.emit('readerConnected', 'ACS ACR122U');
  pcsc.emit('cardInserted', '047A218C916B80');
  pcsc.emit('readerDisconnected', 'ACS ACR122U');
  assert.equal(manager.getState(), 'WAITING_FOR_READER');
  assert.equal(manager.getCurrentReader(), null);
  assert.deepEqual(log.at(-1), { event: 'readerDisconnected', data: 'ACS ACR122U' });
});

test('reader reconnected after disconnect (hot-plug) works again', async () => {
  const { pcsc, manager } = makeManager();
  await manager.start();
  pcsc.emit('readerConnected', 'ACS ACR122U');
  pcsc.emit('readerDisconnected', 'ACS ACR122U');
  assert.equal(manager.getState(), 'WAITING_FOR_READER');
  pcsc.emit('readerConnected', 'ACS ACR122U');
  assert.equal(manager.getState(), 'WAITING_FOR_CARD');
});
