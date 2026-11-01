// WebGLEngine/tools/subDropout-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/subDropout-selfcheck.mjs      (~4 s)
//
// THE GATE OF tools/subDropout.mjs: a compass that stops reporting, around any pilot. Every number is worked out by hand.
//   WINDOWS (defaults: 2 windows of 16 s between 5 s and 59 s of a 60 s dive, 30 ticks a second): len 480 ticks, lo 150, hi 1770, slot (1770 - 150) / 2 = 810, slack 810 - 480 = 330.
//     a generator that always says 0       -> starts 150 and 960          (ends 630 and 1440)
//     a generator that always says 0.5     -> starts 150 + 165 = 315 and 150 + 810 + 165 = 1125     (ends 795 and 1605)
//     a generator that always says 0.999999 -> starts floor(150 + 329.9997) = 479 and floor(960 + 329.9997) = 1289   (ends 959 and 1769, the last tick being 1769 < hi 1770)
//   THE ROTATED WORLD: a vessel at heading 0 doing 2 m/s along its nose in a current of (0.3, 0.1, 0), shown 0.5 rad further round: heading 0.5; velocity (2 cos 0.5, -2 sin 0.5, 0) = (1.7551651, -0.9588511, 0);
//     current (0.3 cos 0.5 + 0.1 sin 0.5, -0.3 sin 0.5 + 0.1 cos 0.5, 0) = (0.3112173, -0.0560694, 0); pitch, bank, depth, speed through the water, angle of attack and sideslip exactly as they were.
//   THE TASK: the autopilot alone loses 0.0130 / 0.0248 / 0.0451 / 0.0842 of its clean -0.5741 on the 40 training dives with windows of 10 / 12 / 14 / 16 s; 16 s is the first at or above the 0.05 floor of the rule.
//
// SABOTAGED -- 44 mutants of tools/subDropout.mjs, each applied in a scratch tree and run alone against this gate, every one red by a row that names it:
//   windows D01 one span for all windows | D02 a window that does not fit accepted | D03 the last second not kept clear | D04 the start ignores startAfter | D05 the start never drawn | D06 every window starts in the first slot |
//   D07 a window 15 ticks a second long | D08 a fractional number of windows | D09 a negative number of windows | D10 a window of no length | D11 a start before any valid tick | D12 the draw uses the slot, not the slack
//   the rotated world D13 turned the wrong way | D14 the quaternion on the wrong side | D15 velocity not turned | D16 velocity turned the other way | D17 current not turned | D18 current turned the other way |
//   D19 a whole angle, not a half | D20 the body rates turned too | D21 the position turned too
//   the wrapper D22 a new dive not recognised | D23 every dive the same windows | D24 the seed ignored | D25 the tick does not advance | D26 the tick one ahead | D27 a window one tick too long | D28 a window one tick late |
//   D29 the held heading never updated | D30 the true state shown in the dark | D31 the true current shown in the dark | D32 told valid in the dark | D33 told dark in the light | D34 not told at all | D35 the log forgets the flags |
//   D36 the flags the wrong way | D37-D41 the defaults (three windows, 14 s, 4 s, a 50 s dive, 25 ticks a second) | D42 the defaults mutable | D43 the heading read from the wrong axis | D44 the generator changed
// TWO WENT 0 OR NAMELESS RED THE FIRST TIME AND WERE FIXED IN THE GATE. D21 (the position turned with the rest) because the fixture sat at the origin, where turning north and east changes nothing: the vessel now sits at (10, 5, -30). D34 (the
// pilot not told at all) was red only as "section ran to the end" (reading `.compassValid` of nothing): the row now names it. Dead code the thinking about mutants exposed was CUT before the sabotage ran: a guard for zero windows (a loop of no turns
// already returns nothing), a heading wrap before the turn (a turn and the same turn plus a full circle are the same rotation) and a branch for a first dark tick (the refusal of a start before any valid tick makes it impossible).
// NOT TRIED: passing the current to S.attitude when the heading is read (equivalent: the heading is the nose's, and does not depend on the water).
//
"use strict";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import * as A from "../brain/autopilotSub.mjs";
import * as T from "../brain/subTask.mjs";
import * as D from "./subDropout.mjs";

let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished, which is a failure of whatever it was asking: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exit(1); };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const throws = (f) => { try { f(); return null; } catch (e) { return String(e.message || e); } };
const guarded = (name, f) => { try { f(); } catch (e) { ok(`${name} ran to the end`, false, "THREW " + String((e && e.message) || e).slice(0, 220)); } };
const J = (v) => JSON.stringify(v), near = (a, b, tol) => Math.abs(a - b) <= tol;
console.log("subDropout-selfcheck -- a compass that stops reporting\n");

