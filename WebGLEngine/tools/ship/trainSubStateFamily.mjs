// WebGLEngine/tools/ship/trainSubStateFamily.mjs -- UNNUMBERED
//
// THE COMMAND for tools/ship/trainSubState.mjs (the library the gate holds): the vendored fly heading loop and its controls, each trained as a stateful reservoir pilot by the submarine recipe with every dive flown through a compass dropout, the audits read once per champion,
// the verdict printed.
//
//     node tools/ship/trainSubStateFamily.mjs run --specs cx,er:0-5,layer:0-5,degree:0-5,sign:0-2,count:0-2,nostate:0-2 --out <results.jsonl> --workers 4     # STAGE A (28 circuits); a stopped run resumes
//     node tools/ship/trainSubStateFamily.mjs run --specs er:6-11,layer:6-11,degree:6-11 --out <the same file> --workers 4                                   # STAGE B (only if stage A reads as a pass)
//     node tools/ship/trainSubStateFamily.mjs report --in <results.jsonl>                                                                                   # the table and the verdict, from the file alone
//     node tools/ship/trainSubStateFamily.mjs run --specs cx --out <file> --smoke                                                                           # the plumbing on a few throwaway dives (smoke records are refused by report unless --allow-smoke)
//
// *** NO EXPORTS ON PURPOSE (tools/ship/trainSubCircuitFamily.mjs has none either): a command-line entry point and not a module. `--one SPEC` is the child's mode: it trains one circuit and prints it as one JSON line.
"use strict";
import { fileURLToPath } from "node:url";
import { command } from "./trainSubState.mjs";

process.exit(await command(process.argv.slice(2), { selfPath: fileURLToPath(import.meta.url) }));
