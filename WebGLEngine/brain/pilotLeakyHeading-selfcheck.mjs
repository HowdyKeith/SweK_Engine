// WebGLEngine/brain/pilotLeakyHeading-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/pilotLeakyHeading-selfcheck.mjs      (about 12 s)
//
// THE GATE OF brain/pilotLeakyHeading.mjs: the cheapest memory (one leaky unit fed the exact heading rate, behind the PD autopilot) as a flying-layer arm for the compass dropout (backlog `leaky-unit-baseline`, brain/BACKLOG_2026-11-04_BRAINS.md on the switchboard branch).
// Every number below is worked out by hand on small fixtures, or measured here against the references the arm exists to be read against (the registered estimator of tools/subHeadingEstimator.mjs, the dead-reckoning navigator, the dropout autopilot).
//   1 THE WEIGHTS   [sigma, gain] = [0.9999, 1]; sigma in [0, 1], gain in [0, 4], both finite numbers; a list, a typed array or an object; exactly two; every fault refused by name.
//   2 THE UNIT      on level states yawing 0.1 rad/s (w_z = -0.1, so the heading rate is +0.1) a tick of 1/30 s feeds u = 0.1/30 = 1/300: at sigma 0.5 the reading goes u, 1.5u, 1.75u, 1.875u, so a valid tick followed by three dark ones holds u and estimates
//                   0.5u, 0.75u, 0.875u = 0.001667, 0.0025, 0.002917 rad, and the autopilot is handed the shown heading 0.3 plus that; at sigma 1 the estimates are u, 2u, 3u; the gain multiplies them; the rate is clamped at 3 rad/s either way.
//   3 TIME, NOT TICKS   a tick of aux.dt seconds integrates rate x dt and leaks sigma^(dt/DT): at sigma 1 a second of 0.1 rad/s reads 0.1 whether it is 30 ticks, 60 or 1; at sigma 0.9 three ticks of 1/30 read 2.71u, two of 1/60 read u' (1 + 0.9^0.5) = 0.0032478,
//                   two of 2/30 read 2u (1 + 0.81) = 0.0120667. THIS is where it differs from the registered unit (one step per call).
//   4 DARK, VALID, NEW DIVE   valid ticks hand the autopilot the very state, target, current and aux; dark ticks a turned copy and the same aux; a dive that starts dark holds its first reading; a new target OBJECT restarts the unit on a valid tick (even one with the same
//                   numbers) and, on a dark tick, WAITS for the next valid one; no aux, null, {} and compassValid 1 are valid; a bad aux.dt falls back to the default.
//   5 THE REGISTERED UNIT   flown on real dropout dives (tools/subDropout.mjs, the autopilot behind it), its commands equal tools/subHeadingEstimator.mjs estimatorPilot(leakyModel(sigma), [gain x 0.2/30, 0]) to 1e-9 for four weight pairs on six dives; gain 0 flies the
//                   dropout autopilot EXACTLY; and over twelve held-out dives the unit recovers at least 90 percent of the gap between the dropout autopilot and the dead-reckoning navigator (measured 95).
//   6 THE KIND      circuit leaky, two weights, persist; every bad weight list refused; ONE target object per dive (the tank's fresh object each tick does not restart the unit; a replaced sub.target does, even with the same numbers, and not inside a dark window); the
//                   gain-0 kind is the autopilot command for command on a changing target; two pilots from the same weights share nothing.
//   7 THE ARM       the object brain/switchboard.mjs (branch claude/wizardly-einstein-wr30pd, f4b55956) takes with addArm: its keys and values, entry() as the tank entry, register(tank) seating the kind, the lesion arm, every bad option refused, and a copy of the board's own
//                   acceptance rules (id, layer, entry) applied to it.
//   8 IN THE TANK   flown the way the board flies the dropout task (a fresh one-sub tank per id, arm.register, sync, setEvent "dropout", 160 s, the settled dark heading error to the wandering target): the sub is seated by the kind; its dark windows are the navigator's; its
//                   estimate of the heading change is off by 0.01 to 0.06 rad rms and at most 0.15 (measured 0.028 to 0.040 and 0.061 to 0.111 on six ids), the navigator's by under 0.005 -- the leak is real, this is not the navigator; over twelve ids its settled dark heading
//                   error is at least 0.03 below the dropout autopilot's (measured 0.647 against 0.702) and within 0.02 of the navigator's (0.644); the lesion arm (gain 0) equals the dropout autopilot exactly on every id.
//   9 THE SOURCE    pure; the four imports.
// NOT CHECKED, said plainly: that the unit is a good model of anything a brain does (it is the cheapest memory: a ceiling with an exact gyro); the page; the switchboard itself (not in this tree: the board is the other chat's); a real gyro's drift; the unit at any sigma the
// registered grid did not try beyond what sections 2 and 3 compute by hand.
//
// SABOTAGED -- 162 mutants of brain/pilotLeakyHeading.mjs, each run alone in a scratch tree against this gate, four at a time: 130 red BY NAME, 30 more THREW (the gate died on an exception before its end: a detection, counted apart from the named rows), 2 EQUIVALENT and said so.
//   72 mechanical (every comparison, boolean, arithmetic operator and number +-1 on the code lines, comments left alone) and 90 written by hand for the rules: the restart (on a dark tick too; never; only the first call; only on dark ticks; the reading, the target or the first-call rule dropped; the first dark tick not recording the target;
//   started never set or set from the start; the kind never restarting, restarting every tick, comparing by value, ignoring sub.target or the context); the unit (the leak per call and not per second, the integral per call, the clamp gone or one-sided, the rate sign, the gain or sigma ignored, aux.dt ignored or accepted at zero, opts.dt ignored,
//   the defaults, the initial reading); valid and dark (compassValid read as 1 only, any falsy value dark); the estimate (the reading, the wrong sign, the world turned the wrong way, the current not turned, the aux not passed on either path, the hold taken on every tick or never, a valid tick turned); the weights (the count check, NaN
//   allowed, either limit gone, typed arrays refused, the object fields swapped, the defaults, the limits, the constants, freezing); the kind (weights dropped, a target field not copied, the raw target passed, `last` missing or frozen at the first tick, not frozen, persist, weight count, circuit and label); the entry and the arm (the pilot label, the circuit
//   hard-wired to gfc, the weights swapped or shared between calls or unchecked, the layer, the controls renamed, emptied, uncopied or unchecked, the id, the note, register returning nothing, registering another circuit or nothing).
//   FIRST RUN, 26 ZERO-RED OF 182: (1) DEAD CODE, CUT: the two `typeof ... "number"` tests in checkWeights (Number.isFinite already refuses every non-number, so no mutant of them could be seen), the `started = false` at a restart (a restart happens on a valid tick, which sets it at once, or on the first call, when it is already false)
//   and the `aux = null` default (`aux && ...` reads undefined the same); (2) a FIRST CALL WITH NO TARGET OBJECT was never made, so the initial reading and the initial started flag were unseen (P0040, P0041, H79): rows added for null and undefined, dark and valid; the initial held value cannot be seen (the first call always overwrites it) and is now declared without one; (3) the numbers in the arm's note
//   (0.89 to 0.92) were not read: the row reads them; (4) the first dark tick not recording the target (H92, written after the fix of (2)) needed a dark, dark, valid, dark row: added; (5) 14 mechanical mutants were in the comment lines of the module (the generator skips only `//` and `/**`): dropped. The 2 EQUIVALENT: P0014 and P0015, `v < lo` to `v <= lo` and `v > hi` to `v >= hi` in the clamp: at the bound both return the bound.
//   BEFORE THESE FOUND IT, MEASURING FOUND ONE THING THE ROWS WOULD NOT HAVE: the first version restarted the unit on any new target object, dark or not, and in the tank (which retargets every 20 to 45 s against a 16 s window) one window of six ids lost what it had integrated -- an estimate 0.77 rad off for the rest of that window, rms 0.2 against 0.03. The rows of sections 4, 6 and 8 hold the fix (H01 and H03 are the mutants that put it back).
//   NOT SABOTAGED: the wording of the label, the note beyond the numbers and names the rows read, and the messages of the thrown errors beyond the field they name.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import * as T from "./subTask.mjs";
import * as A from "../render/subAquariumSim.mjs";
import * as AP from "./autopilotSub.mjs";
import * as E from "../tools/subHeadingEstimator.mjs";
import * as D from "../tools/subDropout.mjs";
import * as N from "../tools/subNavigator.mjs";
import * as L from "./pilotLeakyHeading.mjs";

