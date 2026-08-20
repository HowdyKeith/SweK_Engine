// WebGLEngine/physics/md/diffusion-selfcheck.mjs — v3286
//
// Run: node physics/md/diffusion-selfcheck.mjs   (~60s — MEASURED individually)
// Gated by tools/ship/selfchecks.mjs (tree walk).
//
// A Lennard-Jones diffusion coefficient at one state point has NO closed form to check against, which is
// precisely why two mechanisms are the check. Einstein reads positions over long times; Green-Kubo reads
// velocities over short ones. Their equality is a THEOREM, so a disagreement is never "different physics" -- it
// is always a bug, and the two fail in opposite directions, so between them they say WHICH bug.

import { runTrajectory, einsteinD, greenKuboD, diffusionPair, msdWrappedWRONG } from "./diffusion.js";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

// ---- 1. THE PAIR AGREES, WITH A TOLERANCE EARNED FROM A MEASURED SPREAD -------------------------------------
{
    const rows = [];
    for (const seed of [17, 29, 41, 53]) {
        const p = diffusionPair({ seed });
        rows.push({ seed, e: p.a.value, g: p.b.value, rel: Math.abs(p.a.value - p.b.value) / ((p.a.value + p.b.value) / 2) });
    }
    const worst = Math.max(...rows.map((r) => r.rel));
    ok("!! Einstein (positions) and Green-Kubo (velocities) agree on D across four independent seeds",
       worst < 0.10,
       rows.map((r) => "s" + r.seed + ": " + r.e.toFixed(4) + "/" + r.g.toFixed(4) + " (" + (r.rel * 100).toFixed(1) + "%)").join("  ") +
       " — worst " + (worst * 100).toFixed(2) + "%, tolerance 10% EARNED from a measured spread of 6.3%, not chosen");
    ok("...and D is the same size on every seed (the pair agrees on a NUMBER, not merely on a ratio)",
       Math.max(...rows.map((r) => r.e)) / Math.min(...rows.map((r) => r.e)) < 1.15,
       "Einstein D from " + Math.min(...rows.map((r) => r.e)).toFixed(4) + " to " + Math.max(...rows.map((r) => r.e)).toFixed(4));
}

// ---- 2. THE GREEN-KUBO INTEGRAL HAS ACTUALLY CONVERGED ---------------------------------------------------------
// An integral that keeps changing with its own cut has not converged, whatever value you stop at. The default
// cut was 0.25 and was measured to be TOO EARLY -- D climbed 0.777 -> 0.830 -> 0.860 as the cut widened, which
// is why Green-Kubo sat systematically BELOW Einstein on every seed. A truncated tail is a one-signed error and
// it reads exactly like a real disagreement.
{
    const tr = runTrajectory({ seed: 17 });
    const ds = [0.4, 0.5, 0.6, 0.7, 0.85].map((cf) => greenKuboD({ vacf: tr.vacf, dt: tr.dt, cutFraction: cf }).D);
    const spread = (Math.max(...ds) - Math.min(...ds)) / (ds.reduce((a, b) => a + b) / ds.length);
    ok("!! D is INSENSITIVE to where the correlation is cut, across a wide plateau (the integral converged)",
       spread < 0.08, ds.map((d) => d.toFixed(4)).join(", ") + " over cuts 0.4-0.85 — spread " + (spread * 100).toFixed(1) + "%");
    const early = greenKuboD({ vacf: tr.vacf, dt: tr.dt, cutFraction: 0.1 }).D;
    ok("!! ...and cutting inside the decay UNDERSTATES it, one-signed, exactly as a truncated tail must",
       early < ds[0] * 0.95, "cut at 0.1 gives " + early.toFixed(4) + " against the plateau's " + ds[2].toFixed(4));
    ok("the correlation really has decayed by the cut (this is not a plateau in noise)",
       Math.abs(tr.vacf[Math.floor(tr.vacf.length * 0.6)]) < Math.abs(tr.vacf[0]) * 0.05,
       "vacf(0) = " + tr.vacf[0].toFixed(3) + ", vacf(cut) = " + tr.vacf[Math.floor(tr.vacf.length * 0.6)].toFixed(4));
}

