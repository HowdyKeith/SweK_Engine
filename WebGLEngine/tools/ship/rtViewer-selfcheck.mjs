#!/usr/bin/env node
// WebGLEngine/tools/ship/rtViewer-selfcheck.mjs
//
// Run: node tools/ship/rtViewer-selfcheck.mjs
//
// Grades render/rtViewer.mjs -- RTX ROUND 3, THE PRESENT PATH. Rounds 1-2 (physics/render/rtPipeline.mjs) gave
// the mesh a BVH and real shading; neither drew a pixel. This wires that kernel, a new running-mean accumulate
// kernel and a new fullscreen-triangle present kernel through gfx/device.js and puts a real GLB on a canvas.
//
// *** SECTION 1 IS A REAL, PRE-EXISTING BUG THIS ROUND FOUND, NOT A ROUND-3 DEFECT. *** rtPipeline.mjs's own
// `import { LCG } from "./pathTracerWgsl.mjs"` made it impossible to import ANYTHING from rtPipeline.mjs, or
// from physics/render/pathTracerGpu.mjs (which it also imports), inside a browser page -- pathTracerWgsl.mjs
// reads furnace.mjs off disk with node:fs to derive LCG, and an ES module runs its whole top level on import,
// so even wanting one field failed with a disk read nobody asked for. Every existing caller of rtPipeline.mjs
// runs in Node (this tree's own gates, always) -- render/rtViewer.mjs is the FIRST to load it from inside a
// real page, and that is what surfaced it. Fixed by moving the two regex parsers into the new, genuinely
// browser-safe physics/render/lcgConstants.mjs, which also freezes the values they produce; section 1 below
// re-derives LCG/EPS the slow (disk-reading) way and asserts the frozen copy still agrees, so a future change
// to furnace.mjs's generator cannot drift silently out from under the frozen numbers the browser gets instead.
//
// *** SECTIONS 3-5 ARE THE FIRST TIME rtPipeline.mjs's bvh WGSL RUNS THROUGH gfx/device.js's NAME-based BINDING
// AT ALL. *** physics/render/rtPipeline-selfcheck.mjs's own runWgslCompute() binds by INDEX and hand-rolls its
// bind groups, bypassing gfx/device.js entirely -- appropriate for kernel correctness, not for proving the
// integration this round adds (device.compute()/classify()/bindByName, the same mechanism every other device-
// backed module in this tree uses). Section 3 proves that integration on a fabricated cube before section 5
// trusts it with a real GLB.
//
// *** WHAT THIS DOES NOT CLAIM. *** That per-frame progressive accumulation is BIT-EXACT against one large-spp
// dispatch of the same total sample count -- it is not (rtViewer.mjs's own header explains why: rngState is
// seeded once per DISPATCH, so N frames of spp=1 walk a different sequence than one frame of spp=N). Section 2
// therefore grades the accumulate kernel's ARITHMETIC in isolation, against fabricated input decoupled from any
// path-tracing noise, which is an exact and total claim about that kernel; section 5's real-mesh render is
// graded only informally (no NaN/Inf, real spatial variance) because there is no oracle for what a path-traced
// picture of a real mesh should look like. Task #99 (a genuine statistical, measured-noise-bound render gate)
// is CLOSED as of RTX round 14 -- section 4f proves two things this comment used to say neither existed: a
// BIT-EXACT check that accumBuf after K real renderFrame() calls equals the hand-computed mean of each call's
// own raw per-frame output (closing the gap between section 2's fabricated-input proof and section 5's purely
// informal real-render sanity check), and a STATISTICAL check (3 measured standard errors, the same technique
// physics/render/rtPipeline-selfcheck.mjs's own statistical gates already use) that K accumulated frames of
// spp=S agree in EXPECTATION with one frame of spp=K*S -- not bit-exactly, which the paragraph above still
// correctly says never holds, but as two unbiased estimators of the same underlying radiance.
//
// SABOTAGE LOG -- each applied to render/rtViewer.mjs, gate run, exit read, file restored byte for byte:
//   A  accumulateWgsl's n replaced with n-1 (an off-by-one on the running-mean denominator)
//        -> exit=1, 4 red, WORSE THAN GUESSED BEFORE RUNNING IT: not just section 2's two fabricated cases
//           (n=1 expected [2,2,2,2], got division by n-1=0; n=4 expected [8,0.5,-3.25,75.5], also wrong) but
//           sections 4 and 5 too -- their FIRST accumulate call is also n=1, so the same n-1=0 division poisons
//           the real-mesh render with NaN/Inf before a single frame is on screen. Written down because the
//           first draft of this log predicted n=1 would pass "by coincidence" without having run it; it did not.
//   B  presentWgsl's index swapped to (x*W+y) instead of (y*W+x) -- a row/column transpose
//        -> exit=1, 1 red: section 3's distinct-per-pixel fixture (a 4x2 frame with no repeated row) reads the
//           wrong pixel at 6 of 8 positions.
//   C  presentWgsl's clamp() removed entirely
//        -> exit=0, 0 red: A REAL FINDING, NOT A GAP IN THE GATE. rgba8unorm is the render target's format
//           (gfx/device.js's own `fmt`), and WebGPU converts an out-of-[0,1] float to that format by CLAMPING
//           at the API level regardless of what the shader does -- section 3's fixture deliberately includes
//           1.5 and -0.3 to catch a clamp regression, and it is still caught, just one layer down from where
//           the WGSL puts it. The shader-level clamp is therefore belt-and-suspenders against a future present
//           target that is NOT rgba8unorm (an HDR float target would not clamp for free); kept, and this is
//           why removing it is not this section's red.
//   D  RTX round 10 -- makeRtSession's `material` validation throw removed entirely
//        -> exit=1, 1 red: section 1b's own "an unrecognized `material` value throws..." test, by name.
//   E  RTX round 10 -- the default (lambertian) branch's own `rgb: true` flipped to `rgb: false` in its
//      pipelineWgsl() call
//        -> exit=1, 2 red: section 1b's byte-identity check (the direct target), plus section 4b's own
//           "genuinely DIFFERENT from Lambertian" check as a real, traceable cascading effect (the mismatched
//           rgb/uniforms pairing degraded the Lambertian control render itself, not a false alarm).
//   F  RTX round 11 -- makeRtSession's `sky` validation throw removed entirely
//        -> exit=1, 1 red: section 1b's own "an unrecognized `sky` value throws..." test, by name.
//   G  RTX round 11 -- packAtlasHalfFloat's own toHalf()-based conversion replaced with a wrong ad-hoc
//      fixed-point encoding (`Math.round(x*4096) & 0xFFFF`)
//        -> exit=1, 1 red: section 1b's own packAtlasHalfFloat-vs-captureAtlasHalves codec check, by name --
//           the one check that exists specifically to catch this exact class of bug (see that section's own
//           comment on what it does and does not prove).
//   H  RTX round 11 -- makeRtSession's `envFaceSize` validation guard removed entirely (added after a
//      background adversarial review found this option, unlike `sky`/`material`, had none)
//        -> exit=1, 3 red: section 1b's own three envFaceSize:{0,-4,3.5} tests, each by name.
//   I  RTX round 15 -- makeRtSession's missing-data throw guard (`if (wantsVertexColors && !bvh.vertColors)
//      throw`) removed entirely
//        -> exit=1, 1 red: section 1f's own "vertexColors:true on a mesh with NO per-vertex colour data
//           throws..." test, by name.
//   J  RTX round 15 -- `wantsVertexColors = vertexColors && !isMicrofacet` changed to `wantsVertexColors =
//      vertexColors` (dropping the microfacet-inertness fold-in)
//        -> exit=1, 1 red: section 1f's own "vertexColors:true is a harmless NO-OP under material:
//           \"microfacet\"..." test, by name.
//   K  RTX round 15 -- `vertColorsBuf` still created but the `rtPipe.bind("bvhVertColors", vertColorsBuf)`
//      call removed
//        -> exit=1, 1 red: section 1f's own "and BINDS the real vertColors buffer by NAME..." test, by name --
//           the bind-capture proof this section exists to add over a WGSL-text-only check.
//   L  RTX round 15 -- loadCityBvh's `colors: scene.cols` pass-through reverted to `bvhBuffersFromTriSoup(
//      scene.verts, opts.bvh || {})` (dropping the colors attachment)
//        -> exit=1, but NOT a single targeted red: the whole gate crashes with an uncaught Error, because
//           section 5c calls makeRtSession({vertexColors:true}) against the now-colorless city mesh and the
//           SAME missing-data guard sabotage I above exists to test fires for real (bvh.vertColors is
//           genuinely null). Confirmed non-redundant with section 1f: 1f's own checks build fabricated bvh
//           fixtures directly and never call loadCityBvh() at all, so they cannot see this regression --
//           only section 5c, which drives the real loadCityBvh -> makeRtSession chain, does.
//   M  RTX round 16 -- dragOrbit's own pitchMax default changed from 1.5 to 2.0
//        -> exit=1, 1 red: section 1g's own "dragOrbit clamps pitch at the HIGH boundary (1.5)..." test, by name.
//   N  RTX round 16 -- dollyOrbit's own minScale default changed from 1.2 to 0.8
//        -> exit=1, 1 red: section 1g's own "dollyOrbit clamps at the NEAR boundary (bounds.radius * 1.2)..." test, by name.
//   O  RTX round 16 -- rtx-viewer.html's own pointermove handler reverted to its pre-round-16 inline formula
//      (no longer calling dragOrbit)
//        -> exit=1, 1 red: section 6's own "the page imports dragOrbit/dollyOrbit and its own pointermove/wheel
//           handlers actually CALL them..." test, by name -- confirmed non-redundant with section 1g: 1g only
//           calls dragOrbit/dollyOrbit directly, never reads rtx-viewer.html at all, so it cannot see the page
//           itself silently keeping a second, un-gated copy of the same arithmetic.
//   P  RTX round 16 -- rtx-viewer.html's own wheel handler reverted the same way (no longer calling dollyOrbit)
//        -> exit=1, 1 red: the SAME section 6 test as sabotage O, by name -- one combined check covers both
//           halves of the page's own wiring, not two separate ones.
"use strict";

import { gateReport } from "./gateReport.mjs";
import { webgpuSkipReason, runWgslCompute, runInEngineOrigin } from "./webgpuHarness.mjs";
import * as V from "../../render/rtViewer.mjs";
import * as PTW from "../../physics/render/pathTracerWgsl.mjs";
import { pipelineWgsl, bvhBuffersFromMesh } from "../../physics/render/rtPipeline.mjs";
import { captureAtlasHalves, captureBaseCubemap, packCapturedAtlas } from "../../physics/render/specularProbeCapture.mjs";
import { fromHalf } from "../../text/slugAtlas.js";
import { GLBParser } from "../../gpu/GLBParser.js";
import { meshTriples } from "../../physics/splat/splatMesh.mjs";
import { faceTexelDir } from "../../render/cubeBake.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REPORT = gateReport("tools/ship/rtViewer-selfcheck.mjs");
const REPORT_ROWS = [];

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const read = (rel) => fs.readFileSync(path.join(ENG, rel), "utf8");

