// tools/ship/asciiExternal-selfcheck.mjs -- v3777
//
// *** THE "KEEP IT ENTIRELY EXTERNAL" ROUTE, AND WHY IT IS WORTH BEING A FIRST-CLASS OPTION RATHER THAN A
// SHRUG. A generator SweK does not contain -- stong/gradscii-art (AGPL-3.0), a shell script, somebody's
// Python, a hand-typed folder -- writes ONE TEXT FILE PER FRAME. This module turns that pile into the document
// asciiFrames.mjs validates. IT READS TEXT AND NAMES AND NOTHING ELSE: SweK contains no generator, links
// against none, and cannot tell which one produced its input, so NO LICENCE FOLLOWS THE OUTPUT IN. ***
//
// *** THE SILENT FAILURE IT EXISTS FOR IS THE ORDER. A folder sorts LEXICOGRAPHICALLY by default, so frame10
// lands before frame2 and the video plays scrambled -- WHICH LOOKS LIKE A BAD EDIT, NOT A BUG. Nothing throws,
// every frame is present, and the count is right. ***

import { fromTextFiles, indexOf } from "./asciiExternal.mjs";
import { importFrames } from "./asciiFrames.mjs";
import { codeOnly } from "./sourceScan.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (n, d) => console.log("  ----  " + n + "   " + d);
const SRC = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "asciiExternal.mjs"), "utf8");
const g = (ch, cols = 6, rows = 2) => Array.from({ length: rows }, () => ch.repeat(cols)).join("\n");

console.log("1. THE ORDER, WHICH IS THE WHOLE POINT");
{
    const names = ["frame1.txt", "frame2.txt", "frame10.txt"];
    const r = fromTextFiles(names.map((n, i) => ({ name: n, text: g(".:#"[i]) })), { fps: 12 });
    ok("!! *** NATURAL-NUMERIC ORDER, NOT THE LEXICOGRAPHIC ONE A FOLDER GIVES ***",
        r.ok && r.order.join(",") === "frame1.txt,frame2.txt,frame10.txt",
        "lexicographic puts frame10 SECOND: " + names.slice().sort().join(", ") + ". *** THAT PLAYS SCRAMBLED " +
        "AND LOOKS LIKE A BAD EDIT -- nothing throws, every frame is present, the count is right ***");
    ok("!! the index is the LAST run of digits, so a numbered directory prefix does not hijack it",
        indexOf("run7/t_iter_0100.txt") === 100 && indexOf("frame2.txt") === 2 && indexOf("nodigits.txt") === null,
        "gradscii-art's own step dumps are named t_iter_0000.txt, t_iter_0100.txt -- the FRAME number is the " +
        "last one, and a path like run7/ would otherwise sort everything by the run");
    ok("!! *** A MIXED SET IS REFUSED, NOT PATCHED ***",
        fromTextFiles([{ name: "a1.txt", text: g(".") }, { name: "cover.txt", text: g(".") }], { fps: 12 }).ok === false,
        "some names numbered and some not means the order of the unnumbered ones is UNKNOWABLE, not guessable. " +
        "Choosing one silently is exactly the guess this file exists to prevent");
    ok("!! and an all-unnumbered set is ACCEPTED with a warning, because names may be the intended order",
        (() => { const u = fromTextFiles([{ name: "b.txt", text: g(".") }, { name: "a.txt", text: g(":") }], { fps: 12 });
                 return u.ok === true && u.warnings.length === 1 && u.order[0] === "a.txt"; })(),
        "REFUSING WOULD BE A CHECK THAT FIRES ON CORRECT INPUT -- a set called intro/middle/outro is fine and " +
        "the warning names what was assumed");
}

