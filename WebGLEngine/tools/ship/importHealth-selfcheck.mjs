// WebGLEngine/tools/ship/importHealth-selfcheck.mjs -- v4451
//
// Run: node tools/ship/importHealth-selfcheck.mjs   (~200 ms, no network, no browser)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// *** A GATE THAT CANNOT LOAD IS A GATE THAT CHECKS NOTHING, AND ONE OF THEM DID THAT FOR TWENTY-ONE ROUNDS. ***
//
// v4430 ("the audit is the source now -- the register keeps only what the audit cannot know") deleted
// RECORDED_BUT_GREEN from redCensus.mjs. It was right to: the constant was a frozen copy of a set its one
// reader already derives four lines later, which is exactly the defect that round existed to remove. What it
// did not do was update that reader. From v4430 to v4451, tools/ship/redCensus-selfcheck.mjs threw
//
//     SyntaxError: The requested module './redCensus.mjs' does not provide an export named 'RECORDED_BUT_GREEN'
//
// before its first check ran -- the gate that re-runs the red register, dead, while this session repaired
// entries on that register round after round. Reviving it took one edit and immediately surfaced three real
// findings, none of which anything had been able to see.
//
// *** THE REASON NOBODY SAW IT IS THE PART WORTH BUILDING A GATE AROUND. *** redCensus-selfcheck is budgeted at
// 140,941 ms. The ship-time quick sweep runs everything under 3,000 ms, so it is EXCLUDED FROM EVERY SHIP --
// and the budget that excludes it was measured on a version that RAN. A gate that now dies in 40 ms is filed
// as one that takes two and a half minutes, so THE NUMBER THAT DESCRIBES IT IS WHAT HIDES IT. Fifty-one gates
// in this tree are over that cap. Any of them could be in the same state right now and no ship would notice.
//
// *** SO THIS ASKS THE QUESTION STATICALLY, WHICH IS WHAT MAKES IT CHEAP ENOUGH TO ASK OF ALL OF THEM. ***
// Running 51 slow gates to find out whether they load costs minutes and would put THIS gate over the cap too --
// a checker that cannot be run by the sweep it exists to backstop. But the failure was not a runtime one: a
// named import with no matching export is visible in the text of two files. Every relative import in every
// gate is resolved and every named binding is checked against what the target actually exports. 1,477 gates in
// about a fifth of a second, which is inside the sweep's budget by three orders of magnitude.
//
// ---- WHAT IT DELIBERATELY DOES NOT DO ---------------------------------------------------------------------
// It does not execute anything, so it cannot see a module that throws at load, a missing npm package, or a
// circular import that resolves to undefined at first read. It skips any target that re-exports with
// `export * from`, because the export set of such a module cannot be read from its own text and a guess would
// manufacture reds. Those skips are COUNTED AND PRINTED rather than passed over in silence -- a checker that
// quietly declines to answer for part of its population is the shape of gate this tree keeps finding.
//
// ---- SABOTAGE LOG -----------------------------------------------------------------------------------------
//   1. re-broke the original: put RECORDED_BUT_GREEN back into redCensus-selfcheck.mjs's import list
//      -> exit=1, red BY NAME, naming the file, the binding and the module. This is the twenty-one-round
//         failure, caught in 200 ms by the check written because of it.
//   2. pointed an import at "./doesNotExist.mjs"
//      -> exit=1, red on the unresolved-module line rather than the missing-binding one, which are different
//         faults and are counted apart.
//   3. renamed an export in a target module (redCensus.mjs: ENG -> ENGINE_ROOT)
//      -> exit=1, 9 red: every importer of that binding, named individually. A rename that misses callers is
//         the general form of what v4430 did once.
//   4. made the export scanner treat `export * from` as "exports nothing" instead of skipping
//      -> *** exit=0, ZERO RED, AND THAT IS THE FINDING. *** Not because the mistake is harmless -- treating
//         unknown as empty accuses every importer of a re-exporting module -- but because THIS TREE HAS NO
//         SUCH IMPORT, so the branch never runs. Its own report line said so and I read past it. A guard
//         nothing reaches is a guard nothing is checking, which is v4435's family. Closed with fixtures in a
//         temp directory (not planted files: a gate that leaves a gate behind grows its own population), and
//         the same sabotage is now exit=1 with the re-export line red by name.
//
//   5. removed multi-declarator support (stop at the first comma)
//      -> exit=1, 2 red: the fixture line AND the real population, which is the pair you want -- the fixture
//         proves the scanner, the population proves it matters.
//
// ---- AND THE GATE ITSELF WAS WRONG TWICE BEFORE IT WAS RIGHT, BOTH TIMES IN THE SAME DIRECTION ------------
// First run: 36 red, ALL FALSE. `export const RLE_SX = 32, RLE_SY = 256, ...` exports four bindings and the
// scanner took one identifier after the keyword; and `module.exports = { ... }` has no `export` keyword at
// all, though Node resolves named imports from it statically. Running one of the accused (voxelRLE-selfcheck,
// exit 0) was the entire cost of learning that.
// Second run: ~110 red, ALL FALSE. The repair anchored a declaration on `;` AT END OF LINE, and this tree
// writes `export const MU0 = 1.25663706212e-6;       // H/m, CODATA` -- which is most of its physics
// constants. Comments are stripped first now and the declaration is walked forward to its depth-0 semicolon.
// A CHECK THAT GOES RED ON CORRECT CODE TEACHES NOTHING, and this one did it twice before it taught anything.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { enumerateGates } from "./gateSweep.mjs";
import { noComments } from "./sourceScan.mjs";
import os from "node:os";
const require_tmpdir = () => os.tmpdir();

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m, d) => console.log("  ....  " + m + (d ? "   " + d : ""));
console.log("importHealth-selfcheck -- can every gate actually load?\n");

