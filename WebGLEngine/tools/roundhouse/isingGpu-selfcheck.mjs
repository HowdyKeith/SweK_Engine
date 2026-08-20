// tools/roundhouse/isingGpu-selfcheck.mjs — v3283
//
// Run: node tools/roundhouse/isingGpu-selfcheck.mjs   (~6s — MEASURED, dominated by the two physics runs)
// Gated by tools/ship/selfchecks.mjs (tree walk).
//
// Layered keys for the first ZERO-TOLERANCE kernel: (1) Philox4x32-10 reproduces the Random123 reference
// vectors bit-for-bit — the RNG is the PUBLISHED function; (2) the integer-threshold Metropolis it drives
// reproduces Yang's exact magnetisation — the RNG is good enough to DO PHYSICS, which no statistical test of
// the stream itself can certify; (3) adjudication is spin-for-spin equality, tolerance ZERO, and a single
// wrong constant anywhere in the pipeline scrambles the lattice — measured, not assumed.

import { philox4x32_10, acceptThresholds, makeLattice, mirrorSweep, mirrorRun, adjudicateSpins, WGSL_ISING } from "./isingGpu.mjs";
import { yangMagnetisation } from "../../physics/statmech/ising.js";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

// ---- 1. THE RNG IS THE PUBLISHED FUNCTION -----------------------------------------------------------------------
{
    const hex = (v) => v.map((x) => (x >>> 0).toString(16).padStart(8, "0")).join(" ");
    const z = philox4x32_10(0, 0, 0, 0, 0, 0);
    const f = philox4x32_10(0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff);
    ok("!! Philox4x32-10 matches the Random123 known-answer vector (all-zeros input)",
       hex(z) === "6627e8d5 e169c58d bc57ac4c 9b00dbd8", hex(z));
    ok("!! ...and the all-ones vector", hex(f) === "408f276d 41c83b0e a20bc7c6 6d5451fd", hex(f));
}

// ---- 2. THE INTEGER THRESHOLDS ARE THE BOLTZMANN FACTORS, QUANTIZED ONCE ----------------------------------------
{
    const T = 2.0, th = acceptThresholds(T);
    const worst = Math.max(Math.abs(th[3] / 4294967296 - Math.exp(-4 / T)), Math.abs(th[4] / 4294967296 - Math.exp(-8 / T)));
    ok("thresholds encode exp(-dE/T) to within one part in 2^32 (the one transcendental, done once on the CPU)",
       th[0] === 0xffffffff && th[2] === 0xffffffff && worst < 1e-9,
       "worst quantization " + worst.toExponential(2) + " — and it is the SAME quantization on device and mirror, so it cancels exactly");
}

// ---- 3. THE PHYSICS KEY: this update rule + this RNG reproduce Yang's exact curve --------------------------------
for (const [T, tol] of [[1.6, 0.02], [2.0, 0.035]]) {
    const r = mirrorRun({ L: 32, T, sweeps: 500, warmup: 500, seed: 2026 });
    const ons = yangMagnetisation(T);
    ok("!! checkerboard + Philox + integer accept reproduces Yang m(T) at T=" + T,
       Math.abs(r.absM - ons) < tol, "measured " + r.absM.toFixed(4) + " vs exact " + ons.toFixed(4) + " (|diff| " + Math.abs(r.absM - ons).toFixed(4) + ")");
}

