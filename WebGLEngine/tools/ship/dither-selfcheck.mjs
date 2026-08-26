// tools/ship/dither-selfcheck.mjs
//
// Run: node tools/ship/dither-selfcheck.mjs
// RUNTIME 101ms MEASURED (median of 3 -- 102/101/98 ms, date(1) around the run). Pure arithmetic and one
// file read; it drives no browser. The GPU compile-and-render this rests on was done separately with
// Playwright and is recorded in fx/dither.js -- a GPU launch per ship to re-learn a written-down fact is the
// trade persistTruth-selfcheck already refused.
//
// v4031 -- THE DITHER MATRIX IS GENERATED AND THE SHADERS ARE GENERATED FROM IT, SO THE THING TO GATE IS NOT
// "are the numbers right" BUT "is there still only ONE SET OF THEM".
//
// A hand-typed 8x8 matrix is 64 chances to transpose a digit. A hand-typed GLSL copy is 64 more, with nothing
// comparing the two -- and a dither matrix that is subtly wrong still LOOKS like dithering, so the failure is
// invisible by inspection. fx/dither.js therefore builds BAYER8 from the Bayer recurrence and builds the GLSL
// and WGSL sources by serialising THAT ARRAY. The load-bearing property is:
//
//     THE SHADER CONSTANTS ARE A FUNCTION OF THE JS ARRAY, NOT A TRANSCRIPTION OF IT.
//
// If someone ever pastes the 64 numbers into the GLSL string literally, this gate reddens -- not because the
// numbers would be wrong that day, but because from that day on they COULD drift and nothing would notice.
// That is v3527's rule ("the second copy is never the one that gets updated") applied before the second copy
// exists rather than after it bites.
//
// AND THE EFFECT ITSELF IS MEASURED, NOT ASSERTED. "Reduces banding" is untestable; the two numbers below are
// not, and they include the one that gets WORSE -- a gate that reported only the flattering half would be
// selling the technique rather than testing it.
//
// *** codeOnly() blanks string CONTENTS and regex bodies; noComments() keeps them. The BAYER8_LIST checks below
// look for NUMBERS INSIDE A TEMPLATE STRING, so they are on `text` (noComments). Checking a CODE SHAPE uses
// `code`. This species has bitten six times in this tree. ***
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { codeOnly, noComments } from "./sourceScan.mjs";
import { BAYER8, N, buildBayer, bayerOffset, ditherQuantize, plainQuantize,
         DITHER_GLSL, DITHER_WGSL, BAYER8_LIST } from "../../fx/dither.js";
import { WORMHOLE_NEBULA_GLSL_FS as WORMHOLE_GLSL,
         WORMHOLE_NEBULA_WGSL as WORMHOLE_WGSL } from "../../fx/wormhole/wormholeNebula.js";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const say = (l) => console.log("  ----  " + l);
const SRC = fs.readFileSync(path.join(ENG, "fx", "dither.js"), "utf8");

console.log("dither-selfcheck -- one set of constants, and a measured effect\n");

// ---------------------------------------------------------------------------
console.log("1. *** THE MATRIX IS THE PUBLISHED BAYER MATRIX, NOT MERELY A SELF-CONSISTENT ONE ***");
{
    // THE PUBLISHED 8x8, typed here ON PURPOSE as an INDEPENDENT WITNESS. This is the one place a second copy
    // is correct: fx/dither.js DERIVES its matrix and this ASSERTS it, so agreement means the recurrence is
    // right rather than that one array equals itself. Getting the recurrence's block/interleave form wrong
    // yields a valid dither pattern that is NOT canonical Bayer -- plausible, and wrong.
    const PUBLISHED = [
         0, 32,  8, 40,  2, 34, 10, 42,
        48, 16, 56, 24, 50, 18, 58, 26,
        12, 44,  4, 36, 14, 46,  6, 38,
        60, 28, 52, 20, 62, 30, 54, 22,
         3, 35, 11, 43,  1, 33,  9, 41,
        51, 19, 59, 27, 49, 17, 57, 25,
        15, 47,  7, 39, 13, 45,  5, 37,
        63, 31, 55, 23, 61, 29, 53, 21,
    ];
    ok("!! *** the generated matrix equals the published one, entry for entry ***",
        BAYER8.length === 64 && BAYER8.every((v, i) => v === PUBLISHED[i]),
        BAYER8.every((v, i) => v === PUBLISHED[i]) ? "all 64 agree"
            : "first disagreement at index " + BAYER8.findIndex((v, i) => v !== PUBLISHED[i]));
    ok("!! ...and it is a PERMUTATION of 0..63, which is what makes it a threshold ladder",
        new Set(BAYER8).size === 64 && Math.min(...BAYER8) === 0 && Math.max(...BAYER8) === 63,
        "a repeated entry would mean two thresholds fire together and the ladder has a missing rung");
    // The recurrence must hold at other sizes too, or 8 agreeing is a coincidence nobody would catch at 16.
    ok("!! the recurrence is general: 1, 2 and 4 are also exact",
        JSON.stringify(buildBayer(1)) === JSON.stringify([0]) &&
        JSON.stringify(buildBayer(2)) === JSON.stringify([0, 2, 3, 1]) &&
        JSON.stringify(buildBayer(4)) === JSON.stringify([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]),
        "M2 = [0,2,3,1] and M4's first row = [0,8,2,10] are the published smaller matrices");
    ok("!! ...and 16 is still a permutation of its range",
        (() => { const m = buildBayer(16); return m.length === 256 && new Set(m).size === 256 && Math.max(...m) === 255; })());
}

