// es-build.mjs — bake an Endless Sky data/ folder into one es-universe.json that Stellar Atlas can
// load in a single drop (no 188-file folder selection). Run with Node:
//   node es-build.mjs /path/to/endless-sky/data  ./es-universe.json
// The by-id lookup maps (systemById/shipById) are omitted here and rebuilt by the loader, to keep
// the file small. Ships no ES content itself — it reads the data files you point it at.

import { parseESFiles } from "./ev/esParse.js";
import { buildUniverseFromES } from "./ev/esData.js";
import { coverageReport, formatCoverage } from "./ev/esCoverage.js";   // v2161 — what are we NOT loading?
import fs from "fs";
import path from "path";

const DATA = process.argv[2] || "/home/claude/work/es/data";
const OUT = process.argv[3] || "./es-universe.json";

function gather(dir) {
    let out = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name.startsWith("_")) continue;            // skip _ui / _deprecated
        const p = path.join(dir, e.name);
        if (e.isDirectory()) out = out.concat(gather(p));
        else if (e.name.endsWith(".txt")) out.push(p);
    }
    return out;
}

// v2164 -- extra data dirs (plugins) may follow the output path. They are gathered AFTER the
// base so their definitions come later in the token stream, which is how ES layers plugins.
const EXTRA = process.argv.slice(4).filter((d) => d && fs.existsSync(d));
const files = gather(DATA).concat(...EXTRA.map((d) => gather(d)));
const texts = files.map((f) => fs.readFileSync(f, "utf8"));
if (EXTRA.length) console.log(`plugins: ${EXTRA.length} extra data dir(s)`);
const roots = parseESFiles(texts);
const uni = buildUniverseFromES(roots);

// v2161 -- the adapter silently ignores root node types it does not consume. Measure it,
// bake the result into the universe, and print it, so "what ES content are we missing?"
// is a number in the build log rather than an inference from reading dispatch code.
const coverage = coverageReport(roots);

// drop the by-id/by-name maps (loader rebuilds them); keep everything else
const slim = { ...uni };
delete slim.systemById;
delete slim.shipById;
delete slim.outfitByName;
delete slim.shipByName;
delete slim.govtByName;

slim.coverage = coverage;   // travels with the universe; the page can show it too

fs.writeFileSync(OUT, JSON.stringify(slim));
const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
console.log(`baked ${files.length} files -> ${OUT} (${kb} KB)`);
console.log("counts:", uni.counts);
console.log("");
console.log(formatCoverage(coverage));
