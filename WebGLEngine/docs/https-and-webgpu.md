# Serving the bridge over HTTPS (and why WebGPU needs it)

*v3771. Written because Keith cycled past the blob avatar on `server.html` and got a message naming a URL
that nothing in this tree explained how to produce.*

## The symptom

Cycling the avatar switch to **⚡ Blobulator GPU** on a page served from a LAN IP shows:

> WebGPU needs a secure origin — this page is http://192.168.50.193, so the browser does not expose it here.

The avatar falls back to the SVG robot and says why. **That verdict is correct.** `navigator.gpu` really is
undefined — not because the browser lacks WebGPU, but because **WebGPU is gated on a secure context**, and
`http://` on a LAN IP is not one. The same browser on the same machine has WebGPU on any https site. This was
diagnosed at v3666; `ui/webgpuProbe.mjs` owns the distinction so no page has to spell the test itself.

## Three ways round it

**If you are on another machine — a MacBook viewing the LAN IP — jump to route 2.** Route 1 only works on the
box that is serving the page, and route 3 costs you a certificate warning on every device you use.

**1. Open it on the machine that is serving it.** `http://localhost:8787` is treated as a secure origin by
every browser, over plain http, with no certificate. Nothing to configure. If you only need WebGPU on the
serving box, stop here.

**2. Start the Public tunnel — the best answer for any machine that is not the server.** In `server.html`,
open **Tunnels, Clouds, & Hosting** and start the public tunnel. It runs

```
cloudflared tunnel --url http://localhost:8787
```

and captures the generated `https://<something>.trycloudflare.com` address, which fronts **this same port**.

That URL is a real https origin with a **publicly trusted certificate**, so:

* WebGPU works, because the origin is secure;
* **no browser warning at all** — nothing to click through, on any device;
* no cert files to manage, and nothing to configure per machine;
* it works from off the LAN too, which the other two routes do not.

The cost is that the tunnel is *public* while it runs — anyone with the URL can reach the page — and the
address changes each time you start a quick tunnel. Stop it when you are done.

If `cloudflared` is not installed, the hosting panel will install it (Homebrew on macOS since v3741, winget on
Windows).

**3. Serve the bridge over TLS.** Set the environment variable and restart:

```
# Windows
set HTTPS=1 && node ai-bridge/server.js

# macOS / Linux
HTTPS=1 node ai-bridge/server.js
```

Then open `https://<lan-ip>:8787/server.html`.

### What that actually does

`ai-bridge/server.js` reads `HTTPS` (`1`, `true`, `yes` or `on` all count) and, if set, calls `getCreds()`:

* if `ai-bridge/certs/key.pem` and `cert.pem` exist, it uses them;
* otherwise it **generates a self-signed pair into `ai-bridge/certs/`** using the `selfsigned` package and
  says so on the console.

It then builds an `https.createServer` **reusing the same request handler**, and the WebSocket server and the
listener both bind to whichever transport was chosen — so `ws://` becomes `wss://` with no other change.

If `HTTPS=1` is set but the `selfsigned` package is missing, the server warns and **stays on http** rather
than failing to start:

> [relay] HTTPS requested but no cert — run `npm install` (adds selfsigned) or drop certs/key.pem+cert.pem

### The one cost of route 3

A self-signed certificate is not trusted by anything, so **the browser will warn once per device** and you
have to click through. That is expected and is not a sign of a broken setup. If you want the warning gone,
drop a real key/cert pair into `ai-bridge/certs/` and the generator steps aside.

## Why this file exists

The capability was built at v521 and **never documented**: a grep for `HTTPS=1` across every `.bat`, `.sh` and
`.md` in the tree returned nothing before this file. The probe's message claimed `actionable: true` while
naming only the destination URL, so a reader could see where to go and not how to get there.
`ui/webgpuProbe-selfcheck.mjs` now asserts the message names the switch, and asserts that a **localhost** page
is *not* told to fix its origin — there the absence really is the browser, and advising TLS would be a wrong
answer delivered confidently.
