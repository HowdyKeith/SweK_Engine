#!/usr/bin/env node
// WebGLEngine/tools/ship/frameHoled.mjs -- v4709: H9, which render/frame-holed-preregistration.md declares.
//
// *** A REPLICATION, NOT A NEW IDEA. *** v4708's x8 cell cleared its declared test and was not promoted, because H8 was
// declared as two speeds and one could not answer. Its secondary S27 said what the cell was made of: a few frames per
// scene carry any hole at all, and those frames lose far more. H9 asks exactly that -- holed frames against clean ones --
// at x8 again, on frames re-rendered at upscale 1.5x and 3x, which no measurement has read.
// NOT RUN in the round that commits it.
"use strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath, pathToFileURL } from "node:url";
import { declared, readDoc, minFoldsFor } from "./foldStats.mjs";
import { pairedBoth } from "./pairedStats.mjs";
import { holeRow } from "./frameHoles.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const PREREG_H9 = "render/frame-holed-preregistration.md";
export const CACHE_H9 = "tools/ship/frameHoled-cache.json.gz";
export const RESULT_H9 = "tools/ship/frameHoled-result.json";
export const HOLED_KEYS = Object.freeze({ scenes: "list", speed: "str", ratios: "list", alpha: "num", minFolds: "int", upto: "int", minGroup: "int" });

/**
 * Per scene: frames with ANY hole against frames with none. "Any" is exactly nonzero -- no threshold to choose. The
 * contrast is clean-minus-holed mean advantage, so a positive number is the hypothesis. A scene with fewer than
 * minGroup frames on either side has no contrast.
 */
export function holedContrast(rows, d) {
    const fr = rows.map(holeRow), holed = fr.filter((f) => f.holes > 0).map((f) => f.adv), clean = fr.filter((f) => f.holes === 0).map((f) => f.adv);
    const m = (a) => a.reduce((s, v) => s + v, 0) / a.length;
    const ok = holed.length >= d.minGroup && clean.length >= d.minGroup;
    return { n: fr.length, nHoled: holed.length, nClean: clean.length,
             holedAdv: holed.length ? m(holed) : null, cleanAdv: clean.length ? m(clean) : null,
             contrast: ok ? m(clean) - m(holed) : null };
}

/** One ratio: over usable scenes, contrast > 0 by paired t AND exact sign, positive mean. */
export function h9Cell(per, d) {
    if (d.minFolds !== minFoldsFor(d.alpha)) throw new Error(`frameHoled.h9Cell: minFolds ${d.minFolds} is not what alpha ${d.alpha} derives`);
    const usable = d.scenes.filter((s) => per[s].contrast !== null), excluded = d.scenes.filter((s) => per[s].contrast === null);
    if (usable.length < d.minFolds) return { usable, excluded, reportable: false, cleared: false,
        why: `${usable.length} usable scenes; the sign test cannot reach ${d.alpha} below ${d.minFolds}` };
    const test = pairedBoth(usable.map((s) => per[s].contrast), d.alpha);
    return { usable, excluded, reportable: true, test, cleared: test.cleared && test.t.mean > 0 };
}

/** H9: every declared ratio clears. */
export function h9(perByRatio, d) {
    const missing = d.ratios.filter((r) => !perByRatio[r]);
    if (missing.length) throw new Error(`frameHoled.h9: no data for declared ratio ${missing.join(", ")}`);
    const cells = Object.fromEntries(d.ratios.map((r) => [r, h9Cell(perByRatio[r], d)]));
    const reportable = d.ratios.every((r) => cells[r].reportable);
    return { cells, reportable, supported: reportable && d.ratios.every((r) => cells[r].cleared) };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const d = declared(readDoc(PREREG_H9), HOLED_KEYS);
    const { harvest } = await import("./genGateTrain.mjs");
    const cache = {};
    for (const r of d.ratios) { cache[r] = {}; for (const s of d.scenes) cache[r][s] = await harvest({ scenes: [s], upto: d.upto, speed: d.speed, settings: { ratio: r } }); }
    fs.writeFileSync(path.join(ENG, CACHE_H9), zlib.gzipSync(JSON.stringify(cache), { level: 9 }));
    const per = Object.fromEntries(d.ratios.map((r) => [r, Object.fromEntries(d.scenes.map((s) => [s, holedContrast(cache[r][s], d)]))]));
    const out = { declared: d, per, h9: h9(per, d) };
    fs.writeFileSync(path.join(ENG, RESULT_H9), JSON.stringify(out, null, 1) + "\n");
    console.log(JSON.stringify({ h9: out.h9.reportable ? out.h9.supported : "not reportable" }));
}
