// WebGLEngine/tools/ship/signalCapStudy.mjs -- the space doctrine's ROUND 5 (brain/SPACE_DOCTRINE_WIP.md; backlog space-cap-signal)
//
// A cap chosen by a SIGNAL: every fighter starts capped at 12; at the first decision at or after DECIDE_T the team reads the damage its fighters have taken from hits up to the previous tick, and
// at THRESHOLD or more the cap is 20 for the rest of the fight (else 12). Both numbers are fixed from the survey on throwaway seeds 9990061-9990072 (at 4 s, >= 20 calls weak against strong gunners
// right in 98.4% of fights). Arms FIXED12, FIXED20 (adaptiveCapStudy's) and SIGNAL; Round 4's verdict word for word with SIGNAL in ADAPT's place. DEV (4701-4730) checks only; HELD (4801-4920,
// doubled after Round 4 failed on the floor under perfect) flown once. The command is signalCapStudyCmd.mjs (export-free); the gate is signalCapStudy-selfcheck.mjs.
"use strict";

import * as BF from "../../brain/battleshipFight.mjs";
import * as SA from "../../brain/spaceArena.mjs";
import * as AP from "../../brain/autopilot6dof.mjs";
import { closingSpeed, rOf, SECONDS } from "./spaceDoctrineStudy.mjs";
import { PRESETS, WEAK, STRONG, LOW, HIGH, verdictOf } from "./adaptiveCapStudy.mjs";

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
export { PRESETS, WEAK, STRONG, LOW, HIGH };
export const ARMS = Object.freeze(["FIXED12", "FIXED20", "SIGNAL"]);
export const DECIDE_T = 4, THRESHOLD = 20;   // fixed by the survey (brain/SPACE_DOCTRINE_WIP.md, ROUND 5)
export const DEV_SEEDS = Object.freeze(range(4701, 4730));
export const HELD_SEEDS = Object.freeze(range(4801, 4920));
export const SPENT = Object.freeze({ survey: [9990061, 9990072] });
export const scenariosOf = (seeds) => seeds.flatMap((seed) => BF.KINDS.map((kind) => ({ seed, kind })));

/** The signal's choice from the damage the team has taken: HIGH at or over THRESHOLD, else LOW. */
export const capFromSignal = (damage) => (damage >= THRESHOLD ? HIGH : LOW);

/**
 * One fight in one arm: { seed, kind, preset, arm, R, damageOnShip, shipDead, t, over, decidedAt (tick or null), damageAtDecision, chosen (the cap the signal chose, or null), overCap, notCut }.
 * The team's damage is the sum of the hit events on its fighters, accumulated after each tick; the pilot reads what was accumulated up to the previous tick.
 */
export function flyOne({ seed, kind, preset, arm }) {
    if (!ARMS.includes(arm)) throw new Error(`signalCapStudy.flyOne: arm must be one of ${ARMS.join(", ")} (got ${arm})`);
    let arena = null, damage = 0, decidedAt = null, damageAtDecision = null, chosen = null;
    const capNow = () => (arm === "FIXED12" ? LOW : arm === "FIXED20" ? HIGH : chosen === null ? LOW : chosen);
    const pilot = (body, target, opts) => {
        if (arm === "SIGNAL" && chosen === null && arena.i * arena.dt >= DECIDE_T - 1e-9) { decidedAt = arena.i; damageAtDecision = damage; chosen = capFromSignal(damage); }
        const d = AP.decide(body, target, opts), c = arena.crafts.find((x) => x.body === body), foe = c ? SA.nearestFoe(arena, c) : null;
        return foe && closingSpeed(body, foe.body) >= capNow() ? { ...d, thrust: 0 } : d;
    };
    arena = BF.build(seed, kind, { gunners: preset, pilot }).arena;
    const raiders = arena.crafts.filter((c) => c.kind === "fighter"), team = new Set(raiders.map((c) => c.id));
    let overCap = 0, notCut = 0;
    while (!arena.done) {
        const flying = raiders.filter((c) => !c.dead), start = new Map();
        for (const c of flying) { const f = SA.nearestFoe(arena, c); if (f) start.set(c.id, closingSpeed(c.body, f.body)); }
        const chosenBefore = chosen;
        SA.stepSpaceArena(arena);
        // the cap in force for this tick's decisions; the tick in which the signal decided is not graded (its deciders straddle the choice)
        const cap = arm === "FIXED12" ? LOW : arm === "FIXED20" ? HIGH : chosenBefore !== null ? chosenBefore : chosen === null ? LOW : null;
        for (const c of flying) if (cap !== null && start.has(c.id) && start.get(c.id) >= cap) { overCap++; if (!(c.last && c.last.thrust === 0)) notCut++; }
        for (const e of arena.events) if (e.type === "hit" && team.has(e.victim)) damage += e.damage;
    }
    const t = BF.tally(arena);
    return { seed, kind, preset, arm, R: rOf(t), damageOnShip: t.damageOnShip, shipDead: t.ship.status !== "flying", t: t.t, over: t.over, decidedAt, damageAtDecision, chosen, overCap, notCut };
}