/** Named bindings a module exports, or null when its text cannot answer (re-exports). */
const exportsCache = new Map();
export function exportsOf(file) {
    if (exportsCache.has(file)) return exportsCache.get(file);
    let src;
    // *** COMMENTS ARE STRIPPED FIRST, AND NOT DOING SO COST A SECOND FALSE RUN. *** The first repair of this
    // scanner anchored a declaration on `;` AT END OF LINE, and this tree writes
    // `export const MU0 = 1.25663706212e-6;       // H/m, CODATA` -- a trailing comment after the semicolon,
    // which is most of the physics constants in it. ~110 more false accusations, every one of them a module
    // that exports exactly what its importer asks for. Stripping comments also stops a commented-out
    // `// export const FOO` from being offered as a real export, which is the error in the other direction.
    try { src = noComments(fs.readFileSync(file, "utf8")); } catch { exportsCache.set(file, null); return null; }
    // `export * from` republishes another module's bindings; nothing in THIS file names them, so the set is
    // unknowable here. Unknown, not empty -- see sabotage 4.
    if (/^\s*export\s*\*\s*from/m.test(src)) { exportsCache.set(file, null); return null; }
    const names = new Set();
    for (const m of src.matchAll(/^\s*export\s+(?:async\s+)?(?:function|class)\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
    // *** MULTI-DECLARATOR, AND ITS ABSENCE MADE THIRTY-SIX FALSE REDS ON THIS GATE'S FIRST RUN. ***
    // `export const RLE_SX = 32, RLE_SY = 256, RLE_SZ = 32, RLE_N = RLE_SX * RLE_SY * RLE_SZ;` exports FOUR
    // bindings; a regex that takes one identifier after the keyword sees RLE_SX and accuses every importer of
    // the other three. voxelRLE-selfcheck.mjs exits 0 and was named by this check, which is how it was found:
    // A CHECK THAT GOES RED ON CORRECT CODE TEACHES NOTHING, and running one of the accused was the whole
    // cost of learning that. Names are taken at the head of the declaration and after each comma AT DEPTH
    // ZERO, so an initialiser containing a comma -- `const A = f(1, 2), B = 3` -- does not offer `2` as an
    // export.
    // The declaration is walked FORWARD from the keyword to its depth-0 semicolon rather than matched by a
    // regex with an end anchor: a declaration can span lines, hold objects and arrays, and end anywhere.
    for (const m of src.matchAll(/\bexport\s+(?:const|let|var)\s+/g)) {
        let i = m.index + m[0].length, depth = 0, head = true, buf = "";
        for (; i < src.length; i++) {
            const ch = src[i];
            if ("([{".includes(ch)) { depth++; if (head && buf) { names.add(buf); buf = ""; } head = false; continue; }
            if (")]}".includes(ch)) { depth--; continue; }
            if (depth === 0 && ch === ";") { break; }
            if (depth === 0 && ch === ",") { if (head && buf) names.add(buf); head = true; buf = ""; continue; }
            if (!head) continue;
            if (/[A-Za-z0-9_$]/.test(ch)) buf += ch;
            else if (buf) { names.add(buf); buf = ""; head = false; }
            else if (!/\s/.test(ch)) head = false;
        }
        if (head && buf) names.add(buf);
    }
    for (const m of src.matchAll(/^\s*export\s*\{([^}]*)\}/gm)) {
        for (const part of m[1].split(",")) {
            const as = part.split(/\s+as\s+/);
            const name = (as.length > 1 ? as[1] : as[0]).trim();
            if (name) names.add(name);
        }
    }
    if (/^\s*export\s+default/m.test(src)) names.add("default");
    // *** COMMONJS TARGETS, THE OTHER HALF OF THAT SAME FIRST RUN. *** A .js file with
    // `module.exports = { PROXYABLE, canServe, ... }` has no `export` keyword anywhere, and Node still lets an
    // ESM importer name those bindings -- cjs-module-lexer reads them statically at load. A scanner that only
    // knows ESM reports every one of them missing, which is six false reds from capabilityProxy.js alone.
    if (!names.size) {
        for (const m of src.matchAll(/^\s*module\.exports\s*=\s*\{([^}]*)\}/gm)) {
            for (const part of m[1].split(",")) {
                const name = part.split(":")[0].trim();
                if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
            }
        }
        for (const m of src.matchAll(/^\s*(?:module\.)?exports\.([A-Za-z_$][\w$]*)\s*=/gm)) names.add(m[1]);
        // A CJS module whose exports are built dynamically (a loop, an Object.assign) cannot be read this way
        // either, and unknown is not empty -- same rule as `export * from` above.
        if (!names.size && /module\.exports/.test(src)) { exportsCache.set(file, null); return null; }
    }
    exportsCache.set(file, names);
    return names;
}

