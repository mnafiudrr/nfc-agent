import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BufferedLogSink, ConsoleSink, FileSink, Logger, type LogSink } from '../src/logger.js';
import type { LogLevel } from '../src/config.js';

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'acr122u-log-'));
}

class MemorySink implements LogSink {
  readonly lines: string[] = [];
  write(level: LogLevel, message: string): void {
    this.lines.push(`${level}:${message}`);
  }
  close(): void {}
}

test('logger fans a line out to every sink', () => {
  const a = new MemorySink();
  const b = new MemorySink();
  new Logger('info', [a, b]).info('hello');
  assert.deepEqual(a.lines, ['info:hello']);
  assert.deepEqual(b.lines, ['info:hello']);
});

test('logger still filters by level before reaching sinks', () => {
  const sink = new MemorySink();
  const log = new Logger('warn', [sink]);
  log.debug('nope');
  log.info('nope');
  log.warn('yes');
  log.error('yes');
  assert.deepEqual(sink.lines, ['warn:yes', 'error:yes']);
});

test('logger defaults to a console sink when none is given', () => {
  const log = new Logger('info');
  assert.doesNotThrow(() => log.info('to stdout'));
});

test('console sink swallows a dead stdout handle', () => {
  const sink = new ConsoleSink();
  const original = process.stdout.write;
  process.stdout.write = () => {
    throw new Error('EBADF: no console attached');
  };
  try {
    assert.doesNotThrow(() => sink.write('info', 'while windowless', new Date()));
  } finally {
    process.stdout.write = original;
  }
});

test('file sink creates missing directories and writes a timestamped line', () => {
  const dir = tempDir();
  const path = join(dir, 'nested', 'deeper', 'agent.log');
  try {
    new FileSink(path).write('info', 'Agent started', new Date('2026-01-02T03:04:05.000Z'));
    const contents = readFileSync(path, 'utf8');
    assert.match(contents, /^2026-01-02T03:04:05\.000Z \[INFO\] Agent started\n$/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('file sink rotates once the size limit is passed and keeps maxFiles files', () => {
  const dir = tempDir();
  const path = join(dir, 'agent.log');
  try {
    const sink = new FileSink(path, 120, 3);
    for (let i = 0; i < 40; i += 1) {
      sink.write('info', `line ${i} padded out to force rotation`, new Date());
    }
    assert.ok(existsSync(path), 'current log exists');
    assert.ok(existsSync(`${path}.1`), 'first rotated file exists');
    assert.ok(existsSync(`${path}.2`), 'second rotated file exists');
    assert.ok(!existsSync(`${path}.3`), 'does not keep more than maxFiles files');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('file sink continues the byte count of an existing log', () => {
  const dir = tempDir();
  const path = join(dir, 'agent.log');
  try {
    writeFileSync(path, 'x'.repeat(100));
    const sink = new FileSink(path, 120, 3);
    sink.write('info', 'this pushes past the limit and must rotate', new Date());
    assert.ok(existsSync(`${path}.1`), 'pre-existing content was rotated out');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('file sink never throws when the path is unusable', () => {
  const dir = tempDir();
  const clash = join(dir, 'agent.log');
  try {
    // A file where a directory is required makes mkdir fail.
    writeFileSync(clash, 'not a directory');
    const sink = new FileSink(join(clash, 'inner', 'agent.log'));
    assert.doesNotThrow(() => sink.write('error', 'still alive', new Date()));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('buffered sink keeps recent lines and caps at capacity', () => {
  const sink = new BufferedLogSink(3);
  for (let i = 1; i <= 5; i += 1) {
    sink.write('info', `line ${i}`, new Date('2026-01-02T03:04:05.000Z'));
  }
  const lines = sink.snapshot();
  assert.equal(lines.length, 3);
  assert.match(lines[0]!, /line 3$/);
  assert.match(lines[2]!, /line 5$/);
  assert.match(lines[0]!, /^2026-01-02T03:04:05\.000Z \[INFO\] /);
});

test('buffered sink forwards new lines to a listener', () => {
  const sink = new BufferedLogSink(10);
  const seen: string[] = [];
  sink.onLine((line) => seen.push(line));
  sink.write('warn', 'live one', new Date());
  sink.write('error', 'live two', new Date());
  assert.equal(seen.length, 2);
  assert.match(seen[0]!, /\[WARN\] live one$/);
  assert.match(seen[1]!, /\[ERROR\] live two$/);
});

test('a throwing log listener cannot take the agent down', () => {
  const sink = new BufferedLogSink(10);
  sink.onLine(() => {
    throw new Error('log window exploded');
  });
  assert.doesNotThrow(() => sink.write('info', 'still fine', new Date()));
  assert.equal(sink.snapshot().length, 1, 'the line is still buffered');
});

test('detaching the listener stops delivery but keeps buffering', () => {
  const sink = new BufferedLogSink(10);
  const seen: string[] = [];
  sink.onLine((line) => seen.push(line));
  sink.write('info', 'before', new Date());
  sink.onLine(null);
  sink.write('info', 'after', new Date());
  assert.equal(seen.length, 1);
  assert.equal(sink.snapshot().length, 2);
});
