// WebGLEngine/tools/roundhouse/joltGyroImplicit.mjs -- UNNUMBERED (the version is chosen at ship time)
// ---------------------------------------------------------------------------------------------------------------
// THE IMPLICIT GYROSCOPIC STEP IN JOLT'S WRAPPER, as physics/mechanics/SPINNING_BODY_WIP.md registers its third round
// (Keith's pick, 2026-11-03): physics/jolt/joltLoader.js now turns Jolt's own explicit force off by default and takes
// box3d's implicit step (physics/mechanics/implicitGyro.mjs) before every Jolt step. This measures what that does:
//   M1 THE DEFAULT BODY about the intermediate axis -- the spinning body's spin, read by that round's rule, with its
//      energy, its momentum's length and its flips;
//   M2 THE SHIP -- the second round's cube from addShip(), with the default (equal moments, so the step skips it), against
//      the same cube with the force passed off;
//   M3 THE STABLE SPINS -- about the largest and the smallest axes at 2, 5, 10 and 20 rad/s: Jolt with the new default,
//      Jolt's own force, the engine's own physics, and -- reported -- box3d's own implicit step and Jolt with neither.
// It reuses the second round's rule, bound and measures (tools/roundhouse/joltGyroDefault.mjs) and the spinning body's
// fixture, fit and format. The command is joltGyroImplicitRun.mjs (it prints no score); the gate is
// joltGyroImplicit-selfcheck.mjs.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as SB from "./spinningBody.mjs";
import * as GD from "./joltGyroDefault.mjs";
import * as IG from "../../physics/mechanics/implicitGyro.mjs";
import * as RB from "../../physics/mechanics/rigidBody6dof.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
export const REGISTRATION = "physics/mechanics/SPINNING_BODY_WIP.md (the implicit gyroscopic step in Jolt's wrapper)";
export const DEFAULT_RESULTS = path.join(ENG, "physics", "mechanics", "joltGyroImplicitResults.json");
/** The second round's spins, window, lines and cube, unchanged: the two rounds are read side by side. */
export const RATES = GD.RATES, AXES = GD.AXES, STABLE = GD.STABLE, CUBE = GD.CUBE;
/** M3's configurations, in order. `flag` "default" passes NO gyroscopic key: the loader's own default is what is measured. */
export const CONFIGS = Object.freeze([
    Object.freeze({ id: "JI", engine: "jolt", flag: "default", substeps: 1, label: "Jolt with the new default: the wrapper's implicit step, one substep" }),
    Object.freeze({ id: "JE", engine: "jolt", flag: true, substeps: 1, label: "Jolt's own explicit force (passed true), one substep: the second round's J" }),
    Object.freeze({ id: "OWN", engine: "own", flag: null, substeps: null, label: "the engine's own physics, rigidBody6dof.step()" }),
    Object.freeze({ id: "B3", engine: "box3d", flag: null, substeps: 4, label: "reported: box3d's own implicit step, at its four substeps" }),
    Object.freeze({ id: "J0", engine: "jolt", flag: false, substeps: 1, label: "reported: Jolt with neither" }),
]);
/** C-box3d's spin: a wobbling one, (1, 2, 3) rad/s, so a single substep moves it well past single precision. */
export const BOX3D_CHECK = Object.freeze({ w0: Object.freeze([1, 2, 3]), h: 1 / 240, tol: 1e-6 });

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
 * One Jolt body, zero gravity and damping, started at `w0`: the fixture, a box of `half`, or (ship: true) a cube from
 * addShip(). `flag` "default" passes NO gyroscopic key; "implicit", true and false pass it. It reports the setting the
 * world gives the body (gyroscopicOf) and the flag Jolt holds on it.
 */
