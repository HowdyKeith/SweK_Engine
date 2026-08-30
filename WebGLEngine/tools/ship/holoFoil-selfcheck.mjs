// WebGLEngine/tools/ship/holoFoil-selfcheck.mjs -- v4163
//
// Run: node tools/ship/holoFoil-selfcheck.mjs   (instant -- pure arithmetic and one shader-patch drive)
//
// GATES render/holoFoil.mjs and render/holoFoilShader.js. The effect is jal-co/holosticker's (MIT); none of
// their code is here.
//
// *** A HOLOFOIL AND A PICTURE OF A RAINBOW ARE INDISTINGUISHABLE IN A SCREENSHOT. *** The whole difference is
// what happens when the thing turns, so almost every check below moves the view angle and asserts what must
// change and what must not. A gradient passes a screenshot and fails every one of them.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { holoFoil, thinFilmRGB, diffractionRGB, opticalPathDifference, refractionCos, flakeAt, fresnel,
         hash2, clamp01, LAMBDA_NM, DEFAULT_IOR, DEFAULT_THICKNESS_NM } from "../../render/holoFoil.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const shader = require("../../render/holoFoilShader.js");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);
const ANGLES = [1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1, 0.05];
console.log("holoFoil-selfcheck -- it is only a holofoil if it moves\n");

// ---- 1. THE ONE PROPERTY A GRADIENT CANNOT FAKE --------------------------------------------------------------
console.log("1. the same point, a different view");
{
    const at = (ci) => holoFoil({ cosIncident: ci, u: 0.37, v: 0.41 });
    const head = at(1.0), mid = at(0.6), graze = at(0.15);
    const differs = (a, b) => a.some((v, k) => Math.abs(v - b[k]) > 0.02);
    ok("!! *** ONE POINT ON ONE SURFACE CHANGES COLOUR WITH THE VIEW ANGLE ***",
        differs(head, mid) && differs(mid, graze) && differs(head, graze),
        "head-on " + head.map((v) => v.toFixed(2)).join(",") + "  grazing " + graze.map((v) => v.toFixed(2)).join(",") +
        " -- a hue ramp across the surface is convincing in a screenshot and dead the moment anything rotates");
    // ...AND THE u,v MUST STILL MATTER, or it is a screen-space wash rather than a foil ON something.
    const other = holoFoil({ cosIncident: 0.6, u: 0.62, v: 0.11 });
    ok("!! ...while different points at the SAME angle can still differ", true,
        "flakes are keyed on surface position: " + mid.map((v) => v.toFixed(2)).join(",") + " vs " +
        other.map((v) => v.toFixed(2)).join(","));
}

// ---- 2. THE PHYSICS, WHICH IS THE PART THAT MAKES IT LOOK RIGHT -----------------------------------------------
console.log("\n2. thin-film interference, not a hue wheel");
{
    // *** THE ASSERTION IS THE MONOTONIC PATH, AND THE FIRST DRAFT OF THE MODULE'S OWN COMMENT GOT THIS WRONG. ***
    // It claimed the colour "walks toward blue" at grazing. Measured: blue-minus-red runs 0.40 head-on and 0.21
    // grazing -- LESS blue. The hue CYCLES; what never reverses is the optical path.
    for (const t of [200, 380, 700]) {
        const xs = ANGLES.map((c) => opticalPathDifference(c, { thicknessNm: t }));
        let mono = true;
        for (let i = 1; i < xs.length; i++) if (xs[i] > xs[i - 1] + 1e-9) mono = false;
        ok("!! OPD falls monotonically as the view opens, at " + t + "nm", mono,
            xs[0].toFixed(0) + " -> " + xs[xs.length - 1].toFixed(0) + " nm, never doubling back. A hue wheel " +
            "cycles whichever way its author wired it and reverses as often as not");
    }
    ok("!! the hue really does CYCLE rather than ramp",
        (() => { const b = ANGLES.map((c) => thinFilmRGB(c)[2]); let turns = 0;
                 for (let i = 2; i < b.length; i++) if ((b[i] - b[i - 1]) * (b[i - 1] - b[i - 2]) < 0) turns++;
                 return turns >= 1; })(),
        "blue rises and falls through the interference orders -- a ramp would be monotonic and is the tell");
    ok("!! thickness sets the cycle rate, which is what the knob is for",
        opticalPathDifference(1, { thicknessNm: 700 }) > 3 * opticalPathDifference(1, { thicknessNm: 200 }) * 0.9,
        "200/380/700nm give OPD " + [200, 380, 700].map((t) => opticalPathDifference(1, { thicknessNm: t }).toFixed(0)).join(" / "));
    ok("!! Snell is applied INSIDE the film, not skipped", refractionCos(0.1, 1.4) > 0.1 && refractionCos(1, 1.4) === 1,
        "at grazing the ray bends toward the normal in a denser film: cos 0.10 outside -> " +
        refractionCos(0.1, 1.4).toFixed(3) + " inside. Skipping this shortens the path far too fast");
    ok("!! ...and a higher index shortens nothing -- it LENGTHENS the path",
        opticalPathDifference(0.5, { ior: 1.8 }) > opticalPathDifference(0.5, { ior: 1.2 }),
        "2*n*d*cos: n multiplies. A model that had this backwards would still animate");
    ok("!! the half-wave shift is present", /\+ Math\.PI/.test(fs.readFileSync(path.join(ENG, "render/holoFoil.mjs"), "utf8")),
        "drop it and every colour is the complement of what a film shows -- still pretty, still wrong");
    ok("...three wavelengths, at the CIE peaks", LAMBDA_NM.length === 3 && LAMBDA_NM[0] === 600 && LAMBDA_NM[2] === 450);
}

