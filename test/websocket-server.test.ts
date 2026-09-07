import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { WebSocketServer } from '../src/websocket/WebSocketServer.js';
import type { ReaderManager } from '../src/reader/types.js';
import type { Logger } from '../src/logger.js';

const noopLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
} as unknown as Logger;

class FakeReaderManager extends EventEmitter implements ReaderManager {
  async start(): Promise<void> {}
  async stop(): Promise<void> {}
  getState() {
    return 'WAITING_FOR_CARD' as const;
  }
  getCurrentReader() {
    return null;
  }
}

function connect(
  port: number,
): Promise<{ socket: WebSocket; messages: Record<string, unknown>[] }> {
  return new Promise((resolve) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}`);
    const messages: Record<string, unknown>[] = [];
    socket.on('message', (data) => {
      messages.push(JSON.parse(String(data)));
    });
    socket.on('open', () => resolve({ socket, messages }));
  });
}

function waitFor<T>(get: () => T, predicate: (v: T) => boolean, timeoutMs = 2000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      try {
        if (predicate(get())) {
          resolve();
          return;
        }
      } catch {
        // keep polling
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error('timed out waiting for condition'));
        return;
      }
      setTimeout(tick, 10);
    };
    tick();
  });
}

function hasType(messages: Record<string, unknown>[], type: string): boolean {
  return messages.some((m) => m['type'] === type);
}

function hasUid(messages: Record<string, unknown>[], uid: string): boolean {
  return messages.some((m) => m['type'] === 'card_detected' && m['uid'] === uid);
}

test('client receives immediate reader_status on connect and broadcast events', async (t) => {
  const rm = new FakeReaderManager();
  const server = new WebSocketServer(
    rm as unknown as ReaderManager,
    { wsHost: '127.0.0.1', wsPort: 0, logLevel: 'error' },
    noopLogger,
  );
  server.wireReaderEvents();
  await server.start();
  const port = server.getPort();
  assert.ok(port && port > 0);

  const a = await connect(port);
  const b = await connect(port);
  t.after(async () => {
    a.socket.close();
    b.socket.close();
    await server.stop();
  });

  await waitFor(
    () => a.messages.length,
    (n) => n >= 1,
  );
  assert.deepEqual(a.messages[0], {
    type: 'reader_status',
    status: 'disconnected',
    reader: '',
  });

  rm.emit('cardDetected', { uid: '047A218C916B80' });
  await waitFor(
    () => hasUid(a.messages, '047A218C916B80'),
    (v) => v,
  );
  await waitFor(
    () => hasUid(b.messages, '047A218C916B80'),
    (v) => v,
  );
  assert.deepEqual(
    a.messages.find((m) => m['uid'] === '047A218C916B80'),
    {
      type: 'card_detected',
      uid: '047A218C916B80',
    },
  );
  assert.deepEqual(
    b.messages.find((m) => m['uid'] === '047A218C916B80'),
    {
      type: 'card_detected',
      uid: '047A218C916B80',
    },
  );

  rm.emit('cardRemoved');
  await waitFor(
    () => hasType(a.messages, 'card_removed'),
    (v) => v,
  );
  assert.deepEqual(
    a.messages.find((m) => m['type'] === 'card_removed'),
    {
      type: 'card_removed',
    },
  );

  a.socket.close();
  await waitFor(
    () => rm.listenerCount('cardDetected'),
    () => true,
    100,
  );

  rm.emit('cardDetected', { uid: 'AABBCCDD' });
  await waitFor(
    () => hasUid(b.messages, 'AABBCCDD'),
    (v) => v,
  );
  assert.deepEqual(
    b.messages.find((m) => m['uid'] === 'AABBCCDD'),
    {
      type: 'card_detected',
      uid: 'AABBCCDD',
    },
  );
});

test('server binds to loopback host', async () => {
  const rm = new FakeReaderManager();
  const server = new WebSocketServer(
    rm as unknown as ReaderManager,
    { wsHost: '127.0.0.1', wsPort: 0, logLevel: 'error' },
    noopLogger,
  );
  await server.start();
  const address = server.getPort();
  assert.ok(address);
  await server.stop();
});
