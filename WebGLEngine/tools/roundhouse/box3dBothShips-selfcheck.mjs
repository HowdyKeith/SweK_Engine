// WebGLEngine/tools/roundhouse/box3dBothShips-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/roundhouse/box3dBothShips-selfcheck.mjs      (~3 s)
//
// THE GATE OF THE BOTH-SHIPS ROUND (physics/mechanics/BOX3D_BOTH_SHIPS_WIP.md, registered before any code): the duel's new `stepB`, and
// the library that flies the round. It never runs the registered round or its command. It flies the registration's controls where the
// registration fixes them, and a miniature on seeds the registration does not use.
//   1  the duel's stepB: off unless given (the anchors); it moves B and only B, handed B's own body and inputs; with stepA, each ship its own
//   2  the library holds the registration: the seeds and their freshness, the pilots, the ways, the numbers, the run's defaults
//   3  the controls, flown where the registration fixes them, and each able to fail
//   4  the command: refuses an existing results file, writes it once, prints no reading
//   5  a miniature on other seeds: every part the registration names, its controls -- C-caps failing as the build found, on the League
//      pilot's joust -- and its cells re-derived and re-flown by the gate
//
// SABOTAGED (2026-11-04, through the byte-safe runner, each restored byte for byte): 23 sabotages, every one red by name in the end.
//   Reading the gate before any ran found one no row could see -- C-stepB without its B-start test (G16), which the real duel always
//   passes -- so C-stepB takes the duel as a parameter and is shown failing on two that lie. G13's first design did not parse (a brace
//   left open): the gate died before printing a row, which the runner counts as 0 red; redone as code that runs, it is red.
//   The duel (brain/pilot6dofPolicy.mjs): G1 stepB moving A 7 | G2 stepB ignored 7 | G3 stepB moving both ships 4 | G4 stepB on by default 1
//   The library (tools/roundhouse/box3dBothShips.mjs): G5 the seeds from 96002 1 | G6 the nudge 1e-8 1 | G7 BB with A alone on box3d 2 |
//   G8 A3 with B on box3d instead 4 | G9 E' without the nudge 1 | G10 the reading taken from A3 1 | G11 BB compared as A3 2 | G12 C-chaos
//   unable to fail 1 | G13 C-determinism comparing a flight with itself 1 | G14 C-caps at or under the cap 1 | G15 C-replicates blind to
//   A3 1 | G16 C-stepB without its B-start test 1 | G17 a flight at the cap only over it 1 | G18 the BB watches not added to C-caps 1 |
//   G19 the run's nudge 1e-6 1 | G20 at the cap within 1e-9 1
//   The command (tools/roundhouse/box3dBothShipsRun.mjs): G21 no refusal of an existing file 1 | G22 the readings printed 1 | G23 the file
//   written twice 1
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as RB from "../../physics/mechanics/rigidBody6dof.mjs";
import * as P6 from "../../brain/pilot6dofPolicy.mjs";
import * as OS from "./orientationStep.mjs";
import * as SB3 from "./sixdofBox3d.mjs";
import * as PJ from "./box3dPdJoust.mjs";
import * as L from "./box3dBothShips.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const t0 = Date.now(), J = JSON.stringify;
const guard = (n, e) => ok(`section ${n} ran without throwing`, false, String(e && e.stack || e).split("\n").slice(0, 2).join(" ").slice(0, 240));
const src = (f) => fs.readFileSync(path.join(ENG, f), "utf8");
const MINI = Object.freeze({ seeds: [98001, 98002, 98003, 98004], nudge: 1e-3 });   // none registered
const lyingWorld = (w, patch) => new Proxy(w, { get: (t, k) => (k in patch ? patch[k] : typeof t[k] === "function" ? t[k].bind(t) : t[k]) });
const liarOf = (b3, patchOf) => new Proxy(b3, { get: (t, k) => (k === "createWorld" ? (o) => { const w = t.createWorld(o); return lyingWorld(w, patchOf(w)); } : typeof t[k] === "function" ? t[k].bind(t) : t[k]) });
const read = (r) => ({ outcome: OS.outcomeOf(r), fingerprint: r.fingerprint, ticks: r.ticks });