export async function joltSpinner({ w0, dt = STABLE.dt, substeps = 1, flag = "default", half = null, density = SB.FIXTURE.density, ship = false, makeWorld = null } = {}) {
    const world = makeWorld ? makeWorld() : (await jolt()).createWorld({ gravity: [0, 0, 0] });
    let i;
    if (ship) i = world.addShip(flag === "default" ? { x: 0, z: 0, half: CUBE.half, density: CUBE.density } : { x: 0, z: 0, half: CUBE.half, density: CUBE.density, gyroscopic: flag });
    else {
        const opts = { type: "dynamic", pos: [0, 0, 0], half: half || [SB.FIXTURE.hx, SB.FIXTURE.hy, SB.FIXTURE.hz], density, damping: 0 };
        if (flag !== "default") opts.gyroscopic = flag;
        i = world.addBox(opts);
    }
    if (!world.setDamping(i, 0, 0)) throw new Error("jolt: the damping could not be set");
    if (!world.setAngularVelocity(i, w0)) throw new Error("jolt: the angular velocity could not be set");
    const setting = world.gyroscopicOf(i), joltFlag = world.raw().bodyOf(i).GetApplyGyroscopicForce();
    const read = () => {
        const v = world.readAngularVelocities(), wWorld = [v[i * 3], v[i * 3 + 1], v[i * 3 + 2]];   // copied out first (spinningBody's rule)
        const t = world.readTransforms(), q = [t[i * 7 + 6], t[i * 7 + 3], t[i * 7 + 4], t[i * 7 + 5]];
        return { w: RB.worldToBody(q, wWorld), q, wWorld };
    };
    return { backendId: world.backendId(), setting, joltFlag, inertia: world.inertia(i), step() { world.step(dt, substeps); }, read, destroy() { world.destroy(); } };
}
/** box3d, as the spinning body's C1 flies it (its own loader, its four substeps, undamped). */
export async function box3dSpinner({ w0, dt = STABLE.dt } = {}) {
    const sp = await SB.spinner(SB.CONFIGS[0], { w0, dt });
    return { backendId: sp.backendId, setting: null, joltFlag: null, inertia: sp.inertia, step: sp.step, read() { const r = sp.read(), raw = sp.raw(); return { w: r.w, q: r.q, wWorld: raw.wWorld }; }, destroy: sp.destroy };
}
/** Spin one configuration from `w0` for T seconds: body- and world-frame angular velocity and orientation after every step. */
export async function spinOf(config, { w0, T = STABLE.T, dt = STABLE.dt, ...more } = {}) {
    const sp = config.engine === "own" ? await GD.ownSpinner({ w0, dt }) : config.engine === "box3d" ? await box3dSpinner({ w0, dt })
             : await joltSpinner({ w0, dt, substeps: config.substeps ?? 1, flag: config.flag ?? "default", ...more });
    const steps = Math.round(T / dt), trace = [sp.read()];
    for (let n = 1; n <= steps; n++) { sp.step(); trace.push(sp.read()); }
    sp.destroy();
    return { backendId: sp.backendId, setting: sp.setting ?? null, joltFlag: sp.joltFlag ?? null, inertia: sp.inertia, trace };
}
/** The wobble at the end of the window over its start: what the step did to a stable wobble that real physics keeps. */
export const endOf = (trace, axis) => SB.wobbleOf(trace[trace.length - 1].w, axis) / SB.wobbleOf(trace[0].w, axis);

// ---- the controls --------------------------------------------------------------------------------------------------
/** C-FLAG: the setting a world gives, and the flag Jolt holds, on a body made with no flag, with true, with false, and on a static body. */
export async function flagControl({ makeWorld = null } = {}) {
    const world = makeWorld ? makeWorld() : (await jolt()).createWorld({ gravity: [0, 0, 0] });
    const box = { type: "dynamic", pos: [0, 0, 0], half: [SB.FIXTURE.hx, SB.FIXTURE.hy, SB.FIXTURE.hz], density: 1 };
    const of = (i) => [world.gyroscopicOf(i), world.raw().bodyOf(i).GetApplyGyroscopicForce()];
    const got = { default: of(world.addBox(box)), true: of(world.addBox({ ...box, gyroscopic: true })), false: of(world.addBox({ ...box, gyroscopic: false })),
                  static: of(world.addBox({ ...box, type: "static", pos: [0, -10, 0] })) };
    world.destroy();
    return { ok: JSON.stringify(got) === JSON.stringify({ default: ["implicit", false], true: ["jolt", true], false: [false, false], static: [false, false] }), got };
}
/**
 * C-BOX3D: one box3d substep (h = 1/240) of the fixture from a wobbling spin, against the module's step from the same
 * (single-precision) angular velocity and box3d's own inertia. `step` lets a gate hand in another step to see it refused.
 */
