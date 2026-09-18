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

| Env         | Default     | Description                            |
| ----------- | ----------- | -------------------------------------- |
| `WS_HOST`   | `127.0.0.1` | WebSocket bind host (loopback only)    |
| `WS_PORT`   | `8765`      | WebSocket port                         |
| `LOG_LEVEL` | `info`      | `debug` \| `info` \| `warn` \| `error` |

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

Output: `dist\bin\win-x64\acr122u-agent.exe` — a single self-contained 64-bit executable.

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
