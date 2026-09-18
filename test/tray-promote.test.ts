import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findIconKey } from '../src/tray/promote.js';

// Shape of `reg query "HKCU\Control Panel\NotifyIconSettings" /s /v ExecutablePath`.
const REG_OUTPUT = [
  '',
  'HKEY_CURRENT_USER\\Control Panel\\NotifyIconSettings\\1111111111111111111',
  '    ExecutablePath    REG_SZ    C:\\Windows\\System32\\SecurityHealthSystray.exe',
  '',
  'HKEY_CURRENT_USER\\Control Panel\\NotifyIconSettings\\9908304283740336101',
  '    ExecutablePath    REG_SZ    C:\\Apps\\acr122u-agent.exe',
  '',
  'HKEY_CURRENT_USER\\Control Panel\\NotifyIconSettings\\2222222222222222222',
  '    ExecutablePath    REG_SZ    C:\\Other\\thing.exe',
  '',
].join('\r\n');

test('finds the settings key belonging to our executable', () => {
  assert.equal(
    findIconKey(REG_OUTPUT, 'C:\\Apps\\acr122u-agent.exe'),
    'HKEY_CURRENT_USER\\Control Panel\\NotifyIconSettings\\9908304283740336101',
  );
});

test('matches the executable path case-insensitively', () => {
  assert.equal(
    findIconKey(REG_OUTPUT, 'c:\\apps\\ACR122U-Agent.EXE'),
    'HKEY_CURRENT_USER\\Control Panel\\NotifyIconSettings\\9908304283740336101',
  );
});

test('returns null when this executable has no entry yet', () => {
  assert.equal(findIconKey(REG_OUTPUT, 'C:\\Apps\\not-installed.exe'), null);
});

test('returns null for empty or error output', () => {
  assert.equal(findIconKey('', 'C:\\Apps\\acr122u-agent.exe'), null);
  assert.equal(findIconKey('ERROR: The system was unable to find', 'C:\\x.exe'), null);
});

test('does not mistake a path that merely contains ours', () => {
  const output = [
    'HKEY_CURRENT_USER\\Control Panel\\NotifyIconSettings\\333',
    '    ExecutablePath    REG_SZ    C:\\Apps\\acr122u-agent.exe.bak',
    '',
  ].join('\r\n');
  assert.equal(findIconKey(output, 'C:\\Apps\\acr122u-agent.exe'), null);
});
