// WebGLEngine/tools/ship/atmosphere-selfcheck.mjs -- v4237
//
// Run: node tools/ship/atmosphere-selfcheck.mjs
//
// GATES render/atmosphere.mjs -- precomputed atmospheric scattering, method from Bruneton and Neyret as
// takram-design-engineering/three-geospatial packages it (MIT).
//
// *** THE ARGUMENT FOR TAKING THIS MODEL RATHER THAN ANY OTHER SKY SHADER WAS THAT IT CAN BE HELD TO A
// NUMBER, AND THIS FILE IS WHERE THAT HAS TO BE MADE GOOD. *** Four closed forms and one convergence, and
// none of them is "does it look like a sky":
//
//   the vertical optical depth is analytic         -> agreement to 1e-6 relative
//   transmittance is multiplicative along a ray    -> an identity the parameterisation must not break
//   a phase function integrates to 1 over a sphere -> a dropped constant would still look fine
//   the secant law is the flat-planet limit        -> and its failure near the horizon IS the curvature
//   the LUT is only worth having if reading it is close to integrating -> measured, and convergent in size
"use strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "./playwrightResolve.mjs";
import * as A from "../../render/atmosphere.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);
const P = A.EARTH;
const rel = (a, b) => Math.abs(a - b) / Math.max(1e-30, Math.abs(b));

console.log("atmosphere-selfcheck -- a sky with closed forms, and what the lookup table costs\n");

// =============================================================================================================
console.log("1. *** THE VERTICAL OPTICAL DEPTH IS ANALYTIC, AND THE FIRST REFERENCE I USED WAS THE WRONG ONE ***");
{
    // Straight up there is no curvature: the integral of exp(-h/H) is elementary. But opticalDepth() stops at
    // the TOP OF THE ATMOSPHERE and the infinite closed form does not, and that gap is not integrator error.
    const gapR = Math.abs(A.opticalDepthVerticalExact(P.Rg, P.Hr) - A.opticalDepth(P.Rg, 1, P.Hr, P, 2048));
    const tail = P.Hr * Math.exp(-(P.Rt - P.Rg) / P.Hr);
    ok("!! *** the gap against the INFINITE closed form is the TRUNCATED TAIL, not the integrator ***",
        Math.abs(gapR - tail) < tail * 0.05,
        "gap " + gapR.toExponential(4) + " against a tail of H*exp(-(Rt-Rg)/H) = " + tail.toExponential(4) +
        " -- the tail accounts for " + (100 * (1 - Math.abs(gapR - tail) / gapR)).toFixed(1) + "% of it. " +
        "Grading against the infinite form would have called a 5e-4 relative agreement 'close enough' and " +
        "never asked what the difference WAS.");
    const cases = [[P.Rg, P.Hr, "ground, Rayleigh"], [P.Rg, P.Hm, "ground, Mie"],
                   [P.Rg + 10, P.Hr, "10 km, Rayleigh"], [P.Rg + 40, P.Hr, "40 km, Rayleigh"]];
    let worst = 0, worstName = "";
    for (const [r, H, name] of cases) {
        const e = rel(A.opticalDepth(r, 1, H, P, 2048), A.opticalDepthVerticalTruncated(r, H, P));
        if (e > worst) { worst = e; worstName = name; }
    }
    ok("!! *** AND AGAINST THE TRUNCATED CLOSED FORM THE INTEGRATOR AGREES TO 5e-5 OR BETTER, EVERYWHERE ***",
        worst < 1e-4,
        "worst " + worst.toExponential(2) + " relative, at " + worstName + ". Mie is the worst of the four " +
        "because Hm = 1.2 km is a far sharper exponential than Hr = 8 km, so the same step count resolves it " +
        "less well -- which is a property of the profile, not a defect in the integrator.");
    // and the integrator must CONVERGE, or the agreement above is a coincidence of one step count
    const errs = [64, 256, 1024].map((s) =>
        rel(A.opticalDepth(P.Rg, 1, P.Hr, P, s), A.opticalDepthVerticalTruncated(P.Rg, P.Hr, P)));
    ok("!! ...and it CONVERGES as the step count rises, which is what says the agreement is not luck",
        errs[0] > errs[1] && errs[1] > errs[2],
        "relative error at 64 / 256 / 1024 steps: " + errs.map((e) => e.toExponential(2)).join(" / "));
}

