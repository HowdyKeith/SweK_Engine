// WebGLEngine/brain/duelStationsTask.mjs -- UNNUMBERED (the version is chosen at ship time; registered in brain/SUB_STATIONS_WIP.md section 12 before this file; the gate is brain/duelStationsTask-selfcheck.mjs)
//
// ROUND 3 OF THE SUBMARINE STATIONS: a duel on a low battery (brain/subDuel.mjs, unchanged, with its `needs` option), side A crewed by stations (brain/subStations.mjs duelSide): SONAR alone, FIXED (sonar and energy by rank), and
// RISK (energy's surface claim passed only when the charge will not last the fight). The battery is U(0.05, 0.30) of capacity per duel, drawn from the seed. Pure: no I/O, no clock, no Math.random (seeded).
"use strict";
import * as SS from "./subStations.mjs";
import * as D from "./subDuel.mjs";
import * as TA from "./subTactics.mjs";
import * as AS from "./autopilotSub.mjs";
import * as N from "../physics/mechanics/subNeeds.mjs";
import { mulberry } from "./pilotSubPolicy.mjs";

export const FIGHT = D.SECONDS, CHARGE = Object.freeze([0.05, 0.30]), RISK = Object.freeze({ minT: 10, reserve: 0.02 });
export const CREWS = Object.freeze(["SONAR", "FIXED", "RISK", "BLIND"]);   // BLIND: round 6 (section 17), RISK with a fixed 60 s look-ahead in place of the fight's time left
export const BLIND = Object.freeze({ lookAhead: 60 });
const set = (a, b) => Object.freeze(D.KINDS.flatMap((k) => Array.from({ length: b - a + 1 }, (_, i) => Object.freeze({ seed: a + i, kind: k }))));
export const DEV_SET = set(171001, 171006), HELD_SET = set(173001, 173024);
export const R6_DEV_SET = set(185001, 185006), R6_HELD_SET = set(187001, 187024);   // round 6's sets

/** The battery of a duel seed: a fraction of capacity, U(0.05, 0.30). */
export function chargeOf(seed) {
    if (!Number.isInteger(seed) || seed < 0) throw new Error(`duelStationsTask.chargeOf: a seed is a whole number, got ${seed}`);
    return CHARGE[0] + (CHARGE[1] - CHARGE[0]) * mulberry((seed * 2246822519) >>> 0)();
}

/** The registered rule: at the last look (time t, charge c of capacity, the start c0), at risk iff t >= 10 and c - r (FIGHT - t) < 0.02 with r = (c0 - c) / t. */
export function atRisk(t, c, c0, { fight = FIGHT, minT = RISK.minT, reserve = RISK.reserve } = {}) {
    if (!(t >= minT)) return false;
    const r = (c0 - c) / t;
    return c - r * (fight - t) < reserve;
}

/** Side A for a crew at a start charge `c0` (fraction of capacity): { side, read() (what the energy station reads), risk() (the registered rule at the last look), stats() } -- stats: the energy station's con ticks and, for RISK, the claims it held back. An unknown crew throws (duelSide asks for its stations). */
export function sideFor(crew, c0) {
    let last = null;
    const base = TA.makeTactician(TA.THETA_DEFAULT), tactics = (obs) => { last = obs; return base(obs); };
    const charge = () => (last && Number.isFinite(last.self.charge) ? last.self.charge * c0 : c0);
    const read = () => ({ frac: charge(), depth: last ? last.self.depth : 20, refills: true, refillDepth: N.CLASSES.battery.refillDepth, flood: 0, damage: 0 });
    let gated = null;
    const risk = () => !!last && (crew === "BLIND" ? atRisk(last.t, charge(), c0, { fight: last.t + BLIND.lookAhead }) : atRisk(last.t, charge(), c0));   // BLIND asks only whether the charge lasts the next 60 s
    const more = () => {
        if (crew === "SONAR") return [];
        const e = SS.energyStation({ read });
        if (crew === "FIXED") return [e];
        if (crew === "RISK" || crew === "BLIND") return [(gated = SS.gatedStation(e, () => risk()))];
        throw new Error(`duelStationsTask.sideFor: no crew named ${JSON.stringify(crew)} (${CREWS.join(", ")})`);
    };
    const side = SS.duelSide({ tactics, helm: SS.helmOf(AS.pilot()), more });
    return { side, read, risk, stats: () => ({ energyCon: side.pilot.watch ? side.pilot.watch.con.energy || 0 : 0, blocked: gated ? gated.blocked : 0 }) };
}

/** One duel: { seed, kind, crew, c0, score, winner, flat, chargeEnd, energyCon, blocked }. */
export function fight({ seed, kind }, crew) {
    const c0 = chargeOf(seed), sc = D.scenario(seed, kind), { side, stats } = sideFor(crew, c0);
    const r = D.duel(side, sc, { needs: { cls: "battery", energyJ: N.CLASSES.battery.capacityJ * c0 } }), st = stats();
    return { seed, kind, crew, c0, score: r.score, winner: r.winner, flat: r.charge[0] <= 0, chargeEnd: r.charge[0], energyCon: st.energyCon, blocked: st.blocked };
}

/** The exact one-sided sign test: P(X >= wins) for X ~ Binomial(wins + losses, 1/2); 1 with no pairs. */
export function signTest(wins, losses) {
    const n = wins + losses; if (n === 0) return 1;
    let p = 0, c = 1; for (let k = 0; k <= n; k++) { if (k >= wins) p += c; c = (c * (n - k)) / (k + 1); }
    return p / 2 ** n;
}
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** The registered verdict over paired results (same duels, same order): { v1, v2, bottom, ... }. */
export function verdict(sonar, fixed, risk) {
    const same = (a, b) => a.length === b.length && a.every((x, i) => x.seed === b[i].seed && x.kind === b[i].kind);
    if (!same(sonar, fixed) || !same(sonar, risk)) throw new Error("duelStationsTask.verdict: the crews were not flown on the same duels in the same order");
    const mR = mean(risk.map((x) => x.score)), mF = mean(fixed.map((x) => x.score)), mS = mean(sonar.map((x) => x.score));
    const up = risk.filter((x, i) => x.score > fixed[i].score).length, down = risk.filter((x, i) => x.score < fixed[i].score).length;
    const pR = signTest(up, down), pF = signTest(down, up);
    const v1 = mR > mF && pR <= 0.05 ? "RISK BEATS FIXED" : mF > mR && pF <= 0.05 ? "FIXED BEATS RISK" : "NO DIFFERENCE SHOWN", v2 = mR >= mS - 0.05;
    const bottom = v1 === "RISK BEATS FIXED" && v2 ? "a captain that weighs the charge against the fight keeps the fight and beats the ranking"
        : v1 === "RISK BEATS FIXED" ? "better than the ranking, still short of sonar alone" : v2 ? "no worse than sonar alone, and not shown better than the ranking" : "reported as it is";
    return { v1, v2: v2 ? "RISK KEEPS SONAR'S FIGHT" : "RISK DOES NOT KEEP SONAR'S FIGHT", bottom, means: { SONAR: mS, FIXED: mF, RISK: mR }, riskUp: up, riskDown: down, pRisk: pR, pFixed: pF, n: risk.length };
}
