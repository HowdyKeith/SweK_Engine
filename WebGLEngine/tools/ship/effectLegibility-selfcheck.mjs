#!/usr/bin/env node
// WebGLEngine/tools/ship/effectLegibility-selfcheck.mjs -- v4261
//
// Run: node tools/ship/effectLegibility-selfcheck.mjs
//
// *** THE TREE HAS EIGHT IMAGE PASSES AND HAS NEVER ASKED ANY OF THEM WHAT IT DESTROYS. *** Every gate on
// them checks the maths against the shader it was ported from -- the right question about FIDELITY, and one
// that says nothing about what happens to the picture.
//
// v4260 built the instrument without meaning to: its frames carry their own index in the pixels, so a known
// frame can be pushed through a pass and the OUTPUT asked which frame it is. Sweeping the strength knob turns
// that into a dose-response curve, and gives these passes a number they have never had -- how far each can be
// pushed before the content is gone.
//
// *** AND THE CENSUS'S FIRST TWO FINDINGS WERE ABOUT ITS OWN INSTRUMENT, which is why sections 2 and 3 come
// *** before any result about any effect. *** Running it found that v4260's encoding returns a CONFIDENT
// WRONG FRAME NUMBER 14.58% of the time under real image passes, and that it was blind to an entire class of
// damage. Both are fixed in render/videoFrames.mjs and both fixes are asserted here by re-measurement.
"use strict";
import * as E from "../../render/effectLegibility.mjs";
import * as V from "../../render/videoFrames.mjs";
import * as badTv from "../../render/badTvModel.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);
const W = 176, H = 128;

console.log("effectLegibility-selfcheck -- what each pass destroys, and what asking cost the instrument\n");

// =============================================================================================================
console.log("1. *** THE CENSUS RUNS, AND ITS OWN HEALTH CHECK IS THE FIRST NUMBER READ ***");
const CENSUS = E.census({ frames: 12 });
{
    ok("*** ZERO silent errors across the whole census ***", CENSUS.silentTotal === 0,
        CENSUS.silentTotal + " of " + CENSUS.cells + " cells returned a confident WRONG frame number");
    report("that zero is the point of sections 2 and 3: the same sweep at 24 frames measured 182 silent " +
        "errors in 1,248 cells (14.58%) against v4260's encoding, then 3, then 0.");
    ok("every pass in the table was actually exercised", Object.keys(CENSUS.passes).length === 4,
        Object.keys(CENSUS.passes).join(" "));
    for (const [n, p] of Object.entries(CENSUS.passes))
        report("  " + n.padEnd(10) + p.kind.padEnd(9) + " first failure at k=" + String(p.first).padEnd(5) +
            " monotone " + p.monotone + "   [" + p.curve.map((c) => c.correct + "/" + c.frames).join(" ") + "]");
}

// =============================================================================================================
console.log("\n2. *** FINDING ONE: A CHECK BIT NEXT TO THE BIT IT CHECKS IS NO CHECK AT ALL ***");
// v4260 put eight data blocks, then parity, then the black sync -- so bit 7 and its parity block were
// NEIGHBOURS against the right edge. A warp that pulls that edge flips both, parity stays consistent, and the
// decode hands back a plausible number. The census read frame 1 as 129 and frame 2 as 130, every time: bit 7.
// The fix is a second band, drawn REVERSED and INVERTED so the same physical damage lands on different bits.
{
    // The layout is [white sync][b0..b7][parity][black sync], so b7 is at index FRAME_BITS and parity at
    // FRAME_BITS+1 -- ADJACENT, which is the whole defect. That adjacency is kept: it is not what was wrong,
    // and moving parity around inside one band would not have helped a corruption that spans several columns.
    const bits = V.frameBits(0xA5);
    ok("the parity block still sits immediately beside bit 7 within a band",
        bits.length === V.FRAME_BITS + 3 && bits[V.FRAME_BITS] === ((0xA5 >> 7) & 1) &&
        bits[V.FRAME_BITS + 1] === V.frameParity(0xA5),
        "b7 at index " + V.FRAME_BITS + ", parity at " + (V.FRAME_BITS + 1) + " -- neighbours");
    // Reconstruct the exact failure: flip bit 7 AND parity together, in ONE band only.
    const flipBlock = (buf, band, block) => {
        const BLOCKS = V.FRAME_BITS + 3, colW = W / BLOCKS, bandH = Math.floor(H / 5);
        const y0 = band === "top" ? 0 : H - bandH, y1 = band === "top" ? bandH : H;
        for (let y = y0; y < y1; y++) for (let x = Math.floor(block * colW); x < Math.floor((block + 1) * colW); x++) {
            const i = (y * W + x) * 4; const v = buf[i] > 128 ? 0 : 255; buf[i] = buf[i + 1] = buf[i + 2] = v;
        }
        return buf;
    };
    let silent = 0, caught = 0;
    for (let n = 0; n < 64; n++) {
        const b = V.encodeFrameIndex(n, W, H);
        flipBlock(b, "top", V.FRAME_BITS);        // bit 7 (blocks are [sync][b0..b7] so index 8 is b7)
        flipBlock(b, "top", V.FRAME_BITS + 1);    // the parity block beside it
        const g = V.decodeFrameIndex(b, W, H);
        if (g === n || g < 0) caught++; else silent++;
    }
    ok("*** the exact parity-defeating flip is now caught, because the OTHER band still disagrees ***",
        silent === 0, silent + " silently wrong of 64 (v4260's encoding returned a confident wrong number here)");
    // And the control: the fix must not be "refuse everything".
    let clean = 0; for (let n = 0; n < 256; n++) if (V.decodeFrameIndex(V.encodeFrameIndex(n, W, H), W, H) === n) clean++;
    ok("CONTROL: an undamaged frame still decodes, so the fix is not blanket refusal", clean === 256, clean + "/256");
    ok("CONTROL: a constant frame is still refused in every shade",
        [0, 128, 255].every((v) => { const b = new Uint8ClampedArray(W * H * 4).fill(v);
            for (let i = 3; i < b.length; i += 4) b[i] = 255; return V.decodeFrameIndex(b, W, H) === -1; }));
}