console.log("1. THE DUEL'S stepB (brain/pilot6dofPolicy.mjs)");
let b3 = null;
try {
    b3 = await SB3.box3dReady();
    const pilots = OS.loadPilots(), u = L.cUnchanged(pilots);
    ok("!! C-unchanged: given no stepper, the duel is byte for byte what it was -- sixdof-box3d's ten anchor duels at seed 93100 and the 1,000 steps' digest",
        u.ok && SB3.SCENARIOS.every((sc) => SB3.PILOT_IDS.every((id) => u.fingerprints[sc][id] === SB3.ANCHOR.fingerprints[sc][id])) && u.digest === "5ba918e7cde707f7");
    const sb = L.cStepB();
    ok("!! C-stepB: stepB as rigidBody6dof.step() itself flies the plain duel to the bit, called once a tick, and the first body it is handed is B's start (at +gap/2, turned half about y), not A's",
        sb.ok && sb.calls === sb.ticks && sb.isB, `${sb.calls} calls, ${sb.ticks} ticks`);
    const swapped = L.cStepB(93100, "joust", (a, b, o) => P6.duel(a, b, { ...o, stepA: o.stepB, stepB: null })), dropped = L.cStepB(93100, "joust", (a, b, o) => P6.duel(a, b, { ...o, stepB: null }));
    ok("!! C-stepB can fail: on a duel that moves A with stepB it fails, and on one that ignores stepB", !swapped.ok && !swapped.isB && !dropped.ok && dropped.calls === 0, `swapped: ${J(swapped)}`);
    const rec = {}, handedB = [], seed = 94004;
    P6.duel("autopilot", "autopilot", { seed, scenario: "joust", record: rec, stepB: (b, a, h) => { handedB.push({ force: [...a.force], torque: [...a.torque] }); return RB.step(b, a, h); } });
    ok("!! stepB is handed B's own inputs, not A's: tick by tick they are not the inputs the duel's record holds for A, and there is one a tick",
        handedB.length === rec.inputs.length && handedB.length > 0 && J(handedB) !== J(rec.inputs) && J(handedB[0]) !== J(rec.inputs[0]), `${handedB.length} inputs`);
    let ca = 0, cb = 0;
    const both = P6.duel("autopilot", "autopilot", { seed, scenario: "joust", stepA: (b, a, h) => { ca++; return RB.step(b, a, h); }, stepB: (b, a, h) => { cb++; return RB.step(b, a, h); } }), plain = P6.duel("autopilot", "autopilot", { seed, scenario: "joust" });
    ok("!! given stepA and stepB both, each ship is moved by its own: as rigidBody6dof.step() each, the plain duel to the bit, each called once a tick", J(both) === J(plain) && ca === plain.ticks && cb === plain.ticks, `${ca} and ${cb} calls`);
    const bb = () => L.fight(b3, "autopilot", seed, "joust", "BB"), x = bb(), y = bb(), a3 = L.fight(b3, "autopilot", seed, "joust", "A3");
    ok("!! with both ships on box3d the duel is another duel than E's and than A's alone on box3d, and the same one twice", J(x) === J(y) && x.fingerprint !== plain.fingerprint && x.fingerprint !== a3.fingerprint,
        `E ${plain.fingerprint}, A3 ${a3.fingerprint}, BB ${x.fingerprint}`);
    const duel = src("brain/pilot6dofPolicy.mjs");
    ok("the duel takes stepB with a default that is off, after stepA, and uses each for its own ship only",
        /record = null, stepA = null, stepB = null \} = \{\}\) \{/.test(duel) && /s\.body = stepA && s === A \? stepA\(s\.body, acc, dt\) : stepB && s === B \? stepB\(s\.body, acc, dt\) : RB\.step\(s\.body, acc, dt, stepOpt\);/.test(duel));
} catch (e) { guard(1, e); }

