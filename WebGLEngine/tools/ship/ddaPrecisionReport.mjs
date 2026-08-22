// WebGLEngine/tools/ship/ddaPrecisionReport.mjs -- v3559
// ---------------------------------------------------------------------------------------------------------------
// "IS A GPU/CPU VOXEL DISAGREEMENT EXPECTED?" -- THE ANSWER, SOMEWHERE A PERSON CAN READ IT.
//
// v3558 sorted graveyard's orphan pile to 13 and split them: eight per-call primitives correctly driven by their
// gate, and FIVE BUILT ENGINE FEATURES NOTHING WIRED. This is the first of the five, read one at a time.
//
// voxel/ddaFloat32.js (v3062) models GLSL highp float with Math.fround and compares a float32 DDA traversal
// against the shipped float64 one. Its own header states what it is FOR, and the sentence is the round:
//
//     "It exists so that when a GPU eventually disagrees with the CPU about which voxel a ray hit, there is
//      already an answer to 'is that expected?' -- measured, with the conditions that produce it named."
//
// *** THE ANSWER EXISTED AND THERE WAS NOWHERE TO LOOK IT UP. *** It was computed inside
// tools/ship/ddaPrecision-selfcheck.mjs and printed to that gate's console, so reading it meant knowing which
// of 887 gates to run. A MODULE WHOSE ENTIRE PURPOSE IS TO BE CONSULTED LATER, WITH NO FRONT DOOR, is this
// project's most-named shape wearing a new costume -- v3528's "a diagnostic nobody reads cannot be wrong out
// loud" and v3420's "an instrument you can look at but cannot run is half an instrument".
//
// ---- AND THE NUMBER IT PRINTED WAS THE WRONG NUMBER FOR THE QUESTION -------------------------------------------
//
// That gate ends on a headline: TOTAL 35312/35728 agree, 1.1644% DIVERGE. It is the last figure printed and
// therefore the one anybody quotes. *** IT IS A WEIGHTED AVERAGE OF TWO POPULATIONS THAT ANSWER DIFFERENT
// QUESTIONS, AND ITS WEIGHTS ARE A CHOICE OF FIXTURE SIZE. ***
//
//   REALISTIC   a camera fan            -- what a renderer actually casts
//   ADVERSARIAL rays aimed at exact cell corners, and rational direction ratios that force repeated exact ties
//               -- CONSTRUCTED to make float32 and float64 part company, and correctly so: they exist to prove
//               divergence is POSSIBLE, which is a claim about the CONDITION, not an estimate of a RATE.
//
// DRIVEN RATHER THAN ARGUED (and the gate re-drives it): hold the fan at 20000 rays and grow the adversarial set
// 8000 -> 24000 -> 80000, and the per-set rates DO NOT MOVE (0.0000% and 4.31%) while the COMBINED total goes
// 1.23% -> 2.35% -> 3.45%. NOTHING PHYSICAL CHANGED. A RATE WHOSE DENOMINATOR IS A DECISION ABOUT HOW MANY
// ADVERSARIAL RAYS TO GENERATE IS A STATEMENT ABOUT THE FIXTURE, NOT ABOUT THE ENGINE -- v3453's refusal to
// ratchet a count derived from shapes the author chose, arriving as a percentage instead of a count.
//
// SO THIS FILE REFUSES TO PRODUCE ONE. combinedRate() THROWS, with the reason, on the v3543 precedent where
// interiorNumberDensity refuses rather than returning a confident number about a fixture that cannot be asked.
//
// ---- WHAT THE TWO ANSWERS ACTUALLY ARE --------------------------------------------------------------------------
//
// REALISTIC: **0 of 160,000** across FORTY camera stations (irrational offsets, 4000 rays each). One fan from one
// origin would have been v3507's shape -- a null from an instrument nobody showed could see anything -- so the
// station sweep is the measurement rather than a garnish.
//
// *** AND THE ZERO IS NOT "NO TIES OCCURRED", WHICH IS THE PART WORTH KEEPING. *** The tightest tie-gap SURVIVED
// across all forty stations is EXACTLY 0.000e+0: real camera rays DO hit bit-identical tMax values, and both
// precisions break them the same way, because the tie-break is `<=` in the same axis order in both. An exact tie
// is DETERMINISTIC. What diverges is a gap that is nonzero in float64 and reorders under binary32 rounding --
// which is a narrower and more useful condition than "two axes were close".
//
// ADVERSARIAL: 4.30% (corners) and 4.17% (rational ratios), and the widest gap at which any of them diverged is
// **2.35 ULPS of binary32** and **0.74 ULPS**. Reported in ulps rather than as a decimal because the ulp is the
// only scale on which "within a rounding error" means anything.
//
// ---- WHICH IS WHY THE OLD GATE'S THRESHOLD WAS TYPED AND WRONG-SCALED -------------------------------------------
//
// ddaPrecision-selfcheck asserted `bestDisagreeingGap < 1e-5`. NEVER TYPE A REFERENCE VALUE A GATE COMPARES
// AGAINST -- and this one is not merely untethered, it is 83.9 ULPS: a relative gap binary32 resolves comfortably,
// so it cannot mean "within a rounding error" at all. The measured divergences sit at 2.35 and 0.74 ulps, and the
// bound is now DERIVED FROM THE FORMAT (binary32 has a 24-bit significand) rather than chosen to pass.
"use strict";
import { comparePrecision, traverseDDA32 } from "../../voxel/ddaFloat32.js";
import { traverseDDA } from "../../voxel/voxelDDA.js";

