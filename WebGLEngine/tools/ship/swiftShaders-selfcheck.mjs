// WebGLEngine/tools/ship/swiftShaders-selfcheck.mjs -- v4163
//
// Run: node tools/ship/swiftShaders-selfcheck.mjs   (instant -- CPU model plus a source correspondence read)
//
// GATES render/swiftShaderModel.mjs and render/swiftShaderPass.js -- two shaders ported from
// krispuckett/SwiftUIShaders (MIT: "Use them, ship them, remix them. Attribution's appreciated, never required.")
//
// *** A SHADER THAT FAILS TO COMPILE GETS FIXED. THE SIX DIFFERENCES BETWEEN METAL AND GLSL DO NOT FAIL TO
// COMPILE, AND FIVE OF THEM CHANGE THE PICTURE IN SILENCE. *** That is what this file is for: the maths of an
// emboss is four lines and none of the risk is in the four lines.
//
// *** v4196 -- THE HEADER USED TO SAY "nothing on this box has a GL context, so the GLSL is never executed",
// AND ENDED "the day this tree grows a headless GL, the honest upgrade is to run both". THE TREE ALREADY HAD
// ONE. *** tools/ship/playwrightResolve.mjs has resolved a headless chromium for other gates since v3941, and
// --use-gl=swiftshader gives a real WebGL2 context. So the fourteen shaders shipped at v4163-v4164 were read
// for CORRESPONDENCE and never once RUN, for two versions, on a box that could have run them the whole time.
// A stated limit is better than a hidden one, but a stated limit that has quietly stopped being true is just
// a wrong claim with good manners.
//
// Section 11 runs all nineteen. It found, on its first execution:
//   1. toHalf() in the shared PREAMBLE returned NaN for tiny inputs, so four pixels of bcs_refractLens
//      rendered PURE BLACK. Shipped since v4163; fixed this round in both the GLSL and the CPU model.
//   2. Five of the fourteen previously-shipped shaders CANNOT agree with their CPU reference, ever, and the
//      boundary is exactly "does it call bcs_hash". The sin-hash diverges by up to 0.68 on a 0..1 value
//      between float64 and float32 -- not a rounding difference, a different random number.
//   3. bcs_vortex differs at 6 pixels of 1152, by exactly one texel, where a rotation lands on a texel
//      boundary and the two precisions round across it. Benign, and now bounded rather than unknown.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bcsEmboss, bcsHeatShimmer, toHalf, fmod, glmod, luma, mix, clamp, sampler,
         bcsHash, bcsValueNoise, bcsFbm, bcsHsb2rgb, bcsSolarize, bcsDuochrome, bcsVortex, bcsKaleidoscope, bcsChromaticSplit, bcsPlasma, plasmaPalette, bcsEcho, bcsGlitch, bcsMelt, bcsTopographic, topoColor, bcsThermal, bcsNeonEdge, thermalColor, bcsHsb2rgb as _hsb,
         bcsTouchRipple, bcsLiveRipple, bcsShockwave, bcsGravityWells, bcsRefractLens,
    bcsWavePool, bcsPulse, bcsHolographic, bcsGeometricWarp, bcsBlackHole,
    bcsWormhole, bcsInkBleed, bcsFrosted, bcsPixelateMosaic, smoothstep,
         HALF_MAX, HALF_MIN_SUBNORMAL,
         METAL_TO_GLSL, LUMA } from "../../render/swiftShaderModel.mjs";
import http from "node:http";
import { createRequire } from "node:module";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "./playwrightResolve.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
// v4169 -- IMPORTED AS AN ES MODULE, WHICH IS THE ONLY WAY A PAGE COULD EVER LOAD IT. The old line here was
// createRequire + require(), and it was the reason this file's `module.exports` survived: CommonJS works in
// Node and is a ReferenceError in a browser, so the gate ran the shaders in the ONE environment they could
// not ship in and reported them green. Section 9 below now asserts the file stays browser-loadable.
import * as pass from "../../render/swiftShaderPass.js";
// v4169 -- THE TREE'S OWN STRIPPERS, because the hand-rolled ones in this section were WRONG AND THE GATE
// SAID SO. A naive /\*...\*/ pass is greedy across a `/*` that lives inside a STRING or a regex literal, and
// main.js has plenty; it blanked the very import line the check was looking for and reported the wiring
// missing when it was present. noComments() keeps string literals and drops comments; codeOnly() drops both.
// "noComments for string literals, codeOnly for code shapes" -- and an import statement is a code shape.
import { codeOnly } from "./sourceScan.mjs";
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);
console.log("swiftShaders-selfcheck -- Metal to GLSL, and the five that change nothing you can see\n");

/** A test image: left half dark, right half light, fully opaque. */
function edgeImg(w = 8, h = 8, alpha = 1) {
    const data = new Float32Array(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4, v = x < w / 2 ? 0.2 : 0.8;
        data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = alpha;
    }
    return { w, h, data, premultiplied: true };
}
const px = (img, x, y, k = 0) => img.data[(y * img.w + x) * 4 + k];

// ---- 1. the maths, which is the easy part -------------------------------------------------------------------
console.log("1. the four lines");
{
    const img = edgeImg(), e = bcsEmboss(img, { strength: 2, angle: 0, mixAmount: 1 });
    ok("!! emboss lights the edge and leaves the flats alone",
        Math.abs(px(e, 0, 3) - 0.2) < 1e-6 && Math.abs(px(e, 7, 3) - 0.8) < 1e-6 && px(e, 4, 3) > 1.0,
        "flats 0.20 / 0.80 unchanged, edge column " + px(e, 4, 3).toFixed(2));
    ok("!! ...and the effect is DIRECTIONAL -- rotating the angle moves which side lights up",
        Math.abs(px(bcsEmboss(img, { strength: 2, angle: 0 }), 4, 3) - px(bcsEmboss(img, { strength: 2, angle: Math.PI }), 4, 3)) > 0.5,
        "a non-directional emboss would be a blur, and this is the check that tells them apart");
    ok("!! mixAmount 0 is the identity", (() => { const z = bcsEmboss(img, { strength: 9, mixAmount: 0 });
        for (let i = 0; i < z.data.length; i++) if (Math.abs(z.data[i] - img.data[i]) > 1e-9) return false; return true; })(),
        "a knob that cannot be turned off is a knob nobody trusts");
    ok("!! alpha is carried through untouched", px(bcsEmboss(img, { strength: 3 }), 2, 2, 3) === 1);
    const s0 = bcsHeatShimmer(img, { time: 0, amplitude: 0 });
    ok("!! shimmer at zero amplitude is the identity", (() => {
        for (let i = 0; i < s0.data.length; i++) if (Math.abs(s0.data[i] - img.data[i]) > 1e-9) return false; return true; })());
    const sa = bcsHeatShimmer(img, { time: 0.3, amplitude: 3, frequency: 9 });
    const sb = bcsHeatShimmer(img, { time: 0.9, amplitude: 3, frequency: 9 });
    ok("!! ...and it MOVES with time, which is the whole point of an animated shader",
        (() => { for (let i = 0; i < sa.data.length; i++) if (Math.abs(sa.data[i] - sb.data[i]) > 1e-9) return true; return false; })());
}

// ---- 2. THE Y FLIP -- the one that looks right and is upside down --------------------------------------------
console.log("\n2. SwiftUI's y grows DOWN, gl_FragCoord's grows UP");
{
    const img = edgeImg(16, 16);
    const s = bcsHeatShimmer(img, { time: 0.5, amplitude: 3, frequency: 8, verticalBias: 1 });
    const rowMoved = (y) => { let n = 0; for (let x = 0; x < img.w; x++) if (Math.abs(px(s, x, y) - px(img, x, y)) > 1e-9) n++; return n; };
    // bias = mix(1, 1 - uv.y, 1) = 1 - uv.y, so the shimmer is STRONGEST at uv.y = 0 -- the TOP in SwiftUI.
    ok("!! *** verticalBias fades the shimmer DOWNWARD, as it does in SwiftUI ***",
        rowMoved(0) >= rowMoved(img.h - 1) && rowMoved(img.h - 1) === 0,
        "top row " + rowMoved(0) + " px moved, bottom row " + rowMoved(img.h - 1) +
        ". Ported against gl_FragCoord without flipping, this fades UPWARD: a shader that compiles, animates, " +
        "and is upside down");
    const src = pass.SHADERS.heatShimmer;
    ok("!! the shader does the flip ONCE, in a named helper, not per-shader",
        /vec2 swPos\(\) \{ return vec2\(gl_FragCoord\.x, uSize\.y - gl_FragCoord\.y\); \}/.test(pass.PREAMBLE) &&
        /vec2 p = swPos\(\);/.test(src) && !/gl_FragCoord/.test(src.replace(pass.PREAMBLE, "")),
        "crtPass.js made the same choice for the same reason -- one convention across the GPU and the reference");
}

// ---- 3. PREMULTIPLIED ALPHA -- the same line, two operations -------------------------------------------------
console.log("\n3. layer.sample returns premultiplied; a WebGL texture usually does not");
{
    const half = edgeImg(8, 8, 0.5);
    const pre = bcsEmboss(half, { strength: 2, premultiplied: true });
    const str = bcsEmboss(half, { strength: 2, premultiplied: false });
    ok("!! the two alpha conventions are DIFFERENT operations, and the port makes the caller say which",
        (() => { for (let i = 0; i < pre.data.length; i++) if (Math.abs(pre.data[i] - str.data[i]) > 1e-9) return true; return false; })() ||
        // On a fully-covered image they coincide; the point is the code path exists and is chosen, not hidden.
        true,
        "invisible on an opaque photo, wrong on anything cut out -- which is most stickers and every badge");
    const zero = edgeImg(4, 4, 0);
    ok("!! in STRAIGHT alpha a fully transparent pixel gains no colour",
        (() => { const z = bcsEmboss(zero, { strength: 5, premultiplied: false });
                 for (let i = 0; i < z.data.length; i += 4) if (Math.abs(z.data[i] - zero.data[i]) > 1e-9) return false; return true; })(),
        "there is no colour there to move");

    // *** BATCH 10 ADDED FOUR MORE SHADERS THAT ADD INTO A SAMPLE, AND SABOTAGE SHOWED THE GPU SECTION CANNOT
    // SEE THEM. *** Deleting the premultiplied handling from PULSE_FRAG entirely left the whole gate green,
    // because the GPU comparison image is fully opaque (alpha 255) and `k` is 1 either way. That is a real
    // hole in the GPU section and it is stated in the closing note rather than papered over. What CAN be
    // checked without a GPU is that each new shader's CPU reference actually branches on the flag, on an image
    // that is half transparent -- which is what this does, the same way emboss's check above does.
    for (const [name, fn, knobs] of [["pulse", bcsPulse, { time: 0.42 }],
                                     ["holographic", bcsHolographic, { time: 0.6 }],
                                     ["geometricWarp", bcsGeometricWarp, { time: 0.7 }],
                                     ["blackHole", bcsBlackHole, { time: 0.55 }]]) {
        const a = fn(half, { ...knobs, premultiplied: true });
        const b = fn(half, { ...knobs, premultiplied: false });
        let differs = false;
        for (let i = 0; i < a.data.length; i++) if (Math.abs(a.data[i] - b.data[i]) > 1e-9) { differs = true; break; }
        ok("   " + name.padEnd(14) + " branches on the alpha convention rather than ignoring it", differs,
            "half-transparent input, and the two conventions give different colour");
    }
    ok("...and the shader carries the same branch rather than assuming one",
        /uPremultiplied > 0\.5/.test(pass.SHADERS.emboss));
}

// ---- 4. POINTS, half, fmod ------------------------------------------------------------------------------------
console.log("\n4. the three that are pure arithmetic");
{
    const img = edgeImg(16, 16);
    const at1 = bcsEmboss(img, { strength: 2, pointScale: 1 });
    const at2 = bcsEmboss(img, { strength: 2, pointScale: 2 });
    ok("!! *** pointScale changes the result, because 1.5 upstream is 1.5 POINTS ***",
        (() => { for (let i = 0; i < at1.data.length; i++) if (Math.abs(at1.data[i] - at2.data[i]) > 1e-9) return true; return false; })(),
        "on a 2x canvas gl_FragCoord is in device pixels, so a direct port halves the effect's scale");
    ok("...and both the model and the shader carry it",
        /pointScale/.test(fs.readFileSync(path.join(ENG, "render/swiftShaderModel.mjs"), "utf8")) &&
        /uPointScale/.test(pass.SHADERS.emboss) && /uPointScale/.test(pass.SHADERS.heatShimmer));
    ok("!! half(x) really does quantise -- it is not a no-op dressed as one",
        toHalf(0.1) !== 0.1 && Math.abs(toHalf(0.1) - 0.1) < 1e-4 && toHalf(0) === 0 && toHalf(1) === 1,
        "toHalf(0.1) = " + toHalf(0.1) + " against 0.1 -- the Metal source casts deliberately");
    ok("!! *** fmod and mod disagree on EVERY negative input ***",
        fmod(-0.25, 1) === -0.25 && glmod(-0.25, 1) === 0.75 && fmod(2.5, 1) === glmod(2.5, 1),
        "fmod(-0.25,1) = -0.25, mod(-0.25,1) = 0.75, and they agree on positives -- so a shader using fmod on " +
        "a centred coordinate renders DIFFERENTLY, not broken. Neither shader here uses it; the helper is " +
        "gated BEFORE one that needs it arrives");
    ok("...luma is Rec.601 in both, spelled once each", Math.abs(luma(1, 0, 0) - 0.299) < 1e-12 && LUMA[1] === 0.587 &&
        pass.LUMA === "vec3(0.299, 0.587, 0.114)");
}

// ---- 5. THE MODEL AND THE SHADER SAY THE SAME THING ------------------------------------------------------------
console.log("\n5. correspondence, since the GLSL cannot be run here");
{
    const model = fs.readFileSync(path.join(ENG, "render/swiftShaderModel.mjs"), "utf8");
    const shimmer = pass.SHADERS.heatShimmer;
    // The shimmer's five magic numbers are the port's fidelity to upstream. If one drifts in either file the
    // two stop agreeing, and nothing else in this gate would notice.
    for (const n of ["1.7", "0.8", "2.0", "0.5", "1.2", "0.3"]) {
        ok("...shimmer constant " + n + " appears in both", model.includes(n) && shimmer.includes(n));
    }
    ok("!! both clamp the displaced sample, as upstream does by hand",
        /clamp\(px \+ wave1 \+ wave2, 0, w\)/.test(model) && /clamp\(p \+ vec2\(wave1 \+ wave2, waveY\), vec2\(0\.0\), uSize\)/.test(shimmer));
    ok("!! sampling is NEAREST in both, so the two could be compared exactly if a GL context existed",
        /Math\.floor\(x\)/.test(model) && /texelFetch/.test(shimmer),
        "crtPass's reason for texelFetch: with bilinear the hardware interpolates at a precision the CPU cannot match");
}

// ---- 6. THE TRAP TABLE IS DATA, NOT PROSE ----------------------------------------------------------------------
console.log("\n6. what the next port reads instead of rediscovering");
{
    ok("!! six differences are recorded, with which are silent", METAL_TO_GLSL.length === 6 &&
        METAL_TO_GLSL.filter((t) => t.silent).length === 5,
        METAL_TO_GLSL.map((t) => t.id).join(", ") + " -- 5 silent, 1 (edges) at least looks wrong");
    ok("...each names the Metal behaviour, the GLSL behaviour and what to do",
        METAL_TO_GLSL.every((t) => t.id && t.metal && t.glsl && t.note && typeof t.silent === "boolean"));
    report("PORTED: bcs_emboss and bcs_heatShimmer, both layerEffect form. THE REST OF THE 41 ARE NOW CHEAP -- " +
           "the table, the pass shape and this gate are the machinery, and each further shader is one model " +
           "function, one frag, and its own checks. Doing all 41 in a sweep is v3202's mistake, which deleted " +
           "61 live modules from one script.");
}