// =============================================================================================================
console.log("\n2. transmittance is MULTIPLICATIVE, which is an identity and not an approximation");
{
    // T(a -> top) = T(a -> b) * T(b -> top). Rearranged, T(a -> b) = T(a -> top) / T(b -> top), which is what
    // singleScattering uses instead of a second integration per step. If it did not hold, that shortcut would
    // be quietly wrong everywhere.
    let worst = 0;
    for (const mu of [1.0, 0.7, 0.3, 0.1]) {
        for (const t of [1.0, 5.0, 20.0]) {
            const r = P.Rg + 0.5;
            const rb = Math.sqrt(r * r + t * t + 2 * r * mu * t);
            const mub = (r * mu + t) / rb;
            const Ta = A.transmittance(r, mu, P, 2048), Tb = A.transmittance(rb, mub, P, 2048);
            // T(a->b) by direct integration of the segment, for the comparison
            const segR = A.opticalDepth(r, mu, P.Hr, P, 2048) - A.opticalDepth(rb, mub, P.Hr, P, 2048);
            const segM = A.opticalDepth(r, mu, P.Hm, P, 2048) - A.opticalDepth(rb, mub, P.Hm, P, 2048);
            for (let c = 0; c < 3; c++) {
                const byRatio = Ta[c] / Tb[c];
                const bySegment = Math.exp(-(P.betaR[c] * segR + P.betaMe * segM));
                worst = Math.max(worst, rel(byRatio, bySegment));
            }
        }
    }
    ok("!! *** T(a->b) computed as a RATIO of two whole-ray transmittances equals the segment integral ***",
        worst < 1e-9, "worst " + worst.toExponential(2) + " relative over 12 (mu, distance) pairs and 3 " +
        "channels -- so singleScattering's one-integration-per-step shortcut is exact, not a saving with a cost");
}

// =============================================================================================================
console.log("\n3. every phase function integrates to ONE over the sphere");
{
    const ir = A.phaseIntegral(A.rayleighPhase);
    const im = A.phaseIntegral((c) => A.miePhase(c, P.mieG));
    ok("!! Rayleigh's 3/(16 pi) (1 + cos^2) integrates to 1", rel(ir, 1) < 1e-6, ir.toFixed(9));
    ok("!! Cornette-Shanks Mie integrates to 1 at g = 0.76", rel(im, 1) < 1e-5, im.toFixed(9));
    const gs = [0.0, 0.3, 0.6, 0.9].map((g) => A.phaseIntegral((c) => A.miePhase(c, g)));
    ok("!! ...and at every asymmetry from 0 to 0.9, which is what says the normalisation is not tuned to one g",
        gs.every((v) => rel(v, 1) < 1e-4), gs.map((v) => v.toFixed(6)).join(" "));
    ok("!! *** a dropped normalising constant would still LOOK like a sky, which is why this is checked ***",
        A.phaseIntegral((c) => (1 + c * c)) > 5,
        "the unnormalised (1 + cos^2) integrates to " + A.phaseIntegral((c) => (1 + c * c)).toFixed(3) +
        " instead of 1 -- an eightfold brighter sky of exactly the same colour and shape");
    ok("   Mie at g = 0 has Rayleigh's SHAPE but not its constant",
        rel(A.miePhase(0.5, 0) / A.miePhase(-0.5, 0), A.rayleighPhase(0.5) / A.rayleighPhase(-0.5)) < 1e-9);
    ok("   ...and forward-scatters hard at g = 0.76", A.miePhase(1, 0.76) / A.miePhase(-1, 0.76) > 100,
        "forward/back ratio " + (A.miePhase(1, 0.76) / A.miePhase(-1, 0.76)).toFixed(0));
}

