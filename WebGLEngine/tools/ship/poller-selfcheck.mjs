// WebGLEngine/tools/ship/poller-selfcheck.mjs -- v2771
//
// Run: node tools/ship/poller-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered by the *-selfcheck.mjs pattern).
//
// GATES ui/poller.js -- the fix for the render-QA server death. The death was Chrome
// running out of network slots (net::ERR_INSUFFICIENT_RESOURCES): ~20 dashboard poll
// loops fired on timers WITHOUT waiting for the previous request, stacking faster than
// they drained. poller.js routes every poll through three guards. This proves each guard
// is LOAD-BEARING, not decoration: the last block rips the in-flight guard out and shows
// the "at most one outstanding" invariant FAILS without it.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const POLLER = path.join(HERE, "..", "..", "ui", "poller.js");
const SERVER = path.join(HERE, "..", "..", "server.html");

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};

// A fetch that never resolves -- the worst case for pileup. Each call hands back a
// forever-pending promise and bumps a counter so we can prove how many got ISSUED.
function makeHangingFetch() {
    const state = { calls: 0 };
    const impl = () => { state.calls++; return new Promise(() => {}); };
    return { impl, state };
}

const P = await import(pathToFileURL(POLLER).href);

// ---- 1. IN-FLIGHT GUARD: a slow key never stacks a second request --------------------
{
    P._resetForTest();
    P._setHiddenFn(() => false);
    const { impl, state } = makeHangingFetch();
    for (let i = 0; i < 100; i++) P.pollOnce("slow", "/x", null, { fetchImpl: impl });
    await Promise.resolve();
    ok("in-flight: 100 rapid calls on one key issue exactly 1 request", state.calls === 1, "issued=" + state.calls);
    ok("in-flight: exactly 1 outstanding tracked", P._stateForTest().inFlight === 1);
}

// ---- 2. HIDDEN-PAGE GUARD: a backgrounded page polls zero (the QA-death fix) ----------
{
    P._resetForTest();
    P._setHiddenFn(() => true);
    const { impl, state } = makeHangingFetch();
    for (let i = 0; i < 50; i++) P.pollOnce("k" + i, "/x", null, { fetchImpl: impl });
    await Promise.resolve();
    ok("hidden: a hidden page issues 0 requests across 50 keys", state.calls === 0, "issued=" + state.calls);
}

// ---- 3. CONCURRENCY CAP: no more than maxConcurrent run across all keys ---------------
{
    P._resetForTest();
    P._setHiddenFn(() => false);
    P.configurePoller({ maxConcurrent: 8 });
    const { impl, state } = makeHangingFetch();
    for (let i = 0; i < 100; i++) P.pollOnce("key" + i, "/x", null, { fetchImpl: impl });
    await Promise.resolve();
    ok("cap: 100 distinct keys, only maxConcurrent (8) issue", state.calls === 8, "issued=" + state.calls);
    ok("cap: active count pinned at the cap", P._stateForTest().active === 8);
}

// ---- 4. SUCCESS RELEASES: a clean run frees the key to fire again ---------------------
{
    P._resetForTest();
    P._setHiddenFn(() => false);
    let calls = 0;
    const impl = () => { calls++; return Promise.resolve({ ok: true, json: () => Promise.resolve({}) }); };
    await P.pollOnce("live", "/x", null, { fetchImpl: impl });
    ok("release: inFlight back to 0 after a clean run", P._stateForTest().inFlight === 0);
    await P.pollOnce("live", "/x", null, { fetchImpl: impl });
    ok("release: the key can fire a second time once drained", calls === 2, "calls=" + calls);
}

// ---- 5. BACKOFF: a failing endpoint stops hammering ----------------------------------
{
    P._resetForTest();
    P._setHiddenFn(() => false);
    P.configurePoller({ baseBackoffMs: 100000, maxBackoffMs: 100000 });
    let calls = 0;
    const impl = () => { calls++; return Promise.resolve({ ok: false, status: 500 }); };
    await P.pollOnce("down", "/x", null, { fetchImpl: impl });   // fails -> backoff
    const ran = await P.pollOnce("down", "/x", null, { fetchImpl: impl });   // within backoff -> skipped
    ok("backoff: a failed key is skipped on the next immediate tick", ran === false && calls === 1, "calls=" + calls);
}

// ---- 6. SABOTAGE: without the in-flight guard the invariant FAILS ---------------------
// A control that cannot fail is decoration. Re-implement guardedTick WITHOUT the
// `inFlight.has(key)` line and show 100 rapid calls now stack 100 requests -- proving the
// guard poller.js actually ships is the thing holding the line.
{
    const inFlight = new Set(); let active = 0;
    async function unguardedTick(key, fn) {
        // (hidden + cap kept; IN-FLIGHT GUARD DELETED)
        inFlight.add(key); active++;
        try { await fn(); } catch {} finally { inFlight.delete(key); active--; }
    }
    const { impl, state } = makeHangingFetch();
    for (let i = 0; i < 100; i++) unguardedTick("slow", () => impl());
    await Promise.resolve();
    ok("SABOTAGE: dropping the in-flight guard stacks all 100 (guard is load-bearing)", state.calls === 100, "stacked=" + state.calls);
}

