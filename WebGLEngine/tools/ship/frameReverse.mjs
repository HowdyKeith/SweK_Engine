#!/usr/bin/env node
// WebGLEngine/tools/ship/frameReverse.mjs -- v4716: H12 and H13, which render/frame-reverse-preregistration.md declares.
//
// *** H11's NEGATION, ON CELLS IT HAS NOT SEEN, AND THE SAME QUESTION WITH THE CLOCK TAKEN OUT. *** H11 found 12 of 14
// scene-cells ranking backwards at x4. v4703's rule is that a negation owes its own document and fresh data, so this
// asks it at x2 on both geometries (H12), and again after the frame's position in the window is partialled out (H13),
// because v4705 named a window in which the slab leaves the view and motion and advantage move together with time.
// The gain is H11's function, imported. NOT RUN on a declared cell in the round that commits it.
"use strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath, pathToFileURL } from "node:url";
import { declared, readDoc, minFoldsFor } from "./foldStats.mjs";
import { pairedBoth } from "./pairedStats.mjs";
import { spearman } from "./frameGate.mjs";
import { cellOf, gainRow } from "./frameGain.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const PREREG_H12 = "render/frame-reverse-preregistration.md";
export const CACHE_H12 = "tools/ship/frameReverse-cache.json.gz";
export const RESULT_H12 = "tools/ship/frameReverse-result.json";
export const REV_KEYS = Object.freeze({ scenes: "list", cells: "list", direction: "int", alpha: "num", minFolds: "int", upto: "int", cvFloor: "num" });

/** Partial Spearman of x and y given z, from the three midrank rhos. Null when z ranks x or y perfectly, or a rho is null. */
export function partialSpearman(x, y, z) {
    const rxy = spearman(x, y), rxz = spearman(x, z), ryz = spearman(y, z);
    if (rxy === null || rxz === null || ryz === null) return null;
    const den = (1 - rxz * rxz) * (1 - ryz * ryz);
    return den > 1e-12 ? (rxy - rxz * ryz) / Math.sqrt(den) : null;
}

/** Per scene: the raw rho (H12), the partial given frame index (H13), and how strongly each variable follows the clock. */
export function reverseSummary(rows, d) {
    const fr = rows.map(gainRow), g = fr.map((f) => f.gain), adv = fr.map((f) => f.adv), t = fr.map((f) => f.frame);
    const m = g.reduce((s, v) => s + v, 0) / g.length;
    const sd = Math.sqrt(g.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, g.length - 1));
    const cv = m !== 0 ? sd / Math.abs(m) : 0, spread = cv >= d.cvFloor;
    return { n: fr.length, gain: m, adv: adv.reduce((s, v) => s + v, 0) / adv.length, cv,
             rho: spread ? spearman(g, adv) : null, partial: spread ? partialSpearman(g, adv, t) : null,
             rGainClock: spearman(g, t), rAdvClock: spearman(adv, t), wins: adv.filter((x) => x > 0).length };
}

/** One cell, one hypothesis: the usable scenes' `key` values times `direction`, one-sided paired t AND exact sign. */
export function reverseCell(per, d, key) {
    if (d.minFolds !== minFoldsFor(d.alpha)) throw new Error(`frameReverse.reverseCell: minFolds ${d.minFolds} is not what alpha ${d.alpha} derives`);
    if (d.direction !== 1 && d.direction !== -1) throw new Error(`frameReverse.reverseCell: direction must be 1 or -1 -- got ${d.direction}`);
    const usable = d.scenes.filter((s) => per[s][key] !== null), excluded = d.scenes.filter((s) => per[s][key] === null);
    if (usable.length < d.minFolds) return { usable, excluded, reportable: false, cleared: false,
        why: `${usable.length} usable scenes; the sign test cannot reach ${d.alpha} below ${d.minFolds}` };
    const vals = usable.map((s) => per[s][key]), test = pairedBoth(vals.map((v) => d.direction * v), d.alpha);
    return { usable, excluded, reportable: true, vals, test, cleared: test.cleared && test.t.mean > 0 };
}

/** H12 on `rho` and H13 on `partial`, each needing every declared cell -- intersection-union. */
export function reverse(perByCell, d) {
    const missing = d.cells.filter((c) => !perByCell[c]);
    if (missing.length) throw new Error(`frameReverse.reverse: no data for declared cell ${missing.join(", ")}`);
    const one = (key) => { const cells = Object.fromEntries(d.cells.map((c) => [c, reverseCell(perByCell[c], d, key)]));
        const reportable = d.cells.every((c) => cells[c].reportable);
        return { cells, reportable, supported: reportable && d.cells.every((c) => cells[c].cleared) }; };
    return { h12: one("rho"), h13: one("partial") };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const d = declared(readDoc(PREREG_H12), REV_KEYS);
    const { harvest } = await import("./genGateTrain.mjs");
    const cache = {};
    for (const c of d.cells) { const k = cellOf(c); cache[c] = {};
        for (const s of d.scenes) cache[c][s] = await harvest({ scenes: [s], upto: d.upto, speed: k.speed, settings: { slabdir: k.slabdir, ratio: k.ratio } }); }
    fs.writeFileSync(path.join(ENG, CACHE_H12), zlib.gzipSync(JSON.stringify(cache), { level: 9 }));
    const per = Object.fromEntries(d.cells.map((c) => [c, Object.fromEntries(d.scenes.map((s) => [s, reverseSummary(cache[c][s], d)]))]));
    const out = { declared: d, per, ...reverse(per, d) };
    fs.writeFileSync(path.join(ENG, RESULT_H12), JSON.stringify(out, null, 1) + "\n");
    console.log(JSON.stringify({ h12: out.h12.reportable ? out.h12.supported : "not reportable", h13: out.h13.reportable ? out.h13.supported : "not reportable" }));
}
