// FILE: ui/ballConsoleHook.js
// VERSION: v1357 — feeds the Ball alert system's "consoleError" trigger. On load
// it asks the bridge whether that event is enabled; if so, it wraps console.error
// to POST /ball/event {event:"consoleError"} (debounced, fire-and-forget). Real
// console.error always runs first, and POST failures are swallowed — this can
// never break the page or recurse.
export function installBallConsoleHook() {
    let armed = false, last = 0;
    fetch("/ball/config", { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => {
            const c = (j && j.config) || {};
            armed = !!(c.enabled && c.events && c.events.consoleError && c.events.consoleError.on);
            if (!armed) return;
            const orig = console.error.bind(console);
            console.error = function (...args) {
                orig(...args);
                const now = Date.now();
                if (now - last < 4000) return;   // debounce — one pulse per 4s at most
                last = now;
                try { fetch("/ball/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event: "consoleError" }), keepalive: true }).catch(() => {}); } catch {}
            };
        })
        .catch(() => {});
}

export default installBallConsoleHook;
