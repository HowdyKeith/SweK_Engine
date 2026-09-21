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
                          dis: ($("disstat") || {}).textContent || "" };
            try { $("run").click(); } catch {}
            return out;
        }` });

        const G = r.result;
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
            // picture, and v4402's rule is that an absence must not read as a pass. MEASURED past the fill
            // point on a real adapter at v4654: at frame 64 the ring is full and 0 pixels are shifted; at
            // frame 70 it is 36,862 of 36,864 at peak 0.192 -- so it engages, and on this content it marks
            // very nearly EVERY pixel, which makes it a global damper rather than a selective mask. Whether
            // that helps is NOT established: the temporal pane reads 43.21 dB there against a 39.6-42.8
            // spread over the frames before it, which is the same order as the variation.
            const lk = /ring (\d+)\/(\d+) frames/.exec(G.lock || "");
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
