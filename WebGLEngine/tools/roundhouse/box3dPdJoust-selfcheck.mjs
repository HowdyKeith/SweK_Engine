// WebGLEngine/tools/roundhouse/box3dPdJoust-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/roundhouse/box3dPdJoust-selfcheck.mjs      (~3 s)
//
// THE GATE OF THE PD-JOUST ROUND (physics/mechanics/BOX3D_PD_JOUST_WIP.md, registered before any code): D, box3d's scheme ported to
// double precision; the variants; the library that flies the round; and the rule that names the part. It never runs the registered
// round or its command. It flies the registration's controls where the registration fixes them, and a miniature on seeds the
// registration does not use.
//   1  D (physics/mechanics/rigidBody6dofBox3dScheme.mjs): its pieces, each box3d's; its contract; C-model's key, flown; D is box3d to
//      float32 one tick at a time, at high spin, and is not with one substep; its caps are box3d's -- and THE FINDING: C-model's tumble,
//      as registered, does not hold, because box3d's scheme drifts the ship's angular momentum and amplifies float32's differences
//   2  the library holds the registration: the seeds and their freshness, the duel, the variants, the numbers, the run's defaults
//   3  the rule, as code, on made-up readings: every branch the registration names, its p, its half, and C-model's veto
//   4  the controls, flown where the registration fixes them (C-unchanged on sixdof-box3d's 40 committed seeds), and each able to fail
//   5  the command: refuses an existing results file, writes it once, prints no reading
//   6  a miniature on other seeds: every part the registration names, its controls, and M1, M2 and M3 re-derived by the gate's own code
//   7  THE VERDICT (2026-11-04), from the committed results file: the file byte for byte; M2's table and its seed-by-seed story; M1's
//      table; M3; the rule read both ways (as registered: nothing is named; with the one-tick tumble: box3d's scheme); the predictions;
//      the controls; the note's verdict holding every number; and a sample of the round flown again
//
// SABOTAGED (2026-11-04, through the byte-safe runner, each restored byte for byte): 48 sabotages, every one red by name in the end.
//   Reading the gate against the list before any ran found three that no row could see -- isF32 blind to one vector (G20), the watch
//   never recording a plain state (G37), C-model's composition (G33: its registered tumble always fails, so dropping the key from `ok`
//   changes nothing, and `okPerTick` was not asserted) -- and rows were written for them first. Then two went 0 RED, findings both:
//     G3  a sign turned in the first component of the gyroscopic residual: on the ship that term is h (w2 Iw3 - w3 Iw2), which is zero
//         because two of its moments are equal, so no test on the ship can see it. The gyroscopic row now also takes two bodies with three
//         different moments; G3 and the same turn in the other two components (G3b, G3c) are red
//     G26 the rule's p loosened to "at or under 0.01": the reading string already says p < 0.01, so the p test only acts on a record
//         whose reading and p disagree. The rule's cases now hold one; G26 is red
//   Not sabotaged, because no output in double could change: removing either of box3d's two linear clamps (the other always acts
//   first), and the finalize normalisation of a product of two unit quaternions.
//   D (physics/mechanics/rigidBody6dofBox3dScheme.mjs):
//     G1  the gyroscopic step skipped 4 | G2 its iteration count 0 5 | G3, G3b, G3c a residual's sign turned 1, 5, 5 | G4 the rotation update
//     exact, not first order 2 | G5 its half doubled 6 | G6 the angular impulse dropped 5 | G7 not turned into body coordinates 1 | G8 the
//     angular cap removed 1 | G9 the linear cap 300 m/s 1 | G10 the rotation cap 0.5 pi 1 | G11 one substep by default 4 | G12 the substep
//     rotation unnormalized 3 | G13 the spin read back in the start frame 2 | G14 the gyroscopic step in the start frame 2 | G15 the force
//     not turned into the world frame 1 | G16 the torque impulse without dt 5
//   The library (tools/roundhouse/box3dPdJoust.mjs):
//     G17 E32 not rounded 3 | G18 D32 rounding E 3 | G19 toF32 leaving the spin 3 | G20 isF32 ignoring the orientation 1 | G21 the fresh
//     seeds from 95002 1 | G22 M1 on nine seeds 1 | G23 M3 not sixdof-box3d's 40 2 | G24 the nudge 1e-8 1 | G25 the half a quarter 2 |
//     G26 the rule's p at or under 0.01 1 | G27 the rule's veto removed 1 | G28 its singles swapped 1 | G29 it blind to direction 1 |
//     G30 'either alone' vetoed whole 1 | G31 C-unchanged blind to box3d's flights 1 | G32 C-model's ratio at one 1 | G33 C-model
//     without its key 2 | G34 C-float32 without its plain half 1 | G35 C-caps at or under the cap 1 | G36 C-determinism comparing a flight
//     with itself 1 | G37 the watch never seeing a plain state 1 | G38 B3 flown by the engine 8 | G39 M3 counting every agreement 1 |
//     G40 M1's spin not over box3d's peak 1 | G41 M1's angle against itself 2 | G42 C-chaos unable to fail 1 | G43 the run's nudge 1e-6 1
//   The command (tools/roundhouse/box3dPdJoustRun.mjs): G44 no refusal of an existing file 1 | G45 the readings printed 1 | G46 the file
//   written twice 1
//
// SABOTAGE LOG, THE VERDICT (2026-11-04) -- section 7, the same runner, every file restored byte-identical (sha256): 19 designs, every one red
// by name, and every row of section 7 red under at least one.
//   V1 the file: a D flight a draw, not a loss 5 | V2 the file: an M1 angle a hundred times larger 4 | V3 the file: the tumble's spin gap
//   5e-5 3 | V4 the file: C-model holding 5 | V5 the file: E32's better 3 4 | V6 the file: the caps' top speed 401 3 | V7 the file: a nudged
//   flight moved 4 | V8 the file: M3's B3 changed 21 3 | V9 the note: D's tallies 1 | V10 the note: P4 called right 1 | V11 the note: the
//   registered reading turned round 1 | V12 the note: M1's D range 1 | V13 the note: a transition 1 | V14 the note: the caps' top speed 1 |
//   V15 the code: better and worse swapped 3 | V16 the code: D's gyroscopic step skipped 5 | V17 the code: toF32 leaving the spin 4 |
//   V18 the code: the duel ignoring stepA 5 | V19 the code: the rule's veto removed 4
"use strict";
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as RB from "../../physics/mechanics/rigidBody6dof.mjs";
import * as P6 from "../../brain/pilot6dofPolicy.mjs";
import * as DS from "../../physics/mechanics/rigidBody6dofBox3dScheme.mjs";
import * as B3M from "../../physics/mechanics/rigidBody6dofBox3d.mjs";
import * as OS from "./orientationStep.mjs";
import * as SB3 from "./sixdofBox3d.mjs";
import * as L from "./box3dPdJoust.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const t0 = Date.now(), J = JSON.stringify, near = (a, b, tol) => Math.abs(a - b) <= tol;
const guard = (n, e) => ok(`section ${n} ran without throwing`, false, String(e && e.stack || e).split("\n").slice(0, 2).join(" ").slice(0, 240));
const src = (f) => fs.readFileSync(path.join(ENG, f), "utf8");
const hyp = (a) => Math.hypot(a[0], a[1], a[2]), gap = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const MINI = Object.freeze({ fightSeeds: [97001, 97002, 97003, 97004], turnSeeds: [97001, 97002], foundSeeds: [97005, 97006], nudge: 1e-3 });   // none registered
const h = 1 / 30, I = SB3.shipI(), body = (o = {}) => RB.createBody({ mass: SB3.SHIP.mass, I, ...o }), zero = () => ({ force: [0, 0, 0], torque: [0, 0, 0] });
let rng = 12345; const rand = () => ((rng = (rng * 1103515245 + 12345) >>> 0) / 4294967296) * 2 - 1;
const unitQ = () => { const q = [rand(), rand(), rand(), rand()], l = Math.hypot(...q); return q.map((x) => x / l); };
// box3d made to tell one lie at a time (the real box3d with one world call changed), for the controls that must be able to fail
const lyingWorld = (w, patch) => new Proxy(w, { get: (t, k) => (k in patch ? patch[k] : typeof t[k] === "function" ? t[k].bind(t) : t[k]) });
const liarOf = (b3, patchOf) => new Proxy(b3, { get: (t, k) => (k === "createWorld" ? (o) => { const w = t.createWorld(o); return lyingWorld(w, patchOf(w)); } : typeof t[k] === "function" ? t[k].bind(t) : t[k]) });

