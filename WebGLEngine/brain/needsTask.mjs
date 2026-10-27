// WebGLEngine/brain/needsTask.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE SURVEY RUN: piece 3 of Keith's needs-and-limits idea (brain/NEEDS_AND_LIMITS.md "Round 2", the task, its audits, its controls and its pass/fail were written there BEFORE this file). A tank-scale battery boat with a hull that may
// already be damaged must visit three survey stations, in ANY order, within 600 s. A station is visited when the centre is within 8 m of it across and 4 m of its depth. The two needs pull against the job: the stations are far (the charge),
// some are deep enough to strain this hull (its life), a damaged hull collapses shallower than a sound one, and the only refill is the surface. NO PILOT IS LEARNED HERE: the baselines are rules, and the gate (needsTask-selfcheck.mjs) shows the
// job can tell them apart BEFORE a stateful pilot (piece 4) exists.
//
// THE VESSEL is the EXPLORER with the flood vessel's ballast tank (pump, air, emergency blow, drop weight), a sea floor out of the way (400 m) and needs of class battery with a TANK-SCALE crush depth of 60 m (subNeeds.mjs).
// A PILOT is a FACTORY: (ctx) -> pilot(state, obs, current) -> controls, where ctx = { model, read() } (read gives subNeeds.readings() NOW) and obs = { t, stations: [{ x, y, depth, visited }], r (the readings) }. The controls are the
// four numbers plus the optional `pump` and `repair` (0..1) that subNeeds.stepNeeds takes as aux. A pilot is not told which stations are out of its reach, nor the leak: it reads the hull from `r`.
// THE SCORE: 0.45 x visited / reachable + 0.45 x returned + 0.1 x hull, in [0, 1]; a CRUSHED boat scores 0. `reachable` = the stations not marked `unreachable` (deeper than the damaged hull's collapse depth can take, less the capture allowance);
// `returned` = alive and centre under 3 m at the end; `hull` = 1 - (damage at the end - damage at the start) / 0.5, clamped (damage the run caused is what is charged; damage repaired is credited).
// Pure: no DOM, no clock, no Math.random.
"use strict";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import * as N from "../physics/mechanics/subNeeds.mjs";
import * as AS from "./autopilotSub.mjs";
import * as SP from "./surfacePilot.mjs";
import * as NP from "./needsPilot.mjs";
import { FLOOD_SPEC } from "./floodTask.mjs";

// the refill trip for a TIMED job: needsPilot's defaults (surface under 30%, back over 90%) spend the 600 s on the charge -- 6 kW fills 3 MJ in 500 s -- so the job's trip turns back at 60%
export const TRIP_AT = Object.freeze({ low: 0.3, high: 0.6 });
export const DT = S.DT, SECONDS = 600, CAPTURE = Object.freeze({ across: 8, depth: 4 }), STATIONS = 3, CRUSH = 60, CLASS = "battery", RETURN_DEPTH = 3, SPEED = 2.5;
// the deepest a pilot that cares about the hull goes: strain 0.9 of the CURRENT collapse depth (over the 0.8 yield line, where a brief visit costs about 1% of the hull a second and is repaired at the surface; the crush is at 1.0)
export const HULL_DEPTH = 0.9;
// how fast the surfacing pilot actually climbs (measured: about 0.5 m/s from 12 m, 0.45 from 40 m) and the slack it is given: the pilot that goes up for the end of the run leaves in time to arrive
export const RISE_RATE = 0.4, RISE_MARGIN = 20;
export const KINDS = Object.freeze(["plain", "deep", "far", "both"]);
// the bottle is six levels, not the flood vessel's 1.5: ONE blow to the surface spends most of 1.5 and nothing refills it (no compressor is modelled), so a job with a refill trip in it would end at the first surfacing for want of air
export const SPEC = Object.freeze({ ...FLOOD_SPEC, name: "explorer-survey", seabed: 400, airMax: 6 });
let MODEL = null;
export const model = () => MODEL || (MODEL = S.createSubModel(SPEC));