sec("1. the windows");
guarded("section 1", () => {
    ok("the defaults: 2 windows of 16 s, from 5 s, in a 60 s dive, at 30 ticks a second; frozen", D.DEFAULTS.windows === 2 && D.DEFAULTS.seconds === 16 && D.DEFAULTS.startAfter === 5 && D.DEFAULTS.totalSeconds === 60 && D.TICKS_PER_SECOND === 30 && Object.isFrozen(D.DEFAULTS));
    const at = (v) => D.windowsOf(() => v);
    ok("a generator that says 0 puts the windows at the start of their slots: [150, 630) and [960, 1440)", J(at(0)) === "[[150,630],[960,1440]]", J(at(0)));
    ok("a generator that says 0.5 puts them in the middle of their slack: [315, 795) and [1125, 1605)", J(at(0.5)) === "[[315,795],[1125,1605]]", J(at(0.5)));
    ok("a generator that says 0.999999 puts them at the end of their slack: [479, 959) and [1289, 1769): the last dark tick is 1768, before the last second", J(at(0.999999)) === "[[479,959],[1289,1769]]", J(at(0.999999)));
    ok("one window of 16 s has the whole span for a slot: [150, 630) at 0 and [150 + 1140, ...) at 0.999999: floor(150 + 0.999999 x (1620 - 480)) = 1289", J(D.windowsOf(() => 0, { windows: 1 })) === "[[150,630]]" && J(D.windowsOf(() => 0.999999, { windows: 1 })) === "[[1289,1769]]", J(D.windowsOf(() => 0.999999, { windows: 1 })));
    ok("three windows of 10 s: slot 540, len 300; at 0 the starts are 150, 690, 1230", J(D.windowsOf(() => 0, { windows: 3, seconds: 10 })) === "[[150,450],[690,990],[1230,1530]]");
    ok("no windows is no windows", J(D.windowsOf(() => 0.5, { windows: 0 })) === "[]");
    ok("another start and another total move the span: startAfter 10, a 40 s dive, one window of 5 s at 0 is [300, 450)", J(D.windowsOf(() => 0, { windows: 1, seconds: 5, startAfter: 10, totalSeconds: 40 })) === "[[300,450]]");
    let s = 3; const rng = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296, ws = Array.from({ length: 200 }, () => D.windowsOf(rng));
    ok("200 random draws: always two windows, each 480 ticks, ordered, disjoint, from tick 150, ending by tick 1770, and not all the same", ws.every((w) => w.length === 2 && w.every(([a, b]) => b - a === 480 && a >= 150 && b <= 1770) && w[0][1] <= w[1][0]) && new Set(ws.map(J)).size > 150);
    const bad = (o) => throws(() => D.windowsOf(() => 0, o));
    const rows = [["windows that do not fit (3 of 20 s)", { windows: 3, seconds: 20 }, /3 windows of 20 s do not fit between 5 s and 59 s/], ["a negative number of windows", { windows: -1 }, /windows must be a whole number of 0 or more, got -1/], ["a fractional number of windows", { windows: 1.5 }, /got 1\.5/],
        ["a window of 0 s", { seconds: 0 }, /seconds must be above 0, got 0/], ["a window of -3 s", { seconds: -3 }, /got -3/], ["no valid tick before the first window", { startAfter: 0 }, /startAfter must leave at least one valid tick/], ["a window that fills its slot exactly is fine (2 x 27 s): no error", { seconds: 27 }, null]];
    for (const [what, o, re] of rows) { const e = bad(o); ok(re ? `windowsOf refuses ${what} by name` : `windowsOf accepts ${what.replace(" is fine", "")}`, re ? (e !== null && /^subDropout\.windowsOf: /.test(e) && re.test(e)) : e === null, e || ""); }
});

