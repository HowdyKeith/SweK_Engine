// WebGLEngine/tools/roundhouse/joltScenesRun.mjs -- UNNUMBERED
//
// THE COMMAND for tools/roundhouse/joltScenes.mjs (the library the gate holds): the new gyroscopic default in the engine's
// own Jolt scenes, as physics/mechanics/SPINNING_BODY_WIP.md registers its fourth round.
//
//     node tools/roundhouse/joltScenesRun.mjs [--results <file>]   # the registered round: writes physics/mechanics/joltScenesResults.json
//                                                                   # (never overwrites it) and prints only where it is
//
// *** THE RESULTS ARE NOT PRINTED. *** The registration commits the results file byte for byte before anyone reads it.
// Nothing else is written. NO EXPORTS ON PURPOSE.
"use strict";
import fs from "node:fs";
import { run, serialize, refuseExisting, DEFAULT_RESULTS } from "./joltScenes.mjs";

const argv = process.argv.slice(2);
let results = DEFAULT_RESULTS;
for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--results" && argv[i + 1]) { results = argv[++i]; continue; }
    console.error(`joltScenesRun: unknown option ${JSON.stringify(argv[i])} (known: --results <file>)`); process.exit(2);
}
const refused = refuseExisting(results); if (refused) { console.error("joltScenesRun: " + refused); process.exit(2); }
const result = await run();
fs.writeFileSync(results, serialize(result));
console.log(`wrote ${results}${result.stopped ? " (stopped: " + result.stopped + ")" : ""} -- commit it before reading it`);
// process.exitCode, not process.exit: Jolt compiled a wasm module, and exiting while V8's background compiler still has work
// posts a task into a torn-down platform (tools/ship/wasmTeardown.mjs).
process.exitCode = 0;
