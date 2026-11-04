// WebGLEngine/tools/roundhouse/box3dPdJoust.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE PD AUTOPILOT'S JOUSTS ON box3d: WHICH PART OF box3d COSTS THEM, as physics/mechanics/BOX3D_PD_JOUST_WIP.md registers the round.
// The library: the registration as data, the variants (E, D, E32, D32, B3), M1, M2, M3, the controls, the readings, and the rule
// that names the part. The outcome, the comparison, the sign test and the reading are the orientation round's own
// (tools/roundhouse/orientationStep.mjs); box3d, its stepper and the duel's record are sixdof-box3d's (tools/roundhouse/sixdofBox3d.mjs).
// The command is box3dPdJoustRun.mjs and prints no score; the gate is box3dPdJoust-selfcheck.mjs.
//
// NODE ONLY: box3d is adopted from the vendored wasm through sixdof-box3d's box3dReady().
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as RB from "../../physics/mechanics/rigidBody6dof.mjs";
import * as P6 from "../../brain/pilot6dofPolicy.mjs";
import * as DS from "../../physics/mechanics/rigidBody6dofBox3dScheme.mjs";
import * as OS from "./orientationStep.mjs";
import * as SB3 from "./sixdofBox3d.mjs";
import * as SB from "./spinningBody.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
const range = (a, n) => Object.freeze(Array.from({ length: n }, (_, i) => a + i));
const J = JSON.stringify, hyp = (a) => Math.hypot(a[0], a[1], a[2]), gap = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export const REGISTRATION = "physics/mechanics/BOX3D_PD_JOUST_WIP.md";
export const DEFAULT_RESULTS = path.join(ENG, "physics", "mechanics", "box3dPdJoustResults.json");
/** The duel: the PD autopilot against itself, in the joust, at the duel's 1/30 s. */
export const PILOT = "autopilot", SCENARIO = "joust", DUEL_DT = SB3.DUEL_DT;
/** M2: 100 fresh seeds, each flown with A on E, D, E32, D32 and B3, and on E nudged 1e-9 m in y (E'). */
export const FIGHT = Object.freeze({ seeds: range(95001, 100), nudge: 1e-9 });
/** M1: A's inputs from the first ten of them, replayed open loop. */
export const TURN = Object.freeze({ seeds: range(95001, 10) });
/** M3: the seeds of the finding, sixdof-box3d's 93001-93040. */
export const FOUND = Object.freeze({ seeds: SB3.FIGHT.seeds });
export const VARIANTS = Object.freeze(["E", "D", "E32", "D32", "B3"]);
export const ALPHA = 0.01, HALF = 0.5;
/** C-model's numbers, as the registration fixes them. */
export const MODEL = Object.freeze({ ratio: 0.01, keyTol: 1e-5, keyTorque: 0.5, keyT: 1, tumbleW: Object.freeze([0.3, 0.2, 0.1]), tumbleT: 10, spinTol: 1e-4, angleTol: 1e-4 });
/** box3d's caps, as the registration gives them: 400 m/s, and 0.25 pi rad a step (23.6 rad/s at 1/30 s). */
export const CAPS = Object.freeze({ speed: DS.MAX_LINEAR_SPEED, spin: DS.MAX_ROTATION / DUEL_DT });

// ---- the variants -------------------------------------------------------------------------------------------------------------
/** A state with its position, velocity, orientation and spin rounded to float32. */
export const toF32 = (s) => ({ mass: s.mass, I: [...s.I], pos: s.pos.map(Math.fround), vel: s.vel.map(Math.fround), q: s.q.map(Math.fround), w: s.w.map(Math.fround) });
/** Whether a state's position, velocity, orientation and spin are float32 numbers, to the last component. */
export const isF32 = (s) => [...s.pos, ...s.vel, ...s.q, ...s.w].every((x) => Math.fround(x) === x);
const stepE = (b, a, h) => RB.step(b, a, h), stepD = (b, a, h) => DS.step(b, a, h), rounded = (f) => (b, a, h) => toF32(f(b, a, h));
/** `fn(stepFn)` with variant `id`'s stepper; B3's inside a box3d stepper of its own, whatever world it keeps destroyed after. */
export function withVariant(b3, id, fn) {
    if (id === "E") return fn(stepE);
    if (id === "D") return fn(stepD);
    if (id === "E32") return fn(rounded(stepE));
    if (id === "D32") return fn(rounded(stepD));
    if (id === "B3") return SB3.withStepper(b3, (st) => fn(st.step));
    throw new Error(`box3dPdJoust: no such variant ${J(id)}`);
}
/** A watch on a stepper: the largest speed and spin it returned, and whether every state it returned was float32. */
export const newWatch = () => ({ ticks: 0, maxSpeed: 0, maxSpin: 0, allF32: true });
export const watched = (w, f) => (b, a, h) => { const n = f(b, a, h); w.ticks++; w.maxSpeed = Math.max(w.maxSpeed, hyp(n.vel)); w.maxSpin = Math.max(w.maxSpin, hyp(n.w)); if (!isF32(n)) w.allF32 = false; return n; };

