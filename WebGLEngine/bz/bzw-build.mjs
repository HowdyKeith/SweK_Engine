// bz/bzw-build.mjs — bake a BZFlag world file into the JSON the engine loads.
//
//   node bz/bzw-build.mjs <map.bzw> [out.json]
//
// The mirror of es-build.mjs: parse, build, and bake the coverage report INTO the artifact, so anyone
// holding the JSON can see what the adapter did not read without re-running anything.

import fs from "fs";
import path from "path";
import { parseBZW } from "./bzwParse.js";
import { buildWorld, boundsOf } from "./bzwWorld.js";
import { coverageReport, formatCoverage } from "./bzCoverage.js";

const [, , inPath, outPath] = process.argv;
if (!inPath) {
    console.log("usage: node bz/bzw-build.mjs <map.bzw> [out.json]");
    process.exit(1);
}

const src = fs.readFileSync(inPath, "utf8");
const parsed = parseBZW(src);
const w = buildWorld(parsed);
const cov = coverageReport(parsed);
const bounds = boundsOf(w);

const out = {
    source: "bzflag",
    map: path.basename(inPath),
    world: w.world,
    obstacles: w.obstacles,
    links: w.links,
    zones: w.zones,
    options: w.options,
    waterLevel: w.waterLevel,
    bounds,
    counts: {
        obstacles: w.obstacles.length, links: w.links.length, zones: w.zones.length,
        boxes: w.obstacles.filter((o) => o.type === "box").length,
        pyramids: w.obstacles.filter((o) => o.type === "pyramid").length,
        teleporters: w.obstacles.filter((o) => o.type === "teleporter").length,
        bases: w.obstacles.filter((o) => o.type === "base").length,
    },
    coverage: cov,
    // Warnings and unfollowed includes ride along. A map with problems still loads; it says so.
    warnings: w.errors,
    includes: w.includes,
};

const dest = outPath || inPath.replace(/\.bzw$/i, "") + ".json";
fs.writeFileSync(dest, JSON.stringify(out));
console.log(formatCoverage(cov));
console.log(`world "${w.world.name || "(unnamed)"}" ${w.world.size} units across`);
console.log(`extent x[${bounds.lo[0].toFixed(1)}, ${bounds.hi[0].toFixed(1)}] `
    + `y[${bounds.lo[1].toFixed(1)}, ${bounds.hi[1].toFixed(1)}] z[${bounds.lo[2].toFixed(1)}, ${bounds.hi[2].toFixed(1)}]`);
console.log(`wrote ${dest} (${(fs.statSync(dest).size / 1024).toFixed(1)} KB)`);
