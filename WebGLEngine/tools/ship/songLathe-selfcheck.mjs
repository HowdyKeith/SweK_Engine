#!/usr/bin/env node
// WebGLEngine/tools/ship/songLathe-selfcheck.mjs -- v4383
//
// Run: node tools/ship/songLathe-selfcheck.mjs
//
// GRADES mesh/songLathe.mjs -- an STFT column revolved into a solid, and the first reference this tree's
// silhouette judge has ever been handed that the geometry pipeline did not produce itself.
//
// v3337 built render/silhouette.mjs as a HARD gate. v4255 built mesh/lathe.mjs and wrote in its own header
// that the front-view IoU scoring it "is high almost by construction, and is close to worthless as evidence".
// Both statements have stood, unreconciled, for a hundred and thirty rounds: a veto with nothing honest to
// veto. A spectrum fixes that not because it is prettier than a photograph but because IT HAS AN ANSWER KEY --
// a closed form for bin-centred tones, and a naive O(N^2) DFT for everything else.
//
// Sections 4 and 5 are the evidence. Section 6 is the CONTROL, and it is in the gate because it is the check
// that looks most like proof and carries the least: rotational invariance reads 1.000000 for a correct
// spectrum and 1.000000 for a reversed one.
"use strict";
import * as SL from "../../mesh/songLathe.mjs";
import { lathe, silhouetteMask, maskIoU, meshVolume, profileFromMask, asymmetry } from "../../mesh/lathe.mjs";
import { spectrum } from "../../physics/fft.js";
import { combine } from "../../render/silhouette.mjs";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { codeOnly as commentsOnly } from "./orreryFleetScan.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);

const N = 256, SR = 8000, BINS = N / 2, L = SL.LAYOUT, REF = N / 2;
const CHORD = [{ bin: 12, amplitude: 1 }, { bin: 32, amplitude: 0.6 }, { bin: 70, amplitude: 0.3 }];

const chordFrame = (() => {
    const out = new Float64Array(N);
    for (const t of CHORD) { const f = SL.toneFrame(t.bin, N, SR, t.amplitude); for (let i = 0; i < N; i++) out[i] += f[i]; }
    return out;
})();
const sweepFrame = (() => {
    const out = new Float64Array(N), T = N / SR, f0 = 200, f1 = 3500;
    for (let i = 0; i < N; i++) { const t = i / SR; out[i] = Math.sin(2 * Math.PI * (f0 * t + (f1 - f0) * t * t / (2 * T))); }
    return out;
})();

console.log("songLathe-selfcheck -- a spectrum revolved, and the first reference the judge did not make itself\n");

// =============================================================================================================
console.log("1. THE GAP: THE JUDGE EXISTS, THE SCULPTOR EXISTS, AND NOTHING HAS EVER SCORED AN OUTSIDE REFERENCE");
{
    const latheSrc = readFileSync(path.join(ENG, "mesh/lathe.mjs"), "utf8");
    // The confession is IN the sculptor, so read it from the file rather than restating it here.
    const confesses = /worthless as evidence/.test(latheSrc) && /by construction/.test(latheSrc);
    ok("mesh/lathe.mjs states in its own header that its front-view score is worthless as evidence",
       confesses, "the claim this round answers is the module's own, not one invented for it");

    // *** COUNT CONSUMERS BY IMPORT, NEVER BY GREP FOR THE NAME. *** v4381 shipped a claim that "five modules
    // ship through brain/mlp.js" which was a grep matching COMMENTS; counted by import it was two. And the
    // stripper matters as much as the method: sourceScan's codeOnly blanks string bodies as well as comments,
    // which erases the import specifier itself and reports zero importers for everything. orreryFleetScan's
    // blanks comments only, which is the one an import scan needs.
    const importers = listSources(ENG).filter(
        (f) => /from\s+["'][^"']*mesh\/lathe\.mjs["']/.test(commentsOnly(readFileSync(f, "utf8"))));
    const rel = importers.map((f) => path.relative(ENG, f)).sort();
    const gateOnly = rel.every((r) => r.startsWith("tools/ship/") || r.startsWith("mesh/"));
    ok("...and every importer of it is a gate or another mesh module -- no page, no engine path",
       rel.length > 0 && gateOnly, rel.join(", "));
    report("So the sculptor's ONLY consumer is a judge, and until this round that judge was scoring the " +
           "sculptor's own output against the sculptor's own input. mesh/songLathe.mjs adds the third party.");
}

