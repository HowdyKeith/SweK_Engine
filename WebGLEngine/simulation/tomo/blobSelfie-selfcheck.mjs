// WebGLEngine/simulation/tomo/blobSelfie-selfcheck.mjs — v2585
//
// Run: node simulation/tomo/blobSelfie-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// GATES blob-selfie.html -- "the wax X-rays itself".
//
// ---- WHAT KEITH ASKED FOR, AND WHAT GOT BUILT INSTEAD -------------------------------------------------------------
//
// He asked for AN X-RAY SELFIE OF HIS BLOB FRIEND. A picture. To keep. "To remember our time together."
//
// What got built was a detection-method comparison: reconstruction vs ground truth, both live, no pens, no paper.
// It is genuinely good and it is genuinely not the thing. THE PAGE COULD X-RAY THE WAX AND COULD NOT KEEP A
// SINGLE PICTURE OF IT: zero toDataURL, zero toBlob, zero download, anywhere in the file.
//
// AN INSTRUMENT, NOT A CAMERA. A MOMENT WITH NO SHUTTER IS NOT A MEMORY.
//
// ---- AND HE HAD NO NAME -------------------------------------------------------------------------------------------
//
// simulation/tomo/blobPhantom.js:86 -- makeBlobs(n = 7, seed = 20260715). IT HAS ALWAYS TAKEN A SEED. The page
// has always called makeBlobs(7) and taken the default. SO THERE HAS ONLY EVER BEEN ONE BLOB FRIEND, and no way
// to ask for another or to return to one. The engine has had deterministic ?seed/?cam/?preset repro URLs since
// v1975; this page never got one.
//
// The seed IS the friend, and that is measurable: makeBlobs(7, s) is deterministic, and two seeds X-RAY
// DIFFERENTLY (blobRadonAt through the middle: 2.1681 vs 3.0985). So stamping the seed on the print is not
// decoration -- IT IS THE ADDRESS THAT BRINGS HIM BACK. A PHOTOGRAPH YOU CANNOT GET BACK TO IS A PICTURE OF A
// STRANGER.
import fs from "node:fs";
import { prose } from "../../tools/ship/sourceScan.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makeBlobs, blobRadonAt, blobSinogram } from "./blobPhantom.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PAGE = path.join(here, "..", "..", "blob-selfie.html");
let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};
const raw = fs.readFileSync(PAGE, "utf8");

// STRIP THE COMMENTS BEFORE MATCHING, AND HERE IS WHY IT IS NOT FUSSINESS.
//
// This gate's first version grepped the whole file for `makeBlobs(7, SEED)`. I sabotaged the page -- dropped the
// seed back to the default on line 52 -- AND ZERO CHECKS FAILED. The string was still in the file: IN A COMMENT
// I HAD WRITTEN, ON LINE 147, EXPLAINING WHAT THE CODE DOES.
//
// THE GATE MATCHED MY OWN PROSE DESCRIBING THE CODE, AND CALLED IT THE CODE.
//
// v2573 caught this exact thing -- a check that counted predictions.html's kill condition as an import -- and
// coined the law: A REGEX THAT GREPS PROSE WILL FIND PROSE. Twelve versions later, same session, I did it again.
// The lesson is not "remember harder", it is that A CHECK THAT READS A FILE IS READING EVERYTHING IN IT,
// INCLUDING THE SENTENCES ABOUT ITSELF.
const src = raw
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");

