import type { BufferedLogSink } from '../logger.js';
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
  /** Backs the live log window; omit to disable it. */
  logBuffer?: BufferedLogSink;

  /**
   * Backs the "Start with Windows" menu item; omit to hide it. isEnabled is
   * read while the menu is being built, so it must be synchronous - index.ts
   * caches the registry state rather than querying it on each right-click.
   */
  autostart?: {
    isEnabled: () => boolean;
    setEnabled: (enabled: boolean) => void;
  };
}

export interface TrayController {
  start(): void;
  stop(): void;
  setStatus(status: TrayStatus): void;
  /** Shows a desktop notification from the tray icon. */
  notify(title: string, message: string): void;
}
