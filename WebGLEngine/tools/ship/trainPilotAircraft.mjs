// WebGLEngine/tools/ship/trainPilotAircraft.mjs -- v4839
//
// THE COMMAND for tools/ship/trainAircraftPilot.mjs (the library the gate holds): several searches, the champion picked on the held-out scenarios, the audit read once, and a file written only when that champion beats the
// PD controller on both and does not fly the page's patrol worse. Prints what it did.
//
//     node tools/ship/trainPilotAircraft.mjs                          # 4 runs x 600 iterations, report only (about half an hour)
//     node tools/ship/trainPilotAircraft.mjs --runs 2 --iters 200     # smaller
//     node tools/ship/trainPilotAircraft.mjs --write [--out <file>]   # write brain/pilotAircraftWeightsDefault.json when the champion qualifies
//
// *** NO EXPORTS ON PURPOSE (tools/ship/lagBlameWatch.mjs has none either): a command-line entry point and not a module, so the library it imports has a caller that is not a gate. Its door is the command; a button is
// refused with a reason, as trainPilot6dof.mjs's is: a half-hour search against a 180 s per-press cap, and a committed file a person reviews. ***
"use strict";
import fs from "node:fs";
import { parseArgs, run, blobOf, weightsHash } from "./trainAircraftPilot.mjs";

let opts; try { opts = parseArgs(process.argv.slice(2)); } catch (e) { console.error("trainPilotAircraft: " + e.message); process.exit(2); }
const result = run(opts, opts.quiet ? () => {} : (m) => console.log(m));
if (opts.write) {
    if (!result.verdict.ok) { console.log("not written: " + result.verdict.reasons.join("; ")); process.exit(1); }
    const blob = blobOf(result, opts); fs.writeFileSync(opts.out, JSON.stringify(blob) + "\n");
    console.log(`wrote ${opts.out}: ${blob.weightCount} weights, hash ${weightsHash(result.champion.weights)}`);
}
