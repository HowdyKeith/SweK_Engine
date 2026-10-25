// WebGLEngine/tools/ship/runDogfightTournament.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE COMMAND for tools/ship/tournamentDogfight.mjs (the library the gate holds): every shipped dogfight pilot against every other, on duels none of them has trained on, from both seats, with the counts, the edges, the Bradley-Terry ratings and the checks
// on them (is the ranking transitive, how many duels do the ratings need, how much is a seat worth). Prints what it did.
//
//     node tools/ship/runDogfightTournament.mjs                       # the round robin over the shipped pilots, report only
//     node tools/ship/runDogfightTournament.mjs --only autopilot,flyDogfight,gpuDogfight
//     node tools/ship/runDogfightTournament.mjs --smoke               # four throwaway duels, to SEE THAT IT RUNS
//     node tools/ship/runDogfightTournament.mjs --record tools/ship/dogfightTournament-record.json
//
// NO EXPORTS ON PURPOSE: a command-line entry point and not a module, so the library it imports has a caller that is not a gate.
"use strict";
import { command } from "./tournamentDogfight.mjs";

process.exit(command(process.argv.slice(2)));
