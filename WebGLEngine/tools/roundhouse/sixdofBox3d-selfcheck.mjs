// WebGLEngine/tools/roundhouse/sixdofBox3d-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/roundhouse/sixdofBox3d-selfcheck.mjs      (~2 s)
//
// THE GATE OF THE 6-DOF-ON-box3d ROUND (physics/mechanics/SIXDOF_BOX3D_WIP.md, registered before any code): the box3d stepper, the duel's new
// `stepA`, and the library that flies the round. It never runs the registered round or its command: it flies the registration's controls,
// which the registration fixed, an analytic key, and a miniature on seeds the registration does not use.
//   1  the stepper (physics/mechanics/rigidBody6dofBox3d.mjs): it is box3d, damping zero by its effect, linear and angular; the hull's moments;
//      one tick of torque about each body axis and one of force; a free ship keeps its spin and speed; a slow one is not put to sleep -- and the
//      finding that made the stepper build a world each tick (a kept world sleeps a slow ship); a world a tick integrates as a kept world does;
//      the contract; the spin's frame on the way in and out; the substeps reaching box3d; and the key: a constant torque about the symmetry
//      axis turns the ship ahead of the exact turn by the first-order lead of giving each tick's change at its start
//   2  the duel's `stepA`: off unless given (the anchors); it moves A and only A, handed A's own body and inputs; with box3d, another duel
//   3  the library holds the registration: the ship, the substeps, the seeds and their freshness, the pilots, the numbers, the reading, the
//      run's defaults -- and EACH CONTROL CAN FAIL: each fails on a box3d made to tell the one lie it guards against
//   4  the command: refuses an existing results file, writes it once, prints no reading
//   5  a miniature on other seeds: every part the registration names, its controls, M1 re-derived and M2 re-flown here by the gate's own code,
//      each reading re-derived from its flights, and a file that parses back
//
// SABOTAGED (2026-11-04, through the byte-safe runner, each restored byte for byte): 48 sabotages, every one red by name. Before they were run,
// reading the gate's first version against this list found 21 that none of its rows could see (G18 only its source row), and rows or checks
// were written for them, marked "written for" below. That those 21 would have gone 0 red is read from the first version, not measured.
//   The stepper (physics/mechanics/rigidBody6dofBox3d.mjs):
//     G1  the ship keeps linear damping 0.05 ............ 8 red (C-box3d, C-free, C-awake, the finding, the lying-box3d rows, the miniature)
//     G2  the ship keeps angular damping 0.05 ........... 8 red (C-box3d, C-free, the spin's frame, the key, ...)
//     G3  the density 8 times too high .................. 5 red (C-inertia, C-impulse, the key, ...)
//     G4  gravity on .................................... 8 red (C-box3d, C-free, C-awake, ...)
//     G5  the orientation set in w,x,y,z order .......... 7 red (C-impulse, C-free, the spin's frame, the key, ...)
//     G6  the spin set in the body frame ................ 1 red (the spin's frame, written for it: every other ship here spins about an axis
//                                                                 its orientation leaves where it was)
//     G7  the force not turned into the world frame ..... 3 red (C-impulse, ...)
//     G8  the torque not turned into the world frame .... 3 red (C-impulse, ...)
//     G9  the linear impulse without dt ................. 3 red (C-impulse, ...)
//     G10 the angular impulse without dt ................ 4 red (C-impulse, the key, ...)
//     G11 the substeps never reaching box3d (always 1) .. 2 red (the substeps row, written for it; the spin's frame)
//     G12 SUBSTEPS 1 .................................... 4 red (the substeps row, the ship row, the miniature, the spin's frame)
//     G13 the orientation read back in x,y,z,w order .... 7 red
//     G14 the spin read back in the world frame ......... 4 red (C-impulse, the spin's frame, ...)
//     G15 one world kept by default ..................... 2 red (C-awake, the miniature's controls)
//     G16 the reads left as views into the wasm heap .... 2 red (the contract's plain-array check, written for it; ...)
//   The duel (brain/pilot6dofPolicy.mjs):
//     G17 stepA moving both ships ....................... 3 red (A and only A, A's own inputs, the source row)
//     G18 stepA moving B instead of A ................... 2 red (A's own inputs, written for it: a stepper that is rigidBody6dof.step() is
//                                                                 called once a tick whichever ship it moves; the source row)
//     G19 stepA ignored ................................. 6 red
//     G20 rigidBody6dof's default back to euler ......... 2 red (C-unchanged, the miniature's controls)
//   The library (tools/roundhouse/sixdofBox3d.mjs):
//     G21 M1's seeds from 93002 ......................... 1 red (the seeds)
//     G22 M1's reference at a 32nd ...................... 2 red (the numbers, M1 re-derived)
//     G23 the nudge 1e-8 ................................ 1 red (the numbers)
//     G24 the reference not subdivided .................. 2 red (E off the reference in the jousts and M1 re-derived, written for it)
//     G25 Q0 replayed on the default .................... 2 red
//     G26 B3 replayed on the engine ..................... 2 red (B3 a replay of its own and M1 re-derived, written for it: the miniature
//                                                                 asked only that B3's angle be finite)
//     G27 the peak spin taken from E .................... 1 red (M1 re-derived, written for it)
//     G28 the B3 fight not on box3d ..................... 3 red
//     G29 the nudge dropped ............................. 2 red
//     G30 the reading taken from the chaos .............. 1 red (the source row; two seeds cannot reach p < 0.01, so no miniature reading can
//                                                                 tell the two apart -- the verdict re-derives every reading from the file)
//     G31 the chaos compared with B3 .................... 1 red (the readings re-derived, written for it)
//     G32 C-box3d without its linear damping test ....... 1 red (C-box3d can fail) } the lying-box3d rows, written for these: on the real box3d
//     G33 C-box3d without its angular damping test ...... 1 red (C-box3d can fail) } every control passes, so a control that cannot fail looks
//     G34 C-inertia to 1e-2 ............................. 1 red                    } the same as one that can. G33 also needed C-box3d to read
//     G35 C-impulse without its force half .............. 1 red                    } the angular damping by its effect, which it then did not:
//     G36 C-free without its spin half .................. 1 red                    } it read the linear alone, where the registration says "the
//     G37 C-free without its speed half ................. 1 red                    } ship's damping"
//     G38 C-awake unable to fail ........................ 1 red                    }
//     G39 C-determinism comparing a flight with itself .. 1 red                    }
//     G40 C-chaos unable to fail ........................ 1 red (its predicate, written for it)
//     G41 the run's nudge 1e-6 .......................... 1 red (the run's defaults, written for it)
//     G42 the run's reference at an 8th ................. 2 red (the run's defaults and M1 re-derived, written for it)
//     G43 C-inertia's tolerance 1e-3 .................... 2 red (the numbers, C-inertia can fail)
//     G44 M1's records all standoffs .................... 2 red (M1 re-derived, written for it; E off the reference in the jousts)
//     G45 M2's E flown by the PD autopilot .............. 1 red (M2 re-flown, written for it)
//   The command (tools/roundhouse/sixdofBox3dRun.mjs):
//     G46 no refusal of an existing file ................ 1 red
//     G47 the readings printed .......................... 1 red
//     G48 the file written twice ........................ 1 red
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as RB from "../../physics/mechanics/rigidBody6dof.mjs";
import * as P6 from "../../brain/pilot6dofPolicy.mjs";
import * as B3M from "../../physics/mechanics/rigidBody6dofBox3d.mjs";
import * as OS from "./orientationStep.mjs";
import * as L from "./sixdofBox3d.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const t0 = Date.now(), J = JSON.stringify, near = (a, b, tol) => Math.abs(a - b) <= tol;
const guard = (n, e) => ok(`section ${n} ran without throwing`, false, String(e && e.stack || e).split("\n").slice(0, 2).join(" ").slice(0, 240));
const src = (f) => fs.readFileSync(path.join(ENG, f), "utf8");
const MINI = Object.freeze({ fightSeeds: [94001, 94002], turnSeeds: [94001], nudge: 1e-3 });   // none of these is registered
const zero = () => ({ force: [0, 0, 0], torque: [0, 0, 0] });

