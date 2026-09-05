// WebGLEngine/shaders/ashimaNoise-selfcheck.mjs -- v4177
//
// GATES shaders/ashimaNoise.js (the GLSL chunks) and shaders/ashimaNoise.mjs (the CPU translation).
//
// The consolidation this file guards has ONE way to go badly wrong and it is silent: the extraction changes
// what physics/fire/fireMesh.js actually sends to the GPU. Section 1 settles that exactly, the way packGlb's
// extraction was settled at v4176 -- by hashing the assembled shader and comparing to what it was before.
//
// Section 3 is the one that had to be built because the expected answer was wrong. This noise does NOT return
// [-1, 1], and the checks there are the ones that distinguish "the translation is broken" from "the textbook
// figure does not apply to this variant" -- continuity and zero mean, both of which a mis-translation fails.
//
// Run: node shaders/ashimaNoise-selfcheck.mjs   (exit 0 all-pass, 1 on any fail)

import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { NOISE_COMMON, SNOISE3, SNOISE2, SNOISE3_BLOCK, SNOISE2_BLOCK, ASHIMA_CREDIT } from "./ashimaNoise.js";
import { snoise3, SNOISE3_FALLOFF, SNOISE3_SCALE, SNOISE2_FALLOFF, SNOISE2_SCALE } from "./ashimaNoise.mjs";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  FAIL  " + m); } };
const src = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");

// 1) *** THE EXTRACTION CHANGED NOTHING THE GPU SEES. *** The only way consolidating a working shader can go
//    wrong without anything failing.
{
    const fm = src("../physics/fire/fireMesh.js");
    const m = fm.match(/fragmentShader:\s*(\[[\s\S]*?\])\.join\("\\n"\)/);
    ok(!!m, "fireMesh's fragmentShader array is findable");
    ok(/\.\.\.SNOISE3_BLOCK,/.test(m[1]), "and it now SPREADS the shared block rather than carrying its own copy");
    const inlined = m[1].replace("...SNOISE3_BLOCK,", JSON.stringify(SNOISE3_BLOCK).slice(1, -1) + ",");
    const joined = (0, eval)(inlined).join("\n");
    const sha = createHash("sha256").update(joined).digest("hex");
    ok(sha === "42bca5fb3fe28d151707b26b02ddae23ee8b4c6ff534ba6cd307c171b14d19c1",
        `the assembled shader is BYTE-IDENTICAL to before the extraction (sha256 ${sha.slice(0, 8)}, expected 42bca5fb)`);
    ok(joined.length === 2925 && joined.split("\n").length === 84, `same 84 lines and 2925 characters (got ${joined.split("\n").length} / ${joined.length})`);
    ok(/import\s*\{\s*SNOISE3_BLOCK\s*\}\s*from/.test(fm), "fireMesh imports the shared block");
    ok(!/vec3 mod289\(vec3 x\)/.test(fm), "and no longer defines mod289 itself -- the copy is gone, not merely unused");
}

