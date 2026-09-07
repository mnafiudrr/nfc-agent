# Rules — Code Style

TypeScript conventions for the ACR122U Local Agent.

## 1. TypeScript

- ESM (`"type": "module"`).
- Strict mode on; explicit types on public APIs and module boundaries.
- Target Node 18+.
- No `any` unless unavoidable; prefer typed unions for event/message types.

## 2. Formatting

- Prettier defaults; enforce via `npm run format` / lint.
- Consistent indentation (2 spaces), single quotes, trailing commas.

## 3. Structure & naming

- One concern per module under `src/` (`reader/`, `websocket/`, `utils/`, plus `config.ts`, `logger.ts`, `index.ts`).
- `PascalCase` for classes/types, `camelCase` for functions/variables, `UPPER_SNAKE` for constants.
- The rest of the app must not reach into PC/SC directly — go through the reader abstraction (`ReaderManager`).

## 4. Logging

- Use the shared `logger.ts`; never `console.log` directly in modules.
- Levels: DEBUG, INFO, WARN, ERROR; respect `LOG_LEVEL`.

## 5. Comments

- Do not add comments unless they explain non-obvious intent. Keep code self-documenting.

## 6. No secrets

- Never commit env values or secrets. Config reads from environment at runtime with defaults.
