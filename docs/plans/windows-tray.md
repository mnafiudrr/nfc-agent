# Windows — Run in the System Tray (no console window)

> References: [windows-exe.md](windows-exe.md) · [packaging.md](packaging.md) · [../rules/dependency-policy.md](../rules/dependency-policy.md)

## 1. Goal

Today `acr122u-agent.exe` runs as a console application. Every launch opens a terminal window, and that window's close button (X) terminates the agent — so a user tidying their desktop silently kills NFC reading for the whole machine.

Target behaviour on Windows:

- No console window at any point.
- A system tray icon shows that the agent is running, and what state it is in.
- Quitting is a deliberate act: tray menu → **Quit**.
- macOS behaviour is unchanged.

## 2. Current behaviour

| Fact                                        | Evidence                                                                                           |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| The exe is a console (CUI) app              | PE `Subsystem` field = `3` at file offset `0xD4` (`e_lfanew` `0x78` + 92)                          |
| All logging goes to the console only        | [`src/logger.ts`](../../src/logger.ts) writes to `process.stdout` / `process.stderr`, nowhere else |
| Graceful shutdown is wired for signals only | [`src/index.ts`](../../src/index.ts) handles `SIGINT` / `SIGTERM`                                  |
| Closing the console is not a clean signal   | Windows sends `CTRL_CLOSE_EVENT` and kills the process after ~5 s whether or not cleanup finished  |
| A second launch fails invisibly             | No single-instance guard; the second process dies with `EADDRINUSE` on port 8765                   |

## 3. Approach — two independent halves

The work splits cleanly, and the split matters because **Half A alone already solves the reported problem**:

| Half                 | Delivers                                                       | New dependencies |
| -------------------- | -------------------------------------------------------------- | ---------------- |
| **A — Headless exe** | No console window exists, so there is no close button to click | None             |
| **B — Tray icon**    | Visible status and a deliberate Quit                           | One (see §5)     |

Ship A first. It is a build-script change plus a logging change, it raises no dependency-policy question, and it removes the accidental-close failure outright. B then restores the visibility that A takes away.

## 4. Half A — headless exe

### 4.1 Flip the PE subsystem

A Windows executable declares whether it wants a console in one 16-bit field of its PE optional header. Setting it to `2` (GUI) instead of `3` (CUI) makes the loader skip console allocation entirely — no window, no flash.

The field sits at `e_lfanew` + 4 (PE signature) + 20 (COFF header) + 68, i.e. offset `0xD4` in the current exe. Patch it as a post-build step in `scripts/build-win-exe.ps1`:

```powershell
$bytes  = [System.IO.File]::ReadAllBytes($Output)
$peOff  = [BitConverter]::ToInt32($bytes, 0x3C)
$subOff = $peOff + 92
if ($bytes[$subOff] -eq 3) {
    $bytes[$subOff] = 2          # IMAGE_SUBSYSTEM_WINDOWS_GUI
    [System.IO.File]::WriteAllBytes($Output, $bytes)
}
```

**Verified against the current build.** A patched copy of `acr122u-agent.exe` launched with no console window (`MainWindowHandle = 0`), stayed alive, and served port 8765 — Node tolerates the now-invalid stdout handle rather than crashing on its startup log lines.

Alternatives rejected:

| Option                                      | Why not                                                                      |
| ------------------------------------------- | ---------------------------------------------------------------------------- |
| `.vbs` / `.bat` launcher with hidden window | Ships a second file users can bypass; a console still flashes                |
| `editbin /subsystem:windows`                | Needs the VS toolchain on `PATH` at build time; the byte patch needs nothing |
| FFI `FreeConsole()` at startup              | The console is created and visibly flashes before the call runs              |

### 4.2 Logging must gain a file sink

With no console, stdout goes nowhere: every log line the agent writes today is lost, and diagnosing a field problem becomes impossible.

- Extend [`src/logger.ts`](../../src/logger.ts) with a sink abstraction; keep the existing stdout/stderr sink, add a file sink.
- Default path `%LOCALAPPDATA%\acr122u-agent\logs\agent.log` (`~/Library/Logs/acr122u-agent/` on macOS).
- Size-based rotation (e.g. 5 MB × 3 files) so an always-on agent cannot fill a disk.
- Keep the console sink active when a console exists, so `npm run dev` is unaffected.
- A failed log write is swallowed, never thrown into the app.

This preserves the existing rule that modules log through the shared logger and never `console.log` directly.

### 4.3 Single-instance guard

Once there is no console, a user who double-clicks the exe twice gets no feedback at all — the second process dies silently on `EADDRINUSE`.

Bind the WebSocket port first and treat `EADDRINUSE` as "already running": log it, optionally notify, and exit `0` rather than `1`. A named mutex is the more conventional Windows answer, but the port is already the genuinely contended resource and needs no FFI.

### 4.4 Known gap between A and B

Between Half A and Half B the only way to stop the agent is Task Manager. That is acceptable for an internal pre-release but is not a shippable end state — which is why Half B follows immediately.

## 5. Half B — tray icon

### 5.1 Scope

