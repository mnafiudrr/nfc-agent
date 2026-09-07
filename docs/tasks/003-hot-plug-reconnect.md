# Task 003 — Hot-Plug & Reconnection (Milestone 2)

> Depends on: [002-pcsc-reader-layer.md](002-pcsc-reader-layer.md)
> References: [../plans/prd.md FR-3](../plans/prd.md) · [../plans/architecture.md §6](../plans/architecture.md) · [../diagrams/state-machine.puml](../diagrams/state-machine.puml)

## Goal
Survive reader plug/unplug/replug without restarting the process.

```
plug → detect
unplug → detect
plug → detect again
```

## Steps
1. Implement `src/reader/ReaderManager.ts` as an explicit state machine:
   - `STARTING → WAITING_FOR_READER → READER_CONNECTED → WAITING_FOR_CARD ⇄ CARD_PRESENT`
   - Reader removal from any relevant state → `WAITING_FOR_READER`.
2. On reader disconnect, log `Reader disconnected` and return to `WAITING_FOR_READER`; keep polling/listening so a later plug-in is detected.
3. On reader connect, log `Reader connected: <name>` and start card monitoring.
4. Re-run reader discovery on plug/unplug without re-initializing the process.
5. Add unit tests for state transitions (pure logic, no hardware).
6. Verify manually: plug → connect, unplug → disconnect, plug → connect again, all in one process run.

## Checklist
- [ ] Unplugging logs `Reader disconnected`, process stays alive
- [ ] Replugging logs `Reader connected` without restart
- [ ] State transition unit tests pass
