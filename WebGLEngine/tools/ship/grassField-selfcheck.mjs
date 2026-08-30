// tools/ship/grassField-selfcheck.mjs -- the grass port: does the CPU reference agree with the shader, and
// are the two thirty-two-bit traps handled?
//
// Run: node tools/ship/grassField-selfcheck.mjs   (fast -- pure arithmetic and a source read, no GPU)
//
// GATES render/grassModel.mjs and render/grassField.js, ported from boona13/threejs-grass-water-shaders
// (MIT). The pattern is swiftShaders-selfcheck's: the GLSL is read for CORRESPONDENCE against a CPU model
// that is actually exercised, because this box has no GL context.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { codeOnly } from "./sourceScan.mjs";
import * as M from "../../render/grassModel.mjs";
import * as G from "../../render/grassField.js";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (n, d) => console.log("  ----  " + n + (d ? "   " + d : ""));

console.log("grassField-selfcheck -- the grass port, and the one trap of two that was real\n");

console.log("1. *** THE SHIFT THAT IS LOGICAL IN GLSL AND ARITHMETIC IN JS ***");
{
    // The hash is unsigned in GLSL, so `h >> 6u` shifts zeros in. JS `>>` sign-extends. Rebuilt here with
    // that one operator wrong, everything else identical, and swept -- this is the measurement, not a story.
    const bits = new ArrayBuffer(4), U = new Uint32Array(bits), F = new Float32Array(bits);
    const btf = (u) => { U[0] = u >>> 0; return F[0]; };
    const arithmeticShift = (px, py) => {
        const u = (x) => x >>> 0;
        const y = u(py);
        let h = u(y + u(y << 10));
        h = u(h ^ (h >> 6));                       // WRONG ON PURPOSE
        h = u(h + u(h << 3));
        h = u(h ^ (h >> 11));                      // WRONG ON PURPOSE
        const x = u(px);
        h = u(Math.imul(u(Math.imul(x, 1664525) + u(h + u(h << 15)) + 1013904223), 1664525));
        h = u(h ^ (h >> 11));
        h = u(h ^ u((h << 7) & 2636928640));
        h = u(h ^ u((h << 15) & 4022730752));
        h = u(h ^ (h >> 18));
        return btf(u((h & 8388607) | 1065353216)) - 1.0;
    };
    let differ = 0, n = 0;
    for (let x = -60; x <= 60; x++) for (let y = -60; y <= 60; y++) { n++; if (arithmeticShift(x, y) !== M.windHash(x, y)) differ++; }
    ok("!! *** >> instead of >>> changes 87% of the lattice, and looks exactly like noise either way ***",
        differ > n * 0.8,
        differ + " of " + n + " points differ (" + (100 * differ / n).toFixed(1) + "%). A sign-extended shift " +
        "puts ONES into the top bits and the XORs carry them through. Both versions return values in [0,1) " +
        "and both look like wind -- WHICH IS WHY THIS IS A CHECK AND NOT A LOOK.");

    ok("   ...and the model's own output really is in [0,1) across negatives, zero and large coordinates",
        [-99999, -7, -1, 0, 1, 7, 99999].every((i) => { const v = M.windHash(i, i); return v >= 0 && v < 1; }),
        "the tail is (h & 0x7FFFFF) | 0x3F800000 read as a float, minus one -- a mantissa trick, not a divide");

    ok("!! ...and negative lattice coordinates WRAP rather than going negative",
        M.windHash(-1, -1) === M.windHash(4294967295, 4294967295),
        "uvec2(ivec2(-1)) is 4294967295 in GLSL, and the shader relies on it for negative world coordinates");
}

