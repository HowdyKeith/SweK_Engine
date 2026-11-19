// WebGLEngine/brain/courierTask.mjs -- UNNUMBERED (the version is chosen at ship time; registered in brain/SUB_STATIONS_WIP.md section 14 before this file; the gate is brain/courierTask-selfcheck.mjs)
//
// ROUND 4 OF THE SUBMARINE STATIONS: a COURIER with a battery in the Sub Aquarium's sea. The navigator (brain/subTankNav.mjs) supplies the mission every tick; three crews decide when to go up for charge:
//   NAV    nothing (it runs flat)        FIXED  the energy station by rank (up wherever its rule says)
//   LEGS   charges BETWEEN LEGS: at each arrival, if the charge is under the next leg's need (the charge spent per metre so far x the straight distance x 1.5, + 0.05), it charges there to the need + 0.2 (at most 0.95);
//          mid-leg only in an emergency (under 0.10). The energy station's pump and repair asks pass; its surface claims do not.
// 1,200 s, the needs-task vessel, a battery U(0.15, 0.45) per seed, starting at (20, 150) at 20 m. Pure: no I/O, no clock, no Math.random (seeded).
"use strict";
import * as SS from "./subStations.mjs";
import * as AV from "./needsAdvisor.mjs";
import * as TN from "./subTankNav.mjs";
import * as AS from "./autopilotSub.mjs";
import * as NT from "./needsTask.mjs";
import * as N from "../physics/mechanics/subNeeds.mjs";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import { mulberry } from "./pilotSubPolicy.mjs";

export const SECONDS = 1200, START = Object.freeze({ x: 20, y: 150, depth: 20, speed: 2 }), CHARGE = Object.freeze([0.15, 0.45]), ARM = "any+predict";
export const LEGS = Object.freeze({ priorPerM: 0.001, priorUntilM: 50, margin: 1.5, plus: 0.05, over: 0.2, cap: 0.95, emergency: 0.1 });
export const CREWS = Object.freeze(["NAV", "FIXED", "LEGS", "ROUTE"]);   // ROUTE: round 5 (section 16), LEGS with the navigator's planned route as the leg's length
export const DEV_SET = Object.freeze(Array.from({ length: 24 }, (_, i) => 175001 + i)), HELD_SET = Object.freeze(Array.from({ length: 96 }, (_, i) => 177001 + i));
export const R5_DEV_SET = Object.freeze(Array.from({ length: 24 }, (_, i) => 181001 + i)), R5_HELD_SET = Object.freeze(Array.from({ length: 96 }, (_, i) => 183001 + i));   // round 5's sets
const MODEL = NT.model();

/** The battery of a seed: a fraction of capacity, U(0.15, 0.45). */
export function chargeOf(seed) {
    if (!Number.isInteger(seed) || seed < 0) throw new Error(`courierTask.chargeOf: a seed is a whole number, got ${seed}`);
    return CHARGE[0] + (CHARGE[1] - CHARGE[0]) * mulberry((seed * 3266489917) >>> 0)();
}

/** A leg's need: the charge per metre (spent / travel, or the prior before priorUntilM of travel) x the distance x margin, + plus. */
export function legNeed(spent, travel, dist, k = LEGS) {
    const perM = travel >= k.priorUntilM ? spent / travel : k.priorPerM;
    return perM * dist * k.margin + k.plus;
}

/**
 * THE LEGS STATION: a target station at the energy priority. `read()` the needs readings, `nav` the navigator (its snapshot: arrivals, goal, travel), `pos()` the boat's [x, y]. It keeps the charge it has SPENT (the sum of every fall
 * of the reading; a rise is charging) and decides at each arrival -- and at the first tick -- whether to charge there; mid-leg only under `emergency`. `.state` is { chargeTo, decisions, emergencies }.
 */
export function legsStation({ read, nav, pos, k = LEGS, route = false } = {}) {
    let chargeTo = null, seen = null, lastFrac = null, spent = 0, decisions = 0, emergencies = 0;
    const st = SS.gatedStation({ name: "legs", kind: "target", priority: SS.PRIORITY.energy, propose: ({ target }) => {
        const r = read(), sn = nav.snapshot();
        if (lastFrac !== null && r.frac < lastFrac) spent += lastFrac - r.frac;
        lastFrac = r.frac;
        const [x, y] = pos(), straight = sn.goal ? Math.hypot(sn.goal.x - x, sn.goal.y - y) : 0, planned = route && typeof nav.routeLength === "function" ? nav.routeLength(x, y) : null;
        const dist = planned === null ? straight : planned, need = legNeed(spent, sn.travel, dist, k);   // round 5 (ROUTE): the planned route's length where there is one, else the straight line
        if (sn.arrivals !== seen) { seen = sn.arrivals; decisions++; if (chargeTo === null && r.frac < need) chargeTo = Math.min(k.cap, need + k.over); }
        if (chargeTo === null && r.frac < k.emergency) { emergencies++; chargeTo = Math.min(k.cap, k.emergency + need + k.over); }
        if (chargeTo !== null && r.frac >= chargeTo) chargeTo = null;
        if (chargeTo === null) return { claim: null, aux: null, reason: null };
        return { claim: AV.surfaceTarget(target, r), aux: null, reason: `charging between legs to ${Math.round(chargeTo * 100)}%` };
    } }, () => true);
    Object.defineProperty(st, "state", { get: () => ({ chargeTo, decisions, emergencies, spent }) });
    return st;
}

