// WebGLEngine/tools/subVestibularTasks.mjs -- UNNUMBERED, UNGATED (the fish vestibular helper branch; brain/FISH_VESTIBULAR_HELPER_WIP.md, Addendum 2)
//
// THE TWO TASKS OF RUNG 4b, AND THE MEASUREMENT THAT SAYS WHETHER EITHER EXISTS. Nothing here trains anything and no circuit is read: only the PD autopilot (brain/autopilotSub.mjs) and four hand-written reflexes fly.
//
//   4b-P  PITCH-HOLD  a constant pitching torque for 20 s (the tonic part) and three instant changes of the pitch rate (the phasic part) added to a standard dive of brain/subTask.mjs
//   4b-E  HAZARD      one unguided straight-runner launched at the hull from one side, with the pressure pulse that runs ahead of it: a sway-velocity step applied 0.1 m below the centre of gravity, so that it
//                     also rolls the hull toward the hazard's side. A hit ends the dive and is charged as every early end is (the worst tick, 7.5, for each tick not flown).
//
// THE LADDERS, THE RULES AND THE REFLEX SET ARE THE NOTE'S (Addendum 2, pushed at 2026-10-24T23:59Z, BEFORE this file existed); the constants below copy them and a reader should check them against it. The disturbances are forces and
// torques added to the vessel's accumulator inside a copy of S.stepSub's tick, in a runner that scores as subTask.fly() does. Neither brain/subTask.mjs nor the vessel is edited.
//
//     node tools/subVestibularTasks.mjs          # the self-tests, then the measurement (about a minute)
//
// CONVENTIONS (the vessel's): body +X nose, +Y LEFT, +Z up; pitch positive nose-up, so a positive y-torque and a positive w[1] are NOSE DOWN; bank positive right-side-down; a side of +1 is a hazard on the RIGHT.
// Pure but for the printing: no clock, no Math.random; every draw comes from a seed.
"use strict";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import * as T from "../brain/subTask.mjs";
import * as AS from "../brain/autopilotSub.mjs";
import { step, applyForceAtPoint, rotateByQuat } from "../physics/mechanics/rigidBody6dof.mjs";
import { foldHash } from "../physics/raceCar.mjs";

const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const KIND_INDEX = Object.freeze({ nominal: 0, recovery: 1, current: 2 });
const rngFor = (sc, salt) => mulberry((sc.seed * 7919 + KIND_INDEX[sc.kind] * 104729 + salt) >>> 0);
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;

// ---- the ladders (Addendum 2) -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export const PITCH_LADDER = Object.freeze([0.5, 1, 2, 4, 8].map((kNm, rung) => Object.freeze({ rung, trimNm: kNm * 1000, kick: [0.05, 0.1, 0.2, 0.3, 0.4][rung] })));   // trim torque (N m), kick (rad/s)
export const HAZARD_LADDER = Object.freeze([[8, 3], [6, 4], [5, 5], [4, 6], [3, 7]].map(([flight, reach], rung) => Object.freeze({ rung, flight, reach })));   // flight time (s), reach (m)
export const HAZARD = Object.freeze({ speed: 3, pulse: 0.4, pulseTicks: 3, pulseBelowCg: 0.1 });   // m/s; sway-velocity step (m/s); ticks it is applied over; m below the centre of gravity
export const REFLEX = Object.freeze({ rate: 0.02, hold: 3 });   // Addendum 3 (Run 1 used a LEVEL, sideslip above 0.08 rad, which fires on the autopilot's own turn): the first tick the sideslip CHANGES by more than 0.02 rad; held 3 s
export const COST_FLOOR = 0.05, RECOVER_FRACTION = 0.5;

// ---- the runner: subTask.fly() with room for a disturbance --------------------------------------------------------------------------------------------------------------------------------------------------
/**
 * Fly `sc` with `pilot`; `disturb` = { kick(i, state) -> state' | null (before the pilot reads it), load(i, state, acc) (adds to the tick's force and torque), hit(i, state) -> bool (after the step) }, any of them absent.
 * Returns what subTask.fly returns, with status "hit" for a hit. With no disturbance it IS subTask.fly (selfTest below holds that on 12 scenarios).
 */
