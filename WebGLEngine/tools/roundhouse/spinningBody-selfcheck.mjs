// WebGLEngine/tools/roundhouse/spinningBody-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/roundhouse/spinningBody-selfcheck.mjs      (~1 s)
//
// THE GATE OF tools/roundhouse/spinningBody.mjs (and its command, tools/roundhouse/spinningBodyRun.mjs): the spinning
// body, as physics/mechanics/SPINNING_BODY_WIP.md registers it -- and of the angular calls it needed, added to box3d's
// shim, wasm and loader and to Jolt's wrapper in the same commit.
// *** NOTHING HERE SPINS A BACKEND ABOUT THE INTERMEDIATE AXIS, AND NOTHING HERE STARTS THE COMMAND. *** Every engine spin
// below is about a STABLE axis, so the gate sees nothing of the registered answer. The command is never executed: were a
// sabotage to remove its option check, an execution would fall through to the registered round; its guards are held as
// library functions and as the order of its source.
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
"use strict";
import fs from "node:fs";
import path from "node:path";
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
    ok("!! the four configurations, in order: box3d; Jolt with the gyroscopic force off (its default); Jolt with the opt-in; the engine's own rigidBody6dof",
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
    ok("!! the gyroscopic opt-in reaches Jolt's body, and stays an opt-in: off by default, off when asked off, on when asked on", deflt === false && flag(false) === false && flag(true) === true, `${deflt} ${flag(false)} ${flag(true)}`);
    // the spinner's body-frame reading, against the engine's own world-frame numbers turned by hand, after half a second of a
    // stable spin about x with a wobble on y: by then the body has turned 0.2 rad, so the two frames' wobbles differ
    const frameOf = async (c) => { const sp = await L.spinner(c, { w0: [0.4, 1e-3, 0], dt: 1 / 60 }); for (let k = 0; k < 30; k++) sp.step(); const r = sp.read(), raw = sp.raw(); sp.destroy(); return { r, raw }; };
    const bf = { box3d: await frameOf(L.CONFIGS[0]), jolt: await frameOf(L.CONFIGS[2]) };
    ok("!! the spinner reads the BODY frame: each engine's world-frame angular velocity turned by the body's own quaternion, exactly -- and after the turn that is NOT the world-frame reading (so the turning is done)",
        Object.values(bf).every(({ r, raw }) => J(r.w) === J(RB.worldToBody(raw.q, raw.wWorld)) && J(r.q) === J(raw.q) && J(r.w) !== J(raw.wWorld) && near(r.w[0], 0.4, 1e-5)),
        Object.entries(bf).map(([k, v]) => `${k} body (${v.r.w.map((x) => x.toFixed(5)).join(", ")}) world (${v.raw.wWorld.map((x) => x.toFixed(5)).join(", ")})`).join("; "));
    const own = await L.spinner(L.CONFIGS[3], { w0: [0.4, 1e-3, 0], dt: 1 / 60 }); for (let k = 0; k < 30; k++) own.step(); const r4 = own.read();
    let s = RB.createBody({ mass: 6, I: [6.5, 5, 2.5], w: [0.4, 1e-3, 0] }); for (let k = 0; k < 30; k++) s = RB.step(s, RB.createAccumulator(), 1 / 60);
    ok("!! ...and the engine's own physics is rigidBody6dof.step() driven directly, to the bit", J(r4.w) === J(s.w) && J(r4.q) === J(s.q));
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

console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)` +
    "\nnot closed here: the round itself -- the registered run writes physics/mechanics/spinningBodyResults.json, committed before it is read, and its verdict becomes section 6.");
process.exitCode = fails ? 1 : 0;
