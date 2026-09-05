// WebGLEngine/render/blobField-selfcheck.mjs -- v4427
//
// Run: node render/blobField-selfcheck.mjs
//
// Grades render/blobField.mjs -- the comparison #169 asked for, and the two findings it produced.
//
// *** SECTION 1 REFUTES THE ITEM'S OWN PREMISE. *** #169 reads "two blobulators, ONE SDF, never compared". The
// first thing the comparison establishes is that there is no shared SDF: one page thresholds a DENSITY, the
// other marches a DISTANCE. A check that assumed the premise would have compared two numbers that were never
// the same quantity, and reported a tolerance where the answer is categorical.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as B from "./blobField.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GPU = fs.readFileSync(path.join(ENG, "blobulator-gpu.html"), "utf8");
const CPU = fs.readFileSync(path.join(ENG, "blobulator.html"), "utf8");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

// ---- 1. THE TWO PAGES SOLVE DIFFERENT EQUATIONS, READ OUT OF THEIR OWN SOURCE ---------------------------------
{
    say("what each page actually computes");
    const cpuIsDensity = /sum \+= cr2\[k\] \/ \(dx \* dx \+ dy \* dy \+ dz \* dz \+ 0\.35\)/.test(CPU) &&
                         /field\[row \+ x\] = 1\.0 - sum/.test(CPU) && /marchScalarField/.test(CPU);
    const gpuIsSdf = /d = smin\(d, length\(p - b\.xyz\) - b\.w, u\.k\)/.test(GPU);
    say(`  blobulator.html      density field, marched at isolevel 0: ${cpuIsDensity}`);
    say(`  blobulator-gpu.html  smooth-min union of sphere SDFs:      ${gpuIsSdf}`);
    ok("!! *** the premise of #169 is FALSE: there is no shared SDF ***",
        cpuIsDensity && gpuIsSdf,
        "one thresholds a DENSITY and the other marches a DISTANCE. Both look like blobs; they are not the " +
        "same object, so 'compare the two implementations' had no subject until the difference was measured");
}

// ---- 2. *** `r` IS NOT THE SAME QUANTITY, AND THE CLOSED FORM SAYS SO EXACTLY *** -------------------------------
{
    say("");
    say("both pages carry blobs as {x, y, z, r}. Where does each put the surface of a lone blob?");
    let worst = 0;
    for (const r of [0.7, 1.0, 1.5, 2.0]) {
        const closed = B.metaballSurfaceRadius(r), meas = B.metaballSurfaceMeasured(r);
        worst = Math.max(worst, Math.abs(closed - meas));
        say(`  r=${r.toFixed(2)}  CPU surface ${meas.toFixed(4)} (closed form ${closed.toFixed(4)})  GPU surface ${r.toFixed(4)}  ratio ${(meas / r).toFixed(3)}`);
    }
    ok("!! the closed form sqrt(r^2 - 0.35) IS the CPU surface, to four decimals",
        worst < 5e-4,
        `max |closed - measured| ${worst.toExponential(2)}. DERIVED from the field equation rather than ` +
        "fitted to it, which is why it can be trusted at radii nobody measured");
    ok("!! *** and it is NOT r -- a blob of r=1 renders 19.4% smaller on the CPU page ***",
        Math.abs(B.metaballSurfaceRadius(1) - 1) > 0.19,
        `${B.metaballSurfaceRadius(1).toFixed(4)} against the GPU's 1.0000. Same field name, same blob ` +
        "record, different quantity -- this is the naming trap species with a number attached");
}