export function run(pilot, sc, { disturb = null, seconds = T.SECONDS, dt = T.DT, model = S.createSubModel() } = {}) {
    let s = S.createState({ ...sc.start, model }), eDepth = 0, eHdg = 0, eSpd = 0, flown = 0, status = "submerged", minDepth = Infinity, maxDepth = -Infinity, h = 0x811c9dc5;
    const total = Math.round(seconds / dt);
    for (let i = 0; i < total; i++) {
        if (disturb && disturb.kick) s = disturb.kick(i, s) || s;
        const cv = T.currentAt(sc.current, i * dt), cmd = pilot(s, sc.target, cv), fm = S.forcesAndMoments(model, s, cmd, cv, sc.weightError);
        if (disturb && disturb.load) disturb.load(i, s, fm.acc);
        s = step(s, fm.acc, dt);
        const cl = S.classify(model, s);
        if (cl.status !== "submerged") { status = cl.status; break; }
        if (disturb && disturb.hit && disturb.hit(i, s)) { status = "hit"; break; }
        const a = S.attitude(s, cv), he = Math.atan2(Math.sin(sc.target.heading - a.heading), Math.cos(sc.target.heading - a.heading));
        eDepth += Math.min(3, Math.abs(a.depth - sc.target.depth) / 5); eHdg += Math.min(3, Math.abs(he)); eSpd += Math.min(3, Math.abs(a.speed - sc.target.speed));
        if (a.depth < minDepth) minDepth = a.depth; if (a.depth > maxDepth) maxDepth = a.depth; flown++;
        if (i % 30 === 0) for (const c of [s.pos[0], s.pos[1], s.pos[2], s.q[0], s.q[1], s.q[2], s.q[3]]) h = foldHash(h, Math.round(c * 1000) & 0xffffffff);
    }
    const f = S.attitude(s);
    const score = -((eDepth + eHdg + 0.5 * eSpd) + T.WORST_TICK * (total - flown)) / total;
    const m = Math.max(1, flown);
    return { score, eDepth: eDepth / m, eHdg: eHdg / m, eSpd: eSpd / m, status, ticks: flown, minDepth: Number.isFinite(minDepth) ? minDepth : 0, maxDepth: Number.isFinite(maxDepth) ? maxDepth : 0, final: { depth: f.depth, hdg: f.heading, V: f.speed }, seed: sc.seed, kind: sc.kind, fingerprint: (h >>> 0).toString(16) };
}

// ---- 4b-P ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** The draws of one dive, the same at every rung: a 20 s trim window starting in [5, 35] s, three kicks in [5, 55] s at least 5 s apart; every sign seeded (+1 = nose down). */
export function pitchPlan(sc) {
    const r = rngFor(sc, 10007), u = (a, b) => a + (b - a) * r();
    const trim = { start: u(5, 35), dur: 20, sign: r() < 0.5 ? -1 : 1 }, times = [];
    for (let guard = 0; times.length < 3 && guard < 1000; guard++) { const t = u(5, 55); if (times.every((x) => Math.abs(x - t) >= 5)) times.push(t); }
    if (times.length !== 3) throw new Error("subVestibularTasks.pitchPlan: could not place three kicks 5 s apart");
    times.sort((a, b) => a - b);
    return { trim, kicks: times.map((t) => ({ t, sign: r() < 0.5 ? -1 : 1 })) };
}
/** The disturbance of rung `rung` for `sc`; `trim: false` or `kicks: false` leaves that kind out (for the reported split). */
export function pitchDisturbance(sc, rung, { trim = true, kicks = true } = {}) {
    const L = PITCH_LADDER[rung], plan = pitchPlan(sc), at = new Map(plan.kicks.map((k) => [Math.round(k.t / T.DT), k.sign]));
    return {
        kick: kicks ? (i, s) => (at.has(i) ? { ...s, w: [s.w[0], s.w[1] + at.get(i) * L.kick, s.w[2]] } : null) : null,
        load: trim ? (i, s, acc) => { const t = i * T.DT; if (t >= plan.trim.start && t < plan.trim.start + plan.trim.dur) acc.torque[1] += plan.trim.sign * L.trimNm; } : null,
    };
}

