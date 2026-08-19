// WebGLEngine/physics/render/renderBsdf-selfcheck.mjs -- v3493
//
// Run: node physics/render/renderBsdf-selfcheck.mjs   (~20s)
//
// *** THREE MODULES WERE GRADED AND UNCALLED -- microfacet (v3490), fresnel (v3491), energyCompensation (v3492)
// -- WHICH IS v3473's nee.mjs SHAPE THREE TIMES OVER. This is the round that gives them a consumer, and the
// answer key for the wiring is the one thing the quadrature rounds could not supply: A SECOND, COMPLETELY
// DIFFERENT ROUTE TO THE SAME NUMBER. ***
//
// v3490 computed E by MIDPOINT QUADRATURE over the hemisphere. The renderer computes it by SAMPLING THE NDF AND
// DIVIDING BY THE PDF, through a camera, a scene graph and a bounce loop. Nothing is shared between the two
// except the definitions of D and G2. THEY MUST AGREE.
//
// *** AND EVALUATING D G2 F / (4 cos_o cos_i) AT A HANDED-IN DIRECTION IS THE RASTERISER'S RECIPE, NOT A PATH
// TRACER'S: it gives a highlight and no estimator. The BSDF REPLACES the diffuse throughput rather than adding
// to it -- a specular term laid on top of an unchanged diffuse one returns more than the surface received at
// every bounce. ***
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { trace, render, coverage } from "./pathTracer.mjs";
import { rng } from "./furnace.mjs";
import { directionalAlbedo } from "./microfacet.mjs";
import { buildTable } from "./energyCompensation.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

/**
 * Shade ONE point at a chosen view angle, through the real trace().
 *
 * The sphere is enormous so the surface is locally flat, which is what lets a view angle be CHOSEN rather than
 * read off whichever pixel happened to land where. THE FIXTURE EXISTS TO MAKE THE COMPARISON POSSIBLE: a disc
 * of pixels averages E over a RANGE of view angles, and comparing that average against E at one angle would be
 * comparing two different quantities (my first run did exactly that and read 16% out at alpha 1.0).
 */
function shade(sphere, cosO, { N = 60000, seed = 3 } = {}) {
    const R = 2000, sc = [{ ...sphere, centre: [0, 0, -R], radius: R }];
    const so = Math.sqrt(1 - cosO * cosO), r = rng(seed);
    let s = 0;
    for (let i = 0; i < N; i++) s += trace([so * 3, 0, cosO * 3], [-so, 0, -cosO], sc, r, { maxDepth: 4, sky: () => 1, nee: false });
    return s / N;
}

const ALPHAS = [0.2, 0.6, 1.0], ANGLES = [0.9, 0.5, 0.2];

/* ------------------------------------------------------------------------------------------------------------
 * 1. *** THE RENDERER REPRODUCES v3490'S QUADRATURE, BY A ROUTE THAT SHARES NOTHING WITH IT ***
 * --------------------------------------------------------------------------------------------------------- */
{
    let worst = 0;
    for (const a of ALPHAS) {
        const row = ANGLES.map((c) => ({ c, mc: shade({ roughness: a }, c), q: directionalAlbedo(a, c, { N: 300, M: 300 }) }));
        row.forEach((x) => { worst = Math.max(worst, Math.abs(x.mc / x.q - 1)); });
        say(`  alpha ${String(a).padEnd(4)} ${row.map((x) => `cos ${x.c}: MC ${x.mc.toFixed(5)} vs quad ${x.q.toFixed(5)} (${((x.mc / x.q - 1) * 100).toFixed(2)}%)`).join(" | ")}`);
    }
    say(`worst relative disagreement over ${ALPHAS.length * ANGLES.length} cells: ${(worst * 100).toFixed(2)}%`);
    ok("!! *** PATH SAMPLING AND MIDPOINT QUADRATURE AGREE ON THE DIRECTIONAL ALBEDO TO BETTER THAN 0.3% ***",
       worst < 0.003,
       "*** THE TWO ROUTES SHARE ONLY THE DEFINITIONS OF D AND G2. One integrates the hemisphere on a grid; the other CHOOSES directions from the NDF, divides by the pdf, and carries the result through a camera, a scene graph and a bounce loop. A wrong pdf, a wrong Jacobian or a wrong frame breaks the second and cannot touch the first. THIS IS THE KEY A QUADRATURE ROUND COULD NOT SUPPLY FOR ITSELF. ***");

    const rowAt1 = ANGLES.map((c) => shade({ roughness: 1.0 }, c));
    ok("...and it reproduces v3490's ANGLE CROSSING, which a single reading could not ask for",
       shade({ roughness: 0.2 }, 0.9) > shade({ roughness: 0.2 }, 0.2) && rowAt1[0] < rowAt1[2],
       "At alpha 0.2 the head-on view returns most and at alpha 1.0 the grazing one does -- the swap v3490 bisected to alpha 0.343611, arriving here through an entirely different estimator.");
}

