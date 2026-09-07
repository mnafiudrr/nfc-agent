# Architecture — ACR122U Local Agent

> Version: 0.1 · Status: Draft · Date: 2026-09-07
> References: [architecture.puml](../diagrams/architecture.puml) · [state-machine.puml](../diagrams/state-machine.puml) · [data-flow.puml](../diagrams/data-flow.puml) · [prd.md](prd.md)

## 1. Tech stack

- Node.js (runtime)
- TypeScript
- `nfc-pcsc` — PC/SC communication with the reader
- `ws` — WebSocket server
- npm
- Dev: ESLint, Prettier, TypeScript compiler, test runner (e.g. Node's built-in `node:test` or Vitest — chosen in task 001)

Runtime dependencies are intentionally minimal: `nfc-pcsc` + `ws`. No Electron, React, Svelte, Vue, Express, Socket.IO, database, or cloud services.

## 2. Component diagram

See [architecture.puml](../diagrams/architecture.puml).

```
Browser / Client (NOT in this repo)
   ↕ WebSocket (127.0.0.1:8765)
ACR122U Agent (Node.js + TypeScript)
   ↕ PC/SC (nfc-pcsc)
ACR122U (USB)
```

## 3. Project structure

```
acr122u-agent/
├── src/
│   ├── index.ts                 # bootstrap: start, wiring, graceful shutdown
│   ├── config.ts                # env config (WS_HOST, WS_PORT, LOG_LEVEL)
│   ├── logger.ts                # leveled logger (DEBUG/INFO/WARN/ERROR)
│   ├── reader/
│   │   ├── ReaderManager.ts     # state machine, discovery, hot-plug, reconnection
│   │   ├── PcscReader.ts        # nfc-pcsc adapter (reader abstraction impl)
│   │   └── types.ts             # ReaderManager interface + shared types
│   ├── websocket/
│   │   ├── WebSocketServer.ts   # ws server, broadcast, client lifecycle
│   │   └── messages.ts          # message serialization / types
│   └── utils/
│       └── uid.ts               # UID normalization
├── package.json
├── tsconfig.json
├── eslint.config.*
├── .prettierrc
├── README.md
├── .gitignore
└── docs/                        # this documentation
```

The structure is intentionally close to the requested layout; it may be simplified if a cleaner split emerges during implementation.

## 4. Reader layer (abstraction)

The rest of the application must not depend on PC/SC implementation details. The reader layer exposes a small interface and provides a PC/SC implementation for ACR122U.

```typescript
interface ReaderManager {
  start(): Promise<void>;
  stop(): Promise<void>;
}
```

The reader layer owns:

- reader discovery
- reader connection
- card monitoring
- UID reading
- reader disconnection
- reconnection (hot-plug)

`PcscReader` wraps `nfc-pcsc` and translates its events into reader-layer events (reader connected/disconnected, card inserted/removed, UID read).

### Reader identification
- Prefer identifying via the PC/SC reader name (e.g. `ACS ACR122U PICC Interface`).
- Do not hardcode one exact string. Match an ACR122U-compatible token and tolerate minor Windows/macOS differences.
- Log all detected readers; ignore unrelated readers when an ACR122U is present.

## 5. Card detection & UID normalization

- On card presence, read the UID and emit one `card_detected` event.
- Normalize the UID in `utils/uid.ts` to uppercase hex without spaces/separators (e.g. `04 7a 21 8c 91 6b 80` → `047A218C916B80`). Keep it a string; never convert to a JS number.
- Track current-card state to prevent duplicate `card_detected` while the same card remains. Only after a removal does the next insertion emit a new `card_detected`.

## 6. State machine

`ReaderManager` uses an explicit state model:

```
STARTING → WAITING_FOR_READER → READER_CONNECTED → WAITING_FOR_CARD ⇄ CARD_PRESENT
```

- Reader removal from any relevant state → `WAITING_FOR_READER`.
- Card present → `CARD_PRESENT`; card removed → `WAITING_FOR_CARD`.
- See [state-machine.puml](../diagrams/state-machine.puml).

## 7. WebSocket server

- Bind only to `127.0.0.1` (never `0.0.0.0`), default port `8765`.
- Broadcast events to all connected clients.
- On client connect, immediately send current reader status.
- Do not replay historical card events.
- Read-only for MVP: safely ignore or return a protocol error for arbitrary client messages.

Message serialization lives in `websocket/messages.ts` and follows [prd.md §7](prd.md#7-protocol-messages).

## 8. Configuration

`config.ts` reads environment variables with defaults:

| Env | Default | Description |
| --- | ------- | ----------- |
| `WS_HOST` | `127.0.0.1` | WebSocket bind host (loopback) |
| `WS_PORT` | `8765` | WebSocket port |
| `LOG_LEVEL` | `info` | `debug` \| `info` \| `warn` \| `error` |

## 9. Graceful shutdown

On `SIGINT`/`SIGTERM`:

1. Stop the WebSocket server.
2. Stop PC/SC monitoring.
3. Disconnect the reader.
4. Log "Agent stopped." and exit cleanly.

No resources should be left hanging.