// ---- 4b-E ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** The 40 dives of 4b-E: the 10 nominal seeds of TRAIN_SET x side (-1 left, +1 right) x 2 launch times drawn from the dive's seed in [15, 35] s. */
export function hazardDives() {
    const out = [];
    for (let seed = 1; seed <= 10; seed++) {
        const sc = T.scenario(seed, "nominal"), r = rngFor(sc, 20011), t0s = [15 + 20 * r(), 15 + 20 * r()];
        for (const side of [-1, 1]) for (const t0 of t0s) out.push(Object.freeze({ sc, side, t0 }));
    }
    return out;
}
/** The hazard, launched from state `s`: aimed once at where the hull would be after the flight time if it held its (3-D) velocity, from the hull's `side` (+1 right) at the hazard's speed. */
export function launch(s, side, L) {
    const left = rotateByQuat(s.q, [0, 1, 0]), n = Math.hypot(left[0], left[1]) || 1, right = [-left[0] / n, -left[1] / n, 0];
    const aim = s.pos.map((p, k) => p + s.vel[k] * L.flight), d = HAZARD.speed * L.flight;
    return { h0: aim.map((a, k) => a + side * right[k] * d), hv: right.map((r) => -side * r * HAZARD.speed), reach: L.reach, until: 2 * L.flight };
}
/** The disturbance of one 4b-E dive at `rung`; `push: false` leaves the pulse out and keeps the hazard (for the reported "does the push alone dodge it"). Stateful: make a fresh one per flight. */
export function hazardDisturbance(dive, rung, { push = true } = {}) {
    const L = HAZARD_LADDER[rung], i0 = Math.round(dive.t0 / T.DT); let hz = null;
    return {
        kick: (i, s) => { if (i === i0) hz = launch(s, dive.side, L); return null; },
        load: push ? (i, s, acc) => { if (i >= i0 && i < i0 + HAZARD.pulseTicks) applyForceAtPoint(acc, [0, dive.side * (s.mass * HAZARD.pulse) / (HAZARD.pulseTicks * T.DT), 0], [0, 0, -HAZARD.pulseBelowCg]); } : null,
        hit: (i, s) => {
            if (!hz) return false;
            const tau = (i + 1 - i0) * T.DT; if (tau > hz.until) return false;
            return Math.hypot(...s.pos.map((p, k) => p - (hz.h0[k] + hz.hv[k] * tau))) < hz.reach;
        },
    };
}
/** The cue detector of Addendum 3, one per dive (it remembers the last tick's sideslip): called once a tick with (state, current), it returns +1 on the tick the sideslip DROPS by more than REFLEX.rate (a leftward push: a hazard on the right), -1 on a rise of that size, else 0. */
export function cueDetector() {
    let prev = null;
    return (state, current) => { const b = S.attitude(state, current).beta, d = prev === null ? 0 : b - prev; prev = b; return Math.abs(d) > REFLEX.rate ? (d < 0 ? 1 : -1) : 0; };
}
/** The four hand-written reflexes of the note: yaw "away" from or "toward" the hazard's side, thrust +1 or -1, held 3 s from the first tick the cue detector fires; the autopilot flies pitch and ballast throughout and everything after. */
export function reflex(base, { yaw, thrust }) {
    let tgt = null, det = null, trig = -1, call = 0, side = 0; const hold = Math.round(REFLEX.hold / T.DT);
    return (state, target, current) => {
        if (target !== tgt) { tgt = target; det = cueDetector(); trig = -1; call = 0; side = 0; }   // a new dive is a new target object
        const c = base(state, target, current), k = call++, d = det(state, current);
        if (trig < 0 && d !== 0) { trig = k; side = d; }
        return trig >= 0 && k - trig < hold ? { ...c, yaw: (yaw === "away" ? -1 : 1) * side, thrust } : c;
    };
}
export const REFLEXES = Object.freeze([["away", 1], ["away", -1], ["toward", 1], ["toward", -1]].map(([yaw, thrust]) => Object.freeze({ name: `${yaw}${thrust > 0 ? "+" : "-"}`, yaw, thrust })));

// ---- the measurement ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const AUTOPILOT = AS.pilot();
const flyP = (sc, rung, kinds) => run(AUTOPILOT, sc, { disturb: pitchDisturbance(sc, rung, kinds) });

