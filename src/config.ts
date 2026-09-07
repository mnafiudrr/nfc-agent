export interface Config {
  wsHost: string;
  wsPort: number;
  logLevel: LogLevel;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const DEFAULT_WS_HOST = '127.0.0.1';
const DEFAULT_WS_PORT = 8765;
const DEFAULT_LOG_LEVEL: LogLevel = 'info';

const LOG_LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error'];

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const wsHost = env['WS_HOST'] ?? DEFAULT_WS_HOST;

  const rawPort = Number(env['WS_PORT'] ?? DEFAULT_WS_PORT);
  const wsPort =
    Number.isInteger(rawPort) && rawPort > 0 && rawPort <= 65535 ? rawPort : DEFAULT_WS_PORT;

  const rawLevel = (env['LOG_LEVEL'] ?? DEFAULT_LOG_LEVEL).toLowerCase() as LogLevel;
  const logLevel = LOG_LEVELS.includes(rawLevel) ? rawLevel : DEFAULT_LOG_LEVEL;

  return { wsHost, wsPort, logLevel };
}
