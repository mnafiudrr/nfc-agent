import { appendFileSync, existsSync, mkdirSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';
import type { LogLevel } from './config.js';

const RANK: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_MAX_FILES = 3;

export interface LogSink {
  write(level: LogLevel, message: string, timestamp: Date): void;
  close(): void;
}

export class ConsoleSink implements LogSink {
  write(level: LogLevel, message: string): void {
    const line = `[${level.toUpperCase()}] ${message}\n`;
    try {
      if (level === 'error') {
        process.stderr.write(line);
      } else {
        process.stdout.write(line);
      }
    } catch {
      // On Windows the packaged exe runs in the GUI subsystem and has no
      // console, so stdout/stderr are dead handles. Dropping the line is
      // correct: the file sink is the real destination there.
    }
  }

  close(): void {}
}

export class FileSink implements LogSink {
  private readonly path: string;
  private readonly maxBytes: number;
  private readonly maxFiles: number;

  private size = 0;
  private ready = false;
  private unusable = false;

  constructor(path: string, maxBytes = DEFAULT_MAX_BYTES, maxFiles = DEFAULT_MAX_FILES) {
    this.path = path;
    this.maxBytes = maxBytes;
    this.maxFiles = Math.max(1, maxFiles);
  }

  private prepare(): void {
    if (this.ready || this.unusable) {
      return;
    }
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      this.size = existsSync(this.path) ? statSync(this.path).size : 0;
      this.ready = true;
    } catch {
      this.unusable = true;
    }
  }

  write(level: LogLevel, message: string, timestamp: Date): void {
    this.prepare();
    if (!this.ready) {
      return;
    }
    const line = `${timestamp.toISOString()} [${level.toUpperCase()}] ${message}\n`;
    const bytes = Buffer.byteLength(line);
    try {
      if (this.size > 0 && this.size + bytes > this.maxBytes) {
        this.rotate();
      }
      appendFileSync(this.path, line);
      this.size += bytes;
    } catch {
      // A failing log write must never take the agent down.
    }
  }

  private rotate(): void {
    try {
      const oldest = `${this.path}.${this.maxFiles - 1}`;
      if (existsSync(oldest)) {
        unlinkSync(oldest);
      }
      for (let i = this.maxFiles - 2; i >= 1; i -= 1) {
        const from = `${this.path}.${i}`;
        if (existsSync(from)) {
          renameSync(from, `${this.path}.${i + 1}`);
        }
      }
      renameSync(this.path, `${this.path}.1`);
      this.size = 0;
    } catch {
      // Rotation failed; keep appending to the current file rather than
      // losing the line.
    }
  }

  close(): void {}
}

export class Logger {
  private readonly level: LogLevel;
  private readonly sinks: readonly LogSink[];

  constructor(level: LogLevel = 'info', sinks: readonly LogSink[] = [new ConsoleSink()]) {
    this.level = level;
    this.sinks = sinks;
  }

  private write(level: LogLevel, message: string): void {
    if (RANK[level] < RANK[this.level]) {
      return;
    }
    const timestamp = new Date();
    for (const sink of this.sinks) {
      sink.write(level, message, timestamp);
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

  close(): void {
    for (const sink of this.sinks) {
      sink.close();
    }
  }
}
