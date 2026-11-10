// WebGLEngine/tools/roundhouse/joltGyroDefault.mjs -- UNNUMBERED (the version is chosen at ship time)
// ---------------------------------------------------------------------------------------------------------------
// JOLT'S GYROSCOPIC FORCE ON BY DEFAULT, as physics/mechanics/SPINNING_BODY_WIP.md registers its second round (Keith's
// decision, 2026-11-03): physics/jolt/joltLoader.js's addBox() now gives every dynamic body Jolt's mApplyGyroscopicForce
// unless its caller passes `gyroscopic: false`. This measures what that changes and what it costs:
//   M1 THE DEFAULT BODY: the flag Jolt reports on the fixture made with no flag, and the spinning body's spin on it
//      (2 rad/s about the intermediate axis, wobble 1e-5, 30 s), read by the spinning body's rule, against C3's trace;
//   M2 THE SHIP: a cube from addShip() -- equal moments, so its gyroscopic torque is exactly zero -- spun at 2 rad/s about
//      (1, 2, 3) for 30 s, beside the same cube with the flag passed off;
//   M3 THE COST: stable spins about the largest and the smallest axes at 2, 5, 10 and 20 rad/s, on Jolt with the force on
//      (one substep), on the engine's own physics, and -- reported -- on Jolt at four substeps and with the force off.
// It builds on tools/roundhouse/spinningBody.mjs (the fixture, the wobble, the fit and its rule, the results format) and
// adds only what the second round needs. The command is joltGyroDefaultRun.mjs (it prints no score); the gate is
// joltGyroDefault-selfcheck.mjs.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as SB from "./spinningBody.mjs";
import * as RB from "../../physics/mechanics/rigidBody6dof.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
export const REGISTRATION = "physics/mechanics/SPINNING_BODY_WIP.md (Jolt's gyroscopic force on by default)";
export const DEFAULT_RESULTS = path.join(ENG, "physics", "mechanics", "joltGyroDefaultResults.json");
/** M3's spins: four rates, the two stable axes (x carries the largest moment, 6.5; z the smallest, 2.5). */
export const RATES = Object.freeze([2, 5, 10, 20]);
export const AXES = Object.freeze([0, 2]);
/** The window and the reading's two lines: "lost" past 10% of the spin, "kept" within twice Euler's bound. */
export const STABLE = Object.freeze({ T: 30, dt: 1 / 60, eps: SB.SPIN.eps, lost: 0.10, kept: 2 });
/** M2's ship: addShip()'s cube, half-size 0.5 and density 1, spun at 2 rad/s about (1, 2, 3). */
export const CUBE = Object.freeze({ half: 0.5, density: 1, W: 2, axis: Object.freeze([1, 2, 3]) });
/** M3's configurations, in order. `flag` "default" passes no key at all -- the wrapper's default is what is measured. */
// 2026-11-03 (unnumbered) -- THE DEFAULT THIS ROUND MEASURED, NOW PASSED. This round registered "the loader's default" when that
// default was Jolt's own explicit force (`gyroscopic: true`). The same day the note's third round made the loader's default its
// implicit step, so the three places this library leaned on the default -- the "default" spinner, the ship and C-flag's default
// body -- now pass REGISTERED_DEFAULT, and the committed results fly again unchanged. "default" here means the default as it was.
export const REGISTERED_DEFAULT = true;
export const CONFIGS = Object.freeze([
    Object.freeze({ id: "J", engine: "jolt", flag: "default", substeps: 1, label: "Jolt with the force on (the new default), one substep" }),
    Object.freeze({ id: "OWN", engine: "own", flag: null, substeps: null, label: "the engine's own physics, rigidBody6dof.step()" }),
    Object.freeze({ id: "J4", engine: "jolt", flag: "default", substeps: 4, label: "reported: Jolt with the force on, four substeps" }),
    Object.freeze({ id: "J0", engine: "jolt", flag: false, substeps: 1, label: "reported: Jolt with the force passed off, one substep" }),
]);

/**
 * EULER'S BOUND FOR THIS WOBBLE: spun at W about `axis` with a small wobble started on the next axis, the linearised
 * torque-free motion carries the wobble round an ellipse, and this is the ellipse's largest radius over its start.
 * w_b' = p W w_c and w_c' = q W w_b, with p = (I_c - I_a) / I_b and q = (I_a - I_b) / I_c; stable when p q < 0, and then
 * w_c's amplitude is sqrt(|q / p|) of w_b's. About the intermediate axis there is no bound (Infinity).
 */
