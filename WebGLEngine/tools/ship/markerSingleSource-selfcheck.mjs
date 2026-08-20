// WebGLEngine/tools/ship/markerSingleSource-selfcheck.mjs -- v3456
//
// Run: node tools/ship/markerSingleSource-selfcheck.mjs
//
// *** A VERSION MARKER IN TWO FILES IS THE WORST KIND OF SECOND DECLARATION, BECAUSE THE COPY THAT DRIFTS IS
// THE ONE THAT TELLS YOU WHAT BUILD YOU ARE LOOKING AT. ***
//
// v3456 deleted WebGLEngine/brain.js: a BYTE-IDENTICAL duplicate of WebGLEngine/brain/brain.js -- 2,902 lines
// each, differing in exactly one token, BRAIN_BUILD, frozen at "v3395" against a live "v3455". Sixty versions
// apart in the same tree. Nothing imported it, all eleven of its relative imports resolved only from brain/ so
// it could not have loaded anyway, and it was the reason deadImportScan reported broken static imports.
//
// IT SURVIVED SIXTY ROUNDS OF A BUMP THAT TOUCHES THAT EXACT LINE, because the bump edits ONE path by name and
// never asks how many files declare the thing. THIS GATE ASKS.
//
// THE CHECK IS ON THE DECLARATION, NOT THE VALUE. Two files agreeing today is not the property -- they would
// have agreed the moment the copy was made, and the defect is that a SECOND PLACE EXISTS to disagree from
// later. Comparing the values would have passed on the day the duplicate was created and failed only after the
// damage, which is the wrong end of the problem.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { codeOnly } from "./sourceScan.mjs";
import { SOURCE_EXT } from "./moduleRefs.mjs";   // v3684 -- one declaration of the corpus

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const files = [];
(function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.name === "node_modules" || e.name.startsWith(".") || e.name === "deleted") continue;
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        // *** v3682 -- HTML IS IN THE CORPUS NOW. *** This gate exists because A VERSION MARKER IN TWO FILES IS
        // THE WORST KIND OF SECOND DECLARATION, and it was one of v3614's twenty tools scanning a corpus that
        // omits every page -- so a page hardcoding `const ENGINE_VERSION = "v3681"` would have been INVISIBLE
        // to the one check written to catch exactly that.
        // MEASURED BEFORE WIDENING, as v3678 established: three pages mention the markers and NOT ONE DECLARES
        // one -- cosmic-map READS window.ENGINE_VERSION, predictions names it in PROSE, and ship.html uses it
        // as a TABLE LABEL inside a template literal. Zero false positives were available, so this costs no
        // noise and buys the guard. AND THE EXISTING DETECTION ALREADY HANDLES PAGES WITHOUT CHANGE: the idiom
        // is line-anchored and read through codeOnly, which blanks the template literal ship.html's label sits
        // in -- the same two decisions (v3455/v3456) that stopped eight readers and fixtures counting as
        // declarations are what make a page safe to scan.
        // v3684 -- SOURCE_EXT rather than a hand-spelling I added at v3682, one round after widening this
        // corpus to html. TWO DECLARATIONS OF ONE SET is what v3614 counted; this pays back two of them.
        else if (SOURCE_EXT.test(e.name)) files.push(p);
    }
})(ROOT);

// The DECLARATION idiom, not a mention: `const NAME = "v1234"`.
//
// *** codeOnly, NOT noComments, AND THE DIFFERENCE COST THIS CHECK ITS FIRST RUN. noComments strips comments and
// KEEPS STRING LITERALS, so it counted ai-bridge/server.js -- which READS the marker with
// `src.match(/const ENGINE_VERSION = "([^"]+)"/)` -- and applyStaged-selfcheck, which builds the fixture string
// `const ENGINE_VERSION = "v9999";`. A PARSER OF A DECLARATION AND A FIXTURE OF ONE ARE NOT DECLARATIONS, and
// eight files read as declaring what exactly one file declares. codeOnly blanks string literals, which is the
// half of that pair this idiom needs. v3455 hit the OTHER half one round ago -- noComments where raw text was
// wrong -- so the tree now carries both directions of the same mistake, a round apart. ***
const MARKERS = ["BRAIN_BUILD", "ENGINE_VERSION"];
for (const name of MARKERS) {
    // ANCHORED TO LINE START, because codeOnly blanks STRING literals and not REGEX ones -- and all five
    // remaining false positives were regexes READING main.js's marker (`/const ENGINE_VERSION = "(v\d+)"/` in
    // server.js, gateActivity, status, patchBase and verify). A READER OF A DECLARATION IS NOT A DECLARATION.
    // Every one of them sits mid-line after `match(` or `exec(`; a real declaration starts its own line.
    const re = new RegExp("^[ \\t]*(?:const|let|var)\\s+" + name + "\\s*=\\s*[\"'`]", "m");
    const holders = files.filter((f) => {
        // ONLY <script> BODIES ARE READ FROM A PAGE, never the markup: prose or an attribute naming a marker
        // is not a declaration of one, and scanning raw HTML would be the prose-as-code mistake this file's own
        // header spends two paragraphs on.
        let raw = ""; try { raw = fs.readFileSync(f, "utf8"); } catch { return false; }
        if (/\.html$/.test(f)) raw = [...raw.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).join("\n");
        const src = codeOnly(raw);
        return re.test(src);
    }).map((f) => path.relative(ROOT, f).split(path.sep).join("/"));

    ok("!! *** " + name + " IS DECLARED IN EXACTLY ONE FILE ***", holders.length === 1,
       holders.length === 1
           ? holders[0] + " and nowhere else. THE CHECK IS ON THE DECLARATION, NOT THE VALUE: two copies agreeing today is not the property, because they agreed on the day the copy was made too -- what matters is that no SECOND PLACE EXISTS to drift from later."
           : "declared in " + holders.length + " files: " + holders.join(", ") + ". *** ONE OF THESE IS STALE OR WILL BE. The bump edits ONE path by name, so a second declaration is never the one that gets updated -- brain.js sat sixty versions behind brain/brain.js and nothing noticed until a broken-import scan tripped over it. DELETE THE COPY (archiveBeforeDelete first, per Keith's rule), DO NOT SYNC IT. ***");
}

// The deletion this gate exists because of, asserted by absence AND by the archive that proves it was kept.
ok("!! the deleted duplicate stayed deleted, and its recovery archive is still there",
   !fs.existsSync(path.join(ROOT, "brain.js")) &&
   fs.readdirSync(path.join(ROOT, "tools", "ship", "deleted")).some((f) => /stale-brain-duplicate/.test(f)),
   "WebGLEngine/brain.js is gone and tools/ship/deleted/ holds the zip. *** KEITH'S RULE, IN removeCluster's OWN WORDS: a deletion without an archive cost 43 versions of not noticing, two zip diffs, three convergence passes and a 203-archive sweep across two drives. A zip written at deletion time would have made it one unzip. *** The archive is asserted here so a later cleanup cannot quietly bin the receipt.");

console.log(fails ? "\nmarkerSingleSource-selfcheck: " + fails + " FAILED" : "\nmarkerSingleSource-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
