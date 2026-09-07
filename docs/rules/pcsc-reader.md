# Rules — PC/SC Reader Layer

Rules for the reader abstraction and UID handling.

## 1. Abstraction

- The rest of the application depends only on the reader abstraction (`ReaderManager`), never on PC/SC implementation details.
- `PcscReader` is the concrete PC/SC (`nfc-pcsc`) adapter.

## 2. Reader identification

- Identify the reader via its PC/SC reader name (e.g. `ACS ACR122U PICC Interface`), **not** raw USB protocol.
- Do not hardcode one exact string. Match an ACR122U-compatible token and tolerate minor Windows/macOS name differences.
- Log all detected readers; prefer an ACR122U-compatible reader; ignore unrelated readers when one is present.

## 3. Hot-plug

- The agent must detect plug/unplug/replug without restarting the process.
- Handle reader removal from any relevant state by returning to `WAITING_FOR_READER`.

## 4. UID normalization

- Normalize UID to uppercase hexadecimal, no spaces or separators.
- Keep the UID as a string; **never** convert it to a JavaScript number.

## 5. Card events

- Emit exactly one `card_detected` per insertion while the same card remains on the reader (state tracking/debounce).
- Emit `card_removed` on removal; a new tap emits a new `card_detected`.
- MVP: read UID only. Do not write cards, read MIFARE sectors, authenticate, or parse NDEF/DESFire.

## 6. Errors

- Tolerate temporary PC/SC errors; log and recover. Never crash on reader/card churn.
