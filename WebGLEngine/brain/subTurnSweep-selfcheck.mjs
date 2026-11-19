// WebGLEngine/brain/subTurnSweep-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/subTurnSweep-selfcheck.mjs      (a few seconds)
//
// THE GATE OF brain/subTurnSweep.mjs (FOLLOW-UP 7 of brain/SUB_FIELD_NAV_WIP.md, registered before the module):
//   1 THE TABLE    measured from the model: 0 to 180 degrees every 5, the diagnosis's numbers (90-degree advance 25-40 m, 180-degree transfer 40-55 m), frozen, made once.
//   2 THE SWEEP    sweepPoints mirrors and rotates the table as the field's headings point ((cos h, -sin h)), and a REAL turn of the model from another heading and the other
//                  way ends where the prediction says (within 3 m).
//   3 INSIDE       the margin is HULL_HALF + 3 + SWEEP_PAD = 17 m from every edge, exactly 17 counting as inside.
//   4 DECIDE       a small error is left alone; the short way inside is left alone; the short way out and the long way in forces the long way; both out is left alone.
//   5 THE PILOT    the latch: a forced turn is held 90 degrees ahead in its direction without re-deciding, until the target is within 90 degrees, then the target passes through.
//   6 THE FLIGHT   the sweep-off arms are subGiveWay's flight exactly; an unknown arm throws; the record carries the sweep's counts; a sweep-on arm on a diagnosed seed is changed.
//   7 THE SOURCE   no clock, no Math.random.
// NOT CHECKED, said plainly: that the clean turn's table is the turn the vessel makes while the plan moves or when it starts the turn below cruise (SWEEP_PAD is a fixed, unfitted
// allowance for that; the diagnosis's claim that the traced turns were slower was a time-scale error, corrected in the note).
// SABOTAGE LOG (2026-11-17; 14 mutants of brain/subTurnSweep.mjs, each alone, restored byte-identical; "study" is tools/ship/subTurnSweepStudy-selfcheck.mjs):
//   T1 the rotation's x term sign (2 red), T2 the mirror dropped (8, study 1), T3 the 180 cap removed (0: EQUIVALENT -- the table ends at 180, so the cap cannot change a point),
//   T4 SWEEP_PAD dropped from the margin (2), T5 exactly 17 m counted out (1), T6 exactly 90 degrees counted as a reversal (1), T7 the long way forced without checking it (2),
//   T8 the short way never checked (3), T9 the latch never released (2), T10 the latch re-decided every tick (2), T11 the forced heading the wrong way (3),
//   T12 the table measured with a 180-degree command instead of the lead it is used with (0 red FIRST: both turn alike to 90 and the bounds were loose at 180; the real-turn row
//   was extended to every 5 degrees through 180 at 1 m, then 1), T13 the sweep-off arms flown with a shorter cap (0 red FIRST at 200 s: no compared flight ran that long, because
//   the tick is 1/30 s; a 110 s flight was added to the copy row and the mutant re-run at 100 s: 2, study 1), T14 ref+sweep with the sweep off (1).
"use strict";
import fs from "node:fs";
import * as W from "./subTurnSweep.mjs";
import * as G from "./subGiveWay.mjs";
import * as N from "./subFieldNav.mjs";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import * as AP from "./autopilotSub.mjs";
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const near = (a, b, t = 1e-9) => Math.abs(a - b) <= t;
const J = JSON.stringify, RAD = Math.PI / 180;
console.log("subTurnSweep-selfcheck -- a turn that checks its own sweep\n");

