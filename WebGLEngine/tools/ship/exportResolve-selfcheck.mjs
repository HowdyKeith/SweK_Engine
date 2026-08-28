// WebGLEngine/tools/ship/exportResolve-selfcheck.mjs
//
// Run: node tools/ship/exportResolve-selfcheck.mjs   (~3s)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// v3211 -- A NAMED IMPORT THAT THE TARGET DOES NOT EXPORT. Nothing in 604 gates asked this question.
//
// deadImportScan has answered "does the file this specifier names exist" since v3203, and it answered YES about
// tools/roundhouse/deviceModes.mjs every time, correctly. THE FILE WAS THERE. THE NAME WAS NOT -- eleven places
// import MODES from it and it has never exported MODES. Nine are static and die at load with a SyntaxError;
// because five of those nine are modules that OTHER gates import, the crash cascaded to SEVENTEEN dead gates.
// Two are destructured dynamic imports, which do not crash: they bind undefined and carry on.
//
// *** THE COST LANDED ON THE LIVE SERVER, NOT ON THE GATES. *** validateSpec reads modes[spec.device], so with
// undefined it took its `!modes` branch and refused EVERY device-mode job with `unknown device "lens"`. POST
// /jobs/add and the peer's local re-validation in runJobs.mjs have both been dead for as long as those lines
// have existed, and the message blamed the caller for the server's own broken import. THE LOUD FAILURE WAS THE
// SAFE ONE: seventeen gates screaming got noticed the first time the suite was run end to end, and the quiet
// one had to be found by reading.
//
// WHERE THE IDEA CAME FROM, because it was not mine: microsoft/dynwinrt (public preview, 27 Jul 2026) generates
// its Windows bindings from .winmd metadata instead of hand-authoring a wrapper per class, so the wrapper cannot
// drift from what it wraps -- "regenerate, don't rebuild". SweK cannot adopt codegen and does not need to. A
// HAND-WRITTEN IMPORT IS A HAND-AUTHORED WRAPPER, and the cheap half of that idea is to CHECK it against the
// export list rather than generate it.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { unresolvedNamedImports, exportedNames } from "./deadImportScan.mjs";
// gateQuality caught this file on its FIRST run: three of its checks hunted a sentence in shipping source with a
// long contiguous regex, which is the prose-wrapping debt this tree has ratcheted since v3071 -- a comment
// re-wrapped during an edit stops matching text that never changed meaning. prose() and codeOnly() are the
// primitives that already exist for exactly this. THE BASELINE WAS NOT RAISED TO MEET ME (v3138).
// AND THE PRIMITIVE HAD TO BE THE RIGHT ONE, WHICH TOOK A SECOND GO: both sentences below live in STRING
// LITERALS -- a thrown Error message and a validator problem string -- not in comments. prose() keeps ONLY
// comments, so it found neither and the checks failed. noComments() is the one for "text the code contains";
// codeOnly is for an idiom and prose is for "does this file explain itself". Three primitives, three questions.
import { noComments } from "./sourceScan.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

// ---- 1. THE TREE RESOLVES -----------------------------------------------------------------------------------------
const scan = unresolvedNamedImports(ROOT);
{
    ok("!! *** every named import in the tree resolves to a name the target actually exports ***",
        scan.missing.length === 0,
        scan.checked + " named bindings across " + scan.files + " files, " + scan.missing.length + " missing" +
        (scan.missing.length ? ": " + scan.missing.map((m) => m.file + " wants " + m.name + " from " + m.target).join("; ") : "") +
        ". THE FILE EXISTING AND THE NAME EXISTING ARE TWO QUESTIONS, and until this gate only the first was asked");

    ok("...and the three skip reasons are reported APART, never folded into the total",
        typeof scan.cjs === "number" && typeof scan.unresolved === "number",
        scan.cjs + " bindings skipped because the target is CommonJS (module.exports cannot be enumerated by " +
        "reading it, and an empty set would make every importer look broken -- THE REFUSAL IS THE ANSWER), " +
        scan.unresolved + " whose specifier does not resolve at all, which is deadImportScan's question and " +
        "not this one. ONE TOTAL WOULD HIDE WHICH OF THE THREE GREW");
}