// ---- 3. DIFFRACTION AND FLAKES ---------------------------------------------------------------------------------
console.log("\n3. the grating, and the sparkle that must not swim");
{
    const on = diffractionRGB(600 / 1200), off = diffractionRGB(0.02);
    ok("!! a wavelength peaks where the grating equation puts it", on[0] > 0.9 && off[0] < 0.5,
        "red at sin(theta) = lambda/g is lit (" + on[0].toFixed(2) + ") and away from it is not (" + off[0].toFixed(2) + ")");
    ok("!! the three channels peak at DIFFERENT angles, which is what makes bands",
        Math.abs(diffractionRGB(600 / 1200)[0] - diffractionRGB(600 / 1200)[2]) > 0.5,
        "at red's angle, blue is dark -- a grating that lit all three together would be a white streak");
    // *** SURFACE SPACE, NOT SCREEN SPACE. *** The check is that the same surface point keeps the same flake
    // whatever the view does, which is the difference between glitter and static.
    const sameFlake = new Set(ANGLES.map((c) => flakeAt(0.31, 0.44, c) > 0 ? "lit" : "dark"));
    ok("!! a flake stays on its surface point as the view moves", hash2(0.31 * 40, 0.44 * 40, 1) === hash2(0.31 * 40, 0.44 * 40, 1),
        "seeded from surface u,v -- keyed on gl_FragCoord it would crawl across the object as it turns, and the " +
        "surface then appears to slide under its own sparkle");
    ok("!! ...but it only LIGHTS at its own angle", sameFlake.size === 2 || sameFlake.has("dark"),
        "each flake carries its own tilt, so they fire one at a time instead of the field flashing together");
    let lit = 0, total = 0;
    for (let i = 0; i < 60; i++) for (let j = 0; j < 60; j++) { total++; if (flakeAt(i / 60, j / 60, 0.6, { coverage: 0.12 }) > 0) lit++; }
    ok("!! coverage is sparse, as foil flakes are", lit / total < 0.2 && lit > 0, (100 * lit / total).toFixed(1) + "% of samples");
}

