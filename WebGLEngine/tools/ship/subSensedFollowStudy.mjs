// WebGLEngine/tools/ship/subSensedFollowStudy.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is "FOLLOW-UP 2" of brain/SENSED_NAV_WIP.md, the gate is tools/ship/subSensedFollowStudy-selfcheck.mjs)
//
// THE TWO FOLLOW-UP STUDIES OF THE SENSED MAP, on the three static kinds of the harder test (hard-islands, hard-gaps, hard-current):
//   --study gap   SEE THE GAP: the incumbent's exact position and sticky memory with another SONAR (exact, sensed, sonar-150, sonar-200 [designated], sonar-wide, sonar-200-wide, sonar-omni); bar D, verdict, predictions D1 to D6
//   --study combined   THE TWO CURES TOGETHER (follow-up 3): exact, sonar-200, sensed+fix, fix+forget and the five long arms (the 200 m sonar with the fix, forgetting, the filter and drift); bar C, verdict, predictions C1 to C7
//   --study realism   THE SONAR GETS REAL (follow-up 4): exact, the three clean long arms (long+fix, long+fix+forget, long+fix+filter) and, for each of miss, false, occl, head and all, a sticky and a forgetting arm (the 200 m sonar with a misses, false returns, first surfaces or a heading error); bar R (all+forget reaches 80% of exact's count in each kind), verdict, predictions R1 to R8
//   --study persistent   THE FAULTS PERSIST (follow-up 5): exact, the clean long+fix and long+fix+forget, the white head+sticky, head+forget and all+forget, and the sonar's faults made to last -- a heading bias, persistent cell faults, whole obstacles that drop out, rates that grow with range, all together -- each with the sticky map or the map that forgets (pall+forget designated); bar P (80% of exact's count in each kind), verdict, predictions P1 to P8
//   --study falserate   HOW MANY FALSE RETURNS (follow-up 6): exact, the clean long+fix+forget and long+fix+filter, the forgetting map with follow-up 4's four faults at false rates 0.001, 0.003, 0.01 [designated] and 0.03, and the filtered-fix sticky map at 0.0001, 0.0003 and 0.001; bar F (all@0.01+forget reaches 80% of exact's count in each kind), verdict, predictions F1 to F8
//   --study detector   A DETECTOR FOR THE MAP (follow-up 7): exact, the clean long+fix+forget, and a map that marks a cell after `mark` consecutive occupied readings and clears it after `clear` consecutive free ones -- d1-1 (the map that forgets), d2-1, d1-12, d2-3, d2-12 [designated] and d3-12 -- under condition W (follow-up 4's four white faults at a false rate of 0.01) and condition P (follow-up 5's persistent faults), and d2-12 with no faults; bar G (d2-12 reaches 80% of exact's count in each kind under each condition: six cells), verdict, predictions G1 to G8
//   --study fix   THE FIX SMEAR: the incumbent's sonar and white 3 m fix with the map forgetting (fix+forget [designated]) or the fix filtered (fix+filter, fix+forget+filter); sensed, sensed+fix and sensed+drift flown beside them; bar E, verdict, predictions E1 to E6
//   node tools/ship/subSensedFollowStudy.mjs --study gap|fix|combined|realism|persistent|falserate|detector --set dev [--seeds N]               DEV (seeds 1 to 30 of each kind): a sanity run, not a result
//   node tools/ship/subSensedFollowStudy.mjs --study gap|fix --set held7 [--seeds N] [--write]    HELD7 (seeds 701 to 760 of each kind), READ ONCE FOR EACH STUDY; --write puts every flight in brain/subSensedGapHeld7.jsonl or brain/subSensedFixHeld7.jsonl
//   node tools/ship/subSensedFollowStudy.mjs --study combined --set held8 [--seeds N] [--write]     HELD8 (seeds 801 to 860 of each kind), READ ONCE; --write puts every flight in brain/subSensedCombinedHeld8.jsonl
//   node tools/ship/subSensedFollowStudy.mjs --study realism --set held9 [--seeds N] [--write]     HELD9 (seeds 901 to 960 of each kind), READ ONCE; --write puts every flight in brain/subSensedRealismHeld9.jsonl
//   node tools/ship/subSensedFollowStudy.mjs --study persistent --set held10 [--seeds N] [--write]     HELD10 (seeds 1001 to 1060 of each kind), READ ONCE; --write puts every flight in brain/subSensedPersistentHeld10.jsonl
//   node tools/ship/subSensedFollowStudy.mjs --study falserate --set held11 [--seeds N] [--write]     HELD11 (seeds 1101 to 1160 of each kind), READ ONCE; --write puts every flight in brain/subSensedFalseRateHeld11.jsonl
//   node tools/ship/subSensedFollowStudy.mjs --study detector --set held12 [--seeds N] [--write]     HELD12 (seeds 1201 to 1260 of each kind), READ ONCE; --write puts every flight in brain/subSensedDetectorHeld12.jsonl
// Pure apart from the file --write puts down. No clock, no Math.random.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as X from "../../brain/subSensedNav.mjs";
import * as H from "../../brain/subHardNav.mjs";
import { median, pilot } from "./subSensedStudy.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
export { median, pilot };
export const OUTS = Object.freeze({ gap: "brain/subSensedGapHeld7.jsonl", fix: "brain/subSensedFixHeld7.jsonl", combined: "brain/subSensedCombinedHeld8.jsonl", realism: "brain/subSensedRealismHeld9.jsonl", persistent: "brain/subSensedPersistentHeld10.jsonl", falserate: "brain/subSensedFalseRateHeld11.jsonl", detector: "brain/subSensedDetectorHeld12.jsonl" });
export const STUDIES = Object.freeze({ gap: Object.freeze({ arms: X.GAP_ARMS, designated: X.GAP_DESIGNATED, held: "held7" }), fix: Object.freeze({ arms: X.FIX_ARMS, designated: X.FIX_DESIGNATED, held: "held7" }), combined: Object.freeze({ arms: X.COMBINED_ARMS, designated: X.COMBINED_DESIGNATED, held: "held8" }), realism: Object.freeze({ arms: X.REALISM_ARMS, designated: X.REALISM_DESIGNATED, held: "held9" }), persistent: Object.freeze({ arms: X.PERSIST_ARMS, designated: X.PERSIST_DESIGNATED, held: "held10" }), falserate: Object.freeze({ arms: X.FALSE_ARMS, designated: X.FALSE_DESIGNATED, held: "held11" }), detector: Object.freeze({ arms: X.DETECT_ARMS, designated: X.DETECT_DESIGNATED, held: "held12" }) });
export const SETS = Object.freeze({ dev: X.SENSE_SETS.dev, held7: X.SENSE_SETS.held7, held8: X.SENSE_SETS.held8, held9: X.SENSE_SETS.held9, held10: X.SENSE_SETS.held10, held11: X.SENSE_SETS.held11, held12: X.SENSE_SETS.held12 });
export const THRESH = Object.freeze({ gapBar: 0.6, harm: 3, gain10: 10, omniFloor: 57, omniShare: 0.8, pathFactor: 1.2, close: 3, gainFix: 5, control: 5, gapSlack: 5, ceiling: 3, gainCombined: 20, within: 5, gapsFloor: 45, realBar: 0.8, missClose: 5, falseDrop: 15, forgetGain: 15, forgetClose: 10, headDrop: 10, biasGain: 15, persistClose: 10, objDrop: 15, stickyGain: 10, stickyDrop: 30, fMono: 3, fFilterGap: 60, fCliff: 15, gConfirm: 20, gClose: 10, gHoldBad: 20, gClean: 8 });
const KINDS = X.SENSE_KINDS, WIDTHS = H.GAP_WIDTHS;