sec("1. THE TABLE");
const tb = W.turnTable();
{
    ok("!! 37 entries, 0 to 180 degrees every 5, starting at the turn's own start (0, 0), frozen, and the same object on a second call (measured once)", tb.length === 37 && tb.every((p, i) => p.deg === 5 * i) && tb[0].dx === 0 && tb[0].dy === 0 && Object.isFrozen(tb) && Object.isFrozen(tb[5]) && W.turnTable() === tb);
    const a90 = tb[18], t180 = tb[36];
    ok("!! the diagnosis's numbers: the 90-degree advance is 25 to 40 m and the 180-degree transfer 40 to 55 m (measured 31.6 and 47.5), toward -y for a turn toward +heading (a heading h points along (cos h, -sin h))", a90.dx >= 25 && a90.dx <= 40 && t180.dy <= -40 && t180.dy >= -55, `${a90.dx.toFixed(1)} ${t180.dy.toFixed(1)}`);
    ok("  the registered constants: trigger 90, lead 90, step 5, pad 10 m, inside 3 m, the table at 20 m depth after 30 s straight; HELD79 is 7601-7660; the designated arm is ref+free+giveway+sweep",
        W.TRIGGER_DEG === 90 && W.LEAD_DEG === 90 && W.TABLE_STEP_DEG === 5 && W.SWEEP_PAD === 10 && W.INSIDE === 3 && W.TABLE_DEPTH === 20 && W.SETTLE_S === 30 && W.HELD79.length === 60 && W.HELD79[0] === 7601 && W.HELD79[59] === 7660 && W.DESIGNATED === "ref+free+giveway+sweep"
        && J(W.ARMS) === J({ ref: { base: "ref", sweep: false }, "ref+sweep": { base: "ref", sweep: true }, "ref+free+giveway": { base: "ref+free+giveway", sweep: false }, "ref+free+giveway+sweep": { base: "ref+free+giveway", sweep: true } }));
}

sec("2. THE SWEEP");
{
    const p = W.sweepPoints(10, 20, 0, 1, 90), q = W.sweepPoints(10, 20, 0, -1, 90);
    ok("!! at heading 0 the table is the displacement as measured (d = +1) and mirrored in y (d = -1); points run to the angle asked (90 -> 19 points)", p.length === 19 && near(p[18][0], 10 + tb[18].dx) && near(p[18][1], 20 + tb[18].dy) && near(q[18][0], 10 + tb[18].dx) && near(q[18][1], 20 - tb[18].dy));
    const r = W.sweepPoints(0, 0, Math.PI / 2, 1, 45);
    ok("!! rotated to heading pi/2 the first steps point along (cos h, -sin h) = (0, -1): forward is -y", near(r[9][0], -tb[9].dy * -1 * 0 + tb[9].dx * 0 + tb[9].dy * 1, 1e-9) && near(r[9][1], -tb[9].dx, 1e-9), J(r[9]));
    ok("  the angle is capped at 180 (a 300-degree long way predicts the first 180)", W.sweepPoints(0, 0, 0, 1, 300).length === 37);
    // a real turn: from heading 1.0 rad, the other way (d = -1), through 90 degrees, led as the sweep leads it
    const m = S.createSubModel(Object.freeze({ ...S.EXPLORER, seabed: 1000 })), cv = [0, 0, 0], h0 = 1.0;
    let s = S.createState({ pos: [100, 50, -20], speed: N.CRUISE, heading: h0, pitch: 0, bank: 0, gamma: 0, w: [0, 0, 0], model: m });
    for (let i = 0; i < 300; i++) s = S.stepSub(m, s, AP.decide(s, { heading: h0, depth: 20, speed: N.CRUISE }, cv), S.DT, cv, 0).state;
    const x0 = s.pos[0], y0 = s.pos[1], hs = S.attitude(s).heading; let turned = 0, prev = hs;
    // through the whole 180 degrees, every 5 degrees against the prediction (the table's command is this one: the target led 90 degrees ahead)
    const realPts = [[s.pos[0], s.pos[1]]];
    while (turned > -180 * RAD) { const h = S.attitude(s).heading; s = S.stepSub(m, s, AP.decide(s, { heading: h - 90 * RAD, depth: 20, speed: N.CRUISE }, cv), S.DT, cv, 0).state; const h2 = S.attitude(s).heading; turned += W.wrap(h2 - prev); prev = h2; while (realPts.length <= 36 && -turned >= realPts.length * 5 * RAD) realPts.push([s.pos[0], s.pos[1]]); }
    const pred = W.sweepPoints(x0, y0, hs, -1, 180), misses = pred.map((q, i) => Math.hypot(q[0] - realPts[i][0], q[1] - realPts[i][1])), worst = Math.max(...misses);
    ok("!! a REAL turn of the model from heading 1.0 the other way (d = -1), led 90 degrees ahead, passes within 1 m of every predicted point through 180 degrees (the rotation, the mirror and the table's command are the simulator's)", pred.length === 37 && realPts.length === 37 && worst < 1, `worst ${worst.toFixed(3)} m`);
}

