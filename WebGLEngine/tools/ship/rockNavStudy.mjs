// WebGLEngine/tools/ship/rockNavStudy.mjs -- the rock nav rounds (brain/ROCK_NAV_WIP.md)
//
// ROUND A: do fighters that fly the navigation layer (brain/spaceNav.mjs) outside the strafe range lose fewer of their number to the rock field
// on the approach than today's doctrine? Two arms on battleshipFight.build(seed, kind, { gunners: "regular", rocks: 24 }), nothing in
// spaceArena.mjs or battleshipFight.mjs edited:
//   D -- today's doctrine: no pilot.
//   N -- pilot = spaceNav.navPilot over a field built once at t = 0 toward the strafe sphere round the ship's start.
// The fight is stepped tick by tick so each fighter's approach is read: it ARRIVES at the first tick it is flying within SA.STRAFE_RANGE of the
// ship's centre. DEV (3101-3130 x 4 kinds) is checks only; HELD (3201-3290 x 4 kinds) is flown once. The command is rockNavStudyCmd.mjs
// (export-free); the gate is rockNavStudy-selfcheck.mjs.
"use strict";

import * as BF from "../../brain/battleshipFight.mjs";
import * as SA from "../../brain/spaceArena.mjs";
import * as AP from "../../brain/autopilot6dof.mjs";
import * as NV from "../../brain/spaceNav.mjs";
import { signTest } from "./subGiveWayStudy.mjs";
import { rOf, closingSpeed, CAP_CHOSEN } from "./spaceDoctrineStudy.mjs";

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
export const KINDS = BF.KINDS;
export const GUNNERS = "regular", ROCKS = 24, SECONDS = 120, ALPHA = 0.05, FLOOR_MIN = 20;
export const DEV_SEEDS = Object.freeze(range(3101, 3130));
export const HELD_SEEDS = Object.freeze(range(3201, 3290));
/** Reserved for Round B (registered after Round A is read); Round A spends none of them. */
export const RESERVED_B = Object.freeze({ dev: [3301, 3330], held: [3401, 3490] });
export const SPENT = Object.freeze({ gates: [41, 50], survey: [9990001, 9990006] });
export const ARMS = Object.freeze(["D", "N"]);
/** ROUND B (the clear lane): N, Round A's layer, against L, the same with the field's goal restricted to cells with a clear line to the ship's start. */
export const ARMS_B = Object.freeze(["N", "L"]);
export const DEV_B_SEEDS = Object.freeze(range(RESERVED_B.dev[0], RESERVED_B.dev[1]));
export const HELD_B_SEEDS = Object.freeze(range(RESERVED_B.held[0], RESERVED_B.held[1]));
/** ROUND C (the field that follows the ship): L, Round B's lane field built once, against F, the same field rebuilt round the ship every FOLLOW_EVERY ticks. */
export const ARMS_C = Object.freeze(["L", "F"]);
/** ROUND D (the lane with the doctrine's cap): L against LC, the same pilot with the thrust cut whenever the closing speed to the nearest foe is at or above CAP_D. */
export const ARMS_D = Object.freeze(["L", "LC"]);
/** ROUND E (Round C again, the empty-lane defect fixed in brain/spaceNav.mjs): L against FX, the following field on the fixed library. */
export const ARMS_E = Object.freeze(["L", "FX"]);
export const DEV_E_SEEDS = Object.freeze(range(3901, 3930));
export const HELD_E_SEEDS = Object.freeze(range(4001, 4090));
/** ROUND F: the replication of Round E, word for word (its arms, checks and verdict), on fresh seeds. */
export const ARMS_F = ARMS_E;
export const DEV_F_SEEDS = Object.freeze(range(4101, 4130));
export const HELD_F_SEEDS = Object.freeze(range(4201, 4290));
export const CAP_D = CAP_CHOSEN;   // 12: the space-doctrine round's own choice (brain/SPACE_DOCTRINE_WIP.md), not chosen here
export const DEV_D_SEEDS = Object.freeze(range(3701, 3730));
export const HELD_D_SEEDS = Object.freeze(range(3801, 3890));
export const FOLLOW_EVERY = 60;   // 2 s; fixed from the survey on throwaway seeds 9990013-9990018 (brain/ROCK_NAV_WIP.md, Round C)
export const DEV_C_SEEDS = Object.freeze(range(3501, 3530));
export const HELD_C_SEEDS = Object.freeze(range(3601, 3690));

