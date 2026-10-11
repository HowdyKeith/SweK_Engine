#!/usr/bin/env node
// WebGLEngine/tools/ship/fsrPageObjects-selfcheck.mjs -- v4649
//
// Run: node tools/ship/fsrPageObjects-selfcheck.mjs
// RUNTIME: measured at the foot of this file.
//
// *** fsr.html's OBJECT-MOTION CAMERA, ON A REAL ADAPTER. THE FIRST FRAME IN THIS TREE WHOSE MOTION VECTORS
// ARE NOT PURELY THE CAMERA'S. ***
//
// Every number fsr.html has ever printed came from a scene where only the camera moved -- and on such a scene
// render/objectMotion.mjs is EXACTLY render/motionVectors.mjs, because every model matrix is the identity.
// v4646 measured the object-aware gap on a synthetic fixture (2.51 px) and v4648 on a rasterised one (4.22
// px); neither was a frame a person could look at. The "objects" camera is the dolly plus a translating slab,
// and this gate is what holds it.
//
// ---- WHY A THIRD PAGE GATE RATHER THAN MORE ROWS IN fsrPageDevice-selfcheck --------------------------------
//
// Budget, and it is the same reason that file was split from fsrPage-selfcheck. These rows were written there
// first and took it from 2,448 ms to 4,872 -- over the quick sweep's 3,000 ms membership threshold, which
// drops a gate out of every ship. Split, fsrPageDevice-selfcheck is back to 2,418 ms and keeps its place.
//
// *** THIS GATE DOES NOT, AND THE SPLIT IS STILL WORTH IT. *** It runs at 3,358 ms, over the threshold, for
// the reason measured at the foot of this file: the reconstruction separation it depends on does not exist
// before the accumulator converges, and at a frame count that fits the budget the four wirings land inside
// 0.4 dB of each other. So the split did not rescue both gates -- it rescued the one that could be rescued
// and isolated the cost of the one that could not, instead of spending it on both.
//
// ---- *** THE ROW THAT MATTERS READS THE PICTURE, NOT THE FIELD, AND THREE SABOTAGES SAY WHY *** -------------
//
// Section 2's rows read the motion FIELD -- how far object-aware differs from camera-only. Section 3 reads the
// reconstructed PICTURE. The difference is not academic: swapping the current and previous model matrices,
// letting the depth buffer ignore the slab's offset, and letting the RENDER ignore it all produce a
// camera-vs-object gap of exactly the right magnitude, because that magnitude is forced by SLAB_DX and the
// scene's dimensions whatever else is wrong. Only the reconstruction separates them.
//
// It also caught a defect in the round that added it, which is why it exists in this shape. The objects
// camera first scored 30.94 dB at frame 2 decaying monotonically to 19.56 by frame 10, and object-aware
// motion looked WORSE than camera-only at every frame -- a result that would have shipped as a finding about
// object motion. It was neither: fsr.html's `ref = truthPersp(vpCur, kind)` did not take the slab's offset,
// so a moving slab was scored against a truth that still held it still, and the PSNR measured how far it had
// walked. Corrected, the camera runs 35-43 dB like the dolly's 38-41 and object-aware beats camera-only by up
// to 4.6 dB. MEASURE THE PRODUCT, NOT THE MECHANISM -- and when the product says the method is bad, control
// the measurement before believing it.
//
// SABOTAGES: see the log at the foot of this file.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const say = (l) => console.log(`  ----  ${l}`);

console.log("fsrPageObjects-selfcheck -- fsr.html's object-motion camera, loaded as a page on a real adapter\n");

