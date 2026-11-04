// WebGLEngine/tools/roundhouse/spinningBody.mjs -- UNNUMBERED (the version is chosen at ship time)
// ---------------------------------------------------------------------------------------------------------------
// THE SPINNING BODY, as physics/mechanics/SPINNING_BODY_WIP.md registers it: a free 1 x 2 x 3 block spun at 2 rad/s
// about its intermediate axis with a wobble of 1e-5 of the spin, in four configurations -- box3d undamped, Jolt as the
// engine's wrapper makes a body (gyroscopic force off), Jolt with the gyroscopic opt-in, and the engine's own
// rigidBody6dof.step() -- each read by the RATE its wobble grows at, against the 0.960769/s Euler's equations predict.
//
// It builds on two rounds that stopped short of this on purpose:
//   - physics/mechanics/freeRotation.mjs (v3562) is the answer key, and found that only the RATE tells a solver that
//     keeps the gyroscopic term from one that drops it (a dropped term conserves everything and never flips);
//   - tools/roundhouse/backendRotation.mjs (v3564) saw box3d's spin axis reverse through the orientation alone, and
//     could not ask about the rate: the shim damped every box at 0.05/s and no backend reported angular velocity.
// Both are closed in the same commit as this file: box3d's shim and wasm gained angular velocity and damping, and
// Jolt's wrapper gained angular velocity and the gyroscopic opt-in.
//
// The library: the registration as data, one spinning body in any configuration, the fit, the reading, the
// invariants, the controls, the run, and the results file's format. The command is tools/roundhouse/spinningBodyRun.mjs
// (it prints no score); the gate is tools/roundhouse/spinningBody-selfcheck.mjs.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { boxInertia, intermediateAxis, stabilityRate, measureGrowth, rotateByQuat } from "../../physics/mechanics/freeRotation.mjs";
import * as RB from "../../physics/mechanics/rigidBody6dof.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
export const REGISTRATION = "physics/mechanics/SPINNING_BODY_WIP.md";
export const DEFAULT_RESULTS = path.join(ENG, "physics", "mechanics", "spinningBodyResults.json");
/** v3564's body: half-extents 0.5 x 1.0 x 1.5, density 1 -- mass 6, moments 6.5 / 5 / 2.5, the intermediate axis y. */
export const FIXTURE = Object.freeze({ hx: 0.5, hy: 1.0, hz: 1.5, density: 1 });
/** The spin: 2 rad/s, a wobble of 1e-5 of it on the next axis, 30 s at the pages' 1/60 s (and 1/240 s, reported). */
export const SPIN = Object.freeze({ W: 2, eps: 1e-5, T: 30, dt: 1 / 60, fineDt: 1 / 240 });
/**
 * The reading's rule. "Euler's equations": the wobble passes `cap` of the spin inside the window, and a line fitted to
 * its logarithm -- from `skip` times its starting size to `cap` of the spin, freeRotation's band -- has r^2 >= `r2`
 * over >= `minPoints` points and a slope within `tol` of the prediction. "No gyroscopic term": the wobble never grows
 * past `noGrowth` times its starting size. Otherwise "Something else".
 */
export const RULE = Object.freeze({ tol: 0.10, r2: 0.999, minPoints: 20, skip: 10, cap: 0.05, noGrowth: 10 });
/** The substeps each engine's pages step with: box3dLoader's step() default and Jolt's one collision step. */
export const SUBSTEPS = Object.freeze({ box3d: 4, jolt: 1 });
// 2026-11-03 (unnumbered) -- C2's label is the registered one, written when the wrapper's default was off. The same day Keith turned the
// default ON (physics/jolt/joltLoader.js; the note's second round). C2 still passes the flag false, as registered, so it still measures the
// body it was registered to and its committed results still describe it; "as the engine's wrapper makes a body" now means "as it made one".
export const CONFIGS = Object.freeze([
    Object.freeze({ id: "C1", engine: "box3d", gyroscopic: null, label: "box3d, undamped" }),
    Object.freeze({ id: "C2", engine: "jolt", gyroscopic: false, label: "Jolt as the engine's wrapper makes a body (gyroscopic force off), undamped" }),
    Object.freeze({ id: "C3", engine: "jolt", gyroscopic: true, label: "Jolt with the gyroscopic opt-in, undamped" }),
    Object.freeze({ id: "C4", engine: "own", gyroscopic: null, label: "the engine's own physics, rigidBody6dof.step()" }),
]);
/** The fixture's mass, moments and intermediate axis, from freeRotation's own boxInertia. */
export function fixtureBody(f = FIXTURE) {
    const m = 8 * f.hx * f.hy * f.hz * f.density, I = boxInertia({ m, hx: f.hx, hy: f.hy, hz: f.hz });
    return { m, I, mid: intermediateAxis(I) };
}
/** The prediction, from the linearisation and never fitted: sigma = W sqrt((I2-I1)(I3-I2)/(I1 I3)). */
export const PREDICTED = stabilityRate(fixtureBody().I, fixtureBody().mid, SPIN.W).sigma;

