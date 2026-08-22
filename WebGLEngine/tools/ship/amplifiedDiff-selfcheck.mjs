// WebGLEngine/tools/ship/amplifiedDiff-selfcheck.mjs
//
// Run: node tools/ship/amplifiedDiff-selfcheck.mjs   (~0.1s -- MEASURED)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// v3252 -- SHOW THE RESIDUAL, AMPLIFIED. TAKEN FROM netherite.
//
// Infatoshi/netherite rewrote Minecraft 1.11.2 in C and CUDA and bit-verified it against the real game --
// "validated on terrain, physics, and pixels, THE GATES SHIP IN THE REPO", 23/23 tapes replaying to 1e-9 with
// CPU and CUDA bitwise-identical every tick. Its receipt for the inventory screen is the technique this round
// takes:
//
//     "my inventory screen minus Minecraft's, AMPLIFIED 80x so you can see anything at all.
//      112,796 pixels. 442 differ, each by 0.3%"
//
// *** TWO IMAGES THAT DIFFER BY A THIRD OF A PERCENT LOOK LIKE THE SAME IMAGE. *** render-qa already gates
// numerically and already refuses to conflate too-different with SUSPICIOUSLY IDENTICAL (regionFracInRange
// gates BOTH ends, on the grounds that two backends agreeing perfectly may mean one is frozen). What it could
// not do is let a person SEE a near-match -- and "looks fine" is the verdict this project spends its rounds
// refusing to accept.
//
// THREE REFUSALS ARE THE DESIGN, and each is asserted below by driving it rather than reading it.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { noComments } from "./sourceScan.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const { amplifiedDiff, diffReceipt } =
    await import(pathToFileURL(path.join(ROOT, "tools", "render-qa", "amplifiedDiff.mjs")).href);
const modRaw = fs.readFileSync(path.join(ROOT, "tools", "render-qa", "amplifiedDiff.mjs"), "utf8");
const pageRaw = fs.readFileSync(path.join(ROOT, "amplified-diff.html"), "utf8");

const px = (n, v = 128) => new Uint8ClampedArray(n * 4).fill(v);

// ---- 1. IT REPRODUCES netherite's OWN RECEIPT --------------------------------------------------------------------------
{
    // THE FIXTURE IS THEIR NUMBERS: 112,796 pixels, 442 differing by one byte each.
    const N = 112796, a = px(N), b = px(N);
    for (let i = 0; i < 442; i++) b[i * 4 + 1] = 129;
    const { stats } = amplifiedDiff(a, b, { gain: 80 });

    ok("!! *** the receipt carries counts AND fractions AND a magnitude ***",
        stats.pixels === 112796 && stats.differing === 442 && stats.maxDelta === 1 &&
        /112,796 pixels\. 442 differ/.test(diffReceipt(stats)),
        diffReceipt(stats) + " -- '442 of 112,796' and '0.392%' answer DIFFERENT QUESTIONS and a reader given " +
        "only one will invent the other");
}

// ---- 2. THE THREE REFUSALS ----------------------------------------------------------------------------------------------
{
    const { out } = amplifiedDiff(px(4), (() => { const b = px(4); b[1] = 129; return b; })(), { gain: 80 });
    ok("!! *** the image SATURATES and the magnitude is computed BEFORE the gain ***",
        out[1] === 80 && /maxDelta answers HOW MUCH/.test(modRaw) && /computed BEFORE the gain/.test(modRaw),
        "at 80x anything above 3/255 is already full white, so THE PICTURE CANNOT TELL A SMALL DIFFERENCE FROM A " +
        "LARGE ONE -- it only answers WHERE. Reading an amplified image as a magnitude is the mistake this " +
        "module exists to make impossible, so maxDelta comes off the raw bytes");

    // Alpha excluded: two buffers identical in RGB but wildly different under alpha must read as identical.
    const a2 = px(2), b2 = px(2);
    b2[3] = 0; b2[7] = 0;
    ok("!! ...and ALPHA is excluded from the comparison",
        amplifiedDiff(a2, b2).stats.differing === 0 && /can carry any colour at all/.test(modRaw),
        "a fully transparent pixel can hold any RGB, so two renders agreeing on every VISIBLE pixel can differ " +
        "wildly underneath. Reporting that would be REPORTING A FACT ABOUT UNDEFINED DATA");

    let threw = false;
    try { amplifiedDiff(px(10), px(11)); } catch { threw = true; }
    ok("!! ...and a SIZE MISMATCH throws rather than diffing the overlap",
        threw && /size mismatch, not a pixel difference/.test(modRaw),
        "comparing the shorter of two buffers would measure a CROP against an ORIGINAL and call the missing part " +
        "identical -- a passing result invented by the tool");
}

// ---- 3. IDENTICAL IS A FINDING, NOT A PASS ------------------------------------------------------------------------------
{
    const same = amplifiedDiff(px(9), px(9));
    ok("!! *** byte-identical output is reported as a state to CHECK, not as success ***",
        same.stats.identical === true && /Verify both sources actually rendered/.test(diffReceipt(same.stats)),
        "render-qa's own regionFracInRange already gates BOTH ends because two backends agreeing perfectly may " +
        "mean ONE IS FROZEN. A diff that returned an all-black image with no flag would hide exactly that -- " +
        "and an all-black diff is the most reassuring picture there is");
}

// ---- 4. THE FRONT DOOR --------------------------------------------------------------------------------------------------
{
    const code = noComments(pageRaw);
    ok("!! the page exists, imports the module, and is in a drawer",
        /amplifiedDiff/.test(code) && /tools\/render-qa\/amplifiedDiff\.mjs/.test(pageRaw) &&
        /amplified-diff\.html/.test(fs.readFileSync(path.join(HERE, "pageSections.mjs"), "utf8")),
        "A MODULE WITH NO CALLER IS UNFINISHED -- Keith's law, and a diff tool nobody can open is the exact shape " +
        "of the thing this session keeps finding");

    ok("...and the page says what the amplified image CANNOT tell you",
        /saturates/i.test(pageRaw) && /only says/i.test(pageRaw),
        "the caveat belongs where somebody is looking at the picture, not in a module header they will never open");
}

console.log();
console.log("  ----  WHAT THIS DOES NOT DO: capture the two renders. It diffs images somebody supplies, so the");
console.log("  ----  WebGL2-vs-WebGPU comparison netherite's CPU-vs-CUDA parity suggests still needs a capture");
console.log("  ----  path -- and on this box, no GPU. THE INSTRUMENT IS HERE; the two pictures are Keith's rig.");
if (fails) { console.log("amplifiedDiff-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("amplifiedDiff-selfcheck: all checks pass");