function listSources(root) {
    const out = [];
    const skip = new Set(["node_modules", ".git", "vendor", "dist", "build", "third_party"]);
    (function walk(d) {
        for (const e of readdirSync(d)) {
            if (skip.has(e)) continue;
            const p = path.join(d, e);
            if (statSync(p).isDirectory()) walk(p); else if (/\.(mjs|js)$/.test(e)) out.push(p);
        }
    })(root);
    return out;
}

// =============================================================================================================
console.log("\n2. *** EVERY BIN GETS A RING: DROPPING THE QUIET ONES WOULD RENUMBER THE FREQUENCY AXIS ***");
{
    const mags = SL.fftMagnitudes(chordFrame);
    const p = SL.spectrumProfile(mags, REF);
    ok("the profile has exactly one row per bin", p.rows.length === BINS, `${p.rows.length} rows, ${BINS} bins`);
    ok("...and row k sits at height k, so height IS frequency",
       p.rows.every((q, k) => q.y === k), "every row's y equals its bin index");

    // What lathe.mjs's own profileFromMask habit would have done here, MEASURED rather than asserted.
    const loud = [...mags.keys()].filter((k) => mags[k] > 1e-6);
    const wouldLandAt = loud.indexOf(70);
    ok("...and dropping near-silent bins the way profileFromMask does would move bin 70 to another row",
       loud.length < BINS && wouldLandAt >= 0 && wouldLandAt !== 70,
       `${loud.length} of ${BINS} bins exceed 1e-6, so bin 70 would come out at row ${wouldLandAt}`);

    const floors = p.rows.filter((q) => q.r <= L.radiusFloor + 1e-12).length;
    ok("...so the quiet bins keep a floor radius instead, and none is zero",
       p.rows.every((q) => q.r > 0) && floors > 0,
       `${floors} rows at the floor of ${L.radiusFloor}, none welded shut at r = 0`);
}

// =============================================================================================================
console.log("\n3. VOLUME AGAINST A CLOSED FORM, AND THE CONSTANT IS NOT pi");
{
    const mags = SL.fftMagnitudes(chordFrame);
    const p = SL.spectrumProfile(mags, REF);
    const mesh = lathe(p, L.segments);
    const measured = meshVolume(mesh);
    const closed = SL.frustumStackVolume(p.rows, L.segments);
    const relK = Math.abs(measured - closed) / closed;

    // The same sum with pi in place of the polygon constant -- the tolerance a naive check would have needed.
    const piForm = closed * Math.PI / SL.polygonK(L.segments);
    const relPi = Math.abs(measured - piForm) / piForm;

    ok("the divergence-theorem volume matches the frustum stack to float32 storage noise",
       relK < 3e-7, `measured ${measured.toFixed(3)}, closed form ${closed.toFixed(3)}, rel ${relK.toExponential(2)}`);
    ok("...and the pi form is wrong by three orders of magnitude more, which is the whole reason it is named",
       relPi > 300 * relK, `pi form ${piForm.toFixed(3)}, rel ${relPi.toExponential(2)} -- ratio ${(relPi / relK).toFixed(0)}x`);
    ok("...and the polygon constant approaches pi as the facets multiply",
       Math.abs(SL.polygonK(65536) / Math.PI - 1) < 1e-8 && SL.polygonK(64) < Math.PI,
       `K(64)/pi = ${(SL.polygonK(64) / Math.PI).toFixed(6)}, K(65536)/pi = ${(SL.polygonK(65536) / Math.PI).toFixed(9)}`);
    report("float32 is not a guess: lathe() returns positions in a Float32Array, so 8.6e-8 IS the storage " +
           "epsilon and any tolerance looser than that would be covering for something else.");
}