// ---------------------------------------------------------------------------
console.log("\n2. *** THE OFFSET IS CENTRED ON ZERO, WHICH IS NOT THE OBVIOUS FORMULA ***");
{
    // v/64 would run 0..63/64 -- every offset non-negative, so the whole image biases BRIGHTER by half a level.
    // (v+0.5)/64-0.5 runs -31.5/64..+31.5/64 and sums to exactly zero over a tile.
    let sum = 0, min = Infinity, max = -Infinity;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const o = bayerOffset(x, y); sum += o; min = Math.min(min, o); max = Math.max(max, o); }
    ok("!! *** the mean offset over one tile is EXACTLY zero ***", sum === 0,
        "sum = " + sum + " -- an uncentred matrix adds a constant half-level brightness the block test could never get under");
    ok("!! ...and the offsets are symmetric about zero", Math.abs(min + max) < 1e-12,
        "min " + min.toFixed(6) + ", max " + max.toFixed(6));
    // Tiling: the matrix must repeat, including at negative coordinates (a shader can hand back anything).
    ok("!! the pattern tiles, and negative coordinates do not fall off it",
        bayerOffset(0, 0) === bayerOffset(8, 8) && bayerOffset(0, 0) === bayerOffset(-8, -8) &&
        bayerOffset(3, 5) === bayerOffset(-5, -3),
        "JS % is signed, so a bare x%8 would return a NEGATIVE index and read undefined off the array");
}