console.log("\n2. THE LIBRARY HOLDS THE REGISTRATION");
try {
    const P = await import("../ship/sixdofPageFight.mjs");
    const used = new Set([...P6.TRAIN_SEEDS, ...P6.HELD_OUT_SEEDS, ...P6.AUDIT_SEEDS, ...P6.LEAGUE_TRAIN_SEEDS, ...P6.LEAGUE_HELD_OUT_SEEDS, ...P6.LEAGUE_AUDIT_SEEDS, ...P6.CLOSE_TRAIN_SEEDS,
        ...P6.CLOSE_HELD_OUT_SEEDS, ...P6.CLOSE_AUDIT_SEEDS, ...P6.BASELINE_SEEDS, ...P.CONTROL_DUEL_SEEDS, ...OS.FIGHT.seeds, OS.ANCHOR.seed, ...SB3.FIGHT.seeds, ...SB3.TURN.seeds, SB3.ANCHOR.seed,
        94001, 94002, 94003, 94004, ...PJ.FIGHT.seeds, 97001, 97002, 97003, 97004, 97005, 97006]);
    const fresh = Array.from({ length: 100 }, (_, i) => 96001 + i);
    ok("!! the seeds are the registration's: 96001-96100 of each scenario, none flown by an earlier 6-DOF round, and the miniature's none of them nor any round's",
        J(L.FIGHT.seeds) === J(fresh) && fresh.every((s) => !used.has(s)) && MINI.seeds.every((s) => !fresh.includes(s) && !used.has(s)) && J(L.SCENARIOS) === J(["standoff", "joust"]));
    ok("!! the pilots, the ways and the numbers are the registration's: the five on the page's Load Pilots panel by their hashes, E, BB, A3 and E', the nudge 1e-9 m, p < 0.01, box3d's caps",
        L.PILOTS === OS.PILOTS && J(OS.loadPilots().map((p) => p.hash)) === J([null, "215e26d9", "32789ff9", "360580a7", "0ffd8554"]) && J(OS.PILOTS.map((p) => p.hash)) === J(P.PILOTS.map((p) => p.hash)) &&
        J(L.WAYS) === J(["E", "BB", "A3", "E'"]) && L.FIGHT.nudge === 1e-9 && L.ALPHA === 0.01 && L.CAPS === PJ.CAPS && L.CAPS.speed === 400);
    const lib = src("tools/roundhouse/box3dBothShips.mjs");
    ok("!! the run's defaults are the registration's: all five pilots, the 100 seeds, the 1e-9 m nudge, C-determinism on the first seed; the outcome, the comparison and the reading are the orientation round's own",
        /export async function run\(\{ pilots = OS\.loadPilots\(\), seeds = FIGHT\.seeds, nudge = FIGHT\.nudge \} = \{\}\) \{/.test(lib) && /measure\(b3, pilots, seeds, \{ nudge \}\)/.test(lib) &&
        /cDeterminism\(b3, pilots, seeds\[0\]\)/.test(lib) && /OS\.outcomeOf\(r\)/.test(lib) && /OS\.compare\(flights\.E, flights\.BB\)/.test(lib) && /reading: OS\.readingOf\(bb\)/.test(lib));
    let refused = ""; try { L.fight(b3, "autopilot", 1, "joust", "B3"); } catch (e) { refused = e.message; }
    ok("a way the registration does not name is refused", /no such way/.test(refused), refused);
} catch (e) { guard(2, e); }

console.log("\n3. THE CONTROLS: FLOWN WHERE THE REGISTRATION FIXES THEM, AND EACH ABLE TO FAIL");
try {
    const rep = L.cReplicates(b3), angShort = liarOf(b3, (w) => ({ angularImpulse: (i, v) => w.angularImpulse(i, v.map((x) => x * 0.99)) }));
    ok("!! C-replicates, flown: sixdof-box3d's committed flights of the PD autopilot's joust at seed 93001, on E and with A on box3d, fly again to the bit -- and on a box3d whose angular impulse is 1% short, not",
        rep.ok && rep.sameE && rep.sameA3 && rep.seed === 93001 && !L.cReplicates(angShort).ok);
    const box = SB3.cBox3d(b3);
    ok("C-box3d, flown: box3d is what is flown, and the ship's damping is zero by its effect", box.ok && box.backend === "box3d" && box.shipSpeed === 1 && box.shipSpin === 1);
    const capOk = (maxSpeed, maxSpin, ticks = 9) => L.cCaps({ ticks, maxSpeed, maxSpin, allF32: true }).ok;
    ok("!! C-caps can fail: it holds under 400 m/s and 23.6 rad/s, and fails at either cap, or with no tick watched", capOk(9.5, 5.2) && !capOk(400, 5.2) && !capOk(9.5, L.CAPS.spin) && !capOk(9.5, 5.2, 0));
    const cell = (p) => ({ chaos: { p } });
    ok("!! C-chaos's predicate: it holds when every cell's nudge has p at or above 0.01, and not when one is below, or when there are no cells",
        L.chaosHolds([cell(1), cell(0.01)]) && !L.chaosHolds([cell(1), cell(0.0099)]) && !L.chaosHolds([]));
    const noisy = liarOf(b3, (wd) => ({ step: (dt, n) => { wd.step(dt, n); const V = wd.readVelocities(), v = [V[0], V[1], V[2]]; wd.setVelocity(0, [v[0] + (Math.random() - 0.5) * 1e-3, v[1], v[2]]); } }));
    const one = OS.loadPilots().slice(0, 1), det = L.cDeterminism(b3, one, MINI.seeds[0]), detNoisy = L.cDeterminism(noisy, one, MINI.seeds[0]);
    ok("!! C-determinism can fail: both ships on box3d, flown twice on an unregistered seed in both scenarios, are the same -- and on a box3d that adds noise, not", det.ok && det.flights === 4 && !detNoisy.ok, J(detNoisy.off));
} catch (e) { guard(3, e); }

console.log("\n4. THE COMMAND (read from its source; never run here)");
try {
    const code = src("tools/roundhouse/box3dBothShipsRun.mjs").replace(/\/\/.*$/gm, "");
    ok("!! the command refuses an existing results file before it runs anything, writes the file once, and prints only where it is -- no reading, no statistic",
        code.indexOf("refuseExisting(results)") > 0 && code.indexOf("refuseExisting(results)") < code.indexOf("await run()") && (code.match(/writeFileSync/g) || []).length === 1 &&
        !/readings|\.reading|\.cells|\.controls|outcome|fingerprint|console\.log\([^`]*result/.test(code) && /DEFAULT_RESULTS/.test(code));
    ok("the registered results file is the command's default, beside the registration's note", L.DEFAULT_RESULTS === path.join(ENG, "physics", "mechanics", "box3dBothShipsResults.json") && L.REGISTRATION === "physics/mechanics/BOX3D_BOTH_SHIPS_WIP.md");
} catch (e) { guard(4, e); }

console.log("\n5. A MINIATURE (three pilots, seeds 98001-98004, a 1e-3 m nudge -- none of it registered)");
try {
    const pilots = OS.loadPilots().slice(0, 3), r = await L.run({ pilots, ...MINI }), C = r.controls;
    ok("!! the miniature has every part the registration names: a cell per pilot and scenario, each flown four ways a seed, with BB, A3 and E' read against E; the controls; a reading per cell",
        J(Object.keys(r)) === J(["registration", "pilots", "ways", "cells", "controls", "readings"]) && J(Object.keys(C)) === J(["unchanged", "stepB", "replicates", "box3d", "caps", "chaos", "determinism"]) &&
        r.cells.length === 6 && r.cells.every((c) => J(Object.keys(c.flights)) === J(["E", "BB", "A3", "E'"]) && Object.values(c.flights).every((f) => f.length === 4)) && r.readings.length === 6 &&
        J(r.cells.map((c) => [c.pilot, c.scenario])) === J(pilots.flatMap((p) => L.SCENARIOS.map((sc) => [p.id, sc]))));
    ok("!! ...its controls hold but one: the anchors, stepB, the replicated flights, box3d, chaos and determinism -- and C-caps does not, as the build found: the League pilot's joust spins its ship to box3d's cap",
        C.unchanged.ok && C.stepB.ok && C.replicates.ok && C.box3d.ok && C.chaos.ok && C.determinism.ok && C.determinism.flights === 12 && !C.caps.ok && C.caps.maxSpin >= L.CAPS.spin - L.AT_CAP && C.caps.maxSpeed < L.CAPS.speed,
        `caps ${C.caps.maxSpeed.toFixed(1)} m/s ${C.caps.maxSpin.toFixed(4)} rad/s over ${C.caps.ticks} ticks`);
    // THE FINDING, WHILE BUILDING: the League pilot's joust is the cell box3d's spin cap reaches, in every one of its flights; no other cell comes near it
    const capped = r.cells.filter((c) => c.caps.BB.atCap > 0 || c.caps.A3.atCap > 0).map((c) => `${c.pilot}/${c.scenario}`), lj = r.cells.find((c) => c.pilot === "league" && c.scenario === "joust");
    ok("!! THE FINDING, WHILE BUILDING: box3d's spin cap (0.25 pi / dt, 23.56 rad/s) is reached in the League pilot's joust and in none of the miniature's other cells -- on all four miniature seeds, with both ships on box3d and with A alone; every other cell's top spin is under 10 rad/s",
        J(capped) === J(["league/joust"]) && lj.caps.BB.atCap === 4 && lj.caps.A3.atCap === 4 && r.cells.filter((c) => c !== lj).every((c) => c.caps.BB.maxSpin < 10 && c.caps.A3.maxSpin < 10) &&
        r.cells.every((c) => c.caps.BB.ticks > 0 && c.caps.A3.ticks > 0), J(r.cells.map((c) => `${c.pilot}/${c.scenario} ${c.caps.BB.maxSpin.toFixed(2)}`)));
    const tallyOf = (rs) => ({ win: rs.filter((x) => x.outcome === "win").length, loss: rs.filter((x) => x.outcome === "loss").length, draw: rs.filter((x) => x.outcome === "draw").length });
    const re = r.cells.every((c) => J(c.bb) === J(OS.compare(c.flights.E, c.flights.BB)) && J(c.a3) === J(OS.compare(c.flights.E, c.flights.A3)) && J(c.chaos) === J(OS.compare(c.flights.E, c.flights["E'"])) &&
        c.reading === OS.readingOf(c.bb) && c.a3Reading === OS.readingOf(c.a3) && c.chaosReading === OS.readingOf(c.chaos) && L.WAYS.every((w) => J(c.tally[w]) === J(tallyOf(c.flights[w]))) &&
        ["BB", "A3", "E'"].every((w) => c.moved[w] === c.flights[w].filter((f, i) => f.fingerprint !== c.flights.E[i].fingerprint).length));
    ok("!! each cell re-derived from its flights: BB, A3 and E' against E by the orientation round's comparison, the readings, the tallies, the moved flights; the readings list is the cells', in order",
        re && J(r.readings) === J(r.cells.map((c) => ({ pilot: c.pilot, scenario: c.scenario, reading: c.reading, better: c.bb.better, worse: c.bb.worse, p: c.bb.p }))));
    const s = MINI.seeds[1], pl = pilots[2];
    const again = { E: read(P6.duel(pl.pilot, "autopilot", { seed: s, scenario: "joust" })), "E'": read(P6.duel(pl.pilot, "autopilot", { seed: s, scenario: "joust", nudge: MINI.nudge })),
        A3: SB3.withStepper(b3, (sa) => read(P6.duel(pl.pilot, "autopilot", { seed: s, scenario: "joust", stepA: sa.step }))),
        BB: SB3.withStepper(b3, (sa) => SB3.withStepper(b3, (sb) => read(P6.duel(pl.pilot, "autopilot", { seed: s, scenario: "joust", stepA: sa.step, stepB: sb.step })))) };
    const c = r.cells.find((x) => x.pilot === pl.id && x.scenario === "joust");
    ok("!! one seed of one cell re-flown here, four ways, from the gate's own steppers, is the file's to the bit; and the four are four duels",
        L.WAYS.every((w) => J(again[w]) === J(c.flights[w][1])) && new Set(L.WAYS.map((w) => again[w].fingerprint)).size === 4, L.WAYS.map((w) => `${w} ${again[w].fingerprint}`).join(", "));
    const back = JSON.parse(L.serialize(r));
    ok("the results serialize to one JSON file that parses back to the same result", J(back) === J(JSON.parse(JSON.stringify(r))) && L.serialize(r).endsWith("\n"));
} catch (e) { guard(5, e); }

console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)`);
process.exitCode = fails ? 1 : 0;
