// WebGLEngine/tools/ship/plannerMeta.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/plannerMetaCmd.mjs; the gate is tools/ship/plannerMeta-selfcheck.mjs)
//
// ROUND 19 of brain/NEEDS_AND_LIMITS.md ("is the twin's gain a constant, or does it depend on the seed block?", registered before this file existed, part of its data already read and said so): a meta-analysis of the
// full twin's gain over TUNED-R8 across every fresh-seed block of Rounds 12-17 flown under the same conditions (gauge sd 0.10, three stations): Cochran's Q, I-squared, the DerSimonian-Laird tau-squared, the
// random-effects mean, the inflation factor of the stated standard errors. NO NEW DIVE. The library reads no file: the command hands it the per-dive scores. No clock, no Math.random, no file.
"use strict";

export const SE_FACTOR = 2, P_LEVEL = 0.05, INFLATION_LIMIT = 1.2;
/** Round 12 as one block: its per-dive scores were not kept, only its report (pooled twin minus TUNED-R8 over 288 dives, and the same by kind). */
export const ROUND12 = Object.freeze({ name: "R12:Z1-Z3", n: 288, mean: 0.0214, se: 0.0040, far: Object.freeze({ mean: 0.0312, se: 0.0068 }), both: Object.freeze({ mean: 0.0115, se: 0.0040 }) });
/** Where the other blocks live: the arm directory under brain/rig-results, the twin and tuned arm names there, and the sets. */
export const SOURCES = Object.freeze([
    Object.freeze({ round: "R13", dir: "tolerance-arms", twin: "TWIN-EXACT", tuned: "TUNED-R8", sets: Object.freeze(["V1", "V2"]) }),
    Object.freeze({ round: "R14", dir: "budget-arms", twin: "TWIN-FULL", tuned: "TUNED-R8", sets: Object.freeze(["W1", "W2"]) }),
    Object.freeze({ round: "R15", dir: "noise-arms", twin: "TWIN-FULL@0.1", tuned: "TUNED-R8@0.1", sets: Object.freeze(["U1", "U2"]) }),
    Object.freeze({ round: "R16", dir: "stations-arms", twin: "TWIN-FULL@3", tuned: "TUNED-R8@3", sets: Object.freeze(["T1", "T2"]) }),
    Object.freeze({ round: "R17", dir: "events-arms", twin: "TWIN-FULL", tuned: "TUNED-R8", sets: Object.freeze(["S1", "S2", "S3"]) }),
]);
export const BLOCK_COUNT = 1 + SOURCES.reduce((a, s) => a + s.sets.length, 0);
const meanOf = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const seOf = (a) => { if (a.length < 2) return 0; const m = meanOf(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) * (y - m), 0) / (a.length - 1) / a.length); };

/** ln Gamma(x) (Lanczos). */
export function lnGamma(x) {
    const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let y = x, t = x + 5.5; t -= (x + 0.5) * Math.log(t);
    let ser = 1.000000000190015; for (const cj of c) ser += cj / ++y;
    return -t + Math.log(2.5066282746310005 * ser / x);
}
/** The regularized upper incomplete gamma function Q(a, x), by the series below a + 1 and the continued fraction above (Numerical Recipes). */
export function gammaQ(a, x) {
    if (x <= 0) return 1;
    if (x < a + 1) {
        let sum = 1 / a, term = sum, ap = a;
        for (let n = 0; n < 500; n++) { ap += 1; term *= x / ap; sum += term; if (Math.abs(term) < Math.abs(sum) * 1e-15) break; }
        return 1 - sum * Math.exp(-x + a * Math.log(x) - lnGamma(a));
    }
    let b = x + 1 - a, c = 1e300, d = 1 / b, h = d;
    for (let i = 1; i < 500; i++) {
        const an = -i * (i - a); b += 2; d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
        c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-15) break;
    }
    return Math.exp(-x + a * Math.log(x) - lnGamma(a)) * h;
}
/** The upper-tail probability of a chi-square statistic `x` on `df` degrees of freedom. */
export const chi2Upper = (x, df) => gammaQ(df / 2, x / 2);

