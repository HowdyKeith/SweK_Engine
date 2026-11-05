// WebGLEngine/tools/roundhouse/orientationStep-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/roundhouse/orientationStep-selfcheck.mjs      (~6.7 s)
//
// THE GATE OF THE ORIENTATION-STEP ROUND (physics/mechanics/ORIENTATION_STEP_WIP.md, registered before any code): the step's new option, the
// duel's three, and the library that flies the round. It never runs the registered round or its command: it flies C-unchanged's anchors and
// C-key, which the registration fixed exactly, and a miniature on seeds and steps the registration does not use.
//   1  rigidBody6dof.step(): the first-order step byte for byte what it was (the registration's 1,000 steps, hashed); "rk4" changes the orientation
//      and nothing else; an unknown option refused; Q4 fourth order and Q0 first, on a body and steps the round does not fly; C-key
//   2  the duel: given none of its other new options, the ten anchor duels' fingerprints; `orientation` reaches every step; `nudge` moves A's
//      start and nothing else; `record` replays to A's own end, to the bit; the duel's tick is the library's
//   3  the library holds the registration: the five pilots and their hashes (the page fight's own list), the seeds and their freshness, the
//      steps, the nudge, the reference, the sign test and the reading, the outcome, the angle
//   4  the command: refuses an existing results file, writes it once, and prints no reading
//   5  a miniature on other seeds: every part the registration names, in the shape the verdict will read, determinism, and a file that parses back
//   6  (2026-11-04) THE VERDICT, read from the committed results file: its bytes; M1's table and orders; M2's ranges; M3's table, every cell
//      re-derived by the library's own rules from its flights; the predictions by their registered rules; the controls; the outcome the
//      registration fixed; the note's verdict carrying the file's numbers; and a sample of the round flown again, to the bit
//   7  (2026-11-04, Keith: "make the fourth-order step the default") THE NEW DEFAULT: RK4 is what no option means; the setter and its carrier
//      into node processes; physics/mechanics/rigidBody6dofEuler.mjs flies the first-order step, imported first by every gate that holds
//      first-order numbers and by no library; and every 6-DOF craft family flown under both steps
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
// SABOTAGE LOG, THE VERDICT (2026-11-04) -- section 6, the same runner, every file restored byte-identical (sha256):
//   V1 the file: Q4's drift at 1/30 s 4 | V2 the file: a joust's Q4 angle a hundred times larger 3 | V3 the file: one of the GPU Brain's joust flights under
//   Q4 a win 4 | V4 the file: the GPU Brain's joust counts 5 better 4 | V5 the file: C-key's Q0 angle 3 | V6 the note: a table row's p 1 | V7 the note: P2
//   called wrong 1 | V8 the note: the recommendation turned round 1 | V9 the note: M1's table 1 | V10 the note: the nudge's moved flights 1 | V11 the code:
//   better and worse swapped 2 | V12 the code: Q4's stage weights 5 | V13 the code: the nudge moves A in x 2 | V14 the code: the momentum's drift halved 1 |
//   V15 the code: the sign test's line at 0.5 4 | V16 the file: Q4 of the third order, not the fourth 4
//   Every row of section 6 went red under at least one design. V16 was added after V1-V15 left the predictions row the one no design had reddened.
// SABOTAGE LOG, THE NEW DEFAULT (2026-11-04) -- section 7 and the gates the default reaches, the same runner, every file restored byte-identical:
//   against this gate: D1 the default back to the first-order step 5 | D2 the carried setting never read 1 | D3 the setter carries nothing 1 |
//   D5 a gate's first-order import after another import 1 | D6 a library imports the first-order module 4 | D9 the round's Q0 back to no option 9 |
//   D10 the page fight's script flies the default 1
//   (these seven run again against the gate as committed. The first draft held the carrier with child processes, which put this gate over
//   tools/ship/gateAxioms' count of gates that start one; the rows now use fresh copies of the module instead. Its census counted any file
//   that NAMED the module, so the backlog's entry for this decision read as an import, and it let the page fight's library through on its
//   browser script alone; it now counts static imports, everywhere.)
//   against the gates it reaches: D4 the first-order module sets RK4 14 (brain/droneTask-selfcheck.mjs) | D7 a page never reads the carried setting
//   1 (tools/ship/sixdofPageFight-selfcheck.mjs) | D10b the page fight's script flies the default 2 (the same) | D8 the spinning body's C4 flies
//   the default 4 (tools/roundhouse/spinningBody-selfcheck.mjs) | D3b the setter carries nothing, to worker processes 2
//   (tools/ship/trainDogfightLeague-selfcheck.mjs, whose --workers row is what the environment carrier is for)
//   Every row of section 7 went red under at least one design.
// AND SIX FOR THE EIGHT GATES THE DEFAULT MISSED (2026-11-05; section 7's register, 36 -> 44), each against the gate it breaks and this one, every file
// restored byte-identical (sha256), every one red by name:
//   E1 trainSubPilot's first-order import dropped 3 | E2 pilotFlightTrain's first-order import dropped 2 | E3 trainDronePilot's first-order import moved second 1
//   E4 dogfightPage's page script no longer imports it first in the browser 8 | E5 subDropoutView's page set no step before it loads 3
//   E6 subDropoutView's page set to RK4 before it loads 3
//   E3 reddens only the register: a gate whose import comes second still flies the first-order step, the default being read at a body's first step, and
//   the register is what holds the convention that it come first.
"use strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import * as RB from "../../physics/mechanics/rigidBody6dof.mjs";
import * as P6 from "../../brain/pilot6dofPolicy.mjs";
import * as L from "./orientationStep.mjs";
import * as SB from "./spinningBody.mjs";

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
    // 2026-11-04 (unnumbered) -- RESTATED, NOT WIDENED: this row held the step given no option to the anchor, when no option meant the
    // first-order step. Keith made RK4 the default the same day, and the row went red on exactly that. It now holds the first-order step,
    // named, to the anchor, and no option to RK4's own digest; section 7 holds the default itself.
    ok("!! the first-order step is byte for byte what it was: given 'euler', the registration's 1,000 steps hash to its anchor, taken before any code -- and given no option they are RK4's, the default since 2026-11-04",
        L.stepDigest({ orientation: "euler" }) === L.ANCHOR.stepDigest && L.ANCHOR.stepDigest === "29216a6bf1de97d3" && L.stepDigest() === L.stepDigest({ orientation: "rk4" }) && L.stepDigest() !== L.ANCHOR.stepDigest, L.stepDigest());
    const a = L.stepOutputs({ orientation: "euler" }), b = L.stepOutputs({ orientation: "rk4" }), same = (k) => a.every((x, i) => J(x[k]) === J(b[i][k]));
    const unit = b.every((x) => near(Math.hypot(...x.q), 1, 1e-14)), moved = a.filter((x, i) => J(x.q) !== J(b[i].q)).length;
    ok("!! 'rk4' changes the orientation and nothing else: over the same 1,000 steps position, velocity and angular velocity are the default's to the bit, every quaternion is unit, and the quaternions move",
        same("pos") && same("vel") && same("w") && same("mass") && same("I") && unit && moved > 990, `${moved} of 1000 quaternions moved`);
    let refused = "";
    try { RB.step(RB.createBody(), RB.createAccumulator(), 1 / 30, { orientation: "rk2" }); } catch (e) { refused = e.message; }
    ok("an orientation that is neither 'euler' nor 'rk4' is refused by name rather than read as the default; a missing one is the default",
        /orientation "rk2" is neither "euler" nor "rk4"/.test(refused) && RB.orientationOf(undefined) === RB.orientationDefault() && RB.orientationOf({}) === RB.orientationDefault() && RB.orientationOf({ orientation: "euler" }) === "euler" && RB.orientationOf({ orientation: "rk4" }) === "rk4", refused);
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
    // 2026-11-04 (unnumbered) -- RESTATED: the anchors were taken given no option, which meant the first-order step; cUnchanged now names it.
    ok("!! given the first-order step and none of its other new options, the duel is byte for byte what it was: the ten anchor duels (each pilot as A against the PD autopilot, seed 91100, both scenarios) have the registration's fingerprints",
        u.ok && L.SCENARIOS.every((sc) => L.PILOT_IDS.every((id) => u.fingerprints[sc][id] === L.ANCHOR.fingerprints[sc][id])), J(u.fingerprints));
    const fp = (o) => P6.duel("autopilot", "autopilot", { seed: 92003, scenario: "joust", ...o }).fingerprint;
    // 2026-11-04 (unnumbered) -- RESTATED: 'euler' was the default here; since Keith's decision 'rk4' is.
    ok("!! `orientation` reaches the steps: 'rk4' is the default to the bit (since 2026-11-04), and 'euler' flies another duel", fp({ orientation: "rk4" }) === fp({}) && fp({ orientation: "euler" }) !== fp({}), `${fp({})} / ${fp({ orientation: "euler" })}`);
    const r0 = {}, rn = {}; P6.duel("autopilot", "autopilot", { seed: 92003, scenario: "joust", record: r0 }); P6.duel("autopilot", "autopilot", { seed: 92003, scenario: "joust", record: rn, nudge: 1e-9 });
    const s0 = r0.start, sn = rn.start;
    ok("!! `nudge` moves A's start that far in y and nothing else, after the seed's draws", near(sn.pos[1] - s0.pos[1], 1e-9, 1e-15) && sn.pos[0] === s0.pos[0] && sn.pos[2] === s0.pos[2] && J([sn.vel, sn.q, sn.w, sn.I, sn.mass]) === J([s0.vel, s0.q, s0.w, s0.I, s0.mass]),
        `${(sn.pos[1] - s0.pos[1]).toExponential(3)} m`);
    const rec = L.recordOf(92003, "joust"), back = L.replay(rec, "Q0");
    ok("!! `record` holds A's start, one input per step A took and A's end -- and the inputs replayed open loop with Q0 land on A's own end, to the bit",
        rec.inputs.length === rec.ticks && rec.inputs.length > 0 && J(back.end) === J(rec.end) && J(rec.start) === J(r0.start), `${rec.inputs.length} ticks`);
    const duelSrc = src("brain/pilot6dofPolicy.mjs");
    // 2026-11-04: the 6-DOF-on-box3d round (physics/mechanics/SIXDOF_BOX3D_WIP.md) added `stepA` after these three, also off, and the both-ships
    // round (physics/mechanics/BOX3D_BOTH_SHIPS_WIP.md) `stepB` after it; those rounds' gates hold them
    ok("the duel's tick is the library's (1/30 s, read from the duel's source), and the duel takes the three options with defaults that are off (and the box3d rounds' stepA and stepB after them, and the hybrid round's contacts after those, off too)",
        /dt = 1 \/ 30, steps = Math\.round\(seconds \/ dt\)/.test(duelSrc) && L.DUEL_DT === 1 / 30 && /orientation = null, nudge = 0, record = null(?:, stepA = null(?:, stepB = null(?:, contacts = null)?)?)? \} = \{\}\) \{/.test(duelSrc));
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
    ok("!! the steps and numbers are the registration's: Q0 the first-order step (named 'euler' since 2026-11-04, when it stopped being the default) and Q4 'rk4'; M1 at 1/30, 1/60, 1/240 and 1/960 s for 30 s, its order over 1/60 to 1/240 s; the reference a 64th of the tick (1/1920 s); the nudge 1e-9 m; p < 0.01; C-reference a 30th above 1e-9 rad",
        J(L.STEPS) === J({ Q0: "euler", Q4: "rk4" }) && J(L.FREE.dts) === J([1 / 30, 1 / 60, 1 / 240, 1 / 960]) && J(L.FREE.fit) === J([1 / 60, 1 / 240]) && L.FREE.T === 30 && L.TURN.refSub === 64 &&
        L.DUEL_DT / L.TURN.refSub === 1 / 1920 && L.FIGHT.nudge === 1e-9 && L.ALPHA === 0.01 && L.REFERENCE.ratio === 1 / 30 && L.REFERENCE.floor === 1e-9 && J(L.optOf("Q0")) === J({ orientation: "euler" }) && J(L.optOf("Q4")) === J({ orientation: "rk4" }));
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

