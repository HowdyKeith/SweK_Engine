// WebGLEngine/render/badTv-selfcheck.mjs -- v4182
//
// GATES render/badTvModel.mjs, render/badTvPass.js, and the CPU snoise2 added to shaders/ashimaNoise.mjs.
//
// *** SECTION 2 IS THE ONE THAT MATTERS AND IT IS ABOUT A MISTAKE THIS TREE NEARLY MADE. *** v4177 set out to
// consolidate "three copies of the same forty lines" of Ashima noise and was stopped by checking one constant:
// the 2D and 3D functions are DIFFERENT, not variants. This round measures how different, and the answer is
// not academic -- 2D returns [-1, 1] and this tree's 3D returns about +/-4.2. The coarse offset here is CUBED,
// so feeding the wrong one in would have multiplied the tear by roughly sixty-four. The checks below pin the
// separation numerically rather than leaving it as a comment.
//
// Section 4 pins the cube itself, which is the single most inviting thing in this shader to "simplify".
//
// Run: node render/badTv-selfcheck.mjs   (exit 0 all-pass, 1 on any fail)

import { offsetAt, sampleAt, fract, maxTear, DEFAULTS, COARSE_FREQ, FINE_FREQ, COARSE_GAIN, FINE_GAIN, COMPOSE_ORDER } from "./badTvModel.mjs";
import { FRAGMENT_SHADER, VERTEX_SHADER, makeBadTvPass } from "./badTvPass.js";
import { snoise2, snoise3, SNOISE2_FALLOFF, SNOISE2_SCALE, SNOISE3_FALLOFF, SNOISE3_SCALE } from "../shaders/ashimaNoise.mjs";
import { readFileSync } from "node:fs";
import { codeOnly, noComments } from "../tools/ship/sourceScan.mjs";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  FAIL  " + m); } };
const src = (p) => readFileSync(new URL(p, import.meta.url).pathname, "utf8");

// 1) THE CPU snoise2 IS FAITHFUL, by the same properties used for snoise3 at v4177 -- the ones a
//    mis-translation fails.
{
    ok(snoise2(3.3, 1.7) === snoise2(3.3, 1.7), "deterministic");
    ok(Number.isFinite(snoise2(0, 0)) && Number.isFinite(snoise2(-1e3, 1e3)), "finite at the origin and far from it");
    const h = 1e-4; let jump = 0;
    for (let t = 0; t < 40; t += h * 3) jump = Math.max(jump, Math.abs(snoise2(t + h, t * 0.7) - snoise2(t, t * 0.7)));
    ok(jump < 0.01, `CONTINUOUS: largest delta over a 1e-4 step is ${jump.toExponential(2)} (slope ${(jump / h).toFixed(1)}); a broken corner selection would read near 1e4`);
    let s = 0, n = 0, mn = Infinity, mx = -Infinity;
    for (let x = 0; x < 40; x += 0.19) for (let y = 0; y < 40; y += 0.23) { const v = snoise2(x, y); s += v; n++; mn = Math.min(mn, v); mx = Math.max(mx, v); }
    ok(Math.abs(s / n) < 5e-3, `ZERO MEAN: ${(s / n).toExponential(2)} over ${n} samples`);
    ok(mn > -1.05 && mx < 1.05, `and its range IS the textbook [-1, 1] (measured ${mn.toFixed(3)} to ${mx.toFixed(3)})`);
}

// 2) *** 2D AND 3D ARE MEASURABLY DIFFERENT FUNCTIONS, AND THE CUBE MAKES THE DIFFERENCE VIOLENT. ***
{
    ok(SNOISE2_FALLOFF === 0.5 && SNOISE2_SCALE === 130, "2D uses falloff 0.5 and scale 130");
    ok(SNOISE3_FALLOFF === 0.6 && SNOISE3_SCALE === 42, "3D uses falloff 0.6 and scale 42 -- different numbers, each correct for its dimension");

    let mx2 = 0, mx3 = 0;
    for (let x = 0; x < 30; x += 0.21) for (let y = 0; y < 30; y += 0.23) {
        mx2 = Math.max(mx2, Math.abs(snoise2(x, y)));
        mx3 = Math.max(mx3, Math.abs(snoise3(x, y, 0)));
    }
    ok(mx2 < 1.05, `2D peaks at ${mx2.toFixed(3)}`);
    ok(mx3 > 2, `while 3D peaks at ${mx3.toFixed(3)} -- the SAME library, the SAME author, and not the same range`);
    // and what that would have done here, since the offset is cubed
    const ratio = mx3 / mx2;
    ok(ratio ** 3 > 20,
        `*** and the coarse offset is CUBED, so substituting one for the other would scale the tear by about ${(ratio ** 3).toFixed(0)}x -- a picture torn off the screen, not a subtle drift ***`);
}

