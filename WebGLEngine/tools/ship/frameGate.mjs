#!/usr/bin/env node
// WebGLEngine/tools/ship/frameGate.mjs -- v4705: the FRAME-level question render/frame-gate-preregistration.md
// declares, and the runner and statistic it will be answered with.
//
// *** THE BLOCK IS CLOSED; THIS ASKS ABOUT THE FRAME. *** Six hypotheses found no per-block gate that transfers.
// A frame generator's real decision is per FRAME -- generate this one or cross-fade it -- and the arc named its own
// frame-level suspect at v4683: "a cross-fade is exactly right wherever the picture is flat, so a compensation's
// worth scales with the spatial gradient". The signal here is that gradient, read the way the page can read it at
// inference: the frame's mean per-block `laplacian`, a column the chain already computes. Nothing is fitted.
//
// NOT RUN on FSR data in the round that commits it. tools/ship/frameGate-selfcheck.mjs gates it on synthetic
// frames, and drives the page only at a speed the document does not declare.
"use strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath, pathToFileURL } from "node:url";
import { FEATURE_NAMES, N_FEATURES } from "../../render/genGate.mjs";
import { declared, readDoc, minFoldsFor } from "./foldStats.mjs";
import { pairedBoth } from "./pairedStats.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const PREREG_H7 = "render/frame-gate-preregistration.md";
export const CACHE_H7 = "tools/ship/frameGate-cache.json.gz";
export const RESULT_H7 = "tools/ship/frameGate-result.json";
export const FRAME_KEYS = Object.freeze({ scenes: "list", speeds: "list", alpha: "num", minFolds: "int", upto: "int", cvFloor: "num" });
// The column is found by NAME, so a reordering of genGate's features cannot silently point this at another one.
export const LAP_COL = FEATURE_NAMES.indexOf("laplacian");

/** One harvested frame -> { frame, lap, adv }. Refuses a row harvested before the page recorded frame dB. */
export function frameRow(row) {
    if (!Number.isFinite(row.genDb) || !Number.isFinite(row.cfDb))
        throw new Error(`frameGate.frameRow: frame ${row.frame} carries no finite genDb/cfDb -- harvested before v4705, or a degenerate PSNR`);
    const nb = row.y.length;
    let lap = 0;
    for (let b = 0; b < nb; b++) lap += row.x[b * N_FEATURES + LAP_COL];
    return { frame: row.frame, lap: lap / nb, adv: row.genDb - row.cfDb };
}

const ranks = (v) => {
    const o = v.map((x, i) => [x, i]).sort((p, q) => p[0] - q[0]), r = new Array(v.length);
    for (let i = 0; i < o.length;) { let j = i; while (j + 1 < o.length && o[j + 1][0] === o[i][0]) j++;
        for (let k = i; k <= j; k++) r[o[k][1]] = (i + j) / 2 + 1; i = j + 1; }
    return r;
};
/** Spearman's rho as Pearson on MIDRANKS, so ties are handled rather than broken by index order. */
export function spearman(a, b) {
    if (a.length !== b.length || a.length < 2) throw new Error("frameGate.spearman: two equal-length samples of at least 2");
    const ra = ranks(a), rb = ranks(b), n = a.length, ma = ra.reduce((s, v) => s + v, 0) / n, mb = rb.reduce((s, v) => s + v, 0) / n;
    let sab = 0, saa = 0, sbb = 0;
    for (let i = 0; i < n; i++) { sab += (ra[i] - ma) * (rb[i] - mb); saa += (ra[i] - ma) ** 2; sbb += (rb[i] - mb) ** 2; }
    return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : null;
}

/** EXACT one-sided permutation p for rho >= observed: every ordering of b against a, up to n = 9 (362,880). */
export function spearmanExactP(a, b) {
    const n = a.length;
    if (n > 9) throw new Error("frameGate.spearmanExactP: exact enumeration is capped at n = 9");
    const obs = spearman(a, b);
    if (obs === null) return { rho: null, p: null };
    const perm = b.slice(), c = new Array(n).fill(0);
    let hit = 0, total = 0;
    const count = () => { const r = spearman(a, perm); total++; if (r !== null && r >= obs - 1e-12) hit++; };
    count();
    for (let i = 0; i < n;) {                     // Heap's algorithm: every permutation exactly once
        if (c[i] < i) { const j = i % 2 ? c[i] : 0; [perm[j], perm[i]] = [perm[i], perm[j]]; count(); c[i]++; i = 0; }
        else { c[i] = 0; i++; }
    }
    return { rho: obs, p: hit / total, total };
}