// ---- 2. DETECTION POWER, DERIVED FROM THE TOOL'S OWN DEFINITION ---------------------------------------------------
// A CLAIM ABOUT ABSENCE MUST BE SHOWN FAILING. Each fixture is one of the three FORMS the scan claims to read.
{
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "swek-exportresolve-"));
    const w = (rel, txt) => { const p = path.join(tmp, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, txt); return p; };

    w("target.mjs", "export function realName() { return 1; }\nexport const alsoReal = 2;\n");
    w("a-static.mjs", 'import { realName, ghostA } from "./target.mjs";\nexport const x = realName + ghostA;\n');
    w("b-reexport.mjs", 'export { ghostB } from "./target.mjs";\n');
    w("c-dynamic.mjs", 'export async function go() { const { ghostC } = await import("./target.mjs"); return ghostC; }\n');

    const r = unresolvedNamedImports(tmp);
    const got = new Set(r.missing.map((m) => m.name));
    ok("!! *** all three forms are caught: static import, re-export, and destructured dynamic import ***",
        got.has("ghostA") && got.has("ghostB") && got.has("ghostC") && !got.has("realName"),
        "caught " + [...got].sort().join(", ") + " and left realName alone. THE RE-EXPORT AND THE DYNAMIC FORM " +
        "ARE NOT DECORATION: `export { x } from` fails at load exactly as an import does, and the dynamic form " +
        "is the one that binds undefined in silence -- it is the form the live server was broken by");

    fs.rmSync(tmp, { recursive: true, force: true });
}

// ---- 3. THE FALSE POSITIVE THAT NEARLY SHIPPED, PINNED SO IT CANNOT COME BACK -------------------------------------
{
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "swek-exportresolve-fp-"));
    const w = (rel, txt) => { const p = path.join(tmp, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, txt); return p; };

    // (a) THE ONE THAT MATTERS. voxel/voxelRLE.js really does write this, and my first scan read only the first
    //     declarator -- so it reported RLE_SY, RLE_SZ and RLE_N missing from a file that plainly exports them.
    //     TWENTY-ONE FALSE POSITIVES OUT OF THIRTY, a 70% rate from one missing case, and a gate that shipped
    //     with it would have been switched off within a day.
    w("multi.mjs", "export const A_X = 32, A_Y = 256, A_Z = 32, A_N = A_X * A_Y * A_Z;\nexport const OBJ = { a: 1, b: 2 }, AFTER = 3;\n");
    w("use-multi.mjs", 'import { A_X, A_Y, A_Z, A_N, OBJ, AFTER } from "./multi.mjs";\nexport const s = A_X + A_Y + A_Z + A_N + AFTER + OBJ.a;\n');
    // (b) a name arriving through `export * from` is exported, transitively
    w("deep.mjs", "export function fromDeep() { return 7; }\n");
    w("barrel.mjs", 'export * from "./deep.mjs";\n');
    w("use-barrel.mjs", 'import { fromDeep } from "./barrel.mjs";\nexport const t = fromDeep;\n');
    // (c) a CommonJS target is SKIPPED, not failed
    w("cjs.js", "function hidden() { return 1; }\nmodule.exports = { hidden };\n");
    w("use-cjs.mjs", 'import { hidden } from "./cjs.js";\nexport const u = hidden;\n');

    const r = unresolvedNamedImports(tmp);
    ok("!! *** a multi-declarator `export const A = 1, B = 2, C = 3;` exports ALL of them ***",
        !r.missing.some((m) => /^A_/.test(m.name) || m.name === "AFTER" || m.name === "OBJ"),
        "reported " + r.missing.length + " missing, none of them a second declarator. THE INITIALISERS CONTAIN " +
        "COMMAS OF THEIR OWN inside (), [] and {}, so the list is split on TOP-LEVEL commas -- `OBJ = { a: 1, " +
        "b: 2 }, AFTER = 3` is two declarators and not four");

    ok("...and a name arriving through `export * from` counts as exported",
        !r.missing.some((m) => m.name === "fromDeep"),
        "a barrel re-export is followed transitively; ignoring it would false-alarm on every barrel in the tree");

    ok("...and a CommonJS target is SKIPPED rather than failed",
        !r.missing.some((m) => m.name === "hidden") && r.cjs > 0,
        r.cjs + " binding(s) skipped. `module.exports = { ... }` cannot be enumerated by reading the file, so " +
        "the honest answer is UNKNOWN. Returning an empty set instead would fail every importer of every CJS " +
        "module in ai-bridge, and a checker that guessed would be switched off");

    fs.rmSync(tmp, { recursive: true, force: true });
}