// ---- a fight ------------------------------------------------------------------------------------------------------------------
const read = (r) => ({ outcome: OS.outcomeOf(r), fingerprint: r.fingerprint, ticks: r.ticks });
/** One duel of the PD autopilot against itself in the joust, A on variant `id` (E as the duel flies it, with no stepper given), or E nudged. */
export function fight(b3, seed, id, { nudge = 0, watch = null } = {}) {
    if (id === "E") return read(P6.duel(PILOT, PILOT, { seed, scenario: SCENARIO, ...(nudge ? { nudge } : {}) }));
    return withVariant(b3, id, (f) => read(P6.duel(PILOT, PILOT, { seed, scenario: SCENARIO, stepA: watch ? watched(watch, f) : f })));
}
const tallyOf = (rs) => ({ win: rs.filter((r) => r.outcome === "win").length, loss: rs.filter((r) => r.outcome === "loss").length, draw: rs.filter((r) => r.outcome === "draw").length });
const readingOf = (id, c) => ({ id, better: c.better, worse: c.worse, same: c.same, changed: c.changed, p: c.p, net: c.worse - c.better, reading: OS.readingOf(c, ALPHA) });

// ---- M1, the model, open loop -------------------------------------------------------------------------------------------------
/** A record replayed open loop by `stepFn`, each input held for its tick: the state at each tick's end. */
export function replay(rec, stepFn) { let b = rec.start; const out = []; for (const u of rec.inputs) { b = stepFn(b, { force: u.force, torque: u.torque }, DUEL_DT); out.push(b); } return out; }
export function m1(b3, seeds = TURN.seeds) {
    const duels = [];
    for (const seed of seeds) {
        const rec = SB3.recordOf(seed, SCENARIO), B = withVariant(b3, "B3", (f) => replay(rec, f)), peak = Math.max(...B.map((s) => hyp(s.w)));
        const row = { seed, ticks: rec.inputs.length, peakSpin: peak, angle: {}, dist: {}, spinOff: {}, allF32: {} };
        for (const id of ["E", "D", "E32", "D32"]) {
            const X = withVariant(b3, id, (f) => replay(rec, f));
            row.angle[id] = X.reduce((m, s, i) => Math.max(m, OS.angleBetween(s.q, B[i].q)), 0);
            row.dist[id] = X.reduce((m, s, i) => Math.max(m, gap(s.pos, B[i].pos)), 0);
            row.spinOff[id] = X.reduce((m, s, i) => Math.max(m, gap(s.w, B[i].w)), 0) / peak;
            row.allF32[id] = X.every(isF32);
        }
        duels.push(row);
    }
    return { duels };
}

// ---- M2, the fights; M3, the seeds of the finding ------------------------------------------------------------------------------
export function m2(b3, seeds = FIGHT.seeds, { nudge = FIGHT.nudge } = {}) {
    const E = seeds.map((s) => fight(b3, s, "E")), flights = { E }, watch = {}, readings = [];
    for (const id of ["D", "E32", "D32", "B3"]) { watch[id] = newWatch(); flights[id] = seeds.map((s) => fight(b3, s, id, { watch: watch[id] })); readings.push(readingOf(id, OS.compare(E, flights[id]))); }
    flights["E'"] = seeds.map((s) => fight(b3, s, "E", { nudge }));
    readings.push(readingOf("E'", OS.compare(E, flights["E'"])));
    const tally = Object.fromEntries(Object.entries(flights).map(([k, v]) => [k, tallyOf(v)]));
    return { seeds: [...seeds], readings, tally, watch, flights };
}
export function m3(b3, seeds = FOUND.seeds) {
    const E = seeds.map((s) => fight(b3, s, "E")), B = seeds.map((s) => fight(b3, s, "B3")), changed = seeds.filter((s, i) => B[i].outcome !== E[i].outcome);
    const flights = { E, B3: B }, variants = {};
    for (const id of ["D", "E32", "D32"]) {
        flights[id] = seeds.map((s) => fight(b3, s, id));
        variants[id] = { ...readingOf(id, OS.compare(E, flights[id])), toB3: seeds.filter((s, i) => B[i].outcome !== E[i].outcome && flights[id][i].outcome === B[i].outcome).length };
    }
    return { seeds: [...seeds], b3Changed: changed.length, variants, flights };
}