sec("3. INSIDE");
{
    const R = N.REGION, m = W.MARGIN_IN;
    ok("!! the margin is HULL_HALF + 3 + 10 = 17 m; a point exactly 17 m from an edge is inside, 16.99 is not, on each of the four edges", m === N.HULL_HALF + 13 && m === 17 &&
        W.inside([[R.x0 + 17, 0]]) && !W.inside([[R.x0 + 16.99, 0]]) && W.inside([[R.x1 - 17, 0]]) && !W.inside([[R.x1 - 16.99, 0]]) && W.inside([[200, R.y0 + 17]]) && !W.inside([[200, R.y0 + 16.99]]) && W.inside([[200, R.y1 - 17]]) && !W.inside([[200, R.y1 - 16.99]]));
}

sec("4. DECIDE");
{
    const R = N.REGION;
    ok("!! an error of 90 degrees or less is left alone (exactly 90: small)", W.decide(200, 0, 0, 90 * RAD).dir === 0 && W.decide(200, 0, 0, 90 * RAD).why === "small" && W.decide(200, 0, 0, -45 * RAD).why === "small");
    ok("!! in the middle of the region a reversal goes the short way (nothing forced)", W.decide(200, 0, 0, 170 * RAD).dir === 0 && W.decide(200, 0, 0, 170 * RAD).why === "short way inside");
    // the traced case (7503: heading 51, 51 m from the y0 edge): 50 m from the edge, heading 45 degrees (toward -y and +x), target +170 from the heading. The short way (+1) turns
    // through heading 90 (straight at the edge) and its advance carries the vessel out; the long way (-1, through heading 0) turns away. Head-on (heading 90) at 50 m both ways
    // are mirror images and fit (advance 32 + 17 < 50), so nothing is forced there.
    const y = R.y0 + 50, h45 = Math.PI / 4, dS = W.decide(200, y, h45, 170 * RAD), short = W.sweepPoints(200, y, h45, 1, 170), long = W.sweepPoints(200, y, h45, -1, 190);
    ok("!! the traced case: 50 m from the edge on heading 45, a reversal whose short way is out and long way in is FORCED the long way (dir -1), and the two predictions say so", dS.dir === -1 && dS.why === "long way" && !W.inside(short) && W.inside(long), J(dS));
    ok("!! the mirror case: 50 m from the y1 edge on heading -45 (toward +y), a target at -170 is forced the other long way (dir +1)", W.decide(200, R.y1 - 50, -Math.PI / 4, -170 * RAD).dir === 1);
    ok("  head-on at 50 m nothing is forced (the two ways are mirror images and fit); 40 m head-on is both out", W.decide(200, y, Math.PI / 2, 170 * RAD).dir === 0 && W.decide(200, R.y0 + 40, Math.PI / 2, 170 * RAD).why === "both out");
    const tight = W.decide(R.x0 + 20, R.y0 + 20, Math.PI * 0.75, 175 * RAD);
    ok("!! in a corner where both ways leave, nothing is forced (both out)", tight.dir === 0 && tight.why === "both out", J(tight));
}

sec("5. THE PILOT");
{
    const m = S.createSubModel(Object.freeze({ ...S.EXPLORER, seabed: 1000 })), R = N.REGION;
    const st = (x, y, h) => S.createState({ pos: [x, y, -20], speed: N.CRUISE, heading: h, pitch: 0, bank: 0, gamma: 0, w: [0, 0, 0], model: m });
    const seen = [], base = (s, t) => { seen.push(t.heading); return "cmd"; }, sp = W.sweepPilot(base), h = Math.PI / 4, near0 = st(200, R.y0 + 50, h), tgt = { heading: h + 170 * RAD, depth: 20, speed: 3 };
    const ha = S.attitude(near0).heading;
    sp.pilot(near0, tgt, [0, 0, 0]);
    ok("!! a reversal near the edge whose short way is out: the base is given the heading 90 degrees ahead the LONG way (heading - 90), one turn forced, one tick overridden", near(seen[0], ha - 90 * RAD) && sp.stats.forced === 1 && sp.stats.overridden === 1, `${(seen[0] / RAD).toFixed(1)}`);
    const mid = st(200, 0, 0); sp.pilot(mid, { heading: 170 * RAD, depth: 20, speed: 3 }, [0, 0, 0]);
    ok("!! LATCHED: a later tick whose short way would be inside still turns the forced way (no new decision, no new forced turn)", near(seen[1], S.attitude(mid).heading - 90 * RAD) && sp.stats.forced === 1 && sp.stats.overridden === 2);
    sp.pilot(mid, { heading: 60 * RAD, depth: 20, speed: 3 }, [0, 0, 0]);
    ok("!! released once the target is within 90 degrees: the target passes through untouched", near(seen[2], 60 * RAD) && sp.stats.overridden === 2);
    const sp2 = W.sweepPilot(base); sp2.pilot(mid, { heading: 170 * RAD, depth: 20, speed: 3 }, [0, 0, 0]);
    ok("  in the middle nothing is forced and the target passes through", near(seen[3], 170 * RAD) && sp2.stats.forced === 0 && sp2.stats.overridden === 0);
}