export const scenariosOf = (seeds) => seeds.flatMap((seed) => KINDS.map((kind) => ({ seed, kind })));
const fold = (h, x) => { const s = x.toFixed(6); for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0; return h; };
/** A fingerprint of an arena's rocks and fighter starts (check 1, SAME FIELD). */
export function fieldKey(arena) {
    let h = 2166136261;
    for (const q of arena.rocks || []) { for (const c of q.pos) h = fold(h, c); h = fold(h, q.radius); }
    for (const c of arena.crafts) if (c.kind === "fighter") for (const x of c.body.pos) h = fold(h, x);
    return h.toString(16);
}

/**
 * One fight in one arm: { seed, kind, arm, approachStruck, approachShot, arrived, combatStruck, struck, arrivalT[], R, damageOnShip, shipDead, over,
 * t, drift, fieldKey, probe (N only: calls, aimed, fallback, near, handBack, handBackMismatch, aimBlocked, rockCentresBlocked) }.
 */
export function flyOne({ seed, kind, arm }) {
    const ALL = [...new Set([...ARMS, ...ARMS_B, ...ARMS_C, ...ARMS_D, ...ARMS_E])];
    if (!ALL.includes(arm)) throw new Error(`rockNavStudy.flyOne: arm must be one of ${ALL.join(", ")} (got ${arm})`);
    const layered = arm !== "D";
    let arena = null, field = null, probe = null, pilot, follow = null, buildMs = 0;
    const seen = new Set();   // every field object an aim was drawn from (Round C: each build)
    if (layered) {
        probe = { calls: 0, aimed: 0, fallback: 0, near: 0, handBack: 0, handBackMismatch: 0, aimBlocked: 0, overCap: 0, capCut: 0, capNotCut: 0, last: null };
        let nav = null;
        pilot = (body, target, opts) => {
            if (!nav) nav = NV.navPilot(() => arena, follow ? () => { const n = follow.builds.length, t0 = Date.now(), F = follow(); if (follow.builds.length > n) buildMs += Date.now() - t0; return F; } : field, { probe });
            const out = nav(body, target, opts), F = probe.last.field;
            seen.add(F);
            if (probe.last.inside) { if (JSON.stringify(out) !== JSON.stringify(AP.decide(body, target, opts))) probe.handBackMismatch++; }
            else if (probe.last.aim && F.blocked[NV.indexOf(F, probe.last.aim)]) probe.aimBlocked++;
            // ROUND D: the cap, on the layer's output (the hand-back above is read before it). Counted in every layered arm; applied only in LC.
            const c = arena.crafts.find((x) => x.body === body), foe = c ? SA.nearestFoe(arena, c) : null;
            if (foe && closingSpeed(body, foe.body) >= CAP_D) {
                probe.overCap++;
                if (arm === "LC") { if (out.thrust > 0) probe.capCut++; return { ...out, thrust: 0 }; }
                if (out.thrust > 0) probe.capNotCut++;
            }
            return out;
        };
    }
    const b = BF.build(seed, kind, { gunners: GUNNERS, rocks: ROCKS, ...(pilot ? { pilot } : {}) });
    arena = b.arena;
    const ship = NV.shipOf(arena), start = [...ship.body.pos], key = fieldKey(arena);
    if (layered) {
        field = NV.buildField(arena.rocks, start, SA.STRAFE_RANGE, { lane: arm === "L" || arm === "F" || arm === "LC" || arm === "FX" });
        if (arm === "F" || arm === "FX") follow = NV.followingField(() => arena, arena.rocks, { every: FOLLOW_EVERY, lane: true });
        probe.rockCentresBlocked = arena.rocks.every((q) => field.blocked[NV.indexOf(field, q.pos)] === 1);
        let goalCells = 0, goalBlockedLine = 0;
        for (let v = 0; v < field.dist.length; v++) if (field.dist[v] === 0) {
            goalCells++;
            if (!NV.lineClear(field, NV.centreOf(field, Math.floor(v / (field.n * field.n)), Math.floor(v / field.n) % field.n, v % field.n), field.origin)) goalBlockedLine++;
        }
        probe.field = { origin: [...field.origin], goalR: field.goalR, lane: field.lane, goalCells, goalBlockedLine };
    }
    const fighters = arena.crafts.filter((c) => c.kind === "fighter"), state = new Map(fighters.map((c) => [c.id, "out"]));
    const row = { seed, kind, arm, approachStruck: 0, approachShot: 0, arrived: 0, combatStruck: 0, struck: 0, arrivalT: [] };
    const shipAt = new Map();   // the ship's position at the start of each tick: what a build in that tick must be centred on (Round C's check 3)
    while (!arena.done) {
        if (follow) shipAt.set(arena.i, [...ship.body.pos]);
        SA.stepSpaceArena(arena);
        const s = ship.body.pos;
        for (const c of fighters) {
            if (state.get(c.id) !== "out") continue;
            if (c.status === "struck") { row.approachStruck++; state.set(c.id, "lost"); }
            else if (c.status !== "flying" || c.dead || c.hp <= 0) { row.approachShot++; state.set(c.id, "lost"); }
            else if (Math.hypot(c.body.pos[0] - s[0], c.body.pos[1] - s[1], c.body.pos[2] - s[2]) <= SA.STRAFE_RANGE) { row.arrived++; row.arrivalT.push(arena.i * arena.dt); state.set(c.id, "in"); }
        }
    }
    for (const c of fighters) { if (c.status === "struck") row.struck++; if (c.status === "struck" && state.get(c.id) === "in") row.combatStruck++; }
    const t = BF.tally(arena);
    Object.assign(row, { R: rOf(t), damageOnShip: t.damageOnShip, shipDead: t.ship.status !== "flying", over: !!arena.over, t: arena.i * arena.dt,
        drift: Math.hypot(ship.body.pos[0] - start[0], ship.body.pos[1] - start[1], ship.body.pos[2] - start[2]), fieldKey: key });
    if (probe) {
        const fields = follow ? [...seen] : [field];
        const sound = rockCentresSound(fields, arena.rocks);
        probe.rockCentresBlockedAll = sound.ok; probe.fieldsChecked = fields.length; probe.rocksOffGrid = sound.offGrid;
        // ROUND E: how many builds were an empty lane that fell back, and how many builds had no goal cell at all (the defect; 0 on the fixed library)
        probe.laneEmptyBuilds = fields.filter((G) => G.laneEmpty === true).length;
        probe.buildsWithoutGoal = goallessBuilds(fields);
        probe.allLane = fields.every((G) => G.lane === true);
        probe.builds = follow ? follow.builds.length : 1;
        if (follow) {
            probe.buildMs = buildMs;
            probe.buildOriginDev = follow.builds.reduce((m, b) => { const s = shipAt.get(b.i); return Math.max(m, s ? Math.hypot(b.origin[0] - s[0], b.origin[1] - s[1], b.origin[2] - s[2]) : Infinity); }, 0);
        }
        const { last, ...p } = probe; row.probe = p;
    }
    return row;
}