import { pathToFileURL } from "node:url";
/** One ulp of IEEE binary32 at unit magnitude. 2^-23 -- the significand is 24 bits with an implicit leading 1. */
export const ULP32 = Math.pow(2, -23);

/**
 * A relative tie-gap wider than this could not be a rounding tie: binary32 represents it with room to spare, so
 * both precisions order the two axes identically and a divergence there would be an ALGORITHM difference rather
 * than a precision one. DERIVED FROM THE FORMAT (2^-23 significand) and not from the measurements it bounds --
 * 8 ulps leaves room for a few accumulated roundings along a ray without ever approaching a resolvable gap.
 */
export const TIE_BOUND_ULPS = 8;

/** The v3062 scene, one declaration, so the report and the gate cannot describe two different worlds. */
export function scene({ S = 48, H = 32 } = {}) {
    const solid = new Uint8Array(S * H * S);
    for (let x = 0; x < S; x++) for (let z = 0; z < S; z++) {
        const h = Math.min(H - 1, Math.floor(9 + 5 * Math.sin(x * 0.19) * Math.cos(z * 0.15) + 3 * Math.sin((x + z) * 0.11)));
        for (let y = 0; y < h; y++) solid[x + S * (y + H * z)] = 1;
    }
    for (let x = 20; x < 27; x++) for (let z = 20; z < 27; z++) for (let y = 22; y < 28; y++) solid[x + S * (y + H * z)] = 1;
    const isSolid = (x, y, z) => (x < 0 || y < 0 || z < 0 || x >= S || y >= H || z >= S) ? false : solid[x + S * (y + H * z)] === 1;
    return { S, H, isSolid };
}

/** A camera fan from one station. Offsets are irrational so the origin never lands on a cell plane by accident. */
export function fan(n, ox, oy, oz, phase = 0.011) {
    const rays = [];
    for (let i = 0; i < n; i++) {
        const a = i * 0.0731 + phase, b = (i % 97) * 0.0217 - 1.0;
        rays.push([ox, oy, oz, Math.cos(a) * Math.cos(b), Math.sin(b) - 0.35, Math.sin(a) * Math.cos(b)]);
    }
    return rays;
}

/**
 * THE REALISTIC ANSWER, over MANY stations rather than one. A zero from a single fan cannot tell "precision does
 * not matter here" from "this fan never asked a hard question" (v3507), so the sweep IS the measurement.
 * Returns { stations, n, disagree, rate, tightestTieSurvived, badStations }.
 */
