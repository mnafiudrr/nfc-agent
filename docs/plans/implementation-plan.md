# Implementation Plan — ACR122U Local Agent

> Version: 0.1 · Status: Draft · Date: 2026-09-07
> References: [prd.md](prd.md) · [architecture.md](architecture.md) · [../tasks/README.md](../tasks/README.md)

Milestones map 1:1 to the implementation tasks in [../tasks/](../tasks/). Each milestone must be demonstrable before the next begins. The physical ACR122U-A9 UID reading (Milestone 1) works first, before WebSocket/robustness layers are added.

## Milestone 1 — PC/SC + console

Goal: get the physical reader working end-to-end with console output only.

```
Node.js → PC/SC → ACR122U → console
```

Success:

- Reader connected
- Card detected, UID printed (normalized)
- Card removed

This validates the PC/SC driver, reader detection, card reading, and UID normalization before any higher layers exist.

**Task:** [../tasks/002-pcsc-reader-layer.md](../tasks/002-pcsc-reader-layer.md)

## Milestone 2 — Hot-plug handling

Goal: survive plug/unplug/replug without restarting the process.

Success:

- plug → detect
- unplug → detect
- plug → detect again

Implements the `ReaderManager` state machine and reconnection logic.

**Task:** [../tasks/003-hot-plug-reconnect.md](../tasks/003-hot-plug-reconnect.md)

## Milestone 3 — WebSocket

Goal: broadcast events to clients.

```
ACR122U → Agent → WebSocket → Test client
```

Success: a test client receives all reader/card events. Includes message serialization, broadcast, and status-on-connect.

**Task:** [../tasks/004-websocket-server.md](../tasks/004-websocket-server.md)

## Milestone 4 — Robustness

Goal: production-grade reliability.

- reconnection
- error handling (no reader, unplugged reader, card removed, repeated insertion, temporary PC/SC errors, client disconnect, invalid client data)
- multiple clients
- duplicate `card_detected` prevention
- leveled logging
- graceful shutdown (SIGINT/SIGTERM)
- automated unit tests (UID normalization, duplicate prevention, state transitions, WS message serialization, client connect/disconnect)

**Task:** [../tasks/005-robustness-testing.md](../tasks/005-robustness-testing.md)

## Milestone 5 — Packaging prep

Goal: prepare for distributing an executable so the user can run the agent without installing Node.js.

- Identify packaging approach per target (Windows → executable, macOS → executable).
- Do **not** implement the installer yet.

**Task:** [../tasks/006-packaging-prep.md](../tasks/006-packaging-prep.md)

## Manual hardware verification

The 10-test checklist (spec §Manual Hardware Test Checklist) is captured in [../tasks/007-manual-hardware-testing.md](../tasks/007-manual-hardware-testing.md) and must pass before considering the agent complete.

## Delivery order

1. Task 001 (project setup) — foundational scaffold.
2. Tasks 002 → 003 → 004 → 005 — Milestones 1 → 4 in order.
3. Task 006 (packaging prep) — after Milestone 4.
4. Task 007 (manual hardware testing) — run continuously and at the end.
