// WebGLEngine/tools/ship/trainSubCircuitFamily.mjs -- UNNUMBERED
//
// THE COMMAND for tools/ship/trainSubCircuits.mjs (the library the gate holds): the vendored hindbrain-integrator circuit and its controls, each trained by the submarine recipe, the audits read once per champion, the verdict printed.
//
//     node tools/ship/trainSubCircuitFamily.mjs run --specs fish,er:0-9,layer:0-9,degree:0-9,sign:0-3,count:0-3 --out <results.jsonl> --workers 4     # STAGE A (29 circuits); a stopped run resumes
//     node tools/ship/trainSubCircuitFamily.mjs run --specs er:10-19,layer:10-19,degree:10-19 --out <the same file> --workers 4                         # STAGE B (only if stage A reads as a pass)
//     node tools/ship/trainSubCircuitFamily.mjs report --in <results.jsonl>                                                                           # the table and the verdict, from the file alone
//     node tools/ship/trainSubCircuitFamily.mjs run --specs fish --out <file> --smoke                                                                 # the plumbing on a few throwaway dives (smoke records are refused by report unless --allow-smoke)
//
// *** NO EXPORTS ON PURPOSE (tools/ship/trainPilotSub.mjs has none either): a command-line entry point and not a module. `--one SPEC` is the child's mode: it trains one circuit and prints it as one JSON line.
"use strict";
import { fileURLToPath } from "node:url";
import { command } from "./trainSubCircuits.mjs";

process.exit(await command(process.argv.slice(2), { selfPath: fileURLToPath(import.meta.url) }));
