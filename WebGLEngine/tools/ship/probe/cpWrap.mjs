// WebGLEngine/tools/ship/probe/cpWrap.mjs -- v4567
//
// The spawn wrappers, shared by the ESM shim (probe/cpShim.mjs) and the CJS patch (inputProbe.mjs), because
// they must make the SAME judgement and a second copy of a judgement is how two answers drift apart.
//
// *** AND THE FIRST DRAFT DISQUALIFIED ON THE IMPORT RATHER THAN ON THE SPAWN, WHICH COST MOST OF THE
// ROUND'S VALUE. *** inputProbe flagged any gate whose graph did `require("child_process")` at all. Sampling
// 25 of the 136 gates that refused showed NINETEEN spawning nothing whatever -- they merely imported a
// module that CAN spawn. Requiring is not running, and a probe that cannot tell them apart is measuring the
// import graph rather than the run.
"use strict";
import { flags, execs, addRead } from "./record.mjs";

export const isNode = (cmd) => {
    const s = String(cmd || "");
    return s === process.execPath || /(^|[\\/])node(\.exe)?$/.test(s);
};

/** Merge the probe's own NODE_OPTIONS and the shared output directory into whatever env the caller passed. */
function probedEnv(opts) {
    const dir = process.env.SWEK_PROBE_DIR;
    if (!dir) return opts;
    const base = opts && opts.env ? opts.env : process.env;
    return { ...opts, env: { ...base, NODE_OPTIONS: process.env.NODE_OPTIONS || "", SWEK_PROBE_DIR: dir } };
}

const withEnv = (rest) => {
    const i = rest.findIndex((a) => a && typeof a === "object" && !Array.isArray(a));
    if (i >= 0) rest[i] = probedEnv(rest[i]); else rest.push(probedEnv({}));
    return rest;
};

/** Wrap one spawn-shaped function: the executable is the first argument. */
export function wrapSpawn(orig) {
    if (typeof orig !== "function") return orig;
    return function (cmd, ...rest) {
        execs.add(String(cmd).slice(0, 200));
        addRead(cmd);                                   // an executable in the tree is a dependency
        if (!isNode(cmd)) { flags.spawnedNonNode = true; return orig.call(this, cmd, ...rest); }
        flags.spawnedNode++;
        return orig.call(this, cmd, ...withEnv(rest));
    };
}

/** fork always runs node, but takes a MODULE path rather than an executable. */
export function wrapFork(orig) {
    if (typeof orig !== "function") return orig;
    return function (mod, ...rest) {
        execs.add("fork:" + String(mod).slice(0, 200));
        addRead(mod);
        flags.spawnedNode++;
        return orig.call(this, mod, ...withEnv(rest));
    };
}

// exec and execSync run a SHELL. What it launches is not knowable without parsing the shell's grammar, and
// guessing is how a probe starts lying -- so the gate is refused rather than trusted on a parse.
export function wrapShell(orig) {
    if (typeof orig !== "function") return orig;
    return function (cmd, ...rest) { execs.add("sh:" + String(cmd).slice(0, 200)); flags.spawnedNonNode = true; return orig.call(this, cmd, ...rest); };
}

/** Every wrapper, by name, so the shim and the CJS patch cannot disagree about which is which. */
export const WRAPPERS = Object.freeze({
    spawn: wrapSpawn, spawnSync: wrapSpawn, execFile: wrapSpawn, execFileSync: wrapSpawn,
    fork: wrapFork, exec: wrapShell, execSync: wrapShell,
});
