// WebGLEngine/tools/ship/adaptiveCapStudy.mjs -- the space doctrine's ROUND 4 (brain/SPACE_DOCTRINE_WIP.md; backlog space-cap-adaptive)
//
// Can one rule keep cap 12's win against weak gunners (regular, green) and take cap 20's against strong ones (ace, perfect)? Three arms on battleshipFight.build, nothing in the arena edited:
//   FIXED12, FIXED20 -- Round 1's arm C at that cap (thrust 0 at or over the cap's closing speed to the nearest foe);
//   ADAPT            -- the cap starts at 12 and the team LATCHES to 20 for the rest of the fight once at least K of its fighters are dead while the capital ship is undamaged.
// DEV (space seeds 4501-4530 x 4 kinds x 4 presets) is checks only; HELD (4601-4660) is flown once. The command is adaptiveCapStudyCmd.mjs (export-free); the gate is adaptiveCapStudy-selfcheck.mjs.
"use strict";

import * as BF from "../../brain/battleshipFight.mjs";
import * as SA from "../../brain/spaceArena.mjs";
import * as AP from "../../brain/autopilot6dof.mjs";
import { closingSpeed, rOf, median, TIE_EPS, FLOOR_MIN, ALPHA, SECONDS } from "./spaceDoctrineStudy.mjs";
import { signTest } from "./subGiveWayStudy.mjs";

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
export const PRESETS = Object.freeze(["regular", "green", "ace", "perfect"]);
export const WEAK = Object.freeze(["regular", "green"]), STRONG = Object.freeze(["ace", "perfect"]);
export const ARMS = Object.freeze(["FIXED12", "FIXED20", "ADAPT"]);
export const LOW = 12, HIGH = 20, K = 1;   // K fixed by the survey on throwaway seeds 9990049-9990060 (the only K within 10% of the better fixed cap under all four presets)
export const DEV_SEEDS = Object.freeze(range(4501, 4530));
export const HELD_SEEDS = Object.freeze(range(4601, 4660));
export const SPENT = Object.freeze({ survey: [9990049, 9990060] });
export const scenariosOf = (seeds) => seeds.flatMap((seed) => BF.KINDS.map((kind) => ({ seed, kind })));

/** Should the team latch now? At least `k` of its fighters dead, and the ship undamaged. */
export const shouldLatch = (lost, shipHp, shipHpMax, k = K) => lost >= k && shipHp >= shipHpMax;

/**
 * One fight in one arm: { seed, kind, preset, arm, R, damageOnShip, shipDead, t, over, latchedAt (tick or null), latch: { lost, shipHp, shipHpMax } | null, overCap, notCut, decisions }.
 * The fight is stepped by hand: the closing speed is read at each tick's start (the states the arena decides on), and the cap check reads the ARENA's record of the thrust, not the wrapper's.
 */
export function flyOne({ seed, kind, preset, arm }) {
    if (!ARMS.includes(arm)) throw new Error(`adaptiveCapStudy.flyOne: arm must be one of ${ARMS.join(", ")} (got ${arm})`);
    let arena = null, latchedAt = null, latch = null;
    const capNow = () => (arm === "FIXED12" ? LOW : arm === "FIXED20" ? HIGH : latchedAt === null ? LOW : HIGH);
    const pilot = (body, target, opts) => {
        const d = AP.decide(body, target, opts), c = arena.crafts.find((x) => x.body === body), foe = c ? SA.nearestFoe(arena, c) : null;
        if (arm === "ADAPT" && latchedAt === null && c) {
            const ship = arena.crafts.find((x) => x.kind === "capital"), lost = arena.crafts.filter((x) => x.kind === "fighter" && x.team === c.team && x.dead).length;
            if (shouldLatch(lost, ship.hp, ship.hpMax)) { latchedAt = arena.i; latch = { lost, shipHp: ship.hp, shipHpMax: ship.hpMax }; }
        }
        return foe && closingSpeed(body, foe.body) >= capNow() ? { ...d, thrust: 0 } : d;
    };
    arena = BF.build(seed, kind, { gunners: preset, pilot }).arena;
    const raiders = arena.crafts.filter((c) => c.kind === "fighter");
    let overCap = 0, notCut = 0, decisions = 0;
    while (!arena.done) {
        const flying = raiders.filter((c) => !c.dead), start = new Map();
        for (const c of flying) { const f = SA.nearestFoe(arena, c); if (f) start.set(c.id, closingSpeed(c.body, f.body)); }
        const latchedBefore = latchedAt;
        SA.stepSpaceArena(arena);
        // the cap in force for this tick's decisions: the latch set DURING this tick's decisions applies to the deciders after it, so a tick in which it fired is not graded
        const cap = arm === "FIXED12" ? LOW : arm === "FIXED20" ? HIGH : latchedBefore === null ? (latchedAt === null ? LOW : null) : HIGH;
        for (const c of flying) { decisions++; if (cap !== null && start.has(c.id) && start.get(c.id) >= cap) { overCap++; if (!(c.last && c.last.thrust === 0)) notCut++; } }
    }
    const t = BF.tally(arena);
    return { seed, kind, preset, arm, R: rOf(t), damageOnShip: t.damageOnShip, shipDead: t.ship.status !== "flying", t: t.t, over: t.over, latchedAt, latch, overCap, notCut, decisions };
}