// *** THE BOUND IS PLACED BY MEASURING EVERY WRONG WIRING, NOT BY TASTE. *** At frame 6 on the smooth scene:
// correct 39.92 dB; the current and previous model matrices swapped 35.81; a depth buffer that ignores the
// slab's offset 37.15; camera-only motion 36.12. The three wrong answers cluster inside 1.4 dB of each other
// and 2.8 dB below the right one, so 38.5 sits with 1.4 dB of margin under the truth and 2.8 over the best
// impostor. A bound at fsr1's 34.11 would have passed all four, which is what it did until these were taken.
const FLOOR_DB = 38.5;

{
    const skip = webgpuSkipReason();
    if (skip) { console.log(`  SKIP  ${skip}`); say("*** NOT A PASS. *** The adapter path has not run."); fails++; }
    else {
        const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 180000, script: `async () => {
            const ifr = document.createElement("iframe");
            ifr.style.width = "1200px"; ifr.style.height = "900px"; ifr.src = "/fsr.html";
            document.body.appendChild(ifr);
            await new Promise((res) => { ifr.onload = res; });
            const d = ifr.contentDocument, w = ifr.contentWindow;
            const $ = (id) => d.getElementById(id);
            const until = async (fn, ms) => { const t0 = Date.now();
                while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch {} await new Promise((res) => setTimeout(res, 100)); }
                return false; };
            const frameNo = () => { const m = /frame (\\d+)/.exec(($("metric") || {}).textContent || ""); return m ? Number(m[1]) : -1; };
            const ready = await until(() => frameNo() === 0 && /engine:/.test(($("engine") || {}).textContent || ""), 60000);
            const engine = ($("engine") || {}).textContent || null;
            // *** THE SCENE IS smooth, AND THAT IS WHERE THE SIGNAL IS. *** The zone plate is detail past
            // Nyquist: there is no history worth fetching, the temporal pane sits near 16 dB whatever the
            // motion vectors say, and two of the sabotages below scored ZERO failing rows against it. A
            // reconstruction row has to run on content that can be reconstructed.
            const sc = $("scene"); sc.value = "smooth"; sc.dispatchEvent(new w.Event("change"));
            await until(() => frameNo() === 0, 30000);
            const sel = $("camera"); sel.value = "objects"; sel.dispatchEvent(new w.Event("change"));
            await until(() => frameNo() === 0, 30000);
            $("run").click();
            // an EARLY and a LATE reading, because the defect this catches is a DECAY and one sample cannot see one
            await until(() => frameNo() >= 3, 60000);
            const tmpEarly = ($("dTmp") || {}).textContent || "";
            const ran = await until(() => frameNo() >= 6, 120000);
            const out = { ready, ran, engine, frames: frameNo(), camera: sel.value, scene: sc.value,
                          tmpEarly, tmpLate: ($("dTmp") || {}).textContent || "",
                          fsr1: ($("dFsr") || {}).textContent || "",
                          obj: ($("objstat") || {}).textContent || "",
                          lock: ($("lockstat") || {}).textContent || "",
                          dis: ($("disstat") || {}).textContent || "",
                          react: ($("reactstat") || {}).textContent || "",
                          split: ($("splitstat") || {}).textContent || "" };
            try { $("run").click(); } catch {}
            return out;
        }` });

        const G = r.result;
        // hoisted: section 2's v4663 rows need it before section 3 declares its own local copy
        const dBx = (t) => { const m = /([\d.]+) dB/.exec(t || ""); return m ? Number(m[1]) : NaN; };
        console.log("1. THE PAGE, ON THE OBJECT-MOTION CAMERA");
        ok("fsr.html loaded on a real adapter and reached the object-motion camera",
           r.ok && G && G.ready && G.camera === "objects" && G.scene === "smooth",
           r.ok ? `engine line: ${G && G.engine}` : (r.reason || (r.pageErrors || []).join("; ")));

        if (r.ok && G) {
            ok("  ...and it advanced frames on it", G.ran && G.frames >= 6, `reached frame ${G.frames}`);

            console.log("\n2. THE FIELD: what object-aware motion is, against what camera-only would have been");
            const og = /off by ([\d.]+) px on the slab's (\d+) pixels and by ([\d.eE+-]+) px on the background's (\d+)/.exec(G.obj || "");
            ok("!! *** the object-aware field differs from the camera-only one by PIXELS on the moving slab ***",
               !!og && Number(og[1]) > 1 && Number(og[2]) > 1000,
               (G.obj || "(empty)") + (og ? "" : "  -- no object line at all") +
               "   ||  v4646 measured 2.51 px on a synthetic fixture and v4648 4.22 px on a rasterised one; " +
               "this is the same statement on a frame a person can look at.");
            // *** THE CONTROL'S OWN POPULATION IS ASSERTED, WHICH IT WAS NOT WHEN THIS ROW WAS WRITTEN. *** A
            // sabotage labelling every pixel as the slab left the background maximum at its initial zero -- a
            // perfect control reading, over nothing at all -- and this row passed. A maximum over an empty
            // set is not a small number, it is no number, and v4402's rule is that an absence must not read
            // as a pass. The count is in the page's line now and in this condition.
            ok("!! *** ...and its CONTROL holds: the background, whose model matrix is the identity, reads a numeric floor OVER REAL PIXELS ***",
               !!og && Number(og[3]) < 1e-3 && Number(og[4]) > 1000,
               (og ? `${og[3]} px over ${og[4]} background pixels, against ${og[1]} px over ${og[2]} slab pixels` : "(no object line)") +
               "   ||  object-aware and camera-only are the SAME computation where the model matrix is the " +
               "identity, so this is f32 on the device against f64 in JS and nothing else. A mislabelled id " +
               "buffer would move BOTH numbers, which is why one number could not carry this claim.");
            // *** v4654 -- THE SHADING MASK, AND THE HONEST THING IT SAYS ABOUT ITSELF. ***
            // The reject chain has accepted a `shading` argument since v4594 and nothing ever supplied one.
            // fsr.html now builds a luma ring through render/temporalLockGPU.mjs and feeds SHADING_SHIFT's
            // output in. SHADING_SHIFT writes 0 at any pixel whose ring is not yet full, and the ring is
            // 2 x jitterPhaseCount slots -- SIXTY-FOUR frames at ratio 2 -- so for the whole of this gate's
            // six frames the mask is exactly zero and the factor pass is unchanged.
            //
            // THAT IS WHY THE PAGE PRINTS THE FILL STATE RATHER THAN THE MASK ALONE. A mask of zeros because
            // the detector found nothing and a mask of zeros because it has not looked yet are the same
            // picture, and v4402's rule is that an absence must not read as a pass.
            //
            // *** v4655 -- v4654 MEASURED THIS WITH A THRESHOLD OF ZERO AND GOT THE ANSWER BACKWARDS. ***
            // That round reported "36,862 of 36,864 pixels shading-shifted" and concluded the mask "marks
            // very nearly EVERY pixel, which makes it a global damper rather than a selective mask". The
            // count was `mask[i] > 0`. SHADING_SHIFT is CONTINUOUS -- clamp(strength * |newer - older| /
            // scale, 0, 1) -- so on real content almost every pixel differs from its own history by
            // SOMETHING, and counting floats above zero counts the arithmetic rather than the signal.
            //
            // RE-MEASURED as a distribution, three frames past the fill point:
            //     frame 66   median 0.0009   p90 0.0844   p99 0.1739   peak 0.197   5,956 at or above 0.05
            //     frame 72   median 0.0008   p90 0.0818   p99 0.1698   peak 0.191   5,902
            //     frame 80   median 0.0005   p90 0.0763   p99 0.1592   peak 0.178   6,110
            //
            // The median is a THOUSANDTH of the scale. About 16% of the frame reaches 0.05 and the top
            // percentile carries 0.16-0.17. *** THE MASK IS SELECTIVE, AND v4654's CONCLUSION WAS THE
            // OPPOSITE OF WHAT ITS OWN NUMBER MEASURED. *** Whether it HELPS is still not established: the
            // temporal pane reads 42.68 / 43.45 / 45.91 dB at those frames against a 39.6-42.8 spread
            // before the ring filled, which is suggestive and is not a control.
            const lk = /ring (\d+)\/(\d+) frames/.exec(G.lock || "");
            // *** THE DISTRIBUTION ROW LIVED HERE FOR ONE ROUND AND COULD NOT FAIL. *** It read
            // `/median /.test(lock) || /NOT YET FILLED/.test(lock)`, and at the six frames this gate runs the
            // second half is always true -- so the quantile half was never tested. A sabotage replacing the
            // sorted array with a constant scored ZERO against it. That is the very defect
            // tools/ship/constantRows.mjs censuses, written by the round that shipped the census's fifth
            // mechanism, and it moved to fsrPage-selfcheck section 6 where the SOURCE can be held instead.
            // *** v4656 -- THE READOUT NAMES WHICH ARM IS RUNNING, AND A SABOTAGE REMOVING THAT SCORED
            // ZERO UNTIL THIS ROW. *** The page gained a shading ON/OFF control so the +0.117 dB it buys
            // could be measured paired rather than asserted; a readout that did not say which arm produced
            // it would make every screenshot and every recorded number ambiguous between the two. This is
            // behavioural and cheap -- the arm is named on frame one, long before the ring fills.
            ok("!! ...and the readout NAMES the arm, so a number cannot be mistaken for its own control",
               /shading mask \[(ON|OFF -- control)\]/.test(G.lock || ""),
               (G.lock || "(empty)").slice(0, 90) + "   ||  the whole point of the control arm is that two " +
               "runs produce two lists of numbers; unlabelled, they are one list twice.");
            ok("!! *** the shading mask says it is NOT YET FILLED rather than reading as a clean frame ***",
               !!lk && Number(lk[1]) === G.frames && Number(lk[2]) === 64 && /NOT YET FILLED/.test(G.lock || ""),
               (G.lock || "(empty)").slice(0, 200) + "   ||  the ring is 2 x jitterPhaseCount(2) = 64 slots " +
               "and this gate runs 6 frames, so zero is the correct answer and the page has to say which " +
               "kind of zero it is.");
            ok("!! ...and the object camera is computed ON THE DEVICE, not silently on the CPU",
               /computed on the device/.test(G.obj || ""), G.obj || "(empty)");
            // MEASURED across frames 2-6 when this row was written: the dolly is a flat 106 every frame and
            // the objects camera ALTERNATES 212 / 106. The alternation is NOT explained here and is named in
            // the closing line; what this row holds is that the counter RESPONDS to object motion at all,
            // which it could not have done on any camera this page had before.
            const od = /disocclusion: (\d+) genuine/.exec(G.dis || "");
            ok("!! ...and the DISOCCLUSION counter responds to the object's motion, which no earlier camera could show",
               !!od && Number(od[1]) >= 106,
               `${od ? od[1] : "(none)"} on the objects camera against a flat 106 on the dolly, which ` +
               "fsrPageDevice-selfcheck pins. The slab's trailing edge reveals background the camera alone " +
               "never uncovered.");

            // *** v4659 -- THE REACTIVE MASK'S OWN COUNTERS, AND THE ONE THAT WAS MISNAMED IN PRODUCTION. ***
            // Until this round the mask reported a single `noHistory`, and on this camera EVERY pixel in it
            // is depth-gated: invalid 0, offscreen 0. So the one number the page could have printed would
            // have said "pixels with no history" about a set in which every pixel HAS a history, sound and
            // reprojected, declined on purpose because the disagreement is disocclusion's to report. The
            // misnomer was not a theoretical risk, it was the whole of the number here.
            const rx = /examined (\d+) of (\d+) pixels, (\d+) of them/.exec(G.react || "");
            const rd = /Declined (\d+): (\d+) no motion, (\d+) reprojected off the frame, (\d+) turned away/.exec(G.react || "");
            say(`reactive: ${rx ? `${rx[1]} of ${rx[2]} examined, ${rx[3]} at or above 0.05` : "(unparsed)"}` +
                `; ${rd ? `declined ${rd[1]} = ${rd[2]} invalid + ${rd[3]} offscreen + ${rd[4]} depth-gated` : "(unparsed)"}`);
            ok("!! the reactive mask PRINTS what it did, and its three declines add up to the total it declined",
               !!rd && Number(rd[1]) === Number(rd[2]) + Number(rd[3]) + Number(rd[4]) && Number(rd[1]) > 0,
               "counted on the device as the branches are taken. Every one of these pixels writes the same " +
               "0.0 to the mask that a pixel in perfect agreement writes, so no pass over the finished mask " +
               "could recover the split -- or even how many pixels were looked at.");
            ok("!! *** and on THIS camera every declined pixel is DEPTH-GATED, which is what makes `noHistory` the wrong name ***",
               !!rd && Number(rd[2]) === 0 && Number(rd[3]) === 0 && Number(rd[4]) === Number(rd[1]),
               `invalid ${rd ? rd[2] : "?"}, offscreen ${rd ? rd[3] : "?"}, depth-gated ${rd ? rd[4] : "?"}. ` +
               "A depth-gated pixel has a history and the history is sound. The single counter this replaces " +
               "would have been 100% wrong about its own contents here, not merely imprecise.");
            // *** TWO KERNELS, ONE PREDICATE. *** DISOCCLUSION_WGSL's classify and REACTIVE_WGSL's evaluate
            // apply the same depth test with the same threshold and the same nearerIsLess, written
            // separately and dispatched separately. `genuine` is the disocclusion counter with its
            // no-history share already removed, so it is the depth-gap set on both sides and they must be
            // the SAME INTEGER. Neither number is derived from the other, which is the only reason this row
            // is worth anything.
            ok("!! *** the reactive mask's depth-gated count IS the disocclusion counter's `genuine`, from a separate kernel ***",
               !!rd && !!od && Number(rd[4]) === Number(od[1]),
               `${rd ? rd[4] : "?"} against ${od ? od[1] : "?"}. Two independently written depth tests on two ` +
               "dispatches agreeing to the pixel -- and it is also the 212/106 alternation this gate's " +
               "closing line has left unexplained since v4649, now visible in a second place. " +
               "*** AND IT PINS THE PREDICATE AND THE SIGN, NOT THE THRESHOLD, WHICH WAS MEASURED RATHER " +
               "THAN ASSUMED. *** Handing the reactive mask a threshold 1.6x the chain's moved NOTHING -- a " +
               "0-RED -- and so did 1.8x, 2x, 2.5x and 3x; only at 4x does the count fall, and then it falls " +
               "straight to ZERO. The slab's silhouette is a CLIFF: its 212 pixels sit somewhere past 3x the " +
               "threshold and every other pixel far below it, with nothing in between for a threshold to " +
               "sort. A reader must not take this row for agreement on the NUMBER.");

            // *** v4663 -- THE ERROR SPLIT BY WHERE THE MASK FIRED, AND THE ROW IS THAT IT ADDS UP. ***
            // Every instrument this arc built reports a per-frame scalar; the harm v4658 found is a
            // per-pixel event, and no scalar can say WHERE. The split is the same squared error the dB is
            // computed from, taken in one branch -- so the two sums must RECONSTRUCT that dB. A decomposition
            // that does not is a second measurement of something else wearing the first one's name.
            const sp = /fired (\d+) px, SSE ([\d.e+-]+) \(mean [\d.e+-]+\); rest (\d+) px, SSE ([\d.e+-]+)/.exec(G.split || "");
            const shownDb = dBx(G.tmpLate);
            const derived = sp ? 10 * Math.log10((Number(sp[1]) + Number(sp[3])) * 3 / (Number(sp[2]) + Number(sp[4]))) : NaN;
            // ONE argument: this file's `say` is (l) => ..., not the two-argument one other gates in this
            // tree use. The first draft passed two and the second was DROPPED IN SILENCE -- the line printed
            // as a bare "error split" with the measurement missing, which is a readout that looks like it
            // ran and says nothing. Caught by reading the output rather than the exit code.
            say("error split: " + (sp ? `fired ${sp[1]} px SSE ${sp[2]}; rest ${sp[3]} px SSE ${sp[4]}  ->  ` +
                `${derived.toFixed(4)} dB derived against ${shownDb} printed` : "(unparsed)"));
            ok("!! *** the two region sums RECONSTRUCT the PSNR the page prints, so the split is of THAT error ***",
               !!sp && Math.abs(derived - shownDb) < 0.005,
               `|derived - printed| = ${Math.abs(derived - shownDb).toFixed(4)} dB, against a printed precision ` +
               "of 0.005. The pixel COUNTS are in the reconstruction too, so a split that dropped or " +
               "double-counted pixels fails here even if its sums looked plausible.");
            // *** THE RECONSTRUCTION CANNOT SEE THE THRESHOLD, AND A SABOTAGE SAID SO. *** Moving `fired`
            // from reactiveCPU's reported 0.05 to `> 0` scored ZERO against the row above: the sums still
            // reconstruct the dB, because ANY partition of the same pixels does. That is v4654's mistake
            // exactly -- it reported "36,862 of 36,864 pixels shading-shifted" by counting floats above
            // zero on a continuous detector, and the conclusion inverted when it was re-measured. What
            // separates the two is the SIZE of the fired set: at 0.05 it is about one percent of the
            // picture on this camera (322 of 36,864 here, 404 on average over scene 3-53), and at `> 0` it
            // is nearly all of it, because on real content almost every pixel differs from its history by
            // SOMETHING. A tenth of the picture sits two orders of magnitude from both.
            ok("!! ...and the fired set is a small MINORITY of the picture, which is what `>= 0.05` buys over `> 0`",
               !!sp && Number(sp[1]) > 0 && Number(sp[1]) < 0.10 * (Number(sp[1]) + Number(sp[3])),
               `${sp ? sp[1] : "?"} fired of ${sp ? Number(sp[1]) + Number(sp[3]) : "?"} ` +
               `(${sp ? (100 * Number(sp[1]) / (Number(sp[1]) + Number(sp[3]))).toFixed(2) : "?"}%). ` +
               "Counting above ZERO counts the arithmetic and would put this near 100%. The whole v4663 " +
               "finding is that the mask's effect lives in this one percent, so a threshold that swallowed " +
               "the picture would make the split say nothing while still adding up.");
            ok("!! ...and it prints BOTH pixel counts, because the partition is not the same set in both arms",
               !!sp && Number(sp[1]) > 0 && Number(sp[3]) > 0 && /THE PARTITION IS THIS ARM'S OWN MASK/.test(G.split || ""),
               `${sp ? sp[1] : "?"} fired of ${sp ? Number(sp[1]) + Number(sp[3]) : "?"}. The mask reads the ` +
               "current frame against the HISTORY, which is exactly what the two arms differ in, so a reader " +
               "differencing the sums has to be able to see whether the two partitions are comparable. " +
               "Measured over scene 3-53: 404 fired on average with the mask on, 410 with it off.");

            console.log("\n3. THE PICTURE, which is the only thing the three wiring sabotages could not fool");
            const dB = (t) => { const m = /([\d.]+) dB/.exec(t || ""); return m ? Number(m[1]) : NaN; };
            const e = dB(G.tmpEarly), l = dB(G.tmpLate), f1 = dB(G.fsr1);
            say(`temporal: frame 3 ${e} dB, frame ${G.frames} ${l} dB; fsr1 ${f1} dB; floor ${FLOOR_DB} dB`);
            ok("!! *** the reconstruction CLEARS the floor every wrong wiring falls below, and DOES NOT DECAY ***",
               l > FLOOR_DB && l > e - 3,
               `frame ${G.frames} reads ${l} dB against a floor of ${FLOOR_DB}. Measured impostors at this ` +
               "frame: swapped model matrices 35.81, a depth buffer ignoring the slab 37.15, camera-only " +
               "motion 36.12 -- and fsr1 itself 34.11, which is why a bound at fsr1 held nothing. The DECAY " +
               "half is separately load-bearing: a reference that ignored the slab's offset made this fall " +
               "30.94 -> 19.56 over eight frames while every field row in section 2 stayed green.");
            ok("  ...and it beats the spatial pane, so the temporal path is buying something on this camera",
               l > f1, `${l} dB against fsr1's ${f1} dB`);
        }
    }
}

