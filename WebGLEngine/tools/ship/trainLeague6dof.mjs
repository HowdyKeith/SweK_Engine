// WebGLEngine/tools/ship/trainLeague6dof.mjs -- v4846
//
// THE COMMAND for tools/ship/train6dofLeague.mjs (the library the gate holds): several searches started from the shipped space-battle pilot and scored against a league of the PD autopilot and that pilot, from both sides;
// the champion picked on held-out seeds; the audit read once; a file written only when the champion leads the shipped pilot and has not regressed. Prints what it did.
//
//     node tools/ship/trainLeague6dof.mjs                          # 4 runs x 800 iterations, report only
//     node tools/ship/trainLeague6dof.mjs --workers 4              # each search in its own process: the same answer to the bit (the gate holds that), about a quarter of the time
//     node tools/ship/trainLeague6dof.mjs --runs 2 --iters 100     # smaller
//     node tools/ship/trainLeague6dof.mjs --write [--out <file>]   # write brain/pilot6dofWeightsLeague.json when the champion qualifies
//
// *** NO EXPORTS ON PURPOSE (tools/ship/trainPilot6dof.mjs and trainPilotAircraft.mjs have none either): a command-line entry point and not a module, so the library it imports has a caller that is not a gate. ***
// `--one K` is the child's mode: it runs search K and prints it as one JSON line for the parent; it is not for people.
"use strict";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs, previousWeights, searchOne, finish, run, blobOf, weightsHash } from "./train6dofLeague.mjs";

let opts; try { opts = parseArgs(process.argv.slice(2)); } catch (e) { console.error("trainLeague6dof: " + e.message); process.exit(2); }
const log = opts.quiet ? () => {} : (m) => console.log(m);

if (opts.one != null) {
    const r = searchOne(opts, opts.one);
    console.log("SEARCH " + JSON.stringify({ ...r, weights: Array.from(r.weights) }));
    process.exit(0);
}

let result;
if (opts.workers > 1 && opts.runs > 1) {
    // each search in its own process (a search touches nothing the others do: its own seed, the shipped pilot read-only); finish() runs here once, on the weights they send back
    const self = fileURLToPath(import.meta.url), passthrough = ["--profile", opts.profile, "--iters", opts.iters, "--seed", opts.seed, "--sigma", opts.sigma, "--train", opts.train, "--runs", opts.runs].map(String);
    const runOne = (k) => new Promise((resolve, reject) => {
        const t0 = Date.now(), child = spawn(process.execPath, [self, ...passthrough, "--one", String(k)], { stdio: ["ignore", "pipe", "inherit"] });
        let out = ""; child.stdout.on("data", (d) => { out += d; });
        child.on("error", reject);
        child.on("close", (code) => {
            const line = out.split("\n").find((l) => l.startsWith("SEARCH "));
            if (code !== 0 || !line) return reject(new Error(`search ${k} exited ${code} without a result`));
            const r = JSON.parse(line.slice(7)); r.weights = Float32Array.from(r.weights);
            log(`  search ${k + 1}/${opts.runs} (seed ${r.seed}) done in ${((Date.now() - t0) / 1000).toFixed(0)} s: pruned ${r.moved} moved weights to ${r.kept}`);
            resolve(r);
        });
    });
    const pending = Array.from({ length: opts.runs }, (_, k) => k), runs = new Array(opts.runs);
    await Promise.all(Array.from({ length: Math.min(opts.workers, opts.runs) }, async () => { while (pending.length) { const k = pending.shift(); runs[k] = await runOne(k); } }));
    result = finish(opts, runs, log, previousWeights());
} else result = run(opts, log);

if (opts.write) {
    if (!result.verdict.ok) { console.log("not written: " + result.verdict.reasons.join("; ")); process.exit(1); }
    const blob = blobOf(result, opts); fs.writeFileSync(opts.out, JSON.stringify(blob) + "\n");
    console.log(`wrote ${opts.out}: ${blob.weightCount} weights, hash ${weightsHash(result.champion.weights)}`);
}