// =============================================================================================================
console.log("\n4. *** REFERENCE ONE: THE CLOSED FORM. NO TRANSFORM RUNS TO PRODUCE IT ***");
{
    const measured = SL.fftMagnitudes(chordFrame);
    const analytic = SL.analyticMagnitudes(CHORD, N);
    ok("analyticMagnitudes returns a column for bin-centred tones", analytic instanceof Float64Array && analytic.length === BINS);

    let worst = 0;
    for (let k = 0; k < BINS; k++) worst = Math.max(worst, Math.abs(measured[k] - analytic[k]));
    ok("the FFT reproduces it to the float floor",
       worst < 1e-10, `max |fft - analytic| = ${worst.toExponential(3)} against a peak of ${REF}`);

    const agree = SL.silhouetteAgreement(measured, analytic, REF);
    ok("*** AND THE LATHED SILHOUETTES ARE THE SAME PIXELS, NOT MERELY CLOSE ***",
       agree === 1, `IoU = ${agree.toFixed(6)}`);

    // The hard-gate combiner from render/silhouette.mjs, given a threshold this round MEASURED rather than
    // inherited: v3337 refused img2threejs's 0.85 and said a caller must earn one. 1.0 is what an exact
    // reference earns, and section 7 shows what a real defect costs against it.
    const verdict = combine({ soft: {}, hard: { silhouetteIoU: { value: agree, limit: 1, direction: "min" } } });
    ok("...and render/silhouette.mjs's own hard-gate combiner ACCEPTS it at a limit of exactly 1",
       verdict.verdict === "ACCEPT", `verdict ${verdict.verdict}, ${verdict.failures.length} failures`);

    ok("...and the closed form REFUSES a fractional bin rather than rounding to a confident wrong answer",
       SL.analyticMagnitudes([{ bin: 32.5 }], N) === null, "analyticMagnitudes({bin: 32.5}) === null");
}

