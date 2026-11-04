// WebGLEngine/tools/roundhouse/orientationStep-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/roundhouse/orientationStep-selfcheck.mjs      (~1 s)
//
// THE GATE OF THE ORIENTATION-STEP ROUND (physics/mechanics/ORIENTATION_STEP_WIP.md, registered before any code): the step's new option, the
// duel's three, and the library that flies the round. It never runs the registered round or its command: it flies C-unchanged's anchors and
// C-key, which the registration fixed exactly, and a miniature on seeds and steps the registration does not use.
//   1  rigidBody6dof.step(): given no option, byte for byte what it was (the registration's 1,000 steps, hashed); "rk4" changes the orientation
//      and nothing else; an unknown option refused; Q4 fourth order and Q0 first, on a body and steps the round does not fly; C-key
//   2  the duel: given none of its three new options, the ten anchor duels' fingerprints; `orientation` reaches every step; `nudge` moves A's
//      start and nothing else; `record` replays to A's own end, to the bit; the duel's tick is the library's
//   3  the library holds the registration: the five pilots and their hashes (the page fight's own list), the seeds and their freshness, the
//      steps, the nudge, the reference, the sign test and the reading, the outcome, the angle
//   4  the command: refuses an existing results file, writes it once, and prints no reading
//   5  a miniature on other seeds: every part the registration names, in the shape the verdict will read, determinism, and a file that parses back
//
// SABOTAGE LOG (2026-11-03) -- the byte-safe runner against this gate, every file restored byte-identical (sha256); the number is the rows that went red:
//   G1 Q4's second stage at the start's angular velocity 2 | G2 Q4's stage weights wrong 4 | G3 Q4 not renormalised 1 | G4 the default made rk4 11 |
//   G5 the option ignored 7 | G6 an unknown option read as the default 1 | G7 Q4 moves the angular velocity too 2 | G8 the duel's orientation never
//   reaches its steps 2 | G9 the nudge moves A in x 1 | G10 the record keeps B's inputs 2 | G11 the record's end is its start 2 | G12 the duel's
//   default orientation rk4 6 | G13 the sign test one term short 1 | G14 better and worse swapped 1 | G15 a mutual kill counted a win 1 | G16 the
//   angle by acos 2 | G17 M3's seeds one later 1 | G18 the League pilot's hash wrong 3 (sections 2, 3 and 5 stop, naming the hash) | G19 the
//   reference at a 32nd 2 | G20 the replay at the wrong tick 2 | G21 the reference Q0's own 1 | G22 the order from the first two steps 1 | G23 M3's
//   nudge dropped 1 | G24 the nudge 1e-8 1 | G25 an anchor fingerprint wrong 2 | G26 C-key's exact answer half the turn 2 | G27 a pilot loaded
//   without its hash 1 | G28 the command prints the readings 1 | G29 the command does not refuse 1 | G30 the League and close-quarters pilots in each
//   other's places 1 | G31 refuseExisting refuses nothing 1 | G32 the results file elsewhere 1 | G33 a control left out of the run 2 | G34 the file
//   drops the readings 1
//   Every row went red under at least one design. G30-G34 were added after G1-G29 left five rows that no design had turned red.
//   FOUND BEFORE THE SERIES, AND FIXED: three designs would have gone 0 red against the first draft. A reference that was Q0's own passed C-reference
//   with a ratio of 0; an order fitted over the first two steps could not show while the miniature's fit WAS its first two steps; and a dropped
//   nudge could not show in a fingerprint that rounds to a millimetre. The miniature now fits over a later pair, flies a 1e-3 m nudge, and has a
//   row for each (G21, G22, G23).
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as RB from "../../physics/mechanics/rigidBody6dof.mjs";
import * as P6 from "../../brain/pilot6dofPolicy.mjs";
import * as L from "./orientationStep.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const t0 = Date.now(), J = JSON.stringify, near = (a, b, tol) => Math.abs(a - b) <= tol;
const guard = (n, e) => ok(`section ${n} ran without throwing`, false, String(e && e.stack || e).split("\n").slice(0, 2).join(" ").slice(0, 240));
const src = (f) => fs.readFileSync(path.join(ENG, f), "utf8");
// none of these is registered: other seeds, other steps (the fit a pair that is not the first two, so a fit read from the wrong pair shows), and a
// nudge large enough to be seen in a fingerprint (1e-9 m is not: the fingerprint rounds to a millimetre)
const MINI = Object.freeze({ fightSeeds: [92001, 92002], turnSeeds: [92001], free: { dts: [1 / 20, 1 / 40, 1 / 80], fit: [1 / 40, 1 / 80], T: 2 }, nudge: 1e-3 });

