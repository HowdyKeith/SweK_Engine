#!/usr/bin/env node
// WebGLEngine/tools/ship/bloomFused-selfcheck.mjs -- v4284
//
// GRADES render/bloomFused.mjs: the bloom chain's three full-screen passes fused into ONE compute dispatch.
//
// *** THE CHAIN OF TRUST, AND IT HAS TO CLOSE OR THE ROUND PROVES NOTHING. ***
//
//   section 2   the CPU oracle == the SHIPPING BRIGHT_FS, BLUR_H and BLUR_V, on a real WebGL2 device
//   section 3   the fused WGSL == the CPU oracle, on a real WebGPU device
//   therefore   the fused compute shader == the shipping three-pass chain
//
// The middle term is the one worth insisting on. A CPU model of a shader, written by the same person porting
// the shader, is a second opinion from the same source: if I misread BLUR_FS, my oracle misreads it the same
// way and the comparison passes while the port is wrong. So the oracle is checked against the shader ITSELF,
// running on a driver, before it is allowed to stand in for it.
//
// ---- WHAT THIS FILE REFUSES TO CLAIM -------------------------------------------------------------------------
//
// *** THAT ANY OF THIS IS FASTER. *** The only WebGPU device here is google/swiftshader -- a SOFTWARE
// rasteriser. Fusing three passes into one is a MEMORY TRAFFIC optimisation, and timing memory traffic on a
// CPU-backed implementation measures the CPU. A number from that would look like evidence and be noise, which
// is worse than no number. What is offered instead is the round-trip count: exact, structural, countable in
// either source, and the thing the optimisation actually changes.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runWgslCompute, renderGlslToPixels, webgpuSkipReason } from "./webgpuHarness.mjs";
import * as B from "../../render/bloomFused.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (n, c, d) => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${d ? "   " + d : ""}`); };
const report = (m) => console.log("  ----  " + m);

const bloomSrc = fs.readFileSync(path.join(ENG, B.BLOOM_SOURCE), "utf8");
const grab = (a, b) => { const t = bloomSrc.slice(bloomSrc.indexOf(a), bloomSrc.indexOf(b));
                         return t.slice(t.indexOf("`") + 1, t.lastIndexOf("`")); };
const BRIGHT_FS = grab("const BRIGHT_FS", "const BLUR_FS");
const BLUR_FS = grab("const BLUR_FS", "const SSAO_FS");

// *** THE VERTEX SHADER IS SUBSTITUTED AND THAT IS SAID OUT LOUD. *** bloomPass's PASSTHROUGH_VS reads an
// attribute, because bloomPass binds its own buffer; this harness draws three vertices with an EMPTY vao, so
// that attribute reads (0,0) three times, the triangle is degenerate, and the frame comes back black with
// ok:true. The substitute computes the SAME vUV from gl_VertexID, and section 2 proves that by reading the
// sampled texel coordinates out of a rendered frame rather than asserting the mapping.
const VS_ATTRIBUTELESS = `#version 300 es
out vec2 vUV;
void main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)) * 2.0 - 1.0;
  vUV = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

console.log("bloomFused-selfcheck -- three passes, one dispatch, and whether the picture survived\n");

console.log("1. THE CONSTANTS ARE THE SHIPPING SHADER'S, READ AT RUN TIME");
{
    const w = B.kernelWeights(), luma = B.lumaCoefficients(), knee = B.softKnee();
    ok("*** all nine kernel weights are parsed out of " + B.BLOOM_SOURCE + ", not retyped ***",
        w.length === 5 && w.every((x) => x > 0), w.join(" "));
    ok("  as are the luma vector and the soft-knee width", luma.length === 3 && knee > 0,
        `luma ${luma.join(",")}  knee ${knee}`);
    ok("CONTROL: the generated WGSL carries those same numbers",
        B.fusedWgsl().includes(String(w[0])) && B.fusedWgsl().includes(String(knee)),
        "so editing bloomPass.js moves the compute shader too, rather than silently disagreeing with it");
    // *** REPORTED, NOT FIXED. *** Rounding this to 1 would change every bloomed image the engine has made.
    const s = B.kernelSum(w);
    ok("  and the kernel's sum is reported rather than assumed to be 1", Math.abs(s - 1) < 1e-5,
        `sums to ${s} -- the shipping blur loses ${((1 - s) * 1e6).toFixed(1)} parts per million of its light`);
    report("a defect worth FIXING and a defect worth KNOWING ABOUT are different. This one is a millionth, " +
        "no eye can see it, and correcting it would alter every existing image for no visible gain.");
}

console.log("\n2. *** THE ORACLE IS CHECKED AGAINST THE SHIPPING SHADERS ON A REAL DEVICE ***");
const N2 = 32, T2 = 0.35;
let oracleTrusted = false;
{
    const gen = (x, y) => [(x * 7 + y * 13) % 251, (x * 3 + y * 5) % 241, (x * 11 + y * 2) % 233, 255];
    const img = new Float32Array(N2 * N2 * 3);
    for (let y = 0; y < N2; y++) for (let x = 0; x < N2; x++) {
        const p = gen(x, y), j = (y * N2 + x) * 3;
        img[j] = p[0] / 255; img[j + 1] = p[1] / 255; img[j + 2] = p[2] / 255;
    }
    // Rows come back top-first; the texture's row 0 is the BOTTOM. Measured, not assumed -- see below.
    const cmp = (pix, ref) => {
        let mx = 0;
        for (let y = 0; y < N2; y++) for (let x = 0; x < N2; x++) for (let c = 0; c < 3; c++) {
            const got = pix[(y * N2 + x) * 4 + c] / 255;
            const want = Math.min(1, Math.max(0, ref[((N2 - 1 - y) * N2 + x) * 3 + c]));
            const d = Math.abs(got - want); if (d > mx) mx = d;
        }
        return mx;
    };
    // *** THE ORIENTATION IS READ OUT OF A FRAME, NOT REASONED ABOUT. *** Each texel encodes its own row in
    // green, so the returned frame says which source row it came from.
    const PASS = `#version 300 es
