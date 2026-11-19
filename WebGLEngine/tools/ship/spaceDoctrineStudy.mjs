// WebGLEngine/tools/ship/spaceDoctrineStudy.mjs -- the space approach doctrine round (brain/SPACE_DOCTRINE_WIP.md)
//
// Does a fighter that caps its closing speed beat today's full-throttle, no-brake approach against the capital ship,
// under each gunner preset? Two arms on battleshipFight.build, nothing in spaceArena.mjs or battleshipFight.mjs edited:
//   D  -- today's doctrine: no pilot, every fighter flies AP.decide.
//   C  -- the same build with a pilot that calls AP.decide and cuts the thrust whenever the closing speed to the
//         nearest foe's CENTRE is at or above CAP.
// DEV (space seeds 1901-1930 x 4 kinds) fixes CAP from CAP_GRID by the highest mean R, ties to the larger. HELD89 (space
// seeds 2401-2460 x 4 kinds) is flown once at that CAP. The library holds the arms, the readings and the verdict; the
// command (spaceDoctrineStudyCmd.mjs, export-free) flies and writes. Gate: spaceDoctrineStudy-selfcheck.mjs.
"use strict";

import * as BF from "../../brain/battleshipFight.mjs";
import * as SA from "../../brain/spaceArena.mjs";
import * as AP from "../../brain/autopilot6dof.mjs";
import { signTest } from "./subGiveWayStudy.mjs";

export const KINDS = BF.KINDS;
export const PRESETS = Object.freeze(["perfect", "ace", "regular", "green"]);
export const CAP_GRID = Object.freeze([6, 9, 12, 15, 20, 25]);
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
export const DEV_SEEDS = Object.freeze(range(1901, 1930));
export const HELD89_SEEDS = Object.freeze(range(2401, 2460));
export const IDENTITY_SEEDS = Object.freeze([1901, 1902, 1903]);
/** Space seeds already spent elsewhere (gates, gunner training, the prototypes, this round's smoke). The sets must avoid them. */
export const SPENT = Object.freeze({ gates: [1, 40], prototypes: [1601, 1800], smoke: [9990001, 9990005] });
export const TIE_EPS = 1e-9, FLOOR_MIN = 20, ALPHA = 0.05, CAP_SLACK = 2, DOCTRINE_MARGIN = 5, SHIP_HP = 1500, SECONDS = 120;
export const MLP_WEIGHTS = "brain/seatGunnerMlpWeightsDefault.json";
/** The shipped MLP seat network as battleshipFight.build's `network`: the module and its weights as a Float32Array (the module reads subarrays). */
export const networkOf = (module, file) => ({ module, weights: Float32Array.from(file.weights) });

/**
 * THE CAP, FIXED ON DEV. null until DEV has been flown and read; the HELD89 flight refuses to run while it is null,
 * and the value written here is the one the note records.
 */
export const CAP_CHOSEN = null;

/** The scenarios of a seed list, seed-major: [{ seed, kind }]. */
export const scenariosOf = (seeds) => seeds.flatMap((seed) => KINDS.map((kind) => ({ seed, kind })));

/** The closing speed of `body` on `foeBody`, measured to the foe's centre: -d(range)/dt. Positive when closing. */
export function closingSpeed(body, foeBody) {
    const r = [0, 1, 2].map((k) => foeBody.pos[k] - body.pos[k]), v = [0, 1, 2].map((k) => foeBody.vel[k] - body.vel[k]);
    const d = Math.hypot(r[0], r[1], r[2]);
    return -(r[0] * v[0] + r[1] * v[1] + r[2] * v[2]) / Math.max(d, 1e-9);
}

/**
 * Arm C's pilot. `arenaOf()` returns the arena (bound after build). Each call: AP.decide, then the craft whose body this
 * is, then the arena's own nearestFoe for it; the thrust is cut when the closing speed is at or above `cap`. `probe`,
 * when given, records the foe each fighter was given this tick ({ foeOf: Map id -> foe id, nullFoe }).
 */
export function cappedPilot(arenaOf, cap, probe = null) {
    return (body, target, opts) => {
        const d = AP.decide(body, target, opts), arena = arenaOf();
        const c = arena.crafts.find((x) => x.body === body), foe = c ? SA.nearestFoe(arena, c) : null;
        if (probe) { if (!c || !foe) probe.nullFoe++; else probe.foeOf.set(c.id, foe.id); }
        if (!foe) return d;
        return closingSpeed(body, foe.body) >= cap ? { ...d, thrust: 0 } : d;
    };
}

/** R: the damage on the ship if it survives, else 1500 + (120 - the time it died). Higher is better for the fighters. */
export const rOf = (t) => (t.ship.status === "flying" ? t.damageOnShip : SHIP_HP + (SECONDS - t.t));

/**
 * One fight. cap null = arm D (no pilot); a number (Infinity included) = arm C at that cap. Stepped by hand so the
 * readings are taken on the same ticks the arena decides on. Returns a plain row.
 */