// ---- the engines --------------------------------------------------------------------------------------------------
let _engines = null;
/**
 * The two engines, each through ITS OWN loader. Never physics/backend.js's selectBackend(): asked for box3d when box3d
 * is not ready it hands back Jolt without a word, and this round would then be comparing Jolt with itself.
 */
export async function engines() {
    if (_engines) return _engines;
    const { adoptBox3dInNode } = await import("../../physics/backendNode.mjs");
    const { box3d } = await import("../../physics/box3d/box3dLoader.js");
    const { createJoltBackend } = await import("../../physics/jolt/joltLoader.js");
    const st = await adoptBox3dInNode();
    if (!st || !st.ready) throw new Error("box3d is not loadable from Node: " + (st && st.reason));
    _engines = { box3d, jolt: await createJoltBackend() };
    return _engines;
}

/**
 * One body of the fixture in a configuration's world, zero gravity, zero damping, no rotation, started at `w0` (world
 * frame = body frame at t = 0). { backendId, inertia, step(), read() -> { w: BODY-frame angular velocity, q: [w,x,y,z] },
 * destroy() }. The engines report angular velocity in the world frame; read() turns it into the body frame by the
 * body's own quaternion (rigidBody6dof.worldToBody).
 */
export async function spinner(config, { w0, dt, f = FIXTURE, damping = 0 } = {}) {
    const { m, I } = fixtureBody(f);
    if (config.engine === "own") {
        if (damping !== 0) throw new Error("rigidBody6dof has no damping to set");
        let s = RB.createBody({ mass: m, I, w: w0 });
        // 2026-11-04 (unnumbered) -- RESTATED, NOT WIDENED: C4 was registered as "the engine's own physics, rigidBody6dof.step()", and
        // that step moved the orientation by its first-order step. Keith made RK4 the default (physics/mechanics/ORIENTATION_STEP_WIP.md,
        // whose round measured C4's own drift), so C4 names the step it was registered with, as C2 names `false`: it still measures the
        // body it was registered to, and its committed results still describe it.
        const acc = RB.createAccumulator(), OWN_STEP = Object.freeze({ orientation: "euler" });
        return { backendId: "own", gyroscopic: null, inertia: { diag: [...I], off: [0, 0, 0] }, step() { s = RB.step(s, acc, dt, OWN_STEP); }, read() { return { w: [...s.w], q: [...s.q] }; },
                 raw() { return { wWorld: rotateByQuat(s.q, s.w), q: [...s.q] }; }, destroy() {} };
    }
    const E = await engines(), half = [f.hx, f.hy, f.hz], opts = { type: "dynamic", pos: [0, 0, 0], half, density: f.density };
    const world = (config.engine === "box3d" ? E.box3d : E.jolt).createWorld({ gravity: [0, 0, 0] });
    const i = config.engine === "jolt" ? world.addBox({ ...opts, damping: 0, gyroscopic: config.gyroscopic === true }) : world.addBox(opts);
    if (!world.setDamping(i, damping, damping)) throw new Error(config.engine + ": the damping could not be set");   // zero, unless a gate asks to see C-undamped fail
    if (!world.setAngularVelocity(i, w0)) throw new Error(config.engine + ": the angular velocity could not be set");
    const sub = SUBSTEPS[config.engine];
    // what the ENGINE says about the gyroscopic force on this body: Jolt reports its per-body flag; box3d has none (its
    // solver always applies the term), so null -- recorded in the results, so "C3 had the opt-in" is read, not assumed
    const gyroscopic = config.engine === "jolt" ? world.raw().bodyOf(i).GetApplyGyroscopicForce() : null;
    const raw = () => { const v = world.readAngularVelocities(), wWorld = [v[i * 3], v[i * 3 + 1], v[i * 3 + 2]], t = world.readTransforms(); return { wWorld, q: [t[i * 7 + 6], t[i * 7 + 3], t[i * 7 + 4], t[i * 7 + 5]] }; };
    return {
        backendId: world.backendId(), gyroscopic, inertia: world.inertia(i), raw,
        step() { world.step(dt, sub); },
        read() {
            // the angular velocity is COPIED OUT before readTransforms(): box3d hands back views of its heap, and a first
            // readTransforms() mallocs its buffer -- a malloc that grows memory detaches every view taken before it
            const v = world.readAngularVelocities(), wWorld = [v[i * 3], v[i * 3 + 1], v[i * 3 + 2]];
            const t = world.readTransforms(), q = [t[i * 7 + 6], t[i * 7 + 3], t[i * 7 + 4], t[i * 7 + 5]];   // layout x y z qx qy qz qw
            return { w: RB.worldToBody(q, wWorld), q };
        },
        destroy() { world.destroy(); },
    };
}

