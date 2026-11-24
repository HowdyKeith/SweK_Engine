// WebGLEngine/brain/learnedCourier.mjs -- UNNUMBERED (the version is chosen at ship time; registered in brain/SUB_STATIONS_WIP.md section 27, round 11, before this file; the gate is brain/learnedCourier-selfcheck.mjs)
//
// ROUND 11 OF THE SUBMARINE STATIONS: a LEARNED captain on round 7's breached courier (brain/breachCourierTask.mjs), a task that scores the mission (deliveries) as well as survival. The helm, the damage station, and two logistic
// units -- SURFACE (claim the surface) and DROP (release the weight) -- over ten features a captain can sense, among them the next leg's need by its planned route (round 5) and whether a goal was just reached.
// Trained by a seeded (mu, lambda) ES on TRAIN seeds and chosen on SELECTION seeds, as registered. Pure: no I/O, no clock, no Math.random (seeded).
"use strict";
import * as SS from "./subStations.mjs";
import * as AV from "./needsAdvisor.mjs";
import * as AS from "./autopilotSub.mjs";
import * as CT from "./courierTask.mjs";
import * as BC from "./breachCourierTask.mjs";
import { sanitize } from "../physics/mechanics/subModel6dof.mjs";
import { mulberry } from "./pilotSubPolicy.mjs";

export const NF = 10, NW = 2 * NF, GOAL_WINDOW = 5;
export const FEATURES = Object.freeze(["charge", "depth/60", "vz", "depthError/10", "breached", "air", "dropped", "legNeed-charge", "goalJustReached", "1"]);
export const ES = Object.freeze({ mu: 4, lambda: 8, sigma0: 0.5, halveEvery: 7, generations: 20, seed: 9009 });
export const TRAIN_SET = Object.freeze(Array.from({ length: 16 }, (_, i) => 201001 + i)), SELECTION_SET = Object.freeze(Array.from({ length: 16 }, (_, i) => 201501 + i)), HELD_SET = Object.freeze(Array.from({ length: 96 }, (_, i) => 205001 + i));

const unit = (w, off, x) => { let z = 0; for (let i = 0; i < NF; i++) z += w[off + i] * x[i]; return z > 0; };

/**
 * The learned courier captain over ctx { read, nav, pos, model } and a theta of 20. It keeps the charge SPENT (every fall of the reading, as round 4's legs station does) to price the next leg by its planned route,
 * notes when the navigator's arrivals moved (a goal just reached: within GOAL_WINDOW s), and latches BREACHED when damage control acts. `.fired` counts each unit's firing ticks.
 */
export function learnedCourierCaptain(ctx, theta, { pilot = AS.pilot(), dt = 1 / 30 } = {}) {
    if (!theta || theta.length !== NW || !Array.from(theta).every(Number.isFinite)) throw new Error(`learnedCourier: theta must be ${NW} finite numbers`);
    if (!ctx || typeof ctx.read !== "function" || !ctx.nav || typeof ctx.pos !== "function") throw new Error("learnedCourier: a context { read, nav, pos } is needed");
    let breached = false, lastFrac = null, spent = 0, seenArrivals = null, sinceGoal = Infinity, x = null;
    const fired = { surface: 0, drop: 0 };
    const surface = { name: "learned", kind: "target", priority: SS.PRIORITY.energy, propose: ({ target }) => (unit(theta, 0, x) ? (fired.surface++, { claim: AV.surfaceTarget(target, ctx.read()), aux: null, reason: "learned: surface" }) : { claim: null, aux: null, reason: null }) };
    const run = SS.captain({ helm: SS.helmOf(pilot, { model: ctx.model }), stations: [surface, SS.damageStation()] });
    const out = (s, mission, current = [0, 0, 0], aux) => {
        const r = ctx.read(), sn = ctx.nav.snapshot(), [px, py] = ctx.pos();
        if (lastFrac !== null && r.frac < lastFrac) spent += lastFrac - r.frac;
        lastFrac = r.frac;
        if (seenArrivals === null) seenArrivals = sn.arrivals;
        if (sn.arrivals !== seenArrivals) { seenArrivals = sn.arrivals; sinceGoal = 0; } else sinceGoal += dt;
        const planned = typeof ctx.nav.routeLength === "function" ? ctx.nav.routeLength(px, py) : null, straight = sn.goal ? Math.hypot(sn.goal.x - px, sn.goal.y - py) : 0;
        const need = CT.legNeed(spent, sn.travel, planned === null ? straight : planned), tank = s.tank || {}, airMax = Number.isFinite(tank.airMax) ? tank.airMax : 6;
        x = [r.frac, r.depth / 60, s.vel[2], (r.depth - mission.depth) / 10, breached ? 1 : 0, Number.isFinite(tank.air) ? tank.air / airMax : 1, tank.released ? 1 : 0, need - r.frac, sinceGoal <= GOAL_WINDOW ? 1 : 0, 1];
        let cmd = run(s, mission, current, aux);
        if (run.log.overrides.includes("damage")) breached = true;
        if (unit(theta, NF, x) && !tank.released) { fired.drop++; cmd = sanitize({ ...cmd, release: 1 }); }
        return cmd;
    };
    Object.defineProperty(out, "log", { get: () => run.log });
    Object.defineProperty(out, "aux", { get: () => run.aux });
    Object.defineProperty(out, "fired", { get: () => ({ ...fired }) });
    Object.defineProperty(out, "features", { get: () => (x ? [...x] : null) });
    return out;
}

