import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { Logger } from './logger.js';

/**
 * Starts the agent automatically when the user logs in, so it does not have to
 * be launched by hand after every reboot.
 *
 * Uses the per-user Run key rather than a service or a scheduled task: the
 * agent needs an interactive desktop session for its tray icon, and PC/SC in
 * session 0 has its own problems (docs/plans/windows-tray.md section 10).
 * HKCU also means no administrator rights are needed.
 */

const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';

/** No spaces: keeps the reg.exe round-trip and the parser simple. */
export const RUN_VALUE_NAME = 'ASRILivingACR122Agent';

/** Records that first-run setup has happened, so a later opt-out sticks. */
const MARKER_FILE = 'autostart-configured';

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
 * Pulls our value out of `reg query ... /v <name>` output.
 * Returns the target path with any surrounding quotes removed, or null when
 * the value is absent.
 */
export function parseRunValue(regOutput: string, valueName = RUN_VALUE_NAME): string | null {
  const pattern = new RegExp(`^${valueName}\\s+REG_[A-Z_]+\\s+(.+)$`, 'i');
  for (const rawLine of regOutput.split(/\r?\n/)) {
    const match = pattern.exec(rawLine.trim());
    const value = match?.[1]?.trim();
    if (value) {
      return value.replace(/^"(.*)"$/, '$1');
    }
  }
  return null;
}

/**
 * Autostart only makes sense for the packaged executable. Under `node
 * dist/index.js` the executable is node itself, and registering that would
 * launch a bare Node REPL at login.
 */
export function isAutostartSupported(
  execPath: string = process.execPath,
  platform: NodeJS.Platform = process.platform,
): boolean {
  return platform === 'win32' && basename(execPath).toLowerCase() !== 'node.exe';
}

export async function getAutostartTarget(): Promise<string | null> {
  try {
    return parseRunValue(await run(['query', RUN_KEY, '/v', RUN_VALUE_NAME]));
  } catch {
    // reg.exe exits non-zero when the value does not exist.
    return null;
  }
}

export async function isAutostartEnabled(execPath: string = process.execPath): Promise<boolean> {
  const target = await getAutostartTarget();
  return target !== null && target.toLowerCase() === execPath.toLowerCase();
}

export async function enableAutostart(
  log: Logger,
  execPath: string = process.execPath,
): Promise<boolean> {
  try {
    // Quoted so a path containing spaces is parsed as one argument at login.
    await run(['add', RUN_KEY, '/v', RUN_VALUE_NAME, '/t', 'REG_SZ', '/d', `"${execPath}"`, '/f']);
    log.info(`Start with Windows enabled: ${execPath}`);
    return true;
  } catch (err) {
    log.warn(`Could not enable start with Windows: ${String(err)}`);
    return false;
  }
}

export async function disableAutostart(log: Logger): Promise<boolean> {
  try {
    await run(['delete', RUN_KEY, '/v', RUN_VALUE_NAME, '/f']);
    log.info('Start with Windows disabled.');
    return true;
  } catch (err) {
    log.debug(`Could not disable start with Windows: ${String(err)}`);
    return false;
  }
}

function markerPath(dataDir: string): string {
  return join(dataDir, MARKER_FILE);
}

/**
 * Turns autostart on the first time the agent ever runs, then never forces it
 * again. Without the marker we could not tell "never configured" from "the user
 * turned it off", and would switch it back on at every launch.
 */
export async function ensureAutostartOnFirstRun(log: Logger, dataDir: string): Promise<void> {
  if (!isAutostartSupported()) {
    return;
  }

  const marker = markerPath(dataDir);
  if (existsSync(marker)) {
    // Already decided once; whatever the registry says now is the user's call.
    const target = await getAutostartTarget();
    if (target && target.toLowerCase() !== process.execPath.toLowerCase()) {
      // The agent moved or was upgraded to a different filename - repoint it,
      // otherwise login would launch an executable that no longer exists.
      log.info(`Start with Windows pointed at ${target}; updating it to this executable.`);
      await enableAutostart(log);
    }
    return;
  }

  await enableAutostart(log);
  try {
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(marker, `${new Date().toISOString()}\n`);
  } catch (err) {
    // Without the marker we would re-enable on the next start, which is
    // annoying but not harmful.
    log.debug(`Could not record the autostart marker: ${String(err)}`);
  }
}