console.log(fails ? `\nfsrPageObjects-selfcheck: ${fails} FAILED` : "\nfsrPageObjects-selfcheck: all checks pass");
console.log("\nunchecked here: the DOLLY and the two older cameras, which are fsrPageDevice-selfcheck's and " +
    "fsrPage-selfcheck's -- this gate drives one camera on one scene and deliberately repeats neither; the " +
    "ZONE PLATE on this camera, where the temporal pane sits near 16 dB and the reconstruction row cannot " +
    "separate a correct wiring from a wrong one, so the page's own default scene is the one case this gate " +
    "does NOT grade; WHICH ADAPTER, which in this container has been Google's SwiftShader every time, so " +
    "'on the device' means a real WebGPU implementation and not real hardware and no timing claim may be " +
    "read off it; and WHY THE DISOCCLUSION COUNT ALTERNATES 212/106 on this camera while the dolly's is a " +
    "flat 106 -- measured over frames 2-6 and left unexplained rather than given a plausible story. The slab " +
    "crosses 2.42 display pixels per frame, and this page's prose explains a similar alternation elsewhere " +
    "by pixel-boundary crossing, but that has NOT been measured here and a 2:1 ratio is not what 2.42 " +
    "px/frame would obviously give.");
//
// SABOTAGE LOG -- each applied to the live tree, run, and restored.
//   v4663  splitError double-counts: fired pixels also summed into rest   1 RED, the reconstruction.
//   v4663  the fired threshold moved from >= 0.05 to > 0                  *** 0 RED AT FIRST ***. The
//          reconstruction cannot see it -- ANY partition of the same pixels still adds up to the same dB --
//          and that is v4654's mistake exactly, which reported "36,862 of 36,864 pixels shading-shifted"
//          by counting floats above zero on a continuous detector and had its conclusion inverted on
//          re-measurement. The row that catches it is the one about the fired set's SIZE: 0.87% here
//          against nearly 100% at `> 0`.
//   v4663  the readout drops the partition caveat                         1 RED -- on the SECOND attempt.
//          The first replaced the phrase's occurrence in the COMMENT above the readout rather than in the
//          template string, so the mutation never reached the page: a NO-OP, not a 0-RED, and recorded as
//          one because the difference is the whole value of a sabotage log.
//
// *** AND THE FIRST DRAFT OF THE `say` LINE LOST ITS MEASUREMENT IN SILENCE. *** This file's `say` is
// (l) => ..., one argument, not the two-argument form other gates in this tree use. Passing two printed a
// bare "error split" with the numbers dropped -- a readout that looks like it ran and says nothing. Caught
// by reading the output, which an exit code would never have shown.
//   v4649  fsr.html: renderIds labels EVERY pixel the slab                     2 RED (control, disocclusion).
//          0-RED at first: the control took a maximum over an empty set and printed 0. Both populations are
//          counted now, and the count is in the row's condition.
//   v4649  fsr.html: the objects branch uses the camera-only field anyway      1 RED, the field row.
//   v4649  fsr.html: the slab's pattern does not travel with it                1 RED, in fsrPage-selfcheck.
//   v4649  fsr.html: SLAB_DX halved                                            2 RED, incl. the derivation row.
//   v4649  fsr.html: models and prevModels swapped                             1 RED, the reconstruction row.
//          0-RED twice first: the field rows cannot see it (the magnitude is forced by the geometry), and on
//          the ZONE PLATE the reconstruction cannot either. Caught on smooth, at a measured floor.
//   v4649  fsr.html: the depth buffer ignores the slab's offset                1 RED, the reconstruction row.
//          Same two 0-REDs and the same two repairs.
//   v4649  fsr.html: the RENDER ignores the slab's offset                      1 RED, the reconstruction row.
//   v4649  fsr.html: the REFERENCE ignores the slab's offset                   1 RED, the decay half.
//          This one was not a sabotage first -- it was the round's own defect, found by measuring the product.
//   v4659  fsr.html: the reactive mask asked for without counted: true         3 RED, all three v4659 rows.
//   v4659  REACTIVE_WGSL: a depth-gate decline bucketed as OFFSCREEN           2 RED.
//   v4659  fsr.html: the readout hard-codes the two zero declines              0 RED HERE, 1 RED in
//          fsrPage-selfcheck. Honest complementary coverage rather than a repair: on THIS camera the true
//          breakdown really is 0 invalid + 0 offscreen + all depth-gated, so a readout that prints two
//          literal zeroes is indistinguishable from a working one at runtime, and only the SOURCE can tell.
//   v4659  fsr.html: the reactive mask given 1.6x the chain's threshold        *** 0 RED ***
//          Not repaired, MEASURED. 1.8x, 2x, 2.5x and 3x are also 0-RED; 4x reds two rows and takes the
//          count straight from 212 to 0. The slab's silhouette is a cliff -- its pixels sit past 3x the
//          threshold and everything else far below, with nothing in between for a threshold to sort -- so
//          the two-kernels row pins the PREDICATE and the SIGN and not the number. The row now says so.
//          Content with a graded depth ramp would pin it; this page has none, and inventing one to make a
//          row look stronger would be moving the fixture to fit the claim.
//
// *** RUNTIME: 4,204 ms median of three (4,178 4,204 4,252) -- OVER the sweep's 3,000 ms membership
// threshold, and that is stated rather than tuned away. v4654 added ~850 ms by giving the page a luma
// ring: 2 x jitterPhaseCount slots per pixel, pushed every frame, which is the cost of the mechanism and
// not of this gate. It was 3,358 ms before that. ***
//
// This line first read "2,530 ms median of five" with five plausible samples beside it. That number was
// written before the gate was run. It is left described here rather than quietly replaced, because inventing
// a timing is the same defect as inventing a measurement and this file's whole subject is the difference.
//
// The split from fsrPageDevice-selfcheck still did its job: that gate went 2,448 -> 4,872 ms with these rows
// in it and is back to 2,418 without them, so it stays in the quick sweep. This one does not, and the cheap
// fix does not work: MEASURED at frame 4, where the gate costs 2,828 ms and fits, the reconstruction reads
// 36.8 dB correct against 36.4 camera-only and 36.16 swapped-matrices -- 0.4 dB of separation, no usable
// bound at all, because the accumulator has not converged that early. The separation this gate depends on is
// worth 2.8-4.1 dB and it exists at frame 6. A gate that fits the budget and cannot tell a correct wiring
// from a wrong one is not the cheaper version of this gate; it is a different gate that holds nothing.
//
// process.exit() would truncate everything above through a pipe -- see tools/ship/pipeTruncation-selfcheck.mjs.
process.exitCode = fails ? 1 : 0;