/** { clean, rungs: [{ rung, cost, trimOnly, kicksOnly, early }], chosen } over TRAIN_SET (the 40 dives of 4b-P). */
export function measureP() {
    const clean = mean(T.TRAIN_SET.map((sc) => T.fly(AUTOPILOT, sc).score)), rungs = PITCH_LADDER.map((L) => {
        const full = T.TRAIN_SET.map((sc) => flyP(sc, L.rung, {})), tr = T.TRAIN_SET.map((sc) => flyP(sc, L.rung, { kicks: false })), ki = T.TRAIN_SET.map((sc) => flyP(sc, L.rung, { trim: false }));
        return { rung: L.rung, cost: clean - mean(full.map((r) => r.score)), trimOnly: clean - mean(tr.map((r) => r.score)), kicksOnly: clean - mean(ki.map((r) => r.score)), early: full.filter((r) => r.status !== "submerged").length };
    });
    const hit = rungs.find((r) => r.cost >= COST_FLOOR);
    return { clean, rungs, chosen: hit ? hit.rung : null };
}
/** { clean, rungs: [{ rung, cost, autopilotHits, noPushHits, reflexes: [{ name, hits, recovered }], best, qualifies }], chosen } over the 40 dives of 4b-E. */
export function measureE() {
    const dives = hazardDives(), clean = mean(dives.map((d) => T.fly(AUTOPILOT, d.sc).score));
    const rungs = HAZARD_LADDER.map((L) => {
        const ap = dives.map((d) => run(AUTOPILOT, d.sc, { disturb: hazardDisturbance(d, L.rung) })), apNoPush = dives.map((d) => run(AUTOPILOT, d.sc, { disturb: hazardDisturbance(d, L.rung, { push: false }) }));
        const cost = clean - mean(ap.map((r) => r.score)), reflexes = REFLEXES.map((R) => {
            const rs = dives.map((d) => run(reflex(AUTOPILOT, R), d.sc, { disturb: hazardDisturbance(d, L.rung) }));
            return { name: R.name, score: mean(rs.map((r) => r.score)), hits: rs.filter((r) => r.status === "hit").length, recovered: cost > 0 ? (mean(rs.map((r) => r.score)) - mean(ap.map((r) => r.score))) / cost : NaN };
        });
        const best = reflexes.reduce((a, b) => (b.score > a.score ? b : a));
        return { rung: L.rung, cost, autopilotHits: ap.filter((r) => r.status === "hit").length, noPushHits: apNoPush.filter((r) => r.status === "hit").length, reflexes, best: best.name, recovered: best.recovered, qualifies: cost >= COST_FLOOR && best.recovered >= RECOVER_FRACTION };
    });
    const hit = rungs.find((r) => r.qualifies);
    return { clean, rungs, chosen: hit ? hit.rung : null };
}

