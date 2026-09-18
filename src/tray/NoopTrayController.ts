import type { TrayController, TrayStatus } from './types.js';

/**
 * Used on every platform except Windows, and in tests. The agent must behave
 * identically with or without a tray, so this deliberately does nothing.
 */
export class NoopTrayController implements TrayController {
  start(): void {}

  stop(): void {}

  setStatus(_status: TrayStatus): void {}
}
