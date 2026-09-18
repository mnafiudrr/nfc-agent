import type { Logger } from '../logger.js';
import { queryPcsc } from './winscard.js';

export const DEFAULT_PROBE_INTERVAL_MS = 2000;

export type ProbeResult = 'readers-present' | 'no-readers' | 'unsupported';

/**
 * Polls for PC/SC reader presence so the agent never constructs NFC() while the
 * Smart Card service is down - see winscard.ts for why that matters.
 *
 * Only Windows needs this. On macOS pcscd behaves and the probe reports
 * "unsupported", which callers treat as "just start normally".
 */
export class ReaderProbe {
  private readonly log: Logger;
  private readonly intervalMs: number;
  private readonly platform: NodeJS.Platform;

  private timer: NodeJS.Timeout | null = null;
  private broken = false;

  constructor(
    log: Logger,
    intervalMs = DEFAULT_PROBE_INTERVAL_MS,
    platform: NodeJS.Platform = process.platform,
  ) {
    this.log = log;
    this.intervalMs = intervalMs;
    this.platform = platform;
  }

  check(): ProbeResult {
    if (this.platform !== 'win32' || this.broken) {
      return 'unsupported';
    }
    try {
      const status = queryPcsc();
      return status.readers.length > 0 ? 'readers-present' : 'no-readers';
    } catch (err) {
      // A broken probe must not permanently disable the reader, so fall back to
      // the old behaviour of letting nfc-pcsc try.
      this.broken = true;
      this.log.warn(`PC/SC probe unavailable, starting the reader unguarded: ${String(err)}`);
      return 'unsupported';
    }
  }

  /** Calls onReady once readers are present, polling until then. */
  waitForReaders(onReady: () => void): void {
    const attempt = (): void => {
      const result = this.check();
      if (result === 'readers-present' || result === 'unsupported') {
        this.stop();
        onReady();
        return;
      }
    };

    if (this.check() !== 'no-readers') {
      onReady();
      return;
    }

    this.log.info('No PC/SC reader detected yet. Waiting for one to be plugged in...');
    this.timer = setInterval(attempt, this.intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
