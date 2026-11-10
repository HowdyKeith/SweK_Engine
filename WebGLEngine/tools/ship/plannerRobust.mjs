// WebGLEngine/tools/ship/plannerRobust.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/plannerRobustCmd.mjs; the gate is tools/ship/plannerRobust-selfcheck.mjs)
//
// ROUND 31 of brain/NEEDS_AND_LIMITS.md ("do the -0.12 constants hold up outside the conditions they were chosen in?", registered before this file existed): the Round 8 rule, the rule with its low trip point
// moved down by 0.12 and the full twin on those constants, flown on four conditions -- the shipped task (REF), starting damage scaled by 1.6 (DMG), gauge noise sd 0.30 (NOISE) and five stations (STN5) --
// 300 fresh far-and-both dives per arm and condition (REF 7001-7150, DMG 7201-7350, NOISE 7401-7550, STN5 7601-7750, 150 seeds of each kind). THE SEEDS ARE READ ONLY BY flyChunk(). No clock, no random, no file.
"use strict";
import * as T from "../../brain/needsTask.mjs";
import * as N from "../../physics/mechanics/subNeeds.mjs";
import * as U from "../../brain/tunedRule.mjs";
import * as Q from "../../brain/plannerPerturbed.mjs";
import { pooled, readingOf, SE_FACTOR, HARD } from "./plannerReplicate.mjs";
import { mergeKinds } from "./plannerCap.mjs";