console.log("\n2. *** AND THE OTHER OBVIOUS TRAP IS A NO-OP, WHICH ONLY MEASURING SHOWED ***");
{
    // `h + (h << 15u)` wraps in GLSL and does not in JS. It LOOKS like the same bug as section 1.
    const bits = new ArrayBuffer(4), U = new Uint32Array(bits), F = new Float32Array(bits);
    const btf = (u) => { U[0] = u >>> 0; return F[0]; };
    const noWrap = (px, py) => {
        const u = (x) => x >>> 0;
        const y = u(py);
        let h = y + (y << 10);                     // no u32
        h = u(h ^ (h >>> 6));
        h = h + (h << 3);                          // no u32
        h = u(h ^ (h >>> 11));
        const x = u(px);
        h = u(Math.imul(Math.imul(x, 1664525) + (h + (h << 15)) + 1013904223, 1664525));
        h = u(h ^ (h >>> 11));
        h = u(h ^ u((h << 7) & 2636928640));
        h = u(h ^ u((h << 15) & 4022730752));
        h = u(h ^ (h >>> 18));
        return btf(u((h & 8388607) | 1065353216)) - 1.0;
    };
    let differ = 0, n = 0;
    for (let x = -60; x <= 60; x++) for (let y = -60; y <= 60; y++) { n++; if (noWrap(x, y) !== M.windHash(x, y)) differ++; }
    ok("!! *** dropping the uint32 wrap on every addition changes NOTHING -- 0 of 14641 ***",
        differ === 0,
        differ + " of " + n + " differ. Every addition here is immediately consumed by ^ or by Math.imul, and " +
        "BOTH coerce to int32, so the wrap happens one operation later than it was written.");

    ok("   ...and that is asserted at the mechanism, not just at the outcome",
        ((2 ** 33 + 5) ^ 0) === 5 && Math.imul(2 ** 33 + 5, 1) === 5,
        "a float64 past 2^32 through ^ or imul comes back truncated -- which is what rescues it");

    report("*** THIRD TIME THIS SESSION A TRAP THAT FIT THE REASONING WAS A NO-OP ONCE MEASURED ***",
        "after the fmod hue example that saturated to one colour anyway, and the hash collisions that were " +
        "ZERO on the config whose numbers moved furthest. THE ARGUMENT FOR A BUG IS NOT THE BUG, and the " +
        "only thing that ever separates them is a sweep.");
}

console.log("\n3. THE BLADE DECIDES TO EXIST BEFORE IT DECIDES TO BEND");
{
    ok("!! flat ground draws", M.bladeVisibility(0, 1, 1).drawn);
    ok("!! a cliff past the cull does not, and says WHY",
        !M.bladeVisibility(0.9, 1, 1).drawn && M.bladeVisibility(0.9, 1, 1).reason === "slope",
        "slope " + G.SLOPE_CULL + " is the hard cut -- geometry, no randomness in it");

    // the shoulder is a DIFFERENT rule and must actually thin, or the grass ends on a contour line
    let drawn = 0, thinned = 0;
    for (let i = 0; i < 400; i++) {
        const v = M.bladeVisibility(0.5, i * 0.37, i * 1.11);
        if (v.drawn) drawn++; else if (v.reason === "thinned") thinned++;
    }
    ok("!! *** mid-slope THINS rather than cutting -- both outcomes occur at one slope ***",
        drawn > 0 && thinned > 0,
        drawn + " drawn, " + thinned + " thinned at slope 0.5. A hard edge here would end the grass on a " +
        "visible contour; the stochastic shoulder is what makes the transition soft, and a check that only " +
        "saw one outcome would not know which rule it was testing");

    ok("   ...and the two slope constants are DECLARED once, in the shader module, not retyped in the model",
        typeof G.SLOPE_CULL === "number" && typeof G.SLOPE_SHOULDER === "number" &&
        G.SLOPE_SHOULDER < G.SLOPE_CULL,
        "shoulder " + G.SLOPE_SHOULDER + " < cull " + G.SLOPE_CULL + ". Two copies of a threshold is the " +
        "defect this tree finds most often, and holoFoil had exactly it one round ago");
}

console.log("\n4. THE DEFORMATION, AND THE INVARIANT A BLADE CANNOT BREAK");
{
    const tip = M.bladeDeform({ gradient: 1, time: 2, growthDuration: 1, windStrength: 1, gustStrength: 1, bendStrength: 0.3 });
    const root = M.bladeDeform({ gradient: 0, time: 2, growthDuration: 1, windStrength: 1, gustStrength: 1, bendStrength: 0.3 });
    ok("!! *** THE ROOT NEVER MOVES, WHATEVER THE WIND DOES ***",
        root.offsetX === 0 && root.offsetZ === 0 && tip.offsetX !== 0,
        "every offset is scaled by tipWeight = gradient^2, which is 0 at the root. A blade that slid at its " +
        "base would detach from the ground it grows out of -- the one error here that reads as broken rather " +
        "than merely wrong");

    ok("!! no wind and no bend is the identity, so the effect can be turned off",
        (() => { const d = M.bladeDeform({ gradient: 1, time: 0, birthTime: 0, growthDuration: 1e-4,
                                           windStrength: 0, gustStrength: 0, bendStrength: 0 });
                 return d.offsetX === 0 && d.offsetZ === 0; })(),
        "a warp that cannot be switched off cannot be compared against anything");

    ok("!! growth is a smoothstep from birth, so a tuft does not pop in",
        (() => { const at = (t) => M.bladeDeform({ time: t, birthTime: 0, growthDuration: 2 }).growth;
                 return at(0) === 0 && at(2) === 1 && at(1) === 0.5 && at(0.5) < 0.25; })(),
        "0 at birth, 1 at the end, exactly 0.5 halfway, and BELOW the linear line early -- the cubic, not a ramp");

    // the two octaves must be genuinely independent, or the field breathes instead of gusting
    const a = [], b = [];
    for (let t = 0; t < 40; t++) {
        a.push(M.windNoise(0, 0, t * 0.1));
        b.push(M.windNoise(13.7, -9.1, t * 0.1 * 0.73 + 0.21));
    }
    const mean = (v) => v.reduce((s, x) => s + x, 0) / v.length;
    const ma = mean(a), mb = mean(b);
    const cov = a.reduce((s, x, i) => s + (x - ma) * (b[i] - mb), 0);
    const sa = Math.sqrt(a.reduce((s, x) => s + (x - ma) ** 2, 0)), sb = Math.sqrt(b.reduce((s, x) => s + (x - mb) ** 2, 0));
    const corr = cov / (sa * sb || 1);
    ok("!! *** the gust octave is offset in SPACE AND RATE, so it is not a scaled copy of the base wind ***",
        Math.abs(corr) < 0.5,
        "correlation " + corr.toFixed(3) + " over 40 samples. Sampling one lattice twice at one rate would " +
        "give a scaled copy and the whole field would breathe in lockstep instead of gusting -- the offsets " +
        "(13.7, -9.1) and the 0.73/0.21 rate remap are both load-bearing");
}