// ---- 1. THE PORTABILITY FINDING -- lcgConstants.mjs's frozen values against the live, disk-reading source ----
console.log("1. THE BROWSER-SAFE LCG COPY, RE-CHECKED AGAINST THE REAL DISK READ");
{
    const liveLcg = PTW.parseLcg(), liveEps = PTW.parseEps();
    const { LCG: frozenLcg, EPS: frozenEps } = await import("../../physics/render/lcgConstants.mjs");
    say(`frozen LCG=${JSON.stringify(frozenLcg)} EPS=${frozenEps}; live (disk-read) LCG=${JSON.stringify(liveLcg)} EPS=${liveEps}`);
    ok("!! lcgConstants.mjs's frozen LCG matches a fresh parse of furnace.mjs off disk",
        frozenLcg.mul === liveLcg.mul && frozenLcg.inc === liveLcg.inc && frozenLcg.div === liveLcg.div,
        `frozen ${JSON.stringify(frozenLcg)} vs live ${JSON.stringify(liveLcg)} -- if these disagree, furnace.mjs's ` +
        "generator moved and lcgConstants.mjs's browser-safe copy was not updated to match");
    ok("!! and its frozen EPS matches a fresh parse of occlusion.mjs off disk",
        frozenEps === liveEps, `frozen ${frozenEps} vs live ${liveEps}`);
    ok("rtPipeline.mjs and pathTracerGpu.mjs both import LCG from lcgConstants.mjs, not pathTracerWgsl.mjs",
        /from ["']\.\/lcgConstants\.mjs["']/.test(read("physics/render/rtPipeline.mjs")) &&
        /from ["']\.\/lcgConstants\.mjs["']/.test(read("physics/render/pathTracerGpu.mjs")),
        "importing from pathTracerWgsl.mjs directly would reintroduce the node:fs chain this round removed");
    ok("pathTracerWgsl.mjs's own LCG/EPS are unchanged in VALUE by the refactor (still the disk-reading path)",
        PTW.LCG.mul === liveLcg.mul && PTW.EPS === liveEps,
        "every one of pathTracerWgsl.mjs's 11 other importers gets exactly the values it always got");
}

// ---- 1b. RTX ROUND 10 -- makeRtSession's OWN GENERATED WGSL, BY `material`, AGAINST pipelineWgsl() DIRECTLY ----
// No GPU needed: `device` is a stub that only RECORDS what makeRtSession() passes to device.compute(), so this
// checks the exact JS-level option-passing this round adds, decoupled from whether a real device is present.
console.log("\n1b. RTX ROUND 10 -- makeRtSession's material OPTION, AGAINST pipelineWgsl() DIRECTLY (NO GPU NEEDED)");
{
    const fakeMesh = {
        bvh: { nodeCount: 1, triCount: 1, bounds: new Float32Array(6), meta: new Float32Array(4),
                order: new Uint32Array(1), tris: new Float32Array(9) },
        bounds: { center: [0, 0, 0], radius: 1 }, vertexCount: 3, triangleCount: 1,
    };
    const stubDevice = () => {
        const wgsls = [];
        return { wgsls, device: {
            compute({ wgsl }) { wgsls.push(wgsl); return { bind() {}, bindTexture() {} }; },
            buffer() { return { write() {}, destroy() {} }; },
            texture() { return { destroy() {} }; },
            pipeline() { return {}; },
        } };
    };

    const d1 = stubDevice();
    V.makeRtSession(d1.device, { mesh: fakeMesh, w: 4, h: 4 });
    ok("!! material OMITTED (default) generates BYTE-IDENTICAL WGSL to pipelineWgsl({bvh:true,rgb:true,gradient:true})",
        d1.wgsls[0] === pipelineWgsl({ bvh: true, rgb: true, gradient: true }),
        "the same opt-in rule every prior rtPipeline option already holds to -- a page that never passes `material` " +
        "must render exactly as it did before this round existed, verified by direct string equality, not assumed");

    const d2 = stubDevice();
    V.makeRtSession(d2.device, { mesh: fakeMesh, w: 4, h: 4, material: "microfacet" });
    ok("!! material:\"microfacet\" generates BYTE-IDENTICAL WGSL to pipelineWgsl({bvh:true,gradient:true,microfacet:\"bsdf\",msComp:true})",
        d2.wgsls[0] === pipelineWgsl({ bvh: true, gradient: true, microfacet: "bsdf", msComp: true }),
        "proves makeRtSession's own microfacet branch calls pipelineWgsl with exactly the options its own doc " +
        "claims (unconditional msComp, no rgb), not just similar-looking ones");

    ok("an unrecognized `material` value throws rather than silently falling back to lambertian",
        (() => { try { V.makeRtSession(stubDevice().device, { mesh: fakeMesh, w: 4, h: 4, material: "mirror" }); return false; }
                 catch (e) { return /material must be/.test(e.message); } })(),
        "a typo in a future caller's `material` string should fail loud, not silently render Lambertian");

    // ---- RTX ROUND 11 -- `sky`, the SAME no-GPU option-passing check extended to envMap. ----
    const d3 = stubDevice();
    V.makeRtSession(d3.device, { mesh: fakeMesh, w: 4, h: 4, sky: "envMap" });
    ok("!! sky:\"envMap\" (material omitted) generates BYTE-IDENTICAL WGSL to pipelineWgsl({bvh:true,rgb:true,gradient:false,envMap:true})",
        d3.wgsls[0] === pipelineWgsl({ bvh: true, rgb: true, gradient: false, envMap: true }),
        "proves sky:\"envMap\" actually turns gradient OFF and envMap ON in the generated text, not merely accepted as an option with no effect");

    const d4 = stubDevice();
    V.makeRtSession(d4.device, { mesh: fakeMesh, w: 4, h: 4, material: "microfacet", sky: "envMap" });
    ok("!! material:\"microfacet\" + sky:\"envMap\" together generate BYTE-IDENTICAL WGSL to pipelineWgsl({bvh:true,gradient:false,microfacet:\"bsdf\",msComp:true,envMap:true})",
        d4.wgsls[0] === pipelineWgsl({ bvh: true, gradient: false, microfacet: "bsdf", msComp: true, envMap: true }),
        "the two toggles are orthogonal -- envMap composes with microfacet+msComp exactly as pipelineWgsl() itself allows (it throws only on envMap+gradient together), proven here rather than assumed from the option names alone");

    ok("an unrecognized `sky` value throws rather than silently falling back to gradient",
        (() => { try { V.makeRtSession(stubDevice().device, { mesh: fakeMesh, w: 4, h: 4, sky: "hdri" }); return false; }
                 catch (e) { return /sky must be/.test(e.message); } })(),
        "a typo in a future caller's `sky` string should fail loud, not silently render the gradient");

    // *** A BACKGROUND ADVERSARIAL REVIEW FOUND `envFaceSize` HAD NO GUARD, UNLIKE ITS SIBLING OPTIONS. ***
    // roughness/ior merely produce a numerically implausible but still well-formed material at any value; a
    // degenerate envFaceSize (0, negative, non-integer) instead produces a zero-length or ragged atlas with no
    // thrown error anywhere in captureBaseCubemap/packSpecularAtlas, which device.texture() then accepts with
    // no SYNCHRONOUS failure either -- confirmed by direct trace before this guard was added, not assumed.
    for (const bad of [0, -4, 3.5]) {
        ok(`envFaceSize:${bad} throws rather than silently baking a zero-length or ragged atlas`,
            (() => { try { V.makeRtSession(stubDevice().device, { mesh: fakeMesh, w: 4, h: 4, sky: "envMap", envFaceSize: bad }); return false; }
                     catch (e) { return /envFaceSize must be/.test(e.message); } })(),
            "a degenerate face size has no synchronous failure anywhere downstream of this guard -- device.texture() " +
            "accepts a 0 or negative width/height with no thrown error (WebGPU's own dimension validation is async)");
    }
    ok("envFaceSize is NOT checked when sky is \"gradient\" -- the option is meaningless there, not a caller mistake",
        (() => { try { V.makeRtSession(stubDevice().device, { mesh: fakeMesh, w: 4, h: 4, envFaceSize: -1 }); return true; }
                 catch (e) { return false; } })(),
        "a caller who never asks for envMap should not be penalized for a leftover or irrelevant envFaceSize value");

    // ---- RTX ROUND 11 -- packAtlasHalfFloat()'s OWN APPLICATION of the half-float codec, checked against a
    // SEPARATE call site (captureAtlasHalves(), physics/render/specularProbeCapture.mjs) that applies the
    // IDENTICAL toHalf/fromHalf (text/slugAtlas.js) to the same atlas -- NOT an independently-implemented
    // codec. *** CORRECTED HERE AFTER A BACKGROUND ADVERSARIAL REVIEW FOUND THE ORIGINAL WORDING OVERCLAIMED
    // EXACTLY THAT. *** captureAtlasHalves() computes fromHalf(toHalf(x)) with the SAME imported functions
    // packAtlasHalfFloat() uses, so this is the same deterministic expression evaluated by two independent call
    // sites, not two different codecs cross-checked -- said plainly rather than left as the misleading original
    // claim. What it DOES still prove, and is the only thing it needs to: packAtlasHalfFloat() applies toHalf()
    // to the right values, at the right indices, over the right length -- a wrong scale, a channel swap, a
    // transposed index, or a length mismatch would diverge from captureAtlasHalves()'s own separate call even
    // though both ultimately call the identical toHalf(), exactly what the sabotage log above (entry G) demonstrates.
    // Baked at DEFAULT_ENV_FACE_SIZE (the SAME size makeRtSession's own production path uses), not an
    // arbitrary smaller size, so the reported texel-channel count matches what a real session actually bakes
    // (also corrected here: an earlier draft used a hardcoded 8, which does not match either the production
    // path or the number this round's own backlog entry cites). ----
    {
        const capture = captureBaseCubemap(V.envRadianceOf, [0, 0, 0], V.DEFAULT_ENV_FACE_SIZE);
        const atlas = packCapturedAtlas(capture);
        const half = V.packAtlasHalfFloat(atlas);
        const quantized = captureAtlasHalves(atlas);
        let mismatches = 0;
        for (let i = 0; i < half.length; i++) if (fromHalf(half[i]) !== quantized.data[i]) mismatches++;
        say(`packAtlasHalfFloat vs captureAtlasHalves (DEFAULT_ENV_FACE_SIZE=${V.DEFAULT_ENV_FACE_SIZE}): ${mismatches} of ${half.length} texel-channels mismatched`);
        ok("!! packAtlasHalfFloat() applies the SAME toHalf/fromHalf codec captureAtlasHalves() independently calls on the SAME atlas",
            half.length === atlas.data.length && mismatches === 0,
            "a wrong scale, a channel swap, a wrong index, or a length mismatch in packAtlasHalfFloat's own loop " +
            "would diverge from captureAtlasHalves()'s own separate call even though both reach the identical " +
            "toHalf() underneath -- NOT a comparison against a differently-implemented codec (both use text/" +
            "slugAtlas.js's own toHalf/fromHalf), said plainly after a review found the original wording here " +
            "implied otherwise; the sabotage log above (entry G) shows this still catches exactly the bug class it exists for");
    }
}

// ---- 1c. RTX ROUND 12 -- makeRtSession's `direct` OPTION, AGAINST pipelineWgsl() DIRECTLY (NO GPU NEEDED) ----
console.log("\n1c. RTX ROUND 12 -- makeRtSession's `direct` OPTION, AGAINST pipelineWgsl() DIRECTLY (NO GPU NEEDED)");
{
    const fakeMesh = {
        bvh: { nodeCount: 1, triCount: 1, bounds: new Float32Array(6), meta: new Float32Array(4),
                order: new Uint32Array(1), tris: new Float32Array(9) },
        bounds: { center: [0, 0, 0], radius: 1 }, vertexCount: 3, triangleCount: 1,
    };
    const stubDevice = () => {
        const wgsls = [];
        return { wgsls, device: {
            compute({ wgsl }) { wgsls.push(wgsl); return { bind() {}, bindTexture() {} }; },
            buffer() { return { write() {}, destroy() {} }; },
            texture() { return { destroy() {} }; },
            pipeline() { return {}; },
        } };
    };

    const d1 = stubDevice();
    V.makeRtSession(d1.device, { mesh: fakeMesh, w: 4, h: 4, material: "microfacet", direct: "nee" });
    ok("!! material:\"microfacet\" + direct:\"nee\" generates BYTE-IDENTICAL WGSL to pipelineWgsl({bvh:true,gradient:true,microfacet:\"nee\",msComp:true})",
        d1.wgsls[0] === pipelineWgsl({ bvh: true, gradient: true, microfacet: "nee", msComp: true }),
        "proves `direct` actually reaches pipelineWgsl's own `microfacet` option (round 8's three-way NEE/MIS technique), not merely accepted with no effect");

    const d2 = stubDevice();
    V.makeRtSession(d2.device, { mesh: fakeMesh, w: 4, h: 4, material: "microfacet", direct: "mis" });
    ok("!! material:\"microfacet\" + direct:\"mis\" generates BYTE-IDENTICAL WGSL to pipelineWgsl({bvh:true,gradient:true,microfacet:\"mis\",msComp:true})",
        d2.wgsls[0] === pipelineWgsl({ bvh: true, gradient: true, microfacet: "mis", msComp: true }),
        "the same proof for the MIS technique specifically, not just NEE");

    const d3 = stubDevice();
    V.makeRtSession(d3.device, { mesh: fakeMesh, w: 4, h: 4, material: "microfacet" });
    ok("!! direct OMITTED (default \"bsdf\") under material:\"microfacet\" is BYTE-IDENTICAL to round 10's own shipped default",
        d3.wgsls[0] === pipelineWgsl({ bvh: true, gradient: true, microfacet: "bsdf", msComp: true }),
        "round 10's own already-shipped default behaviour must not change just because this round added a new, " +
        "unrelated-when-omitted option -- verified by direct string equality, not assumed");

    for (const dv of ["nee", "mis"]) {
        const d4 = stubDevice();
        V.makeRtSession(d4.device, { mesh: fakeMesh, w: 4, h: 4, material: "lambertian", direct: dv });
        ok(`!! direct:"${dv}" is a harmless NO-OP under material:"lambertian" -- same WGSL as if direct had been omitted entirely`,
            d4.wgsls[0] === pipelineWgsl({ bvh: true, rgb: true, gradient: true }),
            "plain Lambertian's own `nee` option (physics/render/rtPipeline.mjs) is a boolean with no MIS mode at all -- " +
            "a genuinely different, larger design fork this round does not take (see render/rtViewer.mjs's own doc) -- " +
            `so direct:"${dv}" is accepted-but-inert here, the same shape roughness/ior already have under material:"lambertian", ` +
            "confirmed by direct string equality rather than merely asserted to be harmless -- checked for BOTH non-default " +
            "values, not just \"nee\", since an adversarial review found the first draft only ever checked one");
    }

    ok("an unrecognized `direct` value throws rather than silently falling back to bsdf",
        (() => { try { V.makeRtSession(stubDevice().device, { mesh: fakeMesh, w: 4, h: 4, direct: "path" }); return false; }
                 catch (e) { return /direct must be/.test(e.message); } })(),
        "a typo in a future caller's `direct` string should fail loud, not silently render bsdf-only");

    // *** THE LIGHT ITSELF: sbt gains exactly one record, and ONLY when direct!=="bsdf" AND material is
    // "microfacet" -- checked directly against makeRtSession's own real pipelineUniforms() call, not just
    // inferred from the WGSL text (which says nothing about the SCENE's own contents). ***
    const capturedUniforms = [];
    const uniformsProbe = () => {
        const dev = stubDevice().device;
        dev.buffer = (d) => ({ write: (data) => { if (d && d.usage === "uniform" && data && data.length === 96) capturedUniforms.push(data); }, destroy() {} });
        // uBuf.write() (the call this probe cares about) runs synchronously BEFORE renderFrame() ever reaches
        // device.frame() -- this stub only needs to exist and not throw, never actually dispatch anything.
        dev.frame = () => null;
        return dev;
    };
    ok("direct:\"bsdf\" (the default) adds NO light -- sbt stays empty even under material:\"microfacet\"",
        (() => { const s = V.makeRtSession(uniformsProbe(), { mesh: fakeMesh, w: 4, h: 4, material: "microfacet" });
                 s.renderFrame({ w: 4, h: 4, eye: [0, 0, 4], look: [0, 0, 0], up: [0, 1, 0], fovDeg: 30 }, { offscreen: true });
                 return capturedUniforms.length === 1 && capturedUniforms[0][4 + 3] === 0; })(),
        "U[1].w carries sbt.length (rtPipeline.mjs's own packing) -- must read 0 when direct is left at its default, " +
        "the scene-level half of the byte-identity claim above (WGSL text alone says nothing about what is IN the scene)");
    capturedUniforms.length = 0;
    ok("!! direct:\"nee\" adds EXACTLY ONE light record -- sbt.length reads 1, not silently 0 or more than 1",
        (() => { const s = V.makeRtSession(uniformsProbe(), { mesh: fakeMesh, w: 4, h: 4, material: "microfacet", direct: "nee" });
                 s.renderFrame({ w: 4, h: 4, eye: [0, 0, 4], look: [0, 0, 0], up: [0, 1, 0], fovDeg: 30 }, { offscreen: true });
                 return capturedUniforms.length === 1 && capturedUniforms[0][4 + 3] === 1; })(),
        "proves the light this round adds is actually reaching pipelineUniforms's own sbt array, not just built and discarded");

    // *** THE LIGHT RECORD'S OWN CONTENTS -- an adversarial review found sbt.length alone proves a record was
    // added, not that it is the RIGHT record: a wrong position, radius or emit would sail through every check
    // above unnoticed. rtPipeline.mjs's own pipelineUniforms() packs sbt[0]'s centre/radius at flat index
    // (8+0)*4=32..35 and sbtRecordFloats(r,{rgb:false}) -- [hitType,albedo,emit,ior] for a non-microfacet
    // record -- at (16+0)*4=64..67 (both read directly off rtPipeline.mjs's source, not guessed), so this
    // reads the SAME uniform buffer the sbt.length checks above already capture, no new probe machinery needed.
    capturedUniforms.length = 0;
    {
        const s = V.makeRtSession(uniformsProbe(), { mesh: fakeMesh, w: 4, h: 4, material: "microfacet", direct: "nee" });
        s.renderFrame({ w: 4, h: 4, eye: [0, 0, 4], look: [0, 0, 0], up: [0, 1, 0], fovDeg: 30 }, { offscreen: true });
        const u = capturedUniforms[0];
        const expectCentre = [fakeMesh.bounds.center[0], fakeMesh.bounds.center[1] + fakeMesh.bounds.radius * V.DEFAULT_LIGHT_OFFSET_SCALE, fakeMesh.bounds.center[2]];
        const expectRadius = fakeMesh.bounds.radius * V.DEFAULT_LIGHT_RADIUS_SCALE;
        const close = (a, b) => Math.abs(a - b) < 1e-5;
        ok("!! the packed LIGHT RECORD ITSELF -- not just sbt.length -- carries the right position, radius, hit-type and emit",
            !!u && close(u[32], expectCentre[0]) && close(u[33], expectCentre[1]) && close(u[34], expectCentre[2]) &&
            close(u[35], expectRadius) && u[64] === 0 && close(u[66], V.DEFAULT_LIGHT_EMIT),
            `expected centre ${JSON.stringify(expectCentre)} radius ${expectRadius} hitType 0 (lambertian) emit ${V.DEFAULT_LIGHT_EMIT} -- ` +
            `got centre [${u ? [u[32], u[33], u[34]] : "?"}] radius ${u ? u[35] : "?"} hitType ${u ? u[64] : "?"} emit ${u ? u[66] : "?"} -- ` +
            "a wrong scale constant, a swapped axis, or a wrong emit value would diverge here even though sbt.length alone would still read 1");
    }
}

// ---- 1d. RTX ROUND 13 -- makeRtSession's `sky:"sceneCapture"` AND makeSceneRadianceOf() DIRECTLY (NO GPU) ----
console.log("\n1d. RTX ROUND 13 -- sky:\"sceneCapture\" AND makeSceneRadianceOf(), AGAINST pipelineWgsl() AND A REAL BVH (NO GPU NEEDED)");
{
    const fakeMesh = {
        bvh: { nodeCount: 1, triCount: 1, bounds: new Float32Array(6), meta: new Float32Array(4),
                order: new Uint32Array(1), tris: new Float32Array(9) },
        bounds: { center: [0, 0, 0], radius: 1 }, vertexCount: 3, triangleCount: 1,
    };
    const stubDevice = () => {
        const wgsls = [];
        return { wgsls, device: {
            compute({ wgsl }) { wgsls.push(wgsl); return { bind() {}, bindTexture() {} }; },
            buffer() { return { write() {}, destroy() {} }; },
            texture() { return { destroy() {} }; },
            pipeline() { return {}; },
        } };
    };

    // *** A REAL, TRACEABLE BVH, NOT `fakeMesh` -- `sky:"sceneCapture"` actually BAKES an atlas at session
    // creation (captureBaseCubemap calls makeSceneRadianceOf's own radianceOf function once per texel,
    // synchronously, even under a stub device), unlike `sky:"envMap"`, whose envRadianceOf never touches its
    // `mesh` argument at all -- `fakeMesh`'s own bvh field has no real MeshBVH instance for raycastFirst() to
    // call, so it would throw here even though it works fine for every OTHER option this file stubs with it.
    const cubePositions = [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]];
    const cubeIndices = [[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,5,4],[0,1,5],[3,6,2],[3,7,6],[0,7,3],[0,4,7],[1,6,5],[1,2,6]];
    const cubeBvh = bvhBuffersFromMesh(cubePositions, cubeIndices, {});
    const cubeMesh = { bvh: cubeBvh, bounds: V.meshBounds(cubeBvh) };

    // *** WGSL TEXT IS BYTE-IDENTICAL TO sky:"envMap" -- ON PURPOSE, AND THAT IS THE POINT OF THIS CHECK. ***
    // sky:"sceneCapture" changes ONLY which JS function bakes the atlas's own CONTENT, never the generated WGSL
    // (both set pipelineWgsl's own envMap:true) -- a WGSL-text comparison alone cannot distinguish the two, the
    // same "scene-level change WGSL text can't see" shape round 12's own light-record probe exists to catch.
    const d1 = stubDevice();
    V.makeRtSession(d1.device, { mesh: cubeMesh, w: 4, h: 4, sky: "sceneCapture" });
    ok("!! sky:\"sceneCapture\" (material omitted) generates BYTE-IDENTICAL WGSL to sky:\"envMap\" (material omitted)",
        d1.wgsls[0] === pipelineWgsl({ bvh: true, rgb: true, gradient: false, envMap: true }),
        "proves sceneCapture reuses envMap's own WGSL path exactly, not a fourth generated shader shape");
    const d2 = stubDevice();
    V.makeRtSession(d2.device, { mesh: cubeMesh, w: 4, h: 4, material: "microfacet", sky: "sceneCapture", direct: "nee" });
    ok("!! sky:\"sceneCapture\" composes with material:\"microfacet\"+direct:\"nee\" exactly like sky:\"envMap\" does",
        d2.wgsls[0] === pipelineWgsl({ bvh: true, gradient: false, microfacet: "nee", msComp: true, envMap: true }),
        "the three sky/material/direct toggles stay orthogonal with a third sky value added, not just with two");

    ok("an unrecognized `sky` value still throws (now that \"sceneCapture\" is a third valid value, not merely two)",
        (() => { try { V.makeRtSession(stubDevice().device, { mesh: fakeMesh, w: 4, h: 4, sky: "hdri" }); return false; }
                 catch (e) { return /sky must be/.test(e.message); } })(),
        "widening the valid set from two values to three must not widen it to \"anything not gradient/envMap\"");

    // *** THE BAKE POSITION GENUINELY TRACKS mesh.bounds.center -- NOT A FIXED CONSTANT -- PROVEN AT THE REAL
    // makeRtSession WIRING LEVEL, NOT JUST INSIDE makeSceneRadianceOf() IN ISOLATION. *** An adversarial review
    // found `cubeMesh` above is centred at the ORIGIN (its own [-1,1] geometry), so a bug where the bake position
    // was silently left hardcoded at [0,0,0] instead of actually reading mesh.bounds.center would be numerically
    // INDISTINGUISHABLE from the correct wiring for this one fixture -- every check above and below this comment
    // would still pass. *** A first draft of this fix compared a TRANSLATED cube's atlas against the untranslated
    // one and found them ALWAYS byte-identical -- not a bug in the wiring, a flawed test: translating the WHOLE
    // mesh (and therefore its bounds.center, and therefore the real bake position right along with it) preserves
    // every ray's geometry relative to its own capture point, so the two bakes are mathematically forced to agree
    // regardless of whether bounds.center is genuinely being read. *** Fixed by comparing the REAL session-wired
    // atlas for an off-centre mesh against what captureBaseCubemap would have produced for that SAME mesh at a
    // HARDCODED [0,0,0] instead -- the actual failure mode a "forgot to wire bounds.center" bug would produce.
    const texturedDevice = () => {
        let data = null;
        return { getData: () => data, device: {
            compute({ wgsl }) { return { bind() {}, bindTexture() {} }; },
            buffer() { return { write() {}, destroy() {} }; },
            texture(desc) { data = desc && desc.data; return { destroy() {} }; },
            pipeline() { return {}; },
        } };
    };
    const translatedPositions = cubePositions.map((p) => [p[0] + 3, p[1] + 4, p[2] + 5]);
    const translatedBvh = bvhBuffersFromMesh(translatedPositions, cubeIndices, {});
    const translatedMesh = { bvh: translatedBvh, bounds: V.meshBounds(translatedBvh) };
    const t2 = texturedDevice();
    V.makeRtSession(t2.device, { mesh: translatedMesh, w: 4, h: 4, sky: "sceneCapture" });
    const realAtlasBytes = t2.getData();
    const hardcodedOriginCapture = packCapturedAtlas(captureBaseCubemap(V.makeSceneRadianceOf(translatedMesh), [0, 0, 0], V.DEFAULT_ENV_FACE_SIZE));
    const hardcodedOriginBytes = V.packAtlasHalfFloat(hardcodedOriginCapture);
    ok("!! the REAL session-baked atlas differs from what a HARDCODED-AT-[0,0,0] capture position would have produced " +
        "for the SAME off-centre mesh -- the bake position genuinely reads mesh.bounds.center, not a fixed constant",
        !!realAtlasBytes && realAtlasBytes.length === hardcodedOriginBytes.length &&
        Array.from(realAtlasBytes).some((v, i) => v !== hardcodedOriginBytes[i]),
        `translated cube centre ${JSON.stringify(translatedMesh.bounds.center.map((v) => +v.toFixed(2)))} (far from [0,0,0]) -- ` +
        "identical atlas bytes here would mean the bake position never actually reads mesh.bounds.center at all, a bug the " +
        "cube fixture's own origin-centred geometry (and the earlier, mathematically-flawed pure-translation comparison) cannot otherwise catch");

    // *** makeSceneRadianceOf() ITSELF, AGAINST THE SAME REAL, TRACEABLE CUBE BVH -- THE SAME UNIT CUBE SECTION
    // 4 BELOW USES THROUGH A REAL DEVICE, HERE PROVEN AT THE JS LEVEL FIRST, NO GPU OR BROWSER NEEDED. ***
    const radianceOf = V.makeSceneRadianceOf(cubeMesh);

    const hitPos = [0, 0, 4], hitDir = [0, 0, -1]; // straight at the cube's own +z face -- a guaranteed hit
    const hitColor = radianceOf(hitPos, hitDir);
    const skyForHitRay = V.envRadianceOf(hitPos, hitDir);
    ok("!! a ray aimed straight at the cube's own geometry returns a FINITE, REAL hit color -- not NaN, not the sky fallback",
        hitColor.every((v) => isFinite(v) && v > 0) && hitColor.some((v, i) => Math.abs(v - skyForHitRay[i]) > 1e-6),
        `hit color ${JSON.stringify(hitColor)} vs what envRadianceOf would have returned for the identical (pos,dir) ${JSON.stringify(skyForHitRay)} -- ` +
        "identical values here would mean the ray silently fell through to the sky fallback despite hitting real geometry");

    const missPos = [0, 0, 4], missDir = [0, 1, 0]; // straight up, past the cube entirely -- a guaranteed miss
    const missColor = radianceOf(missPos, missDir);
    const skyForMissRay = V.envRadianceOf(missPos, missDir);
    ok("!! a ray that misses the cube entirely falls back to envRadianceOf(pos,dir) EXACTLY, element-wise",
        missColor.length === skyForMissRay.length && missColor.every((v, i) => v === skyForMissRay[i]),
        `${JSON.stringify(missColor)} vs ${JSON.stringify(skyForMissRay)} -- the miss path must defer to the SAME analytic sky ` +
        "round 11 already shipped, not a second, independently-drifting sky formula");

    // A ray hitting a face more directly aligned with the sun direction should read BRIGHTER than one hitting a
    // face at a shallow/opposed angle -- proves the NdotL shading term actually responds to the hit NORMAL,
    // not a flat constant regardless of which face or angle was hit.
    const frontColor = radianceOf([0, 0, 4], [0, 0, -1]);   // +z face
    const backColor = radianceOf([0, 0, -4], [0, 0, 1]);    // -z face (opposite normal)
    ok("!! shading VARIES by which face/normal was hit -- not a flat constant regardless of geometry",
        Math.abs(frontColor[0] - backColor[0]) > 1e-6,
        `+z face color ${JSON.stringify(frontColor)} vs -z face color ${JSON.stringify(backColor)} -- opposite normals must read ` +
        "differently against a fixed, directional sun term, or the NdotL term this round adds is not actually wired to the hit normal");

    // *** THE SHADING FORMULA'S OWN CONSTANTS, HELD TO A HAND-COMPUTED EXPECTED VALUE -- an adversarial review
    // found the checks above only prove SOME nonzero difference exists, not that the ambient/diffuse mix
    // (0.35 + 0.65*ndotl) or DEFAULT_ALBEDO specifically are what's actually applied; a swap to different
    // constants would still pass every check above. The +z face hit at pos=[0,0,4] is EXACTLY the triangle
    // spanning [4,5,6] (verts 4,5,6 at z=1), whose own cross(e1,e2) normal is [0,0,1] (hand-derivable from the
    // cube's own vertex positions), so ndotl = dot([0,0,1], normalize([0.35,0.55,0.3])) = 0.3/|[0.35,0.55,0.3]|
    // is computable independently of render/rtViewer.mjs's own ENV_SUN_DIR constant (private, not exported --
    // re-derived here from the same [0.35,0.55,0.3] its own doc comment states, not imported). ***
    const sunRaw = [0.35, 0.55, 0.3], sunLen = Math.hypot(sunRaw[0], sunRaw[1], sunRaw[2]);
    const handNdotL = sunRaw[2] / sunLen; // dot([0,0,1], sunRaw/sunLen) collapses to sunRaw[2]/sunLen
    const handShade = 0.35 + 0.65 * handNdotL;
    const handExpected = V.DEFAULT_ALBEDO.map((c) => c * handShade);
    const closeEnough = (a, b) => Math.abs(a - b) < 1e-9;
    ok("!! the +z face's hit color matches 0.35+0.65*ndotl times DEFAULT_ALBEDO, computed BY HAND off this file " +
        "(not by calling triNormal/envRadianceOf again, which would just restate the same formula under test)",
        frontColor.length === handExpected.length && frontColor.every((v, i) => closeEnough(v, handExpected[i])),
        `frontColor ${JSON.stringify(frontColor)} vs hand-computed ${JSON.stringify(handExpected)} (ndotl=${handNdotL.toFixed(6)}, ` +
        "shade=" + handShade.toFixed(6) + ") -- a different ambient/diffuse mix or a non-DEFAULT_ALBEDO base would diverge here " +
        "even though it would still clear the weaker \"some nonzero difference\" checks above");
}

// ---- 1e. RTX ROUND 13 -- THE REAL PAVEMENT-TILE SCENE'S OWN CAPTURE POSITION, AGAINST THE ACTUAL GLB (NO GPU) ----
console.log("\n1e. RTX ROUND 13 -- THE REAL PAVEMENT-TILE GLB'S OWN sky:\"sceneCapture\" HIT/MISS SPLIT (NO GPU NEEDED)");
{
    // *** THE ACTUAL BUG AN ADVERSARIAL REVIEW FOUND: this round's OWN first-draft scratch-verification tested
    // the tile scene against a FABRICATED flat quad, not the real GLB -- and the real pavement.glb is a thin,
    // CLOSED box, so mesh.bounds.center sits inside its own solid interior (measured directly: 1536/1536 hits,
    // 0 misses at bounds.center exactly). DEFAULT_SCENE_CAPTURE_HEIGHT_SCALE was added specifically to fix
    // this -- this section is the permanent gate against the REAL file regressing back to the degenerate case,
    // not a fabricated stand-in that could not have caught the bug in the first place. ***
    const glbBuf = fs.readFileSync(path.join(ENG, "vendor/kenney-city/models/pavement.glb"));
    const parsed = await GLBParser.parse(glbBuf.buffer.slice(glbBuf.byteOffset, glbBuf.byteOffset + glbBuf.byteLength), {});
    const { positions, indices } = meshTriples({ positions: parsed.positions, indices: parsed.indices });
    const tileBvh = bvhBuffersFromMesh(positions, indices, {});
    const tileMesh = { bvh: tileBvh, bounds: V.meshBounds(tileBvh) };
    // *** V.sceneCaptureBakePos(), NOT AN INLINE RE-DERIVATION OF THE FORMULA -- an adversarial review found a
    // first draft of THIS section re-typed "bounds.center + radius*scale" independently of makeRtSession's own
    // copy, so a sabotage of makeRtSession's own bakePos line went undetected (this section's own independently-
    // correct copy still measured a fine hit/miss split, oblivious to what the real session actually did). Fixed
    // by extracting ONE shared, exported sceneCaptureBakePos(mesh) that BOTH makeRtSession and this gate call. ***
    const bakePos = V.sceneCaptureBakePos(tileMesh);
    const radianceOf = V.makeSceneRadianceOf(tileMesh);
    const inst = tileMesh.bvh.bvh;
    let hits = 0, misses = 0, nan = 0;
    const size = 16;
    for (let f = 0; f < 6; f++) for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
        const dir = faceTexelDir(f, i, j, size);
        if (inst.raycastFirst(bakePos[0], bakePos[1], bakePos[2], dir[0], dir[1], dir[2])) hits++; else misses++;
        const c = radianceOf(bakePos, dir);
        if (!c.every((v) => isFinite(v))) nan++;
    }
    const total = hits + misses;
    say(`real pavement.glb: bounds ${JSON.stringify(tileMesh.bounds)}, bake position ${JSON.stringify(bakePos.map((v) => +v.toFixed(4)))}`);
    say(`hit/miss at the REAL bake position: ${hits} hits (${(100 * hits / total).toFixed(1)}%), ${misses} misses (${(100 * misses / total).toFixed(1)}%)`);
    ok("!! the real pavement-tile GLB's own capture position is NOT degenerate -- both real geometry hits AND real sky " +
        "misses, not all-hit (the bug this section exists to catch, since bounds.center EXACTLY was measured all-hit) " +
        "or all-miss (which would mean the offset overshot into open sky, capturing nothing of the tile at all)",
        nan === 0 && hits > total * 0.05 && misses > total * 0.05,
        `${hits}/${total} hit, ${misses}/${total} miss -- either extreme means DEFAULT_SCENE_CAPTURE_HEIGHT_SCALE needs re-tuning ` +
        "against this real file, not that the fabricated-cube fixture in section 1d above happened to look fine");

    // *** THE REAL SESSION, NOT JUST THE SHARED FORMULA CALLED DIRECTLY -- even with sceneCaptureBakePos() single-
    // sourced above, makeRtSession's own bakePos LINE could still be sabotaged to bypass that function entirely
    // (e.g. reverted to bare mesh.bounds.center inline) without this section's own direct call to the same,
    // un-sabotaged function ever noticing. Closes that gap by running the REAL makeRtSession end to end (behind a
    // stub device that captures the packed atlas bytes device.texture() would receive) and confirming it does NOT
    // match what a bounds.center-exactly (the degenerate case) bake would have produced for this SAME real file. ***
    const texturedDevice = () => {
        let data = null;
        return { getData: () => data, device: {
            compute({ wgsl }) { return { bind() {}, bindTexture() {} }; },
            buffer() { return { write() {}, destroy() {} }; },
            texture(desc) { data = desc && desc.data; return { destroy() {} }; },
            pipeline() { return {}; },
        } };
    };
    const realDev = texturedDevice();
    V.makeRtSession(realDev.device, { mesh: tileMesh, w: 4, h: 4, sky: "sceneCapture" });
    const realBytes = realDev.getData();
    const degenerateCapture = packCapturedAtlas(captureBaseCubemap(V.makeSceneRadianceOf(tileMesh), tileMesh.bounds.center, V.DEFAULT_ENV_FACE_SIZE));
    const degenerateBytes = V.packAtlasHalfFloat(degenerateCapture);
    ok("!! makeRtSession's OWN real bake for the real tile mesh differs from what a bounds.center-EXACTLY (the degenerate " +
        "case measured above) bake would have produced -- the SESSION itself applies the height offset, not merely a " +
        "correct formula sitting in this gate unused by makeRtSession's own wiring",
        !!realBytes && realBytes.length === degenerateBytes.length && realBytes.some((v, i) => v !== degenerateBytes[i]),
        "identical bytes here would mean makeRtSession's own bakePos line stopped calling sceneCaptureBakePos() -- " +
        "a regression the check just above this one, which calls sceneCaptureBakePos() directly rather than through " +
        "makeRtSession, cannot see");
}