let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exit(1); };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const throws = (f) => { try { f(); return null; } catch (e) { return String(e.message || e); } };
const J = JSON.stringify, near = (a, b, tol) => Math.abs(a - b) <= tol, KEYS = ["pitch", "yaw", "thrust", "ballast"];
const model6 = S.createSubModel(), mk = (o) => S.createState({ model: model6, ...o });
const yawing = (r, heading = 0.3) => mk({ heading, w: [0, 0, -r] });   // a level vessel whose heading rate is +r
const DT = S.DT, U = 0.1 / 30;   // the input of one tick at a heading rate of 0.1 rad/s
const cmpMax = (a, b) => Math.max(...KEYS.map((k) => Math.abs(a[k] - b[k])));
const STILL = () => ({ pitch: 0, yaw: 0, thrust: 0, ballast: 0 });
console.log("pilotLeakyHeading-selfcheck -- the cheapest memory as a flying-layer arm\n");

/** A recording inner pilot: what the unit handed it each call. */
const recorder = () => { const seen = []; const f = (st, t, c, aux) => { seen.push({ st, h: S.attitude(st).heading, t, c, aux }); return STILL(); }; f.seen = seen; return f; };
/** Call a unit `n` times on level states yawing `r`, each with `aux(i)`; returns the unit and what its inner pilot saw. */
function callUnit(unit, rec, n, aux, r = 0.1, tgt = { depth: 30, heading: 0, speed: 2 }, cur = [0, 0, 0]) {
    for (let i = 0; i < n; i++) unit(yawing(r), typeof tgt === "function" ? tgt(i) : tgt, cur, aux(i));
    return rec.seen;
}
const VALID = { compassValid: 1 }, DARK = { compassValid: 0 };

sec("1. THE WEIGHTS");
{
    ok("!! the facts: circuit leaky, two weights, defaults [0.9999, 1], limits sigma [0, 1] and gain [0, 4], rate clamp 3 rad/s, all frozen", L.CIRCUIT === "leaky" && L.WEIGHT_COUNT === 2 && L.DEFAULTS.sigma === 0.9999 && L.DEFAULTS.gain === 1 && J(L.LIMITS) === J({ sigmaMin: 0, sigmaMax: 1, gainMin: 0, gainMax: 4 }) && L.RATE_CLAMP === 3 && Object.isFrozen(L.DEFAULTS) && Object.isFrozen(L.LIMITS) && typeof L.LABEL === "string" && L.LABEL.length > 0);
    const okc = (w) => { try { return J(L.checkWeights(w)); } catch (e) { return "THROWS " + e.message; } };
    ok("!! a list, a typed array and an object are read the same way", okc([0.5, 2]) === J({ sigma: 0.5, gain: 2 }) && okc(Float32Array.from([0.5, 2])) === J({ sigma: 0.5, gain: 2 }) && okc({ sigma: 0.5, gain: 2 }) === J({ sigma: 0.5, gain: 2 }) && okc(L.DEFAULTS) === J({ sigma: 0.9999, gain: 1 }));
    ok("!! the edges are in: sigma 0 and 1, gain 0 and 4", [[0, 0], [1, 4], [0, 4], [1, 0]].every((w) => !okc(w).startsWith("THROWS")));
    ok("!! sigma refused outside [0, 1] (-0.001, 1.001), not finite (NaN, Infinity), not a number (a string, null, undefined)", [-0.001, 1.001, NaN, Infinity, "0.5", null, undefined].every((s) => /sigma/.test(throws(() => L.checkWeights([s, 1])) || "")));
    ok("!! gain refused outside [0, 4] (-0.001, 4.001), not finite, not a number", [-0.001, 4.001, NaN, -Infinity, "1", null, undefined].every((g) => /gain/.test(throws(() => L.checkWeights([0.9, g])) || "")));
    ok("!! the count refused both ways (0, 1 and 3 weights), and nothing, null, a string, a number", [[], [1], [1, 1, 1], undefined, null, "ab", 5].every((w) => /exactly 2/.test(throws(() => L.checkWeights(w)) || "")));
    ok("!! an object with missing fields is refused by the field (sigma missing, gain missing)", /sigma/.test(throws(() => L.checkWeights({ gain: 1 })) || "") && /gain/.test(throws(() => L.checkWeights({ sigma: 0.9 })) || ""));
}