/** Arm A against arm B within one preset, by (seed, kind), on R: { verdict: "<A> BETTER" | "<B> BETTER" | FLOOR | NO DIFFERENCE SHOWN, wins, losses, ties, n, p }. */
export function verdictOf(rows, preset, a, b) {
    const A = rows.filter((r) => r.preset === preset && r.arm === a), B = rows.filter((r) => r.preset === preset && r.arm === b);
    if (!A.length || A.length !== B.length || A.some((r, i) => r.seed !== B[i].seed || r.kind !== B[i].kind)) throw new Error(`adaptiveCapStudy.verdictOf: ${a} and ${b} are not on the same scenarios under ${preset}`);
    const d = A.map((r, i) => r.R - B[i].R), wins = d.filter((x) => x >= TIE_EPS).length, losses = d.filter((x) => x <= -TIE_EPS).length, n = wins + losses, p = signTest(wins, n);
    const verdict = n < FLOOR_MIN ? "FLOOR" : wins > losses && p <= ALPHA ? `${a} BETTER` : losses > wins && p <= ALPHA ? `${b} BETTER` : "NO DIFFERENCE SHOWN";
    return { verdict, wins, losses, ties: d.length - n, n, p, median: median(d.filter((x) => Math.abs(x) >= TIE_EPS)) };
}

/** HELD's reading: the weak side (ADAPT vs FIXED12 under regular and green), the strong side (ADAPT vs FIXED20, and vs FIXED12, under ace and perfect), the bottom line, every pair, and the means. */
export function readHeld(rows) {
    const pairs = {};
    for (const p of PRESETS) pairs[p] = { vs12: verdictOf(rows, p, "ADAPT", "FIXED12"), vs20: verdictOf(rows, p, "ADAPT", "FIXED20"), f20vs12: verdictOf(rows, p, "FIXED20", "FIXED12") };
    const weakFails = WEAK.filter((p) => pairs[p].vs12.verdict === "FIXED12 BETTER");
    const strongFails = STRONG.filter((p) => pairs[p].vs20.verdict === "FIXED20 BETTER" || pairs[p].vs12.verdict !== "ADAPT BETTER");
    const bottom = !weakFails.length && !strongFails.length ? "THE ADAPTIVE CAP HAS BOTH"
        : weakFails.length && !strongFails.length ? `THE ADAPTIVE CAP PAYS ON THE WEAK SIDE (${weakFails.join(", ")})`
        : !weakFails.length ? `THE ADAPTIVE CAP MISSES THE STRONG SIDE (${strongFails.join(", ")})`
        : `THE ADAPTIVE CAP HAS NEITHER (${[...weakFails, ...strongFails].join(", ")})`;
    const means = {};
    for (const p of PRESETS) for (const a of ARMS) {
        const rs = rows.filter((r) => r.preset === p && r.arm === a), L = rs.filter((r) => r.latchedAt !== null);
        means[`${p} ${a}`] = { n: rs.length, R: rs.reduce((x, r) => x + r.R, 0) / Math.max(1, rs.length), shipDead: rs.filter((r) => r.shipDead).length, latched: L.length,
            latchT: L.length ? L.reduce((x, r) => x + r.latchedAt, 0) / L.length / 30 : null, latchLost: L.length ? L.reduce((x, r) => x + r.latch.lost, 0) / L.length : null };
    }
    return { pairs, weakFails, strongFails, bottom, means };
}

/** DEV's checks: THE LATCH FIRES (under ace and perfect; never before a loss, never with the ship damaged), THE CAP IS APPLIED (and an unlatched ADAPT fight is FIXED12's, R for R), EVERY FIGHT ENDS. */
export function devChecks(rows) {
    const A = rows.filter((r) => r.arm === "ADAPT"), F12 = rows.filter((r) => r.arm === "FIXED12");
    const latchedIn = (p) => A.filter((r) => r.preset === p && r.latchedAt !== null).length;
    const badLatch = A.filter((r) => r.latch && !(r.latch.lost >= K && r.latch.shipHp >= r.latch.shipHpMax)).length;
    const twin = (r) => F12.find((x) => x.preset === r.preset && x.seed === r.seed && x.kind === r.kind);
    const unlatched = A.filter((r) => r.latchedAt === null), sameAsFixed = unlatched.every((r) => { const f = twin(r); return !!f && f.R === r.R && f.t === r.t && f.damageOnShip === r.damageOnShip; });
    return {
        latchFires: { ok: STRONG.every((p) => latchedIn(p) > 0) && badLatch === 0, byPreset: Object.fromEntries(PRESETS.map((p) => [p, latchedIn(p)])), badLatch },
        capApplied: { ok: rows.length > 0 && rows.reduce((a, r) => a + r.overCap, 0) > 0 && rows.every((r) => r.notCut === 0) && unlatched.length > 0 && sameAsFixed, overCap: rows.reduce((a, r) => a + r.overCap, 0), notCut: rows.reduce((a, r) => a + r.notCut, 0), unlatched: unlatched.length, sameAsFixed },
        allEnd: { ok: rows.length > 0 && rows.every((r) => r.over && r.t <= SECONDS + 1e-9), n: rows.length },
    };
}

export function reportLines() {
    return ["[adaptiveCapStudy] the space doctrine's ROUND 4: an adaptive cap (12, latched to 20 once a fighter is lost with the ship unhurt) against fixed 12 and fixed 20, under all four gunner presets (brain/SPACE_DOCTRINE_WIP.md)",
        `  K ${K}; DEV ${DEV_SEEDS[0]}-${DEV_SEEDS.at(-1)}; HELD ${HELD_SEEDS[0]}-${HELD_SEEDS.at(-1)}`];
}
