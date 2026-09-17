# Website Integration Sample — ACR122U Agent

A complete, copy-paste reference for connecting a website (http **or** https) to the ACR122U agent installed on the user's laptop.

```
Your website (http or https, e.g. https://nfcreader.com)
        │ page loaded in the user's browser
        ▼
Browser on the user's laptop
        │ ws://127.0.0.1:8765        ← works from BOTH http and https pages
        ▼                              (Chrome / Edge / Firefox)
ACR122U Agent (installed on the same laptop)
        │
        └─ the page optionally POSTs each tap to your backend (normal https API)
```

The agent is loopback-only by design — your **server never connects to it**. Only the user's browser bridges the two.

## What the sample demonstrates

| Feature | Where in `index.html` |
| --- | --- |
| Protocol-aware banner (http vs https) | top of page, `protocol-banner` |
| Safari warning (unsupported browser) | `safari-banner` |
| "Agent not detected" UX when the agent isn't installed/running | `conn-hint` |
| Reader connect/disconnect status | `reader-pill` |
| Live card UID display + event log | `last-uid`, `log` |
| Forwarding each tap to your backend (with CSRF) | `forwardToBackend()` |

## Run it locally (http)

From the `client/` directory:

```bash
# any static file server works, e.g.:
python3 -m http.server 8080
# or: npx serve .
```

Open <http://127.0.0.1:8080/sample/> in Chrome/Edge/Firefox **on the machine where the agent is running**. Tap a card on the ACR122U — the UID appears immediately.

## Run it over https

Host the `client/` folder anywhere that serves https (any static host / your website). The page still connects to `ws://127.0.0.1:8765` on the visitor's laptop — that is allowed because browsers treat `127.0.0.1` as a *potentially trustworthy* origin (mixed-content rules do not block loopback in Chrome/Edge/Firefox).

## Integrate into your own site

1. Copy `acr122u-client.js` (+ `acr122u-client.d.ts` if you use TypeScript) into your project.
2. Copy the `<script type="module">` block from `index.html` into your page and adapt the UI handlers.
3. Keep the URL as `ws://127.0.0.1:8765` — prefer `127.0.0.1` over `localhost` (`localhost` may resolve to IPv6 `::1`, while the agent binds IPv4 loopback only).

## Yii2 integration (PHP views)

Register the module and forward taps to a controller action:

```php
<?php
// in your view or layout
use yii\web\View;

$this->registerJsFile('@web/js/acr122u-client.js', [
    'position' => View::POS_END,
    'options' => ['type' => 'module'],
]);

$tapUrl = \yii\helpers\Url::to(['/attendance/tap']);
$csrf = \Yii::$app->request->csrfToken;
$js = <<<JS
import { Acr122uAgentClient } from '/js/acr122u-client.js';

const agent = new Acr122uAgentClient();
agent.connect();

agent.onStatus((s) => document.getElementById('agent-status').textContent = s);
agent.on('card_detected', (m) => {
  fetch('$tapUrl', {
    method: 'POST',
    headers: { 'X-CSRF-Token': '$csrf' },
    body: new URLSearchParams({ uid: m.uid, _csrf: '$csrf' }),
  });
});
JS;
$this->registerJs($js, View::POS_END);
```

```php
<?php
// controller
public function actionTap()
{
    \Yii::$app->response->format = \yii\web\Response::FORMAT_JSON;
    $uid = \Yii::$app->request->post('uid');
    // your attendance / check-in logic here
    return ['ok' => true, 'uid' => $uid];
}
```

> Inline `registerJs` emits a classic `<script>` tag, which cannot use `import`. In a real Yii2 project put the module code in a separate `.js` file under `@app/web/js/` and register it with `['options' => ['type' => 'module']]`, or bundle both into one plain script. The snippet above assumes the import lives in a registered module file.

## Browser support

| Browser | http page | https page |
| --- | --- | --- |
| Chrome / Edge | ✅ | ✅ |
| Firefox | ✅ | ✅ |
| Safari | ✅ | ⚠️ not reliably supported |

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| Pill stays "connecting…" / "not connected" | Agent not installed or not running on **this** machine — start it, then reload. |
| Works over http, fails over https in Safari | Known limitation — use Chrome/Edge/Firefox. |
| Connection fails instantly | URL was changed away from `127.0.0.1`, or security software/extension blocks local WebSockets. |
| Backend POST returns 4xx | Check CSRF token and that the endpoint URL is https when the page is https. |
