// WebGLEngine/tools/roundhouse/sixdofBox3d.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE 6-DOF SHIPS ON box3d, as physics/mechanics/SIXDOF_BOX3D_WIP.md registers the round: ship A flown by box3d (B3, physics/mechanics/
// rigidBody6dofBox3d.mjs's stepper) against the engine's own physics (E, rigidBody6dof.step() with its default, RK4). The library: the
// registration as data, M1 and M2, the controls and the readings. The pilots, the angle, the outcome, the sign test and the reading are the
// orientation-step round's own (tools/roundhouse/orientationStep.mjs), so the two rounds read a fight the same way. The command is
// sixdofBox3dRun.mjs and prints no score; the gate is sixdofBox3d-selfcheck.mjs.
//
// NODE ONLY. box3d is adopted from the vendored wasm through physics/backendNode.mjs and used through its own loader -- never through
// physics/backend.js's selectBackend(), which hands back Jolt without a word when box3d is not ready.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as RB from "../../physics/mechanics/rigidBody6dof.mjs";
import * as P6 from "../../brain/pilot6dofPolicy.mjs";
import { box3dStepper, shipWorld, SUBSTEPS } from "../../physics/mechanics/rigidBody6dofBox3d.mjs";
import { adoptBox3dInNode } from "../../physics/backendNode.mjs";
import { box3d as BOX3D } from "../../physics/box3d/box3dLoader.js";
import * as OS from "./orientationStep.mjs";
import * as SB from "./spinningBody.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
const range = (a, n) => Object.freeze(Array.from({ length: n }, (_, i) => a + i));
export const REGISTRATION = "physics/mechanics/SIXDOF_BOX3D_WIP.md";
export const DEFAULT_RESULTS = path.join(ENG, "physics", "mechanics", "sixdofBox3dResults.json");
export const SCENARIOS = OS.SCENARIOS, PILOTS = OS.PILOTS, PILOT_IDS = OS.PILOT_IDS, DUEL_DT = OS.DUEL_DT;
/** The ship: the duel's hull and mass (held to brain/pilot6dofPolicy.mjs's HALF and SHIP_MASS by the gate). */
export const SHIP = Object.freeze({ half: Object.freeze([...P6.HALF]), mass: P6.SHIP_MASS });
/** M1: A's inputs from seeds 93001-93010 of each scenario, the PD autopilot against itself under E; the reference E at a 64th of the tick. */
export const TURN = Object.freeze({ seeds: range(93001, 10), refSub: 64 });
/** M2: 40 fresh seeds of each scenario, each duel flown with A on E, on B3, and on E with its start moved 1e-9 m in y. */
export const FIGHT = Object.freeze({ seeds: range(93001, 40), nudge: 1e-9 });
export const ALPHA = 0.01;
/** C-unchanged's anchors, taken at 42845879 before any of the round's code (the registration lists them). */
export const ANCHOR = Object.freeze({
    seed: 93100, at: "42845879", stepDigest: "5ba918e7cde707f7",
    fingerprints: Object.freeze({
        standoff: Object.freeze({ scripted: "4cb171ec", shipped: "5419443e", league: "45b81ea9", close: "fe6ba4e8", gpu: "ead22878" }),
        joust: Object.freeze({ scripted: "d52064d9", shipped: "a411ddf3", league: "9527e83b", close: "126221b7", gpu: "764e4d2c" }),
    }),
});
/** The controls' numbers, as the registration fixes them. */
export const KEY = Object.freeze({ inertiaTol: 1e-5, impulseTol: 1e-4, freeTol: 1e-4, freeT: 30, freeSpin: 2, freeSpeed: 1, awakeT: 10, awakeSpeed: 0.01,
    torque: Object.freeze([0.3, -0.2, 0.5]), force: Object.freeze([16, 0, 0]) });

