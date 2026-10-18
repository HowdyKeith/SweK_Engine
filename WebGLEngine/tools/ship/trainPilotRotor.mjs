// WebGLEngine/tools/ship/trainPilotRotor.mjs -- UNNUMBERED
//
// THE COMMAND for tools/ship/trainRotorPilot.mjs (the library the gate holds): several searches from the hand pilot's own weights, the champion picked on the held-out scenarios among the searches no more dangerous than the hand pilot, the audit and the reserve read once, a file
// written only when that champion qualifies. Prints what it did.
//
//     node tools/ship/trainPilotRotor.mjs                          # 4 runs x 600 iterations, report only (--brain gpu: the GPU Brain's MLP instead of the fruit fly; its file is brain/pilotRotorMlpWeightsDefault.json)
//     node tools/ship/trainPilotRotor.mjs --workers 4              # each search in its own process: the same answer to the bit (the gate holds that), about a quarter of the time
//     node tools/ship/trainPilotRotor.mjs --runs 2 --iters 100     # smaller
//     node tools/ship/trainPilotRotor.mjs --slice 7                # train on every 7th training scenario: for trying the machinery; --write refuses it (its file would say it was the full recipe)
//     node tools/ship/trainPilotRotor.mjs --dump <file>            # also write every run's pruned weights and scores there, qualified or not (to look at a result that did not qualify; not a shipped file)
//     node tools/ship/trainPilotRotor.mjs --write [--out <file>]   # write brain/pilotRotorWeightsDefault.json when the champion qualifies
//
// *** NO EXPORTS ON PURPOSE (tools/ship/trainPilotFlight.mjs has none either): a command-line entry point and not a module, so the library it imports has a caller that is not another module's dependency. ***
// `--one K` is the child's mode: it runs search K and prints it as one JSON line for the parent; it is not for people.
"use strict";
import { fileURLToPath } from "node:url";
import { command } from "./trainRotorPilot.mjs";

process.exit(await command(process.argv.slice(2), { selfPath: fileURLToPath(import.meta.url) }));