console.log("1. THE STEPPER (physics/mechanics/rigidBody6dofBox3d.mjs)");
let b3 = null;
try {
    b3 = await L.box3dReady();
    const box = L.cBox3d(b3);
    ok("!! C-box3d: it is box3d that is flown, adopted from the vendored wasm, its worlds say box3d and read and set spin -- and the ship's damping is zero, read back by its effect: coasting 1 s it keeps its 1 m/s and its 1 rad/s about its nose exactly, where a body left at the shim's 0.05 keeps 0.951 of each",
        box.ok && box.backend === "box3d" && box.angular === true && box.shipSpeed === 1 && near(box.defaultSpeed, 0.9512, 1e-3) && box.shipSpin === 1 && near(box.defaultSpin, 0.9512, 1e-3),
        `${box.shipSpeed} m/s and ${box.shipSpin} rad/s; the default's ${box.defaultSpeed.toFixed(4)} and ${box.defaultSpin.toFixed(4)}`);
    const inr = L.cInertia(b3);
    ok("!! C-inertia: box3d's moments of the hull box are boxInertia()'s for mass 8 and half-extents 1.6 x 0.7 x 0.7, to 1e-5 relative", inr.ok && inr.rel < 1e-5, `${inr.diag.map((v) => v.toFixed(6)).join(", ")}`);
    const imp = L.cImpulse(b3);
    ok("!! C-impulse: a ship at rest turned 90 degrees about z spins, after one tick of torque about each body axis in turn, at I^-1 torque x 1/30 s about that axis and no other; one tick of force along its nose moves it along world y at force x 1/30 s / 8 -- each to 1e-4",
        imp.ok && imp.axes.length === 3 && imp.relW < 1e-4 && imp.offV < 1e-4 && imp.wantV[1] > 0.066 && Math.abs(imp.wantV[0]) < 1e-12, `worst ${imp.relW.toExponential(1)} and ${imp.offV.toExponential(1)}`);
    const free = L.cFree(b3), awake = L.cAwake(b3);
    ok("!! C-free: a ship with no input, moving at 1 m/s and spinning at 2 rad/s about its symmetry axis, keeps both to 1e-4 over 30 s", free.ok, `${free.spinOff.toExponential(1)}, ${free.speedOff.toExponential(1)}`);
    ok("!! C-awake: a ship coasting at 0.01 m/s with no spin and no input still moves at 0.01 m/s after 10 s", awake.ok && awake.off < 1e-4, `${awake.vel[0].toPrecision(6)} m/s`);
    // THE FINDING: box3d puts a slow body to sleep, and a kept world shows it; the default stepper's world never lives long enough to
    const coast = (speed, keepWorld) => L.withStepper(b3, (st) => { let b = RB.createBody({ mass: L.SHIP.mass, I: L.shipI(), vel: [speed, 0, 0] }), z = null;
        for (let k = 0; k < 300; k++) { b = st.step(b, zero(), 1 / 30); if (z === null && b.vel[0] === 0) z = (k + 1) / 30; } return { end: b.vel[0], zeroedAt: z }; }, { keepWorld });
    const slowKept = coast(0.01, true), fastKept = coast(0.06, true), slowFresh = coast(0.01, false);
    ok("!! THE FINDING THAT MADE THE STEPPER BUILD A WORLD EACH TICK: with one world kept, box3d puts a ship coasting at 0.01 m/s to sleep at 0.5 s and zeroes it, and one at 0.06 m/s it never does; a world a tick keeps the slow ship's 0.01 m/s for the 10 s",
        slowKept.end === 0 && near(slowKept.zeroedAt, 0.5, 1e-9) && fastKept.zeroedAt === null && near(fastKept.end, 0.06, 1e-7) && slowFresh.zeroedAt === null && near(slowFresh.end, 0.01, 1e-7),
        `kept: zeroed at ${slowKept.zeroedAt} s; 0.06 m/s ${fastKept.end.toFixed(4)}; fresh ${slowFresh.end.toPrecision(4)}`);
    const tumble = (keepWorld) => L.withStepper(b3, (st) => { let b = RB.createBody({ mass: L.SHIP.mass, I: L.shipI(), w: [0.3, 0.2, 0.1] }); const out = [];
        for (let k = 0; k < 300; k++) { b = st.step(b, { force: [16, 0, 0], torque: [0.2, -0.1, 0.3] }, 1 / 30); out.push(b); } return out; }, { keepWorld });
    const fresh = tumble(false), kept = tumble(true);
    ok("!! a world built for each tick integrates exactly as a kept world does: 300 ticks of a thrusting, tumbling ship, every state the same to the bit",
        J(fresh) === J(kept) && fresh.length === 300 && fresh.every((b) => [...b.pos, ...b.vel, ...b.q, ...b.w].every(Number.isFinite)));
    const s0 = RB.createBody({ mass: L.SHIP.mass, I: L.shipI(), pos: [1, 2, 3], vel: [0.5, 0, 0], w: [0.1, 0, 0] }), copy = J(s0), one = L.withStepper(b3, (st) => st.step(s0, { force: [1, 0, 0], torque: [0, 0, 0.1] }, 1 / 30));
    let refused = ""; try { B3M.box3dStepper(b3, { half: [1, 1], mass: 8 }); } catch (e) { refused = e.message; }
    ok("the stepper keeps rigidBody6dof.step()'s contract: a new state of the same shape, in plain arrays copied out of box3d, the input untouched, a unit quaternion; it refuses half-extents that are not three, by name",
        J(Object.keys(one)) === J(Object.keys(s0)) && J(s0) === copy && near(Math.hypot(...one.q), 1, 1e-6) && one.mass === s0.mass && J(one.I) === J(s0.I) && /half-extents/.test(refused) &&
        ["pos", "vel", "q", "w"].every((k) => Array.isArray(one[k]) && one[k].length === (k === "q" ? 4 : 3)), refused);
    // THE SPIN'S FRAME: the ship turned 90 degrees about z, so its nose (body x) points along world y, spinning at 2 rad/s about that nose. One free
    // tick: its body-frame spin is still 2 rad/s about x, and it has turned 2/30 rad about WORLD y. A spin set or read in the wrong frame turns it
    // about world x instead (0.094 rad from the right answer) and reads its spin about body y.
    const h1 = 1 / 30, q90 = [Math.SQRT1_2, 0, 0, Math.SQRT1_2], th = 2 * h1;
    const mulQ = (a, b) => [a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3], a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2], a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1], a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]];
    const spun = L.withStepper(b3, (st) => st.step(RB.createBody({ mass: L.SHIP.mass, I: L.shipI(), q: q90, w: [2, 0, 0] }), zero(), h1)), aboutY = OS.angleBetween(spun.q, mulQ([Math.cos(th / 2), 0, Math.sin(th / 2), 0], q90));
    ok("!! the spin's frame: a ship turned 90 degrees about z, spinning at 2 rad/s about its nose, after one free tick still spins at 2 rad/s about its body x (to 1e-5) and has turned 2/30 rad about WORLD y, where its nose points (to 1e-5 rad)",
        Math.hypot(spun.w[0] - 2, spun.w[1], spun.w[2]) / 2 < 1e-5 && aboutY < 1e-5, `${aboutY.toExponential(1)} rad, w ${spun.w.map((v) => v.toFixed(6)).join(", ")}`);
    // THE SUBSTEPS REACH box3d: a tumbling ship's 30 ticks are the same with the substeps left out as with 4, and not the same with 1 (0.00065 rad apart, seen while building)
    const tumble30 = (opts) => L.withStepper(b3, (st) => { let b = RB.createBody({ mass: L.SHIP.mass, I: L.shipI(), w: [0.3, 0.2, 0.1] }); for (let k = 0; k < 30; k++) b = st.step(b, { force: [16, 0, 0], torque: [0.2, -0.1, 0.3] }, 1 / 30); return b; }, opts);
    const dflt = tumble30({}), four = tumble30({ substeps: 4 }), single = tumble30({ substeps: 1 });
    ok("!! the substeps reach box3d: a tumbling ship's 30 ticks with the substeps left out are those with 4, to the bit, and not those with 1",
        J(dflt) === J(four) && J(four) !== J(single) && OS.angleBetween(four.q, single.q) > 1e-5, `4 against 1: ${OS.angleBetween(four.q, single.q).toExponential(2)} rad`);
    // THE KEY: a constant torque about the symmetry axis (no gyroscopic term), 1 s from rest. The spin is alpha t; the exact turn is alpha t^2 / 2;
    // giving each tick's change at its start turns the ship alpha h t / 2 further -- the first-order lead the registration's P1 names.
    const tau = 0.5, alpha = tau / L.shipI()[0], h = 1 / 30, N = 30, T = N * h;
    const end = L.withStepper(b3, (st) => { let b = RB.createBody({ mass: L.SHIP.mass, I: L.shipI() }); for (let k = 0; k < N; k++) b = st.step(b, { force: [0, 0, 0], torque: [tau, 0, 0] }, h); return b; });
    const turned = 2 * Math.atan2(end.q[1], end.q[0]), exact = alpha * T * T / 2, lead = alpha * h * T / 2;
    ok("!! the key: a constant torque about the symmetry axis for 1 s from rest -- the spin is alpha t to 1e-5, and the ship has turned ahead of the exact alpha t^2 / 2 by alpha h t / 2 (within 2% of it), the lead of giving each tick's change at its start",
        near(end.w[0], alpha * T, 1e-5 * alpha * T) && Math.abs(end.w[1]) < 1e-9 && near(turned - exact, lead, 0.02 * lead), `turned ${turned.toFixed(6)} rad, exact ${exact.toFixed(6)}, lead ${(turned - exact).toFixed(6)} against ${lead.toFixed(6)}`);
} catch (e) { guard(1, e); }