// ---- the controls -------------------------------------------------------------------------------------------------------------
/** C-unchanged: sixdof-box3d's anchors, and its committed flights of the PD autopilot's joust, all 40 seeds on E and on B3, flown again (M3's). */
export function cUnchanged(pilots, m3r) {
    const anchors = SB3.cUnchanged(pilots), file = JSON.parse(fs.readFileSync(SB3.DEFAULT_RESULTS, "utf8"));
    const cell = file.m2.cells.find((c) => c.pilot === "scripted" && c.scenario === "joust");
    const sameSeeds = J(cell.seeds) === J(m3r.seeds), sameE = J(cell.flights.E) === J(m3r.flights.E), sameB3 = J(cell.flights.B3) === J(m3r.flights.B3);
    return { ok: anchors.ok && sameSeeds && sameE && sameB3, anchors, sameSeeds, sameE, sameB3 };
}
/** C-model: D is box3d's scheme -- by M1's ratio, the key, and the tumble, as registered; and, reported beside them and testing nothing
 *  (added while building, see the note's build record), the tumble one tick at a time from box3d's own states. */
export function cModel(b3, m1r) {
    const I = SB3.shipI(), body = (w = [0, 0, 0]) => RB.createBody({ mass: SB3.SHIP.mass, I, w });
    const ratio = { worst: Math.max(...m1r.duels.map((d) => d.angle.D / d.angle.E)), duels: m1r.duels.length };
    ratio.ok = m1r.duels.length > 0 && m1r.duels.every((d) => d.angle.D <= MODEL.ratio * d.angle.E);
    const nKey = Math.round(MODEL.keyT / DUEL_DT), keyAcc = { force: [0, 0, 0], torque: [MODEL.keyTorque, 0, 0] };
    const turnBy = (f) => { let b = body(); for (let k = 0; k < nKey; k++) b = f(b, keyAcc, DUEL_DT); return 2 * Math.atan2(b.q[1], b.q[0]); };
    const key = { B3: withVariant(b3, "B3", turnBy), D: turnBy(stepD) }; key.off = Math.abs(key.D - key.B3); key.ok = key.off <= MODEL.keyTol;
    const nT = Math.round(MODEL.tumbleT / DUEL_DT), free = { force: [0, 0, 0], torque: [0, 0, 0] };
    const tumbleBy = (f) => { let b = body([...MODEL.tumbleW]); const out = []; for (let k = 0; k < nT; k++) { b = f(b, free, DUEL_DT); out.push(b); } return out; };
    const tB = withVariant(b3, "B3", tumbleBy), tD = tumbleBy(stepD);
    const tumble = { ticks: nT, spinGap: Math.max(...tD.map((s, i) => gap(s.w, tB[i].w) / hyp(tB[i].w))), angleGap: Math.max(...tD.map((s, i) => OS.angleBetween(s.q, tB[i].q))) };
    tumble.ok = tumble.spinGap <= MODEL.spinTol && tumble.angleGap <= MODEL.angleTol;
    const starts = [body([...MODEL.tumbleW]), ...tB.slice(0, -1)], oneB = withVariant(b3, "B3", (f) => starts.map((s) => f(s, free, DUEL_DT))), oneD = starts.map((s) => stepD(s, free, DUEL_DT));
    const perTick = { ticks: starts.length, spinGap: Math.max(...oneD.map((s, i) => gap(s.w, oneB[i].w) / hyp(oneB[i].w))), angleGap: Math.max(...oneD.map((s, i) => OS.angleBetween(s.q, oneB[i].q))) };
    perTick.ok = perTick.spinGap <= MODEL.spinTol && perTick.angleGap <= MODEL.angleTol;
    return { ok: ratio.ok && key.ok && tumble.ok, ratio, key, tumble, perTick, okPerTick: ratio.ok && key.ok && perTick.ok };
}
/** C-float32: E32's and D32's states all float32, in M1's replays and in every M2 flight; E's and D's not, in M1's replays. */
export function cFloat32(m1r, m2r) {
    const rounded = ["E32", "D32"].every((id) => m1r.duels.every((d) => d.allF32[id]) && m2r.watch[id].allF32 && m2r.watch[id].ticks > 0);
    const plain = ["E", "D"].every((id) => m1r.duels.every((d) => !d.allF32[id]));
    return { ok: rounded && plain, rounded, plain };
}
/** C-caps: B3's ship never reaches box3d's caps in any M2 flight. */
export function cCaps(m2r) { const w = m2r.watch.B3; return { maxSpeed: w.maxSpeed, maxSpin: w.maxSpin, ticks: w.ticks, ok: w.ticks > 0 && w.maxSpeed < CAPS.speed && w.maxSpin < CAPS.spin }; }
/** C-chaos holds when the nudge changes nothing a sign test can see: E' against E at p at or above ALPHA. */
export const chaosHolds = (reading) => !!reading && reading.id === "E'" && reading.p >= ALPHA;
export function cDeterminism(b3, s = FIGHT.seeds[0], nudge = FIGHT.nudge) {
    const off = [], ids = [...VARIANTS, "E'"];
    for (const id of ids) { const fly = () => (id === "E'" ? fight(b3, s, "E", { nudge }) : fight(b3, s, id)); if (J(fly()) !== J(fly())) off.push(id); }
    return { flights: ids.length * 2, ok: off.length === 0, off };
}

