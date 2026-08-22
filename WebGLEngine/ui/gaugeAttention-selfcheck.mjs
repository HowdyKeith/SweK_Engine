// WebGLEngine/ui/gaugeAttention-selfcheck.mjs -- v3661
//
// Run: node ui/gaugeAttention-selfcheck.mjs
//
// The attention slot is a STATE MACHINE WITH TIMING, which is the kind of thing that works in the demo and
// misbehaves in the burst. ui/gaugeAttention.mjs is deliberately pure -- no DOM, no timers, no gauges -- so the
// part that can be wrong is the part that gets graded, and the DOM wiring is left with nothing to decide.
//
// *** THE KEYS ARE THE GUARANTEES KEITH ASKED FOR, STATED AS THINGS THAT MUST BE TRUE OF EVERY RUN:
//   1. A row is never swapped in and morphed in the same instant -- there is a settle.
//   2. A row always gets its full dwell. A BURST CANNOT FLICK THREE ROWS PAST FASTER THAN ANYONE CAN READ.
//   3. The FIRST reading of a row is never a change (or the whole rotation fires on page load).
//   4. A morph is NEVER emitted for a row that has not declared morphable -- v3531's rule, enforced here
//      rather than remembered by the caller. ***

import { readFileSync } from "node:fs";
import { initState, observe, step, PHASE, DEFAULTS, dwellMs } from "./gaugeAttention.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

const ROWS = [{ id: "sys", morphable: false }, { id: "fabric", morphable: true }, { id: "brains", morphable: true }];
/** Drive the machine to `until` in `dt` steps, collecting every action with its timestamp. */
function run(state, script, { until = 30000, dt = 50 } = {}) {
    const out = [];
    for (let t = 0; t <= until; t += dt) {
        for (const ev of script.filter((e) => e.at > t - dt && e.at <= t)) observe(state, ev.row, ev.sig, t);
        const r = step(state, t, ROWS);
        for (const a of r.actions) out.push({ t, ...a });
    }
    return out;
}

// --- 1. the sequence -------------------------------------------------------------------------------------
{
    say("1. dormant change -> swap -> settle -> morph -> hold -> release.");
    const s = initState("fabric");
    const acts = run(s, [
        { at: 0, row: "brains", sig: "3/1" },        // first reading
        { at: 500, row: "brains", sig: "4/1" },      // the change
    ]);
    say("     " + acts.map((a) => a.t + "ms " + a.type + (a.row ? " " + a.row : "")).join("   |   "));
    ok("!! the first reading produces nothing at all", !acts.some((a) => a.t < 500),
        "a gauge set that has just mounted reports EVERY value for the first time, and treating that as a change " +
        "would fire every row's claim on page load -- exactly the churn the hold exists to prevent");
    const swap = acts.find((a) => a.type === "swap"), morph = acts.find((a) => a.type === "morph"), rel = acts.find((a) => a.type === "release");
    ok("swap, morph and release all happen, in that order", swap && morph && rel && swap.t < morph.t && morph.t < rel.t);
    ok("!! the morph waits the settle out rather than firing on arrival", morph.t - swap.t >= DEFAULTS.settleMs,
        (morph.t - swap.t) + "ms >= " + DEFAULTS.settleMs + "ms. Morphing into a layout that is still moving is how " +
        "a digit roll turns into a smear");
    ok("and the row holds for its full dwell before the slot frees", rel.t - swap.t >= dwellMs(),
        (rel.t - swap.t) + "ms >= " + dwellMs() + "ms");
}

// --- 2. THE BURST, WHICH IS WHERE THIS KIND OF THING BREAKS --------------------------------------------------
{
    say("2. THREE ROWS ALL CHANGING AT ONCE. The slot must not flicker.");
    const s = initState("sys");
    const script = [
        { at: 0, row: "fabric", sig: "a" }, { at: 0, row: "brains", sig: "a" }, { at: 0, row: "sys", sig: "a" },
    ];
    for (let t = 300; t <= 3000; t += 100) {        // everything changing every 100ms for three seconds
        script.push({ at: t, row: "fabric", sig: "f" + t }, { at: t, row: "brains", sig: "b" + t }, { at: t, row: "sys", sig: "s" + t });
    }
    const acts = run(s, script, { until: 40000 });
    const swaps = acts.filter((a) => a.type === "swap");
    say("     swaps at: " + swaps.map((a) => a.t + "ms " + a.row).join(", "));
    ok("!! no two swaps are closer together than the full dwell", (() => {
        for (let i = 1; i < swaps.length; i++) if (swaps[i].t - swaps[i - 1].t < dwellMs()) return false;
        return true;
    })(), "closest pair " + (swaps.length > 1 ? Math.min(...swaps.slice(1).map((a, i) => a.t - swaps[i].t)) : "n/a") +
        "ms against a dwell of " + dwellMs() + "ms. THIRTY CHANGES PER ROW IN THREE SECONDS PRODUCED " + swaps.length +
        " SWAPS -- the hold is not advisory");
    ok("a row waiting in the queue is queued ONCE however often it changes", swaps.length <= 3,
        "one claim per row, not one per tick -- otherwise a chatty row would own the slot forever by sheer volume");
}