console.log("\n2. THE DUEL'S stepA (brain/pilot6dofPolicy.mjs)");
try {
    const pilots = OS.loadPilots(), u = L.cUnchanged(pilots);
    ok("!! C-unchanged: given no stepper, the duel is byte for byte what it was -- the ten anchor duels (each pilot as A against the PD autopilot, seed 93100, both scenarios) have the registration's fingerprints, and the 1,000 steps its digest",
        u.ok && L.SCENARIOS.every((sc) => L.PILOT_IDS.every((id) => u.fingerprints[sc][id] === L.ANCHOR.fingerprints[sc][id])) && u.digest === "5ba918e7cde707f7", J(u.fingerprints));
    let calls = 0; const counting = (b, a, h) => { calls++; return RB.step(b, a, h); };
    const plain = P6.duel("autopilot", "autopilot", { seed: 94003, scenario: "joust" }), through = P6.duel("autopilot", "autopilot", { seed: 94003, scenario: "joust", stepA: counting });
    ok("!! stepA moves A and only A: a stepper that is rigidBody6dof.step() itself, counting its calls, flies the plain duel to the bit and is called once a tick", J(plain) === J(through) && calls === plain.ticks, `${calls} calls, ${plain.ticks} ticks`);
    const rec = {}, handed = []; let firstBody = null;
    P6.duel("autopilot", "autopilot", { seed: 94003, scenario: "joust", record: rec, stepA: (b, a, h) => { if (!firstBody) firstBody = J(b); handed.push({ force: [...a.force], torque: [...a.torque] }); return RB.step(b, a, h); } });
    ok("!! stepA is handed A's own body and A's own inputs: the first body it steps is A's start and the inputs it is given are, tick by tick, those the duel's `record` holds for A",
        firstBody === J(rec.start) && J(handed) === J(rec.inputs) && handed.length === rec.inputs.length && handed.length > 0, `${handed.length} inputs`);
    const onB3 = () => L.withStepper(b3, (st) => P6.duel("autopilot", "autopilot", { seed: 94003, scenario: "joust", stepA: st.step }));
    const x = onB3(), y = onB3();
    ok("!! with box3d as A's stepper the duel is another duel, and the same one twice", x.fingerprint !== plain.fingerprint && J(x) === J(y), `${plain.fingerprint} / ${x.fingerprint}`);
    ok("the duel takes stepA with a default that is off, and uses it for A only", /record = null, stepA = null \} = \{\}\) \{/.test(src("brain/pilot6dofPolicy.mjs")) && /stepA && s === A \? stepA\(s\.body, acc, dt\) : RB\.step\(s\.body, acc, dt, stepOpt\)/.test(src("brain/pilot6dofPolicy.mjs")));
} catch (e) { guard(2, e); }

