// WebGLEngine/brain/subTask-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/subTask-selfcheck.mjs      (~10 s)
//
// THE SUBMARINE'S JOB, HELD TO ITS OWN WORDS. brain/subTask.mjs is the one task the PD autopilot and the neural pilot are both graded on; this gate holds the task and not the pilots:
//
//   1  DETERMINISM   a kind and a seed always make the same scenario; scenarios are frozen; a dive is deterministic (same fingerprint, same score); a bad kind is refused by name
//   2  THE SCENARIOS every start is inside the ranges the header gives (depth, speed, pitch, bank), every target is inside the water (14..40 m) and inside the screw's reach (1.5..3.5 m/s); nominal has no weight error
//                    and no current, recovery a weight error and no current, current both; the current is a function of time and is the zero vector when there is none
//   3  THE SCORE     minus the mean per-tick error with the three caps (5 m, 1 rad, 1 m/s x 0.5) -- recomputed here from a hand-flown trace; a dive that ENDS is charged the worst tick, 7.5, for every tick not flown
//                    (a ballast-full pilot grounds, and its score is bounded by that charge); a pilot that does nothing does not end and does not score zero
//   4  THE SETS      TRAIN / HELD_OUT / AUDIT / BASELINE are pairwise disjoint (by kind and seed), of the sizes the header says, and the autopilot's score on each is PINNED (it moves when the vessel, the task
//                    or the autopilot's laws move -- that is the point of pinning it)
//
// SABOTAGE LOG -- TWELVE, each applied to brain/subTask.mjs in place, the gate run, the file restored; every one red by name (the number is how many rows went red):
//   T1 worst tick 3 not 7.5 1 | T2 depth cap 10 m not 5 2 | T3 speed weight 1 not 0.5 2 | T4 the score's heading error not wrapped 1 | T5 the vessel ignores the current 1 | T6 the weight error ignored 1
//   T7 TRAIN and HELD_OUT overlap 2 | T8 nominal gets a weight error 2 | T9 targets leave the water 3 | T10 the current does not depend on time 1 | T11 the seed ignored 1 | T12 an early end is not charged 2
// T4 went 0 red the first time: the autopilot never turns more than pi, so a recomputation of ITS score cannot tell a wrapped heading error from an unwrapped one. The row that holds it flies a pilot that circles
// under a constant rudder, which does. T12's first pattern did not match the file (the editor says so out loud now; it was silent in the first batch).
"use strict";
import * as T from "./subTask.mjs";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import * as A from "./autopilotSub.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const within = (v, lo, hi) => v >= lo && v <= hi;

console.log("subTask-selfcheck -- the submarine's job\n");

console.log("1. DETERMINISM");
{
    const a = T.scenario(7, "recovery"), b = T.scenario(7, "recovery"), c = T.scenario(8, "recovery"), d = T.scenario(7, "current");
    ok("!! a kind and a seed always make the same scenario; a different seed or kind makes a different one; a scenario is frozen all the way down", JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(a) !== JSON.stringify(c) && JSON.stringify(a) !== JSON.stringify(d) && Object.isFrozen(a) && Object.isFrozen(a.start) && Object.isFrozen(a.target) && Object.isFrozen(d.current));
    const f1 = T.fly(A.pilot(), T.scenario(3, "current")), f2 = T.fly(A.pilot(), T.scenario(3, "current"));
    ok("!! a dive is deterministic: the same pilot on the same scenario gives the same score, errors and fingerprint twice", f1.score === f2.score && f1.fingerprint === f2.fingerprint && f1.eDepth === f2.eDepth && /^[0-9a-f]+$/.test(f1.fingerprint), f1.fingerprint);
    let msg = null; try { T.scenario(1, "storm"); } catch (e) { msg = e.message; }
    ok("a kind that is not nominal / recovery / current is refused, by name", msg && /storm/.test(msg) && /nominal/.test(msg), msg);
}

