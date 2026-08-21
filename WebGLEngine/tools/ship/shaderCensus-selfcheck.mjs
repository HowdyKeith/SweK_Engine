// WebGLEngine/tools/ship/shaderCensus-selfcheck.mjs
//
// Run: node tools/ship/shaderCensus-selfcheck.mjs   (~0.3s -- MEASURED)
//
// v3274 -- COUNT BEFORE BUILDING A COMPILER.
//
// Keith raised Virtual-Machine/llvm-tutorial-book (Crystal, ~56 stars, "lexer, parser and code generator are
// functional... chapter texts remain incomplete" -- a project that states which parts work) and asked the right
// question underneath it: compilers use an intermediate representation, and SweK writes shaders for TWO
// BACKENDS. Authoring once and emitting twice is exactly what an IR is for, and DRIFT BETWEEN TWO HAND-WRITTEN
// HALVES IS THIS PROJECT'S SIGNATURE DEFECT in the place it is hardest to see -- both compile, both look right.
//
// *** THE CENSUS SAYS NO, AND THE NUMBER IS THE ARGUMENT: THREE FILES AUTHOR BOTH. *** 9 are WGSL-only and 125
// are GLSL-only -- those never needed translating. An IR that covered 80% of three files would leave GLSL, WGSL
// AND A COMPILER to maintain: THREE THINGS INSTEAD OF TWO, for three consumers.
//
// SAME MOVE AS v3262's SETTINGS CENSUS. Count first, especially when the thing to build is a compiler.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { noComments } from "./sourceScan.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const { shaderCensus, pairShape } = await import(pathToFileURL(path.join(HERE, "shaderCensus.mjs")).href);
const c = shaderCensus(ROOT);

{
    const DUAL_BASELINE = 3;   // v3274 -- MEASURED. If this GROWS, the IR argument gets stronger; read the note below.
    ok("!! *** only " + c.both.length + " files author a shader in BOTH languages ***",
        c.both.length <= DUAL_BASELINE,
        c.both.join(", ") + " -- against " + c.wgslOnly.length + " WGSL-only and " + c.glslOnly.length +
        " GLSL-only, which never needed translating. AN IR FOR THREE CONSUMERS WOULD BE A THIRD THING TO " +
        "MAINTAIN BESIDE THE TWO IT REPLACED. If this count climbs toward twenty the arithmetic inverts, and " +
        "THAT is when to re-open llvm-tutorial-book's three-stage shape: parse, lower to an IR, emit per target");

    ok("!! ...and a file that MENTIONS both is not a file that IMPLEMENTS both",
        // AND THE ASSERTION HIT THE SAME WALL: I searched the census's source for its own SKIP pattern, but the
        // backslashes are escaped differently in the file than in this regex. The property is not "the text
        // looks like this" -- it is "the census does not report itself", which is checkable DIRECTLY.
        !c.both.some((f) => /shaderCensus\.mjs$/.test(f)) && !c.wgslOnly.some((f) => /shaderCensus\.mjs$/.test(f)),
        "THE CENSUS MATCHED ITSELF ON ITS FIRST RUN -- its detectors are string literals, so it counted itself " +
        "as a shader pair. A TOOL COUNTING ITSELF AS AN INSTANCE OF THE THING IT COUNTS is the same error as " +
        "the gate that read its own warning text, six times over in this tree");

    // THE DRIFT NUMBERS ARE REPORTED, NOT ASSERTED, AND THE METHOD IS STATED AS CRUDE ON PURPOSE.
    // GLSL and WGSL SHOULD differ everywhere -- they are different languages -- so a text diff would say 90% and
    // mean nothing. What is comparable is the numeric constants each half uses: if one side tunes a value and
    // the other does not, THE PICTURES DIVERGE WHILE BOTH STILL COMPILE.
    const lines = [];
    for (const f of c.both) {
        // THROUGH noComments, AND NOT ONLY BECAUSE gateQuality ASKS. A shader file's comments are full of
        // numbers -- tuning notes, dates, version markers -- and pairShape compares NUMERIC CONSTANTS, so
        // comment text was polluting the very measurement. THE INSTRUMENT RULE PAID FOR ITSELF AGAIN.
        const s = pairShape(noComments(fs.readFileSync(path.join(ROOT, f), "utf8")));
        if (s) lines.push(f + ": shared " + s.shared + ", one-sided " + (s.onlyGlsl.length + s.onlyWgsl.length));
    }
    ok("...and the constant overlap per pair is reported for a human to judge",
        lines.length === c.both.length,
        lines.join(" | ") + ". THE SPLIT IS CRUDE -- it cuts at the first WGSL entry point and a file " +
        "interleaving both languages would defeat it -- SO IT IS REPORTED RATHER THAN GATED. A drift number " +
        "nobody can trust would be worse than none");
}

console.log();
console.log("  ----  THE VERDICT: DO NOT BUILD THE COMPILER. Three files is not a translation problem, it is");
console.log("  ----  three files. What DOES transfer from llvm-tutorial-book is its honesty about which parts");
console.log("  ----  work -- and its three-stage shape, kept on file against the day this count climbs.");
if (fails) { console.log("shaderCensus-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("shaderCensus-selfcheck: all checks pass");
