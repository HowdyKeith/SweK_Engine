// WebGLEngine/tools/roundhouse/orientationStep.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE ENGINE'S OWN ORIENTATION STEP, as physics/mechanics/ORIENTATION_STEP_WIP.md registers it: Q0, rigidBody6dof.step() as it is (freeRotation's
// first-order stepQuat), against Q4, the same step given `orientation: "rk4"`. This is the library -- the registration as data, M1 to M3, the controls,
// the sign test and the readings. The command is tools/roundhouse/orientationStepRun.mjs and prints no score; the gate is orientationStep-selfcheck.mjs.
"use strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import * as RB from "../../physics/mechanics/rigidBody6dof.mjs";
import * as P6 from "../../brain/pilot6dofPolicy.mjs";
import * as M6 from "../../brain/pilot6dofMlp.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import { weightsHash } from "../../brain/drivePolicy.mjs";
import * as SB from "./spinningBody.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
const range = (a, n) => Object.freeze(Array.from({ length: n }, (_, i) => a + i));
export const REGISTRATION = "physics/mechanics/ORIENTATION_STEP_WIP.md";
export const DEFAULT_RESULTS = path.join(ENG, "physics", "mechanics", "orientationStepResults.json");
/** The two steps: Q0 is the step given no option (the engine's own, as it is); Q4 is `orientation: "rk4"`. */
export const STEPS = Object.freeze({ Q0: null, Q4: "rk4" });
export const STEP_IDS = Object.freeze(Object.keys(STEPS));
/** M1: the spinning body's fixture and spin, 30 s at four steps; the order fitted over 1/60 to 1/240 s. */
export const FREE = Object.freeze({ dts: Object.freeze([1 / 30, 1 / 60, 1 / 240, 1 / 960]), fit: Object.freeze([1 / 60, 1 / 240]), T: 30 });
/** The duel's own tick (brain/pilot6dofPolicy.mjs's duel(): dt = 1 / 30), held to its source by the gate. */
export const DUEL_DT = 1 / 30;
export const SCENARIOS = Object.freeze(["standoff", "joust"]);
/** M2: A's inputs from seeds 91001-91010 of each scenario, the PD autopilot against itself under Q0; the reference Q4 at a 64th of the tick (1/1920 s). */
export const TURN = Object.freeze({ seeds: range(91001, 10), refSub: 64 });
/** M3: 40 fresh seeds of each scenario, each duel flown with Q0, Q4 and Q0' (A's start moved 1e-9 m in y). */
export const FIGHT = Object.freeze({ seeds: range(91001, 40), nudge: 1e-9 });
export const ALPHA = 0.01;
/** The five pilots on es-box3d-6dof.html's Load Pilots panel (tools/ship/sixdofPageFight.mjs's PILOTS), each held to its weights' hash. */
export const PILOTS = Object.freeze([
    Object.freeze({ id: "scripted", name: "the PD autopilot", file: null, policy: null, hash: null }),
    Object.freeze({ id: "shipped", name: "the fruit fly's Default", file: "pilot6dofWeightsDefault.json", policy: "pilot6dofPolicy", hash: "215e26d9" }),
    Object.freeze({ id: "league", name: "the fruit fly's League pilot", file: "pilot6dofWeightsLeague.json", policy: "pilot6dofPolicy", hash: "32789ff9" }),
    Object.freeze({ id: "close", name: "the fruit fly's close-quarters pilot", file: "pilot6dofWeightsClose.json", policy: "pilot6dofPolicy", hash: "360580a7" }),
    Object.freeze({ id: "gpu", name: "the GPU Brain's pilot", file: "pilot6dofMlpWeightsDefault.json", policy: "pilot6dofMlp", hash: "0ffd8554" }),
]);
export const PILOT_IDS = Object.freeze(PILOTS.map((p) => p.id));
/** C-unchanged's anchors, taken at e20350aa before any of the round's code (the registration lists them). */
export const ANCHOR = Object.freeze({
    seed: 91100, at: "e20350aa", stepDigest: "29216a6bf1de97d3",
    fingerprints: Object.freeze({
        standoff: Object.freeze({ scripted: "2e273b72", shipped: "cb71fd3c", league: "b8cf6a84", close: "1d0eaca0", gpu: "1cff9908" }),
        joust: Object.freeze({ scripted: "b8c47981", shipped: "44c37caf", league: "de3ad715", close: "fe052a44", gpu: "d75958a1" }),
    }),
});
/** C-key: the fixture spinning steadily at W about its largest axis for T at dt; Q4 within q4Within rad of w t, Q0 beyond q0Beyond. */
export const KEY = Object.freeze({ W: 2, dt: 1 / 30, T: 30, q4Within: 1e-5, q0Beyond: 1e-3 });
/** C-reference: the reference within `ratio` of Q0's own error, wherever that error is above `floor` rad. */
export const REFERENCE = Object.freeze({ ratio: 1 / 30, floor: 1e-9 });

