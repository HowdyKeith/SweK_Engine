// ui/poller.js — v2771
// Polling discipline. The one place every timer-driven poll routes through so the
// dashboard can never again exhaust Chrome's network pool (net::ERR_INSUFFICIENT_RESOURCES)
// or pile requests onto a slow server until it dies mid-render-QA-sweep.
//
// THREE GUARDS, each killing a distinct half of the storm:
//   1. hidden-page guard  -- a backgrounded page (every render-QA screenshot page is
//                            never focused) polls ZERO. This is what ends the QA death.
//   2. in-flight guard    -- a given key gets AT MOST ONE outstanding request. A slow
//                            /comfyui/queue can never stack a second call on the first.
//   3. concurrency cap    -- no more than maxConcurrent ticks run across ALL keys at once;
//                            excess is SHED (skipped this tick), never queued.
// Plus per-key exponential backoff so a down endpoint stops hammering.
//
// BROWSER-SAFE: imports nothing (no node builtins, top-level or lazy). Reads `document`
// and `fetch` only when a guard actually runs, so it imports clean in Node for the gate.
//
// Gated by tools/ship/poller-selfcheck.mjs (sabotage-proven: rip out the in-flight guard
// and the "at most one outstanding" invariant fails).

const inFlight = new Set();     // keys with an outstanding tick right now
const backoff = new Map();      // key -> { until: ms, fails: n }
let active = 0;                 // total ticks running across all keys

export const DEFAULTS = { maxConcurrent: 8, baseBackoffMs: 2000, maxBackoffMs: 30000 };
let _cfg = { ...DEFAULTS };
export function configurePoller(o) { _cfg = { ...DEFAULTS, ...(o || {}) }; }

// Visibility seam. Defaults to the real document; overridable so the gate can drive it
// headless without a DOM.
let _hidden = () => (typeof document !== "undefined" && !!document.hidden);
export function _setHiddenFn(fn) { _hidden = fn || _hidden; }   // GATE SEAM ONLY

// Inspection + reset seams for the gate. Not for production use.
export function _stateForTest() { return { inFlight: inFlight.size, active, backoffKeys: backoff.size }; }
export function _resetForTest() { inFlight.clear(); backoff.clear(); active = 0; _cfg = { ...DEFAULTS }; _hidden = () => (typeof document !== "undefined" && !!document.hidden); }

const _now = () => Date.now();

// Run fn() under all three guards. Returns true if it RAN to completion, false if it was
// skipped (hidden / already in flight / backing off / pool full) or threw.
//   - fn is async (or returns a promise). A throw from fn is a FAILURE -> backoff engages.
//   - a skip is NOT a failure and never touches backoff.
export async function guardedTick(key, fn) {
    if (_hidden()) return false;                     // (1) hidden page: poll nothing
    if (inFlight.has(key)) return false;             // (2) never stack a second request on this key
    const b = backoff.get(key);
    if (b && _now() < b.until) return false;         // key is serving out a backoff
    if (active >= _cfg.maxConcurrent) return false;  // (3) global pool cap: shed this tick
    inFlight.add(key); active++;
    try {
        await fn();
        backoff.delete(key);                         // a clean run clears any prior backoff
        return true;
    } catch (e) {
        const fails = ((backoff.get(key) || {}).fails || 0) + 1;
        const wait = Math.min(_cfg.maxBackoffMs, _cfg.baseBackoffMs * Math.pow(2, fails - 1));
        backoff.set(key, { until: _now() + wait, fails });
        return false;
    } finally {
        inFlight.delete(key); active--;              // always release, even on throw
    }
}

// Convenience for the common single-endpoint poll: fetch url, apply(json) on a 2xx.
// A non-ok HTTP status counts as a failure (engages backoff) -- "a down endpoint stops
// hammering." A network throw does the same. opts.fetchImpl overrides fetch for the gate.
export async function pollOnce(key, url, apply, opts = {}) {
    const f = opts.fetchImpl || (typeof fetch !== "undefined" ? fetch : null);
    return guardedTick(key, async () => {
        if (!f) throw new Error("no fetch");
        const r = await f(url, opts.fetchOpts || { cache: "no-store" });
        if (!r || !r.ok) throw new Error("http " + (r && r.status));
        if (apply) apply(await r.json());
    });
}

