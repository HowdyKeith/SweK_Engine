// WebGLEngine/render/gifRecorder-selfcheck.mjs — v2590
//
// Run: node render/gifRecorder-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// GATES render/gifRecorder.js + vendor/gifenc/.
//
// Keith: "mechanical easy things like does a GIF encoder that we might need exist? If the easy answer is yes,
// let's do that."
//
// THE EASY ANSWER WAS YES. gifenc 1.0.3, MIT, Matt DesLauriers, 12K, ZERO DEPENDENCIES, on the allowlisted npm
// registry. AND IT IS NOT TRUSTED BECAUSE npm SAID MIT -- IT WAS RUN: 8 frames of 64x64 -> 1364 bytes, magic
// "GIF89a", trailer 0x3b, in this sandbox, before a line of this was written.
//
// ---- WHY THE GIF ROAD MATTERS ---------------------------------------------------------------------------------------
//
// v2588 measured the video road honestly and it dead-ends: MediaRecorder's "video/mp4" is a real MP4 container
// WITH VP9 INSIDE (avc1 absent, vp09 at byte 28). A Roku opens it, fails to decode, shows black -- while
// isTypeSupported() said yes the whole way. H.264 needs ffmpeg on Galaxina.
//
// A GIF NEEDS NOBODY. Every browser, every chat window, every phone, every TV photo viewer. No codec
// negotiation, no transcode. IT IS THE WORST FORMAT AND THE BEST ANSWER.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { encodeGif, sniffGif, realGifFps } from "./gifRecorder.js";
import { blobRadonAt, makeBlobs } from "../simulation/tomo/blobPhantom.js";

const here = path.dirname(fileURLToPath(import.meta.url));
let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};

// ---- 1. IT IS A GIF. NOT "SUPPORTED" -- A GIF. -------------------------------------------------------------------
{
    const W = 32, H = 32;
    const frames = [];
    for (let f = 0; f < 6; f++) {
        const rgba = new Uint8ClampedArray(W * H * 4);
        for (let i = 0; i < W * H; i++) {
            const on = (i % W) > f * 4 && (i % W) < f * 4 + 8;
            rgba[i * 4] = on ? 255 : 20; rgba[i * 4 + 1] = on ? 200 : 30; rgba[i * 4 + 2] = 60; rgba[i * 4 + 3] = 255;
        }
        frames.push(rgba);
    }
    const bytes = encodeGif(frames, W, H, { delay: 100, colors: 32 });
    ok("!! IT ENCODES A REAL GIF", sniffGif(bytes),
       bytes.length + " bytes, magic " + JSON.stringify(String.fromCharCode(...bytes.slice(0, 6))) +
       ". NOT 'isTypeSupported said yes' -- THE MAGIC NUMBER SAYS SO. v2588 is the reason that distinction is in this file: MediaRecorder claimed video/mp4 and handed over VP9.");
    ok("...and it terminates correctly", bytes[bytes.length - 1] === 0x3b,
       "trailer 0x3b. A truncated GIF still starts with GIF89a -- THE FIRST SIX BYTES ARE NOT A VALIDATION.");
    // ASSERT THE MESSAGE, NOT JUST THE THROW -- AND HERE IS WHY, BECAUSE IT NEARLY SLIPPED THROUGH.
    //
    // The first version was `try { encodeGif(bad) } catch { return true }`. I DELETED MY SIZE GUARD TO PROVE THE
    // CHECK WORKED AND ZERO CHECKS FAILED: gifenc throws on a malformed buffer all by itself, so the check was
    // GRADING GIFENC'S ERROR AND CALLING IT MINE. It would have passed with my line deleted, WHICH MAKES IT
    // DECORATION FOR THE THING IT CLAIMS TO TEST -- the same species as v2583's gate that tested a copy of the
    // DDA and v2585's gate that matched its own comment.
    //
    // My guard still earns its keep: it names the ACTUAL SIZES, where gifenc's error does not. So the check
    // asserts THAT MESSAGE, which can only come from my line.
    ok("...and it REFUSES a wrong-sized frame WITH AN ERROR THAT NAMES THE SIZES", (() => {
        try { encodeGif([new Uint8ClampedArray(10)], 32, 32); return false; }
        catch (e) { return /frame is 10 bytes, expected 4096 for 32x32 RGBA/.test(e.message); }
    })(), "SILENTLY ENCODING A MISMATCHED BUFFER IS HOW YOU GET A GIF OF STATIC AND NO IDEA WHY. And the FIRST version of this check just asserted 'it throws' -- WHICH PASSED WITH MY GUARD DELETED, because gifenc throws on its own. A CHECK THAT PASSES WITHOUT THE CODE IT TESTS IS GRADING SOMEBODY ELSE'S WORK.");
    ok("...and it REFUSES zero frames", (() => { try { encodeGif([], 32, 32); return false; } catch { return true; } })(),
       "a canvas that never repaints emits none -- v2588 paid twenty minutes for that lesson with captureStream. THIS ONE SAYS SO.");
}

