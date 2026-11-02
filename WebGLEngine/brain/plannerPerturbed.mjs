// WebGLEngine/brain/plannerPerturbed.mjs -- UNNUMBERED (the version is chosen at ship time) (the gate is brain/plannerPerturbed-selfcheck.mjs)
//
// ROUND 13 of brain/NEEDS_AND_LIMITS.md (registered before this file existed): the Round 11 twin planner (brain/plannerSeat.mjs, mode twin) whose PLANNING model of the boat is wrong by a signed fraction in four ways, one or several at a time.
// The dive itself is flown on the true boat; only the twin's rollouts are wrong. `err` = { drag, drain, charge, start } (fractions, 0 = exact):
//   drag    the twin's frontal and side areas times 1+drag
//   drain   every rollout step in which the true model LOSES charge, the twin loses (1+drain) times as much (clamped to 0 .. capacity)
//   charge  every rollout step in which it GAINS charge, the twin gains (1+charge) times as much
//   start   the energy each rollout starts with (the seat's filtered charge times capacity) times 1+start, clamped to 0 .. capacity
// With every error zero this file's seat equals brain/plannerSeat.mjs's twin dive for dive (the identity the gate and the round's checks read). It keeps its own copy of the rollout and the plan because the Round 11 file is not edited.
// Pure apart from the clone and the simulation it runs: no clock, no Math.random, no file.
"use strict";
import * as T from "./needsTask.mjs";
import * as N from "../physics/mechanics/subNeeds.mjs";
import * as A from "./advisorChip.mjs";
import * as U from "./tunedRule.mjs";
import { orderedTuned, MAX_STATIONS, REPLAN_S } from "./plannerSeat.mjs";

export const KEYS = Object.freeze(["drag", "drain", "charge", "start"]);
export const NO_ERROR = Object.freeze({ drag: 0, drain: 0, charge: 0, start: 0 });
const hyp = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const perms = (a) => (a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p])));
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
/** `err` filled in with zeros; an unknown key or a non-finite value is an error (a typo must not read as "exact"). */
export function errOf(err = {}) {
    for (const k of Object.keys(err)) if (!KEYS.includes(k)) throw new Error(`plannerPerturbed.errOf: unknown error key ${JSON.stringify(k)} (${KEYS.join(", ")})`);
    const out = { ...NO_ERROR, ...err };
    for (const k of KEYS) if (!Number.isFinite(out[k]) || out[k] <= -1) throw new Error(`plannerPerturbed.errOf: ${k} must be a finite fraction above -1, got ${out[k]}`);
    return out;
}
/** The twin's wrong copy of the boat: the areas scaled. */
export const modelOf = (model, e) => (e.drag === 0 ? model : { ...model, frontalArea: model.frontalArea * (1 + e.drag), sideArea: model.sideArea * (1 + e.drag) });

/** Round 11's rollout (the predicted score of following `order` from `st0`/`nd0` at t0) with the twin's energy errors applied after each step. `e` = errOf(...). */
export function rollout(model0, st0, nd0, stations, t0, order, params, e, seconds = T.SECONDS) {
    const model = modelOf(model0, e), cap = N.CLASSES[T.CLASS].capacityJ;
    let st = structuredClone(st0), nd = { ...nd0 };
    const dt = T.DT, total = Math.round(seconds / dt), visited = stations.map((q) => !!q.visited), dmg0 = nd.damage;
    const feasibleNow = (q) => A.feasible(q, N.readings(model, nd0, st0)), feasibleCount = stations.filter(feasibleNow).length;
    const pilot = T.flyDecision(orderedTuned(params, order))({ model, read: () => N.readings(model, nd, st) });
    let status = "submerged";
    for (let i = Math.round(t0 / dt); i < total; i++) {
        const obs = { t: i * dt, stations: stations.map((q, k) => ({ x: q.x, y: q.y, depth: q.depth, visited: visited[k] })), r: N.readings(model, nd, st) };
        const cmd = pilot(st, obs, [0, 0, 0]) || {}, rr = N.stepNeeds(model, st, nd, cmd, dt, [0, 0, 0], 0, { pump: cmd.pump, repair: cmd.repair });
        const delta = rr.needs.energy - nd.energy;
        st = rr.state; nd = e.drain === 0 && e.charge === 0 ? rr.needs : { ...rr.needs, energy: clamp(nd.energy + delta * (1 + (delta < 0 ? e.drain : e.charge)), 0, cap) }; status = rr.status;
        if (status !== "submerged") break;
        for (let k = 0; k < stations.length; k++) { const q = stations[k]; if (!visited[k] && Math.hypot(st.pos[0] - q.x, st.pos[1] - q.y) <= T.CAPTURE.across && Math.abs(-st.pos[2] - q.depth) <= T.CAPTURE.depth) visited[k] = true; }
    }
    if (status === "crushed") return 0;
    const seen = stations.reduce((a, q, k) => a + (visited[k] && feasibleNow(q) ? 1 : 0), 0);
    const returned = status === "submerged" && -st.pos[2] < T.RETURN_DEPTH, hull = Math.max(0, Math.min(1, 1 - (nd.damage - dmg0) / 0.5));
    return 0.45 * (feasibleCount ? Math.min(1, seen / feasibleCount) : 1) + 0.45 * (returned ? 1 : 0) + 0.1 * hull;
}
/** The twin's plan under error `e`: { order, values } as plannerSeat.twinPlan. */
export function twinPlan(model, st, obs, ema, params, e, prefer = -1, seconds = T.SECONDS) {
    const open = obs.stations.map((q, k) => [q, k]).filter(([q]) => !q.visited && A.feasible(q, obs.r)), cap = N.CLASSES[T.CLASS].capacityJ;
    const nd0 = { ...N.initialNeeds(T.CLASS, { crushDepth: T.CRUSH }), energy: clamp(ema * (1 + e.start), 0, 1) * cap, damage: obs.r.damage, flood: obs.r.flood || 0 };
    const near = [...open].sort((a, b) => hyp(st.pos[0], st.pos[1], a[0].x, a[0].y) - hyp(st.pos[0], st.pos[1], b[0].x, b[0].y)).slice(0, MAX_STATIONS).map(([, k]) => k);
    const values = {}; let bestOrder = null;
    let bestV = rollout(model, st, nd0, obs.stations, obs.t, null, params, e, seconds) + (near[0] === prefer || prefer < 0 ? 1e-6 : 0); values.nearest = bestV;
    if (near.length >= 2) for (const o of perms(near)) {
        const raw = rollout(model, st, nd0, obs.stations, obs.t, o, params, e, seconds), v = raw + (o[0] === prefer ? 2e-6 : 0);
        values[o.join(">")] = raw; if (v > bestV + 1e-9) { bestV = v; bestOrder = o; }
    }
    return { order: bestOrder, values };
}
const nearestOf = (open, x, y) => { let best = null, bd = Infinity; for (const q of open) { const d = hyp(x, y, q.x, q.y); if (d < bd) { bd = d; best = q; } } return best; };