console.log("\n2. THE SCENARIOS");
{
    const all = []; for (const k of T.KINDS) for (let s = 1; s <= 40; s++) all.push(T.scenario(s, k));
    const nom = all.filter((x) => x.kind === "nominal"), rec = all.filter((x) => x.kind === "recovery"), cur = all.filter((x) => x.kind === "current");
    ok("!! every target is inside the water and the screw's reach: depth 14..40 m, speed 1.5..3.5 m/s, heading within +-2 rad (120 scenarios: seeds 1..40 of each kind)", all.every((x) => within(x.target.depth, 14, 40) && within(x.target.speed, 1.5, 3.5) && within(x.target.heading, -2, 2)));
    ok("!! nominal starts are small (pitch within 0.08, bank 0.12, speed 1.5..3.5) and recovery starts are large (pitch within 0.5, bank 0.6, speed 0.8..4), both from 18..38 m", nom.every((x) => within(x.start.pitch, -0.08, 0.08) && within(x.start.bank, -0.12, 0.12) && within(x.start.speed, 1.5, 3.5) && within(x.start.depth, 18, 38)) && rec.every((x) => within(x.start.pitch, -0.5, 0.5) && within(x.start.bank, -0.6, 0.6) && within(x.start.speed, 0.8, 4) && within(x.start.depth, 18, 38)) && rec.some((x) => Math.abs(x.start.pitch) > 0.3) && rec.some((x) => Math.abs(x.start.bank) > 0.4));
    ok("!! nominal has no weight error and no current; recovery has a weight error within +-0.6% and no current; current has both", nom.every((x) => x.weightError === 0 && x.current === null) && rec.every((x) => x.current === null && Math.abs(x.weightError) <= 0.006) && rec.some((x) => x.weightError !== 0) && cur.every((x) => x.current && Math.abs(x.weightError) <= 0.006));
    const c = cur[0].current, t0 = T.currentAt(c, 0), t9 = T.currentAt(c, 9.3);
    ok("the current is a function of time (it changes between t = 0 and t = 9.3 s), bounded by mean +- amplitude on every axis, and the zero vector when there is none", JSON.stringify(t0) !== JSON.stringify(t9) && [0, 1, 2].every((i) => Math.abs(t9[i] - c.mean[i]) <= c.amp[i] + 1e-12) && T.currentAt(null, 5).every((v) => v === 0));
}

console.log("\n3. THE SCORE");
{
    const model = S.createSubModel(), total = Math.round(T.SECONDS / T.DT);
    // the score recomputed tick by tick, here, from the vessel's own attitude() -- for any pilot
    const recompute = (pilot, sc) => {
        let s = S.createState({ ...sc.start, model }), eD = 0, eH = 0, eS = 0;
        for (let i = 0; i < total; i++) {
            const cv = T.currentAt(sc.current, i * T.DT), r = S.stepSub(model, s, pilot(s, sc.target, cv), T.DT, cv, sc.weightError); s = r.state;
            const a = S.attitude(s, cv), he = Math.atan2(Math.sin(sc.target.heading - a.heading), Math.cos(sc.target.heading - a.heading));
            eD += Math.min(3, Math.abs(a.depth - sc.target.depth) / 5); eH += Math.min(3, Math.abs(he)); eS += Math.min(3, Math.abs(a.speed - sc.target.speed));
        }
        return -(eD + eH + 0.5 * eS) / total;
    };
    const sc = T.scenario(2, "nominal"), pilot = A.pilot(), mine = recompute(pilot, sc), f = T.fly(pilot, sc);
    ok("!! the score is minus the mean per-tick error with the caps (depth / 5 m, heading in rad, speed in m/s x 0.5): recomputed here tick by tick from the vessel's own attitude(), to 1e-9", Math.abs(mine - f.score) < 1e-9 && f.status === "submerged" && f.ticks === total, `${mine.toFixed(6)} vs ${f.score.toFixed(6)}`);
    const spinner = (s, tg) => ({ yaw: 1, thrust: S.trim(model, 3).thrust }), sp = T.scenario(4, "nominal"), spun = T.fly(spinner, sp);
    ok("!! and the heading error is WRAPPED to +-pi before it is capped: a vessel that circles under a constant rudder (its heading goes round the compass, errors past pi) scores exactly the recomputation with the wrapped error, to 1e-9", spun.status === "submerged" && Math.abs(recompute(spinner, sp) - spun.score) < 1e-9 && spun.eHdg < Math.PI, `${spun.score.toFixed(6)}  mean heading error ${spun.eHdg.toFixed(3)} rad`);
    const sink = T.fly(() => ({ ballast: 1, thrust: 0 }), T.scenario(2, "nominal"));
    const bound = (-T.WORST_TICK * (total - sink.ticks)) / total;
    ok("!! a dive that ENDS is charged the worst tick (7.5) for every tick it did not fly: a pilot that floods the tank grounds, flies fewer ticks, and scores AT MOST that charge", sink.status !== "submerged" && sink.ticks < total && sink.score <= bound + 1e-12 && T.WORST_TICK === 7.5, `${sink.status} after ${sink.ticks} ticks: ${sink.score.toFixed(4)} <= ${bound.toFixed(4)}`);
    const idle = T.fly(() => ({}), sc);
    ok("a pilot that does nothing does not end the dive (the vessel coasts) and does not score 0 or the worst", idle.status === "submerged" && idle.score < -0.1 && idle.score > -T.WORST_TICK, `${idle.score.toFixed(4)}`);
    const blow = T.fly(() => ({ ballast: -1, pitch: 1, thrust: 1 }), T.scenario(2, "nominal"));
    ok("!! a pilot that blows the tank, pulls up and drives for the surface BREACHES: the dive ends 'broached' (the centre of gravity above the water), flies fewer ticks, and is charged for the rest", blow.status === "broached" && blow.ticks < total && blow.score < -1, `${blow.status} after ${blow.ticks}: ${blow.score.toFixed(3)}`);
    const z = T.evaluate(A.pilot(), T.TRAIN_SET.slice(0, 4));
    ok("evaluate() is the mean of its fly()s, counts the dives that ended early, and reports each kind's mean; describeEval quotes them; versus() of a result against itself is all 'same'", Math.abs(z.score - z.runs.reduce((a, r) => a + r.score, 0) / 4) < 1e-12 && z.crashed === 0 && /nominal/.test(T.describeEval(z)) && T.versus(z, z).same === 4);
}

