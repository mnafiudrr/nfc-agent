import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Logger } from '../logger.js';
import { buildBadgedIcon, CONNECTED_COLOR, DISCONNECTED_COLOR } from './badge.js';
import { NoopTrayController } from './NoopTrayController.js';
import type { TrayController, TrayIcons, TrayOptions } from './types.js';
import { Win32TrayController } from './Win32TrayController.js';

const ICON_FILE = 'asliv.ico';
const CONNECTED_FILE = 'tray-connected.ico';
const DISCONNECTED_FILE = 'tray-disconnected.ico';

function packagedIconPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets', ICON_FILE);
}

/**
 * LoadImageW needs a real filesystem path, and inside a pkg executable the
 * asset lives in a virtual snapshot, so the icons are written out on every
 * start. The badged variants are derived here rather than shipped, so swapping
 * the brand icon is all it takes to restyle the tray.
 *
 * Any field may come back null; the controller degrades to the next best icon.
 */
export function materializeIcons(dataDir: string, log: Logger): TrayIcons {
  const icons: TrayIcons = { base: null, connected: null, disconnected: null };
  let source: Buffer;
  try {
    source = readFileSync(packagedIconPath());
    mkdirSync(dataDir, { recursive: true });
  } catch (err) {
    log.warn(`Tray icon asset unavailable: ${String(err)}`);
    return icons;
  }

  const write = (name: string, data: Buffer): string | null => {
    try {
      const target = join(dataDir, name);
      writeFileSync(target, data);
      return target;
    } catch (err) {
      log.debug(`Could not write ${name}: ${String(err)}`);
      return null;
    }
  };

  icons.base = write(ICON_FILE, source);

  const connected = buildBadgedIcon(source, CONNECTED_COLOR);
  const disconnected = buildBadgedIcon(source, DISCONNECTED_COLOR);
  if (!connected || !disconnected) {
    log.warn(
      `${ICON_FILE} is not an uncompressed 32bpp icon, so the tray cannot show a status badge.`,
    );
    return icons;
  }

  icons.connected = write(CONNECTED_FILE, connected);
  icons.disconnected = write(DISCONNECTED_FILE, disconnected);
  return icons;
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
    return new Win32TrayController(options, log, materializeIcons(dataDir, log));
  } catch (err) {
    log.warn(`Tray icon unavailable, running without one: ${String(err)}`);
    return new NoopTrayController();
  }
}
