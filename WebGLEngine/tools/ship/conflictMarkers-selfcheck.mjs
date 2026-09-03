#!/usr/bin/env node
// WebGLEngine/tools/ship/conflictMarkers-selfcheck.mjs -- v4384
//
// *** NO TRACKED FILE CARRIES AN UNRESOLVED MERGE CONFLICT. THIS EXISTS BECAUSE THE LESSON WAS WRITTEN DOWN
// TWICE AND REPEATED ANYWAY. ***
//
// This branch merged main eight times in one session, and twice a conflicted file was committed with its markers
// intact. Both times the cause was identical: `git add -A` STAGES A CONFLICTED FILE, marks it resolved, and then
// `git diff --diff-filter=U` reports nothing. The conflict list was taken after the staging command that hid it.
//
//   v4381's own commit message says it: "a conflict list taken after `git add -A` is not a conflict list."
//   v4384 did it again, three rounds later, to docs/CHANGELOG.md.
//
// THE FIRST TIME, tools/check.mjs CAUGHT IT -- brain/brain.js is JavaScript and conflict markers are a
// SyntaxError, so verify refused the ship. THE SECOND TIME NOTHING DID: a Markdown file with markers in it parses
// fine, ships fine, and is simply wrong. The difference between the two is not care, it is that one file type
// had a mechanism and the other did not.
//
// So this is the mechanism, and the argument for it is that a note was not one. A note is a thing you have to
// remember while doing the thing that makes you forget.
//
// *** THE MARKERS ARE ASSEMBLED AT RUN TIME AND NOT SPELLED. *** A file that spells `<<<<<<<` at the start of a
// line becomes a file this check reports, which is the same trap render/backendParity.mjs's census sets for a
// file that spells a shader marker, and this session has now paid for it twice in other gates.
//
// Run: node tools/ship/conflictMarkers-selfcheck.mjs   (exit 0 all-pass, 1 on any fail)
"use strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REPO = path.resolve(ENG, "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };

// assembled, never spelled -- see the header
const LT = "<".repeat(7), GT = ">".repeat(7), EQ = "=".repeat(7);
const START = new RegExp("^" + LT + " "), END = new RegExp("^" + GT + " "), MID = new RegExp("^" + EQ + "$");
/** A file is conflicted only if it carries an OPEN and a CLOSE; a lone row of equals signs is a Markdown rule. */
export function conflictedText(text) {
    const lines = String(text).split("\n");
    let open = 0, close = 0, mid = 0;
    for (const l of lines) { if (START.test(l)) open++; else if (END.test(l)) close++; else if (MID.test(l)) mid++; }
    return { open, close, mid, conflicted: open > 0 && close > 0 };
}

console.log("\n1. THE READER, BOTH WAYS, BEFORE IT IS POINTED AT THE TREE");
{
    const real = [LT + " HEAD", "mine", EQ, "theirs", GT + " origin/main"].join("\n");
    ok("a real conflict block is reported", conflictedText(real).conflicted);
    ok("*** and a Markdown SETEXT RULE is not -- a line of seven equals signs under a heading is ordinary prose ***",
        !conflictedText("A heading\n" + EQ + "\n\nbody text\n").conflicted,
        "the negative matters more: a reader that fired on a row of equals signs would report most of docs/ and be turned off within a round");
    ok("  and an opening with no close is not called a conflict either", !conflictedText(LT + " HEAD\njust text\n").conflicted,
        "a lone marker is a typo or a quotation; a PAIR is a merge that was never finished");
    ok("  and this file itself is clean by its own reader, which is the trap it is written to avoid",
        !conflictedText(fs.readFileSync(fileURLToPath(import.meta.url), "utf8")).conflicted,
        "the markers above are assembled from repeat() rather than typed");
}

console.log("\n2. *** AND NOW THE TREE: no tracked file carries an unresolved merge ***");
{
    let tracked = null, why = null;
    try { tracked = execFileSync("git", ["ls-files", "-z"], { cwd: REPO, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).split("\0").filter(Boolean); }
    catch (e) { why = String(e.message).split("\n")[0].slice(0, 120); }
    ok("the tracked file list is readable, so this check has something to check", Array.isArray(tracked) && tracked.length > 100,
        tracked ? `${tracked.length} tracked files` : "git ls-files FAILED: " + why);
    if (tracked) {
        const bad = [];
        let scanned = 0, skipped = 0;
        for (const rel of tracked) {
            const abs = path.join(REPO, rel);
            let st; try { st = fs.statSync(abs); } catch { continue; }
            if (!st.isFile() || st.size > 32 * 1024 * 1024) { skipped++; continue; }
            let text; try { text = fs.readFileSync(abs, "utf8"); } catch { skipped++; continue; }
            if (text.indexOf("\0") >= 0) { skipped++; continue; }          // binary
            scanned++;
            const c = conflictedText(text);
            if (c.conflicted) bad.push(`${rel} (${c.open} open, ${c.close} close)`);
        }
        ok(`*** ${scanned.toLocaleString()} tracked text files carry no unresolved conflict ***`,
            bad.length === 0,
            bad.length ? "CONFLICTED: " + bad.slice(0, 6).join("; ") : `${skipped} skipped as binary or oversized. THE SHAPE THIS CATCHES: a .md or .json file staged by "git add -A" while still conflicted, which parses fine, ships fine and is wrong -- tools/check.mjs catches only the ones that happen to be JavaScript`);
    }
}

// SABOTAGE LOG -- applied, gate run, exit code read, restored.
//   A  a conflict block written into docs/CHANGELOG.md (the exact file it was missed in) -> exit=1, 1 red, naming
//      the file and its marker counts. A re-enactment of what actually got committed at v4384.
//      *** AND THE FIRST ATTEMPT AT THIS SABOTAGE WENT 0 RED, WHICH WAS A FINDING ABOUT THE SABOTAGE. *** It
//      spliced the block in at byte offset 200, which landed mid-line, so the opening marker was not at the start
//      of a line and the reader was right to ignore it. A sabotage that goes 0 red is a finding either way; here
//      it was that the test was wrong, not the check. Re-done on line boundaries, it bites.
//   B  the `open > 0 && close > 0` pairing relaxed to `open > 0 || mid > 0` -> exit=1, 1 red in section 1: every
//      Markdown setext heading in docs/ becomes a conflict, which is the failure mode that would get this check
//      switched off rather than fixed. The negative test is the load-bearing half.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: files git does not track, which is where a scratch copy of a conflicted file would " +
    "sit and where it does no harm; and whether a conflict was resolved CORRECTLY, which no scanner can tell -- " +
    "this only says that somebody finished.");
process.exit(fails ? 1 : 0);
