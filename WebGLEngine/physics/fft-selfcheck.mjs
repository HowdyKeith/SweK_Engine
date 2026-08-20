// physics/fft-selfcheck.mjs
//
// Run: node physics/fft-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// The spectral tool. The gate proves it is a real transform, not a plausible one: the inverse undoes the forward to
// machine precision; a pure cosine at bin k shows a single peak at bin k; Parseval's theorem holds, energy in time
// equalling energy in frequency; and -- the test that earns it a place next to the physics -- it pulls the normal-mode
// frequencies of the vibrating chain back out of a single mass's motion, landing on the analytic eigenfrequency to
// within the transform's own resolution. The sabotage skips the bit-reversal that orders the butterflies, and the
// transform scrambles: the inverse no longer recovers the signal and the peak wanders off its bin.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { fft, ifft, spectrum, peakBin } from "./fft.js";
import { makeChain, setMode, modeFreq, chainStep } from "./vibrations.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const hp = (a) => { const b = Buffer.alloc(a.length * 8); for (let i = 0; i < a.length; i++) b.writeDoubleLE(a[i], i * 8); return createHash("sha256").update(b).digest("hex"); };

// ---- 1. ROUND-TRIP: the inverse undoes the forward ------------------------------------------------------
{
    const N = 512, re = Float64Array.from({ length: N }, (_, i) => Math.sin(0.3 * i) + (i % 5) * 0.1), im = new Float64Array(N), re0 = [...re];
    fft(re, im); ifft(re, im); let err = 0; for (let i = 0; i < N; i++) err = Math.max(err, Math.abs(re[i] - re0[i]));
    ok("!! the inverse transform recovers the signal to machine precision", err < 1e-12,
       "ifft(fft(x)) returns x to " + err.toExponential(1) + " over 512 samples -- the forward and inverse are true inverses, not approximations.");
}

// ---- 2. KNOWN SPECTRUM: a pure cosine at bin k peaks at bin k --------------------------------------------
{
    const N = 256, k = 11, sig = Float64Array.from({ length: N }, (_, i) => Math.cos(2 * Math.PI * k * i / N));
    ok("!! a pure cosine shows a single peak at its own bin", peakBin(sig) === k,
       "a cosine of eleven cycles across the window peaks at bin eleven -- the transform reads a frequency where the frequency is.");
}

// ---- 3. PARSEVAL: energy in time equals energy in frequency ----------------------------------------------
{
    const N = 256, sig = Float64Array.from({ length: N }, (_, i) => Math.sin(0.7 * i) - 0.4 * Math.cos(0.2 * i));
    let et = 0; for (const v of sig) et += v * v;
    const mag = spectrum(sig); let ef = 0; for (const m of mag) ef += m * m; ef /= N;
    ok("!! Parseval's theorem holds -- energy in time equals energy in frequency", Math.abs(et - ef) / et < 1e-12,
       "the sum of the squared samples, " + et.toFixed(2) + ", equals the sum of the squared spectrum over N, " + ef.toFixed(2) + " -- no energy created or lost by the transform.");
}

// ---- 4. RECOVERS THE VIBRATION MODES: the spectrum reads the chain's eigenfrequencies --------------------
{
    const N = 8192, SUB = 2, dt = 1 / 240, dtS = SUB * dt, dw = 2 * Math.PI / (N * dtS);   // bin width in angular frequency
    let worstBins = 0, detail = "";
    for (const mode of [3, 5, 8]) {
        const st = makeChain({ N: 12 }); setMode(st, mode, 0.3); const sig = new Float64Array(N);
        for (let i = 0; i < N; i++) { sig[i] = st.x[3]; for (let k = 0; k < SUB; k++) chainStep(st, dt); }
        const fpeak = 2 * Math.PI * peakBin(sig) / (N * dtS), fa = modeFreq(st, mode), bins = Math.abs(fpeak - fa) / dw;
        if (bins > worstBins) { worstBins = bins; detail = "mode " + mode + " peak " + fpeak.toFixed(3) + " vs analytic " + fa.toFixed(3); }
    }
    ok("!! the spectrum recovers the chain's normal-mode frequencies", worstBins < 1.2,
       "the FFT of one mass's motion peaks on the analytic eigenfrequency to within " + worstBins.toFixed(2) + " of a frequency bin (" + detail + ") -- the spectral tool reads the physics back out.");
}

// ---- 5. DETERMINISTIC + pure butterflies (strict trig only for the twiddles) -----------------------------
{
    const mk = () => spectrum(Float64Array.from({ length: 128 }, (_, i) => Math.sin(0.9 * i) + Math.cos(0.3 * i)));
    const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "fft.js"), "utf8").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const clean = !/Math\.(sin|cos|tan|exp|log|pow|hypot|random|acos|asin|atan)\b/.test(src);
    ok("!! the transform is deterministic and its butterflies are pure arithmetic", hp(mk()) === hp(mk()) && clean,
       "the spectrum reproduces byte-for-byte and the butterflies are +,-,*,/ over a twiddle table taken from the strict-trig core -- so the spectrum is bit-identical across machines and joins the fingerprint.");
}

console.log(fails ? "\nfft-selfcheck: " + fails + " FAILED" : "\nfft-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