// ---- the self-tests -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** With no disturbance, run() IS subTask.fly(): the same score and fingerprint on 12 scenarios (4 of each kind), flown by the autopilot. */
export function selfTestRunner() {
    const set = [...[1, 2, 3, 4].map((s) => T.scenario(s, "nominal")), ...[1, 2, 3, 4].map((s) => T.scenario(s, "recovery")), ...[1, 2, 3, 4].map((s) => T.scenario(s, "current"))];
    const bad = set.filter((sc) => { const a = T.fly(AUTOPILOT, sc), b = run(AUTOPILOT, sc); return a.score !== b.score || a.fingerprint !== b.fingerprint || a.status !== b.status; });
    return { n: set.length, bad: bad.map((sc) => `${sc.kind} ${sc.seed}`) };
}
/** The signs: a nose-down torque lowers the nose; a nose-down kick makes the reported pitch rate negative; a right-hand hazard pushes the hull LEFT (sideslip negative, i.e. slipping left), rolls it right-side-down, and the reflex reads it as a right-hand hazard. */
export function selfTestSigns() {
    const model = S.createSubModel(), out = [], sc = T.scenario(3, "nominal"), fresh = () => S.createState({ ...sc.start, pitch: 0, bank: 0, gamma: 0, w: [0, 0, 0], model });
    const hold = (disturb, ticks) => { let s = fresh(); const cmd = { pitch: 0, yaw: 0, thrust: S.trim(model, sc.start.speed).thrust, ballast: 0 }; for (let i = 0; i < ticks; i++) { if (disturb.kick) s = disturb.kick(i, s) || s; const fm = S.forcesAndMoments(model, s, cmd, [0, 0, 0], 0); if (disturb.load) disturb.load(i, s, fm.acc); s = step(s, fm.acc, T.DT); } return s; };
    const nd = hold({ load: (i, s, acc) => { acc.torque[1] += 4000; } }, 30);
    out.push(["a +y torque (nose down by the note's sign) lowers the nose", S.attitude(nd).pitch < -0.001]);
    const kick = fresh(); const kicked = { ...kick, w: [0, 0.2, 0] };
    out.push(["a +w[1] kick (nose down) reads as a negative pitch rate", S.rates(kicked).pitch < 0]);
    for (const side of [1, -1]) {
        const dive = { sc, side, t0: 0 }, d = hazardDisturbance(dive, 1), s = hold({ kick: d.kick, load: d.load }, 6), a = S.attitude(s), r = S.rates(s);
        out.push([`a ${side > 0 ? "right" : "left"}-hand hazard: sideslip ${side > 0 ? "negative" : "positive"}, roll rate and bank ${side > 0 ? "positive (right side down)" : "negative"}`, side * a.beta < -0.02 && side * r.roll > 0 && side * a.bank > 0]);
        const rf = reflex(AUTOPILOT, REFLEXES[0]); let trigSide = 0;
        { let st = fresh(), tgt = sc.target; const dd = hazardDisturbance(dive, 1); for (let i = 0; i < 12; i++) { if (dd.kick) st = dd.kick(i, st) || st; const c = rf(st, tgt, [0, 0, 0]); if (!trigSide && c.yaw !== AUTOPILOT(st, tgt, [0, 0, 0]).yaw) trigSide = -Math.sign(c.yaw); const fm = S.forcesAndMoments(model, st, c, [0, 0, 0], 0); dd.load(i, st, fm.acc); st = step(st, fm.acc, T.DT); } }
        out.push([`the "away" reflex turns away from a ${side > 0 ? "right" : "left"}-hand hazard (yaw ${side > 0 ? "left, negative" : "right, positive"})`, trigSide === side]);
    }
    return out;
}
/**
 * The three conditions of Addendum 3, which must hold before a Run 2 counts. (a) the cue detector fires on none of the 10 nominal dives with no hazard (and the largest one-tick change of sideslip on them is returned, for the record);
 * (b) on all 40 hazard dives it fires within 1 to 2 ticks of the launch; (c) it reads the right side on all 40.
 */
export function selfTestTrigger() {
    const watch = (sc, disturb) => {
        const det = cueDetector(); let k = 0, first = -1, side = 0, maxStep = 0, prev = null;
        run((state, target, current) => { const b = S.attitude(state, current).beta; if (prev !== null) maxStep = Math.max(maxStep, Math.abs(b - prev)); prev = b; const d = det(state, current); if (first < 0 && d !== 0) { first = k; side = d; } k++; return AUTOPILOT(state, target, current); }, sc, { disturb });
        return { first, side, maxStep };
    };
    const quiet = T.TRAIN_SET.filter((q) => q.kind === "nominal").map((q) => watch(q, null)), dives = hazardDives(), seen = dives.map((d) => ({ d, w: watch(d.sc, hazardDisturbance(d, 0)) }));
    const lag = seen.map(({ d, w }) => w.first - Math.round(d.t0 / T.DT));
    return { a: quiet.every((q) => q.first < 0), maxQuietStep: Math.max(...quiet.map((q) => q.maxStep)), b: lag.every((l) => l >= 1 && l <= 2), lags: [Math.min(...lag), Math.max(...lag)], c: seen.every(({ d, w }) => w.side === d.side), n: dives.length };
}

/**
 * NOT A RULE -- what a STATELESS pilot (the kind 4b trains) can see of the cue, as levels at one tick. On the 10 cue-free nominal dives: the largest |roll rate|, |bank| and |sideslip| anywhere in the dive. On the 40 hazard dives at rung 0 (the cue
 * does not depend on the rung): the smallest, over the dives, of the peak of each in the 10 ticks after the launch. A ratio above 1 means the cue's peak exceeds anything the autopilot's own flying produces on those channels, so a level threshold could in principle find it.
 */
