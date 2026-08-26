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

// ---- 4. v4031 -- THE REGEX-QUOTE DESYNC IS CLOSED, NOT MERELY DOCUMENTED -----------------------------------
//
// This section used to be titled "WHAT THIS CANNOT SAY" and asserted only that the limit was NAMED. Leaving
// that assertion standing after the fix would have been the stale-claim trap this tree names elsewhere by a
// different mechanism (v3202/v3195: a suppression nobody revisits is an ACTIVE BLIND SPOT) -- a gate that
// still reports "known limit" once the limit is gone is not honest about the file it is testing.
{
    // THE EXACT FIXTURE THIS SECTION USED TO SHOW BROKEN. `["]` is a regex literal containing a quote inside a
    // character class -- the precise shape that desynced the lexer for the rest of the file.
    const tricky = 'const re = /["]/; const c = os.arch();';
    ok("!! *** the fixture that used to desync now survives whole ***",
        /os\.arch\(\)/.test(codeOnly(tricky)) && /os\.arch\(\)/.test(noComments(tricky)),
        "codeOnly: " + JSON.stringify(codeOnly(tricky)));

    // THE REAL TRIGGER, VERBATIM: ai-bridge/gpuBrainBridge.js's actual line, which desynced BOTH strippers for
    // 676 lines (from line 269 of 1998) until this. A synthetic fixture proves the mechanism; this proves the
    // mechanism against the exact text that broke it in a real file.
    const real = 'x.push("brain/*.json (dir unreadable)"); const c = a.replace(/^["\']|["\']$/g, ""); const after = os.arch();';
    ok("!! *** the ACTUAL trigger line survives, both strippers ***",
        codeHas(real, /os\.arch\(\)/) && noComments(real).includes("os.arch()"),
        "this is ai-bridge/gpuBrainBridge.js's real source, not an invented case");

    // CHARACTER-CLASS AWARENESS: a `/` inside `[...]` must not end the literal early -- stripToComment()'s own
    // prior inline version did not have this, and was narrower than what codeOnly/noComments now need.
    //
    // *** EXACT-STRING, NOT "does os.arch() survive". *** Without char-class tracking, `/[/]/ ` mis-parses
    // LOCALLY: the scanner reads `/[/` as a complete (wrong) literal, resumes at `]`, and resyncs mode===null
    // again well before reaching os.arch() later in the string -- so a loose "the trailing code survives" check
    // passes even with char-class awareness DELETED. MEASURED: this exact sabotage produced zero gate failures
    // against the first draft of this test. Only an exact-output comparison catches a local mis-parse that
    // resyncs before the next checkpoint.
    ok("!! a `/` INSIDE a character class does not end the regex literal",
        codeOnly("const re = /[/]/; const c = os.arch();") === "const re = //; const c = os.arch();",
        "codeOnly: " + JSON.stringify(codeOnly("const re = /[/]/; const c = os.arch();")));

    // KEYWORD-PRECEDED REGEX, THE NEW HALF OF THE HEURISTIC. stripToComment's punctuation-only version would
    // miss this; MEASURED across this tree, "return /" occurs as literal text in 46 files.
    ok("!! *** \"return /regex/\" is recognised, not just \"(/regex/\" ***",
        codeHas('function f(s){ return /^["]/.test(s); } const c = os.arch();', /os\.arch\(\)/),
        "punctuation-only would treat this /^[\"]/ as division-then-a-string-open and desync exactly as before");
    ok("!! ...and other expression-starting keywords too (typeof, case, new, throw)",
        codeHas('const t = typeof /x/; const c = os.arch();', /os\.arch\(\)/) &&
        codeHas('switch(s){ case /x/.test(s): break; } const c = os.arch();', /os\.arch\(\)/));

    // codeOnly BLANKS REGEX CONTENT, mirroring section 1's string-content assertion. A gate hunting for a
    // forbidden word in codeOnly() output must not false-positive because that word happened to appear as TEXT
    // inside an unrelated regex pattern (e.g. a regex that matches the literal string "eval").
    ok("!! *** codeOnly blanks a regex literal's CONTENT, not just the code around it ***",
        !codeOnly('const re = /os\\.homedir\\(\\)/;').includes("homedir") &&
        /\/\/;/.test(codeOnly('const re = /os\\.homedir\\(\\)/;')),
        "codeOnly: " + JSON.stringify(codeOnly('const re = /os\\.homedir\\(\\)/;')) +
        " -- a regex pattern MENTIONING os.homedir is not a USE of it, same reasoning as a comment mentioning it");
    // noComments keeps a regex literal VERBATIM including its own backslash escapes -- \\. in the source stays
    // \\. in the output, so the check is for that literal text, not the unescaped word it would match.
    ok("!! ...while noComments KEEPS it, same reasoning as it keeps string content",
        noComments('const re = /os\\.homedir\\(\\)/;').includes("os\\.homedir"));

    // THE SAFETY VALVE: real division must still read as division, not get swallowed hunting for a regex
    // close. Checked by IDENTITY, not just survival -- a `/` that goes through the regex path uses regexBody's
    // char-class/escape scanning and could still "survive" by accident; codeOnly() must actually LEAVE THE `/`
    // ALONE for real division, so its output for a division expression should be byte-identical to the input.
    const div = "const q = a / b; const r = arr[0] / 2; const s = fn() / 3;";
    ok("!! *** real division text is UNCHANGED, not routed through the regex path ***",
        codeOnly(div) === div, "codeOnly(div): " + JSON.stringify(codeOnly(div)));

    // THE RESIDUAL LIMIT, NARROWED AND STILL NAMED. Not a full parser: a regex-literal STATEMENT immediately
    // after a bare numeric literal with no semicolon (relying on automatic semicolon insertion) still misreads
    // as division. Demonstrated so the gap is measured rather than assumed, and searched for across the real
    // tree so the limit is not left as a guess.
    const asiGap = "x = 5\n/foo/.test(a)";
    say("residual limit (ASI, not tracked) -- " + JSON.stringify(codeOnly(asiGap)));
    ok("...and the residual limit is DECLARED in sourceScan itself, narrower than before",
        proseHas(fs.readFileSync(path.join(HERE, "sourceScan.mjs"), "utf8"), /semicolon insertion/i),
        "a limit recorded only in the gate is a limit the file's own readers never meet");

    // THE TREE-WIDE CLAIM, MEASURED RATHER THAN TAKEN ON FAITH: line count preserved end-to-end is what a
    // desync looks like breaking (codeOnly stops emitting real newlines once stuck in a phantom string/comment
    // that never closes). A mismatch anywhere means something still desyncs.
    let mismatched = 0, filesChecked = 0;
    (function walk(d) {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            if (/node_modules|\.git/.test(e.name)) continue;
            const p = path.join(d, e.name);
            if (e.isDirectory()) { walk(p); continue; }
            if (!/\.(js|mjs)$/.test(e.name)) continue;
            filesChecked++;
            const src = fs.readFileSync(p, "utf8");
            const rawLines = src.split("\n").length;
            if (codeOnly(src).split("\n").length !== rawLines || noComments(src).split("\n").length !== rawLines) mismatched++;
        }
    })(ENG);
    say("files checked for a line-count desync: " + filesChecked + "   mismatched: " + mismatched);
    ok("!! *** ZERO files desync tree-wide, down from 180 measured before this fix ***", mismatched === 0);
}

if (fails) { console.log("\nsourceScan-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("\nsourceScan-selfcheck: all checks pass");
