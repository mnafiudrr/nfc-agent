export type ReaderState =
  'STARTING' | 'WAITING_FOR_READER' | 'READER_CONNECTED' | 'WAITING_FOR_CARD' | 'CARD_PRESENT';

export interface ReaderInfo {
  name: string;
}

export interface CardInfo {
  uid: string;
}

export interface ReaderManagerEvents {
  readerConnected: (reader: ReaderInfo) => void;
  readerDisconnected: (reader: ReaderInfo) => void;
  cardDetected: (card: CardInfo) => void;
  cardRemoved: () => void;
}

export interface ReaderManager {
  start(): Promise<void>;
  stop(): Promise<void>;
  getState(): ReaderState;
  getCurrentReader(): ReaderInfo | null;
  on<K extends keyof ReaderManagerEvents>(event: K, listener: ReaderManagerEvents[K]): void;
}
