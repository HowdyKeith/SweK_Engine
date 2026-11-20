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
import * as NT from "./needsTask.mjs";
import { FROZEN_TRIAGE } from "./stationsTask.mjs";
import { COND_KNOBS } from "./breachCourierTask.mjs";

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

// ---- ROUND 14 (brain/SUB_STATIONS_WIP.md section 31): SONAR MEETS DAMAGE CONTROL -- round 3's duel with side A breached, on the needs-task vessel (a tank, a bottle and a drop weight) -------------------------------------
export const LEAK14 = Object.freeze({ leak: Object.freeze([0.03, 0.08]), at: Object.freeze([20, 120]), build: 5 });
export const CREWS14 = Object.freeze(["DC", "TRIAGE-D", "COND-D"]);
export const R14_DEV_SET = set(208001, 208006), R14_HELD_SET = set(209001, 209024);

/** Side A's breach in a duel seed: { leak, at }, from its OWN generator (the duel's draws and the battery's do not move). */
export function breach14(seed) {
    if (!Number.isInteger(seed) || seed < 0) throw new Error(`duelStationsTask.breach14: a seed is a whole number, got ${seed}`);
    const r = mulberry((seed * 3266489917) >>> 0), u = ([lo, hi]) => lo + (hi - lo) * r();
    return Object.freeze({ leak: u(LEAK14.leak), at: u(LEAK14.at) });
}
export const leak14At = (b, t) => b.leak * Math.min(1, Math.max(0, (t - b.at) / LEAK14.build));

/** Side A of round 14 for a crew at a start charge c0: round 3's RISK (the sonar station, round 3's tactician, the energy claim passed only when the charge will not last the fight) with damage control -- by rank (DC), or under triageCaptain with
 *  FROZEN_TRIAGE (TRIAGE-D) or COND_KNOBS (COND-D). The helm flies the needs-task vessel. { side, stats() }: the energy station's con ticks and whether the breach latch closed. */
export function sideFor14(crew, c0) {
    if (!CREWS14.includes(crew)) throw new Error(`duelStationsTask.sideFor14: no crew named ${JSON.stringify(crew)} (${CREWS14.join(", ")})`);
    let last = null;
    const model = NT.model(), base = TA.makeTactician(TA.THETA_DEFAULT), tactics = (obs) => { last = obs; return base(obs); };
    const charge = () => (last && Number.isFinite(last.self.charge) ? last.self.charge * c0 : c0);
    const read = () => ({ frac: charge(), depth: last ? last.self.depth : 20, refills: true, refillDepth: N.CLASSES.battery.refillDepth, flood: 0, damage: 0 });
    const risk = () => !!last && atRisk(last.t, charge(), c0), raw = AS.pilot();
    let tri = null;
    const side = crew === "DC"
        ? SS.duelSide({ tactics, helm: SS.helmOf(raw, { model }), more: () => [SS.gatedStation(SS.energyStation({ read }), () => risk()), SS.damageStation()] })
        : SS.duelSide({ tactics, helm: SS.helmOf(raw, { model }), captainOf: (h, stations) => (tri = SS.triageCaptain({ pilot: raw, model, read, knobs: crew === "TRIAGE-D" ? FROZEN_TRIAGE : COND_KNOBS, more: stations, energyAllow: () => risk() })) });
    Object.defineProperty(side.pilot, "aux", { get: () => (side.captain.aux || null) });
    return { side, stats: () => ({ energyCon: side.pilot.watch ? side.pilot.watch.con.energy || 0 : 0, latched: tri ? tri.latch.latched : null, breached: tri ? tri.latch.breached : (side.pilot.watch ? (side.pilot.watch.overrides.damage || 0) > 0 : false) }) };
}

/** One duel of round 14: { seed, kind, crew, c0, leak, at, score, winner, survived, fate, flat, energyCon, latched, breached }. Survived: side A afloat at the end (not crushed, grounded or sunk). */
export function fight14({ seed, kind }, crew, { seconds = FIGHT, breach = null } = {}) {   // `breach`: a { leak, at } in place of the seed's (a gate's fixture); null flies the registered one
    const c0 = chargeOf(seed), b = breach || breach14(seed), sc = D.scenario(seed, kind), { side, stats } = sideFor14(crew, c0);
    const r = D.duel(side, sc, { seconds, needs: { cls: "battery", energyJ: N.CLASSES.battery.capacityJ * c0 }, modelA: NT.model(), leakA: (t) => leak14At(b, t) }), st = stats();
    return { seed, kind, crew, c0, leak: b.leak, at: b.at, score: r.score, winner: r.winner, survived: r.fates[0] === "afloat", fate: r.fates[0], flat: r.charge[0] <= 0, energyCon: st.energyCon, latched: st.latched, breached: st.breached };
}

/** Round 14's registered verdict over paired results (same duels, same order): COND-D against TRIAGE-D on score (per-duel higher/lower) and survival; DC reported against both. */
export function verdict14({ DC, "TRIAGE-D": TRI, "COND-D": COND }) {
    const same = (a, b) => a.length === b.length && a.every((x, i) => x.seed === b[i].seed && x.kind === b[i].kind);
    if (!same(COND, TRI) || !same(COND, DC)) throw new Error("duelStationsTask.verdict14: the crews were not flown on the same duels in the same order");
    const pair = (a, b, key) => { const v = (x) => (key === "survived" ? (x.survived ? 1 : 0) : x[key]); const aMore = a.filter((x, i) => v(x) > v(b[i])).length, bMore = a.filter((x, i) => v(x) < v(b[i])).length; return { aMore, bMore, pA: signTest(aMore, bMore), pB: signTest(bMore, aMore) }; };
    const sc = pair(COND, TRI, "score"), sv = pair(COND, TRI, "survived"), better = sc.pA <= 0.05 && sc.aMore > sc.bMore, worse = sv.pB <= 0.05 && sv.bMore > sv.aMore;
    return { verdict: better && !worse ? "COND-D BEATS TRIAGE-D" : better ? "COND-D WINS THE FIGHT BUT LOSES BOATS" : "COND-D DOES NOT BEAT TRIAGE-D",
        pairs: { scoreVsTriage: sc, survivalVsTriage: sv, scoreVsDC: pair(COND, DC, "score"), survivalVsDC: pair(COND, DC, "survived"), triageScoreVsDC: pair(TRI, DC, "score"), triageSurvivalVsDC: pair(TRI, DC, "survived") },
        means: Object.fromEntries([["DC", DC], ["TRIAGE-D", TRI], ["COND-D", COND]].map(([k, rs]) => [k, { score: mean(rs.map((x) => x.score)), survived: rs.filter((x) => x.survived).length, latched: rs.filter((x) => x.latched).length }])), n: COND.length };
}