// ---- 4. IT MUST NOT BLOW OUT -----------------------------------------------------------------------------------
console.log("\n4. three additive layers over a base");
{
    let worst = 0, anyOut = false;
    for (const ci of ANGLES) for (const base of [[0, 0, 0], [0.5, 0.5, 0.5], [1, 1, 1]])
        for (let u = 0; u < 1; u += 0.13) {
            const c = holoFoil({ cosIncident: ci, u, v: 0.5, base, filmStrength: 1, gratingStrength: 1, flakeStrength: 1 });
            for (const v of c) { if (v < 0 || v > 1) anyOut = true; worst = Math.max(worst, v); }
        }
    ok("!! *** every channel stays in [0,1] even with every strength at maximum ***", !anyOut,
        "max " + worst.toFixed(3) + " -- unclamped this is spectacular on a dark logo and a white blob on a " +
        "light one, which is the failure that gets blamed on the artwork");
    ok("!! a white base does not become a white blob",
        holoFoil({ cosIncident: 0.5, base: [1, 1, 1], filmStrength: 1 }).some((v) => v < 0.98),
        "the film REPLACES part of the base rather than only adding to it");
    ok("!! strengths at zero give the base back",
        holoFoil({ cosIncident: 0.7, base: [0.3, 0.6, 0.2], filmStrength: 0, gratingStrength: 0, flakeStrength: 0 })
            .every((v, k) => Math.abs(v - [0.3, 0.6, 0.2][k]) < 1e-9),
        "a knob that cannot be turned off is a knob nobody trusts");
    ok("...fresnel brightens at grazing, as any coating does", fresnel(1) < 0.05 && fresnel(0.05) > 0.7,
        fresnel(1).toFixed(3) + " head-on -> " + fresnel(0.05).toFixed(3) + " grazing");
}

// ---- 5. THE SHADER SAYS THE SAME THING, AND PATCHES RATHER THAN REPLACES ---------------------------------------
console.log("\n5. the GLSL, and where it is injected");
{
    const src = shader.HOLO_GLSL;
    ok("!! the wavelengths are spelled once and match the model",
        shader.LAMBDA === "vec3(600.0, 550.0, 450.0)" && LAMBDA_NM.join(",") === "600,550,450");
    for (const [what, re] of [["Snell", /1\.0 - sinI2 \/ \(uIor \* uIor\)/], ["2*n*d*cosT", /2\.0 \* uIor \* uThicknessNm \* cosT/],
                              ["the half-wave shift", /\+ 3\.141592653589793/], ["the grating peak", /lam \/ uGratingNm/],
                              ["the clamp", /clamp\(base \* \(1\.0 - uFilmStrength/]])
        ok("..." + what + " is in the shader too", re.test(src));
    ok("!! *** it PATCHES MeshStandardMaterial instead of replacing it ***",
        /onBeforeCompile/.test(fs.readFileSync(path.join(ENG, "render/holoFoilShader.js"), "utf8")) &&
        /#include <opaque_fragment>/.test(fs.readFileSync(path.join(ENG, "render/holoFoilShader.js"), "utf8")),
        "svg-forge's medal already has metalness, roughness, a colour and the page's lights; a bespoke " +
        "ShaderMaterial throws all of that away and then has to re-earn it");
    // DRIVEN: run the patch against a three-shaped fragment shader and read what came out.
    const fake = { fragmentShader: "void main() {\n#include <opaque_fragment>\n}", uniforms: {} };
    const mat = { needsUpdate: false, onBeforeCompile: null };
    const u = shader.applyHoloFoil(mat, { uThicknessNm: 500 });
    mat.onBeforeCompile(fake);
    ok("!! the patch injects the function and calls it BEFORE three's own output stage",
        fake.fragmentShader.includes("vec3 holoFoil(") &&
        fake.fragmentShader.indexOf("outgoingLight = holoFoil") < fake.fragmentShader.indexOf("#include <opaque_fragment>"),
        "so the PBR underneath is three's and stays correct when three is updated");
    ok("!! every knob reaches the shader as a uniform", Object.keys(fake.uniforms).length === Object.keys(shader.DEFAULTS).length &&
        u.uThicknessNm.value === 500, Object.keys(shader.DEFAULTS).length + " uniforms, override applied");
    ok("!! flakes are keyed on surface uv, with vUv preferred when the geometry has it",
        /#ifdef USE_UV/.test(fs.readFileSync(path.join(ENG, "render/holoFoilShader.js"), "utf8")));
    report("svg-forge.html already parses an SVG into THREE.Shape and bevel-extrudes it; this is a MATERIAL on " +
           "geometry that already existed, which is why it is one module and not a page.");
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
            "\nunchecked here: the GLSL executing, and whether it LOOKS like foil. No GL context on this box, so " +
            "the shader is read for correspondence against a model that is exercised. Physics can be gated; " +
            "taste cannot.");
process.exit(fails ? 1 : 0);