/** HELD's reading: Round 4's with SIGNAL in ADAPT's place, and the signal's choices per preset. */
export function readHeld(rows) {
    const pairs = {};
    for (const p of PRESETS) pairs[p] = { vs12: verdictOf(rows, p, "SIGNAL", "FIXED12"), vs20: verdictOf(rows, p, "SIGNAL", "FIXED20"), f20vs12: verdictOf(rows, p, "FIXED20", "FIXED12") };
    const weakFails = WEAK.filter((p) => pairs[p].vs12.verdict === "FIXED12 BETTER");
    const strongFails = STRONG.filter((p) => pairs[p].vs20.verdict === "FIXED20 BETTER" || pairs[p].vs12.verdict !== "SIGNAL BETTER");
    const bottom = !weakFails.length && !strongFails.length ? "THE SIGNAL CAP HAS BOTH"
        : weakFails.length && !strongFails.length ? `THE SIGNAL CAP PAYS ON THE WEAK SIDE (${weakFails.join(", ")})`
        : !weakFails.length ? `THE SIGNAL CAP MISSES THE STRONG SIDE (${strongFails.join(", ")})`
        : `THE SIGNAL CAP HAS NEITHER (${[...weakFails, ...strongFails].join(", ")})`;
    const means = {}, choices = {};
    for (const p of PRESETS) {
        for (const a of ARMS) { const rs = rows.filter((r) => r.preset === p && r.arm === a); means[`${p} ${a}`] = { n: rs.length, R: rs.reduce((x, r) => x + r.R, 0) / Math.max(1, rs.length), shipDead: rs.filter((r) => r.shipDead).length }; }
        const S = rows.filter((r) => r.preset === p && r.arm === "SIGNAL"), decided = S.filter((r) => r.chosen !== null);
        const right = decided.filter((r) => (r.chosen === HIGH) === STRONG.includes(p)).length;
        choices[p] = { n: S.length, decided: decided.length, chose20: decided.filter((r) => r.chosen === HIGH).length, right, meanDamage: decided.reduce((x, r) => x + r.damageAtDecision, 0) / Math.max(1, decided.length) };
    }
    const all = Object.values(choices), accuracy = all.reduce((a, c) => a + c.right, 0) / Math.max(1, all.reduce((a, c) => a + c.decided, 0));
    return { pairs, weakFails, strongFails, bottom, means, choices, accuracy };
}

/** DEV's checks: THE SIGNAL DECIDES, THE CAP IS APPLIED (a SIGNAL fight that chose 12 is FIXED12's), EVERY FIGHT ENDS. */
export function devChecks(rows) {
    const S = rows.filter((r) => r.arm === "SIGNAL"), F12 = rows.filter((r) => r.arm === "FIXED12");
    const reached = S.filter((r) => r.t >= DECIDE_T), decidedRight = reached.every((r) => r.decidedAt !== null && Math.abs(r.decidedAt / 30 - DECIDE_T) < 1 / 30 + 1e-9 && r.chosen === capFromSignal(r.damageAtDecision));
    const chose = (ps, cap) => ps.every((p) => S.some((r) => r.preset === p && r.chosen === cap));
    const twin = (r) => F12.find((x) => x.preset === r.preset && x.seed === r.seed && x.kind === r.kind);
    const low = S.filter((r) => r.chosen === LOW || r.chosen === null), sameAsFixed = low.every((r) => { const f = twin(r); return !!f && f.R === r.R && f.t === r.t && f.damageOnShip === r.damageOnShip; });
    return {
        signalDecides: { ok: reached.length > 0 && decidedRight && chose(STRONG, HIGH) && chose(WEAK, LOW), reached: reached.length, chose20: S.filter((r) => r.chosen === HIGH).length },
        capApplied: { ok: rows.reduce((a, r) => a + r.overCap, 0) > 0 && rows.every((r) => r.notCut === 0) && low.length > 0 && sameAsFixed, overCap: rows.reduce((a, r) => a + r.overCap, 0), notCut: rows.reduce((a, r) => a + r.notCut, 0), chose12: low.length, sameAsFixed },
        allEnd: { ok: rows.length > 0 && rows.every((r) => r.over && r.t <= SECONDS + 1e-9), n: rows.length },
    };
}

export function reportLines() {
    return ["[signalCapStudy] the space doctrine's ROUND 5: the cap chosen at 4 s by the damage the team has taken (>= 20: cap 20, else 12), against fixed 12 and fixed 20 under all four presets (brain/SPACE_DOCTRINE_WIP.md)",
        `  DECIDE_T ${DECIDE_T} s, THRESHOLD ${THRESHOLD}; DEV ${DEV_SEEDS[0]}-${DEV_SEEDS.at(-1)}; HELD ${HELD_SEEDS[0]}-${HELD_SEEDS.at(-1)}`];
}
