# ACR122U Local Agent

> Standalone cross-platform background agent for the **ACR122U-A9** NFC reader over PC/SC with a local WebSocket server.

```
ACR122U → PC/SC → Node.js Agent → Local WebSocket (ws://127.0.0.1:8765) → External Client
```

The agent communicates with the ACR122U through PC/SC and broadcasts reader/card events over a loopback-only WebSocket server. It is a headless hardware agent with no database, HTTP API, or frontend.

**Documentation:** [docs/README.md](docs/README.md) (architecture, protocol, manual test checklist)

---

## Development

For contributors working on the source.

### Prerequisites

- Node.js 18+ and npm
- A working PC/SC stack (built-in `pcscd` on macOS; on Windows the Smart Card service is built in, and the
  reader usually binds to the inbox CCID driver — install the ACS driver only if it does not)
- ACR122U-A9 reader (or any PC/SC reader matching an ACR122U pattern)

### Setup & run

```bash
npm install

npm run build && npm start   # compile TS then run
npm run dev                  # watch mode (tsx)
```

Configuration via environment variables (sensible defaults):

| Env         | Default     | Description                                |
| ----------- | ----------- | ------------------------------------------ |
| `WS_HOST`   | `127.0.0.1` | WebSocket bind host (loopback only)        |
| `WS_PORT`   | `8765`      | WebSocket port                             |
| `LOG_LEVEL` | `info`      | `debug` \| `info` \| `warn` \| `error`     |
| `LOG_FILE`  | per-OS path | Log file path; empty disables file logging |

### Versioning

One patch bump per change. Before committing:

```bash
npm run bump   # 0.1.1 -> 0.1.2, and regenerates src/version.ts
```

Commit `package.json`, `package-lock.json` and `src/version.ts` together with the change they describe.

`src/version.ts` is **generated** — never edit it by hand. The version is baked in at bump time rather than
read from `package.json` at runtime, because `package.json` is not reliably reachable from inside the pkg
ESM snapshot. `npm run bump` regenerates it through npm's `version` lifecycle hook, and both `npm test` and
`npm run build:exe` fail if the two ever disagree.

`npm version` is run with `--no-git-tag-version`, so it touches no git state: no commit, no tag, and it
works with a dirty working tree.

### Quality commands

```bash
npm test       # unit tests (tsx --test)
npm run lint   # ESLint
npm run format # Prettier
```

---

## Production

For end users running the agent without Node.js.

### Option A — Install the prebuilt executable (recommended)

Node.js is **not** required. Do this in order — most machines need no driver install at all:

1. **Plug in the reader first.**
2. Check **Device Manager → Smart card readers**.
   - `ACS ACR122U PICC Interface` is listed → **you are done, skip to step 4.** Windows 10/11 ship an
     inbox CCID driver (`Microsoft Usbccid Smartcard Reader (WUDF)`) and the ACR122U is a CCID device,
     so it usually enumerates on its own.
   - The reader shows under **Other devices**, as an unknown device, or not at all → continue to step 3.
3. Install the official **ACS ACR122U driver**, then re-check Device Manager. This is typically needed
   only where Windows Update driver search is disabled by policy, or on offline machines.
4. Run `acr122u-agent.exe` — it binds to `ws://127.0.0.1:8765` and emits `card_detected` events with the
   normalized UID.

The agent runs **in the system tray, with no console window** — there is no terminal to close by accident.

| Action                   | What happens                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------- |
| Tray icon badge          | **Green dot** when the reader is attached, **red dot** when it is not                 |
| Reader plugged/unplugged | A notification: _Device is plugged_ / _Device is unplugged_                           |
| **Left-click** the icon  | Opens a live log window. Closing that window does **not** stop the agent              |
| **Right-click** the icon | Menu: status · **Show log** · **Open log folder** · **Copy WebSocket URL** · **Quit** |

Quitting from the tray menu is the intended way to stop the agent.

> The agent pins its own icon to the taskbar on first run. Windows 11 otherwise hides every new tray icon
> behind the `^` chevron, which looks like the agent failed to start. If you drag the icon back into the
> overflow, it stays there — the agent will not re-pin it.

> The **file** icon in Explorer is still Node's hexagon, not the brand mark. pkg bakes the offset of its
> bundled payload into the executable, so editing the icon afterwards corrupts it; see
> [docs/plans/windows-tray.md §5.8](docs/plans/windows-tray.md). The tray icon is the brand mark.