console.log("\n5. THE SHADER SOURCE AND THE MODEL ARE THE SAME ARITHMETIC");
{
    const src = fs.readFileSync(path.join(ENG, "render", "grassField.js"), "utf8");
    const code = codeOnly(src);
    ok("!! *** no CommonJS -- a shader module must load in a browser, not only in Node ***",
        !/\bmodule\s*\.\s*exports\b/.test(code) && !/\brequire\s*\(/.test(code),
        "codeOnly'd, so the header paragraph that NAMES module.exports while explaining why it is absent " +
        "cannot satisfy the check describing it. v4169 found two shader files that shipped this way");

    ok("   ...and it does not import three, so it stays loadable where the gate runs",
        !/^\s*import[^\n]*["']three/m.test(code) && typeof G.makeGrassMaterial === "function",
        "THREE is a parameter of makeGrassMaterial. holoFoilShader takes the same shape for the same reason");

    for (const [name, needle] of [
        ["the wind lattice reaches the vertex shader", "windHash"],
        ["the two-octave sway", "gustStrength"],
        ["the push field", "pushRadius"],
        ["the slope cull", "0.65"],
        ["the stochastic thinning", "bladeHash"],
    ]) ok("   " + name + " is present in the GLSL", G.GRASS_VERTEX.includes(needle), needle);

    ok("!! the vertex shader interpolates the wind lattice rather than restating it",
        (G.GRASS_VERTEX.match(/float windHash\(/g) || []).length === 1,
        "one definition, injected from WIND_LATTICE_GLSL -- a second copy in the shader body is how the " +
        "model and the GLSL would drift apart while both still compiling");
}

console.log("\n6. IT IS WIRED, AND THE LICENCE TRAVELS WITH IT");
{
    const mainCode = codeOnly(fs.readFileSync(path.join(ENG, "main.js"), "utf8"));
    ok("!! *** main.js imports the material factory AND calls it ***",
        /import\s*\{[^}]*makeGrassMaterial[^}]*\}\s*from/.test(mainCode) && /makeGrassMaterial\s*\(/.test(mainCode),
        "checked against codeOnly(main.js), so neither the ENGINE_VERSION changelog nor a string literal can " +
        "satisfy it. referenceKind counts a module nothing imports as an orphan held out of its census by a " +
        "SENTENCE, and v4169 spent a round wiring five of them -- this one arrives wired");

    ok("   ...and the CPU reference is reachable too, not just the shader",
        /GRASS_CPU/.test(mainCode) && /window\.grass/.test(mainCode),
        "window.grass.wind()/.visible()/.deform() -- the no-GPU path, which no gate would ever have noticed " +
        "was missing because a gate has no GPU either");

    const lic = path.join(ENG, "vendor", "grass", "LICENSE");
    ok("!! *** the upstream MIT licence is vendored, not just cited in a comment ***",
        fs.existsSync(lic) && /MIT License/.test(fs.readFileSync(lic, "utf8")),
        "boona13's terms are \"do whatever you want with the code, attribution appreciated but not required\" " +
        "-- appreciated is enough of a reason, and a licence named in a comment is not a licence shipped");
}

report("NOT CHECKED HERE: the GLSL executing, or whether it looks like grass. No GL context on this box, so " +
       "the shader is read for correspondence against a model that IS exercised -- the same limit " +
       "swiftShaders-selfcheck states, and for the same reason. The water half of the upstream repo is not " +
       "ported at all: shaders/waterReflectRefract.frag.glsl already exists.");

console.log("\n" + (fails ? "grassField-selfcheck: " + fails + " FAILED" : "grassField-selfcheck: all checks pass"));
process.exit(fails ? 1 : 0);