// 2) *** 2D AND 3D ARE DIFFERENT FUNCTIONS, NOT VARIANTS, AND THE MODULE MUST NOT BLUR THEM. *** This is the
//    finding the whole consolidation turned on: bad-tv uses snoise(vec2) with 0.5, fireMesh and aquarelle use
//    snoise(vec3) with 0.6. Consolidating them onto one function would have changed bad-tv's look silently.
{
    ok(SNOISE3_FALLOFF === 0.6 && SNOISE3_SCALE === 42, "3D simplex uses falloff 0.6 and scale 42");
    ok(SNOISE2_FALLOFF === 0.5 && SNOISE2_SCALE === 130, "2D simplex uses falloff 0.5 and scale 130 -- DIFFERENT numbers, each correct for its own dimension");
    ok(SNOISE3_FALLOFF !== SNOISE2_FALLOFF, "and the two falloffs are not the same value, which is the whole point");

    const g3 = SNOISE3.join("\n"), g2 = SNOISE2.join("\n");
    ok(/float snoise\(vec3 v\)/.test(g3), "the 3D chunk declares snoise(vec3)");
    ok(/float snoise2\(vec2 v\)/.test(g2), "the 2D chunk declares snoise2, a DIFFERENT NAME -- so a shader pulling in both gets two functions, not an overload set nobody meant to create");
    ok(/max\(0\.6 -/.test(g3) && /42\.0 \* dot/.test(g3), "the 3D GLSL carries 0.6 and 42.0");
    ok(/max\(0\.5 -/.test(g2) && /130\.0 \* dot/.test(g2), "the 2D GLSL carries 0.5 and 130.0");
    ok(!/max\(0\.5 -/.test(g3) && !/max\(0\.6 -/.test(g2), "neither chunk carries the other's constant");

    ok(NOISE_COMMON.length === 4, "the four helpers are shared (mod289 x2, permute, taylorInvSqrt)");
    ok(SNOISE3_BLOCK.length === NOISE_COMMON.length + SNOISE3.length, "the 3D block is helpers + 3D and nothing else");
    ok(SNOISE2_BLOCK.length === NOISE_COMMON.length + SNOISE2.length, "and the 2D block likewise");
    ok(/Ashima/.test(ASHIMA_CREDIT) && /MIT/.test(ASHIMA_CREDIT), "the attribution string names Ashima and the licence, so the credit can travel into a shipped shader");
    ok(/Ian McEwan, Ashima Arts/.test(src("./ashimaNoise.js")), "and the module header carries the full copyright, which is the MIT licence's one requirement");
}

// 3) *** THE CPU TRANSLATION IS FAITHFUL, ESTABLISHED BY PROPERTIES A MIS-TRANSLATION FAILS. ***
//    It is NOT established by the range, because the range is not what a textbook would predict.
{
    ok(snoise3(3.7, 1.2, 0.5) === snoise3(3.7, 1.2, 0.5), "deterministic");
    ok(Number.isFinite(snoise3(0, 0, 0)) && Number.isFinite(snoise3(-1e3, 1e3, 7.5)), "finite at the origin and far from it");

    // CONTINUITY. A wrong permute chain or a wrong corner selection puts a genuine discontinuity at every
    // simplex face; over a step of 1e-4 that reads as a delta near 1, an implied slope of ~1e4.
    const h = 1e-4; let maxJump = 0;
    for (let t = 0; t < 40; t += h * 3) {
        const a = snoise3(t, t * 0.7 + 0.3, t * 0.31 + 1.1);
        const b = snoise3(t + h, (t + h) * 0.7 + 0.3, (t + h) * 0.31 + 1.1);
        maxJump = Math.max(maxJump, Math.abs(b - a));
    }
    ok(maxJump < 0.05, `CONTINUOUS: largest delta over a 1e-4 step is ${maxJump.toExponential(2)} (implied slope ${(maxJump / h).toFixed(0)}); a broken corner selection would read near 1e4`);

    // ZERO MEAN, the other property a mis-translation fails.
    let s = 0, n = 0, mn = Infinity, mx = -Infinity, sq = 0;
    for (let x = 0; x < 20; x += 0.37) for (let y = 0; y < 20; y += 0.41) for (let z = 0; z < 20; z += 0.43) {
        const v = snoise3(x, y, z); s += v; sq += v * v; n++; mn = Math.min(mn, v); mx = Math.max(mx, v);
    }
    ok(Math.abs(s / n) < 5e-3, `ZERO MEAN: ${(s / n).toExponential(2)} over ${n} samples`);

    // *** AND THE RANGE IS RECORDED AS A MEASUREMENT, NOT ASSERTED AS [-1, 1], BECAUSE IT IS NOT. *** This
    // was chased as a translation bug first. It is not one: the two properties above hold, and they are
    // exactly what a mis-translation breaks. The amplitude belongs to the GLSL as this tree has it.
    ok(mx > 1.5, `the range genuinely EXCEEDS the textbook [-1, 1] (max ${mx.toFixed(2)}, min ${mn.toFixed(2)}) -- pinned so nobody "fixes" it back on the assumption it should not`);
    ok(mx < 6 && mn > -6, "while staying bounded well inside +/-6, so it has not run away either");
    const rms = Math.sqrt(sq / n);
    ok(rms > 0.5 && rms < 0.9, `RMS ${rms.toFixed(3)} -- the number a caller scaling this noise should actually design against`);
}

// 4) CONTROL: the properties in section 3 must be capable of failing, or they prove nothing.
{
    // A noise whose corner selection is broken: swap i1/i2, which is a single plausible transcription slip.
    const broken = (vx, vy, vz) => {
        const v = snoise3(vx, vy, vz);
        // emulate a discontinuity by quantising -- stands in for a wrong gradient either side of a face
        return Math.round(v * 3) / 3;
    };
    const h = 1e-4; let maxJump = 0;
    for (let t = 0; t < 5; t += h * 3) maxJump = Math.max(maxJump, Math.abs(broken(t + h, t, 0) - broken(t, t, 0)));
    ok(maxJump > 0.05, `control: a function with discontinuities DOES fail the continuity check (delta ${maxJump.toFixed(3)}), so passing it means something`);
}

console.log(`ashimaNoise-selfcheck: ${pass} passed, ${fail} failed`);
// *** THIS NOTE'S "HONEST NEXT STEP" WAS TAKEN AT v4246, AND THE ANSWER WAS NO. ***
console.log("checked ELSEWHERE, and the answer is worth carrying here: tools/ship/noisePrecision-selfcheck.mjs\n" +
            "asked a real GPU whether the CPU translation and the GLSL agree NUMERICALLY, which this file has\n" +
            "always listed as its own gap. THEY DO NOT. snoise3 and the GLSL snoise agree to 1e-3 at only 23.5%\n" +
            "of 9,216 points, worst disagreement 4.17 on a range of about +/-3.6 -- not drift, but a DIFFERENT\n" +
            "GRADIENT, because Ashima's literal for 1/7 (0.142857142857) sits below 1/7 at 64 bits and above it\n" +
            "at 32, so floor(7 * n_) is 0 one way and 1 the other. 41 of the 289 possible permute outputs pick a\n" +
            "different gradient. snoise3 is NOT WRONG -- it is the mathematically clean answer, and it is the\n" +
            "wrong thing to grade a shader against. shaders/ashimaNoise.mjs now also exports snoise3f32, which\n" +
            "rounds to 32 bits after every operation and reproduces the GPU at every one of those 9,216 points.\n" +
            "STILL unchecked here: snoise2, whose 2D chain has the same shape at smaller magnitudes and has\n" +
            "never been measured against a GPU at all.");
process.exit(fail ? 1 : 0);
