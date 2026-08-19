// FILE: bridge/wsBridge.js
// VERSION: v2 - PORT FIX, GRACEFUL DEGRADE, AUTO-RECONNECT
//
// Connects the browser to the ai-bridge relay (default ws://localhost:8787).
// Receives commands as JSON, routes them through CommandRouter.exec(cmd).
//
// Fixes from v1:
//   * Default port was 8090 — relay actually listens on 8787. Fixed.
//   * No error/close handlers — failures were silent and the bridge was
//     forever dead after one disconnect. Now logs once on failure and
//     attempts a reconnect every 3s.
//   * No "ready" indication — main.js had no way to query state.
//
// VBA → Excel POSTs to http://localhost:8787/voxel-update; the relay
// JSON-broadcasts to every connected WS client; this client receives
// the JSON and forwards to router.exec(cmd).

// v1220 — derive the relay WS URL from the page's own location instead of a
// hardcoded localhost. Loading the engine from the LAN IP (e.g. 192.168.50.132)
// now connects back to that same host. And "localhost" is forced to 127.0.0.1 so
// the loopback uses IPv4 — under Bun on Windows, ws://localhost resolves to IPv6
// ::1, which Bun's IPv4 listener refuses (the same Windows-socket quirk that
// disables mDNS), so the engine's connection dot would never go green.
function _defaultWsUrl() {
    try {
        if (typeof location !== "undefined" && location.host) {
            const proto = location.protocol === "https:" ? "wss:" : "ws:";
            let host = location.hostname;
            const port = location.port || "8787";
            if (!host || host === "localhost" || host === "::1") host = "127.0.0.1";
            return proto + "//" + host + ":" + port;
        }
    } catch (e) {}
    return "ws://127.0.0.1:8787";
}

export class WSBridge {
    constructor(router, url) {
        this.router = router;
        this.url    = url || _defaultWsUrl();
        this.ws     = null;
        this.connected = false;
        this.retryDelay = 3000;
        this._attemptedOnce = false;
        // Round 43 — type-keyed listeners. Messages with a registered
        // type fire the listener INSTEAD of router.exec — keeps log /
        // sys / chat messages out of the command pipeline.
        this._listeners = new Map();

        this._connect();
    }

    on(type, fn) {
        if (!this._listeners.has(type)) this._listeners.set(type, new Set());
        this._listeners.get(type).add(fn);
    }
    off(type, fn) {
        this._listeners.get(type)?.delete(fn);
    }

    _connect() {
        try {
            this.ws = new WebSocket(this.url);
        } catch (e) {
            this._scheduleReconnect();
            return;
        }

        this.ws.onopen = () => {
            this.connected = true;
            this._attemptedOnce = true;
            console.log(`[WSBridge] connected ${this.url}`);
        };

        this.ws.onclose = () => {
            if (this.connected) {
                console.log(`[WSBridge] disconnected — reconnecting in ${this.retryDelay}ms`);
            }
            this.connected = false;
            this._scheduleReconnect();
        };

        this.ws.onerror = () => {
            // Swallow — onclose follows. Avoids the noisy default error
            // emission when the relay isn't running.
            if (!this._attemptedOnce) {
                this._attemptedOnce = true;
                console.log(`[WSBridge] relay not reachable at ${this.url} (start ai-bridge/server.js to enable Excel control)`);
            }
        };

        this.ws.onmessage = (e) => {
            let cmd;
            try { cmd = JSON.parse(e.data); }
            catch (err) {
                console.warn("[WSBridge] non-JSON payload:", e.data);
                return;
            }
            // Round 43 — if the type has a listener, dispatch there
            // and skip the router. Used for log/sys/chat messages.
            const handlers = cmd?.type && this._listeners.get(cmd.type);
            if (handlers && handlers.size > 0) {
                for (const h of handlers) {
                    try { h(cmd); }
                    catch (err) { console.warn(`[WSBridge] listener for "${cmd.type}" threw:`, err?.message); }
                }
                return;
            }
            try {
                this.router.exec(cmd);
            } catch (err) {
                console.warn("[WSBridge] command failed:", cmd?.type, err?.message);
            }
        };
    }

    _scheduleReconnect() {
        if (this._reconnectTimer) return;
        this._reconnectTimer = setTimeout(() => {
            this._reconnectTimer = null;
            this._connect();
        }, this.retryDelay);
    }

    // Send an event back to the relay (which broadcasts to every other
    // subscriber — including back to the VBA HTTP polling endpoint if
    // anyone wired one up).
    emit(type, data) {
        if (!this.connected || this.ws.readyState !== WebSocket.OPEN) return;
        this.ws.send(JSON.stringify({ type, data }));
    }

    snapshot() {
        return {
            connected: this.connected,
            url: this.url,
        };
    }
}
