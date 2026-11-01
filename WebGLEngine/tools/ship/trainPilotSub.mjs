// WebGLEngine/tools/ship/trainPilotSub.mjs -- UNNUMBERED
//
// THE COMMAND for tools/ship/trainSubPilot.mjs (the library the gate holds): several searches from the PD autopilot's own weights on a circuit, the champion picked on the held-out dives among the searches no worse than the autopilot on 500 safety
// dives, the audits read once, a file written only when that champion qualifies. Prints what it did.
//
//     node tools/ship/trainPilotSub.mjs --circuit fish                  # 4 runs x 400 iterations, report only (--circuit fly: the Giant Fiber Circuit; --circuit control: a random circuit of the fish's size)
//     node tools/ship/trainPilotSub.mjs --circuit fish --workers 4      # each search in its own process: the same answer to the bit (the gate holds that), about a quarter of the time
//     node tools/ship/trainPilotSub.mjs --circuit fish --slice 7        # train on every 7th training dive: for trying the machinery; --write refuses it
//     node tools/ship/trainPilotSub.mjs --circuit fish --dump <file>    # also write every run's pruned weights and scores there, qualified or not (not a shipped file)
//     node tools/ship/trainPilotSub.mjs --circuit fish --write          # write brain/pilotSubWeightsFishWip.json when the champion qualifies (the fly and the control have no default file: pass --out)
//
// *** NO EXPORTS ON PURPOSE (tools/ship/trainPilotDrone.mjs has none either): a command-line entry point and not a module. `--one K` is the child's mode: it runs search K and prints it as one JSON line for the parent.
"use strict";
import { fileURLToPath } from "node:url";
import { command } from "./trainSubPilot.mjs";

process.exit(await command(process.argv.slice(2), { selfPath: fileURLToPath(import.meta.url) }));
