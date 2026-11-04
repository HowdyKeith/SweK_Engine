// WebGLEngine/tools/ship/subSensedPool.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is "FOLLOW-UP 59" of brain/SENSED_NAV_WIP.md and the note after it, the gate is tools/ship/subSensedPool-selfcheck.mjs)
//
// THE POOLED READING: every flight already in the repository (the 51 sets HELD13 to HELD63 of follow-ups 8 to 58, `brain/subSensedDet*Held*.jsonl`, found through the specs of tools/ship/subSensedDetSpecs.mjs), read together. No flight is made. It is a post hoc analysis of data already read; the rules below were fixed before it was run.
//   THE UNIT. A SET is 180 fresh scenarios. Two arms flown in one set share its scenarios (they are paired); two sets share nothing, so a set is the unit of independence.
//   THE ARM. "<detector>@<sea>". Two registry rows whose specs are equal once written in the CANONICAL form below are ONE detector (an alias: "inc" and "m1-1"), flight for flight; their flights in one set are one arm, and an arm of two aliases whose counts differ is an error, not a choice.
//   CANONICAL FORM (what the registration's "every field of their specs is equal" is read as, fixed before the run; `near`, the radius in metres, is a field too, added with follow-up 61's rows, which differ from their bases in nothing else): markNear null when it equals mark; clear.fNear = clear.f when absent; clear.range "ping" when the hold cannot depend on it (a step with capNear = cap); clear.capNear = clear.cap for a ramp (a ramp does not read it); ghost.carry false, zone "all", at "mark" when absent; lock null when absent.
//   (A) BETWEEN-SET NOISE. For every arm flown in at least 3 sets: its count in each set, the mean, the standard deviation across sets (n - 1), the binomial one sqrt(n p (1 - p)) with p the arm's mean rate, and their ratio (not defined where the binomial one is 0, and the arm is then left out of the median). Reported: the median ratio, the largest range (maximum minus minimum across sets), the arms with a range over 12. `exact` and the clean `long+fix+forget` are controls, reported apart.
//   (B) THE EFFECT OF ONE FEATURE. Two canonical specs are MATCHED on feature F when all their fields are equal except F (the tests are FEATURES below; a field a feature leaves free is said there). For each feature (the ghost's variants counted apart, the ramp against the hold at every range and against the step as two rows), each sea of SEAS and each set in which at least one matched pair of that feature was flown together under that sea: the set's effect is the mean over its matched pairs of (reached of the arm WITH the feature minus reached of the arm without). The pooled effect is the mean of the set effects, with a 95% t-interval across sets (tCrit; the table's next lower df for a df it does not list), the number of sets, and the number of sets with each sign.
//   THE READING RULE: SEEN when at least 5 sets contribute, the interval excludes 0 (|mean| > half-width) and at least 80% of the sets with a nonzero effect share the sign (integer arithmetic: 5 max >= 4 nonzero); SUGGESTED when the interval excludes 0 and SEEN is not met; NOT SEPARABLE otherwise (one set has no interval). The tests are unadjusted for the number of rows; the count of rows called seen is reported beside the number of rows.
//   THE PREDICTIONS (PA1 to PA8, scored by `scorePredictions` against the table, fixed before the run). PA1: no F1 row whose ghost does not carry (any variant, any sea) is seen or suggested. PA2: the same for the F2 rows, or, where F2 has no matched pair (no registry row is a carrying ghost beside the same ghost without the carry), for the F1 rows whose ghost carries; a prediction with no row to read is missed, not vacuously held. PA3: every F3 row is not separable or seen with a mean from -6 up to (not including) 0. PA4: the F4 R3D30 row is seen with a mean from -17 to -4. PA5: the F5b R3D30 row is seen with a mean from 8 to 20. PA6: the F6 rows of WD30, WD30L and W exist and are each seen with a mean of -15 or less. PA7: the F8 WD30L row is seen with a mean of 15 or more, and the F8 R3D30 and D30 rows exist and are not separable. PA8: the median ratio is above 1.3 and at least one arm has a range over 12 (the second half was known when the module was written, which the note to follow-up 59 says).
// Pure but for the loader (the files named by the specs). No clock, no random.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as D from "../../brain/subSensedDetect.mjs";
import * as Sp from "./subSensedDetSpecs.mjs";

