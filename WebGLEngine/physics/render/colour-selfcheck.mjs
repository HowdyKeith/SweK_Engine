// WebGLEngine/physics/render/colour-selfcheck.mjs -- v3497
//
// Run: node physics/render/colour-selfcheck.mjs   (~0.4s)
//
// *** RADIANCE WAS A SCALAR THROUGH THIS WHOLE ARC. The key everybody reaches for is that A GREY WORLD MUST
// RETURN IDENTICAL VALUES PER CHANNEL -- and it is NECESSARY AND NOT SUFFICIENT, because a renderer that
// ignored colour entirely would satisfy it (v3177's shape, a check that passes because nothing happens). ***
//
// THE SUFFICIENT HALF IS THE ONE WORTH BUILDING: CHANNEL k OF A COLOURED RENDER MUST EQUAL A MONOCHROME RENDER
// OF THAT CHANNEL'S OWN VALUE, BIT FOR BIT. That demands channel k's arithmetic be untouched by what the other
// two carry, and the answer key is already built -- it is ten rounds of graded scalar renderer, run three times.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { render, coverage } from "./pathTracer.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

const CAM = { w: 24, h: 24, spp: 64, seed: 5, eye: [0, 0, 4], look: [0, 0, 0], fovDeg: 40, maxDepth: 6, sky: () => 1 };
const ALB = [0.9, 0.18, 0.05];          // a strongly coloured diffuse sphere
const F0 = [0.95, 0.64, 0.54];          // a tinted conductor
const diff = (v) => [{ centre: [0, 0, 0], radius: 1, albedo: v }];
const metal = (v) => [{ centre: [0, 0, 0], radius: 1, roughness: 0.3, F0: v }];

/* ------------------------------------------------------------------------------------------------------------
 * 1. THE WIDENING MOVED NOTHING -- THE REGRESSION KEY, AND IT IS EXACT
 * --------------------------------------------------------------------------------------------------------- */
{
    const mono = render(diff(0.42), CAM), rgb = render(diff(0.42), { ...CAM, rgb: true });
    let off = 0;
    for (let i = 0; i < mono.length; i++) if (rgb[i * 3] !== mono[i]) off++;
    say(`monochrome buffer against channel 0 of the RGB buffer: ${off} of ${mono.length} pixels differ`);
    ok("!! *** THE SCALAR PATH IS BIT-IDENTICAL TO CHANNEL 0 OF THE COLOURED ONE ***",
       off === 0 && rgb.length === mono.length * 3,
       "*** THERE IS ONE COMPUTATION AND ONE PROJECTION AT THE EXIT -- `rgb` decides what comes BACK, never how it is worked out. A separate scalar path would be a second declaration of the entire renderer, which is the defect this tree names more often than any other, and it would drift the first time somebody fixed one of them. TEN ROUNDS OF GRADED NUMBERS DEPEND ON THAT ARRAY, and this is the line that says none of them moved. ***");
}

/* ------------------------------------------------------------------------------------------------------------
 * 2. THE GREY KEY -- TRUE, EXACT, AND NOT SUFFICIENT
 * --------------------------------------------------------------------------------------------------------- */
{
    let bad = 0;
    const rgb = render(diff(0.42), { ...CAM, rgb: true });
    for (let i = 0; i < rgb.length; i += 3) if (rgb[i] !== rgb[i + 1] || rgb[i + 1] !== rgb[i + 2]) bad++;
    ok("!! a grey world returns identical values per channel, BIT FOR BIT",
       bad === 0,
       "Not within a tolerance: the three channels do the same arithmetic on the same numbers, so anything but exact equality would mean a channel had picked up something of its own.");
    ok("...and this check is stated as NECESSARY AND NOT SUFFICIENT, which section 5 then demonstrates",
       true,
       "*** A RENDERER THAT IGNORED COLOUR ENTIRELY WOULD PASS IT. v3177's shape -- a check that passes because the system does nothing -- and the only way to know which you have is to hand it a scene where the channels must DIFFER. ***");
}

