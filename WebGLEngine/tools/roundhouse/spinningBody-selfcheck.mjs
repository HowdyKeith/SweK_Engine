// WebGLEngine/tools/roundhouse/spinningBody-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/roundhouse/spinningBody-selfcheck.mjs      (~2 s)
//
// THE GATE OF tools/roundhouse/spinningBody.mjs (and its command, tools/roundhouse/spinningBodyRun.mjs): the spinning
// body, as physics/mechanics/SPINNING_BODY_WIP.md registers it -- and of the angular calls it needed, added to box3d's
// shim, wasm and loader and to Jolt's wrapper in the same commit.
// *** NOTHING HERE SPINS A BACKEND ABOUT THE INTERMEDIATE AXIS, AND NOTHING HERE STARTS THE COMMAND. *** Every engine spin
// below is about a STABLE axis, so the gate sees nothing of the registered answer. The command is never executed: were a
// sabotage to remove its option check, an execution would fall through to the registered round; its guards are held as
// library functions and as the order of its source.
// *** UNTIL SECTION 6 (2026-11-03), written after the results file was committed unread (a1f0c4b5) and read: it flies the registered round
// again in-process, through the library, and holds the file against it. The command is still never started. ***
//
//   1  THE REGISTRATION, AS CODE: the body is v3564's (backendRotation.mjs's own FIXTURE), the spin, the window, the
//      steps; the prediction is the closed form; the rule's numbers; the substeps ARE the loaders' own defaults; the four
//      configurations
//   2  THE RULE ON MADE-UP TRACES: the fit recovers a known rate over the registered band; the reading at each of its
//      edges; the invariants and the flips
//   3  THE PLUMBING, ON STABLE SPINS: the rebuilt box3d exports and the loaders' angular calls; damping zeroed is what
//      keeps a rate (against the engine's default, which bleeds it); the moments as each engine reports them; the frame
//      each engine reports angular velocity in, TOLD APART by how the orientation turns; the gyroscopic opt-in reaching
//      Jolt's body; the spinner's body-frame reading; C-rebuild's battery
//   4  THE ROUND ON A MINIATURE (spun about the stable largest axis for 2 s): every control and every configuration in
//      order, through the configurations' own engines; the readings the rule's; C-undamped, C-inertia, C-key and
//      C-determinism able to fail; the results file's format
//   5  THE COMMAND: it never overwrites, refuses an option it does not know, and prints no score
//   6  THE VERDICT, AS CODE, FROM THE COMMITTED FILE: the registered run and its controls; every reading by this gate's own statement of the rule;
//      the rates, the dropped term, the stable spins and the predictions; the round flown again and held against the file; the study made after
//      the read (the three that keep the term at 1/240 s and 1/960 s); and the note carrying all of it
//
// SABOTAGE LOG (2026-11-03) -- each applied with the byte-safe runner against this gate, backendConformance-selfcheck and box3dConformance-selfcheck,
// every file restored byte-identical (sha256); the number is the rows that went red, by name:
//   G1 the spin at 1.5 rad/s 4 | G2 the wobble at 1e-4 2 | G3 the window at 20 s 1 | G4 the tolerance at 20% 2 | G5 the band without its skipped decade 2
//   G6 box3d at one substep 1 | G7 C2 with the opt-in on 2 | G8 the body a 1 x 2 x 2 block 8 | G9 box3d's configuration flown on Jolt 1
//   G10 the damping left at the engine's default 3 | G11 the opt-in dropped on C3's body 1 | G12 the body frame not applied 1 | G13 the fit past the cap 1
//   G14 the reading without the crossing 2 | G15 no growth read strictly 1 | G16 the prediction for the largest axis 4 | G17 every sample counted a flip 1
//   G18 C-key's tolerance at 0.2 1 | G19 C-inertia's tolerance at 1e-2 1 | G20 sameTrace always true 1 | G21 a frozen battery hash drifted 2
//   G22 the results file not compacted 1 | G23 the command never refusing 1 | G24 the command printing the result 1 | G25 the command accepting any option 1 (0 first)
//   G26 box3d's angular velocities read from the linear ones 5 | G27 Jolt's angular velocities read from the linear ones 4 | G28 Jolt's setDamping leaving the angular
//   damping 1 | G29 box3d's inertia off a column 2 | G30 Jolt's opt-in never set 2 | G31 box3d's loader never saying yes 1 | G32 the checker's angular readback blind 1
//   (0 first) | G33 the checker's turning check blind 1 | G34 the planar stand-in claiming angular velocity 1 (0 first)
//   FOUND BY THE SABOTAGES, three that went 0 red, each fixed and run again: (1) G25 -- section 5 looked for process.exit(2) within 200 characters of the
//   option check, and the refusal's own exit two lines down stood in for a deleted one; it now demands each exit directly after its refusal. (2) G32 -- both
//   angular liars were PLANAR, so the turning check caught them and the readback check's blindness never showed; box3dConformance-selfcheck now hands the
//   checker real box3d turning a body while it reports zeros. (3) G34 -- the checker CRASHED on a world claiming angular velocity without the calls, and a
//   crash prints no FAIL line, so the runner counted nothing; conform() now reports the missing calls as a failed check and survives a throw.
//   FOUND BEFORE THEM, each a row that could not have gone red, fixed while designing them: the opt-in dropped on C3's body, the body-frame turning
//   skipped, C-key's tolerance, C-determinism's comparison, the results file's one-line arrays, and the real loaders' supportsAngular -- see the note.
// SABOTAGE LOG, SECTION 6 (2026-11-03, after the verdict) -- the same runner against this gate, with the committed results file, the note or the code
// edited; every file restored byte-identical (sha256):
//   V1 the file's bytes moved in the last digit of C2's growth 2 (the file's sha256, and the note's) | V2 the file not flagged as the registered run 3
//   V3 the file reading C2 as Euler's equations 7 | V4 the file's box3d rate 12% off 6 | V5 the file's box3d energy falling 1.0% (P5 wrong) 5 | V6 the file's
//   C-key failed 4 | V7 the file's C2 flipping once 4 | V8 the file's C2 world-frame drift at 1e-2 4 | V9 the file's Jolt opt-in stable spin inside Euler's
//   bound 5 | V10 the file's own-physics rate at 1/240 s moved 0.5% 4 | V11 the file's Jolt opt-in rate 1.8% off 5 | V12 the note saying P3 wrong 1
//   V13 the note's Jolt opt-in rate mistyped 1 | V14 the note's verdict heading renamed 1 | V15 the note's box3d energy at 1/240 s rounded 1 | V16 the note's
//   flip count 1 | V17 the library's rule at a twentieth of its tolerance 3 | V18 the round's C2 flown with the opt-in on 2 | V19 box3d stepped at 8
//   substeps 4 | V20 the engine's own orientation stepped at half the step 3 | V21 the answer key's spin stepped by Euler, not RK4 4 | V22 the engine's
//   own spin stepped by Euler, not RK4 5
//   FOUND BY THEM: V21 was aimed at the engine's own spin and missed it. rigidBody6dof.step() carries its own RK4 (stepOmegaWithTorque), not
//   freeRotation's stepOmega, so editing freeRotation broke C-key's answer key instead -- red, rightly, in sections 4 and 6, section 4's miniature
//   throwing once C-key stopped it -- and left the study's fourth-order row unexercised. V22 edits the engine's own and turns that row red by name.
//   Every row of section 6 went red under at least one design.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import * as L from "./spinningBody.mjs";
import * as BR from "./backendRotation.mjs";
import * as F from "../../physics/mechanics/freeRotation.mjs";
import * as RB from "../../physics/mechanics/rigidBody6dof.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const t0 = Date.now(), J = JSON.stringify;
const guard = (n, e) => ok(`section ${n} ran without throwing`, false, String(e && e.stack || e).split("\n").slice(0, 2).join(" ").slice(0, 240));
const near = (a, b, tol) => Math.abs(a - b) <= tol;

