// WebGLEngine/tools/ship/trainTurretSeatCmd.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE COMMAND for tools/ship/trainTurretSeat.mjs (the library the gate holds). Two steps, so that the searches can run one a core and the audit is read once, in one place:
//
//     node tools/ship/trainTurretSeatCmd.mjs search --seed 7000 --record <file.json>          # ONE search (train, prune, held-out), its record written to the file; run one per seed, side by side
//     node tools/ship/trainTurretSeatCmd.mjs finish --records a.json,b.json,... [--write]     # the champion on held-out, the audit read ONCE, the ablation, and with --write brain/seatTurretGunnerWeightsDefault.json when it qualifies
//
// *** NO EXPORTS ON PURPOSE: a command-line entry point and not a module. ***
"use strict";
import fs from "node:fs";
import { parseArgs, search, finish, blobOf } from "./trainTurretSeat.mjs";
import { weightsHash } from "../../brain/drivePolicy.mjs";

const step = process.argv[2];
let opts; try { if (!["search", "finish"].includes(step)) throw new Error(`the first argument is search or finish (got ${JSON.stringify(step)})`); opts = parseArgs(process.argv.slice(3)); } catch (e) { console.error("trainTurretSeatCmd: " + e.message); process.exit(2); }
const log = opts.quiet ? () => {} : (m) => console.log(m);
if (step === "search") {
    if (!opts.record) { console.error("trainTurretSeatCmd: search needs --record <file.json>"); process.exit(2); }
    const rec = search(opts, log); fs.writeFileSync(opts.record, JSON.stringify(rec) + "\n"); console.log(`wrote ${opts.record}`);
} else {
    if (!opts.records) { console.error("trainTurretSeatCmd: finish needs --records a.json,b.json,..."); process.exit(2); }
    const result = finish(opts.records.split(",").map((f) => JSON.parse(fs.readFileSync(f, "utf8"))), log);
    if (opts.write) {
        if (!result.verdict.ok) { console.log("not written: " + result.verdict.reasons.join("; ")); process.exit(1); }
        const blob = blobOf(result); fs.writeFileSync(opts.out, JSON.stringify(blob) + "\n");
        console.log(`wrote ${opts.out}: ${blob.weightCount} weights, hash ${weightsHash(result.champion.weights)}`);
    }
}
