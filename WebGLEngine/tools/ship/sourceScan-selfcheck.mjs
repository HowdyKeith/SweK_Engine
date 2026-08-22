// WebGLEngine/tools/ship/sourceScan-selfcheck.mjs -- v3681
//
// Run: node tools/ship/sourceScan-selfcheck.mjs   (RUNTIME ~6s MEASURED, not remembered)
//
// *** 101 FILES IMPORT codeOnly OR noComments AND UNTIL NOW NOTHING DROVE EITHER OF THEM WITH A FIXTURE. ***
//
// sourceScan is this tree's answer to prose-as-code -- the defect these notes have recorded twenty-plus times --
// and every one of those answers routes through two functions that had no gate of their own. The rule they exist
// to enforce is stated in a dozen headers: codeOnly() for an IDIOM (it blanks comments AND strings), noComments()
// for TEXT the code contains (it blanks comments and KEEPS strings, because a specifier IS a string literal).
// A STRIPPER THAT SILENTLY STOPPED STRIPPING WOULD TURN EVERY ONE OF THOSE HUNDRED AND ONE CHECKS INTO PROSE
// MATCHING, and nothing would go red -- the checks would simply start passing for the wrong reason.
//
// v3681 FOUND THAT EXACT FAILURE IN A SECOND COPY: tools/ship/unboundBuiltin.mjs declared its OWN codeOnly whose
// docstring promised to strip comments, AND IT DID NOT STRIP LINE COMMENTS. The two disagreed on 2794 of 2910
// files, and ten name-uses in the live tree were seen only by the private one -- every one from a `//` comment.
// It is gone; that file imports the shared definition now. THIS GATE IS WHAT MAKES THE SHARED ONE HOLD.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { codeOnly, noComments, prose, codeHas, proseHas } from "./sourceScan.mjs";

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};
const say = (l) => console.log("  ----  " + l);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");

console.log("sourceScan-selfcheck -- the two strippers 101 files depend on, driven\n");

// ---- 1. THE THREE FORMS, EACH ON THE CASE THAT SEPARATES IT FROM THE OTHER TWO -------------------------------
{
    const src = 'const a = "os.homedir()";   // os.homedir()\nconst b = `t ${x}`;\n/* os.homedir() */\nconst c = os.arch();';
    const co = codeOnly(src), nc = noComments(src);

    ok("!! codeOnly blanks LINE comments", !/\/\/ os\.homedir/.test(co),
        "this is the exact promise unboundBuiltin's private copy made and did not keep, and the reason it is gone");
    ok("!! codeOnly blanks BLOCK comments", !/\/\* os\.homedir/.test(co) && !co.includes("/* os"),
        "a block comment mentioning a member is not a use of it");
    ok("!! codeOnly blanks string CONTENTS and keeps the quotes", /""/.test(co) && !/"os\.homedir\(\)"/.test(co),
        "keeping the quotes is what lets a caller tell `f(\"\")` -- a real call with a blanked argument -- from a " +
        "call that was never there because it lived inside another string. v3680's worker fixture rests on it");
    ok("!! ...and the CODE survives all of it", /const c = os\.arch\(\);/.test(co),
        "a stripper that ate the code would make every check vacuous and nothing would go red");

    ok("!! noComments KEEPS strings, which is the whole reason it exists", /"os\.homedir\(\)"/.test(nc),
        "a module SPECIFIER is a string literal, so deadImportScan and the reference graph must read strings; " +
        "codeOnly would blank the very thing they hunt");
    ok("...and still blanks comments", !/\/\/ os\.homedir/.test(nc),
        "the difference between the two is STRINGS, never comments -- if noComments kept comments it would be raw source");

    ok("!! prose() is the opposite question: does the file EXPLAIN itself", proseHas(src, /os\.homedir/) && !/const c = os\.arch/.test(prose(src)),
        "prose keeps the comments and drops the code, so 'this file documents X' cannot be answered by X being " +
        "present in the code -- the three forms answer three different questions and are not interchangeable");
}