console.log("1. THE REGISTRATION, AS CODE");
try {
    const { m, I, mid } = L.fixtureBody();
    ok("!! the body is v3564's, read from tools/roundhouse/backendRotation.mjs itself: half-extents 0.5 x 1.0 x 1.5, density 1 -- mass 6, moments 6.5 / 5 / 2.5, the intermediate axis y",
        ["hx", "hy", "hz", "density"].every((k) => L.FIXTURE[k] === BR.FIXTURE[k]) && m === 6 && J(I) === J([6.5, 5, 2.5]) && mid === 1 && Object.isFrozen(L.FIXTURE), J(I));
    ok("!! the spin and the window: 2 rad/s with a wobble of 1e-5 of it, 30 s, at 1/60 s (and 1/240 s, reported), frozen",
        L.SPIN.W === 2 && L.SPIN.eps === 1e-5 && L.SPIN.T === 30 && L.SPIN.dt === 1 / 60 && L.SPIN.fineDt === 1 / 240 && Object.isFrozen(L.SPIN));
    const s = [...I].sort((a, b) => a - b), closed = 2 * Math.sqrt(((s[1] - s[0]) * (s[2] - s[1])) / (s[0] * s[2]));
    ok("!! the prediction is the closed form W sqrt((I2-I1)(I3-I2)/(I1 I3)), never fitted: 0.960769/s, and freeRotation's stabilityRate gives the same",
        near(L.PREDICTED, closed, 1e-12) && L.PREDICTED.toFixed(6) === "0.960769" && near(F.stabilityRate(I, 1, 2).sigma, closed, 1e-12), String(L.PREDICTED));
    ok("!! the rule's numbers are the registration's: within 10% of the prediction, r^2 >= 0.999 over >= 20 points, the band from 10x the starting wobble to 5% of the spin, no growth meaning never past 10x",
        J(L.RULE) === J({ tol: 0.10, r2: 0.999, minPoints: 20, skip: 10, cap: 0.05, noGrowth: 10 }) && Object.isFrozen(L.RULE));
    const b3 = fs.readFileSync(path.join(ENG, "physics/box3d/box3dLoader.js"), "utf8"), jo = fs.readFileSync(path.join(ENG, "physics/jolt/joltLoader.js"), "utf8");
    ok("!! the substeps ARE the loaders' own: box3dLoader's step(dt = 1 / 60, substeps = 4) and Jolt's step(dt = 1 / 60, substeps = 1)",
        L.SUBSTEPS.box3d === 4 && L.SUBSTEPS.jolt === 1 && /step\(dt = 1 \/ 60, substeps = 4\)/.test(b3) && /step\(dt = 1 \/ 60, substeps = 1\)/.test(jo));
    ok("!! the four configurations, in order: box3d; Jolt with the gyroscopic force passed off (Jolt's own default, and the wrapper's until 2026-11-03); Jolt with it passed on; the engine's own rigidBody6dof",
        J(L.CONFIGS.map((c) => [c.id, c.engine, c.gyroscopic])) === J([["C1", "box3d", null], ["C2", "jolt", false], ["C3", "jolt", true], ["C4", "own", null]]) && Object.isFrozen(L.CONFIGS));
} catch (e) { guard(1, e); }