/** One block's estimate from the per-dive runs of the twin and of the tuned rule on the same dives (`kind` optional): { n, mean, se }. Refuses runs that are not the same dives. */
export function blockOf(twinRuns, tunedRuns, kind = null) {
    if (twinRuns.length !== tunedRuns.length) throw new Error(`plannerMeta.blockOf: ${twinRuns.length} twin dives against ${tunedRuns.length} tuned dives`);
    const d = [];
    twinRuns.forEach((r, i) => { if (r.kind !== tunedRuns[i].kind) throw new Error(`plannerMeta.blockOf: dive ${i} is ${r.kind} for the twin and ${tunedRuns[i].kind} for the tuned rule`); if (!kind || r.kind === kind) d.push(r.score - tunedRuns[i].score); });
    return { n: d.length, mean: meanOf(d), se: seOf(d) };
}
/** The meta-analysis of blocks [{ name, mean, se }]: weights, fixed-effect mean, Q, df, p, I-squared, tau-squared, random-effects mean and se, the inflation factor, the leave-one-out range of the random-effects mean. */
export function meta(blocks) {
    if (blocks.length < 2) throw new Error("plannerMeta.meta: at least two blocks");
    for (const b of blocks) if (!(b.se > 0) || !Number.isFinite(b.mean)) throw new Error(`plannerMeta.meta: block ${b.name} has no usable standard error (${b.se})`);
    const stats = (bs) => {
        const w = bs.map((b) => 1 / (b.se * b.se)), S1 = w.reduce((a, x) => a + x, 0), S2 = w.reduce((a, x) => a + x * x, 0);
        const xbar = bs.reduce((a, b, i) => a + w[i] * b.mean, 0) / S1, Q = bs.reduce((a, b, i) => a + w[i] * (b.mean - xbar) * (b.mean - xbar), 0), df = bs.length - 1;
        const denom = S1 - S2 / S1, tau2 = denom > 0 ? Math.max(0, (Q - df) / denom) : 0, wr = bs.map((b) => 1 / (b.se * b.se + tau2)), Sr = wr.reduce((a, x) => a + x, 0);
        return { w, xbar, Q, df, p: chi2Upper(Q, df), i2: Q > 0 ? Math.max(0, (Q - df) / Q) : 0, tau2, re: bs.reduce((a, b, i) => a + wr[i] * b.mean, 0) / Sr, reSe: Math.sqrt(1 / Sr), inflation: Math.sqrt(Math.max(1, Q / df)), fixedSe: Math.sqrt(1 / S1) };
    };
    const all = stats(blocks), loo = blocks.map((_, i) => stats(blocks.filter((__, j) => j !== i)).re);
    return { ...all, k: blocks.length, looMin: Math.min(...loo), looMax: Math.max(...loo), loo };
}
export function bottomLines(m) {
    return [
        m.p < P_LEVEL ? "THE TWIN'S GAIN VARIES BETWEEN SEED BLOCKS BEYOND CHANCE" : "THE TWIN'S GAIN IS CONSISTENT ACROSS SEED BLOCKS",
        `THE BEST ESTIMATE OF THE GAIN IS ${m.re >= 0 ? "+" : ""}${m.re.toFixed(4)} (se ${m.reSe.toFixed(4)}; ${m.k} BLOCKS), ${m.re > 0 && m.re > SE_FACTOR * m.reSe ? "IT IS REAL" : "IT IS NOT DISTINGUISHABLE FROM ZERO"}`,
        m.inflation > INFLATION_LIMIT ? `THE STATED STANDARD ERRORS ARE TOO SMALL BY A FACTOR OF ${m.inflation.toFixed(2)}` : "THE STATED STANDARD ERRORS ARE ABOUT RIGHT",
    ];
}
/** The checks on the blocks the command assembled: the count, every per-dive block's size, a positive standard error everywhere. */
export function checksOf(blocks) {
    const rows = [];
    rows.push({ name: "BLOCK COUNT", ok: blocks.length === BLOCK_COUNT, text: `${blocks.length} blocks, ${BLOCK_COUNT} expected: ${blocks.length === BLOCK_COUNT}` });
    const sizes = blocks.filter((b) => b.name !== ROUND12.name).every((b) => b.n === 96);
    rows.push({ name: "BLOCK SIZE", ok: sizes, text: `every per-dive block has 96 dives: ${sizes}` });
    const se = blocks.every((b) => b.se > 0);
    rows.push({ name: "STANDARD ERRORS", ok: se, text: `every block has a positive standard error: ${se}` });
    return rows;
}
const fmt = (x, d = 4) => `${x >= 0 ? "+" : ""}${x.toFixed(d)}`;
export function report(blocks, { far = null, both = null } = {}) {
    const L = [`ROUND 19: is the twin's gain a constant? ${blocks.length} blocks of fresh far-and-both dives (Rounds 12-17, gauge sd 0.10, three stations); NO NEW DIVE`];
    const checks = checksOf(blocks), bad = checks.filter((c) => !c.ok);
    for (const c of checks) L.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) L.push("A CHECK FAILED: the verdicts below are NOT WEIGHED.");
    const m = meta(blocks), wsum = m.w.reduce((a, x) => a + x, 0);
    L.push("block, dives, twin minus tuned (se), share of the weight");
    blocks.forEach((b, i) => L.push(`  ${b.name.padEnd(11)} n ${String(b.n).padStart(3)}  ${fmt(b.mean)} (se ${b.se.toFixed(4)})  weight ${(100 * m.w[i] / wsum).toFixed(1)}%`));
    L.push(`fixed-effect mean ${fmt(m.xbar)} (se ${m.fixedSe.toFixed(4)})`, `Q ${m.Q.toFixed(2)} on ${m.df} df, p ${m.p.toFixed(4)}; I-squared ${(100 * m.i2).toFixed(0)}%; tau ${Math.sqrt(m.tau2).toFixed(4)}`);
    L.push(`random-effects mean ${fmt(m.re)} (se ${m.reSe.toFixed(4)}); leave-one-block-out range ${fmt(m.looMin)} to ${fmt(m.looMax)}; inflation factor ${m.inflation.toFixed(2)}`);
    for (const [name, kbAll] of [["far", far], ["both", both]]) if (kbAll && kbAll.length >= 2) {
        // A block whose per-kind differences are ALL equal (every one 0.0000, say) has a standard error of 0 and an infinite weight: it cannot enter an inverse-variance analysis. It is named and left out of this REPORTED line (never out of the verdict, which reads the blocks of both kinds together).
        const kb = kbAll.filter((b) => b.se > 0), dropped = kbAll.filter((b) => !(b.se > 0));
        const note = dropped.length ? `; ${dropped.map((b) => b.name).join(", ")} left out (no spread: every difference equal)` : "";
        if (kb.length < 2) { L.push(`${name} alone: not analysed (${kb.length} block(s) with spread of ${kbAll.length})${note}`); continue; }
        const k = meta(kb); L.push(`${name} alone (${kb.length} blocks): random-effects ${fmt(k.re)} (se ${k.reSe.toFixed(4)}); Q ${k.Q.toFixed(2)} on ${k.df} df, p ${k.p.toFixed(4)}${note}`);
    }
    if (bad.length) L.push("BOTTOM LINE: NOT WEIGHED (a check failed)");
    else for (const l of bottomLines(m)) L.push(`BOTTOM LINE: ${l}`);
    return L;
}
