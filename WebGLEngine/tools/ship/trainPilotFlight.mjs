// WebGLEngine/tools/ship/trainPilotFlight.mjs -- v4869
//
// THE COMMAND for tools/ship/trainFlightPilot.mjs (the library the gate holds): several searches from the autopilot's own weights, the champion picked on the held-out scenarios, the audit and the reserve read once, and a file
// written only when that champion qualifies. Prints what it did.
//
//     node tools/ship/trainPilotFlight.mjs                          # 4 runs x 1000 iterations, report only (--brain gpu: the GPU Brain's MLP instead of the fruit fly; its file is brain/pilotFlightMlpWeightsDefault.json)
//     node tools/ship/trainPilotFlight.mjs --workers 4              # each search in its own process: the same answer to the bit (the gate holds that), about a quarter of the time
//     node tools/ship/trainPilotFlight.mjs --runs 2 --iters 100     # smaller
//     node tools/ship/trainPilotFlight.mjs --dump <file>            # also write every run's pruned weights and scores there, qualified or not (to look at a result that did not qualify; not a shipped file)
//     node tools/ship/trainPilotFlight.mjs --write [--out <file>]   # write brain/pilotFlightWeightsDefault.json when the champion qualifies
//
// *** NO EXPORTS ON PURPOSE (tools/ship/trainPilotAircraft.mjs and trainLeague6dof.mjs have none either): a command-line entry point and not a module, so the library it imports has a caller that is not a gate. ***
// `--one K` is the child's mode: it runs search K and prints it as one JSON line for the parent; it is not for people.
"use strict";
import { fileURLToPath } from "node:url";
import { command } from "./trainFlightPilot.mjs";

process.exit(await command(process.argv.slice(2), { selfPath: fileURLToPath(import.meta.url) }));