/** The seat: plannerSeat's twin with the errors `err` in its planning model. `plan` { replanS, seconds, horizon, onDive }: `onDive` (default off, Round 17) also replans on the tick the boat leaves the surface; `horizon` is the look-ahead in seconds RELATIVE to each plan's time (default unlimited; Round 14), `seconds` the absolute end. Carries `stats` { ticks, switches, plans, rolloutSeconds }: the rollout seconds SCHEDULED (the rollouts planned times the time each was asked to simulate; a rollout that ends early in a crush is counted in full). */
export function perturbedSeat(params, err = {}, plan = {}) {
    const q = U.normalise(params, U.WIDE_BOUNDS), p = { replanS: REPLAN_S, seconds: T.SECONDS, horizon: Infinity, onDive: false, ...plan }, e = errOf(err);
    return (ctx) => {
        let ema = null, current = -1, plan_ = null, lastPlanT = -Infinity, openKey = "", wasAtSurface = false;
        const stats = { ticks: 0, switches: 0, plans: 0, rolloutSeconds: 0 };
        const seat = (st, obs) => {
            ema = ema === null ? obs.r.frac : ema + q.alpha * (obs.r.frac - ema);
            const r = obs.r, atSurface = -st.pos[2] < T.RETURN_DEPTH, leftSurface = wasAtSurface && !atSurface;
            wasAtSurface = atSurface;
            const pump = r.flood > 0.001 && ema > 0.1, repair = atSurface && r.damage > 0 && ema > 0.1;
            const open = obs.stations.filter((s) => !s.visited && A.feasible(s, r));
            let station = null;
            if (open.length) {
                const next = (pl) => (pl && pl.order ? pl.order.map((i) => obs.stations[i]).find((s2) => s2 && !s2.visited && A.feasible(s2, r)) : null);
                const key = open.map((s2) => obs.stations.indexOf(s2)).join(",");
                if (!plan_ || obs.t - lastPlanT >= p.replanS || (plan_.order && !next(plan_)) || key !== openKey || (p.onDive && leftSurface)) {
                    const keep = next(plan_);
                    const end = Math.min(p.seconds, obs.t + p.horizon);
                    plan_ = twinPlan(ctx.model, st, obs, ema, q, e, keep ? obs.stations.indexOf(keep) : -1, end); lastPlanT = obs.t; openKey = key; stats.plans++;
                    stats.rolloutSeconds += Object.keys(plan_.values).length * Math.max(0, end - obs.t);
                }
                station = next(plan_) || nearestOf(open, st.pos[0], st.pos[1]);
            }
            const now = station ? obs.stations.indexOf(station) : -1;
            stats.ticks++; if (now !== current) { if (current >= 0 && now >= 0) stats.switches++; current = now; }
            const surface = T.lastCall(obs) || !station || ema < U.thresholdAt(q, r.depth);
            return { surface, station, cap: q.cap, pump, repair };
        };
        Object.defineProperty(seat, "stats", { get: () => stats });
        return seat;
    };
}