// ---- 3. THE EINSTEIN WINDOW MUST BE DIFFUSIVE, NOT BALLISTIC -------------------------------------------------------
// At short times MSD ~ t^2 (free flight), at long times ~ t.
//
// I ASSERTED THE WRONG DIRECTION HERE AND THE MEASUREMENT CORRECTED IT. The claim written first was that
// fitting the ballistic start reports a D "several times too high" -- the familiar warning. Measured, the early
// window gives 0.254 against the diffusive 0.839: three times too LOW. Both follow from MSD ~ t^2: a straight
// line fitted through a curve that starts flat has a SMALL slope, while the "too high" version comes from
// evaluating MSD/6t pointwise rather than fitting a slope. Two different mistakes with the same name, and only
// one of them is what this code would actually do. The assertion now checks the magnitude of the error and
// states the direction that was measured.
{
    const tr = runTrajectory({ seed: 17 });
    const early = einsteinD({ msd: tr.msd, dt: tr.dt, from: 0.0, to: 0.06 }).D;
    const late = einsteinD({ msd: tr.msd, dt: tr.dt, from: 0.5, to: 1.0 }).D;
    ok("!! fitting the ballistic start gives a badly wrong D (three times too LOW, measured -- not too high)",
       Math.abs(early - late) / late > 0.5,
       "early-window D " + early.toFixed(4) + " vs diffusive " + late.toFixed(4) + " — a clean straight-line fit through a curve that is not a straight line");
    // and the late window really is linear: halves of it must agree
    const h1 = einsteinD({ msd: tr.msd, dt: tr.dt, from: 0.5, to: 0.75 }).D;
    const h2 = einsteinD({ msd: tr.msd, dt: tr.dt, from: 0.75, to: 1.0 }).D;
    ok("...and the diffusive window is genuinely linear (its two halves give the same slope)",
       Math.abs(h1 - h2) / late < 0.15, "halves " + h1.toFixed(4) + " and " + h2.toFixed(4));
}

// ---- 4. SABOTAGE: THE MSD FROM WRAPPED COORDINATES ---------------------------------------------------------------------
// The classic periodic-boundary bug, and the most persuasive wrong answer in the subject: it SATURATES, so it
// looks like a beautifully converged plateau, and what it has converged to is the size of the box.
{
    const good = runTrajectory({ seed: 17 });
    const bad = msdWrappedWRONG({ seed: 17 });
    // SATURATION IS ABOUT THE SLOPE, NOT THE HEIGHT. The first version compared final MSD values and read
    // 19.66 against 27.43 -- a ratio of 0.72 that looks like mild disagreement. The wrapped curve has simply
    // not finished flattening at this run length. What saturation MEANS is that growth stops, so measure the
    // growth over the last quarter, where the difference is a factor of thirteen rather than a third.
    const q = Math.floor(good.msd.length * 0.75);
    const growG = good.msd[good.msd.length - 1] - good.msd[q];
    const growB = bad.msd[bad.msd.length - 1] - bad.msd[q];
    const boxScale = good.box.L * good.box.L;
    ok("!! wrapped coordinates make the MSD stop GROWING (it measures the wall, not the motion)",
       growB < growG * 0.2 && bad.msd[bad.msd.length - 1] < boxScale,
       "growth over the last quarter: unwrapped " + growG.toFixed(3) + " vs wrapped " + growB.toFixed(3) +
       " (" + (growG / Math.max(growB, 1e-9)).toFixed(1) + "x), with the wrapped curve stalling below L^2 = " + boxScale.toFixed(1));
    const dBad = einsteinD({ msd: bad.msd, dt: bad.dt }).D;
    const dGood = einsteinD({ msd: good.msd, dt: good.dt }).D;
    ok("!! ...and it therefore reports a far smaller D, with no sign anything went wrong",
       dBad < dGood * 0.5,
       "sabotaged D " + dBad.toFixed(4) + " vs " + dGood.toFixed(4) + " — a smooth curve, a clean fit, and a number about the box");
    ok("!! and THE PAIR CATCHES IT: Green-Kubo reads velocities and is untouched by the wrap, so the two routes split",
       Math.abs(dBad - greenKuboD({ vacf: bad.vacf, dt: bad.dt }).D) / dGood > 0.3,
       "the wrapped run's Einstein " + dBad.toFixed(4) + " against its own Green-Kubo " +
       greenKuboD({ vacf: bad.vacf, dt: bad.dt }).D.toFixed(4) +
       " — a single estimator would have reported the smaller number with a straight face");
}

// ---- 5. determinism -------------------------------------------------------------------------------------------------
{
    const a = diffusionPair({ seed: 9, steps: 1500, warmup: 500 });
    const b = diffusionPair({ seed: 9, steps: 1500, warmup: 500 });
    ok("seeded runs are bit-identical (a disagreement reproduces)", a.a.value === b.a.value && a.b.value === b.b.value);
}

console.log(fails ? ("[diffusion-selfcheck] FAILED " + fails) : "[diffusion-selfcheck] all passed");
process.exit(fails ? 1 : 0);