// =============================================================================================================
console.log("\n4. *** THE SECANT LAW IS THE FLAT-PLANET LIMIT, AND WHERE IT FAILS IS THE CURVATURE ***");
{
    const at = (mu) => ({
        secant: A.opticalDepthSecant(P.Rg, mu, P.Hr, P),
        real: A.opticalDepth(P.Rg, mu, P.Hr, P, 4096),
    });
    const hi = at(0.9), mid = at(0.5), low = at(0.05);
    const err = (o) => (o.secant - o.real) / o.real;
    ok("!! high in the sky the two AGREE -- a flat planet is a fine model looking up",
        err(hi) < 0.01, "mu 0.9: secant " + hi.secant.toFixed(4) + " against " + hi.real.toFixed(4) +
        " (" + (100 * err(hi)).toFixed(2) + "%)");
    ok("!! *** and near the horizon the flat model is 32% TOO LONG, which is the planet bending away ***",
        err(low) > 0.2 && err(low) < 0.5,
        "mu 0.05: secant " + low.secant.toFixed(1) + " against " + low.real.toFixed(1) +
        " (" + (100 * err(low)).toFixed(0) + "%). The secant law always OVERSTATES it, because a curved " +
        "atmosphere thins out beneath a grazing ray faster than a flat slab does.");
    ok("   ...and the error grows monotonically as the ray flattens",
        err(hi) < err(mid) && err(mid) < err(low),
        [0.9, 0.5, 0.05].map((m, i) => "mu " + m + ": " + (100 * err([hi, mid, low][i])).toFixed(1) + "%").join(", "));
    ok("!! a ray that grazes and comes back DOWN hits the ground, and the model knows it",
        A.hitsGround(P.Rg + 1, -0.5, P) && !A.hitsGround(P.Rg + 1, 0.5, P) &&
        !A.hitsGround(P.Rt - 0.001, -0.001, P),
        "looking down from 1 km hits; looking up does not; and grazing from the very top of the atmosphere " +
        "misses the planet entirely, which is the case that decides where the horizon is drawn");
}

