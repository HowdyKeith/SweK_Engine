#!/usr/bin/env node
// WebGLEngine/tools/ship/frameVertical.mjs -- v4711: H10, which render/frame-vertical-preregistration.md declares.
//
// *** H9's QUESTION ON GEOMETRY NOBODY HAS HARVESTED. *** Across the three cells the holed-frame contrast has been read at,
// holed frames lost to clean ones in 20 of 21 scene-cells -- but all three shared ONE occlusion geometry: the slab
// moving along x, with the dolly. v4711 gave the page a slab that moves VERTICALLY, across the dolly, which disoccludes
// its horizontal edges instead. H10 asks H9's exact question there, with H9's exact statistic -- imported, not copied.
// NOT RUN in the round that commits it.
"use strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath, pathToFileURL } from "node:url";
import { declared, readDoc } from "./foldStats.mjs";
import { holedContrast, h9Cell } from "./frameHoled.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const PREREG_H10 = "render/frame-vertical-preregistration.md";
export const CACHE_H10 = "tools/ship/frameVertical-cache.json.gz";
export const RESULT_H10 = "tools/ship/frameVertical-result.json";
export const VERT_KEYS = Object.freeze({ scenes: "list", speed: "str", slabdir: "str", alpha: "num", minFolds: "int", upto: "int", minGroup: "int" });

/** H10 is ONE cell: supported only if it is reportable and clears -- H9's test, applied as it stands. */
export function h10(per, d) {
    const cell = h9Cell(per, d);
    return { cell, reportable: cell.reportable, supported: cell.reportable && cell.cleared };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const d = declared(readDoc(PREREG_H10), VERT_KEYS);
    const { harvest } = await import("./genGateTrain.mjs");
    const cache = {};
    for (const s of d.scenes) cache[s] = await harvest({ scenes: [s], upto: d.upto, speed: d.speed, settings: { slabdir: d.slabdir } });
    fs.writeFileSync(path.join(ENG, CACHE_H10), zlib.gzipSync(JSON.stringify(cache), { level: 9 }));
    const per = Object.fromEntries(d.scenes.map((s) => [s, holedContrast(cache[s], d)]));
    const out = { declared: d, per, h10: h10(per, d) };
    fs.writeFileSync(path.join(ENG, RESULT_H10), JSON.stringify(out, null, 1) + "\n");
    console.log(JSON.stringify({ h10: out.h10.reportable ? out.h10.supported : "not reportable" }));
}
