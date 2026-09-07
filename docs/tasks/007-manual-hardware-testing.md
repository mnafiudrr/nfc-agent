# Task 007 — Manual Hardware Testing

> Depends on: all
> References: [../README.md §9](../README.md) · [../plans/prd.md](../plans/prd.md)

## Goal
Verify the agent against a physical ACR122U-A9 using the 10-test checklist. Run each test and record the observed result.

## Tests

**Test 1 — Agent without reader**
Start the agent with no ACR122U.
Expected: logs `Agent started`, `No reader found`, `Waiting...`. Agent remains alive.

**Test 2 — Connect reader**
Plug in the ACR122U.
Expected: `Reader connected`.

**Test 3 — Tap card**
Expected: `Card detected`, `UID: <normalized hex>`.

**Test 4 — Keep card on reader**
Expected: exactly one `card_detected` event. No event spam.

**Test 5 — Remove card**
Expected: `Card removed`.

**Test 6 — Tap again**
Expected: `Card detected`, `UID: <normalized hex>` again.

**Test 7 — Unplug reader**
Expected: `Reader disconnected`, `Waiting for reader...`. Agent remains alive.

**Test 8 — Reconnect reader**
Expected: `Reader connected`. No restart.

**Test 9 — Browser/client disconnect**
Disconnect the WebSocket client.
Expected: agent keeps running; reader keeps working.

**Test 10 — Multiple clients**
Connect two WebSocket clients, tap a card.
Expected: both clients receive `card_detected`.

## Checklist
| Test | Expected | Observed | Pass |
| ---- | -------- | -------- | ---- |
| 1 | Stays alive, no reader | | |
| 2 | Reader connected | | |
| 3 | Card detected + UID | | |
| 4 | One event, no spam | | |
| 5 | Card removed | | |
| 6 | Card detected again | | |
| 7 | Reader disconnected, alive | | |
| 8 | Reader connected, no restart | | |
| 9 | Agent continues running | | |
| 10 | Both clients get event | | |
