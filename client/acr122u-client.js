/**
 * ACR122U Agent — Browser Client
 *
 * Connects a website/browser to the local ACR122U agent WebSocket
 * (ws://127.0.0.1:8765 by default) and dispatches typed events.
 *
 * Zero dependencies. Drop this file into any browser project as an ES module.
 *
 * Example:
 *   import { Acr122uAgentClient } from './acr122u-client.js';
 *   const agent = new Acr122uAgentClient();
 *   agent.connect();
 *   agent.on('card_detected', (data) => console.log(data.uid));
 *   agent.on('reader_status', (data) => console.log(data.status, data.reader));
 */

export const DEFAULT_URL = 'ws://127.0.0.1:8765';

const EVENTS = ['reader_status', 'card_detected', 'card_removed'];

export class Acr122uAgentClient {
  constructor(options = {}) {
    this.url = options.url ?? DEFAULT_URL;
    this.autoReconnect = options.autoReconnect ?? true;
    this.reconnectDelayMs = options.reconnectDelayMs ?? 1000;
    this.maxReconnectDelayMs = options.maxReconnectDelayMs ?? 10000;

    this.socket = null;
    this.reconnectAttempt = 0;
    this.reconnectTimer = null;
    this.manualClose = false;
    this.connectionStatus = 'closed';
    this.eventHandlers = {};
    this.statusHandlers = new Set();
  }

  get status() {
    return this.connectionStatus;
  }

  connect() {
    this.manualClose = false;
    this.open();
  }

  disconnect() {
    this.manualClose = true;
    this.clearReconnectTimer();
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.setStatus('closed');
  }

  on(event, listener) {
    const set = this.eventHandlers[event] ?? new Set();
    set.add(listener);
    this.eventHandlers[event] = set;
  }

  off(event, listener) {
    this.eventHandlers[event]?.delete(listener);
  }

  onStatus(listener) {
    this.statusHandlers.add(listener);
  }

  open() {
    this.setStatus('connecting');
    let socket;
    try {
      socket = new WebSocket(this.url);
    } catch {
      this.setStatus('error');
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;

    socket.addEventListener('open', () => {
      this.reconnectAttempt = 0;
      this.setStatus('open');
    });

    socket.addEventListener('message', (event) => {
      this.handleMessage(event.data);
    });

    socket.addEventListener('close', () => {
      this.socket = null;
      if (!this.manualClose) {
        this.setStatus('closed');
        this.scheduleReconnect();
      }
    });

    socket.addEventListener('error', () => {
      this.setStatus('error');
    });
  }

  handleMessage(data) {
    let message;
    try {
      message = typeof data === 'string' ? JSON.parse(data) : data;
    } catch {
      // Ignore malformed messages.
      return;
    }
    if (!message || typeof message.type !== 'string') {
      return;
    }
    if (EVENTS.includes(message.type)) {
      this.emit(message.type, message);
    }
  }

  scheduleReconnect() {
    if (!this.autoReconnect || this.manualClose || this.reconnectTimer !== null) {
      return;
    }
    const delay = Math.min(
      this.reconnectDelayMs * 2 ** this.reconnectAttempt,
      this.maxReconnectDelayMs,
    );
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, delay);
  }

  clearReconnectTimer() {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  setStatus(status) {
    this.connectionStatus = status;
    for (const handler of this.statusHandlers) {
      handler(status);
    }
  }

  emit(event, data) {
    const listeners = this.eventHandlers[event] ?? new Set();
    for (const handler of listeners) {
      handler(data);
    }
  }
}