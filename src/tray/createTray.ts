import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Logger } from '../logger.js';
import { NoopTrayController } from './NoopTrayController.js';
import type { TrayController, TrayOptions } from './types.js';
import { Win32TrayController } from './Win32TrayController.js';

const ICON_FILE = 'asliv.ico';

/**
 * LoadImageW needs a real filesystem path, and inside a pkg executable the
 * asset lives in a virtual snapshot, so copy it out on every start. Returns
 * null when the asset is unavailable - the tray then falls back to the
 * generic Windows application icon.
 */
export function materializeIcon(dataDir: string, log: Logger): string | null {
  try {
    const packaged = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets', ICON_FILE);
    const data = readFileSync(packaged);
    mkdirSync(dataDir, { recursive: true });
    const target = join(dataDir, ICON_FILE);
    writeFileSync(target, data);
    return target;
  } catch (err) {
    log.debug(`Tray icon asset unavailable: ${String(err)}`);
    return null;
  }
}

/**
 * Win32TrayController is imported statically because pkg cannot resolve a
 * dynamic import() inside its ESM snapshot. It is safe to import anywhere:
 * every Windows DLL it needs is loaded on first start(), not on import.
 */
export function createTrayController(
  options: TrayOptions,
  log: Logger,
  dataDir: string,
  platform: NodeJS.Platform = process.platform,
): TrayController {
  if (platform !== 'win32') {
    return new NoopTrayController();
  }
  try {
    return new Win32TrayController(options, log, materializeIcon(dataDir, log));
  } catch (err) {
    log.warn(`Tray icon unavailable, running without one: ${String(err)}`);
    return new NoopTrayController();
  }
}