// ---- box3d and the stepper -------------------------------------------------------------------------------------------------------
let _b3 = null;
/** box3d's loader, adopted from the vendored wasm; refuses rather than hands back anything else. */
export async function box3dReady() {
    if (_b3) return _b3;
    const st = await adoptBox3dInNode();
    if (!st || !st.ready) throw new Error("box3d did not load: " + ((st && (st.reason || st.via)) || "no status"));
    return (_b3 = BOX3D);
}
export const stepperOf = (b3, opts = {}) => box3dStepper(b3, { half: [...SHIP.half], mass: SHIP.mass, ...opts });
/** The ship's body in a world of its own, for the controls that read box3d directly: `fn({ world, idx, density })`, the world destroyed after. */
export function withShipWorld(b3, fn) { const sw = shipWorld(b3, { half: [...SHIP.half], mass: SHIP.mass }); try { return fn(sw); } finally { sw.world.destroy(); } }
export const shipI = () => RB.boxInertia({ m: SHIP.mass, hx: SHIP.half[0], hy: SHIP.half[1], hz: SHIP.half[2] });
const engineStep = (orientation) => (b, a, h) => (orientation ? RB.step(b, a, h, { orientation }) : RB.step(b, a, h));
/** Run `fn(stepper)` on a fresh stepper, and destroy whatever world it keeps, whatever happens (box3d keeps one world at a time). */
export function withStepper(b3, fn, opts = {}) { const st = stepperOf(b3, opts); try { return fn(st); } finally { st.destroy(); } }

// ---- M1, a ship's turn ------------------------------------------------------------------------------------------------------------
/** A's start and inputs from a duel of the PD autopilot against itself under the engine's own physics, through the duel's `record`. */
export function recordOf(seed, scenario) { const record = {}; const r = P6.duel("autopilot", "autopilot", { seed, scenario, record }); return { ...record, ticks: r.ticks }; }
/** The record replayed open loop by `stepFn`, each input held for its tick, `sub` steps a tick: the orientation and angular velocity at each tick's end. */
export function replay(rec, stepFn, sub = 1) {
    const h = DUEL_DT / sub; let b = rec.start; const qs = [], ws = [];
    for (const u of rec.inputs) { const acc = { force: u.force, torque: u.torque }; for (let k = 0; k < sub; k++) b = stepFn(b, acc, h); qs.push(b.q); ws.push(b.w); }
    return { qs, ws, end: b };
}
export function m1(b3, { seeds = TURN.seeds, refSub = TURN.refSub } = {}) {
    const duels = [];
    for (const scenario of SCENARIOS) for (const seed of seeds) {
        const rec = recordOf(seed, scenario), E = replay(rec, engineStep(null)), Q0 = replay(rec, engineStep("euler")), ref = replay(rec, engineStep(null), refSub);
        const B = withStepper(b3, (st) => replay(rec, st.step));
        const peak = Math.max(...ref.ws.map((w) => Math.hypot(w[0], w[1], w[2])));
        const angle = (x) => x.qs.reduce((m, q, i) => Math.max(m, OS.angleBetween(q, ref.qs[i])), 0);
        const spinOff = (x) => x.ws.reduce((m, w, i) => Math.max(m, Math.hypot(w[0] - ref.ws[i][0], w[1] - ref.ws[i][1], w[2] - ref.ws[i][2])), 0) / peak;
        duels.push({ scenario, seed, ticks: rec.inputs.length, peakSpin: peak, angle: { E: angle(E), Q0: angle(Q0), B3: angle(B) }, spinOff: { E: spinOff(E), Q0: spinOff(Q0), B3: spinOff(B) },
            replayIsDuel: JSON.stringify(E.end) === JSON.stringify(rec.end) });
    }
    return { duels };
}

// ---- M2, the fights ---------------------------------------------------------------------------------------------------------------
/** One duel of `pilot` as A against the PD autopilot, A on the engine's own ("E"), nudged or not, or on box3d ("B3"): its outcome and fingerprint. */
export function fight(b3, pilot, seed, scenario, { on = "E", nudge = 0 } = {}) {
    const read = (r) => ({ outcome: OS.outcomeOf(r), fingerprint: r.fingerprint, ticks: r.ticks });
    if (on === "E") return read(P6.duel(pilot, "autopilot", { seed, scenario, ...(nudge ? { nudge } : {}) }));
    if (on !== "B3") throw new Error(`no such A: ${on}`);
    return withStepper(b3, (st) => read(P6.duel(pilot, "autopilot", { seed, scenario, stepA: st.step })));
}
const tallyOf = (rs) => ({ win: rs.filter((r) => r.outcome === "win").length, loss: rs.filter((r) => r.outcome === "loss").length, draw: rs.filter((r) => r.outcome === "draw").length });
export function m2(b3, pilots, seeds = FIGHT.seeds, { nudge = FIGHT.nudge } = {}) {
    const cells = [];
    for (const p of pilots) for (const scenario of SCENARIOS) {
        const E = seeds.map((s) => fight(b3, p.pilot, s, scenario)), B = seeds.map((s) => fight(b3, p.pilot, s, scenario, { on: "B3" })), N = seeds.map((s) => fight(b3, p.pilot, s, scenario, { nudge }));
        const b3c = OS.compare(E, B), chaos = OS.compare(E, N);
        cells.push({ pilot: p.id, scenario, seeds: [...seeds], b3: b3c, chaos, reading: OS.readingOf(b3c), chaosReading: OS.readingOf(chaos),
            tally: { E: tallyOf(E), B3: tallyOf(B), "E'": tallyOf(N) }, flights: { E, B3: B, "E'": N } });
    }
    return { cells };
}