export const SEAS = Object.freeze(["R3D30", "WD30L", "WD30", "W", "P", "D30"]);
export const MIN_SETS_NOISE = 3, MIN_SETS_SEEN = 5, RANGE_OVER = 12;
export const CONTROLS = Object.freeze(["exact", "long+fix+forget"]);
/** The sets pooled: the specs of follow-ups 8 to 58 (HELD13 to HELD63), the 51 sets the registration names; the larger set of follow-up 60 and the sweep of 61 come after and are not part of it. */
export const pooledOf = (specs) => Object.freeze(Object.fromEntries(Object.entries(specs).filter(([, spec]) => spec.followUp >= 8 && spec.followUp <= 58)));
export const POOLED = pooledOf(Sp.SPECS);

/** Student's t, 0.975 quantile, by degrees of freedom (the standard table; df between listed values takes the next lower one, which is wider). */
export const T975 = Object.freeze({ 1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262, 10: 2.228, 11: 2.201, 12: 2.179, 13: 2.160, 14: 2.145, 15: 2.131, 16: 2.120, 17: 2.110, 18: 2.101, 19: 2.093, 20: 2.086, 21: 2.080, 22: 2.074, 23: 2.069, 24: 2.064, 25: 2.060, 26: 2.056, 27: 2.052, 28: 2.048, 29: 2.045, 30: 2.042, 40: 2.021, 60: 2.000, 120: 1.980 });
const T_DFS = Object.keys(T975).map(Number);   // integer keys come out ascending
export function tCrit(df) {
    if (!(df >= 1)) return NaN;
    return T975[T_DFS.filter((d) => d <= df).pop()];
}

export const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
export const sdOf = (xs) => { if (xs.length < 2) return NaN; const m = mean(xs); return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1)); };
export const medianOf = (xs) => { const s = xs.slice().sort((a, b) => a - b), k = s.length; return k === 0 ? NaN : k % 2 ? s[(k - 1) / 2] : (s[k / 2 - 1] + s[k / 2]) / 2; };

// ---- the canonical form of a detector spec, and its key ----
const J = (x) => JSON.stringify(x);
const sameJ = (x, y) => J(x) === J(y);
export function canon(spec) {
    const c = spec.clear, markNear = spec.markNear && !sameJ(spec.markNear, spec.mark) ? [...spec.markNear] : null;
    const ramp = c.shape === "ramp", uniform = c.shape === "step" && c.capNear === c.cap;
    const clear = { cap: c.cap, capNear: ramp ? c.cap : c.capNear, evidence: c.evidence, f: c.f, fNear: c.fNear === undefined ? c.f : c.fNear, shape: c.shape, range: uniform ? "ping" : c.range };
    const g = spec.ghost, ghost = g ? { min: g.min, life: g.life, nbr: g.nbr, carry: !!g.carry, zone: g.zone || "all", at: g.at || "mark" } : null;
    const lock = spec.lock ? { life: spec.lock.life, below: spec.lock.below } : null;
    return { mark: [...spec.mark], markNear, near: spec.near, clear, ghost, lock };
}
export const specKey = (cs) => J(cs);

/** The unique canonical detectors of a registry: Map(key -> { key, spec, names }) with the names sorted. */
export function detectorsOf(defs = D.ARM_DEFS) {
    const m = new Map();
    for (const name of Object.keys(defs).sort()) {
        const cs = canon(defs[name]), key = specKey(cs);
        if (!m.has(key)) m.set(key, { key, spec: cs, names: [] });
        m.get(key).names.push(name);
    }
    return m;
}