/** Spin a configuration's body from `w0` for T seconds at `dt`: its body-frame angular velocity and orientation at t = 0 and after every step. */
export async function spin(config, { w0, dt = SPIN.dt, T = SPIN.T, f = FIXTURE, damping = 0 } = {}) {
    const sp = await spinner(config, { w0, dt, f, damping }), steps = Math.round(T / dt), trace = [sp.read()];
    for (let n = 1; n <= steps; n++) { sp.step(); trace.push(sp.read()); }
    sp.destroy();
    return { backendId: sp.backendId, gyroscopic: sp.gyroscopic, inertia: sp.inertia, dt, steps, trace };
}

/** The starting spin: W about `axis`, and a wobble of eps * W on the next axis (freeRotation's measureGrowth seeds the same one). */
export function startOf(axis, { W = SPIN.W, eps = SPIN.eps } = {}) { const w = [0, 0, 0]; w[axis] = W; w[(axis + 1) % 3] = eps * W; return w; }
/** The wobble: the body-frame angular velocity off the spin axis -- the length of its other two parts. */
export const wobbleOf = (w, axis) => Math.hypot(...w.filter((_, k) => k !== axis));

/**
 * THE FIT, as freeRotation's measureGrowth makes it: ln(wobble) against t over the band from `skip` times the starting
 * wobble (a decade of transient skipped: near t = 0 the decaying mode is still in the mixture) to `cap` of the spin,
 * stopping where the wobble first passes the cap. { p0, sigma, r2, points, crossed (s, or null), factor (largest wobble / starting) }.
 */
export function fitGrowth(trace, { dt, axis, W = SPIN.W, rule = RULE } = {}) {
    const p0 = wobbleOf(trace[0].w, axis), lo = rule.skip * p0, hi = rule.cap * W, xs = [], ys = [];
    let crossed = null, peak = p0;
    for (let n = 0; n < trace.length; n++) {
        const p = wobbleOf(trace[n].w, axis);
        if (p > peak) peak = p;
        if (crossed !== null) continue;
        if (p > hi) { crossed = n * dt; continue; }
        if (p >= lo) { xs.push(n * dt); ys.push(Math.log(p)); }
    }
    const k = xs.length;
    if (k < 2) return { p0, sigma: 0, r2: 0, points: k, crossed, factor: peak / p0 };
    const sx = xs.reduce((a, b) => a + b, 0), sy = ys.reduce((a, b) => a + b, 0), sxx = xs.reduce((a, b) => a + b * b, 0), sxy = xs.reduce((a, b, j) => a + b * ys[j], 0);
    const slope = (k * sxy - sx * sy) / (k * sxx - sx * sx), inter = (sy - slope * sx) / k, ybar = sy / k;
    const ssTot = ys.reduce((a, b) => a + (b - ybar) ** 2, 0), ssRes = ys.reduce((a, b, j) => a + (b - (slope * xs[j] + inter)) ** 2, 0);
    return { p0, sigma: slope, r2: ssTot > 0 ? 1 - ssRes / ssTot : 0, points: k, crossed, factor: peak / p0 };
}

