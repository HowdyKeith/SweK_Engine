// WebGLEngine/tools/ship/flyHomeGradientCourse.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE BETTER WALK WITH THE BETTER CHOOSER, AS ARITHMETIC (registered in brain/FLY_HOME_GRADIENT_COURSE_WIP.md before this file existed): the gradient round's HOME16 walks
// (brain/flyHomeGradientRound.jsonl, every point recorded), their point chosen by the chooser round's HOMEBYC chooser (tools/ship/flyHomeChooser.mjs: the best course score on the trainer
// round's BAT64 lives). No walk is run again. Weighed against HOME16, HOMEBYC and COURSE64 as committed. Readings: Q (H16BYC against HOME16) and K (against HOMEBYC), exact sign tests draw for
// draw; G (against COURSE64), an exact rank sum. The command is tools/ship/takeFlyHomeGradientCourse.mjs.
//
//   SEEDS, AUDIT, ALPHA, ITERS, ARMS, LEAD, CHOOSER, RESULTS, GRADIENT_SHA256, CHOOSER_SHA256, FILES, WORDS
//   chooseOne(s, gradient, audit, course, eps)   { kind: "draw", arm: "H16BYC", ...the chooser round's choice record } of HOME16's walk of draw s (gradient: fileOf the gradient round's file)
//   fileOf(bytes), parseArgs(argv), checkRecords(lines, F), reading(lines, F), readingLines(R)   (F: fileOf each of FILES)
// NOT HERE: the 13 choices (the command runs them; the gate never does).
"use strict";
import { createHash } from "node:crypto";
import { rankSum, hashWeights, unpackWeights } from "./paintingFly.mjs";
import { signTest } from "./voxelHome.mjs";
import * as C from "./flyHomeChooser.mjs";
import * as Y from "./flyHomeGradient.mjs";
import * as T from "./flyTrainedHome.mjs";

export const SEEDS = T.SEEDS, AUDIT = T.AUDIT, ALPHA = 0.01, ITERS = Y.ITERS, ARMS = Object.freeze(["H16BYC"]), LEAD = "H16BYC", CHOOSER = "HOMEBYC";
export const RESULTS = "brain/flyHomeGradientCourseRound.jsonl";
export const GRADIENT_SHA256 = "138ea7125387ad2464c206bb6ffd76ca07a3206e2e7aef71e023d35c991e9024", CHOOSER_SHA256 = "8951af17ed60d6dc296672eee5d75d62ebe21addc11ac33678cb8982d8ee2876";
export const FILES = Object.freeze({ ...C.FILES, chooser: C.RESULTS, gradient: Y.RESULTS });
const three = (a, b) => Object.freeze([`${a} FINDS HOME BETTER THAN ${b}`, `${a} FINDS HOME WORSE THAN ${b}`, `${a} CANNOT BE TOLD APART FROM ${b} AT FINDING HOME`]);
const HB = "THE 16-LIFE WALK CHOSEN BY ITS COURSE SCORE";
export const WORDS = Object.freeze({ Q: three(HB, "THE 16-LIFE WALK CHOSEN ON ITS 64 HOMING LIVES"), K: three(HB, "THE 4-LIFE WALK CHOSEN BY ITS COURSE SCORE"), G: three(HB, "THE FLY TRAINED TO HOLD A COURSE") });

