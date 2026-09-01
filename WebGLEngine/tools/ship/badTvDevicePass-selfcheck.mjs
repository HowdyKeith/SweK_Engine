// WebGLEngine/tools/ship/badTvDevicePass-selfcheck.mjs -- v4271
//
// RENDERS badTv ON BOTH BACKENDS AND DIFFS THE FRAMES.
//
// *** gfx/device.js HAS PROMISED "a demo writes its render ONCE and runs on either runtime" SINCE IT WAS
// WRITTEN, AND NOTHING HAD EVER RENDERED THE SAME EFFECT BOTH WAYS AND COMPARED THE PIXELS. *** v4269 counted
// how many modules COULD take that offer -- five of 134, three of them pages. v4270 proved one ported shader
// computes the right coordinates, to 3.2e-8, which is a claim about arithmetic and not about pictures. This
// gate renders it: WebGPU through tools/ship/webgpuHarness.mjs, WebGL2 through the same harness's GL path,
// against the same source texture and the same uniforms, and compares both to render/badTvModel.mjs AND to
// each other.
//
// Agreeing with a model twice is weaker than agreeing with each other. Two backends can each match a CPU
// reference at the points sampled and still differ elsewhere; only the direct diff rules that out.
//
// ---- THE SOURCE TEXTURE IS THE INSTRUMENT ----------------------------------------------------------------------
//
// Each texel encodes its own position -- R = x, G = y -- so a rendered pixel is a direct readout of WHICH texel
// the shader sampled, and the frame can be compared to the model texel by texel instead of judged by eye.
// Sampling is NEAREST with repeat addressing: linear filtering would blend two texels and turn an exact
// comparison into an approximate one, hiding exactly the half-texel errors worth catching.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderWgslToPixels, renderGlslToPixels, webgpuSkipReason } from "./webgpuHarness.mjs";
import { VERTEX_GLSL, FRAGMENT_GLSL, badTvPipelineDesc, packKnobs, KNOB_ORDER, UV_CONVENTION }
    from "../../render/badTvDevicePass.mjs";
