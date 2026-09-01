// WebGLEngine/tools/ship/atmosphereMulti-selfcheck.mjs -- v4240
//
// Run: node tools/ship/atmosphereMulti-selfcheck.mjs      (pure, no GL)
//
// GATES the multiple-scattering half of render/atmosphere.mjs -- the orders v4237 shipped without.
//
// *** v4237's CLOSING NOTE MADE A PREDICTION AND THIS FILE HOLDS IT TO IT. *** It said single scattering
// alone would read as a sky that goes black too fast at dusk. The baseline was measured before any of this
// was written; the same numbers are recomputed here, and the improvement is a ratio between two measurements
// rather than an impression.
//
// The new gradeable property is that multiple scattering is a GEOMETRIC SERIES, so it converges exactly when
// its ratio is below one -- and that ratio is a physical quantity, not a tuning constant.
"use strict";
import * as A from "../../render/atmosphere.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);
const P = A.EARTH;
const sum3 = (v) => v[0] + v[1] + v[2];

console.log("atmosphereMulti-selfcheck -- the series that keeps twilight alive, and the ratio that bounds it\n");

const LUT = A.buildTransmittanceLUT(P, { w: 128, h: 32, steps: 256 });
const MOPT = { lut: LUT, dirs: 24, steps: 20 };

// =============================================================================================================
console.log("1. *** THE RATIO IS BELOW ONE EVERYWHERE, WHICH IS WHAT MAKES THE SERIES A SERIES ***");
{
    const t0 = Date.now();
    const mlut = A.buildMultiScatterLUT(P, { w: 24, h: 16, ...MOPT });
    const ms = Date.now() - t0;
    ok("!! *** every F in the table is a fraction: 0 <= F < 1, so 1/(1-F) is finite everywhere ***",
        mlut.worstF > 0 && mlut.worstF < 1,
        "worst F over the whole 24x16 table: " + mlut.worstF.toFixed(4) + ". A single-scattering albedo below " +
        "one means every bounce loses energy; if F ever reached 1 the atmosphere would be a laser, and the " +
        "closed form would return Infinity rather than a colour.");
    ok("   ...and no entry of the table is NaN or negative",
        Array.prototype.every.call(mlut.data, (x) => Number.isFinite(x) && x >= 0));
    report("24x16 multiple-scattering table built in " + ms + " ms, " +
           (24 * 16 * 3 * 4 / 1024).toFixed(0) + " KB as float32 RGB");

    // F is a property of how much atmosphere is around you, so it must be largest at the bottom
    const low = A.multiScatterAt(P.Rg, 0.5, P, MOPT).F;
    const high = A.multiScatterAt(P.Rt - 0.1, 0.5, P, MOPT).F;
    ok("!! *** F is largest at the ground and smallest at the top -- it measures how much air is around you ***",
        low[2] > high[2] * 1.3 && low[0] > high[0],
        "blue F: " + low[2].toFixed(4) + " at the surface against " + high[2].toFixed(4) + " just under the " +
        "top of the atmosphere. Not asserted as strictly monotone in between: the sphere sampling is 24 " +
        "directions and the middle of the range wobbles by a percent, which is the sampling and not the physics.");
    ok("!! ...and F is largest in BLUE, which is why the multiple-scattered light is bluer than the single",
        low[2] > low[1] && low[1] > low[0],
        "F = " + low.map((x) => x.toFixed(4)).join(" / ") + " for R/G/B. Blue is scattered most, so blue is " +
        "amplified most by the series -- a consequence of betaR, not a choice.");
}