export function cueSeparation() {
    const peak = (sc, disturb, from, to) => { let roll = 0, bank = 0, beta = 0, k = 0; run((st, tg, cu) => { if (k >= from && k < to) { const a = S.attitude(st, cu); roll = Math.max(roll, Math.abs(S.rates(st).roll)); bank = Math.max(bank, Math.abs(a.bank)); beta = Math.max(beta, Math.abs(a.beta)); } k++; return AUTOPILOT(st, tg, cu); }, sc, { disturb }); return { roll, bank, beta }; };
    const quiet = T.TRAIN_SET.filter((q) => q.kind === "nominal").map((q) => peak(q, null, 0, 1800)), cue = hazardDives().map((d) => { const i0 = Math.round(d.t0 / T.DT); return peak(d.sc, hazardDisturbance(d, 0), i0, i0 + 10); });
    const out = {}; for (const ch of ["roll", "bank", "beta"]) { const q = Math.max(...quiet.map((x) => x[ch])), c = Math.min(...cue.map((x) => x[ch])); out[ch] = { quietMax: q, cueMin: c, ratio: c / q }; }
    return out;
}

/** NOT A RULE: how long the roll-rate cue lasts: over the 40 hazard dives at rung 0, the fewest and the most ticks, in the 3 s after the launch, with |roll rate| above `threshold` (rad/s), and the latest such tick after the launch (30 ticks = 1 s). */
export function cueDuration(threshold = 0.15) {
    const rows = hazardDives().map((d) => { const i0 = Math.round(d.t0 / T.DT); let k = 0, n = 0, last = -1; run((st, tg, cu) => { if (k >= i0 && k < i0 + 90 && Math.abs(S.rates(st).roll) > threshold) { n++; last = k - i0; } k++; return AUTOPILOT(st, tg, cu); }, d.sc, { disturb: hazardDisturbance(d, 0) }); return [n, last]; });
    return { min: Math.min(...rows.map((r) => r[0])), max: Math.max(...rows.map((r) => r[0])), lastTick: Math.max(...rows.map((r) => r[1])) };
}
/** NOT A RULE: a hand-written STATELESS reflex, the most a pilot of the kind 4b trains could do: the same four yaw and thrust choices, applied only on the ticks on which |roll rate| exceeds `threshold` (rad/s; between the cue-free maximum 0.079 and the smallest cue peak 0.244 that cueSeparation() reports), the side read from the sign of the roll rate (positive = right side down = a right-hand hazard). */
export function statelessReflex(base, { yaw, thrust }, threshold = 0.15) {
    return (state, target, current) => { const c = base(state, target, current), r = S.rates(state).roll; return Math.abs(r) <= threshold ? c : { ...c, yaw: (yaw === "away" ? -1 : 1) * (r > 0 ? 1 : -1), thrust }; };
}
/** NOT A RULE: the stateless reflexes on the 40 hazard dives at every rung, like measureE(): { rung, cost, reflexes: [{ name, hits, recovered }], best, recovered }. */
export function measureStatelessE() {
    const dives = hazardDives(), clean = mean(dives.map((d) => T.fly(AUTOPILOT, d.sc).score));
    return HAZARD_LADDER.map((L) => {
        const ap = mean(dives.map((d) => run(AUTOPILOT, d.sc, { disturb: hazardDisturbance(d, L.rung) }).score)), cost = clean - ap;
        const reflexes = REFLEXES.map((R) => { const rs = dives.map((d) => run(statelessReflex(AUTOPILOT, R), d.sc, { disturb: hazardDisturbance(d, L.rung) })); return { name: R.name, hits: rs.filter((r) => r.status === "hit").length, recovered: (mean(rs.map((r) => r.score)) - ap) / cost }; });
        const best = reflexes.reduce((a, b) => (b.recovered > a.recovered ? b : a));
        return { rung: L.rung, cost, reflexes, best: best.name, recovered: best.recovered };
    });
}

