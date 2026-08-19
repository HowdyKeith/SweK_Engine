// WebGLEngine/tools/ship/unboundBuiltin-selfcheck.mjs -- v3033
//
// Run: node tools/ship/unboundBuiltin-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// A MODULE USED IN A BRANCH THAT NEVER RUNS HERE IS STILL A CRASH THERE.
//
// Keith's rig: `ReferenceError: os is not defined`, from terrainBuildBridge. v3004 added a WINDOWS-ONLY pathNote
// using os.homedir() AND NEVER IMPORTED os. Every Linux and Mac run took the other side of the ternary, never
// evaluated the expression, and the gate passed on three platforms.
//
// THAT FIX WAS THE ROUND THAT EXISTED TO STOP PLATFORM-SPECIFIC BEHAVIOUR HIDING, and it hid a crash inside
// itself. Third instance of the class after the ESM URL-scheme crash (v2997) and the null pathNote (v3004), and
// the answer is the same each time: READ IT INSTEAD OF RUNNING IT, because a static question has the same
// answer on every platform.
//
// AND THE DETECTOR FOUND A SECOND ONE NOBODY WAS LOOKING FOR: tunnelCandidates-selfcheck used path.dirname and
// url.fileURLToPath with neither imported, at line 70, in a branch this run does not take. THAT GATE PASSES.
import { scan, codeOnly, BUILTINS } from "./unboundBuiltin.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");
const DIRS = ["ai-bridge", "tools/ship", "tools/roundhouse", "tools/bench", "ui", "render", "physics"];
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// KNOWN FALSE POSITIVE, named rather than silenced. ui/kpopFavorites.js has a LOCAL VARIABLE called `url`
// holding a string, and `url.split("/")` is indistinguishable from a namespace access without a real parser.
// A detector that forced this to zero would either need a JS parser or a wildcard, and a wildcard is how a
// class stops being visible -- the same reasoning the pageReach baseline carries.
const KNOWN = [{ file: "kpopFavorites.js", module: "url", why: "local variable named url, holding a string" }];

// ---- 1. THE BUG THAT WAS SHIPPED IS FIXED -------------------------------------------------------------------
{
    const t = fs.readFileSync(path.join(ENG, "ai-bridge", "terrainBuildBridge.js"), "utf8");
    ok("!! terrainBuildBridge imports os", /require\("os"\)/.test(t),
       "os.homedir() sits in the WINDOWS-ONLY branch, so no Linux run ever evaluated it");
    ok("...and still uses it", /os\.homedir\(\)/.test(t),
       "the fix is the import, not deleting the feature the rig was there to check");
    const tc = fs.readFileSync(path.join(ENG, "tools", "roundhouse", "tunnelCandidates-selfcheck.mjs"), "utf8");
    ok("!! the SECOND instance is fixed too", /import path from "node:path"/.test(tc) && /import url from "node:url"/.test(tc),
       "found by the detector rather than by anything executing -- that gate passes today with a latent crash at line 70");
}

// ---- 2. THE DETECTOR IS ACCURATE, WHICH IS THE WHOLE DIFFICULTY --------------------------------------------------
{
    const all = DIRS.flatMap((d) => scan(path.join(ENG, d)));
    const unexplained = all.filter((r) => !KNOWN.some((k) => k.file === r.file && k.module === r.module));
    ok("!! nothing unbound outside the named exception", unexplained.length === 0,
       unexplained.length ? "UNBOUND: " + unexplained.map((r) => r.file + ":" + r.module).join(", ")
                          : all.length + " hit(s), all of them the one named false positive");
    ok("...and the exception is NAMED with its reason", KNOWN.every((k) => (k.why || "").length > 20),
       KNOWN[0].file + " -- " + KNOWN[0].why + ". A wildcard here is how a class stops being visible.");
    ok("the scan covers more than one directory", DIRS.length >= 5, DIRS.length + " directories");
}

// ---- 3. THE FALSE-POSITIVE TRAP I FELL INTO, GATED SO IT CANNOT RETURN -------------------------------------------
//
// My first version read BOTH usage and bindings from the stripped code. codeOnly() blanks string literals, so
// `require("os")` became `require("")` -- I had deleted the evidence I was searching for, and it reported 48
// false positives across 193 bridges. A detector that flags everything is worse than none.
{
    ok("!! codeOnly blanks string CONTENTS", /require\(""\)/.test(codeOnly('require("os")')),
       "which is correct for finding USES, and fatal for finding BINDINGS");
    const src = 'const fs = require("fs"), os = require("os");\nfunction f(){ return os.homedir(); }';
    const dir = fs.mkdtempSync(path.join(ENG, "tools", ".ub-"));
    try {
        fs.writeFileSync(path.join(dir, "x.js"), src);
        ok("!! a COMMA-SEPARATED require still counts as bound", scan(dir).length === 0,
           "this exact form is what produced 48 false positives -- bindings are read from the RAW source now");
        fs.writeFileSync(path.join(dir, "y.js"), 'const path = require("path");\nfunction f(){ return os.homedir(); }');
        ok("!! SABOTAGE: the v3004 bug shape IS caught", scan(dir).some((r) => r.file === "y.js" && r.module === "os"),
           "path imported, os used and not -- exactly what shipped");
        fs.writeFileSync(path.join(dir, "z.js"), 'export function f(path){ return path.join("a"); }');
        ok("...and a PARAMETER named after a builtin is not a finding", !scan(dir).some((r) => r.file === "z.js"),
           "receiving `path` as an argument is the commonest shape in this tree and must not be noise");
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    ok("the builtin list is not empty", BUILTINS.length >= 8, BUILTINS.join(", "));
}

console.log(fails ? "\nunboundBuiltin-selfcheck: " + fails + " FAILED" : "\nunboundBuiltin-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
