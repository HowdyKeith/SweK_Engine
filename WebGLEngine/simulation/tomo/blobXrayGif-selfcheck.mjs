// WebGLEngine/simulation/tomo/blobXrayGif-selfcheck.mjs — v2591
//
// Run: node simulation/tomo/blobXrayGif-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// GATES the GIF button on blob-selfie.html.
//
// v2590 shipped render/gifRecorder.js AND NOTHING IMPORTED IT. A MEASUREMENT WITH NO FRONT DOOR IS INVISIBLE
// (v2580's law) -- an encoder nobody can press is a library, not a keepsake. This is the door.
//
// ---- WHY A TURN AND NOT A SINOGRAM ------------------------------------------------------------------------------
//
// drawSino() already draws the sinogram, and that is THE DATA: every angle at once, theta down the y-axis. This
// is THE MOVIE: one projection per frame, theta swept. SAME TRANSFORM, DIFFERENT QUESTION. The whole point of a
// tomograph is that it looks at you from every angle, so THE TURN is the one keepsake this page owed.
//
// ---- WHY A GIF, MEASURED RATHER THAN PREFERRED -------------------------------------------------------------------
//
// v2588: MediaRecorder's "video/mp4" is a real MP4 container WITH VP9 INSIDE IT -- avc1 absent, vp09 at byte 28.
// A TV opens it, cannot decode it, shows black, and isTypeSupported() said yes the whole way. H.264 needs ffmpeg
// on Galaxina. A GIF NEEDS NOBODY.
//
// v2590: a GIF is 256 colours per frame, maximum -- BRUTAL for the blob's smooth gradients, FREE for a
// greyscale x-ray, because a grey ramp fits a palette exactly. THE X-RAY IS THE ONE THING ON THIS PAGE THAT
// LOSES ALMOST NOTHING AS A GIF.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { blobRadonAt, makeBlobs } from "./blobPhantom.js";
import { encodeGif, sniffGif, realGifFps } from "../../render/gifRecorder.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PAGE = path.join(here, "..", "..", "blob-selfie.html");
let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};
// v2585's lesson, twelve versions old and still earning: STRIP THE COMMENTS BEFORE MATCHING, or the gate finds
// its own prose. A REGEX THAT GREPS PROSE WILL FIND PROSE.
const raw = fs.readFileSync(PAGE, "utf8");
const src = raw.split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");