/** Per scene: its frames, its mean lap and mean advantage, and its within-scene rho (null if lap has no spread). */
export function sceneSummary(rows, d) {
    const fr = rows.map(frameRow);
    const lap = fr.map((f) => f.lap), adv = fr.map((f) => f.adv);
    const m = lap.reduce((s, v) => s + v, 0) / lap.length;
    const sd = Math.sqrt(lap.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, lap.length - 1));
    const cv = m !== 0 ? sd / Math.abs(m) : 0;
    return { n: fr.length, lap: m, adv: adv.reduce((s, v) => s + v, 0) / adv.length, cv,
             rho: cv >= d.cvFloor ? spearman(lap, adv) : null, wins: adv.filter((x) => x > 0).length };
}

/**
 * One speed cell. (a) ACROSS scenes: rho between scene-mean lap and scene-mean advantage, exact permutation p.
 * (b) WITHIN scenes: each usable scene's rho over its frames, tested by paired t AND exact sign that rho > 0.
 */
export function h7Cell(per, d) {
    if (d.minFolds !== minFoldsFor(d.alpha)) throw new Error(`frameGate.h7Cell: minFolds ${d.minFolds} is not what alpha ${d.alpha} derives`);
    const across = spearmanExactP(d.scenes.map((s) => per[s].lap), d.scenes.map((s) => per[s].adv));
    const aCleared = across.rho !== null && across.rho > 0 && across.p < d.alpha;
    const usable = d.scenes.filter((s) => per[s].rho !== null), excluded = d.scenes.filter((s) => per[s].rho === null);
    let b = { usable, excluded, reportable: usable.length >= d.minFolds, cleared: false };
    if (b.reportable) { const t = pairedBoth(usable.map((s) => per[s].rho), d.alpha); b = { ...b, rhos: usable.map((s) => per[s].rho), test: t, cleared: t.cleared && t.t.mean > 0 }; }
    return { across: { ...across, cleared: aCleared }, within: b };
}

/** H7: both clauses at every declared speed -- an intersection-union test. */
export function h7(perBySpeed, d) {
    const missing = d.speeds.filter((sp) => !perBySpeed[sp]);
    if (missing.length) throw new Error(`frameGate.h7: no data for declared speed x${missing.join(", x")}`);
    const cells = Object.fromEntries(d.speeds.map((sp) => [sp, h7Cell(perBySpeed[sp], d)]));
    const a = d.speeds.every((sp) => cells[sp].across.cleared);
    const b = d.speeds.every((sp) => cells[sp].within.reportable && cells[sp].within.cleared);
    return { cells, across: a, within: b, supported: a && b,
             reading: a && b ? "both" : a ? "across only" : b ? "within only" : "neither" };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const d = declared(readDoc(PREREG_H7), FRAME_KEYS);
    const { harvest } = await import("./genGateTrain.mjs");
    const cache = {};
    for (const sp of d.speeds) { cache[sp] = {}; for (const s of d.scenes) cache[sp][s] = await harvest({ scenes: [s], upto: d.upto, speed: sp }); }
    fs.writeFileSync(path.join(ENG, CACHE_H7), zlib.gzipSync(JSON.stringify(cache), { level: 9 }));
    const per = Object.fromEntries(d.speeds.map((sp) => [sp, Object.fromEntries(d.scenes.map((s) => [s, sceneSummary(cache[sp][s], d)]))]));
    const out = { declared: d, per, h7: h7(per, d) };
    fs.writeFileSync(path.join(ENG, RESULT_H7), JSON.stringify(out, null, 1) + "\n");
    console.log(JSON.stringify({ h7: out.h7.reading }));
}