// ---- THE FEATURES: test(a, b) -> null, or the variant label ("" for none) when b has the feature and a does not, all else equal ----
const restEq = (a, b, left) => ["mark", "markNear", "near", "clear", "ghost", "lock"].filter((f) => !left.includes(f)).every((f) => sameJ(a[f], b[f]));
const clearEq = (x, y, free) => Object.keys(x).filter((f) => !free.includes(f)).every((f) => x[f] === y[f]);
export const FEATURES = Object.freeze([
    { id: "F1", name: "the ghost (any ghost against none; a variant is its zone, at, neighbour test, carry, min and life)", test: (a, b) => (a.ghost === null && b.ghost !== null && restEq(a, b, ["ghost"]) ? `zone ${b.ghost.zone} at ${b.ghost.at} nbr ${b.ghost.nbr} carry ${b.ghost.carry} min ${b.ghost.min} life ${b.ghost.life}` : null) },
    { id: "F2", name: "the carry (a ghost that carries against the same ghost that does not)", test: (a, b) => (a.ghost !== null && b.ghost !== null && !a.ghost.carry && b.ghost.carry && restEq(a, b, ["ghost"]) && clearEq(a.ghost, b.ghost, ["carry"]) ? "" : null) },
    { id: "F3", name: "the confirmed clear (0.8 against a run, at every range)", test: (a, b) => (a.clear.f === 1 && a.clear.fNear === 1 && b.clear.f === 0.8 && b.clear.fNear === 0.8 && clearEq(a.clear, b.clear, ["f", "fNear"]) && restEq(a, b, ["clear"]) ? "" : null) },
    { id: "F4", name: "the step gate on the evidence hold (gated against at every range: the hold of cap within 80 m only, 1 beyond it, against cap at every range)", test: (a, b) => (a.clear.evidence && b.clear.evidence && a.clear.shape === "step" && b.clear.shape === "step" && a.clear.capNear === a.clear.cap && b.clear.capNear === a.clear.cap && b.clear.cap < b.clear.capNear && clearEq(a.clear, b.clear, ["cap", "range"]) && restEq(a, b, ["clear"]) ? "" : null) },
    { id: "F5a", name: "the ramp against the hold at every range", test: (a, b) => (a.clear.shape === "step" && a.clear.capNear === a.clear.cap && b.clear.shape === "ramp" && clearEq(a.clear, b.clear, ["shape", "capNear", "range"]) && restEq(a, b, ["clear"]) ? "" : null) },
    { id: "F5b", name: "the ramp against the step (the gated hold of the same cap within 80 m, on the same range)", test: (a, b) => (a.clear.shape === "step" && a.clear.cap < a.clear.capNear && b.clear.shape === "ramp" && b.clear.cap === a.clear.capNear && clearEq(a.clear, b.clear, ["shape", "cap", "capNear"]) && restEq(a, b, ["clear"]) ? "" : null) },
    { id: "F6", name: "the first-reading near mark (markNear of one against the same rule at every range)", test: (a, b) => (a.markNear === null && b.markNear !== null && sameJ(b.markNear, [1, 1]) && sameJ(a.mark, b.mark) && restEq(a, b, ["markNear"]) ? "" : null) },
    { id: "F7", name: "the run of three against the 2-of-3", test: (a, b) => (sameJ(a.mark, [2, 3]) && sameJ(b.mark, [3, 3]) && restEq(a, b, ["mark"]) ? "" : null) },
    { id: "F8", name: "the evidence hold against the map that forgets", test: (a, b) => (!a.clear.evidence && a.clear.cap === 1 && a.clear.capNear === 1 && a.clear.f === 1 && a.clear.fNear === 1 && a.clear.shape === "step" && b.clear.evidence && restEq(a, b, ["clear"]) ? "" : null) },
    { id: "F9", name: "the lock (a lock on the free state against none)", test: (a, b) => (a.lock === null && b.lock !== null && restEq(a, b, ["lock"]) ? "" : null) },
]);

/** Every matched pair of a registry: [{ feature, variant, a, b }] with a and b canonical keys (a without the feature, b with it). */
export function matchPairs(defs = D.ARM_DEFS) {
    const dets = [...detectorsOf(defs).values()], out = [];
    for (const A of dets) for (const B of dets) {
        if (A === B) continue;
        for (const F of FEATURES) { const v = F.test(A.spec, B.spec); if (v !== null) out.push({ feature: F.id, variant: v, a: A.key, b: B.key }); }
    }
    return out;
}

