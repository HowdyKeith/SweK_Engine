// WebGLEngine/tools/ship/winPathShim.mjs -- UNNUMBERED (the version is chosen at ship time; the gate is tools/ship/winPathLint-selfcheck.mjs, the command tools/ship/winPathLint.mjs --probe)
//
// A SANDBOX THAT SPELLS PATHS THE WAY THE RIG DOES. Load it with `node --import tools/ship/winPathShim.mjs <gate>`: the gate then runs on this Linux box with the three behaviours of node on win32 that have turned a green gate red on the rig, over and over (v4882, v4892, v4896, v4906, v4907, v4911, v4912 in docs/CHANGELOG.md):
//   1 path.join, path.resolve and path.normalize spell a path with BACKSLASHES when it is a FAKE root -- one whose first segment is not a directory of this box ("/x", "/r", "/e", the roots a stub reader is keyed by) -- as win32 does. A stub `read: (p) => files[p]` keyed by "/x/brain/a.jsonl" then gets "\x\brain\a.jsonl" and answers undefined, exactly as it did on the rig (v4912).
//   2 path.relative answers with backslashes for every path (v4882: deviceReach and shaderEmitters compared path.relative to posix names).
//   3 the fs sync calls take either separator, as Windows does, so the gate can still read what it just spelled with backslashes (otherwise every path.relative would fail the sandbox for a reason the rig does not have).
// REAL paths (/tmp, /home, the repository) are NOT respelled by join and resolve, because the box's own fs and child processes need them: the shim reproduces the SPELLING that stubs and string comparisons see, not the file system. It does not reproduce: the missing execute bit, kill semantics, a space in the node path, a drive letter, case-insensitivity or the 260-character limit -- the static rules of tools/ship/winPathLint.mjs hold the first three of those that a line of code shows.
// No exports on purpose: importing it is the act. Pure but for patching `path` and `fs` in the process that imports it.
"use strict";
import path from "node:path";
import fs from "node:fs";

const real = { join: path.join, resolve: path.resolve, normalize: path.normalize, relative: path.relative }, topSeen = new Map(), existsOnBox = fs.existsSync;
const topExists = (seg) => { if (!topSeen.has(seg)) topSeen.set(seg, existsOnBox("/" + seg)); return topSeen.get(seg); };
/** A posix absolute path whose first segment is not a directory of this box: a root a gate invented. */
const fake = (r) => typeof r === "string" && r.startsWith("/") && !topExists(r.split("/")[1] || "");
const wrap = (f) => (...a) => { const r = f(...a); return fake(r) ? r.replace(/\//g, "\\") : r; };
path.join = wrap(real.join); path.resolve = wrap(real.resolve); path.normalize = wrap(real.normalize);
path.relative = (...a) => real.relative(...a).replace(/\//g, "\\");

const fwd = (x) => (typeof x === "string" && x.includes("\\") ? x.replace(/\\/g, "/") : x), TWO = new Set(["copyFileSync", "renameSync"]);
for (const n of ["readFileSync", "writeFileSync", "appendFileSync", "existsSync", "statSync", "lstatSync", "readdirSync", "mkdirSync", "rmSync", "unlinkSync", "copyFileSync", "renameSync", "accessSync", "openSync", "realpathSync", "readlinkSync", "rmdirSync", "utimesSync", "chmodSync", "mkdtempSync"]) {
    const o = fs[n]; if (typeof o !== "function") continue;
    fs[n] = function (a, b, ...rest) { return o.call(this, fwd(a), TWO.has(n) ? fwd(b) : b, ...rest); };
}