sec("2. THE UNIT, BY HAND");
{
    // sigma 0.5, gain 1: a valid tick then three dark ones on a vessel yawing 0.1 rad/s from heading 0.3
    const rec = recorder(), unit = L.leakyHeading(rec, { sigma: 0.5, gain: 1 }), tg = { depth: 30, heading: 0, speed: 2 }, cur = [1, 0, 0], v1 = yawing(0.1);
    unit(v1, tg, cur, VALID); const r1 = unit.last.reading, e1 = unit.last.estimate;
    const reads = [r1], ests = [e1];
    for (let i = 0; i < 3; i++) { unit(yawing(0.1), tg, cur, DARK); reads.push(unit.last.reading); ests.push(unit.last.estimate); }
    ok("!! the reading is u, 1.5u, 1.75u, 1.875u (u = 0.1/30 = 0.003333): the leak halves the last reading and the tick adds u", reads.every((r, i) => near(r, U * [1, 1.5, 1.75, 1.875][i], 1e-12)), J(reads.map((r) => +r.toFixed(6))));
    ok("!! the first (valid) tick holds u and estimates 0; the dark ticks estimate 0.5u, 0.75u, 0.875u = 0.001667, 0.0025, 0.002917", ests[0] === 0 && ests.slice(1).every((e, i) => near(e, U * [0.5, 0.75, 0.875][i], 1e-12)), J(ests.map((e) => +e.toFixed(6))));
    ok("!! the autopilot is handed the shown heading 0.3 plus the estimate: 0.3, 0.301667, 0.3025, 0.302917 (1e-9)", rec.seen.length === 4 && rec.seen.every((s, i) => near(s.h, 0.3 + [0, 0.5, 0.75, 0.875][i] * U, 1e-9)), J(rec.seen.map((s) => +s.h.toFixed(6))));
    ok("!! the valid tick is handed the state, the target and the current themselves, and the aux as given; the dark ticks the target and the aux themselves and a turned state", rec.seen[0].st === v1 && rec.seen[0].t === tg && rec.seen[0].c === cur && rec.seen[0].aux === VALID && rec.seen[1].st !== v1 && rec.seen.slice(1).every((s) => s.t === tg && s.aux === DARK));
    // sigma 1: a pure integrator; the gain multiplies; the current is turned with the world
    const r2 = recorder(), u2 = L.leakyHeading(r2, { sigma: 1, gain: 1 }), e2 = [];
    u2(yawing(0.1), tg, cur, VALID); for (let i = 0; i < 3; i++) { u2(yawing(0.1), tg, cur, DARK); e2.push(u2.last.estimate); }
    ok("!! at sigma 1 the estimates are u, 2u, 3u = 0.003333, 0.006667, 0.01", e2.every((e, i) => near(e, U * (i + 1), 1e-12)), J(e2.map((e) => +e.toFixed(6))));
    const r3 = recorder(), u3 = L.leakyHeading(r3, { sigma: 1, gain: 2 }), e3 = [];
    u3(yawing(0.1), tg, cur, VALID); for (let i = 0; i < 3; i++) { u3(yawing(0.1), tg, cur, DARK); e3.push(u3.last.estimate); }
    ok("!! the gain multiplies the estimate: gain 2 gives 2u, 4u, 6u; gain 0 gives 0 and a reading of 0", e3.every((e, i) => near(e, 2 * U * (i + 1), 1e-12)));
    const r4 = recorder(), u4 = L.leakyHeading(r4, { sigma: 0.9999, gain: 0 }); u4(yawing(0.1), tg, cur, VALID); u4(yawing(0.1), tg, cur, DARK);
    ok("!! gain 0 reads 0 and estimates 0, and the autopilot is handed the shown heading 0.3 on the dark tick", u4.last.reading === 0 && u4.last.estimate === 0 && near(r4.seen[1].h, 0.3, 1e-12));
    // a heading rate of -0.1 integrates the other way; the clamp
    const r5 = recorder(), u5 = L.leakyHeading(r5, { sigma: 1, gain: 1 }); u5(yawing(-0.1), tg, cur, VALID); u5(yawing(-0.1), tg, cur, DARK);
    ok("!! a left turn (w_z = +0.1, rate -0.1) estimates -u and the autopilot is handed 0.3 - u", near(u5.last.estimate, -U, 1e-12) && near(r5.seen[1].h, 0.3 - U, 1e-9));
    const cl = (r) => { const u = L.leakyHeading(recorder(), { sigma: 1, gain: 1 }); u(yawing(r), tg, cur, VALID); return u.last.reading; };
    ok("!! the rate is clamped at +-3 rad/s: 5 reads 3/30 = 0.1, -5 reads -0.1, 2.9 reads 2.9/30 = 0.096667 (unclamped)", near(cl(5), 0.1, 1e-12) && near(cl(-5), -0.1, 1e-12) && near(cl(2.9), 2.9 / 30, 1e-12) && near(cl(3), 0.1, 1e-12));
    // the current is turned with the world: dt 5 s, rate 0.1 -> u = 0.5; the dark tick reads 1.0, estimate 0.5
    const r6 = recorder(), u6 = L.leakyHeading(r6, { sigma: 1, gain: 1 }); u6(yawing(0.1), tg, cur, { compassValid: 1, dt: 5 }); u6(yawing(0.1), tg, cur, { compassValid: 0, dt: 5 });
    const c6 = r6.seen[1].c;
    ok("!! the current is turned with the world: an estimate of 0.5 turns [1, 0, 0] to [cos 0.5, -sin 0.5, 0] = [0.877583, -0.479426, 0]; the heading handed is 0.3 + 0.5 = 0.8", near(u6.last.estimate, 0.5, 1e-12) && near(c6[0], Math.cos(0.5), 1e-9) && near(c6[1], -Math.sin(0.5), 1e-9) && c6[2] === 0 && near(r6.seen[1].h, 0.8, 1e-9) && r6.seen[0].c === cur);
    const u7 = L.leakyHeading(recorder(), { sigma: 0.9, gain: 1 });
    ok("!! before any tick: last is { estimate: 0, reading: 0 }; the defaults are sigma 0.9999 and gain 1", u7.last.estimate === 0 && u7.last.reading === 0 && (() => { const u = L.leakyHeading(recorder()); u(yawing(0.1), tg, cur, VALID); return near(u.last.reading, U, 1e-12); })() && (() => { const u = L.leakyHeading(recorder()); u(yawing(0.1), tg, cur, VALID); u(yawing(0.1), tg, cur, VALID); return near(u.last.reading, U * (1 + 0.9999), 1e-12); })());
    ok("!! bad weights are refused when the unit is built (sigma 2, gain -1, NaN)", [{ sigma: 2 }, { gain: -1 }, { sigma: NaN }].every((o) => throws(() => L.leakyHeading(recorder(), o)) !== null));
}