export { HARD, pooled, readingOf, mergeKinds };
export const CONDITIONS = Object.freeze({
    REF: Object.freeze({ seeds: [7001, 7150], count: 3, damageScale: 1, sd: 0.1 }),
    DMG: Object.freeze({ seeds: [7201, 7350], count: 3, damageScale: 1.6, sd: 0.1 }),
    NOISE: Object.freeze({ seeds: [7401, 7550], count: 3, damageScale: 1, sd: 0.3 }),
    STN5: Object.freeze({ seeds: [7601, 7750], count: 5, damageScale: 1, sd: 0.1 }),
});
export const COND_NAMES = Object.freeze(["REF", "DMG", "NOISE", "STN5"]), ARMS = Object.freeze(["TUNED-R8", "TUNED-L12", "TWIN-L12"]), SHIFT = 0.12, DAMAGE_CAP = 0.8, DIVES = 300;
export const JOBS = Object.freeze(ARMS.flatMap((a) => COND_NAMES.flatMap((c) => HARD.map((k) => [a, c, k]))));
const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
/** needsTask.scenario with `count` stations and the starting damage scaled by `damageScale` (capped at DAMAGE_CAP) BEFORE the station depths are drawn against the collapse depth. At count 3 and scale 1 it IS needsTask.scenario. */
export function scenarioX(seed, kind, count = 3, damageScale = 1) {
    if (!T.KINDS.includes(kind)) throw new Error(`plannerRobust.scenarioX: unknown kind "${kind}" (${T.KINDS.join(", ")})`);
    if (!Number.isInteger(count) || count < 1) throw new Error(`plannerRobust.scenarioX: the station count must be a positive integer, got ${count}`);
    if (!(damageScale > 0)) throw new Error(`plannerRobust.scenarioX: the damage scale must be positive, got ${damageScale}`);
    const r = mulberry((seed * 7919 + T.KINDS.indexOf(kind) * 104729 + 211) >>> 0), u = (lo, hi) => lo + (hi - lo) * r();
    const deepKind = kind === "deep" || kind === "both", farKind = kind === "far" || kind === "both";
    const damage0 = deepKind ? Math.min(DAMAGE_CAP, u(0.2, 0.5) * damageScale) : 0, frac0 = kind === "plain" ? 1 : kind === "deep" ? u(0.7, 1) : kind === "far" ? u(0.4, 0.65) : u(0.45, 0.7);
    const stations = [], a0 = u(0, 6.28);
    for (let i = 0; i < count; i++) {
        const ang = a0 + i * 2.1 + u(-0.4, 0.4), rad = farKind ? u(120, 200) : u(40, 90);
        const cd = N.collapseDepth(T.model(), damage0, T.CRUSH), d0 = deepKind ? u(0.5, 0.9) * T.CRUSH : u(10, 30), depth = i === 0 ? Math.min(d0, 0.85 * cd + T.CAPTURE.depth - 1) : d0;
        stations.push(Object.freeze({ x: rad * Math.cos(ang), y: -rad * Math.sin(ang), depth, unreachable: depth - T.CAPTURE.depth > T.HULL_DEPTH * cd }));
    }
    return Object.freeze({ seed, kind, depth0: u(10, 20), damage0, frac0, stations: Object.freeze(stations) });
}
/** The scenarios of one kind of one condition, seeds a..b. */
export const setOfCondition = (cond, kind) => { const c = CONDITIONS[cond]; if (!c) throw new Error(`plannerRobust.setOfCondition: unknown condition ${JSON.stringify(cond)} (${COND_NAMES.join(", ")})`); return Object.freeze(Array.from({ length: c.seeds[1] - c.seeds[0] + 1 }, (_, i) => scenarioX(c.seeds[0] + i, kind, c.count, c.damageScale))); };
/** The tuned rule's parameters for an arm: the Round 8 constants, with low moved down by SHIFT for the L12 arms. */
export const paramsOf = (arm, r8) => (/L12$/.test(arm) ? { ...r8, low: r8.low - SHIFT } : r8);
let FLIGHT = {};
/** Flight options for every flight this library makes (the gate shortens dives; the real run never calls this). */
export const setFlight = (o) => { FLIGHT = { ...o }; };
/** One arm on a set of scenarios at gauge noise `sd`. */
export function flyArm(arm, r8, set, sd) {
    if (!ARMS.includes(arm)) throw new Error(`plannerRobust.flyArm: unknown arm ${JSON.stringify(arm)} (${ARMS.join(", ")})`);
    const p = paramsOf(arm, r8), sec = FLIGHT.seconds ? { seconds: FLIGHT.seconds } : {};
    const pilot = arm.startsWith("TUNED") ? T.flyDecision(U.tunedSeat(p, U.WIDE_BOUNDS)) : T.flyDecision(Q.perturbedSeat(p, {}, sec));
    return T.evaluate(pilot, set, { ...FLIGHT, gauge: { sd, hz: T.GAUGE.hz } });
}
/** One arm on one kind of one condition: the half a worker flies. */
export function flyChunk(arm, r8, cond, kind) { if (!CONDITIONS[cond]) throw new Error(`plannerRobust.flyChunk: unknown condition ${JSON.stringify(cond)} (${COND_NAMES.join(", ")})`); return flyArm(arm, r8, setOfCondition(cond, kind), CONDITIONS[cond].sd); }
/** The assembled audit { REF: { arm: result }, ... } from { arm: { REF: result, ... } }. */
export const assemble = (byArm) => Object.fromEntries(COND_NAMES.map((c) => [c, Object.fromEntries(Object.keys(byArm).map((a) => [a, byArm[a][c]]))]));
const diff = (au, c, a, b) => pooled(au, a, b, { sets: [c] });
/** One condition's three readings: the rule gain, the twin gain and the hull counts of the three arms. */
export function conditionOf(au, c) {
    const rule = diff(au, c, "TUNED-L12", "TUNED-R8"), twin = diff(au, c, "TWIN-L12", "TUNED-L12"), rr = readingOf(rule), tr = readingOf(twin);
    const hull = Object.fromEntries(ARMS.map((a) => [a, { crushed: au[c][a].crashed, stranded: au[c][a].stranded }]));
    return { cond: c, rule, twin, ruleVerdict: rr.hurts ? "HURTS" : rr.real ? "KEEPS" : "LOSES", twinVerdict: tr.real ? "KEEPS" : "LOSES", hull };
}
const list = (xs) => xs.join(", ");
export function bottomLines(au) {
    const cs = COND_NAMES.map((c) => conditionOf(au, c)), keep = cs.filter((x) => x.ruleVerdict === "KEEPS").map((x) => x.cond), hurt = cs.filter((x) => x.ruleVerdict === "HURTS").map((x) => x.cond), lose = cs.filter((x) => x.ruleVerdict === "LOSES").map((x) => x.cond);
    const twin = cs.filter((x) => x.twinVerdict === "KEEPS").map((x) => x.cond);
    const l12 = (x) => x.hull["TUNED-L12"].crushed + x.hull["TUNED-L12"].stranded + x.hull["TWIN-L12"].crushed + x.hull["TWIN-L12"].stranded;
    const paid = cs.filter((x) => l12(x) > 0), crushed = paid.reduce((s, x) => s + x.hull["TUNED-L12"].crushed + x.hull["TWIN-L12"].crushed, 0), stranded = paid.reduce((s, x) => s + x.hull["TUNED-L12"].stranded + x.hull["TWIN-L12"].stranded, 0);
    const worse = cs.filter((x) => x.hull["TUNED-L12"].crushed + x.hull["TUNED-L12"].stranded > x.hull["TUNED-R8"].crushed + x.hull["TUNED-R8"].stranded).map((x) => x.cond);
    return [
        `THE -0.12 CONSTANTS KEEP THEIR GAIN IN ${keep.length} OF ${COND_NAMES.length} CONDITIONS (${list(keep) || "none"})${hurt.length ? `; THEY HURT IN (${list(hurt)})` : ""}${lose.length ? `; THEY LOSE IT IN (${list(lose)})` : ""}`,
        `THE TWIN KEEPS ITS GAIN ON THEM IN ${twin.length} OF ${COND_NAMES.length} CONDITIONS (${list(twin) || "none"})`,
        paid.length ? `THE HULL PAYS AT -0.12 IN ${list(paid.map((x) => x.cond))}: ${crushed} CRUSHED, ${stranded} STRANDED` : "THE HULL IS UNHARMED AT -0.12 IN EVERY CONDITION",
        worse.length ? `-0.12 CRUSHES MORE THAN THE ROUND 8 CONSTANTS IN ${list(worse)}` : "-0.12 NEVER CRUSHES MORE THAN THE ROUND 8 CONSTANTS",
    ];
}
export function checksOf(au) {
    const rows = [], sample = [[1, "far"], [2, "both"], [271, "far"], [3, "deep"], [6, "deep"], [5, "plain"]];
    const gen = sample.every(([s, k]) => JSON.stringify(scenarioX(s, k, 3, 1)) === JSON.stringify(T.scenario(s, k)));
    rows.push({ name: "GENERATOR", ok: gen, text: `the generator at 3 stations and damage scale 1 equals needsTask.scenario on ${sample.length} sample scenarios: ${gen}` });
    const damaged = sample.filter(([, k]) => k === "deep" || k === "both"), harder = damaged.every(([s, k]) => scenarioX(s, k, 3, 1.6).damage0 > scenarioX(s, k, 3, 1).damage0) && sample.filter(([, k]) => k !== "deep" && k !== "both").every(([s, k]) => scenarioX(s, k, 3, 1.6).damage0 === 0);
    rows.push({ name: "DAMAGE SCALE", ok: harder, text: `scale 1.6 raises the starting damage of every damaged sample dive and leaves the undamaged ones undamaged: ${harder}` });
    const sizes = COND_NAMES.every((c) => ARMS.every((a) => au[c][a].runs.length === DIVES));
    rows.push({ name: "SIZES", ok: sizes, text: `every arm has ${DIVES} dives in every condition: ${sizes}` });
    const aligned = COND_NAMES.every((c) => ARMS.every((a) => au[c][a].runs.length === au[c]["TUNED-R8"].runs.length && au[c][a].runs.every((r, i) => r.kind === au[c]["TUNED-R8"].runs[i].kind)));
    rows.push({ name: "KINDS ALIGNED", ok: aligned, text: `within a condition every arm's dives are the same scenarios in the same order: ${aligned}` });
    return rows;
}
const sgn = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), fmt = (p) => `${sgn(p.mean)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same})`;
export function report(au) {
    const L = [`ROUND 31: do the -0.12 constants hold up outside the conditions they were chosen in? ${COND_NAMES.map((c) => `${c} ${CONDITIONS[c].seeds[0]}-${CONDITIONS[c].seeds[1]}`).join(", ")} (far and both, ${DIVES} dives per arm and condition; read once)`];
    const checks = checksOf(au), bad = checks.filter((c) => !c.ok);
    for (const c of checks) L.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) { L.push("A CHECK FAILED: the verdicts below are NOT WEIGHED.", "BOTTOM LINE: NOT WEIGHED (a check failed)"); return L; }   // the differences of arms that do not line up are not computed
    for (const c of COND_NAMES) {
        const x = conditionOf(au, c), cd = CONDITIONS[c], mean = (a) => au[c][a].score.toFixed(4);
        L.push(`${c} (${cd.count} stations, damage x${cd.damageScale}, gauge sd ${cd.sd}): means R8 ${mean("TUNED-R8")}, L12 ${mean("TUNED-L12")}, twin ${mean("TWIN-L12")}`, `   rule gain (L12 minus R8) ${fmt(x.rule)}  ${x.ruleVerdict}`, `   twin gain (twin L12 minus L12) ${fmt(x.twin)}  ${x.twinVerdict}`, `   crushed/stranded: ${ARMS.map((a) => `${a} ${x.hull[a].crushed}/${x.hull[a].stranded}`).join(", ")}`);
    }
    for (const l of bottomLines(au)) L.push(`BOTTOM LINE: ${l}`);
    return L;
}
export { SE_FACTOR };
