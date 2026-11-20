// WebGLEngine/brain/stationsTask.mjs -- UNNUMBERED (the version is chosen at ship time; registered in brain/SUB_STATIONS_WIP.md section 7 before this file; the gate is brain/stationsTask-selfcheck.mjs)
//
// ROUND 2 OF THE SUBMARINE STATIONS: boats with TWO problems at once -- a leak, and a battery low enough to need the surface -- flown by five crews (NONE, ENERGY, DAMAGE, FIXED, TRIAGE: brain/subStations.mjs), scored by survival.
// The scenario (registration A): start and mission depth U(15, 40) m, heading U(0, 2 pi), 2 m/s; charge U(0.15, 0.45); a leak of U(3, 8) percent of the weight starting at U(5, 60) s, built over 5 s, for the rest of the dive. 600 s, the needs-task
// vessel, a battery hull with a 60 m crush depth, subNeeds.stepNeeds with the leak as its extra weight and the crew's aux.
// Pure apart from the clock-free arithmetic: no I/O, no clock, no Math.random (a seeded generator).
"use strict";
import * as SS from "./subStations.mjs";
import * as A from "./autopilotSub.mjs";
import * as NT from "./needsTask.mjs";
import * as N from "../physics/mechanics/subNeeds.mjs";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import { mulberry } from "./pilotSubPolicy.mjs";

export const SECONDS = 600, CRUSH = 60, SURFACE_BAND = 3, SPEED = 2, LEAK_BUILD = 5;
export const RANGES = Object.freeze({ depth: [15, 40], frac: [0.15, 0.45], leak: [0.03, 0.08], leakAt: [5, 60] });
export const DEV_SET = Object.freeze(Array.from({ length: 48 }, (_, i) => 160001 + i)), HELD_SET = Object.freeze(Array.from({ length: 96 }, (_, i) => 161001 + i));
export const CREWS = Object.freeze(["NONE", "ENERGY", "DAMAGE", "FIXED", "TRIAGE"]);
/** TRIAGE AS FROZEN IN REGISTRATION B (brain/SUB_STATIONS_WIP.md section 8), chosen on DEV from 12 variants: once breached, drop the weight at once (T2 at any charge) and go up while there is charge (T4). T1 and T3 did not help on DEV and are off. */
export const FROZEN_TRIAGE = Object.freeze({ thrustFull: null, thrustFloor: 0, earlyDropBelow: Infinity, unrationSink: null, surfaceOnBreach: true });
/** ROUND 9 (brain/SUB_STATIONS_WIP.md section 24): FROZEN_TRIAGE plus BLOW -- the main tank blown with stored air while a breached boat, its weight gone, climbs slower than 0.2 m/s deeper than 3 m. Its sets. */
export const BLOW_KNOBS = Object.freeze({ ...FROZEN_TRIAGE, blowClimb: 0.2, blowAbove: 3 });
export const R9_DEV_SET = Object.freeze(Array.from({ length: 24 }, (_, i) => 196001 + i)), R9_HELD_SET = Object.freeze(Array.from({ length: 96 }, (_, i) => 197001 + i));
/** ROUND 12 (section 27): the hard cases (a leak over the 6 % weight) and NEED -- FROZEN_TRIAGE plus blowing only when the charge would run out before the climb reaches 3 m. */
export const HARD_LEAK = Object.freeze({ leak: Object.freeze([0.06, 0.08]) });
export const NEED_KNOBS = Object.freeze({ ...FROZEN_TRIAGE, blowNeed: true, blowAbove: 3, needWindowS: 10 });
export const R12_DEV_SET = Object.freeze(Array.from({ length: 24 }, (_, i) => 203001 + i)), R12_HELD_SET = Object.freeze(Array.from({ length: 96 }, (_, i) => 204001 + i));
const MODEL = NT.model();

/** The scenario of a seed: { seed, depth, heading, frac, leak, leakAt }. `ranges` replaces any of RANGES (round 12 draws the leak from HARD_LEAK); the draws are made in the same order, so the other fields of a seed do not move. */
export function scenario(seed, ranges = RANGES) {
    if (!Number.isInteger(seed) || seed < 0) throw new Error(`stationsTask.scenario: a seed is a whole number, got ${seed}`);
    const r = mulberry((seed * 2654435761) >>> 0), u = ([lo, hi]) => lo + (hi - lo) * r();
    const R = { ...RANGES, ...ranges };
    return Object.freeze({ seed, depth: u(R.depth), heading: u([0, 2 * Math.PI]), frac: u(R.frac), leak: u(R.leak), leakAt: u(R.leakAt) });
}
export const leakAt = (sc, t) => sc.leak * Math.min(1, Math.max(0, (t - sc.leakAt) / LEAK_BUILD));

