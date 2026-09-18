import { homedir } from 'node:os';
import { join } from 'node:path';

export interface Config {
  wsHost: string;
  wsPort: number;
  logLevel: LogLevel;
  logFile: string | null;
  dataDir: string;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const DEFAULT_WS_HOST = '127.0.0.1';
const DEFAULT_WS_PORT = 8765;
const DEFAULT_LOG_LEVEL: LogLevel = 'info';

const APP_DIR = 'acr122u-agent';
const LOG_FILE_NAME = 'agent.log';

const LOG_LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error'];

/** Per-user directory for anything the agent writes: logs, the tray icon. */
export function defaultDataDir(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  home: string = homedir(),
): string {
  if (platform === 'win32') {
    return join(env['LOCALAPPDATA'] ?? join(home, 'AppData', 'Local'), APP_DIR);
  }
  if (platform === 'darwin') {
    return join(home, 'Library', 'Application Support', APP_DIR);
  }
  return join(home, '.local', 'share', APP_DIR);
}

export function defaultLogFilePath(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  home: string = homedir(),
): string {
  if (platform === 'win32') {
    return join(defaultDataDir(env, platform, home), 'logs', LOG_FILE_NAME);
  }
  if (platform === 'darwin') {
    return join(home, 'Library', 'Logs', APP_DIR, LOG_FILE_NAME);
  }
  return join(home, '.local', 'state', APP_DIR, LOG_FILE_NAME);
}

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): Config {
  const wsHost = env['WS_HOST'] ?? DEFAULT_WS_HOST;

  const rawPort = Number(env['WS_PORT'] ?? DEFAULT_WS_PORT);
  const wsPort =
    Number.isInteger(rawPort) && rawPort > 0 && rawPort <= 65535 ? rawPort : DEFAULT_WS_PORT;

  const rawLevel = (env['LOG_LEVEL'] ?? DEFAULT_LOG_LEVEL).toLowerCase() as LogLevel;
  const logLevel = LOG_LEVELS.includes(rawLevel) ? rawLevel : DEFAULT_LOG_LEVEL;

  // LOG_FILE unset -> platform default; LOG_FILE set but empty -> disabled.
  const rawLogFile = env['LOG_FILE'];
  let logFile: string | null;
  if (rawLogFile === undefined) {
    logFile = defaultLogFilePath(env, platform);
  } else if (rawLogFile.trim() === '') {
    logFile = null;
  } else {
    logFile = rawLogFile;
  }

  return { wsHost, wsPort, logLevel, logFile, dataDir: defaultDataDir(env, platform) };
}