// ---- 1f. RTX ROUND 15 -- makeRtSession's `vertexColors` OPTION, AGAINST pipelineWgsl() AND A REAL BOUND BUFFER (NO GPU) ----
console.log("\n1f. RTX ROUND 15 -- makeRtSession's `vertexColors` OPTION, AGAINST pipelineWgsl() AND A REAL BOUND BUFFER (NO GPU NEEDED)");
{
    // A real, traceable cube WITH real per-vertex colour data this time -- fakeMesh's own stub bvh has no
    // vertColors for makeRtSession to bind, the same reason section 1d needed a real BVH for sceneCapture.
    const positions = [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]];
    const indices = [[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,5,4],[0,1,5],[3,6,2],[3,7,6],[0,7,3],[0,4,7],[1,6,5],[1,2,6]];
    const colors = positions.map((_, i) => [i / 8, (7 - i) / 8, 0.5]);
    const cubeBvh = bvhBuffersFromMesh(positions, indices, { colors });
    const cubeMesh = { bvh: cubeBvh, bounds: V.meshBounds(cubeBvh) };
    const noColorBvh = bvhBuffersFromMesh(positions, indices, {});
    const noColorMesh = { bvh: noColorBvh, bounds: V.meshBounds(noColorBvh) };

    const stubDevice = () => {
        const wgsls = [], binds = [];
        return { wgsls, binds, device: {
            compute({ wgsl }) { wgsls.push(wgsl); return { bind(name) { binds.push(name); }, bindTexture() {} }; },
            buffer() { return { write() {}, destroy() {} }; },
            texture() { return { destroy() {} }; },
            pipeline() { return {}; },
        } };
    };

    const d1 = stubDevice();
    V.makeRtSession(d1.device, { mesh: cubeMesh, w: 4, h: 4, vertexColors: true });
    ok("!! vertexColors:true (material omitted) generates BYTE-IDENTICAL WGSL to pipelineWgsl({bvh:true,rgb:true,gradient:true,vertexColors:true})",
        d1.wgsls[0] === pipelineWgsl({ bvh: true, rgb: true, gradient: true, vertexColors: true }),
        "proves vertexColors actually reaches pipelineWgsl's own vertexColors option, not merely accepted with no effect");
    ok("!! and BINDS the real vertColors buffer by NAME (\"bvhVertColors\") -- not just generates the right WGSL text",
        d1.binds.includes("bvhVertColors"),
        `binds captured: ${JSON.stringify(d1.binds)} -- WGSL text alone says nothing about whether the buffer the shader reads from was ever actually bound`);

    const d2 = stubDevice();
    V.makeRtSession(d2.device, { mesh: cubeMesh, w: 4, h: 4 });
    ok("!! vertexColors OMITTED (default false) is BYTE-IDENTICAL to round 10's own shipped default, and does NOT bind bvhVertColors",
        d2.wgsls[0] === pipelineWgsl({ bvh: true, rgb: true, gradient: true }) && !d2.binds.includes("bvhVertColors"),
        "a caller that never asks for vertexColors must render exactly as every round before this one did -- verified by " +
        "direct string equality AND by confirming the buffer this round adds is never bound, not just that the WGSL text matches");

    const d3 = stubDevice();
    V.makeRtSession(d3.device, { mesh: cubeMesh, w: 4, h: 4, material: "microfacet", vertexColors: true });
    ok("!! vertexColors:true is a harmless NO-OP under material:\"microfacet\" -- same WGSL as material:\"microfacet\" alone, and no bind",
        d3.wgsls[0] === pipelineWgsl({ bvh: true, gradient: true, microfacet: "bsdf", msComp: true }) && !d3.binds.includes("bvhVertColors"),
        "rtPipeline.mjs's own pipelineWgsl() throws on vertexColors+!rgb, and rgb is forced false under microfacet (see " +
        "render/rtViewer.mjs's own doc) -- so vertexColors is accepted-but-inert here, the mirror image of the shape " +
        "`direct` already has under material:\"lambertian\", confirmed by direct string equality and an empty bind list");

    ok("!! vertexColors:true on a mesh with NO per-vertex colour data throws, rather than silently rendering flat",
        (() => { try { V.makeRtSession(stubDevice().device, { mesh: noColorMesh, w: 4, h: 4, vertexColors: true }); return false; }
                 catch (e) { return /no per-vertex colour data/.test(e.message); } })(),
        "a caller asking for vertex colours on a mesh that has none (bvh.vertColors is null -- e.g. the live demo's own " +
        "pavement.glb, which has no COLOR_0 accessor) should fail loud, not silently fall back to the flat albedo");
}