console.log("1. THE STEP'S OPTION (physics/mechanics/rigidBody6dof.mjs)");
try {
    ok("!! given no option, step() is byte for byte what it was: the registration's 1,000 steps hash to its anchor, taken before any code -- and so do the same steps given 'euler'",
        L.stepDigest() === L.ANCHOR.stepDigest && L.stepDigest({ orientation: "euler" }) === L.ANCHOR.stepDigest && L.ANCHOR.stepDigest === "29216a6bf1de97d3", L.stepDigest());
    const a = L.stepOutputs(), b = L.stepOutputs({ orientation: "rk4" }), same = (k) => a.every((x, i) => J(x[k]) === J(b[i][k]));
    const unit = b.every((x) => near(Math.hypot(...x.q), 1, 1e-14)), moved = a.filter((x, i) => J(x.q) !== J(b[i].q)).length;
    ok("!! 'rk4' changes the orientation and nothing else: over the same 1,000 steps position, velocity and angular velocity are the default's to the bit, every quaternion is unit, and the quaternions move",
        same("pos") && same("vel") && same("w") && same("mass") && same("I") && unit && moved > 990, `${moved} of 1000 quaternions moved`);
    let refused = "";
    try { RB.step(RB.createBody(), RB.createAccumulator(), 1 / 30, { orientation: "rk2" }); } catch (e) { refused = e.message; }
    ok("an orientation that is neither 'euler' nor 'rk4' is refused by name rather than read as the default; a missing one is the default",
        /orientation "rk2" is neither "euler" nor "rk4"/.test(refused) && RB.orientationOf(undefined) === "euler" && RB.orientationOf({}) === "euler" && RB.orientationOf({ orientation: "rk4" }) === "rk4", refused);
    // the order, on a body and steps the round does not fly: moments 1, 2, 3, a tumble and a torque, 6 s, each step against itself at 1/1280 s
    const I = [1, 2, 3], w0 = [0.3, 1.5, 0.2], acc = { force: [0, 0, 0], torque: [0.05, -0.02, 0.03] }, T = 6;
    const flyQ = (stepId, dt) => { let s = RB.createBody({ mass: 1, I, w: w0 }); const opt = L.optOf(stepId); for (let n = 0, N = Math.round(T / dt); n < N; n++) s = RB.step(s, acc, dt, opt); return s.q; };
    const order = (id) => { const ref = flyQ(id, 1 / 1280), e = [1 / 20, 1 / 40, 1 / 80].map((dt) => L.angleBetween(flyQ(id, dt), ref)); return [L.slope(e[0], e[1], 1 / 20, 1 / 40), L.slope(e[1], e[2], 1 / 40, 1 / 80)]; };
    const o4 = order("Q4"), o0 = order("Q0");
    ok("!! Q4 is fourth order and Q0 first: a body with moments 1, 2, 3 tumbling under a torque, 6 s at 1/20, 1/40 and 1/80 s, each against itself at 1/1280 s -- Q4's error falls by about 16 a halving, Q0's by about 2",
        o4.every((x) => x > 3.5 && x < 4.5) && o0.every((x) => x > 0.8 && x < 1.2), `Q4 slopes ${o4.map((x) => x.toFixed(2)).join(", ")}; Q0 ${o0.map((x) => x.toFixed(2)).join(", ")}`);
    const key = L.cKey();
    ok("!! C-key, as the registration fixed it: the fixture's steady 2 rad/s about its largest axis for 30 s at 1/30 s -- Q4 within 1e-5 rad of w t, Q0 beyond 1e-3, each near the registration's arithmetic (6.2e-7 and 0.022 rad)",
        key.ok && key.axis === 0 && near(key.off.Q4, 6.2e-7, 0.4e-7) && near(key.off.Q0, 0.0222, 0.0005) && L.KEY.q4Within === 1e-5 && L.KEY.q0Beyond === 1e-3,
        `Q4 ${key.off.Q4.toExponential(2)} rad, Q0 ${key.off.Q0.toFixed(4)} rad`);
} catch (e) { guard(1, e); }