- Icon in the notification area, using `assets/asliv.ico`, with a green dot badge when a reader is attached and a red one when none is (§5.5).
- Tooltip carrying the current `ReaderState`.
- **Left-click → the live log window** (§5.6); right-click → menu.
- Menu: **Status** (reader name / state, disabled label) · **Show log** · **Open log folder** · **Copy WebSocket URL** · **Quit**.
- Desktop notifications on plug and unplug (§5.7).
- **Quit** calls the existing `shutdown()` in `index.ts`; no new teardown path.

### 5.2 Options

| Option                                               | Last published | Size    | Mechanism                                             | Assessment                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------- | -------------- | ------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`koffi`](https://www.npmjs.com/package/koffi)       | 2026-09-14     | 1.7 MB  | FFI; we call `Shell_NotifyIcon` and friends ourselves | Actively maintained, prebuilt (no node-gyp). Costs ~300–400 lines of Win32 glue: message-only window, `WndProc` callback, `PeekMessage` pump on a timer, `TrackPopupMenu`.                                                                                                   |
| [`systray2`](https://www.npmjs.com/package/systray2) | 2022-05-19     | 11.4 MB | Spawns a bundled Go helper, JSON over stdio           | Simple API, but unmaintained for ~4 years, and pkg **cannot exec a binary from its snapshot** — the helper must be written to disk and run. An unsigned exe dropped in temp and executed is a classic AV heuristic trigger, on top of an app that already trips SmartScreen. |
| [`trayicon`](https://www.npmjs.com/package/trayicon) | 2022-05-22     | 48 KB   | Ships a .NET helper exe                               | Same drop-and-exec problem; also unmaintained.                                                                                                                                                                                                                               |
| Electron                                             | —              | —       | —                                                     | Explicitly banned by [dependency-policy.md](../rules/dependency-policy.md) §4.                                                                                                                                                                                               |

### 5.3 Recommendation

**`koffi`.** It is the only actively maintained option, it adds no second process and no executable written to disk, and it keeps the distributable a single file. The cost is real — Win32 glue we own and cannot easily unit-test — but it is bounded, whereas the alternative buys simplicity with a four-year-stale dependency plus an antivirus risk in the field.

Either choice sits outside the allowed list in `dependency-policy.md` §2, so §5 of that document applies: record the justification in the PR.

### 5.4 Packaging notes

- The `.ico` must reach the running exe. Add it to `pkg.assets` and extract it to `%LOCALAPPDATA%` on first run, since `LoadImageW` needs a real filesystem path and the pkg snapshot is not one. An icon is inert data, so this raises none of the AV concerns an extracted executable would.
- **pkg cannot resolve `await import()` inside its ESM snapshot.** A dynamic import of the Windows-only module fails at runtime with `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING` — and only in the packaged exe, never under `node dist/index.js`. So the platform branch must be a runtime check around a **static** import, which in turn means the Windows-only module has to be importable on macOS: every `koffi.load()` call is deferred into a memoised `loadWin32()` rather than run at module scope.
- Add koffi's prebuilt binary (`node_modules/@koromix/koffi-win32-x64/win32_x64/koffi.node`) to `pkg.assets`. koffi resolves it through a computed path that pkg's static analysis cannot see.
- Pump messages from a `setInterval` (~50 ms), not a blocking `GetMessage` loop, so libuv keeps running.
- Tear the icon down on exit. An orphaned tray icon that lingers until the user hovers over it is a common and very visible bug.

### 5.5 Making the icon visible, and the status badge

Windows 11 parks **every** newly registered tray icon in the hidden overflow flyout behind the `^` chevron. The icon is registered correctly and simply never shown, which reads to a user as "the agent did not start". Explorer records each icon under:

```
HKCU\Control Panel\NotifyIconSettings\<id>
    ExecutablePath : ...\acr122u-agent.exe
    IsPromoted     : 1 = pinned to the taskbar
```

The agent sets `IsPromoted` itself on start, finding the subkey whose `ExecutablePath` matches `process.execPath`. Explorer only writes the key after it has seen the icon, so the lookup retries at 0.8 s, 2 s and 5 s. The value is written only when absent or `0`, so a user who deliberately drags the icon back into the overflow is not overridden on the next start.

The badge is derived at runtime from `assets/asliv.ico`: `src/tray/badge.ts` decodes the uncompressed 32bpp icon, composites an antialiased dot in the bottom-right, and re-encodes two variants. Swapping the brand icon restyles the tray with no build step. A PNG-compressed source cannot be decoded, in which case the tray falls back to the unbadged icon and logs a warning.

### 5.6 The live log window

Left-clicking the icon opens a plain Win32 window wrapping a read-only multiline `EDIT` control in Consolas. `WM_CLOSE` **hides** the window rather than destroying it, so closing the log never stops the agent.

`BufferedLogSink` keeps the last 500 lines and is installed before the tray exists, so a window opened later still shows the startup lines. The control is rebuilt from that capped buffer every 400 appends, bounding memory on a long-running agent.

Two traps worth remembering:

- `EM_SETSEL(-1, -1)` does **not** move the caret to the end of an `EDIT` control — it collapses the selection at the start, so appends land at the top and the log reads backwards. Query `WM_GETTEXTLENGTH` and select `(len, len)` instead.
- Without `ES_AUTOHSCROLL` the horizontal scrollbar is inert and long lines wrap.

### 5.7 Notifications

`Shell_NotifyIcon` with `NIF_INFO` shows "Device is plugged" / "Device is unplugged", surfaced as toasts on Windows 10 and 11. They hang off the existing `readerConnected` / `readerDisconnected` events, so they cannot disagree with the badge. A reader already attached at launch counts as a connect, so the agent notifies shortly after start.

### 5.8 The executable icon is not achievable with pkg

Setting a custom icon on the packaged `.exe` was attempted and abandoned. pkg appends its virtual filesystem as an overlay after the last PE section and bakes that absolute offset into the binary. Any tool that edits PE **resources** rewrites the section table:

| Attempt                                         | Result                                                                                                                   |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `rcedit --set-icon` on the packaged exe         | `EndUpdateResource` drops the overlay — 1,987,862 bytes of payload. Exe fails with `Pkg: Error reading from file.`       |
| Re-appending the saved overlay afterwards       | Payload returns, but the resource section grew ~3 KB, so the baked offset now points into it. Dies on a garbled prelude. |
| Stamping the icon onto pkg's cached base binary | pkg re-fetches the base when it has been modified.                                                                       |
| Renaming the modified base to `built-`          | pkg used the fetched copy anyway.                                                                                        |

The subsystem patch (§4.1) is safe for the opposite reason: it flips two bytes in the PE header and moves nothing.

The tray icon — what users actually see while the agent runs — is the brand icon. Only the file icon in Explorer stays Node's hexagon. Changing that needs a different packager, or the `-Fallback` bundled-runtime layout, where `node.exe` is a plain copy with no overlay and can be stamped safely.

## 6. Architecture fit

- New `src/tray/` module exposing a `TrayController` interface, mirroring how `ReaderManager` hides PC/SC from the rest of the app.
- Two implementations: `Win32TrayController` and a no-op used on macOS and in tests, selected by `process.platform` in `index.ts`.
- The tray consumes `ReaderManager` events (`readerConnected`, `cardDetected`, …) to drive tooltip and icon. It must not touch `nfc-pcsc` directly — the same rule the rest of the app follows.
- `Quit` delegates to the existing `shutdown()`; the tray owns no teardown logic of its own.

## 7. Testing

- Unit-test the state → tooltip/icon mapping as a pure function, with no Win32 involved.
- Unit-test the single-instance guard by binding the port first, then asserting a clean exit.
- Unit-test log rotation against a temp directory.
- The Win32 layer itself stays manual: add tray cases to [`../tasks/007-manual-hardware-testing.md`](../tasks/007-manual-hardware-testing.md) — icon appears, tooltip tracks reader state, Quit shuts down cleanly, icon disappears, no console at any point.

## 8. Risks

| Risk                                                                              | Mitigation                                                                                                                       |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| GUI subsystem changes Node stdio behaviour in a way the 5 s probe did not surface | Soak-test with the file sink enabled before shipping; the file sink is what makes such a failure visible at all                  |
| Win32 FFI glue is fiddly and hard to test                                         | Keep it in one module behind `TrayController`; spike it before committing to §5.3                                                |
| Antivirus / SmartScreen flags the patched exe                                     | The subsystem flip changes no code, but any unsigned exe already trips SmartScreen — code signing is the real fix (out of scope) |
| Tray icon leaks on abnormal exit                                                  | Delete the icon in `shutdown()` and in a `process.on('exit')` guard                                                              |
| Users cannot find a running agent with no console and no icon                     | Half A and Half B ship in the same release                                                                                       |

## 9. Phasing

| Phase | Work                                                          | Status                                                       |
| ----- | ------------------------------------------------------------- | ------------------------------------------------------------ |
| 0     | Spike the tray mechanism (§5.3) on a throwaway branch         | **Done** — koffi confirmed; struct sizes match x64 exactly   |
| 1     | Subsystem patch · file sink · single-instance guard           | **Done** — [task 008](../tasks/008-headless-windows-mode.md) |
| 2     | Tray icon, menu, Quit, status tooltip                         | **Done** — [task 009](../tasks/009-windows-system-tray.md)   |
| 3     | Brand icon · taskbar pin · status badge · toasts · log window | **Done** — §5.5–§5.7                                         |
| 4     | Start with Windows toggle                                     | Not started                                                  |

Phases 1 and 2 are verified from the packaged exe. What remains is the manual pass in
[../tasks/007-manual-hardware-testing.md](../tasks/007-manual-hardware-testing.md) tests 11–19: the icon
being visible, the menu, Quit, and Explorer restart all need a human and real hardware.

## 10. Not in scope

- Code signing the executable (SmartScreen).
- A Windows Service mode — PC/SC in session 0 has its own problems, and a service gives the user no visible status.
- An MSI or other installer.
- A tray / menu-bar UI on macOS.
- Any change to the WebSocket protocol or the reader layer.