console.log("\n1g. RTX ROUND 16 -- dragOrbit/dollyOrbit, rtx-viewer.html's OWN POINTER MATH, HELD TO EXACT ARITHMETIC (NO GPU, NO POINTER NEEDED)");
{
    // The exact inline formula this round replaced (rtx-viewer.html, pre-round-16): yaw += dx*0.006;
    // pitch = clamp(pitch + dy*0.006, 0.05, 1.5); dist = clamp(dist*exp(deltaY*0.001), radius*1.2, radius*20).
    // Pinned here as literal numbers, not by re-deriving them from V.dragOrbit/V.dollyOrbit's own defaults --
    // a sabotage that changes a default AND this test's own expectation together would go undetected otherwise.
    const d1 = V.dragOrbit(0.7, 0.45, 10, -20);
    ok("!! dragOrbit, well inside both clamps: yaw += dx*0.006 exactly, pitch += dy*0.006 exactly",
        d1.yaw === 0.7 + 10 * 0.006 && d1.pitch === 0.45 + -20 * 0.006,
        `got yaw=${d1.yaw}, pitch=${d1.pitch}`);
    const d2 = V.dragOrbit(0, 1.49, 0, 100);
    ok("!! dragOrbit clamps pitch at the HIGH boundary (1.5) rather than overshooting",
        d2.pitch === 1.5, `got pitch=${d2.pitch} for an input that would overshoot to ${1.49 + 100 * 0.006} unclamped`);
    const d3 = V.dragOrbit(0, 0.06, 0, -100);
    ok("!! dragOrbit clamps pitch at the LOW boundary (0.05) rather than undershooting",
        d3.pitch === 0.05, `got pitch=${d3.pitch} for an input that would undershoot to ${0.06 - 100 * 0.006} unclamped`);
    ok("!! dragOrbit's own yaw is NEVER clamped (only sin/cos of it are ever read by orbitEye, so wrapping/clamping " +
        "would be pure overhead, not a correctness requirement)",
        V.dragOrbit(0, 0.4, 1e6, 0).yaw === 1e6 * 0.006, "a huge dx must still move yaw by exactly dx*0.006, unclamped");

    const bounds = { radius: 3.5 };
    const w1 = V.dollyOrbit(5, -50, bounds);
    ok("!! dollyOrbit, well inside both clamps: dist * exp(deltaY*0.001) exactly",
        w1 === 5 * Math.exp(-50 * 0.001), `got ${w1}, expected ${5 * Math.exp(-50 * 0.001)}`);
    ok("!! dollyOrbit clamps at the NEAR boundary (bounds.radius * 1.2) rather than overshooting inward",
        V.dollyOrbit(bounds.radius * 1.2, -1e6, bounds) === bounds.radius * 1.2,
        "a huge negative deltaY (zooming in hard) must stop exactly at radius*1.2, not pass through it");
    ok("!! dollyOrbit clamps at the FAR boundary (bounds.radius * 20) rather than overshooting outward",
        V.dollyOrbit(bounds.radius * 20, 1e6, bounds) === bounds.radius * 20,
        "a huge positive deltaY (zooming out hard) must stop exactly at radius*20, not pass through it");
    ok("!! dollyOrbit's own clamp SCALES with whichever scene is loaded -- a smaller mesh dollies to a smaller range",
        V.dollyOrbit(1000, 1e6, { radius: 0.5 }) === 0.5 * 20 && V.dollyOrbit(1000, 1e6, { radius: 12 }) === 12 * 20,
        "the pavement tile (radius ~0.7) and the city scene (radius ~12) must each clamp against their OWN bounds, " +
        "not a shared constant -- a caller passing the wrong mesh's bounds would silently dolly to the wrong range");

    // Byte-identity against the CURRENT rtx-viewer.html page's own literal formula, re-derived independently in
    // this test rather than by calling V.dragOrbit/V.dollyOrbit again -- catches BOTH sides drifting together.
    const yawOld = 0.7 + 123 * 0.006, pitchOld = Math.max(0.05, Math.min(1.5, 0.45 + -45 * 0.006));
    const dNew = V.dragOrbit(0.7, 0.45, 123, -45);
    ok("!! matches the ORIGINAL inline formula rtx-viewer.html carried before this round, re-derived independently here",
        dNew.yaw === yawOld && dNew.pitch === pitchOld, `dragOrbit ${JSON.stringify(dNew)} vs inline ${JSON.stringify({ yaw: yawOld, pitch: pitchOld })}`);
    const distOld = Math.max(3.5 * 1.2, Math.min(3.5 * 20, 8 * Math.exp(77 * 0.001)));
    ok("!! matches the ORIGINAL inline dolly formula, re-derived independently here",
        V.dollyOrbit(8, 77, bounds) === distOld, `dollyOrbit ${V.dollyOrbit(8, 77, bounds)} vs inline ${distOld}`);
}