import { FRAGMENT_WGSL } from "../../render/badTvWgsl.mjs";
import { sampleAt, maxTear } from "../../render/badTvModel.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => {
    if (!cond) fails++;
    console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`);
};
const report = (s) => console.log(`  ----  ${s}`);

const N = 64, TIME = 1.5;
const KNOBS = packKnobs({ time: TIME, rows: N });
/** What the model says pixel (x, y) should show, given the position-encoding source texture. */
function expected(x, y) {
    const [su, sv] = sampleAt((x + 0.5) / N, (y + 0.5) / N, TIME);
    const sx = Math.min(N - 1, Math.floor(su * N)), sy = Math.min(N - 1, Math.floor(sv * N));
    return [Math.round(sx * 255 / (N - 1)), Math.round(sy * 255 / (N - 1))];
}

console.log("\n1. THE DESCRIPTOR SATISFIES THE CONTRACT v4269 MEASURED");
{
    const d = badTvPipelineDesc();
    ok("*** it carries BOTH languages ***", typeof d.shaders.wgsl === "string" &&
        typeof d.shaders.glsl.vertex === "string" && typeof d.shaders.glsl.fragment === "string",
        "which five files of 134 in this tree do, and none deliberately before this one");
    ok("  the WGSL is the same text badTvWgsl.mjs exports", d.shaders.wgsl === FRAGMENT_WGSL,
        "one source, not a copy that can drift");
    ok("  entry points are named vs/fs, as gfx/device.js defaults", d.vs === "vs" && d.fs === "fs");
    ok("  no vertex buffer is claimed, because both stages synthesise the triangle",
        d.attributes.length === 0 && d.stride === 0);
    ok("  the uniform list matches the packing order exactly",
        d.uniforms.map((u) => u.name).join(",") === KNOB_ORDER.join(","),
        "so the two backends cannot be handed the same numbers in different slots");
    ok("  and the uv convention travels WITH the descriptor", d.uvConvention === UV_CONVENTION &&
        UV_CONVENTION.space === "framebuffer", "a consumer reads it rather than guessing");
    // The guard v4269 added, exercised from the consumer's side.
    const dev = fs.readFileSync(path.join(ENG, "gfx/device.js"), "utf8");
    // *** \s+ RATHER THAN A LITERAL SPACE, BECAUSE THIS MATCHES PROSE AND PROSE WRAPS. ***
    // gateQuality flagged this at v4279 as prose-matching debt, and it was right twice over: the phrase lives
    // inside a thrown message that is assembled across source lines, so a re-wrap of that message -- an edit
    // that changes nothing a caller sees -- would have turned this check red on correct code. Whitespace-
    // insensitive is the tree's settled idiom for the cases where prose really is the thing being checked.
    ok("  a GLSL-only pipeline would still be refused by name", /cannot\s+run\s+on\s+the\s+WebGPU\s+backend/.test(dev),
        "this descriptor passes that guard because it supplies wgsl");
}

console.log("\n2. RENDER IT, BOTH WAYS");
{
    const skip = webgpuSkipReason();
    if (skip) {
        console.log(`  SKIP  no browser GPU here: ${skip}`);
        report("*** THIS SKIP MUST NEVER BE READ AS A PASS. *** Section 1 checks a descriptor's shape. Only " +
            "this section checks that anything DRAWS, and that the two backends draw the same thing.");
    } else {
        const gpu = await renderWgslToPixels({ code: FRAGMENT_WGSL, width: N, height: N, srcSize: N, uniforms: KNOBS });
        ok("the WGSL renders", gpu.ok, gpu.ok ? `adapter ${gpu.adapter.vendor}/${gpu.adapter.architecture}`
            : `${gpu.reason} ${(gpu.errors || []).join(" | ")}`);
        const gl = await renderGlslToPixels({ vertex: VERTEX_GLSL, fragment: FRAGMENT_GLSL, width: N, height: N,
            srcSize: N, uniforms: KNOBS, uniformNames: KNOB_ORDER });
        ok("the GLSL renders", gl.ok, gl.ok ? `renderer ${gl.renderer}` : gl.reason);

        if (gpu.ok && gl.ok) {
            let wGpu = 0, wGl = 0, wPair = 0, differing = 0;
            for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
                const [eR, eG] = expected(x, y);
                const a = y * gpu.bytesPerRow + x * 4, b = y * gl.bytesPerRow + x * 4;
                wGpu = Math.max(wGpu, Math.abs(gpu.pixels[a] - eR), Math.abs(gpu.pixels[a + 1] - eG));
                wGl = Math.max(wGl, Math.abs(gl.pixels[b] - eR), Math.abs(gl.pixels[b + 1] - eG));
                const dp = Math.max(Math.abs(gpu.pixels[a] - gl.pixels[b]),
                                    Math.abs(gpu.pixels[a + 1] - gl.pixels[b + 1]));
                if (dp > 0) differing++;
                wPair = Math.max(wPair, dp);
            }
            ok("*** every WebGPU pixel matches the CPU model exactly ***", wGpu === 0, `worst ${wGpu} of 255`);
            ok("*** every WebGL2 pixel matches the CPU model exactly ***", wGl === 0, `worst ${wGl} of 255`);
            ok("*** and the two backends agree with EACH OTHER on every pixel ***", wPair === 0,
                `${differing} of ${N * N} pixels differ, worst ${wPair} of 255`);
            report("that third line is the one gfx/device.js has been promising since it was written. It is " +
                "stronger than the first two together: two backends can each match a model at the points " +
                "sampled and still differ from each other elsewhere.");

            // *** AN ALL-EQUAL COMPARISON PASSES TRIVIALLY IF THE FRAME IS FLAT. *** It must be a picture.
            const uniq = new Set();
            for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
                const a = y * gpu.bytesPerRow + x * 4;
                uniq.add(gpu.pixels[a] * 256 + gpu.pixels[a + 1]);
            }
            ok("CONTROL: the frame is not flat", uniq.size > 500,
                `${uniq.size} distinct R/G pairs -- a cleared or constant frame would satisfy every check above`);
            // *** AND THE EFFECT MUST ACTUALLY DISPLACE, OR THIS IS AN ELABORATE TEXTURE BLIT. ***
            // The first version of this control asserted that more than a tenth of sample points move by over
            // a texel. Measured: 320 of 4096, which is 7.8%, and the check went red on correct code. That
            // threshold was guessed. What the effect actually does at this size, measured: 12 of 64 rows tear
            // by more than one texel and the worst tear is 1.86 texels -- the tear is INTERMITTENT, which is
            // what a failing television looks like and why a whole-frame percentage was the wrong instrument.
            let rowsTorn = 0, worstTear = 0;
            const rollRows = new Set();
            for (let y = 0; y < N; y++) {
                const v = (y + 0.5) / N;
                const [su, sv] = sampleAt(0.5, v, TIME);
                const texels = Math.abs(su - 0.5) * N;
                if (texels > 1) rowsTorn++;
                worstTear = Math.max(worstTear, texels);
                rollRows.add(Math.floor(sv * N));
            }
            ok("CONTROL: the horizontal tear moves some rows and not others",
                rowsTorn >= 1 && rowsTorn < N, `${rowsTorn} of ${N} rows torn by more than a texel`);
            // Cross-checked against the model's OWN answer rather than a second computation of it.
            ok("  and the worst tear agrees with badTvModel.maxTear",
                Math.abs(worstTear - maxTear(TIME) * N) < 0.2,
                `frame ${worstTear.toFixed(2)} texels vs maxTear ${(maxTear(TIME) * N).toFixed(2)}`);
            ok("CONTROL: the vertical roll displaces every row",
                rollRows.size === N, `${rollRows.size} distinct source rows sampled of ${N}`);
            report(`at ${N}x${N} the tear is under two texels, so this is a SMALL effect measured exactly ` +
                "rather than a large one measured loosely -- which is the only reason a 0-of-255 comparison " +
                "is achievable at all.");
        }
    }
}

console.log("\n3. THE ORIENTATION RULE, WHICH REASONING GOT WRONG AND RENDERING SETTLED");
{
    const src = fs.readFileSync(path.join(ENG, "render/badTvDevicePass.mjs"), "utf8");
    const wgsl = fs.readFileSync(path.join(ENG, "render/badTvWgsl.mjs"), "utf8");
    ok("*** both vertex stages flip v out of NDC, identically ***",
        /vUv = vec2\(\(p\.x \+ 1\.0\) \* 0\.5, 1\.0 - \(p\.y \+ 1\.0\) \* 0\.5\)/.test(src) &&
        /o\.uv = vec2f\(\(p\[vi\]\.x \+ 1\.0\) \* 0\.5, 1\.0 - \(p\[vi\]\.y \+ 1\.0\) \* 0\.5\)/.test(wgsl),
        "an earlier draft argued they must differ; rendering both ways made all 4,096 pixels disagree");
    ok("  the file records that it was wrong rather than quietly fixing it",
        /GOT\s+WRONG\s+TWICE\s+AND\s+MEASURED\s+RIGHT\s+ONCE/.test(src));
    ok("  and says why it is not cosmetic", /the roll reads v|ROLL READS v/i.test(src),
        "fract(v - time * rollSpeed): a symmetric error rolls the wrong way and looks plausible");
    ok("UV_CONVENTION is stated as data, not only in prose",
        UV_CONVENTION.origin === "top-left" && /roll/.test(UV_CONVENTION.affects));
}

// =============================================================================================================
// SABOTAGE LOG -- grep-confirmed before the result was read, exit codes read, restored md5-identical. MEASURED.
//
//   A  the GLSL vertex stage un-flipped -- the mistake this round actually made and argued for in a comment.
//      -> exit=1, 3 red. WebGL2 against the model goes to 255 of 255, the two backends differ on ALL 4,096
//      pixels, and the text check on the two vertex stages fires. *** THE WebGPU SIDE STAYS GREEN THROUGHOUT,
//      *** which is the point: a per-backend check would have reported half a success and called the port done.
//
//   B  the uniform list reversed, so the descriptor names the knobs in a different order from packKnobs.
//      -> exit=1, 1 red, and NOT in the render. Both backends are handed the same Float32Array by the gate, so
//      the pixels still agree perfectly; only the descriptor check notices. A real consumer reading `uniforms`
//      to bind by name would have shipped an effect with speed and rollSpeed swapped, rendering beautifully.
//      A pixel diff cannot see a contract that nothing in the test obeys.
//
//   C  the GLSL drops the cube: offset * distortion instead of offset^3 * distortion^2.
//      -> exit=1, 2 red. 3,456 of 4,096 pixels differ, worst 255. The 640 that still agree are the rows where
//      the tear rounds to the same texel either way -- which is why the check is "every pixel" and not "most".
//
// None went 0 RED. A, the orientation error, is the one that matters: it is invisible to v4270's arithmetic
// test, which passed at 3.2e-8 with the same shader in either orientation.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: THE THREE.JS PASS. render/badTvPass.js is untouched by this round (and, corrected at v4273, has NO CALLERS -- it is not what main.js draws with, which this file claimed); it renders through a THREE.ShaderMaterial with three's own uv attribute and a " +
    "flipY texture, and nothing here compares its output to these two. So 'the device path is consistent' is " +
    "proven and 'the device path matches what ships today' is not. Also unchecked: any adapter but " +
    "swiftshader. Both backends here are CPU implementations, which is the right instrument for exactness -- " +
    "no driver-specific fast maths -- and the wrong one for asking whether real hardware agrees.");
process.exit(fails ? 1 : 0);