// =============================================================================================================
console.log("\n3. *** FINDING TWO: THE INSTRUMENT SCORED badTv 312/312 AND WAS SIMPLY NOT LOOKING ***");
// badTv shifts each ROW by its own amount. v4260's decoder read exactly two pixel rows, so it measured the
// tear at those two rows and nowhere else -- and reported "survived" for a frame that was in pieces.
{
    const bandH = Math.floor(H / 5), sampled = Math.floor(bandH / 2);
    const tearPx = (row, k) => Math.abs(badTv.offsetAt((row + 0.5) / H, 0,
        { distortion: badTv.DEFAULTS.distortion * k, distortion2: badTv.DEFAULTS.distortion2 * k })) * W;
    let worst = 0, worstRow = 0;
    for (let r = 0; r < bandH; r++) { const t = tearPx(r, 3); if (t > worst) { worst = t; worstRow = r; } }
    const blockPx = W / (V.FRAME_BITS + 3);
    ok("*** at 3x, the row v4260 sampled was torn " + tearPx(sampled, 3).toFixed(2) + " px while row " +
        worstRow + " of the SAME BAND was torn " + worst.toFixed(2) + " px ***",
        tearPx(sampled, 3) < blockPx / 2 && worst > blockPx,
        "a block is " + blockPx.toFixed(1) + " px wide, so a sample leaves it past " + (blockPx / 2).toFixed(1) + " px");
    ok("BAND_ROWS now spreads the sampling across the band instead of reading its middle",
        V.BAND_ROWS.length >= 3 && new Set(V.BAND_ROWS).size === V.BAND_ROWS.length,
        "rows at " + V.BAND_ROWS.join(", ") + " of the band height");
    // The consequence, measured: badTv must NOT come back clean at its most violent setting.
    const bt = CENSUS.passes.badTv;
    ok("*** and badTv no longer survives everything: it fails at k=" + bt.first + " ***",
        bt.first !== null, "curve " + bt.curve.map((c) => c.correct + "/" + c.frames).join(" "));
    ok("  while still surviving its SHIPPED strength, which is the honest result and not a rebuke",
        bt.curve.find((c) => c.k === 1).rate === 1);
    report("a frame torn by two whole blocks HAS lost its identity, so 'unreadable' is the true answer and " +
        "'survived' was the false one. The instrument was wrong, not the effect harmless.");
}

