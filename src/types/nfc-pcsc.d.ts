declare module 'nfc-pcsc' {
  import { EventEmitter } from 'node:events';

  export interface NfcCard {
    atr?: Buffer;
    type?: string;
    standard?: string;
    uid?: string | Buffer;
  }

  export interface Reader extends EventEmitter {
    readonly name: string;
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    on(event: 'card', listener: (card: NfcCard) => void): this;
    on(event: 'card.off', listener: () => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: 'end', listener: () => void): this;
  }

  export class NFC extends EventEmitter {
    constructor(logger?: object);
    readonly readers: Reader[];
    close(): void;
    on(event: 'reader', listener: (reader: Reader) => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
  }
}