export function eulerBound(I, axis) {
    const a = axis, b = (axis + 1) % 3, c = (axis + 2) % 3, p = (I[c] - I[a]) / I[b], q = (I[a] - I[b]) / I[c];
    if (!(p * q < 0)) return Infinity;
    return Math.max(1, Math.sqrt(Math.abs(q / p)));
}

/** The wobble's largest growth over its start, and when it first passed `lost` of the spin (s, or null). */
export function growthOf(trace, { axis, W, dt, rule = STABLE } = {}) {
    const p0 = SB.wobbleOf(trace[0].w, axis);
    let peak = p0, lostAt = null;
    for (let n = 0; n < trace.length; n++) {
        const p = SB.wobbleOf(trace[n].w, axis);
        if (p > peak) peak = p;
        if (lostAt === null && p > rule.lost * W) lostAt = n * dt;
    }
    return { p0, factor: peak / p0, lostAt };
}
/** The registered reading of one stable spin: "lost", else "kept" within `kept` times Euler's bound, else "drifting". */
export function stableReading({ factor, lostAt }, bound, rule = STABLE) {
    if (lostAt !== null) return "lost";
    if (factor <= rule.kept * bound) return "kept";
    return "drifting";
}

// ---- the spinners ------------------------------------------------------------------------------------------------
let _jolt = null;
/** Jolt through ITS OWN loader -- never physics/backend.js's selectBackend(), which falls back without a word. */
export async function jolt() {
    if (_jolt) return _jolt;
    const { createJoltBackend } = await import("../../physics/jolt/joltLoader.js");
    _jolt = await createJoltBackend();
    return _jolt;
}
/**
 * One Jolt body, zero gravity and damping, started at `w0` (world frame = body frame at t = 0): the fixture, a box of
 * `half`, or (ship: true) a cube from addShip(). `flag` "default" passes NO gyroscopic key -- the wrapper's default is the
 * thing measured -- and true or false passes it. `makeWorld` lets a gate hand in a world of its own.
 */
export async function joltSpinner({ w0, dt = STABLE.dt, substeps = 1, flag = "default", half = null, density = SB.FIXTURE.density, ship = false, makeWorld = null } = {}) {
    const world = makeWorld ? makeWorld() : (await jolt()).createWorld({ gravity: [0, 0, 0] });
    let i;
    if (ship) i = world.addShip({ x: 0, z: 0, half: CUBE.half, density: CUBE.density, gyroscopic: REGISTERED_DEFAULT });
    else {
        const opts = { type: "dynamic", pos: [0, 0, 0], half: half || [SB.FIXTURE.hx, SB.FIXTURE.hy, SB.FIXTURE.hz], density, damping: 0 };
        opts.gyroscopic = flag === "default" ? REGISTERED_DEFAULT : flag;
        i = world.addBox(opts);
    }
    if (!world.setDamping(i, 0, 0)) throw new Error("jolt: the damping could not be set");
    if (!world.setAngularVelocity(i, w0)) throw new Error("jolt: the angular velocity could not be set");
    const reported = world.raw().bodyOf(i).GetApplyGyroscopicForce();
    const read = () => {
        const v = world.readAngularVelocities(), wWorld = [v[i * 3], v[i * 3 + 1], v[i * 3 + 2]];   // copied out first (spinningBody's rule)
        const t = world.readTransforms(), q = [t[i * 7 + 6], t[i * 7 + 3], t[i * 7 + 4], t[i * 7 + 5]];
        return { w: RB.worldToBody(q, wWorld), q, wWorld };
    };
    return { backendId: world.backendId(), flag: reported, inertia: world.inertia(i), step() { world.step(dt, substeps); }, read, destroy() { world.destroy(); } };
}
/** The engine's own physics, as the spinning body's C4 flies it. */
export async function ownSpinner({ w0, dt = STABLE.dt } = {}) {
    const sp = await SB.spinner(SB.CONFIGS[3], { w0, dt });
    return { backendId: sp.backendId, flag: null, inertia: sp.inertia, step: sp.step, read() { const r = sp.read(), raw = sp.raw(); return { w: r.w, q: r.q, wWorld: raw.wWorld }; }, destroy: sp.destroy };
}
/** Spin one configuration from `w0` for T seconds: the angular velocity (body and world frame) and orientation after every step. */
export async function spinOf(config, { w0, T = STABLE.T, dt = STABLE.dt, ...more } = {}) {
    const sp = config.engine === "own" ? await ownSpinner({ w0, dt }) : await joltSpinner({ w0, dt, substeps: config.substeps ?? 1, flag: config.flag ?? "default", ...more });
    const steps = Math.round(T / dt), trace = [sp.read()];
    for (let n = 1; n <= steps; n++) { sp.step(); trace.push(sp.read()); }
    sp.destroy();
    return { backendId: sp.backendId, flag: sp.flag, inertia: sp.inertia, trace };
}

