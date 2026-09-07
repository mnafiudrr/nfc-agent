import { EventEmitter } from 'node:events';
import type { Logger } from '../logger.js';
import type { PcscReader } from './PcscReader.js';
import type {
  CardInfo,
  ReaderInfo,
  ReaderManager,
  ReaderManagerEvents,
  ReaderState,
} from './types.js';

export class ReaderManagerImpl implements ReaderManager {
  private readonly emitter = new EventEmitter();
  private readonly log: Logger;
  private readonly pcsc: PcscReader;

  private state: ReaderState = 'STARTING';
  private currentReader: ReaderInfo | null = null;
  private currentUid: string | null = null;

  constructor(pcsc: PcscReader, log: Logger) {
    this.pcsc = pcsc;
    this.log = log;
  }

  on<K extends keyof ReaderManagerEvents>(event: K, listener: ReaderManagerEvents[K]): void {
    this.emitter.on(event, listener as (...args: unknown[]) => void);
  }

  getState(): ReaderState {
    return this.state;
  }

  getCurrentReader(): ReaderInfo | null {
    return this.currentReader;
  }

  private wirePcsc(): void {
    this.pcsc.on('readerConnected', (name) => {
      this.setReader({ name });
    });

    this.pcsc.on('readerDisconnected', (name) => {
      this.clearReader(name);
    });

    this.pcsc.on('cardInserted', (uid) => {
      this.onCardInserted(uid);
    });

    this.pcsc.on('cardRemoved', () => {
      this.onCardRemoved();
    });
  }

  private setReader(reader: ReaderInfo): void {
    this.log.info(`Reader connected: ${reader.name}`);
    this.currentReader = reader;
    this.currentUid = null;
    this.state = 'READER_CONNECTED';
    this.emitter.emit('readerConnected', reader);
    this.state = 'WAITING_FOR_CARD';
  }

  private clearReader(name: string): void {
    if (this.currentReader && this.currentReader.name !== name) {
      return;
    }
    this.log.info('Reader disconnected');
    this.currentReader = null;
    this.currentUid = null;
    this.state = 'WAITING_FOR_READER';
    this.emitter.emit('readerDisconnected', { name });
  }

  private onCardInserted(uid: string): void {
    if (this.currentUid === uid) {
      this.log.debug(`Duplicate card_detected suppressed (uid=${uid})`);
      return;
    }
    this.log.info(`Card detected: ${uid}`);
    this.currentUid = uid;
    this.state = 'CARD_PRESENT';
    const card: CardInfo = { uid };
    this.emitter.emit('cardDetected', card);
  }

  private onCardRemoved(): void {
    if (this.currentUid === null) {
      this.log.debug('Card removed event ignored (no card was present)');
      return;
    }
    this.log.info('Card removed');
    this.currentUid = null;
    this.state = 'WAITING_FOR_CARD';
    this.emitter.emit('cardRemoved');
  }

  async start(): Promise<void> {
    this.log.info('Starting PC/SC...');
    this.log.info('Searching for readers...');
    this.wirePcsc();
    this.state = 'WAITING_FOR_READER';
    this.pcsc.start();
    if (this.currentReader === null) {
      this.log.info('No PC/SC reader found.');
      this.log.info('Waiting for reader...');
    }
  }

  async stop(): Promise<void> {
    this.log.info('Stopping PC/SC monitoring...');
    this.pcsc.stop();
    this.emitter.removeAllListeners();
    this.state = 'STARTING';
  }
}
