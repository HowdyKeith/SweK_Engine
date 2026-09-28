#!/usr/bin/env node
// WebGLEngine/tools/ship/frameDisagree.mjs -- v4722: H16, which render/frame-disagree-preregistration.md declares.
//
// *** A SIGNAL ABOUT WHETHER THE CHAIN'S MOTION IS TRUSTWORTHY, NOT ABOUT THE PICTURE. *** The frame's fraction of blocks where
// the colour flow beat the application's own vector on merit -- the column named by the document and found by name. Its
// direction is fixed by the physics: the application's vector is the geometry's motion, so a colour match that beats it is
// usually a false one, and a frame warped along false vectors should be worse. The path, the turn exclusion and the one-cell
// test are H14's and H12's, imported; the qualifier that it is not H11's gain measured again is new.
// NOT RUN on a declared cell in the round that commits it.
"use strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath, pathToFileURL } from "node:url";
import { FEATURE_NAMES, N_FEATURES } from "../../render/genGate.mjs";
import { declared, readDoc } from "./foldStats.mjs";
import { spearman } from "./frameGate.mjs";
import { cellOf, gainRow } from "./frameGain.mjs";
import { partialSpearman, reverseCell } from "./frameReverse.mjs";
import { nonTurnRows } from "./frameSway.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const PREREG_H16 = "render/frame-disagree-preregistration.md";
export const CACHE_H16 = "tools/ship/frameDisagree-cache.json.gz";
export const RESULT_H16 = "tools/ship/frameDisagree-result.json";
export const DIS_KEYS = Object.freeze({ scenes: "list", cells: "list", path: "str", signal: "str", direction: "int", distinctMax: "num",
                                        alpha: "num", minFolds: "int", upto: "int", cvFloor: "num" });

/** The column the document names, found by name -- a feature genGate does not have is refused. */
export function signalCol(name) {
    const i = FEATURE_NAMES.indexOf(name);
    if (i < 0) throw new Error(`frameDisagree.signalCol: genGate has no feature "${name}"`);
    return i;
}

/** One frame's signal: the mean of the named per-block column over the frame's blocks. */
export function frameSignal(row, col) {
    const nb = row.y.length;
    let s = 0;
    for (let b = 0; b < nb; b++) s += row.x[b * N_FEATURES + col];
    return s / nb;
}

/** Per scene, over the non-turn frames: the signal's spread, its rho with the advantage, with H11's gain, and the partial. */
export function disagreeSummary(rows, d, cell) {
    const col = signalCol(d.signal), kept = nonTurnRows(rows, cellOf(cell).speed, d.path);
    const sig = kept.map((r) => frameSignal(r, col)), adv = kept.map((r) => r.genDb - r.cfDb), gain = kept.map((r) => gainRow(r).gain), t = kept.map((r) => r.frame);
    const m = sig.reduce((a, v) => a + v, 0) / sig.length;
    const sd = Math.sqrt(sig.reduce((a, v) => a + (v - m) ** 2, 0) / Math.max(1, sig.length - 1));
    const cv = m !== 0 ? sd / Math.abs(m) : 0, spread = cv >= d.cvFloor;
    return { n: kept.length, turns: rows.length - kept.length, signal: m, cv, adv: adv.reduce((a, v) => a + v, 0) / adv.length,
             rho: spread ? spearman(sig, adv) : null, withGain: spread ? spearman(sig, gain) : null,
             partial: spread ? partialSpearman(sig, adv, t) : null };
}

/**
 * H16: H12's one-cell test on `rho` in every declared cell (intersection-union), AND the qualifier -- the mean |rho| between
 * the signal and the gain over the usable scene-cells must not exceed distinctMax, or H16 is gain measured again.
 */
export function h16(perByCell, d) {
    const missing = d.cells.filter((c) => !perByCell[c]);
    if (missing.length) throw new Error(`frameDisagree.h16: no data for declared cell ${missing.join(", ")}`);
    const cells = Object.fromEntries(d.cells.map((c) => [c, reverseCell(perByCell[c], d, "rho")]));
    const reportable = d.cells.every((c) => cells[c].reportable);
    const wg = d.cells.flatMap((c) => d.scenes.map((s) => perByCell[c][s].withGain)).filter((v) => v !== null);
    const meanAbsWithGain = wg.length ? wg.reduce((a, v) => a + Math.abs(v), 0) / wg.length : null;
    const distinct = meanAbsWithGain !== null && meanAbsWithGain <= d.distinctMax;
    const clears = reportable && d.cells.every((c) => cells[c].cleared);
    return { cells, reportable, clears, meanAbsWithGain, distinct, supported: clears && distinct };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const d = declared(readDoc(PREREG_H16), DIS_KEYS);
    signalCol(d.signal);
    const { harvest } = await import("./genGateTrain.mjs");
    const cache = {};
    for (const c of d.cells) { const k = cellOf(c); cache[c] = {};
        for (const s of d.scenes) cache[c][s] = await harvest({ scenes: [s], upto: d.upto, speed: k.speed, settings: { slabdir: k.slabdir, ratio: k.ratio, slabpath: d.path } }); }
    fs.writeFileSync(path.join(ENG, CACHE_H16), zlib.gzipSync(JSON.stringify(cache), { level: 9 }));
    const per = Object.fromEntries(d.cells.map((c) => [c, Object.fromEntries(d.scenes.map((s) => [s, disagreeSummary(cache[c][s], d, c)]))]));
    const out = { declared: d, per, h16: h16(per, d) };
    fs.writeFileSync(path.join(ENG, RESULT_H16), JSON.stringify(out, null, 1) + "\n");
    console.log(JSON.stringify({ h16: out.h16.reportable ? out.h16.supported : "not reportable", distinct: out.h16.distinct }));
}
