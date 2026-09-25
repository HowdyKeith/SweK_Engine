#!/usr/bin/env node
// WebGLEngine/tools/ship/frameSway.mjs -- v4718: H14, which render/frame-sway-preregistration.md declares.
//
// *** H12's QUESTION WITH THE WINDOW'S CLOCK REMOVED BY DESIGN, NOT BY A PARTIAL. *** On the linear path the slab leaves
// the view within the harvest, so H11-H13 compared frames with the slab against frames without it, in window order. On
// `sway` the slab reverses and stays whole in view; frames whose interval holds a turn are excluded, from the path alone.
// The per-scene summary and the one-cell test are H12's, imported. NOT RUN on a declared cell in the round that commits it.
"use strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath, pathToFileURL } from "node:url";
import { FEATURE_NAMES, N_FEATURES } from "../../render/genGate.mjs";
import { turnsBetween, SLAB_PATHS } from "../../render/slabPath.mjs";
import { declared, readDoc } from "./foldStats.mjs";
import { cellOf } from "./frameGain.mjs";
import { reverseSummary, reverseCell } from "./frameReverse.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const PREREG_H14 = "render/frame-sway-preregistration.md";
export const CACHE_H14 = "tools/ship/frameSway-cache.json.gz";
export const RESULT_H14 = "tools/ship/frameSway-result.json";
export const SWAY_KEYS = Object.freeze({ scenes: "list", cells: "list", path: "str", direction: "int", alpha: "num", minFolds: "int", upto: "int", cvFloor: "num" });
// The page's two planes sit at depths 0.952 (slab) and 0.977 (background); a block nearer than their midpoint is slab.
export const DEPTH_COL = FEATURE_NAMES.indexOf("depth"), SLAB_DEPTH_CUT = 0.9645;

/** How many of a frame's blocks are slab. */
export function slabBlocks(row) {
    let n = 0;
    for (let b = 0; b < row.y.length; b++) if (row.x[b * N_FEATURES + DEPTH_COL] < SLAB_DEPTH_CUT) n++;
    return n;
}

/** The frames whose interval (frame - 1, frame] holds no turn of the declared path -- from the path, never from the data. */
export function nonTurnRows(rows, speed, pathName) {
    if (!SLAB_PATHS.includes(pathName)) throw new Error(`frameSway.nonTurnRows: unknown path "${pathName}"`);
    return rows.filter((r) => turnsBetween(r.frame - 1, r.frame, Number(speed), pathName).length === 0);
}

/** Per scene: H12's summary on the non-turn frames, plus how many the turns took. */
export function swaySummary(rows, d, cell) {
    const kept = nonTurnRows(rows, cellOf(cell).speed, d.path);
    return { ...reverseSummary(kept, d), turns: rows.length - kept.length };
}

/** H14: H12's one-cell test on `rho`, in every declared cell -- intersection-union. */
export function h14(perByCell, d) {
    const missing = d.cells.filter((c) => !perByCell[c]);
    if (missing.length) throw new Error(`frameSway.h14: no data for declared cell ${missing.join(", ")}`);
    const cells = Object.fromEntries(d.cells.map((c) => [c, reverseCell(perByCell[c], d, "rho")]));
    const reportable = d.cells.every((c) => cells[c].reportable);
    return { cells, reportable, supported: reportable && d.cells.every((c) => cells[c].cleared) };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const d = declared(readDoc(PREREG_H14), SWAY_KEYS);
    const { harvest } = await import("./genGateTrain.mjs");
    const cache = {};
    for (const c of d.cells) { const k = cellOf(c); cache[c] = {};
        for (const s of d.scenes) cache[c][s] = await harvest({ scenes: [s], upto: d.upto, speed: k.speed, settings: { slabdir: k.slabdir, ratio: k.ratio, slabpath: d.path } }); }
    fs.writeFileSync(path.join(ENG, CACHE_H14), zlib.gzipSync(JSON.stringify(cache), { level: 9 }));
    const per = Object.fromEntries(d.cells.map((c) => [c, Object.fromEntries(d.scenes.map((s) => [s, swaySummary(cache[c][s], d, c)]))]));
    const out = { declared: d, per, h14: h14(per, d) };
    fs.writeFileSync(path.join(ENG, RESULT_H14), JSON.stringify(out, null, 1) + "\n");
    console.log(JSON.stringify({ h14: out.h14.reportable ? out.h14.supported : "not reportable" }));
}