// ---- 2. THE ACCUMULATE KERNEL, EXACT, AGAINST FABRICATED INPUT -----------------------------------------------
console.log("\n2. accumulateWgsl -- A RUNNING MEAN, HELD TO HAND-COMPUTED EXPECTED VALUES");
{
    const src = V.accumulateWgsl(4);
    ok("declares accumBuf read_write at binding 0, F uniform at 1, frameBuf read at 2",
        /@binding\(0\)[^\n]*read_write>\s*accumBuf/.test(src) && /@binding\(1\)[^\n]*uniform>\s*F/.test(src) &&
        /@binding\(2\)[^\n]*read>\s*frameBuf/.test(src),
        "binding 0 is what runWgslCompute always reads back -- see this file's header on why the order matters here and nowhere else");

    const skip = webgpuSkipReason();
    if (skip) {
        console.log("  SKIP  no WebGPU device: " + skip);
        fails++;
    } else {
        const N = 4, prior = [10, 0, -5, 100], frame = [2, 2, 2, 2];
        const run = (n) => runWgslCompute({ code: V.accumulateWgsl(N), outCount: N, workgroups: 1,
            outInit: new Float32Array(prior), uniforms: new Float32Array([n, 0, 0, 0]),
            inputs: [{ binding: 2, data: new Float32Array(frame) }] });

        const r1 = await run(1);
        if (!r1.ok) throw new Error("accumulate n=1 GPU run failed: " + r1.reason);
        say(`n=1 (first sample): accumBuf ${JSON.stringify(r1.values)}`);
        ok("!! n=1 FULLY OVERWRITES regardless of the prior value -- this is what makes a camera-move reset just \"restart n at 1\"",
            r1.values.every((v, i) => v === frame[i]),
            `expected ${JSON.stringify(frame)} (the prior value ${JSON.stringify(prior)} must not leak through)`);

        const r4 = await run(4);
        if (!r4.ok) throw new Error("accumulate n=4 GPU run failed: " + r4.reason);
        const expect4 = prior.map((p, i) => p + (frame[i] - p) / 4);
        say(`n=4: accumBuf ${JSON.stringify(r4.values)}, hand-computed ${JSON.stringify(expect4)}`);
        REPORT_ROWS.push(["accumulate n=1", JSON.stringify(prior), JSON.stringify(frame), JSON.stringify(r1.values)]);
        REPORT_ROWS.push(["accumulate n=4", JSON.stringify(prior), JSON.stringify(frame), JSON.stringify(r4.values)]);
        ok("!! n=4 matches accumBuf[i] + (frameBuf[i]-accumBuf[i])/4, computed by hand off-GPU",
            r4.values.every((v, i) => Math.abs(v - expect4[i]) < 1e-5),
            "the Welford-style running mean, checked as arithmetic rather than trusted as an idiom");
    }
}

const skip = webgpuSkipReason();
if (skip) {
    console.log("\n3-5 SKIPPED -- no WebGPU device: " + skip);
    console.log("\nrtViewer-selfcheck: " + fails + " FAILED (short report, not a clean one)");
    process.exit(1);
}