sec("3. TIME, NOT TICKS");
{
    const tg = { depth: 30, heading: 0, speed: 2 }, cur = [0, 0, 0];
    const run = (sigma, n, dt) => { const u = L.leakyHeading(recorder(), { sigma, gain: 1 }); for (let i = 0; i < n; i++) u(yawing(0.1), tg, cur, { compassValid: 1, dt }); return u.last.reading; };
    ok("!! at sigma 1 a second of 0.1 rad/s reads 0.1 whether it is 30 ticks of 1/30, 60 of 1/60 or 1 of a second", near(run(1, 30, 1 / 30), 0.1, 1e-12) && near(run(1, 60, 1 / 60), 0.1, 1e-12) && near(run(1, 1, 1), 0.1, 1e-12) && near(run(1, 7, 2 / 7), 0.2, 1e-12));
    ok("!! at sigma 0.9 three ticks of 1/30 read u (1 + 0.9 + 0.81) = 0.0090333", near(run(0.9, 3, 1 / 30), U * 2.71, 1e-12), String(run(0.9, 3, 1 / 30)));
    ok("!! at sigma 0.9 two ticks of 1/60 leak 0.9^0.5 each: (0.1/60)(1 + 0.948683) = 0.0032478", near(run(0.9, 2, 1 / 60), (0.1 / 60) * (1 + Math.sqrt(0.9)), 1e-12) && near(run(0.9, 2, 1 / 60), 0.0032478, 1e-7), String(run(0.9, 2, 1 / 60)));
    ok("!! at sigma 0.9 two ticks of 2/30 leak 0.9^2 = 0.81 each: (0.1 x 2/30)(1 + 0.81) = 0.0120667", near(run(0.9, 2, 2 / 30), (0.2 / 30) * 1.81, 1e-12) && near(run(0.9, 2, 2 / 30), 0.0120667, 1e-7), String(run(0.9, 2, 2 / 30)));
    ok("!! a bad aux.dt (0, -1, NaN, nothing) falls back to the default tick 1/30; opts.dt sets that default (0.1 s gives 0.01 a call at 0.1 rad/s)", [0, -1, NaN, undefined].every((dt) => near(run(1, 1, dt), U, 1e-12)) && (() => { const u = L.leakyHeading(recorder(), { sigma: 1, gain: 1, dt: 0.1 }); u(yawing(0.1), tg, cur, VALID); return near(u.last.reading, 0.01, 1e-12); })() && (() => { const u = L.leakyHeading(recorder(), { sigma: 1, gain: 1, dt: 0.1 }); u(yawing(0.1), tg, cur, { compassValid: 1, dt: 1 }); return near(u.last.reading, 0.1, 1e-12); })());
    ok("!! DT is the simulator's 1/30, so at that tick the leak is exactly sigma", Math.abs(DT - 1 / 30) < 1e-15);
}