// Make it reachable from classic (non-module) inline scripts too -- server.html's poll
// loops are plain <script>, not modules, so they read window.SwekPoller.
try { if (typeof globalThis !== "undefined") globalThis.SwekPoller = { guardedTick, pollOnce, configurePoller, DEFAULTS }; } catch {}

// ---- THE BACKSTOP (v3265) ----------------------------------------------------------------------------------------------
//
// *** THE GUARD ABOVE IS CORRECT AND 28 OF server.html's 44 POLLERS WALK PAST IT. *** Keith's console filled with
// net::ERR_INSUFFICIENT_RESOURCES and the stack traces name them: pollLocalVm, refreshPeers, refreshStatus,
// lockRefresh, loadImages, the brain poll -- none with guardedTick in the stack.
//
// Chrome allows about six connections per host. Once those are busy the rest QUEUE, the timers keep firing, and
// THE QUEUE GROWS WITHOUT BOUND until the browser refuses to allocate. Every one of those pollers is individually
// reasonable; the failure is that nothing counts them together.
//
// *** THIS IS A BACKSTOP, NOT THE FIX, AND SAYING SO MATTERS. *** The fix is routing those 28 through
// guardedTick, which is 28 careful edits -- and v3202 is why a scripted sweep of many call sites does not happen
// in the same round as the diagnosis. What this does is cap in-flight same-origin GETs at the front door, so a
// page that over-polls DEGRADES (later data) instead of COLLAPSING (no data, and a console nobody can read).
//
// SHEDDING WAS THE OTHER OPTION AND IT IS WORSE HERE: a shed poll returns nothing and its caller renders an
// empty panel, which is the "convincing nothing" this tree has refused three times. A QUEUE MAKES IT SLOW; A
// SHED MAKES IT WRONG.
let _fetchCapped = false;
// v3281 -- THE CAP IS NOW A DIAL, NOT A CONSTANT. The 6-vs-12 question (is the cap throttling a healthy server,
// or is the server the bottleneck?) was a code edit + reload per data point, so it kept NOT being run. Now:
// setFetchCap(n) adjusts the live pool (and pumps immediately, so raising it drains waiters at once), the chosen
// value persists in localStorage "swek.fetchCap" and is read at install time, and __swekFetchCap() keeps
// reporting {running, waiting, maxInFlight} so a readout can watch the experiment happen. Clamped 2..48: 1 would
// serialize the page and 0 would freeze it, which is a footgun and not a setting.
const FETCH_CAP_KEY = "swek.fetchCap";
function _savedCap(fallback) {
    try { const v = parseInt(localStorage.getItem(FETCH_CAP_KEY), 10); if (v >= 2 && v <= 48) return v; } catch {}
    return fallback;
}
export function installFetchCap(maxInFlight = 6) {
    if (_fetchCapped || typeof window === "undefined" || !window.fetch) return false;
    _fetchCapped = true;
    maxInFlight = _savedCap(maxInFlight);   // a persisted choice outlives the reload the experiment needs
    const real = window.fetch.bind(window);
    let running = 0; const waiting = [];
    let _staleDropped = 0;
    // v3407 -- *** A POLL THAT HAS WAITED LONGER THAN ITS OWN INTERVAL IS ALREADY WORTHLESS. ***
    //
    // Keith's screenshot: `net 12/12 . 184 waiting (worst 184)`, and it climbed to 212 while the gauges sat at
    // `-`. The gauge polls were IN that queue, minutes deep, behind hundreds of requests whose answers had gone
    // stale before they reached the front. THE QUEUE HAD NO CEILING AND NO AGE LIMIT, so when the server stopped
    // answering the queue grew faster than it drained and NOTHING at the front was ever current again.
    //
    // A STATUS POLL IS NOT A TRANSACTION. Its whole value is that the number is NOW; two minutes late it is
    // strictly worse than not asking, because the caller renders it as current. So a queued GET older than
    // STALE_MS is DROPPED rather than sent, and the caller is told WHY -- an Error, not a silent resolve, so a
    // reader gets a reason instead of a value that never changes.
    //
    // *** DROPPED, NOT SHED AT THE DOOR. *** Refusing to queue would have thrown away the FIRST request of a
    // burst, which is the one most likely to still matter. Dropping at the front discards the ones that actually
    // waited, which is the same rule the caller would apply if it could see the queue.
    const STALE_MS = 15000;
    const pump = () => {
        const now = Date.now();
        while (waiting.length && (now - waiting[0].at) > STALE_MS) {
            const dead = waiting.shift(); _staleDropped++;
            try { dead.drop(new Error("swek-fetch-cap: dropped after waiting " + Math.round((now - dead.at) / 1000) + "s -- this answer would have been stale on arrival")); } catch {}
        }
        while (running < maxInFlight && waiting.length) { const go = waiting.shift(); running++; go.run(); }
    };
    window.__swekSetFetchCap = (n) => {
        n = Math.max(2, Math.min(48, n | 0));
        maxInFlight = n;
        try { localStorage.setItem(FETCH_CAP_KEY, String(n)); } catch {}
        pump();   // raising the cap must release waiters NOW, not on the next fetch
        return n;
    };

    window.fetch = function (input, init) {
        const url = typeof input === "string" ? input : (input && input.url) || "";
        const method = ((init && init.method) || (input && input.method) || "GET").toUpperCase();
        // *** ONLY SAME-ORIGIN GETs ARE CAPPED. *** A POST is usually a user action and making somebody wait
        // behind a status poll would be the cure doing the disease's job. Cross-origin requests do not compete
        // for this host's six slots at all.
        const sameOrigin = url.startsWith("/") || (typeof location !== "undefined" && url.startsWith(location.origin));
        if (method !== "GET" || !sameOrigin) return real(input, init);

        return new Promise((resolve, reject) => {
            // v3270 -- *** THE RELEASE HAD TO BE IN A finally BLOCK, NOT A .finally() CALL, AND I SHIPPED THE
            // WRONG ONE. *** If real() throws SYNCHRONOUSLY -- an invalid URL, a blocked scheme, an extension
            // intercepting -- there is no promise, so .then and .finally never run and `running` is NEVER
            // DECREMENTED. Six of those and the pool is permanently full: every later fetch sits in `waiting`
            // forever and THE PAGE STALLS WITH NO ERROR OF ITS OWN. My own comment said "a leak here would
            // freeze the page" and the code beneath it could leak.
            waiting.push({
                at: Date.now(),                 // v3407 -- when it JOINED the queue, which is what makes it droppable
                drop: reject,
                run: () => {
                    let p;
                    try { p = real(input, init); }
                    catch (e) { running--; pump(); reject(e); return; }   // SYNCHRONOUS THROW: release, then report
                    Promise.resolve(p).then(resolve, reject).finally(() => { running--; pump(); });
                },
            });
            pump();
        });
    };
    window.__swekFetchCap = () => ({ running, waiting: waiting.length, maxInFlight, staleDropped: _staleDropped, staleMs: STALE_MS });
    // *** A STUCK QUEUE MUST ANNOUNCE ITSELF. *** The whole failure mode above is silent: the page simply stops
    // filling and nothing in the console says why. If the pool stays full with work waiting for 20 seconds, that
    // is not slow, it is stuck -- and one line naming the depth is the difference between "it stalled" and a
    // diagnosis. Said ONCE, because a stuck queue would otherwise log forever.
    let _stuckSince = 0, _saidStuck = false;
    // unref()'d WHERE IT EXISTS: in a browser this is a no-op, and in node it stops a diagnostic timer holding
    // the process open -- which is exactly what it did to this round's own test before the guard was added.
    const _wd = setInterval(() => {
        // v3407 -- *** THE SWEEP HAS TO BE ON A TIMER, NOT ONLY ON pump(). *** pump() runs when a request
        // COMPLETES, and the failure being fixed is precisely that NOTHING completes: the server stops answering,
        // no completion fires, and a purely pump-driven drop would sit as frozen as the queue it was written to
        // clear. The one case it must work in is the one where its only trigger never happens.
        pump();
        const busy = running >= maxInFlight && waiting.length > 0;
        if (!busy) { _stuckSince = 0; _saidStuck = false; return; }
        if (!_stuckSince) { _stuckSince = Date.now(); return; }
        if (!_saidStuck && Date.now() - _stuckSince > 20000) {
            _saidStuck = true;
            console.warn("[fetchCap] pool has been FULL with " + waiting.length + " request(s) waiting for 20s. " +
                "Either the server is not answering, or a request was released without decrementing -- " +
                "window.__swekFetchCap() shows the live counts.");
        }
    }, 5000);
    try { _wd.unref && _wd.unref(); } catch {}
    return true;
}
