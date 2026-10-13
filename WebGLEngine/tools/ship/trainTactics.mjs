// WebGLEngine/tools/ship/trainTactics.mjs -- v4849
//
// THE COMMAND for tools/ship/tacticsTrain.mjs (the library the gate holds): four searches over the seven tactics numbers the arena can see, each from a different preset, scored against all eight presets from both sides in
// ev/tools/es-arena.mjs on the box3d substrate; the champion picked on held-out seeds; the audit read once; a file written only when the champion beats the incumbent preset and the rest of the field. Prints what it did.
//
//     node tools/ship/trainTactics.mjs                          # 4 runs x 300 iterations, report only
//     node tools/ship/trainTactics.mjs --workers 4              # each search in its own process: the same answer to the bit (the gate holds that), about a quarter of the time
//     node tools/ship/trainTactics.mjs --runs 2 --iters 40      # smaller
//     node tools/ship/trainTactics.mjs --write [--out <file>]   # write brain/tacticsWeightsTrained.json when the champion qualifies
//
// *** NO EXPORTS ON PURPOSE (tools/ship/trainLeague6dof.mjs has none either): a command-line entry point and not a module, so the library it imports has a caller that is not a gate. ***
// `--one K` is the child's mode: it runs search K and prints it as one JSON line for the parent; it is not for people.
"use strict";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs, searchOne, finish, run, blobOf, hashOf } from "./tacticsTrain.mjs";

let opts; try { opts = parseArgs(process.argv.slice(2)); } catch (e) { console.error("trainTactics: " + e.message); process.exit(2); }
const log = opts.quiet ? () => {} : (m) => console.log(m);

if (opts.one != null) {
    const r = searchOne(opts, opts.one);
    console.log("SEARCH " + JSON.stringify(r));
    process.exit(0);
}

let result;
if (opts.workers > 1 && opts.runs > 1) {
    // each search in its own process (a search touches nothing the others do: its own seed and start); finish() runs here once, on the vectors they send back
    const self = fileURLToPath(import.meta.url), passthrough = ["--iters", opts.iters, "--seed", opts.seed, "--train", opts.train, "--runs", opts.runs].map(String);
    const runOne = (k) => new Promise((resolve, reject) => {
        const t0 = Date.now(), child = spawn(process.execPath, [self, ...passthrough, "--one", String(k)], { stdio: ["ignore", "pipe", "inherit"] });
        let out = ""; child.stdout.on("data", (d) => { out += d; });
        child.on("error", reject);
        child.on("close", (code) => {
            const line = out.split("\n").find((l) => l.startsWith("SEARCH "));
            if (code !== 0 || !line) return reject(new Error(`search ${k} exited ${code} without a result`));
            const r = JSON.parse(line.slice(7));
            log(`  search ${k + 1}/${opts.runs} (seed ${r.seed}, from ${r.start}) done in ${((Date.now() - t0) / 1000).toFixed(0)} s: ${r.moved} moved numbers pruned to ${r.kept}`);
            resolve(r);
        });
    });
    const pending = Array.from({ length: opts.runs }, (_, k) => k), runs = new Array(opts.runs);
    await Promise.all(Array.from({ length: Math.min(opts.workers, opts.runs) }, async () => { while (pending.length) { const k = pending.shift(); runs[k] = await runOne(k); } }));
    result = finish(opts, runs, log);
} else result = run(opts, log);

if (opts.write) {
    if (!result.verdict.ok) { console.log("not written: " + result.verdict.reasons.join("; ")); process.exit(1); }
    const blob = blobOf(result, opts); fs.writeFileSync(opts.out, JSON.stringify(blob, null, 1) + "\n");
    console.log(`wrote ${opts.out}: ${Object.keys(blob.weights).length} weights, hash ${hashOf(blob.weights)}`);
}
