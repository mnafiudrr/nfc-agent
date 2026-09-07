import type { ReaderInfo } from '../reader/types.js';

export type ReaderStatus = 'connected' | 'disconnected';

export interface ReaderStatusMessage {
  type: 'reader_status';
  status: ReaderStatus;
  reader: string;
}

export interface CardDetectedMessage {
  type: 'card_detected';
  uid: string;
}

export interface CardRemovedMessage {
  type: 'card_removed';
}

export type ServerMessage = ReaderStatusMessage | CardDetectedMessage | CardRemovedMessage;

export function readerStatusMessage(status: ReaderStatus, reader: ReaderInfo): ServerMessage {
  return { type: 'reader_status', status, reader: reader.name };
}

export function cardDetectedMessage(uid: string): ServerMessage {
  return { type: 'card_detected', uid };
}

export function cardRemovedMessage(): ServerMessage {
  return { type: 'card_removed' };
}

export function serialize(message: ServerMessage): string {
  return JSON.stringify(message);
}
