// WebGLEngine/tools/roundhouse/angularImpulseCensusRun.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE COMMAND for the census physics/mechanics/BOX3D_ANGULAR_IMPULSE_CAP_WIP.md registers. It runs the controls, then every gate of the
// corpus under the hook (two at a time, 1,800 s each), then the four pages, and writes everything to one results file. It prints how each
// run ended and how long it took -- NEVER A READING: the results file is committed before anybody reads it.
//
// Run it from a scratch worktree of the census's commit, so the files gates rewrite as they run never reach the tree they came from:
//     git worktree add <dir> <commit>      (link the tree's node_modules into it)
//     cd <dir>/WebGLEngine && node tools/roundhouse/angularImpulseCensusRun.mjs [--out <file>]
// It refuses to overwrite a results file that exists.
"use strict";
import fs from "node:fs";
import path from "node:path";
import * as C from "./angularImpulseCensus.mjs";

const arg = (k) => { const i = process.argv.indexOf(k); return i < 0 ? null : process.argv[i + 1]; };
const out = path.resolve(arg("--out") || C.DEFAULT_RESULTS);
C.refuseExisting(out);
const t0 = Date.now();
console.log(`[census] ${C.REGISTRATION}; writing ${out}`);
const results = await C.run({
    onDone: (r, i, n) => console.log(`[census] ${String(i + 1).padStart(3)}/${n}  ${r.timedOut ? "TIMED OUT" : r.signal ? "signal " + r.signal : "exit " + r.code}  ${(r.ms / 1000).toFixed(1)} s  ${r.run}`),
});
fs.writeFileSync(out, C.serialize(results));
console.log(`[census] the pages: ${results.runs.p.map((p) => `${p.page} ${p.completed ? "completed" : "NOT COMPLETED"}`).join(", ")}`);
console.log(`[census] wrote ${out} (${fs.statSync(out).size} bytes) in ${((Date.now() - t0) / 60000).toFixed(1)} min. Commit it before reading it.`);
