// WebGLEngine/tools/ship/foldStats.mjs -- v4698: the statistic render/learned-folds-preregistration.md declares,
// written and gated BEFORE any data it will be applied to exists.
//
// *** THE UNIT OF REPLICATION IS THE FOLD, NOT THE BLOCK. *** v4696's pooled AUC ranked blocks scored by
// different models fitted to different priors, and a shuffled-label control reproduced it at 0.2451. Blocks are
// also not independent -- 576 per frame, 39 frames, neighbours sharing texels and frames sharing a camera path --
// so any test that counts 22,464 blocks as 22,464 observations reports a standard error that belongs to a
// different experiment. Here each held-out scene contributes ONE number per arm: its AUC, averaged over the
// declared seeds. AUC is invariant to any monotone shift of one model's scores, so a fold's prior and a fold's
// score band cannot enter it, which is exactly the property the pooled statistic lacked.
//
// *** EVERY CONSTANT IS PARSED OUT OF THE PRE-REGISTRATION, NOT RESTATED HERE. *** v4691 restated its window
// and v4693 restated its rule, and both sabotages of the document scored 0 RED for it. `declared()` reads the
// fenced `declared` block and refuses a document that lacks a key, so editing the document is the only way
// to move a threshold and the gate sees it.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pairedBoth, signTest } from "./pairedStats.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const PREREG = "render/learned-folds-preregistration.md";
export const ARMS = Object.freeze(["V2", "V1", "SHUF_A", "SHUF_B"]);

const KEYS = Object.freeze({
    scenes: "list", seeds: "ints", alpha: "num", minFolds: "int", minorityFloor: "num",
    steps: "int", hidden: "int", lr: "num", batch: "int", upto: "int", speed: "str",
});

/** Parse the pre-registration's ```declared block. Throws on a missing, extra or malformed key. */
export function declared(text = fs.readFileSync(path.join(ENG, PREREG), "utf8")) {
    const m = /```declared\n([\s\S]*?)\n```/.exec(text);
    if (!m) throw new Error(`foldStats.declared: ${PREREG} has no \`\`\`declared block`);
    const out = {};
    for (const line of m[1].split("\n")) {
        if (!line.trim()) continue;
        const kv = /^\s*(\w+)\s*=\s*(.+?)\s*$/.exec(line);
        if (!kv) throw new Error(`foldStats.declared: unparseable line "${line}"`);
        const [, k, v] = kv, kind = KEYS[k];
        if (!kind) throw new Error(`foldStats.declared: "${k}" is not a declared key -- a key nothing reads is decoration`);
        if (k in out) throw new Error(`foldStats.declared: "${k}" is declared twice`);
        const num = (s) => { const n = Number(s); if (!Number.isFinite(n)) throw new Error(`foldStats.declared: ${k} = "${s}" is not a number`); return n; };
        out[k] = kind === "list" ? Object.freeze(v.split(/\s+/))
               : kind === "ints" ? Object.freeze(v.split(/\s+/).map((s) => { const n = num(s); if (!Number.isInteger(n)) throw new Error(`foldStats.declared: ${k} holds a non-integer`); return n; }))
               : kind === "int" ? (() => { const n = num(v); if (!Number.isInteger(n)) throw new Error(`foldStats.declared: ${k} must be an integer`); return n; })()
               : kind === "num" ? num(v) : v;
    }
    for (const k of Object.keys(KEYS)) if (!(k in out)) throw new Error(`foldStats.declared: ${PREREG} does not declare "${k}"`);
    return Object.freeze(out);
}

/**
 * A seeded uniform draw in [0, 1) -- HALF-OPEN, because a sampler indexes `buffer[(rng() * n) | 0]` and a draw
 * of exactly 1 indexes past the end. The LCG the learned-gate tools already used divides by 0x7fffffff and so
 * CAN return 1; Math.imul keeps the multiply in 32 bits, where `sd * 1103515245` in a double does not.
 */
export function seededRng(seed) {
    let sd = (seed >>> 0) || 1;
    return () => { sd = (Math.imul(sd, 1103515245) + 12345) & 0x7fffffff; return sd / 0x80000000; };
}

/** The smallest fold count at which the one-sided exact sign test CAN reach p < alpha. Derived, not declared. */
export function minFoldsFor(alpha) {
    for (let n = 1; n <= 64; n++) if (signTest(Array(n).fill(1)).p < alpha) return n;
    throw new Error(`foldStats.minFoldsFor: no n up to 64 reaches ${alpha}`);
}

/** Which folds the declared rule admits. Decided from the held-out LABELS alone, before any score is read. */
export function usableFolds(meta, d) {
    const usable = [], excluded = [];
    for (const f of d.scenes) {
        const m = meta[f];
        if (!m) { excluded.push({ fold: f, why: "no held-out rows" }); continue; }
        const minority = Math.min(m.pos, m.neg) / (m.pos + m.neg);
        if (!(minority >= d.minorityFloor)) excluded.push({ fold: f, why: `minority class ${(100 * minority).toFixed(2)}% < floor ${(100 * d.minorityFloor).toFixed(2)}%` });
        else usable.push(f);
    }
    return { usable, excluded };
}

/** One fold's value for one arm: the mean of its per-seed AUCs, or null if any seed's AUC is undefined. */
export function foldMean(aucs) {
    if (!Array.isArray(aucs) || !aucs.length || aucs.some((a) => !Number.isFinite(a))) return null;
    return aucs.reduce((s, v) => s + v, 0) / aucs.length;
}

function clause(results, folds, arm, base, alpha) {
    const diffs = folds.map((f) => foldMean(results[f][arm]) - foldMean(results[f][base]));
    const test = pairedBoth(diffs, alpha);
    return { diffs, test, cleared: test.cleared && test.t.mean > 0 };
}

/**
 * H4 as declared. Clause (a): V2 beats its own shuffled-label twin fold by fold. Clause (b): V2 beats V1 fold by
 * fold. Both one-sided, both paired t AND exact sign at alpha, both with a positive mean -- an INTERSECTION-UNION
 * test, which is level alpha with no correction because it rejects only when every component rejects.
 */
export function h4(results, meta, d) {
    const { usable, excluded } = usableFolds(meta, d);
    for (const f of usable) for (const arm of ARMS)
        if (foldMean((results[f] || {})[arm]) === null) throw new Error(`foldStats.h4: fold ${f} arm ${arm} has an undefined AUC on a usable fold`);
    const derived = minFoldsFor(d.alpha);
    if (d.minFolds !== derived) throw new Error(`foldStats.h4: the document declares minFolds ${d.minFolds} but alpha ${d.alpha} derives ${derived}`);
    if (usable.length < d.minFolds) return { usable, excluded, reportable: false,
        why: `${usable.length} usable folds; the sign test cannot reach ${d.alpha} below ${d.minFolds}` };
    const a = clause(results, usable, "V2", "SHUF_A", d.alpha);
    const b = clause(results, usable, "V2", "V1", d.alpha);
    return { usable, excluded, reportable: true, a, b, supported: a.cleared && b.cleared };
}

/**
 * C11: two shuffled arms that differ ONLY in the permutation must not separate, in EITHER direction. A one-sided
 * check here would be v4696's collapse detector and v4697's scene list over again: blind to its mirror.
 */
export function c11(results, folds, alpha) {
    const g = folds.map((f) => foldMean(results[f].SHUF_A) - foldMean(results[f].SHUF_B));
    const fwd = pairedBoth(g, alpha), back = pairedBoth(g.map((v) => -v), alpha);
    return { g, fwd, back, fired: fwd.cleared || back.cleared };
}