console.log("\n2. THE DUEL'S OPTIONS (brain/pilot6dofPolicy.mjs)");
try {
    const pilots = L.loadPilots(), u = L.cUnchanged(pilots);
    ok("!! given none of its three new options, the duel is byte for byte what it was: the ten anchor duels (each pilot as A against the PD autopilot, seed 91100, both scenarios) have the registration's fingerprints",
        u.ok && L.SCENARIOS.every((sc) => L.PILOT_IDS.every((id) => u.fingerprints[sc][id] === L.ANCHOR.fingerprints[sc][id])), J(u.fingerprints));
    const fp = (o) => P6.duel("autopilot", "autopilot", { seed: 92003, scenario: "joust", ...o }).fingerprint;
    ok("!! `orientation` reaches the steps: 'euler' is the default to the bit, and 'rk4' flies another duel", fp({ orientation: "euler" }) === fp({}) && fp({ orientation: "rk4" }) !== fp({}), `${fp({})} / ${fp({ orientation: "rk4" })}`);
    const r0 = {}, rn = {}; P6.duel("autopilot", "autopilot", { seed: 92003, scenario: "joust", record: r0 }); P6.duel("autopilot", "autopilot", { seed: 92003, scenario: "joust", record: rn, nudge: 1e-9 });
    const s0 = r0.start, sn = rn.start;
    ok("!! `nudge` moves A's start that far in y and nothing else, after the seed's draws", near(sn.pos[1] - s0.pos[1], 1e-9, 1e-15) && sn.pos[0] === s0.pos[0] && sn.pos[2] === s0.pos[2] && J([sn.vel, sn.q, sn.w, sn.I, sn.mass]) === J([s0.vel, s0.q, s0.w, s0.I, s0.mass]),
        `${(sn.pos[1] - s0.pos[1]).toExponential(3)} m`);
    const rec = L.recordOf(92003, "joust"), back = L.replay(rec, "Q0");
    ok("!! `record` holds A's start, one input per step A took and A's end -- and the inputs replayed open loop with Q0 land on A's own end, to the bit",
        rec.inputs.length === rec.ticks && rec.inputs.length > 0 && J(back.end) === J(rec.end) && J(rec.start) === J(r0.start), `${rec.inputs.length} ticks`);
    const duelSrc = src("brain/pilot6dofPolicy.mjs");
    ok("the duel's tick is the library's (1/30 s, read from the duel's source), and the duel takes the three options with defaults that are off",
        /dt = 1 \/ 30, steps = Math\.round\(seconds \/ dt\)/.test(duelSrc) && L.DUEL_DT === 1 / 30 && /orientation = null, nudge = 0, record = null \} = \{\}\) \{/.test(duelSrc));
} catch (e) { guard(2, e); }