const walkOf = (gradient, s) => (gradient ? gradient.lines.find((r) => r && r.kind === "draw" && r.arm === Y.LEAD && r.s === s) || null : null);
/** See the header. */
export function chooseOne(s, gradient, audit = AUDIT, course, eps) {
    const w = walkOf(gradient, s); if (!w) throw new Error(`flyHomeGradientCourse.chooseOne: HOME16 draw ${s} is not in the file given`);
    return { ...C.chooseOne(CHOOSER, s, { ...w, kind: "walk" }, audit, ...(course === undefined ? [] : [course, eps])), arm: LEAD };
}
/** See the header. */
export function fileOf(bytes) { return { sha256: createHash("sha256").update(bytes).digest("hex"), lines: bytes.toString("utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) }; }
/** See the header. */
export function parseArgs(argv) {
    if (!Array.isArray(argv)) return null;
    const [cmd, ...rest] = argv;
    if (cmd === "job" && rest.length === 2 && ARMS.includes(rest[0]) && /^[1-9]\d*$/.test(rest[1]) && SEEDS.includes(Number(rest[1]))) return { cmd, arm: rest[0], s: Number(rest[1]) };
    if (cmd === "read" && rest.length === 0) return { cmd };
    if (cmd === "run" && rest.length === 0) return { cmd, jobs: 4 };
    if (cmd === "run" && rest.length === 2 && rest[0] === "--jobs" && /^[1-9]\d*$/.test(rest[1])) return { cmd, jobs: Number(rest[1]) };
    return null;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b), fin = (v) => Number.isFinite(v), FIRST = SEEDS[0];
/** See the header. */
export function checkRecords(lines, F) {
    const bad = [];
    if (!F || !F.gradient || F.gradient.sha256 !== GRADIENT_SHA256) bad.push(`the gradient round's file is not the one committed (sha256 ${GRADIENT_SHA256.slice(0, 16)}...)`);
    else { const g = Y.checkRecords(F.gradient.lines, F); if (g.length) bad.push(`the gradient round's file fails its own checks: ${g[0]}`); }
    if (!F || !F.chooser || F.chooser.sha256 !== CHOOSER_SHA256) bad.push(`the chooser round's file is not the one committed (sha256 ${CHOOSER_SHA256.slice(0, 16)}...)`);
    else { const c = C.checkRecords(F.chooser.lines, F); if (c.length) bad.push(`the chooser round's file fails its own checks: ${c[0]}`); }
    if (bad.length) return bad;
    const draws = lines.filter((r) => r && r.kind === "draw"), seen = new Map();
    for (const r of draws) { const k = r.arm + "/" + r.s; seen.set(k, (seen.get(k) || 0) + 1); }
    for (const s of SEEDS) { const c = seen.get(LEAD + "/" + s) || 0; if (c !== 1) bad.push(`${LEAD} draw ${s} is there ${c} times (once is registered)`); }
    if (draws.length !== SEEDS.length) bad.push(`${draws.length} choices (registered: ${SEEDS.length})`);
    for (const r of draws) {
        const id = `${r.arm} draw ${r.s}`, w = walkOf(F.gradient, r.s);
        if (r.arm !== LEAD || !w) { bad.push(`${id} is not a registered choice`); continue; }
        if (!same(r.chooser, C.chooserOf(CHOOSER, r.s))) bad.push(`${id} was chosen on other lives than HOMEBYC's`);
        if (r.walkHash !== w.pointsHash) { bad.push(`${id} is not a choice of HOME16's walk of its draw`); continue; }
        if (!(Array.isArray(r.scores) && r.scores.length === ITERS && r.scores.every(fin))) { bad.push(`${id} does not hold a score for each of the ${ITERS} points`); continue; }
        if (r.keptAt !== C.firstBest(r.scores)) bad.push(`${id}'s point is not the first best of its scores`);
        let p = null; try { p = unpackWeights(r.weights); } catch { /* said below */ }
        if (r.weightCount !== 3 || !p || hashWeights(p) !== r.weightsHash || hashWeights(C.pointsOf(w)[r.keptAt]) !== r.weightsHash) bad.push(`${id}'s weights are not its walk's point ${r.keptAt}`);
        if (!(fin(r.home) && r.home >= 0 && r.home <= 1) || !fin(r.course)) bad.push(`${id} has no home score from 0 to 1 or no course score`);
        if (!(r.rates && ["a", "b", "c"].every((k) => fin(r.rates[k])))) bad.push(`${id} does not say its rates`);
    }
    const re = lines.filter((r) => r && r.kind === "recheck"), first = draws.find((r) => r.s === FIRST);
    if (re.length !== 1 || !first || re[0].s !== FIRST || re[0].weightsHash !== first.weightsHash || re[0].home !== first.home) bad.push(`${LEAD} draw ${FIRST} chosen a second time is not there once with the same point and score`);
    return bad;
}
const stats = (v) => { const n = v.length, mean = v.reduce((a, b) => a + b, 0) / n; return { n, mean, sd: Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / n), min: Math.min(...v), max: Math.max(...v) }; };
const pick = (w, better, worse) => (better ? w[0] : worse ? w[1] : w[2]);
/** See the header. HOME16, HOMEBYC and COURSE64 are the committed rounds'; a failed check leaves every reading null. */
export function reading(lines, F) {
    const checks = checkRecords(lines, F), arms = {}, by = (recs) => SEEDS.map((s) => recs.find((r) => r.s === s)).filter(Boolean);
    const ref = { [LEAD]: by(lines.filter((r) => r && r.kind === "draw" && r.arm === LEAD)), HOME16: F && F.gradient ? by(F.gradient.lines.filter((r) => r.kind === "draw")) : [],
        HOMEBYC: F && F.chooser ? by(F.chooser.lines.filter((r) => r.kind === "draw" && r.arm === "HOMEBYC")) : [], COURSE64: F && F.trained ? by(F.trained.lines.filter((r) => r.kind === "fly" && r.arm === "COURSE64")) : [] };
    for (const [arm, v] of Object.entries(ref)) { if (!v.length) continue; arms[arm] = { ...stats(v.map((r) => r.home)), course: v.reduce((n, r) => n + r.course, 0) / v.length };
        if (v.every((r) => Number.isInteger(r.keptAt))) arms[arm].keptAt = v.map((r) => r.keptAt); }
    const out = { checks, arms, Q: null, K: null, G: null };
    if (checks.length) return out;
    const home = (arm) => ref[arm].map((r) => r.home);
    const paired = (name, b) => { const d = SEEDS.map((s, i) => home(LEAD)[i] - home(b)[i]), h = signTest(d, 0); return { ...h, a: LEAD, b, diffs: d, word: pick(WORDS[name], h.p <= ALPHA && h.above > h.below, h.p <= ALPHA && h.below > h.above) }; };
    const g = rankSum(home(LEAD), home("COURSE64"));
    return { ...out, Q: paired("Q", "HOME16"), K: paired("K", "HOMEBYC"), G: { ...g, a: LEAD, b: "COURSE64", word: pick(WORDS.G, g.p <= ALPHA && g.pHigher < g.pLower, g.p <= ALPHA && g.pLower < g.pHigher) } };
}
/** See the header. */
export function readingLines(R) {
    const out = [], f = (x) => (x === null || x === undefined ? "-" : x.toFixed(4));
    if (R.checks.length) { out.push("A CHECK FAILED, AND THE READING IS NOT WEIGHED:"); for (const c of R.checks) out.push("  " + c); }
    else out.push(`the checks hold: the gradient, chooser and trained-to-home rounds' files as committed and passing their own checks; ${SEEDS.length} choices, each once, of HOME16's walk of its draw, on HOMEBYC's lives, the first best of ${ITERS} scores; ${LEAD} draw ${FIRST} the same twice`);
    out.push("", `the arms (the mean of 12 flies; ${AUDIT.length} homing audit lives; course is the compass round's audit; all but ${LEAD} as committed):`);
    for (const [arm, s] of Object.entries(R.arms)) out.push(`${arm.padEnd(9)} home ${f(s.mean)}  | sd ${f(s.sd)}, least ${f(s.min)}, most ${f(s.max)} | course ${f(s.course)}${s.keptAt ? ` | kept at ${s.keptAt.join(" ")}` : ""}`);
    for (const name of ["Q", "K"]) { const t = R[name]; if (t) out.push("", `${name} (${t.a} against ${t.b}, draw for draw): above ${t.above}, below ${t.below}, ties ${t.ties}; exact two-sided p ${t.p.toExponential(3)}`, `  ${t.word}`); }
    if (R.G) out.push("", `G (${R.G.a} against ${R.G.b}): ${R.G.a}'s ranks sum to ${R.G.sumA} (the middle is ${R.G.n * (R.G.n + R.G.m + 1) / 2}), ties ${R.G.ties}; exact two-sided p ${R.G.p.toExponential(3)}`, `  ${R.G.word}`);
    return out;
}
