/**
 * Type definitions for acr122u-client.js (browser ES module).
 *
 * Place this file next to acr122u-client.js. TypeScript projects importing
 * the module will pick up these types automatically.
 */

/** Default agent WebSocket URL: ws://127.0.0.1:8765 */
export const DEFAULT_URL: string;

export type AgentEvent = 'reader_status' | 'card_detected' | 'card_removed';

export interface ReaderStatusPayload {
  type: 'reader_status';
  status: 'connected' | 'disconnected';
  reader: string;
}

export interface CardDetectedPayload {
  type: 'card_detected';
  /** Normalized UID, uppercase hex without separators, e.g. "047A218C916B80". */
  uid: string;
}

export interface CardRemovedPayload {
  type: 'card_removed';
}

export type AgentMessage = ReaderStatusPayload | CardDetectedPayload | CardRemovedPayload;

export type ConnectionStatus = 'connecting' | 'open' | 'closed' | 'error';

export interface Acr122uAgentClientOptions {
  /**
   * Agent WebSocket URL. Default: ws://127.0.0.1:8765
   * Prefer 127.0.0.1 over localhost (localhost may resolve to IPv6 ::1,
   * while the agent binds IPv4 loopback only).
   */
  url?: string;
  /** Reconnect automatically when the connection drops. Default: true */
  autoReconnect?: boolean;
  /** Initial reconnect delay in milliseconds. Default: 1000 */
  reconnectDelayMs?: number;
  /** Maximum reconnect delay in milliseconds. Default: 10000 */
  maxReconnectDelayMs?: number;
}

/** Maps an event name to its strongly-typed payload. */
export type PayloadFor<E extends AgentEvent> = E extends 'reader_status'
  ? ReaderStatusPayload
  : E extends 'card_detected'
    ? CardDetectedPayload
    : CardRemovedPayload;

export declare class Acr122uAgentClient {
  constructor(options?: Acr122uAgentClientOptions);
  /** Current connection status. */
  get status(): ConnectionStatus;
  /** Open the connection (starts auto-reconnect on failure unless disabled). */
  connect(): void;
  /** Close the connection and stop reconnecting. */
  disconnect(): void;
  /** Subscribe to an agent event (reader_status, card_detected, card_removed). */
  on<E extends AgentEvent>(event: E, listener: (data: PayloadFor<E>) => void): void;
  /** Unsubscribe from an agent event. */
  off<E extends AgentEvent>(event: E, listener: (data: PayloadFor<E>) => void): void;
  /** Subscribe to connection-state changes (connecting, open, closed, error). */
  onStatus(listener: (status: ConnectionStatus) => void): void;
}