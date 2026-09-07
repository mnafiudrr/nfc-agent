# Task 002 — PC/SC Reader Layer (Milestone 1)

> Depends on: [001-project-setup.md](001-project-setup.md)
> References: [../plans/prd.md FR-2/FR-4/FR-5](../plans/prd.md) · [../plans/architecture.md §4/§5](../plans/architecture.md) · [../rules/pcsc-reader.md](../rules/pcsc-reader.md)

## Goal
Get the physical ACR122U working end-to-end with console output only: read a card UID and print it, before any WebSocket layer exists.

```
Node.js → PC/SC → ACR122U → console
```

## Steps
1. Implement `src/reader/types.ts`: `ReaderManager` interface + event types (reader connected/disconnected, card inserted/removed, UID).
2. Implement `src/reader/PcscReader.ts` wrapping `nfc-pcsc`:
   - initialize PC/SC on start
   - emit reader connected/disconnected from reader events
   - on card insertion, read the UID, normalize it (via `utils/uid.ts`), and emit card events
   - log detected readers (see [rules/pcsc-reader.md §Reader identification](../rules/pcsc-reader.md))
3. Implement `src/utils/uid.ts`: normalize bytes → uppercase hex string without spaces/separators; never a JS number.
4. Wire a minimal `src/index.ts` that starts PC/SC, logs:
   - `Agent started`
   - `PC/SC initialized`
   - `Searching for readers...` / `No PC/SC reader found. Waiting for reader...`
   - `Reader connected: <name>`
   - `Card detected: <UID>` / `Card removed`
5. Do **not** exit when no reader is connected.
6. Add unit tests for `utils/uid.ts`.

## Checklist
- [ ] Card UID prints to console as normalized uppercase hex
- [ ] Card removal prints `Card removed`
- [ ] No reader → agent stays alive
- [ ] `npm test`, `npm run lint`, `npm run build` pass