console.log("\n3. THE LIBRARY HOLDS THE REGISTRATION");
try {
    const PF = await import("../ship/sixdofPageFight.mjs"), pilots = L.loadPilots();
    ok("!! the five pilots are the page fight's own (es-box3d-6dof.html's Load Pilots panel), in its order, each loaded through the page's importer to its registered hash",
        J(L.PILOTS.map(({ id, file, policy, hash }) => [id, file, policy, hash])) === J(PF.PILOTS.map(({ id, file, policy, hash }) => [id, file, policy, hash])) &&
        J(pilots.map((p) => p.hash)) === J([null, "215e26d9", "32789ff9", "360580a7", "0ffd8554"]) && typeof pilots[4].pilot === "function" && pilots[0].pilot === "autopilot");
    let wrong = ""; try { L.loadPilot({ ...L.PILOTS[1], hash: "00000000" }); } catch (e) { wrong = e.message; }
    ok("a pilot whose weights are not its registered hash is refused by name", /is 215e26d9, not the registered 00000000/.test(wrong), wrong);
    const used = new Set([...P6.TRAIN_SEEDS, ...P6.HELD_OUT_SEEDS, ...P6.AUDIT_SEEDS, ...P6.LEAGUE_TRAIN_SEEDS, ...P6.LEAGUE_HELD_OUT_SEEDS, ...P6.LEAGUE_AUDIT_SEEDS, ...P6.CLOSE_TRAIN_SEEDS,
        ...P6.CLOSE_HELD_OUT_SEEDS, ...P6.CLOSE_AUDIT_SEEDS, ...P6.BASELINE_SEEDS, ...PF.CONTROL_DUEL_SEEDS]);
    ok("!! the seeds are the registration's: M2 91001-91010 and M3 91001-91040 of each scenario, the anchor 91100 among neither, and none of them a seed an earlier 6-DOF round's duels flew",
        J(L.TURN.seeds) === J(Array.from({ length: 10 }, (_, i) => 91001 + i)) && J(L.FIGHT.seeds) === J(Array.from({ length: 40 }, (_, i) => 91001 + i)) && J(L.SCENARIOS) === J(["standoff", "joust"]) &&
        !L.FIGHT.seeds.includes(L.ANCHOR.seed) && L.FIGHT.seeds.every((s) => !used.has(s)) && !MINI.fightSeeds.some((s) => L.FIGHT.seeds.includes(s)));
    ok("!! the steps and numbers are the registration's: Q0 no option and Q4 'rk4'; M1 at 1/30, 1/60, 1/240 and 1/960 s for 30 s, its order over 1/60 to 1/240 s; the reference a 64th of the tick (1/1920 s); the nudge 1e-9 m; p < 0.01; C-reference a 30th above 1e-9 rad",
        J(L.STEPS) === J({ Q0: null, Q4: "rk4" }) && J(L.FREE.dts) === J([1 / 30, 1 / 60, 1 / 240, 1 / 960]) && J(L.FREE.fit) === J([1 / 60, 1 / 240]) && L.FREE.T === 30 && L.TURN.refSub === 64 &&
        L.DUEL_DT / L.TURN.refSub === 1 / 1920 && L.FIGHT.nudge === 1e-9 && L.ALPHA === 0.01 && L.REFERENCE.ratio === 1 / 30 && L.REFERENCE.floor === 1e-9 && L.optOf("Q0") === undefined && J(L.optOf("Q4")) === J({ orientation: "rk4" }));
    ok("!! the sign test is exact and two-sided, ties set aside: 8-0 gives 1/128 (under the line), 7-0 gives 1/64 (over it), 0-0 gives 1, and it reads the same both ways",
        L.signTest(8, 0) === 2 / 256 && L.signTest(7, 0) === 2 / 128 && L.signTest(0, 0) === 1 && L.signTest(3, 9) === L.signTest(9, 3) && near(L.signTest(9, 3), 0.14599609375, 1e-12));
    const mk = (o) => o.map((outcome) => ({ outcome }));
    const c = L.compare(mk(["loss", "draw", "win", "draw", "loss"]), mk(["draw", "win", "win", "loss", "win"]));
    ok("!! better is a loss to a draw or a win, or a draw to a win, and worse the reverse; an unchanged outcome is a tie; the reading names the direction at p < 0.01 and nothing above it",
        c.better === 3 && c.worse === 1 && c.same === 1 && c.changed === 4 && L.readingOf({ p: 0.005, better: 9, worse: 0 }) === "changes it: better for A" &&
        L.readingOf({ p: 0.005, better: 0, worse: 9 }) === "changes it: worse for A" && L.readingOf({ p: 0.01, better: 9, worse: 0 }) === "changes nothing a sign test can see");
    ok("a duel's outcome from A's side: B dead and A not a win, A dead and B not a loss, anything else a draw",
        L.outcomeOf({ aDead: false, bDead: true }) === "win" && L.outcomeOf({ aDead: true, bDead: false }) === "loss" && L.outcomeOf({ aDead: true, bDead: true }) === "draw" && L.outcomeOf({ aDead: false, bDead: false }) === "draw");
    const rot = (a) => [Math.cos(a / 2), Math.sin(a / 2) * 0.6, 0, Math.sin(a / 2) * 0.8];
    ok("!! the angle between orientations is right where acos is not: 1e-9 rad measured as 1e-9, 2 rad as 2, and a quaternion and its negative as the same orientation",
        near(L.angleBetween(rot(0.3), rot(0.3 + 1e-9)), 1e-9, 1e-16) && near(L.angleBetween(rot(0), rot(2)), 2, 1e-12) && L.angleBetween(rot(0.7), rot(0.7).map((x) => -x)) === 0);
} catch (e) { guard(3, e); }

