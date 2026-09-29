# Rules — Dependency Policy

What dependencies may be added to the ACR122U Local Agent.

## 1. Minimal by design

Keep dependencies minimal. Every added dependency must justify its presence.

## 2. Allowed runtime

- `nfc-pcsc` — PC/SC communication (required for the reader).
- `ws` — WebSocket server.
- `koffi` — FFI for the Windows tray icon (`Shell_NotifyIcon` and the surrounding Win32 calls). Added
  because the agent runs windowless on Windows and needs a tray icon to stay visible and quittable. The
  alternatives (`systray2`, `trayicon`) were unmaintained since 2022 and would each drop an unsigned helper
  executable into temp and run it, which is an antivirus risk in the field. See
  [../plans/windows-tray.md](../plans/windows-tray.md) §5.2.

## 3. Allowed dev

- `typescript`, `eslint`, `prettier`, and a test runner for the chosen framework.

## 4. Explicitly not allowed

- Electron
- React / Svelte / Vue
- Express (unless genuinely necessary)
- Socket.IO (unless genuinely necessary)
- database drivers / ORMs
- Redis
- cloud SDKs / services

## 5. Adding a new dependency

- Add only when genuinely necessary.
- Prefer small, maintained packages.
- Note the reason in the PR/commit when adding anything outside the allowed lists above.