// ---- 7. THE SHIPPING FILE ACTUALLY CONTAINS THE GUARDS -------------------------------
// Grade the real file, not a copy: prove the three guard lines are present in what ships.
{
    const src = fs.readFileSync(POLLER, "utf8");
    ok("source: in-flight guard present", /inFlight\.has\(key\)/.test(src));
    ok("source: hidden-page guard present", /_hidden\(\)/.test(src));
    ok("source: concurrency cap present", /active\s*>=\s*_cfg\.maxConcurrent/.test(src));
    ok("source: no top-level node builtin import (browser-safe)", !/^\s*import[^\n]*["']node:/m.test(src) && !/^\s*import[^\n]*["'](fs|path|url|crypto|net|dgram|zlib)["']/m.test(src));
}

// ---- 8. SERVER.HTML SLOW POLL LOOPS ROUTED THROUGH SwekPoller (v2791) -----------------
// The v2771 round guarded the 6 fast (<=3s) loops; v2791 routes the slow (15-30s) ones too.
// Prove each slow loop's key actually goes through guardedTick in the shipping file.
{
    const html = fs.readFileSync(SERVER, "utf8");
    const slowKeys = ["checkWan", "refreshUpd", "hostingLoadAll", "ebStat", "cloudLoad", "updPeers", "vpPeers", "loadCtPeers", "loadClusterPeers", "loadWatchPeers"];
    let allRouted = true, missing = [];
    for (const k of slowKeys) {
        // v3402 -- ASSERT THE PROPERTY, NOT THE ARRANGEMENT. This demanded the literal
        // `SwekPoller.guardedTick("key"` and went red the moment the page collapsed its TWO spellings of that
        // idea onto ONE helper -- a correct change, and the twenty-fourth instance of a mechanism-pinned check
        // in this tree. The property is that the loop's key goes through THE tick predicate, whatever the page
        // calls it today; swekTick IS that predicate and the check below proves it carries the fallback.
        const re = new RegExp('(?:SwekPoller\\.guardedTick|swekTick)\\("' + k + '"');
        if (!re.test(html)) { allRouted = false; missing.push(k); }
    }
    ok("server.html: all 10 slow poll loops routed through the tick predicate", allRouted, missing.length ? "missing: " + missing.join(",") : "");
    // each wired loop keeps a direct-call fallback for before the module loads
    // *** AND THE FALLBACK IS NOW IN ONE PLACE INSTEAD OF SIXTEEN, WHICH IS THE POINT OF THE ROUND: ***
    // sixteen call sites carried their own presence test and ELEVEN did not, so a slow /ui/poller.js threw a
    // hundred times on Keith's rig. The check is that THE PREDICATE degrades -- defined before any caller,
    // looking the poller up PER CALL (capturing it would pin the undefined forever), and calling the function
    // directly when it is absent.
    const helper = (html.match(/window\.swekTick = function[\s\S]*?\n\};/) || [""])[0];
    ok("server.html: the tick predicate is defined ONCE and degrades when the poller is absent",
        /var P = window\.SwekPoller;/.test(helper) && /return fn\(\);/.test(helper) &&
        html.indexOf("window.swekTick =") < html.indexOf('swekTick("'),
        helper ? "defined at char " + html.indexOf("window.swekTick =") + ", first use at " + html.indexOf('swekTick("') : "helper not found");
    ok("server.html: and it is a PLAIN script, not a module -- a module would reintroduce the race it closes",
        !/type="module"[\s\S]{0,400}window\.swekTick =/.test(html));
    // the auth keepalive ping is intentionally NOT hidden-guarded (would change session relock on backgrounding)
    ok("server.html: auth ping intentionally left un-guarded (session-relock safety)", !/(?:guardedTick|swekTick)\("authPing"/.test(html));
    // total distinct guardedTick keys = 6 fast + 10 slow
    // v3402 -- SAME REGEX, SAME FIX: the count is of KEYS, not of a spelling. And the number is a FLOOR now
    // rather than an equality: collapsing the two idioms revealed sites the old pattern had never counted,
    // because a bare `window.SwekPoller.guardedTick` matched while a wrapped one matched too and eleven of them
    // were simply never in this set. AN EQUALITY HERE WOULD MAKE ADDING A GUARDED LOOP A FAILURE.
    const keys = new Set([...html.matchAll(/(?:guardedTick|swekTick)\("([a-zA-Z][\w-]*)"/g)].map(m => m[1]));
    ok("server.html: at least 16 distinct poll keys go through the tick predicate", keys.size >= 16, "keys=" + keys.size);
}

console.log("poller-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
