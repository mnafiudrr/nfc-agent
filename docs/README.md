# ACR122U Local Agent

> A standalone cross-platform background agent for the **ACR122U-A9** NFC reader.
> Version: 0.1 · Status: Draft · Date: 2026-09-07

The agent's **only** responsibility is to communicate with the ACR122U NFC reader through PC/SC and expose reader/card events through a local WebSocket server. It is a headless hardware agent, fully independent of any web application, backend, or database.

> This repository is **only** the ACR122U local agent. It does NOT contain a Yii2 integration, an HTTP API, a database, authentication, employee/attendance logic, check-in/check-out, or any frontend. The consuming application lives in a separate repository.

```
ACR122U
   ↓
PC/SC
   ↓
Node.js Agent
   ↓
Local WebSocket
   ↓
External Client
```

---

## Documentation Index

| Path                                                         | Description                                                                |
| ------------------------------------------------------------ | -------------------------------------------------------------------------- |
| [plans/prd.md](plans/prd.md)                                 | Product requirements (goals, non-goals, functional requirements, protocol) |
| [plans/architecture.md](plans/architecture.md)               | Technical design: stack, structure, modules, state machine, config         |
| [plans/implementation-plan.md](plans/implementation-plan.md) | Milestone breakdown (M1–M5)                                                |
| [tasks/README.md](tasks/README.md)                           | Execution order index for implementation tasks                             |
| [rules/README.md](rules/README.md)                           | Coding/engineering rules for this project                                  |
| [diagrams/architecture.puml](diagrams/architecture.puml)     | Component diagram                                                          |
| [diagrams/state-machine.puml](diagrams/state-machine.puml)   | Reader/card state machine                                                  |
| [diagrams/data-flow.puml](diagrams/data-flow.puml)           | Event flow sequence                                                        |

---

## 1. Requirements

- Node.js 18+ (for development)
- A PC/SC driver/daemon installed (see below)
- ACR122U-A9 NFC reader (or any PC/SC reader whose name matches an ACR122U pattern)
- npm

## 2. Windows setup

1. Install the official ACR122U driver (ACS / pcsc-shim) and the Windows Smart Card service (Winscard).
2. Verify the reader appears under **Device Manager → Smart card readers** as `ACS ACR122U PICC Interface`.
3. Install Node.js and npm.

## 3. macOS setup

1. Install a PC/SC daemon. macOS ships with the built-in `pcscd`; if the reader is not seen, install `pcsc-lite` via Homebrew:
   ```bash
   brew install pcsc-lite
   ```
2. Plug in the ACR122U. It typically appears as `ACS ACR122U PICC Interface`.
3. Install Node.js and npm.

## 4. PC/SC requirements

- The agent talks to the reader through PC/SC (the OS smart-card subsystem). No proprietary ACR122U USB protocol is used for reader discovery.
- The PC/SC daemon must be running (automatic on Windows/macOS).

## 5. Installing dependencies

```bash
npm install
```

Runtime deps are kept minimal (`nfc-pcsc` for PC/SC + `ws` for WebSocket). Dev deps cover TypeScript, ESLint, Prettier, and the test runner.

## 6. Running in development

```bash
npm run build && npm start
```

or, with the dev workflow:

```bash
npm run dev
```

The agent is configured via environment variables with sensible defaults:

| Env         | Default     | Description                            |
| ----------- | ----------- | -------------------------------------- |
| `WS_HOST`   | `127.0.0.1` | WebSocket bind host (loopback only)    |
| `WS_PORT`   | `8765`      | WebSocket port                         |
| `LOG_LEVEL` | `info`      | `debug` \| `info` \| `warn` \| `error` |

## 7. WebSocket endpoint

```
ws://127.0.0.1:8765
```

The server binds **only** to `127.0.0.1` (never `0.0.0.0`) so the reader is never exposed to the LAN or internet.

## 8. WebSocket protocol

All messages are JSON text frames.

**Reader connected** (also sent to each client immediately on connect):

```json
{ "type": "reader_status", "status": "connected", "reader": "ACS ACR122U" }
```

**Reader disconnected:**

```json
{ "type": "reader_status", "status": "disconnected", "reader": "ACS ACR122U" }
```

**Card detected:**

```json
{ "type": "card_detected", "uid": "047A218C916B80" }
```

**Card removed:**

```json
{ "type": "card_removed" }
```

Notes:

- The UID is uppercase hexadecimal without spaces or separators.
- The agent broadcasts hardware events to all connected clients.
- The server is read-only: arbitrary client messages are safely ignored (or a protocol error is returned). No hardware control commands are implemented.

## 9. Manual hardware testing

See [tasks/007-manual-hardware-testing.md](tasks/007-manual-hardware-testing.md) for the full 10-test checklist. Summary:

1. Start without reader → agent stays alive, logs "No reader found / Waiting..."
2. Plug in reader → "Reader connected"
3. Tap card → "Card detected", UID printed
4. Keep card on reader → exactly one `card_detected` (no spam)
5. Remove card → "Card removed"
6. Tap again → "Card detected" again
7. Unplug reader → "Reader disconnected", agent stays alive
8. Reconnect reader → "Reader connected" (no restart)
9. Disconnect a WebSocket client → agent keeps running
10. Two clients connected → both receive `card_detected`

## 10. Troubleshooting ACR122U detection

- **Reader not listed:** ensure the PC/SC daemon is running; reinstall the platform driver (`pcsc-lite` on macOS, ACS driver on Windows).
- **Name mismatch:** the agent matches reader names containing an ACR122U-compatible token and tolerates minor Win/macOS differences. Run with `LOG_LEVEL=debug` to see all detected readers.
- **Card not detected:** confirm the card is a PC/SC-visible contactless card; clean the reader surface; check USB connection.
- **WebSocket clients can't connect:** confirm the client connects to `127.0.0.1:8765` (loopback only by design).