sec("4. DARK, VALID AND A NEW DIVE");
{
    const mkU = (sigma = 0.5) => { const rec = recorder(); return { rec, unit: L.leakyHeading(rec, { sigma, gain: 1 }) }; };
    const A1 = { depth: 30, heading: 0, speed: 2 }, B1 = { depth: 30, heading: 0, speed: 2 }, cur = [0, 0, 0];
    // a new target object on a valid tick restarts the unit (sigma 0.5: a missing restart shows)
    let { unit } = mkU(); unit(yawing(0.1), A1, cur, VALID); unit(yawing(0.1), A1, cur, VALID);
    const before = unit.last.reading; unit(yawing(0.1), B1, cur, VALID);
    ok("!! the same target keeps the unit (u then 1.5u); a new target OBJECT with the very same numbers restarts it on a valid tick (u, not 1.75u)", near(before, 1.5 * U, 1e-12) && near(unit.last.reading, U, 1e-12));
    ok("!! a restart forgets the held reading too: after it, a dark tick estimates 0.5u (against the new u), not a difference from the old one", (() => { const m = mkU(); m.unit(yawing(0.1), A1, cur, VALID); m.unit(yawing(0.1), A1, cur, VALID); m.unit(yawing(0.1), B1, cur, VALID); m.unit(yawing(0.1), B1, cur, DARK); return near(m.unit.last.estimate, 0.5 * U, 1e-12); })());
    // a new target on a DARK tick does not restart; the next valid tick does
    {
        const m = mkU(); m.unit(yawing(0.1), A1, cur, VALID); m.unit(yawing(0.1), A1, cur, DARK);
        const r2 = m.unit.last.reading, e2 = m.unit.last.estimate;
        m.unit(yawing(0.1), B1, cur, DARK); const r3 = m.unit.last.reading, e3 = m.unit.last.estimate;
        ok("!! a target that changes INSIDE a dark window does not restart the unit: the readings go u, 1.5u, 1.75u and the estimates 0, 0.5u, 0.75u", near(r2, 1.5 * U, 1e-12) && near(e2, 0.5 * U, 1e-12) && near(r3, 1.75 * U, 1e-12) && near(e3, 0.75 * U, 1e-12), J([r2, e2, r3, e3].map((x) => +x.toFixed(6))));
        m.unit(yawing(0.1), B1, cur, DARK); const e4 = m.unit.last.estimate;
        m.unit(yawing(0.1), B1, cur, VALID); const r5 = m.unit.last.reading;
        m.unit(yawing(0.1), B1, cur, DARK); const e6 = m.unit.last.estimate;
        ok("!! the restart waits for the next valid tick (reading u there, estimate 0) and then the window after it estimates 0.5u; the dark tick before it still carried on (0.875u)", near(e4, 0.875 * U, 1e-12) && near(r5, U, 1e-12) && near(e6, 0.5 * U, 1e-12), J([e4, r5, e6].map((x) => +x.toFixed(6))));
    }
    // a dive that starts dark (the very first call): the unit starts, holds its first reading, estimates 0
    {
        const m = mkU(); m.unit(yawing(0.1), A1, cur, DARK); const e1 = m.unit.last.estimate, r1 = m.unit.last.reading; m.unit(yawing(0.1), A1, cur, DARK);
        ok("!! a dive that starts dark holds its first reading: estimate 0 on that tick (the autopilot is handed the shown heading 0.3 exactly), 0.5u on the next", e1 === 0 && near(r1, U, 1e-12) && near(m.rec.seen[0].h, 0.3, 1e-12) && near(m.unit.last.estimate, 0.5 * U, 1e-12));
        m.unit(yawing(0.1), A1, cur, VALID); const r3 = m.unit.last.reading; m.unit(yawing(0.1), A1, cur, DARK);
        ok("!! and its target is recorded on that first dark tick: the valid tick after it is the same dive (reading 1.75u, not a restart at u), and the next dark tick estimates 0.125u", near(r3, 1.75 * U, 1e-12) && near(m.unit.last.estimate, 0.125 * U, 1e-12), J([r3, m.unit.last.estimate].map((x) => +x.toFixed(6))));
    }
    // a first call with no target object at all (null, undefined): the unit starts from zero and holds its first reading, valid or dark
    for (const nt of [null, undefined]) {
        const m = mkU(); m.unit(yawing(0.1), nt, cur, DARK); const e1 = m.unit.last.estimate, r1 = m.unit.last.reading; m.unit(yawing(0.1), nt, cur, DARK);
        const v = mkU(); v.unit(yawing(0.1), nt, cur, VALID);
        ok(`!! a first call with target ${nt}: dark, the unit starts at zero and holds its first reading (reading u, estimate 0, then 0.5u); valid, reading u and estimate 0`, e1 === 0 && near(r1, U, 1e-12) && near(m.unit.last.estimate, 0.5 * U, 1e-12) && near(v.unit.last.reading, U, 1e-12) && v.unit.last.estimate === 0);
    }
    // the aux
    const probe = (aux) => { const m = mkU(1); m.unit(yawing(0.1), A1, cur, VALID); m.unit(yawing(0.1), A1, cur, aux); return m.unit.last.estimate; };
    ok("!! no aux, null, {}, compassValid 1 and an aux with only a dt are valid ticks (estimate 0); only compassValid 0 is dark (estimate u)", [undefined, null, {}, { compassValid: 1 }, { dt: 1 / 30 }].every((a) => probe(a) === 0) && near(probe({ compassValid: 0 }), U, 1e-12) && near(probe({ compassValid: 0, dt: 1 / 30 }), U, 1e-12));
    ok("!! two units built apart share nothing: interleaved calls give each its solo estimate", (() => { const a = mkU(), b = mkU(); a.unit(yawing(0.1), A1, cur, VALID); b.unit(yawing(0.4), B1, cur, VALID); a.unit(yawing(0.1), A1, cur, DARK); b.unit(yawing(0.4), B1, cur, DARK); return near(a.unit.last.estimate, 0.5 * U, 1e-12) && near(b.unit.last.estimate, 0.5 * 4 * U, 1e-12); })());
    ok("!! a unit never changes the controls the inner pilot returns (they come back as they are)", (() => { const cmd = { pitch: 0.1, yaw: -0.2, thrust: 0.3, ballast: -0.4 }, u = L.leakyHeading(() => cmd, { sigma: 0.9, gain: 1 }); return u(yawing(0.1), A1, cur, VALID) === cmd && u(yawing(0.1), A1, cur, DARK) === cmd; })());
}