console.log("\n2. THE RULE ON MADE-UP TRACES");
try {
    // a wobble growing as p0 e^(sigma t) on the z component of a spin about y, sampled at 1/60 s
    const made = (sigma, T = 30, dt = 1 / 60, p0 = 2e-5) => Array.from({ length: Math.round(T / dt) + 1 }, (_, n) => ({ w: [0, 2, p0 * Math.exp(sigma * n * dt)], q: [1, 0, 0, 0] }));
    const fit = L.fitGrowth(made(0.9), { dt: 1 / 60, axis: 1 });
    const tLo = Math.log(10) / 0.9, tHi = Math.log(0.1 / 2e-5) / 0.9, expect = Math.floor(tHi * 60) - Math.ceil(tLo * 60) + 1;
    ok("!! the fit recovers a known rate over the registered band: 0.9 from an exact exponential, r^2 1, its points from 10x the starting wobble to 5% of the spin, the crossing where it passes 5%",
        near(fit.sigma, 0.9, 1e-9) && fit.r2 > 1 - 1e-12 && Math.abs(fit.points - expect) <= 1 && near(fit.crossed, Math.ceil(tHi * 60) / 60, 1 / 60 + 1e-9), `${fit.points} points (about ${expect}), crossed at ${fit.crossed.toFixed(3)} s`);
    const P = L.PREDICTED, at = (k) => L.readingOf(L.fitGrowth(made(k * P), { dt: 1 / 60, axis: 1 }));
    // (exactly 1.1 of the prediction fits to 0.10000000000000009 off -- a hair past the edge in floating point -- so the edge is held a ten-thousandth either side of it)
    ok("!! the reading at the rate's edges: 0.9001 and 1.0999 of the prediction read Euler's equations, 0.8999 and 1.1001 read something else",
        at(0.9001) === "Euler's equations" && at(1.0999) === "Euler's equations" && at(0.8999) === "Something else" && at(1.1001) === "Something else", [0.9001, 1.0999, 0.8999, 1.1001].map(at).join(" | "));
    const base = { p0: 2e-5, sigma: P, r2: 0.9995, points: 300, crossed: 12, factor: 5000 };
    ok("!! ...and at its other edges: r^2 0.999 reads Euler's equations and 0.9989 not; 20 points do and 19 do not; never passing 5% is never Euler's equations",
        L.readingOf({ ...base, r2: 0.999 }) === "Euler's equations" && L.readingOf({ ...base, r2: 0.9989 }) === "Something else" && L.readingOf({ ...base, points: 20 }) === "Euler's equations" &&
        L.readingOf({ ...base, points: 19 }) === "Something else" && L.readingOf({ ...base, crossed: null }) === "Something else");
    ok("!! no gyroscopic term: a wobble that never grows past 10x reads so (10 exactly included), 10.001x does not, and a constant wobble is a factor of 1",
        L.readingOf({ ...base, crossed: null, factor: 10 }) === "No gyroscopic term" && L.readingOf({ ...base, crossed: null, factor: 10.001 }) === "Something else" &&
        L.fitGrowth(made(0), { dt: 1 / 60, axis: 1 }).factor === 1 && L.readingOf(L.fitGrowth(made(0), { dt: 1 / 60, axis: 1 })) === "No gyroscopic term");
    const I = [6.5, 5, 2.5], still = Array.from({ length: 5 }, () => ({ w: [0, 2, 0], q: [1, 0, 0, 0] })), flip = [{ w: [0, 2, 0], q: [1, 0, 0, 0] }, { w: [0, -2, 0], q: [1, 0, 0, 0] }, { w: [0, 2, 0], q: [1, 0, 0, 0] }];
    const iv = L.invariants(still, I, 1), fv = L.invariants(flip, I, 1), lose = L.invariants([{ w: [0, 2, 0], q: [1, 0, 0, 0] }, { w: [0, 1.8, 0], q: [1, 0, 0, 0] }], I, 1);
    ok("  the invariants: a steady spin drifts nothing and never flips; two reversals are two flips; spin falling 2 -> 1.8 is an energy change of -19%",
        iv.driftE === 0 && iv.driftL === 0 && iv.driftWorldL === 0 && iv.flips === 0 && fv.flips === 2 && near(lose.energyChange, -0.19, 1e-12), J(lose));
    ok("  the start and the wobble: W about the axis and eps*W on the next one; the wobble the length of the other two parts",
        J(L.startOf(1)) === J([0, 2, 2e-5]) && J(L.startOf(0)) === J([2, 2e-5, 0]) && L.wobbleOf([3, 9, 4], 1) === 5);
} catch (e) { guard(2, e); }

