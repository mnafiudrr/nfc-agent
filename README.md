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
- PC/SC daemon installed (built-in `pcscd` on macOS; ACS driver + Smart Card service on Windows)
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

1. Install the **ACS ACR122U driver** on the Windows machine (Node.js is **not** required).
2. Plug in the reader; verify it appears under **Device Manager → Smart card readers → `ACS ACR122U PICC Interface`**.
3. Run `acr122u-agent.exe` — it binds to `ws://127.0.0.1:8765` and emits `card_detected` events with the normalized UID.

### Option B — Build the exe yourself (Windows x64/amd64)

Full step-by-step guide: [docs/plans/windows-exe.md](docs/plans/windows-exe.md).

Quick summary — build on a Windows machine with Node.js + VS Build Tools:

```powershell
npm ci
npm run build

# add the "pkg" config block to package.json (see docs/plans/windows-exe.md §4.3)
npx @yao-pkg/pkg . --output dist\bin\win-x64\acr122u-agent.exe
```

Output: `dist\bin\win-x64\acr122u-agent.exe` — a single self-contained 64-bit executable.

> Notes:
> - The exe must be built **on Windows** because `@pokusew/pcsclite` is a native addon compiled per OS/arch + Node ABI.
> - **Bun is not used** — the project runs on Node/npm, and Bun's runtime cannot load the non-N-API pcsclite addon.
> - The **ACR122U driver is still required** on any machine that runs the exe; only Node.js is removed.

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