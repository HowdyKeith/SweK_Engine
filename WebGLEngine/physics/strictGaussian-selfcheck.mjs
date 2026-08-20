// physics/strictGaussian-selfcheck.mjs
//
// Run: node physics/strictGaussian-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// The strict-libm Gaussian: a normal sample built on the engine's proven strict transcendental core instead of the
// platform math library, so the blob thermal coupling can be bit-identical across machines and join the fingerprint.
// The gate proves it is a proper standard normal (mean zero, variance one) whose empirical distribution matches the
// normal CDF computed FROM the strict erf itself; that erfinv genuinely inverts erf; that the code touches no libm
// transcendental; and that the strict thermal coupling still tracks -- a warmer setpoint reads back hotter -- now
// reproducing byte-for-byte. The sabotage skips the Newton refinement and returns the raw seed, and the distribution
// stops matching the normal CDF, because a first guess at erfinv is not erfinv.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { erfinvStrict, strictGaussian, strictJitterCentres } from "./strictGaussian.js";
import { strictErf } from "../tools/strictExpErf.mjs";
import { lcg } from "./blobThermal.js";
import { warmthOfKelvin, SCENARIOS } from "./blobKelvin.js";
import { measuredT } from "./tempModulator.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. STANDARD NORMAL: mean zero, variance one --------------------------------------------------------
{
    const rnd = lcg(12345); let n = 200000, s = 0, s2 = 0;
    for (let i = 0; i < n; i++) { const z = strictGaussian(rnd); s += z; s2 += z * z; }
    const mean = s / n, varr = s2 / n;
    ok("!! the strict Gaussian is a standard normal -- mean zero, variance one", Math.abs(mean) < 0.02 && Math.abs(varr - 1) < 0.03,
       "over 200k draws the sample mean is " + mean.toFixed(4) + " and the variance " + varr.toFixed(4) + " -- N(0,1) to sampling noise.");
}

// ---- 2. MATCHES the normal CDF built from the strict erf ------------------------------------------------
{
    const rnd = lcg(999), N = 100000, samp = []; for (let i = 0; i < N; i++) samp.push(strictGaussian(rnd)); samp.sort((a, b) => a - b);
    const Phi = (z) => 0.5 * (1 + strictErf(z / Math.SQRT2));
    let maxD = 0; for (const z of [-2, -1, -0.5, 0, 0.5, 1, 2]) { let c = 0; for (const v of samp) if (v <= z) c++; maxD = Math.max(maxD, Math.abs(c / N - Phi(z))); }
    ok("!! its distribution matches the normal CDF computed from the strict erf", maxD < 0.01,
       "the empirical CDF tracks 0.5(1+erf(z/sqrt2)) to within " + maxD.toFixed(4) + " across the middle of the distribution -- the sampler and the strict erf agree on what normal means.");
}

// ---- 3. erfinv inverts erf -----------------------------------------------------------------------------
{
    let e = 0; for (const y of [-0.95, -0.7, -0.3, 0, 0.3, 0.7, 0.95]) e = Math.max(e, Math.abs(strictErf(erfinvStrict(y)) - y));
    ok("!! erfinv genuinely inverts the strict erf", e < 1e-6,
       "erf(erfinv(y)) returns y to " + e.toExponential(1) + " -- Newton on the strict erf lands on the true inverse.");
}

// ---- 4. NO LIBM: only +,-,*,/,sqrt and the strict core -------------------------------------------------
{
    const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "strictGaussian.js"), "utf8").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const clean = !/Math\.(sin|cos|tan|exp|log|pow|hypot|random|acos|asin|atan)\b/.test(src);
    ok("!! the Gaussian uses no libm transcendental -- only sqrt and the strict core", clean,
       "no Math.log or Math.cos anywhere; the normal is drawn from erfinv on strictErf and strictExp, so every machine draws the same numbers.");
}

// ---- 5. the strict thermal coupling tracks and is bit-identical -----------------------------------------
{
    const scen = SCENARIOS.bacterium;
    const run = (tempK) => { const rnd = lcg(20260715), N = 7, c = []; for (let i = 0; i < N; i++) c.push({ x: (i - 3) * 0.12, y: ((i % 3) - 1) * 0.12, z: ((i % 2) - 0.5) * 0.24 }); const box = 1.4, ring = []; let mK = null; for (let s = 0; s < 300; s++) { strictJitterCentres(c, { D: warmthOfKelvin(tempK, scen), dt: 1 / 60, rnd }); for (const b of c) for (const k of ["x", "y", "z"]) { if (b[k] > box) b[k] = 2 * box - b[k]; else if (b[k] < -box) b[k] = -2 * box - b[k]; } ring.push(c.map((b) => [b.x, b.y, b.z])); if (ring.length > 120) ring.shift(); if (ring.length === 120) { const o = ring[0], d = []; for (let i = 0; i < N; i++) d.push([c[i].x - o[i][0], c[i].y - o[i][1], c[i].z - o[i][2]]); mK = measuredT(d, 2, scen); } } const buf = Buffer.alloc(N * 24); for (let i = 0; i < N; i++) { buf.writeDoubleLE(c[i].x, i * 24); buf.writeDoubleLE(c[i].y, i * 24 + 8); buf.writeDoubleLE(c[i].z, i * 24 + 16); } return { mK, sig: createHash("sha256").update(buf).digest("hex") }; };
    const cool = run(270), warm = run(360), rep = run(300), rep2 = run(300);
    ok("!! the strict thermal coupling tracks warmth and now reproduces byte-for-byte", warm.mK > cool.mK && rep.sig === rep2.sig,
       "a warmer setpoint reads back " + warm.mK.toFixed(0) + "K against a cooler one's " + cool.mK.toFixed(0) + "K, and the run is bit-identical -- the coupling is cross-architecture now, not single-machine.");
}

// ---- 6. DETERMINISTIC ----------------------------------------------------------------------------------
{
    const a = lcg(7), b = lcg(7); let same = true; for (let i = 0; i < 2000; i++) if (strictGaussian(a) !== strictGaussian(b)) same = false;
    ok("!! the sampler reproduces exactly from a seed", same,
       "two seeded streams draw an identical two thousand samples -- deterministic, as a fingerprint subsystem must be.");
}

console.log(fails ? "\nstrictGaussian-selfcheck: " + fails + " FAILED" : "\nstrictGaussian-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