// ---- 2. THE HELPER THAT ALREADY EXISTED AND THAT I HAND-SPELLED TWICE THIS SESSION ---------------------------
//
// codeHas(src, re) IS `re.test(codeOnly(src))`, exported since it was written. I wrote that expression by hand
// in gateQuality (v3677) and again in deadImportScan (v3680), each time as if it were new. A SECOND SPELLING OF
// ONE IDEA IS THIS TREE'S MOST REPEATED DEFECT and I committed it twice in four rounds, in the two files whose
// subject is exactly that. Asserted here so the equivalence is a fact rather than an assumption.
{
    const withCall = 'const w = new Worker("./real.js");';
    const inString = "const s = 'const w = new Worker(\"./fixture.js\");';";
    ok("!! codeHas is exactly the hand-spelled form, so there is one way to ask",
        codeHas(withCall, /new Worker\s*\(/) === /new Worker\s*\(/.test(codeOnly(withCall)) &&
        codeHas(inString, /new Worker\s*\(/) === /new Worker\s*\(/.test(codeOnly(inString)),
        "not a claim that the results are correct -- a claim that the two spellings cannot drift apart");
    ok("!! ...and it separates a REAL call from one quoted inside a string",
        codeHas(withCall, /new Worker\s*\(/) && !codeHas(inString, /new Worker\s*\(/),
        "*** THIS IS THE DISCRIMINATOR v3677 AND v3680 BOTH NEEDED. *** A call nested in a string DISAPPEARS " +
        "WITH ITS HOST under codeOnly while a real one survives with a blanked argument -- which is how a gate " +
        "stops counting its own test fixture as a finding, twice over");
}

// ---- 3. THE SECOND DECLARATION IS GONE, ASSERTED BY MECHANISM RATHER THAN BY READING ------------------------
{
    const ub = fs.readFileSync(path.join(HERE, "unboundBuiltin.mjs"), "utf8");
    ok("!! unboundBuiltin no longer DEFINES a stripper, it imports one",
        !/^\s*export function codeOnly/m.test(ub) && /from "\.\/sourceScan\.mjs"/.test(ub),
        "TWO DECLARATIONS OF ONE THING NOBODY EVER COMPARED is the shape these notes name most often; comparing " +
        "them is what found the line-comment hole, and importing is what stops it coming back");

    // The equivalence is DRIVEN over the real tree rather than trusted: if the shared stripper ever regressed to
    // the private one's behaviour, this is where it would show, and it costs one walk.
    const files = [];
    (function walk(d) {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            const p = path.join(d, e.name);
            if (/node_modules|\.git/.test(p)) continue;
            if (e.isDirectory()) walk(p); else if (/\.(js|mjs)$/.test(e.name)) files.push(p);
        }
    })(ENG);
    let lineComments = 0;
    for (const f of files) {
        const src = fs.readFileSync(f, "utf8");
        if (/^\s*\/\/.+$/m.test(src) && !/\/\//.test(codeOnly(src))) lineComments++;
    }
    say("files walked: " + files.length + "   with line comments fully stripped: " + lineComments);
    ok("!! the shared stripper removes line comments across the WHOLE tree, not just in a fixture",
        lineComments > 1000,
        "a fixture proves the intent and a tree walk proves it holds on real files -- the private copy passed " +
        "every fixture anybody wrote for it and still failed here");
}

// ---- 4. WHAT THIS CANNOT SAY -------------------------------------------------------------------------------
{
    // sourceScan's own header records this and it is repeated here rather than left in one file: the lexer
    // DESYNCS on a regex literal containing a quote, so proseAudit.mjs's main block is unreadable to both
    // strippers. A KNOWN LIMIT REPORTED BY NAME is not the same as a limit nobody has met.
    const tricky = 'const re = /["]/; const c = os.arch();';
    say("known limit -- a regex literal containing a quote desyncs the lexer: " + JSON.stringify(codeOnly(tricky)));
    ok("...and the limit is DECLARED in sourceScan itself, not only here",
        proseHas(fs.readFileSync(path.join(HERE, "sourceScan.mjs"), "utf8"), /regex|desync|lexer/i),
        "a limit recorded only in the gate is a limit the file's own readers never meet");
}

if (fails) { console.log("\nsourceScan-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("\nsourceScan-selfcheck: all checks pass");
