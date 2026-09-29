import { execFile } from 'node:child_process';
import type { Logger } from '../logger.js';

const NOTIFY_ICON_SETTINGS = 'HKCU\\Control Panel\\NotifyIconSettings';

// Explorer only writes the settings key after it has seen the icon, so the
// first look-up can legitimately find nothing.
const RETRY_DELAYS_MS = [800, 2000, 5000];

// Absolute path: inside a pkg executable, resolving a bare "reg" through PATH
// is not reliable.
function regExe(): string {
  const root = process.env['SystemRoot'] ?? 'C:\\Windows';
  return `${root}\\System32\\reg.exe`;
}

function run(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(regExe(), args, { windowsHide: true, timeout: 10_000 }, (err, stdout) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(stdout);
    });
  });
}

/**
 * Finds the NotifyIconSettings subkey Explorer created for this executable.
 * `reg query /s` prints each key path followed by its values, so we track the
 * most recent key path and return it when its ExecutablePath is ours.
 */
export function findIconKey(regOutput: string, exePath: string): string | null {
  const wanted = exePath.toLowerCase();
  let currentKey: string | null = null;

  for (const rawLine of regOutput.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.toUpperCase().startsWith('HKEY_')) {
      currentKey = line;
      continue;
    }
    const match = /^ExecutablePath\s+REG_SZ\s+(.+)$/i.exec(line);
    if (match && currentKey && match[1]?.trim().toLowerCase() === wanted) {
      return currentKey;
    }
  }
  return null;
}

async function promoteOnce(
  exePath: string,
  trace: (message: string) => void,
): Promise<'promoted' | 'already' | 'not-found'> {
  trace(`running ${regExe()} query`);
  const query = await run(['query', NOTIFY_ICON_SETTINGS, '/s', '/v', 'ExecutablePath']);
  trace(`query returned ${query.length} chars`);
  const key = findIconKey(query, exePath);
  if (!key) {
    return 'not-found';
  }

  let current = '';
  try {
    current = await run(['query', key, '/v', 'IsPromoted']);
  } catch {
    // The value does not exist yet, which is the same as not promoted.
  }
  if (/IsPromoted\s+REG_DWORD\s+0x1/i.test(current)) {
    return 'already';
  }

  await run(['add', key, '/v', 'IsPromoted', '/t', 'REG_DWORD', '/d', '1', '/f']);
  return 'promoted';
}

/**
 * Windows 11 parks every new tray icon in the hidden overflow flyout, so the
 * agent looks like it failed to start. Setting IsPromoted pins it to the
 * taskbar. The user can still unpin it by dragging, and we only ever set it
 * when it is absent or 0, so a deliberate unpin is not overridden on restart.
 *
 * Returns true when the value was changed, which means the caller should
 * re-add the icon so Explorer picks the new setting up immediately.
 */
export async function promoteTrayIcon(log: Logger, exePath = process.execPath): Promise<boolean> {
  log.debug(`Pinning tray icon for ${exePath}`);
  const trace = (message: string): void => log.debug(`Tray pin: ${message}`);
  for (const delay of RETRY_DELAYS_MS) {
    await new Promise((resolve) => setTimeout(resolve, delay));
    trace(`waited ${delay}ms`);
    try {
      const result = await promoteOnce(exePath, trace);
      log.debug(`Tray pin attempt: ${result}`);
      if (result === 'promoted') {
        log.info('Pinned the tray icon to the taskbar (Windows 11 hides new icons by default).');
        return true;
      }
      if (result === 'already') {
        return false;
      }
    } catch (err) {
      log.debug(`Could not pin the tray icon: ${String(err)}`);
      return false;
    }
  }
  log.debug('Explorer did not register the tray icon settings key; leaving it in the overflow.');
  return false;
}