const cellOf = (rs) => {
    if (!rs.length) return null;
    const count = (s) => rs.filter((r) => r.status === s).length, done = rs.filter((r) => r.reached);
    return { n: rs.length, reached: done.length, rate: done.length / rs.length, collided: count("collided"), left: count("left"), timeout: count("timeout"), other: rs.filter((r) => !["reached", "collided", "left", "timeout"].includes(r.status)).length, medianTime: median(done.map((r) => r.t)), medianChord: median(done.map((r) => r.path / r.chord)), medianClearance: median(rs.map((r) => r.minClearance)), medianSeen: median(rs.filter((r) => Number.isFinite(r.ensonified)).map((r) => r.ensonified)), medianOffsetEnd: median(rs.filter((r) => Number.isFinite(r.offsetEnd)).map((r) => r.offsetEnd)), medianPlans: median(rs.filter((r) => Number.isFinite(r.plans)).map((r) => r.plans)) };
};
/** The numbers per kind and arm for the arms of `study`: { cells: { kind: { arm: cell } }, pooled: { arm: cell over the three kinds }, widths: { arm: { 24: { n, reached }, 32: ..., 40: ... } } (hard-gaps only) }; a cell is { n, reached, rate, collided, left, timeout, other, medianTime, medianChord (arrivals), medianClearance (all), medianSeen, medianOffsetEnd, medianPlans } and absent when the arm flew nothing. */
export function summarize(runs, study) {
    const arms = STUDIES[study].arms, cells = {}, pooled = {}, widths = {};
    for (const kind of KINDS) { cells[kind] = {}; for (const arm of arms) { const c = cellOf(runs.filter((r) => r.kind === kind && r.arm === arm)); if (c) cells[kind][arm] = c; } }
    for (const arm of arms) {
        const c = cellOf(runs.filter((r) => r.arm === arm && KINDS.includes(r.kind))); if (c) pooled[arm] = c;
        const g = runs.filter((r) => r.arm === arm && r.kind === "hard-gaps"); if (g.length) { widths[arm] = {}; for (const w of WIDTHS) { const rs = g.filter((r) => r.gap === w); widths[arm][w] = { n: rs.length, reached: rs.filter((r) => r.reached).length }; } }
    }
    return { cells, pooled, widths };
}
const get = (sum, kind, arm) => (sum.cells[kind] && sum.cells[kind][arm]) || null;
/**
 * The gap study's bar, verdict and D1 to D6 (brain/SENSED_NAV_WIP.md, "FOLLOW-UP 2"). The designated arm (X.GAP_DESIGNATED) reaches at least THRESH.gapBar of hard-gaps (the BAR) and loses no more than THRESH.harm flights against `sensed` in hard-islands or hard-current (NO HARM). SUPPORTED if both; PARTLY SUPPORTED if it
 * fails either but reaches at least THRESH.gain10 more than `sensed` in hard-gaps; NOT SUPPORTED otherwise. D1 in hard-gaps sensed <= sonar-150 <= sonar-200. D2 sonar-wide reaches fewer than sonar-200. D3 sonar-omni reaches at least THRESH.omniFloor. D4 sonar-200 reaches at least THRESH.omniShare of sonar-omni's. D5 for `sensed` the share of
 * the 24 m and 32 m gaps reached is below the share of the 40 m gaps. D6 the median path over the chord of sonar-200's arrivals in hard-gaps is at most THRESH.pathFactor times exact's.
 */