export function flyOne({ seed, kind, preset, cap = null, network = null, probe = false }) {
    let arena = null;
    const pr = probe ? { foeOf: new Map(), nullFoe: 0, mismatches: 0, calls: 0 } : null;
    const pilot = cap === null ? undefined : cappedPilot(() => arena, cap, pr);
    const b = BF.build(seed, kind, { gunners: preset, ...(pilot ? { pilot } : {}), ...(network ? { network } : {}) });
    arena = b.arena;
    const raiders = arena.crafts.filter((c) => c.kind === "fighter" && c.team !== BF.SHIP_ID);
    let strafeTicks = 0, aliveTicks = 0, peakClosing = -Infinity, passes = 0;
    const wasStrafing = new Map();
    while (!arena.done) {
        const flying = raiders.filter((c) => !c.dead);
        for (const c of flying) { const f = SA.nearestFoe(arena, c); if (f) peakClosing = Math.max(peakClosing, closingSpeed(c.body, f.body)); }
        if (pr) pr.foeOf.clear();
        SA.stepSpaceArena(arena);
        for (const c of flying) {
            aliveTicks++;
            const s = !!(c.last && c.last.mode === "strafe");
            if (s) { strafeTicks++; if (!wasStrafing.get(c.id)) passes++; }
            wasStrafing.set(c.id, s);
            if (pr && c.last && c.last.foe !== null) { pr.calls++; if (pr.foeOf.get(c.id) !== c.last.foe) pr.mismatches++; }
        }
    }
    const t = BF.tally(arena);
    const strafeS = strafeTicks / 30;
    return {
        seed, kind, preset, cap: cap === null ? "D" : cap, network: !!network,
        R: rOf(t), over: t.over, t: t.t, shipStatus: t.ship.status, winner: t.winner, damageOnShip: t.damageOnShip,
        losses: t.killed + t.rammed, killed: t.killed, rammed: t.rammed,
        strafeS, dpss: strafeS > 0 ? t.damageOnShip / strafeS : null, passes, aliveS: aliveTicks / 30,
        peakClosing, shipDamagePerRound: t.ship.seatRounds > 0 ? t.ship.hitsDealt / t.ship.seatRounds : null,
        ...(pr ? { probe: { calls: pr.calls, mismatches: pr.mismatches, nullFoe: pr.nullFoe } } : {}),
    };
}

/** The fingerprint the identity check compares: the whole tally, as JSON. */
export function tallyOf({ seed, kind, preset, cap = null }) {
    let arena = null;
    const pilot = cap === null ? undefined : cappedPilot(() => arena, cap);
    const b = BF.build(seed, kind, { gunners: preset, ...(pilot ? { pilot } : {}) });
    arena = b.arena; SA.runSpaceArena(arena);
    return JSON.stringify(BF.tally(arena));
}