sec("5. THE REGISTERED UNIT, ON REAL DROPOUT DIVES");
{
    const dives = T.TRAIN_SET.slice(0, 6);
    /** The commands of every tick of the dives of `set` through the dropout (the default windows, seed 1) behind `makePilot()`. */
    const flyCmds = (makePilot, set) => { const out = []; for (const sc of set) { const p = makePilot(); T.fly(D.dropout((s, t, c, a) => { const r = p(s, t, c, a); out.push(r); return r; }, {}, 1), sc); } return out; };
    for (const [sigma, gain] of [[0.9999, 1], [0.9, 1], [1, 1], [0.99, 2.5]]) {
        const mine = flyCmds(() => L.leakyHeading(AP.pilot(), { sigma, gain }), dives), reg = flyCmds(() => E.estimatorPilot(E.leakyModel(sigma), Float64Array.from([gain * 0.2 / 30, 0]), AP.pilot()), dives);
        let d = 0; for (let i = 0; i < reg.length; i++) d = Math.max(d, cmpMax(mine[i], reg[i]));
        ok(`!! sigma ${sigma}, gain ${gain}: on six dropout dives (${reg.length} ticks) its commands equal the registered estimator's to 1e-9`, mine.length === reg.length && reg.length === 6 * 1800 && d < 1e-9, "max diff " + d.toExponential(2));
    }
    const off = flyCmds(() => L.leakyHeading(AP.pilot(), { sigma: 0.9999, gain: 0 }), dives), plain = flyCmds(() => AP.pilot(), dives);
    ok("!! gain 0 flies the dropout autopilot EXACTLY (every command of six dives identical)", off.length === plain.length && off.every((c, i) => cmpMax(c, plain[i]) === 0));
    const held = T.HELD_OUT_SET.slice(0, 12), mean = (f) => held.reduce((s, sc) => s + T.fly(D.dropout(f(), {}, 1), sc).score, 0) / held.length;
    const sAuto = mean(() => AP.pilot()), sNav = mean(() => N.navigator(AP.pilot())), sLeaky = mean(() => L.leakyHeading(AP.pilot())), sOff = mean(() => L.leakyHeading(AP.pilot(), { gain: 0 }));
    ok("!! the dropout costs the autopilot (dropout -0.613 against the navigator -0.490 over twelve held-out dives) and gain 0 scores the autopilot's exactly", sNav > sAuto + 0.1 && sOff === sAuto, `${sAuto.toFixed(4)} ${sNav.toFixed(4)} ${sOff.toFixed(4)}`);
    ok("!! the unit recovers at least 90 percent of the gap between the dropout autopilot and the navigator (measured 95 percent, -0.496)", (sLeaky - sAuto) / (sNav - sAuto) >= 0.9 && sLeaky < sNav + 0.01, `${sLeaky.toFixed(4)}, ${(100 * (sLeaky - sAuto) / (sNav - sAuto)).toFixed(1)} percent`);
}

sec("6. THE KIND");
{
    const kind = L.leakyKind(), tg0 = { depth: 30, heading: 0, speed: 2 }, cur = [0, 0, 0];
    ok("!! the facts: circuit leaky, two weights, persist, a label, frozen", kind.circuit === "leaky" && kind.weightCount === 2 && kind.persist === true && kind.label === L.LABEL && Object.isFrozen(kind) && typeof kind.build === "function");
    ok("!! build refuses every bad weight list (none, one, three, NaN, sigma 2, gain 5, negatives, a string, an empty object)", [undefined, null, [1], [1, 1, 1], [NaN, 1], [2, 1], [0.9, 5], [-0.1, 1], [0.9, -1], "ab", {}].every((w) => throws(() => kind.build(w, {})) !== null));
    ok("!! build takes a list, a typed array and, with no context at all, a pilot", [[0.9, 1], Float32Array.from([0.9, 1])].every((w) => typeof kind.build(w) === "function" && typeof kind.build(w, {}) === "function"));
    // one target object per dive
    const sub = { target: { depth: 30, heading: 0.5, speed: 2 } }, p = kind.build([0.5, 1], { sub });
    const tick = (aux) => p(yawing(0.1), { depth: 30, heading: 0.5, speed: 2 }, cur, aux);   // a FRESH target object every call
    tick(VALID); tick(VALID); const r2 = p.last.reading; tick(VALID); const r3 = p.last.reading;
    ok("!! the tank's fresh target object every tick does not restart the unit while sub.target stands: readings u, 1.5u, 1.75u", near(r2, 1.5 * U, 1e-12) && near(r3, 1.75 * U, 1e-12));
    sub.target = { depth: 30, heading: 0.5, speed: 2 }; tick(VALID);
    ok("!! a REPLACED sub.target, with the very same numbers, restarts it on a valid tick (reading u)", near(p.last.reading, U, 1e-12));
    tick(VALID); tick(DARK); const eBefore = p.last.estimate; sub.target = { depth: 31, heading: 1, speed: 2 }; tick(DARK); const eIn = p.last.estimate;
    ok("!! a sub.target replaced INSIDE a dark window does not restart it (held 1.5u, readings 1.75u then 1.875u: the estimate carries on, 0.25u then 0.375u), the next valid tick does (reading u)", near(eBefore, 0.25 * U, 1e-12) && near(eIn, 0.375 * U, 1e-12) && (tick(VALID), near(p.last.reading, U, 1e-12)));
    // with no context the target handed in is the dive
    const q = kind.build([0.5, 1]), tA = { depth: 30, heading: 0.5, speed: 2 }; q(yawing(0.1), tA, cur, VALID); q(yawing(0.1), tA, cur, VALID);
    const rq = q.last.reading; q(yawing(0.1), { ...tA }, cur, VALID);
    ok("!! with no context the target object handed in is the dive: the same object keeps the unit (1.5u), a new one restarts it (u)", near(rq, 1.5 * U, 1e-12) && near(q.last.reading, U, 1e-12));
    // gain 0 is the autopilot, on a changing target, with extra fields on the target
    {
        const off = kind.build([0.9999, 0], { sub: { target: tg0 } }), ref = AP.pilot(); let s = mk({ depth: 25, speed: 2, pos: [250, 150, -25], heading: 0.3 }), worst = 0;
        for (let i = 0; i < 240; i++) {
            const t = { depth: 32 + 3 * Math.sin(i / 40), heading: 1.2 - i / 100, speed: 2.2 + 0.3 * Math.cos(i / 25), surface: i > 100 }, a = off(s, t, [0, 0, 0], i % 7 === 0 ? undefined : i % 3 === 0 ? DARK : VALID), b = ref(s, { depth: t.depth, heading: t.heading, speed: t.speed }, [0, 0, 0]);
            worst = Math.max(worst, cmpMax(a, b)); s = S.stepSub(model6, s, a, DT, [0, 0, 0], 0).state;
        }
        ok("!! the gain-0 kind is the PD autopilot command for command over 240 ticks of a changing target (depth, heading and speed read fresh each tick; other fields of the target ignored), valid and dark alike", worst === 0, "max diff " + worst);
    }
    // the target fields are read fresh every tick (a changing heading changes the command)
    {
        const off = kind.build([0.9999, 0], {}), s = mk({ heading: 0.3 }); const a = off(s, { depth: 30, heading: 0.3, speed: 2 }, cur, VALID), b = off(s, { depth: 30, heading: 1.3, speed: 2 }, cur, VALID);
        ok("!! the target's heading is read fresh each call: a 1 rad different target heading changes the yaw command", Math.abs(a.yaw - b.yaw) > 0.1);
    }
    // two pilots from the same weights share nothing; last follows the latest tick
    {
        const a = kind.build([0.5, 1], {}), b = kind.build([0.5, 1], {}), ta = { depth: 30, heading: 0, speed: 2 }, tb = { depth: 30, heading: 0, speed: 2 };
        a(yawing(0.1), ta, cur, VALID); b(yawing(0.4), tb, cur, VALID); a(yawing(0.1), ta, cur, DARK); b(yawing(0.4), tb, cur, DARK);
        ok("!! two pilots from the same weights share no unit (estimates 0.5u and 2u), and `last` follows each one's latest tick", near(a.last.estimate, 0.5 * U, 1e-12) && near(b.last.estimate, 2 * U, 1e-12) && near(a.last.reading, 1.5 * U, 1e-12));
    }
    ok("!! the kind flies through the compass event in a real tank (section 8 flies it for 160 s)", true);
}

