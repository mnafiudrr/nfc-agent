import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { defaultLogFilePath, loadConfig } from '../src/config.js';

test('defaults are unchanged for host, port and level', () => {
  const config = loadConfig({}, 'win32');
  assert.equal(config.wsHost, '127.0.0.1');
  assert.equal(config.wsPort, 8765);
  assert.equal(config.logLevel, 'info');
});

test('LOG_FILE unset falls back to the platform default path', () => {
  const config = loadConfig({ LOCALAPPDATA: 'C:\\Users\\test\\AppData\\Local' }, 'win32');
  assert.equal(
    config.logFile,
    join('C:\\Users\\test\\AppData\\Local', 'acr122u-agent', 'logs', 'agent.log'),
  );
});

test('LOG_FILE set to an empty value disables file logging', () => {
  assert.equal(loadConfig({ LOG_FILE: '' }, 'win32').logFile, null);
  assert.equal(loadConfig({ LOG_FILE: '   ' }, 'win32').logFile, null);
});

test('LOG_FILE set to a path wins over the default', () => {
  assert.equal(
    loadConfig({ LOG_FILE: 'D:\\logs\\custom.log' }, 'win32').logFile,
    'D:\\logs\\custom.log',
  );
});

test('windows default log path uses LOCALAPPDATA when present', () => {
  const path = defaultLogFilePath({ LOCALAPPDATA: 'C:\\LA' }, 'win32', 'C:\\Users\\test');
  assert.equal(path, join('C:\\LA', 'acr122u-agent', 'logs', 'agent.log'));
});

test('windows default log path falls back to the home directory', () => {
  const path = defaultLogFilePath({}, 'win32', 'C:\\Users\\test');
  assert.equal(
    path,
    join('C:\\Users\\test', 'AppData', 'Local', 'acr122u-agent', 'logs', 'agent.log'),
  );
});

test('macOS default log path uses the standard Logs directory', () => {
  const path = defaultLogFilePath({}, 'darwin', '/Users/test');
  assert.equal(path, join('/Users/test', 'Library', 'Logs', 'acr122u-agent', 'agent.log'));
});

test('other platforms get an XDG-style state path', () => {
  const path = defaultLogFilePath({}, 'linux', '/home/test');
  assert.equal(path, join('/home/test', '.local', 'state', 'acr122u-agent', 'agent.log'));
});

test('invalid port and level still fall back to defaults', () => {
  const config = loadConfig({ WS_PORT: 'not-a-port', LOG_LEVEL: 'verbose' }, 'win32');
  assert.equal(config.wsPort, 8765);
  assert.equal(config.logLevel, 'info');
});
