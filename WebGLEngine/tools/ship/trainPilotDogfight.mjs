// WebGLEngine/tools/ship/trainPilotDogfight.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE COMMAND for tools/ship/trainDogfightPilot.mjs (the library the gate holds): several searches from the autopilot's own weights on the dogfight, the champion picked on the held-out fights, the audit and the reserve read once, and a
// file written only when that champion qualifies. Prints what it did.
//
//     node tools/ship/trainPilotDogfight.mjs                          # 4 runs x 600 iterations, report only (--brain gpu: the GPU Brain's MLP instead of the fruit fly)
//     node tools/ship/trainPilotDogfight.mjs --workers 4              # each search in its own process: the same answer to the bit (the gate holds that), about a quarter of the time
//     node tools/ship/trainPilotDogfight.mjs --runs 2 --iters 100     # smaller
//     node tools/ship/trainPilotDogfight.mjs --smoke --runs 2 --iters 3   # to SEE THAT IT RUNS: every set is eight throwaway fights, no audit is read, and --write is refused
//     node tools/ship/trainPilotDogfight.mjs --dump <file>            # also write every run's pruned weights and scores there, qualified or not (to look at a result that did not qualify; not a shipped file)
//     node tools/ship/trainPilotDogfight.mjs --write [--out <file>]   # write brain/pilotDogfightWeightsDefault.json (--brain gpu: brain/pilotDogfightMlpWeightsDefault.json) when the champion qualifies
//
// NO EXPORTS ON PURPOSE: a command-line entry point and not a module, so the library it imports has a caller that is not a gate. `--one K` is the child's mode: it runs search K and prints it as one JSON line for the parent.
"use strict";
import { fileURLToPath } from "node:url";
import { command } from "./trainDogfightPilot.mjs";

process.exit(await command(process.argv.slice(2), { selfPath: fileURLToPath(import.meta.url) }));