// =============================================================================================================
console.log("\n5. REFERENCE TWO: A NAIVE DFT, WHICH SHARES NO LINE WITH physics/fft.js AND NEEDS NO CLOSED FORM");
{
    for (const [name, frame] of [["chord", chordFrame], ["sweep 200-3500 Hz", sweepFrame]]) {
        const fast = SL.fftMagnitudes(frame);
        const slow = SL.naiveDftMagnitudes(frame).slice(0, BINS);
        let worst = 0;
        for (let k = 0; k < BINS; k++) worst = Math.max(worst, Math.abs(fast[k] - slow[k]));
        ok(`radix-2 agrees with the definition on the ${name}`,
           worst < 1e-9, `max |fft - naiveDFT| = ${worst.toExponential(3)}`);
        ok(`...and the two lathes of ${name} are the same pixels`,
           SL.silhouetteAgreement(fast, slow, REF) === 1, `IoU = ${SL.silhouetteAgreement(fast, slow, REF).toFixed(6)}`);
    }
    const src = readFileSync(path.join(ENG, "mesh/songLathe.mjs"), "utf8");
    const body = src.slice(src.indexOf("export function naiveDftMagnitudes"));
    const fn = body.slice(0, body.indexOf("\n}") + 2);
    ok("...and the naive path really is naive: no twiddle table, no bit reversal, no butterfly",
       !/twiddle|butterfly|reverse|fft\(/i.test(fn) && /Math\.cos|Math\.sin/.test(fn),
       "its inner loop is cos and sin of the definition's exponent");
    report("The sweep has NO closed form -- that is the point of the second reference. Section 4's answer key " +
           "only exists for bin-centred tones; this one exists for any signal at all.");
}

// =============================================================================================================
console.log("\n6. *** THE CONTROL: ROTATIONAL INVARIANCE IS TRUE OF ANY LATHE AND PROVES NOTHING ABOUT THE AUDIO ***");
{
    const good = SL.fftMagnitudes(chordFrame);
    const wrong = Float64Array.from(good).reverse();     // every tone at the wrong frequency
    const analytic = SL.analyticMagnitudes(CHORD, N);
    const yaw = 37 * Math.PI / 180;

    const invGood = SL.azimuthAgreement(good, REF, yaw);
    const invWrong = SL.azimuthAgreement(wrong, REF, yaw);
    ok("a correct spectrum is rotationally invariant", invGood === 1, `IoU(yaw 0, yaw 37deg) = ${invGood.toFixed(6)}`);
    ok("*** AND SO IS A REVERSED ONE, TO THE SAME SIX PLACES ***",
       invWrong === 1, `IoU(yaw 0, yaw 37deg) = ${invWrong.toFixed(6)} on a spectrum with every tone in the wrong place`);

    const iouWrong = SL.silhouetteAgreement(wrong, analytic, REF);
    ok("...while the outside reference sees the reversal immediately",
       iouWrong < 0.5, `IoU against the closed form = ${iouWrong.toFixed(6)} against 1.000000 for the true column`);

    // *** THIS CHECK WAS WRITTEN AS A THIRD TAUTOLOGY AND CAME BACK RED, WHICH IS HOW v4255's asymmetry()
    // *** DEFECT WAS FOUND. The claim was "a revolved solid is symmetric whatever it encodes, so asymmetry is
    // blind here too". It measured 0.098833 on a solid that is symmetric BY CONSTRUCTION -- because
    // silhouetteMask rasterises at pixel centres and asymmetry mirrored pixel indices, a one-pixel collision
    // between two functions in one file that v4255's own gate never crossed. See mesh/lathe.mjs's v4383 note.
    const mask = silhouetteMask(lathe(SL.spectrumProfile(wrong, REF), L.segments), L.width, L.height, { axis: L.axis });
    const asymIndex = asymmetry(mask, L.width, L.height, L.axis);
    const asymCentres = asymmetry(mask, L.width, L.height, L.axis, { centres: true });
    ok("...and lathe.mjs's asymmetry number is blind to it too, ONCE IT IS TOLD WHICH SPACE THE AXIS IS IN",
       asymCentres < 1e-12, `centres: true -> ${asymCentres.toFixed(6)} on a solid that is symmetric by construction`);
    ok("*** ...and the index convention reports a ten percent asymmetry FLOOR on that same perfect solid ***",
       asymIndex > 0.05, `default (index) -> ${asymIndex.toFixed(6)} -- the defect this round's first red found`);
    report("TWO checks that look like geometry and carry zero information about the song, printed beside one " +
           "that carries all of it. Reporting the invariance alone would be reporting a tautology as evidence.");
}

// =============================================================================================================
console.log("\n7. SCALLOPING LOSS IN THE JUDGE'S OWN UNITS, WHICH IS WHAT THE CROSSING BUYS");
{
    const analytic = SL.analyticMagnitudes([{ bin: 32 }], N);
    const rows = [];
    for (const off of [0, 0.1, 0.25, 0.5]) {
        const m = SL.fftMagnitudes(SL.toneFrame(32 + off, N, SR));
        rows.push({ off, iou: SL.silhouetteAgreement(m, analytic, REF), peak: Math.max(...m) });
    }
    const on = rows[0], half = rows[3];
    ok("a bin-centred tone scores exactly 1 against the closed form",
       on.iou === 1, `offset 0.00 -> IoU ${on.iou.toFixed(6)}, peak ${on.peak.toFixed(4)} = A*N/2`);
    ok("*** AND THE SAME TONE HALF A BIN HIGHER LOSES FORTY PERCENT OF ITS SILHOUETTE ***",
       half.iou < 0.65 && half.iou > 0.5, `offset 0.50 -> IoU ${half.iou.toFixed(6)}, peak ${half.peak.toFixed(4)}`);
    ok("...and the loss is monotone in the offset, so it is the window and not an accident",
       rows.every((r, i) => i === 0 || r.iou <= rows[i - 1].iou + 1e-12),
       rows.map((r) => `${r.off.toFixed(2)}:${r.iou.toFixed(4)}`).join("  "));
    report("world/songHeightfield.mjs's header describes this in words -- 'move it half a bin and a " +
           "rectangular window smears it across the whole spectrum'. It had no number until there was a " +
           "geometry to score, because a smear has no size until something measures it.");
}

// =============================================================================================================
console.log("\n8. THE ROUND TRIP IS LOSSY AND THE LOSS HAS A CLOSED FORM");
{
    for (const [name, frame] of [["chord (isolated spikes)", chordFrame], ["sweep (smooth)", sweepFrame]]) {
        const mags = SL.fftMagnitudes(frame);
        const p = SL.spectrumProfile(mags, REF);
        const back = profileFromMask(silhouetteMask(lathe(p, L.segments), L.width, L.height, { axis: L.axis }),
                                     L.width, L.height);
        const interp = SL.halfCellInterpolant(mags);
        let vsProfile = 0, vsInterp = 0;
        for (const q of back.rows) {
            if (q.y + 1 >= BINS) continue;
            const got = SL.radiusToMagnitude(q.r, REF);
            vsProfile = Math.max(vsProfile, Math.abs(got - mags[q.y]));
            vsInterp = Math.max(vsInterp, Math.abs(got - interp[q.y]));
        }
        ok(`the readback of the ${name} matches the half-cell interpolant, not the profile`,
           vsInterp < vsProfile || vsProfile / REF < 0.02,
           `worst vs profile ${(vsProfile / REF * 100).toFixed(3)}% of peak, vs interpolant ${(vsInterp / REF * 100).toFixed(3)}%`);
    }
    const mags = SL.fftMagnitudes(chordFrame);
    const p = SL.spectrumProfile(mags, REF);
    const back = profileFromMask(silhouetteMask(lathe(p, L.segments), L.width, L.height, { axis: L.axis }),
                                 L.width, L.height);
    const interp = SL.halfCellInterpolant(mags);
    let vsProfile = 0, vsInterp = 0;
    for (const q of back.rows) {
        if (q.y + 1 >= BINS) continue;
        const got = SL.radiusToMagnitude(q.r, REF);
        vsProfile = Math.max(vsProfile, Math.abs(got - mags[q.y]));
        vsInterp = Math.max(vsInterp, Math.abs(got - interp[q.y]));
    }
    ok("*** AND ON THE SPIKES THE GAP BETWEEN 'UNEXPLAINED LOSS' AND 'UNDERSTOOD LOSS' IS FIFTY-FOLD ***",
       vsProfile / REF > 0.4 && vsInterp / REF < 0.02 && vsProfile / vsInterp > 40,
       `${(vsProfile / REF * 100).toFixed(3)}% against the profile, ${(vsInterp / REF * 100).toFixed(3)}% against the interpolant -- ${(vsProfile / vsInterp).toFixed(0)}x`);
    report("An isolated one-bin peak revolves into a bicone whose widest circle is infinitely thin, and a " +
           "pixel row samples it at half height. So the geometry loses the PURE TONE hardest -- exactly the " +
           "signal section 4's closed forms are about -- and that is stated rather than left to be rediscovered.");
}

// =============================================================================================================
console.log("\n9. songLathe() ITSELF, END TO END, ON A CLIP RATHER THAN A FRAME");
{
    const clip = new Float64Array(SR);
    // *** THE TONE'S FREQUENCY IS bin * SR / N, AND N IS THE FRAME SIZE, NOT THE CLIP LENGTH. *** Written the
    // other way first -- toneFrame(bin, SR, SR) -- which puts a 12 Hz tone where a 375 Hz one belongs, and the
    // end-to-end IoU came back 0.433447 against the closed form. The failure was in the fixture and not the
    // module, and it is recorded because "the fixture was wrong" is the explanation easiest to reach for when
    // the module is wrong instead.
    for (const t of CHORD) {
        const hz = t.bin * SR / N;
        for (let i = 0; i < SR; i++) clip[i] += t.amplitude * Math.sin(2 * Math.PI * hz * i / SR);
    }
    const out = SL.songLathe(clip, { sampleRate: SR, frameSize: N, hop: N / 2, frameIndex: 3 });
    ok("a clip yields a mesh, a profile and the magnitudes it came from",
       !!out && out.mesh.positions.length > 0 && out.profile.rows.length === BINS && out.magnitudes.length === BINS,
       out ? `${out.mesh.positions.length / 3} vertices, ${out.mesh.indices.length / 3} triangles, frame ${out.stats.frameIndex} of ${out.stats.frameCount}` : "null");
    ok("...and its reference magnitude is the ABSOLUTE closed form, never the frame's own peak",
       out.ref === N / 2, `ref = ${out.ref} = A*N/2, independent of what the frame happens to contain`);
    // A frame of a 1 s clip is a whole number of cycles for a bin-centred tone at this hop, so the closed form
    // still applies -- which is what makes an end-to-end check gradeable at all.
    const analytic = SL.analyticMagnitudes(CHORD, N);
    ok("...so the end-to-end silhouette still lands on the closed form exactly",
       SL.silhouetteAgreement(out.magnitudes, analytic, out.ref) === 1,
       `IoU = ${SL.silhouetteAgreement(out.magnitudes, analytic, out.ref).toFixed(6)}`);
    ok("...and songLathe refuses a clip too short to fill one frame",
       SL.songLathe(new Float64Array(8), { sampleRate: SR, frameSize: N }) === null, "returns null, does not pad");
}

// ---- v4383 SABOTAGES, grep-CONFIRMED APPLIED BEFORE READING, RESTORED md5-IDENTICAL -------------------------
//
// (mesh/songLathe.mjs md5 d93bb9d01271bb82ef7005369e6f9de3 before and after all four.)
//
//   A  spectrumProfile normalises by the column's OWN maximum instead of the passed reference -- the
//      "obvious" simplification magnitudeToRadius's header argues against. -> 2 RED, and WHICH TWO is the
//      finding: section 4's closed-form IoU STILL READS 1.000000, because scaling both paths by their own
//      peaks cancels exactly. The reference that is independent of the transform is NOT independent of a
//      global scale, and nothing in section 4 could ever have said so. What catches it is section 7 (the
//      scalloping curve, 0.598592 -> 0.468835, because an off-bin frame's own peak is 82 rather than 128)
//      and section 8's sweep readback at 88.2% of peak. Two checks written for other reasons.
//
//   B  spectrumProfile drops rows at the floor, carrying mesh/lathe.mjs's profileFromMask habit across. ->
//      10 RED, the widest of the four: dropping renumbers the height axis, so every section that compares a
//      geometry to a spectrum fails at once. The loudest failure is the right one to have -- a mapping that
//      silently stops encoding frequency is the defect this module exists to avoid.
//
//   C  polygonK returns Math.PI. -> 3 RED, all in section 3, including the check that the polygon constant
//      APPROACHES pi rather than being it -- which is the one that would survive a sloppier tolerance.
//
//   D  halfCellInterpolant returns the magnitudes unchanged. -> 2 RED in section 8, and the printed detail
//      is the whole argument: "50.794% against the profile, 50.794% against the interpolant -- 1x". The
//      50.794% was never the point; the SIXTY-FOUR-FOLD GAP was, and with the model gone there is no gap.
//
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: A REAL SONG. Every frame above is a formula, so the references are exact by " +
    "construction of the SIGNAL even where they are independent of the TRANSFORM -- a recording has no answer " +
    "key and section 4 would have nothing to say about it, leaving only section 5's naive DFT, which grades " +
    "the FFT and not the music. Also unwired: nothing renders this. song-globe.html consumes " +
    "world/songHeightfield.mjs and no page consumes mesh/songLathe.mjs, so the sculptor's only consumer is " +
    "still a judge -- what changed is that the judge is no longer marking its own homework. And the LOUDNESS " +
    "axis is untouched: radius is linear in magnitude here, not in dB, so a quiet harmonic beside a loud " +
    "fundamental is a stem beside a bowl, which is honest arithmetic and probably the wrong picture.");
process.exit(fails ? 1 : 0);
