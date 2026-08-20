// tools/rig/run-mutate.mjs -- the mutation suite, as a runnable job.
//   node tools/rig/run-mutate.mjs [--slice a,b] [--only NAME]
//
// WHICH MACHINE: ANY of them. This drives tools/ship/verify.mjs in a subprocess -- pure Node, CPU-bound, no GPU,
// no assets folder, no Rust or wasm toolchain. Unlike the Benard and 2f jobs it has no hardware preference at all.
//
// BUT IT IS THE ONE JOB THAT EDITS YOUR SOURCE, and that decides where to run it rather than what it needs.
// mutate.mjs writes a real change into a real file, runs the gate, and restores it. That is the only way to ask
// "would the gate notice?" honestly -- a copy of the tree would be a different tree. So:
//
//   RUN IT ON A TREE NOBODY IS EDITING. Not the checkout you have open. If it is killed mid-mutation the marker
//   recovers it on the next run, but an editor with the file already open will happily save over the restore.
//   ONE AT A TIME, which the rig-job bridge already enforces, and which matters more here than for a lattice run:
//   two of these in one tree would interleave their edits and restore each other's mutations.
//
// It is SAFE against a kill, which the first version was not: a `finally` does not survive SIGKILL, and the very
// first run exceeded its time limit, was killed, and left a mutated constant sitting in blobPhantom.js. So it now
// writes a stranded marker BEFORE touching anything and recovers it on the next start. That marker lives at
// tools/mutate/.stranded.json and is already in the ship exclusion list, so it can never travel in a zip.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");
const MARKER = path.join(ENG, "tools", "mutate", ".stranded.json");

console.log("[mutate-job] THIS JOB EDITS SOURCE FILES IN PLACE, one at a time, restoring each before the next.");
console.log("[mutate-job] Run it on a tree nobody is editing. A marker at tools/mutate/.stranded.json protects");
console.log("[mutate-job] against a kill; an open editor saving over the restore does not.");
if (fs.existsSync(MARKER)) {
    console.log("[mutate-job] A STRANDED MARKER IS PRESENT from a previous killed run -- mutate.mjs will recover it first.");
}
console.log("[mutate-job] Ten mutations at roughly a 40s gate each: expect about seven minutes.");
console.log("");

const args = ["tools/mutate/mutate.mjs"].concat(process.argv.slice(2));
const child = spawn(process.execPath, args, { cwd: ENG, stdio: "inherit" });
child.on("exit", (code) => {
    console.log("");
    if (fs.existsSync(MARKER)) {
        console.log("[mutate-job] WARNING: a stranded marker REMAINS. The tree may still hold a mutation.");
        console.log("[mutate-job] Re-run this job (it recovers on start) before trusting the source or shipping.");
    } else {
        console.log("[mutate-job] no stranded marker left behind -- the tree is clean.");
    }
    console.log("[mutate-job] A SURVIVING mutation is not a bug in the code. It is a hole in the gate.");
    process.exit(code == null ? 1 : code);
});