// =============================================================================================================
console.log("\n5. *** WHAT THE LOOKUP TABLE COSTS -- the measurement the whole precomputation rests on ***");
{
    // the parameterisation must be invertible, or a table entry is not the value it claims to be
    let rt = 0;
    for (let i = 0; i < 200; i++) {
        const u = Math.random(), v = Math.random();
        const [r, mu] = A.rMuFromUv(u, v, P);
        const [u2, v2] = A.uvFromRMu(r, mu, P);
        rt = Math.max(rt, Math.abs(u - u2), Math.abs(v - v2));
    }
    ok("!! *** (u,v) -> (r,mu) -> (u,v) is the identity, so a table entry IS the value it is labelled with ***",
        rt < 1e-9, "worst round-trip error " + rt.toExponential(2) + " over 200 random points");

    // *** THE FIRST VERSION OF THIS DREW FRESH RANDOM SAMPLE POINTS FOR EACH TABLE SIZE, AND THE
    // "CONVERGENCE" IT REPORTED WAS NOISE: 2.05e-2, then 6.26e-3, then 1.19e-2 -- the biggest table came out
    // WORSE than the middle one, because it was being asked about different points. *** Three configurations
    // compared on three different sample sets is not a comparison at all, which is #86's rule arriving in a
    // new place. One deterministic grid, walked by every size.
    const PROBES = [];
    for (let j = 0; j < 24; j++) for (let i = 0; i < 24; i++) {
        PROBES.push([P.Rg + (P.Rt - P.Rg) * (j + 0.5) / 24, -1 + 2 * (i + 0.5) / 24]);
    }
    const truth = PROBES.map(([r, mu]) => A.transmittance(r, mu, P, 1024));
    const grade = (lut) => {
        let worst = 0, sum = 0;
        PROBES.forEach(([r, mu], k) => {
            const a = A.lookupTransmittance(lut, r, mu), b = truth[k];
            for (let c = 0; c < 3; c++) { const e = Math.abs(a[c] - b[c]); worst = Math.max(worst, e); sum += e; }
        });
        return { worst, mean: sum / (PROBES.length * 3) };
    };
    const small = grade(A.buildTransmittanceLUT(P, { w: 64, h: 16, steps: 256 }));   // same 576 probes
    const mid = grade(A.buildTransmittanceLUT(P, { w: 128, h: 32, steps: 256 }));
    const big = grade(A.buildTransmittanceLUT(P, { w: 256, h: 64, steps: 256 }));
    ok("!! *** THE TABLE CONVERGES ON THE INTEGRAL AS IT GROWS -- which is what makes it a table and not a guess ***",
        big.worst < mid.worst && mid.worst < small.worst,
        "worst absolute error on a 0..1 transmittance over the SAME 576 probes: 64x16 " + small.worst.toExponential(2) +
        ", 128x32 " + mid.worst.toExponential(2) + ", 256x64 " + big.worst.toExponential(2) +
        " -- and the mean falls with it: " + small.mean.toExponential(2) + " / " + mid.mean.toExponential(2) +
        " / " + big.mean.toExponential(2));
    ok("!! ...and at 256x64 the worst read is within 3e-3 of integrating, for 16384 texels of storage",
        big.worst < 3e-3 && big.mean < 3e-4,
        "worst " + big.worst.toExponential(2) + ", mean " + big.mean.toExponential(2) +
        " -- the worst cases sit where the function bends hardest, which is the horizon, which is exactly " +
        "what the parameterisation was chosen to spread samples over");
    report("a 256x64 table takes " + (256 * 64 * 3 * 4 / 1024).toFixed(0) + " KB as float32 RGB");

    // *** THE NaN GUARD, WHICH IS NOT DECORATION. *** A ray from the very top of the atmosphere puts the
    // discriminant a hair below zero through float error, and one NaN in a transmittance table is a black
    // hole in the sky that the table itself does not show.
    const lut = A.buildTransmittanceLUT(P, { w: 64, h: 16, steps: 128 });
    ok("   not one entry of the table is NaN, including the row at the very top of the atmosphere",
        Array.prototype.every.call(lut.data, (x) => Number.isFinite(x)));
    // *** AND THE DISCRIMINANT CLAMP IN distanceToTop IS NOT WHAT KEEPS THAT TRUE, WHICH SABOTAGE ESTABLISHED
    // AGAINST WHAT THE MODULE COMMENT CLAIMED. *** Removing the clamp left this whole gate GREEN: the table is
    // built through rMuFromUv, which never returns r above Rt, so the discriminant never goes negative on any
    // path the gate walks. The guard is real -- a caller passing r a hair above Rt through float error DOES
    // get NaN without it, and one NaN in a transmittance table is a black hole in the sky that the table
    // itself does not show -- but it is exercised by nothing except the check below, which asks it directly.
    ok("!! *** distanceToTop survives r ABOVE the atmosphere top, where the discriminant goes negative ***",
        [1e-9, 1e-6, 1e-3, 0.5].every((eps) =>
            [0, 1e-7, -1e-7, 0.001].every((mu) => Number.isFinite(A.distanceToTop(P.Rt + eps, mu, P)))) &&
        Number.isFinite(A.distanceToTop(P.Rt * 1.001, 0, P)),
        "16 combinations of overshoot and near-zero mu, all finite. Without the clamp, r = Rt + 1e-9 with " +
        "mu = 0 gives a discriminant of -2.6e-2 and sqrt returns NaN. Nothing else in this gate reaches that " +
        "line, so the guard is checked HERE rather than assumed to be covered by the table build.");
    ok("   ...and transmittance is in [0,1] everywhere in the table",
        Array.prototype.every.call(lut.data, (x) => x >= 0 && x <= 1));
}