console.log("\n4. THE SETS");
{
    const keys = (set) => set.map((x) => `${x.kind}:${x.seed}`), sets = { TRAIN_SET: T.TRAIN_SET, HELD_OUT_SET: T.HELD_OUT_SET, AUDIT_SET: T.AUDIT_SET, BASELINE_SET: T.BASELINE_SET };
    const names = Object.keys(sets); let overlap = 0; for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) { const b = new Set(keys(sets[names[j]])); overlap += keys(sets[names[i]]).filter((k) => b.has(k)).length; }
    ok("!! the four sets are pairwise DISJOINT by kind and seed (a trainer that sees TRAIN never sees the others), with no scenario twice in one set", overlap === 0 && names.every((n) => new Set(keys(sets[n])).size === sets[n].length), `overlap ${overlap}`);
    ok("the sets are the sizes the header says: TRAIN 40 (10 nominal, 20 recovery, 10 current), HELD_OUT 30, AUDIT 36, BASELINE 18; each is frozen", T.TRAIN_SET.length === 40 && T.HELD_OUT_SET.length === 30 && T.AUDIT_SET.length === 36 && T.BASELINE_SET.length === 18 && names.every((n) => Object.isFrozen(sets[n])) && T.TRAIN_SET.filter((x) => x.kind === "recovery").length === 20);
    const ev = (set) => T.evaluate(A.pilot(), set), tr = ev(T.TRAIN_SET), ho = ev(T.HELD_OUT_SET), bl = ev(T.BASELINE_SET);
    const pin = (r, v, tol = 5e-4) => Math.abs(r.score - v) <= tol && r.crashed === 0;
    ok("!! the AUTOPILOT's score is PINNED on TRAIN, HELD_OUT and BASELINE (and it ends none of the 88 dives early) -- it moves when the vessel, the task or the autopilot's laws move", pin(tr, -0.5741) && pin(ho, -0.4880) && pin(bl, -0.5146), `${tr.score.toFixed(4)} ${ho.score.toFixed(4)} ${bl.score.toFixed(4)}`);
    // AUDIT_SET is deliberately NOT evaluated here: it is for a champion, once.
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