// ---------------------------------------------------------------------------
console.log("\n3. *** THE EFFECT, MEASURED -- INCLUDING THE HALF THAT GETS WORSE ***");
{
    // THE REAL BANDING CASE IS A SLOW RAMP: more pixels than levels, so consecutive pixels round together into
    // visible plateaus. A ramp that lands exactly on the quantisation levels has nothing to dither, and an
    // earlier version of this measurement used exactly such a ramp and reported a 1.0x "improvement" at 8 bits
    // -- a FIXTURE ARTEFACT that would have been read as "dithering does not help at 8 bits". Recorded here so
    // the next person does not rediscover it.
    const measure = (levels, span, W = 512, H = 64) => {
        let pxPlain = 0, pxDith = 0, n = 0;
        const truth = [], plain = [], dith = [];
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const t = 0.3 + span * (x / (W - 1));
            const p = plainQuantize(t, levels), d = ditherQuantize(t, x, y, levels);
            truth.push(t); plain.push(p); dith.push(d);
            pxPlain += Math.abs(p - t); pxDith += Math.abs(d - t); n++;
        }
        let blkPlain = 0, blkDith = 0, blocks = 0;
        for (let by = 0; by + N <= H; by += N) for (let bx = 0; bx + N <= W; bx += N) {
            let st = 0, sp = 0, sd = 0;
            for (let y = by; y < by + N; y++) for (let x = bx; x < bx + N; x++) { const i = y * W + x; st += truth[i]; sp += plain[i]; sd += dith[i]; }
            const c = N * N; blkPlain += Math.abs(sp / c - st / c); blkDith += Math.abs(sd / c - st / c); blocks++;
        }
        return { pxPlain: pxPlain / n, pxDith: pxDith / n, blkPlain: blkPlain / blocks, blkDith: blkDith / blocks };
    };

    const r = measure(256, 0.05);   // 8-bit channel, a 0.05 ramp over 512px: ~40 pixels per level. Severe banding.
    say(`8-bit, slow ramp: per-pixel plain ${r.pxPlain.toExponential(2)} dither ${r.pxDith.toExponential(2)}` +
        ` | block-mean plain ${r.blkPlain.toExponential(2)} dither ${r.blkDith.toExponential(2)}`);
    ok("!! *** THE LOCAL AVERAGE TRACKS THE TRUE RAMP AT LEAST 5x MORE CLOSELY ***",
        r.blkPlain / r.blkDith >= 5,
        "measured " + (r.blkPlain / r.blkDith).toFixed(1) + "x -- this is what 'reduces banding' means as a number");
    ok("!! *** ...AND PER-PIXEL ERROR GETS WORSE, WHICH IS THE PRICE AND MUST NOT BE HIDDEN ***",
        r.pxDith > r.pxPlain,
        "measured " + (r.pxDith / r.pxPlain).toFixed(2) + "x worse per pixel. Dithering ADDS no information -- " +
        "it moves error out of the low frequencies the eye integrates and into the high ones it does not. A gate " +
        "reporting only the improvement would be selling the technique rather than testing it");
    // The worse the banding, the more it should help -- if that ordering inverted, the mechanism is not what we think.
    const mild = measure(256, 0.25), severe = measure(256, 0.05);
    ok("!! ...and it helps MOST where banding is worst, which is the mechanism's own prediction",
        (severe.blkPlain / severe.blkDith) > (mild.blkPlain / mild.blkDith),
        `severe ramp ${(severe.blkPlain / severe.blkDith).toFixed(1)}x vs mild ${(mild.blkPlain / mild.blkDith).toFixed(1)}x`);
    ok("!! a fully-representable value is left alone by both", ditherQuantize(0.5, 3, 4, 3) === plainQuantize(0.5, 3),
        "0.5 is exactly representable in 3 levels; dithering must not move a value that needs no help");
    ok("!! and the output never leaves 0..1 even at the ends of the range",
        [0, 1, 0.0001, 0.9999].every((v) => { for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const q = ditherQuantize(v, x, y, 8); if (q < 0 || q > 1) return false; } return true; }),
        "the offset pushes values outward at the extremes; unclamped that is a wrapped colour channel");
}