const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** A scenario: { seed, kind, depth0, damage0, frac0, stations: [{ x, y, depth, unreachable }] } -- frozen; a kind and a seed always make the same one. */
export function scenario(seed, kind = "plain") {
    if (!KINDS.includes(kind)) throw new Error(`needsTask.scenario: unknown kind "${kind}" (${KINDS.join(", ")})`);
    const r = mulberry((seed * 7919 + KINDS.indexOf(kind) * 104729 + 211) >>> 0), u = (lo, hi) => lo + (hi - lo) * r();
    const deepKind = kind === "deep" || kind === "both", farKind = kind === "far" || kind === "both";
    const damage0 = deepKind ? u(0.2, 0.5) : 0, frac0 = kind === "plain" ? 1 : kind === "deep" ? u(0.7, 1) : kind === "far" ? u(0.4, 0.65) : u(0.45, 0.7);
    const stations = [], a0 = u(0, 6.28);
    for (let i = 0; i < STATIONS; i++) {
        const ang = a0 + i * 2.1 + u(-0.4, 0.4), rad = farKind ? u(120, 200) : u(40, 90);
        const cd = N.collapseDepth(model(), damage0, CRUSH), d0 = deepKind ? u(0.5, 0.9) * CRUSH : u(10, 30), depth = i === 0 ? Math.min(d0, 0.85 * cd + CAPTURE.depth - 1) : d0;   // the first station is always within reach
        stations.push(Object.freeze({ x: rad * Math.cos(ang), y: -rad * Math.sin(ang), depth, unreachable: depth - CAPTURE.depth > HULL_DEPTH * cd }));
    }
    return Object.freeze({ seed, kind, depth0: u(10, 20), damage0, frac0, stations: Object.freeze(stations) });
}