export function judgeGap(sum) {
    const D = X.GAP_DESIGNATED, g = (arm) => get(sum, "hard-gaps", arm), d = g(D), s = g("sensed"), om = g("sonar-omni"), wd = g("sonar-wide"), s150 = g("sonar-150"), ex = g("exact");
    const bar = !!d && d.rate >= THRESH.gapBar, harmOf = (kind) => { const a = get(sum, kind, D), b = get(sum, kind, "sensed"); return !a || !b || b.reached - a.reached > THRESH.harm; }, noHarm = !harmOf("hard-islands") && !harmOf("hard-current");
    const gain10 = !!d && !!s && d.reached - s.reached >= THRESH.gain10, verdict = bar && noHarm ? "SUPPORTED" : gain10 ? "PARTLY SUPPORTED" : "NOT SUPPORTED";
    const d1 = !!s && !!s150 && !!d && s.reached <= s150.reached && s150.reached <= d.reached, d2 = !!wd && !!d && wd.reached < d.reached, d3 = !!om && om.reached >= THRESH.omniFloor, d4 = !!d && !!om && d.reached >= THRESH.omniShare * om.reached;
    const w = sum.widths.sensed, share = (ws) => ws.reduce((a, x) => a + w[x].reached, 0) / ws.reduce((a, x) => a + w[x].n, 0), d5 = !!w && WIDTHS.every((x) => w[x] && w[x].n > 0) && share([24, 32]) < share([40]);
    const pathRatio = d && ex ? d.medianChord / ex.medianChord : NaN, d6 = Number.isFinite(pathRatio) && pathRatio <= THRESH.pathFactor;
    return { bar, noHarm, gain10, verdict, d1, d2, d3, d4, d5, d6, pathRatio };
}
/**
 * The fix study's bar, verdict and E1 to E6. The designated arm (X.FIX_DESIGNATED) is within THRESH.close flights of `sensed` in each of the three kinds (CLOSE) and reaches at least THRESH.gainFix more than `sensed+fix` over the three kinds together (GAIN). SUPPORTED if both; PARTLY SUPPORTED if it has the gain but is not close in
 * some kind; NOT SUPPORTED otherwise. E1 fix+forget reaches more than sensed+fix in hard-islands. E2 fix+filter does. E3 over the three kinds fix+forget+filter reaches at least as many as either alone. E4 the median number of plans a flight of fix+forget (three kinds together) is above that of sensed+fix. E5 sensed+drift is within
 * THRESH.control flights of sensed in each kind. E6 in hard-gaps no fix arm (sensed+fix, fix+forget, fix+filter, fix+forget+filter) reaches more than THRESH.gapSlack above sensed.
 */
export function judgeFix(sum) {
    const D = X.FIX_DESIGNATED, p = sum.pooled, near = (kind, arm, tol) => { const a = get(sum, kind, arm), b = get(sum, kind, "sensed"); return !!a && !!b && Math.abs(a.reached - b.reached) <= tol; };
    const close = KINDS.every((k) => near(k, D, THRESH.close)), gain = !!p[D] && !!p["sensed+fix"] && p[D].reached - p["sensed+fix"].reached >= THRESH.gainFix, verdict = close && gain ? "SUPPORTED" : gain ? "PARTLY SUPPORTED" : "NOT SUPPORTED";
    const fi = (arm) => get(sum, "hard-islands", arm), e1 = !!fi(D) && !!fi("sensed+fix") && fi(D).reached > fi("sensed+fix").reached, e2 = !!fi("fix+filter") && !!fi("sensed+fix") && fi("fix+filter").reached > fi("sensed+fix").reached;
    const e3 = !!p["fix+forget+filter"] && !!p["fix+forget"] && !!p["fix+filter"] && p["fix+forget+filter"].reached >= p["fix+forget"].reached && p["fix+forget+filter"].reached >= p["fix+filter"].reached;
    const e4 = !!p["fix+forget"] && !!p["sensed+fix"] && p["fix+forget"].medianPlans > p["sensed+fix"].medianPlans, e5 = KINDS.every((k) => near(k, "sensed+drift", THRESH.control));
    const gs = get(sum, "hard-gaps", "sensed"), e6 = !!gs && ["sensed+fix", "fix+forget", "fix+filter", "fix+forget+filter"].every((a) => { const c = get(sum, "hard-gaps", a); return !!c && c.reached <= gs.reached + THRESH.gapSlack; });
    return { close, gain, verdict, e1, e2, e3, e4, e5, e6 };
}
/**
 * The combined study's bar, verdict and C1 to C7 (brain/SENSED_NAV_WIP.md, "FOLLOW-UP 3"). The designated arm (X.COMBINED_DESIGNATED) loses no more than THRESH.ceiling flights against `exact` in EACH of the three kinds (CEILING, one-sided: an arm above the ceiling passes) and reaches at least THRESH.gainCombined more than `sensed+fix` over the three
 * kinds together (GAIN). SUPPORTED if both; PARTLY SUPPORTED if it has the gain but not the ceiling in some kind; NOT SUPPORTED otherwise. C1 over the three kinds it reaches at least as many as fix+forget. C2 in hard-gaps it reaches more than fix+forget. C3 over the three kinds long+fix reaches fewer than sonar-200. C4 over the three kinds it reaches more than long+fix.
 * C5 long+fix+forget+filter is within THRESH.within flights of it over the three kinds. C6 long+drift is within THRESH.within flights of sonar-200 over the three kinds. C7 in hard-gaps it reaches at least THRESH.gapsFloor.
 */