console.log("\n6. THE VERDICT (2026-11-04, read from the committed results file; a sample of the round flown again)");
try {
    const text = fs.readFileSync(L.DEFAULT_RESULTS, "utf8"), R = JSON.parse(text), sha = crypto.createHash("sha256").update(text).digest("hex");
    ok("!! the results file is the registered run's, byte for byte as it was committed: 136,030 bytes, sha256 2226e37ff9989ed1, naming the registration",
        Buffer.byteLength(text) === 136030 && sha.startsWith("2226e37ff9989ed1") && R.registration === L.REGISTRATION, `${Buffer.byteLength(text)} bytes, ${sha.slice(0, 16)}`);
    const e2 = (x) => x.toExponential(2), F = R.m1.flights, M1 = [["1/30", "1.61e-2", "9.84e-8"], ["1/60", "8.02e-3", "6.15e-9"], ["1/240", "2.00e-3", "2.40e-11"], ["1/960", "5.00e-4", "1.03e-13"]];
    ok("!! M1: the free body's drift is the verdict's table at every step, Q4's order 4.00 and Q0's 1.00, and the energy's drift and the flips are the same under both steps",
        J(Object.keys(F)) === J(M1.map((r) => r[0])) && M1.every(([k, a, b]) => e2(F[k].Q0.driftWorldL) === a && e2(F[k].Q4.driftWorldL) === b && F[k].Q0.driftE === F[k].Q4.driftE && F[k].Q0.flips === F[k].Q4.flips) &&
        R.m1.order.Q4.toFixed(2) === "4.00" && R.m1.order.Q0.toFixed(2) === "1.00", M1.map(([k]) => `${k}: ${e2(F[k].Q0.driftWorldL)} / ${e2(F[k].Q4.driftWorldL)}`).join(", "));
    const D = R.m2.duels, of = (sc) => D.filter((d) => d.scenario === sc), lo = (a, k) => Math.min(...a.map((d) => d[k])), hi = (a, k) => Math.max(...a.map((d) => d[k])), deg = (r) => (r * 180 / Math.PI).toFixed(2);
    const st = of("standoff"), jo = of("joust"), ratio = Math.max(...D.map((d) => d.q4 / d.q0));
    const m2s = { stQ0: `${e2(lo(st, "q0"))} to ${e2(hi(st, "q0"))} rad off (${deg(lo(st, "q0"))} to ${deg(hi(st, "q0"))} degree)`, stQ4: `at most ${e2(hi(st, "q4"))} rad off`,
        stSpin: `spin reached at most ${hi(st, "peakSpin").toFixed(3)} rad/s`, joQ0: `${e2(lo(jo, "q0"))} to ${e2(hi(jo, "q0"))} rad off (${deg(lo(jo, "q0"))} to ${deg(hi(jo, "q0"))} degrees)`, joQ4: `${e2(lo(jo, "q4"))} to ${e2(hi(jo, "q4"))} rad off`,
        spins: `spins of ${lo(jo, "peakSpin").toFixed(2)} to ${hi(jo, "peakSpin").toFixed(2)} rad/s`, ratio: `The largest ratio was ${e2(ratio)}`, ticks: `(${lo(D, "ticks")} to ${hi(D, "ticks")} ticks)` };
    ok("!! M2: 10 duels of each scenario; the standoffs Q0 3.59e-4 to 1.84e-3 rad off (the spin at most 0.110 rad/s) and Q4 at most 2.47e-14; the jousts Q0 2.65e-2 to 4.27e-2 (1.52 to 2.45 degrees) and Q4 4.29e-9 to 3.32e-8; the largest ratio 7.76e-7",
        st.length === 10 && jo.length === 10 && m2s.stQ0 === "3.59e-4 to 1.84e-3 rad off (0.02 to 0.11 degree)" && m2s.stQ4 === "at most 2.47e-14 rad off" && m2s.stSpin === "spin reached at most 0.110 rad/s" &&
        m2s.joQ0 === "2.65e-2 to 4.27e-2 rad off (1.52 to 2.45 degrees)" && m2s.joQ4 === "4.29e-9 to 3.32e-8 rad off" && m2s.spins === "spins of 1.58 to 2.55 rad/s" && e2(ratio) === "7.76e-7" && m2s.ticks === "(174 to 397 ticks)", J(m2s));
    const NAME = { scripted: "the PD autopilot", shipped: "the Default", league: "the League pilot", close: "the close-quarters pilot", gpu: "the GPU Brain's pilot" };
    const tal = (x) => `${x.win}-${x.loss}-${x.draw}`, moved = (c) => c.flights["Q0'"].filter((f, i) => f.fingerprint !== c.flights.Q0[i].fingerprint).length, cells = R.m3.cells;
    const rowOf = (c) => `| ${NAME[c.pilot]} | ${c.scenario} | ${tal(c.tally.Q0)} | ${tal(c.tally.Q4)} | ${c.q4.better} | ${c.q4.worse} | ${c.q4.p.toPrecision(3)} | ${c.chaos.changed} | ${moved(c)} |`;
    const ROWS = ["| the PD autopilot | standoff | 0-0-40 | 0-0-40 | 0 | 0 | 1.00 | 0 | 0 |", "| the PD autopilot | joust | 3-9-28 | 0-5-35 | 8 | 7 | 1.00 | 0 | 0 |",
        "| the Default | standoff | 40-0-0 | 40-0-0 | 0 | 0 | 1.00 | 0 | 0 |", "| the Default | joust | 0-39-1 | 0-38-2 | 1 | 0 | 1.00 | 0 | 4 |",
        "| the League pilot | standoff | 39-0-1 | 39-0-1 | 0 | 0 | 1.00 | 0 | 0 |", "| the League pilot | joust | 0-40-0 | 0-40-0 | 0 | 0 | 1.00 | 0 | 18 |",
        "| the close-quarters pilot | standoff | 40-0-0 | 40-0-0 | 0 | 0 | 1.00 | 0 | 0 |", "| the close-quarters pilot | joust | 17-8-15 | 19-12-9 | 7 | 7 | 1.00 | 0 | 15 |",
        "| the GPU Brain's pilot | standoff | 30-0-10 | 31-0-9 | 2 | 1 | 1.00 | 0 | 0 |", "| the GPU Brain's pilot | joust | 9-28-3 | 10-25-5 | 4 | 1 | 0.375 | 0 | 0 |"];
    const tallyOf = (rs) => ({ win: rs.filter((r) => r.outcome === "win").length, loss: rs.filter((r) => r.outcome === "loss").length, draw: rs.filter((r) => r.outcome === "draw").length });
    const rederived = cells.every((c) => J(L.compare(c.flights.Q0, c.flights.Q4)) === J(c.q4) && J(L.compare(c.flights.Q0, c.flights["Q0'"])) === J(c.chaos) && L.readingOf(c.q4) === c.reading &&
        J(tallyOf(c.flights.Q0)) === J(c.tally.Q0) && J(tallyOf(c.flights.Q4)) === J(c.tally.Q4) && J(c.seeds) === J(L.FIGHT.seeds) && c.flights.Q0.length === 40);
    const sum = (sc, k, part) => cells.filter((c) => !sc || c.scenario === sc).reduce((a, c) => a + c[part][k], 0), movedAll = cells.reduce((a, c) => a + moved(c), 0), minP = Math.min(...cells.map((c) => c.q4.p));
    ok("!! M3: every cell re-derived from its 40 flights by the library's own rules (better, worse, p, the reading, the tallies), and the table is the verdict's row by row",
        rederived && cells.length === 10 && J(cells.map(rowOf)) === J(ROWS) && J(R.readings.map((r) => r.reading)) === J(cells.map((c) => c.reading)), rederived ? "" : "a cell does not re-derive");
    ok("!! ...no cell reaches p < 0.01 (the smallest 0.375); Q4 changed 38 of the 400 outcomes, 3 in the standoffs (2 better, 1 worse) and 35 in the jousts (20 better, 15 worse); the nudge changed none and moved 37 flights",
        minP.toPrecision(3) === "0.375" && cells.every((c) => c.q4.p >= L.ALPHA) && sum(null, "changed", "q4") === 38 && sum("standoff", "changed", "q4") === 3 && sum("standoff", "better", "q4") === 2 && sum("standoff", "worse", "q4") === 1 &&
        sum("joust", "changed", "q4") === 35 && sum("joust", "better", "q4") === 20 && sum("joust", "worse", "q4") === 15 && sum(null, "changed", "chaos") === 0 && movedAll === 37 && cells.length * 40 === 400,
        `smallest p ${minP.toPrecision(3)}, ${sum(null, "changed", "q4")} changed, the nudge ${sum(null, "changed", "chaos")}, ${movedAll} moved`);
    const P = { P1: R.m1.order.Q4 >= 3 && F["1/30"].Q4.driftWorldL < 1e-4, P2: D.every((d) => d.q4 < d.q0 / 100), P3: cells.every((c) => c.reading === "changes nothing a sign test can see"),
        P4: L.SCENARIOS.every((sc) => sum(sc, "changed", "q4") > sum(sc, "changed", "chaos")) };
    ok("!! the predictions, each by its registered rule from the file: P1 right (order 4.00, 9.84e-8 at 1/30 s), P2 right, P3 right, P4 right (3 to 0 and 35 to 0)", Object.values(P).every(Boolean), J(P));
    const C = R.controls;
    ok("!! the controls all held, as the verdict gives them: C-unchanged (the digest and the ten fingerprints), C-omega, C-key (0.0222 and 6.17e-7 rad), C-reference (20 duels, the worst ratio 1/64.0), C-chaos (every p 1), C-determinism (40 flights)",
        C.unchanged.ok && C.unchanged.digest === "29216a6bf1de97d3" && J(C.unchanged.fingerprints) === J(L.ANCHOR.fingerprints) && C.omega.free && C.omega.turn && C.omega.replayIsDuel && C.key.ok && C.key.off.Q0.toFixed(4) === "0.0222" &&
        e2(C.key.off.Q4) === "6.17e-7" && C.reference.ok && C.reference.checked === 20 && (1 / C.reference.worstRatio).toFixed(1) === "64.0" && C.chaos.ok && C.chaos.cells.every((c) => c.p === 1) && C.determinism.ok && C.determinism.flights === 40);
    const recommend = P.P1 && P.P3;
    // THE NOTE: the verdict section alone, from its heading to the next, its line breaks read as spaces
    const note = src(L.REGISTRATION), vAt = note.indexOf("\n### The verdict, 2026-11-04"), rest = vAt >= 0 ? note.slice(vAt + 1) : "", nextAt = rest.slice(1).search(/\n#{2,3} /);
    const vt = (nextAt >= 0 ? rest.slice(0, nextAt + 1) : rest).replace(/\s+/g, " ");
    const frags = [`${Buffer.byteLength(text).toLocaleString("en-US")} bytes, sha256 ${sha.slice(0, 16)}`, ...M1.map(([k]) => `| ${k} s | ${e2(F[k].Q0.driftWorldL)} | ${e2(F[k].Q4.driftWorldL)} |`),
        `as the ${R.m1.order.Q4.toFixed(2)}th power of the step, and Q0's as the ${R.m1.order.Q0.toFixed(2)}th`, m2s.ticks, m2s.stSpin, m2s.stQ0, m2s.stQ4, m2s.joQ0, m2s.joQ4, m2s.spins, m2s.ratio, ...cells.map(rowOf),
        `The smallest p is ${minP.toPrecision(3)}`, `Q4 changed ${sum(null, "changed", "q4")} of the 400 outcomes`, `(${sum("standoff", "better", "q4")} better, ${sum("standoff", "worse", "q4")} worse)`,
        `(${sum("joust", "better", "q4")} better, ${sum("joust", "worse", "q4")} worse)`, `It moved ${movedAll} flights`, ...Object.keys(P).map((k) => `**${k}: ${P[k] ? "right" : "wrong"}.**`),
        `its drift at 1/30 s is ${e2(F["1/30"].Q4.driftWorldL)}`, `The largest ratio of Q4's angle to Q0's is ${e2(ratio)}`, `the step digest ${C.unchanged.digest}`, `Q0 ${C.key.off.Q0.toFixed(4)} rad off the exact turn, Q4 ${e2(C.key.off.Q4)} rad`,
        `all ${C.reference.checked} duels checked, the worst ratio 1/${(1 / C.reference.worstRatio).toFixed(1)}`, `${C.determinism.flights} flights, each the same twice`,
        recommend ? "the verdict recommends Q4 as the engine's default, and the decision is Keith's" : "Nothing is recommended"];
    const missing = frags.filter((f) => !vt.includes(f));
    ok("!! the note's verdict carries the file's numbers: its tables row by row, M2's ranges, the counts, each prediction as the file reads it, the controls, and the outcome the registration fixed (recommend Q4; the decision Keith's)",
        vAt >= 0 && missing.length === 0 && recommend, missing.slice(0, 3).join(" || ") || `${frags.length} fragments`);
    // A SAMPLE OF THE ROUND, flown again at this head through the library, against the file to the bit
    const off = [];
    for (const id of L.STEP_IDS) { const fl = L.freeFlight(id, 1 / 30); if (SB.invariants(fl.trace, fl.I, fl.mid).driftWorldL !== F["1/30"][id].driftWorldL) off.push(`M1/1/30/${id}`); }
    const again = L.m2({ seeds: [91001] });
    for (const d of again.duels) { const f = D.find((x) => x.scenario === d.scenario && x.seed === d.seed); if (J(d) !== J(f)) off.push(`M2/${d.scenario}/${d.seed}`); }
    const pilots = L.loadPilots();
    for (const p of pilots) for (const sc of L.SCENARIOS) { const c = cells.find((x) => x.pilot === p.id && x.scenario === sc), s = L.FIGHT.seeds[0];
        if (J(L.fight(p.pilot, s, sc)) !== J(c.flights.Q0[0])) off.push(`M3/${p.id}/${sc}/Q0`);
        if (J(L.fight(p.pilot, s, sc, { stepId: "Q4" })) !== J(c.flights.Q4[0])) off.push(`M3/${p.id}/${sc}/Q4`);
        if (J(L.fight(p.pilot, s, sc, { nudge: L.FIGHT.nudge })) !== J(c.flights["Q0'"][0])) off.push(`M3/${p.id}/${sc}/Q0'`); }
    ok("!! a sample of the round flown again at this head, through the library, is the file's to the bit: M1 at 1/30 s with both steps, M2's seed 91001 in both scenarios, and each pilot's seed 91001 in both scenarios with Q0, Q4 and the nudge",
        off.length === 0, off.join(" ") || "34 flights");
} catch (e) { guard(6, e); }

console.log("\n7. THE NEW DEFAULT (2026-11-04: RK4, Keith's decision after the verdict)");
try {
    ok("!! RK4 is the default: nothing carries a setting into this process, orientationDefault() is 'rk4', and a step given no option is RK4's to the bit -- while 'euler' is still the registration's anchor",
        !process.env[RB.ORIENTATION_ENV] && RB.ORIENTATION_DEFAULT === "rk4" && RB.orientationDefault() === "rk4" && L.stepDigest() === L.stepDigest({ orientation: "rk4" }) && L.stepDigest({ orientation: "euler" }) === L.ANCHOR.stepDigest,
        `${RB.orientationDefault()}, ${L.stepDigest()}`);
    const rbUrl = pathToFileURL(path.join(ENG, "physics", "mechanics", "rigidBody6dof.mjs")).href, eulerUrl = pathToFileURL(path.join(ENG, "physics", "mechanics", "rigidBody6dofEuler.mjs")).href;
    // A FRESH COPY OF THE MODULE (another URL is another module instance) reads the carried setting on its first use, as a process started
    // afterwards would -- so the carrier is held here without starting one. (The real worker processes are tools/ship/trainDogfightLeague's:
    // its --workers row went red when the setter carried nothing, D3b.)
    const fresh = async (n) => import(rbUrl + "?fresh=" + n), ENVK = RB.ORIENTATION_ENV, unset = () => { delete process.env[ENVK]; };
    const was = RB.setOrientationDefault("euler"), here = RB.orientationDefault(), carriedNow = process.env[ENVK], f1 = (await fresh(1)).orientationDefault();
    unset(); const f2 = (await fresh(2)).orientationDefault(); const back = RB.setOrientationDefault(was); unset();
    let refused = ""; try { RB.setOrientationDefault("rk2"); } catch (e) { refused = e.message; }
    ok("!! setOrientationDefault() makes no option mean the step it names here, carries it as SWEK_6DOF_ORIENTATION, and hands back what it meant: a fresh copy of the module reads 'euler' from it, a copy with nothing carried reads RK4, and an unknown step is refused",
        was === "rk4" && here === "euler" && carriedNow === "euler" && f1 === "euler" && f2 === "rk4" && back === "euler" && RB.orientationDefault() === "rk4" && /"rk2" is neither/.test(refused),
        `${was} -> ${here}, carried ${carriedNow}, fresh copies ${f1} and ${f2}, back to ${RB.orientationDefault()}`);
    const before = RB.orientationDefault(); await import(pathToFileURL(path.join(ENG, "physics", "mechanics", "rigidBody6dofEuler.mjs")).href + "?fresh=1"); const flown = RB.orientationDefault(); RB.setOrientationDefault(before); unset();
    ok("!! importing physics/mechanics/rigidBody6dofEuler.mjs flies the first-order step: a fresh copy of it, imported here, makes no option mean 'euler' (and the gate puts RK4 back)",
        before === "rk4" && flown === "euler" && RB.orientationDefault() === "rk4");
    // the census: who imports the module, and where
    const walk = (d, out = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.name === "node_modules" || e.name.startsWith(".")) continue; const f = path.join(d, e.name); if (e.isDirectory()) walk(f, out); else if (/\.(mjs|js|html)$/.test(e.name)) out.push(f); } return out; };
    // an IMPORT of it, static, is what is counted: a file that only names it (a note, the backlog) is not a user of it
    const staticImports = (f) => (fs.readFileSync(path.join(ENG, f), "utf8").match(/^import\s[^\n]*/gm) || []).filter((l) => l.includes("rigidBody6dofEuler.mjs"));
    const users = walk(ENG).map((f) => path.relative(ENG, f).split(path.sep).join("/")).filter((f) => !f.endsWith("rigidBody6dofEuler.mjs") && staticImports(f).length > 0);
    const BROWSER = ["tools/ship/sixdofPageFight.mjs"], firstImport = (f) => { const m = fs.readFileSync(path.join(ENG, f), "utf8").match(/^import\s[^\n]*/m); return m ? m[0] : ""; };
    // only gates import it; a library may name it inside the browser script it hands a page (BROWSER), never in an import of its own
    const gates = users.filter((f) => f.endsWith("-selfcheck.mjs")), others = users.filter((f) => !f.endsWith("-selfcheck.mjs"));
    const notFirst = gates.filter((f) => !/rigidBody6dofEuler\.mjs/.test(firstImport(f)));
    const restated = gates, pageLine = 'await import("/physics/mechanics/rigidBody6dofEuler.mjs");';
    const pageScript = /BROWSER_SCRIPT = `async \(args\) => \{\n {4}await import\("\/physics\/mechanics\/rigidBody6dofEuler\.mjs"\);/.test(src("tools/ship/sixdofPageFight.mjs")) &&
        ["brain/pilot6dofMlpPage-selfcheck.mjs", "tools/ship/battleshipPage-selfcheck.mjs", "tools/ship/dogfightPage-selfcheck.mjs"].every((f) => new RegExp("script: `async \\(\\) => \\{\\n\\s*" + pageLine.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")).test(src(f))) &&
        /await pg\.addInitScript\(\(\) => \{ try \{ sessionStorage\.setItem\("SWEK_6DOF_ORIENTATION", "euler"\); \}[^\n]*\n\s*await pg\.goto\(base \+ "\/sub-aquarium\.html"/.test(src("render/subDropoutView-selfcheck.mjs"));
    // 2026-11-05 -- 36 -> 44, AND THE PAGE SCRIPTS 3 -> 4 WITH ONE PAGE SET BEFORE IT LOADS. Eight gates holding first-order numbers were missed when RK4 became the
    // default (42845879): every one green at c2ce4537, red at 42845879 on the very rows red since, and green under the first-order step -- the flight, drone and sub
    // trainers' shipped pilots, the dogfight tournament and trainer, the fruit fly's trainer, and two pages (trainSubPilot's is in the other chat's area, changed at
    // Keith's word, "Fix them"). dogfightPage's page script imports it first in the browser, as the others do; subDropoutView opens sub-aquarium.html itself, so it
    // sets the step in sessionStorage before any of the page's scripts runs, which is where the page reads it from.
    // 2026-11-05 -- 44 -> 51, at the merge of the needs-and-limits, fish/fly and denoise lines into the box3d line: seven more gates hold first-order numbers and now say so, as the first import:
    // brain/needsTask, brain/subFieldNav, brain/subSensedNav, tools/ship/plainNetStudy, tools/ship/needsHead (a gate for the survey round H3), tools/ship/takeTankDropout (the board's dropout loop) and tools/tankFlyCxBench. The COMMAND of a round (needsHeadCmd) sets it by name with setOrientationDefault("euler"), not by importing this module.
    const MISSED = ["brain/pilotFlightTrain-selfcheck.mjs", "render/subDropoutView-selfcheck.mjs", "tools/ship/dogfightPage-selfcheck.mjs", "tools/ship/tournamentDogfightShipped-selfcheck.mjs",
        "tools/ship/trainDogfightPilotShipped-selfcheck.mjs", "tools/ship/trainDronePilot-selfcheck.mjs", "tools/ship/trainFlightPilotGpu-selfcheck.mjs", "tools/ship/trainSubPilot-selfcheck.mjs"];
    ok("!! the gates that hold first-order numbers say so: 51 of them import rigidBody6dofEuler.mjs as their FIRST import (before any module that steps a body), no library or page does, the four page scripts import it first in the browser, and the one page a gate opens itself is given the step before it loads",
        restated.length === 51 && notFirst.length === 0 && others.length === 0 && pageScript && MISSED.every((f) => restated.includes(f)),
        `${restated.length} gates${notFirst.length ? "; not first in " + notFirst.join(", ") : ""}${others.length ? "; imported by " + others.join(", ") : ""}${pageScript ? "" : "; a page script does not import it first"}`);
    // every 6-DOF craft family, under both steps: the baseline each task pins, flown here with each step named
    const FT = await import("../../brain/flightTask.mjs"), AF = await import("../../brain/autopilotFlight.mjs"), DTk = await import("../../brain/droneTask.mjs"), AD = await import("../../brain/autopilotDrone.mjs");
    const RT = await import("../../brain/rotorTask.mjs"), AR = await import("../../brain/autopilotRotor.mjs"), STk = await import("../../brain/subTask.mjs"), AS = await import("../../brain/autopilotSub.mjs");
    const fly = [
        ["the aircraft trainer", () => FT.evaluate((s, tt, w) => AF.pilot(s, tt, w), FT.BASELINE_SET), (r) => r.crashed],
        ["the multirotor", () => DTk.evaluate((s, tt, w, c) => AD.pilot(s, tt, w, c), DTk.BASELINE_SET), (r) => r.crashed],
        ["the rotorcraft", () => RT.evaluate((s, tt, w, c) => AR.pilot(s, tt, w, c), RT.BASELINE_SET), (r) => r.crashed],
        ["the sub", () => STk.evaluate(AS.pilot(), STk.TRAIN_SET), (r) => r.crashed],
        ["the ships", () => P6.evaluate(L.loadPilot(L.PILOTS[1]).pilot, P6.BASELINE_SEEDS), (r) => r.losses],
    ];
    const rows = fly.map(([name, run, fallen]) => { const out = {}; for (const how of ["euler", "rk4"]) { RB.setOrientationDefault(how); const r = run(); out[how] = { score: r.score, fallen: fallen(r) }; } RB.setOrientationDefault("rk4");
        return { name, ...out, rel: Math.abs(out.rk4.score - out.euler.score) / Math.abs(out.euler.score) }; });
    ok("!! every 6-DOF craft family flies under RK4 as under the first-order step: the aircraft trainer, the multirotor, the rotorcraft, the sub and the ships each within 2% of their baseline (measured 2026-11-04 at 0.004% to 0.33%), with the same flights fallen or lost",
        rows.length === 5 && rows.every((r) => Number.isFinite(r.rk4.score) && r.rel < 0.02 && r.rk4.fallen === r.euler.fallen) && RB.orientationDefault() === "rk4",
        rows.map((r) => `${r.name} ${(100 * r.rel).toFixed(3)}%${r.rk4.fallen !== r.euler.fallen ? ` (${r.euler.fallen} -> ${r.rk4.fallen})` : ""}`).join(", "));
} catch (e) { guard(7, e); }

console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)`);
process.exitCode = fails ? 1 : 0;