console.log("\n3. THE PLUMBING, ON STABLE SPINS (no spin here is about the intermediate axis)");
try {
    const E = await L.engines(), { mod } = await import("../../physics/box3d/box3dNode.mjs"), m = mod();
    const four = ["swk_ang_velocities", "swk_body_set_ang_velocity", "swk_body_set_damping", "swk_body_inertia"];
    ok("!! the rebuilt box3d.wasm exports the four new calls, and the shim defines them", four.every((n) => typeof m["_" + n] === "function") &&
        four.every((n) => new RegExp("^(void|int) " + n + "\\(", "m").test(fs.readFileSync(path.join(ENG, "physics/box3d/box3d_shim.c"), "utf8"))));
    const worlds = { box3d: () => E.box3d.createWorld({ gravity: [0, 0, 0] }), jolt: () => E.jolt.createWorld({ gravity: [0, 0, 0] }) }, half = [0.5, 1, 1.5];
    const says = Object.fromEntries(Object.keys(worlds).map((n) => { const w = worlds[n](), v = w.supportsAngular(); w.destroy(); return [n, v]; }));
    ok("!! both real loaders say supportsAngular() -- box3d's because its artifact has all four exports, Jolt's because its binding always had the calls", says.box3d === true && says.jolt === true, J(says));
    // a body spun about its LARGEST axis (x) for one second, with the engine's default damping and with zero
    const keep = (name, zero) => { const w = worlds[name](), i = w.addBox({ type: "dynamic", pos: [0, 0, 0], half, density: 1 }); if (zero) w.setDamping(i, 0, 0); w.setAngularVelocity(i, [0.4, 0, 0]);
        for (let k = 0; k < 60; k++) w.step(1 / 60, L.SUBSTEPS[name]); const r = w.readAngularVelocities()[i * 3] / 0.4; w.destroy(); return r; };
    const kept = { box3d: [keep("box3d", false), keep("box3d", true)], jolt: [keep("jolt", false), keep("jolt", true)] };
    ok("!! damping set to zero is what keeps a rate: each engine's default bleeds about 5% of a spin in a second (the 0.05/s v2468 chose), and zero keeps it exactly",
        kept.box3d[0] < 0.96 && kept.box3d[0] > 0.94 && kept.jolt[0] < 0.96 && kept.jolt[0] > 0.94 && near(kept.box3d[1], 1, 1e-6) && near(kept.jolt[1], 1, 1e-6), J(kept));   // 0.4 is 0.40000000596 in float32
    const inert = Object.fromEntries(Object.keys(worlds).map((n) => { const w = worlds[n](), i = w.addBox({ type: "dynamic", pos: [0, 0, 0], half, density: 1 }), v = w.inertia(i); w.destroy(); return [n, v]; }));
    ok("!! each engine reports the fixture's moments, 6.5 / 5 / 2.5 with nothing off the diagonal, as C-inertia reads them", L.inertiaControl(inert.box3d).ok && L.inertiaControl(inert.jolt).ok &&
        !L.inertiaControl({ diag: [6.5, 5, 2.51], off: [0, 0, 0] }).ok && !L.inertiaControl({ diag: [6.5, 5, 2.5], off: [0.01, 0, 0] }).ok, J(inert));
    // THE FRAME, told apart: turn the body 90 degrees about y first, which lays its SMALLEST axis (z, stable) along world x,
    // then spin it about WORLD x. A world-frame angular velocity turns the orientation on the LEFT (q1 = dq(world) * q0); a
    // body-frame one would turn it on the right, about the body's own x -- which now lies along world -z.
    const frame = (name) => {
        const w = worlds[name](), i = w.addBox({ type: "dynamic", pos: [0, 0, 0], half, density: 1 }), c = Math.SQRT1_2;
        w.setDamping(i, 0, 0); w.setTransform(i, [0, 0, 0], [0, c, 0, c]); w.setAngularVelocity(i, [0.4, 0, 0]);
        const got = Array.from(w.readAngularVelocities().slice(i * 3, i * 3 + 3));
        for (let k = 0; k < 6; k++) w.step(1 / 60, L.SUBSTEPS[name]);
        const t = w.readTransforms(), q1 = [t[i * 7 + 6], t[i * 7 + 3], t[i * 7 + 4], t[i * 7 + 5]]; w.destroy();
        const h = 0.4 * 0.1 / 2, dq = [Math.cos(h), Math.sin(h), 0, 0], q0 = [c, 0, c, 0];
        const mul = (a, b) => [a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3], a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2], a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1], a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]];
        const dist = (a, b) => Math.min(Math.hypot(...a.map((v, k) => v - b[k])), Math.hypot(...a.map((v, k) => v + b[k])));
        return { got, world: dist(q1, mul(dq, q0)), body: dist(q1, mul(q0, dq)) };
    };
    const fr = { box3d: frame("box3d"), jolt: frame("jolt") };
    ok("!! both engines report angular velocity in the WORLD frame, told apart by how the orientation turns: a body turned 90 degrees about y, spun about world x (its stable smallest axis), turns about world x (1e-4) and not about its own x (0.02 away)",
        Object.values(fr).every((f) => near(f.got[0], 0.4, 1e-6) && near(f.got[1], 0, 1e-6) && near(f.got[2], 0, 1e-6) && f.world < 1e-4 && f.body > 0.02), J(Object.fromEntries(Object.entries(fr).map(([k, v]) => [k, [v.world.toExponential(1), v.body.toFixed(3)]]))));
    const flag = (gyro) => { const w = worlds.jolt(), i = w.addBox({ type: "dynamic", pos: [0, 0, 0], half, density: 1, damping: 0, gyroscopic: gyro }), v = w.raw().bodyOf(i).GetApplyGyroscopicForce(); w.destroy(); return v; };
    const deflt = (() => { const w = worlds.jolt(), i = w.addBox({ type: "dynamic", pos: [0, 0, 0], half, density: 1 }), v = w.raw().bodyOf(i).GetApplyGyroscopicForce(); w.destroy(); return v; })();
    // 2026-11-03 (unnumbered) -- RESTATED, NOT WIDENED: this row said "and stays an opt-in: off by default" and asserted deflt === false. The same
    // day Keith turned the default ON (the note's second round), and the row went red on exactly that, which is what it was for. It now holds the
    // new default, and still holds both explicit settings.
    // 2026-11-03 (unnumbered), AGAIN -- RESTATED a second time, after the note's third round turned this row red (its M4 saw it): the
    // loader's default became the wrapper's own implicit step, so a body made with no flag has Jolt's own force OFF and the setting
    // "implicit"; `true` is still Jolt's own force, which is what C3 passes, so C3 and its committed results are unchanged.
    const setting = (() => { const w = worlds.jolt(), i = w.addBox({ type: "dynamic", pos: [0, 0, 0], half, density: 1 }), v = w.gyroscopicOf(i); w.destroy(); return v; })();
    ok("!! the gyroscopic setting reaches Jolt's body: by default the wrapper's implicit step, with Jolt's own force OFF (since the third round); off when asked off; Jolt's own force when asked true",
        deflt === false && setting === "implicit" && flag(false) === false && flag(true) === true, `${deflt} ${setting} ${flag(false)} ${flag(true)}`);
    // the spinner's body-frame reading, against the engine's own world-frame numbers turned by hand, after half a second of a
    // stable spin about x with a wobble on y: by then the body has turned 0.2 rad, so the two frames' wobbles differ
    const frameOf = async (c) => { const sp = await L.spinner(c, { w0: [0.4, 1e-3, 0], dt: 1 / 60 }); for (let k = 0; k < 30; k++) sp.step(); const r = sp.read(), raw = sp.raw(); sp.destroy(); return { r, raw }; };
    const bf = { box3d: await frameOf(L.CONFIGS[0]), jolt: await frameOf(L.CONFIGS[2]) };
    ok("!! the spinner reads the BODY frame: each engine's world-frame angular velocity turned by the body's own quaternion, exactly -- and after the turn that is NOT the world-frame reading (so the turning is done)",
        Object.values(bf).every(({ r, raw }) => J(r.w) === J(RB.worldToBody(raw.q, raw.wWorld)) && J(r.q) === J(raw.q) && J(r.w) !== J(raw.wWorld) && near(r.w[0], 0.4, 1e-5)),
        Object.entries(bf).map(([k, v]) => `${k} body (${v.r.w.map((x) => x.toFixed(5)).join(", ")}) world (${v.raw.wWorld.map((x) => x.toFixed(5)).join(", ")})`).join("; "));
    const own = await L.spinner(L.CONFIGS[3], { w0: [0.4, 1e-3, 0], dt: 1 / 60 }); for (let k = 0; k < 30; k++) own.step(); const r4 = own.read();
    // 2026-11-04 (unnumbered) -- RESTATED: C4 names the first-order step it was registered with, since RK4 became the default (the
    // library's own-physics spinner says why), so it is held to rigidBody6dof.step() driven with that step; with the default, RK4, the
    // angular velocity is the same to the bit and only the orientation moves.
    let s = RB.createBody({ mass: 6, I: [6.5, 5, 2.5], w: [0.4, 1e-3, 0] }); for (let k = 0; k < 30; k++) s = RB.step(s, RB.createAccumulator(), 1 / 60, { orientation: "euler" });
    let d = RB.createBody({ mass: 6, I: [6.5, 5, 2.5], w: [0.4, 1e-3, 0] }); for (let k = 0; k < 30; k++) d = RB.step(d, RB.createAccumulator(), 1 / 60);
    ok("!! ...and the engine's own physics is rigidBody6dof.step() driven directly with the step C4 was registered with, to the bit -- and under the default (RK4) only the orientation differs",
        J(r4.w) === J(s.w) && J(r4.q) === J(s.q) && J(d.w) === J(s.w) && J(d.q) !== J(s.q));
    const now = L.battery(m);
    ok("!! C-rebuild's battery on the rebuilt box3d.wasm gives the state hashes the artifact it replaced gave, scene by scene (stack, tumble, joint, ships, bounce)",
        J(now) === J(L.BATTERY_BEFORE) && now.length === 5 && now.every(([, h]) => h.length >= 4), now.map(([n, h]) => n + " " + h[h.length - 1]).join(", "));
} catch (e) { guard(3, e); }