export function realisticRate({ stations = 40, perStation = 4000, S = 48, H = 32 } = {}) {
    const sc = scene({ S, H });
    let n = 0, disagree = 0, tightest = Infinity;
    const badStations = [];
    for (let c = 0; c < stations; c++) {
        const ox = 3 + (c * 1.2371) % (S - 6) + 0.1379;
        const oy = H - 1.61 - (c % 5) * 0.7137;
        const oz = 3 + (c * 2.7183) % (S - 6) + 0.2718;
        const r = comparePrecision(fan(perStation, ox, oy, oz, c * 0.313 + 0.011), sc.isSolid, traverseDDA, 300);
        n += r.n; disagree += r.disagree;
        if (r.worstAgreeingGap < tightest) tightest = r.worstAgreeingGap;
        if (r.disagree) badStations.push({ station: c, disagree: r.disagree, gap: r.bestDisagreeingGap });
    }
    return { stations, n, disagree, rate: disagree / n, tightestTieSurvived: tightest, badStations };
}

/** Rays aimed straight at integer cell corners, where three tMax values collide. CONSTRUCTED, not observed. */
export function cornerRays(n = 8000, H = 32) {
    const rays = [];
    for (let i = 0; i < n; i++) {
        const cx = 8 + (i % 30), cy = 4 + (i % 17), cz = 8 + ((i * 7) % 30);
        const o = [0.5, H - 0.5, 0.5];
        rays.push([o[0], o[1], o[2], cx - o[0], cy - o[1], cz - o[2]]);
    }
    return rays;
}

/** Rational direction ratios, which force repeated exact ties down the whole ray. Also CONSTRUCTED. */
export function rationalRays(S = 48, H = 32) {
    const rays = [];
    for (let p = 1; p <= 12; p++) for (let q = 1; q <= 12; q++) for (let r = 1; r <= 6; r++) {
        rays.push([0.5, H - 0.5, 0.5, p, -q, r]);
        rays.push([S - 0.5, H - 0.5, 0.5, -p, -q, r]);
    }
    return rays;
}

/**
 * THE ADVERSARIAL ANSWER, per set and NEVER pooled with the realistic one. Each row carries its widest diverging
 * gap IN ULPS, because a decimal gap says nothing about whether binary32 could have resolved it.
 */
export function adversarialRates({ cornerN = 8000, S = 48, H = 32 } = {}) {
    const sc = scene({ S, H });
    const sets = [["corners", cornerRays(cornerN, H)], ["rational", rationalRays(S, H)]];
    return sets.map(([name, rays]) => {
        const r = comparePrecision(rays, sc.isSolid, traverseDDA, 300);
        return {
            name, n: r.n, disagree: r.disagree, rate: r.disagree / r.n,
            widestDivergingGap: r.bestDisagreeingGap,
            widestDivergingUlps: r.bestDisagreeingGap / ULP32,
            tightestTieSurvived: r.worstAgreeingGap,
        };
    });
}

/**
 * *** REFUSES, RATHER THAN RETURNING A NUMBER NOBODY SHOULD QUOTE. *** v3543's precedent: interiorNumberDensity
 * refuses on a pool that has no interior instead of answering confidently about a fixture that cannot be asked.
 * Pooling these two populations produces a figure that moves with how many adversarial rays somebody generated
 * -- measured 1.23% / 2.35% / 3.45% across adversarial n of 8000 / 24000 / 80000, with NEITHER per-set rate
 * moving at all. WHEN SOMEBODY HAS A REASON TO POOL THEM, THEY MUST BRING THE WEIGHTS AND SAY WHERE THEY CAME
 * FROM; there is no natural weighting, because the adversarial rays are not sampled from anything.
 */
export function combinedRate() {
    throw new Error(
        "[ddaPrecisionReport] REFUSED: a combined divergence rate mixes a camera fan with rays constructed to " +
        "force ties, so its value is set by the SIZE OF THE ADVERSARIAL FIXTURE and not by the engine. Measured: " +
        "1.23% / 2.35% / 3.45% at adversarial n = 8000 / 24000 / 80000, while the per-set rates hold at 0.0000% " +
        "and 4.31%. Ask realisticRate() or adversarialRates() and quote the one that answers your question.");
}