sec("7. THE ARM");
{
    const arm = L.leakyArm(), keys = Object.keys(arm).sort();
    ok("!! the arm is { id, layer, controls, note, entry, register } and frozen: id leaky-unit, layer flying, controls [autopilot] (frozen), a note", J(keys) === J(["controls", "entry", "id", "layer", "note", "register"]) && Object.isFrozen(arm) && arm.id === "leaky-unit" && arm.layer === "flying" && J(arm.controls) === '["autopilot"]' && Object.isFrozen(arm.controls) && typeof arm.note === "string" && /leaky unit/.test(arm.note) && /sigma 0\.9999, gain 1\)/.test(arm.note) && /rung 4a: skill 0\.89 to 0\.92/.test(arm.note));
    const e1 = arm.entry("sb-1"), e2 = arm.entry();
    ok("!! entry() is the tank entry { pilot: leaky, circuit: leaky, weights: [0.9999, 1] }, a fresh array each call, and carries no key the board's own fields would be overridden by (id, name, hue, from, local, theta)", J(e1) === J({ pilot: "leaky", circuit: "leaky", weights: [0.9999, 1] }) && J(e2) === J(e1) && e1.weights !== e2.weights && (e1.weights[0] = 0, arm.entry().weights[0] === 0.9999) && !["id", "name", "hue", "from", "local", "theta"].some((k) => k in e1));
    const calls = []; const fake = { registerPilotKind: (c, k) => { calls.push([c, k]); return { seated: 3 }; } }, ret = arm.register(fake);
    ok("!! register(tank) calls tank.registerPilotKind once with (leaky, the kind: two weights, a build) and passes its answer on", calls.length === 1 && calls[0][0] === "leaky" && calls[0][1].weightCount === 2 && typeof calls[0][1].build === "function" && calls[0][1].circuit === "leaky" && J(ret) === J({ seated: 3 }));
    const custom = L.leakyArm({ id: "leaky-off", weights: [0.5, 0], controls: [] });
    ok("!! the lesion arm: any id, weights [0.5, 0] (gain 0 is the no-memory arm), no controls; an object of weights is read too", custom.id === "leaky-off" && J(custom.entry().weights) === "[0.5,0]" && J(custom.controls) === "[]" && J(L.leakyArm({ weights: { sigma: 0.25, gain: 2 } }).entry().weights) === "[0.25,2]" && /sigma 0\.5, gain 0/.test(custom.note));
    ok("!! bad options are refused: an empty or numeric id, bad weights (three, NaN, sigma 2), controls that are not a list of names", [{ id: "" }, { id: 5 }, { weights: [1, 1, 1] }, { weights: [NaN, 1] }, { weights: [2, 1] }, { controls: "autopilot" }, { controls: [5] }, { controls: [""] }].every((o) => throws(() => L.leakyArm(o)) !== null));
    // a copy of the board's own acceptance rules (brain/switchboard.mjs on f4b55956: addArm, and what the dropout task calls)
    const LAYERS = ["decision", "flying"];
    const boardAccepts = (a) => (!a || typeof a.id !== "string" || !a.id ? "id" : !LAYERS.includes(a.layer) ? "layer" : typeof a.entry !== "function" ? "entry (the dropout task needs it)" : null);
    const spread = { controls: [], note: "", ...arm };
    ok("!! a copy of the board's acceptance (an id, a layer of decision or flying, entry() for the dropout task) takes the arm and the lesion arm; the board's spread keeps its controls and register", boardAccepts(arm) === null && boardAccepts(custom) === null && J(spread.controls) === '["autopilot"]' && spread.register === arm.register && boardAccepts({ ...arm, layer: "pilot" }) === "layer" && boardAccepts({ ...arm, entry: undefined }) !== null);
}