/** A crew for a context { read, model }: the captain (a pilot with .aux) for one of CREWS. `knobs` are TRIAGE's. */
export function crew(name, ctx, knobs = FROZEN_TRIAGE) {
    const pilot = A.pilot(), helm = SS.helmOf(pilot, { model: ctx.model }), e = () => SS.energyStation({ read: ctx.read }), d = () => SS.damageStation();
    switch (name) {
        case "NONE": return SS.captain({ helm });
        case "ENERGY": return SS.captain({ helm, stations: [e()] });
        case "DAMAGE": return SS.captain({ helm, stations: [d()] });
        case "FIXED": return SS.captain({ helm, stations: [e(), d()] });
        case "TRIAGE": return SS.triageCaptain({ pilot, model: ctx.model, read: ctx.read, knobs });
        case "BLOW": return SS.triageCaptain({ pilot, model: ctx.model, read: ctx.read, knobs: BLOW_KNOBS });
        case "NEED": return SS.triageCaptain({ pilot, model: ctx.model, read: ctx.read, knobs: NEED_KNOBS });   // round 12; not in CREWS   // round 9; not in CREWS (round 2's registered five)
        default: throw new Error(`stationsTask.crew: no crew named ${JSON.stringify(name)} (${CREWS.join(", ")})`);
    }
}

/** Fly one scenario with one crew: { seed, crew, survived, status, crushedAt, reachedSurface, finalDepth, finalFrac, released, triage }. */
// v4930 (round 8) -- `make(ctx)`: a caller-made captain in place of the named crew (the learned captain flies this exact loop); null keeps v4929's.
export function fly(sc, name, { knobs = FROZEN_TRIAGE, seconds = SECONDS, dt = S.DT, make = null } = {}) {
    let s = S.createState({ depth: sc.depth, speed: SPEED, model: MODEL }), needs = N.initialNeeds("battery", { crushDepth: CRUSH });
    needs.energy = N.CLASSES.battery.capacityJ * sc.frac;
    const read = () => N.readings(MODEL, needs, s), cap = make ? make({ read, model: MODEL }) : crew(name, { read, model: MODEL }, knobs), target = Object.freeze({ depth: sc.depth, heading: sc.heading, speed: SPEED });
    let status = "submerged", crushedAt = null, reached = false, released = false;
    const total = Math.round(seconds / dt);
    for (let i = 0; i < total; i++) {
        const cmd = cap(s, target, [0, 0, 0]);
        const res = N.stepNeeds(MODEL, s, needs, cmd, dt, [0, 0, 0], leakAt(sc, i * dt), cap.aux);
        s = res.state; needs = res.needs;
        if (res.status !== "submerged" || !Number.isFinite(s.pos[2])) { status = res.status === "submerged" ? "lost" : res.status; crushedAt = (i + 1) * dt; break; }
        if (-s.pos[2] < SURFACE_BAND) reached = true;
        if (s.tank && s.tank.released) released = true;
    }
    return { seed: sc.seed, crew: name, survived: status === "submerged", status, crushedAt, reachedSurface: reached, finalDepth: -s.pos[2], finalFrac: read().frac, released, triage: cap.triage || null };
}

/** The exact one-sided sign test: P(X >= wins) for X ~ Binomial(wins + losses, 1/2). 1 when there are no discordant pairs. */
export function signTest(wins, losses) {
    const n = wins + losses; if (n === 0) return 1;
    let p = 0, c = 1; for (let k = 0; k <= n; k++) { if (k >= wins) p += c; c = (c * (n - k)) / (k + 1); }
    return p / 2 ** n;
}

/** The registered verdict of TRIAGE against FIXED over paired results (arrays of fly() results in the same seed order). */
export function verdict(triage, fixed) {
    if (triage.length !== fixed.length || triage.some((r, i) => r.seed !== fixed[i].seed)) throw new Error("stationsTask.verdict: the two crews were not flown on the same seeds in the same order");
    const t = triage.filter((r) => r.survived).length, f = fixed.filter((r) => r.survived).length;
    const tOnly = triage.filter((r, i) => r.survived && !fixed[i].survived).length, fOnly = triage.filter((r, i) => !r.survived && fixed[i].survived).length;
    const pT = signTest(tOnly, fOnly), pF = signTest(fOnly, tOnly);
    const word = t > f && pT <= 0.05 ? "TRIAGE BEATS FIXED" : f > t && pF <= 0.05 ? "FIXED BEATS TRIAGE" : "NO DIFFERENCE SHOWN";
    return { verdict: word, triage: t, fixed: f, n: triage.length, triageOnly: tOnly, fixedOnly: fOnly, pTriage: pT, pFixed: pF };
}
