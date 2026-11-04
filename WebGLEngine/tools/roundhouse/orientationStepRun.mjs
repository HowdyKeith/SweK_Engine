// WebGLEngine/tools/roundhouse/orientationStepRun.mjs -- UNNUMBERED
//
// THE COMMAND for tools/roundhouse/orientationStep.mjs (the library the gate holds): the engine's own orientation step, Q0 against Q4, as
// physics/mechanics/ORIENTATION_STEP_WIP.md registers the round.
//
//     node tools/roundhouse/orientationStepRun.mjs [--results <file>]   # the registered round: writes physics/mechanics/orientationStepResults.json
//                                                                       # (never overwrites it), then prints where it is and the step's time
//
// *** THE RESULTS ARE NOT PRINTED. *** The registration commits the results file byte for byte before anyone reads it. The step's time is
// printed because the registration reports it outside the file, testing nothing. Nothing else is written. NO EXPORTS ON PURPOSE.
"use strict";
import fs from "node:fs";
import * as RB from "../../physics/mechanics/rigidBody6dof.mjs";
import { run, serialize, refuseExisting, DEFAULT_RESULTS, STEP_IDS, optOf } from "./orientationStep.mjs";

const argv = process.argv.slice(2);
let results = DEFAULT_RESULTS;
for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--results" && argv[i + 1]) { results = argv[++i]; continue; }
    console.error(`orientationStepRun: unknown option ${JSON.stringify(argv[i])} (known: --results <file>)`); process.exit(2);
}
const refused = refuseExisting(results); if (refused) { console.error("orientationStepRun: " + refused); process.exit(2); }
const result = run();
fs.writeFileSync(results, serialize(result));
console.log(`wrote ${results} -- commit it before reading it`);
// the step's time, reported outside the file: 200,000 steps of a tumbling body under each step
for (const id of STEP_IDS) {
    let s = RB.createBody({ mass: 6, I: [6.5, 5, 2.5], w: [0.3, 2, 0.1] }); const acc = { force: [0, 0, 0], torque: [0.2, -0.1, 0.05] }, opt = optOf(id), t0 = process.hrtime.bigint();
    for (let k = 0; k < 200000; k++) s = RB.step(s, acc, 1 / 30, opt);
    console.log(`  ${id}: ${(Number(process.hrtime.bigint() - t0) / 1e3 / 200000).toFixed(3)} microseconds a step`);
}
process.exitCode = 0;