console.log("\n3. THE LIBRARY HOLDS THE REGISTRATION");
try {
    const P = await import("../ship/sixdofPageFight.mjs");
    ok("!! the ship is the duel's (hull 1.6 x 0.7 x 0.7, mass 8), stepped with box3d's four substeps, the loader's own default, at the duel's 1/30 s",
        J(L.SHIP.half) === J(P6.HALF) && J(P6.HALF) === J([1.6, 0.7, 0.7]) && L.SHIP.mass === P6.SHIP_MASS && P6.SHIP_MASS === 8 && B3M.SUBSTEPS === 4 && /step\(dt = 1 \/ 60, substeps = 4\)/.test(src("physics/box3d/box3dLoader.js")) && L.DUEL_DT === 1 / 30);
    const used = new Set([...P6.TRAIN_SEEDS, ...P6.HELD_OUT_SEEDS, ...P6.AUDIT_SEEDS, ...P6.LEAGUE_TRAIN_SEEDS, ...P6.LEAGUE_HELD_OUT_SEEDS, ...P6.LEAGUE_AUDIT_SEEDS, ...P6.CLOSE_TRAIN_SEEDS,
        ...P6.CLOSE_HELD_OUT_SEEDS, ...P6.CLOSE_AUDIT_SEEDS, ...P6.BASELINE_SEEDS, ...P.CONTROL_DUEL_SEEDS, ...OS.FIGHT.seeds, OS.ANCHOR.seed]);
    ok("!! the seeds are the registration's: M1 93001-93010 and M2 93001-93040 of each scenario, the anchor 93100 among neither, none a seed an earlier 6-DOF round flew, and the miniature's none of them",
        J(L.TURN.seeds) === J(Array.from({ length: 10 }, (_, i) => 93001 + i)) && J(L.FIGHT.seeds) === J(Array.from({ length: 40 }, (_, i) => 93001 + i)) && !L.FIGHT.seeds.includes(L.ANCHOR.seed) &&
        L.FIGHT.seeds.every((s) => !used.has(s)) && !MINI.fightSeeds.some((s) => L.FIGHT.seeds.includes(s)) && J(L.SCENARIOS) === J(["standoff", "joust"]));
    ok("!! the pilots, the reading and the numbers are the registration's: the orientation round's five pilots (the page fight's own), the reference a 64th of the tick, the nudge 1e-9 m, p < 0.01, the controls' 1e-5 and 1e-4, 30 s and 10 s, 0.01 m/s",
        L.PILOTS === OS.PILOTS && J(OS.PILOTS.map((p) => p.hash)) === J(P.PILOTS.map((p) => p.hash)) && L.TURN.refSub === 64 && L.FIGHT.nudge === 1e-9 && L.ALPHA === 0.01 &&
        L.KEY.inertiaTol === 1e-5 && L.KEY.impulseTol === 1e-4 && L.KEY.freeTol === 1e-4 && L.KEY.freeT === 30 && L.KEY.awakeT === 10 && L.KEY.awakeSpeed === 0.01 && L.ANCHOR.at === "42845879");
    ok("the outcome, the comparison and the reading are the orientation round's own functions, so the two rounds read a fight the same way",
        /OS\.outcomeOf\(r\)/.test(src("tools/roundhouse/sixdofBox3d.mjs")) && /OS\.compare\(E, B\)/.test(src("tools/roundhouse/sixdofBox3d.mjs")) && /OS\.readingOf\(b3c\)/.test(src("tools/roundhouse/sixdofBox3d.mjs")));
    // EACH CONTROL CAN FAIL: box3d made to tell one lie at a time -- the real box3d with one world call changed -- and the control that guards
    // against that lie must say so. A control that cannot fail would pass the registered run whatever box3d did.
    const lyingWorld = (w, patch) => new Proxy(w, { get: (t, k) => (k in patch ? patch[k] : typeof t[k] === "function" ? t[k].bind(t) : t[k]) });
    const liar = (patchOf) => new Proxy(b3, { get: (t, k) => (k === "createWorld" ? (o) => { const w = t.createWorld(o); return lyingWorld(w, patchOf(w)); } : typeof t[k] === "function" ? t[k].bind(t) : t[k]) });
    const linDamp = liar((w) => ({ setDamping: (i, lin, ang) => w.setDamping(i, 0.05, ang) })), angDamp = liar((w) => ({ setDamping: (i, lin, ang) => w.setDamping(i, lin, 0.05) }));
    const saysJolt = liar(() => ({ backendId: () => "jolt" })), noSpin = liar(() => ({ supportsAngular: () => false })), fl = L.cFree(linDamp), fa = L.cFree(angDamp);
    ok("!! C-box3d and C-free can fail: each fails on a box3d that keeps the shim's linear damping while saying it set it to zero, and on one that keeps its angular damping -- C-free by the half each lie reaches -- and C-box3d fails on one that says it is Jolt and on one that cannot spin",
        L.cBox3d(linDamp).ok === false && L.cBox3d(angDamp).ok === false && fl.ok === false && fa.ok === false && fl.speedOff > 1e-3 && fl.spinOff < 1e-4 && fa.spinOff > 1e-3 && fa.speedOff < 1e-4 &&
        L.cBox3d(saysJolt).ok === false && L.cBox3d(noSpin).ok === false && L.cBox3d(b3).ok === true, `C-free off by ${fl.speedOff.toFixed(3)} of its speed, by ${fa.spinOff.toFixed(3)} of its spin`);
    const momentsOff = liar((w) => ({ inertia: (i) => { const I = w.inertia(i); return { ...I, diag: I.diag.map((v) => v * 1.001) }; } }));
    const angShort = L.cImpulse(liar((w) => ({ angularImpulse: (i, v) => w.angularImpulse(i, v.map((x) => x * 0.99)) }))), linShort = L.cImpulse(liar((w) => ({ impulse: (i, v) => w.impulse(i, v.map((x) => x * 0.99)) })));
    ok("!! C-inertia and C-impulse can fail: C-inertia on moments 0.1% off; C-impulse on an angular impulse 1% short, and on a linear one 1% short, each by its own half",
        L.cInertia(momentsOff).ok === false && angShort.ok === false && linShort.ok === false && angShort.relW > 1e-3 && angShort.offV < 1e-4 && linShort.offV > 1e-3 && linShort.relW < 1e-4,
        `${angShort.relW.toExponential(1)}, ${linShort.offV.toExponential(1)}`);
    const sleeps = liar((w) => ({ step: (dt, n) => { w.step(dt, n); const V = w.readVelocities(), v = [V[0], V[1], V[2]], W = w.readAngularVelocities(), sp = [W[0], W[1], W[2]]; if (Math.hypot(...v) < 0.05 && Math.hypot(...sp) < 1e-9) w.setVelocity(0, [0, 0, 0]); } }));
    const noisy = liar((w) => ({ step: (dt, n) => { w.step(dt, n); const V = w.readVelocities(), v = [V[0], V[1], V[2]]; w.setVelocity(0, [v[0] + (Math.random() - 0.5) * 1e-3, v[1], v[2]]); } }));
    const onePilot = OS.loadPilots().slice(0, 1);
    ok("!! C-awake and C-determinism can fail: C-awake on a box3d that puts a slow body to sleep at once, C-determinism on one that adds noise to each tick",
        L.cAwake(sleeps).ok === false && L.cDeterminism(noisy, onePilot, 94001).ok === false && L.cDeterminism(b3, onePilot, 94001).ok === true);
    ok("!! C-chaos's predicate: it holds when every cell's p is at or above 0.01, and not when one is below, or when there are no cells",
        L.chaosHolds([{ p: 0.5 }, { p: 0.01 }]) === true && L.chaosHolds([{ p: 0.5 }, { p: 0.0099 }]) === false && L.chaosHolds([]) === false);
    const lib = src("tools/roundhouse/sixdofBox3d.mjs");
    ok("!! the run's defaults are the registration's: all five pilots, M2's 40 seeds, M1's 10, the 1e-9 m nudge, M1's reference at TURN.refSub, C-determinism on M2's first seed, C-chaos its predicate",
        /export async function run\(\{ pilots = OS\.loadPilots\(\), fightSeeds = FIGHT\.seeds, turnSeeds = TURN\.seeds, nudge = FIGHT\.nudge \} = \{\}\) \{/.test(lib) &&
        /turn = m1\(b3, \{ seeds: turnSeeds \}\)/.test(lib) && /export function m1\(b3, \{ seeds = TURN\.seeds, refSub = TURN\.refSub \} = \{\}\)/.test(lib) &&
        /fights = m2\(b3, pilots, fightSeeds, \{ nudge \}\)/.test(lib) && /cDeterminism\(b3, pilots, fightSeeds\[0\]\)/.test(lib) && /chaos\.ok = chaosHolds\(chaos\.cells\)/.test(lib) && OS.loadPilots().length === 5);
} catch (e) { guard(3, e); }

console.log("\n4. THE COMMAND (read from its source; never run here)");
try {
    const cmd = src("tools/roundhouse/sixdofBox3dRun.mjs"), code = cmd.replace(/\/\/.*$/gm, "");
    ok("!! the command refuses an existing results file before it runs anything, writes the file once, and prints only where it is and B3's step time -- no reading, no statistic",
        code.indexOf("refuseExisting(results)") > 0 && code.indexOf("refuseExisting(results)") < code.indexOf("await run()") && (code.match(/writeFileSync/g) || []).length === 1 &&
        !/readings|\.reading|\.m1|\.m2|\.controls|outcome|fingerprint/.test(code) && /DEFAULT_RESULTS/.test(code));
    ok("the registered results file is the command's default, beside the registration's note", L.DEFAULT_RESULTS === path.join(ENG, "physics", "mechanics", "sixdofBox3dResults.json") && L.REGISTRATION === "physics/mechanics/SIXDOF_BOX3D_WIP.md");
} catch (e) { guard(4, e); }

console.log("\n5. A MINIATURE (two pilots, seeds 94001-94002, a 1e-3 m nudge -- none of it registered)");
try {
    const pilots = OS.loadPilots().slice(0, 2), r = await L.run({ pilots, ...MINI }), C = r.controls;
    ok("!! the miniature has every part the registration names: M1's duels with E, Q0 and B3 against the reference, M2's cells by pilot and scenario with A on E, on B3 and nudged, the controls, and a reading per cell",
        J(Object.keys(r)) === J(["registration", "pilots", "substeps", "m1", "m2", "controls", "readings"]) && J(Object.keys(C)) === J(["unchanged", "box3d", "inertia", "impulse", "free", "awake", "replay", "chaos", "determinism"]) &&
        r.m1.duels.length === 2 && r.m1.duels.every((d) => J(Object.keys(d.angle)) === J(["E", "Q0", "B3"]) && J(Object.keys(d.spinOff)) === J(["E", "Q0", "B3"])) && r.m2.cells.length === 4 &&
        r.m2.cells.every((c) => J(Object.keys(c.flights)) === J(["E", "B3", "E'"]) && c.flights.E.length === 2) && r.readings.length === 4 && r.substeps === 4);
    ok("!! ...its controls hold on its own seeds, and E is near the reference where Q0 is not: the replays land on the duels' A, every control above, each flight twice the same",
        C.unchanged.ok && C.box3d.ok && C.inertia.ok && C.impulse.ok && C.free.ok && C.awake.ok && C.replay.ok && C.determinism.ok && C.determinism.flights === 8 &&
        r.m1.duels.every((d) => d.angle.E < d.angle.Q0 / 100 && Number.isFinite(d.angle.B3) && Number.isFinite(d.spinOff.B3)) && r.m1.duels.filter((d) => d.scenario === "joust").every((d) => d.angle.E > 1e-12),
        J(r.m1.duels.map((d) => ({ E: d.angle.E, Q0: d.angle.Q0 }))));
    ok("!! in M1, B3 is a replay of its own: its angle and its spin off the reference are neither E's nor Q0's in any duel, and each duel's peak spin is above zero (that it is the reference's, the re-derivation below holds)",
        r.m1.duels.every((d) => d.angle.B3 !== d.angle.E && d.angle.B3 !== d.angle.Q0 && d.spinOff.B3 !== d.spinOff.E && d.spinOff.B3 !== d.spinOff.Q0 && d.peakSpin > 0));
    ok("!! the nudge reaches the fight, and so does box3d: with the miniature's 1e-3 m nudge, E' flies other duels than E, and so does B3",
        r.m2.cells.every((c) => c.flights["E'"].some((f, i) => f.fingerprint !== c.flights.E[i].fingerprint) && c.flights.B3.some((f, i) => f.fingerprint !== c.flights.E[i].fingerprint)));
    ok("!! each cell's reading is B3 against E and the chaos E' against E, re-derived here from the cell's own flights; the readings list is the cells', in order",
        r.m2.cells.every((c) => J(c.b3) === J(OS.compare(c.flights.E, c.flights.B3)) && J(c.chaos) === J(OS.compare(c.flights.E, c.flights["E'"])) && c.reading === OS.readingOf(c.b3) && c.chaosReading === OS.readingOf(c.chaos)) &&
        J(r.readings) === J(r.m2.cells.map((c) => ({ pilot: c.pilot, scenario: c.scenario, reading: c.reading, better: c.b3.better, worse: c.b3.worse, p: c.b3.p }))) && J(r.controls.chaos.cells.map((c) => c.p)) === J(r.m2.cells.map((c) => c.chaos.p)));
    // M1 AND M2 RE-DERIVED HERE, by the gate's own code, from the seeds and the pilots alone
    const playBy = (rec, stepFn, sub) => { let b = rec.start; const qs = [], ws = [], h = (1 / 30) / sub; for (const u of rec.inputs) { for (let k = 0; k < sub; k++) b = stepFn(b, { force: u.force, torque: u.torque }, h); qs.push(b.q); ws.push(b.w); } return { qs, ws, end: b }; };
    const m1Again = r.m1.duels.map((d) => {
        const rec = {}; P6.duel("autopilot", "autopilot", { seed: d.seed, scenario: d.scenario, record: rec });
        const ref = playBy(rec, (b, a, h) => RB.step(b, a, h), 64), peak = Math.max(...ref.ws.map((w) => Math.hypot(w[0], w[1], w[2])));
        const runs = { E: playBy(rec, (b, a, h) => RB.step(b, a, h), 1), Q0: playBy(rec, (b, a, h) => RB.step(b, a, h, { orientation: "euler" }), 1), B3: L.withStepper(b3, (st) => playBy(rec, st.step, 1)) };
        const ang = (x) => x.qs.reduce((m, q, i) => Math.max(m, OS.angleBetween(q, ref.qs[i])), 0), spin = (x) => x.ws.reduce((m, w, i) => Math.max(m, Math.hypot(w[0] - ref.ws[i][0], w[1] - ref.ws[i][1], w[2] - ref.ws[i][2])), 0) / peak;
        return { ticks: rec.inputs.length, peakSpin: peak, angle: { E: ang(runs.E), Q0: ang(runs.Q0), B3: ang(runs.B3) }, spinOff: { E: spin(runs.E), Q0: spin(runs.Q0), B3: spin(runs.B3) }, replayIsDuel: J(runs.E.end) === J(rec.end) };
    });
    ok("!! M1 re-derived here from its seeds alone -- A's record from the PD autopilot's own duel, E, Q0 and B3 replayed, the reference at a 64th of the tick -- is the file's, every angle, spin and peak to the bit",
        r.m1.duels.every((d, i) => J({ ticks: d.ticks, peakSpin: d.peakSpin, angle: d.angle, spinOff: d.spinOff, replayIsDuel: d.replayIsDuel }) === J(m1Again[i])) && J(r.m1.duels.map((d) => [d.scenario, d.seed])) === J([["standoff", 94001], ["joust", 94001]]));
    const flyAgain = (pilot, seed, scenario, how) => { const read = (x) => ({ outcome: OS.outcomeOf(x), fingerprint: x.fingerprint, ticks: x.ticks });
        return how === "B3" ? L.withStepper(b3, (st) => read(P6.duel(pilot, "autopilot", { seed, scenario, stepA: st.step }))) : read(P6.duel(pilot, "autopilot", { seed, scenario, ...(how === "E'" ? { nudge: MINI.nudge } : {}) })); };
    ok("!! M2 re-flown here from its pilots and seeds alone: each cell's E, B3 and E' flights are the cell's own pilot's duels against the PD autopilot -- A on the engine's own, on box3d, and nudged 1e-3 m -- to the bit",
        r.m2.cells.every((c) => { const p = pilots.find((x) => x.id === c.pilot); return !!p && ["E", "B3", "E'"].every((how) => J(c.flights[how]) === J(MINI.fightSeeds.map((sd) => flyAgain(p.pilot, sd, c.scenario, how)))); }) &&
        J(r.m2.cells.map((c) => [c.pilot, c.scenario])) === J(pilots.flatMap((p) => L.SCENARIOS.map((sc) => [p.id, sc]))));
    ok("C-chaos in the file is its predicate of its own cells", r.controls.chaos.ok === L.chaosHolds(r.controls.chaos.cells) && r.controls.chaos.cells.length === 4);
    const again = JSON.parse(L.serialize(r));
    ok("the results serialize to one JSON file that parses back to the same result", J(again) === J(JSON.parse(JSON.stringify(r))) && L.serialize(r).endsWith("\n"));
} catch (e) { guard(5, e); }

console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)`);
process.exitCode = fails ? 1 : 0;
