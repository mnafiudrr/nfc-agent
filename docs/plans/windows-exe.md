# Windows x64 (amd64) — Building `acr122u-agent.exe`

> Version: 0.2 · Status: Draft · Date: 2026-09-17
> References: [packaging.md](packaging.md) · [../tasks/006-packaging-prep.md](../tasks/006-packaging-prep.md) · [../README.md](../README.md)

## 1. Goal

Produce a 64-bit Windows executable `dist/bin/win-x64/acr122u-agent.exe` that an end user can run **without installing Node.js**. The exe talks to the ACR122U through PC/SC and exposes the local WebSocket server (`ws://127.0.0.1:8765`).

## 2. Why pkg (and not Bun)

`nfc-pcsc` depends on the native addon `@pokusew/pcsclite`. The installed version (0.6.0) is a **classic V8-ABI addon**:

- `node_modules/@pokusew/pcsclite/src/addon.cpp` uses `NODE_MODULE(pcsclite, init_all)` (not `NODE_API_MODULE`).
- `node_modules/@pokusew/pcsclite/lib/pcsclite.js` loads it via `require('bindings')('pcsclite')`.

Consequences:

- **Bun cannot run it.** Bun's runtime is JavaScriptCore and only supports N-API addons, so `bun build --compile` is not viable for this project. The project's run/dev toolchain is Node/npm (`npm run dev`, `npm start`), and Bun is excluded from packaging.
- **`pkg` (@yao-pkg/pkg) works.** It ships a real V8-based Node.js runtime inside the exe, so the addon loads as on a normal Node install.
- Because pcsclite is compiled per **OS/arch + Node ABI version**, the exe must be built **on Windows** with a Node major version that matches the `pkg` target (see §4). Cross-compiling the native addon from macOS/Linux is not feasible.

## 3. Prerequisites (build machine = Windows)

| Requirement                                | Notes                                                                                                                                                       |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows 10/11 x64 (amd64)                  | The build host. macOS/Linux cannot produce the win-x64 addon.                                                                                                |
| Node.js LTS (18, 20, 22, or 24)            | The **same major version** is used for `npm ci` and the `pkg` target; the build script derives the target automatically. Check with `node -v`.                |
| npm                                        | Ships with Node.js.                                                                                                                                          |
| Visual Studio Build Tools                  | `@pokusew/pcsclite` ships no prebuilt binaries - it runs `node-gyp rebuild` on every install - so an MSVC toolchain is required (the "Desktop development with C++" workload). A GitHub Actions `windows-latest` runner already has it preinstalled. |
| Python 3                                   | Also needed by `node-gyp`. Install with `winget install --id Python.Python.3.12 -e --scope user`. **The `python.exe` in `%LOCALAPPDATA%\Microsoft\WindowsApps` does not count** - it is a 0-byte Microsoft Store placeholder that is on `PATH` by default and makes node-gyp report `version is ""`. The build script detects a real interpreter and exports `PYTHON` for node-gyp. |
| Internet access                            | First `pkg` run downloads the Node base binary for the target.                                                                                               |
| ACS ACR122U driver + Windows Smart Card service | Needed on the **target** machine to use the exe (§6).                                                                                                   |

## 4. Build

### 4.1 One command

From the repo root, in PowerShell:

```powershell
npm run build:exe
```

This runs [`scripts/build-win-exe.ps1`](../../scripts/build-win-exe.ps1), which performs every step in §4.2 and fails loudly with a hint at the first problem.

Switches:

| Switch          | Effect                                                                                       |
| --------------- | -------------------------------------------------------------------------------------------- |
| `-SkipInstall`  | Skip `npm ci` (only safe if `node_modules` was built by the same Node major).                  |
| `-Target`       | Override the auto-detected pkg target, e.g. `-Target node22-win-x64`.                          |
| `-Output`       | Change the output path (default `dist\bin\win-x64\acr122u-agent.exe`).                         |
| `-Fallback`     | Skip pkg and build the bundled-runtime distribution instead (§8).                              |
| `-NoSmokeTest`  | Do not launch the built exe for a few seconds to confirm it starts.                            |

Invoke switches directly:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\build-win-exe.ps1 -SkipInstall
```

### 4.2 What the script does (manual equivalent)

```powershell
# 1. install deps; triggers node-gyp rebuild for @pokusew/pcsclite
npm ci

# 2. verify the native addon was produced
Test-Path node_modules\@pokusew\pcsclite\build\Release\pcsclite.node

# 3. compile TypeScript -> dist/index.js (ESM)
npm run build

# 4. package, with the target matching the local Node major
mkdir -Force dist\bin\win-x64 | Out-Null
npx @yao-pkg/pkg . --targets node22-win-x64 --output dist\bin\win-x64\acr122u-agent.exe
```

### 4.3 pkg configuration

The `pkg` block is committed in `package.json`:

```json
"pkg": {
  "assets": ["node_modules/@pokusew/pcsclite/build/Release/pcsclite.node"],
  "targets": ["node22-win-x64"]
}
```

`assets` is required because the addon is loaded through the `bindings` package, whose path pkg cannot statically detect. The committed `targets` value is only a default — the build script passes `--targets` derived from `node -v`, which takes precedence. The addon ABI must match the pkg runtime, otherwise the exe fails at runtime with a `module did not self-register` error.

### 4.4 CI alternative (GitHub Actions)

```yaml
runs-on: windows-latest
steps:
  - uses: actions/checkout@v4
  - uses: actions/setup-node@v4
    with:
      node-version: 22
  - run: npm ci
  - run: npm run build
  - run: npx @yao-pkg/pkg . --targets node22-win-x64 --output dist/bin/win-x64/acr122u-agent.exe
  - uses: actions/upload-artifact@v4
    with:
      name: acr122u-agent-win-x64
      path: dist/bin/win-x64/acr122u-agent.exe
