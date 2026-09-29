# Task 008 — Headless Windows Mode (no console window)

> Depends on: [007-manual-hardware-testing.md](007-manual-hardware-testing.md)
> References: [../plans/windows-tray.md](../plans/windows-tray.md) §4 · [../plans/windows-exe.md](../plans/windows-exe.md)

## Goal

Make `acr122u-agent.exe` run with **no console window**, so there is no close button for a user to click by accident. Keep the agent diagnosable by moving logs to a file, and make a second launch fail visibly instead of silently.

This task is independently shippable and adds **no new dependencies**. It deliberately leaves the agent with no user-facing quit path — [009](009-windows-system-tray.md) supplies that.

## Steps

1. **Patch the PE subsystem** in `scripts/build-win-exe.ps1`, after pkg produces the exe and before the smoke test: read `e_lfanew` at `0x3C`, flip the byte at `e_lfanew + 92` from `3` to `2`. Skip silently if it is already `2`; fail loudly if it is any other value, which would mean the PE layout assumption is wrong.
2. **Adapt the smoke test.** It currently reads the exe's stdout to look for `Agent started`; with no console that output is gone. Point it at the new log file instead.
3. **Add a sink abstraction to `src/logger.ts`.** Keep the current stdout/stderr behaviour as one sink; add a file sink. Do not change the `Logger` public API used by the rest of the app.
4. **Add the file sink**: `%LOCALAPPDATA%\acr122u-agent\logs\agent.log` on Windows, `~/Library/Logs/acr122u-agent/agent.log` on macOS. Create the directory on first write. Size-based rotation, 5 MB × 3 files. Swallow write errors — logging must never take the agent down.
5. **Make the log path configurable** via `LOG_FILE` in `src/config.ts`, consistent with the existing `WS_HOST` / `WS_PORT` / `LOG_LEVEL` handling. An empty value disables the file sink.
6. **Add the single-instance guard** in `src/index.ts`: on `EADDRINUSE` from the WebSocket server, log `Agent already running` and `process.exit(0)` rather than falling into the generic fatal-error path that exits `1`.
7. **Update docs**: README Option A gains a "where are the logs" line and a note that the agent has no window; `docs/plans/windows-exe.md` §5 verification steps switch from console output to the log file.

## Checklist

- [ ] Built exe has PE `Subsystem` = `2`
- [ ] Launching the exe shows no console window and no window flash
- [ ] Agent still binds `127.0.0.1:8765` and serves clients
- [ ] `agent.log` receives the startup lines and subsequent card events
- [ ] Log rotates at the size threshold and keeps the expected number of files
- [ ] A read-only or unwritable log directory does not crash the agent
- [ ] Second launch exits `0` and logs `Agent already running`; the first keeps working
- [ ] `npm run dev` and `npm start` still log to the console as before
- [ ] macOS build is unaffected
- [ ] Unit tests cover rotation and the single-instance guard

## Verification

Soak the patched exe for at least an hour with `LOG_LEVEL=debug` and a reader attached. The 5-second probe in the plan proved the process survives a handful of stdout writes with no console; it did not prove that thousands of them are safe. Confirm the log keeps growing and the process is still serving at the end.
