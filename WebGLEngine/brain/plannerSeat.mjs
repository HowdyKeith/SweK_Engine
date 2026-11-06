// WebGLEngine/brain/plannerSeat.mjs -- UNNUMBERED (the version is chosen at ship time) (the gate is brain/plannerSeat-selfcheck.mjs)
//
// ROUND 11 of brain/NEEDS_AND_LIMITS.md (registered before this file existed, amended before any audit seed was read): the tuned rule (brain/tunedRule.mjs: filter, trip, cap, pump, repair, unchanged) with the NEXT STATION chosen by a PLANNER.
//   nearest   exactly needsTask.nearestFeasible's choice: the seat is then the tuned rule dive for dive (the identity)
//   twin      every visiting order of the open feasible stations (the four nearest at most) is tried on a COPY OF THE BOAT'S OWN SIMULATION from its present state (needsTask.fly's loop restarted from a clone, no gauge noise), nearest-first's own
//             rollout included; the order whose predicted score is best is followed; replanned every REPLAN_S seconds and whenever the set of open stations changes or the planned stations are gone; ties keep the planned next station, then nearest-first.
// THE TWIN ASSUMES A PERFECT SIMULATOR OF THE BOAT: it measures what planning is worth given a perfect model, not what a real boat could do. The filtered charge (the seat's only view of the gauge) seeds the rollout's energy; damage and flooding are read from the observation.
// Pure apart from the clone and the simulation it runs: no clock, no Math.random, no file.
"use strict";
import * as T from "./needsTask.mjs";
import * as N from "../physics/mechanics/subNeeds.mjs";
import * as A from "./advisorChip.mjs";
import * as U from "./tunedRule.mjs";

export const MODES = Object.freeze(["nearest", "twin"]);
export const MAX_STATIONS = 4, REPLAN_S = 120;
const hyp = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const perms = (a) => (a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p])));

/** The tuned rule with its next station forced to the first still-open feasible station of `order` (indices into obs.stations); unchanged when the order is exhausted or null (nearest-first). */
export function orderedTuned(params, order) {
    const base = U.tunedSeat(params, U.WIDE_BOUNDS);
    return (ctx) => { const s = base(ctx); return (st, obs) => { const d = s(st, obs); if (!d.station || !order) return d; const pick = order.map((i) => obs.stations[i]).find((q) => q && !q.visited && A.feasible(q, obs.r)); return pick ? { ...d, station: pick } : d; }; };
}
/**
 * The predicted score of following `order` (null = nearest-first) from the state `st0` / needs `nd0` at time t0 to `seconds` (default the run's end): the survey run's own loop restarted from a copy, no gauge noise. The value is
 * 0.45 x (feasible stations seen / feasible stations) + 0.45 x (returned) + 0.1 x hull, 0 if crushed -- needsTask.scoreOf with the planner's own count of reachable stations.
 */