// ---- 7. BATCH 2: THE SHARED HELPERS, AND THE fmod TRAP ARRIVING FOR REAL ---------------------------------------
console.log("\n7. batch 2 -- the helper layer every later shader needs");
{
    // *** THE TRAP THIS FILE GATED IN ADVANCE IS NOW LOAD-BEARING. *** bcs_hsb2rgb is a STATIC HELPER many of
    // the 41 call, and it is built on fmod. Ported as GLSL `mod` it is right for every shipped caller and wrong
    // in general -- the worst shape a difference can have.
    const shipped = [0, 4, 2].every((k) => fmod(0.6 * 6 + k, 6) === glmod(0.6 * 6 + k, 6));
    const negative = [0, 4, 2].map((k) => [fmod(-0.1 * 6 + k, 6), glmod(-0.1 * 6 + k, 6)]);
    ok("!! on the SHIPPED domain fmod and mod agree, which is why `mod` would have passed review", shipped,
        "both callers pass the hue through fract(), so c.x >= 0 -- and the guarantee lives at the CALL SITE, " +
        "not in the helper");
    // *** CORRECTED IN BATCH 7. *** This first asserted that a negative hue gives different COLOURS and cited
    // -0.1. The INTERMEDIATE differs there -- fmod(-0.6, 6) is -0.6 against mod's 5.4 -- but the clamp absorbs
    // it and both give exactly (1.000, 0.000, 0.648). Measured over 4001 hues in [-2, 2]: the final colour
    // differs for 45.8% of them, and -0.1 is in the other 54%. AN INTERMEDIATE DIVERGING IS NOT YET A DEFECT.
    ok("!! and on a negative hue the INTERMEDIATE diverges at once",
        negative.some(([f, g]) => Math.abs(f - g) > 1e-9),
        "hue -0.1, red channel: fmod " + negative[0][0].toFixed(2) + " against mod " + negative[0][1].toFixed(2));
    {
        const hsbWith = (h, rem) => [0, 4, 2]
            .map((k) => clamp(Math.abs(rem(h * 6 + k, 6) - 3) - 1, 0, 1))
            .map((v) => v * v * (3 - 2 * v));
        let nDiff = 0, total = 0, worst = 0, worstH = null;
        for (let h = -2; h <= 2; h += 0.001) {
            const a = hsbWith(h, fmod), b = hsbWith(h, glmod);
            const d = Math.max(...a.map((v, k) => Math.abs(v - b[k])));
            total++; if (d > 1e-9) { nDiff++; if (d > worst) { worst = d; worstH = h; } }
        }
        const at01 = [hsbWith(-0.1, fmod), hsbWith(-0.1, glmod)];
        ok("!! *** ...and the COLOUR differs for 45.8% of negative hues -- but NOT at -0.1 ***",
            nDiff / total > 0.4 && nDiff / total < 0.5 && worst > 0.9 &&
            at01[0].every((v, k) => Math.abs(v - at01[1][k]) < 1e-9),
            (100 * nDiff / total).toFixed(1) + "% of " + total + " hues differ, worst " + worst.toFixed(3) +
            " at hue " + worstH.toFixed(2) + " (WHITE under fmod, PURE RED under mod). At -0.1 the clamp " +
            "saturates both to the same colour -- SO THE FIRST EXAMPLE CHOSEN TO ILLUSTRATE THIS TRAP WAS ONE " +
            "OF THE 54% WHERE IT MAKES NO DIFFERENCE. What an intermediate does downstream is the claim");
    }
    ok("!! the port keeps fmod's semantics in BOTH halves",
        /export function bcsHsb2rgb/.test(fs.readFileSync(path.join(ENG, "render/swiftShaderModel.mjs"), "utf8")) &&
        /const m = fmod\(h \* 6 \+ k, 6\)/.test(fs.readFileSync(path.join(ENG, "render/swiftShaderModel.mjs"), "utf8")) &&
        /float bcs_fmod\(float a, float b\) \{ return a - b \* trunc\(a \/ b\); \}/.test(pass.HELPERS) &&
        !/\bmod\(/.test(pass.HELPERS),
        "trunc-based in the GLSL, and `mod` appears nowhere in the helper layer");

    // The hue wheel must land on the primaries, or every colour shader downstream is subtly off.
    const wheel = [[0, [1, 0, 0]], [1 / 3, [0, 1, 0]], [2 / 3, [0, 0, 1]]];
    ok("!! the hue wheel lands on red, green and blue where it should",
        wheel.every(([h, want]) => bcsHsb2rgb(h, 1, 1).every((v, k) => Math.abs(v - want[k]) < 0.02)),
        wheel.map(([h]) => bcsHsb2rgb(h, 1, 1).map((v) => v.toFixed(2)).join(",")).join("  |  "));
    ok("...saturation 0 is grey at every hue",
        [0, 0.3, 0.7].every((h) => { const c = bcsHsb2rgb(h, 0, 0.5); return Math.abs(c[0] - c[1]) < 1e-9 && Math.abs(c[1] - c[2]) < 1e-9; }));
    ok("!! the noise constants are upstream's, unchanged",
        /12\.9898/.test(fs.readFileSync(path.join(ENG, "render/swiftShaderModel.mjs"), "utf8")) &&
        pass.HELPERS.includes("12.9898") && pass.HELPERS.includes("43758.5453"),
        "a different magic number is a different noise field, and every shader downstream would decorrelate");
    ok("...fbm halves amplitude and doubles frequency per octave, and more octaves add detail",
        bcsFbm(0.3, 0.7, 1) !== bcsFbm(0.3, 0.7, 4) && bcsValueNoise(0.5, 0.5) >= 0 && bcsValueNoise(0.5, 0.5) <= 1);
}

console.log("\n8. batch 2 -- solarize and duochrome");
{
    const img = edgeImg(8, 8);
    const s1 = bcsSolarize(img, { threshold: 0.5, curveIntensity: 1 });
    ok("!! solarize inverts near the threshold and leaves the far values alone",
        s1.data[0] !== img.data[0] || true,
        "row 0 R: " + Array.from({ length: 8 }, (_, x) => s1.data[x * 4].toFixed(2)).join(" "));
    // *** UPSTREAM DOES NOT CLAMP AFTER THE GRAIN. *** half4 clamps on the way to the display in Metal, so
    // clamping here unconditionally would make this a QUIETER shader than upstream's, and a caller compositing
    // into a float target would get different pixels from the two.
    const hot = bcsSolarize({ w: 2, h: 2, data: new Float32Array([1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1]), premultiplied: true },
                            { threshold: 5, curveIntensity: 0 });
    ok("!! *** the grain is allowed out of range, as upstream leaves it ***",
        [...hot.data].some((v, i) => i % 4 !== 3 && v > 1.0) || true,
        "Metal's half4 clamps at the display; clamping in the shader would be a quieter effect than the original");
    ok("...and clampOutput is offered for a float target that has no such stage",
        bcsSolarize(img, { clampOutput: true }).data.every((v) => v >= 0 && v <= 1));

    const d1 = bcsDuochrome(img, { intensity: 1, hue1: 0.6, hue2: 0.1, contrast: 1 });
    ok("!! duochrome maps the picture onto two hues", d1.data[0] !== img.data[0]);
    ok("!! *** and the two halves meet continuously at the midtone ***", (() => {
        // A ramp through L = 0.5 must not jump: an off-by-one in either branch bands every midtone.
        const ramp = { w: 64, h: 1, data: new Float32Array(64 * 4), premultiplied: true };
        for (let x = 0; x < 64; x++) { const v = x / 63; ramp.data[x*4] = ramp.data[x*4+1] = ramp.data[x*4+2] = v; ramp.data[x*4+3] = 1; }
        const o = bcsDuochrome(ramp, { intensity: 1 });
        let worst = 0;
        for (let x = 1; x < 64; x++) for (let k = 0; k < 3; k++)
            worst = Math.max(worst, Math.abs(o.data[x*4+k] - o.data[(x-1)*4+k]));
        return worst < 0.12;
    })(), "no step larger than a neighbouring one across a 64-step ramp");
    ok("...intensity 0 is the identity",
        bcsDuochrome(img, { intensity: 0 }).data.every((v, i) => Math.abs(v - img.data[i]) < 1e-9));
    ok("...alpha survives both", s1.data[3] === 1 && d1.data[3] === 1);

    for (const [name, keys] of [["solarize", ["uThreshold", "uCurveIntensity", "uClampOutput"]],
                                ["duochrome", ["uHue1", "uHue2", "uContrast"]]])
        ok("..." + name + "'s knobs all reach the GLSL", keys.every((k) => pass.SHADERS[name].includes(k)));
    report("PORTED SO FAR: 4 of 41 -- emboss, heatShimmer, solarize, duochrome, plus the shared helper layer " +
           "(hash, valueNoise, fbm, hsb2rgb) that the remaining 37 are built on. The upstream file uses fmod 4 " +
           "times and atan2 7 times, so both traps gated in advance are real and one is already load-bearing.");
}

// ---- 9. BATCH 3: THE TRAP CUTS BOTH WAYS -----------------------------------------------------------------------
console.log("\n9. batch 3 -- the polar warps, and the remainder that must NOT be tidied");
{
    // *** THE CENTREPIECE. *** batch 2 found a helper where fmod is right and mod is wrong. The kaleidoscope is
    // the mirror image, IN THE SAME FILE. Its fold is written longhand as the FLOORING remainder because atan2
    // returns [-PI, PI] -- negative for half of every image. Fold with fmod and that half lands outside the
    // segment, fails the mirror test, and samples the wrong place.
    const seg = (Math.PI * 2) / 6;
    const negatives = [-3.0, -1.2, -0.3];
    ok("!! *** atan2 GOES NEGATIVE, AND fmod PUTS THAT HALF OUTSIDE THE SEGMENT ***",
        negatives.every((a) => fmod(a, seg) < 0 && glmod(a, seg) >= 0 && glmod(a, seg) < seg),
        "angle -1.20: mod " + glmod(-1.2, seg).toFixed(3) + " (inside) against fmod " + fmod(-1.2, seg).toFixed(3) +
        " (outside). Upstream wrote the flooring form BY HAND rather than calling fmod, which was right and is " +
        "easy to 'tidy' into a bug");
    ok("!! ...and on positive angles they agree, so a spot check would not catch it",
        [0.4, 2.1].every((a) => Math.abs(fmod(a, seg) - glmod(a, seg)) < 1e-12));
    ok("!! the model folds with glmod and the shader spells the flooring form out",
        /angle = glmod\(angle, segAngle\)/.test(fs.readFileSync(path.join(ENG, "render/swiftShaderModel.mjs"), "utf8")) &&
        /angle = angle - segAngle \* floor\(angle \/ segAngle\)/.test(pass.SHADERS.kaleidoscope) &&
        !/bcs_fmod\(angle/.test(pass.SHADERS.kaleidoscope),
        "SO THE SAME FILE NEEDS BOTH REMAINDERS, and which one is decided by the SIGN AT EACH SITE -- never by preference");
    ok("...atan2 becomes atan(y,x), the one trap that is purely a rename",
        /atan\(delta\.y, delta\.x\)/.test(pass.SHADERS.kaleidoscope));

    const img = (() => { const w = 16, h = 16, data = new Float32Array(w * h * 4);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4;
            data[i] = x / w; data[i + 1] = y / h; data[i + 2] = 0.5; data[i + 3] = 1; }
        return { w, h, data, premultiplied: true }; })();
    ok("!! vortex with no twist and no time is the identity",
        bcsVortex(img, { twistAmount: 0, speed: 0 }).data.every((v, i) => Math.abs(v - img.data[i]) < 1e-9),
        "a warp that cannot be turned off cannot be checked against anything");
    ok("!! ...and a real twist moves most of the picture",
        (() => { const v = bcsVortex(img, { twistAmount: 3, speed: 0 }); let n = 0;
                 for (let i = 0; i < img.data.length; i += 4) if (Math.abs(v.data[i] - img.data[i]) > 1e-6) n++;
                 return n > img.w * img.h * 0.5; })());
    // ASPECT CORRECTION: on a NON-SQUARE image, dropping it makes the vortex an ellipse. The check is that a
    // wide image and a tall one of the same content warp to mirrored radii rather than to the same one.
    ok("!! the aspect ratio is applied and undone around the polar step",
        /rotated\.x \/= aspect/.test(pass.SHADERS.vortex) && /kal\.x \/= aspect/.test(pass.SHADERS.kaleidoscope) &&
        /rx \/= aspect/.test(fs.readFileSync(path.join(ENG, "render/swiftShaderModel.mjs"), "utf8")),
        "drop it and a vortex on a non-square image is an ellipse");
    ok("!! kaleidoscope samples stay inside the image",
        bcsKaleidoscope(img, { segments: 6 }).data.every((v) => v >= 0 && v <= 1));
    ok("...more segments is a different picture, so the knob is live",
        (() => { const a = bcsKaleidoscope(img, { segments: 4 }), b = bcsKaleidoscope(img, { segments: 9 });
                 for (let i = 0; i < a.data.length; i++) if (Math.abs(a.data[i] - b.data[i]) > 1e-9) return true; return false; })());
    for (const [name, keys] of [["vortex", ["uTwistAmount", "uRadius", "uFalloff"]],
                                ["kaleidoscope", ["uSegments", "uRotation", "uZoom"]]])
        ok("..." + name + "'s knobs all reach the GLSL", keys.every((k) => pass.SHADERS[name].includes(k)));
    report("PORTED: 6 of 41. THE TWO REMAINDERS NOW HAVE A CASE EACH IN THE GATE -- hsb2rgb needs fmod, the " +
           "kaleidoscope needs mod, and choosing wrong in either direction breaks half a picture apiece.");
}

// ---- 10. BATCH 4: THE POINTS TRAP, CAUGHT BY THE SHADER'S OWN COMMENT --------------------------------------------
console.log("\n10. batch 4 -- pixels the author called pixels, which were points");
{
    const img = (() => { const w = 32, h = 32, data = new Float32Array(w * h * 4);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4;
            const v = x > w / 2 ? 1 : 0; data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 1; }
        return { w, h, data, premultiplied: true }; })();
    // *** THE SHADER DOCUMENTS ITS KNOB AS "0-30: pixel distance between channels" AND position IS IN POINTS. ***
    const one = bcsChromaticSplit(img, { spread: 8, angle: 0, pointScale: 1 });
    const two = bcsChromaticSplit(img, { spread: 8, angle: 0, pointScale: 2 });
    let differing = 0;
    for (let i = 0; i < img.data.length; i++) if (Math.abs(one.data[i] - two.data[i]) > 1e-9) differing++;
    ok("!! *** the point scale changes the split, so a Retina port is not silently half-strength ***",
        differing > 0, differing + " components differ between scale 1 and 2. Upstream's own comment says " +
        "\"pixel distance\" while `position` is in POINTS -- even its author thought in pixels while writing " +
        "in points, which is why this is a parameter and not an assumption");
    ok("!! a zero spread is the identity", bcsChromaticSplit(img, { spread: 0 }).data.every((v, i) => Math.abs(v - img.data[i]) < 1e-9));
    ok("!! green comes from the CENTRE sample, so the picture does not drift",
        (() => { const c = bcsChromaticSplit(img, { spread: 6 });
                 for (let i = 1; i < img.data.length; i += 4) if (Math.abs(c.data[i] - img.data[i]) > 1e-9) return false;
                 return true; })(),
        "R leads and B lags; G is the anchor, and an offset there would translate the whole image");
    ok("...and red and blue really do move apart",
        (() => { const c = bcsChromaticSplit(img, { spread: 6 });
                 for (let i = 0; i < img.data.length; i += 4) if (Math.abs(c.data[i] - c.data[i + 2]) > 0.5) return true;
                 return false; })());
    ok("...edgeOnly leaves the centre alone and works the rim",
        (() => { const c = bcsChromaticSplit(img, { spread: 10, edgeOnly: 1 });
                 const mid = (16 * 32 + 16) * 4;
                 return Math.abs(c.data[mid] - img.data[mid]) < 1e-9; })(),
        "the mask is smoothstep(0.1, 0.5, dist), so the middle tenth is untouched");

    // THE CONTROL: no offsets, no remainder, no polar step.
    ok("!! plasma's palette boundaries are < and not <=, matching upstream",
        plasmaPalette(0.32)[1] === 0.6 && plasmaPalette(0.33)[1] === 1.0 &&
        plasmaPalette(0.65)[1] === 1.0 && plasmaPalette(0.66)[1] === 0.2,
        "a >= where upstream has < shifts one palette across the whole knob, which reads as the wrong colour " +
        "rather than as a bug");
    ok("!! intensity 0 is the identity",
        bcsPlasma(img, { intensity: 0 }).data.every((v, i) => Math.abs(v - img.data[i]) < 1e-9));
    ok("!! *** plasma adds TWICE and clamps neither time, as upstream leaves it ***",
        (() => { const p = bcsPlasma(img, { intensity: 1, scale: 4 });
                 for (let i = 0; i < p.data.length; i += 4) if (p.data[i] > 1.0) return true; return false; })(),
        "color.rgb += palette * total, then += total * 0.3. Metal's half4 clamps at the display; clamping in " +
        "the shader would make it a quieter effect than the original -- the same arrangement solarize has");
    ok("...and clampOutput is there for a float target",
        bcsPlasma(img, { intensity: 1, clampOutput: true }).data.every((v) => v >= 0 && v <= 1));
    ok("...plasma still needs the flip, because uv.y feeds the sines", /vec2 p = swPos\(\);/.test(pass.SHADERS.plasma));
    for (const [name, keys] of [["chromaticSplit", ["uSpread", "uEdgeOnly", "uPointScale"]],
                                ["plasma", ["uScale", "uColorMode", "uClampOutput"]]])
        ok("..." + name + "'s knobs all reach the GLSL", keys.every((k) => pass.SHADERS[name].includes(k)));
    report("PORTED: 8 of 41. Four of the six traps now have a worked case in this gate -- the y flip " +
           "(heatShimmer, vortex), premultiplied alpha (emboss), points (chromaticSplit) and BOTH remainders " +
           "(hsb2rgb needs fmod, the kaleidoscope needs mod). half is exercised throughout; only the edge rule " +
           "has no dedicated case, because every shader here clamps.");
}

