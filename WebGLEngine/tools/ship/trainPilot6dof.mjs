// WebGLEngine/tools/ship/trainPilot6dof.mjs -- v4833
//
// THE COMMAND for tools/ship/train6dofPilot.mjs (the library the gate holds): several searches, the champion picked on the held-out seeds, the audit read once, and a file written only when that champion beats
// the hand pilot on both. Prints what it did.
//
//     node tools/ship/trainPilot6dof.mjs                          # 5 runs x 1500 iterations, report only (about ten minutes)
//     node tools/ship/trainPilot6dof.mjs --runs 3 --iters 800     # smaller
//     node tools/ship/trainPilot6dof.mjs --write [--out <file>]   # write brain/pilot6dofWeightsDefault.json when the champion qualifies
//
// *** NO EXPORTS ON PURPOSE (tools/ship/lagBlameWatch.mjs has none either): a command-line entry point and not a module. The library it imports is what the gate holds, so the library has a caller that is not a
// gate. Its door is the command, and a button is refused with a reason: tools/ship/doorKinds.mjs, refusedWithAReason. ***
"use strict";
import fs from "node:fs";
import { parseArgs, run, blobOf } from "./train6dofPilot.mjs";
import { weightsHash } from "../../brain/drivePolicy.mjs";

let opts; try { opts = parseArgs(process.argv.slice(2)); } catch (e) { console.error("trainPilot6dof: " + e.message); process.exit(2); }
const result = run(opts, opts.quiet ? () => {} : (m) => console.log(m));
if (opts.write) {
    if (!result.verdict.ok) { console.log("not written: " + result.verdict.reasons.join("; ")); process.exit(1); }
    const blob = blobOf(result, opts); fs.writeFileSync(opts.out, JSON.stringify(blob) + "\n");
    console.log(`wrote ${opts.out}: ${blob.weightCount} weights, hash ${weightsHash(result.champion.weights)}`);
}