Because there is no console, logs go to a file instead:

| Platform | Log file                                      |
| -------- | --------------------------------------------- |
| Windows  | `%LOCALAPPDATA%\acr122u-agent\logs\agent.log` |
| macOS    | `~/Library/Logs/acr122u-agent/agent.log`      |

Logs rotate at 5 MB and keep three files. Set `LOG_FILE` to write elsewhere, or to an empty value to turn
file logging off. Launching the exe a second time is a no-op: it logs `Agent already running` and exits,
leaving the first instance untouched.

You do **not** need to start or enable the Windows **Smart Card** service (`SCardSvr`). It is part of
Windows and is trigger-started on smart-card-reader device arrival, so seeing it `Stopped` before the
reader is plugged in is normal.

> Deploying to many machines? Shipping the ACS driver installer alongside the exe and running it
> unconditionally is harmless when the inbox driver already works, and removes the step-2 branch from
> your support burden.

### Option B — Build the exe yourself (Windows x64/amd64)

On a Windows x64 machine with **Node.js LTS**, **VS Build Tools** (Desktop development with C++) and
**Python 3** installed, from the repo root:

```powershell
npm run build:exe
```

That runs [`scripts/build-win-exe.ps1`](scripts/build-win-exe.ps1), which installs dependencies, verifies the native `pcsclite` addon, compiles TypeScript, and packages the exe with a `pkg` target matched to your local Node major version.

Python 3 is required because `@pokusew/pcsclite` has no prebuilt binaries and compiles via `node-gyp`.
Install it with `winget install --id Python.Python.3.12 -e --scope user`. Note that the `python.exe`
Windows puts on `PATH` at `%LOCALAPPDATA%\Microsoft\WindowsApps` is a 0-byte Microsoft Store
placeholder, not an interpreter - node-gyp fails with `find Python ... version is ""` if that is all it finds.

Output — two files, byte-identical, in `dist\bin\win-x64\`:

| File                       | Purpose                                                       |
| -------------------------- | ------------------------------------------------------------- |
| `acr122u-agent-v0.1.1.exe` | The versioned artifact. Archive this, attach it to a release. |
| `acr122u-agent.exe`        | Stable name. **Install and run this one.**                    |

Run the stable name, not the versioned one. The tray-pinning logic keys off the executable's path, so a
filename that changes every release makes Windows treat the agent as a brand-new app each time — it gets
re-pinned to the taskbar, and a deliberate unpin does not survive the upgrade. The running agent reports
its version in the log and in the tray menu regardless of which file you launched.

Earlier versioned builds are deleted on each build; pass `-KeepVersions 3` to retain more, or
`-NoStableCopy` to skip the stable copy.

Useful switches:

```powershell
# skip npm ci when node_modules is already built by the same Node major
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\build-win-exe.ps1 -SkipInstall

# ship node.exe + app + run.bat instead of a single exe (never hits pkg/ABI issues)
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\build-win-exe.ps1 -Fallback
```

Full background, CI recipe, and troubleshooting: [docs/plans/windows-exe.md](docs/plans/windows-exe.md).

> Notes:
>
> - The exe must be built **on Windows** because `@pokusew/pcsclite` is a native addon compiled per OS/arch + Node ABI. macOS and Linux cannot produce it.
> - **Bun is not used** — the project runs on Node/npm, and Bun's runtime cannot load the non-N-API pcsclite addon.
> - Only Node.js is removed. The exe still needs the reader to appear as a PC/SC device on the target
>   machine — often satisfied by the Windows inbox CCID driver, otherwise by the ACS driver (see Option A).
>   The `WinSCard.dll` API the addon imports and the `SCardSvr` service are both part of Windows, and a
>   USB driver cannot be bundled into a `pkg` executable.

### Verify after install

1. Run the executable (no Node.js installed).
2. Confirm `Agent started` and the WebSocket binds to `ws://127.0.0.1:8765`.
3. Tap a card → log shows `Card detected` with the UID. Full checklist: [docs/tasks/007-manual-hardware-testing.md](docs/tasks/007-manual-hardware-testing.md).

---

## WebSocket protocol (both modes)

All messages are JSON text frames:

```json
{ "type": "reader_status", "status": "connected", "reader": "ACS ACR122U" }
{ "type": "card_detected", "uid": "047A218C916B80" }
{ "type": "card_removed" }
```

The server binds only to `127.0.0.1` and is read-only (no hardware control commands).