// ---- the controls --------------------------------------------------------------------------------------------------
/** C-FLAG: the flag Jolt reports on a body made with no flag, with false, with true, and on a static body. */
export async function flagControl({ makeWorld = null } = {}) {
    const world = makeWorld ? makeWorld() : (await jolt()).createWorld({ gravity: [0, 0, 0] });
    const box = { type: "dynamic", pos: [0, 0, 0], half: [SB.FIXTURE.hx, SB.FIXTURE.hy, SB.FIXTURE.hz], density: 1 };
    const of = (i) => world.raw().bodyOf(i).GetApplyGyroscopicForce();
    const got = { default: of(world.addBox({ ...box, gyroscopic: REGISTERED_DEFAULT })), false: of(world.addBox({ ...box, gyroscopic: false })), true: of(world.addBox({ ...box, gyroscopic: true })),
                  static: of(world.addBox({ ...box, type: "static", pos: [0, -10, 0] })) };
    world.destroy();
    return { ok: got.default === true && got.false === false && got.true === true && got.static === false, got };
}
/**
 * C-KEY: the engine's own physics at 2 rad/s, over the WHOLE window, holds each stable wobble at Euler's bound, to 1e-3.
 * `bounds` lets a gate hand in wrong ones. The window is checked, not assumed: about the smallest axis the wobble reaches
 * its bound a quarter-turn in (1.42 s), so any window past that reads the same -- the gate's G20 flew it for 2 s and
 * nothing noticed -- and "holds over the window" means the 1,800 steps were flown.
 */
export async function keyControl({ bounds = null } = {}) {
    const { I } = SB.fixtureBody(), own = CONFIGS[1], window = Math.round(STABLE.T / STABLE.dt);
    const got = [];
    for (const axis of AXES) {
        const r = await spinOf(own, { w0: SB.startOf(axis, { W: 2 }) }), g = growthOf(r.trace, { axis, W: 2, dt: STABLE.dt }), want = bounds ? bounds[axis] : eulerBound(I, axis);
        got.push({ axis, factor: g.factor, bound: want, steps: r.trace.length - 1, ok: Math.abs(g.factor / want - 1) <= 1e-3 && r.trace.length - 1 === window });
    }
    return { ok: got.every((x) => x.ok), got };
}
/** C-UNDAMPED: a Jolt configuration's body spun EXACTLY about its largest axis keeps its rate to 1e-4 over the window. */
export async function undampedControl(config) {
    const { I } = SB.fixtureBody(), big = I.indexOf(Math.max(...I)), w0 = [0, 0, 0]; w0[big] = 2;
    const r = await spinOf(config, { w0 }), worst = Math.max(...r.trace.map((s) => Math.abs(Math.hypot(...s.w) / 2 - 1)));
    return { ok: worst <= 1e-4, worst };
}

