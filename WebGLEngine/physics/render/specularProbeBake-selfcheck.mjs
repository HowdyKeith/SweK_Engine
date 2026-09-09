#!/usr/bin/env node
// WebGLEngine/physics/render/specularProbeBake-selfcheck.mjs -- v4577
//
// Run: node physics/render/specularProbeBake-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
"use strict";
import { bakeMipChain, bakeFace, prefilterEnvRGB, mipRoughness, mipAlpha, mipFaceSize,
         faceLumaStdDev, texelLuma, DEFAULT_BAKE } from "./specularProbeBake.mjs";
import { faceTexelDir } from "../../render/cubeBake.js";
import { alphaOf } from "./principled.mjs";
import { splatRadiance } from "../../render/splatProbes.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const report = (s) => console.log("  ----  " + s);

// A tiny synthetic splat cloud, the SAME source shape render/splatProbes.mjs's diffuse bake already consumes --
// one bright red splat along +Z, everything else the background. Not a fresh closed-form "spot" invented for
// this file: it is splatRadiance() itself, so this bake is exercised against a real scene source, not a
// standalone analytic env function.
const CLOUD = { count: 1, positions: Float32Array.from([0, 0, 5]), scales: Float32Array.from([1.2, 1.2, 1.2]) };
const COLOURS = Float32Array.from([20, 2, 2]); // a bright, saturated splat -- HDR on purpose, so a furnace-style clamp bug would show
const BACKGROUND = [0.1, 0.12, 0.2];
const radianceOf = splatRadiance(CLOUD, COLOURS, BACKGROUND);
const PROBE_POS = [0, 0, 0];

console.log("1. *** THE MIP CHAIN'S OWN SHAPE, AGAINST THE FORMULAS THAT DEFINE IT ***");
{
    const opts = { mipCount: 5, faceSize0: 8, minFaceSize: 2, samples: 24 };
    const mips = bakeMipChain(radianceOf, PROBE_POS, opts);
    ok("!! mipCount levels, six faces each", mips.length === opts.mipCount && mips.every((m) => m.faces.length === 6));
    let sizesOk = true, alphasOk = true, roughOk = true;
    mips.forEach((m, i) => {
        if (m.size !== mipFaceSize(i, opts.faceSize0, opts.minFaceSize)) sizesOk = false;
        if (m.alpha !== mipAlpha(i, opts.mipCount)) alphasOk = false;
        if (m.roughness !== mipRoughness(i, opts.mipCount)) roughOk = false;
        if (m.faces.some((f) => f.length !== m.size * m.size * 3)) sizesOk = false;
    });
    ok("!! every level's size matches mipFaceSize() and every face buffer is size*size*3 floats", sizesOk,
       mips.map((m) => `L${m.level}:${m.size}`).join(" "));
    ok("!! every level's alpha is principled.mjs's OWN alphaOf(roughness), not a second convention", alphasOk && roughOk,
       mips.map((m) => `L${m.level} rough=${m.roughness.toFixed(3)} alpha=${m.alpha.toFixed(6)}`).join(" | "));
    ok("!! *** roughness runs 0 (mirror) to 1 (fully rough) end to end, and alpha tracks alphaOf exactly ***",
       mips[0].roughness === 0 && mips[mips.length - 1].roughness === 1 &&
       mips[mips.length - 1].alpha === alphaOf(1),
       `mip 0 roughness ${mips[0].roughness}, mip ${mips.length - 1} roughness ${mips[mips.length - 1].roughness} alpha ${mips[mips.length - 1].alpha} (alphaOf(1) = ${alphaOf(1)})`);
    ok("!! face size shrinks monotonically with roughness, down to minFaceSize -- a rough mip does not need mirror resolution",
       mips.every((m, i) => i === 0 || m.size <= mips[i - 1].size) && mips[mips.length - 1].size === opts.minFaceSize,
       mips.map((m) => m.size).join(" -> "));
}