// ---- the table of counts: Map("<key>@<sea>" -> Map(set -> { n, k })) ----
export function armTable(rows, defs = D.ARM_DEFS) {
    const dets = detectorsOf(defs), keyOf = new Map();
    for (const d of dets.values()) for (const nm of d.names) keyOf.set(nm, d.key);
    const raw = new Map();   // "<name>@<sea>" -> Map(set -> {n, k})
    for (const r of rows) {
        const sets = raw.get(r.arm) || raw.set(r.arm, new Map()).get(r.arm), c = sets.get(r.set) || sets.set(r.set, { n: 0, k: 0 }).get(r.set);
        c.n++; if (r.reached === true) c.k++;
    }
    const table = new Map(), controls = new Map();
    for (const [arm, sets] of raw) {
        const at = arm.lastIndexOf("@");
        if (at < 0) { if (!CONTROLS.includes(arm)) throw new Error(`subSensedPool: "${arm}" is neither a detector arm nor a control`); controls.set(arm, sets); continue; }
        const name = arm.slice(0, at), sea = arm.slice(at + 1), key = keyOf.get(name);
        if (key === undefined) throw new Error(`subSensedPool: "${arm}" names no registry row`);
        const cell = `${key}@${sea}`, into = table.get(cell) || table.set(cell, new Map()).get(cell);
        for (const [set, c] of sets) {
            const had = into.get(set);
            if (had) { if (had.n !== c.n || had.k !== c.k) throw new Error(`subSensedPool: aliases of one detector disagree in ${set}: ${arm}`); continue; }
            into.set(set, { n: c.n, k: c.k, name });
        }
    }
    return { table, controls };
}

// ---- (A) the between-set noise ----
const nameOfKey = (key, defs) => detectorsOf(defs).get(key).names;
export function betweenSet(table, defs = D.ARM_DEFS) {
    const arms = [], left = [];
    for (const [cell, sets] of table) {
        if (sets.size < MIN_SETS_NOISE) continue;
        const at = cell.lastIndexOf("@"), key = cell.slice(0, at), sea = cell.slice(at + 1);
        const ids = [...sets.keys()].sort(), ks = ids.map((s) => sets.get(s).k), ns = ids.map((s) => sets.get(s).n);
        const n = mean(ns), m = mean(ks), p = m / n, sd = sdOf(ks), bsd = Math.sqrt(n * p * (1 - p)), ratio = sd / bsd;   // 0 / 0 is NaN where the binomial sd is 0 (all the counts are 0 or all n)
        const a = { names: nameOfKey(key, defs), sea, sets: ids, counts: ks, mean: m, sd, bsd, ratio, range: Math.max(...ks) - Math.min(...ks) };
        arms.push(a); if (!(bsd > 0)) left.push(a);
    }
    arms.sort((x, y) => y.range - x.range || (x.names[0] + x.sea < y.names[0] + y.sea ? -1 : 1));
    const ratios = arms.filter((a) => bsdOk(a)).map((a) => a.ratio);
    return { arms, left, medianRatio: medianOf(ratios), nRatios: ratios.length, maxRange: arms.length ? arms[0].range : NaN, over: arms.filter((a) => a.range > RANGE_OVER) };
}
const bsdOk = (a) => a.bsd > 0;
export function controlsNoise(controls) {
    return [...controls].map(([arm, sets]) => { const ks = [...sets.values()].map((c) => c.k); return { arm, sets: ks.length, mean: mean(ks), sd: sdOf(ks), range: Math.max(...ks) - Math.min(...ks) }; }).sort((x, y) => (x.arm < y.arm ? -1 : 1));
}

// ---- (B) the effect of a feature ----
export function call(row) {
    const excludes = row.n >= 2 && Math.abs(row.mean) > row.half, nz = row.pos + row.neg;
    if (!excludes) return "not separable";
    return row.n >= MIN_SETS_SEEN && Math.max(row.pos, row.neg) * 5 >= nz * 4 ? "seen" : "suggested";
}
export function featureEffects(table, pairs, seas = SEAS) {
    const rows = [], byFeature = new Map();
    for (const p of pairs) { const id = p.variant ? `${p.feature}|${p.variant}` : p.feature; (byFeature.get(id) || byFeature.set(id, []).get(id)).push(p); }
    const ids = [...byFeature.keys()].sort();
    for (const id of ids) for (const sea of seas) {
        const per = new Map();   // set -> { sum, count }
        for (const p of byFeature.get(id)) {
            const A = table.get(`${p.a}@${sea}`), B = table.get(`${p.b}@${sea}`);
            if (!A || !B) continue;
            for (const [set, b] of B) { const a = A.get(set); if (!a) continue; const e = per.get(set) || per.set(set, { sum: 0, count: 0 }).get(set); e.sum += b.k - a.k; e.count++; }
        }
        if (per.size === 0) continue;
        const sets = [...per.keys()].sort(), eff = sets.map((s) => per.get(s).sum / per.get(s).count), n = eff.length;
        const sd = sdOf(eff), half = tCrit(n - 1) * sd / Math.sqrt(n), m = mean(eff);
        const pos = sets.filter((s) => per.get(s).sum > 0).length, neg = sets.filter((s) => per.get(s).sum < 0).length;
        const row = { feature: id.split("|")[0], variant: id.includes("|") ? id.slice(id.indexOf("|") + 1) : "", sea, sets, effects: eff, pairs: sets.map((s) => per.get(s).count), n, mean: m, sd, half, lo: m - half, hi: m + half, pos, neg, zero: n - pos - neg };
        row.call = call(row); rows.push(row);
    }
    return rows;
}