const gates = enumerateGates();
const missingModule = [], missingBinding = [];
let checkedImports = 0, skippedStar = 0, skippedBare = 0;

for (const rel of gates) {
    const file = path.join(ENG, rel);
    let src;
    try { src = fs.readFileSync(file, "utf8"); } catch { continue; }
    for (const m of src.matchAll(/^\s*import\s+([^;]*?)\s+from\s+["']([^"']+)["']/gm)) {
        const clause = m[1], spec = m[2];
        // Only relative specifiers: a bare specifier is an npm package, whose presence is node_modules' business
        // and not a claim this file can settle from source text.
        if (!spec.startsWith(".")) { skippedBare++; continue; }
        const target = path.resolve(path.dirname(file), spec);
        if (!fs.existsSync(target)) { missingModule.push({ gate: rel, spec }); continue; }
        const have = exportsOf(target);
        if (have === null) { skippedStar++; continue; }
        const braces = clause.match(/\{([^}]*)\}/);
        if (!braces) { checkedImports++; continue; }              // default or namespace import
        for (const part of braces[1].split(",")) {
            const name = part.split(/\s+as\s+/)[0].trim();
            if (!name) continue;
            checkedImports++;
            if (!have.has(name)) missingBinding.push({ gate: rel, name, spec });
        }
    }
}

report(`${gates.length} gates, ${checkedImports} named bindings resolved across relative imports`,
       `${skippedBare} bare specifiers not checked (npm packages), ${skippedStar} imports whose target re-exports`);

ok("!! *** every relative import in every gate resolves to a file that exists ***",
    missingModule.length === 0,
    missingModule.length
        ? missingModule.map((e) => e.gate + " -> " + e.spec).join("; ")
        : "a specifier that resolves to nothing is a gate that dies before its first check, and the sweep " +
          "cannot see it if the gate is over the 3,000 ms cap -- fifty-one of them are");

ok("!! *** and every NAMED binding a gate imports is actually exported by the module it names ***",
    missingBinding.length === 0,
    missingBinding.length
        ? missingBinding.map((e) => e.gate + " imports { " + e.name + " } from " + e.spec + ", which does not export it").join("; ")
        : "THIS IS THE ONE THAT HAPPENED. v4430 deleted RECORDED_BUT_GREEN from redCensus.mjs and left " +
          "redCensus-selfcheck.mjs importing it; the gate that re-runs the red register threw before its " +
          "first check for TWENTY-ONE ROUNDS, invisible because its 140,941 ms budget keeps it out of every " +
          "quick sweep. Caught here in milliseconds, because the fault is in the text of two files");