/** The captain of a crew over { read, nav, pos }. */
export function crew(name, ctx) {
    const helm = SS.helmOf(AS.pilot(), { model: MODEL });
    if (name === "NAV") return SS.captain({ helm });
    if (name === "FIXED") return SS.captain({ helm, stations: [SS.energyStation({ read: ctx.read })] });
    if (name === "LEGS") return SS.captain({ helm, stations: [legsStation(ctx), SS.gatedStation(SS.energyStation({ read: ctx.read }), () => false)] });
    if (name === "ROUTE") return SS.captain({ helm, stations: [legsStation({ ...ctx, route: true }), SS.gatedStation(SS.energyStation({ read: ctx.read }), () => false)] });
    throw new Error(`courierTask.crew: no crew named ${JSON.stringify(name)} (${CREWS.join(", ")})`);
}

/** One run: { seed, crew, c0, goals, status, lost, emptyS, chargingS, hits, finalFrac }. */
export function run(seed, name, { seconds = SECONDS, dt = S.DT } = {}) {
    const c0 = chargeOf(seed), scene = TN.tankScene(seed), nav = TN.createNavigator(scene, { arm: ARM, seed });
    let s = S.createState({ depth: START.depth, speed: START.speed, model: MODEL, pos: [START.x, START.y, -START.depth] }), needs = N.initialNeeds("battery", { crushDepth: 60 });
    needs.energy = N.CLASSES.battery.capacityJ * c0;
    const read = () => N.readings(MODEL, needs, s), cap = crew(name, { read, nav, pos: () => [s.pos[0], s.pos[1]] });
    let status = "submerged", t = 0, empty = 0, charging = 0;
    const total = Math.round(seconds / dt);
    for (let i = 0; i < total; i++) {
        const mission = nav.step(s, t, dt, null, true), cmd = cap(s, mission, [0, 0, 0]);
        const res = N.stepNeeds(MODEL, s, needs, cmd, dt, [0, 0, 0], 0, cap.aux);
        s = res.state; needs = res.needs; t += dt;
        if (needs.energy <= 0) empty++; if (res.charging) charging++;
        if (res.status !== "submerged" || !Number.isFinite(s.pos[2])) { status = res.status === "submerged" ? "lost" : res.status; break; }
    }
    const sn = nav.snapshot();
    return { seed, crew: name, c0, goals: sn.arrivals, status, lost: status !== "submerged", emptyS: empty * dt, chargingS: charging * dt, hits: sn.hits, finalFrac: read().frac };
}

/** The exact one-sided sign test: P(X >= wins) for X ~ Binomial(wins + losses, 1/2); 1 with no pairs. */
export function signTest(wins, losses) {
    const n = wins + losses; if (n === 0) return 1;
    let p = 0, c = 1; for (let k = 0; k <= n; k++) { if (k >= wins) p += c; c = (c * (n - k)) / (k + 1); }
    return p / 2 ** n;
}

/** The registered verdict of LEGS against FIXED over paired runs (same seeds, same order). Round 5 reads ROUTE against LEGS with the same function (its words name the first argument LEGS and the second FIXED: the caller says which is which). */
export function verdict(legs, fixed) {
    if (legs.length !== fixed.length || legs.some((r, i) => r.seed !== fixed[i].seed)) throw new Error("courierTask.verdict: the crews were not flown on the same seeds in the same order");
    const mean = (xs) => xs.reduce((a, r) => a + r.goals, 0) / xs.length, mL = mean(legs), mF = mean(fixed);
    const up = legs.filter((r, i) => r.goals > fixed[i].goals).length, down = legs.filter((r, i) => r.goals < fixed[i].goals).length, pL = signTest(up, down), pF = signTest(down, up);
    const v = mL > mF && pL <= 0.05 ? "LEGS BEATS FIXED" : mF > mL && pF <= 0.05 ? "FIXED BEATS LEGS" : "NO DIFFERENCE SHOWN";
    return { verdict: v, legs: mL, fixed: mF, legsMore: up, fixedMore: down, pLegs: pL, pFixed: pF, n: legs.length };
}