export const optOf = (stepId) => { if (!(stepId in STEPS)) throw new Error(`no step ${stepId}`); return STEPS[stepId] == null ? undefined : { orientation: STEPS[stepId] }; };
const hex = (s) => crypto.createHash("sha256").update(s).digest("hex");

// ---- the pilots ---------------------------------------------------------------------------------------------------------
/** A pilot as the duel takes it: "autopilot", the fruit fly's weights, or the GPU Brain's pilot function -- loaded through the importer the page uses, held to its hash. */
export function loadPilot(p, { read = (f) => fs.readFileSync(path.join(ENG, "brain", f), "utf8") } = {}) {
    if (!p.file) return { id: p.id, pilot: "autopilot", hash: null };
    const mod = p.policy === "pilot6dofMlp" ? M6 : P6, imp = PB.importBrain(PB.describePolicy(p.policy, mod), JSON.parse(read(p.file)));
    if (!imp.ok) throw new Error(`${p.id} does not import: ${imp.reason}`);
    const h = weightsHash(imp.weights);
    if (h !== p.hash) throw new Error(`${p.id} is ${h}, not the registered ${p.hash}`);
    return { id: p.id, pilot: p.policy === "pilot6dofMlp" ? M6.pilotFor(imp.weights) : imp.weights, hash: h };
}
export const loadPilots = (opts) => PILOTS.map((p) => loadPilot(p, opts));

// ---- angles ---------------------------------------------------------------------------------------------------------------
/** The angle between two orientations, accurate for tiny angles: 2 atan2(|v|, |s|) of conj(p) (x) q. */
export function angleBetween(p, q) {
    const s = p[0] * q[0] + p[1] * q[1] + p[2] * q[2] + p[3] * q[3];
    const x = p[0] * q[1] - p[1] * q[0] - p[2] * q[3] + p[3] * q[2];
    const y = p[0] * q[2] + p[1] * q[3] - p[2] * q[0] - p[3] * q[1];
    const z = p[0] * q[3] - p[1] * q[2] + p[2] * q[1] - p[3] * q[0];
    return 2 * Math.atan2(Math.hypot(x, y, z), Math.abs(s));
}

