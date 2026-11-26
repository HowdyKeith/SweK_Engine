// WebGLEngine/tools/ship/flySceneTypes.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// A SCENE EACH RING TYPE SEES FOR ITSELF, AS ARITHMETIC (registered in brain/FLY_SCENE_TYPES_WIP.md before this file existed): the compass-noise round's 48 committed flies, as trained, in the
// 11-class and 26-type scenes (brain/rl/typedSceneEnv.mjs): on the compass life over the compass round's 200 audit lives (the compass-error round's measures and the course score) and home with
// the fly's own tally over the homing round's 200 audit lives. Readings, sign tests over the 48: H11 and C11 (home and course in the 11-class scene less the committed), W11 (its wind error
// less the compass-error round's), H26 (home in the 26-type scene less in the 11-class). The command is tools/ship/takeFlySceneTypes.mjs.
//
//   SEEDS, AUDIT, COURSE_AUDIT, ALPHA, ARMS, SCENES, RESULTS, ERROR_SHA256, FILES, WORDS
//   measure(fly, lives, mode)     the compass-error round's measures ({ calm, wind, share, gusts, course }) in a scene
//   homeIn(fly, lives, mode)      the homing fly's score in a scene, with its own tally
//   flyOne(arm, s, F, course, home)   { kind: "fly", arm, s, weightsHash, class: { ...measure, home }, type: { ...measure, home } }
//   fileOf(bytes), parseArgs(argv), checkRecords(lines, F), reading(lines, F), readingLines(R)   (F: fileOf each of FILES)
// NOT HERE: the 49 jobs (the command runs them; the gate never does).
"use strict";
import { createHash } from "node:crypto";
import { signTest } from "./voxelHome.mjs";
import { CALM, MAX_TURN, wrap } from "../../brain/rl/compassEnv.mjs";
import { TypedCompassEnv, TypedHomeEnv } from "../../brain/rl/typedSceneEnv.mjs";
import { HomingFly } from "../../brain/rl/homingFly.mjs";
import * as E from "./flyCompassError.mjs";
import * as N from "./flyHomeCompassNoise.mjs";
import * as T from "./flyTrainedHome.mjs";

export const SEEDS = E.SEEDS, AUDIT = E.AUDIT, COURSE_AUDIT = E.COURSE_AUDIT, ALPHA = 0.01, ARMS = E.ARMS, SCENES = Object.freeze(["class", "type"]);
export const RESULTS = "brain/flySceneTypesRound.jsonl", ERROR_SHA256 = "b8c649c2d5946ece9f0fa7ae717ef4a86a177bc9a5d99b66658ca0c2c7cccd8a";
export const FILES = Object.freeze({ ...E.FILES, error: E.RESULTS });
const words = (a, b, c) => Object.freeze([a, b, c]);
export const WORDS = Object.freeze({
    H11: words("IN THE 11-CLASS SCENE THE FLY FINDS HOME BETTER", "IN THE 11-CLASS SCENE THE FLY FINDS HOME WORSE", "IN THE 11-CLASS SCENE THE FLY CANNOT BE TOLD APART AT FINDING HOME"),
    C11: words("IN THE 11-CLASS SCENE THE FLY HOLDS A COURSE BETTER", "IN THE 11-CLASS SCENE THE FLY HOLDS A COURSE WORSE", "IN THE 11-CLASS SCENE THE FLY CANNOT BE TOLD APART AT HOLDING A COURSE"),
    W11: words("IN THE 11-CLASS SCENE THE COMPASS ERRS MORE IN THE WIND", "IN THE 11-CLASS SCENE THE COMPASS ERRS LESS IN THE WIND", "IN THE 11-CLASS SCENE THE COMPASS ERRS AS MUCH IN THE WIND, AS FAR AS CAN BE TOLD"),
    H26: words("THE 26-TYPE SCENE FINDS HOME BETTER THAN THE 11-CLASS", "THE 26-TYPE SCENE FINDS HOME WORSE THAN THE 11-CLASS", "THE 26-TYPE SCENE CANNOT BE TOLD APART FROM THE 11-CLASS AT FINDING HOME"),
});