/** The registered rule, as code. */
export function readingOf(fit, { rule = RULE, predicted = PREDICTED } = {}) {
    if (fit.crossed !== null && fit.points >= rule.minPoints && fit.r2 >= rule.r2 && Math.abs(fit.sigma / predicted - 1) <= rule.tol) return "Euler's equations";
    if (fit.factor <= rule.noGrowth) return "No gyroscopic term";
    return "Something else";
}

/**
 * Reported, testing nothing: the drift of rotational energy and of the angular momentum's length in the body frame, of
 * the angular momentum VECTOR in the world frame (through the orientation, which the body-frame invariants never
 * touch), the energy's change over the window, and the flips -- sign changes of the spin about `axis`.
 */
export function invariants(trace, I, axis) {
    const E = (w) => 0.5 * (I[0] * w[0] * w[0] + I[1] * w[1] * w[1] + I[2] * w[2] * w[2]), Lb = (w) => [I[0] * w[0], I[1] * w[1], I[2] * w[2]];
    const E0 = E(trace[0].w), L0 = Math.hypot(...Lb(trace[0].w)), Lw0 = rotateByQuat(trace[0].q, Lb(trace[0].w));
    let dE = 0, dL = 0, dLw = 0, flips = 0, sign = Math.sign(trace[0].w[axis]);
    for (const s of trace) {
        dE = Math.max(dE, Math.abs(E(s.w) - E0) / E0); dL = Math.max(dL, Math.abs(Math.hypot(...Lb(s.w)) - L0) / L0);
        const Lw = rotateByQuat(s.q, Lb(s.w)); dLw = Math.max(dLw, Math.hypot(Lw[0] - Lw0[0], Lw[1] - Lw0[1], Lw[2] - Lw0[2]) / L0);
        const g = Math.sign(s.w[axis]); if (g !== 0 && g !== sign) { flips++; sign = g; }
    }
    return { energyChange: (E(trace[trace.length - 1].w) - E0) / E0, driftE: dE, driftL: dL, driftWorldL: dLw, flips };
}

// ---- the controls ---------------------------------------------------------------------------------------------------
/** C-key: freeRotation's own fit at dt = 1e-3 measures the predicted rate (the instrument can see the effect). `predicted` defaults to the rate for W; a gate hands another to see the control refuse. */
export function keyControl({ W = SPIN.W, predicted = null } = {}) {
    const { I, mid } = fixtureBody(), g = measureGrowth({ I, axis: mid, Omega: W });
    if (predicted === null) predicted = stabilityRate(I, mid, W).sigma;
    return { ok: Math.abs(g.sigma / predicted - 1) <= 1e-4, sigma: g.sigma, predicted, r2: g.r2, points: g.points };
}
/** C-inertia: an engine's body has the fixture's moments, as the engine itself reports them, to 1e-3. */
export function inertiaControl(inertia, f = FIXTURE) {
    const { I } = fixtureBody(f), top = Math.max(...I);
    const ok = !!inertia && inertia.diag.every((v, k) => Math.abs(v / I[k] - 1) <= 1e-3) && inertia.off.every((v) => Math.abs(v) <= 1e-3 * top);
    return { ok, diag: inertia ? inertia.diag : null, off: inertia ? inertia.off : null };
}
/** C-undamped: a body spun EXACTLY about its largest axis keeps its rate to 1e-4 over the window. */
export async function undampedControl(config, { W = SPIN.W, dt = SPIN.dt, T = SPIN.T, damping = 0 } = {}) {
    const { I } = fixtureBody(), big = I.indexOf(Math.max(...I)), w0 = [0, 0, 0]; w0[big] = W;
    const r = await spin(config, { w0, dt, T, damping });
    const worst = Math.max(...r.trace.map((s) => Math.abs(Math.hypot(...s.w) / W - 1)));
    return { ok: worst <= 1e-4, worst, axis: big };
}