// ---- 4. THE ONE THIS WAS BUILT FOR, SO IT CANNOT QUIETLY RETURN ---------------------------------------------------
{
    const dm = fs.readFileSync(path.join(ROOT, "tools", "roundhouse", "deviceModes.mjs"), "utf8");
    const names = exportedNames(path.join(ROOT, "tools", "roundhouse", "deviceModes.mjs"));

    ok("!! *** deviceModes.mjs exports deviceModeTable, and still does NOT export MODES ***",
        names.has("deviceModeTable") && !names.has("MODES"),
        "the repair is a DERIVED TABLE, not a hand-written map and not an alias. Aliasing MODES to " +
        "CANDIDATE_MODES was the recorded trap -- every importer would PASS while sweeping nothing (v3177: a " +
        "system whose checks pass because it does nothing is strictly worse than a crash, because a crash is " +
        "visible) -- AND THEY ARE NOT EVEN THE SAME SHAPE: CANDIDATE_MODES is an ARRAY, every caller uses a MAP");

    ok("!! *** and the table REFUSES to be empty ***",
        // BOTH HALVES GO THROUGH noComments AND NOT codeOnly, AND THE SECOND ONE IS WHY: codeOnly blanks STRING
        // LITERALS, so `throw new Error("deviceModeTable: ...")` keeps the `throw new Error(` and loses the
        // message -- a regex spanning both matches neither instrument cleanly. THIRD TIME IN ONE FILE that
        // picking the wrong one of the three cost a run.
        /refusing to return an empty/i.test(noComments(dm)) && /throw new Error\("deviceModeTable/.test(noComments(dm)),
        "a zero-device table makes every caller sweep nothing and report a clean pass over no work, which is " +
        "exactly what the lazy repair of this bug would have produced. IT THROWS RATHER THAN RETURNING {}");

    const jq = fs.readFileSync(path.join(ROOT, "tools", "roundhouse", "jobQueue.mjs"), "utf8");
    ok("!! *** and 'my table is missing' no longer wears the same words as 'you named a device that does not exist' ***",
        /WIRING FAULT on the validating side/i.test(noComments(jq)),
        "for as long as MODES has been broken, a perfectly good lens/deflect job came back `unknown device " +
        "\\\"lens\\\"`. THE GUARD FAILING CLOSED IS WHAT KEPT THIS A DEAD SUBSYSTEM RATHER THAN AN OPEN DOOR, and " +
        "that `!modes ||` was deliberate -- only the MESSAGE was wrong, and the wrong message is why nobody " +
        "went looking for four hundred versions");
}

console.log();
console.log("  ----  SCOPE, SO THIS IS NOT READ AS MORE THAN IT IS: this checks NAMED bindings against relative");
console.log("  ----  specifiers. A default import binds whatever the module default-exports under a local name,");
console.log("  ----  so there is no name to check; `import * as ns` would need every property access followed;");
console.log("  ----  bare npm specifiers are somebody else's package. CHECKING ONLY WHAT CAN BE CHECKED is the");
console.log("  ----  difference between a gate people keep and one they switch off.");
if (fails) { console.log("exportResolve-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("exportResolve-selfcheck: all checks pass");
