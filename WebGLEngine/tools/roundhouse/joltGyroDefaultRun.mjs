// WebGLEngine/tools/roundhouse/joltGyroDefaultRun.mjs -- UNNUMBERED
//
// THE COMMAND for tools/roundhouse/joltGyroDefault.mjs (the library the gate holds): Jolt's gyroscopic force on by
// default, as physics/mechanics/SPINNING_BODY_WIP.md registers its second round.
//
//     node tools/roundhouse/joltGyroDefaultRun.mjs [--results <file>]   # the registered round: writes physics/mechanics/joltGyroDefaultResults.json
//                                                                        # (never overwrites it) and prints only where it is
//
// *** THE RESULTS ARE NOT PRINTED. *** The registration commits the results file byte for byte before anyone reads it.
// Nothing else is written. NO EXPORTS ON PURPOSE.
"use strict";
import fs from "node:fs";
import { run, serialize, refuseExisting, DEFAULT_RESULTS } from "./joltGyroDefault.mjs";

const argv = process.argv.slice(2);
let results = DEFAULT_RESULTS;
for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--results" && argv[i + 1]) { results = argv[++i]; continue; }
    console.error(`joltGyroDefaultRun: unknown option ${JSON.stringify(argv[i])} (known: --results <file>)`); process.exit(2);
}
const refused = refuseExisting(results); if (refused) { console.error("joltGyroDefaultRun: " + refused); process.exit(2); }
const result = await run();
fs.writeFileSync(results, serialize(result));
console.log(`wrote ${results}${result.stopped ? " (stopped: " + result.stopped + ")" : ""} -- commit it before reading it`);
// process.exitCode, not process.exit: Jolt compiled a wasm module, and exiting while V8's background compiler still has
// work posts a task into a torn-down platform (tools/ship/wasmTeardown.mjs).
process.exitCode = 0;