/**
 * C-rebuild: a fixed battery of scenes on the raw box3d module -- a stack falling onto ground, a tumbling box, a jointed
 * pair, two ships, a bouncing box -- and its state hash every 30 steps. BATTERY_BEFORE is that battery on the artifact
 * this commit replaced (vendor/box3d/box3d.wasm, sha256 1d1ac2d9...), measured before it was replaced.
 */
export function battery(m) {
    const out = [];
    const run = (name, setup, steps) => { setup(); const h = []; for (let i = 1; i <= steps; i++) { m._swk_world_step(1 / 60, 4); if (i % 30 === 0) h.push(m._swk_state_hash() >>> 0); } m._swk_world_destroy(); out.push([name, h]); };
    run("stack", () => { m._swk_world_create(0, -10, 0); m._swk_body_box(0, 0, -0.5, 0, 20, 0.5, 20, 1); for (let k = 0; k < 10; k++) m._swk_body_box(1, (k % 3) * 0.1, 0.5 + k * 1.05, 0, 0.5, 0.5, 0.5, 1); }, 240);
    run("tumble", () => { m._swk_world_create(0, 0, 0); m._swk_body_box(1, 0, 0, 0, 0.5, 1, 1.5, 1); m._swk_body_ang_impulse(0, 0.1, 10, 0.2); }, 240);
    run("joint", () => { m._swk_world_create(0, -10, 0); m._swk_body_box(0, 0, 5, 0, 0.2, 0.2, 0.2, 1); m._swk_body_box(1, 1, 5, 0, 0.5, 0.1, 0.1, 1); m._swk_joint_revolute(0, 1, 0, 5, 0, 0, 0, 1, -1, 1); }, 240);
    run("ships", () => { m._swk_world_create(0, 0, 0); m._swk_body_ship(0, 0, 0.5, 1); m._swk_body_ship(3, 0, 0.5, 1); m._swk_body_set_velocity(0, 2, 0, 0.1); }, 120);
    run("bounce", () => { m._swk_world_create(0, -10, 0); m._swk_body_box(0, 0, -0.5, 0, 5, 0.5, 5, 1); m._swk_body_box(1, 0, 3, 0, 0.3, 0.3, 0.3, 1); m._swk_body_set_restitution(1, 0.8); m._swk_body_set_friction(1, 0.2); m._swk_body_ang_impulse(1, 0.05, 0, 0.02); }, 240);
    return out;
}
export const BATTERY_BEFORE = Object.freeze([
    ["stack", [2273344627, 2103165589, 4264430166, 4264430166, 4264430166, 4264430166, 4264430166, 4264430166]],
    ["tumble", [3998303589, 2955013188, 2491885753, 3158297664, 3429227969, 3734703626, 2889636399, 2362512581]],
    ["joint", [1853333711, 2697574902, 2697574902, 2697574902, 2697574902, 2697574902, 2697574902, 2697574902]],
    ["ships", [1188546869, 4019743239, 2507563248, 2887465084]],
    ["bounce", [2052801906, 1343491421, 342022115, 3794502413, 1288360310, 1211660982, 1645498158, 3992365136]],
]);
export async function rebuildControl() {
    await engines();
    const { mod } = await import("../../physics/box3d/box3dNode.mjs"), now = battery(mod());
    const off = now.filter(([n, h], k) => JSON.stringify([n, h]) !== JSON.stringify(BATTERY_BEFORE[k])).map(([n]) => n);
    return { ok: off.length === 0, scenes: now.length, off };
}

/** C-determinism's comparison: two traces equal to the bit, every angular velocity and every orientation. */
export const sameTrace = (a, b) => a.length === b.length && JSON.stringify(a) === JSON.stringify(b);

