# Browser Client — ACR122U Agent

A tiny, zero-dependency ES module that lets a website/browser connect to the local ACR122U agent and receive hardware events.

```
Browser (this module) → WebSocket → ACR122U Agent → PC/SC → ACR122U
```

The agent stays fully independent — it only exposes events over the local WebSocket. This module is one possible consumer.

## Files

| File | Purpose |
| ---- | ------- |
| `acr122u-client.js` | The client module (works in any browser, no build step) |
| `acr122u-client.d.ts` | TypeScript definitions (place next to the .js) |
| `demo.html` | Minimal test page: open directly to see live events |
| [`sample/`](sample/README.md) | Full website-integration sample (http **and** https) with backend forwarding + Yii2 notes |

## Usage

```html
<script type="module">
  import { Acr122uAgentClient } from './acr122u-client.js';

  const agent = new Acr122uAgentClient(); // defaults to ws://127.0.0.1:8765
  agent.connect();

  agent.onStatus((status) => console.log('connection:', status)); // connecting | open | closed | error

  agent.on('reader_status', (msg) => console.log(msg.status, msg.reader));
  agent.on('card_detected', (msg) => console.log(msg.uid));
  agent.on('card_removed', () => console.log('removed'));
</script>
```

Or copy `acr122u-client.js` into your project and import it like any other module. It has no npm dependencies.

## Options

```js
const agent = new Acr122uAgentClient({
  url: 'ws://127.0.0.1:8765', // default
  autoReconnect: true,        // reconnect with backoff after drop
  reconnectDelayMs: 1000,     // initial reconnect delay
  maxReconnectDelayMs: 10000, // max backoff
});
```

## Methods

- `connect()` / `disconnect()`
- `on(event, handler)` / `off(event, handler)` for `reader_status`, `card_detected`, `card_removed`
- `onStatus(handler)` for connection-state changes

## Protocol

The client mirrors the agent's WebSocket protocol (see [../docs/README.md §8](../docs/README.md)).

## Protocol support (http and https)

The agent WebSocket is plain `ws://` bound to `127.0.0.1`. **Both http and https websites can connect to it directly** — no wss, no proxy, no changes to the agent:

| Page protocol | Connection to the agent | Works? |
| ------------- | ----------------------- | ------ |
| `http://` | `ws://127.0.0.1:8765` | ✅ all modern browsers |
| `https://` | `ws://127.0.0.1:8765` | ✅ Chrome / Edge / Firefox |

Why https works: browsers treat `127.0.0.1` / `localhost` as *potentially trustworthy* origins, so the mixed-content rule that normally blocks `ws://` from https pages does **not** apply to loopback addresses.

Notes:

- Prefer `127.0.0.1` over `localhost` in the URL — `localhost` may resolve to IPv6 `::1` first, while the agent binds IPv4 loopback only.
- **Safari** is not reliably supported for the https → `ws://127.0.0.1` case.
- The user's browser must run on the **same laptop** as the agent. Your server never connects to the agent.
- The client is read-only and sends no commands to the agent.

See [`sample/`](sample/README.md) for a working reference page covering both protocols.