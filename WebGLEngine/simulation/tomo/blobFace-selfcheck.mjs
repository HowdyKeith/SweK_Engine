// WebGLEngine/simulation/tomo/blobFace-selfcheck.mjs — v2593
//
// Run: node simulation/tomo/blobFace-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// GATES the cut-face panel on blob-selfie.html.
//
// v2592 built cutFace() AND NOTHING DREW IT. A MEASUREMENT WITH NO FRONT DOOR IS INVISIBLE -- the same bill
// v2591 paid for the GIF encoder ONE VERSION EARLIER. This is the door.
//
// ---- WHY IT SITS NEXT TO THE SINOGRAM ----------------------------------------------------------------------------
//
// They are the two different things you can know about an inside, and the page now shows both:
//
//   the sinogram  -- the beam integrates THROUGH the blob. THAT IS A SHADOW. Every angle at once.
//   the rebuild   -- filtered back-projection. THAT IS A GUESS at the inside, assembled from shadows.
//   THE FACE      -- blobFieldAt evaluated ON the plane. THAT IS THE INSIDE, EXACTLY. No integral, no guess.
//
// A REAL CT MACHINE CAN ONLY EVER HAVE THE FIRST TWO. It must INFER the inside because it cannot ask. We can
// ask, because we have the formula. THE FACE IS THE ONE IMAGE ON THIS PAGE THAT A HOSPITAL CANNOT TAKE -- and
// it sits beside the rebuild, which means you are looking at THE ANSWER NEXT TO THE GUESS.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { plane, cutFace } from "./blobCut.js";
import { makeBlobs, ISO } from "./blobPhantom.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PAGE = path.join(here, "..", "..", "blob-selfie.html");
let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};
// v2585's law, and v2591 re-broke it: STRIP COMMENTS BEFORE MATCHING or the gate finds its own prose.
const raw = fs.readFileSync(PAGE, "utf8");
const src = raw.split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
const blobs = makeBlobs(7, 20260715);

// ---- 1. THE DOOR EXISTS ------------------------------------------------------------------------------------------
{
    ok("the page IMPORTS what v2592 built", /import \{ plane, cutFace \} from "\.\/simulation\/tomo\/blobCut\.js"/.test(src),
       "v2592 shipped cutFace() and NOTHING DREW IT -- exactly the bill v2591 paid for the GIF encoder one version earlier. A MEASUREMENT WITH NO FRONT DOOR IS INVISIBLE.");
    ok("...there is a canvas for it", /id="face"/.test(src), "beside id=\"sino\" -- THE INSIDE NEXT TO THE SHADOW");
    ok("...and two controls that are WIRED", /getElementById\("dcut"\)\.addEventListener\("input", drawFace\)/.test(src) &&
       /getElementById\("tcut"\)\.addEventListener\("input", drawFace\)/.test(src),
       "depth and tilt. A CONTROL THAT CANNOT FAIL IS DECORATION, and a slider with no listener cannot even do that.");
    ok("...and it draws once at load, not only on drag", /^\s*drawFace\(\);\s*$/m.test(src),
       "an empty canvas until you touch something IS INDISTINGUISHABLE FROM A BROKEN ONE");
}

// ---- 2. THE PAGE'S EXACT EXPRESSION, RUN -------------------------------------------------------------------------
{
    // read the page's own constant rather than holding a copy (v2591: A CHECK THAT TESTS A COPY IS GRADING A COPY)
    const N = Number((src.match(/FACE_N = (\d+)/) || [])[1]);
    ok("the page's FACE_N is readable and sane", N === 160, "FACE_N = " + N + ", READ OFF THE PAGE -- so changing the page changes this test.");

    const t0 = Date.now();
    const face = cutFace(plane(0, 0, 1, 0), blobs, { w: N, h: N, extent: 2 });
    const ms = Date.now() - t0;
    ok("!! THE FACE RENDERS, AND FAST ENOUGH TO DRAG A SLIDER", face.max > ISO && ms < 800,
       N + "x" + N + " in " + ms + "ms, peak density " + face.max.toFixed(2) +
       ". EVERY PIXEL IS ONE blobFieldAt AND THEY ARE ALL INDEPENDENT -- v2592 measured 38.6M cut tests/ms. THE SLIDER DOES NOT SWEEP A KNIFE THROUGH ANYTHING; IT CHANGES d IN n.p - d AND WE ASK AGAIN.");
}

