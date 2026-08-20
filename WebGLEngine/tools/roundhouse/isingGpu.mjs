// tools/roundhouse/isingGpu.mjs — v3283
//
// THE THIRD KERNEL, and the first with a ZERO-TOLERANCE adjudication. magmap and hmc-leapfrog are f32 kernels
// graded against a measured floating-point floor; this one is INTEGER ARITHMETIC END TO END, so the CPU mirror
// and the device must agree BIT-EXACTLY on every spin, every sweep. The trick that buys that:
//
//   RNG — Philox4x32-10, a COUNTER-BASED generator: out = philox(counter, key), no state, no sequence to
//   coordinate between threads. Key = (seed, sweep|parity), counter = site index. Any thread order, any device,
//   same bits. All u32 mul/xor/add — exact everywhere.
//
//   ACCEPT — the Metropolis factor exp(-dE/T) never enters the kernel. dE for a square-lattice spin flip takes
//   one of five values {-8,-4,0,4,8}; the CPU precomputes THRESHOLDS floor(exp(-dE/T) * 2^32) as u32 and the
//   kernel accepts iff philoxWord < threshold. The one transcendental in the whole algorithm is evaluated ONCE,
//   on the CPU, in f64, and shipped as an integer. Quantization cost: at most 2^-32 per accept decision, and it
//   is the SAME quantization on device and mirror, so it cancels exactly.
//
//   RACES — checkerboard: even-parity sites update in one dispatch, odd in the next. A site's four neighbours
//   are all the other colour, so within a dispatch no thread reads what another writes.
//
// THE ANSWER KEYS ARE LAYERED: (1) Philox known-answer vectors from the Random123 reference (the RNG is the
// published function, not one like it); (2) the CPU mirror running THIS algorithm reproduces Yang's exact
// magnetisation — the RNG is good enough to do physics; (3) a device run is graded spin-for-spin against the
// mirror at zero tolerance, so a single flipped bit anywhere in 4096 sites x 400 sweeps is a rejection.
"use strict";
import { yangMagnetisation } from "../../physics/statmech/ising.js";

// ---- Philox4x32-10 (Salmon et al., Random123). Exact u32 arithmetic via Math.imul and >>> 0. --------------------
const PH_M0 = 0xD2511F53, PH_M1 = 0xCD9E8D57, PH_W0 = 0x9E3779B9, PH_W1 = 0xBB67AE85;
function mulhilo(a, b) {
    // exact 32x32 -> (hi, lo) via 16-bit limbs; every intermediate stays under 2^53 so JS floats are exact here.
    const aH = a >>> 16, aL = a & 0xffff, bH = b >>> 16, bL = b & 0xffff;
    const ll = aL * bL, lh = aL * bH, hl = aH * bL, hh = aH * bH;
    const mid = lh + hl + Math.floor(ll / 65536);          // <= ~2^33, exact as a float
    const low = ((ll & 0xffff) + ((mid & 0xffff) * 65536)) >>> 0;
    const high = (hh + Math.floor(mid / 65536)) >>> 0;
    return [high, low];
}
export function philox4x32_10(c0, c1, c2, c3, k0, k1) {
    let x0 = c0 >>> 0, x1 = c1 >>> 0, x2 = c2 >>> 0, x3 = c3 >>> 0, K0 = k0 >>> 0, K1 = k1 >>> 0;
    for (let r = 0; r < 10; r++) {
        const [h0, l0] = mulhilo(PH_M0, x0);
        const [h1, l1] = mulhilo(PH_M1, x2);
        const y0 = (h1 ^ x1 ^ K0) >>> 0, y1 = l1;
        const y2 = (h0 ^ x3 ^ K1) >>> 0, y3 = l0;
        x0 = y0; x1 = y1; x2 = y2; x3 = y3;
        K0 = (K0 + PH_W0) >>> 0; K1 = (K1 + PH_W1) >>> 0;
    }
    return [x0, x1, x2, x3];
}

// ---- thresholds: the ONE transcendental, done once on the CPU in f64, shipped as u32 -----------------------------
// index by (dE+8)/4 in {0..4} for dE in {-8,-4,0,4,8}; dE<=0 accepts always (threshold 0xffffffff).
export function acceptThresholds(T) {
    const th = new Uint32Array(5);
    for (let i = 0; i < 5; i++) {
        const dE = -8 + 4 * i;
        th[i] = dE <= 0 ? 0xffffffff : Math.min(0xffffffff, Math.floor(Math.exp(-dE / T) * 4294967296));
    }
    return th;
}