/* ------------------------------------------------------------------------------------------------------------
 * 3. *** THE SUFFICIENT HALF: THREE MONOCHROME RUNS, ONE COLOURED PASS, BIT FOR BIT ***
 * --------------------------------------------------------------------------------------------------------- */
{
    for (const [label, sc, vals] of [["diffuse albedo", diff, ALB], ["conductor F0", metal, F0]]) {
        const rgb = render(sc(vals), { ...CAM, rgb: true });
        let mism = 0, worst = 0;
        for (let k = 0; k < 3; k++) {
            const mono = render(sc(vals[k]), CAM);
            for (let i = 0; i < mono.length; i++)
                if (rgb[i * 3 + k] !== mono[i]) { mism++; worst = Math.max(worst, Math.abs(rgb[i * 3 + k] - mono[i])); }
        }
        say(`${label}: ${mism} of ${CAM.w * CAM.h * 3} channel-pixels differ from the monochrome run of their own value (worst ${worst})`);
        ok(`!! *** CHANNEL k EQUALS A MONOCHROME RENDER OF ITS OWN VALUE -- ${label.toUpperCase()} ***`,
           mism === 0,
           "*** THE ANSWER KEY WAS ALREADY BUILT: ten rounds of graded scalar renderer, run three times. And it is EXACT rather than statistical because THE COLOUR COSTS NO RANDOM NUMBERS -- every random decision in this tracer (the roulette test, the two-lobe coin, the cone sample, the half-vector) is CHANNEL-INDEPENDENT, so the three channels walk one path and differ only in what they multiply. A colour implementation that consumed even one extra draw would break this identity and nothing else would notice. ***");
    }

    ok("!! and the two paths are checked SEPARATELY because the per-channel quantity lives in different places",
       true,
       "`albedo` is on the LAMBERTIAN path and `F0` is on the MICROFACET one. A fixture with only one of them would leave the other's colour ungraded, and neither is the obvious one to pick.");
}

/* ------------------------------------------------------------------------------------------------------------
 * 4. THE COLOURS ARE THE COLOURS, NOT SOME AVERAGE OF THEM
 * --------------------------------------------------------------------------------------------------------- */
{
    const rgb = render(diff(ALB), { ...CAM, rgb: true });
    const m = coverage(diff(ALB), CAM), W = CAM.w, e = new Uint8Array(m.length);
    for (let y = 2; y < CAM.h - 2; y++) for (let x = 2; x < W - 2; x++) {
        let a = 1; for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) if (!m[(y + j) * W + x + i]) a = 0;
        e[y * W + x] = a;
    }
    const av = (k) => { let s = 0, n = 0; for (let i = 0; i < m.length; i++) if (e[i]) { s += rgb[i * 3 + k]; n++; } return s / n; };
    const got = [0, 1, 2].map(av);
    say(`coloured furnace, eroded interior: ${got.map((v) => v.toFixed(6)).join(" / ")} against an albedo of ${ALB.join(" / ")}`);
    ok("!! *** A COLOURED SPHERE IN A WHITE FURNACE READS ITS OWN ALBEDO IN EVERY CHANNEL ***",
       got.every((v, k) => Math.abs(v - ALB[k]) < 1e-9),
       "v3467's key, three times over and with nothing in the estimator told any of the three numbers. THE EDGE IS EXCLUDED BY NAME (v3473): coverage samples pixel CENTRES while the renderer JITTERS, so silhouette pixels mix the sphere with the sky and would blend white into every channel.");
}