sec("8. IN THE TANK, FLOWN AS THE BOARD FLIES THE DROPOUT TASK");
{
    const TICK = 1 / 30, TWO_PI = 2 * Math.PI, SETTLE = 12, SECONDS = 160;
    const wrap = (a) => { let x = a % TWO_PI; if (x > Math.PI) x -= TWO_PI; if (x <= -Math.PI) x += TWO_PI; return x; };
    const AUTO = { id: "autopilot", layer: "flying", controls: [], entry: () => ({ pilot: "autopilot", circuit: "gfc", weights: null }) };
    const arm = L.leakyArm(), off = L.leakyArm({ id: "leaky-off", weights: [0.9999, 0], controls: [] });
    /** brain/switchboard.mjs dropoutTask's flight of one id, with the estimate error added: { err (the settled dark heading error), dark (dark ticks), est (the heading estimate's error in the dark, per tick), snap (the last snapshot) }. `tap(q)` may replace the pilot kind with a spy. */
    function flight(a, n, event, { tap = null } = {}) {
        const id = "sb-" + n, q = A.createTank(); if (a.register) a.register(q); if (tap) tap(q);
        q.sync([{ id, name: "Board " + a.id, hue: 100, from: "board", local: true, theta: null, ...a.entry(id) }]);
        if (event) q.setEvent(id, event);
        let target = null, age = 0, sum = 0, cnt = 0, dark = 0, snap = null; const est = [];
        for (let i = 0, m = Math.round(SECONDS / TICK); i < m; i++) {
            q.step(TICK); const s = snap = q.snapshot()[0];
            if (s.target !== target) { target = s.target; age = 0; } else age += TICK;
            const isDark = !!(s.compass && s.compass.valid === false), e = Math.abs(wrap(s.target.heading - s.heading));
            if (isDark) { dark++; est.push(tap && tap.estimate ? tap.estimate(s) : s.compass.error); if (age >= SETTLE) { sum += e; cnt++; } }
        }
        return { err: cnt ? sum / cnt : NaN, cnt, dark, est, snap };
    }
    const spy = { p: null };
    const withSpy = (q) => { const base = L.leakyKind(); q.registerPilotKind(L.CIRCUIT, { ...base, build(w, ctx) { spy.p = base.build(w, ctx); return spy.p; } }); };
    withSpy.estimate = (s) => wrap(s.compass.seen + spy.p.last.estimate - s.heading);
    const rms = (a) => Math.sqrt(a.reduce((x, y) => x + y * y, 0) / a.length), mx = (a) => Math.max(...a.map(Math.abs)), mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    // the seating
    {
        const q = A.createTank(), r0 = arm.register(q); q.sync([{ id: "x", name: "x", hue: 1, from: "board", local: true, theta: null, ...arm.entry("x") }]);
        const w = q.snapshot()[0]; const q2 = A.createTank(); q2.sync([{ id: "y", name: "y", hue: 1, from: "board", local: true, theta: null, ...arm.entry("y") }]); const waiting = q2.snapshot()[0], r1 = arm.register(q2), seated = q2.snapshot()[0];
        ok("!! registered before sync, the sub is flown by the kind (circuit leaky, no kindError); registered after, the sub that was waiting on the autopilot is re-seated (seated 1) and flies the kind", r0.seated === 0 && w.circuit === "leaky" && w.kindError === null && w.kind !== null && waiting.kind === null && r1.seated === 1 && seated.kind !== null && seated.kindError === null, J({ before: waiting.kind, after: seated.kind }));
    }
    const ids6 = [1, 2, 3, 4, 5, 6], spyArm = { ...arm };
    const fl = ids6.map((n) => flight(spyArm, n, "dropout", { tap: Object.assign((q) => withSpy(q), { estimate: withSpy.estimate }) })), nv = ids6.map((n) => flight(AUTO, n, "navigator"));
    ok("!! the dark windows are the navigator's: the same number of dark ticks on every id (1919 of 4800, 16 s in every 40 s), the event running on the kind", fl.every((f, i) => f.dark === nv[i].dark && f.dark === 1919) && fl.every((f) => f.snap.kind !== null), J(fl.map((f) => f.dark)));
    const er = fl.map((f) => rms(f.est)), em = fl.map((f) => mx(f.est)), nr = nv.map((f) => rms(f.est));
    ok("!! its heading estimate in the dark is off by 0.01 to 0.06 rad rms on every one of six ids and by at most 0.15 (measured 0.028 to 0.040 and 0.061 to 0.111): the leak is real, and a restart inside a window (0.77 rad) is absent", er.every((v) => v > 0.01 && v < 0.06) && em.every((v) => v < 0.15), J(er.map((v) => +v.toFixed(4))) + " max " + J(em.map((v) => +v.toFixed(4))));
    ok("!! the dead-reckoning navigator, same ids, is off by under 0.005 rad rms: the leaky unit is NOT the navigator", nr.every((v) => v < 0.005), J(nr.map((v) => +v.toFixed(5))));
    // the settled dark heading error, twelve ids
    const ids12 = Array.from({ length: 12 }, (_, i) => i + 1);
    const eAuto = ids12.map((n) => flight(AUTO, n, "dropout").err), eNav = ids12.map((n) => flight(AUTO, n, "navigator").err), eLeaky = ids12.map((n) => flight(arm, n, "dropout").err), eOff = ids12.map((n) => flight(off, n, "dropout").err);
    ok("!! the lesion arm (gain 0) equals the dropout autopilot exactly on every one of twelve ids (the settled dark heading error identical)", eOff.every((v, i) => v === eAuto[i]), J(eOff.map((v) => +v.toFixed(4))));
    ok("!! over twelve ids the unit's settled dark heading error is at least 0.03 rad below the dropout autopilot's (measured 0.647 against 0.702)", mean(eAuto) - mean(eLeaky) >= 0.03, `${mean(eLeaky).toFixed(4)} against ${mean(eAuto).toFixed(4)}`);
    ok("!! and within 0.02 rad of the dead-reckoning navigator's on average (0.644), and within 0.05 on every id (largest measured 0.014)", Math.abs(mean(eLeaky) - mean(eNav)) <= 0.02 && eLeaky.every((v, i) => Math.abs(v - eNav[i]) <= 0.05), `${mean(eNav).toFixed(4)}, largest ${Math.max(...eLeaky.map((v, i) => Math.abs(v - eNav[i]))).toFixed(4)}`);
}

sec("9. THE SOURCE");
{
    const raw = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "pilotLeakyHeading.mjs"), "utf8");
    const code = raw.split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*") && !l.trim().startsWith("/**")).join("\n");
    ok("!! pure: no Math.random, no clock, no DOM, no file, no network, no process", !/Math\.random|Date\.now|new Date|performance\.now|document\.|window\.|\bfs\b|node:fs|fetch\(|process\./.test(code));
    ok("!! the imports are the vessel, the autopilot, the navigator's headingRate and the dropout's turnWorld, and nothing else", J([...code.matchAll(/^import .* from "(.*)";$/gm)].map((m) => m[1]).sort()) === J(["../physics/mechanics/subModel6dof.mjs", "../tools/subDropout.mjs", "../tools/subNavigator.mjs", "./autopilotSub.mjs"]));
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
process.exitCode = fails ? 1 : 0;