console.log("\n2. DUPLICATES AND GAPS ARE DIFFERENT PROBLEMS");
{
    ok("!! *** A DUPLICATE NUMBER IS AN ERROR -- last-one-wins would silently drop a frame ***",
        fromTextFiles([{ name: "f1.txt", text: g(".") }, { name: "x1.txt", text: g(":") }], { fps: 12 }).ok === false);
    const gap = fromTextFiles([{ name: "t_iter_0000.txt", text: g(".") }, { name: "t_iter_0100.txt", text: g(":") }], { fps: 12 });
    ok("!! *** A GAP IS A WARNING, NOT AN ERROR, AND THE REASON IS THAT BOTH READINGS ARE REAL ***",
        gap.ok === true && gap.warnings.length === 1 && /step dump/.test(gap.warnings[0]),
        "*** gradscii-art dumps every 100 iterations, so a run of its steps is ALL GAPS AND PERFECTLY VALID. A " +
        "gap in a per-FRAME export is a DROPPED FRAME. The module cannot tell which it was handed, so it says " +
        "so rather than choosing -- and `requireContiguous` lets a caller who KNOWS demand the stricter one ***");
    ok("!! ...and requireContiguous turns exactly that warning into an error",
        fromTextFiles([{ name: "f0.txt", text: g(".") }, { name: "f5.txt", text: g(":") }],
                      { fps: 12, requireContiguous: true }).ok === false);
}

console.log("\n3. DIMENSIONS ARE INFERRED FROM ONE FILE AND CHECKED AGAINST ALL");
{
    const mixed = fromTextFiles([{ name: "f1.txt", text: g(".", 6, 2) }, { name: "f2.txt", text: g(":", 5, 2) }], { fps: 12 });
    ok("!! *** A FILE THAT DISAGREES WITH THE FIRST IS NAMED, WITH BOTH WIDTHS ***",
        mixed.ok === false && /f2\.txt: row 0 is 5 chars, expected 6/.test(mixed.errors[0]),
        "INFERRING FROM THE FIRST FILE IS FINE; ASSUMING IT HOLDS IS NOT. A five-wide frame among six-wide ones " +
        "renders with a soft right edge and reads as art");
    ok("!! fps is REFUSED rather than guessed -- it is not in the files",
        fromTextFiles([{ name: "f1.txt", text: g(".") }], {}).ok === false,
        "a frame rate cannot be recovered from text. Defaulting to 12 or 24 would be inventing a number and " +
        "calling it data");
}

console.log("\n4. THE BOUNDARY THAT KEEPS THE LICENCE OUT");
{
    ok("!! *** IT TAKES BLOBS, NOT A PATH -- no fs, no directory walk, no network ***",
        !/node:fs|readFileSync|readdir|fetch|child_process/.test(codeOnly(SRC)),
        "a function that takes its input is testable; one that reads a disk is not, and this has to be provable " +
        "before anybody trusts a 700-frame import");
    ok("!! and it names no generator anywhere in its code",
        !/gradscii|torch/i.test(codeOnly(SRC)),
        "SweK contains no generator, links against none, and CANNOT TELL WHICH ONE produced these files. That " +
        "is the whole mechanism by which the external route carries no licence with it");
    const r = fromTextFiles([{ name: "f1.txt", text: g(".") }, { name: "f2.txt", text: g(":") }], { fps: 12 });
    ok("!! the document it produces passes asciiFrames validation unchanged",
        importFrames(r.doc).ok === true && r.doc.frameCount === 2,
        "including the frameCount that importFrames then CHECKS against the array -- two independent halves " +
        "agreeing, not one half trusting the other");
}

report("WHAT THIS DOES NOT CLAIM",
    "That the external route produces GOOD frames. It carries whatever the generator gave it, including the " +
    "flicker a per-frame optimiser produces -- which is precisely why v3775's churn measurement exists and why " +
    "the player reports it on every import. RUN A STILL SECTION THROUGH YOUR GENERATOR AND READ THE CHURN: on " +
    "identical source frames it must be zero, and a LUT gives zero by construction while gradient descent need " +
    "not.");

report("AND WHAT THE OPTION ACTUALLY COSTS",
    "Nothing in the tree and one step in the workflow: you run the generator yourself, then drop its .txt " +
    "files on the page. NO VENDORING, NO SUBMODULE, NO pip INSTALL INSIDE SweK, and no AGPL question to answer " +
    "-- because there is nothing of anybody else's here to answer it about.");

console.log("\nasciiExternal-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