console.log("1. D, box3d's SCHEME IN DOUBLE (physics/mechanics/rigidBody6dofBox3dScheme.mjs)");
let b3 = null;
try {
    b3 = await SB3.box3dReady();
    let worstRot = 0;
    for (let k = 0; k < 50; k++) { const q = unitQ(), v = [rand(), rand(), rand()]; worstRot = Math.max(worstRot, gap(DS.rotate(q, v), RB.rotateByQuat(q, v)), gap(DS.invRotate(q, v), RB.worldToBody(q, v))); }
    ok("D's rotations are the engine's: box3d's rotate and inverse rotate agree with rigidBody6dof's rotateByQuat and worldToBody to 1e-14 on 50 orientations, and mulQuat is the Hamilton product (i j = k, j i = -k)",
        worstRot < 1e-14 && J(DS.mulQuat([0, 1, 0, 0], [0, 0, 1, 0])) === J([0, 0, 0, 1]) && J(DS.mulQuat([0, 0, 1, 0], [0, 1, 0, 0])) === J([-0, 0, 0, -1]), worstRot.toExponential(1));
    const q1 = DS.integrateRotation([1, 0, 0, 0], [0.2, 0, 0]), turned = 2 * Math.atan2(q1[1], q1[0]);
    ok("!! b3IntegrateRotation is first order, as box3d's is: from the identity a step of 0.2 rad about x turns by 2 atan(0.1), not 0.2, and comes out a unit quaternion",
        near(turned, 2 * Math.atan(0.1), 1e-15) && Math.abs(turned - 0.2) > 1e-4 && near(Math.hypot(...q1), 1, 1e-15), `${turned.toFixed(9)} rad`);
    const M = [[2, 1, 0], [0.5, 3, 1], [1, -1, 4]], xs = [0.3, -0.7, 1.1], bs = [0, 1, 2].map((r) => M[0][r] * xs[0] + M[1][r] * xs[1] + M[2][r] * xs[2]), solved = DS.solve3(M, bs);
    ok("b3Solve3 is Cramer's rule on columns: it solves a column-major system to 1e-14, and gives zero for a singular one; b3NormalizeQuat gives the identity for a quaternion of no length",
        gap(solved, xs) < 1e-14 && J(DS.solve3([[1, 0, 0], [2, 0, 0], [0, 0, 1]], [1, 1, 1])) === J([0, 0, 0]) && J(DS.normalizeQuat([0, 0, 0, 0])) === J([1, 0, 0, 0]), gap(solved, xs).toExponential(1));
    // (and on a body with three different moments: the ship's two equal moments make one component's gyroscopic term vanish, so a
    // sign turned there could not show on the ship alone -- G3 found it)
    const inertia = [I[0], 0, 0, I[1], 0, I[2]], top = DS.gyroNewton(inertia, [2, 0, 0], h / 4), w1 = [0.3, 2, -1.5], hh = h / 4;
    const res = (Id, wa) => { const Iw = [Id[0] * wa[0], Id[1] * wa[1], Id[2] * wa[2]], c = [wa[1] * Iw[2] - wa[2] * Iw[1], wa[2] * Iw[0] - wa[0] * Iw[2], wa[0] * Iw[1] - wa[1] * Iw[0]];
        return hyp([Id[0] * (wa[0] - w1[0]) + hh * c[0], Id[1] * (wa[1] - w1[1]) + hh * c[1], Id[2] * (wa[2] - w1[2]) + hh * c[2]]); };
    const bodies = [[I[0], I[1], I[2]], [2, 5, 8], [8, 2, 5]], downs = bodies.map((Id) => { const w2 = DS.gyroNewton([Id[0], 0, 0, Id[1], 0, Id[2]], w1, hh); return res(Id, w2) / res(Id, w1); });
    ok("!! the gyroscopic step is one Newton iteration on I (w2 - w1) + h w2 x I w2 = 0: a symmetric top spinning about its axis is left alone, and for a tumbling ship, and for two bodies with three different moments, one iteration takes the residual down by more than a thousand times",
        J(top) === J([2, 0, 0]) && downs.every((x) => x < 1e-3) && bodies.every((Id) => res(Id, w1) > 0), downs.map((x) => x.toExponential(1)).join(", "));
    const s0 = body({ pos: [1, 2, 3], vel: [0.5, 0, 0], q: unitQ(), w: [0.1, 0.2, 0.3] }), copy = J(s0), one = DS.step(s0, { force: [1, 0, 0], torque: [0, 0, 0.1] }, h);
    ok("D keeps rigidBody6dof.step()'s contract: a new state of the same shape in plain arrays, the input untouched, a unit quaternion; it takes box3d's four substeps by default, the same as sixdof-box3d's stepper",
        J(Object.keys(one)) === J(Object.keys(s0)) && J(s0) === copy && near(Math.hypot(...one.q), 1, 1e-15) && ["pos", "vel", "q", "w"].every((k) => Array.isArray(one[k])) && DS.SUBSTEPS === 4 && B3M.SUBSTEPS === 4 &&
        J(one) === J(DS.step(s0, { force: [1, 0, 0], torque: [0, 0, 0.1] }, h, { substeps: 4 })));
    const tau = 0.5, alpha = tau / I[0], key = (f) => { let b = body(); for (let k = 0; k < 30; k++) b = f(b, { force: [0, 0, 0], torque: [tau, 0, 0] }, h); return 2 * Math.atan2(b.q[1], b.q[0]); };
    const kB = SB3.withStepper(b3, (st) => key(st.step)), kD = key(DS.step), kE = key(RB.step), lead = alpha * h * 1 / 2;
    ok("!! C-model's key, flown: a constant torque about the symmetry axis for 1 s from rest turns D and box3d the same to 1e-5 rad -- and both ahead of E by alpha h t / 2, within 2% of it",
        Math.abs(kD - kB) <= L.MODEL.keyTol && near(kD - kE, lead, 0.02 * lead) && near(kB - kE, lead, 0.02 * lead), `D ${kD.toFixed(9)}, box3d ${kB.toFixed(9)}, E ${kE.toFixed(9)}`);
    const f32 = L.toF32, starts = [[3, -4, 5], [6, 1, -2], [0.5, 7, 0.3], [-5, -5, 5]].map((w) => f32(body({ q: unitQ(), w, vel: [3, -1, 2] }))), acc = { force: [16, 0, 0], torque: [0.5, -0.3, 0.2] };
    const fid = (sub) => { let ws = 0, as = 0, ps = 0; for (const s of starts) { const b = SB3.withStepper(b3, (st) => st.step(s, acc, h)), d = DS.step(s, acc, h, { substeps: sub }); ws = Math.max(ws, gap(d.w, b.w) / hyp(b.w)); as = Math.max(as, OS.angleBetween(d.q, b.q)); ps = Math.max(ps, gap(d.pos, b.pos)); } return { ws, as, ps }; };
    const f4 = fid(4), f1 = fid(1);
    // (the spin's 1e-5 is float32's level over a tick's arithmetic at these spins: 3.9e-7 to 1.0e-6 was seen while building, on two sets of states)
    ok("!! one tick from the same state at high spin (5 to 9 rad/s, with a torque and a thrust), D is box3d to float32 -- its spin within 1e-5, its orientation within 1e-6 rad, its position within 1e-6 m -- and with one substep instead of four it is not, by more than 1e-3 rad",
        f4.ws < 1e-5 && f4.as < 1e-6 && f4.ps < 1e-6 && f1.as > 1e-3, `four: ${f4.ws.toExponential(1)}, ${f4.as.toExponential(1)} rad, ${f4.ps.toExponential(1)} m; one: ${f1.as.toExponential(1)} rad`);
    const fast = f32(body({ vel: [500, 0, 0], w: [40, 0, 0] })), fb = SB3.withStepper(b3, (st) => st.step(fast, zero(), h)), fd = DS.step(fast, zero(), h);
    ok("!! D's caps are box3d's: a ship set at 500 m/s and 40 rad/s comes out of one tick at 400 m/s and 0.25 pi / dt rad/s on both",
        near(hyp(fd.vel), 400, 1e-9) && near(hyp(fb.vel), 400, 1e-3) && near(hyp(fd.w), 0.25 * Math.PI / h, 1e-9) && near(hyp(fb.w), 0.25 * Math.PI / h, 1e-4) && L.CAPS.speed === 400 && near(L.CAPS.spin, 0.25 * Math.PI * 30, 1e-12),
        `box3d ${hyp(fb.vel).toFixed(3)} m/s, ${hyp(fb.w).toFixed(4)} rad/s`);
    // THE FINDING, WHILE BUILDING: C-model's tumble as registered fails, and why
    const cm = L.cModel(b3, { duels: [{ angle: { D: 1e-9, E: 1 } }] }), T = cm.tumble, PT = cm.perTick;
    const nT = Math.round(L.MODEL.tumbleT / h), mom = (s) => RB.rotateByQuat(s.q, [I[0] * s.w[0], I[1] * s.w[1], I[2] * s.w[2]]);
    const drift = (f) => { let b = body({ w: [...L.MODEL.tumbleW] }); const L0 = mom(b); for (let k = 0; k < nT; k++) b = f(b, zero(), h); return gap(mom(b), L0) / hyp(L0); };
    const dD = drift(DS.step), dB = SB3.withStepper(b3, (st) => drift(st.step)), dE = drift(RB.step);
    ok("!! THE FINDING, WHILE BUILDING: C-model's tumble as registered does not hold -- over 10 s D's spin is between 1e-4 and 1e-3 of its size off box3d's, and its orientation as far in rad -- while one tick at a time, from box3d's own states, D is box3d to 1e-5 and 1e-6 rad; the gap is the scheme's: box3d and D each drift the ship's angular momentum by more than 1e-3 of it over the 10 s, where E holds it to 1e-6",
        !T.ok && T.spinGap > 1e-4 && T.spinGap < 1e-3 && T.angleGap > 1e-4 && T.angleGap < 1e-3 && PT.ok && PT.spinGap < 1e-5 && PT.angleGap < 1e-6 && PT.ticks === nT && !cm.ok && cm.okPerTick &&
        dD > 1e-3 && dB > 1e-3 && dE < 1e-6, `tumble ${T.spinGap.toExponential(2)} / ${T.angleGap.toExponential(2)} rad; one tick ${PT.spinGap.toExponential(2)} / ${PT.angleGap.toExponential(2)} rad; drift D ${dD.toExponential(2)}, box3d ${dB.toExponential(2)}, E ${dE.toExponential(1)}`);
    const s1 = body({ q: unitQ(), w: [0.4, -0.2, 0.1], vel: [1, 2, 3] }), a1 = { force: [4, 0, 0], torque: [0.1, 0.2, -0.1] };
    const via = (id) => L.withVariant(b3, id, (f) => f(s1, a1, h));
    let refused = ""; try { L.withVariant(b3, "Q0", (f) => f); } catch (e) { refused = e.message; }
    ok("the variants are the registration's: E is rigidBody6dof.step(), D is the port, E32 and D32 each of them rounded to float32 after the tick, B3 is sixdof-box3d's stepper; toF32 rounds exactly the four vectors and isF32 tells; another name is refused",
        J(via("E")) === J(RB.step(s1, a1, h)) && J(via("D")) === J(DS.step(s1, a1, h)) && J(via("E32")) === J(L.toF32(RB.step(s1, a1, h))) && J(via("D32")) === J(L.toF32(DS.step(s1, a1, h))) &&
        J(via("B3")) === J(SB3.withStepper(b3, (st) => st.step(s1, a1, h))) && L.isF32(via("E32")) && !L.isF32(via("E")) && L.toF32(s1).mass === s1.mass && J(L.toF32(s1).I) === J(s1.I) &&
        J(L.VARIANTS) === J(["E", "D", "E32", "D32", "B3"]) && /no such variant/.test(refused), refused);
    const r32 = L.toF32(s1), odd = 0.1 + 1e-12;
    ok("isF32 sees one component that is not float32 in each of the four vectors, and the watch on a stepper counts its ticks, keeps its top speed and spin, and records a state that is not float32",
        L.isF32(r32) && ["pos", "vel", "q", "w"].every((k) => !L.isF32({ ...r32, [k]: [odd, ...r32[k].slice(1)] })) &&
        (() => { const wch = L.newWatch(), f = L.watched(wch, (b, a, hh) => RB.step(b, a, hh)); let b = s1, top = 0, spin = 0; for (let k = 0; k < 5; k++) { b = f(b, a1, h); top = Math.max(top, hyp(b.vel)); spin = Math.max(spin, hyp(b.w)); }
            const w32 = L.newWatch(), g = L.watched(w32, (bb, a, hh) => L.toF32(RB.step(bb, a, hh))); g(s1, a1, h);
            return wch.ticks === 5 && !wch.allF32 && wch.maxSpeed === top && wch.maxSpin === spin && w32.allF32 && w32.ticks === 1; })());
} catch (e) { guard(1, e); }

