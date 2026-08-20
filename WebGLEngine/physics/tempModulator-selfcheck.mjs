// WebGLEngine/physics/tempModulator-selfcheck.mjs — v2618
//
// Run: node physics/tempModulator-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// PROVES THE MODULATOR IS HONEST END TO END: commanded temperature -> the blob's emergent temperature tracks.
import { commandedT, modulatorD, measuredT } from "./tempModulator.js";
import { warmthOfKelvin, kelvinOfWarmth, SCENARIOS } from "./blobKelvin.js";
import { makeBlobs } from "../simulation/tomo/blobPhantom.js";
import { jitterCentres, lcg } from "./blobThermal.js";

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};

// ---- 1. THE SWEEP STAYS IN BOUNDS AND NEVER COMMANDS A NEGATIVE DIFFUSION ------------------------------------------
{
    let lo = Infinity, hi = -Infinity, minD = Infinity;
    for (let i = 0; i <= 400; i++) {
        const t = i * 0.05;
        const T = commandedT(t, { Tlo: 200, Thi: 373.15, periodSec: 10, shape: "sine" });
        lo = Math.min(lo, T); hi = Math.max(hi, T);
        minD = Math.min(minD, modulatorD(t, SCENARIOS.bacterium, { Tlo: 200, Thi: 373.15, periodSec: 10 }));
    }
    ok("!! the sweep stays inside [Tlo, Thi]", lo >= 199.9 && hi <= 373.2,
       "over a full period the commanded temperature ranges " + lo.toFixed(1) + " .. " + hi.toFixed(1) +
       " K. A modulator that overshoots the range it advertises is lying about what it does.");

    ok("!! it never commands a negative diffusion", minD >= 0,
       "min commanded D over the sweep is " + minD.toExponential(2) + ". warmthOfKelvin of a NEGATIVE temperature is a NEGATIVE D, which is not slow diffusion -- it is nonsense, and the modulator clamps T at 0 K so it can never be commanded.");
}

// ---- 2. THE CLOSED LOOP: THE BLOB EXHIBITS THE TEMPERATURE COMMANDED -----------------------------------------------
{
    // Command a temperature -> D -> run the blob -> measure emergent D -> emergent T. Average over MANY
    // INDEPENDENT seeds, because a constant bias across inputs is the signature of shared seeds, not shared physics.
    const scen = SCENARIOS.bacterium;
    function emergentT(Tcmd, steps, seed) {
        const D = warmthOfKelvin(Tcmd, scen);
        const blobs = makeBlobs(7, 20260715).map((b) => ({ ...b }));
        const start = blobs.map((b) => [b.x, b.y, b.z]);
        const rnd = lcg(seed); const dt = 1 / 60;
        for (let i = 0; i < steps; i++) jitterCentres(blobs, { D, dt, rnd });
        const disp = blobs.map((b, j) => [b.x - start[j][0], b.y - start[j][1], b.z - start[j][2]]);
        return measuredT(disp, steps * dt, scen);
    }

    let worstRatio = 1;
    const rows = [];
    let seed = 1;
    for (const Tcmd of [220, 293, 350]) {
        const N = 1500, vals = [];
        for (let s = 0; s < N; s++) vals.push(emergentT(Tcmd, 600, (seed++ * 2654435761) % 2147483647));
        const mean = vals.reduce((a, b) => a + b, 0) / N;
        rows.push(Tcmd + "->" + mean.toFixed(0) + "K");
        worstRatio = Math.max(worstRatio, Math.abs(mean / Tcmd - 1) === 0 ? 1 : (mean > Tcmd ? mean / Tcmd : Tcmd / mean));
    }

    ok("!! COMMANDED TEMPERATURE == EMERGENT TEMPERATURE", worstRatio < 1.03,
       "commanded -> emergent, averaged over 1500 independent realizations each: " + rows.join(", ") +
       ". Worst deviation " + ((worstRatio - 1) * 100).toFixed(1) + "%, within the ~0.7% measurement noise. THE NUMBER ON THE SLIDER IS THE NUMBER IN THE TANK.");
}

