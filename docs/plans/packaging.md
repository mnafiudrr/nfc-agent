# Packaging — Installable App for macOS & Windows

> Version: 0.1 · Status: Draft · Date: 2026-09-07
> References: [../tasks/006-packaging-prep.md](../tasks/006-packaging-prep.md) · [../README.md](../README.md) · [prd.md](prd.md)

## 1. Goal

Deliver the agent so an end user can run it **without installing Node.js** or any toolchain. Two outcomes:

- **macOS** → an `.app` bundle (drag to Applications) + a standalone CLI binary.
- **Windows** → an `.exe` (optionally wrapped in an installer) + a standalone CLI binary.

Packaging must still work against the physical ACR122U through PC/SC, which is the main challenge because `nfc-pcsc` depends on the native addon `@pokusew/pcsclite` (compiled per OS/arch).

## 2. Build requirements

| Tool | Where | Purpose |
| ---- | ----- | ------- |
| Node.js + npm | dev machine | install deps, run `npm run build` (TS → `dist/`) |
| A bundler/compiler | dev machine | produce single-binary executables |
| PC/SC driver/lib | on the **target** machine | `pcsc-lite` (macOS) / ACS Windows driver + Smart Card service |

## 3. Packaging strategies

### 3.1 Single-binary executable (attempt first)

Produce one self-contained binary per OS/arch. Candidate tools:

- **Bun** — `bun build --compile ./dist/index.js --outfile <name>` → native standalone executable.
- **pkg (Vercel)** — `pkg dist/index.js -t node18-macos-arm64,node18-macos-x64,node18-win-x64` → per-platform executables.
- **nexe** — `nexe -t macos-arm64,win-x64` → per-platform executables.

> Caveat: native modules (`.node` files for `pcsclite`) are **not** always embeddable into the single file. If the produced binary cannot find the native addon, fall back to §3.2.

### 3.2 Bundled runtime + launcher (reliable fallback)

Ship the Node runtime + `dist/` + `node_modules` (including the platform-specific `pcsclite` addon) inside an installable bundle, with a small launcher executable that starts the agent.

- **macOS**: a `.app` bundle; `Contents/MacOS/` holds the launcher and a bundled runtime.
- **Windows**: a `.exe` launcher that spawns the bundled runtime.

## 4. Target executables (complete list)

### 4.1 macOS

| # | Executable / artifact | Path | Notes |
| - | --------------------- | ---- | ----- |
| 1 | Application bundle | `dist-app/acr122u-agent.app/` | Drag to `/Applications` |
| 2 | Bundle main binary | `dist-app/acr122u-agent.app/Contents/MacOS/acr122u-agent` | The launcher the OS executes |
| 3 | Standalone CLI (arm64) | `dist/bin/darwin-arm64/acr122u-agent` | Apple Silicon |
| 4 | Standalone CLI (x64) | `dist/bin/darwin-x64/acr122u-agent` | Intel |
| 5 | Universal binary (optional) | `dist/bin/darwin-universal/acr122u-agent` | arm64 + x64 combined via `lipo` |

### 4.2 Windows

| # | Executable / artifact | Path | Notes |
| - | --------------------- | ---- | ----- |
| 1 | CLI executable (x64) | `dist/bin/win-x64/acr122u-agent.exe` | 64-bit |
| 2 | CLI executable (x86) | `dist/bin/win-x86/acr122u-agent.exe` | 32-bit (optional) |
| 3 | GUI/console launcher | `dist/launcher/acr122u-agent-launcher.exe` | Starts the agent on login (optional) |
| 4 | Installer (optional) | `dist/setup/acr122u-agent-setup.exe` | Inno Setup / WiX / NSIS output |

> `dist/bin/*` are the raw executables. The launcher and installer are optional convenience layers.

## 5. macOS build commands

```bash
npm ci
npm run build

# Single binary (arm64 on Apple Silicon)
bun build --compile ./dist/index.js --outfile dist/bin/darwin-arm64/acr122u-agent

# x64 variant (build on/for Intel, or cross-compile)
bun build --compile ./dist/index.js --outfile dist/bin/darwin-x64/acr122u-agent

# Optional: combine into a universal binary
lipo -create dist/bin/darwin-arm64/acr122u-agent dist/bin/darwin-x64/acr122u-agent \
  -output dist/bin/darwin-universal/acr122u-agent

# .app bundle layout
mkdir -p dist-app/acr122u-agent.app/Contents/{MacOS,Resources}
cp dist/bin/darwin-arm64/acr122u-agent dist-app/acr122u-agent.app/Contents/MacOS/acr122u-agent
cp info.plist dist-app/acr122u-agent.app/Contents/Info.plist
codesign --force --deep -s - dist-app/acr122u-agent.app   # ad-hoc signing
```

## 6. Windows build commands

```bash
npm ci
npm run build

# x64
bun build --compile ./dist/index.js --outfile dist/bin/win-x64/acr122u-agent.exe

# x86 (optional)
bun build --compile ./dist/index.js --outfile dist/bin/win-x86/acr122u-agent.exe
```

If native `pcsclite` cannot be embedded, bundle instead:

```bat
REM 1. copy dist\ + node_modules\ next to the exe launcher
REM 2. ship the prebuilt pcsclite addon for win-x64
REM 3. wrap in an installer (Inno Setup / WiX / NSIS) if desired
```

## 7. Native PC/SC dependency note

- `nfc-pcsc` → `@pokusew/pcsclite` is a `node-gyp` native addon.
- It must match the **target** OS + architecture, and must link against PC/SC on the target machine.
- On macOS the target needs `pcsc-lite` (or the built-in `pcscd`). On Windows the target needs the ACS driver + Smart Card service.
- When cross-compiling, build on the same OS/arch as the target, or fetch the correct prebuilt addon.
- **Always verify** with the manual hardware checklist after packaging.

## 8. Verification

After packaging, run the executable **without Node installed** and confirm:

1. Agent starts and logs `Agent started`.
2. WebSocket binds to `ws://127.0.0.1:8765`.
3. ACR122U is detected and a card UID is emitted (see [../tasks/007-manual-hardware-testing.md](../tasks/007-manual-hardware-testing.md)).

## 9. Not in scope

- Building the installer is intentionally **not** implemented yet ([Milestone 5](../plans/implementation-plan.md)). This document only catalogues the artifacts and the commands to produce them.