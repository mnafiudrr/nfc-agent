# Rules — General

Scope and responsibilities for the ACR122U Local Agent.

## 1. Single responsibility

The agent's **only** job is to talk to the ACR122U through PC/SC and expose reader/card events over a local WebSocket. It must never know about the application consuming its events.

## 2. Independence

- No dependency on any web app, backend, database, or auth system.
- A WebSocket client is never required for the agent to operate.
- A reader is never required for the process to stay alive.
- The agent must keep running even when nothing else is connected.

## 3. Out of scope

Do **not** implement (in this repo):

- Yii2 integration
- HTTP API to a backend
- database / Redis / cloud services
- backend authentication
- employee management, attendance logic, check-in/check-out
- frontend application
- card writing, MIFARE sector reading, MIFARE auth, NDEF parsing, DESFire apps
- Docker setup, Electron
- installer (prepare later only)

## 4. Data flow

```
ACR122U → PC/SC → Agent → WebSocket → External Client
```

The external client is unknown to the agent and may be Yii2, React, Svelte, plain HTML, or another app.

## 5. Failure tolerance

The agent must never crash solely because: no reader, unplugged reader, card removed, repeated insertion, temporary PC/SC error, WebSocket client disconnect, or invalid client data. Log and recover. Log unexpected fatal errors clearly before termination.

## 6. Protocol

Messages are JSON. See [../plans/prd.md §7](../plans/prd.md).