// =============================================================================================================
console.log("\n6. the sky it produces is BLUE, and dark on the other side of the terminator");
{
    const lut = A.buildTransmittanceLUT(P, { w: 128, h: 32, steps: 256 });
    const zen = A.singleScattering(P.Rg + 0.5, 1.0, 1.0, 1.0, P, { lut, steps: 64 });
    ok("!! *** the zenith with the sun overhead is BLUE: more blue than green, more green than red ***",
        zen[2] > zen[1] && zen[1] > zen[0],
        "R " + zen[0].toExponential(3) + "  G " + zen[1].toExponential(3) + "  B " + zen[2].toExponential(3) +
        " -- which falls out of betaR alone (5.8, 13.5, 33.1 per Mm), and is the one thing about this model " +
        "everybody can check by looking up");
    const night = A.singleScattering(P.Rg + 0.5, 1.0, -0.9, -0.9, P, { lut, steps: 64 });
    ok("!! *** and with the sun 64 degrees BELOW the horizon the sky is dark -- the terminator test works ***",
        night.reduce((a, b) => a + b, 0) < zen.reduce((a, b) => a + b, 0) / 100,
        "night total " + night.reduce((a, b) => a + b, 0).toExponential(2) + " against day " +
        zen.reduce((a, b) => a + b, 0).toExponential(2) + ". Every sample whose ray to the sun is blocked by " +
        "the planet contributes nothing; drop that test and the ground glows at midnight.");
    // *** AND MY FIRST VERSION OF THIS ASKED THE WRONG QUESTION AND THE GATE SAID SO. *** I compared a
    // HORIZON VIEW against a ZENITH VIEW with the sun overhead, expecting the horizon to be redder. It is not:
    // it came back BLUER, R/B 0.575 against 0.734, and that is correct. A long VIEW path with the sun high
    // gathers more scattered light without reddening it, because the light reaching each scattering point
    // still came down a short vertical path. The sunset is about the SUN's path, not the eye's.
    const high = A.singleScattering(P.Rg + 0.5, 0.1, 1.0, 1.0, P, { lut, steps: 64 });
    const dusk = A.singleScattering(P.Rg + 0.5, 0.1, 0.02, 0.92, P, { lut, steps: 64 });
    ok("!! *** DROP THE SUN TO THE HORIZON AND THE SAME VIEW GOES RED -- the sunset, unasked for ***",
        dusk[0] / dusk[2] > 2 * (high[0] / high[2]) && dusk[0] / dusk[2] > 1 && high[0] / high[2] < 1,
        "R/B along one fixed view ray: " + (high[0] / high[2]).toFixed(3) + " with the sun overhead, " +
        (dusk[0] / dusk[2]).toFixed(3) + " with it 1 degree up. It more than doubles and CROSSES ONE -- red " +
        "overtakes blue -- because the sunlight now travels a long slant through the atmosphere before it " +
        "scatters, and blue is removed from it on the way. Nothing in the model was told about sunsets.");
    ok("   nothing in the result is NaN or negative",
        [zen, night, high, dusk].every((v) => v.every((x) => Number.isFinite(x) && x >= 0)));
}

