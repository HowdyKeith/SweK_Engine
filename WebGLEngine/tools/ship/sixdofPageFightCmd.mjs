// WebGLEngine/tools/ship/sixdofPageFightCmd.mjs -- UNNUMBERED
//
// THE COMMAND for tools/ship/sixdofPageFight.mjs (the library the gate holds): the five pilots in es-box3d-6dof.html's own fight, as brain/SIXDOF_PAGE_FIGHT_WIP.md registers it.
//
//     node tools/ship/sixdofPageFightCmd.mjs                      # the registered round: writes brain/sixdofPageFightResults.json (never overwrites it) and prints only where it is
//     node tools/ship/sixdofPageFightCmd.mjs --results <file>     # the same round, to another file
//
// *** THE RESULTS ARE NOT PRINTED. *** The registration commits the results file byte for byte before anyone reads it, so this command writes it and says where; the readings are made from the committed
// file, by the library's verdictOf(). NO EXPORTS ON PURPOSE: a command-line entry point. Its door is the command.
"use strict";
import fs from "node:fs";
import { parseArgs, refuseExisting, runRound } from "./sixdofPageFight.mjs";

let opts; try { opts = parseArgs(process.argv.slice(2)); } catch (e) { console.error("sixdofPageFightCmd: " + e.message); process.exit(2); }
const refused = refuseExisting(opts.results); if (refused) { console.error("sixdofPageFightCmd: " + refused); process.exit(2); }
const result = await runRound();
fs.writeFileSync(opts.results, JSON.stringify(result) + "\n");
console.log(`wrote ${opts.results}${result.stopped ? " (stopped: " + result.stopped + ")" : ""} -- commit it before reading it`);
process.exit(0);
