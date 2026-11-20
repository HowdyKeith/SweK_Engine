// WebGLEngine/brain/breachCourierTask.mjs -- UNNUMBERED (the version is chosen at ship time; registered in brain/SUB_STATIONS_WIP.md section 20 before this file; the gate is brain/breachCourierTask-selfcheck.mjs)
//
// ROUND 7 OF THE SUBMARINE STATIONS: one captain over navigation, energy and damage control. Round 4's courier (brain/courierTask.mjs: the sea, the navigator as the mission, the vessel, the start, the battery, 1,200 s) BREACHED
// mid-run: a leak of U(0.03, 0.08) of the weight from U(60, 600) s, built over 5 s, never mended. Four crews: FIXED (energy and damage by rank), ROUTE+DC (round 5's ROUTE with the damage station), TRIAGE (round 2's frozen
// captain), COMBINED (TRIAGE with ROUTE's legs station added and its energy claim gated shut: the two winners on one boat, as written). Pure: no I/O, no clock, no Math.random (seeded).
"use strict";
import * as SS from "./subStations.mjs";
import * as CT from "./courierTask.mjs";
import { FROZEN_TRIAGE } from "./stationsTask.mjs";
import * as TN from "./subTankNav.mjs";
import * as AS from "./autopilotSub.mjs";
import * as NT from "./needsTask.mjs";
import * as N from "../physics/mechanics/subNeeds.mjs";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import { mulberry } from "./pilotSubPolicy.mjs";

export const BREACH = Object.freeze({ leak: Object.freeze([0.03, 0.08]), at: Object.freeze([60, 600]), build: 5 }), SURFACE_BAND = 3;
export const CREWS = Object.freeze(["FIXED", "ROUTE+DC", "TRIAGE", "COMBINED"]);
export const DEV_SET = Object.freeze(Array.from({ length: 24 }, (_, i) => 189001 + i)), HELD_SET = Object.freeze(Array.from({ length: 96 }, (_, i) => 191001 + i));
const MODEL = NT.model();

/** The breach of a seed: { leak, at }. The battery is round 4's (courierTask.chargeOf). */
export function breachOf(seed) {
    if (!Number.isInteger(seed) || seed < 0) throw new Error(`breachCourierTask.breachOf: a seed is a whole number, got ${seed}`);
    const r = mulberry((seed * 2654435789) >>> 0), u = ([lo, hi]) => lo + (hi - lo) * r();
    return Object.freeze({ leak: u(BREACH.leak), at: u(BREACH.at) });
}
export const leakAt = (b, t) => b.leak * Math.min(1, Math.max(0, (t - b.at) / BREACH.build));

/** The captain of a crew over { read, nav, pos }. */
export function crew(name, ctx) {
    const pilot = AS.pilot(), helm = SS.helmOf(pilot, { model: MODEL }), shut = () => false;
    if (name === "FIXED") return SS.captain({ helm, stations: [SS.energyStation({ read: ctx.read }), SS.damageStation()] });
    if (name === "ROUTE+DC") return SS.captain({ helm, stations: [CT.legsStation({ ...ctx, route: true }), SS.gatedStation(SS.energyStation({ read: ctx.read }), shut), SS.damageStation()] });
    if (name === "TRIAGE") return SS.triageCaptain({ pilot, model: MODEL, read: ctx.read, knobs: FROZEN_TRIAGE });
    if (name === "COMBINED") return SS.triageCaptain({ pilot, model: MODEL, read: ctx.read, knobs: FROZEN_TRIAGE, more: [CT.legsStation({ ...ctx, route: true })], energyAllow: shut });
    throw new Error(`breachCourierTask.crew: no crew named ${JSON.stringify(name)} (${CREWS.join(", ")})`);
}