// =============================================================================================================
console.log("\n2. *** THE PARTIAL SUMS WALK TO THE CLOSED FORM, RATHER THAN BEING REPLACED BY IT ***");
{
    const m = A.multiScatterAt(P.Rg + 0.5, 0.5, P, MOPT);
    const { orders, running } = A.scatteringOrders(m.L2, m.F, 24);
    ok("!! each order is strictly smaller than the one before it, in every channel",
        orders.slice(1).every((o, i) => o.every((x, c) => x < orders[i][c])),
        "green: " + orders.slice(0, 6).map((o) => o[1].toExponential(2)).join(" -> ") +
        " -- falling by a factor of " + (orders[0][1] / orders[1][1]).toFixed(1) + " each time");
    const last = running[running.length - 1];
    ok("!! *** and the running sum converges ON the closed form L2/(1-F), to 1e-9 ***",
        last.every((x, c) => Math.abs(x - m.psi[c]) < 1e-9 * Math.max(1e-12, m.psi[c])),
        "after 24 orders the sum is " + last[1].toExponential(9) + " and the closed form is " +
        m.psi[1].toExponential(9) + ". The identity is arithmetic; what it establishes is that the code " +
        "implements the limit of the thing it claims to sum, and not some other number.");
    // and it must not have converged after ONE order, or the series is decorative
    ok("!! ...and the first order alone is NOT the answer, so the series is doing work",
        Math.abs(running[0][1] - m.psi[1]) > m.psi[1] * 0.1,
        "order 2 alone is " + running[0][1].toExponential(3) + " against a total of " + m.psi[1].toExponential(3) +
        " -- the tail is worth " + (100 * (1 - running[0][1] / m.psi[1])).toFixed(0) + "% of it");
    ok("   the direction set is deterministic, so the table is reproducible",
        JSON.stringify(A.sphereDirections(16)) === JSON.stringify(A.sphereDirections(16)) &&
        A.sphereDirections(64).length === 64);
    ok("   ...and those directions really do cover the sphere: their mean is near zero",
        (() => {
            const d = A.sphereDirections(256);
            const m2 = d.reduce((a, v) => [a[0] + v[0], a[1] + v[1], a[2] + v[2]], [0, 0, 0]).map((x) => x / 256);
            return Math.hypot(...m2) < 0.02;
        })(), "a set clustered on one side would make F a function of where the spiral happened to start");
}

// =============================================================================================================
console.log("\n3. *** THE GROUND LIGHTS THE SKY, AND THE FIRST VERSION OF THAT TERM WAS 700x TOO SMALL ***");
{
    // A downward ray that meets the planet has no path to the top of the atmosphere along its own direction.
    // distanceToTop() still returns a number for it -- where the LINE would exit, going backwards through the
    // planet -- and using T(r, mu) there is a transmittance along a path no light takes.
    const albedos = [0, 0.1, 0.3, 0.6, 0.9];
    const vals = albedos.map((a) => A.multiScatterAt(P.Rg + 0.5, 0.5, P, { ...MOPT, groundAlbedo: a }).psi[1]);
    ok("!! the sky is monotone in the ground albedo -- more bounce, more light",
        vals.every((v, i) => i === 0 || v > vals[i - 1]),
        albedos.map((a, i) => a + ": " + vals[i].toExponential(3)).join(", "));
    ok("!! *** and albedo 0 to 0.9 raises the sky by 400%, not by 0.07% ***",
        vals[4] / vals[0] > 3 && vals[4] / vals[0] < 8,
        "a factor of " + (vals[4] / vals[0]).toFixed(2) + ". Before the fix it was 1.0007 -- a ground albedo " +
        "that moved nothing, which is exactly what a term computed along a path through the planet looks " +
        "like. The segment is recovered from the multiplicative property along the REVERSED, upward ray.");
    ok("!! ...and with albedo 0 there is still a sky, so the ground is a contributor and not the source",
        vals[0] > 0, "albedo 0 gives " + vals[0].toExponential(3));
    // the physical floor: no scattering coefficients, no scattering
    const P0 = { ...P, betaR: [0, 0, 0], betaMs: 0 };
    const m0 = A.multiScatterAt(P.Rg + 0.5, 0.5, P0,
        { lut: A.buildTransmittanceLUT(P0, { w: 64, h: 16, steps: 128 }), dirs: 16, steps: 12, groundAlbedo: 0 });
    ok("!! *** an atmosphere that does not scatter has F = 0 and L2 = 0, exactly ***",
        m0.F.every((x) => x === 0) && m0.L2.every((x) => x === 0),
        "not 'near zero' -- zero, because every term carries a factor of sigma_s");

    // *** AND THE PLANET'S SHADOW INSIDE multiScatterAt WAS UNCHECKED, WHICH SABOTAGE ESTABLISHED. ***
    // Removing it left every other number here green: the twilight gain only grew, and a gain that grows is
    // what those checks look for. What it breaks is the TERMINATOR -- sunlight arriving at points the planet
    // is standing in front of. Asked directly, and the answer is an exact zero rather than a small number.
    const psiAt = (mu, h2) => A.multiScatterAt(P.Rg + h2, mu, P, MOPT).psi[1];
    // *** AND THE FIRST VERSION OF THIS SAID "EXACTLY ZERO AT EVERY ALTITUDE", WHICH IS FALSE AT THE TOP AND
    // FALSE FOR A GOOD REASON. *** At 59 km, muSun -0.3 leaves 1.94e-5 -- four orders of magnitude below
    // daylight, and real: from up there you can see GROUND that is still in sunlight, over the horizon. That
    // is the terminator seen from altitude, and a check that demanded zero would have been demanding the
    // model be wrong.
    ok("!! *** past the terminator psi is EXACTLY zero from the surface up to 40 km -- the planet is in the way ***",
        [-0.3, -0.6, -0.9].every((mu) => [0, 20, 40].every((h2) => psiAt(mu, h2) === 0)),
        "nine (sun cosine, altitude) pairs, all exactly 0. Without the shadow test the sun shines through the " +
        "planet and the night sky glows -- and no other check in this file would have noticed, because they " +
        "all measure ratios that a brighter night only increases.");
    ok("!! ...and at 59 km a trace SURVIVES, because sunlit ground is visible over the horizon from up there",
        psiAt(-0.3, 59) > 0 && psiAt(-0.3, 59) < psiAt(0.8, 0) * 1e-3,
        "1.94e-5 against " + psiAt(0.8, 0).toExponential(2) + " in daylight -- four orders down, and not zero, " +
        "which is what an observer high enough to see past the terminator should read");
    ok("!! ...and it falls off a cliff AT the terminator rather than being clamped to zero early",
        psiAt(0, 0) > 1e-3 && psiAt(-0.1, 0) > 0 && psiAt(0, 0) / psiAt(-0.1, 0) > 50,
        "muSun 0: " + psiAt(0, 0).toExponential(3) + ", muSun -0.1: " + psiAt(-0.1, 0).toExponential(3) +
        " (a factor of " + (psiAt(0, 0) / psiAt(-0.1, 0)).toFixed(0) + "), muSun -0.3: " + psiAt(-0.3, 0) +
        ". The band between is the atmosphere still lit above an observer already in shadow, which IS twilight.");
}