const mean = (xs) => xs.reduce((a, x) => a + x, 0) / xs.length;
export function median(xs) {
    if (!xs.length) return null;
    const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * DEV's choice: the grid cap with the highest mean R over every row flown at it (all presets, all scenarios). Ties go
 * to the LARGER cap. `rows` are flyOne rows; arm D rows are ignored. Returns { cap, means }.
 */
export function chooseCap(rows, grid = CAP_GRID) {
    const means = grid.map((cap) => { const rs = rows.filter((r) => r.cap === cap); return { cap, n: rs.length, meanR: rs.length ? mean(rs.map((r) => r.R)) : -Infinity }; });
    let best = null;
    for (const m of means) if (!best || m.meanR > best.meanR || (m.meanR === best.meanR && m.cap > best.cap)) best = m;
    return { cap: best.cap, means };
}

/** Pair arm C against arm D by (seed, kind). Throws when the two arms are not on the same scenarios in the same order. */
export function pairsOf(c, d) {
    if (c.length !== d.length || c.some((r, i) => r.seed !== d[i].seed || r.kind !== d[i].kind)) throw new Error("spaceDoctrineStudy.pairsOf: the arms are not on the same scenarios");
    return c.map((r, i) => ({ seed: r.seed, kind: r.kind, diff: r.R - d[i].R, c: r, d: d[i] }));
}

/** One preset's verdict from its pairs: FLOOR / CAP BETTER / DOCTRINE BETTER / NO DIFFERENCE SHOWN. */
export function presetVerdict(pairs) {
    const wins = pairs.filter((p) => p.diff >= TIE_EPS).length, losses = pairs.filter((p) => p.diff <= -TIE_EPS).length, n = wins + losses;
    const ties = pairs.length - n, p = signTest(wins, n), med = median(pairs.map((q) => q.diff));
    let verdict;
    if (n < FLOOR_MIN) verdict = "FLOOR";
    else if (wins > losses && p <= ALPHA && med > 0) verdict = "CAP BETTER";
    else if (losses > wins && p <= ALPHA && med < 0) verdict = "DOCTRINE BETTER";
    else verdict = "NO DIFFERENCE SHOWN";
    return { verdict, wins, losses, ties, n, p, median: med };
}

/** The overall line from the four presets' verdicts ({ preset: verdict string }). */
export function overallOf(byPreset) {
    const v = (k) => byPreset[k];
    const anyDoctrine = PRESETS.some((k) => v(k) === "DOCTRINE BETTER"), anyCap = PRESETS.some((k) => v(k) === "CAP BETTER");
    const overall = !anyDoctrine && v("regular") === "CAP BETTER" && v("green") === "CAP BETTER" ? "SUPPORTED"
        : !anyDoctrine && anyCap ? "PARTLY SUPPORTED" : "NOT SUPPORTED";
    return { overall, harmful: anyDoctrine };
}

/** The reported, non-verdict readings of one preset's pairs. */
export function readingsOf(pairs) {
    const both = pairs.filter((p) => p.c.strafeS > 0 && p.d.strafeS > 0);
    const gained = pairs.filter((p) => p.c.losses < p.d.losses).length, lost = pairs.filter((p) => p.c.losses > p.d.losses).length;
    const arm = (k) => ({
        shipDestroyed: pairs.filter((p) => p[k].shipStatus !== "flying").length,
        wins: { ship: pairs.filter((p) => p[k].winner === "ship").length, fighters: pairs.filter((p) => p[k].winner === "fighters").length, none: pairs.filter((p) => p[k].winner === "none").length },
        meanR: mean(pairs.map((p) => p[k].R)), losses: pairs.reduce((a, p) => a + p[k].losses, 0),
        passes: pairs.reduce((a, p) => a + p[k].passes, 0), aliveS: pairs.reduce((a, p) => a + p[k].aliveS, 0),
        peakClosing: Math.max(...pairs.map((p) => p[k].peakClosing)),
        shipDamagePerRound: median(pairs.map((p) => p[k].shipDamagePerRound).filter((x) => x !== null)),
    });
    return {
        C: arm("c"), D: arm("d"),
        dpss: { n: both.length, medianC: median(both.map((p) => p.c.dpss)), medianD: median(both.map((p) => p.d.dpss)) },
        fewerLosses: { gained, lost, p: signTest(gained, gained + lost) },
    };
}

/** HELD89's whole reading from its rows: { byPreset: { preset: { ...presetVerdict, readings } }, overall, harmful, network }. */
export function readHeld(rows, cap) {
    const pick = (preset, arm, net = false) => rows.filter((r) => r.preset === preset && r.cap === arm && r.network === net);
    const byPreset = {};
    for (const preset of PRESETS) {
        const pairs = pairsOf(pick(preset, cap), pick(preset, "D"));
        byPreset[preset] = { ...presetVerdict(pairs), readings: readingsOf(pairs) };
    }
    const netC = pick("green", cap, true), netD = pick("green", "D", true);
    const network = netC.length && netD.length ? (() => { const pairs = pairsOf(netC, netD); return { ...presetVerdict(pairs), readings: readingsOf(pairs), shipKilledByC: netC.filter((r) => r.shipStatus !== "flying").length / netC.length }; })() : null;
    return { cap, byPreset, ...overallOf(Object.fromEntries(PRESETS.map((k) => [k, byPreset[k].verdict]))), network };
}

/** The checks run on DEV rows: SAME FOE (probes), THE CAP HOLDS at `cap`, EVERY FIGHT ENDS. Identity is separate (tallies). */
export function devChecks(rows, cap) {
    const probed = rows.filter((r) => r.probe), C = rows.filter((r) => r.cap === cap), D = rows.filter((r) => r.cap === "D");
    const doctrinePeak = Math.max(...D.map((r) => r.peakClosing)), cPeak = Math.max(...C.map((r) => r.peakClosing));
    return {
        sameFoe: { ok: probed.length > 0 && probed.every((r) => r.probe.mismatches === 0 && r.probe.nullFoe === 0 && r.probe.calls > 0), probed: probed.length, calls: probed.reduce((a, r) => a + r.probe.calls, 0) },
        capHolds: { ok: C.length > 0 && cPeak <= cap + CAP_SLACK && doctrinePeak > cap + DOCTRINE_MARGIN, cPeak, doctrinePeak },
        allEnd: { ok: rows.length > 0 && rows.every((r) => r.over && r.t <= SECONDS + 1e-9), n: rows.length },
    };
}

export function reportLines() {
    return ["[spaceDoctrineStudy] the space approach doctrine round: arm D (today's doctrine) against arm C (thrust cut at a closing-speed cap), paired by (seed, kind) under each gunner preset; R, the sign test and the verdict of brain/SPACE_DOCTRINE_WIP.md",
        `  CAP grid ${CAP_GRID.join(", ")}; DEV ${DEV_SEEDS[0]}-${DEV_SEEDS.at(-1)} x ${KINDS.length} kinds; HELD89 ${HELD89_SEEDS[0]}-${HELD89_SEEDS.at(-1)} x ${KINDS.length} kinds; CAP ${CAP_CHOSEN === null ? "not yet chosen" : CAP_CHOSEN}`];
}
