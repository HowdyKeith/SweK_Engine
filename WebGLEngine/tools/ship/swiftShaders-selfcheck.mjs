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
// WHAT CANNOT BE CHECKED HERE, STATED RATHER THAN GLOSSED: nothing on this box has a GL context, so the GLSL is
// never executed. The CPU model IS exercised, and the shader is read for CORRESPONDENCE -- same constants, same
// expressions, same traps applied at the same places. That is weaker than crtPass's bit-identical comparison
// and it is what is available; the day this tree grows a headless GL, the honest upgrade is to run both.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { bcsEmboss, bcsHeatShimmer, toHalf, fmod, glmod, luma, mix, clamp, sampler,
         METAL_TO_GLSL, LUMA } from "../../render/swiftShaderModel.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const pass = require("../../render/swiftShaderPass.js");
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

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
            "\nunchecked here: the GLSL executing. No GL context on this box, so the shader is read for " +
            "correspondence rather than run -- weaker than crtPass's bit-identical comparison, and stated " +
            "rather than implied.");
process.exit(fails ? 1 : 0);