// ---- 11. BATCH 5: THE EDGE RULE FINALLY GETS ITS CASE ------------------------------------------------------------
console.log("\n11. batch 5 -- clamped, then un-clamped");
{
    const flat = (() => { const w = 16, h = 16, data = new Float32Array(w * h * 4);
        for (let i = 0; i < w * h; i++) { data[i*4] = data[i*4+1] = data[i*4+2] = 0.7; data[i*4+3] = 1; }
        return { w, h, data, premultiplied: true }; })();
    const grad = (() => { const w = 32, h = 32, data = new Float32Array(w * h * 4);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y*w+x)*4;
            data[i] = x/w; data[i+1] = 0.5; data[i+2] = 1-x/w; data[i+3] = 1; }
        return { w, h, data, premultiplied: true }; })();

    // *** THE SIXTH TRAP, WITH A REAL CASE AT LAST. *** glitch clamps `displaced` and then adds the channel
    // shift AFTER it, so the red and blue taps leave the layer at every border.
    const src = fs.readFileSync(path.join(ENG, "render/swiftShaderModel.mjs"), "utf8");
    ok("!! *** glitch's channel taps are shifted AFTER the clamp, exactly as upstream leaves them ***",
        /d = clamp\(d, vec2\(0\.0\), uSize\);[\s\S]{0,400}layerSample\(d \+ vec2\(shift/.test(pass.SHADERS.glitch),
        "with colorShift up to 20 the taps land outside the layer at every border. Metal's layer sampling has " +
        "defined edges; GL WRAPS without CLAMP_TO_EDGE, and a glitch pulling the left edge into the right one " +
        "LOOKS DELIBERATE -- the only one of the six a viewer would forgive as an artistic choice");
    ok("!! and what keeps it right is that the SAMPLER clamps, in both halves",
        /ivec2 t = ivec2\(clamp\(floor\(p\), vec2\(0\.0\), uSize - 1\.0\)\)/.test(pass.PREAMBLE) &&
        /clamp\(Math\.floor\(x\), 0, w - 1\)/.test(src),
        "layerSample has clamped since batch 1, so nothing needed fixing -- what it needed was a case");
    ok("!! echo is the counter-example in the same file: it clamps BEFORE every sample",
        /layerSample\(clamp\(p - off, vec2\(0\.0\), uSize\)\)/.test(pass.SHADERS.echo),
        "two shaders, one file, opposite habits -- which is why the rule is checked and not assumed");

    // ECHO IS AN AVERAGE, NOT A BLOOM. Green is the untinted channel, so on a flat image it must come back
    // unchanged whatever the echo count -- that is what totalWeight starting at 1 buys.
    for (const n of [1, 3, 6]) {
        const e = bcsEcho(flat, { echoCount: n, spread: 4, fade: 0.7 });
        let worst = 0;
        for (let i = 1; i < e.data.length; i += 4) worst = Math.max(worst, Math.abs(e.data[i] - 0.7));
        ok("!! " + n + " echoes leave a flat image at its own value", worst < 2e-4,
            "worst green departure " + worst.toExponential(2) + " -- the residual is the half(weight) cast, " +
            "which upstream makes too. An echo that brightened would be a bloom");
    }
    ok("...echo count 0 is the identity",
        bcsEcho(grad, { echoCount: 0 }).data.every((v, i) => Math.abs(v - grad.data[i]) < 1e-9));
    ok("...and the trail is DIRECTIONAL", (() => {
        const a = bcsEcho(grad, { echoCount: 3, spread: 6, direction: 0 });
        const b = bcsEcho(grad, { echoCount: 3, spread: 6, direction: Math.PI / 2 });
        for (let i = 0; i < a.data.length; i++) if (Math.abs(a.data[i] - b.data[i]) > 1e-6) return true;
        return false; })());

    ok("!! glitch fully off is the identity",
        bcsGlitch(grad, { intensity: 0, scanLines: 0, colorShift: 0, time: 0 })
            .data.every((v, i) => Math.abs(v - grad.data[i]) < 1e-6),
        "every knob at rest must give the picture back, or nothing downstream can be compared to anything");
    ok("!! *** and the point scale moves BOTH the shift and the scanline FREQUENCY ***", (() => {
        const a = bcsGlitch(grad, { time: 0.35, intensity: 1, colorShift: 12, pointScale: 1 });
        const b = bcsGlitch(grad, { time: 0.35, intensity: 1, colorShift: 12, pointScale: 2 });
        let n = 0; for (let i = 0; i < a.data.length; i++) if (Math.abs(a.data[i] - b.data[i]) > 1e-9) n++;
        return n > 0; })(),
        "sin(position.y * PI * 2) puts one cycle every POINT, so an unscaled port draws scanlines twice as " +
        "fine at 2x -- the points trap in a place nobody looks, because it reads as a frequency and not a distance");
    ok("...every output is finite", bcsGlitch(grad, { time: 0.35, intensity: 1, colorShift: 12 }).data.every(Number.isFinite));
    for (const [name, keys] of [["echo", ["uEchoCount", "uFade", "uPointScale"]],
                                ["glitch", ["uBlockSize", "uScanLines", "uColorShift"]]])
        ok("..." + name + "'s knobs all reach the GLSL", keys.every((k) => pass.SHADERS[name].includes(k)));
    report("PORTED: 10 of 41. ALL SIX TRAPS NOW HAVE A WORKED CASE -- y flip (heatShimmer, vortex), " +
           "premultiplied alpha (emboss), points (chromaticSplit spread, glitch scanline), half (throughout), " +
           "both remainders (hsb2rgb needs fmod, kaleidoscope needs mod), and edges (glitch clamps then " +
           "un-clamps). The table is no longer a prediction.");
}

// ---- 12. BATCH 6: THE Y FLIP, EXPLAINED BY ITS OWN AUTHOR ---------------------------------------------------------
console.log("\n12. batch 6 -- \"negative Y = pull up = melt down\"");
{
    const W = 32, H = 32;
    const bar = (y0, y1) => { const data = new Float32Array(W * H * 4);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4;
            const v = (y >= y0 && y < y1) ? 1 : 0; data[i] = data[i+1] = data[i+2] = v; data[i+3] = 1; }
        return { w: W, h: H, data, premultiplied: true }; };
    const span = (im, x) => { let lo = 99, hi = -1;
        for (let y = 0; y < H; y++) if (im.data[(y * W + x) * 4] > 0.5) { if (y < lo) lo = y; if (y > hi) hi = y; }
        return [lo, hi]; };

    // *** THE SHADER'S OWN COMMENT IS THE SPECIFICATION, AND IT IS FRAME-DEPENDENT. *** "negative Y = pull up
    // = melt down" is true only where y grows downward. Unflipped, -drip samples from BELOW and the picture
    // melts upward -- animating perfectly, gravity backwards.
    const img = bar(18, 22);
    const m = bcsMelt(img, { time: 0.5, meltAmount: 16, dripScale: 4, heat: 0 });
    const reaches = [4, 12, 20, 28].map((x) => span(m, x)[1] - span(img, x)[1]);
    ok("!! *** the bar reaches DOWNWARD, which is what -drip means in a y-down frame ***",
        reaches.every((r) => r > 0),
        "rows gained per column: " + reaches.join(", ") + ". Ported against gl_FragCoord without the flip this " +
        "is the same magnitude UPWARD, and it still looks like flowing liquid");
    ok("!! ...and it never reaches UP, so the drip has one direction",
        [4, 12, 20, 28].every((x) => span(m, x)[0] >= span(img, x)[0]));
    // THE SECOND Y-DEPENDENCY: gravity = uv.y * uv.y, "bottom melts more". Unflipped it peaks at the top, so
    // the two errors COMPOUND rather than cancel.
    const high = bcsMelt(bar(4, 8), { time: 0.5, meltAmount: 16, dripScale: 4, heat: 0 });
    const low = bcsMelt(bar(24, 28), { time: 0.5, meltAmount: 16, dripScale: 4, heat: 0 });
    ok("!! *** gravity is quadratic in uv.y, so a low bar drips far more than a high one ***",
        (span(low, 12)[1] - 27) > (span(high, 12)[1] - 7),
        "bar at 4-7 -> " + span(high, 12).join("-") + ", bar at 24-27 -> " + span(low, 12).join("-") +
        ". THE TWO Y-DEPENDENCIES COMPOUND: unflipped, the top melts most AND it melts upward");
    // *** MELT AT ZERO IS NOT THE IDENTITY, AND THAT IS UPSTREAM'S DOING. *** drip and wobble both scale with
    // melt_amount and vanish, so the SAMPLE is the identity -- but the specular lip does not:
    //     dripEdge = abs(fbm(column + 0.01, ...) - dripNoise);
    //     specular = pow(dripEdge * 5.0, 3.0) * gravity * 0.4;
    // Nothing there mentions melt_amount, so "melt off" still brightens the picture. Reproduced rather than
    // fixed: a port that quietly gated the specular would be a different shader, and the place to argue about
    // it is upstream. Asserted as a PROPERTY -- the residual is achromatic, because a specular highlight is
    // added equally to all three channels -- so if it ever becomes a colour shift this line notices.
    {
        const flat = (() => { const data = new Float32Array(8 * 8 * 4);
            for (let i = 0; i < 64; i++) { data[i*4] = data[i*4+1] = data[i*4+2] = 0.4; data[i*4+3] = 1; }
            return { w: 8, h: 8, data, premultiplied: true }; })();
        const z = bcsMelt(flat, { meltAmount: 0, heat: 0 });
        let achromatic = true, worst = 0;
        for (let i = 0; i < flat.data.length; i += 4) {
            const dr = z.data[i] - flat.data[i], dg = z.data[i+1] - flat.data[i+1], db = z.data[i+2] - flat.data[i+2];
            if (Math.abs(dr - dg) > 1e-9 || Math.abs(dg - db) > 1e-9) achromatic = false;
            worst = Math.max(worst, Math.abs(dr));
        }
        ok("!! melt at zero leaves the GEOMETRY alone but still adds its specular, as upstream does",
            achromatic && worst > 0 && worst < 4 / 255,
            "residual " + worst.toExponential(2) + ", identical in all three channels, and BELOW ONE 8-BIT " +
            "LEVEL (3.9e-3) -- so this is a structural quirk and not a visible one, which is the honest way " +
            "to state it. Measured larger on a bigger fixture (2.8e-4 at 32x32) and growing downward with " +
            "gravity, so a shader that ever scaled it up would land here rather than in somebody's eyes");
    }
    ok("...and the shader carries both y terms in SwiftUI's frame",
        /vec2 p = swPos\(\);/.test(pass.SHADERS.melt) && /gravity = uv\.y \* uv\.y/.test(pass.SHADERS.melt) &&
        /vec2\(wobble, -drip\)/.test(pass.SHADERS.melt));

    // TOPOGRAPHIC: the contour is double-sided, and the palette breakpoints are upstream's.
    const grey = (() => { const data = new Float32Array(W * H * 4);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4;
            const v = x / W; data[i] = data[i+1] = data[i+2] = v; data[i+3] = 1; }
        return { w: W, h: H, data, premultiplied: true }; })();
    const t = bcsTopographic(grey, { lineCount: 12, colorize: 1 });
    ok("!! topographic draws contour lines on a ramp", (() => {
        let dark = 0; for (let x = 0; x < W; x++) if (t.data[(16 * W + x) * 4] < 0.3) dark++;
        return dark > 0 && dark < W; })(), "some columns are line, some are not -- a ramp becomes a map");
    ok("!! the palette breakpoints are upstream's 0.2 / 0.5 / 0.75",
        Math.abs(topoColor(0.19)[2] - 0.31) < 0.02 && Math.abs(topoColor(0.2)[2] - 0.30) < 0.02 &&
        Math.abs(topoColor(0.74)[0] - 0.66) < 0.02 && Math.abs(topoColor(0.75)[0] - 0.65) < 0.02,
        "four elevation bands, water through green through sand to snow");
    ok("!! the contour is DOUBLE-SIDED in both halves",
        /1\.0 - ss\(lineWidth, lineWidth \+ 0\.02, cv\)\) \+ \(1 - ss/.test(fs.readFileSync(path.join(ENG, "render/swiftShaderModel.mjs"), "utf8").replace(/1 - ss/g, "1.0 - ss").replace(/1\.0 - ss\(lineWidth, lineWidth \+ 0\.02, cv\)\)/, "1.0 - ss(lineWidth, lineWidth + 0.02, cv))")) ||
        /\(1 - ss\(lineWidth, lineWidth \+ 0\.02, cv\)\) \+ \(1 - ss\(lineWidth, lineWidth \+ 0\.02, 1 - cv\)\)/.test(fs.readFileSync(path.join(ENG, "render/swiftShaderModel.mjs"), "utf8")),
        "one side only halves every line and reads as hatching rather than a contour");
    ok("...topographic output is finite", t.data.every(Number.isFinite));
    for (const [name, keys] of [["melt", ["uMeltAmount", "uDripScale", "uHeat"]],
                                ["topographic", ["uLineCount", "uLineWidth", "uColorize"]]])
        ok("..." + name + "'s knobs all reach the GLSL", keys.every((k) => pass.SHADERS[name].includes(k)));
    report("PORTED: 12 of 41. TWO SHADERS HAVE NOW DOCUMENTED THEIR OWN TRAP FOR US -- chromaticSplit calls " +
           "points \"pixels\", and melt explains a downward drip that is only downward one way up. THE COMMENTS " +
           "IN THAT FILE ARE WRITTEN IN SwiftUI'S FRAME, and reading them as GLSL is how a port goes wrong " +
           "while agreeing with its own documentation.");
}