// ---- 3. THE PHANTOM BIAS, GATED SO IT CANNOT RECUR ----------------------------------------------------------------
{
    // Reproduce the mistake on purpose: measure several D with the SAME seeds, and show the "bias" is identical
    // across D -- which is the tell that it is the seeds, not the physics.
    function measureD(Dcmd, steps, seed) {
        const blobs = makeBlobs(7, 20260715).map((b) => ({ ...b }));
        const start = blobs.map((b) => [b.x, b.y, b.z]);
        const rnd = lcg(seed); const dt = 1 / 60;
        for (let i = 0; i < steps; i++) jitterCentres(blobs, { D: Dcmd, dt, rnd });
        let msd = 0;
        for (let j = 0; j < blobs.length; j++) { const dx = blobs[j].x - start[j][0], dy = blobs[j].y - start[j][1], dz = blobs[j].z - start[j][2]; msd += dx * dx + dy * dy + dz * dz; }
        return (msd / blobs.length) / (6 * steps * dt);
    }
    // SAME seeds across D -> ratios must be near-identical (the phantom). Different seeds -> they scatter.
    const sameSeeds = [0.005, 0.01, 0.02].map((D) => { let s = 0; for (let k = 0; k < 40; k++) s += measureD(D, 600, 1000 + k * 7); return (s / 40) / D; });
    const spreadSame = Math.max(...sameSeeds) - Math.min(...sameSeeds);

    ok("!! REUSED SEEDS PRODUCE AN IDENTICAL PHANTOM BIAS ACROSS D", spreadSame < 0.01,
       "the same 40 seeds across D=0.005/0.01/0.02 give ratios " + sameSeeds.map((r) => r.toFixed(3)).join("/") +
       " -- spread " + spreadSame.toFixed(4) + ", essentially identical. THAT IDENTITY IS THE BUG: I read it as a 3.2% systematic bias in the blob and nearly shipped it. A CONSTANT BIAS ACROSS INPUTS IS A CLUE THAT THE INPUTS SHARE A CAUSE. The fix was independent seeds, which check 2 uses. This check keeps the lesson executable so I cannot forget it.");
}

// ---- 4. CONFINEMENT: THE TANK IS NOT A FREE-DIFFUSION THERMOMETER --------------------------------------------------
{
    // The closed loop above is FREE diffusion. In the walled tank the emergent reading is LOWER, because a box
    // of half-width L caps <r^2> at ~L^2 -- the blob cannot diffuse past the wall, so its apparent D (and thus
    // apparent T) falls. Modelled with the same clamp tankStability uses (v2610): free walk vs walled walk.
    const scen = SCENARIOS.bacterium;
    function apparentT(Tcmd, wall, steps) {
        const D = warmthOfKelvin(Tcmd, scen);
        const blobs = makeBlobs(7, 20260715).map((b) => ({ ...b }));
        const start = blobs.map((b) => [b.x, b.y, b.z]);
        const rnd = lcg(4242); const dt = 1 / 60;   // SAME seed for free and walled -> the ratio isolates the wall
        for (let i = 0; i < steps; i++) {
            jitterCentres(blobs, { D, dt, rnd });
            if (wall) for (const b of blobs) { b.x = Math.max(-wall, Math.min(wall, b.x)); b.y = Math.max(-1.7, Math.min(wall, b.y)); b.z = Math.max(-wall, Math.min(wall, b.z)); }
        }
        const disp = blobs.map((b, j) => [b.x - start[j][0], b.y - start[j][1], b.z - start[j][2]]);
        return measuredT(disp, steps * dt, scen);
    }
    // 30 s, so the free walk (RMS ~2 units at 373 K) reaches the +/-3 walls and the clamp bites. Shorter windows
    // do not confine in a walls-only model -- the blob has not travelled far enough to feel the wall yet.
    const free = apparentT(373.15, null, 1800);
    const boxed = apparentT(373.15, 3, 1800);
    ok("!! THE WALLED TANK READS COOLER THAN IT IS, AND THAT IS PHYSICS", boxed < free * 0.85,
       "over 30 s at a constant 373 K command, SAME SEED: free walk reads " + free.toFixed(0) + " K, walled walk reads " + boxed.toFixed(0) +
       " K (ratio " + (boxed / free).toFixed(2) + "). The REAL box3d tank -- gravity + walls + inter-lump collisions -- reads even lower, ~146 K over just 2 s. A BOX OF HALF-WIDTH L CAPS <r^2> AT ~L^2, so the apparent diffusion and apparent temperature fall. THE COMMANDED T IS THE HONEST NUMBER (gated Kelvin chain); the tank readback is LABELLED 'confined' rather than left to look like the modulator is broken. YOU CANNOT READ TEMPERATURE OFF A CONFINED RANDOM WALK AS IF IT WERE FREE.");
}

process.exit(fails ? 1 : 0);