export function rollout(model, st0, nd0, stations, t0, order, params, seconds = T.SECONDS) {
    let st = structuredClone(st0), nd = { ...nd0 };
    const dt = T.DT, total = Math.round(seconds / dt), visited = stations.map((q) => !!q.visited), dmg0 = nd.damage;
    const feasibleNow = (q) => A.feasible(q, N.readings(model, nd0, st0)), feasibleCount = stations.filter(feasibleNow).length;
    const pilot = T.flyDecision(orderedTuned(params, order))({ model, read: () => N.readings(model, nd, st) });
    let status = "submerged";
    for (let i = Math.round(t0 / dt); i < total; i++) {
        const obs = { t: i * dt, stations: stations.map((q, k) => ({ x: q.x, y: q.y, depth: q.depth, visited: visited[k] })), r: N.readings(model, nd, st) };
        const cmd = pilot(st, obs, [0, 0, 0]) || {}, rr = N.stepNeeds(model, st, nd, cmd, dt, [0, 0, 0], 0, { pump: cmd.pump, repair: cmd.repair });
        st = rr.state; nd = rr.needs; status = rr.status;
        if (status !== "submerged") break;
        for (let k = 0; k < stations.length; k++) { const q = stations[k]; if (!visited[k] && Math.hypot(st.pos[0] - q.x, st.pos[1] - q.y) <= T.CAPTURE.across && Math.abs(-st.pos[2] - q.depth) <= T.CAPTURE.depth) visited[k] = true; }
    }
    if (status === "crushed") return 0;
    const seen = stations.reduce((a, q, k) => a + (visited[k] && feasibleNow(q) ? 1 : 0), 0);
    const returned = status === "submerged" && -st.pos[2] < T.RETURN_DEPTH, hull = Math.max(0, Math.min(1, 1 - (nd.damage - dmg0) / 0.5));
    return 0.45 * (feasibleCount ? Math.min(1, seen / feasibleCount) : 1) + 0.45 * (returned ? 1 : 0) + 0.1 * hull;
}
/** The twin's plan: { order (indices into obs.stations, or null for nearest-first), values: { label: predicted score } }. `prefer` is the planned next station (an index) or -1: it wins ties, then nearest-first does. */
export function twinPlan(model, st, obs, ema, params, prefer = -1, seconds = T.SECONDS) {
    const open = obs.stations.map((q, k) => [q, k]).filter(([q]) => !q.visited && A.feasible(q, obs.r));
    const nd0 = { ...N.initialNeeds(T.CLASS, { crushDepth: T.CRUSH }), energy: ema * N.CLASSES[T.CLASS].capacityJ, damage: obs.r.damage, flood: obs.r.flood || 0 };
    const near = [...open].sort((a, b) => hyp(st.pos[0], st.pos[1], a[0].x, a[0].y) - hyp(st.pos[0], st.pos[1], b[0].x, b[0].y)).slice(0, MAX_STATIONS).map(([, k]) => k);
    const values = {}; let bestOrder = null;
    let bestV = rollout(model, st, nd0, obs.stations, obs.t, null, params, seconds) + (near[0] === prefer || prefer < 0 ? 1e-6 : 0); values.nearest = bestV;
    if (near.length >= 2) for (const o of perms(near)) {
        const raw = rollout(model, st, nd0, obs.stations, obs.t, o, params, seconds), v = raw + (o[0] === prefer ? 2e-6 : 0);
        values[o.join(">")] = raw; if (v > bestV + 1e-9) { bestV = v; bestOrder = o; }
    }
    return { order: bestOrder, values };
}

const nearestOf = (open, x, y) => { let best = null, bd = Infinity; for (const q of open) { const d = hyp(x, y, q.x, q.y); if (d < bd) { bd = d; best = q; } } return best; };

/** The seat. `params` the tuned rule's parameters; `plan` { mode, replanS, seconds } (defaults: nearest, REPLAN_S, the run's end). Carries `stats` { ticks, switches, plans }. */
export function plannerSeat(params, plan = {}) {
    const q = U.normalise(params, U.WIDE_BOUNDS), p = { mode: "nearest", replanS: REPLAN_S, seconds: T.SECONDS, ...plan };
    if (!MODES.includes(p.mode)) throw new Error(`plannerSeat: mode ${JSON.stringify(p.mode)} (${MODES.join(", ")})`);
    return (ctx) => {
        let ema = null, current = -1, plan_ = null, lastPlanT = -Infinity, openKey = "";
        const stats = { ticks: 0, switches: 0, plans: 0 };
        const seat = (st, obs) => {
            ema = ema === null ? obs.r.frac : ema + q.alpha * (obs.r.frac - ema);
            const r = obs.r, atSurface = -st.pos[2] < T.RETURN_DEPTH;
            const pump = r.flood > 0.001 && ema > 0.1, repair = atSurface && r.damage > 0 && ema > 0.1;
            const open = obs.stations.filter((s) => !s.visited && A.feasible(s, r));
            let station = null;
            if (open.length) {
                const next = (pl) => (pl && pl.order ? pl.order.map((i) => obs.stations[i]).find((s2) => s2 && !s2.visited && A.feasible(s2, r)) : null);
                if (p.mode === "twin") {
                    const key = open.map((s2) => obs.stations.indexOf(s2)).join(",");
                    if (!plan_ || obs.t - lastPlanT >= p.replanS || (plan_.order && !next(plan_)) || key !== openKey) {
                        const keep = next(plan_);
                        plan_ = twinPlan(ctx.model, st, obs, ema, q, keep ? obs.stations.indexOf(keep) : -1, p.seconds); lastPlanT = obs.t; openKey = key; stats.plans++;
                    }
                    station = next(plan_) || nearestOf(open, st.pos[0], st.pos[1]);
                } else station = nearestOf(open, st.pos[0], st.pos[1]);
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
