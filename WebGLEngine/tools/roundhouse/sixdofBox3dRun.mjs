// WebGLEngine/tools/roundhouse/sixdofBox3dRun.mjs -- UNNUMBERED
//
// THE COMMAND for tools/roundhouse/sixdofBox3d.mjs (the library the gate holds): the 6-DOF ships on box3d, as
// physics/mechanics/SIXDOF_BOX3D_WIP.md registers the round.
//
//     node tools/roundhouse/sixdofBox3dRun.mjs [--results <file>]   # the registered round: writes physics/mechanics/sixdofBox3dResults.json
//                                                                   # (never overwrites it), then prints where it is and B3's step time
//
// *** THE RESULTS ARE NOT PRINTED. *** The registration commits the results file byte for byte before anyone reads it. B3's step time is
// printed because the registration reports it outside the file, testing nothing. Nothing else is written. NO EXPORTS ON PURPOSE.
"use strict";
import fs from "node:fs";
import * as RB from "../../physics/mechanics/rigidBody6dof.mjs";
import { run, serialize, refuseExisting, DEFAULT_RESULTS, box3dReady, withStepper, shipI, SHIP } from "./sixdofBox3d.mjs";

const argv = process.argv.slice(2);
let results = DEFAULT_RESULTS;
for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--results" && argv[i + 1]) { results = argv[++i]; continue; }
    console.error(`sixdofBox3dRun: unknown option ${JSON.stringify(argv[i])} (known: --results <file>)`); process.exit(2);
}
const refused = refuseExisting(results); if (refused) { console.error("sixdofBox3dRun: " + refused); process.exit(2); }
const result = await run();
fs.writeFileSync(results, serialize(result));
console.log(`wrote ${results} -- commit it before reading it`);
// B3's step time, reported outside the file: 20,000 ticks of a thrusting, tumbling ship
const b3 = await box3dReady(), acc = { force: [16, 0, 0], torque: [0.2, -0.1, 0.3] }, t0 = process.hrtime.bigint();
withStepper(b3, (st) => { let s = RB.createBody({ mass: SHIP.mass, I: shipI(), w: [0.3, 0.2, 0.1] }); for (let k = 0; k < 20000; k++) s = st.step(s, acc, 1 / 30); });
console.log(`  B3: ${(Number(process.hrtime.bigint() - t0) / 1e3 / 20000).toFixed(2)} microseconds a step`);
process.exitCode = 0;
