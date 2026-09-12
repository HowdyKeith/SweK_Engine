// tools/ship/sourceExtensions-selfcheck.mjs -- v4564
//
// Run: node tools/ship/sourceExtensions-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// *** TWO OF THIS TREE'S WALKS DISAGREED WITH EACH OTHER ABOUT WHAT A SOURCE FILE IS, AND BOTH WERE WRONG. ***
//
// tools/ship/treeRead.mjs matched .mjs and .js. ".cjs" matches NEITHER -- the dot is part of the pattern, so
// ".cjs" is not ".js" with a c in front -- so six CommonJS modules in ai-bridge/, 1,471 lines, every one
// `require`d by ai-bridge/server.js at startup, were outside every census built on that walk.
//
// tools/check.mjs, the syntax guard, matched ONLY .js: of 4,143 source files it checked 1,527, and its own
// summary line reads as coverage. Every ES module written since this project moved to them had never been
// parsed by the thing whose job is parsing them.
//
// The rules are one rule now (tools/ship/sourceKind.mjs) and this file drives it, because two definitions of
// "what is a source file" is exactly how a tree ends up with a census that cannot see CommonJS and a guard
// that cannot see ES modules.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SOURCE_EXT, isSource, kindOf } from "./sourceKind.mjs";
import { treeFiles, SOURCE_EXT as TREE_EXT } from "./treeRead.mjs";
import { sources as driftSources } from "./recordDrift.mjs";
import { engineSources } from "./orreryFleetScan.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const say = (m) => console.log("  ----  " + m);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

console.log("1. *** \".cjs\" IS NOT \".js\", AND THAT IS THE WHOLE OF THE FIRST HALF ***");
{
    // driven on strings, because the confusion is about the STRING and a fixture made of files would hide it
    const cases = [["a/b.cjs", true], ["a/b.mjs", true], ["a/b.js", true], ["a/b.json", false],
                   ["a/b.wgsl", false], ["a/bcjs", false], ["a/b.CJS", false]];
    const wrong = cases.filter(([p, want]) => isSource(p) !== want);
    ok("!! the source rule admits all three and nothing else, including a name that merely ENDS in cjs",
       wrong.length === 0 && SOURCE_EXT.length === 3,
       cases.map(([p, w]) => `${p}:${w ? "yes" : "no"}`).join(" ") +
       `. ${wrong.length} disagreements. The old rule was mjs-or-js and a file called b.cjs matched neither, ` +
       "which is not a subtle failure -- it is the pattern reading exactly as written.");

    const kinds = [["x/y.mjs", "module"], ["ai-bridge/y.mjs", "module"], ["x/y.cjs", "commonjs"],
                   ["ai-bridge/y.cjs", "commonjs"], ["ai-bridge/y.js", "commonjs"], ["world/y.js", "module"],
                   ["x/y.txt", null]];
    const bad = kinds.filter(([p, want]) => kindOf(p) !== want);
    ok("!! *** THE EXTENSION DECIDES, AND THE DIRECTORY ONLY BREAKS THE TIE .js LEAVES ***",
       bad.length === 0,
       kinds.map(([p, k]) => `${p}->${k}`).join("  ") + `. ${bad.length} wrong. tools/check.mjs split ` +
       "CommonJS from modules by DIRECTORY -- everything under ai-bridge/ was a script -- and 56 of the " +
       "files there are .mjs using import and export. That was harmless only while its walk could not see " +
       "them; widening the walk without fixing the split would have handed real ES modules to a script " +
       "parser, which is the same defect one step further on.");
}

