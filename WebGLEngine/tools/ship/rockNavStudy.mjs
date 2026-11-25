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
import { rOf } from "./spaceDoctrineStudy.mjs";

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
export const KINDS = BF.KINDS;
export const GUNNERS = "regular", ROCKS = 24, SECONDS = 120, ALPHA = 0.05, FLOOR_MIN = 20;
export const DEV_SEEDS = Object.freeze(range(3101, 3130));
export const HELD_SEEDS = Object.freeze(range(3201, 3290));
/** Reserved for Round B (registered after Round A is read); Round A spends none of them. */
export const RESERVED_B = Object.freeze({ dev: [3301, 3330], held: [3401, 3490] });
export const SPENT = Object.freeze({ gates: [41, 50], survey: [9990001, 9990006] });
export const ARMS = Object.freeze(["D", "N"]);

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
    if (!ARMS.includes(arm)) throw new Error(`rockNavStudy.flyOne: arm must be one of ${ARMS.join(", ")} (got ${arm})`);
    let arena = null, field = null, probe = null, pilot;
    if (arm === "N") {
        probe = { calls: 0, aimed: 0, fallback: 0, near: 0, handBack: 0, handBackMismatch: 0, aimBlocked: 0, last: null };
        let nav = null;
        pilot = (body, target, opts) => {
            if (!nav) nav = NV.navPilot(() => arena, field, { probe });
            const out = nav(body, target, opts);
            if (probe.last.inside) { if (JSON.stringify(out) !== JSON.stringify(AP.decide(body, target, opts))) probe.handBackMismatch++; }
            else if (probe.last.aim && field.blocked[NV.indexOf(field, probe.last.aim)]) probe.aimBlocked++;
            return out;
        };
    }
    const b = BF.build(seed, kind, { gunners: GUNNERS, rocks: ROCKS, ...(pilot ? { pilot } : {}) });
    arena = b.arena;
    const ship = NV.shipOf(arena), start = [...ship.body.pos], key = fieldKey(arena);
    if (arm === "N") {
        field = NV.buildField(arena.rocks, start, SA.STRAFE_RANGE);
        probe.rockCentresBlocked = arena.rocks.every((q) => field.blocked[NV.indexOf(field, q.pos)] === 1);
        probe.field = { origin: [...field.origin], goalR: field.goalR };
    }
    const fighters = arena.crafts.filter((c) => c.kind === "fighter"), state = new Map(fighters.map((c) => [c.id, "out"]));
    const row = { seed, kind, arm, approachStruck: 0, approachShot: 0, arrived: 0, combatStruck: 0, struck: 0, arrivalT: [] };
    while (!arena.done) {
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
    if (probe) { const { last, ...p } = probe; row.probe = p; }
    return row;
}

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