console.log("\n3-5. THE PRESENT KERNEL, THE NAME-BASED DEVICE INTEGRATION, AND A REAL MESH -- ALL THREE THROUGH ONE PAGE");
{
    const r = await runInEngineOrigin({
        engineRoot: ENG, timeoutMs: 90000,
        script: `async () => {
            const { requestDevice } = await import("/gfx/device.js");
            const { presentWgsl, loadMeshBvh, loadCityBvh, makeRtSession, orbitEye, meshBounds } = await import("/render/rtViewer.mjs");
            const { bvhBuffersFromMesh } = await import("/physics/render/rtPipeline.mjs");
            const out = {};

            // ---- 3. present kernel: a distinct-per-pixel accumBuf, fed directly (no raytrace/accumulate) ----
            {
                const w = 4, h = 2;
                const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
                const device = await requestDevice(canvas, { backend: "webgpu" });
                const accum = new Float32Array(w * h * 3);
                for (let i = 0; i < w * h; i++) { accum[i*3] = i / (w*h); accum[i*3+1] = 1.5; accum[i*3+2] = -0.3; }
                const accumBuf = device.buffer({ usage: "storage", data: accum });
                const pipe = device.pipeline({ shaders: { wgsl: presentWgsl(w, h) } });
                const frame = await device.frame(({ pass }) => {
                    pass.clear([0, 0, 0, 1]);
                    pass.use(pipe);
                    pass.storage("accumBuf", accumBuf);
                    pass.draw(3, 1);
                }, { offscreen: true, read: true });
                const expected = [];
                for (let i = 0; i < w * h; i++) expected.push(Math.round(Math.min(1, Math.max(0, accum[i*3])) * 255), 255, 0, 255);
                out.present = { px: Array.from(frame.pixels), expected, w, h };
            }

            // ---- 4. a fabricated cube through makeRtSession -- gfx/device.js's NAME-based bindByName, first use ----
            {
                const positions = [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]];
                const indices = [[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,5,4],[0,1,5],[3,6,2],[3,7,6],[0,7,3],[0,4,7],[1,6,5],[1,2,6]];
                const bvh = bvhBuffersFromMesh(positions, indices);
                const mesh = { bvh, bounds: meshBounds(bvh) };
                const w = 32, h = 24;
                const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
                const device = await requestDevice(canvas, { backend: "webgpu" });
                const session = makeRtSession(device, { mesh, w, h, spp: 2 });
                const view = { w, h, ...orbitEye({ yaw: 0.6, pitch: 0.35, dist: 4, center: mesh.bounds.center }), fovDeg: 45 };
                for (let i = 0; i < 6; i++) await session.renderFrame(view, { offscreen: true, read: true });
                const accum = new Float32Array(await device.read(session.accumBuf));
                let nan = 0, min = Infinity, max = -Infinity;
                for (const v of accum) { if (!isFinite(v)) nan++; if (v < min) min = v; if (v > max) max = v; }
                out.cube = { boundsRadius: mesh.bounds.radius, nan, min, max, frameCount: session.frameCount() };
                session.destroy();
            }

            // ---- 4b. RTX ROUND 10 -- the SAME fabricated cube, through material:"microfacet" (msComp:true, the
            // FIRST production caller of either) -- proves the real device path (msE buffer built and bound BY
            // NAME, roughness/ior packed into the bvh uniform slot each frame) actually executes end to end, not
            // just that the right JS options are chosen (section 1b's own, GPU-free claim). ----
            {
                const positions = [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]];
                const indices = [[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,5,4],[0,1,5],[3,6,2],[3,7,6],[0,7,3],[0,4,7],[1,6,5],[1,2,6]];
                const bvh = bvhBuffersFromMesh(positions, indices);
                const mesh = { bvh, bounds: meshBounds(bvh) };
                const w = 32, h = 24;
                const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
                const device = await requestDevice(canvas, { backend: "webgpu" });
                const session = makeRtSession(device, { mesh, w, h, spp: 2, material: "microfacet" });
                const view = { w, h, ...orbitEye({ yaw: 0.6, pitch: 0.35, dist: 4, center: mesh.bounds.center }), fovDeg: 45 };
                for (let i = 0; i < 6; i++) await session.renderFrame(view, { offscreen: true, read: true });
                const accum = new Float32Array(await device.read(session.accumBuf));
                let nan = 0, min = Infinity, max = -Infinity;
                for (const v of accum) { if (!isFinite(v)) nan++; if (v < min) min = v; if (v > max) max = v; }
                out.cubeMicrofacet = { nan, min, max, frameCount: session.frameCount() };
                session.destroy();
            }

            // ---- 4c. RTX ROUND 11 -- the SAME fabricated cube, through sky:"envMap" (the FIRST production
            // caller of envMap) -- proves the real device path (the baked atlas uploaded as a real
            // rgba16float texture, bound BY NAME at "tAtlas") actually executes end to end, not just that the
            // right JS options are chosen (section 1b's own, GPU-free claim). ----
            {
                const positions = [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]];
                const indices = [[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,5,4],[0,1,5],[3,6,2],[3,7,6],[0,7,3],[0,4,7],[1,6,5],[1,2,6]];
                const bvh = bvhBuffersFromMesh(positions, indices);
                const mesh = { bvh, bounds: meshBounds(bvh) };
                const w = 32, h = 24;
                const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
                const device = await requestDevice(canvas, { backend: "webgpu" });
                const session = makeRtSession(device, { mesh, w, h, spp: 2, sky: "envMap" });
                const view = { w, h, ...orbitEye({ yaw: 0.6, pitch: 0.35, dist: 4, center: mesh.bounds.center }), fovDeg: 45 };
                for (let i = 0; i < 6; i++) await session.renderFrame(view, { offscreen: true, read: true });
                const accum = new Float32Array(await device.read(session.accumBuf));
                let nan = 0, min = Infinity, max = -Infinity, sum = 0;
                for (const v of accum) { if (!isFinite(v)) nan++; if (v < min) min = v; if (v > max) max = v; sum += v; }
                out.cubeEnvMap = { nan, min, max, mean: sum / accum.length, frameCount: session.frameCount() };
                session.destroy();
            }

            // ---- 4d. RTX ROUND 12 -- the SAME fabricated cube, through direct:"nee" and direct:"mis" (the
            // FIRST production caller of either, and the first time this session's own scene contains a real
            // light) -- proves the real device path (a light sbtRecord built and packed through
            // pipelineUniforms, the microfacet direct-lighting technique switched in the generated WGSL)
            // actually executes end to end, not just that the right JS options are chosen (section 1c's own
            // GPU-free claim). ----
            {
                const positions = [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]];
                const indices = [[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,5,4],[0,1,5],[3,6,2],[3,7,6],[0,7,3],[0,4,7],[1,6,5],[1,2,6]];
                const bvh = bvhBuffersFromMesh(positions, indices);
                const mesh = { bvh, bounds: meshBounds(bvh) };
                const w = 32, h = 24;
                const view = { w, h, ...orbitEye({ yaw: 0.6, pitch: 0.35, dist: 4, center: mesh.bounds.center }), fovDeg: 45 };
                const renderDirect = async (direct) => {
                    const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
                    const device = await requestDevice(canvas, { backend: "webgpu" });
                    const session = makeRtSession(device, { mesh, w, h, spp: 2, material: "microfacet", direct });
                    for (let i = 0; i < 6; i++) await session.renderFrame(view, { offscreen: true, read: true });
                    const accum = new Float32Array(await device.read(session.accumBuf));
                    // checksum is a POSITION-WEIGHTED sum (not just a total), so two buffers with the same total
                    // but different per-pixel values -- e.g. a direct:"mis" that accidentally degenerated into
                    // reusing direct:"nee"'s own code path pixel-for-pixel, which the mean-gap check below could
                    // not tell apart from a real, independent MIS render -- read as DIFFERENT here even though
                    // their means would agree almost exactly (an adversarial review's own finding).
                    let nan = 0, min = Infinity, max = -Infinity, sum = 0, checksum = 0;
                    for (let i = 0; i < accum.length; i++) {
                        const v = accum[i];
                        if (!isFinite(v)) nan++; if (v < min) min = v; if (v > max) max = v; sum += v;
                        checksum += v * (i % 97 + 1);
                    }
                    session.destroy();
                    return { nan, min, max, mean: sum / accum.length, checksum };
                };
                // A FRESH, WITHIN-SECTION bsdf-only/no-light baseline, not section 4b's own cubeMicrofacet --
                // min/max alone turned out to be the WRONG metric here (both stay pinned to the SAME extreme
                // pixels -- the sky and a Fresnel highlight -- whether or not the light is on), confirmed by a
                // real headless-Chromium run BEFORE settling on mean as the actual sensitive signal: bsdf
                // mean 0.123277, nee mean 0.124229, mis mean 0.124225 -- nee and mis independently agree with
                // EACH OTHER (both unbiased estimators of the identical lit scene) far more closely than either
                // agrees with the unlit bsdf-only baseline, exactly the signature a real, working light gives.
                out.cubeDirectBsdf = await renderDirect("bsdf");
                out.cubeDirectNee = await renderDirect("nee");
                out.cubeDirectMis = await renderDirect("mis");
            }

            // ---- 4e. RTX ROUND 13 -- the SAME fabricated cube, through sky:"sceneCapture" (the FIRST production
            // caller) -- proves the real device path (makeSceneRadianceOf's own ray-BVH trace, baked through the
            // SAME captureBaseCubemap/packCapturedAtlas/device.texture path sky:"envMap" already uses, this time
            // fed by a scene-derived radianceOf rather than an analytic one) actually executes end to end and
            // produces a picture measurably different from the analytic sky:"envMap" atlas -- not just that
            // section 1d's own GPU-free claim (the JS function alone) is correct in isolation. ----
            {
                const positions = [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]];
                const indices = [[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,5,4],[0,1,5],[3,6,2],[3,7,6],[0,7,3],[0,4,7],[1,6,5],[1,2,6]];
                const bvh = bvhBuffersFromMesh(positions, indices);
                const mesh = { bvh, bounds: meshBounds(bvh) };
                const w = 32, h = 24;
                const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
                const device = await requestDevice(canvas, { backend: "webgpu" });
                const session = makeRtSession(device, { mesh, w, h, spp: 2, sky: "sceneCapture" });
                const view = { w, h, ...orbitEye({ yaw: 0.6, pitch: 0.35, dist: 4, center: mesh.bounds.center }), fovDeg: 45 };
                for (let i = 0; i < 6; i++) await session.renderFrame(view, { offscreen: true, read: true });
                const accum = new Float32Array(await device.read(session.accumBuf));
                let nan = 0, min = Infinity, max = -Infinity, sum = 0;
                for (const v of accum) { if (!isFinite(v)) nan++; if (v < min) min = v; if (v > max) max = v; sum += v; }
                out.cubeSceneCapture = { nan, min, max, mean: sum / accum.length, frameCount: session.frameCount() };
                session.destroy();
            }

            // ---- 4f. RTX ROUND 14 (task #99) -- WHAT THIS FILE'S OWN HEADER HAS SAID SINCE ROUND 3 IT DOES
            // NOT CLAIM: that accumBuf after K accumulated frames agrees with a single larger-spp dispatch of
            // the same total sample budget. Two separate proofs, not one -- a BIT-EXACT one (does the Welford
            // recurrence, fed REAL rendered frames rather than section 2's own fabricated numbers, actually
            // equal their arithmetic mean?) and a STATISTICAL one (does K frames of spp=S converge to the SAME
            // expected value as one frame of spp=K*S, within measured noise -- the genuinely different random
            // sequence this file's own header names as the reason bit-exactness across CONFIGURATIONS cannot
            // be claimed, only agreement in expectation). ----
            {
                const positions = [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]];
                const indices = [[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,5,4],[0,1,5],[3,6,2],[3,7,6],[0,7,3],[0,4,7],[1,6,5],[1,2,6]];
                const bvh = bvhBuffersFromMesh(positions, indices);
                const mesh = { bvh, bounds: meshBounds(bvh) };
                const w = 16, h = 12;
                const view = { w, h, ...orbitEye({ yaw: 0.6, pitch: 0.35, dist: 4, center: mesh.bounds.center }), fovDeg: 45 };
                const K = 6, S = 2;

                // -- 4f-i. BIT-EXACT: accumBuf after K real renderFrame() calls equals the hand-computed
                // arithmetic mean of EACH call's own raw per-frame output (session.outBuf -- exposed on the
                // session's own return object, read back immediately after each call, before the next call
                // overwrites it) -- REAL rendered frames, not fabricated numbers (section 2's own scope). This
                // is the first time anything in this file cross-checks the FINAL accumulated result against
                // the INDIVIDUAL frames that actually went into it. ----
                const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
                const device = await requestDevice(canvas, { backend: "webgpu" });
                const session = makeRtSession(device, { mesh, w, h, spp: S });
                const raws = [];
                for (let i = 0; i < K; i++) {
                    await session.renderFrame(view, { offscreen: true, read: true });
                    raws.push(new Float32Array(await device.read(session.outBuf)));
                }
                const accum = new Float32Array(await device.read(session.accumBuf));
                const handMean = new Float32Array(accum.length);
                for (let i = 0; i < accum.length; i++) { let s = 0; for (let k = 0; k < K; k++) s += raws[k][i]; handMean[i] = s / K; }
                let maxDelta = 0;
                for (let i = 0; i < accum.length; i++) maxDelta = Math.max(maxDelta, Math.abs(accum[i] - handMean[i]));
                out.accumBitExact = { maxDelta, n: accum.length, K, S, frameCount: session.frameCount() };
                session.destroy();

                // -- 4f-ii. STATISTICAL: reuses the SAME K raw per-frame captures above (no extra dispatches) as
                // K independent trials of the spp=S estimator (seeds 1..K, one per accumulated frame -- session
                // frame count IS the seed, physics/render/rtPipeline.mjs's own pipelineUniforms(seed:frame)), and
                // compares their own mean/relSd against M FRESH, independently-seeded spp=(K*S) trials from a
                // second session -- offset by K throwaway frames first (seeds K+1..K+M) so neither side's own
                // measured noise can be an artifact of a shared random tape, the same discipline physics/render/
                // rtPipeline-selfcheck.mjs's own statistical gates already hold to for a DIFFERENT pair of
                // implementations; here both sides are the IDENTICAL GPU kernel at two different spp budgets, so
                // the offset is about measurement rigor, not a correctness-hiding risk this file has ever found. ----
                const M = 8;
                const meanOfPixels = (arr) => { let s = 0; for (const v of arr) s += v; return s / arr.length; };
                const accVals = raws.map(meanOfPixels);
                const canvas2 = document.createElement("canvas"); canvas2.width = w; canvas2.height = h;
                const device2 = await requestDevice(canvas2, { backend: "webgpu" });
                const session2 = makeRtSession(device2, { mesh, w, h, spp: K * S });
                for (let i = 0; i < K; i++) await session2.renderFrame(view, { offscreen: true, read: true });
                const largeVals = [];
                for (let t = 0; t < M; t++) {
                    await session2.renderFrame(view, { offscreen: true, read: true });
                    largeVals.push(meanOfPixels(new Float32Array(await device2.read(session2.outBuf))));
                }
                session2.destroy();
                out.convergence = { accVals, largeVals, K, S, M };
            }

            // ---- 5. the real GLB -- fetch, parse, BVH, render; informal sanity only (no radiance oracle for a mesh) ----
            {
                const res = await fetch("/vendor/kenney-city/models/pavement.glb");
                const buf = await res.arrayBuffer();
                const mesh = await loadMeshBvh(buf);
                const w = 48, h = 32;
                const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
                const device = await requestDevice(canvas, { backend: "webgpu" });
                const session = makeRtSession(device, { mesh, w, h, spp: 2 });
                const view0 = orbitEye({ yaw: 0.7, pitch: 0.5, dist: mesh.bounds.radius * 3.2 + 0.5, center: mesh.bounds.center });
                const view = { w, h, ...view0, fovDeg: 45 };
                for (let i = 0; i < 8; i++) await session.renderFrame(view, { offscreen: true, read: true });
                const accum = new Float32Array(await device.read(session.accumBuf));
                let nan = 0, min = Infinity, max = -Infinity;
                const uniq = new Set();
                for (const v of accum) { if (!isFinite(v)) nan++; if (v < min) min = v; if (v > max) max = v; uniq.add(Math.round(v * 1000)); }
                out.mesh = { byteLength: buf.byteLength, triangleCount: mesh.triangleCount, vertexCount: mesh.vertexCount,
                             bounds: mesh.bounds, nan, min, max, distinct: uniq.size, frameCount: session.frameCount() };
                session.destroy();
            }

            // ---- 5b. RTX round 5 -- the procedurally generated scene, same shape as section 5's real GLB ----
            {
                const mesh = loadCityBvh();
                const w = 48, h = 32;
                const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
                const device = await requestDevice(canvas, { backend: "webgpu" });
                const session = makeRtSession(device, { mesh, w, h, spp: 2 });
                const view0 = orbitEye({ yaw: 0.7, pitch: 0.5, dist: mesh.bounds.radius * 3.2 + 0.5, center: mesh.bounds.center });
                const view = { w, h, ...view0, fovDeg: 45 };
                for (let i = 0; i < 8; i++) await session.renderFrame(view, { offscreen: true, read: true });
                const accum = new Float32Array(await device.read(session.accumBuf));
                let nan = 0, min = Infinity, max = -Infinity, sum = 0;
                const uniq = new Set();
                for (const v of accum) { if (!isFinite(v)) nan++; if (v < min) min = v; if (v > max) max = v; sum += v; uniq.add(Math.round(v * 1000)); }
                out.city = { triangleCount: mesh.triangleCount, vertexCount: mesh.vertexCount, bounds: mesh.bounds,
                             nan, min, max, mean: sum / accum.length, distinct: uniq.size, frameCount: session.frameCount() };
                session.destroy();
            }

            // ---- 5c. RTX ROUND 15 -- THE SAME REAL CITY SCENE, THROUGH vertexColors:true -- THE FIRST PRODUCTION
            // CALLER of rtPipeline.mjs's own vertexColors option, proving the FULL real path (loadCityBvh's own
            // cols->colors hand-off, bvhBuffersFromTriSoup's own vertColors packing, makeRtSession's own WGSL
            // switch and real buffer bind) actually executes end to end against the REAL production data, not a
            // fabricated fixture -- section 1f's own GPU-free claim (the right JS options, the right bind call)
            // is correct in isolation, this proves it reaches a real device and changes the real picture. ----
            {
                const mesh = loadCityBvh();
                const w = 48, h = 32;
                const view0 = orbitEye({ yaw: 0.7, pitch: 0.5, dist: mesh.bounds.radius * 3.2 + 0.5, center: mesh.bounds.center });
                const view = { w, h, ...view0, fovDeg: 45 };
                const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
                const device = await requestDevice(canvas, { backend: "webgpu" });
                const session = makeRtSession(device, { mesh, w, h, spp: 2, vertexColors: true });
                for (let i = 0; i < 8; i++) await session.renderFrame(view, { offscreen: true, read: true });
                const accum = new Float32Array(await device.read(session.accumBuf));
                let nan = 0, min = Infinity, max = -Infinity, sum = 0;
                for (const v of accum) { if (!isFinite(v)) nan++; if (v < min) min = v; if (v > max) max = v; sum += v; }
                out.cityVertexColors = { nan, min, max, mean: sum / accum.length, frameCount: session.frameCount() };
                session.destroy();
            }
            return out;
        }`,
    });
    if (!r.ok) throw new Error("runInEngineOrigin failed: " + r.reason + (r.pageErrors && r.pageErrors.length ? " | " + r.pageErrors.slice(0, 3).join(" | ") : ""));
    const { present, cube, cubeMicrofacet, cubeEnvMap, cubeDirectBsdf, cubeDirectNee, cubeDirectMis, cubeSceneCapture, accumBitExact, convergence, mesh, city, cityVertexColors } = r.result;

    console.log("\n3. presentWgsl -- A DISTINCT-PER-PIXEL FRAME, PIXEL FOR PIXEL");
    say(`4x2, values include 1.5 and -0.3 to exercise the clamp`);
    ok("!! every pixel matches Math.round(clamp(accum.r,0,1)*255), g=255 (1.5 clamped), b=0 (-0.3 clamped), a=255",
        present.px.length === present.expected.length && present.px.every((v, i) => v === present.expected[i]),
        JSON.stringify(present.px) + " vs " + JSON.stringify(present.expected));

    console.log("\n4. A FABRICATED CUBE THROUGH makeRtSession -- device.compute()/device.pipeline() BOUND BY NAME");
    say(`bounds radius ${cube.boundsRadius.toFixed(4)} (expect sqrt(3)=${Math.sqrt(3).toFixed(4)}), ${cube.frameCount} frames accumulated`);
    say(`accumBuf: ${cube.nan} NaN/Inf, range [${cube.min.toFixed(4)}, ${cube.max.toFixed(4)}]`);
    ok("!! meshBounds() reads the BVH root's own box -- a unit cube's half-diagonal is exactly sqrt(3)",
        Math.abs(cube.boundsRadius - Math.sqrt(3)) < 1e-6, `${cube.boundsRadius} vs ${Math.sqrt(3)}`);
    ok("!! rtPipeline.mjs's bvh compute kernel, the accumulate kernel and the present kernel all bound BY NAME on one device -- no NaN, real range",
        cube.nan === 0 && cube.max > cube.min && cube.max <= 1.0 && cube.min >= 0.0,
        "this is the first time this WGSL has gone through gfx/device.js's classify()/bindByName rather than an index-based harness");

    console.log("\n4b. RTX ROUND 10 -- THE SAME FABRICATED CUBE, THROUGH material:\"microfacet\" (msComp:true) -- THE FIRST PRODUCTION CALLER");
    say(`accumBuf: ${cubeMicrofacet.nan} NaN/Inf, range [${cubeMicrofacet.min.toFixed(4)}, ${cubeMicrofacet.max.toFixed(4)}], ${cubeMicrofacet.frameCount} frames`);
    REPORT_ROWS.push(["cube, microfacet+msComp", "unit cube", `${cubeMicrofacet.frameCount} frames`,
        `range [${cubeMicrofacet.min.toFixed(4)}, ${cubeMicrofacet.max.toFixed(4)}]`]);
    ok("!! the SAME cube, the msE buffer built and bound BY NAME, roughness/ior/msTable packed each frame, through a REAL WebGPU device -- no NaN, real range",
        cubeMicrofacet.nan === 0 && cubeMicrofacet.max > cubeMicrofacet.min && cubeMicrofacet.max <= 1.0 && cubeMicrofacet.min >= 0.0,
        "proves the WIRING this round adds -- not just the math physics/render/rtPipeline-selfcheck.mjs's own section 14 already " +
        "proved in isolation -- actually executes end to end on a real device: this session's own msE storage buffer, and the " +
        "roughness/ior/msTable this session packs into the bvh uniform slot every frame");
    ok("!! and reads genuinely DIFFERENT from the plain Lambertian render of the IDENTICAL cube and camera -- material " +
        "selection actually changes the picture, not just \"doesn't crash\"",
        Math.abs(cubeMicrofacet.max - cube.max) > 1e-4 || Math.abs(cubeMicrofacet.min - cube.min) > 1e-4,
        `microfacet range [${cubeMicrofacet.min.toFixed(4)}, ${cubeMicrofacet.max.toFixed(4)}] vs lambertian range ` +
        `[${cube.min.toFixed(4)}, ${cube.max.toFixed(4)}]`);

    console.log("\n4c. RTX ROUND 11 -- THE SAME FABRICATED CUBE, THROUGH sky:\"envMap\" -- THE FIRST PRODUCTION CALLER OF envMap");
    say(`accumBuf: ${cubeEnvMap.nan} NaN/Inf, range [${cubeEnvMap.min.toFixed(4)}, ${cubeEnvMap.max.toFixed(4)}], ${cubeEnvMap.frameCount} frames`);
    REPORT_ROWS.push(["cube, envMap", "unit cube", `${cubeEnvMap.frameCount} frames`,
        `range [${cubeEnvMap.min.toFixed(4)}, ${cubeEnvMap.max.toFixed(4)}]`]);
    ok("!! the SAME cube, the baked atlas uploaded as a real rgba16float texture and bound BY NAME, through a REAL WebGPU device -- no NaN, real range",
        cubeEnvMap.nan === 0 && cubeEnvMap.max > cubeEnvMap.min && cubeEnvMap.min >= 0.0,
        "proves the WIRING this round adds -- not just the math physics/render/rtPipeline-selfcheck.mjs's own section 12 already " +
        "proved in isolation -- actually executes end to end on a real device: the atlas this session bakes, half-float-packs, " +
        "and binds as \"tAtlas\". No upper bound asserted here on purpose -- envRadianceOf's own sun highlight peaks near 6.5, " +
        "well above the plain gradient's own [0.3,1.0] range, and a sky ray reading that value unclamped is the EXPECTED result, " +
        "not a defect (presentWgsl's own clamp only applies at the display step, never to accumBuf itself)");
    ok("!! and reads genuinely DIFFERENT from the plain gradient-sky render of the IDENTICAL cube and camera -- envMap selection " +
        "actually changes the picture, not just \"doesn't crash\"",
        Math.abs(cubeEnvMap.max - cube.max) > 1e-4 || Math.abs(cubeEnvMap.min - cube.min) > 1e-4,
        `envMap range [${cubeEnvMap.min.toFixed(4)}, ${cubeEnvMap.max.toFixed(4)}] vs gradient range ` +
        `[${cube.min.toFixed(4)}, ${cube.max.toFixed(4)}]`);

    console.log("\n4d. RTX ROUND 12 -- THE SAME FABRICATED CUBE, THROUGH direct:\"nee\" AND direct:\"mis\" -- THE FIRST PRODUCTION CALLER OF EITHER, THE FIRST REAL LIGHT");
    say(`bsdf (fresh, no light): mean=${cubeDirectBsdf.mean.toFixed(6)} range [${cubeDirectBsdf.min.toFixed(4)}, ${cubeDirectBsdf.max.toFixed(4)}]`);
    say(`nee:  accumBuf ${cubeDirectNee.nan} NaN/Inf, mean=${cubeDirectNee.mean.toFixed(6)} range [${cubeDirectNee.min.toFixed(4)}, ${cubeDirectNee.max.toFixed(4)}]`);
    say(`mis:  accumBuf ${cubeDirectMis.nan} NaN/Inf, mean=${cubeDirectMis.mean.toFixed(6)} range [${cubeDirectMis.min.toFixed(4)}, ${cubeDirectMis.max.toFixed(4)}]`);
    REPORT_ROWS.push(["cube, direct:nee", "unit cube + light", "6 frames", `mean ${cubeDirectNee.mean.toFixed(6)} vs bsdf ${cubeDirectBsdf.mean.toFixed(6)}`]);
    REPORT_ROWS.push(["cube, direct:mis", "unit cube + light", "6 frames", `mean ${cubeDirectMis.mean.toFixed(6)} vs bsdf ${cubeDirectBsdf.mean.toFixed(6)}`]);
    ok("!! direct:\"nee\" -- the light this round bakes into sbt, packed through pipelineUniforms and sampled via rtPipeline.mjs's own NEE loop, through a REAL WebGPU device -- no NaN, real range",
        cubeDirectNee.nan === 0 && cubeDirectNee.max > cubeDirectNee.min && cubeDirectNee.min >= 0.0,
        "proves the WIRING this round adds -- not just the math physics/render/rtPipeline-selfcheck.mjs's own section 13 " +
        "already proved in isolation -- actually executes end to end: a real sbtRecord light, scaled against this " +
        "cube's own mesh.bounds, built and bound the first time any production caller has ever passed one");
    ok("!! direct:\"mis\" -- the same light, sampled via rtPipeline.mjs's own MIS weighting instead -- no NaN, real range",
        cubeDirectMis.nan === 0 && cubeDirectMis.max > cubeDirectMis.min && cubeDirectMis.min >= 0.0,
        "the same proof as direct:\"nee\" just above, for the MIS-weighted technique specifically, through the SAME real light");
    // *** min/max ALONE IS THE WRONG METRIC HERE -- FOUND BY ACTUALLY RUNNING IT, NOT ASSUMED FROM ROUND 10/11's
    // OWN "genuinely different" PRECEDENT. *** Every one of bsdf/nee/mis pins the SAME two extreme pixels (a
    // sky ray and a Fresnel highlight), so min/max alone reads byte-for-byte IDENTICAL across all three despite
    // the light genuinely lighting the cube -- a real, once-red finding during this round's own gate-writing,
    // not a hypothetical. `mean` is the sensitive signal: nee and mis (both unbiased estimators of the SAME lit
    // scene) must agree with EACH OTHER far more closely than either agrees with the unlit bsdf-only baseline --
    // the actual signature a real, working light gives, not just "some number changed by some amount".
    const meanGap = (a, b) => Math.abs(a - b) / ((a + b) / 2);
    const neeVsBsdf = meanGap(cubeDirectNee.mean, cubeDirectBsdf.mean), neeVsMis = meanGap(cubeDirectNee.mean, cubeDirectMis.mean);
    say(`mean gaps: nee-vs-bsdf ${(neeVsBsdf * 100).toFixed(3)}%, nee-vs-mis ${(neeVsMis * 100).toFixed(3)}% (expect nee-vs-mis << nee-vs-bsdf)`);
    // *** THIS BAND IS A MEASURED VALUE, NOT A LOOSE SANITY FLOOR -- an adversarial review found the first draft's
    // `neeVsBsdf > 1e-4` floor would still pass a light wired 10-50x too dim or too bright (the real gap is 0.77%,
    // 77x that floor), and its `< 0.25` ratio had real margin against the measured ~0.0036 but was not itself tight
    // enough to positively rule out a partially-contaminated MIS implementation. Both are narrowed here to bands
    // that still comfortably contain the real, reproducible (fully deterministic -- no true randomness, seeded by
    // frame count alone) measured values with headroom, not to the measured values exactly. ***
    ok("!! direct:\"nee\" and direct:\"mis\" agree with EACH OTHER (both lit by the SAME light) far more closely than either agrees with the fresh bsdf-only, NO-LIGHT baseline",
        neeVsMis < neeVsBsdf * 0.1 && neeVsBsdf > 0.002 && neeVsBsdf < 0.05,
        `nee mean ${cubeDirectNee.mean.toFixed(6)}, mis mean ${cubeDirectMis.mean.toFixed(6)}, bsdf-only mean ${cubeDirectBsdf.mean.toFixed(6)} -- ` +
        "the light this round adds is actually visible and actually lighting the cube (within a band around the real, " +
        "measured ~0.77% shift -- not merely 'some number changed'), not built and silently discarded, and not off by " +
        "an order of magnitude in either direction");
    ok("!! direct:\"mis\" is a GENUINELY DISTINCT per-pixel render from direct:\"nee\", not merely a close MEAN -- " +
        "a position-weighted checksum over the whole accumulation buffer, not just its average",
        cubeDirectNee.checksum !== cubeDirectMis.checksum,
        `nee checksum ${cubeDirectNee.checksum}, mis checksum ${cubeDirectMis.checksum} -- identical checksums here ` +
        "would mean direct:\"mis\" produced byte-identical output to direct:\"nee\", the exact signature of a copy-paste " +
        "bug where MIS silently reuses NEE's own code path rather than its own weighting, which the mean-gap check " +
        "above cannot tell apart from a real, independently-computed MIS render (found by an adversarial review)");

    console.log("\n4e. RTX ROUND 13 -- THE SAME FABRICATED CUBE, THROUGH sky:\"sceneCapture\" -- THE FIRST PRODUCTION CALLER");
    say(`accumBuf: ${cubeSceneCapture.nan} NaN/Inf, range [${cubeSceneCapture.min.toFixed(4)}, ${cubeSceneCapture.max.toFixed(4)}], ${cubeSceneCapture.frameCount} frames`);
    REPORT_ROWS.push(["cube, sceneCapture", "unit cube", `${cubeSceneCapture.frameCount} frames`,
        `range [${cubeSceneCapture.min.toFixed(4)}, ${cubeSceneCapture.max.toFixed(4)}]`]);
    ok("!! the SAME cube, the atlas baked from makeSceneRadianceOf's own real ray-BVH trace and uploaded as a real " +
        "rgba16float texture bound BY NAME, through a REAL WebGPU device -- no NaN, real range",
        cubeSceneCapture.nan === 0 && cubeSceneCapture.max > cubeSceneCapture.min && cubeSceneCapture.min >= 0.0,
        "proves the WIRING this round adds -- not just section 1d's own GPU-free claim that makeSceneRadianceOf() " +
        "itself is correct in isolation -- actually executes end to end: a real BVH trace against this cube's own " +
        "mesh, baked into a real atlas and bound the first time any production caller has ever passed a scene-derived radianceOf");
    ok("!! and reads genuinely DIFFERENT from the sky:\"envMap\" render of the IDENTICAL cube and camera -- the scene-captured " +
        "atlas's own CONTENT actually differs from the analytic one, not just \"doesn't crash\"",
        Math.abs(cubeSceneCapture.max - cubeEnvMap.max) > 1e-4 || Math.abs(cubeSceneCapture.min - cubeEnvMap.min) > 1e-4,
        `sceneCapture range [${cubeSceneCapture.min.toFixed(4)}, ${cubeSceneCapture.max.toFixed(4)}] vs envMap range ` +
        `[${cubeEnvMap.min.toFixed(4)}, ${cubeEnvMap.max.toFixed(4)}] -- both generate BYTE-IDENTICAL WGSL (section 1d's own ` +
        "claim), so this is the one check proving the JS-level choice of radianceOf function actually reaches the bound texture");
    // *** MEAN, NOT JUST MIN/MAX -- an adversarial review pointed at this file's OWN section 4d history (a few
    // sections above): min/max there read byte-IDENTICAL across a real, working change because both extremes
    // were pinned by unrelated pixels, and mean was the metric that actually caught it. The min/max check above
    // IS already sabotage-confirmed against a total-substitution bug (this round's own sabotage log), but a
    // SUBTLE partial difference confined to a few texels could in principle move mean while leaving the two
    // extreme pixels untouched -- so both metrics are checked, not one instead of the other. ***
    say(`means: sceneCapture ${cubeSceneCapture.mean.toFixed(6)}, envMap ${cubeEnvMap.mean.toFixed(6)}`);
    ok("!! the two renders' own MEANS differ too, not just their extremes",
        Math.abs(cubeSceneCapture.mean - cubeEnvMap.mean) > 1e-4,
        `sceneCapture mean ${cubeSceneCapture.mean.toFixed(6)} vs envMap mean ${cubeEnvMap.mean.toFixed(6)} -- a difference confined ` +
        "entirely to the two extreme pixels min/max alone track would leave the bulk of the atlas's own content unverified");

    console.log("\n4f. RTX ROUND 14 (task #99) -- accumBuf's BIT-EXACTNESS AGAINST REAL PER-FRAME RENDERS, AND K-FRAMES-vs-ONE-LARGER-SPP WITHIN MEASURED NOISE");
    say(`bit-exact: K=${accumBitExact.K} frames of spp=${accumBitExact.S}, ${accumBitExact.n} pixels, max|accumBuf - handMean|=${accumBitExact.maxDelta.toExponential(3)}`);
    ok("!! accumBuf after K REAL renderFrame() calls equals the hand-computed arithmetic mean of each call's own " +
        "RAW per-frame output, to floating-point precision -- not fabricated input (section 2's own scope), real " +
        "rendered frames read back between calls",
        accumBitExact.maxDelta < 1e-4,
        `max delta ${accumBitExact.maxDelta.toExponential(3)} across ${accumBitExact.n} pixels -- this is the FIRST check in this file that ` +
        "cross-checks the FINAL accumulated result against the INDIVIDUAL frames that actually went into it, closing the gap between " +
        "section 2's own isolated-arithmetic proof (fabricated numbers) and sections 4/4b/etc.'s own sanity checks (real renders, but only " +
        "checked for NaN/range, never against their own inputs)");

    {
        const meanOf = (v) => v.reduce((a, b) => a + b, 0) / v.length;
        const sdOf = (v, m) => Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1));
        const { accVals, largeVals, K, S, M } = convergence;
        const accM = meanOf(accVals), accRelSd = sdOf(accVals, accM) / accM;
        const largeM = meanOf(largeVals), largeRelSd = sdOf(largeVals, largeM) / largeM;
        const ratio = largeM / accM;
        const bound = 3 * Math.sqrt((accRelSd / Math.sqrt(K)) ** 2 + (largeRelSd / Math.sqrt(M)) ** 2);
        say(`K=${K} frames of spp=${S} (${K} seeded trials): mean ${accM.toFixed(6)} (relSd ${(accRelSd * 100).toFixed(2)}%); ` +
            `1 frame of spp=${K * S} (${M} seeded trials): mean ${largeM.toFixed(6)} (relSd ${(largeRelSd * 100).toFixed(2)}%); ` +
            `ratio ${ratio.toFixed(6)}, bound ${bound.toFixed(6)}`);
        REPORT_ROWS.push(["accumulate convergence (task #99)", `${K}x spp${S} vs 1x spp${K * S}`, `${K}+${M} seeded trials`,
            `|ratio-1|=${Math.abs(ratio - 1).toExponential(2)}, bound=${bound.toExponential(2)}`]);
        ok("!! both sides show REAL per-seed noise -- neither relSd is near zero, which would mean a seed never reached the render",
            accRelSd > 1e-3 && largeRelSd > 1e-3, `accRelSd ${(accRelSd * 100).toFixed(3)}%, largeRelSd ${(largeRelSd * 100).toFixed(3)}%`);
        ok("!! *** K ACCUMULATED FRAMES OF spp=S AGREE WITH ONE FRAME OF spp=K*S, WITHIN 3 MEASURED STANDARD ERRORS -- " +
            "THE STATISTICAL CLAIM THIS FILE'S OWN HEADER HAS SAID SINCE ROUND 3 IT DOES NOT MAKE ***",
            Math.abs(ratio - 1) < bound,
            `accumulated-frames mean ${accM.toFixed(6)} vs single-larger-dispatch mean ${largeM.toFixed(6)} -- the two configurations walk ` +
            "genuinely DIFFERENT random sequences (rngState is seeded once per DISPATCH, so K frames of spp=1 evolve differently than one " +
            "frame of spp=K, exactly as this file's own header states) and are never claimed bit-exact against each other -- what IS claimed, " +
            "and what this proves, is that both are UNBIASED estimators of the SAME expected radiance, agreeing within their own measured noise");
    }

    console.log("\n5. A REAL GLB, THROUGH THE FULL loadMeshBvh -> makeRtSession -> device.frame PATH");
    say(`vendor/kenney-city/models/pavement.glb: ${mesh.byteLength} bytes -> ${mesh.triangleCount} triangles, ${mesh.vertexCount} vertices`);
    say(`bounds ${JSON.stringify(mesh.bounds)}`);
    say(`accumBuf after ${mesh.frameCount} frames: ${mesh.nan} NaN/Inf, range [${mesh.min.toFixed(4)}, ${mesh.max.toFixed(4)}], ${mesh.distinct} distinct (of 1000ths) values`);
    REPORT_ROWS.push(["pavement.glb", `${mesh.triangleCount} tris`, `${mesh.frameCount} frames`, `${mesh.distinct} distinct, range [${mesh.min.toFixed(3)}, ${mesh.max.toFixed(3)}]`]);
    ok("the parsed mesh is the file this gate actually asked for -- 20 triangles, 24 vertices, a thin tile",
        mesh.triangleCount === 20 && mesh.vertexCount === 24,
        "a wrong count here would mean colliderFromGLB.mjs's own bridge (GLBParser.parse -> meshTriples -> bvhBuffersFromMesh) stopped matching what loadMeshBvh calls");
    ok("!! real mesh, real camera, real accumulation: no NaN/Inf and genuine spatial variance -- not a blank or broken frame",
        mesh.nan === 0 && mesh.distinct > 20 && mesh.max > mesh.min,
        "informal by design -- there is no CPU radiance oracle for a triangle mesh (rtPipeline.mjs's own header); " +
        "what IS checked is that the whole present path produces a real, varied picture rather than sky, black, or NaN");

    console.log("\n5b. RTX ROUND 5 -- THE PROCEDURALLY GENERATED SCENE, THROUGH THE FULL loadCityBvh -> makeRtSession -> device.frame PATH");
    say(`world/cityChunkScene.mjs's citySceneMesh(): ${city.triangleCount} triangles, ${city.vertexCount} vertices`);
    say(`bounds ${JSON.stringify(city.bounds)}`);
    say(`accumBuf after ${city.frameCount} frames: ${city.nan} NaN/Inf, range [${city.min.toFixed(4)}, ${city.max.toFixed(4)}], ${city.distinct} distinct (of 1000ths) values`);
    REPORT_ROWS.push(["city scene", `${city.triangleCount} tris`, `${city.frameCount} frames`, `${city.distinct} distinct, range [${city.min.toFixed(3)}, ${city.max.toFixed(3)}]`]);
    ok("the generated scene is the fixture this gate actually asked for -- world/cityChunkScene.mjs's own DEFAULT_BUILDING, 120 triangles, 360 vertices",
        city.triangleCount === 120 && city.vertexCount === 360,
        "a wrong count here would mean CityGen.js, chunkMesherCore.js, or bvhBuffersFromTriSoup() stopped matching what world/cityChunkScene.mjs's own front door already measures (node world/cityChunkScene.mjs)");
    ok("!! real procedurally generated mesh, real camera, real accumulation: no NaN/Inf and genuine spatial variance",
        city.nan === 0 && city.distinct > 20 && city.max > city.min,
        "same informal-by-design reasoning as section 5's real GLB -- no CPU radiance oracle for a triangle mesh, so what's checked is a real, varied picture rather than sky, black, or NaN");

    console.log("\n5c. RTX ROUND 15 -- THE SAME CITY SCENE, THROUGH vertexColors:true -- THE FIRST PRODUCTION CALLER OF rtPipeline.mjs's OWN vertexColors OPTION");
    say(`accumBuf after ${cityVertexColors.frameCount} frames: ${cityVertexColors.nan} NaN/Inf, range [${cityVertexColors.min.toFixed(4)}, ${cityVertexColors.max.toFixed(4)}], mean ${cityVertexColors.mean.toFixed(6)}`);
    REPORT_ROWS.push(["city scene, vertexColors", `${city.triangleCount} tris`, `${cityVertexColors.frameCount} frames`,
        `mean ${cityVertexColors.mean.toFixed(6)} vs flat-albedo ${city.mean.toFixed(6)}`]);
    ok("!! the SAME real city scene, world/cityChunkScene.mjs's own citySceneMesh() cols hand-off through loadCityBvh's " +
        "new colors wiring, bvhBuffersFromTriSoup's own vertColors packing, and makeRtSession's new vertexColors switch, " +
        "through a REAL WebGPU device -- no NaN, real range",
        cityVertexColors.nan === 0 && cityVertexColors.max > cityVertexColors.min && cityVertexColors.min >= 0.0,
        "proves the WIRING this round adds -- not just section 1f's own GPU-free claim that the right WGSL is generated " +
        "and the right buffer bound by name -- actually executes end to end: real per-vertex color data, computed by " +
        "citySceneMesh() itself, reaching a real bound storage buffer and changing what a real device renders");
    // *** MEAN, NOT JUST MIN/MAX -- the same lesson section 4d/4e's own history in this file already paid for: min/max
    // alone can pin on unrelated pixels while a real, working change moves the bulk of the picture. out.city was
    // extended with its own `mean` field specifically so this comparison has a metric that isn't extreme-pixel-only. ***
    ok("!! and reads genuinely DIFFERENT from the flat-albedo render of the IDENTICAL scene and camera (section 5b) -- " +
        "vertex colors actually changes the picture, not just \"doesn't crash\", via BOTH range and mean",
        (Math.abs(cityVertexColors.max - city.max) > 1e-4 || Math.abs(cityVertexColors.min - city.min) > 1e-4) &&
        Math.abs(cityVertexColors.mean - city.mean) > 1e-4,
        `vertexColors range [${cityVertexColors.min.toFixed(4)}, ${cityVertexColors.max.toFixed(4)}] mean ${cityVertexColors.mean.toFixed(6)} ` +
        `vs flat-albedo range [${city.min.toFixed(4)}, ${city.max.toFixed(4)}] mean ${city.mean.toFixed(6)}`);

    console.log("\n6. THE LIVE PAGE ITSELF");
    const page = read("rtx-viewer.html");
    ok("carries demo:title/demo:desc/demo:category and imports render/rtViewer.mjs",
        /demo:title/.test(page) && /demo:desc/.test(page) && /demo:category/.test(page) && /render\/rtViewer\.mjs/.test(page));
    ok("presents to the canvas normally (no offscreen at requestDevice or per-frame) -- this gate's own device.frame " +
       "calls all pass {offscreen:true,read:true} explicitly, which the live page does not",
        /requestDevice\(/.test(page) && !/offscreen:\s*true/.test(page));
    ok("the front door links it", /href="\/rtx-viewer\.html"/.test(read("server.html")));
    ok("!! RTX round 5 -- the page imports loadCityBvh and reads the scene toggle from the URL, not just loadMeshBvh",
        /loadCityBvh/.test(page) && /scene.*==.*["']city["']|["']city["'].*scene/.test(page),
        "a page that only ever loaded the hardcoded pavement tile would still pass every check above this one");
    ok("!! RTX round 10 -- the page reads a `material` URL param and passes it into makeRtSession, not just the hardcoded default",
        /material.*==.*["']microfacet["']|["']microfacet["'].*material/.test(page) &&
        /material\s*:\s*MATERIAL/.test(page),
        "a page that never read the param would still call makeRtSession successfully (material defaults to " +
        "\"lambertian\") and every check above this one would still pass -- this is the one assertion that would " +
        "catch a demo wired to the JS module but never actually reachable from the page's own toggle");
    ok("!! RTX round 11 -- the page reads a `sky` URL param and passes it into makeRtSession, not just the hardcoded gradient default",
        /SKY_VALUES/.test(page) && /sky\s*:\s*SKY/.test(page),
        "a page that never read the param would still call makeRtSession successfully (sky defaults to " +
        "\"gradient\") and every check above this one would still pass -- the same shape of gap round 10's own " +
        "material check exists to catch, extended to the third toggle -- this regex was updated when round 13 " +
        "changed `sky`'s own reading code from a binary === check to a three-value array (see round 13's own " +
        "check just below), so it now matches SKY_VALUES the same way round 12's own DIRECT_VALUES check already does");
    ok("!! RTX round 12 -- the page reads a `direct` URL param and passes it into makeRtSession, not just the hardcoded bsdf default",
        /DIRECT_VALUES/.test(page) && /direct\s*:\s*DIRECT/.test(page),
        "a page that never read the param would still call makeRtSession successfully (direct defaults to " +
        "\"bsdf\") and every check above this one would still pass -- the same shape of gap round 10/11's own " +
        "checks exist to catch, extended to the fourth toggle");
    ok("!! RTX round 13 -- \"sceneCapture\" is a real, reachable THIRD value of the page's own `sky` toggle, not just an " +
        "option makeRtSession accepts with no way to reach it from the page",
        /SKY_VALUES\s*=\s*\[[^\]]*["']sceneCapture["'][^\]]*\]/.test(page),
        "a page that only ever cycled between \"gradient\" and \"envMap\" internally would still pass every check above " +
        "this one (sky defaults to \"gradient\", and the round-11 check above only proves SOME value threads through) -- " +
        "this is the one assertion that would catch sceneCapture being added to makeRtSession/render/rtViewer.mjs but " +
        "never actually wired into the live page's own toggle cycle. Anchored to the ACTUAL SKY_VALUES array literal " +
        "(not \"the two substrings appear somewhere in the page\", which an adversarial review found would pass even if " +
        "\"sceneCapture\" only ever appeared in an unused label string, never in the array the toggle logic actually reads)");
    ok("!! RTX round 15 -- the page reads a `vertexColors` URL param and passes it into makeRtSession, not just the hardcoded false default",
        /VERTEX_COLORS/.test(page) && /vertexColors\s*:\s*VERTEX_COLORS/.test(page),
        "a page that never read the param would still call makeRtSession successfully (vertexColors defaults to " +
        "false) and every check above this one would still pass -- the same shape of gap round 10/11/12's own " +
        "checks exist to catch, extended to the fifth toggle");
    ok("!! RTX round 16 -- the page imports dragOrbit/dollyOrbit and its own pointermove/wheel handlers actually " +
        "CALL them, rather than carrying a second, un-gated copy of the same arithmetic inline",
        (() => {
            // Order-independent on purpose: an earlier draft anchored dragOrbit before dollyOrbit inside the
            // import braces, which would go spuriously red on a harmless import-list reorder -- an adversarial
            // review flagged it as a robustness nitpick, closed here rather than left standing.
            const m = /import\s*\{([^}]*)\}\s*from\s*"\/render\/rtViewer\.mjs"/.exec(page);
            return !!m && /\bdragOrbit\b/.test(m[1]) && /\bdollyOrbit\b/.test(m[1]);
        })() &&
        /pointerdown[\s\S]{0,400}pointermove[\s\S]{0,300}dragOrbit\(/.test(page) &&
        /addEventListener\("wheel"[\s\S]{0,300}dollyOrbit\(/.test(page),
        "matches render/orbitCamera-selfcheck.mjs's own established section-3 precedent for orrery-gpu.html -- a page " +
        "that kept the old inline formula (or imported dragOrbit/dollyOrbit but never called them) would still pass " +
        "every check above this one, since section 1g only tests the FUNCTIONS in isolation, never the page");
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"));
console.log("unchecked here: WHETHER LIVE CANVAS PRESENTATION ITSELF WORKS ON THIS BOX -- every device.frame call " +
    "above passes {offscreen:true,read:true} deliberately (tools/ship/devicePresent-selfcheck.mjs's own header: " +
    "this build box loses the WebGPU device on a render pass whose attachment is the canvas's current texture). " +
    "rtx-viewer.html itself presents normally, the way every other live demo page does, and only a real browser " +
    "on real hardware can confirm that picture. Task #99 (a genuine statistical bit-exactness render gate) is " +
    "CLOSED as of RTX round 14 -- section 4f. RTX round 16 extracted the page's own drag/dolly camera math into " +
    "dragOrbit/dollyOrbit and gated its ARITHMETIC exactly (section 1g) and its WIRING structurally (section 6) -- " +
    "still unchecked: what a real pointer actually does to the on-screen picture, since no gate anywhere in this " +
    "tree simulates a genuine PointerEvent against a live page (the same limit render/orbitCamera-selfcheck.mjs's " +
    "own footer already names for orrery-gpu.html: 'what a drag LOOKS like on a real pointer is the rig's to see'). " +
    "Also unchecked: multi-material SBT offset -- physics/render/rtPipeline.mjs already proves it correct in " +
    "isolation, but neither live scene exposes real per-triangle material data through render/rtViewer.mjs's own " +
    "current dependencies (world/chunkMesherCore.js computes one at mesh time but never returns it).");
REPORT.table("accumulate kernel and the real mesh render, measured", ["case", "input", "n / frames", "result"], REPORT_ROWS,
    "A number that only reached this terminal is a measurement nobody else can re-read.");
REPORT.write();
process.exit(fails ? 1 : 0);