console.log("\n2. *** IDENTITY: A BAKED TEXEL IS EXACTLY THE SAME CALL prefilterEnvRGB() MAKES DIRECTLY, UP TO THE STORAGE FORMAT ***");
{
    // *** THE FIRST DRAFT OF THIS CHECK ASSERTED FULL f64 EQUALITY AND WAS WRONG, NOT THE BAKE. *** bakeFace
    // writes into a Float32Array (deliberately -- matching probeLit.mjs's own texture-precision discipline
    // elsewhere), so its stored values are f64 results ROUNDED to f32. Comparing them against an un-rounded f64
    // "direct" call read as a 2.98e-9 disagreement on a texel whose true value is exactly the background
    // constant [0.1, 0.12, 0.2] -- not a transcription bug, Math.fround(0.1) alone. The honest claim is that the
    // ONLY difference is that rounding step, checked here by applying it to both sides before comparing.
    const size = 8, alpha = 0.35, face = 2, i = 3, j = 5;
    const baked = bakeFace(radianceOf, PROBE_POS, face, size, alpha, { samples: 32 });
    const dir = faceTexelDir(face, i, j, size);
    const direct = prefilterEnvRGB(radianceOf, PROBE_POS, dir, alpha, { samples: 32 });
    const o = (j * size + i) * 3;
    const d = Math.max(Math.abs(baked[o] - direct[0]), Math.abs(baked[o + 1] - direct[1]), Math.abs(baked[o + 2] - direct[2]));
    const dRounded = Math.max(Math.abs(baked[o] - Math.fround(direct[0])),
                               Math.abs(baked[o + 1] - Math.fround(direct[1])),
                               Math.abs(baked[o + 2] - Math.fround(direct[2])));
    ok("!! *** AND THE f64-vs-f32 GAP IS EXACTLY Float32Array's OWN ROUNDING, NOTHING ELSE ***",
       dRounded === 0 && d > 0,
       `un-rounded max channel difference ${d.toExponential(3)} (this is what a naive 'bit for bit' claim would have measured and failed); ` +
       `after Math.fround() on the direct f64 result, the difference is exactly ${dRounded} (texel ${i},${j} of face ${face}, dir [${dir.map((x) => x.toFixed(4))}]). ` +
       "d > 0 is asserted too -- a check that could not tell the rounded and unrounded values apart would not be proving the rounding is the whole story.");
}

console.log("\n3. *** THE PHYSICAL PROPERTY THE WHOLE CHAIN EXISTS FOR: ROUGHER MIPS ARE FLATTER, MEASURED PER LEVEL ***");
{
    const opts = { mipCount: 6, faceSize0: 12, minFaceSize: 3, samples: 64 };
    const mips = bakeMipChain(radianceOf, PROBE_POS, opts);
    // face 4 (+Z) faces the splat directly -- the face most likely to show the hotspot's blur as roughness grows.
    const stds = mips.map((m) => faceLumaStdDev(m.faces[4]));
    report(mips.map((m, i) => `L${m.level} alpha=${m.alpha.toFixed(3)} stddev=${stds[i].toFixed(4)}`).join(" | "));
    let monotonic = true;
    for (let i = 1; i < stds.length; i++) if (stds[i] > stds[i - 1] + 1e-9) monotonic = false;
    ok("!! *** LUMINANCE VARIANCE ACROSS +Z's FACE FALLS AS ROUGHNESS RISES -- NOT ASSUMED, MEASURED PER LEVEL ***",
       monotonic && stds[0] > stds[stds.length - 1] * 2,
       `stddev: ${stds.map((s) => s.toFixed(4)).join(" -> ")}. A narrow hotspot on a near-mirror mip reads as a sharp bright texel among dim ones (high variance); on the roughest mip the same hotspot has been smeared across the whole lobe (low variance). This is the actual blur a specular IBL mip chain exists to produce, measured rather than pictured.`);

    console.log("\n4. *** SABOTAGE: REVERSE THE MIP-TO-ROUGHNESS ASSIGNMENT AND THE MONOTONICITY CLAIM ABOVE MUST BREAK ***");
    const reversedStds = [...stds].reverse();
    let reversedMonotonic = true;
    for (let i = 1; i < reversedStds.length; i++) if (reversedStds[i] > reversedStds[i - 1] + 1e-9) reversedMonotonic = false;
    ok("!! feeding the SAME per-level measurements in reverse mip order fails the monotonicity check",
       !reversedMonotonic,
       "proves section 3's assertion is actually sensitive to which mip is roughest, rather than true for any ordering of the same numbers -- a check that passed on both orderings would not be measuring roughness at all.");
}

console.log(fails ? "\nspecularProbeBake-selfcheck: " + fails + " FAILED" : "\nspecularProbeBake-selfcheck: all checks pass");
console.log("unchecked here: physics/render/specularIBLWgsl-selfcheck.mjs is the one that packs this chain and samples it on a real device (storage-buffer atlas, not yet a gfx/device.js texture, and nothing in the live renderer binds it). A GPU-side BAKE from a real captured cubemap rather than an analytic/splat radianceOf remains unbuilt -- splitSumWgsl.mjs's PREFILTER_ENV_WGSL still takes an analytic env, not a texture.");
process.exit(fails ? 1 : 0);