// ---- M1, the free body ----------------------------------------------------------------------------------------------------
/** The spinning body's C4 body (its spinner's own branch: createBody with the fixture's mass and moments), flown with `stepId` at `dt` for `T`. */
export function freeFlight(stepId, dt, { T = FREE.T, w0 = null } = {}) {
    const { m, I, mid } = SB.fixtureBody(), opt = optOf(stepId), acc = RB.createAccumulator();
    let s = RB.createBody({ mass: m, I, w: w0 || SB.startOf(mid) });
    const trace = [{ w: [...s.w], q: [...s.q] }];
    for (let n = 1, N = Math.round(T / dt); n <= N; n++) { s = RB.step(s, acc, dt, opt); trace.push({ w: [...s.w], q: [...s.q] }); }
    return { trace, I, mid };
}
export const slope = (dA, dB, hA, hB) => Math.log(dA / dB) / Math.log(hA / hB);
export function m1({ dts = FREE.dts, fit = FREE.fit, T = FREE.T } = {}) {
    const flights = {}, omegaSame = {};
    for (const dt of dts) {
        const key = `1/${Math.round(1 / dt)}`, by = {};
        for (const id of STEP_IDS) { const { trace, I, mid } = freeFlight(id, dt, { T }), inv = SB.invariants(trace, I, mid); by[id] = { trace, inv }; }
        flights[key] = Object.fromEntries(STEP_IDS.map((id) => [id, { driftWorldL: by[id].inv.driftWorldL, driftE: by[id].inv.driftE, flips: by[id].inv.flips, steps: by[id].trace.length - 1 }]));
        omegaSame[key] = hex(JSON.stringify(by.Q0.trace.map((t) => t.w))) === hex(JSON.stringify(by.Q4.trace.map((t) => t.w)));
    }
    const [hA, hB] = fit, kA = `1/${Math.round(1 / hA)}`, kB = `1/${Math.round(1 / hB)}`;
    const order = Object.fromEntries(STEP_IDS.map((id) => [id, slope(flights[kA][id].driftWorldL, flights[kB][id].driftWorldL, hA, hB)]));
    return { flights, order, omegaSame };
}

// ---- M2, a ship's turn ----------------------------------------------------------------------------------------------------
/** A's start and inputs from a duel of the PD autopilot against itself under Q0, through the duel's own `record`. */
export function recordOf(seed, scenario) { const record = {}; const r = P6.duel("autopilot", "autopilot", { seed, scenario, record }); return { ...record, ticks: r.ticks }; }
/** The record replayed open loop with `stepId`, each input held for its tick, `sub` steps a tick: the orientation and angular velocity at every tick's end. */
export function replay(rec, stepId, sub = 1) {
    const opt = optOf(stepId), h = DUEL_DT / sub; let b = rec.start; const qs = [], ws = [];
    for (const u of rec.inputs) { const acc = { force: u.force, torque: u.torque }; for (let k = 0; k < sub; k++) b = RB.step(b, acc, h, opt); qs.push(b.q); ws.push(b.w); }
    return { qs, ws, end: b };
}
const most = (a, b) => a.reduce((m, q, i) => Math.max(m, angleBetween(q, b[i])), 0);
export function m2({ seeds = TURN.seeds, refSub = TURN.refSub } = {}) {
    const duels = [];
    for (const scenario of SCENARIOS) for (const seed of seeds) {
        const rec = recordOf(seed, scenario), q0 = replay(rec, "Q0"), q4 = replay(rec, "Q4"), q0f = replay(rec, "Q0", refSub), ref = replay(rec, "Q4", refSub);
        duels.push({ scenario, seed, ticks: rec.inputs.length, peakSpin: Math.max(0, ...q0.ws.map((w) => Math.hypot(w[0], w[1], w[2]))),
            q0: most(q0.qs, ref.qs), q4: most(q4.qs, ref.qs), q0fine: most(q0f.qs, ref.qs),
            omegaSame: JSON.stringify(q0.ws) === JSON.stringify(q4.ws), replayIsDuel: JSON.stringify(q0.end) === JSON.stringify(rec.end) });
    }
    return { duels };
}

