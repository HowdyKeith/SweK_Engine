// WebGLEngine/tools/ship/flyCompassError.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// WHAT LIMITS THE COMPASS, AS ARITHMETIC (registered in brain/FLY_COMPASS_ERROR_WIP.md before this file existed): the compass-noise round's 48 committed flies on the compass life
// (brain/rl/compassEnv.mjs, the compass round's 200 audit lives), as trained and with the landmark gain x4 (the fly's third weight, p_c, times 4), measuring its heading error -- its believed
// heading less the true one, each tick -- in the calm (ticks before CALM) and in the wind, and the share of each gust (a tick the true heading moved by other than the fly's turn, by GUST_MIN or
// more, with LAG ticks after it) left LAG ticks on; and its home score with its own tally at x4 (the homing round's 200 audit lives). Readings, sign tests over the 48: W (wind less calm), L
// (share left less one half), K1 to K3 (x4 less as trained: share left, calm error, home). The command is tools/ship/takeFlyCompassError.mjs.
//
//   SEEDS, AUDIT, COURSE_AUDIT, ALPHA, ARMS, LAG, GUST_MIN, GAIN, RESULTS, NOISE_SHA256, FILES, WORDS
//   circSd(angles)                the circular sd of a set of angles, sqrt(-2 ln R)
//   measure(fly, lives)           { calm, wind, share, gusts, course }: the error's circular sd in the calm and the wind, the median share of a gust left, the gusts counted, the course score
//   gained(weights, k)            the weights with p_c times k
//   flyOne(arm, s, F, course, home)   { kind: "fly", arm, s, weightsHash, trained: measure, x4: { ...measure, home } }
//   fileOf(bytes), parseArgs(argv), checkRecords(lines, F), reading(lines, F), readingLines(R)   (F: fileOf each of FILES)
// NOT HERE: the 49 jobs (the command runs them; the gate never does).
"use strict";
import { createHash } from "node:crypto";
import { signTest } from "./voxelHome.mjs";
import { CompassEnv, CALM, MAX_TURN, wrap } from "../../brain/rl/compassEnv.mjs";
import * as N from "./flyHomeCompassNoise.mjs";
import * as T from "./flyTrainedHome.mjs";
import * as H from "./flyHome.mjs";
import * as V from "./flyCompass.mjs";

export const SEEDS = N.SEEDS, AUDIT = N.AUDIT, COURSE_AUDIT = V.AUDIT, ALPHA = 0.01, ARMS = N.ARMS, LAG = 39, GUST_MIN = 0.05, GAIN = 4;
export const RESULTS = "brain/flyCompassErrorRound.jsonl", NOISE_SHA256 = "89be16c3a54a14d49084f5027925fbe2aab958dc99805d09510c3a6dabf4f74a";
export const FILES = Object.freeze({ ...N.FILES, noise: N.RESULTS });
const words = (above, below, none) => Object.freeze([above, below, none]);
export const WORDS = Object.freeze({
    W: words("THE COMPASS ERRS MORE IN THE WIND THAN IN THE CALM", "THE COMPASS ERRS LESS IN THE WIND THAN IN THE CALM", "THE COMPASS ERRS AS MUCH IN THE WIND AS IN THE CALM, AS FAR AS CAN BE TOLD"),
    L: words("MOST OF A GUST STAYS UNCORRECTED", "MOST OF A GUST IS CORRECTED", "HALF OF A GUST STAYS, AS FAR AS CAN BE TOLD"),
    K1: words("LEANING HARDER ON THE SCENE LEAVES MORE OF A GUST", "LEANING HARDER ON THE SCENE CATCHES GUSTS FASTER", "LEANING HARDER ON THE SCENE CHANGES NOTHING OF A GUST, AS FAR AS CAN BE TOLD"),
    K2: words("LEANING HARDER ON THE SCENE ERRS MORE IN THE CALM", "LEANING HARDER ON THE SCENE ERRS LESS IN THE CALM", "LEANING HARDER ON THE SCENE CHANGES NOTHING IN THE CALM, AS FAR AS CAN BE TOLD"),
    K3: words("LEANING HARDER ON THE SCENE FINDS HOME BETTER", "LEANING HARDER ON THE SCENE FINDS HOME WORSE", "LEANING HARDER ON THE SCENE CANNOT BE TOLD APART AT FINDING HOME"),
});

