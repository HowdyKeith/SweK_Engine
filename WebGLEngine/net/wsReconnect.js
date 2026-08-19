// FILE: net/wsReconnect.js
// Shared WebSocket reconnection helpers. Dependency-free, safe to import anywhere.
//
// Why: most of the engine's WS clients (face avatar, AI brain, demo-chrome
// ticker, etc.) reconnected on a FIXED interval. When the bridge restarts —
// which happens constantly during dev — every client on every device fired its
// reconnect at the same moment, a thundering herd against a just-booting bridge.
// backoffDelay() spreads those out with jittered exponential backoff, and
// onConnectivityRegained() lets a client recover instantly after the laptop
// wakes or the network blips instead of waiting out the backoff.

// Jittered exponential backoff. attempt 0,1,2,... -> base, base*factor, ...
// capped, with +/- jitter so simultaneous clients don't sync up.
export function backoffDelay(attempt, opts = {}) {
    const base   = opts.base   || 1000;
    const cap    = opts.cap    || 20000;
    const factor = opts.factor || 1.7;
    const jitter = opts.jitter == null ? 0.3 : opts.jitter;
    const raw = Math.min(cap, base * Math.pow(factor, Math.max(0, attempt | 0)));
    const j   = raw * jitter * (Math.random() * 2 - 1);   // +/- jitter
    return Math.max(base, Math.round(raw + j));
}

// Fire reconnectNow() when the page comes back online OR the tab becomes
// visible again — but only when isClosed() says the socket is actually down,
// so we never stack a second socket onto a live one. Returns an unsubscribe fn.
export function onConnectivityRegained(reconnectNow, isClosed) {
    const fire = () => { try { if (!isClosed || isClosed()) reconnectNow(); } catch {} };
    const onOnline = () => fire();
    const onVis = () => { try { if (document.visibilityState === "visible") fire(); } catch {} };
    try { window.addEventListener("online", onOnline); } catch {}
    try { document.addEventListener("visibilitychange", onVis); } catch {}
    return () => {
        try { window.removeEventListener("online", onOnline); } catch {}
        try { document.removeEventListener("visibilitychange", onVis); } catch {}
    };
}
