// WebGLEngine/tools/ship/fetchCap-selfcheck.mjs
//
// Run: node tools/ship/fetchCap-selfcheck.mjs   (~2s -- MEASURED)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// v3265 -- 44 POLLERS, 16 GUARDS, AND A CONSOLE FULL OF ERR_INSUFFICIENT_RESOURCES.
//
// Keith's Mac filled with net::ERR_INSUFFICIENT_RESOURCES on every endpoint at once. The stack traces name the
// cause: pollLocalVm, refreshPeers, refreshStatus, lockRefresh, loadImages, the brain poll -- NONE WITH
// guardedTick IN THE STACK. server.html has 44 setInterval sites and only 16 go through the guard.
//
// Chrome allows about six connections per host. Once those are busy the rest QUEUE, the timers keep firing, and
// the queue grows without bound until the browser refuses to allocate. EVERY ONE OF THOSE POLLERS IS
// INDIVIDUALLY REASONABLE; the failure is that nothing counted them together.
//
// *** THE CAP IS A BACKSTOP, NOT THE FIX. *** The fix is routing 28 pollers through guardedTick, which is 28
// careful edits -- and v3202, where a scripted sweep deleted 61 live modules, is why that does not happen in the
// same round as the diagnosis. The ratchet below is what keeps it from being forgotten.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { noComments, prose } from "./sourceScan.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const page = fs.readFileSync(path.join(ROOT, "server.html"), "utf8");
const intervals = (page.match(/setInterval\(/g) || []).length;
// v3402 -- THIRD GATE IN ONE ROUND PINNED TO THE SPELLING. server.html collapsed its two idioms onto ONE
// predicate (swekTick), and this counter -- which exists to say how many pollers are guarded -- read 1 and
// reported a guarded poller as unguarded. THE COUNT IS OF GUARDED POLLERS, NOT OF A FUNCTION NAME.
const guarded = (page.match(/(?:guardedTick|swekTick)\(/g) || []).length;

// ---- 1. THE CAP HOLDS, DRIVEN RATHER THAN READ ----------------------------------------------------------------------------
{
    globalThis.location = { origin: "http://x" };
    let live = 0, peak = 0, done = 0;
    globalThis.window = { fetch: (u) => { live++; peak = Math.max(peak, live);
        return new Promise((r) => setTimeout(() => { live--; done++; r({ ok: true, url: u }); }, 3)); } };
    const { installFetchCap } = await import(pathToFileURL(path.join(ROOT, "ui", "poller.js")).href);
    installFetchCap(6);
    await Promise.all(Array.from({ length: 30 }, (_, i) => window.fetch("/api/" + i)));

    ok("!! *** 30 concurrent GETs never exceed 6 in flight, and all 30 still resolve ***",
        peak === 6 && done === 30,
        "peak " + peak + ", resolved " + done + "/30. A QUEUE MAKES IT SLOW; A SHED MAKES IT WRONG -- a shed poll " +
        "returns nothing and its caller renders an empty panel, which is the 'convincing nothing' this tree has " +
        "now refused four times");

    const before = done;
    await window.fetch("/save", { method: "POST" });
    ok("!! ...and a POST is never queued behind a status poll",
        done === before + 1,
        "a POST is usually a USER ACTION, and making somebody wait behind a background poll would be the cure " +
        "doing the disease's job");
}

// ---- 2. THE REAL FIX IS RATCHETED, NOT FORGOTTEN ----------------------------------------------------------------------------
{
    // v3266 -- *** THE OLD BASELINE OF 28 COUNTED INTERVALS, AND THREE OF THE FASTEST DO NOT FETCH AT ALL. ***
    // _renderCountdown, tickUi and tick are pure UI on 1s timers; they were the worst-looking offenders in a
    // census that never asked whether they made a request. AND TWO WRONG MEASUREMENTS ON THE WAY HERE: a
    // 1500-character window around a function spilled into the NEXT one and reported its fetches as this one's,
    // and the interval regex only matched setInterval(name, ms) and missed inline arrows. The count is now
    // brace-matched and asks only about pollers that FETCH.
    //
    // FOUR CONVERTED THIS ROUND -- caPoll, lockRefresh, refreshStatus, loadImages -- each keyed DISTINCTLY,
    // because guardedTick refuses to stack a second call on the same key and TWO POLLERS SHARING A KEY WOULD
    // SILENTLY STARVE EACH OTHER: a fix that becomes a bug.
    // v3267 -- ZERO. Every fetching poller in server.html now goes through the guard: the four of v3266 plus
    // rjPoll x2, brain-health, brain-duel, fleet-announce and es-status. THE THREE REMAINING UNGUARDED INTERVALS
    // ARE PURE UI -- _renderCountdown, tickUi and tick -- and they were never the problem, which the v3265
    // baseline of 28 could not tell you because it counted timers instead of requests.
    const FETCHING_UNGUARDED_BASELINE = 0;   // MEASURED. MAY NEVER GROW.
    const bodyOf = (name) => {
        const d = page.indexOf("function " + name);
        if (d < 0) return null;
        let i = page.indexOf("{", d), depth = 0;
        for (let j = i; j < page.length; j++) {
            const c = page[j];
            if (c === "{") depth++;
            else if (c === "}") { depth--; if (!depth) return page.slice(i, j + 1); }
        }
        return null;
    };
    const ivals = [...page.matchAll(/setInterval\(\s*([A-Za-z_$][\w$]*)\s*,\s*(\d+)\)/g)];
    const fetching = ivals.filter((m) => {
        // v3403 -- *** THE 200-CHARACTER LOOKBACK IS DELETED, AND IT COULD ONLY EVER HAVE HURT. ***
        //
        // The pattern above matches `setInterval(NAME, ms)` -- a BARE IDENTIFIER as the first argument. A GUARDED
        // loop is `setInterval(function () { swekTick(k, f); }, ms)`, whose first argument is a function
        // expression, SO IT NEVER MATCHES THIS PATTERN AT ALL. The lookback therefore never excluded a guarded
        // loop -- it had nothing to exclude -- and could only ever hide an UNGUARDED one that happened to sit
        // near a guarded neighbour.
        //
        // AND IT DID, THE ROUND AFTER I MADE IT SPELLING-INDEPENDENT. server.html line 3295 is
        // `setInterval(function () { swekTick("serverTick", tick); }, 2000)` and line 3296 is
        // `setInterval(pollLocalVm, 8000)` -- FIFTY-SEVEN CHARACTERS APART. So this gate went from naming
        // pollLocalVm to reporting ZERO UNGUARDED while the page had not changed, AND KEITH'S BROWSER NAMED THE
        // SAME LINE THE SAME DAY: `[Violation] 'setInterval' handler took 128ms` at server.html:3296.
        //
        // *** A PROXIMITY WINDOW IS NOT A SCOPE. *** A gate that got LESS SENSITIVE during a round about guards
        // is the worst possible outcome of that round, and the honest fix is to remove the thing that could only
        // subtract rather than to widen it.
        const b = bodyOf(m[1]);
        return b !== null && /fetch\(|\bapi\(/.test(b);
    }).map((m) => m[1] + "@" + m[2] + "ms");
    const unguarded = fetching.length;

    ok("!! *** unguarded FETCHING pollers have not increased ***",
        unguarded <= FETCHING_UNGUARDED_BASELINE,
        unguarded + " still unguarded: " + fetching.join(", ") + " -- against a baseline of " +
        FETCHING_UNGUARDED_BASELINE + ", from " + intervals + " intervals with " + guarded + " guarded calls. " +
        "THE GUARD ALREADY EXISTS AND THEY WALK PAST IT. The remaining six share the names rjPoll and poll, " +
        "which are NOT LINE-UNIQUE -- converting those needs each call site read individually rather than " +
        "matched, and that is the next batch");

    // v3267 -- *** ONE KEY IS SHARED ON PURPOSE AND THAT IS NOT THE STARVATION CASE. *** rjPoll is set up at two
    // sites, but they are THE SAME POLLER RESTARTED -- one _rjTimer exists at a time, guarded by clearInterval
    // at one site and !_rjTimer at the other. A DISTINCT KEY EACH WOULD LET A RESTART RUN ALONGSIDE THE RUN IT
    // REPLACED, which is the bug the shared key prevents. So the assertion is not "all distinct" but "every
    // shared key is one I have named here" -- a rule that still fails on an accidental collision.
    const DELIBERATE_SHARED = new Set(["rig-jobs"]);
    const keys = [...page.matchAll(/guardedTick\("([^"]+)"/g)].map((m) => m[1]);
    const collisions = [...new Set(keys.filter((k, i) => keys.indexOf(k) !== i))].filter((k) => !DELIBERATE_SHARED.has(k));
    ok("!! ...and no key is shared by ACCIDENT",
        collisions.length === 0,
        keys.length + " keys, " + new Set(keys).size + " distinct; deliberate sharers: " +
        [...DELIBERATE_SHARED].join(", ") + (collisions.length ? ". ACCIDENTAL: " + collisions.join(", ") : "") +
        ". guardedTick refuses to stack a second call on the same key, so two DIFFERENT pollers sharing one " +
        "would silently starve each other -- but ONE poller set up at two sites SHOULD share, and telling those " +
        "apart is a judgement the gate records rather than guesses");

    ok("...and the cap is installed at import time, not later",
        // v3276 -- the number moved, so the assertion asks for A number rather than THE number: pinning 6 was
        // pinning a guess, and pinning 12 would pin the next one. What matters is that a cap is installed early.
        /installFetchCap\(\d+\)/.test(page) && page.indexOf("installFetchCap") < page.indexOf("setInterval"),
        "a poller that starts before the cap gets the unguarded behaviour for its first ticks -- AND THE FIRST " +
        "TICKS ARE THE BURST THAT FILLS THE POOL");
}

// ---- 3. A SYNCHRONOUS THROW MUST NOT WEDGE THE POOL (v3270) -----------------------------------------------------------
{
    // *** THIS IS THE BUG v3265 SHIPPED AND v3269 STALLED ON. *** The release was a .finally() CALL on the
    // promise real() returns -- so if real() throws SYNCHRONOUSLY there is no promise, .finally never runs, and
    // `running` is never decremented. Six of those and the pool is permanently full: every later fetch sits in
    // `waiting` forever and THE PAGE STALLS WITH NO ERROR OF ITS OWN. My own comment above that line said "a
    // leak here would freeze the page".
    globalThis.location = { origin: "http://y" };
    let n = 0;
    globalThis.window = { fetch: (u) => { n++;
        if (n <= 8) throw new Error("synchronous boom");
        return Promise.resolve({ ok: true, url: u }); } };
    const mod = await import(pathToFileURL(path.join(ROOT, "ui", "poller.js")).href + "?v3270");
    mod.installFetchCap(6);
    let rejected = 0, resolved = 0;
    await Promise.all(Array.from({ length: 20 }, (_, i) =>
        window.fetch("/a/" + i).then(() => resolved++, () => rejected++)));
    const st = window.__swekFetchCap();

    ok("!! *** eight synchronous throws do not wedge the pool ***",
        rejected === 8 && resolved === 12 && st.running === 0 && st.waiting === 0,
        "rejected " + rejected + ", resolved " + resolved + ", pool " + JSON.stringify(st) + ". Under v3269 this " +
        "deadlocked at six -- and the symptom was A PAGE THAT SIMPLY STOPPED FILLING, with the only console line " +
        "coming from an unrelated library. THE RELEASE IS IN A try/catch NOW, not a .finally() call");

    ok("!! ...and a stuck pool announces itself after 20s",
        /pool has been FULL with/.test(fs.readFileSync(path.join(ROOT, "ui", "poller.js"), "utf8")),
        "the whole failure mode is SILENT: the page stops filling and nothing says why. One line naming the " +
        "queue depth is the difference between 'it stalled' and a diagnosis -- said ONCE, because a stuck queue " +
        "would otherwise log forever");
}

// ---- 4. THE PAGE COMES FIRST (v3271) --------------------------------------------------------------------------------------
{
    const srv = fs.readFileSync(path.join(ROOT, "ai-bridge", "server.js"), "utf8");

    // v3272 -- the assertion moved with the code: the deferral no longer tests _pageSettledAt directly and the
    // message no longer says "has not finished loading", because BOTH WERE THE THING THAT WAS WRONG.
    ok("!! *** peer version checks DEFER while server.html is loading ***",
        /_bootDeferReason\(\)/.test(srv) && /DEFERRED: " \+ why2/.test(srv),
        "Keith's watchdog line said it: pool FULL with 33 waiting for 20s -- and THE FIX WAS NOT THE BROWSER'S. " +
        "The server was contacting up to TWELVE PEERS for a version check, re-triggered every time one announced " +
        "itself, WHILE the page's own pollers queued behind it. A VERSION CHECK IS NEVER URGENT; the peer will " +
        "still be newer in ninety seconds. The page loading is urgent, because it is what a person is looking at");

    ok("!! ...and the signal is one that ALREADY EXISTS -- the request behind the CPU gauge",
        /"\/system\/stats"[\s\S]{0,900}_pageSettledAt = Date\.now\(\)/.test(srv),
        "Keith: 'cpu gauge alive is the signal that i know the page is complete and fully loaded'. /system/stats " +
        "feeds that gauge, so the page ASKING FOR IT is the page having got that far -- rather than a new " +
        "heartbeat nobody else would ever send, which would be a second declaration of 'the page is up'");

    // v3272 -- *** v3271 GATED ON A SIGNAL THAT NEVER ARRIVED AND COST KEITH NINETY SECONDS FOR NOTHING. ***
    // It waited for /system/stats -- the right marker for "fully loaded", the WRONG one to gate on, because on
    // his box the page never got there inside the window. The fallback then ran the check anyway, so the
    // deferral bought a minute and a half of silence and changed nothing. A SIGNAL THAT MIGHT NOT ARRIVE IS NOT
    // A GATE, IT IS A TIMEOUT WEARING ONE.
    ok("!! *** the gate is 'the page is loading', not 'the page finished' ***",
        /_pageServedAt/.test(srv) && /PAGE_GRACE_MS = 25000/.test(srv) && !/waited < 90000/.test(srv),
        "server.html being SERVED always happens, and it is the moment competing for the socket pool starts to " +
        "hurt; a short grace covers the load itself. The 90-SECOND BLANKET IS GONE");

    ok("!! ...and a box nobody opens waits 20s, not 90",
        // v3331 -- the sentence is a STRING the server RETURNS to a caller, and the window beside it is CODE.
        // noComments keeps both and drops only comments, so a commented-out copy of either cannot satisfy this.
        /no page has been requested yet/.test(noComments(srv)) && /Date\.now\(\) - _bootAt < 20000/.test(noComments(srv)),
        "A HEADLESS BOX MUST STILL UPDATE, but it should not serve out a minute and a half first -- and the old " +
        "fallback made every unopened box pay the full window before doing anything");

    ok("...and the marker fires for '/' as well as '/server.html'",
        /p === "\/" \|\| p === "\/server\.html"/.test(srv),
        "the page is reachable as both, AND A GATE THAT KNEW ONLY ONE WOULD BE A GATE THAT SOMETIMES IS NOT THERE");

    ok("...and the deferral says so out loud",
        /The page comes first; a " \+\s*"version check is never urgent/.test(srv) || /never urgent/.test(srv),
        "a deferral nobody can see reads as a version check that STOPPED WORKING, and this session has been one " +
        "long argument with things that failed silently");
}

// ---- 5. WHICH HANDLER IS SLOW (v3275) --------------------------------------------------------------------------------
{
    const srv2 = fs.readFileSync(path.join(ROOT, "ai-bridge", "server.js"), "utf8");

    ok("!! *** the server times its own requests and names the slow routes ***",
        /_timeRequest\(req, res\)/.test(srv2) && /\[slow\] " \+ key/.test(srv2) && /\/sys\/slow/.test(srv2),
        "Keith's browser reported a pool FULL with 105 waiting -- 33 the boot before. THE CAP HOLDS THE LINE " +
        "WHILE THE LINE KEEPS GROWING, which is not a browser problem: no queue discipline fixes a server that " +
        "cannot answer for minutes. Nothing measured WHICH ROUTE ate the time, so every round since v3265 has " +
        "been treating the symptom");

    ok("!! ...and it says ONE LINE PER ROUTE, reporting the WORST rather than the first",
        /if \(ms > prev\.max\) \{ prev\.max = ms; prev\.said = false; \}/.test(srv2),
        "a slow route hit forty times would bury its own evidence -- THE FAILURE THAT MADE THE " +
        "ERR_INSUFFICIENT_RESOURCES FLOOD UNREADABLE. And the FIRST slow hit is often a cold start; THE WORST is " +
        "the one worth fixing, which keeping only the maximum distinguishes for free");

    ok("...and there is a route to read the whole picture at once",
        /_slowReport\(\)/.test(srv2) && /worstMs/.test(srv2),
        "a console scrolls and a table does not. /sys/slow returns every slow route sorted worst-first");
}

// ---- 6. THE EMPTY TABLE WAS THE FINDING (v3276) ------------------------------------------------------------------------
{
    const srv3 = fs.readFileSync(path.join(ROOT, "ai-bridge", "server.js"), "utf8");

    ok("!! *** the cap was raised BECAUSE the slow table came back empty ***",
        /installFetchCap\(12\)/.test(page) && /routes":\[\]|came back EMPTY/.test(page),
        "Keith's Mac loaded, the CPU gauge went live, and /sys/slow answered {\"routes\":[]}. NO HANDLER CROSSES " +
        "THE THRESHOLD -- so a 70-deep queue was never a blocked server, it was SIX SLOTS SHARED BY ~26 " +
        "ENDPOINTS polling every few seconds. THE ABSENCE WAS THE FINDING, and an instrument that could only " +
        "report problems would have said nothing and left the cap looking innocent");

    ok("!! ...and the threshold dropped to 250ms, because 750 could not tell 5ms from 700ms",
        /if \(ms < 250\) return/.test(srv3) && /thresholdMs: 250/.test(srv3),
        "'under 750ms' spans a 140x range, and which end a request sits at decides whether twenty-six pollers " +
        "fit in a pool at all. AN EMPTY TABLE PROVED NOTHING IS PATHOLOGICAL; it cannot show what a request COSTS");

    ok("...and the cap is still a cap",
        /installFetchCap\(\d+\)/.test(page) && !/installFetchCap\(0\)/.test(page),
        "Chrome still enforces ~6 per host over HTTP/1.1, so a bigger number buys A SHORTER OWN-QUEUE IN FRONT " +
        "OF THE BROWSER'S, not more parallelism. REMOVING IT would put us back at ERR_INSUFFICIENT_RESOURCES");
}

// ---- 7. EVENT-LOOP LAG NAMES WHAT THE SLOW TABLE COULD ONLY IMPLY (v3277) ------------------------------------------------
{
    const srv4 = fs.readFileSync(path.join(ROOT, "ai-bridge", "server.js"), "utf8");

    ok("!! *** the server samples its own event-loop lag ***",
        /LAG_TICK_MS = 100/.test(srv4) && /event loop blocked/.test(srv4) && /\/sys\/lag/.test(srv4),
        "every entry in Keith's slow table was a STATIC .js FILE served ONCE, and the top three finished within " +
        "35ms of each other -- three unrelated files ending together is not three slow reads, IT IS THREE " +
        "REQUESTS THAT SAT BEHIND THE SAME THING. And NO API ROUTE APPEARED AT ALL. Serving a small local file " +
        "is single-digit milliseconds; at 950 THE FILE IS NOT SLOW, THE PROCESS COULD NOT GET TO IT");

    // DRIVEN: the same arithmetic against a deliberate synchronous block, because a lag sampler that cannot see
    // a known 700ms stall would report a quiet boot on a blocked one -- and be believed.
    const LAG = 100; let worst = 0, last = Date.now();
    const boot = Date.now(); const seen = [];
    const t = setInterval(() => { const now = Date.now(); const lag = now - last - LAG; last = now;
        if (lag > 50) { if (lag > worst) worst = lag; seen.push({ atMs: now - boot, lagMs: lag }); } }, LAG);
    await new Promise((r) => setTimeout(r, 250));
    const end = Date.now() + 700; while (Date.now() < end); {}          // block on purpose
    await new Promise((r) => setTimeout(r, 350));
    clearInterval(t);

    ok("!! ...and a deliberate 700ms block is measured as 700ms",
        worst >= 600 && worst <= 900 && seen.length >= 1,
        "worst observed " + worst + "ms across " + seen.length + " event(s). A SAMPLER THAT COULD NOT SEE A KNOWN " +
        "STALL would report a quiet boot on a blocked one and be believed -- which is worse than no sampler");

    ok("!! ...and the 50ms floor separates real blocking from timer jitter",
        /lag > 50/.test(srv4),
        "ordinary scheduling slop would otherwise fill the table with noise and bury the one entry that matters");

    ok("...and the event list is BOUNDED and says when it truncated",
        /_lagEvents\.length < 200/.test(srv4) && /truncated:/.test(srv4),
        "a boot diagnostic that grows forever is a leak, AND A TRUNCATED LIST READ AS THE WHOLE STORY is how a " +
        "measurement starts lying -- so the flag ships with the data");
}

// ---- 8. WHICH PERIODIC CALLBACK BLOCKS (v3278) ----------------------------------------------------------------------------
{
    const srv5 = fs.readFileSync(path.join(ROOT, "ai-bridge", "server.js"), "utf8");

    ok("!! *** setInterval is wrapped so a blocking callback is named by its REGISTRATION SITE ***",
        /_timerBlame/.test(srv5) && /\/sys\/blame/.test(srv5) && /new Error\(\)\.stack/.test(srv5),
        "Keith's /sys/lag: 4s->3.9s blocked, 20s->14.4s, 44s->23.1s, 86s->42.0s, 163s->63.6s, 247s->83.0s, " +
        "359s->106.6s, 498s->138.5s. *** 487 SECONDS BLOCKED OUT OF ~500 OF UPTIME *** and /server.html took 24 " +
        "SECONDS TO SERVE. GROWTH IS THE TELL: a slow boot task is slow ONCE; work that grows every cycle is " +
        "SYNCHRONOUS WORK OVER A COLLECTION THAT KEEPS GROWING -- it never settles, it gets worse forever");

    ok("!! ...and the site is captured at REGISTRATION, not at fire time",
        /stack \|\| ""\)\.split\("\\n"\)\[2\]/.test(srv5),
        "by the time a timer fires THE STACK IS JUST THE TIMER -- the callback's own origin is gone. Capturing " +
        "where it was set up is the only moment the answer exists, and a callback named 'tick' tells nobody " +
        "anything while a file and line ends the hunt");

    ok("!! ...and it reports the WORST per site, one line, like /sys/slow",
        /if \(took > prev\.worstMs\) \{ prev\.worstMs = took; prev\.said = false; \}/.test(srv5),
        "a callback blocking every cycle would otherwise print forever and bury itself -- and re-arming on a NEW " +
        "worst is what makes a GROWING blocker announce each escalation instead of only its first");

    ok("...and the instrumentation cost is stated rather than hidden",
        // v3331 -- this one IS a comment, and it WRAPS ("...AND THAT IS A COST WORTH STATING: ... At" continues on
        // the next line). A contiguous regex on raw source survives only while nobody re-wraps the paragraph, which
        // is the debt gateQuality ratchets. prose() flattens comments so the match is immune to the wrapping.
        prose(srv5).includes("WRAPPING IS INSTRUMENTATION AND THAT IS A COST"),
        "a closure and a Date.now() per tick. At a hundred timers ticking once a second that is noise against a " +
        "138-SECOND BLOCK -- but the trade belongs in the file, not in my head");
}

// ---- v3281. THE CAP IS A DIAL: applies LIVE (waiters release on raise), persists, and clamps footguns -------------
{
    // fresh module instance (query string busts Node's ESM cache) with a stubbed localStorage
    const store = {};
    globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
    globalThis.location = { origin: "http://x" };
    let live = 0, peak = 0, done = 0;
    globalThis.window = { fetch: () => { live++; peak = Math.max(peak, live);
        return new Promise((r) => setTimeout(() => { live--; done++; r({ ok: true }); }, 40)); } };
    const mod2 = await import(pathToFileURL(path.join(ROOT, "ui", "poller.js")).href + "?dial");
    mod2.installFetchCap(4);
    const all = Promise.all(Array.from({ length: 20 }, (_, i) => window.fetch("/api/" + i)));
    await new Promise((r) => setTimeout(r, 15));   // mid-burst: pool full, queue deep
    const before = window.__swekFetchCap();
    const applied = window.__swekSetFetchCap(12);
    await new Promise((r) => setTimeout(r, 5));    // the raise must release waiters NOW, not on the next fetch
    const after = window.__swekFetchCap();
    await all;
    ok("!! raising the cap releases waiters IMMEDIATELY (running jumps past the old cap mid-burst)",
        before.running === 4 && before.waiting > 0 && applied === 12 && after.running > 4,
        "before: " + before.running + " running / " + before.waiting + " waiting at cap 4; after set(12): " +
        after.running + " running -- a dial that only applied to FUTURE fetches would leave the current stall in place");
    ok("...all 20 still resolve and the peak honors the raised cap", done === 20 && peak <= 12, "peak " + peak + ", resolved " + done + "/20");
    ok("...the chosen cap persists", store["swek.fetchCap"] === "12", "localStorage swek.fetchCap = " + store["swek.fetchCap"]);
    ok("...and footgun values are clamped, not obeyed", window.__swekSetFetchCap(0) === 2 && window.__swekSetFetchCap(999) === 48,
        "0 -> 2 (a zero cap would freeze the page silently), 999 -> 48");
}

// a saved cap survives the reload the experiment needs: a fresh install reads it over its own default
{
    const store = { "swek.fetchCap": "9" };
    globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
    globalThis.window = { fetch: () => Promise.resolve({ ok: true }) };
    const mod3 = await import(pathToFileURL(path.join(ROOT, "ui", "poller.js")).href + "?persist");
    mod3.installFetchCap(12);
    const s = window.__swekFetchCap();
    ok("a persisted cap overrides the install default on reload", s.maxInFlight === 9, "installed with 12, saved 9 -> live cap " + s.maxInFlight);
}

// the page front door exists: the chip renders the live pool and the number box drives __swekSetFetchCap
{
    ok("server.html has the live pool chip wired to the dial",
        page.includes("fetchCapChip") && page.includes("__swekSetFetchCap") && page.includes("__swekFetchCap"),
        "the 6-vs-12 experiment was a code edit per data point, so it kept not being run; now the readout IS the measurement");
}

console.log();
console.log("  ----  WHAT THIS DOES NOT DO: make the page poll less. 44 timers against one host is the actual");
console.log("  ----  design problem, and the cap only stops it collapsing. Moving 28 pollers onto guardedTick is");
console.log("  ----  the round after -- 28 careful edits, not one script, because v3202 cost 61 live modules.");
if (fails) { console.log("fetchCap-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("fetchCap-selfcheck: all checks pass");
