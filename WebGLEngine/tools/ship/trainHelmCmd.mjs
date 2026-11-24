// WebGLEngine/tools/ship/trainHelmCmd.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE COMMAND for tools/ship/trainHelm.mjs (the library the gate holds). Three steps, so that the searches can run one a core and the audit is read once, in one place:
//
//     node tools/ship/trainHelmCmd.mjs noise [--n 12]                                   # the first measurement: random helms against the rule on the held-out pairs (prints; writes nothing)
//     node tools/ship/trainHelmCmd.mjs search --seed 5000 --record <file.json>          # ONE search (train, prune, held-out), its record written to the file; run one per seed, side by side
//     node tools/ship/trainHelmCmd.mjs finish --records a.json,b.json,... [--write]     # the champion on held-out, the audit read ONCE, and with --write brain/helmWeightsDefault.json when it qualifies
//
// *** NO EXPORTS ON PURPOSE (tools/ship/trainGunnerSeat.mjs has none either): a command-line entry point and not a module. ***
"use strict";
import fs from "node:fs";
import { parseArgs, noiseStudy, search, finish, blobOf, HELD_OUT_PAIRS } from "./trainHelm.mjs";
import { weightsHash } from "../../brain/drivePolicy.mjs";

const step = process.argv[2];
let opts; try { if (!["noise", "search", "finish"].includes(step)) throw new Error(`the first argument is noise, search or finish (got ${JSON.stringify(step)})`); opts = parseArgs(process.argv.slice(3)); } catch (e) { console.error("trainHelmCmd: " + e.message); process.exit(2); }
const log = opts.quiet ? () => {} : (m) => console.log(m);
if (step === "noise") {
    const r = noiseStudy({ n: opts.n, sigma: opts.sigma });
    console.log(`the rule plus noise, ${r.n} random helms of three paths (sigma ${opts.sigma}) on the ${HELD_OUT_PAIRS.length} held-out pairs: ${r.ahead} lead the rule; leads ${r.leads.map((x) => x.toFixed(3)).join(", ")}; best ${r.best.toFixed(3)}, mean ${r.mean.toFixed(3)}`);
} else if (step === "search") {
    if (!opts.record) { console.error("trainHelmCmd: search needs --record <file.json>"); process.exit(2); }
    const rec = search(opts, log); fs.writeFileSync(opts.record, JSON.stringify(rec) + "\n"); console.log(`wrote ${opts.record}`);
} else {
    if (!opts.records) { console.error("trainHelmCmd: finish needs --records a.json,b.json,..."); process.exit(2); }
    const result = finish(opts.records.split(",").map((f) => JSON.parse(fs.readFileSync(f, "utf8"))), log);
    if (opts.write) {
        if (!result.verdict.ok) { console.log("not written: " + result.verdict.reasons.join("; ")); process.exit(1); }
        const blob = blobOf(result); fs.writeFileSync(opts.out, JSON.stringify(blob) + "\n");
        console.log(`wrote ${opts.out}: ${blob.weightCount} weights, hash ${weightsHash(result.champion.weights)}`);
    }
}