// THE NOISY GAUGE (piece 4, registered after a measurement: with a clean gauge a stateless rule from the charge and the depth scores exactly what the hysteresis rule does, so the job needs no internal state): the charge reading a pilot is handed is the true fraction plus
// seeded gaussian noise of standard deviation `sd`, refreshed `hz` times a second and held between refreshes, clipped to [0, 1]. The simulation, the score and the other readings are untouched. A pilot that averages the gauge over time (a filter, a leaky memory) reads the charge; one that
// acts on the sample chatters at its thresholds.
export const GAUGE = Object.freeze({ sd: 0.1, hz: 1 });
const gaussOf = (r) => { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
export function gaugeOf(sc, { sd = GAUGE.sd, hz = GAUGE.hz } = {}, dt = DT) {
    const rng = mulberry((sc.seed * 15485863 + KINDS.indexOf(sc.kind) * 32452843 + 977) >>> 0), every = Math.max(1, Math.round(1 / (hz * dt)));
    let held = null;
    return (i, frac) => { if (held === null || i % every === 0) held = clamp(frac + sd * gaussOf(rng), 0, 1); return held; };
}

/** The score of a run from its parts (see the header): a crushed boat is 0; otherwise 0.45 x the reachable stations visited + 0.45 x returned + 0.1 x hull, in [0, 1]. */
export const scoreOf = ({ seen, reachable, returned, hull, crushed }) => (crushed ? 0 : clamp(0.45 * (reachable ? seen / reachable : 1) + 0.45 * (returned ? 1 : 0) + 0.1 * hull, 0, 1));

/**
 * Fly one survey run with `factory` (ctx) -> pilot. Returns { score, visited, reachable, returned, hull, status ("submerged" | "crushed" | "grounded" | "broached" | "lost"), crushed, stranded (alive, no charge, and not returned),
 * energyEnd (fraction), damage0, damageEnd, exposedS, minEnergy (fraction), maxStrain, tEnd, fingerprint }. Deterministic.
 */
export function fly(factory, sc, { seconds = SECONDS, dt = DT, m = model(), onTick = null, gauge = null } = {}) {
    let st = { ...S.createState({ depth: sc.depth0, speed: 2, model: m }), tank: S.initialTank(m) };
    let nd = { ...N.initialNeeds(CLASS, { crushDepth: CRUSH }), energy: sc.frac0 * N.CLASSES[CLASS].capacityJ, damage: sc.damage0 };
    const read = () => N.readings(m, nd, st), visited = sc.stations.map(() => false), total = Math.round(seconds / dt);
    const pilot = factory({ model: m, read }), gaugeFn = gauge ? gaugeOf(sc, gauge, dt) : null;
    let status = "submerged", minE = nd.energy / N.CLASSES[CLASS].capacityJ, maxStrain = 0, tEnd = seconds, h = 0x811c9dc5;
    for (let i = 0; i < total; i++) {
        const t = i * dt, rr0 = read(), obs = { t, stations: sc.stations.map((q, k) => ({ x: q.x, y: q.y, depth: q.depth, visited: visited[k] })), r: gaugeFn ? { ...rr0, frac: gaugeFn(i, rr0.frac) } : rr0 };
        const cmd = pilot(st, obs, [0, 0, 0]) || {}, rr = N.stepNeeds(m, st, nd, cmd, dt, [0, 0, 0], 0, { pump: cmd.pump, repair: cmd.repair });
        st = rr.state; nd = rr.needs; status = rr.status;
        if (onTick) onTick(t, st, nd, cmd, visited);
        if (rr.status !== "submerged") { tEnd = t; break; }
        const fr = nd.energy / N.CLASSES[CLASS].capacityJ; if (fr < minE) minE = fr;
        const sr = N.strainOf(m, -st.pos[2], nd.damage, CRUSH); if (sr > maxStrain) maxStrain = sr;
        for (let k = 0; k < sc.stations.length; k++) { const q = sc.stations[k]; if (!visited[k] && Math.hypot(st.pos[0] - q.x, st.pos[1] - q.y) <= CAPTURE.across && Math.abs(-st.pos[2] - q.depth) <= CAPTURE.depth) visited[k] = true; }
        if (i % 30 === 0) { h = Math.imul(h ^ (Math.round(st.pos[0] * 100) | 0), 16777619) >>> 0; h = Math.imul(h ^ (Math.round(st.pos[1] * 100) | 0), 16777619) >>> 0; h = Math.imul(h ^ (Math.round(nd.energy) | 0), 16777619) >>> 0; }
    }
    const crushed = status === "crushed", reachable = sc.stations.filter((q) => !q.unreachable).length, seen = sc.stations.reduce((a, q, k) => a + (visited[k] && !q.unreachable ? 1 : 0), 0);
    const returned = !crushed && status === "submerged" && -st.pos[2] < RETURN_DEPTH, hull = clamp(1 - (nd.damage - sc.damage0) / 0.5, 0, 1);
    const score = scoreOf({ seen, reachable, returned, hull, crushed });
    const energyEnd = nd.energy / N.CLASSES[CLASS].capacityJ;
    return { score, visited: seen, reachable, returned, hull, status, crushed, stranded: !crushed && status === "submerged" && energyEnd <= 0 && !returned, energyEnd, damage0: sc.damage0, damageEnd: nd.damage, exposedS: nd.exposedS || 0, minEnergy: minE, maxStrain, tEnd, fingerprint: h.toString(16) };
}

// ---- the baseline pilots ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const headingTo = (st, q) => Math.atan2(-(q.y - st.pos[1]), q.x - st.pos[0]);
const distTo = (st, q) => Math.hypot(q.x - st.pos[0], q.y - st.pos[1]);
const base = (ctx) => SP.wrap(AS.pilot({ model: ctx.model }), { model: ctx.model });

/** SPIN: the control. Goes to the surface and stays there, working the pump while there is flood and the repair at the surface: the SAFE HARBOUR, which never does the job. (A damaged hull leaks from the first second, so a boat that does not pump sinks; the control must not die of that.) */
export const SPIN = (ctx) => { const p = base(ctx); return (st, obs, cur) => ({ ...p(st, { depth: 0, heading: 0, speed: SPEED, surface: true }, cur), pump: obs.r.flood > 0.001 && obs.r.frac > 0.05 ? 1 : 0, repair: -st.pos[2] < RETURN_DEPTH && obs.r.damage > 0 ? 1 : 0 }); };

// the part DIRECT, TRIP and GUARDED share: which station, what target. `pick(st, obs, ctx)` returns the station or null (then it surfaces).
function station(pick, depthCap) {
    return (ctx) => {
        const p = base(ctx);
        return (st, obs, cur) => {
            const q = pick(st, obs, ctx), r = obs.r;
            if (!q) return p(st, { depth: 0, heading: 0, speed: SPEED, surface: true }, cur);
            const cap = depthCap ? depthCap(r) : Infinity;
            return p(st, { depth: Math.min(q.depth, cap), heading: headingTo(st, q), speed: SPEED }, cur);
        };
    };
}
/** DIRECT: the stations in the order listed, as stated, ignoring the charge and the hull. */
export const DIRECT = station((st, obs) => obs.stations.find((q) => !q.visited) || null, null);
/** TRIP: DIRECT inside the refill trip (needsPilot): surface under 30% of the charge, back to the task over 90%. Blind to the hull. */
export const TRIP = (ctx) => {
    const inner = DIRECT(ctx);
    // the trip hands the target through needsPilot.wrap, whose inner is (state, target, current): the station is chosen here, the surface flag by the trip
    let obsNow = null; const task = (st, target, cur) => inner(st, { ...obsNow, surfaceNow: !!target.surface }, cur);
    const trip = NP.wrap((st, target, cur) => (target.surface ? base(ctx)(st, target, cur) : inner(st, obsNow, cur)), { read: ctx.read, ...TRIP_AT });
    return (st, obs, cur) => { obsNow = obs; return trip(st, { depth: 0, heading: 0, speed: SPEED }, cur); };
};
// ---- the SEAT interface (piece 4): a seat decides, the autopilot flies -------------------------------------------------------------------------------------------------------------------------------------------
// A SEAT is (ctx) -> seat(st, obs) -> a DECISION { surface: bool (go up and stay up), station: the { x, y, depth, visited } to go to, or null, cap: the deepest the boat may go as a fraction of the CURRENT collapse depth, pump: bool, repair: bool }. `flyDecision` turns a
// decision into the four controls plus pump and repair with the same autopilot and surfacing wrapper every rule pilot uses, so a rule, a circuit, or any other model sitting in the seat is flown identically and the score measures its DECISIONS.
const feasibleAt = (q, r) => q.depth - CAPTURE.depth + 0.5 <= HULL_DEPTH * r.collapseDepth;
/** The nearest feasible unvisited station, or null. */
export function nearestFeasible(st, obs) { let best = null, bd = Infinity; for (const q of obs.stations) { if (q.visited || !feasibleAt(q, obs.r)) continue; const d = distTo(st, q); if (d < bd) { bd = d; best = q; } } return best; }
/** Has the run reached the point where the boat must be on its way up to be home at the end (the fixed last call: RISE_RATE and RISE_MARGIN, not learnable)? */
export const lastCall = (obs) => obs.t >= SECONDS - RISE_MARGIN - obs.r.depth / RISE_RATE;

/** The pilot a seat makes: (ctx) -> (st, obs, current) -> controls. The decision of the last tick is on `pilot.decision`. */
export function flyDecision(seatOf) {
    return (ctx) => {
        const seat = seatOf(ctx), up = base(ctx), flyTo = base(ctx);
        let decision = null;
        const pilot = (st, obs, cur) => {
            const d = seat(st, obs); decision = d;
            const r = obs.r, atSurface = -st.pos[2] < RETURN_DEPTH;
            let c;
            if (d.surface || !d.station) c = up(st, { depth: 0, heading: 0, speed: SPEED, surface: true }, cur);
            else c = flyTo(st, { depth: Math.min(d.station.depth, d.cap * r.collapseDepth), heading: headingTo(st, d.station), speed: SPEED }, cur);
            return { ...c, pump: d.pump ? 1 : 0, repair: d.repair ? 1 : 0 };
        };
        Object.defineProperty(pilot, "decision", { get: () => decision });
        return pilot;
    };
}

/** The rule seats. `trip`: "hyst" (surface under TRIP_AT.low, back over TRIP_AT.high: GUARDED), "single" (one threshold, TRIP_1T.low: GUARDED-1T, the start point of piece 4), "obs" (a stateless rule from the observations, the surfacing charge a function of the depth alone, obsThreshold: GUARDED-OBS), "obs0" (its first, crude form: under 0.3, or at the surface (under 3 m) while under 0.6: GUARDED-OBS0), "none" (never: HULLONLY). */
export const TRIP_1T = Object.freeze({ low: 0.45, high: 0.4500001 }), OBS_RULE = Object.freeze({ low: 0.3, high: 0.6, ramp: 6 });
/** The stateless rule from the observations: the charge fraction under which the boat surfaces, as a function of its depth ALONE -- OBS_RULE.high at the surface falling linearly to OBS_RULE.low at OBS_RULE.ramp metres and below -- so that the depth, which the world keeps, carries the hysteresis (stay up while charging, do not turn back on the first metres of the dive). */
export const obsThreshold = (depth) => OBS_RULE.low + (OBS_RULE.high - OBS_RULE.low) * Math.max(0, Math.min(1, 1 - depth / OBS_RULE.ramp));
export function ruleSeat(trip, { alpha = null } = {}) {
    return (ctx) => {
        let refilling = false, ema = null;
        return (st, obs) => {
            // a filtered gauge: the charge fraction the rule acts on is an exponential average of the readings (per tick), the one piece of memory a noisy gauge asks for
            if (alpha !== null) { ema = ema === null ? obs.r.frac : ema + alpha * (obs.r.frac - ema); obs = { ...obs, r: { ...obs.r, frac: ema } }; }
            const r = obs.r, station = nearestFeasible(st, obs), atSurface = -st.pos[2] < RETURN_DEPTH;
            const pump = r.flood > 0.001 && r.frac > 0.1, repair = atSurface && r.damage > 0 && r.frac > 0.1;
            let surface = lastCall(obs) || !station;
            if (!surface) {
                if (trip === "hyst" || trip === "single") {
                    const t = trip === "hyst" ? TRIP_AT : TRIP_1T;
                    if (!refilling && r.frac < t.low) refilling = true; else if (refilling && r.frac >= t.high) refilling = false;
                    surface = refilling;
                } else if (trip === "obs0") surface = r.frac < OBS_RULE.low || (r.depth < RETURN_DEPTH && r.frac < OBS_RULE.high);
                else if (trip === "obs") surface = r.frac < obsThreshold(r.depth);
            }
            return { surface, station, cap: HULL_DEPTH, pump, repair };
        };
    };
}
/** The hull rule alone (no trip), the hull rule inside the hysteresis trip (the best rule written for the job), and the two reference rules of piece 4. */
export const HULLONLY = flyDecision(ruleSeat("none")), GUARDED = flyDecision(ruleSeat("hyst")), GUARDED_1T = flyDecision(ruleSeat("single")), GUARDED_OBS = flyDecision(ruleSeat("obs")), GUARDED_OBS0 = flyDecision(ruleSeat("obs0"));
/** The stateless rule behind a filter: GUARDED-OBS acting on an exponential average of the gauge (alpha per tick). The reference for a task with a noisy gauge. */
export const FILTER_ALPHA = 0.005;
export const GUARDED_FILTER = flyDecision(ruleSeat("obs", { alpha: FILTER_ALPHA }));
export const REFERENCES = Object.freeze({ GUARDED_1T, GUARDED_OBS, GUARDED_OBS0, GUARDED_FILTER });
export const PILOTS = Object.freeze({ SPIN, DIRECT, TRIP, HULLONLY, GUARDED });

// ---- the sets: disjoint seeds, four kinds ------------------------------------------------------------------------------------------------------------------------------------------------------------------
const mk = (a, b) => Object.freeze(KINDS.flatMap((k) => Array.from({ length: b - a + 1 }, (_, i) => scenario(a + i, k))));
export const TRAIN_SET = mk(1, 10), HELD_OUT_SET = mk(11, 20), AUDIT_SET = mk(51, 62), BASELINE_SET = mk(501, 508);
// piece 4 (brain/NEEDS_AND_LIMITS.md "Round 3", registered before these were used): the training subset, the safety pool and the two further audits. AUDIT_SET, AUDIT2_SET and RESERVE_SET are READ ONCE, for the champions.
export const TRAIN_SMALL_SET = mk(1, 4), POOL_SET = mk(21, 32), AUDIT2_SET = mk(71, 82), RESERVE_SET = mk(91, 102);   // AUDIT_SET: NOT READ by anything yet -- it is piece 4's

/** Paired comparison of two evaluate() results over the SAME set: { diff (mean of a - b), se (standard error of the paired difference), n }. */
export function paired(a, b) {
    if (a.runs.length !== b.runs.length) throw new Error("needsTask.paired: results over sets of different sizes");
    const d = a.runs.map((x, i) => x.score - b.runs[i].score), n = d.length, m = d.reduce((x, y) => x + y, 0) / n, v = n > 1 ? d.reduce((x, y) => x + (y - m) * (y - m), 0) / (n - 1) : 0;
    return { diff: m, se: Math.sqrt(v / n), n };
}
/** The scenarios of the given kinds for seeds a..b. */
export const setOf = (kinds, a, b) => Object.freeze(kinds.flatMap((k) => Array.from({ length: b - a + 1 }, (_, i) => scenario(a + i, k))));

/** `factory` over a set: { score (mean), runs, crashed, stranded, byKind: { kind: { score, crushed, stranded, visited } } }. */
export function evaluate(factory, set, opts = {}) {
    const runs = set.map((sc) => ({ kind: sc.kind, ...fly(factory, sc, opts) })), n = runs.length, byKind = {};
    for (const k of KINDS) { const rs = runs.filter((x) => x.kind === k); if (rs.length) byKind[k] = { n: rs.length, score: rs.reduce((a, x) => a + x.score, 0) / rs.length, crushed: rs.filter((x) => x.crushed).length, stranded: rs.filter((x) => x.stranded).length, visited: rs.reduce((a, x) => a + x.visited, 0) / rs.length }; }
    return { score: runs.reduce((a, x) => a + x.score, 0) / n, runs, crashed: runs.filter((x) => x.crushed).length, stranded: runs.filter((x) => x.stranded).length, byKind };
}
