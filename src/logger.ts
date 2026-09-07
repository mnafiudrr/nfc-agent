import type { LogLevel } from './config.js';

const RANK: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export class Logger {
  private readonly level: LogLevel;

  constructor(level: LogLevel = 'info') {
    this.level = level;
  }

  private write(level: LogLevel, message: string): void {
    if (RANK[level] < RANK[this.level]) {
      return;
    }
    const line = `[${level.toUpperCase()}] ${message}`;
    if (level === 'error') {
      process.stderr.write(`${line}\n`);
    } else {
      process.stdout.write(`${line}\n`);
    }
  }

  debug(message: string): void {
    this.write('debug', message);
  }

  info(message: string): void {
    this.write('info', message);
  }

  warn(message: string): void {
    this.write('warn', message);
  }

  error(message: string): void {
    this.write('error', message);
  }
}
