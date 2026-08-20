// tools/ship/asciiFrames-selfcheck.mjs -- v3775
//
// *** THIS MODULE DELIBERATELY OWNS NO GENERATOR, AND THE LICENCE IS WHY. Keith asked about
// stong/gradscii-art -- VERIFIED: 261 stars, 8 forks, 27 commits, PyTorch + Pillow, **AGPL-3.0**, with the
// author asking third parties to negotiate for redistribution or SaaS. So this half imports TEXT FRAMES that
// SOME OTHER PROGRAM produced and never asks which. NOTHING HERE IS DERIVED FROM THAT REPO, nothing links
// against it, and SweK inherits nothing. Vendoring it later is a LICENCE DECISION and a separate round; this
// half is useful either way, including with a plain lookup-table converter or hand-typed frames. ***
//
// *** EVERY REFUSAL HERE IS A SILENT FAILURE IF IT IS NOT MADE. A short row, a missing line and a stray tab
// all RENDER FINE in a <pre> -- they just look like art with a soft edge, a dropped frame, or a rendering bug
// in something else. NOTHING THROWS. That is the whole reason the validator exists. ***

import { validateFrames, importFrames, churn, flickerOnStill } from "./asciiFrames.mjs";
import { codeOnly } from "./sourceScan.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (n, d) => console.log("  ----  " + n + "   " + d);
const SRC = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "asciiFrames.mjs"), "utf8");
const grid = (ch, cols, rows) => Array.from({ length: rows }, () => ch.repeat(cols)).join("\n");

// ---- 1. THE SILENT ONES ------------------------------------------------------------------------------------
console.log("1. THE FAILURES THAT RENDER FINE AND LOOK LIKE ART");
{
    const short = importFrames({ fps: 12, cols: 8, rows: 3, frames: [grid(".", 7, 3)] });
    ok("!! *** A SHORT ROW IS REFUSED, WITH THE ROW, BOTH WIDTHS AND THE REASON NAMED ***",
        short.ok === false && /row 0 is 7 chars, declared 8/.test(short.errors[0]) && /SOFT RIGHT EDGE/.test(short.errors[0]),
        short.errors[0] + " -- *** IN A <pre> THIS RENDERS PERFECTLY AND JUST LOOKS LIKE THE ART HAS A SOFT " +
        "RIGHT EDGE. Nothing throws, nothing is undefined, and the reader blames the source video ***");
    ok("!! a missing row is refused too -- it would play as a jump, reading as a dropped source frame",
        importFrames({ fps: 12, cols: 8, rows: 3, frames: [grid(".", 8, 2)] }).ok === false);
    ok("!! *** A TAB IS REFUSED -- it silently reflows a monospace grid and looks like somebody else's bug ***",
        importFrames({ fps: 12, cols: 8, rows: 1, frames: ["ab\tcdefg"] }).ok === false,
        "the string is EIGHT CHARACTERS LONG, so a width check alone passes it. The content test is separate " +
        "from the length test on purpose");
    ok("!! but a Windows line ending is NORMALISED, not refused -- a CRLF file is not a malformed file",
        importFrames({ fps: 12, cols: 4, rows: 2, frames: ["....\r\n...."] }).ok === true,
        "this project already carries line-ending rules for its launchers; refusing CRLF here would be a check " +
        "that fires on correct input");
    ok("!! a trailing newline is accepted -- exactly one, and only when it leaves the right row count",
        importFrames({ fps: 12, cols: 4, rows: 2, frames: ["....\n....\n"] }).ok === true &&
        importFrames({ fps: 12, cols: 4, rows: 2, frames: ["....\n....\n\n"] }).ok === false);
}