console.log("\n2. THE LIBRARY HOLDS THE REGISTRATION");
try {
    const P = await import("../ship/sixdofPageFight.mjs");
    const used = new Set([...P6.TRAIN_SEEDS, ...P6.HELD_OUT_SEEDS, ...P6.AUDIT_SEEDS, ...P6.LEAGUE_TRAIN_SEEDS, ...P6.LEAGUE_HELD_OUT_SEEDS, ...P6.LEAGUE_AUDIT_SEEDS, ...P6.CLOSE_TRAIN_SEEDS,
        ...P6.CLOSE_HELD_OUT_SEEDS, ...P6.CLOSE_AUDIT_SEEDS, ...P6.BASELINE_SEEDS, ...P.CONTROL_DUEL_SEEDS, ...OS.FIGHT.seeds, OS.ANCHOR.seed, ...SB3.FIGHT.seeds, ...SB3.TURN.seeds, SB3.ANCHOR.seed, 94001, 94002, 94003]);
    const fresh = Array.from({ length: 100 }, (_, i) => 95001 + i), mini = [...MINI.fightSeeds, ...MINI.turnSeeds, ...MINI.foundSeeds];
    ok("!! the seeds are the registration's: M2 95001-95100, M1 the first ten of them, M3 sixdof-box3d's own 93001-93040; no earlier 6-DOF round flew any of the fresh ones, and the miniature's are none of the round's",
        J(L.FIGHT.seeds) === J(fresh) && J(L.TURN.seeds) === J(fresh.slice(0, 10)) && J(L.FOUND.seeds) === J(SB3.FIGHT.seeds) && SB3.FIGHT.seeds[0] === 93001 && SB3.FIGHT.seeds.length === 40 &&
        fresh.every((s) => !used.has(s)) && mini.every((s) => !fresh.includes(s) && !L.FOUND.seeds.includes(s) && !used.has(s)));
    ok("!! the duel and the numbers are the registration's: the PD autopilot against itself in the joust at 1/30 s, the nudge 1e-9 m, p < 0.01, the half, C-model's hundredth, 1e-5 rad, 10 s at (0.3, 0.2, 0.1), 1e-4 and 1e-4 rad",
        L.PILOT === "autopilot" && L.SCENARIO === "joust" && L.DUEL_DT === 1 / 30 && L.FIGHT.nudge === 1e-9 && L.ALPHA === 0.01 && L.HALF === 0.5 && L.MODEL.ratio === 0.01 && L.MODEL.keyTol === 1e-5 &&
        L.MODEL.tumbleT === 10 && J(L.MODEL.tumbleW) === J([0.3, 0.2, 0.1]) && L.MODEL.spinTol === 1e-4 && L.MODEL.angleTol === 1e-4 && L.MODEL.keyT === 1);
    const lib = src("tools/roundhouse/box3dPdJoust.mjs");
    ok("!! the run's defaults are the registration's: M2's 100 seeds, M1's 10, M3's 40, the 1e-9 m nudge, all five pilots for C-unchanged's anchors, C-determinism on M2's first seed, and C-chaos its predicate",
        /export async function run\(\{ fightSeeds = FIGHT\.seeds, turnSeeds = TURN\.seeds, foundSeeds = FOUND\.seeds, nudge = FIGHT\.nudge, pilots = OS\.loadPilots\(\) \} = \{\}\) \{/.test(lib) &&
        /fights = m2\(b3, fightSeeds, \{ nudge \}\)/.test(lib) && /cDeterminism\(b3, fightSeeds\[0\], nudge\)/.test(lib) && /chaos = \{ \.\.\.cr, ok: chaosHolds\(cr\) \}/.test(lib) && OS.loadPilots().length === 5);
    ok("the outcome, the comparison and the reading are the orientation round's own, and E is flown as the duel flies with no stepper given",
        /OS\.outcomeOf\(r\)/.test(lib) && /OS\.compare\(E, flights\[id\]\)/.test(lib) && /OS\.readingOf\(c, ALPHA\)/.test(lib) && /if \(id === "E"\) return read\(P6\.duel\(PILOT, PILOT, \{ seed, scenario: SCENARIO, \.\.\.\(nudge \? \{ nudge \} : \{\}\) \}\)\);/.test(lib));
} catch (e) { guard(2, e); }

console.log("\n3. THE RULE, AS CODE, ON MADE-UP READINGS");
try {
    const R = (id, better, worse, p, reading = OS.readingOf({ better, worse, p }, L.ALPHA)) => ({ id, better, worse, p, net: worse - better, reading });
    const set = (b3r, d, e32, d32) => [R("D", ...d), R("E32", ...e32), R("D32", ...d32), R("B3", ...b3r), R("E'", 0, 0, 1)];
    const B = [1, 41, 1e-9], none = [5, 6, 1], half = (net, p = 1e-6) => [0, net, p];
    const cases = [
        ["B3 not below 0.01", set([3, 10, 0.092], half(40), none, none), true, "not replicated"],
        ["B3 better for A", set([30, 1, 1e-8], half(40), none, none), true, "not replicated"],
        ["B3 at exactly 0.01", set([3, 20, 0.01], half(40), none, none), true, "not replicated"],
        ["B3 a record that says worse for A at p 0.01", [R("D", ...half(40)), R("E32", ...none), R("D32", ...none), R("B3", 3, 20, 0.01, "changes it: worse for A"), R("E'", 0, 0, 1)], true, "not replicated"],
        ["D alone", set(B, half(40), none, none), true, "box3d's scheme"],
        ["D alone, C-model failing", set(B, half(40), none, none), false, "nothing is named"],
        ["E32 alone", set(B, none, half(30), none), true, "float32"],
        ["E32 alone, C-model failing", set(B, none, half(30), none), false, "float32"],
        ["both", set(B, half(40), half(25), none), true, "either alone"],
        ["both, C-model failing", set(B, half(40), half(25), none), false, "float32 (nothing is named for the scheme)"],
        ["the pair", set(B, none, none, half(35)), true, "the two together"],
        ["the pair, C-model failing", set(B, none, none, half(35)), false, "nothing is named"],
        ["none", set(B, none, none, none), true, "something else in box3d"],
        ["D at exactly half", set(B, half(20), none, none), true, "box3d's scheme"],
        ["D just under half", set(B, half(19), none, none), true, "something else in box3d"],
        ["D worse but not below 0.01", set(B, [0, 40, 0.02], none, none), true, "something else in box3d"],
        ["D better for A", set(B, [40, 0, 1e-9], none, none), true, "something else in box3d"],
    ];
    const got = cases.map(([n, rs, m]) => L.nameThePart(rs, m).label), bad = cases.filter((c, i) => got[i] !== c[3]).map((c, i) => `${c[0]}: ${got[cases.indexOf(c)]}`);
    ok("!! the rule names the part as the registration says, on seventeen made-up readings: not replicated (four ways, one a record whose reading and p disagree), each single, either alone, the two together, something else, the half to the seed, p at 0.01, and C-model's veto on every branch that names the scheme",
        bad.length === 0 && got.length === 17, bad.join(" | ") || "17 cases");
    const one = L.nameThePart(set(B, half(40), half(25), half(35)), true);
    ok("the rule reports which variants reproduce B3 and whether B3 replicated, beside what it names", one.replicated === true && J(one.reproduces) === J({ D: true, E32: true, D32: true }) && one.raw === "either alone" &&
        L.nameThePart(set([3, 10, 0.092], none, none, none), true).replicated === false);
} catch (e) { guard(3, e); }

console.log("\n4. THE CONTROLS: FLOWN WHERE THE REGISTRATION FIXES THEM, AND EACH ABLE TO FAIL");
try {
    const pilots = OS.loadPilots(), seeds = L.FOUND.seeds, flights = { E: seeds.map((s) => L.fight(b3, s, "E")), B3: seeds.map((s) => L.fight(b3, s, "B3")) }, m3r = { seeds: [...seeds], flights };
    const cu = L.cUnchanged(pilots, m3r);
    ok("!! C-unchanged, flown: sixdof-box3d's ten anchors and digest hold, and its committed flights of the PD autopilot's joust, all 40 seeds on E and on box3d, fly again to the bit",
        cu.ok && cu.anchors.ok && cu.sameSeeds && cu.sameE && cu.sameB3, J({ anchors: cu.anchors.ok, E: cu.sameE, B3: cu.sameB3 }));
    const altered = { seeds: [...seeds], flights: { E: flights.E, B3: flights.B3.map((f, i) => (i === 7 ? { ...f, outcome: f.outcome === "loss" ? "draw" : "loss" } : f)) } };
    ok("!! C-unchanged can fail: one box3d flight's outcome changed, or the seeds not all 40, and it does", !L.cUnchanged(pilots, altered).ok && !L.cUnchanged(pilots, { seeds: seeds.slice(1), flights: { E: flights.E.slice(1), B3: flights.B3.slice(1) } }).ok);
    const angShort = liarOf(b3, (w) => ({ angularImpulse: (i, v) => w.angularImpulse(i, v.map((x) => x * 0.99)) }));
    const cmLie = L.cModel(angShort, { duels: [{ angle: { D: 1e-9, E: 1 } }] }), cmRatio = L.cModel(b3, { duels: [{ angle: { D: 1, E: 1 } }, { angle: { D: 1e-9, E: 1 } }] });
    ok("!! C-model can fail: its key on a box3d whose angular impulse is 1% short, its ratio on a replay where D is no nearer box3d than E -- by the registered form and by the one-tick form alike",
        !cmLie.key.ok && !cmLie.ok && !cmLie.okPerTick && !cmRatio.ratio.ok && !cmRatio.ok && !cmRatio.okPerTick && cmRatio.key.ok && cmRatio.perTick.ok, `key off ${cmLie.key.off.toExponential(2)} rad`);
    ok("C-model holds, as registered, only when its ratio, its key and its tumble all hold; the one-tick form, reported beside it, takes the tumble one tick at a time and the ratio and key as they are",
        /return \{ ok: ratio\.ok && key\.ok && tumble\.ok, ratio, key, tumble, perTick, okPerTick: ratio\.ok && key\.ok && perTick\.ok \};/.test(src("tools/roundhouse/box3dPdJoust.mjs")));
    const goodM1 = { duels: [{ allF32: { E: false, D: false, E32: true, D32: true } }] }, w = (allF32 = true, ticks = 9) => ({ ticks, allF32, maxSpeed: 1, maxSpin: 1 });
    ok("!! C-float32 can fail: it holds on rounded E32 and D32 and plain E and D, and fails when one rounded state is not float32, when a plain one is, or when a rounded stepper took no tick",
        L.cFloat32(goodM1, { watch: { E32: w(), D32: w() } }).ok && !L.cFloat32(goodM1, { watch: { E32: w(false), D32: w() } }).ok &&
        !L.cFloat32({ duels: [{ allF32: { E: true, D: false, E32: true, D32: true } }] }, { watch: { E32: w(), D32: w() } }).ok && !L.cFloat32(goodM1, { watch: { E32: w(true, 0), D32: w() } }).ok);
    const cap = (maxSpeed, maxSpin, ticks = 9) => L.cCaps({ watch: { B3: { ticks, maxSpeed, maxSpin, allF32: true } } }).ok;
    ok("!! C-caps can fail: it holds under 400 m/s and 23.6 rad/s, and fails at either cap or with no tick watched", cap(9.3, 2.5) && !cap(400, 2.5) && !cap(9.3, L.CAPS.spin) && !cap(9.3, 2.5, 0));
    ok("!! C-chaos's predicate: it holds when E' against E has p at or above 0.01, and not below it, or for another variant's reading",
        L.chaosHolds({ id: "E'", p: 1 }) && L.chaosHolds({ id: "E'", p: 0.01 }) && !L.chaosHolds({ id: "E'", p: 0.0099 }) && !L.chaosHolds({ id: "B3", p: 1 }) && !L.chaosHolds(undefined));
    const noisy = liarOf(b3, (wd) => ({ step: (dt, n) => { wd.step(dt, n); const V = wd.readVelocities(), v = [V[0], V[1], V[2]]; wd.setVelocity(0, [v[0] + (Math.random() - 0.5) * 1e-3, v[1], v[2]]); } }));
    const det = L.cDeterminism(b3, MINI.fightSeeds[0]), detNoisy = L.cDeterminism(noisy, MINI.fightSeeds[0]);
    ok("!! C-determinism can fail: every variant and the nudge, flown twice on an unregistered seed, are the same, and on a box3d that adds noise B3 is not", det.ok && det.flights === 12 && !detNoisy.ok && detNoisy.off.includes("B3"), J(detNoisy.off));
} catch (e) { guard(4, e); }

console.log("\n5. THE COMMAND (read from its source; never run here)");
try {
    const code = src("tools/roundhouse/box3dPdJoustRun.mjs").replace(/\/\/.*$/gm, "");
    ok("!! the command refuses an existing results file before it runs anything, writes the file once, and prints only where it is -- no reading, no statistic",
        code.indexOf("refuseExisting(results)") > 0 && code.indexOf("refuseExisting(results)") < code.indexOf("await run()") && (code.match(/writeFileSync/g) || []).length === 1 &&
        !/readings|\.reading|\.m1|\.m2|\.m3|\.controls|outcome|fingerprint|console\.log\([^`]*result/.test(code) && /DEFAULT_RESULTS/.test(code));
    ok("the registered results file is the command's default, beside the registration's note", L.DEFAULT_RESULTS === path.join(ENG, "physics", "mechanics", "box3dPdJoustResults.json") && L.REGISTRATION === "physics/mechanics/BOX3D_PD_JOUST_WIP.md");
} catch (e) { guard(5, e); }

console.log("\n6. A MINIATURE (seeds 97001-97006, a 1e-3 m nudge -- none of it registered)");
try {
    const pilots = OS.loadPilots(), r = await L.run({ ...MINI, pilots }), C = r.controls;
    ok("!! the miniature has every part the registration names: M1's replays with each variant's angle, distance and spin off box3d; M2's six flights a seed and a reading for each of the five comparisons; M3's three variants; the controls",
        J(Object.keys(r)) === J(["registration", "pilot", "scenario", "substeps", "m1", "m2", "m3", "controls", "readings"]) && J(Object.keys(C)) === J(["unchanged", "box3d", "model", "float32", "caps", "chaos", "determinism"]) &&
        r.m1.duels.length === 2 && r.m1.duels.every((d) => ["angle", "dist", "spinOff"].every((k) => J(Object.keys(d[k])) === J(["E", "D", "E32", "D32"]))) &&
        J(Object.keys(r.m2.flights)) === J(["E", "D", "E32", "D32", "B3", "E'"]) && Object.values(r.m2.flights).every((f) => f.length === 4) && J(r.m2.readings.map((x) => x.id)) === J(["D", "E32", "D32", "B3", "E'"]) &&
        J(Object.keys(r.m3.variants)) === J(["D", "E32", "D32"]) && r.substeps === 4 && r.pilot === "autopilot" && r.scenario === "joust");
    ok("!! ...its controls hold where a miniature can hold them: box3d, C-model's ratio and key and the tumble one tick at a time (the tumble as registered fails, as section 1 found), float32, the caps, chaos, determinism -- and C-unchanged's anchors, its committed comparison not made on seeds the file has not",
        C.box3d.ok && C.model.ratio.ok && C.model.key.ok && C.model.perTick.ok && !C.model.tumble.ok && !C.model.ok && C.model.okPerTick && C.float32.ok && C.caps.ok && C.chaos.ok && C.determinism.ok &&
        C.unchanged.anchors.ok && !C.unchanged.sameSeeds, `ratio ${C.model.ratio.worst.toExponential(2)}, caps ${C.caps.maxSpeed.toFixed(1)} m/s ${C.caps.maxSpin.toFixed(2)} rad/s`);
    // M1, M2 and M3 re-derived here, by the gate's own code
    const d0 = r.m1.duels[0], rec = {}; P6.duel("autopilot", "autopilot", { seed: d0.seed, scenario: "joust", record: rec });
    const play = (f) => { let b = rec.start; return rec.inputs.map((u) => (b = f(b, { force: u.force, torque: u.torque }, h))); };
    const Bp = SB3.withStepper(b3, (st) => play(st.step)), peak = Math.max(...Bp.map((s) => hyp(s.w)));
    const row = (f) => { const X = play(f); return { angle: Math.max(...X.map((s, i) => OS.angleBetween(s.q, Bp[i].q))), dist: Math.max(...X.map((s, i) => gap(s.pos, Bp[i].pos))), spin: Math.max(...X.map((s, i) => gap(s.w, Bp[i].w))) / peak }; };
    const rE = row((b, a, hh) => RB.step(b, a, hh)), rD32 = row((b, a, hh) => L.toF32(DS.step(b, a, hh)));
    ok("!! M1 re-derived here for its first duel, from the seed alone -- A's record, box3d's replay, E's and D32's -- is the file's, every angle, distance and spin to the bit",
        d0.peakSpin === peak && d0.angle.E === rE.angle && d0.dist.E === rE.dist && d0.spinOff.E === rE.spin && d0.angle.D32 === rD32.angle && d0.dist.D32 === rD32.dist && d0.spinOff.D32 === rD32.spin && d0.ticks === rec.inputs.length);
    const reRead = r.m2.readings.every((x) => { const c = OS.compare(r.m2.flights.E, r.m2.flights[x.id]); return x.better === c.better && x.worse === c.worse && x.p === c.p && x.net === c.worse - c.better && x.reading === OS.readingOf(c, L.ALPHA); });
    const tallyOf = (rs) => ({ win: rs.filter((x) => x.outcome === "win").length, loss: rs.filter((x) => x.outcome === "loss").length, draw: rs.filter((x) => x.outcome === "draw").length });
    ok("!! M2's readings re-derived from its flights by the orientation round's comparison, and its tallies; the run's readings are M2's, in order",
        reRead && Object.keys(r.m2.flights).every((k) => J(tallyOf(r.m2.flights[k])) === J(r.m2.tally[k])) && J(r.readings) === J(r.m2.readings.map(({ id, better, worse, p, net, reading }) => ({ id, better, worse, p, net, reading }))));
    const s = MINI.fightSeeds[1], dz = (stepA) => { const x = P6.duel("autopilot", "autopilot", { seed: s, scenario: "joust", ...(stepA ? { stepA } : {}) }); return { outcome: OS.outcomeOf(x), fingerprint: x.fingerprint, ticks: x.ticks }; };
    const again = { E: dz(null), D: dz(DS.step), E32: dz((b, a, hh) => L.toF32(RB.step(b, a, hh))), D32: dz((b, a, hh) => L.toF32(DS.step(b, a, hh))), B3: SB3.withStepper(b3, (st) => dz(st.step)) };
    const nudged = (() => { const x = P6.duel("autopilot", "autopilot", { seed: s, scenario: "joust", nudge: MINI.nudge }); return { outcome: OS.outcomeOf(x), fingerprint: x.fingerprint, ticks: x.ticks }; })();
    ok("!! M2 re-flown here for one seed, from the gate's own steppers: each variant's flight is the file's to the bit, and so is the nudged one; every variant flies another duel than E",
        Object.keys(again).every((k) => J(again[k]) === J(r.m2.flights[k][1])) && J(nudged) === J(r.m2.flights["E'"][1]) && ["D", "E32", "D32", "B3"].every((k) => again[k].fingerprint !== again.E.fingerprint));
    const m3 = r.m3, chg = m3.seeds.map((x, i) => m3.flights.B3[i].outcome !== m3.flights.E[i].outcome);
    ok("M3 re-derived from its flights: B3's changed outcomes, and how many of them each variant changes to B3's",
        m3.b3Changed === chg.filter(Boolean).length && ["D", "E32", "D32"].every((k) => m3.variants[k].toB3 === m3.seeds.filter((x, i) => chg[i] && m3.flights[k][i].outcome === m3.flights.B3[i].outcome).length));
    const back = JSON.parse(L.serialize(r));
    ok("the results serialize to one JSON file that parses back to the same result", J(back) === J(JSON.parse(JSON.stringify(r))) && L.serialize(r).endsWith("\n"));
} catch (e) { guard(6, e); }

console.log("\n7. THE VERDICT (2026-11-04, read from the committed results file; a sample of the round flown again)");
try {
    const text = fs.readFileSync(L.DEFAULT_RESULTS, "utf8"), R = JSON.parse(text), sha = crypto.createHash("sha256").update(text).digest("hex");
    ok("!! the results file is the registered run's, byte for byte as it was committed: 82,203 bytes, sha256 30ea91fb8760a5ee, naming the registration, the PD autopilot's joust, box3d's four substeps and the registered seeds",
        Buffer.byteLength(text) === 82203 && sha.startsWith("30ea91fb8760a5ee") && R.registration === L.REGISTRATION && R.pilot === "autopilot" && R.scenario === "joust" && R.substeps === 4 &&
        J(R.m2.seeds) === J(L.FIGHT.seeds) && J(R.m1.duels.map((d) => d.seed)) === J(L.TURN.seeds) && J(R.m3.seeds) === J(L.FOUND.seeds), `${Buffer.byteLength(text)} bytes, ${sha.slice(0, 16)}`);
    const e2 = (x) => x.toExponential(2), fp = (x) => (x < 1e-3 ? x.toExponential(2) : x.toPrecision(3)), F = R.m2.flights, tal = (x) => `${x.win}-${x.loss}-${x.draw}`;
    const tallyOf = (rs) => ({ win: rs.filter((x) => x.outcome === "win").length, loss: rs.filter((x) => x.outcome === "loss").length, draw: rs.filter((x) => x.outcome === "draw").length });
    const cmp = (id) => OS.compare(F.E, F[id]), rowOf = (id) => { if (id === "E") return `| E | ${tal(tallyOf(F.E))} | | | | | |`; const c = cmp(id); return `| ${id} | ${tal(tallyOf(F[id]))} | ${c.better} | ${c.worse} | ${c.worse - c.better} | ${fp(c.p)} | ${OS.readingOf(c, L.ALPHA)} |`; };
    const M2ROWS = ["| E | 3-27-70 | | | | | |", "| D | 1-67-32 | 2 | 42 | 40 | 1.13e-10 | changes it: worse for A |", "| E32 | 3-27-70 | 0 | 0 | 0 | 1.00 | changes nothing a sign test can see |",
        "| D32 | 1-67-32 | 2 | 42 | 40 | 1.13e-10 | changes it: worse for A |", "| B3 | 1-67-32 | 2 | 42 | 40 | 1.13e-10 | changes it: worse for A |", "| E' | 3-27-70 | 0 | 0 | 0 | 1.00 | changes nothing a sign test can see |"];
    const ids = ["E", "D", "E32", "D32", "B3", "E'"], m2rows = ids.map(rowOf);
    const stored = R.m2.readings.every((x) => { const c = cmp(x.id); return x.better === c.better && x.worse === c.worse && x.p === c.p && x.net === c.worse - c.better && x.reading === OS.readingOf(c, L.ALPHA); }) &&
        ids.every((k) => J(tallyOf(F[k])) === J(R.m2.tally[k]) && F[k].length === 100);
    ok("!! M2: every reading and tally re-derived from the file's 600 flights by the orientation round's comparison, and the verdict's table row by row", stored && J(m2rows) === J(M2ROWS), m2rows.find((r, i) => r !== M2ROWS[i]) || "");
    const sameOut = (a, b) => F[a].filter((f, i) => f.outcome === F[b][i].outcome).length, sameFp = (a, b) => F[a].filter((f, i) => f.fingerprint === F[b][i].fingerprint).length;
    const tr = {}; F.E.forEach((f, i) => { if (f.outcome !== F.B3[i].outcome) { const k = `${f.outcome}->${F.B3[i].outcome}`; tr[k] = (tr[k] || 0) + 1; } });
    const pairs = F.E.map((f, i) => ({ e: f, b: F.B3[i] })), draws = pairs.filter((x) => x.e.outcome === "draw"), lost = draws.filter((x) => x.b.outcome === "loss");
    ok("!! seed by seed: D's and D32's outcomes are box3d's on all 100 seeds, D32's whole duel on 68; E32's are E's on all 100 though float32 moved 97 of its flights, and the nudge moved none; E's 70 draws are all mutual kills (249 to 443 ticks), 39 of them A's losses on box3d, every one in the very tick; the 42 worse and the 2 better, by kind",
        sameOut("D", "B3") === 100 && sameOut("D32", "B3") === 100 && sameFp("D32", "B3") === 68 && sameOut("E32", "E") === 100 && 100 - sameFp("E32", "E") === 97 && sameFp("E'", "E") === 100 &&
        draws.length === 70 && draws.every((x) => x.e.ticks < 900) && Math.min(...draws.map((x) => x.e.ticks)) === 249 && Math.max(...draws.map((x) => x.e.ticks)) === 443 && lost.length === 39 && lost.every((x) => x.b.ticks === x.e.ticks) &&
        J(tr) === J({ "draw->loss": 39, "win->loss": 2, "draw->win": 1, "win->draw": 1, "loss->draw": 1 }), J(tr));
    const D1 = R.m1.duels, span = (f, unit = "") => `${e2(Math.min(...D1.map(f)))} to ${e2(Math.max(...D1.map(f)))}${unit}`;
    const m1rows = ["E", "D", "E32", "D32"].map((k) => `| ${k} | ${span((d) => d.angle[k], " rad")} | ${span((d) => d.dist[k], " m")} | ${span((d) => d.spinOff[k])} |`);
    const M1ROWS = ["| E | 1.93e-2 to 4.01e-2 rad | 1.78e-5 to 5.49e-3 m | 1.39e-7 to 8.87e-7 |", "| D | 9.71e-7 to 6.18e-6 rad | 1.78e-5 to 1.02e-4 m | 1.39e-7 to 8.87e-7 |",
        "| E32 | 1.93e-2 to 4.01e-2 rad | 1.19e-7 to 5.58e-3 m | 1.16e-7 to 7.91e-7 |", "| D32 | 7.43e-7 to 7.12e-6 rad | 1.19e-7 to 1.57e-4 m | 1.16e-7 to 7.91e-7 |"];
    const worst = Math.max(...D1.map((d) => d.angle.D / d.angle.E)), m1span = `${Math.min(...D1.map((d) => d.ticks))} to ${Math.max(...D1.map((d) => d.ticks))} ticks each, with box3d's peak spin ${Math.min(...D1.map((d) => d.peakSpin)).toFixed(3)} to ${Math.max(...D1.map((d) => d.peakSpin)).toFixed(3)} rad/s`;
    ok("!! M1: ten joust replays (310 to 443 ticks, box3d's peak spin 1.157 to 2.407 rad/s) and the verdict's table row by row; D within a hundredth of E's distance from box3d in every one, the worst ratio 3.16e-4",
        D1.length === 10 && J(m1rows) === J(M1ROWS) && e2(worst) === "3.16e-4" && D1.every((d) => d.angle.D <= 0.01 * d.angle.E) && m1span === "310 to 443 ticks each, with box3d's peak spin 1.157 to 2.407 rad/s", m1rows.find((r, i) => r !== M1ROWS[i]) || m1span);
    const M3 = R.m3, chg = M3.seeds.map((x, i) => M3.flights.B3[i].outcome !== M3.flights.E[i].outcome), V3 = M3.variants;
    const m3ok = ["D", "E32", "D32"].every((k) => { const c = OS.compare(M3.flights.E, M3.flights[k]); return V3[k].better === c.better && V3[k].worse === c.worse && V3[k].p === c.p && V3[k].toB3 === M3.seeds.filter((x, i) => chg[i] && M3.flights[k][i].outcome === M3.flights.B3[i].outcome).length; });
    ok("!! M3: box3d changed 22 outcomes at the finding's seeds; D and D32 change all 22 to box3d's and read there as box3d did (1 better, 21 worse, p 1.10e-5); E32 changes none -- re-derived from M3's flights",
        m3ok && M3.b3Changed === 22 && chg.filter(Boolean).length === 22 && ["D", "D32"].every((k) => V3[k].toB3 === 22 && V3[k].better === 1 && V3[k].worse === 21 && fp(V3[k].p) === "1.10e-5") &&
        V3.E32.toB3 === 0 && V3.E32.better === 0 && V3.E32.worse === 0 && fp(V3.E32.p) === "1.00");
    const C = R.controls, M = C.model, asReg = L.nameThePart(R.m2.readings, M.ok), oneTick = L.nameThePart(R.m2.readings, M.okPerTick);
    ok("!! the rule, from the file: B3 replicates; D and D32 reproduce it and E32 does not, so before C-model is asked the rule names box3d's scheme -- and as registered C-model fails on its tumble alone (ratio 3.16e-4 and key 1.48e-8 held; 2.15e-4 and 1.63e-4), so nothing is named; with the one-tick tumble (1.29e-6, 1.78e-7) it holds and the rule names box3d's scheme",
        asReg.replicated && asReg.raw === "box3d's scheme" && J(asReg.reproduces) === J({ D: true, E32: false, D32: true }) && asReg.label === "nothing is named" && oneTick.label === "box3d's scheme" &&
        !M.ok && M.ratio.ok && M.key.ok && !M.tumble.ok && M.perTick.ok && M.okPerTick && e2(M.ratio.worst) === "3.16e-4" && e2(M.key.off) === "1.48e-8" && e2(M.tumble.spinGap) === "2.15e-4" && e2(M.tumble.angleGap) === "1.63e-4" &&
        e2(M.perTick.spinGap) === "1.29e-6" && e2(M.perTick.angleGap) === "1.78e-7", `${asReg.label} / ${oneTick.label}`);
    const rd = Object.fromEntries(R.m2.readings.map((x) => [x.id, x]));
    const P = { P1: asReg.replicated, P2: asReg.reproduces.D, P3: rd.E32.reading === "changes nothing a sign test can see", P4: asReg.label === "box3d's scheme", P5: M.ok, P6: V3.D.toB3 >= 15 };
    ok("!! the predictions, each by its registered rule from the file: P1 right, P2 right, P3 right, P4 wrong (the rule as registered names nothing), P5 wrong (the tumble), P6 right (22 of 22)",
        P.P1 && P.P2 && P.P3 && !P.P4 && !P.P5 && P.P6, J(P));
    ok("!! the controls as the verdict gives them: C-unchanged (the anchors, the digest and the 80 committed flights), C-box3d, C-float32, C-caps (11.95 m/s and 2.73 rad/s over 33,628 ticks), C-chaos (p 1.00), C-determinism (12 flights); C-model alone not held",
        C.unchanged.ok && C.unchanged.anchors.ok && C.unchanged.sameSeeds && C.unchanged.sameE && C.unchanged.sameB3 && C.box3d.ok && C.float32.ok && C.caps.ok && C.caps.maxSpeed.toFixed(2) === "11.95" &&
        C.caps.maxSpin.toFixed(2) === "2.73" && C.caps.ticks === 33628 && C.chaos.ok && fp(C.chaos.p) === "1.00" && C.determinism.ok && C.determinism.flights === 12 && !C.model.ok &&
        J(R.readings) === J(R.m2.readings.map(({ id, better, worse, p, net, reading }) => ({ id, better, worse, p, net, reading }))));
    // THE NOTE: the verdict section alone, its line breaks read as spaces
    const note = src(L.REGISTRATION), vAt = note.indexOf("\n## The verdict, 2026-11-04"), rest = vAt >= 0 ? note.slice(vAt + 1) : "", nextAt = rest.slice(1).search(/\n#{2,3} /);
    const vt = (nextAt >= 0 ? rest.slice(0, nextAt + 1) : rest).replace(/\s+/g, " ");
    const nT = Math.round(L.MODEL.tumbleT / h), mom = (st) => RB.rotateByQuat(st.q, [I[0] * st.w[0], I[1] * st.w[1], I[2] * st.w[2]]);
    const driftB3 = SB3.withStepper(b3, (stp) => { let b = body({ w: [...L.MODEL.tumbleW] }); const L0 = mom(b); for (let k = 0; k < nT; k++) b = stp.step(b, zero(), h); return gap(mom(b), L0) / hyp(L0); });
    const frags = [`${Buffer.byteLength(text).toLocaleString("en-US")} bytes, sha256 ${sha.slice(0, 16)}`, ...m2rows, ...m1rows, m1span, `The worst ratio is ${e2(worst)}`,
        `D's outcome is box3d's on all ${sameOut("D", "B3")} seeds, and so is D32's`, `(the same fingerprint) on ${sameFp("D32", "B3")} of them`, `E32's outcome is E's on all ${sameOut("E32", "E")} seeds`,
        `though float32 moved ${100 - sameFp("E32", "E")} of its 100 flights. The nudge moved ${sameFp("E'", "E") === 100 ? "none" : 100 - sameFp("E'", "E")}`,
        `E's ${draws.length} draws are all mutual kills, ${Math.min(...draws.map((x) => x.e.ticks))} to ${Math.max(...draws.map((x) => x.e.ticks))} ticks in. On box3d, ${lost.length} of them become A's losses`,
        `The ${rd.B3.worse} worse: those ${tr["draw->loss"]}, ${tr["win->loss"]} wins that became losses, and ${tr["win->draw"]} win that became a draw.`, `The ${rd.B3.better} better: ${tr["draw->win"]} draw that became a win, and ${tr["loss->draw"]} loss that became a draw.`,
        `box3d changed ${M3.b3Changed} outcomes at seeds 93001 to 93040. D and D32 each change all ${V3.D.toB3} to box3d's outcome, and read there exactly as box3d did: ${V3.D.better} better, ${V3.D.worse} worse, p = ${fp(V3.D.p)}. E32 changes none.`,
        `B3 replicates: worse for A, p = ${fp(rd.B3.p)}.`, `with a net of ${rd.D.net}, all of B3's`, `Its ratio (${e2(M.ratio.worst)}) and its key (${e2(M.key.off)} rad) held; its tumble did not (${e2(M.tumble.spinGap)} and ${e2(M.tumble.angleGap)} rad, against 1e-4)`,
        asReg.label === "nothing is named" ? "**So by the rule as registered, nothing is named.**" : `**So by the rule as registered, ${asReg.label}.**`,
        `That tumble holds (${e2(M.perTick.spinGap)} and ${e2(M.perTick.angleGap)} rad), so with it C-model holds, and **the rule names ${oneTick.label}.**`, `by ${e2(driftB3)} of it over the 10 s on box3d`,
        ...Object.keys(P).map((k) => `**${k}: ${P[k] ? "right" : "wrong"}.**`), `B3's ship reached at most ${C.caps.maxSpeed.toFixed(2)} m/s and ${C.caps.maxSpin.toFixed(2)} rad/s over ${C.caps.ticks.toLocaleString("en-US")} ticks`,
        `C-chaos: E' against E has p = ${fp(C.chaos.p)}.`, `C-determinism: ${C.determinism.flights} flights, each the same twice.`, `Its 80 committed flights of the PD autopilot's joust`,
        oneTick.label === "box3d's scheme" ? "the PD autopilot loses its jousts on box3d because of box3d's integration scheme" : "the PD autopilot's jousts on box3d"];
    const missing = frags.filter((f) => !vt.includes(f));
    ok("!! the note's verdict carries the file's numbers: both tables row by row, the seed-by-seed story, M3, the rule read both ways, each prediction as the file reads it, the controls, and what the one-tick reading buys",
        vAt >= 0 && missing.length === 0, missing.slice(0, 3).join(" || ") || `${frags.length} fragments`);
    // A SAMPLE OF THE ROUND, flown again at this head through the library, against the file to the bit
    const off = [], s1 = L.FIGHT.seeds[0], f1 = L.FOUND.seeds[0];
    for (const id of ["E", "D", "E32", "D32", "B3"]) if (J(L.fight(b3, s1, id)) !== J(F[id][0])) off.push(`M2/${id}`);
    if (J(L.fight(b3, s1, "E", { nudge: L.FIGHT.nudge })) !== J(F["E'"][0])) off.push("M2/E'");
    if (J(L.m1(b3, [s1]).duels[0]) !== J(D1[0])) off.push("M1");
    for (const id of ["D", "E32", "D32"]) if (J(L.fight(b3, f1, id)) !== J(M3.flights[id][0])) off.push(`M3/${id}`);
    ok("!! a sample of the round flown again at this head, through the library, is the file's to the bit: M2's seed 95001 six ways, M1's replay of it, and M3's seed 93001 with D, E32 and D32", off.length === 0, off.join(" ") || "10 flights and a replay");
} catch (e) { guard(7, e); }

console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)`);
process.exitCode = fails ? 1 : 0;