// ---- the measurements ----------------------------------------------------------------------------------------------
/** M1: the fixture made with no flag -- its flag, the spinning body's spin on it (about `axis`; the intermediate one, registered) read by that round's rule, and its trace against C3's. */
export async function defaultBody({ axis = 1, T = SB.SPIN.T, dt = SB.SPIN.dt } = {}) {
    const w0 = SB.startOf(axis), mine = await spinOf(CONFIGS[0], { w0, T, dt }), c3 = await spinOf({ engine: "jolt", flag: true, substeps: 1 }, { w0, T, dt });
    const fit = SB.fitGrowth(mine.trace, { dt, axis });
    return { axis, flag: mine.flag, fit, reading: SB.readingOf(fit), sameAsC3: SB.sameTrace(mine.trace, c3.trace), c3Flag: c3.flag };
}
/** M2's first measure: the largest change of a trace's world-frame angular velocity from ITS OWN FIRST READING (the engine's float32 start, not the double handed in), over W. */
export const changeOf = (trace, W) => Math.max(...trace.map((s) => Math.hypot(s.wWorld[0] - trace[0].wWorld[0], s.wWorld[1] - trace[0].wWorld[1], s.wWorld[2] - trace[0].wWorld[2]) / W));
/** M2's second: the largest gap between two traces' world-frame angular velocities, step by step, over W. */
export const apartOf = (a, b, W) => Math.max(...a.map((s, k) => Math.hypot(s.wWorld[0] - b[k].wWorld[0], s.wWorld[1] - b[k].wWorld[1], s.wWorld[2] - b[k].wWorld[2]) / W));
/** M2: addShip()'s cube spun about (1, 2, 3), with the force on (no flag: addShip passes none) and passed off; each one's changeOf, and the apartOf between them. */
export async function cube({ T = STABLE.T, dt = STABLE.dt } = {}) {
    const n = Math.hypot(...CUBE.axis), w0 = CUBE.axis.map((v) => (v / n) * CUBE.W), h = [CUBE.half, CUBE.half, CUBE.half];
    const on = await spinOf({ engine: "jolt", substeps: 1 }, { w0, T, dt, ship: true }), off = await spinOf({ engine: "jolt", flag: false, substeps: 1 }, { w0, T, dt, half: h, density: CUBE.density });
    return { flagOn: on.flag, flagOff: off.flag, moments: on.inertia ? on.inertia.diag : null, changeOn: changeOf(on.trace, CUBE.W), changeOff: changeOf(off.trace, CUBE.W), apart: apartOf(on.trace, off.trace, CUBE.W), steps: on.trace.length - 1 };
}
/** M3: every configuration at every rate about both stable axes -- the wobble's largest growth, when it passed 10%, Euler's bound, the reading, and the spin flown twice. */
export async function stableSpins({ rates = RATES, T = STABLE.T, dt = STABLE.dt, configs = CONFIGS } = {}) {
    const { I } = SB.fixtureBody(), out = [];
    for (const c of configs) for (const W of rates) for (const axis of AXES) {
        const w0 = SB.startOf(axis, { W }), a = await spinOf(c, { w0, T, dt }), b = await spinOf(c, { w0, T, dt });
        const g = growthOf(a.trace, { axis, W, dt }), bound = eulerBound(I, axis);
        out.push({ config: c.id, W, axis, bound, factor: g.factor, lostAt: g.lostAt, reading: stableReading(g, bound), twin: SB.sameTrace(a.trace, b.trace) });
    }
    return out;
}

/**
 * THE ROUND. C-flag and C-key first (the default is what it says, and the instrument reads Euler's bound), then C-inertia
 * and C-undamped on every Jolt configuration, then M1, M2 and M3. `opts.rates`, `opts.T` and `opts.m1Axis` replace the
 * registered ones for a gate's miniature, which spins briefly at a rate nobody registered and M1 about a STABLE axis.
 */
export async function run(opts = {}) {
    const rates = opts.rates ?? RATES, T = opts.T ?? STABLE.T, dt = STABLE.dt, m1Axis = opts.m1Axis ?? 1;
    const result = { registration: REGISTRATION, rates: [...rates], axes: [...AXES], stable: { ...STABLE }, cube: { ...CUBE, axis: [...CUBE.axis] }, configs: CONFIGS.map((c) => ({ ...c })),
                     at: new Date().toISOString(), registered: JSON.stringify(rates) === JSON.stringify(RATES) && T === STABLE.T && m1Axis === 1, T, dt, m1Axis };
    result.flag = await flagControl(opts.flagWorld ? { makeWorld: opts.flagWorld } : {});
    if (!result.flag.ok) { result.stopped = "C-flag failed: the default Jolt body is not what the wrapper says, so nothing can be read"; return result; }
    result.key = await keyControl();
    if (!result.key.ok) { result.stopped = "C-key failed: the engine's own physics does not read Euler's bound, so no spin can be read"; return result; }
    result.joltControls = [];
    for (const c of CONFIGS.filter((x) => x.engine === "jolt")) {
        const sp = await joltSpinner({ w0: [0, 0, 0], flag: c.flag, substeps: c.substeps }), inertia = SB.inertiaControl(sp.inertia); sp.destroy();
        result.joltControls.push({ config: c.id, inertia, undamped: await undampedControl(c) });
    }
    if (!result.joltControls.every((x) => x.inertia.ok && x.undamped.ok)) { result.stopped = "C-inertia or C-undamped failed on a Jolt configuration"; return result; }
    result.m1 = await defaultBody({ axis: m1Axis, T });
    result.m2 = await cube({ T });
    result.m3 = await stableSpins({ rates, T });
    return result;
}

/** The results file's text: the spinning body's format (JSON, every array of numbers on one line). */
export const serialize = SB.serialize;
/** The command's first act: refuse a results file that exists. */
export const refuseExisting = SB.refuseExisting;