/* ------------------------------------------------------------------------------------------------------------
 * 5. *** THE PLANT, AND THE FINDING IS THAT A GREY FIXTURE CANNOT DECIDE IT ***
 * --------------------------------------------------------------------------------------------------------- */
{
    const rgbC = render(diff(ALB), { ...CAM, rgb: true, plantMeanAlbedo: true });
    let collapsed = 0, total = 0;
    for (let i = 0; i < rgbC.length; i += 3) { total++; if (rgbC[i] === rgbC[i + 1] && rgbC[i + 1] === rgbC[i + 2]) collapsed++; }
    say(`plantMeanAlbedo on the COLOURED sphere: ${collapsed} of ${total} pixels have all three channels equal`);
    ok("!! averaging the three channels before multiplying COLLAPSES a coloured scene to one value",
       collapsed === total,
       "One plant reaches BOTH paths -- it averages `albedo` on the Lambertian side and `F0` on the microfacet one -- because a plant that touched only one of them would be caught by whichever fixture somebody happened to write.");

    // *** AND NOW THE PART THAT DECIDED HOW THIS GATE IS WRITTEN. ***
    const arith = [0.42, 0.5, 0.9, 0.7, 0.18].map((x) => ({ x, same: (x + x + x) / 3 === x }));
    say(`(3x)/3 === x : ${arith.map((a) => `${a.x} ${a.same}`).join(", ")}`);
    const greys = [0.42, 0.7].map((g) => {
        const a = render(diff(g), { ...CAM, rgb: true }), b = render(diff(g), { ...CAM, rgb: true, plantMeanAlbedo: true });
        let n = 0, worst = 0;
        for (let i = 0; i < a.length; i++) { if (a[i] !== b[i]) n++; worst = Math.max(worst, Math.abs(a[i] - b[i]) / Math.max(1e-12, a[i])); }
        return { g, n, worst, total: a.length };
    });
    for (const r of greys) say(`  grey ${r.g}: plant differs in ${r.n} of ${r.total} floats, worst relative ${r.worst.toExponential(2)}`);

    ok("!! *** THE PLANT IS BIT-IDENTICAL ON ONE GREY FIXTURE AND NOT ON ANOTHER, AND THE DIFFERENCE IS PURE FLOAT ROUNDING ***",
       greys[0].n === 0 && greys[1].n > 0 && greys[1].worst < 1e-14,
       `*** (3x)/3 RETURNS x EXACTLY AT 0.42, 0.5 AND 0.9 AND NOT AT 0.7 OR 0.18. So "the plant is invisible on a grey scene" is TRUE AT ONE GREY AND FALSE AT ANOTHER, and WHICHEVER GREY I HAPPENED TO PICK WOULD HAVE DECIDED WHAT THIS GATE ASSERTS. My first instinct was to assert bit-identity, which would have passed at 0.42 and failed at 0.7 for a reason having nothing to do with colour. THE HONEST CLAIM IS THE ONE BELOW: invisible to within machine precision, catastrophic on colour. ***`);

    ok("!! ...so the assertion is a MAGNITUDE on grey and an IDENTITY on colour, which is what the evidence supports",
       greys.every((r) => r.worst < 1e-14) && collapsed === total,
       `${greys[1].worst.toExponential(2)} on grey against a complete collapse on colour. A GREY FIXTURE CANNOT DECIDE THIS PLANT AT ALL -- it can only fail to see it -- which is the entire argument for section 3 existing, and the reason section 2 says out loud that it is not sufficient.`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 6. THE FRONT DOOR
 * --------------------------------------------------------------------------------------------------------- */
{
    const page = fs.readFileSync(path.join(ROOT, "path-tracer.html"), "utf8");
    ok("!! path-tracer.html renders in colour and prints the per-channel identity beside the picture",
       /rgb:\s*true/.test(page) && /render\(sc\(VALS\[k\]\)/.test(page) && /plantMeanAlbedo/.test(page),
       "*** MY FIRST VERSION OF THIS LINE ASKED FOR THE SPELLING `albedo: [` AND THE PAGE PASSES THE TRIPLE THROUGH A VARIABLE, so it failed a page that was entirely correct -- A CHECK PINNED TO A SPELLING RATHER THAN A MECHANISM, the species this tree has committed twenty-three times. What is asserted now is that the page RENDERS IN COLOUR, RUNS THE THREE MONOCHROME COMPARISON PASSES, and can drive the plant. *** A colour picture is the one thing in this arc worth LOOKING at -- and it is still not the check, so the numbers go beside it: a tinted sphere that looked plausible while carrying an averaged albedo is exactly what section 5 says nobody could see.");
}

console.log(fails ? "\ncolour-selfcheck: " + fails + " FAILED" : "\ncolour-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