// The population is worth asserting: a checker that silently walked zero files would pass both lines above.
ok("...and the population is the real gate list, not an empty walk",
    gates.length > 1000 && checkedImports > 500,
    `${gates.length} gates and ${checkedImports} bindings. A CHECKER THAT WALKED NOTHING WOULD PASS EVERY LINE ` +
    "ABOVE, which is the failure mode of every census in this tree that has ever been wrong");

/* ---------------------------------------------------------------------------------------------------------
 * THE SKIPS ARE DRIVEN, BECAUSE A SABOTAGE FOUND THEM UNREACHABLE.
 *
 * Sabotage 4 made the `export * from` branch treat "unknown" as "exports nothing" -- the mistake that would
 * accuse every importer of a re-exporting module -- and the gate went ZERO RED. The reason is in its own
 * report line: this tree currently has NO gate importing from a module that re-exports, so the branch never
 * runs. *** A GUARD NOTHING REACHES IS A GUARD NOTHING IS CHECKING, *** which is v4435's family and v4447's
 * ("the stuck-path branch was UNREACHABLE, so counting stuck paths as transmitted cost nothing").
 *
 * Fixtures rather than planted files: writing a real `export * from` module into the tree would put it in
 * enumerateGates' population, and a gate that leaves a gate behind grows the thing it measures. exportsOf is
 * called directly on files in a temp directory, which drives the branch and leaves nothing.
 * ------------------------------------------------------------------------------------------------------ */
{
    const tmp = fs.mkdtempSync(path.join(require_tmpdir(), "swek-importhealth-"));
    try {
        const w = (name, body) => { const f = path.join(tmp, name); fs.writeFileSync(f, body); return f; };
        const plain = w("plain.mjs", "export const A = 1, B = 2;\nexport function C() {}\n");
        const star = w("star.mjs", "export * from './plain.mjs';\nexport const D = 4;\n");
        const cjs = w("dyn.cjs", "const o = {}; for (const k of ['x']) o[k] = 1;\nmodule.exports = o;\n");
        const cjsLit = w("lit.cjs", "function f(){}\nmodule.exports = { f, g: 1 };\n");

        ok("!! *** a multi-declarator export yields EVERY name, not just the first ***",
            (() => { const e = exportsOf(plain); return e && e.has("A") && e.has("B") && e.has("C"); })(),
            "`export const A = 1, B = 2;` exports two bindings. Taking one identifier after the keyword " +
            "produced THIRTY-SIX false accusations on this gate's first run, voxelRLE-selfcheck (exit 0) " +
            "among them");
        ok("!! *** a module that RE-EXPORTS answers `unknown`, not `nothing` ***",
            exportsOf(star) === null,
            "`export * from` republishes bindings no line of this file names, so its export set cannot be read " +
            "here. UNKNOWN IS NOT EMPTY: sabotage 4 made it empty and would have accused every importer of a " +
            "module that is perfectly fine. This fixture is why that sabotage can go red at all -- against the " +
            "real tree it went ZERO, because nothing here imports from such a module");
        ok("...and a CommonJS module with a literal export object is read",
            (() => { const e = exportsOf(cjsLit); return e && e.has("f") && e.has("g"); })(),
            "Node resolves named imports from CJS statically; a scanner that only knows ESM called six " +
            "capabilityProxy.js bindings missing on the first run");
        ok("...and a CommonJS module whose exports are built at runtime also answers `unknown`",
            exportsOf(cjs) === null,
            "the same rule one level along: a set assembled by a loop is not in the text either");
    } finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} }
}

console.log("");
report("WHAT THIS DOES NOT CLAIM: that any gate RUNS. Nothing is executed here, so a module that throws at");
report("load, a missing npm package, or a circular import that reads undefined are all invisible to it. It");
report("answers one question -- does every gate's import list refer to things that exist -- and that question");
report("is worth asking on its own because it is the one failure that costs nothing to have and everything to");
report("miss: a gate that cannot load reports no failures, which is indistinguishable from a gate that passes.");
console.log("\nimportHealth-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