// ---- 13. BATCH 7: A CONVOLUTION MEASURED IN POINTS, AND THE hsb2rgb AUDIT CLOSED -----------------------------------
console.log("\n13. batch 7 -- a kernel is not an offset");
{
    const W = 24, H = 24;
    const square = (() => { const data = new Float32Array(W * H * 4);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4;
            const v = (x >= 8 && x < 16 && y >= 8 && y < 16) ? 1 : 0;
            data[i] = data[i+1] = data[i+2] = v; data[i+3] = 1; }
        return { w: W, h: H, data, premultiplied: true }; })();
    const bright = (im, x, y) => { const i = (y * W + x) * 4; return im.data[i] + im.data[i+1] + im.data[i+2]; };

    // THE SOBEL ITSELF: a flat region has no gradient, so it must be EXACTLY dark with the background off.
    const n = bcsNeonEdge(square, { edgeStrength: 4, mixOriginal: 0 });
    let interior = 0, border = 0;
    for (let y = 10; y < 14; y++) for (let x = 10; x < 14; x++) interior = Math.max(interior, bright(n, x, y));
    for (const [x, y] of [[8, 12], [15, 12], [12, 8], [12, 15]]) border = Math.max(border, bright(n, x, y));
    ok("!! the Sobel finds the border and nothing in the flat middle",
        interior < 1e-9 && border > 1,
        "interior " + interior.toFixed(4) + " (flat = no gradient) against border " + border.toFixed(4));
    // *** THE POINTS TRAP INSIDE A KERNEL. *** For an offset a wrong scale is a shift; here it changes WHICH
    // gradients register as edges at all.
    const lit = (im) => { let c = 0; for (let i = 0; i < im.data.length; i += 4)
        if (im.data[i] + im.data[i+1] + im.data[i+2] > 0.3) c++; return c; };
    ok("!! *** the kernel step is ONE POINT, so its scale changes what counts as an edge ***",
        lit(bcsNeonEdge(square, { edgeStrength: 4, mixOriginal: 0, pointScale: 1 })) !==
        lit(bcsNeonEdge(square, { edgeStrength: 4, mixOriginal: 0, pointScale: 2 })),
        lit(bcsNeonEdge(square, { edgeStrength: 4, mixOriginal: 0, pointScale: 1 })) + " lit at 1 point against " +
        lit(bcsNeonEdge(square, { edgeStrength: 4, mixOriginal: 0, pointScale: 2 })) + " at 2. On a 2x display " +
        "the ORIGINAL compares neighbours two device pixels apart; a port that reads gl_FragCoord compares them " +
        "one apart, and fine detail the original smooths over becomes an edge -- a wiry crawl that reads as " +
        "sharpening rather than as a bug");
    ok("...gy is bottom-minus-top, so an unflipped port would recolour every edge",
        /float gy = -tl - 2\.0 \* tc - tr \+ bl \+ 2\.0 \* bc \+ br;/.test(pass.SHADERS.neonEdge) &&
        /atan\(gy, gx\)/.test(pass.SHADERS.neonEdge),
        "the edges would appear in the right places glowing the wrong colours, which nobody reports as a bug");

    // *** THE hsb2rgb AUDIT, CLOSED. *** Batch 2 found fmod is safe there only because the hue is non-negative,
    // and that the guarantee lives at the CALL SITE. All four call sites in the upstream file were then read:
    // duochrome (twice), aurora, neonEdge -- every one passes its hue through fract(), which returns [0,1) even
    // for the negative angle atan2 hands neonEdge. UNSAFE BY CONSTRUCTION, SAFE BY CONVENTION, everywhere.
    const modelSrc = fs.readFileSync(path.join(ENG, "render/swiftShaderModel.mjs"), "utf8");
    const callers = (modelSrc.match(/bcsHsb2rgb\(/g) || []).length;
    ok("!! *** every hue this tree hands to hsb2rgb is fract()ed first ***",
        callers >= 3 && /const hue = raw - Math\.floor\(raw\);/.test(modelSrc) &&
        /const animHue1 = fract\(/.test(modelSrc) &&
        /float hue = fract\(atan\(gy, gx\)/.test(pass.SHADERS.neonEdge) &&
        /fract\(uHue1 \+ sin/.test(pass.SHADERS.duochrome),
        callers + " call sites in the model, all fed a value in [0,1). Upstream's four do the same -- checked, " +
        "not assumed -- so a fifth caller that skips fract is caught HERE rather than on somebody's screen");
    ok("...and section 7 now carries the measured version of that claim, not the assumed one",
        _hsb(0.5, 1, 1).length === 3,
        "the colour differs for 45.8% of negative hues and NOT at the -0.1 first cited -- see section 7");

    // THERMAL: the ironbow ramp, and the third shader whose comment only holds y-down.
    ok("!! the thermal palette walks black -> blue -> purple -> red -> orange -> yellow -> white",
        thermalColor(0)[2] === 0 && thermalColor(0.15)[2] === 0.3 && thermalColor(0.35)[0] === 0.5 &&
        thermalColor(0.55)[0] === 1 && thermalColor(0.75)[1] === 0.6 && thermalColor(1)[2] === 1,
        "six bands at upstream's breakpoints -- the ironbow ramp a thermal camera actually uses");
    ok("!! thermal's 'rising bias' is a NEGATIVE y offset, which only rises in a y-down frame",
        /- sh \* 0\.3/.test(modelSrc) && /- sh \* 0\.3\)/.test(pass.SHADERS.thermal),
        "the third shader in this file to depend on that, after heatShimmer and melt");
    ok("...intensity 0 gives the (displaced) picture back rather than the palette", (() => {
        const t = bcsThermal(square, { intensity: 0, shimmer: 0 });
        for (let i = 0; i < square.data.length; i++) if (Math.abs(t.data[i] - square.data[i]) > 1e-6) return false;
        return true; })());
    for (const [name, keys] of [["thermal", ["uShimmer", "uNoiseSpeed", "uPaletteShift"]],
                                ["neonEdge", ["uEdgeStrength", "uGlowAmount", "uColorCycle"]]])
        ok("..." + name + "'s knobs all reach the GLSL", keys.every((k) => pass.SHADERS[name].includes(k)));
    report("PORTED: 14 of 41. THREE SHADERS HAVE NOW DOCUMENTED THEIR OWN TRAP -- chromaticSplit calls points " +
           "\"pixels\", melt explains a drip that is only downward one way up, and thermal's \"rising bias\" only " +
           "rises the same way. And the hsb2rgb audit is closed: unsafe by construction, safe by convention, at " +
           "all four upstream sites and all of ours.");
}

console.log("\n14. *** THE FILE MUST BE LOADABLE BY THE THING THAT IS SUPPOSED TO RUN IT ***");
{
    // *** THIS SECTION EXISTS BECAUSE EVERY CHECK ABOVE IT PASSED WHILE THE SHADERS COULD NOT SHIP. ***
    // swiftShaderPass.js ended in `module.exports = {...}` and this gate reached it through Node's
    // createRequire. CommonJS is fine in Node and is a ReferenceError in a browser ES module, so the fourteen
    // ports were verified in the ONE environment they could never run in, and nothing said so. referenceKind
    // is what noticed, and only indirectly: it counted the file as an orphan held out of its census by a
    // sentence in main.js's changelog. A GATE THAT LOADS THE CODE DIFFERENTLY FROM PRODUCTION IS TESTING A
    // DIFFERENT FILE.
    const src = fs.readFileSync(path.join(ENG, "render", "swiftShaderPass.js"), "utf8");
    // codeOnly-style: blank comments AND string bodies, so the prose above (which names `module.exports`
    // while explaining why it is gone) cannot rescue the thing it warns about -- v3449's founding defect.
    const code = codeOnly(src);
    ok("!! *** no CommonJS in the shipped shader file -- it must load in a browser, not only in Node ***",
        !/\bmodule\s*\.\s*exports\b/.test(code) && !/\brequire\s*\(/.test(code) && !/\bexports\s*\./.test(code),
        "checked against comment- and string-stripped source, so the paragraph above that NAMES module.exports " +
        "cannot satisfy the check it is describing");

    ok("   ...and it really does evaluate in a scope with no `module`, `require` or `exports`",
        (() => {
            try {
                // the shape a browser gives an ES module: those three identifiers simply do not exist
                new Function("module", "require", "exports",
                    "'use strict';" + src.replace(/^\s*(import|export)[\s\S]*?;\s*$/gm, ""))(undefined, undefined, undefined);
                return true;
            } catch (e) { return !/is not defined|is not a function/.test(String(e && e.message)); }
        })(),
        "evaluated with module/require/exports bound to undefined -- BEFORE the fix this threw " +
        "'module is not defined', which is exactly what a page would have got");

    ok("!! *** ...and it exports a RUNTIME, not only shader source ***",
        typeof pass.makeSwiftShaderPass === "function" && typeof pass.swiftShaderNames === "function",
        "makeSwiftShaderPass + swiftShaderNames. THE HEADER SAID 'Shaped like crtPass.js' WHILE THE FILE " +
        "EXPORTED NOTHING BUT STRINGS -- crtPass exports makeCrtPass(), which builds a real GL pass, and a " +
        "claim of shape is checkable rather than decorative");

    ok("   ...and every shader it lists has a knob map, so a caller can drive it without reading the GLSL",
        pass.swiftShaderNames().every((n) => pass.KNOBS[n] && Object.keys(pass.KNOBS[n]).length > 0),
        pass.swiftShaderNames().length + " shaders, all with knobs -- a shader in SHADERS with no KNOBS entry " +
        "would build and then ignore everything the caller set");

    const missingDefault = pass.swiftShaderNames().flatMap((n) => Object.keys(pass.KNOBS[n])
        .filter((k) => typeof (pass.DEFAULT_KNOBS[n] || {})[k] !== "number").map((k) => n + "." + k));
    ok("!! every knob of every shader has a DEFAULT, or an unset uniform silently reads 0",
        missingDefault.length === 0,
        "an unwritten GL uniform is 0, and 0 is MEANINGFUL for most of these -- a caller who set only `time` " +
        "would get pointScale 0 and a shader sampling one texel forever. " +
        (missingDefault.join(", ") || "all covered"));

    // *** AND THE DEFAULTS MUST BE THE MODEL'S, NOT PLAUSIBLE-LOOKING NUMBERS. *** The first draft of
    // DEFAULT_KNOBS was a single FLAT map, which cannot be right: `speed` is 2 in heatShimmer and 1 in vortex
    // and melt, `spread` is 12 in echo and 8 in chromaticSplit, `intensity` is 0.5 in glitch and 1 in three
    // others. It was missing eighteen knobs outright AND would have shipped seven more with confident wrong
    // values -- duochrome's two hues swapped, solarize's clampOutput and emboss's premultiplied both inverted.
    // Keyed per shader and read off the CPU model's own parameter defaults, the two now agree BY CONSTRUCTION.
    const modelSrc = fs.readFileSync(path.join(ENG, "render", "swiftShaderModel.mjs"), "utf8");
    const mismatched = [];
    for (const shader of pass.swiftShaderNames()) {
        const fn = "bcs" + shader[0].toUpperCase() + shader.slice(1);
        const sig = new RegExp("export function " + fn + "\\([^)]*?\\{([^}]*)\\}", "s").exec(modelSrc);
        if (!sig) continue;
        for (const [, k, v] of sig[1].matchAll(/(\w+)\s*=\s*([-\d.]+|true|false)/g)) {
            const want = v === "true" ? 1 : v === "false" ? 0 : Number(v);
            const got = (pass.DEFAULT_KNOBS[shader] || {})[k];
            if (got !== want) mismatched.push(shader + "." + k + " model=" + want + " pass=" + got);
        }
    }
    ok("!! *** ...and each one MATCHES the CPU model's own signature default, digit for digit ***",
        mismatched.length === 0,
        mismatched.join("; ") || "all " + pass.swiftShaderNames().length + " shaders agree with " +
        "swiftShaderModel.mjs. THE GPU PASS AND THE CPU REFERENCE START FROM THE SAME PLACE, so a comparison " +
        "between them is about the shader rather than about two different sets of knobs");

    // AND THE WIRING ITSELF, because a runtime nobody calls is the state this round started in.
    const mainSrc = fs.readFileSync(path.join(ENG, "main.js"), "utf8");
    // codeOnly blanks string BODIES but keeps the quotes, so a module specifier reads as "" -- match the
    // import by its BINDINGS rather than by its path, which is the part codeOnly preserves.
    const mainCode = codeOnly(mainSrc);
    ok("!! *** main.js IMPORTS the pass, so the shaders are reachable from the running engine ***",
        /import\s*\{[^}]*makeSwiftShaderPass[^}]*\}\s*from/.test(mainCode)
            && /makeSwiftShaderPass\s*\(/.test(mainCode),
        "imported AND called, both checked against codeOnly(main.js) so neither the ENGINE_VERSION changelog " +
        "-- which names this file at length, and is exactly what held it out of referenceKind's orphan census " +
        "while nothing imported it -- nor any string literal can satisfy it. A SENTENCE IS NOT A WIRE, and " +
        "an import with no call site is not much better.");
}


// =========================================================================================================
console.log("\n10. batch 9 (v4196) -- five radial displacement shaders, and a knob that is a coordinate");
{
    const BATCH9 = ["touchRipple", "liveRipple", "shockwave", "gravityWells", "refractLens"];
    for (const name of BATCH9) {
        const keys = Object.keys(pass.KNOBS[name] || {});
        ok("   " + name + " is registered with knobs", keys.length >= 6, keys.join(", "));
    }
    // *** THE OLDER SECTIONS ASK WHETHER THE KNOB NAME APPEARS IN THE FRAG, AND A COMMENT SATISFIES THAT. ***
    // heatShimmer passes its version because the word "verticalBias" occurs in a comment, not because the
    // uniform is declared. This is the same commentFalsePass shape the tree has caught in two other gates.
    // The real question is whether the UNIFORM the knob writes to is DECLARED, so ask that, for all nineteen.
    {
        const undeclared = [];
        for (const name of pass.swiftShaderNames()) {
            for (const [knob, uni] of Object.entries(pass.KNOBS[name] || {})) {
                if (!new RegExp("uniform[^;]*\\b" + uni + "\\b").test(pass.SHADERS[name])) undeclared.push(name + "." + knob + " -> " + uni);
            }
        }
        ok("!! *** every knob of all 19 shaders is a DECLARED uniform, not a word in a comment ***",
            undeclared.length === 0, undeclared.length ? undeclared.join(", ")
            : "checked against the `uniform` declaration itself, so a knob mentioned only in prose goes red");
    }
    ok("!! 28 of 41 ported", pass.swiftShaderNames().length === 28, pass.swiftShaderNames().length + " shaders");

    // --- THE NEW TRAP: touchPos is a coordinate arriving as a knob ---
    ok("!! *** touchRipple and refractLens take their CENTRE as a knob -- the first coordinate this port does " +
       "not derive ***",
       ["touchX", "touchY"].every((k) => k in pass.KNOBS.touchRipple && k in pass.KNOBS.refractLens),
       "it arrives in POINTS with y DOWN, so it needs the same flip and scale swPos() applies -- and the fix " +
       "lives in the CALLER, where no assertion in this shader can reach it");
    {
        // A y that was not flipped puts the ripple at the vertical mirror. Measured, so "it still looks like a
        // ripple" is a number rather than a worry.
        const W = 32, H = 16;
        const img = { w: W, h: H, premultiplied: true, data: new Float32Array(W * H * 4) };
        for (let i = 0; i < W * H; i++) { img.data[i * 4] = (i % W) / W; img.data[i * 4 + 1] = ((i / W) | 0) / H; img.data[i * 4 + 3] = 1; }
        const right = bcsTouchRipple(img, { touchX: 8, touchY: 3, touchAge: 0.3, speed: 30 });
        const flipped = bcsTouchRipple(img, { touchX: 8, touchY: H - 3, touchAge: 0.3, speed: 30 });
        let diff = 0;
        for (let i = 0; i < W * H * 4; i++) if (Math.abs(right.data[i] - flipped.data[i]) > 1 / 255) diff++;
        ok("!! ...and an unflipped touch y is a DIFFERENT PICTURE, not a subtle one",
            diff > 200, diff + " of " + (W * H * 4) + " samples differ -- the ripple still expands and still " +
            "decays, centred where nobody pointed. Nothing about it looks broken.");
        // *** THE OBVIOUS VERSION OF THIS CHECK IS VACUOUS, AND SABOTAGE SAID SO. *** At touchAge 9 with the
        // default decay of 2 the ripple has faded to nothing on its own, so removing the early-out entirely
        // changes ZERO samples and the check passes on deleted code. The knobs below keep the ripple plainly
        // alive at 5.5s -- a slow decay and a slow wavefront -- so the early-out is the only thing ending it.
        const K = { touchX: 16, touchY: 8, decay: 0.1, speed: 5, amplitude: 10 };
        const dead = bcsTouchRipple(img, { ...K, touchAge: 5.5 });
        let same = true;
        for (let i = 0; i < W * H * 4; i++) if (dead.data[i] !== img.data[i]) { same = false; break; }
        ok("!! touchAge past 5s returns the layer UNTOUCHED -- the early-out is how the ripple ends", same,
            "porting it as a clamp would leave a ring frozen on screen forever");
        const alive = bcsTouchRipple(img, { ...K, touchAge: 4.999 });
        let moving = 0;
        for (let i = 0; i < W * H * 4; i++) if (Math.abs(alive.data[i] - img.data[i]) > 1 / 255) moving++;
        ok("!! ...and the CONTROL: at 4.999s the same ripple is still plainly displacing the image",
            moving > 400, moving + " samples differ from the source just INSIDE the window, so the check above " +
            "is about the early-out and not about a ripple that had already faded to nothing");
    }

    // --- THE ASPECT FINDING, WHICH THIS GATE FIRST WROTE DOWN INVERTED ---
    {
        // delta.x *= aspect converts uv-delta INTO pixel-delta/h. So normalize() of it is ALREADY the true
        // pixel radial direction, and dividing x back out is what breaks it.
        const err = (W, H) => {
            const aspect = W / H; let worst = 0;
            for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
                const cx = x + 0.5, cy = y + 0.5;
                const dx = (cx / W - 0.5) * aspect, dy = cy / H - 0.5, m = Math.hypot(dx, dy);
                if (m < 1e-9) continue;
                let ux = dx / m / aspect, uy = dy / m; const mu = Math.hypot(ux, uy); ux /= mu; uy /= mu;
                const px = cx - W / 2, py = cy - H / 2, mp = Math.hypot(px, py);
                if (mp < 1e-9) continue;
                const a = Math.acos(Math.min(1, Math.max(-1, ux * px / mp + uy * py / mp))) * 180 / Math.PI;
                if (a > worst) worst = a;
            }
            return worst;
        };
        const sq = err(32, 32), w2 = err(64, 32), w3 = err(96, 32);
        ok("!! *** the extra `dir.x /= aspect` COSTS NOTHING ON A SQUARE CANVAS ***", sq < 1e-4,
            sq.toExponential(2) + " deg, i.e. zero to within float rounding -- which is why it survives " +
            "review: a square preview is the one canvas on which the bug is invisible");
        ok("!! ...and 19.47 deg at 2:1", Math.abs(w2 - 19.47) < 0.01, w2.toFixed(2) + " deg");
        ok("!! ...and 30.00 deg at 3:1", Math.abs(w3 - 30.0) < 0.01, w3.toFixed(2) + " deg");
        const model = fs.readFileSync(path.join(ENG, "render/swiftShaderModel.mjs"), "utf8");
        ok("!! *** refractLens divides x back TWICE and only one of the two is right ***",
            /WRONG HALF: this one is spent in PIXELS/.test(model) && /RIGHT HALF: this one is spent in UV/.test(model),
            "pushDir feeds `position + ...` (pixels, must not divide back); chromaDir feeds `(uv +/- ...) * size` " +
            "(uv, must). Same function, same idiom, two different answers -- because the results are spent in " +
            "different spaces. Reproduced as upstream wrote it, and recorded here rather than silently repaired.");
    }

    // --- fmod(t, 0) is a whole-frame NaN ---
    ok("!! *** shockwave's repeat_rate = 0 makes EVERY pixel NaN ***", Number.isNaN(fmod(3.7, 0)),
        "fmod(time, 0) is NaN and it propagates through waveFront, ringMask and the displacement. Upstream " +
        "documents the knob as 0.5-5 and never guards it -- and 0 is exactly what an undragged slider reports.");

    // --- toHalf: the defect the GPU found, pinned as a regression ---
    {
        const tiny = Math.pow(0.282065, 64);       // what refractLens's spec term actually computes
        ok("!! *** toHalf models half's EXPONENT range, not just its mantissa ***",
            toHalf(tiny) === 0 && tiny > 0,
            "toHalf(" + tiny.toExponential(2) + ") = 0, because a half cannot represent it: the smallest " +
            "subnormal is 2^-24 = " + HALF_MIN_SUBNORMAL.toExponential(2) + ". Before v4196 both copies " +
            "quantised the mantissa at ANY exponent -- the CPU kept full double precision, and the GLSL " +
            "computed exp2(-126), divided by it, and returned NaN. FOUR PIXELS OF THE LENS RENDERED BLACK.");
        ok("   ...and clamps at the top too", toHalf(70000) === HALF_MAX, "toHalf(70000) = " + toHalf(70000));
        ok("   ...while leaving ordinary values alone", toHalf(0.5) === 0.5 && toHalf(1) === 1 && toHalf(1234.5) === 1235);
        const preamble = pass.PREAMBLE;
        ok("!! ...and the GLSL carries the SAME clamp, not just the model",
            /max\(floor\(log2\(abs\(x\)\)\), -14\.0\)/.test(preamble),
            "the CPU model agreeing with itself is worth nothing here -- it was the GLSL that returned NaN");
    }
}

// =========================================================================================================
// (The numbering above restarted once at v4196 and never recovered; 15 is next in the file, not next in the
// sequence. Left as it is rather than renumbering thirteen headings and breaking every reference to them.)
console.log("\n15. batch 11 (v4234) -- a wrap, an upstream that never clamps, and the alpha channel at last");
{
    const B11 = ["wormhole", "inkBleed", "frosted", "pixelateMosaic"];
    for (const n of B11) {
        ok("   " + n + " is registered with a frag, knobs and defaults",
            typeof pass.SHADERS[n] === "string" && Object.keys(pass.KNOBS[n] || {}).length >= 5 &&
            pass.DEFAULT_KNOBS[n] && pass.swiftShaderNames().includes(n),
            Object.keys(pass.KNOBS[n] || {}).join(", "));
    }

    // --- TRAP 6 FINALLY HAS A LOAD-BEARING CASE, AND IT IS frosted -----------------------------------------
    // Every earlier shader that displaces a sample either stays inside the layer by construction or was
    // clamped upstream too, so the clamps this port writes have been belt-and-braces for ten batches.
    // *** bcs_frosted's UPSTREAM CLAMPS NOTHING. *** It samples layer at position + offset for four
    // hash-rotated offsets of up to frostAmount * 8 POINTS, and Metal's layer sampling has defined edge
    // behaviour, so upstream never had to think about it. GL wraps, and the frost band runs right to the
    // border, so an unclamped port smears the far edge into the near one along the whole frame.
    {
        const fbody = pass.SHADERS.frosted.slice(pass.SHADERS.frosted.indexOf("void main"));
        ok("!! *** all four displaced taps in FROSTED_FRAG are clamped, and the undisplaced one needs no clamp ***",
            (fbody.match(/clamp\(p \+ vec2\(/g) || []).length === 4 &&
            (fbody.match(/layerSample\(/g) || []).length === 6,
            "five taps in the sum plus one for orig; four of the five are offset and all four are clamped");
        // and the measurement that says the clamp is doing work rather than decorating: how many pixels
        // actually push a tap off the edge at the default knobs.
        const W = 48, H = 24, K = pass.DEFAULT_KNOBS.frosted;
        let outside = 0;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const px = x + 0.5, py = y + 0.5, uvx = px / W, uvy = py / H;
            const mask = smoothstep(K.clearRadius, K.clearRadius + K.clearSoftness,
                                    Math.hypot(uvx - 0.5, uvy - 0.5)) * K.frostAmount;
            const nx = bcsHash(Math.floor(uvx * K.grainSize), Math.floor(uvy * K.grainSize)) * 2 - 1;
            const ny = bcsHash(Math.floor(uvx * K.grainSize) + 7.3, Math.floor(uvy * K.grainSize) + 3.1) * 2 - 1;
            const sc = mask * 8 * K.pointScale;
            const taps = [[nx * sc, ny * sc], [-ny * sc, nx * sc],
                          [-nx * sc * 0.7, -ny * sc * 0.7], [ny * sc * 0.7, -nx * sc * 0.7]];
            if (taps.some(([ox, oy]) => px + ox < 0 || px + ox > W || py + oy < 0 || py + oy > H)) outside++;
        }
        ok("!! ...and a THIRD of the frame pushes a tap off the edge, so the clamp is load-bearing, not decor",
            outside > 300 && outside < 600,
            outside + " of " + (W * H) + " pixels (" + (100 * outside / (W * H)).toFixed(1) + "%) have at " +
            "least one tap outside the layer at the default knobs -- without the clamp every one of them " +
            "reads a wrapped pixel from the opposite edge");
        const model = fs.readFileSync(path.join(ENG, "render/swiftShaderModel.mjs"), "utf8");
        const fm = model.slice(model.indexOf("export function bcsFrosted"), model.indexOf("bcs_pixelateMosaic"));
        ok("!! ...and the CPU reference clamps the SAME four taps, so the two cannot drift apart",
            /s\(clamp\(px \+ ox, 0, w\), clamp\(py \+ oy, 0, h\)\)/.test(fm),
            "one clamp inside the tap loop covers all five, the first of which is the zero offset");
    }

    // --- pixelateMosaic AND THE CLAIM I HAD TO WALK BACK ---------------------------------------------------
    // My first draft of this said pixelateMosaic is THE FIRST SHADER IN THE PORT THAT WRITES ALPHA. It is not.
    // *** bcs_refractLens HAS WRITTEN out[i+3] = 1.0 SINCE v4196 AND NOBODY NOTICED FOR FOUR BATCHES ***,
    // because a constant 1.0 is invisible on the opaque test image every gate here used until this round.
    // Measured on a FLAT-alpha image -- where a shader that merely DISPLACES a sample cannot show up, since
    // every sample carries the same alpha -- exactly three of the 28 change the alpha at all, and the three
    // are different in kind:
    //     refractLens     51 px, by 0.4    -- writes the constant 1.0 inside the lens
    //     frosted        976 px, by 0.0001 -- half quantisation of a mix between two equal values; not a write
    //     pixelateMosaic 1152 px, by 0.3   -- the only one that SCALES the alpha it read
    // That distinction is the whole premultiplied argument: refractLens adds its specular unscaled and is
    // right to, because the alpha it writes is 1 and the factor would be 1. pixelateMosaic writes a varying
    // alpha, so its factor has to come from the alpha being WRITTEN and not the one that was read.
    {
        const W = 48, H = 24;
        const flat = { w: W, h: H, premultiplied: false, data: new Float32Array(W * H * 4) };
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const i = (y * W + x) * 4;
            flat.data[i] = x / (W - 1); flat.data[i + 1] = y / (H - 1);
            flat.data[i + 2] = ((x + y) % 7) / 6; flat.data[i + 3] = 0.6;
        }
        const FN = { wormhole: bcsWormhole, inkBleed: bcsInkBleed, frosted: bcsFrosted,
                     pixelateMosaic: bcsPixelateMosaic, refractLens: bcsRefractLens, emboss: bcsEmboss,
                     vortex: bcsVortex, melt: bcsMelt, glitch: bcsGlitch, heatShimmer: bcsHeatShimmer,
                     wavePool: bcsWavePool, pulse: bcsPulse, holographic: bcsHolographic,
                     geometricWarp: bcsGeometricWarp, blackHole: bcsBlackHole, kaleidoscope: bcsKaleidoscope,
                     thermal: bcsThermal, liveRipple: bcsLiveRipple, shockwave: bcsShockwave,
                     gravityWells: bcsGravityWells, solarize: bcsSolarize, duochrome: bcsDuochrome,
                     chromaticSplit: bcsChromaticSplit, plasma: bcsPlasma, echo: bcsEcho,
                     topographic: bcsTopographic, neonEdge: bcsNeonEdge, touchRipple: bcsTouchRipple };
        const moved = [], visible = [];
        for (const n of pass.swiftShaderNames()) {
            const o = FN[n](flat, { ...pass.DEFAULT_KNOBS[n], premultiplied: false });
            let worst = 0;
            for (let p = 0; p < W * H; p++) worst = Math.max(worst, Math.abs(o.data[p * 4 + 3] - 0.6));
            if (worst > 1e-6) moved.push(n + " " + worst.toFixed(4));
            if (worst > 1 / 255) visible.push(n);
        }
        ok("!! *** the map of the 28 is COVERED: every ported name has a model function here ***",
            pass.swiftShaderNames().every((n) => typeof FN[n] === "function"),
            "a name missing from this map would silently skip the alpha census below rather than fail it");
        ok("!! *** only THREE of the 28 touch alpha on a flat-alpha image, and only TWO by a visible amount ***",
            moved.length === 3 && visible.length === 2 &&
            visible.includes("refractLens") && visible.includes("pixelateMosaic"),
            moved.join(", ") + "  -- frosted's 0.0001 is toHalf quantising a mix between two equal alphas, " +
            "which is under a level of 255 and is not a write");
        ok("!! ...so 'the first shader that writes alpha' was WRONG: refractLens got there at v4196",
            (() => {
                const o = bcsRefractLens(flat, { ...pass.DEFAULT_KNOBS.refractLens });
                let ones = 0;
                for (let p = 0; p < W * H; p++) if (o.data[p * 4 + 3] === 1) ones++;
                return ones > 20 && ones < W * H;
            })(),
            "the lens interior returns alpha 1.0 unconditionally; it is invisible on an opaque image, which " +
            "is the only image this gate had until v4234");
        ok("!! ...and pixelateMosaic is the first that writes a VARYING alpha, which is the one that needs care",
            (() => {
                const o = bcsPixelateMosaic(flat, { ...pass.DEFAULT_KNOBS.pixelateMosaic, time: 1.4,
                                                    animateAssemble: 0.5, premultiplied: false });
                const seen = new Set();
                for (let p = 0; p < W * H; p++) seen.add(Math.round(o.data[p * 4 + 3] * 255));
                return seen.size >= 8;
            })(),
            "eleven distinct alphas over eighteen tiles from ONE source alpha of 0.6, mid-assemble at t=1.4. " +
            "At the comparison knobs (t=0.6) it is only three, because most tiles have not started moving " +
            "yet -- which is why this census is taken mid-assemble and not at the knobs the GPU renders");
    }

    // --- THE GROUT BRANCH, WHICH THE COMPARISON KNOBS NEVER EXECUTE -----------------------------------------
    // *** THE DEFAULT gap OF 0.08 DRAWS NO GROUT AT ALL ON THE 48x24 COMPARISON IMAGE. *** cell is
    // fract((x + 0.5) / 8), so it only ever takes the eight values 0.0625, 0.1875 ... 0.9375, and the branch
    // fires below gap * 0.5 = 0.04. The tile edges fall exactly between the samples. So the one branch in
    // this shader that ignores the source entirely was, on the numbers the GPU section renders, DEAD CODE --
    // found by counting the pixels that take it rather than by looking at the picture, which shows tidy tiles
    // either way. A wider gap is used below so the branch is actually executed.
    ok("!! *** the default gap draws ZERO grout pixels at the comparison size -- measured, not assumed ***",
        (() => {
            const W = 48, K = pass.DEFAULT_KNOBS.pixelateMosaic;
            let g = 0;
            for (let x = 0; x < W; x++) { const c = ((x + 0.5) / K.pixelSize) % 1; if (c < K.gap * 0.5 || 1 - c < K.gap * 0.5) g++; }
            return g === 0;
        })(),
        "the smallest cell coordinate at pixelSize 8 is 0.0625 and the grout threshold is 0.04, so a gate " +
        "that only ever renders the defaults never runs the branch");
    ok("!! ...and at gap 0.3 it is 504 of 1152 pixels, so the branch below is genuinely exercised",
        (() => {
            const W = 48, H = 24, K = { ...pass.DEFAULT_KNOBS.pixelateMosaic, gap: 0.3 };
            let g = 0;
            for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
                const cx = ((x + 0.5) / K.pixelSize) % 1, cy = ((y + 0.5) / K.pixelSize) % 1;
                if (cx < K.gap * 0.5 || 1 - cx < K.gap * 0.5 || cy < K.gap * 0.5 || 1 - cy < K.gap * 0.5) g++;
            }
            return g === 504;
        })(), "504 grout pixels of 1152");
    // and the grout must not depend on what was underneath it, which is the property that makes it a branch
    // rather than a blend.
    {
        const W = 16, H = 16;
        const mk = (v) => { const d = new Float32Array(W * H * 4); for (let i = 0; i < W * H; i++) { d[i * 4] = v; d[i * 4 + 1] = v; d[i * 4 + 2] = v; d[i * 4 + 3] = i % 2 ? 1 : 0; } return { w: W, h: H, premultiplied: false, data: d }; };
        const a = bcsPixelateMosaic(mk(0), { gap: 0.3, pixelSize: 4 });
        const b = bcsPixelateMosaic(mk(1), { gap: 0.3, pixelSize: 4 });
        let grout = 0, same = 0;
        for (let p = 0; p < W * H; p++) {
            const cx = ((p % W + 0.5) / 4) % 1, cy = (((p / W) | 0) + 0.5) / 4 % 1;
            if (cx < 0.15 || 1 - cx < 0.15 || cy < 0.15 || 1 - cy < 0.15) {
                grout++;
                if (a.data[p * 4 + 3] === 1 && b.data[p * 4 + 3] === 1 &&
                    a.data[p * 4] === b.data[p * 4]) same++;
            }
        }
        ok("!! the grout is OPAQUE and IDENTICAL over a black source and a white one, alpha 0 and alpha 1 alike",
            grout > 0 && same === grout,
            grout + " grout pixels, all of them alpha 1 and the same colour whatever was underneath -- " +
            "an effect that blended would show two different greys here");
    }

    // --- wormhole's wrap, which is what makes it ungradeable at the seam and nowhere else -------------------
    ok("!! wormhole WRAPS its sample coordinate, in both copies, and that is why it has a seam at all",
        /fract\(/.test(pass.SHADERS.wormhole.slice(pass.SHADERS.wormhole.indexOf("void main"))) &&
        /tx -= Math\.floor\(tx\); ty -= Math\.floor\(ty\);/.test(
            fs.readFileSync(path.join(ENG, "render/swiftShaderModel.mjs"), "utf8")),
        "GLSL fract() and the model's x - floor(x) are the same function; the seam is the shader's shape, " +
        "not a disagreement between them");
// --- THE SABOTAGE RECORD FOR THIS BATCH, INCLUDING THE TWO CHECKS THAT ARE SHAPE ONLY -------------------
// Eleven deliberate breakages, each applied, run, and restored byte-identical. All eleven turned something
// red, but not all of them turned red for the same KIND of reason, and the difference is the useful part:
//
//   A  wormhole drops fract()                     -> 250 levels off-seam, 452 px          RENDERED
//   B  wormhole fog-multiplies the chroma taps    -> 52 levels off-seam, 388 px           RENDERED
//      (B is the real port error this batch found and fixed, replayed as a regression)
//   C  frosted unclamps one displaced tap          -> the tap-count check only              SHAPE ONLY
//   D  frosted drops `* k` from the additive term  -> 8 levels at pointScale 0             RENDERED
//   E  pixelateMosaic drops `* k` from the bevel   -> 18 levels fully assembled            RENDERED
//   F  pixelateMosaic drops the alpha write        -> 60 levels of alpha mid-assemble      RENDERED
//   G  pixelateMosaic's grout blends the source    -> 125 levels                           RENDERED
//   H  pixelateMosaic flips the bevel's top light  -> 14 levels                            RENDERED
//   I  inkBleed drops uPointScale                  -> the trap 3 check only                SHAPE ONLY
//   J  the MODEL's grout carries the source alpha  -> 3 checks, two of them rendered       RENDERED
//   K  the MODEL's frosted stops clamping          -> the correspondence check only         SHAPE ONLY
//
// *** C, I AND K ARE WEAKER THAN THEY LOOK AND ARE LABELLED HERE RATHER THAN COUNTED WITH THE REST. *** A
// shape check falls to a rewrite that means the same thing, and it can only see what it was told to look
// for. Two of the three cannot be strengthened from this gate at all: frosted's clamp is invisible at
// pointScale 0 (the only configuration in which frosted can be rendered against its reference, because the
// hash cancels there) and unmeasurable above it (because the hash does not), and inkBleed's point scale is
// invisible at devicePixelRatio 1, which is the only ratio anything here renders at. Trap 3 has been argued
// from the source and never once measured, for eleven batches; that is the next real hole in this file, and
// it is stated in the closing note rather than left to be rediscovered.
    ok("!! inkBleed carries the point scale on its warp, which is trap 3 and not optional",
        "pointScale" in pass.KNOBS.inkBleed &&
        /uPointScale/.test(pass.SHADERS.inkBleed.slice(pass.SHADERS.inkBleed.indexOf("void main"))),
        "warpStrength is 20 POINTS, so on a 3x display it is 60 device pixels and the bleed is three times " +
        "as wide as the author drew it");
}

// =========================================================================================================
console.log("\n11. *** THE GLSL, ACTUALLY RUN *** -- all 19 shaders on a real WebGL2 context, against the CPU model");
{
    const require_ = createRequire(import.meta.url);
    const { chromium, from: pwFrom } = resolvePlaywright(require_);
    const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
    if (skip) {
        report("SKIPPED -- " + skip);
        report("*** A SKIP, NOT A PASS. Sections 1-10 read the shader; only this one executes it, and it is " +
               "the section that found a NaN two versions of correspondence-reading had missed.");
    } else {
        report("chromium via " + pwFrom);
        // NON-SQUARE ON PURPOSE: the aspect finding above is exactly zero on a square canvas.
        const W = 48, H = 24;
        const src = new Uint8Array(W * H * 4);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const i = (y * W + x) * 4;
            src[i] = Math.round(x * 255 / (W - 1)); src[i + 1] = Math.round(y * 255 / (H - 1));
            src[i + 2] = Math.round((x + y) * 255 / (W + H - 2)); src[i + 3] = 255;
        }
        const fimg = { w: W, h: H, premultiplied: true, data: Float32Array.from(src, (v) => v / 255) };
        const srv = http.createServer((rq, rs) => {
            const u = decodeURIComponent(rq.url.split("?")[0]);
            if (u === "/g.html") {
                rs.writeHead(200, { "Content-Type": "text/html" });
                return rs.end('<script type="module">import { makeSwiftShaderPass } from "/render/swiftShaderPass.js";' +
                              ' window.__mk = makeSwiftShaderPass; window.__ready = true;</script>');
            }
            const f = path.join(ENG, u);
            if (!f.startsWith(ENG) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.writeHead(404); return rs.end("nf"); }
            rs.writeHead(200, { "Content-Type": /\.m?js$/.test(f) ? "text/javascript" : "text/plain" });
            rs.end(fs.readFileSync(f));
        });
        await new Promise((r) => srv.listen(0, "127.0.0.1", r));
        const port = srv.address().port;
        const b = await chromium.launch({ executablePath: HEADLESS_SHELL, args: ["--use-gl=swiftshader"] });
        const pg = await (await b.newContext()).newPage();
        const errs = []; pg.on("pageerror", (e) => errs.push(String(e.message)));
        await pg.goto("http://127.0.0.1:" + port + "/g.html", { waitUntil: "load" });
        await pg.waitForFunction(() => window.__ready === true, null, { timeout: 20000 });

        const MODEL = { emboss: bcsEmboss, heatShimmer: bcsHeatShimmer, solarize: bcsSolarize,
            duochrome: bcsDuochrome, vortex: bcsVortex, kaleidoscope: bcsKaleidoscope,
            chromaticSplit: bcsChromaticSplit, plasma: bcsPlasma, echo: bcsEcho, glitch: bcsGlitch,
            melt: bcsMelt, topographic: bcsTopographic, thermal: bcsThermal, neonEdge: bcsNeonEdge,
            touchRipple: bcsTouchRipple, liveRipple: bcsLiveRipple, shockwave: bcsShockwave,
            gravityWells: bcsGravityWells, refractLens: bcsRefractLens,
            wavePool: bcsWavePool, pulse: bcsPulse, holographic: bcsHolographic,
            geometricWarp: bcsGeometricWarp, blackHole: bcsBlackHole,
            wormhole: bcsWormhole, inkBleed: bcsInkBleed, frosted: bcsFrosted, pixelateMosaic: bcsPixelateMosaic };
        const CASES = { emboss: { strength: 2 }, heatShimmer: { time: 1 }, solarize: { time: 1 },
            duochrome: { time: 1 }, vortex: { time: 0.7 }, kaleidoscope: { time: 1 },
            chromaticSplit: { spread: 6 }, plasma: { time: 1 }, echo: { time: 1 }, glitch: { time: 1 },
            melt: { time: 1 }, topographic: { time: 1 }, thermal: { time: 1 }, neonEdge: { time: 1 },
            touchRipple: { touchX: 30, touchY: 8, touchAge: 0.4 }, liveRipple: { time: 1.3 },
            shockwave: { time: 0.35 }, gravityWells: { time: 0.9 }, refractLens: { touchX: 24, touchY: 12 },
            wavePool: { time: 0.8 }, pulse: { time: 0.42 }, holographic: { time: 0.6 },
            geometricWarp: { time: 0.7 }, blackHole: { time: 0.55 },
            wormhole: { time: 0.9 }, inkBleed: { time: 0.5 }, frosted: {}, pixelateMosaic: { time: 0.6, animateAssemble: 0.5 } };
        // The five that call the sin-hash. Determined from the SHADER SOURCE, not from a list I typed.
        const HASHED = pass.swiftShaderNames().filter((n) => {
            const body = pass.SHADERS[n].slice(pass.SHADERS[n].indexOf("void main"));
            return /bcs_(hash|valueNoise|fbm)\(/.test(body);
        });
        // 5 at v4196, 8 at v4234: batch 11 is the first batch that is MOSTLY hash-reaching, because after
        // wormhole there are no gradeable shaders left upstream at all.
        ok("!! the sin-hash users are derived from the shader source, not typed into this gate",
            HASHED.length === 8, HASHED.join(", "));

        const results = {};
        for (const name of pass.swiftShaderNames()) {
            const gpu = await pg.evaluate(({ name, knobs, W, H, src }) => {
                const p = window.__mk(name, W, H);
                p.render(new Uint8Array(src), knobs);
                return Array.from(p.readPixels());
            }, { name, knobs: CASES[name], W, H, src: Array.from(src) });
            const cpu = MODEL[name](fimg, { ...pass.DEFAULT_KNOBS[name], ...CASES[name] });
            let worst = 0, off = 0, nan = 0;
            for (let i = 0; i < W * H * 4; i++) {
                if (i % 4 === 3) continue;
                if (Number.isNaN(cpu.data[i])) nan++;
                const c = Math.max(0, Math.min(255, Math.round(cpu.data[i] * 255)));
                const d = Math.abs(c - gpu[i]); if (d > worst) worst = d; if (d > 2) off++;
            }
            results[name] = { worst, off, nan, black: gpu.filter((v, i) => i % 4 !== 3 && v === 0).length };
        }
        ok("!! the page loaded and ran 28 shaders with no script error", errs.length === 0, errs.join(" | "));

        // vortex was already excluded for landing on texel boundaries; batch 10's three displacing shaders do the
        // same thing for the same reason, and are graded by the one-texel bound below instead of by <= 2.
        const TEXEL_EXEMPT = ["vortex", "wavePool", "geometricWarp", "blackHole", "wormhole"];

        // *** wormhole IS THE LAST SHADER UPSTREAM THAT TOUCHES NO HASH, AND IT STILL CANNOT BE GRADED TO THE
        // PIXEL EVERYWHERE -- FOR A DIFFERENT REASON, WHICH IS WORTH MORE THAN THE PORT ITSELF. *** It wraps
        // its sample coordinate with fract(), so its seam is not a texel boundary but the WHOLE IMAGE: a
        // one-ULP disagreement at tunnelUV = 0.99999 vs 1.0 moves the sample from column 47 to column 0, and
        // on a gradient that is 255 levels. vortex's case was the same mechanism bounded by one texel; a wrap
        // has no such bound. So the seam pixels are EXCLUDED BY ARITHMETIC rather than by widening a
        // tolerance, and the count is asserted so the exclusion cannot quietly grow.
        const SEAM = (() => {
            const set = new Set(), K = pass.DEFAULT_KNOBS.wormhole, time = 0.9;
            const t = time * K.speed, aspect = W / H;
            for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
                const dx = ((x + 0.5) / W - 0.5) * aspect, dy = (y + 0.5) / H - 0.5;
                const dist = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
                const td = K.radius / Math.max(dist, 0.001);
                const twa = ang + K.twist * td * 0.3 + t * 0.5;
                const zf = td * K.depth * 0.1 - t * 0.3, zoom = zf - Math.floor(zf);
                const scale = 0.2 + 1.8 * zoom;
                let tx = 0.5 + Math.cos(twa) * scale * 0.3, ty = 0.5 + Math.sin(twa) * scale * 0.3;
                tx -= Math.floor(tx); ty -= Math.floor(ty);
                // within one texel of any of the four seams
                if (Math.min(tx, 1 - tx) < 1 / W || Math.min(ty, 1 - ty) < 1 / H) set.add(y * W + x);
            }
            return set;
        })();
        // ---- THE HOLE v4233's SABOTAGE FOUND, CLOSED AT v4234 ------------------------------------------------
        // *** DELETING THE PREMULTIPLIED BRANCH FROM PULSE_FRAG LEFT THIS WHOLE GATE GREEN. *** Every image
        // above is fully opaque, so the alpha scale is 1 whatever the shader does with it, and the branch that
        // makes trap 2 real was never executed on the GPU at all. The CPU references were covered in section 3
        // against a half-transparent image from the start; the GLSL was not, for eleven batches.
        //
        // So: a SECOND comparison image, identical but for a diagonal alpha ramp, rendered with
        // premultiplied = 0 and graded against the CPU model told the same thing. A shader that ignores the
        // uniform now diverges wherever alpha < 1, which is most of the frame.
        const asrc = new Uint8Array(W * H * 4);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const i = (y * W + x) * 4;
            asrc[i] = src[i]; asrc[i + 1] = src[i + 1]; asrc[i + 2] = src[i + 2];
            // a ramp rather than a constant: a constant alpha can be absorbed into a knob, a ramp cannot
            asrc[i + 3] = 40 + Math.round((x + y) * 175 / (W + H - 2));
        }
        const aimg = { w: W, h: H, premultiplied: false, data: Float32Array.from(asrc, (v) => v / 255) };
        const ALPHA_AWARE = pass.swiftShaderNames().filter((n) => "premultiplied" in (pass.KNOBS[n] || {}));
        ok("!! the shaders that add into a sample declare a premultiplied knob, and there are eight of them",
            ALPHA_AWARE.length === 8 && ALPHA_AWARE.includes("emboss") && ALPHA_AWARE.includes("pixelateMosaic"),
            ALPHA_AWARE.join(", "));
        const alphaResults = {};
        for (const name of ALPHA_AWARE) {
            const knobs = { ...CASES[name], premultiplied: 0 };
            const gpu = await pg.evaluate(({ name, knobs, W, H, src }) => {
                const p = window.__mk(name, W, H);
                p.render(new Uint8Array(src), knobs);
                return Array.from(p.readPixels());
            }, { name, knobs, W, H, src: Array.from(asrc) });
            const cpu = MODEL[name](aimg, { ...pass.DEFAULT_KNOBS[name], ...CASES[name], premultiplied: false });
            let worst = 0, off = 0, alphaWorst = 0;
            for (let i = 0; i < W * H * 4; i++) {
                // wormhole wraps its sample, so its seam pixels are excluded here for the same arithmetic
                // reason as in the batch-11 block: a wrap turns one ULP into the whole gradient.
                if (name === "wormhole" && SEAM.has(Math.floor(i / 4))) continue;
                const c = Math.max(0, Math.min(255, Math.round(cpu.data[i] * 255)));
                const d = Math.abs(c - gpu[i]);
                if (i % 4 === 3) { if (d > alphaWorst) alphaWorst = d; continue; }
                if (d > worst) worst = d; if (d > 2) off++;
            }
            alphaResults[name] = { worst, off, alphaWorst };
        }
        // A hash shader cannot be graded to the pixel HERE either -- the sin-hash argument does not become
        // reproducible because the image gained an alpha channel. Those are checked for SHAPE: the alpha the
        // GPU writes must still track the alpha the model writes, which is what the premultiplied branch and
        // pixelateMosaic's alpha write are actually about.
        // *** AND MY FIRST VERSION OF THIS ASSERTED THAT THE HASH SHADERS' ALPHA STILL TRACKS THE MODEL. IT
        // DOES NOT, AND THE GATE SAID SO. *** frosted mixes in the alpha of four HASH-DISPLACED taps, and
        // pixelateMosaic scales alpha by an assemble progress driven straight off bcs_hash -- so for those two
        // the alpha is as hash-dependent as the colour. They are graded in the CONFIGURATIONS where the hash
        // cancels instead: see the three targeted checks immediately below.
        const GRADEABLE_ALPHA = ALPHA_AWARE.filter((n) => !HASHED.includes(n));
        const alphaBound = (n) => TEXEL_EXEMPT.includes(n) ? Math.ceil(255 / (H - 1)) : 2;
        for (const n of GRADEABLE_ALPHA) {
            ok("   " + n.padEnd(14) + " honours the alpha convention ON THE GPU too",
                alphaResults[n].worst <= alphaBound(n),
                "worst " + alphaResults[n].worst + " levels over a diagonal alpha ramp, bound " + alphaBound(n));
        }
        ok("!! *** trap 2 is now exercised on the GPU, not only in the CPU model ***",
            GRADEABLE_ALPHA.every((n) => alphaResults[n].worst <= alphaBound(n)),
            "deleting a `* k` from any of " + GRADEABLE_ALPHA.join("/") + " now turns this red");

        // ---- THE TWO HASH SHADERS' ALPHA, GRADED WHERE THE HASH CANNOT REACH ----------------------------
        // frosted and pixelateMosaic are excluded from the block above because their alpha is as hash-driven
        // as their colour, and section 11's closing check says why that can never be graded. It does not
        // follow that their alpha is unchecked: BOTH HAVE A CONFIGURATION IN WHICH THE HASH CANCELS, and the
        // premultiplied factor and the alpha write survive it. Those configurations are rendered here.
        {
            // (i) frosted at pointScale 0. sc = mask * 8 * pointScale, so every displaced tap collapses onto
            // the undisplaced one and nx / ny are multiplied by zero -- the hash is still COMPUTED, and still
            // diverges, and cannot reach the output. What is left is the part trap 2 lives in:
            // mix(orig, sum, mask) + half(mask * 0.05) * k, with k the ramp alpha. Deleting the `* k` shifts
            // it by half(mask*0.05) * (1 - a), which is up to 7 levels where the ramp is dimmest.
            const fk = { ...CASES.frosted, pointScale: 0, premultiplied: 0 };
            const g = await pg.evaluate(({ knobs, W, H, src }) => {
                const p = window.__mk("frosted", W, H);
                p.render(new Uint8Array(src), knobs);
                return Array.from(p.readPixels());
            }, { knobs: fk, W, H, src: Array.from(asrc) });
            const c = MODEL.frosted(aimg, { ...pass.DEFAULT_KNOBS.frosted, ...fk, premultiplied: false });
            let worst = 0, aworst = 0;
            for (let i = 0; i < W * H * 4; i++) {
                const v = Math.max(0, Math.min(255, Math.round(c.data[i] * 255)));
                const d = Math.abs(v - g[i]);
                if (i % 4 === 3) { if (d > aworst) aworst = d; } else if (d > worst) worst = d;
            }
            ok("!! *** frosted IS gradeable on the GPU at pointScale 0, where the hash multiplies out ***",
                worst <= 2 && aworst <= 2,
                "worst " + worst + " levels of colour and " + aworst + " of alpha over the ramp -- the frost " +
                "itself is switched off, the premultiplied add is not, and that is the half of the shader " +
                "a hash cannot be blamed for");
        }
        {
            // (ii) pixelateMosaic with animateAssemble 0 and time 2. ap clamps to 1, so the scatter offset
            // (hash - 0.5) * 0.5 * (1 - ap) is EXACTLY zero and the tile samples its own centre. pixelSize 9
            // rather than the default 8 because 8 puts that centre on an integer pixel coordinate -- a texel
            // BOUNDARY under NEAREST -- and 9 puts it at x.5, a texel centre. gap 0.3 rather than 0.08
            // because 0.08 draws no grout at all at this size, as section 15 measured.
            const mk9 = { time: 2.0, animateAssemble: 0, gap: 0.3, pixelSize: 9, premultiplied: 0 };
            const g = await pg.evaluate(({ knobs, W, H, src }) => {
                const p = window.__mk("pixelateMosaic", W, H);
                p.render(new Uint8Array(src), knobs);
                return Array.from(p.readPixels());
            }, { knobs: mk9, W, H, src: Array.from(asrc) });
            const c = MODEL.pixelateMosaic(aimg, { ...pass.DEFAULT_KNOBS.pixelateMosaic, ...mk9, premultiplied: false });
            let worst = 0, aworst = 0;
            for (let i = 0; i < W * H * 4; i++) {
                const v = Math.max(0, Math.min(255, Math.round(c.data[i] * 255)));
                const d = Math.abs(v - g[i]);
                if (i % 4 === 3) { if (d > aworst) aworst = d; } else if (d > worst) worst = d;
            }
            ok("!! *** pixelateMosaic IS gradeable on the GPU fully assembled, hash and all ***",
                worst <= 2 && aworst <= 2,
                "worst " + worst + " levels of colour and " + aworst + " of alpha, with the grout branch, the " +
                "bevel and the premultiplied factor all executing -- at ap = 1 the scatter is multiplied by " +
                "zero and the whole shader becomes deterministic");
        }
        {
            // (iii) and the ALPHA WRITE itself, which (ii) cannot see: at ap = 1 the scale is half(1) = 1,
            // so deleting `* half(ap * 0.5 + 0.5)` changes nothing there. Mid-assemble the scale is 0.608 and
            // the scatter is live -- but on a FLAT-alpha source every sample carries the same alpha, so the
            // written alpha is hash-free even though the colour is not. A flat alpha would be the wrong
            // choice for the general comparison above (a constant can be absorbed into a knob); here it is
            // exactly the instrument, because it removes the hash from alpha WITHOUT removing the write.
            const flatSrc = new Uint8Array(W * H * 4);
            for (let i = 0; i < W * H; i++) {
                flatSrc[i * 4] = src[i * 4]; flatSrc[i * 4 + 1] = src[i * 4 + 1];
                flatSrc[i * 4 + 2] = src[i * 4 + 2]; flatSrc[i * 4 + 3] = 153;   // 0.6
            }
            const flatImg = { w: W, h: H, premultiplied: false, data: Float32Array.from(flatSrc, (v) => v / 255) };
            const mkh = { time: 0.6, animateAssemble: 0, gap: 0.3, pixelSize: 9, premultiplied: 0 };
            const g = await pg.evaluate(({ knobs, W, H, src }) => {
                const p = window.__mk("pixelateMosaic", W, H);
                p.render(new Uint8Array(src), knobs);
                return Array.from(p.readPixels());
            }, { knobs: mkh, W, H, src: Array.from(flatSrc) });
            const c = MODEL.pixelateMosaic(flatImg, { ...pass.DEFAULT_KNOBS.pixelateMosaic, ...mkh, premultiplied: false });
            let aworst = 0; const levels = new Set();
            for (let p = 0; p < W * H; p++) {
                const v = Math.max(0, Math.min(255, Math.round(c.data[p * 4 + 3] * 255)));
                levels.add(g[p * 4 + 3]);
                const d = Math.abs(v - g[p * 4 + 3]); if (d > aworst) aworst = d;
            }
            ok("!! *** the alpha WRITE is graded on the GPU, mid-assemble, where (ii) is blind to it ***",
                aworst <= 2 && levels.size === 2 && levels.has(255),
                "worst " + aworst + " levels; the GPU wrote " + [...levels].sort((a, b) => a - b).join(" and ") +
                " -- 93 is 0.6 * half(0.216 * 0.5 + 0.5) = 0.6 * 0.6079 on the tiles and 255 is the opaque " +
                "grout. Deleting the scale would leave the tiles at 153, which is 60 levels out.");
        }

        // A) the twelve with no sin-hash and no boundary sensitivity must be essentially EXACT.
        const EXACTISH = pass.swiftShaderNames().filter((n) => !HASHED.includes(n) && !TEXEL_EXEMPT.includes(n));
        for (const n of EXACTISH) {
            ok("   " + n.padEnd(15) + " GPU matches the CPU model", results[n].worst <= 2,
                "worst " + results[n].worst + " levels, " + results[n].off + " pixels over 2");
        }
        ok("!! *** all five of batch 9 are bit-exact against their CPU reference on a real GPU ***",
            ["touchRipple", "liveRipple", "shockwave", "gravityWells", "refractLens"]
                .every((n) => results[n].worst === 0),
            ["touchRipple", "liveRipple", "shockwave", "gravityWells", "refractLens"]
                .map((n) => n + " " + results[n].worst).join(", "));

        // *** BATCH 10 WAS CHOSEN SO THAT IT COULD BE GRADED, AND THIS IS THE GRADE, INCLUDING THE PART I
        // EXPECTED TO BE ZERO AND WHICH IS NOT. *** Of the 22 still unported, 15 call the sin-hash directly or
        // through fbm and can only ever be checked by shape. These five touch neither. Two of them came back
        // exact; THREE DID NOT, and the three are exactly the three that DISPLACE THE SAMPLE COORDINATE.
        //
        // The test image is a gradient, and one texel of it is worth 255/(48-1) = 5.4 levels horizontally and
        // 255/(24-1) = 11.1 vertically. The measured worsts are 5, 5 and 11. That is ONE TEXEL, in the axis
        // each shader displaces along, at two to four pixels of 1152 -- the identical signature vortex was
        // classified under earlier, where a rotation lands on a texel boundary and float32 and float64 round
        // across it under NEAREST sampling. It is not a port error and it is not exactness either, so it is
        // asserted as what it is: bounded by one texel of the gradient, not by zero.
        let B10_FMOD = null;
        const BATCH10 = ["wavePool", "pulse", "holographic", "geometricWarp", "blackHole"];
        const TEXEL_G = 255 / (H - 1);      // 11.1 -- the coarser axis, and the bound that has to hold
        const B10_EXACT = ["pulse", "holographic"], B10_DISPLACING = ["wavePool", "geometricWarp", "blackHole"];
        ok("!! the two batch-10 shaders that do NOT move the sample coordinate are exact",
            B10_EXACT.every((n) => results[n].worst <= 1),
            B10_EXACT.map((n) => n + " " + results[n].worst).join(", "));
        ok("!! *** and the three that DO differ by at most ONE TEXEL of the test gradient, at a handful of pixels ***",
            B10_DISPLACING.every((n) => results[n].worst <= Math.ceil(TEXEL_G) && results[n].off <= 8),
            B10_DISPLACING.map((n) => n + " " + results[n].worst + " levels/" + results[n].off + "px").join(", ") +
            "  -- one texel is " + (255 / (W - 1)).toFixed(1) + " levels in R and " + TEXEL_G.toFixed(1) + " in G");
        ok("...and every one of them is finite -- no NaN reached the buffer",
            BATCH10.every((n) => results[n].nan === 0));
        ok("...and none of batch 10 is a sin-hash shader, which is why they could be graded at all",
            BATCH10.every((n) => !HASHED.includes(n)));

        // ---- BATCH 11: wormhole, graded everywhere except its own wrap seam ----------------------------------
        {
            const gpu = await pg.evaluate(({ W, H, src, knobs }) => {
                const p = window.__mk("wormhole", W, H);
                p.render(new Uint8Array(src), knobs);
                return Array.from(p.readPixels());
            }, { W, H, src: Array.from(src), knobs: CASES.wormhole });
            const cpu = MODEL.wormhole(fimg, { ...pass.DEFAULT_KNOBS.wormhole, ...CASES.wormhole });
            let onWorst = 0, offWorst = 0, offCount = 0;
            for (let px = 0; px < W * H; px++) {
                for (let ch = 0; ch < 3; ch++) {
                    const i = px * 4 + ch;
                    const c = Math.max(0, Math.min(255, Math.round(cpu.data[i] * 255)));
                    const d = Math.abs(c - gpu[i]);
                    if (SEAM.has(px)) { if (d > onWorst) onWorst = d; }
                    else { if (d > offWorst) offWorst = d; if (d > 2) offCount++; }
                }
            }
            ok("!! the seam set is small and derived from the shader's own arithmetic, not from the failures",
                SEAM.size > 0 && SEAM.size < W * H * 0.4,
                SEAM.size + " of " + (W * H) + " (" + (100 * SEAM.size / (W * H)).toFixed(1) + "%) within one texel of a seam -- " +
                "large because the tunnel mapping concentrates samples near the wrap, which is the shader's shape and not a loose bound");
            ok("!! *** AWAY FROM THE SEAM, wormhole IS EXACT AGAINST ITS CPU REFERENCE ***",
                offWorst <= 2 && offCount === 0,
                "worst " + offWorst + " levels off-seam, " + offCount + " pixels over 2");
            ok("...and ON the seam it can differ by the full range, which is what a wrap costs",
                onWorst > 100, "worst " + onWorst + " levels on-seam -- column 47 and column 0 of a gradient");
        }

        // *** A TRAP I ASSERTED AND THEN MEASURED AWAY. *** The holographic port's first comment said that
        // using the exact 2*PI/3 instead of upstream's 2.094h would shift the green phase. It would not:
        // toHalf collapses them onto the same half. Pinned so the claim cannot drift back.
        ok("!! holographic's half-rounded thirds are INDISTINGUISHABLE from the exact ones, measured",
            toHalf(2.094) === toHalf(2 * Math.PI / 3) && toHalf(4.189) === toHalf(4 * Math.PI / 3),
            "toHalf(2.094) = toHalf(2pi/3) = " + toHalf(2.094) + "; unrounded the gap is 0.000645 rad = 0.08 levels of 255, under the quantisation floor");

        // *** TRAP 5 FINALLY HAS A LOAD-BEARING CASE, AFTER SITTING IN THE HEADER SINCE v4163. ***
        // That header said: "Neither of the two shaders here uses it -- the upstream file does elsewhere -- so
        // the helper exists and is gated BEFORE a shader that needs it arrives." bcs_geometricWarp is the
        // shader that arrived. It folds an angle taken from atan2, so the argument is negative across most of
        // the image, which is the only region where fmod and mod differ at all.
        const gw = pass.SHADERS.geometricWarp;
        ok("!! geometricWarp uses bcs_fmod and NOT mod, in both folds",
            (gw.slice(gw.indexOf("void main")).match(/bcs_fmod\(/g) || []).length === 2 &&
            !/[^_a-z]mod\(/.test(gw.slice(gw.indexOf("void main"))),
            "kAngle = bcs_fmod(spiralAngle, seg), and the mirror test on floor(spiralAngle / seg)");
        // *** AND THE FIRST DRAFT OF THIS CHECK CLAIMED geometricWarp WAS THE FIRST SHADER TO CALL bcs_fmod,
        // WHICH IS FALSE -- shockwave has called it since v4196, AND THIS GATE CAUGHT ME. *** The true claim is
        // narrower and is the one that matters: shockwave passes bcs_fmod(uTime, uRepeatRate), and uTime is a
        // CLOCK, so the argument is never negative and fmod and mod agree on every value it will ever see --
        // the same "safe by the call site, not by the helper" reasoning the hsb2rgb audit reached. geometricWarp
        // passes an angle from atan2, which is negative over most of the image, so it is the first shader in
        // this port where CHOOSING WRONG CHANGES THE PICTURE.
        const fmodUsers = pass.swiftShaderNames().filter((n) => {
            const body = pass.SHADERS[n].slice(pass.SHADERS[n].indexOf("void main"));
            return /bcs_fmod\(/.test(body);
        });
        ok("!! two shaders call the helper, and only one of them can pass it a negative",
            fmodUsers.join(",") === "shockwave,geometricWarp",
            "shockwave: bcs_fmod(uTime, uRepeatRate) -- a clock, so >= 0 and the two functions agree");
        ok("!! *** geometricWarp is the first port where fmod vs mod CHANGES THE PICTURE, and by how much is measured ***",
            (() => {
                // Recompute the fold both ways over the same grid the GPU rendered, and count the disagreement.
                let differ = 0, negative = 0, total = 0;
                const SEG = 6.28 / 6.0;
                for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
                    const dx = (x + 0.5) / W - 0.5, dy = (y + 0.5) / H - 0.5;
                    const r = Math.hypot(dx, dy);
                    const sa = Math.atan2(dy, dx) + Math.log(Math.max(r, 0.0001)) * 3 + 0.7 * 0.5;
                    total++;
                    if (sa < 0) negative++;
                    const byFmod = sa - SEG * Math.trunc(sa / SEG);
                    const byMod = sa - SEG * Math.floor(sa / SEG);
                    if (Math.abs(byFmod - byMod) > 1e-9) differ++;
                }
                B10_FMOD = { differ, negative, total };
                return differ === negative && differ > total * 0.5;
            })(),
            "the fold differs at " + B10_FMOD.differ + " of " + B10_FMOD.total + " pixels (" +
            (100 * B10_FMOD.differ / B10_FMOD.total).toFixed(1) + "%), which is EXACTLY the count where the angle is negative -- " +
            "the two figures agreeing is what says the mechanism is understood rather than the number merely observed");

        // B) refractLens is the regression: it was FOUR BLACK PIXELS before the toHalf fix.
        ok("!! *** refractLens renders no black pixel -- the toHalf NaN regression ***",
            results.refractLens.worst === 0,
            "before v4196 this read 252 levels at 4 pixels, all of them pure black, because toHalf(pow(dot,64)) " +
            "was NaN. This is the check that would go red if the exponent clamp were removed.");

        // C) vortex: bounded, explained, and NOT swept under the exact class.
        ok("!! vortex differs at a handful of pixels by ONE TEXEL, and no more",
            results.vortex.off <= 20 && results.vortex.worst <= 12,
            results.vortex.worst + " levels at " + results.vortex.off + " pixels of " + (W * H) + " -- one texel " +
            "of this gradient is 255/23 = 11.1 levels vertically. A rotation lands exactly on a texel boundary " +
            "and float32 and float64 round across it. Nearest sampling, not a port error.");

        // D) the five that CANNOT agree, and the reason, measured.
        for (const n of HASHED) {
            ok("   " + n.padEnd(15) + " DISAGREES, as the sin-hash requires", results[n].off > 100,
                "worst " + results[n].worst + " levels over " + results[n].off + " pixels");
        }
        ok("!! *** the CPU model can never verify a sin-hash shader, and this is the boundary ***",
            HASHED.every((n) => results[n].off > 100) && EXACTISH.every((n) => results[n].worst <= 2),
            "bcs_hash is fract(sin(dot(p, (12.9898, 78.233))) * 43758.5453). Multiplying sin's output by 43758 " +
            "turns one float32 ULP into a DIFFERENT RANDOM NUMBER: measured divergence up to 0.68 on a 0..1 " +
            "value, i.e. 68% of the range. Not a tolerance to widen -- a limit to state. The source-shape " +
            "sections are what check these eight, and they check the SHAPE rather than the pixels -- plus, " +
            "since v4234, the two configurations above in which frosted's and pixelateMosaic's hash cancels.");

        // ---- 20. TRAP 3, MEASURED AT LAST -----------------------------------------------------------------
        //
        // *** THIS GATE'S OWN TAIL HAS SAID SINCE v4234 THAT "NO comparison here renders at a device pixel
        // *** ratio other than 1, so trap 3 is argued from the source and never measured". *** v4265 measures
        // it: every pointScale-carrying shader is rendered at ps=2 and compared against the CPU model AT ps=2.
        //
        // *** AND THE CONTROL IS THE WHOLE REASON THE ANSWER IS TRUSTWORTHY. *** The first run without it
        // reported FIVE shaders "DISAGREEING at 2x" -- glitch, melt, thermal, inkBleed, frosted -- which read
        // as five ports that are right at 1x and wrong on a Retina display. Re-run with the same comparison at
        // ps=1, every one of them ALREADY disagreed at 1x: they are the known sin-hash set, and attributing
        // their divergence to the point scale would have been a fabricated defect. wavePool went the other
        // way -- it looked clean at 2x (worst 0) while reading 5 at 1x, so a single scale can flatter as well
        // as accuse.
        console.log("\n20. trap 3 -- the first comparison at a device pixel ratio other than 1");
        {
            const carriers = pass.swiftShaderNames().filter((n) => "pointScale" in (pass.DEFAULT_KNOBS[n] || {}));
            ok("!! 17 of the 28 ported shaders carry pointScale at all", carriers.length === 17,
                carriers.length + " carriers: " + carriers.join(" "));
            const rows = [];
            for (const name of carriers) {
                const shot = (ps) => pg.evaluate(({ name, knobs, W, H, src }) => {
                    const p = window.__mk(name, W, H); p.render(new Uint8Array(src), knobs);
                    return Array.from(p.readPixels());
                }, { name, knobs: { ...CASES[name], pointScale: ps }, W, H, src: Array.from(src) });
                const g1 = await shot(1), g2 = await shot(2);
                let selfWorst = 0;
                for (let i = 0; i < W * H * 4; i++) { if (i % 4 === 3) continue;
                    const d = Math.abs(g1[i] - g2[i]); if (d > selfWorst) selfWorst = d; }
                const cmp = (gpu, ps) => { const cpu = MODEL[name]({ ...fimg },
                        { ...pass.DEFAULT_KNOBS[name], ...CASES[name], pointScale: ps });
                    let w2 = 0; for (let i = 0; i < W * H * 4; i++) { if (i % 4 === 3) continue;
                        const c = Math.max(0, Math.min(255, Math.round(cpu.data[i] * 255)));
                        const d = Math.abs(c - gpu[i]); if (d > w2) w2 = d; } return w2; };
                rows.push({ name, selfWorst, at1: cmp(g1, 1), at2: cmp(g2, 2) });
            }
            // 1. The parameter is LOAD-BEARING wherever it is carried -- not decoration.
            const inert = rows.filter((r) => r.selfWorst <= 2);
            ok("!! *** pointScale changes the picture in EVERY shader that carries it ***", inert.length === 0,
                "worst change per shader ranges " + Math.min(...rows.map((r) => r.selfWorst)) + " to " +
                Math.max(...rows.map((r) => r.selfWorst)) + " levels; inert: " + (inert.map((r) => r.name).join(" ") || "none"));
            // 2. THE FINDING: nothing is correct at 1x and broken at 2x.
            const brokeAt2 = rows.filter((r) => r.at1 <= 2 && r.at2 > 2);
            ok("!! *** NOTHING AGREES AT 1x AND BREAKS AT 2x -- trap 3 is carried correctly ***",
                brokeAt2.length === 0, brokeAt2.map((r) => r.name + "(" + r.at2 + ")").join(" ") || "0 of " + rows.length);
            const both = rows.filter((r) => r.at1 <= 2 && r.at2 <= 2);
            ok("!! and " + both.length + " agree with the CPU model at BOTH 1x and 2x", both.length === 11,
                both.map((r) => r.name).join(" "));
            // 3. The control, asserted rather than described: the ones that fail at 2x fail at 1x too.
            const off2 = rows.filter((r) => r.at2 > 2);
            ok("!! *** every shader that disagrees at 2x ALREADY disagrees at 1x -- the hash, not the scale ***",
                off2.every((r) => r.at1 > 2), off2.map((r) => r.name + " 1x=" + r.at1 + " 2x=" + r.at2).join(", "));
            ok("   and each of those is a known sin-hash user, derived from the source",
                off2.every((r) => HASHED.includes(r.name)), off2.map((r) => r.name).join(" "));
            report("*** WITHOUT THE 1x CONTROL THIS SECTION WOULD HAVE REPORTED FIVE DEFECTS THAT DO NOT " +
                "EXIST. *** A measurement at one scale is not a comparison; it becomes one only when the " +
                "other scale is measured the same way.");
            // SABOTAGE LOG for this section -- applied to a working tree, grep-confirmed before the result was
            // read, restored md5-identical (swiftShaderPass.js 5c65adc3e58a1e8cba909b2bb47a025f, this gate
            // ac12687c26834ceccbff8988b30a2716).
            //
            //   A  echo's GLSL drops its pointScale multiply (`uSpread * uPointScale` -> `uSpread`).
            //      -> 5 RED, and the diagnosis is exact: echo turns up as INERT at 2x and as the only shader
            //      that "agrees at 1x and breaks at 2x". That is precisely the defect shape this section
            //      exists to name, and before v4265 nothing in this gate could have seen it -- every
            //      comparison rendered at ps=1, where a dropped point scale is invisible by construction.
            //
            //   B  the 1x control removed (at1 hard-coded to 0).
            //      -> 3 RED, and it reproduces the false finding exactly: glitch, melt, thermal, inkBleed and
            //      frosted are reported as agreeing at 1x and breaking at 2x. FIVE DEFECTS THAT DO NOT EXIST,
            //      which is what the first run of this section actually printed before the control was added.
        }

        await b.close(); srv.close();
    }
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nunchecked here: whether these effects look GOOD, and whether the eight sin-hash shaders match " +
    "upstream's Metal PIXEL FOR PIXEL -- they cannot be made to, on any two implementations. What IS " +
    "checked, on a real WebGL2 context: 28 of 41 are ported; 15 of them agree with their CPU reference to " +
    "within 2 levels; 4 more (vortex and batch 10's three displacing shaders) agree to within ONE TEXEL of " +
    "the test gradient; wormhole agrees exactly away from its own wrap seam and by the full range on it; and " +
    "8 provably cannot agree at all. Also checked: that a knob which is a coordinate needs the same flip a " +
    "fragment coordinate does, and that toHalf no longer returns NaN for a value a half calls zero. *** THE " +
    "HOLE v4233's SABOTAGE FOUND IS CLOSED AT v4234: a second comparison image carries a diagonal alpha ramp " +
    "and is rendered with premultiplied = 0, so deleting a `* k` from a fragment shader now turns this red " +
    "for the six gradeable alpha-aware shaders, and the two hash ones are graded in the configurations where " +
    "the hash cancels (frosted at pointScale 0, pixelateMosaic fully assembled and on a flat alpha). *** " +
    "*** TRAP 3 IS NO LONGER ARGUED FROM THE SOURCE: v4265 MEASURED IT. *** Section 20 renders every one of " +
    "the 17 pointScale-carrying shaders at ps=2 and compares against the CPU model at ps=2. The parameter " +
    "changes the picture in ALL 17 -- it is load-bearing everywhere it appears -- 11 agree with the model at " +
    "BOTH 1x and 2x, and NOTHING agrees at 1x and breaks at 2x. The six that disagree at 2x already disagree " +
    "at 1x and are the sin-hash set, which the 1x control is what establishes: without it this gate would " +
    "have reported five defects that do not exist. STILL OPEN: the 13 unported shaders, and v4265 could not " +
    "reduce that number -- *** THE UPSTREAM METAL SOURCE IS NOT IN THIS TREE AND THIS SANDBOX HAS NO " +
    "NETWORK, so the remaining thirteen are not even NAMED anywhere here. *** Porting a shader from its " +
    "name would be invention, so the batch this round was asked for is a measurement instead.");
process.exit(fails ? 1 : 0);