export function judgeCombined(sum) {
    const D = X.COMBINED_DESIGNATED, p = sum.pooled, d = p[D], ceiling = KINDS.every((k) => { const e = get(sum, k, "exact"), c = get(sum, k, D); return !!e && !!c && e.reached - c.reached <= THRESH.ceiling; });
    const gain = !!d && !!p["sensed+fix"] && d.reached - p["sensed+fix"].reached >= THRESH.gainCombined, verdict = ceiling && gain ? "SUPPORTED" : gain ? "PARTLY SUPPORTED" : "NOT SUPPORTED";
    const c1 = !!d && !!p["fix+forget"] && d.reached >= p["fix+forget"].reached, gd = get(sum, "hard-gaps", D), gf = get(sum, "hard-gaps", "fix+forget"), c2 = !!gd && !!gf && gd.reached > gf.reached;
    const c3 = !!p["long+fix"] && !!p["sonar-200"] && p["long+fix"].reached < p["sonar-200"].reached, c4 = !!d && !!p["long+fix"] && d.reached > p["long+fix"].reached;
    const c5 = !!d && !!p["long+fix+forget+filter"] && Math.abs(p["long+fix+forget+filter"].reached - d.reached) <= THRESH.within, c6 = !!p["long+drift"] && !!p["sonar-200"] && Math.abs(p["long+drift"].reached - p["sonar-200"].reached) <= THRESH.within, c7 = !!gd && gd.reached >= THRESH.gapsFloor;
    return { ceiling, gain, verdict, c1, c2, c3, c4, c5, c6, c7 };
}
/**
 * The realism study's bar, verdict and R1 to R8 (brain/SENSED_NAV_WIP.md, "FOLLOW-UP 4"). The designated arm (X.REALISM_DESIGNATED, all+forget) reaches at least THRESH.realBar of what `exact` reaches (the count) in EACH kind (perKind); SUPPORTED if it does in all three, PARTLY SUPPORTED if in two, NOT SUPPORTED otherwise (kindsHeld counts them). Over the three kinds together
 * unless a kind is named: R1 miss+sticky is within THRESH.missClose flights of long+fix (either side). R2 false+sticky reaches at least THRESH.falseDrop fewer than long+fix. R3 false+forget reaches at least THRESH.forgetGain more than false+sticky. R4 false+forget is within THRESH.forgetClose flights of long+fix+forget (either side). R5 in hard-islands occl+sticky reaches fewer
 * than long+fix. R6 head+sticky reaches at least THRESH.headDrop fewer than long+fix. R7 head+forget reaches more than head+sticky. R8 the designated arm reaches fewer than each of miss+forget, false+forget, occl+forget and head+forget. A missing arm is a miss (NaN fails every comparison).
 */
export function judgeRealism(sum) {
    const D = X.REALISM_DESIGNATED, p = sum.pooled, r = (arm) => (p[arm] ? p[arm].reached : NaN), perKind = {};
    for (const k of KINDS) { const e = get(sum, k, "exact"), c = get(sum, k, D); perKind[k] = !!e && !!c && c.reached / e.reached >= THRESH.realBar; }
    const kindsHeld = KINDS.filter((k) => perKind[k]).length, verdict = kindsHeld === 3 ? "SUPPORTED" : kindsHeld >= 2 ? "PARTLY SUPPORTED" : "NOT SUPPORTED";
    const oi = get(sum, "hard-islands", "occl+sticky"), li = get(sum, "hard-islands", "long+fix");
    return { perKind, kindsHeld, verdict, r1: Math.abs(r("miss+sticky") - r("long+fix")) <= THRESH.missClose, r2: r("long+fix") - r("false+sticky") >= THRESH.falseDrop, r3: r("false+forget") - r("false+sticky") >= THRESH.forgetGain, r4: Math.abs(r("false+forget") - r("long+fix+forget")) <= THRESH.forgetClose, r5: !!oi && !!li && oi.reached < li.reached,
        r6: r("long+fix") - r("head+sticky") >= THRESH.headDrop, r7: r("head+forget") > r("head+sticky"), r8: ["miss+forget", "false+forget", "occl+forget", "head+forget"].every((a) => r(D) < r(a)) };
}
/**
 * The persistent-faults study's bar, verdict and P1 to P8 (brain/SENSED_NAV_WIP.md, "FOLLOW-UP 5"). The designated arm (X.PERSIST_DESIGNATED, pall+forget) reaches at least THRESH.realBar of what `exact` reaches (the count) in EACH kind (perKind); SUPPORTED if it does in all three, PARTLY SUPPORTED if in two, NOT SUPPORTED otherwise (kindsHeld counts them). Over the three kinds together: P1 bias+sticky reaches at
 * least THRESH.biasGain more than head+sticky. P2 bias+forget is within THRESH.persistClose flights of long+fix+forget (either side). P3 cellp+forget is. P4 objp+forget reaches at least THRESH.objDrop fewer than long+fix+forget. P5 objp+sticky reaches at least THRESH.stickyGain more than objp+forget. P6 range+forget is within THRESH.persistClose of long+fix+forget.
 * P7 pall+sticky reaches at least THRESH.stickyDrop fewer than pall+forget. P8 pall+forget is within THRESH.persistClose of all+forget (either side). A missing arm is a miss (NaN fails every comparison).
 */