export const MEASURED_V3559 = {
    realistic: { stations: 40, rays: 160000, disagree: 0, tightestTieSurvived: 0 },
    adversarial: { corners: { n: 8000, disagree: 344, ulps: 2.35 }, rational: { n: 1728, disagree: 72, ulps: 0.74 } },
    pooledIsAFixtureProperty: { adversarialN: [8000, 24000, 80000], combinedPct: [1.23, 2.35, 3.45],
        fanPct: [0, 0, 0], cornerPct: [4.30, 4.31, 4.31] },
    typedThreshold: "ddaPrecision-selfcheck asserted bestDisagreeingGap < 1e-5. That is 83.9 ULPS of binary32 -- " +
        "a gap the format resolves comfortably -- so it could not have meant 'within a rounding error'. The " +
        "measured divergences sit at 2.35 and 0.74 ulps. The bound is now derived from the 24-bit significand.",
    exactTiesAreDeterministic:
        "The realistic zero is NOT 'no ties occurred'. The tightest tie-gap SURVIVED across forty stations is " +
        "EXACTLY 0, so real camera rays do hit bit-identical tMax values and both precisions break them the same " +
        "way -- the tie-break is `<=` in the same axis order in both, so an exact tie is DETERMINISTIC. What " +
        "diverges is a gap nonzero in float64 that REORDERS under binary32 rounding.",
    pileDrop: { before: 105, after: 104, left: "voxel/ddaFloat32.js", joined: null,
        note: "THE COUNT FELL BY ONE AND NOTHING JOINED, which v3541/v3542 recorded as structurally impossible " +
              "('every round that adds a front-doored analysis module both adds one orphan and rescues its " +
              "predecessor, so a ratchet on that number can never fire'). v3543 retracted the generalisation; " +
              "this is the case that shows why it was wrong. This module exports MEASURED_V3559, the " +
              "analysis-record shape actionable() already recognises, so it is never admitted to the pile." },
    whyThisRound:
        "ddaFloat32.js was one of the five built-but-unwired features v3558's triage left. Its own header says " +
        "the answer exists so nobody spends a day on the first GPU/CPU disagreement -- and the answer was only " +
        "ever printed inside a gate. This gives it a reader.",
};

// ---- FRONT DOOR -------------------------------------------------------------------------------------------------
export function reportLines() {
    const L = [];
    L.push("[ddaPrecisionReport] Is a GPU/CPU voxel-hit disagreement expected from single precision?");
    L.push("");
    const real = realisticRate();
    L.push("  REALISTIC -- what a renderer actually casts (" + real.stations + " camera stations)");
    L.push("    " + (real.n - real.disagree) + "/" + real.n + " agree   " +
           (real.disagree ? (100 * real.rate).toFixed(6) + "% DIVERGE" : "0 divergences") +
           "   stations with any: " + real.badStations.length);
    L.push("    tightest tie-gap SURVIVED: " + (isFinite(real.tightestTieSurvived) ? real.tightestTieSurvived.toExponential(2) : "n/a") +
           "   <- if this is 0, exact ties DID occur and were broken identically");
    L.push("");
    L.push("  ADVERSARIAL -- rays CONSTRUCTED to force ties. These prove divergence is POSSIBLE.");
    L.push("  They are not sampled from anything, so they estimate no rate.");
    for (const a of adversarialRates())
        L.push("    " + a.name.padEnd(10) + a.disagree + "/" + a.n + " diverge  " +
               (100 * a.rate).toFixed(4) + "%   widest diverging gap " +
               a.widestDivergingUlps.toFixed(2) + " ULPS of binary32 (" + a.widestDivergingGap.toExponential(2) + ")");
    L.push("");
    L.push("  A COMBINED RATE IS REFUSED, AND THAT IS THE FINDING:");
    try { combinedRate(); } catch (e) { for (const line of String(e.message).replace(/^Error: /, "").match(/.{1,108}(\s|$)/g) || []) L.push("    " + line.trim()); }
    L.push("");
    L.push("  THE ANSWER, IN ONE SENTENCE: a first-hit disagreement between the CPU DDA and a highp GPU raymarch");
    L.push("  is NOT expected from precision on ordinary camera rays -- so if one appears it is a FINDING and not");
    L.push("  noise. It IS reachable, at a tie-gap under " + TIE_BOUND_ULPS + " ulps of binary32, which is what the");
    L.push("  constructed sets demonstrate.");
    return L;
}

// A REPORTING TOOL MUST PRINT AND EXIT ZERO; the gate beside it is what exits nonzero.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    for (const l of reportLines()) console.log(l);
    process.exit(0);
}