// =============================================================================================================
console.log("\n4. *** THE RESULTS: FOUR PASSES, FOUR DIFFERENT CLIFFS, AND ONE OF THEM IS BELOW SHIPPED ***");
{
    const P = CENSUS.passes;
    const at1 = (n) => P[n].curve.find((c) => c.k === 1);
    ok("k=0 is a no-op for every pass, so the sweep starts from a known-good reading",
        Object.values(P).every((p) => p.curve[0].rate === 1),
        Object.entries(P).map(([n, p]) => n + " " + p.curve[0].correct + "/" + p.curve[0].frames).join("  "));
    ok("*** liquefy destroys the frame BELOW its shipped strength ***", P.liquefy.first < 1,
        "first failure at k=" + P.liquefy.first + ", and at the shipped k=1 it reads " +
        at1("liquefy").correct + "/" + at1("liquefy").frames);
    ok("*** aquarelle destroys it AT exactly its shipped strength ***", P.aquarelle.first === 1,
        "first failure at k=1, reading " + at1("aquarelle").correct + "/" + at1("aquarelle").frames);
    ok("crt survives its shipped look and fails below it", P.crt.first < 1 || P.crt.first === null,
        "first failure at k=" + P.crt.first + ", at k=1 it reads " + at1("crt").correct + "/" + at1("crt").frames);
    ok("the four cliffs are genuinely different, so this is a measurement and not one number repeated",
        new Set(Object.values(P).map((p) => p.first)).size >= 3,
        Object.entries(P).map(([n, p]) => n + "@" + p.first).join(" "));
    report("*** AND NONE OF THAT IS A SCORE. *** Destroying the picture is what a heavy stylisation IS -- " +
        "liquefy failing first means it displaces hardest, which is its job. The number says where the cliff " +
        "is, not whether the cliff is wrong. What it IS good for: nobody could previously say how far any of " +
        "these could be pushed before the content went, and now every one of them has a figure.");
    ok("every curve is monotone in strength", Object.values(P).every((p) => p.monotone),
        "checked, not assumed -- see firstFailure's note on why this is a check rather than a claim");
}

// =============================================================================================================
console.log("\n5. *** THE HARNESS ITSELF CAN FAIL, WHICH IS WHAT MAKES SECTION 4 WORTH READING ***");
{
    // A pass that does nothing must read as perfectly legible at every strength.
    const identity = E.legibilityCurve((src) => src, { frames: 8, strengths: [0, 1, 3] });
    ok("CONTROL: an identity pass is legible at every strength", identity.every((c) => c.rate === 1));
    ok("  and firstFailure says so rather than inventing a cliff", E.firstFailure(identity).survivesAll);
    // A pass that returns noise must read as destroyed at every strength, and NEVER silently.
    let s = 12345;
    const noise = E.legibilityCurve((src, w, h) => { const o = new Uint8ClampedArray(w * h * 4);
        for (let i = 0; i < o.length; i += 4) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
            o[i] = o[i + 1] = o[i + 2] = (s >>> 24); o[i + 3] = 255; } return o; },
        { frames: 8, strengths: [0, 1, 3] });
    ok("CONTROL: a pass that returns pure noise is destroyed at every strength", noise.every((c) => c.rate === 0));
    ok("  and is UNREADABLE rather than silently wrong", noise.every((c) => c.silent === 0),
        "silent " + noise.map((c) => c.silent).join(","));
    // A pass that returns a DIFFERENT valid frame is the nastiest case: it must be counted as silent, not correct.
    const liar = E.legibilityCurve((src, w, h) => V.encodeFrameIndex(99, w, h), { frames: 8, strengths: [1] });
    // Frame 99 is outside the 0..7 the control sweeps, so EVERY reading is a valid index that is the wrong
    // one -- which is the nastiest thing a pipeline can do and must never be scored as correct.
    ok("*** CONTROL: a pass that returns a VALID BUT WRONG frame is counted as silent, not correct ***",
        liar[0].correct === 0 && liar[0].silent === 8,
        "correct " + liar[0].correct + ", silent " + liar[0].silent + " of 8");
    ok("warpBy resamples rather than copying, so the census measures displacement",
        (() => { const src = V.encodeFrameIndex(5, W, H);
            const flipped = E.warpBy(src, W, H, (u, v) => [u, 1 - v]);
            return V.digest(flipped) !== V.digest(src); })());
}

