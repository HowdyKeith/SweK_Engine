#!/usr/bin/env node
// WebGLEngine/tools/ship/frameHoles.mjs -- v4707: H8, which render/frame-holes-preregistration.md declares.
//
// *** OCCLUSION IS THE TEXTBOOK WAY FRAME INTERPOLATION FAILS, AND THE CHAIN ALREADY MEASURES IT. *** `holeFrac` is the
// share of each block the splat could not cover -- pixels one frame shows and the other hides. H8 asks whether, WITHIN a
// scene, the frames with more of it are the frames where generation loses. The direction is fixed by that physics, not by
// any measurement: more holes, worse generation.
//
// *** THE CHOICE OF SIGNAL CAME AFTER v4706, SO v4706's CELLS ARE NOT USED. *** Its within-scene pattern leaned negative
// on the laplacian, and the document says so. The test is therefore on slab speeds x1 and x8, where no frame has been
// harvested with its dB. tools/ship/frameGate.mjs is imported for its statistic and left untouched, so v4706's
// measurement still re-derives byte for byte.
// NOT RUN in the round that commits it.
"use strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath, pathToFileURL } from "node:url";
import { FEATURE_NAMES, N_FEATURES } from "../../render/genGate.mjs";
import { declared, readDoc, minFoldsFor } from "./foldStats.mjs";
import { pairedBoth } from "./pairedStats.mjs";
import { FRAME_KEYS, spearman } from "./frameGate.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const PREREG_H8 = "render/frame-holes-preregistration.md";
export const CACHE_H8 = "tools/ship/frameHoles-cache.json.gz";
export const RESULT_H8 = "tools/ship/frameHoles-result.json";
// Found by NAME, as frameGate's laplacian is.
export const HOLE_COL = FEATURE_NAMES.indexOf("holeFrac");

/** One harvested frame -> { frame, holes, adv }. The same refusal as frameGate's: no frame dB, no row. */
export function holeRow(row) {
    if (!Number.isFinite(row.genDb) || !Number.isFinite(row.cfDb))
        throw new Error(`frameHoles.holeRow: frame ${row.frame} carries no finite genDb/cfDb`);
    const nb = row.y.length;
    let h = 0;
    for (let b = 0; b < nb; b++) h += row.x[b * N_FEATURES + HOLE_COL];
    return { frame: row.frame, holes: h / nb, adv: row.genDb - row.cfDb };
}

/** Per scene: mean hole fraction, mean advantage, the hole fraction's spread, and the within-scene rho. */
export function holeSummary(rows, d) {
    const fr = rows.map(holeRow), h = fr.map((f) => f.holes), adv = fr.map((f) => f.adv);
    const m = h.reduce((s, v) => s + v, 0) / h.length;
    const sd = Math.sqrt(h.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, h.length - 1));
    const cv = m > 0 ? sd / m : 0;
    return { n: fr.length, holes: m, adv: adv.reduce((s, v) => s + v, 0) / adv.length, cv,
             rho: cv >= d.cvFloor ? spearman(h, adv) : null, wins: adv.filter((x) => x > 0).length };
}

/**
 * One speed: over the usable scenes, the within-scene rhos must be NEGATIVE. Tested as d = -rho > 0 by paired t AND
 * exact sign at alpha, with a positive mean -- the sign is part of the hypothesis, so a positive relation fails it.
 */
export function h8Cell(per, d) {
    if (d.minFolds !== minFoldsFor(d.alpha)) throw new Error(`frameHoles.h8Cell: minFolds ${d.minFolds} is not what alpha ${d.alpha} derives`);
    const usable = d.scenes.filter((s) => per[s].rho !== null), excluded = d.scenes.filter((s) => per[s].rho === null);
    if (usable.length < d.minFolds) return { usable, excluded, reportable: false, cleared: false,
        why: `${usable.length} usable scenes; the sign test cannot reach ${d.alpha} below ${d.minFolds}` };
    const rhos = usable.map((s) => per[s].rho), test = pairedBoth(rhos.map((r) => -r), d.alpha);
    return { usable, excluded, reportable: true, rhos, test, cleared: test.cleared && test.t.mean > 0 };
}

/** H8: every declared speed clears -- an intersection-union test. */
export function h8(perBySpeed, d) {
    const missing = d.speeds.filter((sp) => !perBySpeed[sp]);
    if (missing.length) throw new Error(`frameHoles.h8: no data for declared speed x${missing.join(", x")}`);
    const cells = Object.fromEntries(d.speeds.map((sp) => [sp, h8Cell(perBySpeed[sp], d)]));
    const reportable = d.speeds.every((sp) => cells[sp].reportable);
    return { cells, reportable, supported: reportable && d.speeds.every((sp) => cells[sp].cleared) };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const d = declared(readDoc(PREREG_H8), FRAME_KEYS);
    const { harvest } = await import("./genGateTrain.mjs");
    const cache = {};
    for (const sp of d.speeds) { cache[sp] = {}; for (const s of d.scenes) cache[sp][s] = await harvest({ scenes: [s], upto: d.upto, speed: sp }); }
    fs.writeFileSync(path.join(ENG, CACHE_H8), zlib.gzipSync(JSON.stringify(cache), { level: 9 }));
    const per = Object.fromEntries(d.speeds.map((sp) => [sp, Object.fromEntries(d.scenes.map((s) => [s, holeSummary(cache[sp][s], d)]))]));
    const out = { declared: d, per, h8: h8(per, d) };
    fs.writeFileSync(path.join(ENG, RESULT_H8), JSON.stringify(out, null, 1) + "\n");
    console.log(JSON.stringify({ h8: out.h8.reportable ? out.h8.supported : "not reportable" }));
}