// ---- 2. THE DECLARED COUNT ---------------------------------------------------------------------------------
console.log("\n2. A DECLARED COUNT IS A SECOND DECLARATION");
{
    const doc = { fps: 12, cols: 4, rows: 1, frames: ["....", "...."], frameCount: 3 };
    ok("!! *** frameCount THAT DISAGREES WITH THE ARRAY IS AN ERROR, NOT A PREFERENCE ***",
        importFrames(doc).ok === false && /frameCount says 3 but frames holds 2/.test(importFrames(doc).errors[0]),
        "v3729's shape: a census keyed by a number nobody compared against the thing it counts. THE WHOLE " +
        "POINT OF STATING IT IS THE CHECK");
    ok("!! and it is OPTIONAL -- absent is fine, present and wrong is not",
        importFrames({ fps: 12, cols: 4, rows: 1, frames: ["...."] }).ok === true);
}

// ---- 3. CHURN -----------------------------------------------------------------------------------------------
console.log("\n3. FLICKER AS A NUMBER RATHER THAN AN OPINION");
{
    const still = importFrames({ fps: 12, cols: 8, rows: 3, frames: [grid(".", 8, 3), grid(".", 8, 3)] });
    const f = flickerOnStill(still.frames);
    ok("!! *** IDENTICAL FRAMES GIVE EXACTLY ZERO CHURN -- THE BINARY THE MEASUREMENT EXISTS FOR ***",
        f.stable === true && f.worstChurn === 0,
        "*** THIS IS THE SHARP USE. Frame-independent optimisation FLICKERS: each frame converges to its own " +
        "local optimum, so characters jump between visually identical frames. On a section the source holds " +
        "STILL, churn MUST be zero -- anything above it means THE GENERATOR MOVED, NOT THE VIDEO. It needs no " +
        "access to the source, only two frames the caller knows were the same ***");
    const moved = importFrames({ fps: 12, cols: 8, rows: 3, frames: [grid(".", 8, 3), grid("#", 8, 3)] });
    ok("!! a fully changed frame reads 100%, so the scale is anchored at both ends",
        churn(moved.frames).mean === 1);
    ok("!! churn reports PER-PAIR as well as a mean",
        (() => { const three = importFrames({ fps: 12, cols: 4, rows: 1, frames: ["....", "....", "####"] });
                 const c = churn(three.frames);
                 return c.pairs.length === 2 && c.pairs[0] === 0 && c.pairs[1] === 1 && c.worst === 1; })(),
        "A MEAN ALONE HIDES A SINGLE CATASTROPHIC FRAME -- two pairs reading 0 and 1 average to a bland 0.5");
}

// ---- 4. WHAT IT REFUSES TO DECIDE ---------------------------------------------------------------------------
console.log("\n4. THE BOUNDARY, DECLARED");
ok("!! no fs, no canvas, no network -- pure functions over plain objects",
    !/node:fs|readFileSync|document|fetch|canvas/.test(codeOnly(SRC)),
    "so a fixture can drive it and a gate can plant against it. The PAGE does the file reading; the module " +
    "does the deciding");
ok("!! and nothing in it names a generator",
    !/gradscii|torch|pytorch/i.test(codeOnly(SRC)),
    "the schema is OURS and the module cannot tell which program produced its input -- which is exactly what " +
    "keeps the AGPL question a separate decision");

report("WHAT THIS DOES NOT CLAIM",
    "That it can tell flicker from motion. High churn on a MOVING clip is the video moving; high churn on a " +
    "STILL section is the generator flickering. THE MODULE CANNOT SEE THE SOURCE, so it reports both readings " +
    "and refuses to judge -- naming a verdict it cannot support would be worse than naming none. Nor does it " +
    "claim any encoding beyond the grid: CP437 versus UTF-8 is the caller's business, and the control-character " +
    "check is about LAYOUT, not about which glyphs are legal.");

report("AND WHAT IS STILL MISSING FOR A REAL PIPELINE",
    "A GENERATOR. This half plays and validates; producing the frames needs either a lookup-table converter " +
    "written here, or gradscii-art run OUTSIDE the tree with only its text output imported. THE SECOND COSTS " +
    "NOTHING IN LICENCE TERMS AND IS THE ONE TO TRY FIRST -- and its known hazard is already measurable here: " +
    "run a still section through it and read the churn.");

console.log("\nasciiFrames-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