// ---- the controls -----------------------------------------------------------------------------------------------------------------
export function cUnchanged(pilots) {
    const fingerprints = {}; let ok = true;
    for (const scenario of SCENARIOS) { fingerprints[scenario] = {}; for (const p of pilots) { const f = P6.duel(p.pilot, "autopilot", { seed: ANCHOR.seed, scenario }).fingerprint; fingerprints[scenario][p.id] = f; if (f !== ANCHOR.fingerprints[scenario][p.id]) ok = false; } }
    const digest = OS.stepDigest();
    return { ok: ok && digest === ANCHOR.stepDigest, fingerprints, digest };
}
/** C-box3d: box3d, reading and setting spin; and its damping read back by its effect -- the shim has no damping getter -- a ship coasting 1 s
 *  at 1 m/s and 1 rad/s about its symmetry axis keeps both, beside a body left at the shim's default, which keeps neither. */
export function cBox3d(b3) {
    return withShipWorld(b3, (st) => {
        const w = st.world, other = w.addBox({ type: "dynamic", pos: [500, 0, 0], half: [...SHIP.half], density: st.density });
        for (const i of [st.idx, other]) { w.setVelocity(i, [1, 0, 0]); w.setAngularVelocity(i, [1, 0, 0]); }
        for (let k = 0; k < 30; k++) w.step(DUEL_DT, SUBSTEPS);
        const V = w.readVelocities(), at = (A, i) => Math.hypot(A[i * 3], A[i * 3 + 1], A[i * 3 + 2]), ship = at(V, st.idx), dflt = at(V, other);
        const W = w.readAngularVelocities(), shipSpin = at(W, st.idx), defaultSpin = at(W, other);
        return { backend: w.backendId(), angular: w.supportsAngular(), shipSpeed: ship, defaultSpeed: dflt, shipSpin, defaultSpin,
            ok: w.backendId() === "box3d" && w.supportsAngular() === true && Math.abs(ship - 1) < 1e-6 && dflt < 0.99 && Math.abs(shipSpin - 1) < 1e-6 && defaultSpin < 0.99 };
    });
}
export function cInertia(b3) {
    return withShipWorld(b3, (st) => { const I = st.world.inertia(st.idx), want = shipI(), rel = Math.max(...want.map((v, k) => Math.abs(I.diag[k] - v) / v)), off = Math.max(...I.off.map(Math.abs));
        return { diag: I.diag, want, rel, off, ok: rel < KEY.inertiaTol && off < KEY.inertiaTol * Math.max(...want) }; });
}
const turned90z = () => [Math.SQRT1_2, 0, 0, Math.SQRT1_2];   // [qw,qx,qy,qz]: 90 degrees about z, so the body's +x is the world's +y
// One tick about EACH body axis in turn: a torque on two axes at once couples them through the ship's unequal moments inside the tick (the
// gyroscopic term, 2.2e-4 of the spin for KEY.torque, measured while building), which is physics and not the impulse's frame or scale.
export function cImpulse(b3) {
    const I = shipI(), h = DUEL_DT, body = () => RB.createBody({ mass: SHIP.mass, I, q: turned90z() });
    const axes = [0, 1, 2].map((k) => { const tq = [0, 0, 0]; tq[k] = KEY.torque[k]; const w = withStepper(b3, (st) => st.step(body(), { force: [0, 0, 0], torque: tq }, h)).w, want = tq[k] / I[k] * h;
        return { axis: k, w, want, rel: Math.max(Math.abs(w[k] - want) / Math.abs(want), ...[0, 1, 2].filter((j) => j !== k).map((j) => Math.abs(w[j]) / Math.abs(want))) }; });
    const pushed = withStepper(b3, (st) => st.step(body(), { force: [...KEY.force], torque: [0, 0, 0] }, h));
    const wantV = RB.rotateByQuat(turned90z(), KEY.force.map((f) => f * h / SHIP.mass)), offV = Math.hypot(pushed.vel[0] - wantV[0], pushed.vel[1] - wantV[1], pushed.vel[2] - wantV[2]) / Math.hypot(...wantV);
    const relW = Math.max(...axes.map((a) => a.rel));
    return { axes, relW, vel: pushed.vel, wantV, offV, ok: relW < KEY.impulseTol && offV < KEY.impulseTol };
}
export function cFree(b3) {
    const I = shipI(), b0 = RB.createBody({ mass: SHIP.mass, I, vel: [KEY.freeSpeed, 0, 0], w: [KEY.freeSpin, 0, 0] }), zero = { force: [0, 0, 0], torque: [0, 0, 0] };
    const end = withStepper(b3, (st) => { let b = b0; for (let k = 0, n = Math.round(KEY.freeT / DUEL_DT); k < n; k++) b = st.step(b, zero, DUEL_DT); return b; });
    const spinOff = Math.hypot(end.w[0] - KEY.freeSpin, end.w[1], end.w[2]) / KEY.freeSpin, speedOff = Math.abs(Math.hypot(...end.vel) - KEY.freeSpeed) / KEY.freeSpeed;
    return { w: end.w, vel: end.vel, spinOff, speedOff, ok: spinOff < KEY.freeTol && speedOff < KEY.freeTol };
}
export function cAwake(b3) {
    const b0 = RB.createBody({ mass: SHIP.mass, I: shipI(), vel: [KEY.awakeSpeed, 0, 0] }), zero = { force: [0, 0, 0], torque: [0, 0, 0] };
    const end = withStepper(b3, (st) => { let b = b0; for (let k = 0, n = Math.round(KEY.awakeT / DUEL_DT); k < n; k++) b = st.step(b, zero, DUEL_DT); return b; });
    const off = Math.abs(Math.hypot(...end.vel) - KEY.awakeSpeed) / KEY.awakeSpeed;
    return { vel: end.vel, off, ok: off < KEY.freeTol };
}
/** C-chaos holds when no cell's nudge changes how its pilot fights by the sign test: every cell's p at or above ALPHA. */
export const chaosHolds = (cells, alpha = ALPHA) => cells.length > 0 && cells.every((c) => c.p >= alpha);
export function cDeterminism(b3, pilots, s = FIGHT.seeds[0]) {
    const off = [];
    for (const p of pilots) for (const scenario of SCENARIOS) { const a = fight(b3, p.pilot, s, scenario, { on: "B3" }), b = fight(b3, p.pilot, s, scenario, { on: "B3" }); if (JSON.stringify(a) !== JSON.stringify(b)) off.push(`${p.id}/${scenario}`); }
    return { flights: pilots.length * SCENARIOS.length * 2, ok: off.length === 0, off };
}