console.log("\n4. THE ROUND ON A MINIATURE (spun about the stable largest axis for 2 s)");
try {
    const r = await L.run({ axis: 0, T: 2, dt: 1 / 60, fineDt: 1 / 120 });
    ok("!! the round runs its controls first and then the four configurations in order, each on ITS OWN engine (box3d, jolt, jolt, own: no fallback), and says it is not the registered run",
        r.registered === false && r.key.ok && r.rebuild.ok && J(r.configs.map((c) => [c.id, c.backendId])) === J([["C1", "box3d"], ["C2", "jolt"], ["C3", "jolt"], ["C4", "own"]]) && !r.stopped);
    ok("!! the gyroscopic force as each ENGINE reports it is recorded: C2's Jolt body has it off and C3's on; box3d and the engine's own physics have no flag (null)",
        J(r.configs.map((c) => c.gyroscopic)) === J([null, false, true, null]), J(r.configs.map((c) => c.gyroscopic)));
    ok("!! every configuration passed C-inertia, C-undamped and C-determinism, and was read at both steps, with the two other axes spun beside it",
        r.configs.every((c) => c.inertia.ok && c.undamped.ok && c.determinism.ok && c.fit && c.fine && J(c.stable.map((x) => x.axis)) === J([0, 2])), r.configs.map((c) => c.id + ":" + c.reading).join(" "));
    const again = await L.readOne(L.CONFIGS[1], { axis: 0, dt: 1 / 60, T: 2 }), c2 = r.configs[1];
    ok("!! a configuration's reading is the rule's, from its fit, and a fresh spin gives the same fit to the bit", c2.reading === L.readingOf(c2.fit) && J(again.fit) === J(c2.fit) && J(again.invariants) === J(c2.invariants));
    const damped = await L.undampedControl(L.CONFIGS[0], { T: 2, damping: 0.05 }), clean = await L.undampedControl(L.CONFIGS[0], { T: 2 });
    ok("!! C-undamped can fail: a box3d body left at 0.05/s damping loses its rate and is refused, the zeroed one keeps it", !damped.ok && damped.worst > 0.05 && clean.ok && clean.worst === 0, `${damped.worst.toFixed(4)} against ${clean.worst}`);
    const a = await L.readOne(L.CONFIGS[2], { axis: 0, dt: 1 / 60, T: 2 }), b = await L.readOne(L.CONFIGS[2], { axis: 0, dt: 1 / 60, T: 2, W: 2.001 });
    ok("!! C-determinism can tell: sameTrace() refuses two spins of Jolt a thousandth apart in rate, and passes two of the same",
        !L.sameTrace(a.trace, b.trace) && L.sameTrace(a.trace, (await L.readOne(L.CONFIGS[2], { axis: 0, dt: 1 / 60, T: 2 })).trace) && !L.sameTrace(a.trace, a.trace.slice(1)));
    const k18 = L.keyControl({ W: 1.8, predicted: L.PREDICTED }), k2 = L.keyControl();
    ok("!! C-key can fail: freeRotation's fit at 1.8 rad/s set against the rate predicted for 2 is refused, and the fit at 2 against its own prediction passes, to 1e-4",
        !k18.ok && k2.ok && Math.abs(k2.sigma / L.PREDICTED - 1) <= 1e-4, `${(k18.sigma / L.PREDICTED - 1).toFixed(4)} refused, ${(k2.sigma / L.PREDICTED - 1).toExponential(2)} passed`);
    const text = L.serialize(r);
    ok("  the results file's text: JSON.parse gives back the result exactly, and every array of numbers sits on one line",
        J(JSON.parse(text)) === J(r) && /"diag": \[[^\n\]]*\]/.test(text) && /"end": \[[^\n\]]*\]/.test(text) && !/"end": \[\n/.test(text), `${text.split("\n").length} lines`);
} catch (e) { guard(4, e); }

console.log("\n5. THE COMMAND (never executed)");
try {
    const cmd = fs.readFileSync(path.join(HERE, "spinningBodyRun.mjs"), "utf8"), code = cmd.replace(/\/\/.*$/gm, "");
    const atOpt = code.indexOf("unknown option"), atRefuse = code.indexOf("refuseExisting(results)"), atRun = code.indexOf("await run()");
    ok("!! the command refuses an option it does not know, then a results file that exists, before it runs the round, exiting 2 on either -- and refuseExisting() is the library's",
        // the exit must FOLLOW each refusal directly: a first draft looked for one within 200 characters of the option check, and G25 found the
        // refusal's own exit two lines down standing in for a deleted one
        atOpt > 0 && atRefuse > atOpt && atRun > atRefuse && /unknown option[^\n]*\); process\.exit\(2\);/.test(code) && /refuseExisting\(results\); if \(refused\) \{ console\.error\([^)]*\); process\.exit\(2\); \}/.test(code) &&
        /never overwritten/.test(L.refuseExisting("/any/r.json", () => true) || "") && L.refuseExisting("/any/r.json", () => false) === null && /from "\.\/spinningBody\.mjs"/.test(code));
    ok("  ...and it prints no score: the result goes to the file through serialize(), and the console says only where",
        !/\.reading|\.fit\b|\.sigma|\.configs|\.key\b|invariants/.test(code) && /fs\.writeFileSync\(results, serialize\(result\)\)/.test(code) && /commit it before reading it/.test(code) && (code.match(/console\.log\(/g) || []).length === 1);
} catch (e) { guard(5, e); }