console.log("\n2. *** THE SHARED WALK NOW SEES ALL THREE, ASKED OF THE WALK RATHER THAN OF ITS PATTERN ***");
{
    const files = treeFiles(ENG);
    const by = { ".js": 0, ".mjs": 0, ".cjs": 0, other: 0 };
    for (const f of files) { const e = path.extname(f.path); if (e in by) by[e]++; else by.other++; }
    say(`treeFiles: ${files.length} files -- ${by[".js"]} .js, ${by[".mjs"]} .mjs, ${by[".cjs"]} .cjs, ${by.other} other`);
    ok("!! *** THE CENSUS WALK RETURNS CommonJS MODULES, WHICH IT NEVER DID BEFORE v4564 ***",
       by[".cjs"] >= 6 && by[".mjs"] > 2000 && by.other === 0,
       `${by[".cjs"]} CommonJS files in the shared walk. This is asked of the RESULT and not of ` +
       "TREE_EXT: a pattern can be widened and a caller can still filter it back out, and only the answer " +
       "says which happened.");

    const d = driftSources(ENG).filter((f) => path.extname(f.path) === ".cjs").length;
    const e = engineSources(ENG).filter((f) => path.extname(f.path) === ".cjs").length;
    ok("!! ...and so do the two censuses built on it, and the vendor-dependant scan beside them",
       d >= 6 && e >= 6,
       `recordDrift.sources ${d} .cjs, orreryFleetScan.engineSources ${e} .cjs. None of the six names a ` +
       "vendor path today, so no dependant moved -- what changed is that one WOULD now be seen. The old " +
       "rule could not have found it.");
}

console.log("\n3. *** WHAT WAS INVISIBLE: SIX MODULES THE SERVER LOADS AT STARTUP ***");
{
    const cjs = treeFiles(ENG).filter((f) => path.extname(f.path) === ".cjs");
    const server = fs.readFileSync(path.join(ENG, "ai-bridge", "server.js"), "utf8");
    const required = cjs.filter((f) => server.includes(path.basename(f.path, ".cjs")));
    const lines = cjs.reduce((s, f) => s + f.text.split("\n").length, 0);
    say(cjs.map((f) => path.basename(f.path)).join(", "));
    ok("!! *** EVERY ONE OF THEM IS LIVE: ai-bridge/server.js NAMES ALL SIX ***",
       cjs.length >= 6 && required.length === cjs.length && lines > 1000,
       `${cjs.length} CommonJS modules, ${lines} lines, ${required.length} named by server.js -- a WAD ` +
       "geometry parser, a WAD texture decoder, an install checker, a tool prober, a Trellis source patcher " +
       "and a mesh-generator readiness probe. Not dead code, not a fixture: production code that no " +
       "instrument in this tree had counted a line of.");
}

console.log("\n4. *** AND THE SYNTAX GUARD HAD NEVER PARSED AN ES MODULE ***");
{
    const src = fs.readFileSync(path.join(ENG, "tools", "check.mjs"), "utf8");
    // the guard is a SCRIPT that spawns a parse per file and takes 31 s, so what is asserted here is that it
    // takes its rule from the shared module rather than keeping a second one
    const usesShared = /from "\.\/ship\/sourceKind\.mjs"/.test(src) && /new Set\(SOURCE_EXT\)/.test(src)
                    && /kindOf\(p, \{ bridge: isBridge \}\)/.test(src);
    ok("!! the guard's walk and its CommonJS split both come from the shared rule",
       usesShared,
       "it checked 1,527 of 4,143 files before v4564 and 4,154 after, all green -- a NULL RESULT, and the " +
       "value is not the zero: it is that the number it reports is now the number it means. 11 s to 31 s, " +
       "and it is not in the ship-time sweep.");
}

console.log("\n" + (fails ? `sourceExtensions-selfcheck: ${fails} FAILED` : "sourceExtensions-selfcheck: all checks pass"));
console.log("UNCHECKED HERE, AND IT IS THE ROUND'S LIMIT RATHER THAN AN OVERSIGHT: the tree has many gates " +
    "that own a PRIVATE walk with their own extension rule -- orphanTriage, graveyard, shaderCensus, " +
    "wgslCorpus, citedSources and a dozen more. This round changed the two SHARED definitions (treeRead's " +
    "and check.mjs's, now one rule in sourceKind.mjs) and orreryFleetScan's, because those are the ones " +
    "other files build on. Every private walk still decides for itself, and a .cjs file is still invisible " +
    "to most of them. What that costs is measurable per gate and was not measured here.");
process.exit(fails ? 1 : 0);
