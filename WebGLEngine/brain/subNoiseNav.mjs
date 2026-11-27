// WebGLEngine/brain/subNoiseNav.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is "FOLLOW-UP 14" of brain/SUB_FIELD_NAV_WIP.md, written before this file; the study is
// tools/ship/subNoiseStudy.mjs; the gate is brain/subNoiseNav-selfcheck.mjs)
//
// THE ESTIMATE WITH NOISE. brain/subReactNav.mjs's estimating arm sees every ship's position exactly and estimates its velocity by a two-point difference over 3 s: the best case. Here a ship's position
// is OBSERVED once every OBS_S seconds with a Gaussian error of standard deviation sigma on each axis (deterministic: a seeded generator, no clock, no Math.random), and the planner's belief about a ship is
// one of: the nominal schedule, FOLLOW-UP 6's exact estimate (the ceiling), the naive two-point difference of the noisy observations, or a constant-velocity Kalman filter of them. The ships, their rules
// and their reactions to the vessel's TRUE position and velocity, the scenario, the plan, the field, the yield test and the vessel are brain/subReactNav.mjs's and brain/subHardNav.mjs's, CALLED, not
// copied. Only the flight loop is written out again, as subReactNav wrote its own against subHardNav's, because the BELIEF is what changes. OPTIMISTIC, said plainly: the noise is Gaussian, independent,
// the same for every ship, nothing is missed or mistaken for another ship, the vessel's own position is exact, and the filter is the simplest. No clock, no Math.random.
"use strict";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import * as ST from "./subTask.mjs";
import * as MT from "./missionTask.mjs";
import * as N from "./subFieldNav.mjs";
import * as H from "./subHardNav.mjs";
import * as R from "./subReactNav.mjs";

export const OBS_S = 1, SIGMA_A = R.STOP_ACCEL, V0 = 1, SIGMAS = Object.freeze([1.5, 3, 6]);
export const NOMINAL = "any+predict+edge+yield", EXACT = "est+predict+edge+yield", REFERENCE = "any+replan";
export const NOISE_ARMS = Object.freeze([REFERENCE, "replan@3", NOMINAL, EXACT, "diff@1.5", "diff@3", "diff@6", "kf@1.5", "kf@3", "kf@6"]), DESIGNATED = "kf@3";
export const HELD14 = Object.freeze(N.range(14001, 14060)), SETS = Object.freeze({ dev: H.HARD_SETS.dev, held14: HELD14 });
let MODEL = null;
const navModel = () => MODEL || (MODEL = S.createSubModel(Object.freeze({ ...S.EXPLORER, seabed: 1000 })));
const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