/** One run: { seed, crew, c0, leak, at, survived, status, lostAt, goals, emptyS, surfacedAfterBreachS, released }. */
export function run(seed, name, { seconds = CT.SECONDS, dt = S.DT } = {}) {
    const c0 = CT.chargeOf(seed), b = breachOf(seed), scene = TN.tankScene(seed), nav = TN.createNavigator(scene, { arm: CT.ARM, seed });
    let s = S.createState({ depth: CT.START.depth, speed: CT.START.speed, model: MODEL, pos: [CT.START.x, CT.START.y, -CT.START.depth] }), needs = N.initialNeeds("battery", { crushDepth: 60 });
    needs.energy = N.CLASSES.battery.capacityJ * c0;
    const read = () => N.readings(MODEL, needs, s), cap = crew(name, { read, nav, pos: () => [s.pos[0], s.pos[1]] });
    let status = "submerged", t = 0, empty = 0, surfaced = 0, lostAt = null, released = false;
    const total = Math.round(seconds / dt);
    for (let i = 0; i < total; i++) {
        const mission = nav.step(s, t, dt, null, true), cmd = cap(s, mission, [0, 0, 0]);
        const res = N.stepNeeds(MODEL, s, needs, cmd, dt, [0, 0, 0], leakAt(b, t), cap.aux);
        s = res.state; needs = res.needs; t += dt;
        if (needs.energy <= 0) empty++;
        if (t > b.at && -s.pos[2] < SURFACE_BAND) surfaced++;
        if (s.tank && s.tank.released) released = true;
        if (res.status !== "submerged" || !Number.isFinite(s.pos[2])) { status = res.status === "submerged" ? "lost" : res.status; lostAt = t; break; }
    }
    return { seed, crew: name, c0, leak: b.leak, at: b.at, survived: status === "submerged", status, lostAt, goals: nav.snapshot().arrivals, emptyS: empty * dt, surfacedAfterBreachS: surfaced * dt, released };
}

/** The exact one-sided sign test: P(X >= wins) for X ~ Binomial(wins + losses, 1/2); 1 with no pairs. */
export const signTest = CT.signTest;

/** Paired comparison of `a` against `b` on one outcome (`survived` or `goals`): { aMore, bMore, pA (a better), pB }. Refuses runs on different seeds. */
export function compare(a, b, key) {
    if (a.length !== b.length || a.some((r, i) => r.seed !== b[i].seed)) throw new Error("breachCourierTask.compare: the crews were not flown on the same seeds in the same order");
    const v = (r) => (key === "survived" ? (r.survived ? 1 : 0) : r[key]);
    const aMore = a.filter((r, i) => v(r) > v(b[i])).length, bMore = a.filter((r, i) => v(r) < v(b[i])).length;
    return { aMore, bMore, pA: signTest(aMore, bMore), pB: signTest(bMore, aMore) };
}

/** The registered verdict over the four crews' paired runs: V1 (COMBINED against FIXED on each outcome) and V2 (COMBINES, or INTERFERES naming what it loses). */
export function verdict({ FIXED, "ROUTE+DC": ROUTE, TRIAGE, COMBINED }) {
    const sF = compare(COMBINED, FIXED, "survived"), gF = compare(COMBINED, FIXED, "goals"), sT = compare(COMBINED, TRIAGE, "survived"), gR = compare(COMBINED, ROUTE, "goals");
    const loses = [];
    if (sT.pB <= 0.05 && sT.bMore > sT.aMore) loses.push("TRIAGE's survival");
    if (gR.pB <= 0.05 && gR.bMore > gR.aMore) loses.push("ROUTE's goals");
    return {
        v1Survival: sF.pA <= 0.05 && sF.aMore > sF.bMore ? "COMBINED BEATS FIXED ON SURVIVAL" : sF.pB <= 0.05 && sF.bMore > sF.aMore ? "FIXED BEATS COMBINED ON SURVIVAL" : "NO DIFFERENCE SHOWN ON SURVIVAL",
        v1Goals: gF.pA <= 0.05 && gF.aMore > gF.bMore ? "COMBINED BEATS FIXED ON GOALS" : gF.pB <= 0.05 && gF.bMore > gF.aMore ? "FIXED BEATS COMBINED ON GOALS" : "NO DIFFERENCE SHOWN ON GOALS",
        v2: loses.length ? `COMBINED INTERFERES: it loses ${loses.join(" and ")}` : "COMBINED COMBINES",
        pairs: { survivalVsFixed: sF, goalsVsFixed: gF, survivalVsTriage: sT, goalsVsRoute: gR },
    };
}
