import { EventEmitter } from 'node:events';
import { NFC } from 'nfc-pcsc';
import { normalizeUid } from '../utils/uid.js';
import type { Logger } from '../logger.js';

export interface PcscReaderEvents {
  readerConnected: (name: string) => void;
  readerDisconnected: (name: string) => void;
  cardInserted: (uid: string) => void;
  cardRemoved: () => void;
}

export interface NfcCard {
  uid?: string | Buffer;
}

/**
 * Low-level PC/SC adapter wrapping nfc-pcsc.
 *
 * Emits raw reader/card lifecycle events. No application logic here.
 */
export class PcscReader {
  private readonly emitter = new EventEmitter();
  private readonly log: Logger;
  private nfc: NFC | null = null;
  private started = false;

  constructor(log: Logger) {
    this.log = log;
  }

  on<K extends keyof PcscReaderEvents>(event: K, listener: PcscReaderEvents[K]): void {
    this.emitter.on(event, listener as (...args: unknown[]) => void);
  }

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    const nfc = new NFC();
    this.nfc = nfc;

    nfc.on('reader', (reader) => {
      const name = String(reader.name);
      this.log.debug(`Available reader detected: ${name}`);
      this.emitter.emit('readerConnected', name);

      reader.on('card', (card: NfcCard) => {
        this.log.debug(`Card inserted on ${name}`);
        let uid: string;
        try {
          uid = normalizeUid(card.uid ?? '');
        } catch (err) {
          this.log.error(`Failed to normalize UID: ${String(err)}`);
          return;
        }
        this.emitter.emit('cardInserted', uid);
      });

      reader.on('card.off', () => {
        this.log.debug(`Card removed from ${name}`);
        this.emitter.emit('cardRemoved');
      });

      reader.on('error', (err: Error) => {
        this.log.warn(`Reader ${name} error: ${err.message}`);
      });

      reader.on('end', () => {
        this.log.debug(`Reader removed: ${name}`);
        this.emitter.emit('readerDisconnected', name);
      });
    });

    nfc.on('error', (err: Error) => {
      this.log.warn(`PC/SC error: ${err.message}`);
    });

    this.log.debug('PC/SC monitoring started');
  }

  stop(): void {
    if (!this.started) {
      return;
    }
    this.started = false;
    if (this.nfc) {
      try {
        this.nfc.close();
      } catch (err) {
        this.log.warn(`Error closing PC/SC: ${String(err)}`);
      }
      this.nfc = null;
    }
    this.emitter.removeAllListeners();
  }
}
