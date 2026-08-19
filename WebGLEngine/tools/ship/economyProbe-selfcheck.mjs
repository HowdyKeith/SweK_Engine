// WebGLEngine/tools/ship/economyProbe-selfcheck.mjs -- v3041
// The reason this exists: a "the planner ignores the margin" verdict computed over four eligible ships is a
// finding about the sample. Checks 1 and 2 make that impossible to report by accident.
"use strict";
import { bandCensus, verdict, perturbationPlan, scoreShift, inBand, MIN_BAND } from "../roundhouse/economyProbe.mjs";
let fails = 0; const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const threw = (f) => { try { f(); return false; } catch { return true; } };
// Keith's two real samples, straight off the publish lines.
const T80   = { fulfill_delivery: 18, seek_retrofit: 1, trade_run: 25, do_crew_mission: 9, sell_cargo: 4, fulfill_passenger_transport: 12, idle: 213 };
const T5920 = { sell_cargo: 14, fulfill_delivery_with_retrofit: 1, refuel: 1, rest_crew: 138, fulfill_delivery: 27, fulfill_construction: 2, fulfill_contract: 4, trade_run: 95 };

// ---- 1. THE CENSUS ON REAL DATA ------------------------------------------------------------------------------
{
    const a = bandCensus(T80), b = bandCensus(T5920);
    ok("!! tick 80: the band is a minority", a.band === 43 && a.total === 282 && a.fraction < 0.16,
       a.band + "/" + a.total + " (" + (a.fraction * 100).toFixed(0) + "%) -- 213 idle ships never reach the scored comparison");
    ok("!! tick 5920: still a minority, for a different reason", b.band === 122 && b.blocked >= 153,
       b.band + " in band, " + b.blocked + " blocked on waterfall rungs (138 rest_crew) -- the fleet moved from idle to exhausted, and neither state is measurable");
    ok("both samples clear the floor, so a verdict is permitted at all", a.measurable && b.measurable, "floor " + MIN_BAND);
    ok("a thin sample does NOT", bandCensus({ trade_run: 4, rest_crew: 200 }).measurable === false);
    ok("!! an unrecognised goal counts as OTHER, never as eligible", bandCensus({ some_new_goal_they_add: 50 }).other === 50,
       "a rung they add later must not be silently counted into the band");
    ok("an empty histogram is refused, not scored zero", bandCensus({}).why.indexOf("empty") >= 0);
}

// ---- 2. FOUR OUTCOMES, AND THREE OF THEM ARE REFUSALS ----------------------------------------------------------
{
    const census = bandCensus(T5920);
    const thin = bandCensus({ trade_run: 3 });
    ok("!! a thin band REFUSES rather than reporting UNMOVED",
       verdict({ before: { goal: "trade_run" }, after: { goal: "trade_run" }, census: thin }).outcome === "INSUFFICIENT",
       "reporting 'the planner ignored it' over three ships would describe the sample, not the planner");
    ok("!! a ship on a waterfall rung is BLOCKED, not evidence",
       verdict({ before: { goal: "rest_crew" }, after: { goal: "rest_crew" }, census }).outcome === "BLOCKED",
       "138 of 282 ships are here -- counting them as 'the margin did not move it' would be the single easiest way to get this wrong");
    ok("a missing trace is NO-TRACE, not UNMOVED",
       verdict({ before: null, after: { goal: "trade_run" }, census }).outcome === "NO-TRACE",
       "an unobserved decision is not an unchanged decision");
    const moved = verdict({ before: { goal: "trade_run", target: "mars" }, after: { goal: "fulfill_delivery", target: "earth" }, census });
    ok("!! a real change reads MOVED and names both ends", moved.outcome === "MOVED" && moved.changed === true, moved.from + "  =>  " + moved.to);
    const same = verdict({ before: { goal: "trade_run", target: "mars" }, after: { goal: "trade_run", target: "mars" }, census });
    ok("...and an unchanged one admits ONE trial cannot explain it", same.outcome === "UNMOVED" && /sweep the delta/.test(same.why));
    ok("a same-goal DIFFERENT-target choice still counts as moved",
       verdict({ before: { goal: "trade_run", target: "mars" }, after: { goal: "trade_run", target: "vega" }, census }).changed === true,
       "the planner re-picking the destination is the margin working, and a goal-only comparison would miss it");
}

// ---- 3. ORDER IS PART OF THE MEASUREMENT ------------------------------------------------------------------------
{
    const p = perturbationPlan({ location: "market-earth-station", commodity: "ore", delta: -400, shipId: "ship-7" });
    ok("!! pause comes FIRST", p[0].path === "/api/sim/pause",
       "a supply write against a running loop is not a controlled perturbation");
    ok("the BEFORE trace is captured while paused, before the write", p[1].path.indexOf("/trace") > 0 && p[2].path.indexOf("/supply") > 0);
    ok("!! it STEPS, it does not resume", p[3].path === "/api/sim/step" && !p.some((s) => /resume/.test(s.path)),
       "resume makes the delta unattributable -- any of a thousand ticks could have caused the change");
    ok("every step carries its reason", p.every((s) => s.why && s.why.length > 20));
    ok("an unspecified delta refuses", threw(() => perturbationPlan({ location: "l", commodity: "ore", shipId: "s" })));
    ok("zero ticks refuses", threw(() => perturbationPlan({ location: "l", commodity: "ore", delta: 1, shipId: "s", ticks: 0 })));
    ok("no ship refuses", threw(() => perturbationPlan({ location: "l", commodity: "ore", delta: 1 })));
}

// ---- 4. THE LOG IS NOT LINEAR, WHICH IS WHY A SINGLE TRIAL IS WEAK -----------------------------------------------
{
    const s = scoreShift(100, 400);
    ok("!! a 4x profit change is only a 1.386 score shift", Math.abs(s.shift - Math.log(4)) < 1e-9, s.why);
    // I HAD THIS BACKWARDS AND THE GATE CAUGHT IT. I asserted "doubling again adds less". It does not: log is
    // exactly additive over ratios, so EVERY doubling adds exactly ln2. The compression is not between
    // successive doublings -- it is between the RATIO and the ABSOLUTE change. Same +100 credits is a 0.693
    // shift from a base of 100 and a 0.095 shift from a base of 1000, so a fixed perturbation gets weaker the
    // richer the route already is. That is the real non-linearity, and it means a delta sweep must be
    // MULTIPLICATIVE, not additive -- an additive sweep tests a moving target.
    const d1 = scoreShift(100, 200).shift, d2 = scoreShift(200, 400).shift;
    ok("!! every DOUBLING adds exactly ln2, no matter the base", Math.abs(d1 - d2) < 1e-12 && Math.abs(d1 - Math.LN2) < 1e-12,
       "100->200 and 200->400 both shift " + d1.toFixed(3) + " -- log compresses ratios into constants, it does not decay");
    ok("!! but a FIXED absolute delta weakens as the base rises",
       scoreShift(1000, 1100).shift < scoreShift(100, 200).shift / 5,
       "+100 is " + scoreShift(100, 200).shift.toFixed(3) + " from a base of 100 and only " + scoreShift(1000, 1100).shift.toFixed(3) +
       " from 1000 -- so the sweep must be multiplicative; an additive one tests a moving target");
    ok("!! zero or negative profit is unpriceable, not zero-effect", scoreShift(0, 100).shift === null && /not a zero-effect one/.test(scoreShift(0, 100).why));
}
console.log("\neconomyProbe-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