const median = (v) => { const w = [...v].sort((a, b) => a - b), n = w.length; return n % 2 ? w[n >> 1] : (w[n / 2 - 1] + w[n / 2]) / 2; };
/** See the header: flyCompassError.measure's arithmetic, in a scene. */
export function measure(fly, lives, mode) {
    const env = new TypedCompassEnv(mode), calm = [], wind = [], shares = []; let sum = 0;
    for (const seed of lives) {
        let o = env.reset(seed), done = false; const e = [], gusts = [];
        while (!done) { const before = env.th, a = fly.act(o), u = Math.max(-MAX_TURN, Math.min(MAX_TURN, Number.isFinite(a[0]) ? a[0] : 0)), r = env.step(a), g = wrap(env.th - wrap(before + u));
            if (Math.abs(g) >= E.GUST_MIN) gusts.push(e.length); e.push(wrap(fly.phi - env.th)); o = r.obs; done = r.done; }
        e.forEach((x, t) => (t < CALM ? calm : wind).push(x));
        for (const t of gusts) { if (t < 1 || t + E.LAG >= e.length) continue; const jump = wrap(e[t] - e[t - 1]); if (jump !== 0) shares.push(wrap(e[t + E.LAG] - e[t - 1]) / jump); }
        sum += env.ret;
    }
    return { calm: E.circSd(calm), wind: E.circSd(wind), share: median(shares), gusts: shares.length, course: sum / lives.length };
}
/** See the header. */
export function homeIn(fly, lives, mode) { const env = new TypedHomeEnv(mode), h = new HomingFly(fly); let sum = 0; for (const seed of lives) { let o = env.reset(seed), done = false; while (!done) { const r = env.step(h.act(o)); o = r.obs; done = r.done; } sum += env.score(); } return sum / lives.length; }
/** See the header. */
export function flyOne(arm, s, F, course = COURSE_AUDIT, home = AUDIT) {
    const c = N.committedOf(arm, s, F), fly = () => T.flyOf("HOMEP", s, c.weights), out = { kind: "fly", arm, s, weightsHash: c.weightsHash };
    for (const m of SCENES) out[m] = { ...measure(fly(), course, m), home: homeIn(fly(), home, m) };
    return out;
}
/** See the header. */
export function fileOf(bytes) { return { sha256: createHash("sha256").update(bytes).digest("hex"), lines: bytes.toString("utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) }; }
/** See the header. */
export function parseArgs(argv) { return E.parseArgs(argv); }

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b), fin = (v) => Number.isFinite(v);
const okM = (m) => m && ["calm", "wind", "share", "course", "home"].every((k) => fin(m[k])) && m.home >= 0 && m.home <= 1 && Number.isInteger(m.gusts) && m.gusts > 0;
const errOf = (F, arm, s) => F.error.lines.find((r) => r && r.kind === "fly" && r.arm === arm && r.s === s) || null;
/** See the header. */
export function checkRecords(lines, F) {
    const bad = [];
    if (!F || !F.error || F.error.sha256 !== ERROR_SHA256) return [`the compass-error round's file is not the one committed (sha256 ${ERROR_SHA256.slice(0, 16)}...)`];
    const eb = E.checkRecords(F.error.lines, F); if (eb.length) return [`the compass-error round's file fails its own checks: ${eb[0]}`];
    const flies = lines.filter((r) => r && r.kind === "fly"), seen = new Map();
    for (const r of flies) { const k = r.arm + "/" + r.s; seen.set(k, (seen.get(k) || 0) + 1); }
    for (const arm of ARMS) for (const s of SEEDS) { const c = seen.get(arm + "/" + s) || 0; if (c !== 1) bad.push(`${arm} draw ${s} is there ${c} times (once is registered)`); }
    if (flies.length !== ARMS.length * SEEDS.length) bad.push(`${flies.length} flies (registered: ${ARMS.length * SEEDS.length})`);
    for (const r of flies) {
        const id = `${r.arm} draw ${r.s}`, er = ARMS.includes(r.arm) && SEEDS.includes(r.s) ? errOf(F, r.arm, r.s) : null;
        if (!er) { bad.push(`${id} is not a registered fly`); continue; }
        if (r.weightsHash !== er.weightsHash) bad.push(`${id} is not its arm's committed weights`);
        if (!SCENES.every((m) => okM(r[m]))) bad.push(`${id} does not hold its measures and home score in each scene`);
    }
    const re = lines.filter((r) => r && r.kind === "recheck"), first = flies.find((r) => r.arm === "HOMEP" && r.s === SEEDS[0]);
    if (re.length !== 1 || !first || re[0].arm !== "HOMEP" || re[0].s !== SEEDS[0] || !SCENES.every((m) => same(re[0][m], first[m]))) bad.push(`HOMEP draw ${SEEDS[0]} flown a second time is not there once with the same measures`);
    return bad;
}
const pick = (w, t) => (t.p <= ALPHA && t.above > t.below ? w[0] : t.p <= ALPHA && t.below > t.above ? w[1] : w[2]);
/** See the header. A failed check leaves every reading null. */
export function reading(lines, F) {
    const checks = checkRecords(lines, F), out = { checks, arms: {}, H11: null, C11: null, W11: null, H26: null };
    if (checks.length) return out;
    const flies = lines.filter((r) => r && r.kind === "fly"), plain = (r) => ({ ...errOf(F, r.arm, r.s).trained, home: N.committedOf(r.arm, r.s, F).home }), mean = (v) => v.reduce((a, b) => a + b, 0) / v.length;
    for (const arm of ARMS) { const v = flies.filter((r) => r.arm === arm); out.arms[arm] = Object.fromEntries([["plain", plain], ["class", (r) => r.class], ["type", (r) => r.type]].map(([k, f]) => [k, Object.fromEntries(["calm", "wind", "course", "home"].map((m) => [m, mean(v.map((r) => f(r)[m]))]))])); }
    const t = (name, d) => { const x = signTest(d, 0); return { ...x, diffs: d, word: pick(WORDS[name], x) }; };
    return { ...out, H11: t("H11", flies.map((r) => r.class.home - plain(r).home)), C11: t("C11", flies.map((r) => r.class.course - plain(r).course)), W11: t("W11", flies.map((r) => r.class.wind - plain(r).wind)), H26: t("H26", flies.map((r) => r.type.home - r.class.home)) };
}
/** See the header. */
export function readingLines(R) {
    const out = [], f = (x) => x.toFixed(4);
    if (R.checks.length) { out.push("A CHECK FAILED, AND THE READING IS NOT WEIGHED:"); for (const c of R.checks) out.push("  " + c); return out; }
    out.push(`the checks hold: the compass-error round's file as committed and passing its own checks; ${ARMS.length * SEEDS.length} flies, each once, its arm's committed weights, in each scene; HOMEP draw ${SEEDS[0]} the same twice`);
    out.push("", "each arm's mean calm error, wind error, course, home: plain (committed) | 11 classes | 26 types");
    for (const [arm, a] of Object.entries(R.arms)) out.push(`  ${arm.padEnd(9)} ${["plain", "class", "type"].map((k) => `${f(a[k].calm)} ${f(a[k].wind)} ${f(a[k].course)} ${f(a[k].home)}`).join(" | ")}`);
    for (const k of ["H11", "C11", "W11", "H26"]) out.push("", `${k}: above ${R[k].above}, below ${R[k].below}, ties ${R[k].ties}; exact two-sided p ${R[k].p.toExponential(3)}`, `  ${R[k].word}`);
    return out;
}
