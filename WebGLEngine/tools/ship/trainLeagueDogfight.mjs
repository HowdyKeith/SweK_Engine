// WebGLEngine/tools/ship/trainLeagueDogfight.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE COMMAND for tools/ship/trainDogfightLeague.mjs (the library the gate holds): several searches STARTED FROM THE SHIPPED DOGFIGHT PILOT of a brain and scored against a league (the PD autopilot, the shipped pilot itself, the other brain's shipped pilot), every duel flown
// from both seats; the champion picked on held-out duels; the audits read once; and a file written only when that champion qualifies. Prints what it did.
//
//     node tools/ship/trainLeagueDogfight.mjs                          # 4 runs x 400 iterations, report only (--brain gpu: the GPU Brain's MLP instead of the fruit fly)
//     node tools/ship/trainLeagueDogfight.mjs --workers 4              # each search in its own process: the same answer to the bit, about a quarter of the time
//     node tools/ship/trainLeagueDogfight.mjs --cache <dir>            # a finished search is written to <dir> and read back on the next run (a search is tens of minutes)
//     node tools/ship/trainLeagueDogfight.mjs --smoke --runs 2 --iters 2   # to SEE THAT IT RUNS: every set is a few throwaway fights, no audit is read, and --write is refused
//     node tools/ship/trainLeagueDogfight.mjs --dump <file>            # also write every run's pruned weights and scores there, qualified or not (not a shipped file)
//     node tools/ship/trainLeagueDogfight.mjs --write [--out <file>]   # write brain/pilotDogfightWeightsLeague.json (--brain gpu: brain/pilotDogfightMlpWeightsLeague.json) when the champion qualifies
//
// NO EXPORTS ON PURPOSE: a command-line entry point and not a module, so the library it imports has a caller that is not a gate. `--one K` is the child's mode: it runs search K and prints it as one JSON line for the parent.
"use strict";
import { fileURLToPath } from "node:url";
import { command } from "./trainDogfightLeague.mjs";

process.exit(await command(process.argv.slice(2), { selfPath: fileURLToPath(import.meta.url) }));