// ---- the predictions ----
export function scorePredictions(noise, rows) {
    const of = (f, sea) => rows.filter((r) => r.feature === f && (sea === undefined || r.sea === sea));
    const one = (f, sea) => of(f, sea)[0];
    const sig = (r) => r.call === "seen" || r.call === "suggested";
    const inR = (x, lo, hi) => x >= lo && x <= hi;
    const P = [];
    const add = (id, text, held, detail) => P.push({ id, text, held: !!held, detail });
    const carries = (r) => / carry true /.test(r.variant), f1all = of("F1"), f1 = f1all.filter((r) => !carries(r)), f2rows = of("F2");
    const f2use = f2rows.length > 0 ? f2rows : f1all.filter(carries), f2how = f2rows.length > 0 ? "F2 rows" : "F1 rows whose ghost carries (F2 has no matched pair)";
    add("PA1", "the ghost (F1) is not separable under every sea", f1.length > 0 && f1.filter(sig).length === 0, `${f1.length} rows without the carry, ${f1.filter(sig).length} seen or suggested`);
    add("PA2", "the carry (F2) is not separable", f2use.length > 0 && f2use.filter(sig).length === 0, `${f2use.length} ${f2how}, ${f2use.filter(sig).length} seen or suggested`);
    const f3 = of("F3"), f3bad = f3.filter((r) => !(r.call === "not separable" || (r.call === "seen" && r.mean >= -6 && r.mean < 0)));
    add("PA3", "the confirmed clear (F3) is not separable, or seen with a negative sign of at most 6", f3.length > 0 && f3bad.length === 0, `${f3.length} rows, ${f3bad.length} outside`);
    const r4 = one("F4", "R3D30");
    add("PA4", "the step gate (F4) is seen with a negative effect between 4 and 17 under R3D30", r4 && r4.call === "seen" && inR(r4.mean, -17, -4), r4 ? `${r4.call}, mean ${r4.mean.toFixed(2)}, ${r4.n} sets` : "no row");
    const r5 = one("F5b", "R3D30");
    add("PA5", "the ramp against the step (F5) is seen with a positive effect between 8 and 20 under R3D30", r5 && r5.call === "seen" && inR(r5.mean, 8, 20), r5 ? `${r5.call}, mean ${r5.mean.toFixed(2)}, ${r5.n} sets` : "no row");
    const r6 = ["WD30", "WD30L", "W"].map((s) => one("F6", s));
    add("PA6", "the first-reading near mark (F6) is seen with a negative effect of at least 15 under WD30, WD30L and W", r6.every((r) => r && r.call === "seen" && r.mean <= -15), r6.map((r, i) => (r ? `${["WD30", "WD30L", "W"][i]} ${r.call} ${r.mean.toFixed(2)} (${r.n})` : `${["WD30", "WD30L", "W"][i]} no row`)).join("; "));
    const r7a = one("F8", "WD30L"), r7b = one("F8", "R3D30"), r7c = one("F8", "D30");
    add("PA7", "the evidence hold (F8) is seen with a positive effect of at least 15 under WD30L and not separable under R3D30 and D30", r7a && r7a.call === "seen" && r7a.mean >= 15 && r7b && r7b.call === "not separable" && r7c && r7c.call === "not separable", [["WD30L", r7a], ["R3D30", r7b], ["D30", r7c]].map(([s, r]) => (r ? `${s} ${r.call} ${r.mean.toFixed(2)} (${r.n})` : `${s} no row`)).join("; "));
    add("PA8", "the median between-set ratio is above 1.3 and at least one arm has a range over 12", noise.medianRatio > 1.3 && noise.maxRange > RANGE_OVER, `median ratio ${noise.medianRatio.toFixed(2)} over ${noise.nRatios} arms (first half); largest range ${noise.maxRange} (second half, known when the module was written)`);
    return P;
}

