// WebGLEngine/tools/ship/strongGunnersStudy.mjs -- the space doctrine's ROUND 3 (brain/SPACE_DOCTRINE_WIP.md; backlog space-cap-strong-gunners)
//
// Does a capped fighter lose to strong gunners, and is there a cap that does not? Under ace and perfect only, on spaceDoctrineStudy.flyOne exactly (arm D: no pilot; arm C: cappedPilot at a cap),
// nothing in the arena edited. DEV (space seeds 4301-4330 x 4 kinds x both presets) flies every cap of GRID and chooses CAP_STRONG by the highest mean R pooled over the presets (ties to the larger);
// HELD (4401-4460) is flown once with D, C at CAP_STRONG and C at 12 (reported: the entry's first question). The command is strongGunnersStudyCmd.mjs (export-free); the gate is
// strongGunnersStudy-selfcheck.mjs.
"use strict";

import * as S from "./spaceDoctrineStudy.mjs";
import { signTest } from "./subGiveWayStudy.mjs";

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
export const PRESETS = Object.freeze(["ace", "perfect"]);
export const GRID = Object.freeze([12, 16, 20, 25, 30]);
export const FIRST_CAP = 12;   // Round 2's CAP_CHOSEN: the entry's first question ("does a capped fighter lose to strong gunners?")
export const DEV_SEEDS = Object.freeze(range(4301, 4330));
export const HELD_SEEDS = Object.freeze(range(4401, 4460));
export const SPENT = Object.freeze({ survey: [9990037, 9990048] });
export const FLOOR_MIN = S.FLOOR_MIN, ALPHA = S.ALPHA, TIE_EPS = S.TIE_EPS;
/** CAP_STRONG: null until DEV is read and the choice is committed with its report (then the number, by hand, in the same commit). */
export const CAP_STRONG = null;

export const scenariosOf = (seeds) => seeds.flatMap((seed) => S.KINDS.map((kind) => ({ seed, kind })));

/** The cap with the highest mean R over DEV's rows of both presets (ties to the larger), and each cap's mean R and mean strafe-seconds. */
export function chooseCap(rows, grid = GRID) {
    const means = grid.map((cap) => { const rs = rows.filter((r) => r.cap === cap); return { cap, n: rs.length, meanR: rs.reduce((a, r) => a + r.R, 0) / Math.max(1, rs.length), meanStrafeS: rs.reduce((a, r) => a + r.strafeS, 0) / Math.max(1, rs.length) }; });
    let best = null;
    for (const m of means) if (m.n > 0 && (!best || m.meanR > best.meanR + TIE_EPS || (Math.abs(m.meanR - best.meanR) <= TIE_EPS && m.cap > best.cap))) best = m;
    return { cap: best ? best.cap : null, means };
}

/** Arm C (at `cap`) against arm D within one preset, by (seed, kind), on key k: { verdict, wins, losses, ties, n, p, median } (median over the non-tied differences). */
export function verdictOn(rows, preset, cap, k) {
    const C = rows.filter((r) => r.preset === preset && r.cap === cap), D = rows.filter((r) => r.preset === preset && r.cap === "D");
    if (!C.length || C.length !== D.length || C.some((r, i) => r.seed !== D[i].seed || r.kind !== D[i].kind)) throw new Error(`strongGunnersStudy.verdictOn: arm ${cap} and arm D are not on the same scenarios under ${preset}`);
    const d = C.map((r, i) => r[k] - D[i][k]), wins = d.filter((x) => x >= TIE_EPS).length, losses = d.filter((x) => x <= -TIE_EPS).length, n = wins + losses;
    const med = S.median(d.filter((x) => Math.abs(x) >= TIE_EPS)), p = signTest(wins, n);
    let verdict;
    if (n < FLOOR_MIN) verdict = "FLOOR";
    else if (wins > losses && p <= ALPHA && med > 0) verdict = "CAP BETTER";
    else if (losses > wins && p <= ALPHA && med < 0) verdict = "DOCTRINE BETTER";
    else verdict = "NO DIFFERENCE SHOWN";
    return { verdict, wins, losses, ties: d.length - n, n, p, median: med };
}

/** HELD's reading at `cap` (CAP_STRONG): V1 (R) and V2 (strafe-seconds) per preset, the bottom line, the first question (cap 12), and the per-arm means. */
export function readHeld(rows, cap) {
    const v1 = {}, v2 = {}, first = {};
    for (const p of PRESETS) {
        v1[p] = verdictOn(rows, p, cap, "R"); v2[p] = verdictOn(rows, p, cap, "strafeS");
        first[p] = { R: verdictOn(rows, p, FIRST_CAP, "R"), strafeS: verdictOn(rows, p, FIRST_CAP, "strafeS") };
    }
    const doctrineWins = PRESETS.filter((p) => v1[p].verdict === "DOCTRINE BETTER");
    const bottom = PRESETS.every((p) => v1[p].verdict === "CAP BETTER") ? `CAP ${cap} BEATS THE DOCTRINE AGAINST STRONG GUNNERS`
        : doctrineWins.length ? `THE DOCTRINE BEATS CAP ${cap} AGAINST STRONG GUNNERS (${doctrineWins.join(", ")})`
        : `NO CAP SHOWN BETTER OR WORSE THAN THE DOCTRINE AGAINST STRONG GUNNERS (${PRESETS.map((p) => `${p} ${v1[p].verdict}`).join(", ")})`;
    const firstYes = PRESETS.some((p) => first[p].R.verdict === "DOCTRINE BETTER") || PRESETS.every((p) => first[p].strafeS.verdict === "DOCTRINE BETTER");
    const means = {};
    for (const p of PRESETS) for (const a of ["D", cap, FIRST_CAP]) {
        const rs = rows.filter((r) => r.preset === p && r.cap === a), m = (k) => rs.reduce((x, r) => x + (r[k] ?? 0), 0) / Math.max(1, rs.length);
        means[`${p} ${a}`] = { n: rs.length, R: m("R"), damage: m("damageOnShip"), strafeS: m("strafeS"), passes: m("passes"), t: m("t"), peakClosing: Math.max(...rs.map((r) => r.peakClosing)), withR: rs.filter((r) => r.R > 0).length };
    }
    return { cap, v1, v2, bottom, first, firstAnswer: firstYes ? "YES: A CAPPED FIGHTER AT 12 LOSES TO STRONG GUNNERS" : "NOT SHOWN", means };
}

/** DEV's checks at the chosen cap: Round 2's SAME FOE, THE CAP IS APPLIED and EVERY FIGHT ENDS (spaceDoctrineStudy.devChecks2), over both presets' rows. */
export const devChecks = (rows, cap) => S.devChecks2(rows, cap);

export function reportLines() {
    return ["[strongGunnersStudy] the space doctrine's ROUND 3: arm D against a capped approach under ace and perfect gunners, R per preset with strafe-seconds as the mechanism (brain/SPACE_DOCTRINE_WIP.md)",
        `  grid ${GRID.join(", ")}; DEV ${DEV_SEEDS[0]}-${DEV_SEEDS.at(-1)}; HELD ${HELD_SEEDS[0]}-${HELD_SEEDS.at(-1)}; CAP_STRONG ${CAP_STRONG === null ? "not yet chosen" : CAP_STRONG}`];
}
