// WebGLEngine/tools/ship/probe/cpShim.mjs -- v4567
//
// *** 121 GATES SPAWN A CHILD PROCESS AND THEY ARE 124 s OF THE SWEEP'S 538 -- 23%, THE SINGLE BIGGEST
// BLOCK LEFT, AND THE EXPENSIVE ONES: 1.02 s each against 0.33 s for a skippable gate. ***
//
// v4566 disqualified all of them, correctly, because what a child reads is invisible to a probe in the
// parent. The fix is not to look INTO the child, it is to put a probe IN it: NODE_OPTIONS carries
// `--import` to any node process that inherits the environment, so a node child probes itself and writes
// into the same directory the parent does. That works without this shim at all -- but only for children
// that INHERIT the environment, and only for children that are node.
//
// SO WHAT THIS SHIM IS FOR IS KNOWING WHEN THAT DID NOT HAPPEN. A gate that spawns tsc, javac, bash, tar or
// a browser has a child whose reads nobody recorded, and a gate that passes an explicit `env` drops
// NODE_OPTIONS on the floor. Both cases are recorded as `spawnedNonNode`, which keeps the gate disqualified.
// The distinction is the whole point: without it "spawned" means "we cannot know" for every gate, and 121
// gates stay out because 30 of them genuinely must.
export * from "node:child_process";
import real from "node:child_process";
import { WRAPPERS } from "./cpWrap.mjs";

export const spawn = WRAPPERS.spawn(real.spawn);
export const spawnSync = WRAPPERS.spawnSync(real.spawnSync);
export const execFile = WRAPPERS.execFile(real.execFile);
export const execFileSync = WRAPPERS.execFileSync(real.execFileSync);
export const fork = WRAPPERS.fork(real.fork);
export const exec = WRAPPERS.exec(real.exec);
export const execSync = WRAPPERS.execSync(real.execSync);
export default real;