/** One configuration's reading at one step: the fit, the reading, the invariants, and the body-frame angular velocity at the end. */
export async function readOne(config, { axis, dt, W = SPIN.W, eps = SPIN.eps, T = SPIN.T } = {}) {
    const r = await spin(config, { w0: startOf(axis, { W, eps }), dt, T }), { I } = fixtureBody(), fit = fitGrowth(r.trace, { dt, axis, W });
    return { backendId: r.backendId, gyroscopic: r.gyroscopic, inertia: r.inertia, fit, reading: readingOf(fit), invariants: invariants(r.trace, I, axis), end: r.trace[r.trace.length - 1].w, trace: r.trace };
}

/**
 * THE ROUND. C-key and C-rebuild first (the instrument can see the effect, and box3d is the artifact it was), then each
 * configuration: C-inertia, C-undamped, the reading at the pages' step, its determinism twin, the reading at the fine
 * step, and the two stable axes. `opts.axis` (the spin axis: the intermediate one, registered), `opts.T` and `opts.dt`
 * replace the registered ones for a gate's miniature, which spins about the STABLE largest axis so it sees nothing of
 * the registered answer.
 */
export async function run(opts = {}) {
    const { mid, I } = fixtureBody(), axis = opts.axis ?? mid, T = opts.T ?? SPIN.T, dt = opts.dt ?? SPIN.dt, fineDt = opts.fineDt ?? SPIN.fineDt;
    const result = { registration: REGISTRATION, fixture: { ...FIXTURE }, spin: { ...SPIN }, rule: { ...RULE }, substeps: { ...SUBSTEPS }, predicted: PREDICTED, at: new Date().toISOString(),
                     registered: axis === mid && T === SPIN.T && dt === SPIN.dt && fineDt === SPIN.fineDt, axis, T, dt, fineDt };
    result.key = keyControl();
    if (!result.key.ok) { result.stopped = "C-key failed: freeRotation's own fit does not measure the predicted rate, so no engine can be read"; return result; }
    result.rebuild = await rebuildControl();
    result.configs = [];
    for (const c of CONFIGS) {
        const one = { id: c.id, engine: c.engine, label: c.label };
        const main = await readOne(c, { axis, dt, T });
        one.backendId = main.backendId; one.gyroscopic = main.gyroscopic; one.inertia = inertiaControl(main.inertia);
        one.undamped = c.engine === "own" ? { ok: true, worst: 0, axis: I.indexOf(Math.max(...I)), note: "no damping in rigidBody6dof" } : await undampedControl(c, { dt, T });
        if (!one.inertia.ok) { one.reading = null; one.notMade = "C-inertia failed: the engine's body does not have the registered moments"; result.configs.push(one); continue; }
        const twin = await readOne(c, { axis, dt, T });
        one.determinism = { ok: sameTrace(twin.trace, main.trace), steps: main.trace.length - 1 };
        one.fit = main.fit; one.reading = main.reading; one.invariants = main.invariants; one.end = main.end;
        const fine = await readOne(c, { axis, dt: fineDt, T });
        one.fine = { fit: fine.fit, reading: fine.reading };
        one.stable = I.map((_, a) => a).filter((a) => a !== mid).map((a) => { return { axis: a }; });
        for (const s of one.stable) s.factor = (await readOne(c, { axis: s.axis, dt, T })).fit.factor;
        result.configs.push(one);
    }
    return result;
}

/** The results file's text: JSON with every array of numbers on one line (Round 4's serialize, by structure, not by a pattern). */
export function serialize(result) {
    const inline = [], text = JSON.stringify(result, (k, v) => (Array.isArray(v) && v.every((x) => typeof x === "number") ? `\u0000${inline.push(JSON.stringify(v)) - 1}\u0000` : v), 1);
    return text.replace(/"\\u0000(\d+)\\u0000"/g, (_, i) => inline[Number(i)]) + "\n";
}

/** The command's first act: refuse a results file that exists (a round's results are never overwritten). The reason, or null. */
export const refuseExisting = (file, exists = fs.existsSync) => (exists(file) ? `${file} exists -- a round's results are never overwritten` : null);