// 3) THE CONSTANTS ARE THE ORIGINAL'S, digit for digit.
{
    ok(DEFAULTS.distortion === 3.0 && DEFAULTS.distortion2 === 5.0, "distortion 3.0 and distortion2 5.0");
    ok(DEFAULTS.speed === 0.2 && DEFAULTS.rollSpeed === 0.1, "speed 0.2 and rollSpeed 0.1");
    ok(COARSE_FREQ === 3.0 && FINE_FREQ === 50.0, "the two noise frequencies, 3 and 50, which the original does not expose as uniforms");
    ok(COARSE_GAIN === 0.2 && FINE_GAIN === 0.001, "and the two gains, 0.2 before the cube and 0.001 after");
    ok(Object.isFrozen(DEFAULTS), "the defaults are frozen");
}

// 4) *** THE CUBE. The single most inviting thing here to "simplify", and simplifying it changes the effect
//    from tearing to wobbling while every knob keeps its name. ***
{
    const code = codeOnly(src("./badTvModel.mjs"));
    ok(/offset \* distortion \* offset \* distortion \* offset/.test(code),
        "the model keeps the original's five-term product, which is offset^3 * distortion^2");
    ok(/offset \* distortion \* offset \* distortion \* offset/.test(FRAGMENT_SHADER),
        "and so does the shipped GLSL");

    // the behaviour the cube produces, measured: the response to the knob is super-linear
    const t3 = maxTear(0, { distortion: 3 }), t6 = maxTear(0, { distortion: 6 });
    ok(t6 / t3 > 3.5, `doubling distortion more than doubles the tear (${(t6 / t3).toFixed(2)}x) -- linear would give exactly 2x`);
    ok(Math.abs(t6 / t3 - 4) < 0.5, "and lands near 4x, which is distortion SQUARED, since the cube's third factor carries no knob");

    // small noise is crushed, large noise is not: that IS the character
    let small = 0, large = 0, n = 0;
    for (let i = 0; i < 2000; i++) {
        const o = Math.abs(offsetAt(i / 2000, 0));
        if (o < 0.005) small++;
        if (o > 0.02) large++;
        n++;
    }
    ok(small > n * 0.3, `most rows are barely displaced (${small} of ${n} under 0.005 UV) -- the picture sits still`);
    ok(large > 0, `while some tear hard (${large} rows past 0.02 UV) -- which is what the cube buys`);
}

// 5) *** fract, NOT %. *** GLSL's fract returns a POSITIVE fraction for a negative input; JavaScript's %
//    returns a negative one, which would sample outside the texture and read as a black band rolling through.
{
    ok(fract(-0.25) === 0.75, "fract(-0.25) is 0.75, as GLSL gives");
    ok((-0.25 % 1) === -0.25, "control: JavaScript's % gives -0.25 for the same input, which is the bug this avoids");
    ok(fract(1.25) === 0.25 && fract(0.5) === 0.5, "and it behaves normally for positives");
    // every sampled coordinate stays inside [0, 1)
    let outside = 0;
    for (let t = 0; t < 12; t += 0.13) for (let v = 0; v <= 1; v += 0.05) {
        const [su, sv] = sampleAt(0.5, v, t);
        if (su < 0 || su >= 1 || sv < 0 || sv >= 1) outside++;
    }
    ok(outside === 0, "no sampled coordinate ever leaves [0, 1) across 12 seconds of roll");
    ok(/fract\(p\.x \+ offset\)/.test(FRAGMENT_SHADER) && /fract\(p\.y - time \* rollSpeed\)/.test(FRAGMENT_SHADER),
        "and the GLSL wraps BOTH axes -- the tear around the edge, the roll top to bottom");
}