// =============================================================================================================
console.log("\n4. *** THE PREDICTION v4237 MADE, MEASURED: TWILIGHT NO LONGER COLLAPSES ***");
{
    const mlut = A.buildMultiScatterLUT(P, { w: 24, h: 16, ...MOPT });
    const at = (deg, mu, nu) => {
        const muSun = Math.cos((90 - deg) * Math.PI / 180);
        const s = A.singleScattering(P.Rg + 0.5, mu, muSun, nu(muSun), P, { lut: LUT, steps: 64 });
        const t = A.skyRadiance(P.Rg + 0.5, mu, muSun, nu(muSun), P, { lut: LUT, mlut, steps: 64 });
        return { single: sum3(s), total: sum3(t), gain: sum3(t) / Math.max(1e-30, sum3(s)), s, t };
    };
    const zen = (deg) => at(deg, 1.0, (m) => m);
    const day = zen(40), set = zen(0), dusk = zen(-4), night = zen(-6);
    // *** THESE BOUNDS WERE FIRST SET FROM THE BASELINE I MEASURED BEFORE FIXING THE GROUND TERM, AND THE
    // FIX MOVED THEM. *** With the ground contributing properly the daylight gain is 7.7x, not the 4.2x the
    // broken version gave. Rewritten to the numbers the shipped code produces rather than the ones a defect did.
    ok("!! *** the gain GROWS as the sun goes down: 7.7x in daylight, 63x six degrees under ***",
        day.gain > 5 && day.gain < 12 && night.gain > 30 && night.gain > day.gain * 4,
        "+40 deg " + day.gain.toFixed(2) + "x, 0 deg " + set.gain.toFixed(2) + "x, -4 deg " +
        dusk.gain.toFixed(2) + "x, -6 deg " + night.gain.toFixed(2) + "x. In daylight the single order " +
        "dominates and the tail is a correction; after sunset the single order is nearly gone and the tail " +
        "is the whole sky.");
    ok("!! *** and that is the collapse v4237 predicted, arrested: single scattering falls 160x from " +
       "sunset to -6, the total falls 20x ***",
        (set.single / night.single) > 100 && (set.total / night.total) < 40,
        "single: " + set.single.toExponential(3) + " -> " + night.single.toExponential(3) + " (" +
        (set.single / night.single).toFixed(0) + "x). total: " + set.total.toExponential(3) + " -> " +
        night.total.toExponential(3) + " (" + (set.total / night.total).toFixed(0) + "x). Real twilight does " +
        "not fall off a cliff, and this is the mechanism that stops it.");
    const hz = (deg) => at(deg, 0.02, (m) => 0.02 * m + 0.9);
    ok("!! the horizon gains too, and gains MORE as the sun sets",
        hz(-4).gain > hz(40).gain * 1.5,
        "+40 deg " + hz(40).gain.toFixed(2) + "x, -4 deg " + hz(-4).gain.toFixed(2) + "x -- a smaller spread " +
        "than the zenith's, because a horizon ray already gathers a long path of single scattering and has " +
        "less room to gain");
    ok("!! *** the added light is BLUER than the single-scattered light it is added to ***",
        (() => {
            const d = day.t.map((x, c) => x - day.s[c]);
            return d[0] / d[2] < day.s[0] / day.s[2];
        })(),
        (() => {
            const d = day.t.map((x, c) => x - day.s[c]);
            return "single R/B " + (day.s[0] / day.s[2]).toFixed(4) + ", added R/B " +
                (d[0] / d[2]).toFixed(4) + " -- because F is largest in blue, so blue is amplified most. " +
                "That falls out of betaR and was not asked for.";
        })());
    ok("   nothing in the total is NaN or negative",
        [day, set, dusk, night].every((x) => x.t.every((v) => Number.isFinite(v) && v >= 0)));
    ok("   skyRadiance without a multiple-scattering table IS singleScattering, exactly",
        (() => {
            const muSun = 0.4;
            const a = A.skyRadiance(P.Rg + 0.5, 0.6, muSun, 0.5, P, { lut: LUT, steps: 32 });
            const b = A.singleScattering(P.Rg + 0.5, 0.6, muSun, 0.5, P, { lut: LUT, steps: 32 });
            return a.every((x, c) => x === b[c]);
        })(), "so the v4237 behaviour is still reachable and still what the older gate grades");
}