export function judgePersistent(sum) {
    const D = X.PERSIST_DESIGNATED, p = sum.pooled, r = (arm) => (p[arm] ? p[arm].reached : NaN), perKind = {};
    for (const k of KINDS) { const e = get(sum, k, "exact"), c = get(sum, k, D); perKind[k] = !!e && !!c && c.reached / e.reached >= THRESH.realBar; }
    const kindsHeld = KINDS.filter((k) => perKind[k]).length, verdict = kindsHeld === 3 ? "SUPPORTED" : kindsHeld >= 2 ? "PARTLY SUPPORTED" : "NOT SUPPORTED", clean = r("long+fix+forget");
    return { perKind, kindsHeld, verdict, p1: r("bias+sticky") - r("head+sticky") >= THRESH.biasGain, p2: Math.abs(r("bias+forget") - clean) <= THRESH.persistClose, p3: Math.abs(r("cellp+forget") - clean) <= THRESH.persistClose, p4: clean - r("objp+forget") >= THRESH.objDrop,
        p5: r("objp+sticky") - r("objp+forget") >= THRESH.stickyGain, p6: Math.abs(r("range+forget") - clean) <= THRESH.persistClose, p7: r(D) - r("pall+sticky") >= THRESH.stickyDrop, p8: Math.abs(r(D) - r("all+forget")) <= THRESH.persistClose };
}
/**
 * The false-rate study's bar, verdict and F1 to F8 (brain/SENSED_NAV_WIP.md, "FOLLOW-UP 6"). The designated arm (X.FALSE_DESIGNATED, the forgetting map at a false rate of 0.01) reaches at least THRESH.realBar of what `exact` reaches (the count) in EACH kind (perKind); SUPPORTED if it does in all three, PARTLY SUPPORTED if in two, NOT SUPPORTED otherwise. Pooled over the three kinds unless a kind is named:
 * F1 the forgetting map at 0.001 holds that bar in every kind. F2 at 0.003 it does. F3 at 0.03 it misses it in at least one kind (every kind must have both arms). F4 the forgetting map's pooled count never rises by more than THRESH.fMono flights from 0.001 to 0.003 to 0.01 to 0.03. F5 all@0.001+filter reaches at least THRESH.fFilterGap fewer than all@0.001+forget.
 * F6 all@0.0001+filter reaches at least THRESH.realBar of what exact reaches over the three kinds together. F7 all@0.0003+filter reaches at least THRESH.fCliff fewer than all@0.0001+filter. F8 all@0.001+forget reaches more than all@0.001+filter in each of the three kinds. A missing arm is a miss (NaN fails every comparison).
 */
export function judgeFalseRate(sum) {
    const D = X.FALSE_DESIGNATED, p = sum.pooled, r = (arm) => (p[arm] ? p[arm].reached : NaN), perKind = {};
    const ratioOf = (arm, k) => { const e = get(sum, k, "exact"), c = get(sum, k, arm); return e && c ? c.reached / e.reached : NaN; };
    const holds = (arm) => KINDS.every((k) => ratioOf(arm, k) >= THRESH.realBar), missesAny = (arm) => KINDS.every((k) => Number.isFinite(ratioOf(arm, k))) && KINDS.some((k) => ratioOf(arm, k) < THRESH.realBar);
    for (const k of KINDS) perKind[k] = ratioOf(D, k) >= THRESH.realBar;
    const kindsHeld = KINDS.filter((k) => perKind[k]).length, verdict = kindsHeld === 3 ? "SUPPORTED" : kindsHeld >= 2 ? "PARTLY SUPPORTED" : "NOT SUPPORTED", f = (rate) => r(`all@${rate}+forget`);
    return { perKind, kindsHeld, verdict, f1: holds("all@0.001+forget"), f2: holds("all@0.003+forget"), f3: missesAny("all@0.03+forget"), f4: f("0.003") - f("0.001") <= THRESH.fMono && f("0.01") - f("0.003") <= THRESH.fMono && f("0.03") - f("0.01") <= THRESH.fMono,
        f5: r("all@0.001+forget") - r("all@0.001+filter") >= THRESH.fFilterGap, f6: r("all@0.0001+filter") / r("exact") >= THRESH.realBar, f7: r("all@0.0001+filter") - r("all@0.0003+filter") >= THRESH.fCliff,
        f8: KINDS.every((k) => { const a = get(sum, k, "all@0.001+forget"), b = get(sum, k, "all@0.001+filter"); return !!a && !!b && a.reached > b.reached; }) };
}
/**
 * The detector study's bar, verdict and G1 to G8 (brain/SENSED_NAV_WIP.md, "FOLLOW-UP 7"). The designated detector (X.DETECT_DESIGNATED, d2-12: mark after 2 consecutive occupied readings, clear after 12 free ones) reaches at least THRESH.realBar of what `exact` reaches (the count) in EACH kind under EACH condition, W (follow-up 4's white faults at a false rate of 0.01) and P (follow-up 5's persistent
 * faults): six cells (perCond.W and perCond.P, cellsHeld counts the held ones); SUPPORTED if all six, PARTLY SUPPORTED if at least four, NOT SUPPORTED otherwise. Pooled over the three kinds: G1 d2-1@W reaches at least THRESH.gConfirm more than d1-1@W. G2 d2-1@P is within THRESH.gClose of d1-1@P (either side). G3 d1-12@W reaches at least THRESH.gHoldBad fewer than d1-1@W. G4 d1-12@P reaches more than d1-1@P.
 * G5 d2-12 holds the bar in all three kinds under W. G6 under P. G7 d2-12@clean is within THRESH.gClean of the clean long+fix+forget (either side). G8 summed over W and P, d2-12 reaches more than d2-1 and more than d1-12. A missing arm is a miss (NaN fails every comparison).
 */