sec("2. the rotated world");
guarded("section 2", () => {
    const st = S.createState({ pos: [10, 5, -30], speed: 2, heading: 0, pitch: 0.1, bank: 0.05 }), cur = [0.3, 0.1, 0], a0 = S.attitude(st, cur), keep = JSON.stringify({ q: st.q, vel: st.vel, w: st.w, pos: st.pos });
    const r = D.turnWorld(st, cur, 0.5), a1 = S.attitude(r.state, r.current);
    ok("shown 0.5 rad further round, the heading reads 0.5 (to 1e-9) -- the original read " + a0.heading.toFixed(6), near(a1.heading, a0.heading + 0.5, 1e-9));
    ok("and the body-frame truth is untouched: pitch, bank, depth, speed through the water, angle of attack, sideslip, climb and path angle are as before (1e-9)", ["pitch", "bank", "depth", "speed", "alpha", "beta", "climb", "gamma"].every((k) => near(a1[k], a0[k], 1e-9)), J(["pitch", "bank", "depth", "speed", "alpha", "beta"].map((k) => +(a1[k] - a0[k]).toExponential(1))));
    ok("the body rates, the position (north and east as well as depth: a heading sensor does not move the vessel) and the mass are not touched; the input state and current are not mutated", J(r.state.w) === J(st.w) && J(r.state.pos) === J(st.pos) && r.state.mass === st.mass && keep === JSON.stringify({ q: st.q, vel: st.vel, w: st.w, pos: st.pos }) && J(cur) === "[0.3,0.1,0]");
    const lvl = S.createState({ depth: 30, speed: 2, heading: 0, model: null }), r2 = D.turnWorld(lvl, [0.3, 0.1, 0], 0.5);
    ok("worked by hand on a level vessel at heading 0, 2 m/s: velocity (1.7551651, -0.9588511, 0) and current (0.3112173, -0.0560694, 0)", near(r2.state.vel[0], 1.7551651238, 1e-6) && near(r2.state.vel[1], -0.9588510772, 1e-6) && near(r2.state.vel[2], 0, 1e-9) && near(r2.current[0], 0.3112173224, 1e-6) && near(r2.current[1], -0.0560694054, 1e-6) && r2.current[2] === 0, J(r2.state.vel) + " " + J(r2.current));
    const neg = S.attitude(D.turnWorld(lvl, [0, 0, 0], -0.7).state);
    ok("a negative difference turns the other way (heading -0.7), a difference of zero changes nothing, a full turn changes nothing (1e-9), and a vertical velocity component is kept", near(neg.heading, -0.7, 1e-9) && near(S.attitude(D.turnWorld(lvl, [0, 0, 0], 0).state).heading, 0, 1e-12) && near(S.attitude(D.turnWorld(lvl, [0, 0, 0], 2 * Math.PI).state).heading, 0, 1e-9) && D.turnWorld(st, cur, 0.5).state.vel[2] === st.vel[2]);
    const big = S.attitude(D.turnWorld(st, cur, 3).state, D.turnWorld(st, cur, 3).current);
    ok("a turn of 3 rad (past a half turn) is read back as heading 3 - 2 pi + ... modulo 2 pi, and the water-relative quantities still hold", near(Math.atan2(Math.sin(big.heading - a0.heading), Math.cos(big.heading - a0.heading)), 3, 1e-9) && near(big.beta, a0.beta, 1e-9) && near(big.speed, a0.speed, 1e-9));
});