// =============================================================================================================
// =============================================================================================================
// THE SABOTAGE RECORD FOR v4240. Nine breakages, applied, run, restored byte-identical and hash-verified.
//
//   A  extinction where scattering belongs         -> 1 red (the zero-scattering floor)
//   B  the series summed as 1/(1+F)                -> 2 red
//   C  the ground term dropped                     -> 4 red, albedo stops moving anything
//   D  the ground transmittance back to T(r, mu)   -> 3 red, the 700x bug reappears as a 1.00x albedo
//   E  sphereDirections covers a HEMISPHERE        -> 5 red, including the mean-direction check
//   F  the uniform phase 1/(4 pi) dropped          -> 12 red, and F climbs to 3.47: the series DIVERGES
//   G  skyRadiance adds psi without sigma_s        -> 2 red, a 2138x gain in daylight
//   H  the planet's shadow removed                 -> *** STILL GREEN ON THE FIRST PASS. *** Every other
//      check measures a RATIO that a brighter night only increases, so a glowing midnight passed all of
//      them. The terminator is now asked about directly, and the answer is an exact zero.
//   I  the sphere measure 4*pi/n dropped           -> 5 red
//
console.log("\n5. *** WHAT LIMITS THIS TABLE IS NOT ITS RESOLUTION, WHICH IS THE OPPOSITE OF v4237's ***");
{
    // #86 again, and it bit harder here than in v4237. The first version of this graded three table sizes
    // against a reference computed with the SAME 24 directions the tables used -- so the "truth" carried a
    // few percent of its own sampling noise, the tables sampled that noise, and the errors came out
    // NON-MONOTONE: 12.27%, 8.44%, 14.80%, 7.11% as the table grew. A reference that is not converged does
    // not measure a table; it measures the difference between two samplings of the same wobble.
    const REF = { lut: LUT, dirs: 512, steps: 64 };
    const PROBES = [];
    for (let j2 = 0; j2 < 6; j2++) for (let i2 = 0; i2 < 6; i2++) {
        PROBES.push([P.Rg + (P.Rt - P.Rg) * (j2 + 0.5) / 6, -1 + 2 * (i2 + 0.5) / 6]);
    }
    const truth = PROBES.map(([r, m]) => A.multiScatterAt(r, m, P, REF).psi);
    const peak = truth.reduce((m2, v) => Math.max(m2, v[0], v[1], v[2]), 0);
    const err = (get) => {
        let worst = 0, sum = 0;
        PROBES.forEach(([r, m], k) => {
            const a = get(r, m);
            for (let c = 0; c < 3; c++) {
                const e = Math.abs(a[c] - truth[k][c]) / peak;
                sum += e; if (e > worst) worst = e;
            }
        });
        return { worst, mean: sum / (PROBES.length * 3) };
    };

    // (a) the DIRECTION COUNT, evaluated directly with no table in the way
    const byDirs = [12, 24, 48, 96].map((d) =>
        ({ d, ...err((r, m) => A.multiScatterAt(r, m, P, { lut: LUT, dirs: d, steps: 20 }).psi) }));
    ok("!! *** the sphere integral converges with the DIRECTION COUNT, and that is what bounds the answer ***",
        byDirs.every((x, i2) => i2 === 0 || x.mean < byDirs[i2 - 1].mean),
        "mean error against a 512-direction reference: " +
        byDirs.map((x) => x.d + " dirs " + (100 * x.mean).toFixed(2) + "%").join(", ") +
        " -- monotone, and flattening out around a third of a percent");

    // (b) the TABLE SIZE, at a direction count that has stopped moving
    const byTable = [[8, 6], [16, 10], [24, 16], [40, 24]].map(([w, h]) => {
        const t = A.buildMultiScatterLUT(P, { w, h, lut: LUT, dirs: 192, steps: 20 });
        return { w, h, ...err((r, m) => A.lookupMultiScatter(t, r, m)) };
    });
    ok("!! *** AND THE TABLE'S RESOLUTION BARELY MATTERS: 8x6 IS WITHIN A FACTOR OF 1.4 OF 40x24 ***",
        byTable[0].mean < byTable[3].mean * 2 && byTable.every((x) => x.mean < 0.01),
        byTable.map((x) => x.w + "x" + x.h + " " + (100 * x.mean).toFixed(3) + "%").join(", ") +
        " -- a twentyfold increase in texels buys a factor of " +
        (byTable[0].mean / byTable[3].mean).toFixed(1) + ". psi is a SMOOTH function of altitude and sun " +
        "cosine, so there is almost nothing for a finer grid to resolve.");
    ok("!! *** which is the OPPOSITE of the transmittance table, and the contrast is the finding ***",
        byTable[0].mean < 0.006,
        "v4237's transmittance LUT went 1.46e-2 -> 4.09e-3 -> 1.00e-3 as it grew, a factor of 15, because the " +
        "function bends hard at the horizon. This one is flat. So the budget for multiple scattering belongs " +
        "in DIRECTIONS, not texels -- 5 KB of table and more rays, rather than a megabyte and fewer.");
    report("worst-case error tracks the same way but noisily -- " +
           byTable.map((x) => x.w + "x" + x.h + " " + (100 * x.worst).toFixed(2) + "%").join(", ") +
           " -- so the MEAN is what is asserted and the worst is reported");
    ok("   the lookup is bounded and finite everywhere on the domain, corners included",
        (() => {
            const m = A.buildMultiScatterLUT(P, { w: 8, h: 6, ...MOPT });
            for (const r of [P.Rg, P.Rg + 30, P.Rt]) for (const mu of [-1, -0.5, 0, 0.5, 1]) {
                if (!A.lookupMultiScatter(m, r, mu).every((x) => Number.isFinite(x) && x >= 0)) return false;
            }
            return true;
        })(), "a clamp off by a texel would read outside the array");
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nunchecked here, and it is the approximation the whole section rests on: ORDERS TWO AND UP ARE TREATED " +
    "AS ISOTROPIC. That is what lets a 2D table over (altitude, sun cosine) stand in for Bruneton's 4D one " +
    "over (r, mu, muSun, nu), and it is least true of the SECOND order -- the one with the most " +
    "directionality left and the largest of the ones being lumped together. Nothing here measures that " +
    "error, because measuring it needs the 4D table this round exists to avoid. Also unchecked: the GLSL, " +
    "which does not yet read the multiple-scattering table -- ATMOSPHERE_GLSL still computes single " +
    "scattering only, so sky.html shows the CPU model's numbers beside a shader that does less. What IS " +
    "checked: that F is a fraction everywhere so the series converges; that the partial sums walk onto the " +
    "closed form to 1e-9 and that the first order alone is not the answer; that the ground lights the sky by " +
    "400% across its albedo range, after a term that was 700x too small; and that the twilight collapse " +
    "v4237 predicted is arrested, 160x of falloff becoming 20x.");
process.exit(fails ? 1 : 0);
