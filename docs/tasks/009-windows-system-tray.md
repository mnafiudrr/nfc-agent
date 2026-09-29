# Task 009 — Windows System Tray Icon

> Depends on: [008-headless-windows-mode.md](008-headless-windows-mode.md)
> References: [../plans/windows-tray.md](../plans/windows-tray.md) §5–§6 · [../rules/dependency-policy.md](../rules/dependency-policy.md)

## Goal

Give the now-windowless agent a system tray icon: visible proof it is running, its current reader state, and a deliberate **Quit**.

## Step 0 — Spike before committing

Do not start step 1 until a throwaway spike shows a tray icon appearing and a menu click reaching JS, **from inside a pkg-packaged exe** — not just under `node dist/index.js`. Packaging is where this approach is most likely to break. The plan recommends `koffi` (§5.3); if the spike shows the Win32 glue is worse than estimated, re-open the §5.2 comparison rather than pushing through.

Record the outcome and the dependency justification in the PR, per `dependency-policy.md` §5.

## Steps

1. **Add `src/tray/types.ts`** with a `TrayController` interface: `start()`, `stop()`, `setState(state, reader)`, and an `onQuit` callback. Model it on `src/reader/types.ts`.
2. **Add `src/tray/NoopTrayController.ts`** — the implementation used on macOS and in tests.
3. **Add `src/tray/Win32TrayController.ts`** — the FFI implementation: message-only window, `WndProc` callback, `PeekMessage` pump on a ~50 ms interval, `Shell_NotifyIcon` add/modify/delete, `TrackPopupMenu` for the menu.
4. **Add `src/tray/status.ts`** — a pure `ReaderState` → `{ tooltip, iconName }` mapping. This is the part that gets unit tests; keep all Win32 out of it.
5. **Ship an `.ico`** in `assets/`, add it to `pkg.assets`, and extract it to `%LOCALAPPDATA%\acr122u-agent\` on first run, since `LoadImageW` needs a real path and the pkg snapshot is not one.
6. **Wire it in `src/index.ts`**: pick the controller by `process.platform`, subscribe it to `ReaderManager` events, and point `onQuit` at the existing `shutdown()`. Do not add a second teardown path.
7. **Delete the icon on shutdown**, and again from a `process.on('exit')` guard, so an abnormal exit does not leave a ghost icon behind.
8. **Menu items**: Status (disabled label showing reader name / state) · Open log folder · Copy WebSocket URL · Quit. Defer "Start with Windows" to [010](#follow-up).

## Checklist

- [ ] Icon appears on launch and disappears on Quit
- [ ] Tooltip tracks reader state: no reader → reader connected → card present
- [ ] Quit runs the existing graceful shutdown; WebSocket clients see a clean close
- [ ] Open log folder opens the directory from task 008
- [ ] Copy WebSocket URL puts `ws://127.0.0.1:8765` on the clipboard
- [ ] Killing the process from Task Manager leaves no ghost icon after a hover
- [ ] The message pump does not starve the event loop — card detection latency is unchanged
- [ ] Works from the **packaged exe**, not only from `node dist/index.js`
- [ ] macOS build still compiles and runs with the no-op controller
- [ ] `npm test` passes without a GUI present
- [ ] Explorer restart (`taskkill /f /im explorer.exe`) — document whether the icon survives; re-register on `TaskbarCreated` if not

## Follow-up

Phase 3 of the plan — "Start with Windows" toggle, balloon notifications on card detection, and a distinct icon per state — belongs in a later task once this one is stable in the field.