sec("3. the wrapper, on a real dive");
guarded("section 3", () => {
    const sc = T.TRAIN_SET.find((d) => d.kind === "recovery") || T.TRAIN_SET[0], inner = [], truth = [], AP = A.pilot();
    const spy = (st, tgt, cur, aux) => { inner.push({ st, cur, aux, a: S.attitude(st, cur), w: st.w }); return AP(st, tgt, cur); };
    const w = D.dropout(spy, {}, 1), outer = (st, tgt, cur) => { truth.push({ st, a: S.attitude(st, cur) }); return w(st, tgt, cur); };
    const res = T.fly(outer, sc), wins = w.log.windows, n = inner.length;
    ok("the dive ran its 1800 ticks (60 s at 30) and the wrapper logged every one; two windows of 480 dark ticks: 960 dark, 840 valid", res.ticks === 1800 && n === 1800 && w.log.valid.length === 1800 && w.log.valid.filter((v) => v === 0).length === 960 && w.log.valid.filter((v) => v === 1).length === 840, `${res.ticks} ticks, ${w.log.valid.filter((v) => v === 0).length} dark`);
    ok("the dark ticks are exactly the windows' (the logged flags are 0 for tick i iff i is in a window), and the pilot was TOLD: its 4th argument's compassValid is the flag, tick by tick", w.log.valid.every((v, i) => (v === 0) === wins.some(([a, b]) => i >= a && i < b)) && inner.every((x, i) => x.aux && x.aux.compassValid === w.log.valid[i]));
    ok("outside the windows the pilot is handed the TRUE state and current untouched (the same objects)", inner.every((x, i) => w.log.valid[i] === 0 || (x.st === truth[i].st)));
    const [a0] = wins[0];
    ok("inside a window the heading it is shown is the heading at the last valid tick before it (to 1e-9), for every dark tick", inner.slice(a0, wins[0][1]).every((x) => near(x.a.heading, inner[a0 - 1].a.heading, 1e-9)) && inner.slice(wins[1][0], wins[1][1]).every((x) => near(x.a.heading, inner[wins[1][0] - 1].a.heading, 1e-9)));
    ok("and that heading is STALE: by the end of a window the true heading has moved away from it by more than 0.01 rad in at least one window of this dive", [0, 1].some((q) => Math.abs(Math.atan2(Math.sin(truth[wins[q][1] - 1].a.heading - inner[wins[q][1] - 1].a.heading), Math.cos(truth[wins[q][1] - 1].a.heading - inner[wins[q][1] - 1].a.heading))) > 0.01));
    const dark = inner.map((x, i) => [x, i]).filter(([, i]) => w.log.valid[i] === 0);
    ok("inside the windows everything else it is shown is TRUE: pitch, bank, depth, speed through the water, angle of attack, sideslip, climb (1e-9) and the body rates (the same array)", dark.every(([x, i]) => ["pitch", "bank", "depth", "speed", "alpha", "beta", "climb"].every((k) => near(x.a[k], truth[i].a[k], 1e-9)) && x.w === truth[i].st.w));
    const log1 = J(w.log.windows), w2 = D.dropout(spy, {}, 1); T.fly(w2, sc);
    ok("the same wrapper on the same dive gives the same windows (repeatable); a different seed gives other windows", J(w2.log.windows) === log1 && J((() => { const w3 = D.dropout(spy, {}, 2); T.fly(w3, sc); return w3.log.windows; })()) !== log1);
    const w4 = D.dropout(AP, {}, 1), sc2 = T.TRAIN_SET[1]; T.fly(w4, sc); const first = J(w4.log.windows); T.fly(w4, sc2); const second = J(w4.log.windows);
    ok("a new dive (a new target object) starts afresh with its own windows: the second dive's windows are drawn again from the generator, 840 valid ticks again, and differ from the first dive's", second !== first && w4.log.valid.length === 1800 && w4.log.valid.filter((v) => v === 1).length === 840);
    const spy0 = []; const w0 = D.dropout((st, tgt, cur, aux) => { spy0.push([st, aux]); return AP(st, tgt, cur); }, { windows: 0 }, 1), tr0 = []; T.fly((st, tgt, cur) => { tr0.push(st); return w0(st, tgt, cur); }, sc);
    ok("windows: 0 is the pilot told 'valid' every tick and shown the true state every tick", spy0.length === 1800 && spy0.every(([st, aux], i) => aux.compassValid === 1 && st === tr0[i]));
    const cont = D.dropout(AP, {}, 1); const tgt = sc.target; cont(S.createState({}), tgt, [0, 0, 0]); cont(S.createState({}), tgt, [0, 0, 0]);
    ok("the same target object continues the same dive (two calls: two ticks logged); the tick count restarts only on a new target", cont.log.valid.length === 2 && (() => { cont(S.createState({}), { ...tgt }, [0, 0, 0]); return cont.log.valid.length === 1; })());
});

sec("4. the task, on the autopilot alone (the rule written before any circuit was trained)");
guarded("section 4", () => {
    const clean = T.evaluate(A.pilot(), T.TRAIN_SET).score, cost = (seconds) => clean - T.evaluate(D.dropout(A.pilot(), { seconds }), T.TRAIN_SET).score;
    ok("the autopilot's clean score on the 40 training dives is -0.5741", near(clean, -0.5741, 5e-5), clean.toFixed(4));
    const c = [10, 12, 14, 16].map(cost);
    ok("the cost of the dropout to the autopilot with windows of 10 / 12 / 14 / 16 s is 0.0130 / 0.0248 / 0.0451 / 0.0842 (to 5e-4)", [0.0130, 0.0248, 0.0451, 0.0842].every((v, i) => near(c[i], v, 5e-4)), c.map((v) => v.toFixed(4)).join(" / "));
    ok("so the rule -- lengthen from 12 s in 2 s steps until the cost is at least 0.05 -- stops at 16 s, which is the default, and 14 s is below the floor", c[1] < 0.05 && c[2] < 0.05 && c[3] >= 0.05 && D.DEFAULTS.seconds === 16);
    const res = T.evaluate(D.dropout(A.pilot()), T.TRAIN_SET);
    ok("with the default task no training dive is ended early, and every kind of dive costs the autopilot something (nominal -0.602, recovery -0.689, current -0.654 to 5e-3)", res.crashed === 0 && near(res.byKind.nominal, -0.602, 5e-3) && near(res.byKind.recovery, -0.689, 5e-3) && near(res.byKind.current, -0.654, 5e-3), J(res.byKind));
});

sec("5. NOT CHECKED");
console.log("  NOT CHECKED  that a stale heading in a rotated world is what a failed compass looks like to a real pilot: a real failure drifts, jumps and comes back wrong; this is the simplest honest version");
console.log("  NOT CHECKED  that a pilot with memory can recover the lost ground: the task only has to cost the autopilot something (it does), the experiment is whether any circuit's wiring does better");

finished = true;
console.log(fails ? `\nsubDropout-selfcheck: ${fails} FAILED` : "\nsubDropout-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