// ---- M3, the fights -------------------------------------------------------------------------------------------------------
export const RANK = Object.freeze({ loss: 0, draw: 1, win: 2 });
/** A duel's outcome from A's side: a win (B dead and A not), a loss (A dead and B not), or a draw (anything else). */
export const outcomeOf = (r) => (r.bDead && !r.aDead ? "win" : r.aDead && !r.bDead ? "loss" : "draw");
/** One duel of `pilot` as A against the PD autopilot, with a step or the nudge: its outcome and fingerprint. */
export function fight(pilot, seed, scenario, { stepId = "Q0", nudge = 0 } = {}) {
    const o = optOf(stepId), r = P6.duel(pilot, "autopilot", { seed, scenario, ...(o ? { orientation: o.orientation } : {}), ...(nudge ? { nudge } : {}) });
    return { outcome: outcomeOf(r), fingerprint: r.fingerprint, ticks: r.ticks };
}
/** The exact two-sided sign test on `up` against `down` (ties already set aside). */
export function signTest(up, down) {
    const n = up + down, lo = Math.min(up, down);
    if (n === 0) return 1;
    let term = Math.pow(0.5, n), cum = 0;
    for (let i = 0; i <= lo; i++) { cum += term; term *= (n - i) / (i + 1); }
    return Math.min(1, 2 * cum);
}
/** better/worse/same counts of `b` against `a`, outcome by outcome (b better = a higher rank for A). */
export function compare(a, b) {
    let better = 0, worse = 0, same = 0, changed = 0;
    for (let k = 0; k < a.length; k++) { const d = RANK[b[k].outcome] - RANK[a[k].outcome]; if (d > 0) better++; else if (d < 0) worse++; else same++; if (b[k].outcome !== a[k].outcome) changed++; }
    return { better, worse, same, changed, p: signTest(better, worse) };
}
export const readingOf = (c, alpha = ALPHA) => (c.p < alpha ? (c.better > c.worse ? "changes it: better for A" : "changes it: worse for A") : "changes nothing a sign test can see");
const tallyOf = (rs) => ({ win: rs.filter((r) => r.outcome === "win").length, loss: rs.filter((r) => r.outcome === "loss").length, draw: rs.filter((r) => r.outcome === "draw").length });
export function m3(pilots = loadPilots(), seeds = FIGHT.seeds, { nudge = FIGHT.nudge } = {}) {
    const cells = [];
    for (const p of pilots) for (const scenario of SCENARIOS) {
        const Q0 = seeds.map((s) => fight(p.pilot, s, scenario)), Q4 = seeds.map((s) => fight(p.pilot, s, scenario, { stepId: "Q4" })), N = seeds.map((s) => fight(p.pilot, s, scenario, { nudge }));
        const q4 = compare(Q0, Q4), chaos = compare(Q0, N);
        cells.push({ pilot: p.id, scenario, seeds: [...seeds], flights: { Q0, Q4, "Q0'": N }, q4, chaos, reading: readingOf(q4), chaosReading: readingOf(chaos),
            tally: { Q0: tallyOf(Q0), Q4: tallyOf(Q4), "Q0'": tallyOf(N) } });
    }
    return { cells };
}