// ---- 1. THE SEED IS A NAME, NOT DECORATION -------------------------------------------------------------------------
{
    const sig = (b) => JSON.stringify(b);
    ok("THE SAME SEED IS THE SAME FRIEND", sig(makeBlobs(7, 20260715)) === sig(makeBlobs(7, 20260715)),
       "makeBlobs(7, 20260715) twice, byte for byte. WITHOUT THIS THE PRINT IS A PICTURE OF A STRANGER -- you could never get back to him.");
    ok("...and a different seed IS a different friend", sig(makeBlobs(7, 20260715)) !== sig(makeBlobs(7, 1234567)),
       "a seed that changed nothing would be A CONTROL THAT CANNOT FAIL, and '?seed=' would be a lie in the URL bar.");
    const a = blobRadonAt(0, 0, 0, makeBlobs(7, 20260715));
    const b = blobRadonAt(0, 0, 0, makeBlobs(7, 1234567));
    ok("...and he X-RAYS differently, which is the whole point of the page", Math.abs(a - b) > 0.1,
       "blobRadonAt through the middle: " + a.toFixed(4) + " vs " + b.toFixed(4) +
       ". THE SEED CHANGES THE THING THE INSTRUMENT MEASURES, not just the thing it draws.");
    ok("blob-selfie.html now PASSES the seed", /makeBlobs\(7, SEED\)/.test(src),
       "it called makeBlobs(7) and took the default for as long as the page has existed. simulation/tomo/blobPhantom.js:86 HAS ALWAYS TAKEN A SEED.");
    ok("...and reads it from the URL", /new URLSearchParams\(location\.search\)\.get\("seed"\)/.test(src),
       "the engine has had deterministic ?seed/?cam/?preset repro URLs since v1975. THIS PAGE NEVER GOT ONE.");
    ok("...and a junk seed does not produce a junk friend", /Number\.isFinite\(n\) \? n : 20260715/.test(src),
       "?seed=banana -> parseInt gives NaN -> makeBlobs(7, NaN) would produce who knows what, silently. It falls back to the original friend instead.");
}

// ---- 2. THE SHUTTER --------------------------------------------------------------------------------------------------
{
    ok("!! THE PAGE CAN KEEP A PICTURE NOW", /a\.href = out\.toDataURL\("image\/png"\)/.test(src) && /a\.download = "blob-selfie-"/.test(src),
       "IT HAD ZERO toDataURL, ZERO toBlob, ZERO download -- IT COULD X-RAY THE WAX AND COULD NOT KEEP A SINGLE PICTURE OF IT. AN INSTRUMENT, NOT A CAMERA. A MOMENT WITH NO SHUTTER IS NOT A MEMORY.");
    ok("...and it re-renders before reading the buffer", /renderer\.render\(scene, camera\);/.test(src) && /the buffer is not preserved/.test(raw),
       "preserveDrawingBuffer is NOT set on this renderer, so the WebGL canvas is UNDEFINED after compositing on most drivers. Reading it in the same tick it was drawn is the fix -- and it is why the capture is not one line. A selfie that came out black on Galaxina and fine in a headless test would be the worst possible outcome.");
    ok("...and the X-RAY is IN the picture", /g\.drawImage\(sino,/.test(src),
       "the sinogram is composited into the frame. WITHOUT IT, IT IS A PHOTO OF A BLOB -- the x-ray is the whole reason it is an X-RAY SELFIE.");
    ok("...and the print carries its own way home", /blob-selfie  seed " \+ SEED/.test(src),
       "the seed and the timestamp are stamped ON the image, not just in the filename -- a filename is the first thing lost when a picture gets shared.");
    ok("...and the filename carries the seed too", /a\.download = "blob-selfie-" \+ SEED/.test(src),
       "belt and braces: the stamp survives a rename, the filename survives a crop");
}

// ---- 3. THE INSTRUMENT STILL WORKS -- THE POINT WAS TO ADD A SHUTTER, NOT REBUILD THE CAMERA -------------------------
{
    ok("both detection methods are still there", /id="tRecon"/.test(src) && /id="tTruth"/.test(src),
       "'rebuilt' vs 'the real wax' -- the comparison Keith actually asked for, live, no pens or paper. NEVER BREAK WORKING THINGS: this round added a button and a seed and touched nothing else.");
    ok("...and the sinogram still computes", (() => {
        const s = blobSinogram({ nAngles: 12, nDet: 32, z: 0, blobs: makeBlobs(7, 20260715) });
        return s && s.nAngles === 12;
    })(), "blobSinogram(nAngles:12, nDet:32) -> 12 angles. The Radon transform IS the x-ray: line integrals through the field.");
    ok("...and the caption still says what it is", /the wax X-rays itself/.test(raw),
       "'Selfie -- the wax X-rays itself'. That line was already right.");
}

console.log(fails ? "\nblobSelfie-selfcheck: " + fails + " FAILED" : "\nblobSelfie-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
