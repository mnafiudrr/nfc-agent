# Task 004 — WebSocket Server (Milestone 3)

> Depends on: [003-hot-plug-reconnect.md](003-hot-plug-reconnect.md)
> References: [../plans/prd.md FR-6/FR-7](../plans/prd.md) · [../plans/architecture.md §7](../plans/architecture.md) · [../diagrams/data-flow.puml](../diagrams/data-flow.puml)

## Goal

Broadcast reader/card events to WebSocket clients.

```
ACR122U → Agent → WebSocket → Test client
```

## Steps

1. Implement `src/websocket/messages.ts`: typed message builders/serializers for:
   - `reader_status` (connected/disconnected, with reader name)
   - `card_detected` (normalized UID)
   - `card_removed`
2. Implement `src/websocket/WebSocketServer.ts` using `ws`:
   - bind to `127.0.0.1` only (never `0.0.0.0`), port from config (default `8765`)
   - log `WebSocket server listening on 127.0.0.1:8765`
   - on client connect, immediately send current reader status
   - broadcast all hardware events to all connected clients
   - on client disconnect, log `WebSocket client disconnected`; continue monitoring the reader
3. Read-only server: safely ignore arbitrary client messages (or return a protocol error). No hardware control commands.
4. Wire `ReaderManager` events → `WebSocketServer` broadcast in `src/index.ts`.
5. Add unit tests for message serialization and client connect/disconnect handling.
6. Verify with a small test WebSocket client (see [../diagrams/data-flow.puml](../diagrams/data-flow.puml)) that it receives all reader/card events.

## Checklist

- [ ] Test client receives `reader_status` on connect
- [ ] Test client receives `card_detected` / `card_removed`
- [ ] Multiple clients each receive events
- [ ] Server bound only to 127.0.0.1