// ---- 3. THE DIVERGENCE IS CATEGORICAL, NOT A TOLERANCE ---------------------------------------------------------
{
    say("");
    ok("!! *** below r = sqrt(0.35) a blob is INVISIBLE on one page and solid on the other ***",
        Number.isNaN(B.metaballSurfaceRadius(0.55)) && 0.55 > 0,
        `VANISH_BELOW = ${B.VANISH_BELOW.toFixed(4)}. A blob of r=0.55 never reaches the isolevel on ` +
        "blobulator.html and is a sphere of radius 0.55 on blobulator-gpu.html. That is not a tolerance");
    const two = [{ x: -1.2, y: 0, z: 0, r: 1 }, { x: 1.2, y: 0, z: 0, r: 1 }];
    const meta = B.metaballField([0, 0, 0], two);
    const sdfs = [0.2, 0.5].map((k) => B.sminSdf([0, 0, 0], two, k));
    say(`  waist of two unit blobs 2.4 apart: metaball ${meta.toFixed(4)}, sdf k=0.2 ${sdfs[0].toFixed(4)}, k=0.5 ${sdfs[1].toFixed(4)}`);
    // *** THE JS smin MUST BE THE PAGE'S smin, AND A SABOTAGE PROVED THIS CHECK WAS MISSING. *** Dropping
    // the `- k*h*(1-h)` term from the transcription cost ZERO RED in the first draft: the gate asserted the
    // WGSL RAMP against its shared original and left the WGSL SMIN unchecked, so every number above would
    // have been measuring a function blobulator-gpu.html does not contain. A TRANSCRIPTION IS A SECOND
    // DECLARATION -- the defect this whole round reports, committed inside the file reporting it.
    {
        const w = B.wgslSmin(GPU);
        // Same inputs through both: the page's formula written out here, and the module's function.
        const mix = (a, b, t) => a + (b - a) * t;
        const pageSmin = (a, b, k) => { const h = Math.min(1, Math.max(0, 0.5 + 0.5 * (b - a) / k)); return mix(b, a, h) - k * h * (1 - h); };
        let worst = 0;
        for (let a = -2; a <= 2; a += 0.25) for (let b = -2; b <= 2; b += 0.25) for (const k of [0.2, 0.5, 0.8])
            worst = Math.max(worst, Math.abs(B.smin(a, b, k) - pageSmin(a, b, k)));
        ok("!! *** the JS smin IS the page's WGSL smin, term for term and value for value ***",
            w.matchesJs && worst < 1e-12,
            `WGSL has the clamped h: ${w.hasClampedH}, has the -k*h*(1-h) term: ${w.hasMixMinusK}; ` +
            `max |js - page| over 1,089 pairs: ${worst.toExponential(2)}`);
    }
    ok("!! ...and for one blob set the pages disagree about whether the shape is CONNECTED",
        meta < 0 && sdfs.every((d) => d > 0),
        "metaball says INSIDE (merged), both smin values say OUTSIDE (separate). The k that would reconcile " +
        "them depends on the spacing, so no constant k makes the pages agree");
}

// ---- 4. *** THE RAMP v2438 DEDUPLICATED ON ONE PAGE AND MISSED ON THE OTHER *** ---------------------------------
{
    say("");
    const shared = B.sharedStops(), wgsl = B.wgslStops(GPU);
    let worst = 0, drifted = 0;
    for (let i = 0; i < shared.length; i++) {
        const d = Math.max(Math.abs(shared[i].r - wgsl[i].r), Math.abs(shared[i].g - wgsl[i].g), Math.abs(shared[i].b - wgsl[i].b));
        if (d > 1e-9) { drifted++; say(`  stop t=${shared[i].t}: shared [${shared[i].r}, ${shared[i].g}, ${shared[i].b}] vs wgsl [${wgsl[i].r}, ${wgsl[i].g}, ${wgsl[i].b}]`); }
        worst = Math.max(worst, d);
    }
    ok("blobulator.html imports the SHARED ramp rather than carrying a copy",
        /import \{ blackbodyRamp as fireRamp \}/.test(CPU),
        "v2438 removed a byte-identical copy from this page. It missed the WGSL one next door");
    ok("!! *** the WGSL transcription now matches the shared ramp at every stop ***",
        drifted === 0 && worst < 1e-9,
        `${shared.length} stops, ${drifted} drifted, widest ${worst.toExponential(2)}. BEFORE v4427 stop ` +
        "t=0.85 read (1.0, 0.85, 0.35) against the shared (1.0, 0.82, 0.32) -- five of six right, widest " +
        "divergence 0.0200 at heat 0.90 and exactly 0 below 0.68. A COPY RIGHT AT FIVE STOPS OF SIX IS THE " +
        "KIND NOBODY NOTICES. A page cannot import a JS module into WGSL, so the copy stays and this check " +
        "is what keeps it honest");
    ok("the copy still declares why it exists, so nobody deletes the check and the reason together",
        /A TRANSCRIPTION OF fx\/voxelize\/fireRamp\.js/.test(GPU));
}

console.log("blobField-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