export function judgeDetector(sum) {
    const D = X.DETECT_DESIGNATED, p = sum.pooled, r = (arm) => (p[arm] ? p[arm].reached : NaN), perCond = { W: {}, P: {} };
    const ratioOf = (arm, k) => { const e = get(sum, k, "exact"), c = get(sum, k, arm); return e && c ? c.reached / e.reached : NaN; };
    for (const c of ["W", "P"]) for (const k of KINDS) perCond[c][k] = ratioOf(`${D}@${c}`, k) >= THRESH.realBar;
    const held = (c) => KINDS.every((k) => perCond[c][k]), cellsHeld = ["W", "P"].reduce((n, c) => n + KINDS.filter((k) => perCond[c][k]).length, 0), verdict = cellsHeld === 6 ? "SUPPORTED" : cellsHeld >= 4 ? "PARTLY SUPPORTED" : "NOT SUPPORTED", both = (a) => r(`${a}@W`) + r(`${a}@P`);
    return { perCond, cellsHeld, verdict, g1: r("d2-1@W") - r("d1-1@W") >= THRESH.gConfirm, g2: Math.abs(r("d2-1@P") - r("d1-1@P")) <= THRESH.gClose, g3: r("d1-1@W") - r("d1-12@W") >= THRESH.gHoldBad, g4: r("d1-12@P") > r("d1-1@P"), g5: held("W"), g6: held("P"), g7: Math.abs(r("d2-12@clean") - r("long+fix+forget")) <= THRESH.gClean, g8: both(D) > both("d2-1") && both(D) > both("d1-12") };
}
export const judge = (sum, study) => (study === "gap" ? judgeGap(sum) : study === "fix" ? judgeFix(sum) : study === "realism" ? judgeRealism(sum) : study === "persistent" ? judgePersistent(sum) : study === "falserate" ? judgeFalseRate(sum) : study === "detector" ? judgeDetector(sum) : judgeCombined(sum));
const pct = (v) => (Number.isFinite(v) ? (100 * v).toFixed(0) + "%" : "n/a");
const f2s = (v) => (Number.isFinite(v) ? v.toFixed(2) : "n/a");
const HEAD = "arm               | reached      | collided left timeout other | median time (s) | median path/chord | median min clearance (m) | grid ensonified | offset at end (m) | plans (median)";
/** The table: a block for each kind, the three kinds pooled and, for the gap study, the gaps by width. */
export function table(sum, study, title) {
    const arms = STUDIES[study].arms, lines = [title], row = (arm, x) => `${arm.padEnd(17)} | ${(`${x.reached}/${x.n} ${pct(x.rate)}`).padEnd(12)} | ${String(x.collided).padStart(8)} ${String(x.left).padStart(4)} ${String(x.timeout).padStart(7)} ${String(x.other).padStart(5)} | ${f2s(x.medianTime).padEnd(15)} | ${f2s(x.medianChord).padEnd(17)} | ${f2s(x.medianClearance).padEnd(24)} | ${pct(x.medianSeen).padEnd(15)} | ${f2s(x.medianOffsetEnd).padEnd(17)} | ${f2s(x.medianPlans)}`;
    for (const kind of KINDS) { lines.push("", kind, HEAD); for (const arm of arms) { const x = sum.cells[kind][arm]; if (x) lines.push(row(arm, x)); } }
    lines.push("", "the three kinds together", HEAD); for (const arm of arms) { const x = sum.pooled[arm]; if (x) lines.push(row(arm, x)); }
    if (study !== "fix") { lines.push("", "hard-gaps reached, by the width of the gap", `arm               | ${WIDTHS.map((w) => `${w} m`.padEnd(6)).join(" | ")}`); for (const arm of arms) { const w = sum.widths[arm]; if (w) lines.push(`${arm.padEnd(17)} | ${WIDTHS.map((x) => String(w[x].reached).padEnd(6)).join(" | ")}`); } }
    return lines.join("\n");
}
export function verdictText(j, study) {
    const yn = (v) => (v ? "HELD" : "MISSED");
    if (study === "gap") {
        const D = X.GAP_DESIGNATED;
        return [`${D}: reaches at least ${pct(THRESH.gapBar)} of hard-gaps (the bar): ${yn(j.bar)}; loses no more than ${THRESH.harm} flights against sensed in hard-islands or hard-current: ${yn(j.noHarm)}; reaches at least ${THRESH.gain10} more than sensed in hard-gaps: ${yn(j.gain10)}`,
            `D1 in hard-gaps sensed <= sonar-150 <= ${D}: ${yn(j.d1)}`, `D2 sonar-wide reaches fewer than ${D} in hard-gaps: ${yn(j.d2)}`, `D3 sonar-omni reaches at least ${THRESH.omniFloor} of the hard-gaps: ${yn(j.d3)}`, `D4 ${D} reaches at least ${pct(THRESH.omniShare)} of what sonar-omni reaches in hard-gaps: ${yn(j.d4)}`,
            `D5 for sensed the 24 m and 32 m gaps are reached at a lower share than the 40 m gaps: ${yn(j.d5)}`, `D6 the median path over the chord of ${D}'s arrivals in hard-gaps is at most ${THRESH.pathFactor} times exact's (it is ${f2s(j.pathRatio)}): ${yn(j.d6)}`, `VERDICT: ${j.verdict}`].join("\n");
    }
    if (study === "realism") {
        const D = X.REALISM_DESIGNATED;
        return [`${D} (the realistic vessel) reaches at least ${pct(THRESH.realBar)} of what exact reaches in each kind (the bar): ${KINDS.map((k) => `${k} ${yn(j.perKind[k])}`).join(", ")} (${j.kindsHeld} of 3)`,
            `R1 miss+sticky is within ${THRESH.missClose} flights of the clean long+fix over the three kinds: ${yn(j.r1)}`, `R2 false+sticky reaches at least ${THRESH.falseDrop} fewer than long+fix: ${yn(j.r2)}`, `R3 false+forget reaches at least ${THRESH.forgetGain} more than false+sticky: ${yn(j.r3)}`, `R4 false+forget is within ${THRESH.forgetClose} flights of the clean long+fix+forget: ${yn(j.r4)}`,
            `R5 in hard-islands occl+sticky reaches fewer than long+fix: ${yn(j.r5)}`, `R6 head+sticky reaches at least ${THRESH.headDrop} fewer than long+fix: ${yn(j.r6)}`, `R7 head+forget reaches more than head+sticky: ${yn(j.r7)}`, `R8 ${D} reaches fewer than each of miss+forget, false+forget, occl+forget and head+forget: ${yn(j.r8)}`, `VERDICT: ${j.verdict}`].join("\n");
    }
    if (study === "detector") {
        const D = X.DETECT_DESIGNATED, cond = (c) => `${c}: ${KINDS.map((k) => `${k} ${yn(j.perCond[c][k])}`).join(", ")}`;
        return [`${D} (the detector: mark after 2 consecutive occupied readings, clear after 12 free ones) reaches at least ${pct(THRESH.realBar)} of what exact reaches in each kind under each condition (the bar): ${cond("W")}; ${cond("P")} (${j.cellsHeld} of 6)`,
            `G1 confirmation repairs white false returns: d2-1@W reaches at least ${THRESH.gConfirm} more than d1-1@W: ${yn(j.g1)}`, `G2 and does nothing for dropouts: d2-1@P is within ${THRESH.gClose} flights of d1-1@P: ${yn(j.g2)}`, `G3 a hold alone makes white false returns worse: d1-12@W reaches at least ${THRESH.gHoldBad} fewer than d1-1@W: ${yn(j.g3)}`, `G4 a hold alone helps with dropouts: d1-12@P reaches more than d1-1@P: ${yn(j.g4)}`,
            `G5 together they repair the white false returns: ${D} holds the bar in all three kinds under W: ${yn(j.g5)}`, `G6 and keep the dropout cure: ${D} holds the bar in all three kinds under P: ${yn(j.g6)}`, `G7 and cost little on a sea with no faults: ${D}@clean is within ${THRESH.gClean} flights of the clean long+fix+forget: ${yn(j.g7)}`, `G8 together they beat either rule alone, summed over W and P: ${D} reaches more than d2-1 and more than d1-12: ${yn(j.g8)}`, `VERDICT: ${j.verdict}`].join("\n");
    }
    if (study === "falserate") {
        const D = X.FALSE_DESIGNATED;
        return [`${D} (the forgetting map at a false rate ten times follow-up 4's) reaches at least ${pct(THRESH.realBar)} of what exact reaches in each kind (the bar): ${KINDS.map((k) => `${k} ${yn(j.perKind[k])}`).join(", ")} (${j.kindsHeld} of 3)`,
            `F1 the forgetting map at 0.001 holds the bar in every kind: ${yn(j.f1)}`, `F2 the forgetting map at 0.003 holds the bar in every kind: ${yn(j.f2)}`, `F3 the forgetting map at 0.03 misses the bar in at least one kind: ${yn(j.f3)}`, `F4 the forgetting map's pooled count never rises by more than ${THRESH.fMono} flights from 0.001 to 0.003 to 0.01 to 0.03: ${yn(j.f4)}`,
            `F5 all@0.001+filter reaches at least ${THRESH.fFilterGap} fewer than all@0.001+forget: ${yn(j.f5)}`, `F6 all@0.0001+filter reaches at least ${pct(THRESH.realBar)} of what exact reaches over the three kinds: ${yn(j.f6)}`, `F7 all@0.0003+filter reaches at least ${THRESH.fCliff} fewer than all@0.0001+filter: ${yn(j.f7)}`, `F8 all@0.001+forget reaches more than all@0.001+filter in each of the three kinds: ${yn(j.f8)}`, `VERDICT: ${j.verdict}`].join("\n");
    }
    if (study === "persistent") {
        const D = X.PERSIST_DESIGNATED;
        return [`${D} (the vessel with persistent faults) reaches at least ${pct(THRESH.realBar)} of what exact reaches in each kind (the bar): ${KINDS.map((k) => `${k} ${yn(j.perKind[k])}`).join(", ")} (${j.kindsHeld} of 3)`,
            `P1 bias+sticky reaches at least ${THRESH.biasGain} more than head+sticky over the three kinds: ${yn(j.p1)}`, `P2 bias+forget is within ${THRESH.persistClose} flights of the clean long+fix+forget: ${yn(j.p2)}`, `P3 cellp+forget is within ${THRESH.persistClose} flights of long+fix+forget: ${yn(j.p3)}`, `P4 objp+forget reaches at least ${THRESH.objDrop} fewer than long+fix+forget: ${yn(j.p4)}`,
            `P5 objp+sticky reaches at least ${THRESH.stickyGain} more than objp+forget: ${yn(j.p5)}`, `P6 range+forget is within ${THRESH.persistClose} flights of long+fix+forget: ${yn(j.p6)}`, `P7 pall+sticky reaches at least ${THRESH.stickyDrop} fewer than ${D}: ${yn(j.p7)}`, `P8 ${D} is within ${THRESH.persistClose} flights of the white all+forget: ${yn(j.p8)}`, `VERDICT: ${j.verdict}`].join("\n");
    }
    if (study === "combined") {
        const D = X.COMBINED_DESIGNATED;
        return [`${D}: loses no more than ${THRESH.ceiling} flights against exact in each of the three kinds (the bar): ${yn(j.ceiling)}; reaches at least ${THRESH.gainCombined} more than sensed+fix over the three kinds: ${yn(j.gain)}`,
            `C1 ${D} reaches at least as many as fix+forget over the three kinds: ${yn(j.c1)}`, `C2 ${D} reaches more than fix+forget in hard-gaps: ${yn(j.c2)}`, `C3 long+fix reaches fewer than sonar-200 over the three kinds: ${yn(j.c3)}`, `C4 ${D} reaches more than long+fix over the three kinds: ${yn(j.c4)}`,
            `C5 long+fix+forget+filter is within ${THRESH.within} flights of ${D} over the three kinds: ${yn(j.c5)}`, `C6 long+drift is within ${THRESH.within} flights of sonar-200 over the three kinds: ${yn(j.c6)}`, `C7 ${D} reaches at least ${THRESH.gapsFloor} of the hard-gaps: ${yn(j.c7)}`, `VERDICT: ${j.verdict}`].join("\n");
    }
    const D = X.FIX_DESIGNATED;
    return [`${D}: within ${THRESH.close} flights of sensed in each of the three kinds (the bar): ${yn(j.close)}; reaches at least ${THRESH.gainFix} more than sensed+fix over the three kinds: ${yn(j.gain)}`,
        `E1 ${D} reaches more than sensed+fix in hard-islands: ${yn(j.e1)}`, `E2 fix+filter reaches more than sensed+fix in hard-islands: ${yn(j.e2)}`, `E3 fix+forget+filter reaches at least as many as either alone over the three kinds: ${yn(j.e3)}`, `E4 the median plans a flight of fix+forget are above sensed+fix's: ${yn(j.e4)}`,
        `E5 sensed+drift is within ${THRESH.control} flights of sensed in each kind: ${yn(j.e5)}`, `E6 in hard-gaps no fix arm reaches more than ${THRESH.gapSlack} above sensed: ${yn(j.e6)}`, `VERDICT: ${j.verdict}`].join("\n");
}
/** The command as a function: returns the exit code (0 fine, 2 a bad argument). `io` is for the gate: { out, err, writeFile }. */
export function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), err = io.err || ((m) => console.error(m)), writeFile = io.writeFile || fs.writeFileSync;
    const o = { study: null, set: "dev", seeds: null, write: false };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--write") o.write = true;
        else if (a === "--study") { o.study = argv[++i]; if (!STUDIES[o.study]) { err(`subSensedFollowStudy: --study needs one of ${Object.keys(STUDIES).join(", ")}`); return 2; } }
        else if (a === "--set") { o.set = argv[++i]; if (!SETS[o.set]) { err(`subSensedFollowStudy: --set needs one of ${Object.keys(SETS).join(", ")}`); return 2; } }
        else if (a === "--seeds") { const v = Number(argv[++i]); if (!Number.isInteger(v) || v <= 0) { err("subSensedFollowStudy: --seeds needs a positive whole number"); return 2; } o.seeds = v; }
        else { err(`subSensedFollowStudy: unknown argument ${JSON.stringify(a)}`); return 2; }
    }
    if (!o.study) { err(`subSensedFollowStudy: --study ${Object.keys(STUDIES).join("|")} is needed`); return 2; }
    if (o.set !== "dev" && o.set !== STUDIES[o.study].held) { err(`subSensedFollowStudy: the ${o.study} study is flown on dev or ${STUDIES[o.study].held}, not ${o.set}`); return 2; }
    if (o.write && o.set === "dev") { err(`subSensedFollowStudy: --write goes with --set ${STUDIES[o.study].held} only`); return 2; }
    const arms = STUDIES[o.study].arms, seeds = o.seeds ? SETS[o.set].slice(0, o.seeds) : SETS[o.set], runs = [];
    out(`${o.study.toUpperCase()} study, ${o.set.toUpperCase()} set: ${seeds.length} scenarios of each of ${KINDS.join(", ")}, ${arms.length} arms (${arms.join(", ")})`);
    for (const kind of KINDS) for (const seed of seeds) { const sc = H.hardScenario(seed, kind); for (const arm of arms) runs.push(X.flyArm(pilot, sc, arm)); }
    const sum = summarize(runs, o.study);
    out(""); out(table(sum, o.study, `margin ladder ${H.MARGIN_LADDER.join(", ")} m, ${H.SECONDS_HARD} s a flight, fix sigma ${X.FIX_SIGMA} m, drift ${X.DRIFT_SIGMA} m per root s, fix gain ${X.FIX_GAIN}`)); out(""); out(verdictText(judge(sum, o.study), o.study));
    if (o.write) { writeFile(path.join(ENG, OUTS[o.study]), runs.map((r) => JSON.stringify({ study: o.study, set: o.set, ...r })).join("\n") + "\n"); out(`wrote ${runs.length} flights to ${OUTS[o.study]}`); }
    return 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = command(process.argv.slice(2));
