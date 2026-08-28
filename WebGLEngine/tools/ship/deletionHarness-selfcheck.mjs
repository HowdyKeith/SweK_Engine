// WebGLEngine/tools/ship/deletionHarness-selfcheck.mjs
//
// Run: node tools/ship/deletionHarness-selfcheck.mjs   (~2s -- MEASURED, it spawns node --check per position)
//
// v3326 -- THE INSTRUMENT THAT TELLS A REAL HARDENING FROM A PLAUSIBLE ONE.
//
// Keith was shown a triple-redundancy quine with a proof that a majority vote recovers the payload after any
// single-character deletion. THE PROOF WAS CORRECT AND IRRELEVANT: it assumed the decoder RUNS. On a working
// triple-redundant program, 75 OF 131 DELETIONS NEVER REACHED THE VOTE -- JavaScript parses the whole file
// before executing one line.
//
// *** AND A TEST THAT CHECKED OUTPUT WOULD HAVE SCORED 56/56 AND REPORTED PERFECTION *** -- because the 75 that
// crashed produced no output to be wrong. THE FAILURES ARE THE MEASUREMENT, which is why this harness counts
// what did not parse rather than scoring what did.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const { deletionSurvey, jsParses, survivalReceipt } =
    await import(pathToFileURL(path.join(HERE, "deletionHarness.mjs")).href);

{
    // *** THE POSITIVE CONTROL. *** An instrument that can only report failure would report failure on
    // everything and be useless. Bare expression statements survive because they carry almost NO delimiters:
    // drop the ';' and ASI covers it, drop the '0' and an empty statement is still valid, drop the newline and
    // `0;0;` is still valid.
    const good = deletionSurvey("0;\n0;\n0;\n", jsParses);
    ok("!! *** it can report a clean survivor: bare statements, ZERO failures ***",
        good.failures === 0 && good.positions === 9,
        survivalReceipt(good) + " AN INSTRUMENT THAT CANNOT PASS PROVES NOTHING -- and this is also the real " +
        "seed of a hardening, which is the OPPOSITE of the proposed one: comments are fragile, statement " +
        "separators are cheap");

    // *** THE NEGATIVE CONTROL, AND IT IS THE ONE THAT MATTERED. *** The pattern presented as hardened.
    const bad = deletionSurvey("/*//*/ 101 /*//*/ | /*//*/ 0 /*//*/\n", jsParses);
    ok("!! *** and it catches the 'hardened' pattern that is WORSE THAN NOTHING ***",
        bad.failures > 10 && bad.failingChars.some((c) => c.ch === "|") && bad.failingChars.some((c) => c.ch === "0"),
        survivalReceipt(bad) + " THE `| 0` PADDING ADDS TWO NEW SINGLE POINTS OF FAILURE WHERE THERE WERE NONE: " +
        "delete the pipe and `101  0` is two adjacent literals; delete the zero and `101 |` is a trailing " +
        "operator. The claim was that a deleted pipe leaves 'just code 0 inside comments'. IT DOES NOT");

    ok("!! ...and it names the fragile CHARACTERS, not just a score",
        bad.failingChars.length >= 3 && typeof bad.failingChars[0].ch === "string",
        "'15 failures' is a score; '\"/\" x8, \"*\" x5, \"|\" x1, \"0\" x1' is a DIAGNOSIS and points straight at " +
        "the construct that has to change. A number alone would have let the comment mesh survive review");
}
{
    // The predicate is INJECTED so the same question can be asked of GLSL, a .bat, a JSON config -- anything
    // with a grammar. Hard-coding new Function() would have made this a JavaScript tool by accident.
    const src = "aaaa";
    const never = deletionSurvey(src, () => false);
    const always = deletionSurvey(src, () => true);
    ok("!! the parse predicate is injected, not assumed",
        never.failures === 4 && always.failures === 0,
        "the same survey drives GLSL, a launcher .bat, or a JSON config. HARD-CODING new Function() WOULD HAVE " +
        "MADE THIS A JAVASCRIPT TOOL BY ACCIDENT, and the GLSL half of that conversation was the part with no " +
        "eval() to fall back on");

    let threw = 0;
    try { deletionSurvey("", jsParses); } catch { threw++; }
    try { deletionSurvey("x", null); } catch { threw++; }
    ok("...and it refuses empty input rather than reporting a perfect score",
        threw === 2,
        "zero positions and zero failures is 100% survival by arithmetic and nothing by meaning -- THE MOST " +
        "FLATTERING POSSIBLE RESULT FROM MEASURING NOTHING");
}

console.log();
console.log("  ----  WHAT THIS DOES NOT DO: harden anything. It is the ruler, not the beam. A construction that");
console.log("  ----  survives every position is hand-engineering per language -- which is exactly why mame's");
console.log("  ----  radiation-hardened quine is celebrated rather than generated, and why the confident");
console.log("  ----  scheme Keith was shown fell apart on the first honest measurement.");
if (fails) { console.log("deletionHarness-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("deletionHarness-selfcheck: all checks pass");