export const WGSL_ISING = /* wgsl */ `
// ising-checkerboard.wgsl -- one thread per site OF ONE PARITY. Philox4x32-10 inline; INTEGER ARITHMETIC ONLY.
// No transcendentals, no f32 anywhere in the accept path: thresholds arrive precomputed as u32.
struct Params { L: u32, sweep: u32, parity: u32, seed: u32 };
@group(0) @binding(0) var<uniform> P : Params;
@group(0) @binding(1) var<storage, read_write> spins : array<i32>;
@group(0) @binding(2) var<storage, read> thresh : array<u32>;   // 5 entries, index (dE+8)/4

fn mulhilo(a: u32, b: u32) -> vec2<u32> {
  // exact 32x32 -> (hi, lo) via 16-bit limbs WITH the carry chain -- u32 addition wraps in WGSL, so lh+hl needs
  // its overflow carried into the high word (lh and hl are each < 2^32 but their sum can reach ~2^33).
  let aH = a >> 16u; let aL = a & 0xffffu; let bH = b >> 16u; let bL = b & 0xffffu;
  let ll = aL * bL; let lh = aL * bH; let hl = aH * bL; let hh = aH * bH;
  let mid1 = lh + hl;
  let c1 = select(0u, 1u, mid1 < lh);          // carry out of lh+hl
  let mid = mid1 + (ll >> 16u);
  let c2 = select(0u, 1u, mid < mid1);         // carry out of adding ll>>16
  let lo = (ll & 0xffffu) | (mid << 16u);
  let hi = hh + (mid >> 16u) + ((c1 + c2) << 16u);
  return vec2<u32>(hi, lo);
}
fn philox(c0: u32, c1: u32, c2: u32, c3: u32, k0in: u32, k1in: u32) -> vec4<u32> {
  var x = vec4<u32>(c0, c1, c2, c3);
  var k0 = k0in; var k1 = k1in;
  for (var r: u32 = 0u; r < 10u; r = r + 1u) {
    let m0 = mulhilo(0xD2511F53u, x.x);
    let m1 = mulhilo(0xCD9E8D57u, x.z);
    x = vec4<u32>(m1.x ^ x.y ^ k0, m1.y, m0.x ^ x.w ^ k1, m0.y);
    k0 = k0 + 0x9E3779B9u; k1 = k1 + 0xBB67AE85u;
  }
  return x;
}
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let L = P.L; let half = (L * L) / 2u;
  let t = gid.x;
  if (t >= half) { return; }
  // t indexes sites of parity P.parity in row-major order: row y, and x runs over the parity's columns.
  let y = t / (L / 2u);
  let xi = t % (L / 2u);
  let x = 2u * xi + ((y + P.parity) & 1u);
  let i = y * L + x;
  let up = select(y - 1u, L - 1u, y == 0u) * L + x;
  let dn = select(y + 1u, 0u, y == L - 1u) * L + x;
  let lf = y * L + select(x - 1u, L - 1u, x == 0u);
  let rt = y * L + select(x + 1u, 0u, x == L - 1u);
  let s = spins[i];
  let nb = spins[up] + spins[dn] + spins[lf] + spins[rt];
  let dE = 2 * s * nb;                       // in {-8..8}
  let idx = u32((dE + 8) / 4);
  let r = philox(i, P.sweep, P.parity, 0u, P.seed, 0x15140u);
  if (r.x < thresh[idx]) { spins[i] = -s; }
}
`;

// ---- CPU mirror: the SAME algorithm, exact integer path -- graded bit-for-bit against a device -------------------
export function makeLattice(L, seed) {
    const s = new Int32Array(L * L);
    // deterministic init from philox itself so device and mirror can share it exactly
    for (let i = 0; i < L * L; i++) s[i] = (philox4x32_10(i, 0, 0, 0, seed ^ 0xA5A5A5A5, 0)[0] & 1) ? 1 : -1;
    return s;
}
export function mirrorSweep(spins, L, sweep, seed, thresh) {
    for (let parity = 0; parity < 2; parity++) {
        const half = (L * L) / 2;
        for (let t = 0; t < half; t++) {
            const y = Math.floor(t / (L / 2));
            const xi = t % (L / 2);
            const x = 2 * xi + ((y + parity) & 1);
            const i = y * L + x;
            const up = ((y === 0 ? L - 1 : y - 1) * L + x);
            const dn = ((y === L - 1 ? 0 : y + 1) * L + x);
            const lf = y * L + (x === 0 ? L - 1 : x - 1);
            const rt = y * L + (x === L - 1 ? 0 : x + 1);
            const s = spins[i];
            const nb = spins[up] + spins[dn] + spins[lf] + spins[rt];
            const dE = 2 * s * nb;
            const idx = (dE + 8) / 4;
            const r = philox4x32_10(i, sweep, parity, 0, seed, 0x15140);
            if (r[0] >>> 0 < thresh[idx]) spins[i] = -s;
        }
    }
}
export function mirrorRun({ L = 64, T = 2.0, sweeps = 400, warmup = 400, seed = 2026 } = {}) {
    const th = acceptThresholds(T);
    const spins = makeLattice(L, seed);
    for (let sw = 0; sw < warmup; sw++) mirrorSweep(spins, L, sw, seed, th);
    let mAbs = 0;
    for (let sw = warmup; sw < warmup + sweeps; sw++) {
        mirrorSweep(spins, L, sw, seed, th);
        let M = 0; for (let i = 0; i < L * L; i++) M += spins[i];
        mAbs += Math.abs(M) / (L * L);
    }
    return { spins, absM: mAbs / sweeps };
}

// zero-tolerance adjudication: every spin identical, or rejection with a count.
export function adjudicateSpins(deviceSpins, mirrorSpins) {
    let diff = 0;
    for (let i = 0; i < mirrorSpins.length; i++) if (deviceSpins[i] !== mirrorSpins[i]) diff++;
    return { diff, n: mirrorSpins.length, pass: diff === 0, tol: 0 };
}