// 6) THE DISTORTION IS ROW-ONLY, which is what makes it TEARING rather than a warp.
{
    ok(offsetAt(0.3, 0) === offsetAt(0.3, 0), "the offset for a row is a pure function of that row and the time");
    const a = sampleAt(0.1, 0.4, 2.5), b = sampleAt(0.9, 0.4, 2.5);
    ok(Math.abs((a[0] - 0.1) - (b[0] - 0.9)) < 1e-12, "two pixels on the SAME row are displaced by exactly the same amount -- a horizontal tear, not a swirl");
    ok(offsetAt(0.4, 0) !== offsetAt(0.6, 0), "while different rows differ");
    const code = codeOnly(src("./badTvModel.mjs"));
    ok(!/offsetAt\(u/.test(code) && /function offsetAt\(v, time/.test(code), "and the function does not even take a column, so a warp is not expressible by accident");
}

// 7) THE ROLL is independent of the distortion's travel.
{
    const still = sampleAt(0.5, 0.5, 3, { rollSpeed: 0 });
    ok(Math.abs(still[1] - 0.5) < 1e-12, "rollSpeed 0 holds the picture vertically still");
    ok(Math.abs(sampleAt(0.5, 0.5, 3, { speed: 0, rollSpeed: 0 })[0] - 0.5) > 0,
        "while speed 0 still leaves a static tear -- the pattern stops travelling, it does not vanish");
    const r = sampleAt(0.5, 0.5, 1, { rollSpeed: 0.25 });
    ok(Math.abs(r[1] - fract(0.5 - 0.25)) < 1e-12, "the roll is exactly time * rollSpeed, wrapped");
}

// 8) *** THE COMPOSE ORDER IS PHYSICAL AND IS DECLARED AS DATA. *** A tube cannot un-tear a torn signal. The
//    other order lays scanlines on an undistorted image and then smears them sideways, which no CRT does.
{
    ok(COMPOSE_ORDER.join(",") === "badTv,crt", "signal damage first, tube optics second");
    ok(Object.isFrozen(COMPOSE_ORDER), "declared as frozen data, so a caller can CHECK the order rather than read a comment about it");
    const model = src("./badTvModel.mjs");
    ok(/cannot un-tear|un-tear a torn/.test(model), "and the reason is written down where the order is");
    ok(/crtModel/.test(model), "with the module it composes against named");
}

// 9) THE PASS: shape, and the orphan it closes.
{
    const code = codeOnly(src("./badTvPass.js"));
    const nc = noComments(src("./badTvPass.js"));
    ok(/import \{[^}]*SNOISE2_BLOCK[^}]*\} from "\.\.\/shaders\/ashimaNoise\.js"/.test(nc),
        "*** the pass consumes SNOISE2_BLOCK, which had NO consumer at all before this -- the orphan v4177 created in anticipation ***");
    ok(!/vec3 mod289/.test(code) && !/taylorInvSqrt/.test(code), "and carries no copy of the noise itself");
    ok(/float snoise2\(vec2/.test(FRAGMENT_SHADER), "the shipped GLSL declares snoise2");
    ok(!/float snoise\(vec3/.test(FRAGMENT_SHADER), "and NOT the 3D function, whose range would cube into a sixty-fold tear");
    ok(/Ashima/.test(FRAGMENT_SHADER), "Ashima's credit rides in the shipped shader, not only in a source comment");
    ok(/Felix Turner/.test(src("./badTvPass.js")), "and Felix Turner's, since this is his shader under MIT");

    ok(/function makeBadTvPass\(THREE/.test(code), "THREE arrives as a parameter, like makeAquarellePass");
    ok(!/import .* from ["']three/.test(code) && !/vendor\/three/.test(code), "so the module imports three nowhere");
    ok(/setRenderTarget/.test(code) && !/PlaneBufferGeometry/.test(code), "and uses live three API, not the removed calls the aquarelle port had to fix");
    ok(/COARSE_FREQ\.toFixed|FINE_FREQ\.toFixed/.test(code),
        "the shader INTERPOLATES the model's constants rather than repeating them, so the two cannot drift");
    let threw = null; try { makeBadTvPass(null); } catch (e) { threw = e; }
    ok(threw instanceof TypeError, "and it refuses a missing THREE loudly");
    ok(/varying vec2 vUv/.test(VERTEX_SHADER), "the vertex shader passes uv through");
}

console.log(`badTv-selfcheck: ${pass} passed, ${fail} failed`);
console.log("unchecked here: the pass RENDERING, which needs a GL context. What is settled is that the maths\n" +
            "matches the original digit for digit, that the shader is generated from the same constants the CPU\n" +
            "model exports, and -- measured, not asserted -- that the 2D and 3D simplex differ enough that\n" +
            "substituting one for the other would have been a sixty-fold error rather than a subtle one.");
process.exit(fail ? 1 : 0);