export async function box3dControl({ step = IG.implicitGyroStep } = {}) {
    const E = await SB.engines(), world = E.box3d.createWorld({ gravity: [0, 0, 0] });
    const i = world.addBox({ type: "dynamic", pos: [0, 0, 0], half: [SB.FIXTURE.hx, SB.FIXTURE.hy, SB.FIXTURE.hz], density: SB.FIXTURE.density });
    world.setDamping(i, 0, 0); world.setAngularVelocity(i, [...BOX3D_CHECK.w0]);
    const v0 = world.readAngularVelocities(), w0 = [v0[i * 3], v0[i * 3 + 1], v0[i * 3 + 2]], inr = world.inertia(i);
    world.step(BOX3D_CHECK.h, 1);
    const v1 = world.readAngularVelocities(), got = [v1[i * 3], v1[i * 3 + 1], v1[i * 3 + 2]]; world.destroy();
    const d = inr.diag, o = inr.off, I = [d[0], o[0], o[1], o[0], d[1], o[2], o[1], o[2], d[2]];   // off: [Ixy, Ixz, Iyz]
    const want = step(I, [1, 0, 0, 0], w0, BOX3D_CHECK.h), explicit = w0.map((v, k) => v - BOX3D_CHECK.h * (k === 0 ? (w0[1] * I[8] * w0[2] - w0[2] * I[4] * w0[1]) / I[0] : k === 1 ? (w0[2] * I[0] * w0[0] - w0[0] * I[8] * w0[2]) / I[4] : (w0[0] * I[4] * w0[1] - w0[1] * I[0] * w0[0]) / I[8]));
    const off = Math.hypot(...got.map((v, k) => v - want[k])) / Math.hypot(...w0), offExplicit = Math.hypot(...got.map((v, k) => v - explicit[k])) / Math.hypot(...w0);
    return { ok: off <= BOX3D_CHECK.tol, off, offExplicit, moved: Math.hypot(...got.map((v, k) => v - w0[k])) / Math.hypot(...w0) };
}
/** C-UNDAMPED: a configuration's body spun EXACTLY about its largest axis (x) keeps its rate to 1e-4 over the window. */
export async function undampedControl(config) {
    const r = await spinOf(config, { w0: [2, 0, 0] }), worst = Math.max(...r.trace.map((s) => Math.abs(Math.hypot(...s.w) / 2 - 1)));
    return { ok: worst <= 1e-4, worst };
}
/** C-REPEAT: JE's spins against the second round's committed J, number for number (`committed` lets a gate hand in another). */
export function repeatControl(je, committed = JSON.parse(fs.readFileSync(GD.DEFAULT_RESULTS, "utf8")).m3.filter((e) => e.config === "J")) {
    const pick = (e) => [e.W, e.axis, e.factor, e.lostAt, e.reading];
    const off = je.filter((e, k) => !committed[k] || JSON.stringify(pick(e)) !== JSON.stringify(pick(committed[k])));
    return { ok: je.length === committed.length && je.length === 8 && off.length === 0, spins: je.length, off: off.map((e) => `${e.W}/${e.axis}`) };
}