const f = (v, d = 4) => (Number.isFinite(v) ? v.toFixed(d) : "n/a");
if (typeof process !== "undefined" && Array.isArray(process.argv)) {
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
        const st = selfTestRunner();
        console.log(`self-test 1: run() with no disturbance reproduces subTask.fly() on ${st.n} scenarios: ${st.bad.length ? "NO, differs on " + st.bad.join(", ") : "yes (score, status and fingerprint)"}`);
        for (const [what, ok] of selfTestSigns()) console.log(`self-test sign: ${ok ? "ok  " : "FAIL"} ${what}`);
        if (st.bad.length) process.exit(1);
        const tt = selfTestTrigger();
        console.log(`self-test trigger (Addendum 3): (a) fires on none of the 10 cue-free nominal dives: ${tt.a ? "yes" : "NO"} (largest one-tick change of sideslip on them ${f(tt.maxQuietStep, 4)} rad, threshold ${REFLEX.rate}); (b) fires 1 to 2 ticks after the launch on all ${tt.n} hazard dives: ${tt.b ? "yes" : "NO"} (lags ${tt.lags[0]} to ${tt.lags[1]}); (c) reads the right side on all ${tt.n}: ${tt.c ? "yes" : "NO"}`);
        const P = measureP();
        console.log(`\n4b-P pitch-hold, the autopilot alone on the 40 TRAIN_SET dives; clean mean score ${f(P.clean)}; floor: cost >= ${COST_FLOOR}`);
        console.log("  rung  trim kN m  kick rad/s  cost(full)  trim only  kicks only  ended early");
        for (const r of P.rungs) console.log(`  ${r.rung}     ${f(PITCH_LADDER[r.rung].trimNm / 1000, 1).padStart(5)}      ${f(PITCH_LADDER[r.rung].kick, 2)}        ${f(r.cost)}     ${f(r.trimOnly)}     ${f(r.kicksOnly)}      ${r.early}`);
        console.log(P.chosen === null ? "  RESULT: no rung costs the autopilot 0.05 -> 4b-P is VOID" : `  RESULT: the task is rung ${P.chosen}`);
        if (!(tt.a && tt.b && tt.c)) { console.log("\n4b-E: the repair FAILED its conditions (Addendum 3) -> 4b-E is reported untestable with a sideslip-rate trigger and is not measured; the decision goes to Keith"); process.exit(2); }
        const E = measureE();
        const cs = cueSeparation();
        const cd = cueDuration(); console.log(`  (not a rule) the roll-rate cue lasts: |roll rate| > 0.15 rad/s on ${cd.min} to ${cd.max} ticks after the launch, the last at tick ${cd.lastTick} (30 ticks = 1 s)`);
        for (const r of measureStatelessE()) console.log(`  (not a rule) stateless roll-rate reflex, rung ${r.rung}: best ${r.best} recovers ${f(r.recovered, 2)}; hits ${r.reflexes.map((x) => `${x.name} ${x.hits}/40`).join("  ")}`);
        console.log("  (not a rule) what a stateless pilot can see of the cue, as levels: " + Object.entries(cs).map(([ch, v]) => `${ch}: cue-free max ${f(v.quietMax, 3)}, smallest cue peak ${f(v.cueMin, 3)}, ratio ${f(v.ratio, 2)}`).join("; "));
        console.log(`\n4b-E hazard, the autopilot and four reflexes on the 40 dives (10 nominal seeds x 2 sides x 2 launch times); clean mean score ${f(E.clean)}; rules: cost >= ${COST_FLOOR} and best reflex recovers >= ${RECOVER_FRACTION} of it`);
        console.log("  rung  T(s) R(m)  cost    autopilot hits  hits without the push   best reflex (recovered)   every reflex: hits / mean score");
        for (const r of E.rungs) console.log(`  ${r.rung}     ${HAZARD_LADDER[r.rung].flight}    ${HAZARD_LADDER[r.rung].reach}   ${f(r.cost)}      ${String(r.autopilotHits).padStart(2)}/40            ${String(r.noPushHits).padStart(2)}/40               ${r.best} (${f(r.recovered, 2)})${r.qualifies ? "  QUALIFIES" : ""}      ${r.reflexes.map((x) => `${x.name} ${x.hits}/${f(x.score, 3)}`).join("  ")}`);
        console.log(E.chosen === null ? "  RESULT: no rung qualifies -> 4b-E is VOID" : `  RESULT: the task is rung ${E.chosen}`);
        process.exit(0);
    }
}