/**
 * Round C's check 4 on a list of fields: every rock whose centre lies INSIDE a field's grid is blocked in it. A rock outside a build's cube is not in that
 * field at all (the grid is a cube round where the ship was; NV.indexOf would clamp it to an edge cell), so it is counted (offGrid) and not held to it.
 */
export function rockCentresSound(fields, rocks) {
    const onGrid = (G, p) => [0, 1, 2].every((ax) => Math.abs(p[ax] - G.origin[ax]) < G.half);
    let offGrid = 0;
    const ok = fields.length > 0 && fields.every((G) => rocks.every((q) => { if (!onGrid(G, q.pos)) { offGrid++; return true; } return G.blocked[NV.indexOf(G, q.pos)] === 1; }));
    return { ok, offGrid };
}

/** ROUND E: how many of these fields have no goal cell at all (every distance infinite) -- the empty-lane defect, which the fixed library never leaves. */
export const goallessBuilds = (fields) => fields.filter((G) => { for (let v = 0; v < G.dist.length; v++) if (G.dist[v] === 0) return false; return true; }).length;

export function median(xs) {
    if (!xs.length) return null;
    const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Pair arm N against arm D by (seed, kind). Throws when they are not on the same scenarios in the same order. */
export function pairsOf(n, d) {
    if (n.length !== d.length || n.some((r, i) => r.seed !== d[i].seed || r.kind !== d[i].kind)) throw new Error("rockNavStudy.pairsOf: the arms are not on the same scenarios");
    return n.map((r, i) => ({ seed: r.seed, kind: r.kind, n: r, d: d[i] }));
}

/** A sign-test verdict on per-pair differences `diffs` (positive favours the layer): LAYER BETTER / DOCTRINE BETTER / FLOOR / NO DIFFERENCE SHOWN. */
export function signVerdict(diffs, layerTotalBetter, doctrineTotalBetter) {
    const wins = diffs.filter((x) => x > 0).length, losses = diffs.filter((x) => x < 0).length, n = wins + losses, p = signTest(wins, n);
    let verdict;
    if (n < FLOOR_MIN) verdict = "FLOOR";
    else if (wins > losses && p <= ALPHA && layerTotalBetter) verdict = "LAYER BETTER";
    else if (losses > wins && p <= ALPHA && doctrineTotalBetter) verdict = "DOCTRINE BETTER";
    else verdict = "NO DIFFERENCE SHOWN";
    return { verdict, wins, losses, ties: diffs.length - n, n, p };
}

const sum = (rows, k) => rows.reduce((a, r) => a + r[k], 0);

/** HELD's reading: V1 (the approach), V2 (arrivals), the bottom line, and the reported readings. */
export function readHeld(rows) {
    const N = rows.filter((r) => r.arm === "N"), D = rows.filter((r) => r.arm === "D"), pairs = pairsOf(N, D);
    const v1 = signVerdict(pairs.map((p) => p.d.approachStruck - p.n.approachStruck), sum(N, "approachStruck") < sum(D, "approachStruck"), sum(N, "approachStruck") > sum(D, "approachStruck"));
    const v2 = signVerdict(pairs.map((p) => p.n.arrived - p.d.arrived), sum(N, "arrived") > sum(D, "arrived"), sum(N, "arrived") < sum(D, "arrived"));
    const combat = signVerdict(pairs.map((p) => p.d.combatStruck - p.n.combatStruck), sum(N, "combatStruck") < sum(D, "combatStruck"), sum(N, "combatStruck") > sum(D, "combatStruck"));
    const bottom = v1.verdict === "LAYER BETTER" ? (v2.verdict === "DOCTRINE BETTER" ? "THE LAYER AVOIDS ROCKS BY NOT ARRIVING" : "THE LAYER WINS THE APPROACH")
        : `THE LAYER DOES NOT WIN THE APPROACH (${v1.verdict})`;
    const arm = (rs) => ({ fights: rs.length, approachStruck: sum(rs, "approachStruck"), approachShot: sum(rs, "approachShot"), arrived: sum(rs, "arrived"), combatStruck: sum(rs, "combatStruck"),
        struck: sum(rs, "struck"), medianArrivalT: median(rs.flatMap((r) => r.arrivalT)), meanR: sum(rs, "R") / rs.length, meanDamage: sum(rs, "damageOnShip") / rs.length,
        shipDead: rs.filter((r) => r.shipDead).length, maxDrift: Math.max(...rs.map((r) => r.drift)) });
    const fallbacks = N.reduce((a, r) => a + (r.probe ? r.probe.fallback : 0), 0), near = N.reduce((a, r) => a + (r.probe ? r.probe.near : 0), 0);
    return { v1, v2, bottom, reported: { N: arm(N), D: arm(D), combatStruck: combat, fallbacks, near } };
}

const renameB = (v) => ({ ...v, verdict: v.verdict === "LAYER BETTER" ? "LANE BETTER" : v.verdict === "DOCTRINE BETTER" ? "N BETTER" : v.verdict });
/** ROUND B's HELD reading: V1 (strikes after arrival), V2 (the damage on the ship), the bottom line, and the reported readings. */
export function readHeldB(rows) {
    const L = rows.filter((r) => r.arm === "L"), N = rows.filter((r) => r.arm === "N"), pairs = pairsOf(L, N);   // pairsOf(n, d): here n is L, d is N
    const v1 = renameB(signVerdict(pairs.map((p) => p.d.combatStruck - p.n.combatStruck), sum(L, "combatStruck") < sum(N, "combatStruck"), sum(L, "combatStruck") > sum(N, "combatStruck")));
    const v2 = renameB(signVerdict(pairs.map((p) => p.n.damageOnShip - p.d.damageOnShip), sum(L, "damageOnShip") > sum(N, "damageOnShip"), sum(L, "damageOnShip") < sum(N, "damageOnShip")));
    const approach = renameB(signVerdict(pairs.map((p) => p.d.approachStruck - p.n.approachStruck), sum(L, "approachStruck") < sum(N, "approachStruck"), sum(L, "approachStruck") > sum(N, "approachStruck")));
    const bottom = v1.verdict === "LANE BETTER" ? (v2.verdict === "N BETTER" ? "THE LANE SAVES FIGHTERS AND HURTS THE SHIP LESS" : "THE LANE WINS THE STRAFE")
        : `THE LANE DOES NOT WIN THE STRAFE (${v1.verdict})`;
    const arm = (rs) => ({ fights: rs.length, approachStruck: sum(rs, "approachStruck"), approachShot: sum(rs, "approachShot"), arrived: sum(rs, "arrived"), combatStruck: sum(rs, "combatStruck"),
        struck: sum(rs, "struck"), medianArrivalT: median(rs.flatMap((r) => r.arrivalT)), meanR: sum(rs, "R") / rs.length, meanDamage: sum(rs, "damageOnShip") / rs.length,
        shipDead: rs.filter((r) => r.shipDead).length, maxDrift: Math.max(...rs.map((r) => r.drift)),
        fallbacks: rs.reduce((a, r) => a + (r.probe ? r.probe.fallback : 0), 0), near: rs.reduce((a, r) => a + (r.probe ? r.probe.near : 0), 0) });
    return { v1, v2, bottom, reported: { L: arm(L), N: arm(N), approachStruck: approach } };
}

/** ROUND B's DEV checks: SAME FIELD, THE HAND-BACK (both arms), THE LANE IS SOUND, THE FIELD IS SOUND (both arms), EVERY FIGHT ENDS. */
export function devChecksB(rows) {
    const L = rows.filter((r) => r.arm === "L"), N = rows.filter((r) => r.arm === "N"), both = [...L, ...N];
    let same = L.length > 0 && L.length === N.length;
    if (same) { try { same = pairsOf(L, N).every((p) => p.n.fieldKey === p.d.fieldKey); } catch { same = false; } }
    const tot = (rs, k) => rs.reduce((a, r) => a + ((r.probe || {})[k] || 0), 0), fld = (rs, k) => rs.reduce((a, r) => a + (((r.probe || {}).field || {})[k] || 0), 0);
    return {
        sameField: { ok: same, n: L.length },
        handBack: { ok: both.length > 0 && [L, N].every((rs) => tot(rs, "handBack") > 0) && tot(both, "handBackMismatch") === 0, handBack: tot(both, "handBack"), mismatches: tot(both, "handBackMismatch") },
        laneSound: { ok: L.length > 0 && L.every((r) => r.probe && r.probe.field && r.probe.field.lane === true && r.probe.field.goalCells > 0 && r.probe.field.goalBlockedLine === 0)
            && N.every((r) => r.probe && r.probe.field && r.probe.field.lane === false) && fld(N, "goalBlockedLine") > 0,
            laneGoalCells: fld(L, "goalCells"), laneBlocked: fld(L, "goalBlockedLine"), plainGoalCells: fld(N, "goalCells"), plainBlocked: fld(N, "goalBlockedLine") },
        fieldSound: { ok: both.length > 0 && tot(both, "aimBlocked") === 0 && both.every((r) => r.probe && r.probe.rockCentresBlocked === true), aimBlocked: tot(both, "aimBlocked") },
        allEnd: { ok: rows.length > 0 && rows.every((r) => r.over && r.t <= SECONDS + 1e-9), n: rows.length },
    };
}

const renameC = (v) => ({ ...v, verdict: v.verdict === "LAYER BETTER" ? "FOLLOW BETTER" : v.verdict === "DOCTRINE BETTER" ? "L BETTER" : v.verdict });
/** ROUND C's HELD reading: V1 (all rock strikes), V2 (the damage on the ship), the bottom line, and the reported readings. */
export function readHeldC(rows) {
    const F = rows.filter((r) => r.arm === "F"), L = rows.filter((r) => r.arm === "L"), pairs = pairsOf(F, L);   // pairsOf(n, d): here n is F, d is L
    const better = (k) => renameC(signVerdict(pairs.map((p) => p.d[k] - p.n[k]), sum(F, k) < sum(L, k), sum(F, k) > sum(L, k)));
    const v1 = better("struck");
    const v2 = renameC(signVerdict(pairs.map((p) => p.n.damageOnShip - p.d.damageOnShip), sum(F, "damageOnShip") > sum(L, "damageOnShip"), sum(F, "damageOnShip") < sum(L, "damageOnShip")));
    const bottom = v1.verdict === "FOLLOW BETTER" ? (v2.verdict === "L BETTER" ? "THE FOLLOWING FIELD SAVES FIGHTERS AND HURTS THE SHIP LESS" : "THE FOLLOWING FIELD WINS")
        : v1.verdict === "L BETTER" ? "THE FOLLOWING FIELD LOSES MORE FIGHTERS TO THE ROCKS" : `THE FOLLOWING FIELD DOES NOT WIN (${v1.verdict})`;
    const arm = (rs) => ({ fights: rs.length, approachStruck: sum(rs, "approachStruck"), approachShot: sum(rs, "approachShot"), arrived: sum(rs, "arrived"), combatStruck: sum(rs, "combatStruck"),
        struck: sum(rs, "struck"), medianArrivalT: median(rs.flatMap((r) => r.arrivalT)), meanR: sum(rs, "R") / rs.length, meanDamage: sum(rs, "damageOnShip") / rs.length,
        shipDead: rs.filter((r) => r.shipDead).length, fallbacks: rs.reduce((a, r) => a + (r.probe ? r.probe.fallback : 0), 0), near: rs.reduce((a, r) => a + (r.probe ? r.probe.near : 0), 0),
        meanBuilds: rs.reduce((a, r) => a + (r.probe ? r.probe.builds : 0), 0) / rs.length, buildS: rs.reduce((a, r) => a + ((r.probe && r.probe.buildMs) || 0), 0) / 1000 });
    return { v1, v2, bottom, reported: { F: arm(F), L: arm(L), approachStruck: better("approachStruck"), combatStruck: better("combatStruck") } };
}

/** ROUND C's DEV checks: SAME FIELD, THE HAND-BACK (both arms), IT FOLLOWS, THE FIELD IS SOUND (every build), EVERY FIGHT ENDS. */
export function devChecksC(rows) {
    const F = rows.filter((r) => r.arm === "F"), L = rows.filter((r) => r.arm === "L"), both = [...F, ...L];
    let same = F.length > 0 && F.length === L.length;
    if (same) { try { same = pairsOf(F, L).every((p) => p.n.fieldKey === p.d.fieldKey); } catch { same = false; } }
    const tot = (rs, k) => rs.reduce((a, r) => a + ((r.probe || {})[k] || 0), 0);
    const long = F.filter((r) => r.t > FOLLOW_EVERY / 30 + 1e-9);
    return {
        sameField: { ok: same, n: F.length },
        handBack: { ok: both.length > 0 && [F, L].every((rs) => tot(rs, "handBack") > 0) && tot(both, "handBackMismatch") === 0, handBack: tot(both, "handBack"), mismatches: tot(both, "handBackMismatch") },
        follows: { ok: F.length > 0 && long.length > 0 && long.every((r) => r.probe && r.probe.builds >= 2) && F.every((r) => r.probe && r.probe.buildOriginDev === 0) && L.every((r) => r.probe && r.probe.builds === 1),
            builds: tot(F, "builds"), worstDev: Math.max(0, ...F.map((r) => (r.probe && Number.isFinite(r.probe.buildOriginDev) ? r.probe.buildOriginDev : Infinity))) },
        fieldSound: { ok: both.length > 0 && tot(both, "aimBlocked") === 0 && both.every((r) => r.probe && r.probe.rockCentresBlockedAll === true), aimBlocked: tot(both, "aimBlocked") },
        allEnd: { ok: rows.length > 0 && rows.every((r) => r.over && r.t <= SECONDS + 1e-9), n: rows.length },
    };
}

const renameD = (v) => ({ ...v, verdict: v.verdict === "LAYER BETTER" ? "CAP BETTER" : v.verdict === "DOCTRINE BETTER" ? "L BETTER" : v.verdict });
/** ROUND D's HELD reading: V1 (strikes after arriving), V2 (R, higher is better for the fighters), the bottom line, and the reported readings. */
export function readHeldD(rows) {
    const C = rows.filter((r) => r.arm === "LC"), L = rows.filter((r) => r.arm === "L"), pairs = pairsOf(C, L);   // pairsOf(n, d): here n is LC, d is L
    const fewer = (k) => renameD(signVerdict(pairs.map((p) => p.d[k] - p.n[k]), sum(C, k) < sum(L, k), sum(C, k) > sum(L, k)));
    const v1 = fewer("combatStruck");
    const v2 = renameD(signVerdict(pairs.map((p) => p.n.R - p.d.R), sum(C, "R") > sum(L, "R"), sum(C, "R") < sum(L, "R")));
    const bottom = v1.verdict === "CAP BETTER" ? (v2.verdict === "L BETTER" ? "THE CAP SAVES FIGHTERS BUT HITS THE SHIP LESS" : "THE CAP SAVES FIGHTERS IN THE STRAFE")
        : v1.verdict === "L BETTER" ? "THE CAP LOSES MORE FIGHTERS TO THE ROCKS" : `THE CAP DOES NOT WIN THE STRAFE (${v1.verdict})`;
    const tot = (rs, k) => rs.reduce((a, r) => a + ((r.probe || {})[k] || 0), 0);
    const arm = (rs) => ({ fights: rs.length, approachStruck: sum(rs, "approachStruck"), approachShot: sum(rs, "approachShot"), arrived: sum(rs, "arrived"), combatStruck: sum(rs, "combatStruck"),
        struck: sum(rs, "struck"), medianArrivalT: median(rs.flatMap((r) => r.arrivalT)), meanR: sum(rs, "R") / rs.length, meanDamage: sum(rs, "damageOnShip") / rs.length,
        shipDead: rs.filter((r) => r.shipDead).length, fallbacks: tot(rs, "fallback"), near: tot(rs, "near"), overCap: tot(rs, "overCap"), capCut: tot(rs, "capCut"), capNotCut: tot(rs, "capNotCut") });
    return { v1, v2, bottom, reported: { LC: arm(C), L: arm(L), approachStruck: fewer("approachStruck"), approachShot: fewer("approachShot"), struck: fewer("struck") } };
}

/** ROUND D's DEV checks: SAME FIELD, THE HAND-BACK (both arms, before the cap), THE CAP IS APPLIED, THE FIELD IS SOUND, EVERY FIGHT ENDS. */
export function devChecksD(rows) {
    const C = rows.filter((r) => r.arm === "LC"), L = rows.filter((r) => r.arm === "L"), both = [...C, ...L];
    let same = C.length > 0 && C.length === L.length;
    if (same) { try { same = pairsOf(C, L).every((p) => p.n.fieldKey === p.d.fieldKey); } catch { same = false; } }
    const tot = (rs, k) => rs.reduce((a, r) => a + ((r.probe || {})[k] || 0), 0);
    return {
        sameField: { ok: same, n: C.length },
        handBack: { ok: both.length > 0 && [C, L].every((rs) => tot(rs, "handBack") > 0) && tot(both, "handBackMismatch") === 0, handBack: tot(both, "handBack"), mismatches: tot(both, "handBackMismatch") },
        capApplied: { ok: C.length > 0 && tot(C, "overCap") > 0 && tot(C, "capCut") > 0 && tot(C, "capNotCut") === 0 && tot(L, "capCut") === 0 && tot(L, "capNotCut") > 0,
            overCap: tot(C, "overCap"), cut: tot(C, "capCut"), notCut: tot(C, "capNotCut"), lCut: tot(L, "capCut"), lOverWithThrust: tot(L, "capNotCut") },
        fieldSound: { ok: both.length > 0 && tot(both, "aimBlocked") === 0 && both.every((r) => r.probe && r.probe.rockCentresBlockedAll === true), aimBlocked: tot(both, "aimBlocked") },
        allEnd: { ok: rows.length > 0 && rows.every((r) => r.over && r.t <= SECONDS + 1e-9), n: rows.length },
    };
}

/** ROUND E's HELD reading: Round C's reading word for word with FX in F's place, plus the empty-lane builds. */
export function readHeldE(rows) {
    const H = readHeldC(rows.map((r) => (r.arm === "FX" ? { ...r, arm: "F" } : r))), FX = rows.filter((r) => r.arm === "FX");
    const tot = (k) => FX.reduce((a, r) => a + ((r.probe || {})[k] || 0), 0);
    const { F, ...rest } = H.reported;
    const bottom = H.bottom.replace("THE FOLLOWING FIELD", "THE FIXED FOLLOWING FIELD");
    return { ...H, bottom, reported: { ...rest, FX: { ...F, laneEmptyBuilds: tot("laneEmptyBuilds"), fightsWithEmpty: FX.filter((r) => r.probe && r.probe.laneEmptyBuilds > 0).length, buildsWithoutGoal: tot("buildsWithoutGoal") } } };
}

/** ROUND E's DEV checks: Round C's five with FX in F's place, and 6 THE FIX REACHES THE FIELD (every FX build has goal cells; at least one fell back from an empty lane). */
export function devChecksE(rows) {
    const c = devChecksC(rows.map((r) => (r.arm === "FX" ? { ...r, arm: "F" } : r))), FX = rows.filter((r) => r.arm === "FX");
    const tot = (k) => FX.reduce((a, r) => a + ((r.probe || {})[k] || 0), 0);
    return { ...c, fixReaches: { ok: FX.length > 0 && FX.every((r) => r.probe && r.probe.buildsWithoutGoal === 0) && tot("laneEmptyBuilds") > 0, laneEmptyBuilds: tot("laneEmptyBuilds"), buildsWithoutGoal: tot("buildsWithoutGoal") } };
}

/** ROUND F's HELD reading: Round E's, word for word, plus the replication line (it moves nothing in Round E's verdict). */
export function readHeldF(rows) {
    const H = readHeldE(rows);
    const replication = H.v1.verdict === "FOLLOW BETTER" && H.v2.verdict !== "L BETTER" ? "ROUND E REPLICATES" : `ROUND E DOES NOT REPLICATE (${H.v1.verdict})`;
    return { ...H, replication };
}

/** DEV's checks: SAME FIELD, THE LAYER STEERS, THE HAND-BACK, THE FIELD IS SOUND, EVERY FIGHT ENDS. */
export function devChecks(rows) {
    const N = rows.filter((r) => r.arm === "N"), D = rows.filter((r) => r.arm === "D");
    let same = N.length > 0 && N.length === D.length;
    if (same) { try { same = pairsOf(N, D).every((p) => p.n.fieldKey === p.d.fieldKey); } catch { same = false; } }
    const P = N.map((r) => r.probe || {}), tot = (k) => P.reduce((a, p) => a + (p[k] || 0), 0);
    return {
        sameField: { ok: same, n: N.length },
        steers: { ok: N.length > 0 && tot("aimed") > 0, aimed: tot("aimed"), calls: tot("calls") },
        handBack: { ok: N.length > 0 && tot("handBack") > 0 && tot("handBackMismatch") === 0, handBack: tot("handBack"), mismatches: tot("handBackMismatch") },
        fieldSound: { ok: N.length > 0 && tot("aimBlocked") === 0 && P.every((p) => p.rockCentresBlocked === true), aimBlocked: tot("aimBlocked") },
        allEnd: { ok: rows.length > 0 && rows.every((r) => r.over && r.t <= SECONDS + 1e-9), n: rows.length },
    };
}

export function reportLines() {
    return ["[rockNavStudy] the rock nav rounds: arm D (today's doctrine) against arm N (the navigation layer outside the strafe range), paired by (seed, kind), the approach scored on its own (brain/ROCK_NAV_WIP.md)",
        `  DEV ${DEV_SEEDS[0]}-${DEV_SEEDS.at(-1)} x ${KINDS.length} kinds (checks only); HELD ${HELD_SEEDS[0]}-${HELD_SEEDS.at(-1)} x ${KINDS.length} kinds; ${GUNNERS} gunners, ${ROCKS} rocks`];
}
