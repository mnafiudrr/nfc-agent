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
| `demo.html` | A test page: open it in a browser to see live events |

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

## Browser security notes

- The browser must be able to reach `ws://127.0.0.1:8765`. This works when the page is served over `http://` (or `file://`).
- An **https**-served page cannot open an insecure `ws://` connection (mixed-content block). For an https site, you would need to add a secure local tunnel/reverse proxy to the agent in front of the WebSocket — out of scope for the agent itself.
- The client is read-only and sends no commands.