// --- 3. THE MORPH RULE, ENFORCED RATHER THAN REMEMBERED --------------------------------------------------------
{
    say("3. v3531: a morph is only ever allowed on a number that RARELY CHANGES.");
    const s = initState("fabric");
    const acts = run(s, [{ at: 0, row: "sys", sig: "a" }, { at: 300, row: "sys", sig: "b" }]);
    const swap = acts.find((a) => a.type === "swap"), morph = acts.find((a) => a.type === "morph");
    say("     sys (morphable: false) -> " + acts.map((a) => a.type).join(", "));
    ok("!! the un-morphable row is swapped in and NOT morphed", !!swap && !morph,
        "it is not skipped and it is not an error -- IT SIMPLY HOLDS, which is what a fast-moving row should do. " +
        "The policy REFUSES the morph rather than trusting the caller to remember v3531's rule");
    ok("...and morphDigits.js still carries the reason", (() => {
        const src = readFileSync(new URL("./morphDigits.js", import.meta.url), "utf8");
        return /intermediate frames show shapes that are NOT VALID DIGITS/i.test(src);
    })(), "the rule lives where the effect lives; this file enforces it, it does not re-argue it");
}

// --- 4. quiet is quiet -----------------------------------------------------------------------------------------
{
    say("4. NOTHING CHANGING MUST PRODUCE NOTHING.");
    const s = initState("fabric");
    const acts = run(s, [{ at: 0, row: "brains", sig: "x" }, { at: 0, row: "sys", sig: "y" }], { until: 60000 });
    ok("!! sixty seconds of no change produces zero actions", acts.length === 0,
        "the home row keeps the slot and the machine never ticks anything. A rotation that rotates when nothing " +
        "happened is a screensaver, not an indicator");
    ok("and the state is still IDLE on its home row", s.phase === PHASE.IDLE && s.current === "fabric");
}

// --- 5. purity -------------------------------------------------------------------------------------------------
{
    say("5. THE POLICY HAS NO CLOCK, NO DOM AND NO GAUGES OF ITS OWN.");
    const raw = readFileSync(new URL("./gaugeAttention.mjs", import.meta.url), "utf8");
    // *** THIS CHECK FAILED ON ITS OWN SUBJECT'S COMMENTS THE FIRST TIME. gaugeAttention.mjs's header EXPLAINS
    // that every delay is "a named constant rather than a number in a setTimeout" -- and a regex for setTimeout
    // matched that sentence. PROSE-AS-CODE, the shape these notes have recorded twenty-plus times, in a check
    // written this round to test purity. Comments are stripped before the code is tested; the tree's own idiom. ***
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
    ok("no Date.now, no setTimeout, no document -- tested against CODE, not comments",
        !/Date\.now|setTimeout|setInterval|document\.|window\./.test(src),
        "every delay arrives as `now` from the caller, which is the only reason sections 1-4 can run at all -- a " +
        "state machine that reads its own clock can only be tested by waiting");
    ok("every delay is a named constant, not a literal in a branch", /settleMs|morphMs|holdMs/.test(src) &&
        !/>= *\d{3,}/.test(src.replace(/DEFAULTS[^\n]*/g, "")));
    ok("...and the stripper really did remove the prose that broke it", /setTimeout/.test(raw) && !/setTimeout/.test(src),
        "the word IS in the file and is NOT in the code -- which is the whole distinction, and a stripper that " +
        "silently removed nothing would have passed this check for the wrong reason");
    say("   NOT DONE: the third row itself. A row of FLEET GPU BRAINS has no data source -- brain/agent/fleet.js");
    say("   is a SIMULATOR with a seeded nBrains, /ai/brain/health reports the LOCAL brain, and the peer list");
    say("   carries no brain state. THE MECHANISM IS BUILT AND THE ROW IS NOT, deliberately: a dial fed by a");
    say("   simulation is the one thing this tree refuses more than any other.");
}

console.log("gaugeAttention-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
