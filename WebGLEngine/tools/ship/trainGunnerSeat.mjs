// WebGLEngine/tools/ship/trainGunnerSeat.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE COMMAND for tools/ship/trainSeatGunner.mjs (the library the gate holds): several searches for the network that is the hand of the battleship's gunners (the fruit fly's or the GPU Brain's), the champion
// picked on the held-out fights, the audit fights read once, and a file written only when that champion beats the hand gunner on both. Prints what it did.
//
//     node tools/ship/trainGunnerSeat.mjs --net fruitfly                  # 2 runs x 300 iterations, report only (about forty minutes)
//     node tools/ship/trainGunnerSeat.mjs --net mlp --runs 2 --iters 300
//     node tools/ship/trainGunnerSeat.mjs --net fruitfly --write [--out <file>]   # write brain/seatGunnerWeightsDefault.json (mlp: seatGunnerMlpWeightsDefault.json) when the champion qualifies
//
// *** NO EXPORTS ON PURPOSE (tools/ship/trainPilot6dof.mjs has none either): a command-line entry point and not a module. The library it imports is what the gate holds. ***
"use strict";
import fs from "node:fs";
import { parseArgs, run, blobOf } from "./trainSeatGunner.mjs";
import * as SG from "../../brain/seatGunnerPolicy.mjs";
import * as MG from "../../brain/seatGunnerMlp.mjs";
import { weightsHash } from "../../brain/drivePolicy.mjs";

let opts; try { opts = parseArgs(process.argv.slice(2)); } catch (e) { console.error("trainGunnerSeat: " + e.message); process.exit(2); }
const net = opts.net === "mlp" ? MG : SG;
const result = run(net, opts, opts.quiet ? () => {} : (m) => console.log(m));
if (opts.write) {
    if (!result.verdict.ok) { console.log("not written: " + result.verdict.reasons.join("; ")); process.exit(1); }
    const blob = blobOf(net, result, opts); fs.writeFileSync(opts.out, JSON.stringify(blob) + "\n");
    console.log(`wrote ${opts.out}: ${blob.weightCount} weights, hash ${weightsHash(result.champion.weights)}`);
}