// ---------------------------------------------------------------------------
console.log("\n4. *** ONE SET OF CONSTANTS: THE SHADERS ARE BUILT FROM THE ARRAY, NOT TYPED BESIDE IT ***");
{
    const code = codeOnly(SRC), text = noComments(SRC);
    // THE LOAD-BEARING CHECK. The GLSL/WGSL sources must INTERPOLATE the serialised array, never contain the
    // digits themselves. `${BAYER8_LIST}` in the template is what makes the shader a function of the JS.
    // *** THE DIRECT STATEMENT, NOT A PROXY FOR IT. *** The first draft asked whether "${BAYER8_LIST}" appeared
    // ANYWHERE in the file -- which the WGSL satisfied on its own, so pasting the 64 digits into the GLSL left
    // the check green. MEASURED: that exact sabotage produced ZERO failures. The property is "the digits are
    // not in the source", so THAT is what is asserted, per template, by looking for the digits themselves.
    const bayerDigits = BAYER8.join(",");
    ok("!! *** the 64 digits appear NOWHERE in the source -- they are computed, not typed ***",
        !SRC.includes(bayerDigits),
        "BAYER8_LIST is built at runtime by BAYER8.join(\",\"); if that string is ever found in the source " +
        "itself, someone has pasted a second copy and from that day it can drift with nothing comparing them");
    const glslTpl = (SRC.match(/const DITHER_GLSL = `[\s\S]*?`;/) || [""])[0];
    const wgslTpl = (SRC.match(/const DITHER_WGSL = `[\s\S]*?`;/) || [""])[0];
    ok("!! ...and EACH template interpolates it, checked per template rather than file-wide",
        /\$\{BAYER8_LIST\}/.test(glslTpl) && /\$\{BAYER8_LIST\}/.test(wgslTpl),
        "GLSL: " + (/\$\{BAYER8_LIST\}/.test(glslTpl) ? "interpolated" : "*** LITERAL ***") +
        ", WGSL: " + (/\$\{BAYER8_LIST\}/.test(wgslTpl) ? "interpolated" : "*** LITERAL ***"));
    ok("!! ...and BAYER8_LIST really is derived from the one array",
        /const BAYER8_LIST = BAYER8\.join/.test(code));
    // Prove it by CONTENT too: the emitted shader really does carry the same numbers, in the same order.
    ok("!! ...and the emitted GLSL really carries the same 64 numbers in the same order",
        DITHER_GLSL.includes(BAYER8.join(",")), "generated, then checked -- belt and braces");
    ok("!! ...and so does the WGSL", DITHER_WGSL.includes(BAYER8.join(",")));
    ok("!! the two shader sources agree with each other on the constants",
        (DITHER_GLSL.match(/\d+(,\d+)+/) || [""])[0] === (DITHER_WGSL.match(/\d+(,\d+)+/) || [""])[0],
        "GLSL and WGSL are separate strings; the only thing keeping them equal is that both are built from BAYER8");

    // The arithmetic must mirror the JS, not merely the constants. Same centring, same tile size, same clamp.
    for (const [name, s] of [["GLSL", DITHER_GLSL], ["WGSL", DITHER_WGSL]]) {
        ok(`!! ${name} uses the CENTRED offset formula, matching bayerOffset`,
            s.includes("+ 0.5) / 64.0 - 0.5"),
            "an uncentred shader would bias brighter than the JS by half a level and nothing would compare them");
        ok(`!! ${name} clamps its result`, /clamp\(/.test(s));
    }
    ok("!! Floyd-Steinberg is ABSENT and the reason is written down, not just omitted",
        !/floyd|steinberg/i.test(code) && /error diffusion does not exist as a fragment/i.test(SRC),
        "error diffusion is sequential and has no fragment-shader form; naming the absent half is cheaper than " +
        "someone rediscovering why it never landed");
}

// ---------------------------------------------------------------------------
console.log("\n5. *** IT IS WIRED, AND WIRED AS AN OPT-IN THAT LEAVES VERIFIED OUTPUT ALONE ***");
{
    // A capability with a gate and no caller is what this tree calls an orphaned utility -- "wire it, or
    // delete it". graveyard-selfcheck flagged exactly that on the first draft of fx/dither.js, correctly.
    const WN = fs.readFileSync(path.join(ENG, "fx", "wormhole", "wormholeNebula.js"), "utf8");
    const wcode = codeOnly(WN), wtext = noComments(WN);
    ok("!! *** wormholeNebula IMPORTS the snippets rather than restating them ***",
        /from "\.\.\/dither\.js"/.test(wtext) && /DITHER_GLSL/.test(wcode) && /DITHER_WGSL/.test(wcode),
        "one owner for the matrix; this file decides only WHERE it is applied");
    ok("!! ...and both emitted shaders actually carry the Bayer constants",
        WORMHOLE_GLSL.includes(BAYER8.join(",")) && WORMHOLE_WGSL.includes(BAYER8.join(",")),
        "checked on the EMITTED shader, so an import that was never interpolated would still redden this");
    ok("!! *** the dither is GATED ON A UNIFORM, not applied unconditionally ***",
        /uDitherLevels > 0\.0/.test(WORMHOLE_GLSL) && /ditherLevels > 0\.0/.test(WORMHOLE_WGSL),
        "an unconditional dither would change output every existing caller already depends on");
    ok("!! ...and the GLSL declares that uniform, so it is settable rather than dead",
        /uniform float uDitherLevels/.test(WORMHOLE_GLSL));
    // THE WGSL STRUCT MUST NOT HAVE GROWN -- ditherLevels replaced the pad slot, so buffer layouts still fit.
    ok("!! ...and the WGSL uniform struct did NOT grow: ditherLevels took the pad slot",
        /ditherLevels:f32, vortons/.test(WORMHOLE_WGSL) && !/pad:f32/.test(WORMHOLE_WGSL),
        "adding a field would change the struct's size and silently break every buffer written for the old one");
    // The measured proof lives in wormholeNebula.js's header; assert it is RECORDED, since the gate cannot
    // re-run a GPU cheaply and a measurement nobody wrote down is a memory.
    ok("!! *** the byte-identical-by-default measurement is RECORDED with its conditions ***",
        /0 of 65536 bytes differ/.test(WN) && /NEVER SET/.test(WN),
        "opt-in is a claim about output; it was driven on a real GPU against the pre-wiring shader and the " +
        "numbers are in the file rather than in a commit message nobody will re-read");
}

console.log("\n" + (fails ? fails + " FAILED" : "ALL PASS"));
process.exit(fails ? 1 : 0);