sec("6. THE FLIGHT");
{
    const pilot = (s, t, c) => AP.decide(s, t, c), sc = W.scenarioOf(1), a = W.flySweep(sc, "ref+free+giveway"), b = G.flyGiveWay(pilot, sc, "ref+free+giveway");
    const sc3 = W.scenarioOf(7503), a3 = W.flySweep(sc3, "ref+free+giveway"), b3 = G.flyGiveWay(pilot, sc3, "ref+free+giveway");
    ok("!! with the sweep off the flight is subGiveWay's, record for record, plus arm, sweepTicks 0 and sweepTurns 0 (DEV seed 1, and HELD78's 7503 under ref+free+giveway, which flies past 200 s before it leaves)", J({ ...a, arm: undefined, sweepTicks: undefined, sweepTurns: undefined }) === J({ ...b, arm: undefined }) && a.arm === "ref+free+giveway" && a.sweepTicks === 0 && a.sweepTurns === 0 && J({ ...a3, arm: undefined, sweepTicks: undefined, sweepTurns: undefined }) === J({ ...b3, arm: undefined }) && b3.ticks > 2000, `${b3.status} at tick ${b3.ticks}`);
    let thrown = ""; try { W.flySweep(sc, "ref+nope"); } catch (e) { thrown = e.message; }
    ok("!! an unknown arm throws by name", /unknown arm "ref\+nope"/.test(thrown), thrown);
    const sc2 = W.scenarioOf(7503), off = W.flySweep(sc2, "ref+free+giveway"), on = W.flySweep(sc2, "ref+free+giveway+sweep");
    ok("!! on a diagnosed seed (7503, post hoc) the sweep forces a turn and changes the flight: the exit becomes an arrival", off.status === "left" && on.sweepTurns >= 1 && on.sweepTicks > 0 && on.status === "reached", `${off.status} -> ${on.status}, ${on.sweepTurns} turn(s)`);
}

sec("7. THE SOURCE");
{
    const code = fs.readFileSync(new URL("./subTurnSweep.mjs", import.meta.url), "utf8").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    ok("!! no Math.random and no clock", !/Math\.random|Date\.now|new Date|performance\.now/.test(code));
}

sec("8. THE NAMED CONSTANTS");
{
    ok("  ARM_NAMES is the four arms in registration order (ref, ref+sweep, ref+free+giveway, ref+free+giveway+sweep), frozen, and holds DESIGNATED", J(W.ARM_NAMES) === J(["ref", "ref+sweep", "ref+free+giveway", "ref+free+giveway+sweep"]) && J(W.ARM_NAMES) === J(Object.keys(W.ARMS)) && Object.isFrozen(W.ARM_NAMES) && W.ARM_NAMES.includes(W.DESIGNATED));
    ok("  KIND is hard-traffic, and scenarioOf flies that kind: DEV seed 1 is a scenario of KIND, with ships in it", W.KIND === "hard-traffic" && W.DEV[0] === 1 && W.scenarioOf(1).obstacles.some((o) => o.type === "ship") && W.scenarioOf(1).kind === W.KIND);
    ok("  TABLE_MAX_S is 200 s, more than the 30 s settle, and the measured table reached 180 degrees inside it (turnTable did not throw; 37 entries)", W.TABLE_MAX_S === 200 && W.TABLE_MAX_S > W.SETTLE_S && tb.length === 37 && tb[36].deg === 180);
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exitCode = fails ? 1 : 0;