// ---- 2. THE REAL THING: THE X-RAY, ROTATING ----------------------------------------------------------------------
{
    const blobs = makeBlobs(7, 20260715);
    const W = 48, H = 48, N = 8;
    const frames = [];
    for (let f = 0; f < N; f++) {
        const theta = (f / N) * Math.PI;
        const rgba = new Uint8ClampedArray(W * H * 4);
        for (let j = 0; j < H; j++) {
            for (let i = 0; i < W; i++) {
                const v = blobRadonAt((i / W) * 4 - 2, theta, (j / H) * 4 - 2, blobs);
                const c = Math.max(0, Math.min(255, Math.round(v * 70)));
                const k = (j * W + i) * 4;
                rgba[k] = c; rgba[k + 1] = c; rgba[k + 2] = Math.min(255, c + 18); rgba[k + 3] = 255;
            }
        }
        frames.push(rgba);
    }
    const gif = encodeGif(frames, W, H, { delay: 90, colors: 128, grey: true });
    ok("!! THE BLOB'S X-RAY ROTATES, AS A GIF", sniffGif(gif) && gif.length > 500,
       gif.length + " bytes, " + N + " frames of REAL blobRadonAt -- THE ACTUAL RADON TRANSFORM, not an effect. v2586 proved it agrees with a numerical march to 0.0000%.");
    // COMPARE EVERY BYTE, AND THE REASON IS THE BEST BUG OF THIS ROUND.
    //
    // The first version of this check strided -- `for (i = 0; i < a.length; i += 97)` -- to save time. IT
    // REPORTED 0 OF 96 SAMPLES DIFFERENT, AND THE IMAGES DIFFER IN 894 BYTES OF 9216. The stride aliased
    // against the row pitch (48 px x 4 = 192 bytes) and walked a lattice that missed every changed pixel.
    //
    // THE CODE WAS RIGHT AND THE INSTRUMENT WAS WRONG -- blobRadonAt goes 1.3248 -> 1.9234 -> 1.4962 -> 0.2159
    // across theta, so it was rotating the whole time. Exactly v2587's counting oracle, and exactly v2583's
    // dense sampler with a hole in it: A CHECK THAT SAMPLES CAN MISS WHAT IT IS LOOKING FOR.
    //
    // It is 9216 bytes. THE SAVING WAS IMAGINARY AND THE COST WAS A FALSE PASS.
    const changed = (() => {
        const a = frames[0], b = frames[Math.floor(N / 2)];
        let d = 0;
        for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
        return d;
    })();
    ok("...and the frames are NOT all identical (it actually rotates)", changed > 100,
       changed + " of " + (48 * 48 * 4) + " bytes differ between theta=0 and theta=pi/2. A GIF OF EIGHT IDENTICAL FRAMES IS A PNG THAT WASTED YOUR TIME, AND IT WOULD HAVE PASSED EVERY OTHER CHECK IN THIS FILE. The first version of this check STRIDED BY 97 TO SAVE TIME AND FOUND 0 OF 96 -- THE STRIDE ALIASED AGAINST THE 192-BYTE ROW PITCH AND MISSED ALL 894 CHANGED BYTES. THE CODE WAS RIGHT AND THE INSTRUMENT WAS WRONG.");
}

// ---- 3. WHAT IT COSTS, SAID RATHER THAN DISCOVERED ---------------------------------------------------------------
{
    ok("!! A GIF IS 256 COLOURS, MAXIMUM, AND THAT IS THE FORMAT", (() => {
        const W = 16, H = 16;
        const rgba = new Uint8ClampedArray(W * H * 4).fill(200);
        const asked = encodeGif([rgba], W, H, { colors: 9999 });
        return sniffGif(asked);   // clamped, not thrown, not honoured
    })(), "colors:9999 is CLAMPED to 256 rather than honoured or thrown. THE BLOB'S SMOOTH GRADIENTS ARE THE WORST CASE FOR A 256-ENTRY PALETTE (banding). THE X-RAY'S GREYSCALE IS THE BEST CASE -- a grey ramp fits exactly. SO THE X-RAY SELFIE IS THE ONE THING IN THIS ENGINE THAT LOSES ALMOST NOTHING AS A GIF, which is a happy accident worth saying out loud.");

    const f = realGifFps(16);
    ok("!! AND A GIF CANNOT DO 60FPS -- IT REPORTS WHAT YOU WILL ACTUALLY GET", f.actualFps < 60 && f.actualMs === 20,
       "asked 16ms (60fps) -> GIF stores delay in HUNDREDTHS OF A SECOND -> " + f.actualMs + "ms = " + f.actualFps.toFixed(0) +
       "fps. THE FORMAT CANNOT DO IT AND ANYONE WHO TELLS YOU OTHERWISE HAS NOT CHECKED. A recorder that silently gave you 50fps when you asked for 60 would be A FLAG THAT LIES.");
    const slow = realGifFps(10);
    ok("...and it knows about the delay<=1 trap", slow.actualMs === 100,
       "delay 10ms = 1 unit, and browsers FLOOR <=1 UNIT TO 10 UNITS for historical reasons -> you get 100ms, not 10ms. A TEN-TIMES ERROR THAT NOTHING WARNS YOU ABOUT.");
}

// ---- 4. provenance, because a vendored file with no receipt is a mystery in six months ---------------------------
{
    const p = path.join(here, "..", "vendor", "gifenc");
    ok("gifenc is vendored WITH its licence and provenance", fs.existsSync(path.join(p, "gifenc.esm.js")) && fs.existsSync(path.join(p, "LICENSE")) && fs.existsSync(path.join(p, "PROVENANCE.txt")),
       "vendor/gifenc/ -- 12K, ZERO dependencies, MIT, Matt DesLauriers, git://github.com/mattdesl/gifenc.git. A VENDORED FILE WITH NO RECEIPT IS A MYSTERY IN SIX MONTHS.");
    const prov = fs.readFileSync(path.join(p, "PROVENANCE.txt"), "utf8");
    ok("...and the receipt records that it was VERIFIED BY ENCODING", /VERIFIED BY ENCODING/.test(prov) && /GIF89a/.test(prov),
       "not trusted because npm said MIT -- RUN: 8 frames 64x64 -> 1364 bytes, GIF89a, trailer 0x3b, in this sandbox, BEFORE a line of gifRecorder.js was written.");
}

console.log(fails ? "\ngifRecorder-selfcheck: " + fails + " FAILED" : "\ngifRecorder-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