// ---- the measurements ----------------------------------------------------------------------------------------------
/** M1: the fixture made with no flag, spun about `axis` (the intermediate one, registered): its setting, its fit and reading by the spinning body's rule, its invariants, and its twin. */
export async function defaultBody({ axis = 1, T = SB.SPIN.T, dt = SB.SPIN.dt } = {}) {
    const w0 = SB.startOf(axis), a = await spinOf(CONFIGS[0], { w0, T, dt }), b = await spinOf(CONFIGS[0], { w0, T, dt });
    const fit = SB.fitGrowth(a.trace, { dt, axis }), { I } = SB.fixtureBody();
    return { axis, setting: a.setting, joltFlag: a.joltFlag, fit, reading: SB.readingOf(fit), invariants: SB.invariants(a.trace, I, axis), twin: SB.sameTrace(a.trace, b.trace) };
}
/** M2: the second round's cube from addShip() with the default, against the same cube made with the force passed off. */
export async function ship({ T = STABLE.T, dt = STABLE.dt } = {}) {
    const n = Math.hypot(...CUBE.axis), w0 = CUBE.axis.map((v) => (v / n) * CUBE.W), h = [CUBE.half, CUBE.half, CUBE.half];
    const on = await spinOf({ engine: "jolt", flag: "default", substeps: 1 }, { w0, T, dt, ship: true }), off = await spinOf({ engine: "jolt", flag: false, substeps: 1 }, { w0, T, dt, half: h, density: CUBE.density });
    return { setting: on.setting, settingOff: off.setting, change: GD.changeOf(on.trace, CUBE.W), changeOff: GD.changeOf(off.trace, CUBE.W), apart: GD.apartOf(on.trace, off.trace, CUBE.W), same: SB.sameTrace(on.trace, off.trace), steps: on.trace.length - 1 };
}
/** M3: every configuration at every rate about both stable axes: growth, when it passed 10%, the end over the start, Euler's bound, the reading, and the spin flown twice. */
export async function stableSpins({ rates = RATES, T = STABLE.T, dt = STABLE.dt, configs = CONFIGS } = {}) {
    const { I } = SB.fixtureBody(), out = [];
    for (const c of configs) for (const W of rates) for (const axis of AXES) {
        const w0 = SB.startOf(axis, { W }), a = await spinOf(c, { w0, T, dt }), b = await spinOf(c, { w0, T, dt });
        const g = GD.growthOf(a.trace, { axis, W, dt }), bound = GD.eulerBound(I, axis);
        out.push({ config: c.id, W, axis, bound, factor: g.factor, lostAt: g.lostAt, end: endOf(a.trace, axis), reading: GD.stableReading(g, bound), twin: SB.sameTrace(a.trace, b.trace) });
    }
    return out;
}

/**
 * THE ROUND. C-flag, C-box3d and C-key first (the default is what the wrapper says, the step is box3d's, and the
 * instrument reads Euler's bound), then C-inertia and C-undamped on every Jolt configuration, then M1, M2 and M3, then
 * C-repeat on JE. `opts.rates`, `opts.T` and `opts.m1Axis` replace the registered ones for a gate's miniature.
 */
export async function run(opts = {}) {
    const rates = opts.rates ?? RATES, T = opts.T ?? STABLE.T, dt = STABLE.dt, m1Axis = opts.m1Axis ?? 1;
    const result = { registration: REGISTRATION, rates: [...rates], axes: [...AXES], stable: { ...STABLE }, cube: { ...CUBE, axis: [...CUBE.axis] }, configs: CONFIGS.map((c) => ({ ...c })),
                     at: new Date().toISOString(), registered: JSON.stringify(rates) === JSON.stringify(RATES) && T === STABLE.T && m1Axis === 1, T, dt, m1Axis };
    result.flag = await flagControl(opts.flagWorld ? { makeWorld: opts.flagWorld } : {});
    if (!result.flag.ok) { result.stopped = "C-flag failed: a Jolt body made with no flag does not have the wrapper's implicit step, so nothing can be read"; return result; }
    result.box3d = await box3dControl();
    if (!result.box3d.ok) { result.stopped = "C-box3d failed: the wrapper's step is not box3d's"; return result; }
    result.key = await GD.keyControl();
    if (!result.key.ok) { result.stopped = "C-key failed: the engine's own physics does not read Euler's bound"; return result; }
    result.joltControls = [];
    for (const c of CONFIGS.filter((x) => x.engine === "jolt")) {
        const sp = await joltSpinner({ w0: [0, 0, 0], flag: c.flag, substeps: c.substeps }), inertia = SB.inertiaControl(sp.inertia); sp.destroy();
        result.joltControls.push({ config: c.id, inertia, undamped: await undampedControl(c) });
    }
    if (!result.joltControls.every((x) => x.inertia.ok && x.undamped.ok)) { result.stopped = "C-inertia or C-undamped failed on a Jolt configuration"; return result; }
    result.m1 = await defaultBody({ axis: m1Axis, T });
    result.m2 = await ship({ T });
    result.m3 = await stableSpins({ rates, T });
    result.repeat = result.registered ? repeatControl(result.m3.filter((e) => e.config === "JE")) : { ok: null, note: "not the registered spins: nothing to repeat" };
    return result;
}

/** The results file's text: the spinning body's format. */
export const serialize = SB.serialize;
/** The command's first act: refuse a results file that exists. */
export const refuseExisting = SB.refuseExisting;
