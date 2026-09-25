#!/usr/bin/env node
// WebGLEngine/tools/ship/frameGain.mjs -- v4714: H11, which render/frame-gain-preregistration.md declares.
//
// *** H6's SCORE, ASKED OF THE FRAME. *** v4702 scored each block by how much the chain's best motion candidate
// lowers the prev-to-cur matching error below standing still, and v4703 found it ranked the per-block decision
// BACKWARDS. A frame generator decides per FRAME, and the frame was never asked. The frame's score sums the SADs over
// its blocks and then takes H6's ratio, so a flat block -- every SAD at eps, 63-68% of edges's blocks -- weighs
// nothing, where H6's mean of block scores counted it as a 0. The direction and eps are H6's, imported.
// NOT RUN on a declared cell in the round that commits it.
"use strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath, pathToFileURL } from "node:url";
import { FEATURE_NAMES, N_FEATURES } from "../../render/genGate.mjs";
import { declared, readDoc, minFoldsFor } from "./foldStats.mjs";
import { pairedBoth } from "./pairedStats.mjs";
import { EPS, ruleScore } from "./genGateRule.mjs";
import { spearman } from "./frameGate.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const PREREG_H11 = "render/frame-gain-preregistration.md";
export const CACHE_H11 = "tools/ship/frameGain-cache.json.gz";
export const RESULT_H11 = "tools/ship/frameGain-result.json";
export const GAIN_KEYS = Object.freeze({ scenes: "list", cells: "list", alpha: "num", minFolds: "int", upto: "int", cvFloor: "num" });
// Found by NAME, so a reordering of genGate's features cannot point this at other columns.
export const SAD_COLS = Object.freeze({ app: FEATURE_NAMES.indexOf("sadApp"), flow: FEATURE_NAMES.indexOf("sadFlow"), still: FEATURE_NAMES.indexOf("sadStill") });

/** "4/z/2" -> { speed: "4", slabdir: "z", ratio: "2" }. Refuses anything else. */
export function cellOf(s) {
    const m = /^(\d+)\/([xz])\/([\d.]+)$/.exec(s);
    if (!m) throw new Error(`frameGain.cellOf: "${s}" is not speed/slabdir/ratio`);
    return Object.freeze({ speed: m[1], slabdir: m[2], ratio: m[3] });
}

/** One harvested frame -> { frame, gain, blockMean, adv }. Refuses a row with no finite dB. */
export function gainRow(row) {
    if (!Number.isFinite(row.genDb) || !Number.isFinite(row.cfDb))
        throw new Error(`frameGain.gainRow: frame ${row.frame} carries no finite genDb/cfDb`);
    if (Object.values(SAD_COLS).some((c) => c < 0)) throw new Error("frameGain.gainRow: genGate no longer names all three SADs");
    const nb = row.y.length;
    let still = 0, best = 0, block = 0;
    for (let b = 0; b < nb; b++) {
        const o = b * N_FEATURES, a = row.x[o + SAD_COLS.app], f = row.x[o + SAD_COLS.flow], s = row.x[o + SAD_COLS.still];
        still += s; best += Math.min(a, f); block += ruleScore(a, f, s);
    }
    return { frame: row.frame, gain: Math.log((still + EPS) / (best + EPS)), blockMean: block / nb, adv: row.genDb - row.cfDb };
}

/** Per scene: mean gain and advantage, the gain's spread, and its within-scene rho (null below the floor). S37 beside it. */
export function gainSummary(rows, d) {
    const fr = rows.map(gainRow), g = fr.map((f) => f.gain), adv = fr.map((f) => f.adv);
    const m = g.reduce((s, v) => s + v, 0) / g.length;
    const sd = Math.sqrt(g.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, g.length - 1));
    const cv = m !== 0 ? sd / Math.abs(m) : 0;
    return { n: fr.length, gain: m, adv: adv.reduce((s, v) => s + v, 0) / adv.length, cv,
             rho: cv >= d.cvFloor ? spearman(g, adv) : null, wins: adv.filter((x) => x > 0).length,
             blockRho: spearman(fr.map((f) => f.blockMean), adv) };
}

/** One cell: the usable scenes' rhos, one-sided paired t AND exact sign. */
export function h11Cell(per, d) {
    if (d.minFolds !== minFoldsFor(d.alpha)) throw new Error(`frameGain.h11Cell: minFolds ${d.minFolds} is not what alpha ${d.alpha} derives`);
    const usable = d.scenes.filter((s) => per[s].rho !== null), excluded = d.scenes.filter((s) => per[s].rho === null);
    if (usable.length < d.minFolds) return { usable, excluded, reportable: false, cleared: false,
        why: `${usable.length} usable scenes; the sign test cannot reach ${d.alpha} below ${d.minFolds}` };
    const rhos = usable.map((s) => per[s].rho), test = pairedBoth(rhos, d.alpha);
    return { usable, excluded, reportable: true, rhos, test, cleared: test.cleared && test.t.mean > 0 };
}

/** H11: every declared cell clears -- an intersection-union test. */
export function h11(perByCell, d) {
    const missing = d.cells.filter((c) => !perByCell[c]);
    if (missing.length) throw new Error(`frameGain.h11: no data for declared cell ${missing.join(", ")}`);
    const cells = Object.fromEntries(d.cells.map((c) => [c, h11Cell(perByCell[c], d)]));
    const reportable = d.cells.every((c) => cells[c].reportable);
    return { cells, reportable, supported: reportable && d.cells.every((c) => cells[c].cleared) };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const d = declared(readDoc(PREREG_H11), GAIN_KEYS);
    const { harvest } = await import("./genGateTrain.mjs");
    const cache = {};
    for (const c of d.cells) { const k = cellOf(c); cache[c] = {};
        for (const s of d.scenes) cache[c][s] = await harvest({ scenes: [s], upto: d.upto, speed: k.speed, settings: { slabdir: k.slabdir, ratio: k.ratio } }); }
    fs.writeFileSync(path.join(ENG, CACHE_H11), zlib.gzipSync(JSON.stringify(cache), { level: 9 }));
    const per = Object.fromEntries(d.cells.map((c) => [c, Object.fromEntries(d.scenes.map((s) => [s, gainSummary(cache[c][s], d)]))]));
    const out = { declared: d, per, h11: h11(per, d) };
    fs.writeFileSync(path.join(ENG, RESULT_H11), JSON.stringify(out, null, 1) + "\n");
    console.log(JSON.stringify({ h11: out.h11.reportable ? out.h11.supported : "not reportable" }));
}