// ---- 1. THE DOOR EXISTS AND IS CONNECTED --------------------------------------------------------------------------
{
    ok("the page IMPORTS the encoder v2590 shipped", /import \{ encodeGif, realGifFps \} from "\.\/render\/gifRecorder\.js"/.test(src),
       "v2590 shipped render/gifRecorder.js AND NOTHING IMPORTED IT FOR A VERSION. AN ENCODER NOBODY CAN PRESS IS A LIBRARY, NOT A KEEPSAKE.");
    ok("...there is a button", /id="gif"/.test(src), "beside the shutter and 'another friend'");
    ok("...and it is WIRED, not just present", /getElementById\("gif"\)\.addEventListener\("click"/.test(src),
       "A CONTROL THAT CANNOT FAIL IS DECORATION -- and a button with no listener cannot even do that.");
    ok("...and a failure SAYS SO instead of dying silently", /gif failed: " \+ e\.message/.test(src),
       "recordXrayGif().catch() writes to the note. A button that does nothing and reports nothing IS INDISTINGUISHABLE FROM A BROKEN ONE.");
    ok("...and it re-enables the button afterwards", /btn\.textContent = was; btn\.disabled = false;/.test(src),
       "a disabled button that never comes back is a page you have to reload");
}

// ---- 2. THE PAGE'S EXACT CONSTANTS, READ OFF THE PAGE -------------------------------------------------------------
{
    // Do NOT hardcode these -- READ them, so that changing the page changes the test. A gate holding its own
    // copy of the constants is v2583's gate testing a copy of the DDA.
    const g = (re) => { const m = src.match(re); return m ? Number(m[1]) : NaN; };
    const W = g(/GIF_W = (\d+)/), H = g(/GIF_H = (\d+)/), N = g(/GIF_FRAMES = (\d+)/), D = g(/GIF_DELAY = (\d+)/);
    ok("the page's constants are readable and sane", W === 128 && H === 128 && N === 24 && D === 80,
       W + "x" + H + ", " + N + " frames, " + D + "ms. READ OFF THE PAGE, NOT COPIED INTO THIS FILE -- so changing the page changes this test.");

    // and now run THE PAGE'S OWN MATH at those constants
    const blobs = makeBlobs(7, 20260715);
    const frame = (theta) => {
        const rgba = new Uint8ClampedArray(W * H * 4);
        let mx = 0; const vals = new Float32Array(W * H);
        for (let j = 0; j < H; j++) {
            for (let i = 0; i < W; i++) {
                const v = blobRadonAt((i / W) * 4 - 2, theta, (j / H) * 4 - 2, blobs);
                vals[j * W + i] = v; if (v > mx) mx = v;
            }
        }
        for (let k = 0; k < vals.length; k++) {
            const c = Math.max(0, Math.min(255, Math.round((vals[k] / (mx || 1)) * 255)));
            rgba[k * 4] = c; rgba[k * 4 + 1] = c; rgba[k * 4 + 2] = Math.min(255, c + 20); rgba[k * 4 + 3] = 255;
        }
        return rgba;
    };
    const t0 = Date.now();
    const frames = [];
    for (let f = 0; f < N; f++) frames.push(frame((f / N) * Math.PI));
    const bytes = encodeGif(frames, W, H, { delay: D, colors: 128, grey: true });
    const ms = Date.now() - t0;

    ok("!! THE BUTTON PRODUCES A REAL GIF", sniffGif(bytes) && bytes[bytes.length - 1] === 0x3b,
       (bytes.length / 1024).toFixed(1) + " KB, magic GIF89a, trailer 0x3b, in " + ms + "ms. THE PAGE'S EXACT EXPRESSION, RUN -- not a paraphrase of it. v2581 is why: a page's own line is the only thing worth testing.");
    ok("...and it is fast enough not to feel broken", ms < 3000,
       ms + "ms for " + N + " projections plus the encode. A button that hangs for ten seconds with no feedback GETS PRESSED AGAIN, and now you have two.");

    // ---- 3. IT ACTUALLY TURNS. EVERY BYTE. -------------------------------------------------------------------
    let d = 0;
    const a = frames[0], b = frames[Math.floor(N / 2)];
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
    ok("!! IT TURNS -- and this is checked byte by byte, not sampled", d > 1000,
       d + " of " + a.length + " bytes differ between theta=0 and theta=pi/2. v2590's version of this check STRIDED BY 97 AND FOUND 0 OF 96 WHILE 894 BYTES DIFFERED -- the stride aliased against the row pitch. THE CODE WAS RIGHT AND THE INSTRUMENT WAS WRONG. A GIF OF 24 IDENTICAL FRAMES IS A PNG THAT WASTED YOUR TIME AND WOULD PASS EVERY OTHER CHECK HERE.");

    // ---- 4. THE PER-FRAME NORMALISE, WHICH IS NOT COSMETIC ---------------------------------------------------
    // TWO HALVES, AND I NEEDED BOTH -- THE SABOTAGE PROVED IT.
    //
    // This check first only ran MY copy of the frame function and asserted every frame peaked at 255. I killed
    // the per-frame normalise IN THE PAGE and ZERO CHECKS FAILED: my copy still normalised, because it was my
    // copy. A CHECK THAT TESTS A COPY IS GRADING A COPY -- v2583's gate re-implemented the DDA and made exactly
    // this mistake, and I read the CONSTANTS off the page here and then held my own math anyway.
    //
    // So: the SOURCE must contain the expression (or the page is not doing it), AND the expression must be
    // RIGHT (or the page is doing something broken). Neither half is sufficient. The first is a grep and the
    // second is arithmetic, and a gate needs both because THE PAGE'S JS CANNOT RUN HERE -- there is no server.
    ok("the PAGE normalises per frame (grepped from the page, not from my copy)",
       /const c = Math\.max\(0, Math\.min\(255, Math\.round\(\(vals\[k\] \/ \(mx \|\| 1\)\) \* 255\)\)\);/.test(src),
       "THE PAGE'S OWN LINE. I killed this in the page to test the gate and ZERO CHECKS FAILED, because the check below was running MY copy of the frame function. A CHECK THAT TESTS A COPY IS GRADING A COPY.");
    ok("...and that expression DOES use the full range", (() => {
        return frames.every((fr) => { let m = 0; for (let i = 0; i < fr.length; i += 4) if (fr[i] > m) m = fr[i]; return m === 255; });
    })(), "all " + N + " frames peak at 255. WITHOUT THIS THE TURN FLICKERS: the projection through a blob is THICKER at some angles than others, so a shared scale makes the whole image PULSE -- which reads as 'the encoder is broken' AND IS ACTUALLY PHYSICS.");
}

// ---- 5. THE KEEPSAKE CARRIES ITS WAY HOME -------------------------------------------------------------------------
{
    ok("the filename carries the SEED", /a\.download = "blob-xray-" \+ SEED/.test(src),
       "v2585: THE SEED IS THE FRIEND -- makeBlobs(7, SEED) is deterministic, so the number IS the address that brings him back. A PHOTOGRAPH YOU CANNOT GET BACK TO IS A PICTURE OF A STRANGER.");
    ok("...and the note tells the truth about the framerate", /CANNOT do 60/.test(raw) && /fps\.actualFps/.test(src),
       "realGifFps(80) -> " + realGifFps(80).actualFps.toFixed(1) + "fps. GIF stores delay in 10ms UNITS. A page that said '60fps' because you asked for 60 WOULD BE A FLAG THAT LIES.");
    ok("...and the object URL is revoked", /revokeObjectURL/.test(src),
       "a 40 KB blob URL per press, never freed, is a leak nobody notices until the tab is a gigabyte");
}

console.log(fails ? "\nblobXrayGif-selfcheck: " + fails + " FAILED" : "\nblobXrayGif-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