// ---- the controls ---------------------------------------------------------------------------------------------------------
/** The 1,000 steps of C-unchanged, exactly as the registration prints them; `opt` is handed to each step (none, for the anchor). */
export const stepDigest = (opt) => hex(stepOutputs(opt).map((nx) => [...nx.pos, ...nx.vel, ...nx.q, ...nx.w].map(String).join(",")).join("\n")).slice(0, 16);
/** ...and the outputs themselves, so a gate can hold each part of them apart. */
export function stepOutputs(opt) {
    let s = 12345; const r = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296 - 0.5; };
    const out = [];
    for (let k = 0; k < 1000; k++) {
        const q0 = [r(), r(), r(), r()], n = Math.hypot(...q0), I = [1 + r() + 0.5, 1 + r() + 0.5, 1 + r() + 0.5].map((x) => x * 4);
        const st = RB.createBody({ mass: 2 + r() + 0.5, I, pos: [r() * 9, r() * 9, r() * 9], vel: [r(), r(), r()], q: q0.map((c) => c / n), w: [r() * 6, r() * 6, r() * 6] });
        const acc = RB.createAccumulator(); RB.applyForceAtPoint(acc, [r() * 20, r() * 20, r() * 20], [r(), r(), r()]); acc.torque = [acc.torque[0] + r() * 9, acc.torque[1] + r() * 9, acc.torque[2] + r() * 9];
        out.push(opt === undefined ? RB.step(st, acc, [1 / 30, 1 / 60, 1 / 240][k % 3]) : RB.step(st, acc, [1 / 30, 1 / 60, 1 / 240][k % 3], opt));
    }
    return out;
}
export function cUnchanged(pilots = loadPilots()) {
    const fingerprints = {}; let ok = true;
    for (const scenario of SCENARIOS) { fingerprints[scenario] = {}; for (const p of pilots) { const f = P6.duel(p.pilot, "autopilot", { seed: ANCHOR.seed, scenario }).fingerprint; fingerprints[scenario][p.id] = f; if (f !== ANCHOR.fingerprints[scenario][p.id]) ok = false; } }
    const digest = stepDigest();
    return { ok: ok && digest === ANCHOR.stepDigest, fingerprints, digest };
}
/** The fixture spinning steadily at KEY.W about its largest axis: each step's angle from the exact turn of w t. */
export function cKey() {
    const { m, I } = SB.fixtureBody(), ax = I.indexOf(Math.max(...I)), w0 = [0, 0, 0]; w0[ax] = KEY.W;
    const half = KEY.W * KEY.T / 2, exact = [Math.cos(half), 0, 0, 0]; exact[1 + ax] = Math.sin(half);
    const off = {};
    for (const id of STEP_IDS) { let s = RB.createBody({ mass: m, I, w: w0 }); const acc = RB.createAccumulator(), opt = optOf(id); for (let n = 0, N = Math.round(KEY.T / KEY.dt); n < N; n++) s = RB.step(s, acc, KEY.dt, opt); off[id] = angleBetween(s.q, exact); }
    return { axis: ax, off, ok: off.Q4 <= KEY.q4Within && off.Q0 > KEY.q0Beyond };
}
export function cReference(m2r) {
    const checked = m2r.duels.filter((d) => d.q0 > REFERENCE.floor);
    return { checked: checked.length, of: m2r.duels.length, worstRatio: Math.max(0, ...checked.map((d) => d.q0fine / d.q0)), ok: checked.every((d) => d.q0fine <= REFERENCE.ratio * d.q0) };
}
export function cDeterminism(pilots = loadPilots(), s = FIGHT.seeds[0]) {
    const off = [];
    for (const p of pilots) for (const scenario of SCENARIOS) for (const stepId of STEP_IDS) { const a = fight(p.pilot, s, scenario, { stepId }), b = fight(p.pilot, s, scenario, { stepId }); if (JSON.stringify(a) !== JSON.stringify(b)) off.push(`${p.id}/${scenario}/${stepId}`); }
    return { flights: pilots.length * SCENARIOS.length * STEP_IDS.length * 2, ok: off.length === 0, off };
}

// ---- the run --------------------------------------------------------------------------------------------------------------
/** Everything the registration names, in its order. The options let a gate fly a miniature on other seeds, steps and nudge -- never the registered run. */
export function run({ pilots = loadPilots(), fightSeeds = FIGHT.seeds, turnSeeds = TURN.seeds, free: freeOpts = {}, nudge = FIGHT.nudge } = {}) {
    const unchanged = cUnchanged(pilots), free = m1(freeOpts), turn = m2({ seeds: turnSeeds }), fights = m3(pilots, fightSeeds, { nudge });
    const key = cKey(), reference = cReference(turn), determinism = cDeterminism(pilots, fightSeeds[0]);
    const omega = { free: Object.values(free.omegaSame).every(Boolean), turn: turn.duels.every((d) => d.omegaSame), replayIsDuel: turn.duels.every((d) => d.replayIsDuel) };
    const chaos = { cells: fights.cells.map((c) => ({ pilot: c.pilot, scenario: c.scenario, p: c.chaos.p, reading: c.chaosReading })) };
    chaos.ok = chaos.cells.every((c) => c.p >= ALPHA);
    return {
        registration: REGISTRATION, pilots: pilots.map((p) => ({ id: p.id, hash: p.hash })),
        m1: { flights: free.flights, order: free.order }, m2: turn, m3: fights,
        controls: { unchanged, omega, key, reference, chaos, determinism },
        readings: fights.cells.map((c) => ({ pilot: c.pilot, scenario: c.scenario, reading: c.reading, better: c.q4.better, worse: c.q4.worse, p: c.q4.p })),
    };
}
export const serialize = SB.serialize;
export const refuseExisting = SB.refuseExisting;
