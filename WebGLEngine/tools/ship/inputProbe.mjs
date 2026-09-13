// WebGLEngine/tools/ship/inputProbe.mjs -- v4567
//
// Run: node --import ./tools/ship/inputProbe.mjs <gate>
//      SWEK_PROBE_DIR names a directory every process in the tree writes its own file into.
//
// *** WHAT DOES THIS GATE ACTUALLY READ? *** The sweep re-runs about 1,254 gates every time, and a round
// touches five to fifteen files. Most of that work is answering a question whose inputs did not move. v4548
// found its own subject by wrapping fs.readFileSync and fs.readdirSync and COUNTING the calls; this records
// the PATHS instead, so a later sweep can ask whether anything a gate reads has changed.
//
// *** AND THE HARD PART IS NOT THE RECORDING, IT IS SOUNDNESS. *** A skipped gate that should have run is a
// silent false green -- the worst outcome this tree recognises -- so this probe's job is as much to say when
// it CANNOT know as to say what it saw.
//
// ---- v4567: TWO MECHANISMS, BECAUSE ONE OF THEM MISSES A THIRD OF THE POPULATION -------------------------
//
// v4566 patched the fs DEFAULT EXPORT OBJECT, which a CJS `require` and a default `import` both hand out.
// It then disqualified 102 gates written `import { readFileSync } from "node:fs"` on the stated theory that
// a named binding is bound when the module links and might not route through the patch. MEASURED: it does
// not route through it at all -- a file reading through a named import recorded an EMPTY set. And 121 more
// gates were disqualified for spawning, because what a child reads is invisible from the parent. Together
// that is 223 gates and 162 s of the sweep's 538 -- 30% of the time, unreachable by construction.
//
// Both holes are the same hole and one mechanism closes them:
//
//   1. A module.register() LOADER HOOK redirects node:fs, node:fs/promises and node:child_process to shims
//      in ./probe/. A resolve hook is the only thing that reaches a named import of a builtin, because it
//      changes what the name is bound TO rather than what the object contains.
//   2. NODE_OPTIONS carries `--import` into every node CHILD that inherits the environment, so a child
//      probes itself and writes its own file into SWEK_PROBE_DIR. The recorder merges the directory.
//
// The CJS patches below stay: a loader hook does not see `require("fs")`, and the two mechanisms overlap
// rather than compete -- both write into the same sets in ./probe/record.mjs.
//
// WHAT IS STILL REFUSED, and it is refused because it is genuinely unknown rather than merely unmeasured:
//   net              a socket or a fetch. The input is not in the tree at all.
//   spawnedNonNode   a child that is not node (tsc, javac, bash, a browser), or anything through exec/
//                    execSync, which runs a SHELL -- guessing what a shell will run is how a probe starts
//                    lying. Nobody recorded what those read, so the gate stays out.
"use strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import Module from "node:module";
import { register } from "node:module";
import { reads, dirs, execs, flags, addRead, addDir } from "./probe/record.mjs";
import { WRAPPERS } from "./probe/cpWrap.mjs";

register(new URL("./probe/hooks.mjs", import.meta.url).href);

// ---- the CJS half: `require("fs")` never passes through a loader hook -------------------------------------
for (const name of ["readFileSync", "readFile", "openSync", "createReadStream"]) {
    const orig = fs[name];
    if (typeof orig !== "function") continue;
    fs[name] = function (p, ...rest) { addRead(p); return orig.call(this, p, ...rest); };
}
for (const name of ["readdirSync", "readdir", "statSync", "existsSync", "lstatSync"]) {
    const orig = fs[name];
    if (typeof orig !== "function") continue;
    fs[name] = function (p, ...rest) { addDir(p); return orig.call(this, p, ...rest); };
}
const origLoad = Module._load;
Module._load = function (request, ...rest) {
    if (/^(node:)?(net|http|https|tls|dgram)$/.test(request)) flags.net = true;
    const m = origLoad.call(this, request, ...rest);
    // *** A CJS require of child_process IS PATCHED, NOT FLAGGED, AND THE DIFFERENCE IS 100 GATES. ***
    // The first draft set spawnedNonNode on the mere require, which refuses a gate for what its imports
    // COULD do. Sampling 25 of the 136 gates that refused found NINETEEN that spawned nothing at all.
    // require hands back the real exports object -- the same lever v4566 used for fs -- so the wrappers go
    // on it and the judgement is made when something is actually spawned.
    if (/^(node:)?child_process$/.test(request) && m && !m.__swekProbed) {
        for (const [name, wrap] of Object.entries(WRAPPERS)) if (typeof m[name] === "function") m[name] = wrap(m[name]);
        try { Object.defineProperty(m, "__swekProbed", { value: true, enumerable: false }); } catch {}
    }
    return m;
};
const origFetch = globalThis.fetch;
if (typeof origFetch === "function") globalThis.fetch = function (...a) { flags.net = true; return origFetch.apply(this, a); };

// ---- the output: one file per PROCESS, so a parent and its children do not overwrite each other -----------
const DIR = process.env.SWEK_PROBE_DIR;
const OUT = process.env.SWEK_PROBE_OUT ||
    (DIR ? path.join(DIR, `p${process.pid}-${Math.random().toString(36).slice(2, 8)}.json`) : null);

process.on("exit", () => {
    if (!OUT) return;
    try {
        fs.writeFileSync(OUT, JSON.stringify({
            pid: process.pid, ppid: process.ppid,
            reads: [...reads].sort(), dirs: [...dirs].sort(),
            execs: [...execs].sort(),
            spawnedNode: flags.spawnedNode, spawnedNonNode: flags.spawnedNonNode,
            net: flags.net, exit: process.exitCode ?? 0,
        }));
    } catch {}
});
