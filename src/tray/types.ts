import type { ReaderInfo, ReaderState } from '../reader/types.js';

export interface TrayStatus {
  state: ReaderState;
  reader: ReaderInfo | null;
}

export interface TrayIcons {
  /** Unbadged brand icon; used when the badged variants cannot be built. */
  base: string | null;
  connected: string | null;
  disconnected: string | null;
}

export interface TrayOptions {
  wsUrl: string;
  logFile: string | null;
  onQuit: () => void;
}

export interface TrayController {
  start(): void;
  stop(): void;
  setStatus(status: TrayStatus): void;
  /** Shows a desktop notification from the tray icon. */
  notify(title: string, message: string): void;
}
