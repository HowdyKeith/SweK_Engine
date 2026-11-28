// WebGLEngine/tools/ship/flyCourseLift.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// DO THE COURSE-CHOSEN FLIES GAIN LEAST FROM THE RICHER SCENE? AS ARITHMETIC (registered in brain/FLY_COURSE_LIFT_WIP.md before this file existed, and before the tally-share round had run).
// No flight: the tally-share round's results file (tools/ship/flyTallyShare.mjs) holds each of the 48 flies' own-tally home on 200 fresh lives in the plain scene (ownPlain) and the 26-type
// scene (ownType). A fly's lift is ownType less ownPlain. The reading L is the 24 pair differences by draw -- HOMEP_s lift less COURSE64_s lift, and HOME16_s less H16BYC_s -- against 0.
// The command is tools/ship/takeFlyCourseLift.mjs (read only).
//
//   PAIRS, ALPHA, WORDS, FILES
//   liftOf(r), pairDiffs(flies), reading(lines, F), readingLines(R)   (lines: the tally-share round's file; F: fileOf each of FILES)
"use strict";
import { signTest } from "./voxelHome.mjs";
import * as FS from "./flyTallyShare.mjs";

export const PAIRS = Object.freeze([Object.freeze(["HOMEP", "COURSE64"]), Object.freeze(["HOME16", "H16BYC"])]), ALPHA = 0.01, FILES = FS.FILES, SEEDS = FS.SEEDS;
export const WORDS = Object.freeze(["THE HOME-CHOSEN FLIES GAIN MORE FROM THE RICHER SCENE THAN THEIR COURSE-CHOSEN PAIRS", "THE HOME-CHOSEN FLIES GAIN LESS FROM THE RICHER SCENE THAN THEIR COURSE-CHOSEN PAIRS",
    "THE HOME-CHOSEN AND THE COURSE-CHOSEN FLIES CANNOT BE TOLD APART AT WHAT THE RICHER SCENE GIVES THEM"]);

/** A fly's lift: its own-tally home in the 26-type scene less in the plain. */
export const liftOf = (r) => r.ownType - r.ownPlain;
/** The 24 differences, pair by pair and draw by draw (home-chosen less course-chosen). */
export function pairDiffs(flies) {
    const at = (a, s) => flies.find((r) => r.arm === a && r.s === s), out = [];
    for (const [h, c] of PAIRS) for (const s of SEEDS) out.push({ pair: h + "-" + c, s, d: liftOf(at(h, s)) - liftOf(at(c, s)) });
    return out;
}
/** See the header. The tally-share round's checks first; a failed one leaves every reading null. */
export function reading(lines, F) {
    const checks = FS.checkRecords(lines, F).map((m) => `the tally-share round's file: ${m}`), out = { checks, arms: {}, L: null, byPair: {} };
    if (checks.length) return out;
    const flies = lines.filter((r) => r.kind === "fly"), mean = (v) => v.reduce((a, b) => a + b, 0) / v.length;
    for (const arm of FS.ARMS) out.arms[arm] = mean(flies.filter((r) => r.arm === arm).map(liftOf));
    const ds = pairDiffs(flies), t = signTest(ds.map((x) => x.d), 0);
    for (const [h, c] of PAIRS) out.byPair[h + "-" + c] = signTest(ds.filter((x) => x.pair === h + "-" + c).map((x) => x.d), 0);
    return { ...out, diffs: ds, L: { ...t, word: t.p <= ALPHA && t.above > t.below ? WORDS[0] : t.p <= ALPHA && t.below > t.above ? WORDS[1] : WORDS[2] } };
}
/** See the header. */
export function readingLines(R) {
    const out = [], f = (x) => x.toFixed(4);
    if (R.checks.length) { out.push("A CHECK FAILED, AND THE READING IS NOT WEIGHED:"); for (const c of R.checks) out.push("  " + c); return out; }
    out.push("the checks hold: the tally-share round's file passes that round's own checks");
    out.push("", "each arm's mean lift (own tally, 26-type less plain, on the fresh lives):");
    for (const [arm, v] of Object.entries(R.arms)) out.push(`  ${arm.padEnd(9)} ${f(v)}`);
    out.push("", `L: above ${R.L.above}, below ${R.L.below}, ties ${R.L.ties} of 24; exact two-sided p ${R.L.p.toExponential(3)}`, `  ${R.L.word}`);
    for (const [k, t] of Object.entries(R.byPair)) out.push(`  described: ${k} alone: above ${t.above}, below ${t.below} of 12 (p ${t.p.toExponential(3)})`);
    return out;
}