/** One run of round 7's breached courier with the learned captain made in its loop. */
export const runLearned = (seed, theta, opts = {}) => BC.run(seed, "LEARNED", { ...opts, make: (ctx) => learnedCourierCaptain(ctx, theta) });

// ---- ROUND 15 (brain/SUB_STATIONS_WIP.md section 31): the same captain, trained on the MISSION'S PRICE of a boat --------------------------------------------------------------------------------------------------
/** The price, as registered: a lost boat costs the goals it would have delivered for the rest of the run, at COND's rate on round 10's HELD runs (2.42 goals per 1,200 s, section 29). */
export const PRICE = Object.freeze({ goals: 2.42, seconds: 1200, rate: 2.42 / 1200 });
export const ES15 = Object.freeze({ ...ES, seed: 9015 });
export const R15_TRAIN_SET = Object.freeze(Array.from({ length: 16 }, (_, i) => 210001 + i)), R15_SELECTION_SET = Object.freeze(Array.from({ length: 16 }, (_, i) => 210501 + i)), R15_HELD_SET = Object.freeze(Array.from({ length: 96 }, (_, i) => 211001 + i));
/** The mission value of one run record (breachCourierTask.run's): its goals, less PRICE.rate x the seconds left if the boat was lost. */
export function missionValue(r) {
    if (!r || !Number.isFinite(r.goals) || typeof r.survived !== "boolean") throw new Error("learnedCourier.missionValue: a run record { goals, survived, lostAt } is needed");
    if (r.survived) return r.goals;
    if (!Number.isFinite(r.lostAt)) throw new Error("learnedCourier.missionValue: a lost run needs its lostAt");
    return r.goals - PRICE.rate * Math.max(0, CT.SECONDS - r.lostAt);
}
/** ROUND 15'S REGISTERED VERDICT over paired runs (breachCourierTask.run records, the same seeds in the same order): PRICED against COND on the MISSION VALUE by the exact one-sided sign test; goals and survival reported the same way. */
export function verdict15({ PRICED, COND }) {
    const withValue = (rs) => rs.map((r) => ({ ...r, value: missionValue(r) })), P = withValue(PRICED), C = withValue(COND);
    const v = BC.compare(P, C, "value"), g = BC.compare(P, C, "goals"), sv = BC.compare(P, C, "survived");
    const word = (x, a, b) => (x.pA <= 0.05 && x.aMore > x.bMore ? `${a} BEATS ${b}` : x.pB <= 0.05 && x.bMore > x.aMore ? `${b} BEATS ${a}` : "NO DIFFERENCE SHOWN");
    const mean = (rs, f) => rs.reduce((t, r) => t + f(r), 0) / rs.length;
    return { verdict: word(v, "PRICED", "COND"), goals: word(g, "PRICED", "COND"), survival: word(sv, "PRICED", "COND"), pairs: { value: v, goals: g, survived: sv },
        means: { PRICED: { value: mean(P, (r) => r.value), goals: mean(P, (r) => r.goals), survived: P.filter((r) => r.survived).length }, COND: { value: mean(C, (r) => r.value), goals: mean(C, (r) => r.goals), survived: C.filter((r) => r.survived).length } }, n: P.length };
}
/** Round 15's fitness over a set: the mission value summed. */
export function fitnessPriced(theta, seeds, opts = {}) { let f = 0; for (const s of seeds) f += missionValue(runLearned(s, theta, opts)); return f; }

/** The registered fitness over a set: goals + 2 x survived + 0.001 x the seconds lived. */
export function fitness(theta, seeds, opts = {}) {
    let f = 0;
    for (const s of seeds) { const r = runLearned(s, theta, opts); f += r.goals + (r.survived ? 2 + 0.001 * CT.SECONDS : 0.001 * (r.lostAt || 0)); }
    return f;
}

function normal(rng) { const u = Math.max(1e-12, rng()), v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

/** THE TRAINING, as registered: (mu, lambda) ES from zeros on TRAIN. `fit` may be replaced (a gate's stub; the command's parallel evaluator, which must return the same numbers). */
export async function train({ seeds = TRAIN_SET, es = ES, fit = async (th, sd) => fitness(th, sd), onGen = null } = {}) {
    const rng = mulberry(es.seed >>> 0), history = [], zero = new Array(NW).fill(0);
    let parents = [{ theta: zero, fit: await fit(zero, seeds) }];
    for (let g = 0; g < es.generations; g++) {
        const sigma = es.sigma0 * Math.pow(0.5, Math.floor(g / es.halveEvery)), thetas = [];
        for (let k = 0; k < es.lambda; k++) { const p = parents[k % parents.length].theta; thetas.push(p.map((w) => w + sigma * normal(rng))); }
        const fits = await Promise.all(thetas.map((th) => fit(th, seeds)));
        const kids = thetas.map((theta, i) => ({ theta, fit: fits[i] })).sort((a, b) => b.fit - a.fit);
        parents = kids.slice(0, es.mu);
        history.push({ gen: g, best: parents[0].fit, sigma });
        if (onGen) onGen(history[history.length - 1]);
    }
    return { parents, history };
}

/** The registered choice: the parent best on SELECTION. */
export async function select(parents, { seeds = SELECTION_SET, fit = async (th, sd) => fitness(th, sd) } = {}) {
    const sel = await Promise.all(parents.map((p) => fit(p.theta, seeds)));
    return parents.map((p, i) => ({ theta: p.theta, trainFit: p.fit, selFit: sel[i] })).sort((a, b) => b.selFit - a.selFit)[0];
}
