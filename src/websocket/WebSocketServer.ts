import { WebSocketServer as WsServer, WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';
import type { Logger } from '../logger.js';
import type { Config } from '../config.js';
import type { ReaderManager, ReaderInfo } from '../reader/types.js';
import {
  cardDetectedMessage,
  cardRemovedMessage,
  readerStatusMessage,
  serialize,
  type ServerMessage,
} from './messages.js';

export class WebSocketServer {
  private readonly log: Logger;
  private readonly config: Config;
  private readonly readerManager: ReaderManager;

  private wss: WsServer | null = null;

  constructor(readerManager: ReaderManager, config: Config, log: Logger) {
    this.readerManager = readerManager;
    this.config = config;
    this.log = log;
  }

  async start(): Promise<void> {
    const { wsHost, wsPort } = this.config;
    const wss = new WsServer({ host: wsHost, port: wsPort });
    this.wss = wss;

    wss.on('connection', (socket: WebSocket) => {
      const clientId = randomUUID();
      this.log.info(`WebSocket client connected: ${clientId}`);

      const reader = this.readerManager.getCurrentReader();
      this.send(
        socket,
        readerStatusMessage(reader ? 'connected' : 'disconnected', reader ?? { name: '' }),
      );

      socket.on('message', () => {
        // Read-only server for MVP: safely ignore arbitrary client messages.
        this.log.debug(`Ignoring client message from ${clientId}`);
      });

      socket.on('close', () => {
        this.log.info('WebSocket client disconnected');
      });

      socket.on('error', (err: Error) => {
        this.log.warn(`WebSocket client error: ${err.message}`);
      });
    });

    wss.on('error', (err: Error) => {
      this.log.error(`WebSocket server error: ${err.message}`);
    });

    await new Promise<void>((resolve, reject) => {
      wss.once('listening', resolve);
      wss.once('error', reject);
    });

    this.log.info(`WebSocket server listening on ${wsHost}:${wsPort}`);
  }

  getPort(): number | null {
    if (!this.wss) {
      return null;
    }
    const address = this.wss.address();
    return typeof address === 'object' && address !== null ? address.port : null;
  }

  async stop(): Promise<void> {
    if (!this.wss) {
      return;
    }
    this.log.info('Stopping WebSocket server...');
    for (const client of this.wss.clients) {
      client.terminate();
    }
    await new Promise<void>((resolve) => {
      this.wss?.close(() => resolve());
    });
    this.wss = null;
  }

  private send(socket: WebSocket, message: ServerMessage): void {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(serialize(message));
    }
  }

  private broadcast(message: ServerMessage): void {
    if (!this.wss) {
      return;
    }
    const payload = serialize(message);
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  wireReaderEvents(): void {
    this.readerManager.on('readerConnected', (reader: ReaderInfo) => {
      this.broadcast(readerStatusMessage('connected', reader));
    });
    this.readerManager.on('readerDisconnected', (reader: ReaderInfo) => {
      this.broadcast(readerStatusMessage('disconnected', reader));
    });
    this.readerManager.on('cardDetected', ({ uid }) => {
      this.broadcast(cardDetectedMessage(uid));
    });
    this.readerManager.on('cardRemoved', () => {
      this.broadcast(cardRemovedMessage());
    });
  }
}