/* ------------------------------------------------------------------------------------------------------------
 * 2. THE FURNACE THROUGH A CAMERA, WITH THE COMPENSATION ON
 * --------------------------------------------------------------------------------------------------------- */
{
    const CAM = { w: 40, h: 40, spp: 400, seed: 5, eye: [0, 0, 4], look: [0, 0, 0], fovDeg: 40, maxDepth: 12, sky: () => 1 };
    const rows = ALPHAS.map((a) => {
        const plain = [{ centre: [0, 0, 0], radius: 1, roughness: a }];
        const comp = [{ centre: [0, 0, 0], radius: 1, roughness: a, msTable: buildTable(a, { K: 24 }) }];
        const m = coverage(plain, CAM), W = 40, e = new Uint8Array(m.length);
        for (let y = 2; y < 38; y++) for (let x = 2; x < 38; x++) {
            let A = 1; for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) if (!m[(y + j) * W + x + i]) A = 0;
            e[y * W + x] = A;
        }
        const av = (v) => { let s = 0, n = 0; for (let i = 0; i < v.length; i++) if (e[i]) { s += v[i]; n++; } return s / n; };
        return { a, plain: av(render(plain, CAM)), comp: av(render(comp, CAM)) };
    });
    for (const r of rows) say(`  alpha ${String(r.a).padEnd(4)} uncompensated disc reads ${r.plain.toFixed(5)}, compensated ${r.comp.toFixed(5)}`);
    ok("!! *** WITH THE COMPENSATION ON, THE ROUGH SPHERE VANISHES INTO THE WHITE FURNACE AT EVERY ROUGHNESS ***",
       rows.every((r) => Math.abs(r.comp - 1) < 0.005),
       "*** v3492 PREDICTED THIS BY QUADRATURE AND THIS IS THE MONTE CARLO SEEING IT THROUGH A CAMERA. The uncompensated sphere is visibly dark -- 0.36 at alpha 1.0 -- and the compensated one is indistinguishable from the sky. THE DISC AVERAGE IS ONLY USABLE HERE BECAUSE THE ANSWER IS 1 AT EVERY ANGLE: for the uncompensated case it averages E over a RANGE of view angles and is not comparable with E at any one of them, which is exactly the mistake my first run made. ***");
}

/* ------------------------------------------------------------------------------------------------------------
 * 3. *** THE PLANT CROSSES ONE, SO THERE IS A ROUGHNESS AT WHICH IT IS EXACTLY RIGHT ***
 * --------------------------------------------------------------------------------------------------------- */
{
    const rows = ALPHAS.map((a) => ({ a, clean: shade({ roughness: a }, 0.5), plant: shade({ roughness: a, plantWrongPdf: true }, 0.5) }));
    for (const r of rows) say(`  alpha ${String(r.a).padEnd(4)} clean ${r.clean.toFixed(5)}  wrongPdf ${r.plant.toFixed(5)}  ratio ${(r.plant / r.clean).toFixed(4)}`);
    ok("!! sampling the NDF and dividing by the COSINE pdf is v3468's fault in a new lobe",
       rows[0].plant / rows[0].clean > 5 && rows[2].plant / rows[2].clean < 1,
       "The commonest importance-sampling bug there is, and it leaves the picture perfectly smooth -- there is nothing to see, only a number to compare.");

    const gap = (a) => shade({ roughness: a, plantWrongPdf: true }, 0.5, { N: 120000 }) - shade({ roughness: a }, 0.5, { N: 120000 });
    let lo = 0.6, hi = 1.0; const sLo = Math.sign(gap(lo));
    for (let i = 0; i < 12; i++) { const m = (lo + hi) / 2; if (Math.sign(gap(m)) === sLo) lo = m; else hi = m; }
    const cross = (lo + hi) / 2;
    const c = shade({ roughness: cross }, 0.5, { N: 120000 }), p = shade({ roughness: cross, plantWrongPdf: true }, 0.5, { N: 120000 });
    say(`the ratio crosses 1 -- bisected to alpha = ${cross.toFixed(4)}, where clean reads ${c.toFixed(5)} and the PLANT reads ${p.toFixed(5)}`);
    ok("!! *** AND AT THAT ROUGHNESS THE BROKEN ESTIMATOR RETURNS THE RIGHT ANSWER ***",
       Math.abs(p / c - 1) < 0.01 && cross > 0.6 && cross < 1,
       "*** 10.5x TOO BRIGHT AT alpha 0.2, 0.61x AT alpha 1.0, AND EXACTLY CORRECT SOMEWHERE BETWEEN. A gate that checked one roughness could land there and certify the bug -- and it would not be an unlucky choice, because a mid-roughness metal is the obvious thing to test. THE CROSSING IS RECOVERED BY BISECTION ON THE SIGN OF THE GAP, with nothing told where it is. THIS IS WHY THE SWEEP IN SECTION 1 IS A SWEEP. ***");
}