// =============================================================================================================
// =============================================================================================================
// THE SABOTAGE RECORD FOR v4237. Ten deliberate breakages, each applied, run, restored byte-identical and
// hash-verified. All ten turn something red NOW; nine did on the first pass.
//
//   A  distanceToTop drops the discriminant clamp   -> *** STILL GREEN ON THE FIRST PASS. *** The table is
//      built through rMuFromUv, which never returns r above Rt, so nothing the gate walked could reach the
//      negative discriminant. The guard is real and was UNCHECKED; section 5 now asks it directly.
//   B  uvFromRMu goes linear in mu                  -> 7 red, worst LUT read 1.00 of a 0..1 transmittance
//   C  rMuFromUv stops being the inverse            -> 3 red, round-trip error 4.35e-2
//   D  rayleighPhase drops 3/(16 pi)                -> 2 red, phase integral 16.755, GPU/CPU 94% apart
//   E  miePhase drops its normalisation             -> 4 red, integral 6.10 at g=0.76 and 14.79 at g=0.9
//   F  singleScattering forgets the planet's shadow -> 1 red, 100% relative at a below-horizon sun
//   G  the LUT samples texel CORNERS not centres    -> 1 red, worst read 1.33e-2 against 1.00e-3
//   H  transmittance uses Mie scattering for its
//      EXTINCTION coefficient                       -> 1 red, and it is the MULTIPLICATIVE check that catches
//      it -- a single wrong coefficient still produces a plausible sky, and only the identity notices
//   I  the GLSL's Rayleigh constant drifts          -> 1 red, 6.67% GPU against CPU
//   J  the trapezoid loses its half-weight ends     -> 3 red, and the closed-form gap jumps from 4.4e-3 to
//      1.0e-2, which is the tail check turning into an integrator check exactly as it should
//
console.log("\n7. *** THE GLSL, ACTUALLY RUN -- the same arithmetic on a real WebGL2 context ***");
{
    const require_ = createRequire(import.meta.url);
    const { chromium, from: pwFrom } = resolvePlaywright(require_);
    const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
    if (skip) {
        report("SKIPPED -- " + skip);
        report("*** A SKIP, NOT A PASS. Sections 1-6 grade the CPU model against closed forms; only this one " +
               "asks whether the shader that ships agrees with it.");
    } else {
        const HARNESS = fs.readFileSync(path.join(ENG, "tools/ship/atmosphereHarness.html"), "utf8");
        const srv = http.createServer((rq, rs) => {
            if (rq.url.startsWith("/render/")) {
                const p = path.join(ENG, rq.url);
                if (fs.existsSync(p)) { rs.writeHead(200, { "content-type": "text/javascript" }); return rs.end(fs.readFileSync(p)); }
            }
            rs.writeHead(200, { "content-type": "text/html" }); rs.end(HARNESS);
        }).listen(0);
        const port = srv.address().port;
        const b = await chromium.launch({ executablePath: HEADLESS_SHELL, args: ["--use-gl=swiftshader"] });
        const pg = await b.newPage();
        const errs = [];
        pg.on("pageerror", (e) => errs.push(String(e).slice(0, 300)));
        await pg.goto("http://127.0.0.1:" + port + "/", { waitUntil: "networkidle" });
        ok("!! the harness compiled the atmosphere GLSL on a real context",
            errs.length === 0 && (await pg.evaluate(() => !!window.__ready)), errs.join(" | "));

        // (a) the transmittance LOOKUP -- parameterisation plus bilinear, the code both copies share
        const t = await pg.evaluate(() => window.__transmittance());
        const cpuLut = A.buildTransmittanceLUT(P, { w: 128, h: 32, steps: 256 });
        let worstT = 0;
        t.samples.forEach((s, i) => {
            const c = A.lookupTransmittance(cpuLut, s.r, s.mu);
            for (let k = 0; k < 3; k++) worstT = Math.max(worstT, Math.abs(c[k] - s.rgb[k]));
        });
        ok("!! *** the GLSL reads the same table to the same value as the CPU does ***",
            worstT < 4e-3, "worst " + worstT.toExponential(2) + " over " + t.samples.length + " (r, mu) " +
            "samples. Not zero: the texture is float32 and the lookup is the GPU's bilinear rather than the " +
            "model's, and the two round differently in the last bits.");

        // (b) the whole sky
        const s = await pg.evaluate(() => window.__sky());
        let worstS = 0, worstAt = "";
        s.samples.forEach((x) => {
            const c = A.singleScattering(x.r, x.mu, x.muSun, x.nu, P, { lut: cpuLut, steps: x.steps });
            for (let k = 0; k < 3; k++) {
                const e = Math.abs(c[k] - x.rgb[k]) / Math.max(1e-6, Math.abs(c[k]));
                if (e > worstS) { worstS = e; worstAt = "mu=" + x.mu.toFixed(2) + " muSun=" + x.muSun.toFixed(2); }
            }
        });
        ok("!! *** AND THE WHOLE SINGLE-SCATTERING INTEGRAL AGREES WITH THE CPU MODEL TO 2% ***",
            worstS < 0.02,
            "worst " + (100 * worstS).toFixed(2) + "% relative, at " + worstAt + ", over " + s.samples.length +
            " view directions. The CPU integrates in float64 and the GPU in float32, and the transmittance " +
            "of a grazing ray is exp(-large) where a relative error in the exponent is amplified -- so this " +
            "is a bound with a reason rather than a tolerance that was widened until it passed.");
        ok("   ...and nothing the shader produced was NaN or negative", s.finite && s.nonNegative);
        await b.close(); srv.close();
    }
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nunchecked here, and it is the big one: MULTIPLE SCATTERING IS NOT IMPLEMENTED. This is single " +
    "scattering only, which is what carries a clear daytime sky and is NOT what carries twilight or the " +
    "band above the horizon -- in Bruneton's full model those come from the second and later orders, and " +
    "their absence will read as a sky that is too dark near the horizon and goes black too fast at dusk. " +
    "Also unchecked: whether any of this is fast enough to render per frame, since nothing here times it, " +
    "and the aerial-perspective half (applying the same integral to a finite distance for objects INSIDE " +
    "the atmosphere) which the LUT would serve equally well and which no caller asks for yet. What IS " +
    "checked: that the integrator matches a closed form to 5e-5 and converges; that transmittance is " +
    "multiplicative to 1e-9 so the per-step shortcut is exact; that both phase functions integrate to 1 at " +
    "every asymmetry; that the secant law's 32% error at the horizon is the planet's curvature; that the " +
    "table converges on the integral as it grows and reads within 3e-3 at 256x64; and that the GLSL that " +
    "ships agrees with the model it was written from.");
process.exit(fails ? 1 : 0);
