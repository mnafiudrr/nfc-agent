import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAutostartSupported, parseRunValue, RUN_VALUE_NAME } from '../src/autostart.js';

function regOutput(value: string, name = RUN_VALUE_NAME): string {
  return [
    '',
    'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
    `    ${name}    REG_SZ    ${value}`,
    '',
  ].join('\r\n');
}

test('reads the target back out of reg query output', () => {
  const out = regOutput('"C:\\Apps\\acr122u-agent.exe"');
  assert.equal(parseRunValue(out), 'C:\\Apps\\acr122u-agent.exe');
});

test('strips the quotes that a path with spaces needs', () => {
  const out = regOutput('"C:\\Program Files\\ASRI\\acr122u-agent.exe"');
  assert.equal(parseRunValue(out), 'C:\\Program Files\\ASRI\\acr122u-agent.exe');
});

test('handles an unquoted value', () => {
  assert.equal(
    parseRunValue(regOutput('C:\\Apps\\acr122u-agent.exe')),
    'C:\\Apps\\acr122u-agent.exe',
  );
});

test('ignores other applications in the same key', () => {
  const out = [
    'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
    '    OneDrive    REG_SZ    "C:\\Users\\x\\OneDrive.exe" /background',
    '    Steam    REG_SZ    "C:\\Steam\\steam.exe" -silent',
    '',
  ].join('\r\n');
  assert.equal(parseRunValue(out), null);
});

test('returns null when the value is absent or reg errored', () => {
  assert.equal(parseRunValue(''), null);
  assert.equal(parseRunValue('ERROR: The system was unable to find the specified value.'), null);
});

test('autostart is offered only for the packaged executable on Windows', () => {
  assert.equal(isAutostartSupported('C:\\Apps\\acr122u-agent.exe', 'win32'), true);
  assert.equal(
    isAutostartSupported('C:\\Apps\\acr122u-agent-v0.1.3.exe', 'win32'),
    true,
    'a versioned filename is still a real build',
  );
});

test('autostart is not offered when running under node', () => {
  assert.equal(
    isAutostartSupported('C:\\Program Files\\nodejs\\node.exe', 'win32'),
    false,
    'registering node.exe would launch a bare REPL at login',
  );
  assert.equal(isAutostartSupported('C:\\Program Files\\nodejs\\NODE.EXE', 'win32'), false);
});

test('autostart is not offered off Windows', () => {
  assert.equal(isAutostartSupported('/usr/local/bin/acr122u-agent', 'darwin'), false);
  assert.equal(isAutostartSupported('/usr/local/bin/acr122u-agent', 'linux'), false);
});