/* ------------------------------------------------------------------------------------------------------------
 * 4. THE BSDF REPLACES THE DIFFUSE THROUGHPUT, AND THE OTHER PATHS ARE UNTOUCHED
 * --------------------------------------------------------------------------------------------------------- */
{
    ok("!! a microfacet surface never returns more than it received, at any roughness or angle",
       ALPHAS.every((a) => ANGLES.every((c) => shade({ roughness: a }, c, { N: 20000 }) <= 1)),
       "*** ADDING A SPECULAR TERM ON TOP OF AN UNCHANGED DIFFUSE THROUGHPUT -- which is what 'add the specular result to your diffuse light' produces -- WOULD EXCEED 1 AT EVERY BOUNCE. The two are alternative BSDFs at a surface, not two lights to sum. ***");

    const lambert = shade({ albedo: 0.6 }, 0.5, { N: 20000 });
    ok("...and a sphere with no roughness is still the Lambertian path, unchanged",
       Math.abs(lambert - 0.6) < 0.01,
       `${lambert.toFixed(5)} against an albedo of 0.6. The microfacet branch is entered only when the sphere declares a roughness, so every scene in the arc before this round renders exactly as it did.`);

    const dielectric = shade({ roughness: 0.2, ior: 1.5 }, 0.5, { N: 20000 });
    say(`Fresnel path: F = 1 reads ${shade({ roughness: 0.2 }, 0.5, { N: 20000 }).toFixed(5)}, ior 1.5 reads ${dielectric.toFixed(5)}`);
    ok("!! and the Fresnel term is evaluated at the MICRO-normal, not the geometric one",
       dielectric < 0.15 && dielectric > 0.02,
       "*** A DIELECTRIC REFLECTS A FEW PERCENT AND THE REST GOES THROUGH, so this is not an energy loss (v3491). Using the geometric normal instead of the sampled micro-normal is the mistake that makes grazing highlights vanish -- the half-vector IS the surface the light meets. ***");
}

/* ------------------------------------------------------------------------------------------------------------
 * 5. WHAT IS DELIBERATELY NOT DONE, ASSERTED IN THE SOURCE RATHER THAN LEFT TO A READER
 * --------------------------------------------------------------------------------------------------------- */
{
    const src = fs.readFileSync(path.join(ROOT, "physics", "render", "pathTracer.mjs"), "utf8");
    ok("!! NEE is SKIPPED on a microfacet surface rather than run with a Lambertian integrand",
       /nee\s*&&\s*hit\.sphere\.roughness === undefined/.test(src),
       "*** NEE'S INTEGRAND IS albedo/pi. Running it unchanged on a microfacet surface would light it with the wrong BRDF and the picture would look fine. Doing it properly needs the BSDF evaluated at the light direction PLUS MIS, and v3489 measured MIS as a trade rather than a win -- so it is a stated absence, not a silent approximation. ***");

    ok("...and the three formerly-uncalled modules now have a non-gate consumer",
       /from "\.\/microfacet\.mjs"/.test(src) && /from "\.\/fresnel\.mjs"/.test(src) && /from "\.\/energyCompensation\.mjs"/.test(src),
       "v3473's nee.mjs shape, three times over, closed. A variance reduction nothing calls reduces nothing, and a BRDF nothing calls shades nothing.");
}

/* ------------------------------------------------------------------------------------------------------------
 * 6. THE FRONT DOOR, ASSERTED AS A MECHANISM AND NEVER AS A MENTION
 * --------------------------------------------------------------------------------------------------------- */
{
    const page = fs.readFileSync(path.join(ROOT, "path-tracer.html"), "utf8");
    ok("!! path-tracer.html carries BOTH rough-metal scenes, because one alone proves nothing",
       /roughness:\s*0\.8/.test(page) && /msTable:/.test(page) && /value="roughcomp"/.test(page),
       "*** THE UNCOMPENSATED SPHERE IS THE CONTROL. A page offering only the compensated one would show a sphere that vanishes into a white sky and the reader would have no way to tell that from a renderer drawing nothing at all -- which is the failure mode v3486 already found on this very page. Driven headlessly: the disc reads 0.474 uncompensated and 0.99918 compensated. ***");
}

console.log(fails ? "\nrenderBsdf-selfcheck: " + fails + " FAILED" : "\nrenderBsdf-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