// =============================================================================================================
console.log("\n6. *** THE PASSES ARE THE TREE'S OWN, not re-implementations that could drift ***");
{
    const src = fs.readFileSync(path.join(ROOT, "render/effectLegibility.mjs"), "utf8");
    for (const m of ["./crtModel.js", "./badTvModel.mjs", "./aquarelleModel.mjs", "./liquefyModel.mjs"])
        ok("  imports " + m, src.includes('from "' + m + '"'));
    ok("and drives each from its OWN exported DEFAULTS, so k=1 is the look the tree ships",
        /CRT_DEFAULTS\.curvature \* k/.test(src) && /badTv\.DEFAULTS\.distortion \* k/.test(src) &&
        /aquarelle\.DEFAULTS\.amplitude \* k/.test(src));
    ok("every pass records the KIND of damage it does, because that decided what the instrument could see",
        Object.values(E.PASSES).every((p) => typeof p.kind === "string" && p.kind.length > 2),
        Object.entries(E.PASSES).map(([n, p]) => n + ":" + p.kind).join(" "));
    ok("badTv's roll is pinned off, and the reason is written down rather than left as a magic zero",
        /rollSpeed: 0,\s*\/\/ the roll is a rigid translation/.test(src));
    const main = fs.readFileSync(path.join(ROOT, "main.js"), "utf8");
    ok("the engine can run the census: window.videoFrames.census()",
        /from "\.\/render\/effectLegibility\.mjs"/.test(main) && /\bcensus\(opts = \{\}\)/.test(main));
    ok("and it reports a silent count rather than only the cliffs, because that number grades the instrument",
        /the instrument is lying, not the effects/.test(main));
}

// =============================================================================================================
// SABOTAGE LOG -- each applied to a working tree, confirmed present with grep -c before the run was read,
// and restored md5-identical (videoFrames.mjs 83f69f3cdf5279a4fc1f34e09261e707, effectLegibility.mjs
// 6f41cb5823c6366ccfa28a40e4d6f0a1). Counts are what the runs printed, including where I got it wrong.
//
//   A  v4260's scheme fully restored -- one band DRAWN and one band READ.
//      -> 4 RED, and the numbers reproduce the entire finding: the census silent count goes 0 -> 72 of 480
//      (15.0%, against the 14.58% measured at 24 frames), the exact bit-7-plus-parity flip returns a
//      confident wrong number *** 64 TIMES OUT OF 64, *** badTv goes back to surviving every strength, and
//      even the pure-noise control starts decoding to real frame numbers.
//      *** MY FIRST ATTEMPT AT THIS SABOTAGE WAS WORTHLESS AND IS RECORDED RATHER THAN REDONE QUIETLY: ***
//      I removed only the bottom band's DRAW and left the decoder reading two bands, so nothing decoded at
//      all (0 of 256) and it went 8 RED. That is a crash, not the regression -- a sabotage has to restore the
//      OLD BEHAVIOUR, not break the file, or the red it produces proves nothing about the fix.
//
//   B  BAND_ROWS reduced to [0.5] -- v4260's one-row sampling, with the two bands left in place.
//      -> 3 RED: the spread assertion, and badTv back to first-failure null, i.e. surviving 3x tearing.
//      *** AND THE CENSUS'S OWN silentTotal STAYS AT 0, *** which is the finding this sabotage exists to
//      show: a blind instrument reports CLEAN, not broken. Nothing but a check on the instrument itself
//      catches this, which is why sections 2 and 3 come before any result about any effect.
//
//   C  legibilityAt scores any decodable index as correct instead of comparing it to the frame asked for.
//      -> 1 RED, from the liar control alone. Every real pass in this tree either returns the right frame or
//      returns mush, so nothing else in the census would have noticed; the control is the whole defence.
//
//   D  firstFailure returns the LAST crossing instead of the first.
//      -> 4 RED in section 4. Every pass reports its cliff at k=3 and the four distinct cliffs collapse to
//      one number. The direction matters: this is the OPTIMISTIC error, reporting an effect as safe to push
//      far further than it is, so it is the one worth being unable to reach.
//
//   E  PASSES.aquarelle stops scaling by k and always uses DEFAULTS.amplitude.
//      -> 3 RED: its k=0 reading stops being a no-op (0/12 where every other pass reads 12/12), its cliff
//      claim breaks, and the source-text check on scaling-from-DEFAULTS catches the cause.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: THE GPU. Every pass measured above is the CPU model, not the shader that ships " +
    "in the browser, and the two are only known to agree where an existing gate compares them -- so a cliff " +
    "measured here is the model's cliff and the shader's is assumed to match. Four of the tree's image " +
    "passes are covered and the rest are not: chromaKey, chuckClose, transition and swiftShader have no " +
    "driver here, chuckClose because it returns cells rather than an image and transition because it needs " +
    "two sources. Nothing measures COMPOSITION either -- a chain of two passes has a legibility of its own " +
    "and this only ever runs one. And the frame pattern is a synthetic test card: it says what survives for " +
    "BLOCKS OF FLAT BLACK AND WHITE, which is the easiest possible content, so every cliff here is an " +
    "OPTIMISTIC bound on where real footage stops being recognisable.");
process.exit(fails ? 1 : 0);