// ---- the repository ----
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export function loadRows(specs = POOLED, root = REPO, read = (p) => fs.readFileSync(p, "utf8")) {
    const rows = [], sets = [];
    for (const name of Object.keys(specs)) {
        const s = specs[name];
        const lines = read(path.join(root, s.out)).split("\n").filter((l) => l.trim());
        sets.push(s.held);
        for (const l of lines) { const r = JSON.parse(l); rows.push({ set: s.held, arm: r.arm, reached: r.reached }); }
    }
    return { rows, sets };
}

// ---- the report ----
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : String(x));
export function report(sets, noise, ctl, rows, preds) {
    const L = [];
    L.push(`POOLED READING (follow-up 59): ${sets.length} sets (${sets[0]} to ${sets[sets.length - 1]}), the flights already in the repository; no flight was made`);
    L.push("");
    L.push(`(A) BETWEEN-SET NOISE, arms flown in at least ${MIN_SETS_NOISE} sets: ${noise.arms.length} arms (${noise.nRatios} with a ratio)`);
    L.push(`median ratio of the standard deviation across sets to the binomial one: ${f2(noise.medianRatio)}; largest range: ${noise.maxRange}; arms with a range over ${RANGE_OVER}: ${noise.over.length}`);
    L.push("arm (aliases) @ sea | sets | counts | mean | sd | binomial sd | ratio | range");
    for (const a of noise.arms) L.push(`${a.names.join("=")}@${a.sea} | ${a.sets.length} | ${a.counts.join(",")} | ${f2(a.mean)} | ${f2(a.sd)} | ${f2(a.bsd)} | ${f2(a.ratio)} | ${a.range}`);
    L.push("controls (not in the statistic): " + ctl.map((c) => `${c.arm} ${c.sets} sets mean ${f2(c.mean)} sd ${f2(c.sd)} range ${c.range}`).join("; "));
    L.push("");
    L.push(`(B) THE EFFECT OF ONE FEATURE: ${rows.length} rows (feature, variant, sea) with at least one set; seen ${rows.filter((r) => r.call === "seen").length}, suggested ${rows.filter((r) => r.call === "suggested").length}, not separable ${rows.filter((r) => r.call === "not separable").length}; the registration's grid is 9 features x 6 seas = 54, unadjusted`);
    L.push("feature | variant | sea | sets | mean effect | interval | sets + / - / 0 | call");
    for (const r of rows) L.push(`${r.feature} | ${r.variant || "-"} | ${r.sea} | ${r.n} | ${f2(r.mean)} | ${r.n >= 2 ? `${f2(r.lo)} to ${f2(r.hi)}` : "none"} | ${r.pos}/${r.neg}/${r.zero} | ${r.call}`);
    L.push("");
    L.push("THE PREDICTIONS");
    for (const p of preds) L.push(`${p.id} ${p.held ? "HELD" : "MISSED"}: ${p.text}. ${p.detail}`);
    return L.join("\n") + "\n";
}

export function run(opts = {}) {
    const defs = opts.defs || D.ARM_DEFS, { rows: flights, sets } = loadRows(opts.specs, opts.root, opts.read);
    const { table, controls } = armTable(flights, defs), noise = betweenSet(table, defs), ctl = controlsNoise(controls);
    const eff = featureEffects(table, matchPairs(defs)), preds = scorePredictions(noise, eff);
    return { sets, noise, ctl, rows: eff, preds, text: report(sets, noise, ctl, eff, preds) };
}

/** The command: no flag prints the table; --write writes brain/subSensedPool.txt and refuses to overwrite it (the table is read once); any other flag is a usage error (exit 1) and reads nothing. Returns the exit code. */
export function main(argv, io = {}) {
    const out = io.out || path.join(REPO, "brain/subSensedPool.txt"), exists = io.exists || fs.existsSync, writeFile = io.writeFile || fs.writeFileSync;
    const log = io.log || console.log, err = io.err || console.error, print = io.print || ((t) => process.stdout.write(t)), go = io.run || run, write = argv.includes("--write"), unknown = argv.filter((a) => a !== "--write");
    if (unknown.length) { err(`usage: node tools/ship/subSensedPool.mjs [--write]   (not understood: ${unknown.join(" ")})`); return 1; }
    if (write && exists(out)) { err(`subSensedPool: ${out} exists; the table is read once and is not overwritten`); return 2; }
    const r = go();
    if (write) { writeFile(out, r.text); log(`wrote ${out}`); } else print(r.text);
    return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