// ---- the run ----------------------------------------------------------------------------------------------------------------------
/** Everything the registration names, in its order. The options let a gate fly a miniature on other seeds -- never the registered run. */
export async function run({ pilots = OS.loadPilots(), fightSeeds = FIGHT.seeds, turnSeeds = TURN.seeds, nudge = FIGHT.nudge } = {}) {
    const b3 = await box3dReady();
    const unchanged = cUnchanged(pilots), turn = m1(b3, { seeds: turnSeeds }), fights = m2(b3, pilots, fightSeeds, { nudge });
    const box = cBox3d(b3), inertia = cInertia(b3), impulse = cImpulse(b3), free = cFree(b3), awake = cAwake(b3), determinism = cDeterminism(b3, pilots, fightSeeds[0]);
    const replayOk = turn.duels.every((d) => d.replayIsDuel), chaos = { cells: fights.cells.map((c) => ({ pilot: c.pilot, scenario: c.scenario, p: c.chaos.p, reading: c.chaosReading })) };
    chaos.ok = chaosHolds(chaos.cells);
    return {
        registration: REGISTRATION, pilots: pilots.map((p) => ({ id: p.id, hash: p.hash })), substeps: SUBSTEPS,
        m1: turn, m2: fights,
        controls: { unchanged, box3d: box, inertia, impulse, free, awake, replay: { ok: replayOk }, chaos, determinism },
        readings: fights.cells.map((c) => ({ pilot: c.pilot, scenario: c.scenario, reading: c.reading, better: c.b3.better, worse: c.b3.worse, p: c.b3.p })),
    };
}
export const serialize = SB.serialize;
export const refuseExisting = SB.refuseExisting;
