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

## Windows tray tests (packaged exe only)

These cover the Win32 layer from [../plans/windows-tray.md](../plans/windows-tray.md), which cannot be
unit-tested. Run them against `dist\bin\win-x64\acr122u-agent.exe`, not `node dist/index.js`.

**Test 11 — No console**
Double-click the exe.
Expected: no terminal window appears, not even a flash. The agent is running (check the tray, or the log file).

**Test 12 — Tray icon present**
Expected: the blue NFC icon appears in the notification area. On Windows 11 new icons start in the hidden
overflow ("^"), so expand it; drag it onto the taskbar to keep it visible.

**Test 13 — Tooltip tracks reader state**
Hover the icon with no reader, then plug the reader in, then hold a card on it.
Expected: tooltip moves through `Waiting for reader` → `Ready - <reader name>` → `Card present - <reader name>`.

**Test 14 — Menu actions**
Right-click the icon.
Expected: the menu shows a greyed status line, **Open log folder**, **Copy WebSocket URL**, **Quit**.
Open log folder opens the directory containing `agent.log`; Copy WebSocket URL puts `ws://127.0.0.1:8765`
on the clipboard (paste somewhere to confirm).

**Test 15 — Quit is graceful**
Choose **Quit**.
Expected: the icon disappears immediately, connected WebSocket clients see a clean close, and the log ends
with `Quit selected from the tray menu` followed by `Agent stopped.`

**Test 16 — Second launch**
With the agent running, double-click the exe again.
Expected: nothing visible happens; only one tray icon remains; the second process logs
`Agent already running` and exits. The first agent keeps working.

**Test 17 — Explorer restart**
`taskkill /f /im explorer.exe` then let Explorer restart (or start it from Task Manager).
Expected: the tray icon comes back by itself. Record the result either way — the re-registration path
(`TaskbarCreated`) is implemented but has not been exercised on real hardware.

**Test 18 — Card latency with the menu open**
Open the tray menu and hold it open while tapping a card.
Expected: the tap is reported once the menu closes. `TrackPopupMenu` runs a modal loop, so a short stall
here is expected; anything longer than the menu being open is a bug.

**Test 19 — Log rotation**
Run with `LOG_LEVEL=debug` long enough to pass 5 MB, or set a small limit temporarily.
Expected: `agent.log`, `agent.log.1`, `agent.log.2` exist and no more than three files are kept.

## Checklist

| Test | Expected                       | Observed | Pass |
| ---- | ------------------------------ | -------- | ---- |
| 1    | Stays alive, no reader         |          |      |
| 2    | Reader connected               |          |      |
| 3    | Card detected + UID            |          |      |
| 4    | One event, no spam             |          |      |
| 5    | Card removed                   |          |      |
| 6    | Card detected again            |          |      |
| 7    | Reader disconnected, alive     |          |      |
| 8    | Reader connected, no restart   |          |      |
| 9    | Agent continues running        |          |      |
| 10   | Both clients get event         |          |      |
| 11   | No console window at all       |          |      |
| 12   | Tray icon visible              |          |      |
| 13   | Tooltip tracks state           |          |      |
| 14   | Menu actions work              |          |      |
| 15   | Quit is graceful, icon gone    |          |      |
| 16   | Second launch is a no-op       |          |      |
| 17   | Icon survives Explorer restart |          |      |
| 18   | No lasting stall from the menu |          |      |
| 19   | Log rotates, keeps three files |          |      |
