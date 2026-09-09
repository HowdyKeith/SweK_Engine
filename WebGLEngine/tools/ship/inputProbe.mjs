// WebGLEngine/tools/ship/inputProbe.mjs -- v4565
//
// Run: node --import ./tools/ship/inputProbe.mjs <gate>          (SWEK_PROBE_OUT names the file to write)
//
// *** WHAT DOES THIS GATE ACTUALLY READ? *** The sweep re-runs about 1,150 gates every time, and a round
// touches five to fifteen files. Most of that work is answering a question whose inputs did not move. v4548
// found its own subject by wrapping fs.readFileSync and fs.readdirSync and COUNTING the calls; this records
// the PATHS instead, so a later sweep can ask whether anything a gate reads has changed.
//
// *** AND THE HARD PART IS NOT THE RECORDING, IT IS SOUNDNESS. *** A skipped gate that should have run is a
// silent false green -- the worst outcome this tree recognises -- so this probe's job is as much to say when
// it CANNOT know as to say what it saw. It records three disqualifiers beside the paths:
//
//   spawned   the gate started a child process. Its real inputs are whatever that process read, and this
//             probe cannot see into it. 73 of the tree's gates do this.
//   net       the gate opened a socket or fetched. Its input is not in the tree at all.
//   named     the gate takes fs by NAMED import. Node synthesises those bindings from the builtin's exports
//             object when the module links, and this probe patches that object -- so a named binding
//             captured at link time may not route through the patch. 114 of 917 fs-using gates are written
//             that way and every one of them is disqualified rather than trusted. THAT IS A LIMIT OF THE
//             MECHANISM AND IT IS RECORDED AS ONE.
//
// A gate with no recorded set, an empty set, or any disqualifier ALWAYS RUNS. The allowlist is the exception.
"use strict";
import fs from "node:fs";
import path from "node:path";
import Module from "node:module";
import { fileURLToPath } from "node:url";

const OUT = process.env.SWEK_PROBE_OUT;
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const reads = new Set(), dirs = new Set();
const flags = { spawned: false, net: false, threw: false };

const rel = (p) => {
    try {
        // fileURLToPath, not `.pathname`: on Windows a file URL's pathname is "/C:/x" and the leading slash
        // makes every path.relative below wrong. tools/ship/winPathGuard-selfcheck.mjs names both idioms and
        // caught both of them here, in a file written the same day, which is what that gate is for.
        const s = typeof p === "string" ? p : (p && p.href ? fileURLToPath(p.href) : String(p));
        if (!s.startsWith("/")) return null;                  // a fd or a Buffer: not a path we can hash
        const r = path.relative(ENG, s).split(path.sep).join("/");
        return r.startsWith("..") ? null : r;                 // outside the tree: not ours to invalidate on
    } catch { return null; }
};

// *** THE DEFAULT EXPORT OBJECT IS WHAT 786 OF THE 917 fs-USING GATES REACH THROUGH. *** node:fs is CommonJS
// underneath, so `import fs from "node:fs"` hands out that object and a property written here is seen. A
// named import is a different mechanism and is handled by disqualifying the gate, above.
for (const name of ["readFileSync", "readFile", "openSync", "createReadStream"]) {
    const orig = fs[name];
    if (typeof orig !== "function") continue;
    fs[name] = function (p, ...rest) { const r = rel(p); if (r) reads.add(r); return orig.call(this, p, ...rest); };
}
for (const name of ["readdirSync", "readdir"]) {
    const orig = fs[name];
    if (typeof orig !== "function") continue;
    fs[name] = function (p, ...rest) { const r = rel(p); if (r) dirs.add(r); return orig.call(this, p, ...rest); };
}
// statSync is a READ of the directory entry rather than of the file, and a gate that stats a path to decide
// whether it exists depends on that path existing. Recorded as a directory-shaped dependency.
for (const name of ["statSync", "existsSync", "lstatSync"]) {
    const orig = fs[name];
    if (typeof orig !== "function") continue;
    fs[name] = function (p, ...rest) { const r = rel(p); if (r) dirs.add(r); return orig.call(this, p, ...rest); };
}

// child_process and net are DISQUALIFIERS rather than dependencies: what the child read is invisible here.
const origLoad = Module._load;
Module._load = function (request, ...rest) {
    if (/^(node:)?child_process$/.test(request)) flags.spawned = true;
    if (/^(node:)?(net|http|https|tls|dgram)$/.test(request)) flags.net = true;
    return origLoad.call(this, request, ...rest);
};
const origFetch = globalThis.fetch;
if (typeof origFetch === "function") globalThis.fetch = function (...a) { flags.net = true; return origFetch.apply(this, a); };

process.on("exit", () => {
    if (!OUT) return;
    try {
        fs.writeFileSync(OUT, JSON.stringify({
            reads: [...reads].sort(), dirs: [...dirs].sort(),
            spawned: flags.spawned, net: flags.net, exit: process.exitCode ?? 0,
        }));
    } catch {}
});
