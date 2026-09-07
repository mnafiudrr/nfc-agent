# Rules — Dependency Policy

What dependencies may be added to the ACR122U Local Agent.

## 1. Minimal by design

Keep dependencies minimal. Every added dependency must justify its presence.

## 2. Allowed runtime

- `nfc-pcsc` — PC/SC communication (required for the reader).
- `ws` — WebSocket server.

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
