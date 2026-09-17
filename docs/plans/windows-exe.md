# Windows x64 (amd64) — Building `acr122u-agent.exe`

> Version: 0.1 · Status: Draft · Date: 2026-09-17
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

| Requirement | Notes |
| ----------- | ----- |
| Windows 10/11 x64 (amd64) | The build host. macOS/Linux cannot produce the win-x64 addon. |
| Node.js (LTS, e.g. 24.x) | The **same major version** must be used for `npm ci` and the `pkg` target (§4). Check with `node -v`. |
| npm | Ships with Node.js. |
| Visual Studio Build Tools + Python | `@pokusew/pcsclite` runs `node-gyp rebuild` on `npm install`, so an MSVC toolchain is required. A GitHub Actions `windows-latest` runner already has these preinstalled. |
| Internet access | First `pkg` run downloads the Node base binary for the target. |
| ACS ACR122U driver + Windows Smart Card service | Needed on the **target** machine to use the exe (§6). |

## 4. Build steps (PowerShell)

### 4.1 Install dependencies

```powershell
npm ci
```

`npm ci` triggers a `node-gyp rebuild` for `@pokusew/pcsclite`. Verify the addon exists:

```powershell
Test-Path node_modules\@pokusew\pcsclite\build\Release\pcsclite.node
```

### 4.2 Compile TypeScript

```powershell
npm run build
```

This produces `dist/index.js` (ESM).

### 4.3 Configure pkg

Add a `pkg` block to `package.json` so pkg can find the native addon (it is loaded via the `bindings` package, whose path pkg cannot statically detect):

```json
"pkg": {
  "assets": ["node_modules/@pokusew/pcsclite/build/Release/pcsclite.node"],
  "targets": ["node24-win-x64"]
}
```

> Set the target major to the Node version installed locally (e.g. `node20-win-x64`, `node22-win-x64`, `node24-win-x64`). The addon ABI must match the pkg runtime, otherwise the exe fails at runtime with a `dlopen`/`module did not self-register` error.

### 4.4 Build the executable

```powershell
mkdir -Force dist\bin\win-x64 | Out-Null
npx @yao-pkg/pkg . --output dist\bin\win-x64\acr122u-agent.exe
```

Output: `dist\bin\win-x64\acr122u-agent.exe` (single self-contained file).

### 4.5 CI alternative (GitHub Actions)

```yaml
runs-on: windows-latest
steps:
  - uses: actions/checkout@v4
  - uses: actions/setup-node@v4
    with:
      node-version: 24
  - run: npm ci
  - run: npm run build
  - run: npx @yao-pkg/pkg . --output dist/bin/win-x64/acr122u-agent.exe
  - uses: actions/upload-artifact@v4
    with:
      name: acr122u-agent-win-x64
      path: dist/bin/win-x64/acr122u-agent.exe
```

## 5. Verification

On a **clean Windows machine with no Node.js installed**:

1. Install the ACS ACR122U driver; confirm the reader appears under **Device Manager → Smart card readers → `ACS ACR122U PICC Interface`** and the Smart Card service (`Winscard`) is running.
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

| Requirement | Notes |
| ----------- | ----- |
| Windows x64 | amd64 architecture. |
| ACS ACR122U driver | Official ACS / pcsc-shim driver. |
| Windows Smart Card service | `Winscard`, automatic by default. |
| No Node.js needed | This is the point of packaging. |

## 7. Troubleshooting

| Symptom | Cause / fix |
| ------- | ----------- |
| Exe starts but no reader | PC/SC daemon/service not running, or ACS driver not installed. Reinstall the driver; check Device Manager. |
| Exe fails to load addon (`module did not self-register` / `%1 is not a valid Win32 application`) | ABI or arch mismatch. Rebuild on Windows with the **same Node major** as the `pkg` target; confirm `pcsclite.node` is the win-x64 build. |
| Exe runs but no `card_detected` | Card not PC/SC-visible, or reader name mismatch. Run with `LOG_LEVEL=debug` to list detected readers. |
| Windows SmartScreen blocks first run | The exe is unsigned. Click "More info → Run anyway", or sign with `signtool` (EV/OV cert) after building. |
| WebSocket clients can't connect | Clients must target `ws://127.0.0.1:8765` (loopback only by design). |

## 8. Fallback: bundled runtime (most foolproof)

If pkg proves unreliable with the native addon, ship the Node runtime next to the app instead of a single exe:

```powershell
# On a Windows machine with Node installed
mkdir -Force dist-runtime\win-x64\app | Out-Null
Copy-Item -Recurse dist       dist-runtime\win-x64\app\dist
Copy-Item -Recurse node_modules dist-runtime\win-x64\app\node_modules
Copy-Item (Get-Command node).Source dist-runtime\win-x64\node.exe
```

`run.bat` launcher (`dist-runtime\win-x64\run.bat`):

```bat
@echo off
"%~dp0node.exe" "%~dp0app\dist\index.js"
```

Zip `dist-runtime\win-x64\` and distribute, or wrap it in an installer (Inno Setup / WiX / NSIS). This always works because `node_modules` already contains the win-x64 `pcsclite.node`.

## 9. Not in scope

- Building an installer (Inno Setup / WiX / NSIS) is a later phase — see [implementation-plan.md](implementation-plan.md) Milestone 5 and [packaging.md](packaging.md) §9.
- Code signing is documented as a troubleshooting step only; obtaining a certificate is out of scope.