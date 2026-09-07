# PRD — ACR122U Local Agent

> Version: 0.1 · Status: Draft · Date: 2026-09-07
> References: [architecture.puml](../diagrams/architecture.puml) · [state-machine.puml](../diagrams/state-machine.puml) · [data-flow.puml](../diagrams/data-flow.puml) · [architecture.md](architecture.md) · [implementation-plan.md](implementation-plan.md)

## 1. Overview

A standalone, cross-platform, background agent for the **ACR122U-A9** NFC reader. The agent communicates with the reader through PC/SC and exposes reader/card events over a local WebSocket server. It is a headless hardware agent and is **completely independent** from any web application, backend, or database.

The data flow is:

```
ACR122U → PC/SC → Agent → WebSocket → External Client
```

The consuming client (Yii2, React, Svelte, plain HTML, or anything else) lives in a separate repository. The agent must not depend on it.

## 2. Goals

| # | Goal | Metric |
| - | ---- | ------ |
| G1 | Read an ACR122U card UID and emit an event per insertion/removal | 1 `card_detected` + 1 `card_removed` per tap cycle |
| G2 | Survive reader hot-plug without restart | plug → detect → unplug → detect → plug again, no restart |
| G3 | Run headless forever, independent of clients | no WebSocket client required for operation |
| G4 | Keep dependencies minimal and target Windows + macOS | runtime deps: `nfc-pcsc` + `ws` only |

## 3. Non-Goals

- Yii2 integration
- HTTP API to a backend
- database / Redis / cloud services
- authentication with a backend
- employee management, attendance logic, check-in/check-out
- frontend application
- card writing, MIFARE sector reading, MIFARE authentication, NDEF parsing, DESFire applications
- installer / packaging executables (prepared later, not implemented now)
- Docker setup, Electron

## 4. Actors

| Actor | Description |
| ----- | ----------- |
| ACR122U reader | Hardware device, detected through PC/SC by reader name |
| Agent process | Monitors reader + cards, broadcasts events over WebSocket |
| WebSocket client(s) | Any number of consumers, receive events, may connect/disconnect at will |

## 5. Functional Requirements

### FR-1 Process lifecycle
- FR-1.1 Start as a background process.
- FR-1.2 Continue running when no reader is connected.
- FR-1.3 Continue running when no client is connected.
- FR-1.4 Gracefully shut down on `SIGINT` / `SIGTERM` (stop WebSocket, stop PC/SC, disconnect reader).
- FR-1.5 Never crash from: no reader, unplugged reader, card removed, repeated insertion, temporary PC/SC error, client disconnect, or invalid client data. Log and recover.

### FR-2 Reader discovery & identification
- FR-2.1 List PC/SC readers on start; log the available set.
- FR-2.2 Prefer an ACR122U-compatible reader (match by reader-name token, not raw USB protocol).
- FR-2.3 Tolerate minor reader-name differences across Windows/macOS (do not hardcode one exact string).
- FR-2.4 Ignore unrelated readers when an ACR122U is present.

### FR-3 Reader hot-plug
- FR-3.1 Detect reader connection after start (from "no reader" state).
- FR-3.2 Detect reader disconnection.
- FR-3.3 Detect reconnection without restarting the process.

### FR-4 Card monitoring
- FR-4.1 Detect card insertion and read the card UID.
- FR-4.2 Detect card removal.
- FR-4.3 Do not emit duplicate `card_detected` while the same card remains on the reader (state tracking/debounce).
- FR-4.4 Re-emit `card_detected` after a new tap (removal → insertion cycle).

### FR-5 UID normalization
- FR-5.1 Represent the UID as a string, uppercase hexadecimal, no spaces or separators.
- FR-5.2 Example: `04 7a 21 8c 91 6b 80` → `047A218C916B80`.
- FR-5.3 Never convert the UID to a JavaScript number.

### FR-6 WebSocket server
- FR-6.1 Expose a local WebSocket server bound **only** to `127.0.0.1` (never `0.0.0.0`), default port `8765`.
- FR-6.2 Broadcast hardware events to all connected clients.
- FR-6.3 On client connect, immediately send current reader status.
- FR-6.4 Do not replay historical card events to newly connected clients.
- FR-6.5 Server is effectively read-only for MVP: safely ignore (or return a protocol error for) arbitrary client messages. No hardware control commands.

### FR-7 Protocol messages
- FR-7.1 `reader_status` (connected/disconnected) with reader name.
- FR-7.2 `card_detected` with normalized UID.
- FR-7.3 `card_removed`.
- FR-7.4 All messages are JSON.

### FR-8 Configuration & logging
- FR-8.1 Env-based config with sensible defaults (`WS_HOST`, `WS_PORT`, `LOG_LEVEL`).
- FR-8.2 Log levels: DEBUG, INFO, WARN, ERROR; debug logging optional.
- FR-8.3 Readable logs for agent start, PC/SC init, WS listen, reader connect/disconnect, card detect/remove.

## 6. State Machine

See [state-machine.puml](../diagrams/state-machine.puml).

```
STARTING → WAITING_FOR_READER → READER_CONNECTED → WAITING_FOR_CARD ⇄ CARD_PRESENT
```

Reader removal from any relevant state transitions back to `WAITING_FOR_READER`.

## 7. Configuration

| Env | Default | Description |
| --- | ------- | ----------- |
| `WS_HOST` | `127.0.0.1` | WebSocket bind host (loopback) |
| `WS_PORT` | `8765` | WebSocket port |
| `LOG_LEVEL` | `info` | `debug` \| `info` \| `warn` \| `error` |