/** A standard normal draw, a pure function of (seed, ship, observation, axis): a seeded generator and a Box-Muller pair. */
export function gauss(seed, ship, obs, axis) {
    const h = (Math.imul(seed + 1, 2654435761) ^ Math.imul(ship + 1, 40503) ^ Math.imul(obs + 1, 2246822519) ^ Math.imul(axis + 1, 3266489917)) >>> 0, r = mulberry(h), u1 = 1 - r(), u2 = r();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
/** Observation `obs` of a ship at true position [x, y] with an error of standard deviation `sigma` on each axis. */
export const observe = (seed, ship, obs, [x, y], sigma) => [x + sigma * gauss(seed, ship, obs, 0), y + sigma * gauss(seed, ship, obs, 1)];

/** One axis of the constant-velocity Kalman filter. A state is { p, v, a, b, c } with the covariance [[a, b], [b, c]]. Starts from an observation `z` and a velocity `v0` with variance V0 squared. */
export const kfInit = (z, v0, sigma) => ({ p: z, v: v0, a: sigma * sigma, b: 0, c: V0 * V0 });
/** The prediction over `dt` with a white acceleration of standard deviation `sa`, then the update with observation `z` of variance sigma squared (floored at 1e-12: sigma 0 is the control). */
export function kfStep(f, z, dt, sa, sigma) {
    const q11 = sa * sa * dt, q01 = sa * sa * dt * dt / 2, q00 = sa * sa * dt * dt * dt / 3;
    const p = f.p + f.v * dt, a = f.a + 2 * dt * f.b + dt * dt * f.c + q00, b = f.b + dt * f.c + q01, c = f.c + q11;
    const S_ = a + Math.max(sigma * sigma, 1e-12), k0 = a / S_, k1 = b / S_, y = z - p;
    return { p: p + k0 * y, v: f.v + k1 * y, a: a - k0 * a, b: b - k0 * b, c: c - k1 * b };
}
/** The arm a name stands for: { kind ("replan", "nominal", "exact", "replan-noisy", "diff", "kf"), sigma }; `kf@3`, `diff@1.5` and `replan@3` take any sigma of 0 or more (0 is the control). Null when it is none of them. */
export function parseArm(name) {
    if (name === REFERENCE) return { kind: "replan", sigma: 0 };
    if (name === NOMINAL) return { kind: "nominal", sigma: 0 };
    if (name === EXACT) return { kind: "exact", sigma: 0 };
    const m = /^(kf|diff|replan)@(\d+(?:\.\d+)?)$/.exec(String(name));
    return m ? { kind: m[1] === "replan" ? "replan-noisy" : m[1], sigma: Number(m[2]) } : null;
}
const hardArm = (kind) => (kind === "replan" || kind === "replan-noisy" ? "any+replan" : NOMINAL);
/** The q-quantile of a list by the lower index: the sorted value at floor(q x (n - 1)); null for an empty list; the input is not reordered. */
export const quantile = (xs, q) => { if (!xs.length) return null; const a = xs.slice().sort((p, r) => p - r); return a[Math.min(a.length - 1, Math.floor(q * (a.length - 1)))]; };

/**
 * Fly one hard-traffic scenario with `pilot` under `armName` (NOISE_ARMS, or any `diff@s`, `kf@s`, `replan@s`) and a ship `behaviour` (subReactNav.BEHAVIOURS). Returns subReactNav.flyReact's record with
 * { sigma, kind, velErrMedian, velErrP90 } (the median and the 90th percentile of the velocity error of the belief against the ships' true velocity, sampled at every replan, in m/s; null for an arm with no velocity belief).
 */
export function flyNoise(pilot, sc, armName, behaviour, { seconds = H.SECONDS_HARD, dt = S.DT, model = navModel(), ladder = H.MARGIN_LADDER, yieldSpeed = H.YIELD_SPEED, horizon = H.HORIZON_S } = {}) {
    if (!R.BEHAVIOURS.includes(behaviour)) throw new Error(`subNoiseNav.flyNoise: unknown behaviour "${behaviour}" (${R.BEHAVIOURS.join(", ")})`);
    const A = parseArm(armName); if (!A) throw new Error(`subNoiseNav.flyNoise: unknown arm "${armName}" (${NOISE_ARMS.join(", ")})`);
    const { kind, sigma } = A, arm = hardArm(kind), spec = H.ARM_SPEC[arm], total = Math.round(seconds / dt), st = sc.start, every = Math.max(1, Math.round(H.REPLAN_S / dt)), obsTicks = Math.max(1, Math.round(OBS_S / dt));
    const mode = spec.replan === "predict" ? "predict" : "now", ships = sc.obstacles.map((o) => (o.type === "ship" ? R.shipStart(o) : null)), hist = sc.obstacles.map((o, k) => (ships[k] ? [[o.x, o.y]] : null));
    const closed = behaviour === "react-none", idx = new Map(sc.obstacles.map((o, k) => [o, k])), nDiff = Math.round(R.EST_S / OBS_S);
    // the trackers: every observation of every ship (observation 0 at the start), and the filter's two axes after the last one
    const trk = sc.obstacles.map((o, k) => (ships[k] ? { obs: [observe(sc.seed, k, 0, [o.x, o.y], sigma)], kf: null } : null));
    const kfOf = (k) => { const T = trk[k]; if (!T.kf) T.kf = [kfInit(T.obs[0][0], ships[k].nvx, sigma), kfInit(T.obs[0][1], ships[k].nvy, sigma)]; return T.kf; };
    if (kind === "kf") sc.obstacles.forEach((o, k) => { if (ships[k]) kfOf(k); });
    let now = 0, tick = 0;
    const actualAt = (o, tt) => (ships[idx.get(o)] && !closed ? (tt === now ? [ships[idx.get(o)].x, ships[idx.get(o)].y] : H.posAt(o, tt)) : H.posAt(o, tt));
    /** The velocity the belief holds for ship k now ([vx, vy]) or null when the arm holds none. */
    const velOf = (k) => {
        const sh = ships[k], T = trk[k];
        if (kind === "exact") return R.estimateVel(hist[k], tick, dt, [sh.nvx, sh.nvy]);
        if (kind === "diff") { const L = T.obs.length; return L > nDiff ? [(T.obs[L - 1][0] - T.obs[L - 1 - nDiff][0]) / R.EST_S, (T.obs[L - 1][1] - T.obs[L - 1 - nDiff][1]) / R.EST_S] : [sh.nvx, sh.nvy]; }
        if (kind === "kf") { const f = T.kf; return [f[0].v, f[1].v]; }
        return null;
    };
    const beliefAt = (o, tt) => {
        const k = idx.get(o);
        if (!ships[k]) return H.posAt(o, tt);
        if (kind === "replan") return actualAt(o, tt);
        if (kind === "nominal") return H.posAt(o, tt);
        const sh = ships[k], T = trk[k], L = T.obs.length, tObs = (L - 1) * OBS_S;
        if (kind === "exact") { const v = velOf(k); return [sh.x + v[0] * (tt - now), sh.y + v[1] * (tt - now)]; }
        if (kind === "replan-noisy") return T.obs[L - 1];
        if (kind === "diff") { const v = velOf(k); return [T.obs[L - 1][0] + v[0] * (tt - tObs), T.obs[L - 1][1] + v[1] * (tt - tObs)]; }
        const f = T.kf; return [f[0].p + f[0].v * (tt - tObs), f[1].p + f[1].v * (tt - tObs)];   // kf
    };
    const planAt = kind === "replan" ? actualAt : beliefAt;
    let field = spec.field ? H.buildLadderField(H.planShapes(sc, 0, { mode, blind: spec.blind, horizon }), sc.goal, st, { ladder, edgeExtra: spec.edge }) : null, replans = 0;
    const field0 = field, sc0 = field ? N.cellOf(field, st.x, st.y) : null, noRoute = field ? !(sc0 && field.dist[sc0.i] < N.BIG) : false, velErrs = [];
    let s = S.createState({ pos: [st.x, st.y, -st.depth], speed: st.speed, heading: st.heading, pitch: st.pitch, bank: st.bank, gamma: 0, w: [0, 0, 0], model });
    const clearAt = (x, y, depth, tt) => sc.obstacles.reduce((m, o) => Math.min(m, H.gapTo(o, x, y, depth, tt, actualAt)), Infinity);
    let status = "timeout", path = 0, minClear = clearAt(st.x, st.y, st.depth, 0), ticks = 0, t = null, hit = null;
    for (let i = 0; i < total; i++) {
        now = i * dt; tick = i;
        if (spec.replan !== "none" && i > 0 && i % every === 0) {
            sc.obstacles.forEach((o, k) => { if (ships[k]) { const v = velOf(k); if (v) velErrs.push(Math.hypot(v[0] - ships[k].vx, v[1] - ships[k].vy)); } });
            field = H.buildLadderField(H.planShapes(sc, now, { mode, blind: spec.blind, horizon, at: planAt }), sc.goal, { x: s.pos[0], y: s.pos[1] }, { ladder, own: { x: s.pos[0], y: s.pos[1] }, edgeExtra: spec.edge }); replans++;
        }
        const target = H.hardTarget(arm, s, field, sc.goal, { obstacles: sc.obstacles, t: now, at: planAt, minDepth: sc.minDepth, yieldSpeed }), cv = ST.currentAt(sc.current, now), cmd = pilot(s, target, cv), res = S.stepSub(model, s, cmd, dt, cv, sc.weightError);
        const px = s.pos[0], py = s.pos[1], vel = R.vesselVel(s), vessel = { x: px, y: py, vx: vel[0], vy: vel[1] };
        s = res.state; ticks++;
        if (!closed) sc.obstacles.forEach((o, k) => { if (ships[k]) { ships[k] = R.stepShip(ships[k], behaviour, o.r, vessel, dt); hist[k].push([ships[k].x, ships[k].y]); } });
        else sc.obstacles.forEach((o, k) => { if (ships[k]) { const q = H.posAt(o, (i + 1) * dt); ships[k] = { ...ships[k], x: q[0], y: q[1] }; hist[k].push(q); } });
        if ((i + 1) % obsTicks === 0) sc.obstacles.forEach((o, k) => {
            if (!ships[k]) return;
            const T = trk[k], j = T.obs.length, z = observe(sc.seed, k, j, [ships[k].x, ships[k].y], sigma);
            T.obs.push(z); if (kind === "kf") T.kf = [kfStep(kfOf(k)[0], z[0], OBS_S, SIGMA_A, sigma), kfStep(kfOf(k)[1], z[1], OBS_S, SIGMA_A, sigma)];
        });
        if (res.status !== "submerged") { status = res.status; break; }
        const x = s.pos[0], y = s.pos[1], nowT = (i + 1) * dt;
        path += Math.hypot(x - px, y - py);
        now = nowT;
        const clear = clearAt(x, y, -s.pos[2], nowT);
        if (clear < minClear) minClear = clear;
        if (clear < 0) { status = "collided"; hit = (sc.obstacles.find((o) => H.gapTo(o, x, y, -s.pos[2], nowT, actualAt) < 0) || {}).type || null; break; }
        if (x < N.REGION.x0 || x > N.REGION.x1 || y < N.REGION.y0 || y > N.REGION.y1) { status = "left"; break; }
        if (MT.reached(s, sc.goal)) { status = "reached"; t = nowT; break; }
    }
    return { arm: armName, behaviour, kind: sc.kind, seed: sc.seed, gap: sc.gapWidth, shipSpeed: sc.shipSpeed, currentMean: sc.currentMean, blocked: sc.blocked, status, hit, reached: status === "reached", t, path, chord: Math.hypot(sc.goal.x - st.x, sc.goal.y - st.y),
        minClearance: minClear, ticks, margin: field0 ? field0.margin : null, marginLast: field ? field.margin : null, noRoute, replans, sigma, filter: kind, velErrMedian: quantile(velErrs, 0.5), velErrP90: quantile(velErrs, 0.9) };
}
