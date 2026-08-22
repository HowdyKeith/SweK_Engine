// WebGLEngine/ai-bridge/brainCensus-selfcheck.mjs -- v3664
//
// Run: node ai-bridge/brainCensus-selfcheck.mjs
//
// v3662 put a BRAINS dial on server.html and left SOLVING reading the HUB's own state, because per-brain work
// was not published. brainCensus.js is that number, kept PURE so it can be graded here rather than by running a
// server and posting to it.
//
// *** THE FINDING THIS ROUND IS THAT THE REGISTRY ALREADY CARRIED TWO ANSWERS TO "IS THIS BRAIN BUSY", AND THEY
// ANSWER DIFFERENT QUESTIONS. `expBusy` is what the brain SAYS -- brain/brain.js sets it ONLY when mid-
// experiment, so a brain solving flat out all day never sets it; it means "may I be interrupted". `lastSeen` is
// what the brain DID: fleetScore stamps it on every field post, so IT IS THE LAST SOLVE, NOT A HEARTBEAT. A
// dial labelled WORKING must use the observed one. Both are published, and so is the disagreement. ***

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require_ = createRequire(import.meta.url);
const { census, BUSY_MS, LIVE_MS } = require_("./brainCensus.js");

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const NOW = 1_000_000;
const brain = (id, silenceMs, expBusy) => ({ id, lastSeen: NOW - silenceMs, ...(expBusy === undefined ? {} : { expBusy }) });

// --- 1. the counts ------------------------------------------------------------------------------------------
{
    say("1. THE HEAD-COUNT. busy = posted a solve within " + BUSY_MS + "ms; registered = seen within " + LIVE_MS + "ms.");
    const c = census([brain("a", 100), brain("b", 30000), brain("c", 200, true), brain("d", 40000, true), brain("e", 90000)], NOW);
    say("     " + JSON.stringify(c));
    ok("the evicted brain is not in the fleet at all", c.registered === 4,
        "90s of silence is past the 60s eviction gpuBrainBridge applies -- counting it would report a machine " +
        "that has left as available");
    ok("busy + idle is exactly the registered count", c.busy + c.idle === c.registered,
        "the two buckets partition the fleet: a brain cannot be neither, and cannot be both");
    ok("!! busy is OBSERVED, so the 40s-silent brain is idle even though it DECLARES itself busy",
        c.busy === 2 && c.declaredBusy === 2 && c.disagree === 2,
        "brain d says expBusy and has not posted a solve in 40 seconds. A dial that trusted the declaration would " +
        "show it working while it has plainly stopped");
}

// --- 2. THE TWO DECLARATIONS, SEPARATED -------------------------------------------------------------------------
{
    say("2. THE DISAGREEMENT IS THE NUMBER WORTH PUBLISHING.");
    const allAgree = census([brain("a", 100, true), brain("b", 30000, false)], NOW);
    ok("when the two answers coincide, disagree is 0", allAgree.disagree === 0,
        "so a fleet where the flag tracks reality reports zero, and the dial's two readings can be trusted as one");
    const busyNotDeclared = census([brain("a", 100)], NOW);
    ok("!! a brain solving hard WITHOUT the flag counts as a disagreement", busyNotDeclared.disagree === 1 &&
        busyNotDeclared.busy === 1 && busyNotDeclared.declaredBusy === 0,
        "which is the NORMAL case, not an error: expBusy is only ever set mid-experiment. IF THIS NUMBER IS " +
        "LARGE IT MEANS THE FLAG IS NARROW, NOT THAT THE FLEET IS BROKEN -- and knowing which is why it is reported");
    say("   *** SO THE HONEST READING OF brainsDisagree IS: 'how many brains are working without saying so'.");
    say("   It is NOT an error count and the endpoint must never be read as if it were. ***");
}

// --- 3. the edges -------------------------------------------------------------------------------------------------
{
    say("3. EDGES.");
    ok("an empty fleet is all zeros, not NaN", (() => {
        const c = census([], NOW);
        return c.registered === 0 && c.busy === 0 && c.idle === 0 && c.disagree === 0 && c.oldestSilenceMs === 0;
    })());
    ok("null / undefined entries are skipped rather than counted", census([null, undefined, brain("a", 10)], NOW).registered === 1);
    ok("a brain with no lastSeen at all is treated as gone, not as fresh", census([{ id: "x" }], NOW).registered === 0,
        "lastSeen 0 against a real clock is 1,000,000ms of silence -- defaulting a MISSING timestamp to `now` " +
        "would have made an unknown brain the busiest thing on the fleet");
    ok("exactly at the busy boundary counts as busy", census([brain("a", BUSY_MS)], NOW).busy === 1);
    ok("one millisecond past it does not", census([brain("a", BUSY_MS + 1)], NOW).busy === 0);
    ok("oldestSilenceMs reports the quietest LIVE brain, ignoring evicted ones",
        census([brain("a", 100), brain("b", 30000), brain("c", 90000)], NOW).oldestSilenceMs === 30000);
}

// --- 4. THE CONSTANT THAT IS DECLARED TWICE ---------------------------------------------------------------------------
{
    say("4. LIVE_MS IS ALSO SPELLED IN gpuBrainBridge.fleetScore, AND TWO SPELLINGS OF ONE NUMBER IS THIS TREE'S");
    say("   MOST-REPEATED DEFECT. The census cannot import it (it lives inside a function), so the gate reads BOTH.");
    const src = readFileSync(new URL("./gpuBrainBridge.js", import.meta.url), "utf8");
    const m = /now - v\.lastSeen > (\d+)/.exec(src);
    say("     eviction window in gpuBrainBridge: " + (m ? m[1] : "NOT FOUND") + "ms   |   LIVE_MS here: " + LIVE_MS + "ms");
    ok("!! the two agree", !!m && Number(m[1]) === LIVE_MS,
        "if somebody changes the eviction and not this constant, the census counts brains the registry has " +
        "already deleted -- and nothing else in the tree would notice. THE CHECK IS THE JOIN");
    ok("the endpoint actually publishes the census", /brainsBusy: c\.busy/.test(src) && /brainCensus\.census/.test(src));
}

// --- 5. scope ------------------------------------------------------------------------------------------------------------
{
    say("5. SCOPE.");
    const src = readFileSync(new URL("./brainCensus.js", import.meta.url), "utf8");
    ok("the census is pure: no require, no globals, no clock of its own",
        !/require\(/.test(src) && !/Date\.now/.test(src.replace(/\/\/[^\n]*/g, "")),
        "`now` arrives as an argument, which is the only reason every case above can be stated as a fixed number " +
        "instead of a wait");
    say("   NOT CLAIMED: that brainsBusy is a measure of LOAD. It counts brains that posted a solve inside a");
    say("   6-second window -- a brain solving once every 10 seconds reads idle, and a brain posting tiny solves");
    say("   flat out reads busy. IT IS AN ACTIVITY FLAG, NOT A UTILISATION FIGURE, and solveMsEwma is the number");
    say("   that would carry utilisation if a dial ever needs it.");
    say("   WIRED IN THE SAME ROUND: server.html's SOLVING dial now reads brainsBusy, falling back to the hub's");
    say("   own `solving` flag against an older bridge -- a fallback to ZERO would have shown an empty dial on a");
    say("   working fleet. THIS NOTE SAID 'NOT DONE' UNTIL THE WIRING LANDED; a scope note that outlives its own");
    say("   round is the stale-prose defect these gates keep finding, so it moves with the code.");
}

console.log("brainCensus-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