console.log("\n4. THE COMMAND (read from its source; never run here)");
try {
    const cmd = src("tools/roundhouse/orientationStepRun.mjs"), code = cmd.replace(/\/\/.*$/gm, "");
    ok("!! the command refuses an existing results file before it runs anything, writes the file once, and prints only where it is and the step's time -- no reading, no statistic",
        code.indexOf("refuseExisting(results)") > 0 && code.indexOf("refuseExisting(results)") < code.indexOf("run()") && (code.match(/writeFileSync/g) || []).length === 1 &&
        !/readings|\.reading|\.m1|\.m2|\.m3|\.controls|outcome|fingerprint/.test(code) && /DEFAULT_RESULTS/.test(code));
    ok("refuseExisting names an existing file and passes a missing one", /exists -- a round's results are never overwritten/.test(L.refuseExisting("x.json", () => true)) && L.refuseExisting("x.json", () => false) === null);
    ok("the registered results file is the command's default, beside the registration's note", L.DEFAULT_RESULTS === path.join(ENG, "physics", "mechanics", "orientationStepResults.json") && L.REGISTRATION === "physics/mechanics/ORIENTATION_STEP_WIP.md");
} catch (e) { guard(4, e); }

console.log("\n5. A MINIATURE (two pilots, seeds 92001-92002, steps 1/20 to 1/80 s for 2 s, a 1e-3 m nudge -- none of it registered)");
try {
    const pilots = L.loadPilots().slice(0, 2), r = L.run({ pilots, ...MINI }), C = r.controls;
    ok("!! the miniature has every part the registration names: M1 by step with its order, M2's duels with Q0, Q4 and Q0 at a 64th against the reference, M3's cells by pilot and scenario, the six controls, and a reading per cell",
        J(Object.keys(r)) === J(["registration", "pilots", "m1", "m2", "m3", "controls", "readings"]) && J(Object.keys(C)) === J(["unchanged", "omega", "key", "reference", "chaos", "determinism"]) &&
        Object.keys(r.m1.flights).length === 3 && J(Object.keys(r.m1.order)) === J(["Q0", "Q4"]) && r.m2.duels.length === 2 && r.m2.duels.every((d) => ["q0", "q4", "q0fine", "peakSpin", "omegaSame"].every((k) => k in d)) &&
        r.m3.cells.length === 4 && r.m3.cells.every((c) => J(Object.keys(c.flights)) === J(["Q0", "Q4", "Q0'"]) && c.flights.Q0.length === 2) && r.readings.length === 4 && r.registration === L.REGISTRATION);
    ok("!! ...its controls hold on its own seeds: unchanged, the angular velocity the same under both steps, the replay the duel, C-key, the reference within a 30th, every flight twice the same",
        C.unchanged.ok && C.omega.free && C.omega.turn && C.omega.replayIsDuel && C.key.ok && C.reference.ok && C.determinism.ok && C.determinism.flights === 16, `reference worst ${C.reference.worstRatio.toFixed(4)}`);
    const F = r.m1.flights, fitOrder = (id) => L.slope(F["1/40"][id].driftWorldL, F["1/80"][id].driftWorldL, 1 / 40, 1 / 80);
    ok("!! M1's order is the slope over the fit's two steps, read from its own flights (here 1/40 and 1/80 s, not the first two)",
        L.STEP_IDS.every((id) => r.m1.order[id] === fitOrder(id)) && r.m1.order.Q0 > 0.8 && r.m1.order.Q0 < 1.2, `Q0 ${r.m1.order.Q0.toFixed(3)}, Q4 ${r.m1.order.Q4.toFixed(3)}`);
    const d = r.m2.duels[0];
    ok("!! M2's reference is the candidate at a 64th of the tick: on the miniature's duel Q4 is under a hundredth of Q0's distance from it, and Q0 at a 64th about a 64th (between an 80th and a 50th)",
        d.q4 < d.q0 / 100 && C.reference.worstRatio > 1 / 80 && C.reference.worstRatio < 1 / 50, `Q0 ${d.q0.toExponential(2)} rad, Q4 ${d.q4.toExponential(2)}, Q0 at a 64th ${d.q0fine.toExponential(2)}`);
    ok("!! Q0' is the nudged flight: with the miniature's 1e-3 m nudge, A's flights differ from Q0's, and Q4's from Q0's",
        r.m3.cells.every((c) => c.flights["Q0'"].some((f, i) => f.fingerprint !== c.flights.Q0[i].fingerprint) && c.flights.Q4.some((f, i) => f.fingerprint !== c.flights.Q0[i].fingerprint)));
    const again = JSON.parse(L.serialize(r));
    ok("the results serialize to one JSON file that parses back to the same result", J(again) === J(JSON.parse(JSON.stringify(r))) && L.serialize(r).endsWith("\n"));
} catch (e) { guard(5, e); }

console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)`);
process.exitCode = fails ? 1 : 0;
