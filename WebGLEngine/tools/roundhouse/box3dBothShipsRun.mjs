// WebGLEngine/tools/roundhouse/box3dBothShipsRun.mjs -- UNNUMBERED
//
// THE COMMAND for tools/roundhouse/box3dBothShips.mjs (the library the gate holds): the fights with both ships on box3d, as
// physics/mechanics/BOX3D_BOTH_SHIPS_WIP.md registers the round.
//
//     node tools/roundhouse/box3dBothShipsRun.mjs [--results <file>]   # the registered round: writes physics/mechanics/box3dBothShipsResults.json
//                                                                      # (never overwrites it), then prints where it is
//
// *** THE RESULTS ARE NOT PRINTED. *** The registration commits the results file byte for byte before anyone reads it. Nothing else
// is written. NO EXPORTS ON PURPOSE.
"use strict";
import fs from "node:fs";
import { run, serialize, refuseExisting, DEFAULT_RESULTS } from "./box3dBothShips.mjs";

const argv = process.argv.slice(2);
let results = DEFAULT_RESULTS;
for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--results" && argv[i + 1]) { results = argv[++i]; continue; }
    console.error(`box3dBothShipsRun: unknown option ${JSON.stringify(argv[i])} (known: --results <file>)`); process.exit(2);
}
const refused = refuseExisting(results); if (refused) { console.error("box3dBothShipsRun: " + refused); process.exit(2); }
const result = await run();
fs.writeFileSync(results, serialize(result));
console.log(`wrote ${results} -- commit it before reading it`);
process.exitCode = 0;
