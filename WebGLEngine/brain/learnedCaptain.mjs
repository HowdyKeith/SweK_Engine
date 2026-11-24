// WebGLEngine/brain/learnedCaptain.mjs -- UNNUMBERED (the version is chosen at ship time; registered in brain/SUB_STATIONS_WIP.md section 21 before this file; the gate is brain/learnedCaptain-selfcheck.mjs)
//
// ROUND 8 OF THE SUBMARINE STATIONS: a LEARNED captain on round 2's task (brain/stationsTask.mjs: a breached boat with a low battery). It makes TRIAGE's two choices itself -- SURFACE (claim the surface) and DROP (release the
// weight) -- each a logistic unit over eight features a captain can sense, beside the same helm and damage station every crew has. Trained by a seeded (mu, lambda) evolution strategy on TRAIN seeds, chosen on SELECTION seeds.
// Pure: no I/O, no clock, no Math.random (seeded).
"use strict";
import * as SS from "./subStations.mjs";
import * as AV from "./needsAdvisor.mjs";
import * as AS from "./autopilotSub.mjs";
import * as T from "./stationsTask.mjs";
import { sanitize } from "../physics/mechanics/subModel6dof.mjs";
import { mulberry } from "./pilotSubPolicy.mjs";

export const NF = 8, NW = 2 * NF;
export const FEATURES = Object.freeze(["charge", "depth/60", "vz", "depthError/10", "breached", "air", "dropped", "1"]);
export const ES = Object.freeze({ mu: 4, lambda: 12, sigma0: 0.5, halveEvery: 10, generations: 40, seed: 8008 });
export const TRAIN_SET = Object.freeze(Array.from({ length: 32 }, (_, i) => 193001 + i)), SELECTION_SET = Object.freeze(Array.from({ length: 24 }, (_, i) => 193501 + i)), HELD_SET = Object.freeze(Array.from({ length: 96 }, (_, i) => 195001 + i));

/** The eight features of a tick: what a captain can sense (the needs readings, the state, the mission and whether damage control has acted). */
export function featuresOf(r, state, mission, breached) {
    const tank = state.tank || {}, airMax = Number.isFinite(tank.airMax) ? tank.airMax : 6;
    return [r.frac, r.depth / 60, state.vel[2], (r.depth - mission.depth) / 10, breached ? 1 : 0, Number.isFinite(tank.air) ? tank.air / airMax : 1, tank.released ? 1 : 0, 1];
}
const unit = (w, off, x) => { let z = 0; for (let i = 0; i < NF; i++) z += w[off + i] * x[i]; return z > 0; };   // the logistic unit fires where its argument is positive (sigmoid > 0.5)

/** The learned captain: the helm, a learned SURFACE station at the energy priority, the damage station; DROP applied after the helm. `.fired` counts the ticks each choice fired. */
export function learnedCaptain({ pilot = AS.pilot(), model, read, theta, damageOpts = {} } = {}) {
    if (!theta || theta.length !== NW || !Array.from(theta).every(Number.isFinite)) throw new Error(`learnedCaptain: theta must be ${NW} finite numbers`);
    if (typeof read !== "function") throw new Error("learnedCaptain: a read() function is needed");
    let breached = false, x = null, state = null;
    const fired = { surface: 0, drop: 0 };
    const surface = { name: "learned", kind: "target", priority: SS.PRIORITY.energy, propose: ({ target }) => (unit(theta, 0, x) ? (fired.surface++, { claim: AV.surfaceTarget(target, read()), aux: null, reason: "learned: surface" }) : { claim: null, aux: null, reason: null }) };
    const run = SS.captain({ helm: SS.helmOf(pilot, { model }), stations: [surface, SS.damageStation(damageOpts)] });
    const out = (s, mission, current = [0, 0, 0], aux) => {
        state = s; x = featuresOf(read(), s, mission, breached);
        let cmd = run(s, mission, current, aux);
        if (run.log.overrides.includes("damage")) breached = true;
        if (unit(theta, NF, x) && !(s.tank && s.tank.released)) { fired.drop++; cmd = sanitize({ ...cmd, release: 1 }); }
        return cmd;
    };
    Object.defineProperty(out, "log", { get: () => run.log });
    Object.defineProperty(out, "aux", { get: () => run.aux });
    Object.defineProperty(out, "fired", { get: () => ({ ...fired }) });
    void state;
    return out;
}

/** Fly round 2's dive for a seed with a theta: stationsTask's own loop with the learned captain made in it. */
export const flyLearned = (seed, theta, opts = {}) => T.fly(T.scenario(seed), "LEARNED", { ...opts, make: ({ read, model }) => learnedCaptain({ model, read, theta }) });

/** The registered fitness over a set: dives survived + 0.001 x seconds lived (a lost dive lives until it is lost). */
export function fitness(theta, seeds, opts = {}) {
    let f = 0;
    for (const s of seeds) { const r = flyLearned(s, theta, opts); f += r.survived ? 1 + 0.001 * T.SECONDS : 0.001 * (r.crushedAt || 0); }
    return f;
}

/** A seeded normal draw. */
function normal(rng) { const u = Math.max(1e-12, rng()), v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

/** THE TRAINING, as registered: (mu, lambda) ES from zeros on TRAIN; returns { parents: [{ theta, fit }], history: [{ gen, best, sigma }] }. `onGen` is told each generation (a command prints it). */
export function train({ seeds = TRAIN_SET, es = ES, fit = fitness, onGen = null } = {}) {
    const rng = mulberry(es.seed >>> 0), history = [];
    let parents = [{ theta: new Array(NW).fill(0), fit: fit(new Array(NW).fill(0), seeds) }];
    for (let g = 0; g < es.generations; g++) {
        const sigma = es.sigma0 * Math.pow(0.5, Math.floor(g / es.halveEvery)), kids = [];
        for (let k = 0; k < es.lambda; k++) { const p = parents[k % parents.length].theta, th = p.map((w) => w + sigma * normal(rng)); kids.push({ theta: th, fit: fit(th, seeds) }); }
        kids.sort((a, b) => b.fit - a.fit);
        parents = kids.slice(0, es.mu);
        history.push({ gen: g, best: parents[0].fit, sigma });
        if (onGen) onGen(history[history.length - 1]);
    }
    return { parents, history };
}

/** The registered choice: the parent with the best fitness on SELECTION. */
export function select(parents, { seeds = SELECTION_SET, fit = fitness } = {}) {
    const scored = parents.map((p) => ({ theta: p.theta, trainFit: p.fit, selFit: fit(p.theta, seeds) })).sort((a, b) => b.selFit - a.selFit);
    return scored[0];
}