precision highp float;
in vec2 vUV; out vec4 outColor; uniform sampler2D uScene;
void main(){ outColor = vec4(texture(uScene, vUV).rgb, 1.0); }`;
    const probe = await renderGlslToPixels({ vertex: VS_ATTRIBUTELESS, fragment: PASS, width: 8, height: 8,
                                             srcSize: 8, sourceTexel: (x, y) => [x * 30, y * 30, 100, 255] });
    if (probe.skipped) { report("SKIPPED: " + probe.reason); }
    else {
        ok("CONTROL: the frame is not blank -- a degenerate triangle returns ok:true and all zeroes",
            probe.ok && probe.distinctColours > 1, `${probe.distinctColours} distinct colours`);
        ok("*** returned row 0 is the source's LAST row, measured from a position readout ***",
            probe.ok && probe.pixels[1] === 210 && probe.pixels[(7 * 8) * 4 + 1] === 0,
            "green encodes the source row: top row reads 210 (row 7), bottom reads 0 (row 0)");

        const rb = await renderGlslToPixels({ vertex: VS_ATTRIBUTELESS, fragment: BRIGHT_FS, width: N2,
            height: N2, srcSize: N2, uniforms: [T2], uniformNames: ["uThreshold"], sourceTexel: gen });
        const rh = await renderGlslToPixels({ vertex: VS_ATTRIBUTELESS, fragment: BLUR_FS, width: N2,
            height: N2, srcSize: N2, sourceTexel: gen,
            uniformVecs: { uTexel: [1 / N2, 1 / N2], uDir: [1, 0], uEyeRect: [0, 0, 1, 1] } });
        const rv = await renderGlslToPixels({ vertex: VS_ATTRIBUTELESS, fragment: BLUR_FS, width: N2,
            height: N2, srcSize: N2, sourceTexel: gen,
            uniformVecs: { uTexel: [1 / N2, 1 / N2], uDir: [0, 1], uEyeRect: [0, 0, 1, 1] } });
        ok("  every uniform the blur declares actually resolved in the linked program",
            rh.ok && rh.unresolved.length === 0 && rv.ok && rv.unresolved.length === 0,
            "an unset uniform reads ZERO, and uEyeRect at zero clamps every tap onto texel 0");

        const QUANTUM = 0.5 / 255;                          // half a byte: the readback's own rounding
        const db = cmp(rb.pixels, B.brightCpu({ n: N2, threshold: T2, src: img }));
        const dh = cmp(rh.pixels, B.blurCpu({ n: N2, src: img, dx: 1, dy: 0 }));
        const dv = cmp(rv.pixels, B.blurCpu({ n: N2, src: img, dx: 0, dy: 1 }));
        ok("*** the oracle reproduces the SHIPPING BRIGHT_FS to the readback quantum ***", db <= QUANTUM,
            `max |diff| ${(db * 255).toFixed(3)}/255`);
        ok("*** ...and BLUR_FS horizontally ***", dh <= QUANTUM, `max |diff| ${(dh * 255).toFixed(3)}/255`);
        ok("*** ...and BLUR_FS vertically ***", dv <= QUANTUM, `max |diff| ${(dv * 255).toFixed(3)}/255`);
        oracleTrusted = db <= QUANTUM && dh <= QUANTUM && dv <= QUANTUM;
        report(`half a byte is the FLOOR of this comparison, not a loose tolerance: the frame is read back as ` +
            `8-bit, so ${(QUANTUM * 255).toFixed(1)}/255 is the rounding of the last write and nothing can do ` +
            `better. The oracle is now allowed to stand in for the shaders, and only now.`);
    }
}

console.log("\n3. *** THE FUSED DISPATCH AGAINST THE THREE-PASS CHAIN, ON A REAL WebGPU DEVICE ***");
{
    const skip = webgpuSkipReason();
    if (skip) { report("SKIPPED: " + skip); }
    else {
        const T = 0.7, n = B.N;
        const r = await runWgslCompute({ code: B.fusedWgsl(), outCount: n * n * 3, uniforms: [T, 0, 0, 0],
                                         workgroups: (n / B.TILE) * (n / B.TILE) });
        ok("the fused shader compiles and runs", r.ok,
            r.ok ? `adapter ${r.adapter?.vendor}/${r.adapter?.architecture}` : (r.reason + " " + JSON.stringify(r.errors).slice(0, 200)));
        if (r.ok) {
            const cpu = B.chainCpu({ threshold: T }).out;
            let maxAbs = 0, maxRel = 0, lit = 0;
            for (let i = 0; i < cpu.length; i++) {
                const d = Math.abs(r.values[i] - cpu[i]);
                if (cpu[i] > 1e-6) lit++;
                if (d > maxAbs) maxAbs = d;
                if (cpu[i] > 1e-4) maxRel = Math.max(maxRel, d / cpu[i]);
            }
            const EPS = 1.1920929e-7;
            ok("CONTROL: the image is not empty -- a shader writing zeroes would agree with nothing",
                lit > 500 && Math.max(...r.values) > 1, `${lit} lit samples, peak ${Math.max(...r.values).toFixed(4)}`);
            ok("*** one dispatch reproduces three passes to a few float32 epsilons ***", maxRel < 8 * EPS,
                `max relative ${maxRel.toExponential(2)} = ${(maxRel / EPS).toFixed(1)} eps, max absolute ${maxAbs.toExponential(2)}`);
            // *** THE BORDER IS GRADED SEPARATELY BECAUSE A SABOTAGE PROVED IT WAS ONLY GRADED BY ACCIDENT. ***
            // Deleting a clamp went 0 RED -- there were two layers and either sufficed. One was removed; this
            // check makes the remaining one's job explicit, so the edge is a claim rather than a side effect
            // of the whole-image number, where 240 border samples hide among 4096.
            let edgeMax = 0, edgeN = 0;
            for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
                if (x > 3 && x < n - 4 && y > 3 && y < n - 4) continue;   // within the kernel's reach of an edge
                for (let c = 0; c < 3; c++) {
                    const i = (y * n + x) * 3 + c;
                    edgeN++;
                    const d = cpu[i] > 1e-4 ? Math.abs(r.values[i] - cpu[i]) / cpu[i] : 0;
                    if (d > edgeMax) edgeMax = d;
                }
            }
            let edgeLit = 0;
            for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
                if (x > 3 && x < n - 4 && y > 3 && y < n - 4) continue;
                for (let c = 0; c < 3; c++) if (cpu[(y * n + x) * 3 + c] > 1e-4) edgeLit++;
            }
            ok("CONTROL: there is LIGHT on the border, or the next check cannot fail", edgeLit > 100,
                `${edgeLit} of ${edgeN} border samples are lit -- with an all-black border the comparison skips every one`);
            ok("*** and the EDGE agrees too, where the kernel reaches past the image ***", edgeMax < 8 * EPS,
                `${edgeN} samples within 4 texels of a border, max relative ${edgeMax.toExponential(2)}`);
            ok("  and this only means anything because section 2 vouched for the oracle", oracleTrusted,
                oracleTrusted ? "the oracle was checked against the shipping shaders first"
                              : "THE ORACLE WAS NOT VALIDATED -- this comparison is two guesses agreeing");
            report("*** BIT-IDENTICAL WAS NEVER AVAILABLE AND CLAIMING IT WOULD HAVE BEEN A LIE. *** The " +
                "fused shader adds the same nine taps in the same order, but a GPU may contract a multiply " +
                "and an add into one FMA and a JavaScript engine may not, so the last bit is free to differ. " +
                "The tolerance is stated in EPSILONS rather than as a decimal, because that says what kind " +
                "of difference is being permitted rather than merely how big it is.");
        }
    }
}

console.log("\n4. THE THING THAT ACTUALLY CHANGED, WHICH IS NOT SPEED");
{
    const g = B.ROUND_TRIPS.glsl, w = B.ROUND_TRIPS.wgsl;
    // Counted in the shipping file, not taken from the table: the table has to be right about the source.
    // *** THE FIRST ANCHOR HERE WAS `"    render("` AND IT MATCHED NOTHING, so indexOf returned -1, slice(-1)
    // took the file's LAST CHARACTER, and the count came back 0 -- a check reporting that the shipping chain
    // has no draws at all, which would have been an extraordinary claim arrived at by an off-by-one. The
    // anchors are now the author's own pass comments, and the CONTROL below fails if either goes missing
    // rather than quietly measuring an empty string.
    const from = bloomSrc.indexOf("// Pass 1 ");
    const to = bloomSrc.indexOf("// Pass 4 ");
    ok("CONTROL: both anchors are present, so the slice below is not empty", from > 0 && to > from,
        `Pass 1 at ${from}, Pass 4 at ${to}`);
    const chain = bloomSrc.slice(from, to);
    const draws = (chain.match(/drawArrays/g) || []).length;
    // The guarded passes start at the first `if (this.` in the span; everything before it is unconditional.
    const guard = chain.indexOf("if (this.");
    const uncond = (chain.slice(0, guard).match(/drawArrays/g) || []).length;
    ok("*** the span holds FIVE draws, not three, and the table now says so ***", draws === g.drawsInSpan,
        `${draws} gl.drawArrays between Pass 1 and Pass 4`);
    ok("*** exactly three of them are UNCONDITIONAL, and those are the ones fused ***",
        uncond === g.passes && draws - uncond === g.conditional,
        `${uncond} before the first guard (${g.names.join(", ")}), ${draws - uncond} guarded (${g.conditionalNames.join(", ")})`);
    report("the first draft of the table said three and this check said five. *** THE CLAIM WAS WRONG AND THE " +
        "COUNT WAS RIGHT, *** which is the only reason to count something the reader could have taken on " +
        "trust: SSAO and god rays sit between the blur and the composite, they are guarded so they are easy " +
        "to forget, and a round announcing 'three passes become one' while five live there is overstating " +
        "by omission.");
    ok("  each writing a texture the next pass reads straight back", g.roundTrips === 3 && g.intermediateTextures === 2);
    ok("*** the fused version is one dispatch and no intermediate texture ***",
        w.passes === 1 && w.roundTrips === 1 && w.intermediateTextures === 0,
        `${g.roundTrips} round trips -> ${w.roundTrips}`);
    const wgsl = B.fusedWgsl();
    ok("  because the intermediate lives in workgroup memory, which WebGL2 has no equivalent of",
        /var<workgroup>/.test(wgsl) && /workgroupBarrier\(\)/.test(wgsl),
        "the barrier is what makes one thread's horizontal blur readable by its neighbour's vertical one");
    ok("  and the shared tile is big enough for the kernel's vertical reach",
        (B.TILE + 2 * B.APRON) >= B.TILE + 8, `${B.TILE}x${B.TILE} output needs ${B.TILE + 2 * B.APRON} rows for a 9-tap kernel`);
    report("NO TIMING IS REPORTED AND THAT IS DELIBERATE. The only device here is google/swiftshader, a " +
        "software rasteriser; fusing passes is a memory-traffic win and timing memory traffic on a CPU " +
        "measures the CPU. The round-trip count is exact, structural, and does not depend on what silicon " +
        "happens to be present. *** A NUMBER THAT WOULD LOOK LIKE EVIDENCE AND BE NOISE IS WORSE THAN NONE. ***");
}

// =============================================================================================================
// SABOTAGE LOG -- grep-confirmed before the result was read, exit codes and FAIL summaries both read, restored
// md5-identical (ac320f1f1019e115). MEASURED.
//
//   A  APRON drops from 4 to 3 -- the shared tile one row short of a nine-tap kernel's reach.
//      -> exit=1, 2 red. The image goes wrong by 100% relative, because the top and bottom rows of every
//      tile read a neighbour that was never written. An off-by-one in an apron is the characteristic bug of
//      a fused blur and it does not look like one from the source: the shader compiles, dispatches, and
//      returns a plausible picture with tile-shaped seams.
//
//   B  workgroupBarrier() deleted -- the classic race in every fused separable blur.
//      -> exit=1, 3 red, and the peak collapses from 1.7480 to 0.0495: threads read the shared tile before
//      their neighbours have filled it, so most taps are still zero. *** THE CONTROL CAUGHT THIS BEFORE THE
//      COMPARISON DID, *** which is what a control is for -- an almost-black frame that still has the right
//      number of lit samples would otherwise be compared, found wrong, and blamed on the arithmetic.
//
//   C  the luma vector rounded to 0.30/0.59/0.11 -- THE SAME ERROR IN THE ORACLE AND IN THE PORT, because
//      both read it from one parser.
//      -> exit=1, 2 red, AND SECTION 3 PASSED. The fused shader still agrees with the oracle perfectly; they
//      are wrong together. Only section 2, which checks the oracle against the SHIPPING BRIGHT_FS on a
//      driver, sees it -- 4.814/255 against a 0.5/255 bar. *** THIS IS THE WHOLE ARGUMENT FOR THE CHAIN OF
//      TRUST, DEMONSTRATED RATHER THAN ASSERTED: *** a CPU model written by whoever is doing the port cannot
//      validate the port, because it shares the porter's misreadings.
//
//   D  the clamp removed from srcAt, so the shader reads outside the image.
//      -> *** THIS WENT 0 RED TWICE AND BOTH TIMES THE GATE WAS AT FAULT, NOT THE SABOTAGE. ***
//      FIRST: there were TWO layers of clamping -- hBlurAt clamped every tap and srcAt clamped again -- so
//      removing either changed nothing. Redundant defence reads as care and costs the ability to test either
//      half. The tap-level clamps were removed; one boundary, in one place.
//      SECOND: still 0 red, because the edge comparison divides by the reference value and skips anything
//      below 1e-4, and BOTH bright spots were in the interior, so the entire border extracted to black. An
//      edge check on an edge with no light in it is an assertion that cannot fail -- the sixth of that
//      family this session. A third source was added straddling the left border (180 of 2880 border samples
//      now lit, and a CONTROL asserts that), and the sabotage then went 2 red including the edge check by
//      name.
//
// None went 0 RED in the end, and D took three attempts to make honest. C is the one worth keeping: it is
// the only sabotage here that a correct-looking gate would have passed, and the only one that tests the
// gate's STRUCTURE rather than the shader's arithmetic.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: WHETHER THE FUSED PASS IS WIRED INTO ANYTHING. render/bloomPass.js still runs its " +
    "three draws and this round did not change it -- swapping a live render path is a behaviour change to " +
    "every frame the engine draws, and it needs a WebGPU render target, a storage-texture output instead of a " +
    "buffer, and a device that is not SwiftShader to be worth believing. What is proven is that the arithmetic " +
    "survives the move. Also unchecked: the other three passes of the chain -- SSAO, god rays and the " +
    "composite -- and the composite is the one that would decide whether the whole post chain can become one " +
    "dispatch or merely two.");
process.exit(fails ? 1 : 0);
