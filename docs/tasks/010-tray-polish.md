# Task 010 — Tray Polish: Brand Icon, Badge, Notifications, Log Window

> Depends on: [009-windows-system-tray.md](009-windows-system-tray.md)
> References: [../plans/windows-tray.md](../plans/windows-tray.md) §5.5–§5.8

## Goal

Make the tray icon visible and useful: the brand mark, a connection badge, plug/unplug notifications, and
a live log window that does not stop the agent when closed.

## Steps

1. **Pin the icon.** Windows 11 hides every new tray icon in the overflow flyout, which reads as "the agent
   did not start". Set `IsPromoted` on the agent's own `NotifyIconSettings` subkey, retrying until Explorer
   has written the key. Only write when absent or `0`, so a deliberate unpin survives a restart.
2. **Use `assets/asliv.ico`** for the tray icon.
3. **Badge it** green when a reader is attached, red when not, deriving both variants at runtime from the
   brand icon so swapping the icon needs no build step.
4. **Notify** on plug and unplug, off the existing `ReaderManager` events so the text cannot disagree with
   the badge.
5. **Live log window** on left-click, right-click keeping the menu. `WM_CLOSE` hides rather than destroys.
6. Fix anything the above depends on — notably that PC/SC blocked the event loop when no reader was present,
   which stopped the message pump and therefore every one of these features.

## Checklist

- [ ] Icon appears on the taskbar without the user expanding the overflow
- [ ] A deliberate unpin is not overridden on the next start
- [ ] Badge is red with no reader, green with one, and switches promptly
- [ ] Notifications read "Device is plugged" / "Device is unplugged"
- [ ] Left-click opens the log; right-click opens the menu
- [ ] Log shows history oldest-first and appends live at the bottom
- [ ] Closing the log leaves the agent running; reopening keeps the history
- [ ] Agent starts and stays responsive with no reader attached
- [ ] macOS build still compiles and runs with the no-op controller

## Not in scope

- A custom icon on the `.exe` file itself. Not achievable with pkg: it bakes the offset of its appended
  payload into the binary, and every PE resource editor moves the sections out from under it. See
  [../plans/windows-tray.md](../plans/windows-tray.md) §5.8 for the four approaches tried.
- "Start with Windows".