/** See the header. */
export function circSd(angles) { let c = 0, s = 0; for (const a of angles) { c += Math.cos(a); s += Math.sin(a); } const R = Math.hypot(c, s) / angles.length; return Math.sqrt(-2 * Math.log(R)); }
const median = (v) => { const w = [...v].sort((a, b) => a - b), n = w.length; return n % 2 ? w[n >> 1] : (w[n / 2 - 1] + w[n / 2]) / 2; };
/** See the header. */
export function measure(fly, lives) {
    const env = new CompassEnv(), calm = [], wind = [], shares = []; let sum = 0;
    for (const seed of lives) {
        let o = env.reset(seed), done = false; const e = [], gusts = [];
        while (!done) { const before = env.th, a = fly.act(o), u = Math.max(-MAX_TURN, Math.min(MAX_TURN, Number.isFinite(a[0]) ? a[0] : 0)), r = env.step(a), g = wrap(env.th - wrap(before + u));
            if (Math.abs(g) >= GUST_MIN) gusts.push(e.length); e.push(wrap(fly.phi - env.th)); o = r.obs; done = r.done; }
        e.forEach((x, t) => (t < CALM ? calm : wind).push(x));
        for (const t of gusts) { if (t < 1 || t + LAG >= e.length) continue; const jump = wrap(e[t] - e[t - 1]); if (jump !== 0) shares.push(wrap(e[t + LAG] - e[t - 1]) / jump); }
        sum += env.ret;
    }
    return { calm: circSd(calm), wind: circSd(wind), share: median(shares), gusts: shares.length, course: sum / lives.length };
}
/** See the header. */
export function gained(weights, k) { const w = Float32Array.from(weights); w[2] *= k; return w; }
/** See the header. */
export function flyOne(arm, s, F, course = COURSE_AUDIT, home = AUDIT) {
    const c = N.committedOf(arm, s, F), fly = (w) => T.flyOf("HOMEP", s, w), w4 = gained(c.weights, GAIN);
    return { kind: "fly", arm, s, weightsHash: c.weightsHash, trained: measure(fly(c.weights), course), x4: { ...measure(fly(w4), course), home: H.homeScore(fly(w4), home) } };
}
/** See the header. */
export function fileOf(bytes) { return { sha256: createHash("sha256").update(bytes).digest("hex"), lines: bytes.toString("utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) }; }
/** See the header. */
export function parseArgs(argv) { return N.parseArgs(argv); }

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b), fin = (v) => Number.isFinite(v);
const okM = (m) => m && ["calm", "wind", "share", "course"].every((k) => fin(m[k])) && Number.isInteger(m.gusts) && m.gusts > 0;
/** See the header. */
export function checkRecords(lines, F) {
    const bad = [];
    if (!F || !F.noise || F.noise.sha256 !== NOISE_SHA256) return [`the compass-noise round's file is not the one committed (sha256 ${NOISE_SHA256.slice(0, 16)}...)`];
    const nb = N.checkRecords(F.noise.lines, F); if (nb.length) return [`the compass-noise round's file fails its own checks: ${nb[0]}`];
    const flies = lines.filter((r) => r && r.kind === "fly"), seen = new Map();
    for (const r of flies) { const k = r.arm + "/" + r.s; seen.set(k, (seen.get(k) || 0) + 1); }
    for (const arm of ARMS) for (const s of SEEDS) { const c = seen.get(arm + "/" + s) || 0; if (c !== 1) bad.push(`${arm} draw ${s} is there ${c} times (once is registered)`); }
    if (flies.length !== ARMS.length * SEEDS.length) bad.push(`${flies.length} flies (registered: ${ARMS.length * SEEDS.length})`);
    for (const r of flies) {
        const id = `${r.arm} draw ${r.s}`; let c = null; try { c = ARMS.includes(r.arm) && SEEDS.includes(r.s) ? N.committedOf(r.arm, r.s, F) : null; } catch { /* said below */ }
        if (!c) { bad.push(`${id} is not a registered fly`); continue; }
        if (r.weightsHash !== c.weightsHash) bad.push(`${id} is not its arm's committed weights`);
        if (!okM(r.trained) || !okM(r.x4) || !(fin(r.x4.home) && r.x4.home >= 0 && r.x4.home <= 1)) { bad.push(`${id} does not hold its measures as trained and at x${GAIN}`); continue; }
        if (r.trained.course !== c.course) bad.push(`${id} as trained is not its committed course score to the bit`);
    }
    const re = lines.filter((r) => r && r.kind === "recheck"), first = flies.find((r) => r.arm === "HOMEP" && r.s === SEEDS[0]);
    if (re.length !== 1 || !first || re[0].arm !== "HOMEP" || re[0].s !== SEEDS[0] || !same(re[0].trained, first.trained) || !same(re[0].x4, first.x4)) bad.push(`HOMEP draw ${SEEDS[0]} flown a second time is not there once with the same measures`);
    return bad;
}
const pick = (w, t) => (t.p <= ALPHA && t.above > t.below ? w[0] : t.p <= ALPHA && t.below > t.above ? w[1] : w[2]);
/** See the header. A failed check leaves every reading null. */
export function reading(lines, F) {
    const checks = checkRecords(lines, F), out = { checks, arms: {}, W: null, L: null, K1: null, K2: null, K3: null };
    if (checks.length) return out;
    const flies = lines.filter((r) => r && r.kind === "fly"), home = (r) => N.committedOf(r.arm, r.s, F).home, mean = (v) => v.reduce((a, b) => a + b, 0) / v.length;
    for (const arm of ARMS) { const v = flies.filter((r) => r.arm === arm); out.arms[arm] = { trained: Object.fromEntries(["calm", "wind", "share", "course"].map((k) => [k, mean(v.map((r) => r.trained[k]))])), home: mean(v.map(home)),
        x4: Object.fromEntries(["calm", "wind", "share", "course", "home"].map((k) => [k, mean(v.map((r) => r.x4[k]))])) }; }
    const t = (name, d) => { const x = signTest(d, 0); return { ...x, diffs: d, word: pick(WORDS[name], x) }; };
    return { ...out, W: t("W", flies.map((r) => r.trained.wind - r.trained.calm)), L: t("L", flies.map((r) => r.trained.share - 0.5)), K1: t("K1", flies.map((r) => r.x4.share - r.trained.share)),
        K2: t("K2", flies.map((r) => r.x4.calm - r.trained.calm)), K3: t("K3", flies.map((r) => r.x4.home - home(r))) };
}
/** See the header. */
export function readingLines(R) {
    const out = [], f = (x) => x.toFixed(4);
    if (R.checks.length) { out.push("A CHECK FAILED, AND THE READING IS NOT WEIGHED:"); for (const c of R.checks) out.push("  " + c); return out; }
    out.push(`the checks hold: the compass-noise round's file as committed and passing its own checks; ${ARMS.length * SEEDS.length} flies, each once, its arm's committed weights, as trained its committed course score to the bit; HOMEP draw ${SEEDS[0]} the same twice`);
    out.push("", `each arm's mean: as trained -- calm, wind, share left, course, home | at x${GAIN} -- the same`);
    for (const [arm, a] of Object.entries(R.arms)) out.push(`  ${arm.padEnd(9)} ${f(a.trained.calm)} ${f(a.trained.wind)} ${f(a.trained.share)} ${f(a.trained.course)} ${f(a.home)} | ${f(a.x4.calm)} ${f(a.x4.wind)} ${f(a.x4.share)} ${f(a.x4.course)} ${f(a.x4.home)}`);
    for (const k of ["W", "L", "K1", "K2", "K3"]) out.push("", `${k}: above ${R[k].above}, below ${R[k].below}, ties ${R[k].ties}; exact two-sided p ${R[k].p.toExponential(3)}`, `  ${R[k].word}`);
    return out;
}
