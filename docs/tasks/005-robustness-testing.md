# Task 005 — Robustness & Unit Tests (Milestone 4)

> Depends on: [004-websocket-server.md](004-websocket-server.md)
> References: [../plans/prd.md FR-1/FR-4/FR-6](../plans/prd.md) · [../rules/testing.md](../rules/testing.md)

## Goal
Make the agent production-grade: reliable under disconnections, errors, and multiple clients, with automated tests for all non-hardware logic.

## Steps
1. **Duplicate event prevention**: track current card state in `ReaderManager`; emit exactly one `card_detected` per insertion while the same card remains, and one `card_removed` on removal. Re-emit after a new tap.
2. **Error handling**: ensure the agent never crashes on:
   - no reader connected
   - reader unplugged
   - card removed
   - card inserted repeatedly
   - temporary PC/SC errors
   - WebSocket client disconnect
   - invalid client data
   Log each and recover. Unexpected fatal errors are logged clearly before termination.
3. **Multiple clients**: broadcast to all connected clients; one client's disconnect does not affect others or the reader.
4. **Logging**: leveled logs (DEBUG/INFO/WARN/ERROR) with optional debug output.
5. **Graceful shutdown**: handle `SIGINT`/`SIGTERM` → stop WebSocket server, stop PC/SC monitoring, disconnect reader, log `Agent stopped.`, exit cleanly.
6. **Unit tests** (no hardware):
   - UID normalization
   - duplicate card event prevention
   - state transitions
   - WebSocket message serialization
   - client connect/disconnect handling
7. Ensure `npm test`, `npm run lint`, `npm run build` all pass.

## Checklist
- [ ] Exactly one `card_detected` while a card stays on the reader
- [ ] Agent survives all listed failure modes
- [ ] Two clients both receive events
- [ ] SIGINT/SIGTERM shuts down cleanly, no hanging resources
- [ ] All unit tests pass