// ---- the rule, fixed by the registration ----------------------------------------------------------------------------------------
/**
 * The registration's rule, from M2's readings and whether C-model holds: { raw, label, replicated, reproduces }. `raw` is what the
 * rule names before C-model is asked; `label` is what it names. If B3 does not read "worse for A" at p < 0.01, nothing is named. A
 * variant reproduces B3 when it reads "worse for A" at p < 0.01 and its net is at least half of B3's. D counts as box3d's scheme only
 * if C-model holds: if it does not, nothing is named for the scheme.
 */
export function nameThePart(readings, modelOk) {
    const r = Object.fromEntries(readings.map((x) => [x.id, x])), worse = (x) => !!x && x.p < ALPHA && x.reading === "changes it: worse for A";
    if (!worse(r.B3)) return { raw: "not replicated", label: "not replicated", replicated: false, reproduces: {} };
    const rep = (x) => worse(x) && x.net >= HALF * r.B3.net, reproduces = { D: rep(r.D), E32: rep(r.E32), D32: rep(r.D32) };
    const raw = reproduces.D && !reproduces.E32 ? "box3d's scheme" : reproduces.E32 && !reproduces.D ? "float32" : reproduces.D && reproduces.E32 ? "either alone"
        : reproduces.D32 ? "the two together" : "something else in box3d";
    const label = modelOk || !["box3d's scheme", "either alone", "the two together"].includes(raw) ? raw : raw === "either alone" ? "float32 (nothing is named for the scheme)" : "nothing is named";
    return { raw, label, replicated: true, reproduces };
}

// ---- the run ------------------------------------------------------------------------------------------------------------------
/** Everything the registration names, in its order. The options let a gate fly a miniature on other seeds -- never the registered run. */
export async function run({ fightSeeds = FIGHT.seeds, turnSeeds = TURN.seeds, foundSeeds = FOUND.seeds, nudge = FIGHT.nudge, pilots = OS.loadPilots() } = {}) {
    const b3 = await SB3.box3dReady();
    const turn = m1(b3, turnSeeds), fights = m2(b3, fightSeeds, { nudge }), found = m3(b3, foundSeeds);
    const unchanged = cUnchanged(pilots, found), box = SB3.cBox3d(b3), model = cModel(b3, turn), float32 = cFloat32(turn, fights), caps = cCaps(fights);
    const cr = fights.readings.find((x) => x.id === "E'"), chaos = { ...cr, ok: chaosHolds(cr) }, determinism = cDeterminism(b3, fightSeeds[0], nudge);
    return {
        registration: REGISTRATION, pilot: PILOT, scenario: SCENARIO, substeps: DS.SUBSTEPS,
        m1: turn, m2: fights, m3: found,
        controls: { unchanged, box3d: box, model, float32, caps, chaos, determinism },
        readings: fights.readings.map(({ id, better, worse, p, net, reading }) => ({ id, better, worse, p, net, reading })),
    };
}
export const serialize = SB.serialize;
export const refuseExisting = SB.refuseExisting;