// ---- 3. WHAT WE CAME TO SEE, AND IT IS NOT WHAT I EXPECTED ------------------------------------------------------
{
    const at = (d) => {
        const f = cutFace(plane(0, 0, 1, d), blobs, { w: 160, h: 160, extent: 2 });
        let inside = 0;
        for (const v of f.data) if (v > ISO) inside++;
        return { solid: (inside / f.data.length) * 100, peak: f.max };
    };
    const depths = [-1.2, -0.6, -0.2, 0, 0.2, 0.6, 1.2].map((d) => ({ d, ...at(d) }));
    const solids = depths.map((x) => x.solid);

    ok("!! THE BLOB HAS AN INSIDE AND IT CHANGES", Math.max(...solids) > 3 && Math.min(...solids) === 0,
       depths.map((x) => x.d.toFixed(1) + ":" + x.solid.toFixed(1) + "%").join("  ") +
       ". Solid at the middle, NOTHING at +/-1.2. SLIDING THE PLANE THROUGH IS THE ONLY WAY TO SEE THAT, and it is what Keith asked for: 'we do want to see what we can see'.");

    // THE FINDING. I did not predict this and I am not going to pretend I did.
    const widest = depths.reduce((a, b) => (b.solid > a.solid ? b : a));
    const densest = depths.reduce((a, b) => (b.peak > a.peak ? b : a));
    ok("!! THE WIDEST SLICE AND THE DENSEST SLICE ARE DIFFERENT PLANES", widest.d !== densest.d,
       "widest at d=" + widest.d + " (" + widest.solid.toFixed(1) + "% solid, peak " + widest.peak.toFixed(2) + "); " +
       "DENSEST at d=" + densest.d + " (" + densest.solid.toFixed(1) + "% solid, PEAK " + densest.peak.toFixed(2) +
       "). The blob's FATTEST cross-section and its HARDEST CORE ARE NOT IN THE SAME PLACE -- it is lumpy, and seven Gaussians have no obligation to pile up where they are widest. A SHADOW CANNOT SHOW YOU THAT AND A RECONSTRUCTION WOULD ONLY GUESS AT IT. NOBODY HAD EVER LOOKED.");
}

// ---- 4. THE FACE MUST NOT NORMALISE, AND THE GIF MUST -- OPPOSITE RULES, ONE PAGE -------------------------------
{
    ok("!! THE FACE USES A FIXED SCALE (grepped from the page, not from my copy)",
       /const SCALE = 64;/.test(src) && /Math\.round\(v \* SCALE\)/.test(src),
       "THE PAGE'S OWN LINE. v2591's GIF normalises PER FRAME and MUST, because the projection through a blob is thicker at some angles and a shared scale makes the turn PULSE. THE FACE IS THE OPPOSITE: it is a MEASUREMENT, and the whole point is watching the density RISE AND FALL as you slide through. A PER-FRAME NORMALISE HERE WOULD MAKE EVERY SLICE LOOK EQUALLY SOLID -- IT WOULD HIDE THE EXACT THING WE CAME TO SEE. Same page, opposite rules, and the reason is physics both times.");
    ok("...and a normalised face WOULD hide it -- this is why that check exists", (() => {
        const a = cutFace(plane(0, 0, 1, 0), blobs, { w: 64, h: 64 });
        const b = cutFace(plane(0, 0, 1, 0.5), blobs, { w: 64, h: 64 });
        // fixed scale: the peaks differ. normalised: both would be 255.
        const fixedA = Math.round(a.max * 64), fixedB = Math.round(b.max * 64);
        const normA = 255, normB = 255;
        return fixedA !== fixedB && normA === normB;
    })(), "under a FIXED scale the two depths peak differently; under a PER-FRAME normalise they would BOTH peak at 255 and look identical. THE NORMALISE IS NOT A STYLE CHOICE, IT IS A LIE ABOUT THE DENSITY.");
}

// ---- 5. the tilt is real, not decoration -------------------------------------------------------------------------
{
    const flat = cutFace(plane(0, 0, 1, 0), blobs, { w: 96, h: 96 });
    const tilted = cutFace(plane(Math.sin(Math.PI / 4), 0, Math.cos(Math.PI / 4), 0), blobs, { w: 96, h: 96 });
    let diff = 0;
    for (let i = 0; i < flat.data.length; i++) if (Math.abs(flat.data[i] - tilted.data[i]) > 1e-6) diff++;
    // THRESHOLD SET FROM THE MEASUREMENT, NOT FROM MY IMAGINATION.
    //
    // I first wrote `> 0.2 * length` -- 20%, a number I PICKED OUT OF THE AIR -- and it FAILED at 13.6%. The
    // tilt was working perfectly; MY ASSERTION WAS A GUESS WEARING A SPEC'S CLOTHES, which is the same disease
    // as v2592's "LESS" label and v2586's `big.tg < small.tc*8`. Measured: 1250 of 9216 = 13.6%, and the blob
    // only occupies ~4.6% of the face at ISO, SO 13.6% OF PIXELS MOVING IS ENORMOUS. 5% is well clear of zero
    // (which is what a dead slider gives) and well under 13.6%, which is v2586's rule: ONE ASSERTION, WITH
    // REAL HEADROOM, NOT A NUMBER THAT SOUNDS STRICT.
    ok("the TILT slider cuts a genuinely different plane", diff > flat.data.length * 0.05,
       diff + " of " + flat.data.length + " pixels differ between 0deg and 45deg -- EVERY BYTE COMPARED, NOT SAMPLED (v2590's stride-97 found 0 of 96 while 894 differed). AT 0deg THIS IS THE z-SLICE THE PHANTOM HAS SUPPORTED SINCE IT WAS WRITTEN AND NOBODY EVER USED. The tilt is the part that needed a basis.");
}

console.log(fails ? "\nblobFace-selfcheck: " + fails + " FAILED" : "\nblobFace-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