// ---- 4. ZERO-TOLERANCE ADJUDICATION HAS TEETH -------------------------------------------------------------------
{
    // a faithful "device" (the mirror rerun from the same seed) agrees on EVERY spin
    const T = 2.2, th = acceptThresholds(T), L = 32;
    const a = makeLattice(L, 7), b = makeLattice(L, 7);
    for (let sw = 0; sw < 60; sw++) { mirrorSweep(a, L, sw, 7, th); mirrorSweep(b, L, sw, 7, th); }
    const good = adjudicateSpins(a, b);
    ok("!! a faithful device run is spin-for-spin identical after 60 sweeps (tolerance ZERO — the first kernel that can demand it)",
       good.pass, good.diff + "/" + good.n + " spins differ");
    // sabotage: ONE wrong Philox round constant in the "device" — the streams decorrelate and the lattice scrambles
    const PH_M0 = 0xD2511F53;
    const badPhilox = (c0, c1, c2, c3, k0, k1) => {
        // reimplemented with M1 off by one bit — the kind of typo a port makes
        const mul = (x, m) => { const aH = x >>> 16, aL = x & 0xffff, bH = m >>> 16, bL = m & 0xffff;
            const ll = aL * bL, mid = aL * bH + aH * bL + Math.floor(ll / 65536);
            return [(aH * bH + Math.floor(mid / 65536)) >>> 0, ((ll & 0xffff) + ((mid & 0xffff) * 65536)) >>> 0]; };
        let x0 = c0 >>> 0, x1 = c1 >>> 0, x2 = c2 >>> 0, x3 = c3 >>> 0, K0 = k0 >>> 0, K1 = k1 >>> 0;
        for (let r = 0; r < 10; r++) {
            const [h0, l0] = mul(x0, PH_M0), [h1, l1] = mul(x2, 0xCD9E8D56);   // <-- one bit off
            const y0 = (h1 ^ x1 ^ K0) >>> 0, y1 = l1, y2 = (h0 ^ x3 ^ K1) >>> 0, y3 = l0;
            x0 = y0; x1 = y1; x2 = y2; x3 = y3;
            K0 = (K0 + 0x9E3779B9) >>> 0; K1 = (K1 + 0xBB67AE85) >>> 0;
        }
        return [x0, x1, x2, x3];
    };
    const c = makeLattice(L, 7);
    for (let sw = 0; sw < 60; sw++) {
        for (let parity = 0; parity < 2; parity++) {
            const half = (L * L) / 2;
            for (let t = 0; t < half; t++) {
                const y = Math.floor(t / (L / 2)), x = 2 * (t % (L / 2)) + ((y + parity) & 1), i = y * L + x;
                const up = ((y === 0 ? L - 1 : y - 1) * L + x), dn = ((y === L - 1 ? 0 : y + 1) * L + x);
                const lf = y * L + (x === 0 ? L - 1 : x - 1), rt = y * L + (x === L - 1 ? 0 : x + 1);
                const s = c[i], nb = c[up] + c[dn] + c[lf] + c[rt], dE = 2 * s * nb;
                const r = badPhilox(i, sw, parity, 0, 7, 0x15140);
                if ((r[0] >>> 0) < th[(dE + 8) / 4]) c[i] = -s;
            }
        }
    }
    const bad = adjudicateSpins(c, a);
    ok("!! ...and ONE BIT wrong in a Philox constant scrambles the lattice (rejected, measured)",
       !bad.pass && bad.diff > bad.n * 0.2,
       bad.diff + "/" + bad.n + " spins differ — the same physics, the same thresholds, one constant off by one, and zero tolerance sees all of it");
}

// ---- 5. THE WGSL TEXT KEEPS ITS PROMISES ------------------------------------------------------------------------
{
    const banned = ["sin(", "cos(", "exp(", "log(", "pow(", "sqrt(", ": f32", "f32("];
    const hits = banned.filter((b) => WGSL_ISING.includes(b));
    ok("the kernel is INTEGER ONLY — no transcendentals, no f32 anywhere in the accept path",
       hits.length === 0, hits.length ? "found: " + hits.join(" ") : "u32/i32 end to end; the one exp() lives on the CPU");
    ok("...and carries the published Philox constants and the checkerboard structure",
       WGSL_ISING.includes("0xD2511F53u") && WGSL_ISING.includes("0xCD9E8D57u") && WGSL_ISING.includes("0x9E3779B9u") &&
       WGSL_ISING.includes("@workgroup_size(64)") && WGSL_ISING.includes("P.parity") && WGSL_ISING.includes("0x15140u"));
}

// ---- 6. determinism ---------------------------------------------------------------------------------------------
{
    const a = mirrorRun({ L: 16, T: 2.2, sweeps: 100, warmup: 100, seed: 5 });
    const b = mirrorRun({ L: 16, T: 2.2, sweeps: 100, warmup: 100, seed: 5 });
    ok("seeded runs are bit-identical (a device disagreement is a finding, never noise)", a.absM === b.absM);
}

console.log(fails ? ("[isingGpu-selfcheck] FAILED " + fails) : "[isingGpu-selfcheck] all passed");
process.exit(fails ? 1 : 0);