console.log("\n6. THE VERDICT, AS CODE, FROM THE COMMITTED FILE (physics/mechanics/spinningBodyResults.json, committed unread at a1f0c4b5)");
try {
    // Written AFTER the file was committed and read. Every number the note's verdict states is re-derived here from the file, every reading by this
    // gate's own statement of the rule; the whole registered round is flown again through the library (never the command) and held against the
    // file; and the study made after the read -- the three that keep the term, at 1/240 s for their invariants and at 1/960 s -- is flown and held,
    // testing nothing registered. Until this section nothing here spun a backend about the intermediate axis: the file is committed, so flying the
    // round again chooses nothing.
    const text = fs.readFileSync(L.DEFAULT_RESULTS, "utf8"), R = JSON.parse(text), C = R.configs || [], by = Object.fromEntries(C.map((c) => [c.id, c]));
    const sha = createHash("sha256").update(text).digest("hex");
    const P = 2 * Math.sqrt(((5 - 2.5) * (6.5 - 5)) / (2.5 * 6.5));   // the registration's closed form written out again: W sqrt((I2-I1)(I3-I2)/(I1 I3)), 2.5 < 5 < 6.5, W = 2
    const EU = "Euler's equations", NO = "No gyroscopic term", ELSE = "Something else";
    // THE RULE, from the registration's own words rather than from the library: Euler's equations if the wobble passed 5% of the spin and the fit
    // has r^2 >= 0.999 over >= 20 points and a rate within 10% of the prediction; no gyroscopic term if it never grew past ten times its start.
    const rule = (f) => (f.crossed !== null && f.points >= 20 && f.r2 >= 0.999 && Math.abs(f.sigma / P - 1) <= 0.10 ? EU : f.factor <= 10 ? NO : ELSE);
    const sg = (x, d) => (x >= 0 ? "+" : "-") + Math.abs(x).toFixed(d), pct = (x) => sg(x * 100, 3) + "%", e1 = (x) => x.toExponential(1), th = (x) => x.toLocaleString("en-US");
    const and = (xs) => xs.join(", ").replace(/, ([^,]+)$/, " and $1");
    ok("!! the file is the registered run, committed unread at a1f0c4b5 (sha256 d0a873a8, written at 06:30:37): the body, the spin, the rule, the substeps and the prediction the library's, the intermediate axis for 30 s at 1/60 s and 1/240 s, flagged registered and not stopped, the four configurations in order on their own engines, and its text serialize()'s",
        sha === "d0a873a85b01d6ce888c96a97786d0810af6e4a9dd15eaa142dd2f51e04cf99f" && R.at.startsWith("2026-11-03T06:30:37") && R.registration === L.REGISTRATION && J(R.fixture) === J(L.FIXTURE) && J(R.spin) === J(L.SPIN) &&
        J(R.rule) === J(L.RULE) && J(R.substeps) === J(L.SUBSTEPS) && R.predicted === L.PREDICTED && near(R.predicted, P, 1e-12) && R.registered === true && R.axis === 1 && R.T === 30 && R.dt === 1 / 60 && R.fineDt === 1 / 240 &&
        !("stopped" in R) && J(C.map((c) => [c.id, c.engine, c.label, c.backendId])) === J(L.CONFIGS.map((c) => [c.id, c.engine, c.label, c.engine])) && L.serialize(R) === text, sha.slice(0, 8) + " " + R.at);
    const key = L.keyControl(), off = (c) => c.inertia.diag.map((v, k) => Math.abs(v / [6.5, 5, 2.5][k] - 1));
    ok("!! the controls held, as the file records them and re-derived here: C-key 0.960757 against 0.960769 (-1.2e-5, inside 1e-4) over 719 points, the same when measured again; C-rebuild's 5 scenes with none off; and in every configuration C-inertia (box3d's moments exact, Jolt's to 1e-7, re-read by inertiaControl()), C-undamped (the rate kept exactly) and C-determinism (1,800 steps to the bit)",
        R.key.ok === true && R.key.predicted === L.PREDICTED && Math.abs(R.key.sigma / P - 1) <= 1e-4 && R.key.sigma.toFixed(6) === "0.960757" && R.key.points === 719 && key.ok && near(key.sigma, R.key.sigma, 1e-12) && key.points === R.key.points &&
        J(R.rebuild) === J({ ok: true, scenes: 5, off: [] }) && C.length === 4 && Math.max(...off(by.C1)) === 0 && Math.max(...off(by.C4)) === 0 &&
        C.every((c) => c.inertia.ok && L.inertiaControl(c.inertia).ok && Math.max(...off(c)) < 1e-7 && c.inertia.off.every((v) => v === 0) && c.undamped.ok && c.undamped.worst === 0 && J(c.determinism) === J({ ok: true, steps: 1800 })),
        `C-key ${e1(R.key.sigma / P - 1)}; Jolt's moments off by ${e1(Math.max(...off(by.C2)))}`);
    const EXPECT = [EU, NO, EU, EU];
    ok("!! THE READING, re-derived from each configuration's fit by this gate's own statement of the rule and by the library's readingOf(), is the file's: box3d, Jolt with the opt-in and the engine's own physics read Euler's equations, Jolt as the engine's wrapper makes a body reads No gyroscopic term -- Jolt's own flag off for C2 and on for C3 -- and each reads the same at 1/240 s",
        C.every((c) => rule(c.fit) === c.reading && L.readingOf(c.fit) === c.reading && rule(c.fine.fit) === c.fine.reading && L.readingOf(c.fine.fit) === c.fine.reading) &&
        J(C.map((c) => c.reading)) === J(EXPECT) && J(C.map((c) => c.fine.reading)) === J(EXPECT) && J(C.map((c) => c.gyroscopic)) === J([null, false, true, null]), C.map((c) => c.id + " " + c.reading).join(" | "));
    const kept = C.filter((c) => c.reading === EU), err = (s) => s / P - 1;
    ok("!! the rates, from the file: inside the registered 10% by far (the worst 0.801%), r^2 above 0.99999999 over 387 to 392 points, 5% of the spin reached between 9.31 and 9.42 s; at 1/240 s box3d's and Jolt's rates move toward the prediction and the engine's own stays, to 1e-7",
        kept.length === 3 && Math.max(...kept.map((c) => Math.abs(err(c.fit.sigma)))) < 0.0081 && kept.every((c) => c.fit.r2 > 0.99999999 && c.fit.points >= 387 && c.fit.points <= 392 && c.fit.crossed >= 9.31 && c.fit.crossed <= 9.42) &&
        ["C1", "C3"].every((id) => Math.abs(err(by[id].fine.fit.sigma)) < Math.abs(err(by[id].fit.sigma))) && Math.abs(by.C4.fine.fit.sigma / by.C4.fit.sigma - 1) < 1e-7,
        kept.map((c) => `${c.id} ${pct(err(c.fit.sigma))} -> ${pct(err(c.fine.fit.sigma))}`).join(", "));
    const c2 = by.C2;
    ok("!! C2 is the dropped term, as freeRotation described it: the wobble never grew (the largest 1.0000093 of its start, 1.0000297 at 1/240 s), the spin never flipped, and the energy and the body-frame momentum held to 1e-14 -- while the three that read Euler's equations flipped 2, 1 and 1 times",
        c2.fit.points === 0 && c2.fit.crossed === null && c2.fit.factor < 1.0001 && c2.fine.fit.factor < 1.0001 && c2.invariants.flips === 0 && c2.invariants.driftE < 1e-14 && c2.invariants.driftL < 1e-14 &&
        J(C.map((c) => c.invariants.flips)) === J([2, 0, 1, 1]), `factor ${c2.fit.factor.toFixed(7)}, energy drift ${e1(c2.invariants.driftE)}`);
    const lw = kept.map((c) => c.invariants.driftWorldL);
    ok("  reported, testing nothing: the world-frame momentum cannot show the term at this wobble -- dropping it moves the momentum by 1.0e-5 (the wobble's own size), and the three that keep it move it by 6.9e-3 to 8.0e-3",
        c2.invariants.driftWorldL > 5e-6 && c2.invariants.driftWorldL < 2e-5 && Math.min(...lw) > 5e-3 && Math.max(...lw) < 1e-2, `${e1(c2.invariants.driftWorldL)} against ${e1(Math.min(...lw))} to ${e1(Math.max(...lw))}`);
    // Euler's bound for THIS wobble, in closed form: about the largest axis it starts on its ellipse's long side, so it never passes its start; about the
    // smallest it starts on the short side, and the long side is sqrt((I1 - I3) I1 / ((I2 - I3) I2)) of it
    const bound = Math.sqrt(((6.5 - 2.5) * 6.5) / ((5 - 2.5) * 5)), st = (id) => by[id].stable.map((s) => s.factor);
    ok("  reported, testing nothing: the stable spins -- box3d and the engine's own physics keep this wobble inside Euler's bounds (its start about the largest axis, 1.4422 of it about the smallest); Jolt with the opt-in goes past both (1.6032 and 1.9566); Jolt as wrapped holds both at 1.0000",
        J(C.map((c) => c.stable.map((s) => s.axis))) === J([[0, 2], [0, 2], [0, 2], [0, 2]]) && bound.toFixed(4) === "1.4422" && ["C1", "C4"].every((id) => st(id)[0] === 1 && st(id)[1] <= bound + 1e-9) &&
        st("C3")[0] > 1.5 && st("C3")[1] > 1.3 * bound && st("C2").every((f) => f < 1.0001), C.map((c) => c.id + " " + st(c.id).map((f) => f.toFixed(4)).join("/")).join(", "));
    const pred = { P1: by.C1.reading === EU, P2: c2.reading === NO, P3: by.C3.reading === EU, P4: by.C4.reading === EU, P5: by.C1.invariants.energyChange < -0.01 };
    ok("!! the five predictions, read off the file: all five right -- P1 to P4 the readings, P5 box3d's energy falling 1.30% over the 30 s (more than 1%)",
        Object.values(pred).every(Boolean) && (-100 * by.C1.invariants.energyChange).toFixed(2) === "1.30", J(pred));
    // the round flown again: every reading, flag and count exactly, every other number to 1e-9 of its size (WebAssembly is deterministic; the
    // tolerance is for a JavaScript engine whose Math.log differs in the last bit)
    let worst = 0, where = "";
    const same = (a, b, p) => {
        if (typeof a === "number" && typeof b === "number") {
            if (Number.isInteger(a) && Number.isInteger(b)) return a === b;
            const d = Math.abs(a - b) / Math.max(1, Math.abs(a), Math.abs(b)); if (d > worst) { worst = d; where = p; } return d <= 1e-9;
        }
        if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, k) => same(x, b[k], `${p}[${k}]`));
        if (a && b && typeof a === "object" && typeof b === "object") { const ka = Object.keys(a).sort(), kb = Object.keys(b).sort(); return J(ka) === J(kb) && ka.every((k) => same(a[k], b[k], `${p}.${k}`)); }
        return a === b;
    };
    const again = await L.run(), { at: atA, ...flown } = again, { at: atR, ...filed } = R;
    ok("!! the registered round flown again at this head, through the library: run() gives back the file -- every reading, flag and count exactly, every number to 1e-9 (only the time it was written differs)",
        again.registered === true && typeof atA === "string" && typeof atR === "string" && same(flown, filed, "R"), `worst ${worst.toExponential(1)}${where ? " at " + where : ""}`);
    // AFTER THE READ, testing nothing registered (the note's "After the read" table): the three that keep the term, at 1/240 s and 1/960 s; 1/60 s is the file's
    const steps = [60, 240, 960], at = {};
    for (const id of ["C1", "C3", "C4"]) { const cfg = L.CONFIGS.find((x) => x.id === id); at[id] = { 60: by[id] }; for (const k of [240, 960]) at[id][k] = await L.readOne(cfg, { axis: 1, dt: 1 / k, T: 30 }); }
    const rate = (id, k) => at[id][k].fit.sigma, inv = (id, k) => at[id][k].invariants, own = steps.map((k) => inv("C4", k));
    ok("  after the read, testing nothing registered: the engine's own physics is right to fourth order in its spin and to first in its orientation -- its rate the same at 1/60, 1/240 and 1/960 s (to 1e-6), its energy drift falling over 128 times from 1/60 s to 1/240 s (RK4's 256) and its world-frame momentum's drift by 4 each time (one forward step of the orientation)",
        Math.max(...steps.map((k) => rate("C4", k))) / Math.min(...steps.map((k) => rate("C4", k))) - 1 < 1e-6 && own[0].driftE / own[1].driftE > 128 && own[2].driftE < 1e-13 &&
        [0, 1].every((n) => own[n].driftWorldL / own[n + 1].driftWorldL > 3.8 && own[n].driftWorldL / own[n + 1].driftWorldL < 4.2), `energy ${own.map((v) => e1(v.driftE)).join(", ")}; world momentum ${own.map((v) => e1(v.driftWorldL)).join(", ")}`);
    const vsOwn = (id, k) => rate(id, k) / rate("C4", k) - 1, explicit = (h) => Math.log(1 + P * h) / (P * h) - 1, backward = (h) => -Math.log(1 - P * h) / (P * h) - 1;
    const om0 = Math.sqrt(((6.5 - 2.5) / 5) * 2 * ((6.5 - 5) / 2.5) * 2), om2 = Math.sqrt(((5 - 2.5) / 6.5) * 2 * ((6.5 - 2.5) / 5) * 2), grow = (om) => Math.pow(1 + (om / 60) ** 2, 1800 / 2);
    const st3 = st("C3"), j = steps.map((k) => inv("C3", k).energyChange);
    ok("  ...and Jolt's opt-in behaves as an explicit step: against the engine's own at the same step its rate is off by ln(1 + sigma h)/(sigma h) - 1 to 0.01 of a point at each step, its stable spins grow as (1 + (Omega h)^2)^(N/2) to 2% (1.62 and 1.96), and its energy change grows roughly with the number of steps",
        steps.every((k) => Math.abs(vsOwn("C3", k) - explicit(1 / k)) < 1e-4) && Math.abs(st3[0] / grow(om0) - 1) < 0.02 && Math.abs(st3[1] / (bound * grow(om2)) - 1) < 0.02 &&
        [0, 1].every((n) => j[n + 1] / j[n] > 3 && j[n + 1] / j[n] < 4), `${steps.map((k) => pct(vsOwn("C3", k))).join(", ")} against ${steps.map((k) => pct(explicit(1 / k))).join(", ")}; ${grow(om0).toFixed(2)} and ${(bound * grow(om2)).toFixed(2)}`);
    const b = steps.map((k) => vsOwn("C1", k)), be = steps.map((k) => inv("C1", k).energyChange);
    ok("  ...and box3d matches backward Euler on its substep only at the pages' step: +0.203% against +0.201% at 1/60 s, then it stops shrinking (+0.062% and +0.066%, where that term gives +0.050% and +0.013%), and its energy rises at the finer steps (+0.825% and +5.602%)",
        Math.abs(b[0] - backward(1 / 240)) < 1e-4 && b[2] > 0.9 * b[1] && b[2] > 3 * backward(1 / 3840) && be[0] < -0.01 && be[1] > 0 && be[2] > 0.03,
        `${b.map(pct).join(", ")} against ${[240, 960, 3840].map((k) => pct(backward(1 / k))).join(", ")}; energy ${be.map(pct).join(", ")}`);
    const note = fs.readFileSync(path.join(ENG, L.REGISTRATION), "utf8"), vAt = note.indexOf("\n## The verdict, 2026-11-03"), vEnd = vAt >= 0 ? note.indexOf("\n## ", vAt + 1) : -1;
    const vt = vAt >= 0 ? note.slice(vAt, vEnd > 0 ? vEnd : undefined).replace(/\s+/g, " ") : "";   // that section alone, its line breaks read as spaces
    const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), stands = (x) => new RegExp("(?<![0-9])" + esc(x) + "(?![0-9])").test(vt);
    const NAME = { C1: "C1 box3d", C2: "C2 Jolt as wrapped", C3: "C3 Jolt with the opt-in", C4: "C4 the engine's own" }, flag = (c) => (c.gyroscopic === null ? "no flag" : c.gyroscopic ? "on" : "off");
    const rowA = (c) => (c.fit.points ? `| ${NAME[c.id]} | ${flag(c)} | ${c.fit.sigma.toFixed(6)} | ${pct(err(c.fit.sigma))} | ${c.fit.r2.toFixed(9)} | ${c.fit.points} | ${c.fit.crossed.toFixed(2)} s | ${th(Math.round(c.fit.factor))} | ${c.fine.fit.sigma.toFixed(6)} (${pct(err(c.fine.fit.sigma))}) | ${c.reading} |`
        : `| ${NAME[c.id]} | ${flag(c)} | -- | -- | -- | ${c.fit.points} | never | ${c.fit.factor.toFixed(7)} | -- (largest ${c.fine.fit.factor.toFixed(7)}) | ${c.reading} |`);
    const rowB = (c) => { const v = c.invariants; return `| ${NAME[c.id]} | ${v.flips} | ${e1(v.energyChange)} | ${e1(v.driftE)} | ${e1(v.driftL)} | ${e1(v.driftWorldL)} | ${st(c.id)[0].toFixed(4)} | ${st(c.id)[1].toFixed(4)} |`; };
    const rowC = (id) => `| ${NAME[id]} | ${steps.map((k) => pct(err(rate(id, k)))).join(", ")} | ${steps.map((k) => e1(inv(id, k).energyChange)).join(", ")} | ${steps.map((k) => e1(inv(id, k).driftE)).join(", ")} | ${steps.map((k) => e1(inv(id, k).driftWorldL)).join(", ")} |`;
    const frags = [...C.map(rowA), ...C.map(rowB), ...["C1", "C3", "C4"].map(rowC), `(${th(text.length)} bytes, sha256 ${sha.slice(0, 8)})`,
                   `measured ${R.key.sigma.toFixed(6)}/s against the predicted ${P.toFixed(6)} (${e1(R.key.sigma / P - 1)}, inside 1e-4)`, `r^2 ${R.key.r2.toFixed(10)} over ${R.key.points} points`,
                   `the battery's ${R.rebuild.scenes} scenes`, `${th(by.C1.determinism.steps)} steps`, `the largest was ${c2.fit.factor.toFixed(7)}`, `flipped ${and(kept.map((c) => c.invariants.flips))} times`,
                   `moves it by ${e1(c2.invariants.driftWorldL)}`, `move it by ${e1(Math.min(...lw))} to ${e1(Math.max(...lw))}`, `reaches at most ${bound.toFixed(4)} of it`, `to ${st3[0].toFixed(4)} and ${st3[1].toFixed(4)}`,
                   `fell ${(-100 * by.C1.invariants.energyChange).toFixed(2)}% over the 30 s`, ...Object.keys(pred).map((k) => `**${k}: ${pred[k] ? "right" : "wrong"}.**`),
                   `its rate is off by ${and(steps.map((k) => pct(vsOwn("C3", k))))}`, `- 1 is ${and(steps.map((k) => pct(explicit(1 / k))))}`,
                   `gives ${grow(om0).toFixed(2)} and ${(bound * grow(om2)).toFixed(2)}, against the ${st3[0].toFixed(2)} and ${st3[1].toFixed(2)} measured`, `off by ${pct(b[0])} at 1/60 s`, `substep gives ${pct(backward(1 / 240))}`,
                   `${pct(b[1])} at 1/240 s and ${pct(b[2])} at 1/960 s, where that term gives ${pct(backward(1 / 960))} and ${pct(backward(1 / 3840))}`, `${pct(be[1])} at 1/240 s and ${pct(be[2])} at 1/960 s`,
                   `${and(j.map(e1))}, roughly in proportion`];
    const missing = frags.filter((x) => !stands(x));
    ok("!! the note's verdict carries the file's numbers, each configuration's row in its three tables, each prediction's outcome as the file decides it, and the study after the read as this section measures it (no digit may touch a fragment's ends; read from that section alone)",
        vAt > 0 && missing.length === 0, missing.length ? "missing: " + missing.join(" || ").slice(0, 300) : `${frags.length} fragments`);
} catch (e) { guard(6, e); }

console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)` +
    "\nnot closed here: what Jolt's gyroscopic default costs (turned on 2026-11-03; the note's second round measures it), the engine's own first-order orientation step, and what moves box3d's energy below the pages' step.");
process.exitCode = fails ? 1 : 0;