```

Keep `node-version` and the `--targets` major in sync.

## 5. Verification

On a **clean Windows machine with no Node.js installed**:

1. Plug in the reader and confirm it appears under **Device Manager → Smart card readers → `ACS ACR122U PICC Interface`**. It usually binds to the Windows inbox CCID driver on its own; install the official ACS driver only if it does not. The Smart Card service (`SCardSvr`) needs no action — it is trigger-started on reader arrival.
2. Double-click or run from a terminal:
   ```powershell
   .\acr122u-agent.exe
   ```
3. Confirm in the log:
   - `Agent started`
   - WebSocket binds to `ws://127.0.0.1:8765`
   - `Reader connected` (ACS ACR122U)
   - `Card detected` with a normalized UID when a card is tapped (run the full checklist in [../tasks/007-manual-hardware-testing.md](../tasks/007-manual-hardware-testing.md)).
4. Stop the process with `Ctrl+C` (SIGINT → graceful shutdown).

## 6. Target machine requirements

| Requirement                 | Notes                                  |
| --------------------------- | -------------------------------------- |
| Windows x64                 | amd64 architecture.                    |
| Reader visible to PC/SC     | Must appear under **Device Manager → Smart card readers**. Usually satisfied by the Windows inbox CCID driver (`Microsoft Usbccid Smartcard Reader (WUDF)`) with no install; fall back to the official ACS driver if it does not enumerate. |
| Windows Smart Card service  | `SCardSvr`, built into Windows and trigger-started on reader arrival. Nothing to install or enable — `Stopped` with no reader attached is normal. |
| `WinSCard.dll`              | The PC/SC API the addon imports. Part of Windows; never shipped with the exe. |
| No Node.js needed           | This is the point of packaging.        |

## 7. Troubleshooting

| Symptom                                                                                     | Cause / fix                                                                                                                                  |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm ci` fails during `node-gyp rebuild`                                                      | Visual Studio Build Tools (C++ workload) or Python 3 is missing. `gyp ERR! find Python ... version is ""` means the only `python.exe` found is the Microsoft Store placeholder stub - install a real Python 3. `npm ci --foreground-scripts` shows the full log. |
| Script reports the addon is missing                                                           | Same as above — the compile step never produced `pcsclite.node`.                                                                               |
| Exe starts but no reader                                                                      | The reader is not visible to PC/SC. Check **Device Manager → Smart card readers**: if it is listed under **Other devices** or missing, install the official ACS driver. Re-plug the reader to fire the `SCardSvr` start trigger. |
| Exe fails to load addon (`module did not self-register` / `%1 is not a valid Win32 application`) | ABI or arch mismatch. Delete `node_modules` and re-run the script so `npm ci` and the pkg target use the same Node major and x64 arch.       |
| pkg rejects the ESM entrypoint                                                                | Re-run with `-Fallback` to ship the bundled runtime (§8) instead.                                                                              |
| Exe runs but no `card_detected`                                                               | Card not PC/SC-visible, or reader name mismatch. Run with `LOG_LEVEL=debug` to list detected readers.                                          |
| Windows SmartScreen blocks first run                                                          | The exe is unsigned. Click "More info → Run anyway", or sign with `signtool` (EV/OV cert) after building.                                       |
| WebSocket clients can't connect                                                               | Clients must target `ws://127.0.0.1:8765` (loopback only by design).                                                                           |

## 8. Fallback: bundled runtime (most foolproof)

If pkg proves unreliable with the native addon, ship the Node runtime next to the app instead of a single exe:

```powershell
npm run build:exe -- -Fallback
```

Or manually:

```powershell
mkdir -Force dist-runtime\win-x64\app | Out-Null
Copy-Item -Recurse dist         dist-runtime\win-x64\app\dist
Copy-Item -Recurse node_modules dist-runtime\win-x64\app\node_modules
Copy-Item (Get-Command node).Source dist-runtime\win-x64\node.exe
```

`run.bat` launcher (`dist-runtime\win-x64\run.bat`):

```bat
@echo off
"%~dp0node.exe" "%~dp0app\dist\index.js" %*
```

The script also zips the folder to `dist-runtime\acr122u-agent-win-x64.zip`. This always works because `node_modules` already contains the win-x64 `pcsclite.node`. Distribute the zip, or wrap it in an installer (Inno Setup / WiX / NSIS).

## 9. Not in scope

- Building an installer (Inno Setup / WiX / NSIS) is a later phase — see [implementation-plan.md](implementation-plan.md) Milestone 5 and [packaging.md](packaging.md) §9.
- Code signing is documented as a troubleshooting step only; obtaining a certificate is out of scope.
