# Rules — Testing

Automated testing rules for the ACR122U Local Agent.

## 1. Scope

Automated tests cover logic that does **not** require physical hardware. Hardware integration is verified manually (see [../tasks/007-manual-hardware-testing.md](../tasks/007-manual-hardware-testing.md)).

## 2. Minimum required tests

At minimum, test:

- UID normalization (`utils/uid.ts`)
- duplicate card event prevention
- state transitions (pure logic)
- WebSocket message serialization
- client connect/disconnect handling

## 3. Hardware isolation

- Never require a reader in unit tests.
- Abstract hardware behind `ReaderManager` so pure logic can be tested with fakes/stubs.

## 4. Quality gate

- `npm test`, `npm run lint`, and `npm run build` must all pass before a task is considered complete.

## 5. Manual hardware tests

Run the 10-test checklist from [../tasks/007-manual-hardware-testing.md](../tasks/007-manual-hardware-testing.md) before considering the agent complete.
