import type { ReaderInfo, ReaderState } from '../reader/types.js';

export interface TrayStatus {
  state: ReaderState;
  reader: ReaderInfo | null;
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
}
