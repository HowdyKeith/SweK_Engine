// physics/statmech/paramagnet.mjs -- v3818
//
// LOCALISED SPINS IN A FIELD -- THE NON-INTERACTING NEIGHBOUR OF ising.js. Ising's spins argue with each other and
// collapse into order at Onsager's T_c; these spins ignore each other and only feel the applied field, so there is
// no phase transition, just a smooth competition between alignment and temperature. That competition is the
// BRILLOUIN function, and its heat-capacity signature is the SCHOTTKY ANOMALY -- the one C_V in the whole menagerie
// (Debye's plateau, blackbody's T^3, Fermi's linear, BEC's cusp, the classical constant) that RISES TO A PEAK AND
// FALLS BACK TO ZERO, because a spin has only finitely many levels and saturates.
//
// *** THE KEYS, ALL EXACT AND NONE FED TO THE MODEL:
//   1. THE BRILLOUIN FUNCTION B_J(y) = ((2J+1)/2J) coth((2J+1)y/2J) - (1/2J) coth(y/2J), the reduced magnetisation.
//      Spin-1/2 is exactly tanh(y); J -> infinity is the classical LANGEVIN function coth(y) - 1/y; small y is the
//      CURIE slope (J+1)/(3J) y; large y saturates at 1.
//   2. THE CURIE LAW: susceptibility chi = C/T with the Curie constant proportional to J(J+1)/3. High T -> 1/T,
//      the fingerprint of independent moments (ising's chi diverges at T_c instead; Curie is its T >> T_c limit).
//   3. THE SCHOTTKY ANOMALY of a two-level system, C/(Nk) = x^2 e^x/(e^x+1)^2 with x = gap/kT, peaking at
//      x* solving x tanh(x/2) = 2 (a transcendental, like blackbody's Wien peak, found by a Newton root AND an
//      independent maximiser), x* = 2.3994, C_max/(Nk) = 0.43923. It vanishes at BOTH ends.
//
// *** THE LOAD-BEARING NEGATIVE IS THE BOUNDED SPECTRUM: C -> 0 as T -> infinity, NOT the classical constant. A gas
// absorbs energy without limit (equipartition, C constant); a two-level system cannot -- once both levels are
// equally populated it is full, and no hotter bath extracts more heat. The same finiteness makes the entropy climb
// to exactly ln 2 (two states) and, unlike Sackur-Tetrode's classical gas, fall to 0 at T = 0: the third law, honoured.
//
// BROWSER-SAFE: no imports beyond Math; no node builtins, no DOM. Hyperbolics are written via Math.exp.

const cothE = (u) => { const e2 = Math.exp(2 * u); return (e2 + 1) / (e2 - 1); };      // coth u, via exp
const tanhE = (u) => { const e2 = Math.exp(2 * u); return (e2 - 1) / (e2 + 1); };      // tanh u, via exp

// The Brillouin function B_J(y). Small y is a difference of two diverging coths, so use the Curie slope there.
export function brillouin(J, y) {
    if (Math.abs(y) < 1e-4) return (J + 1) / (3 * J) * y;      // Curie limit, avoids the coth-coth cancellation
    const a = (2 * J + 1) / (2 * J), b = 1 / (2 * J);
    return a * cothE(a * y) - b * cothE(b * y);
}

// The classical (J -> infinity) limit: the Langevin function L(y) = coth(y) - 1/y.
export function langevinFunction(y) {
    if (Math.abs(y) < 1e-4) return y / 3;                      // small-y limit
    return cothE(y) - 1 / y;
}

// The Curie constant (dimensionless, per spin, gmu = 1, k = 1): C such that chi = C/T. C = J(J+1)/3.
export const curieConstant = (J) => J * (J + 1) / 3;
export const susceptibilityCurie = (J, T) => curieConstant(J) / T;   // high-T Curie law chi = C/T

// ---- The two-level (Schottky) system, gap = 1 in units of the gap; x = gap/kT. ----------------------------
export const schottkyC = (x) => (x * x * Math.exp(x)) / Math.pow(Math.exp(x) + 1, 2);   // C/(Nk)
export const twoLevelEnergy = (x) => 1 / (Math.exp(x) + 1);                              // U/(N*gap), upper-level pop
export const twoLevelEntropy = (x) => Math.log(1 + Math.exp(-x)) + x * Math.exp(-x) / (1 + Math.exp(-x)); // S/(Nk)

// The Schottky peak, route 1: Newton on the transcendental x tanh(x/2) = 2.
export function schottkyPeakNewton({ x0 = 2.4, iters = 60 } = {}) {
    let x = x0;
    for (let i = 0; i < iters; i++) {
        const th = tanhE(x / 2);
        const f = x * th - 2;
        const df = th + x * 0.5 * (1 - th * th);              // d/dx [x tanh(x/2)]
        const step = f / df;
        x -= step;
        if (Math.abs(step) < 1e-15) break;
    }
    return x;
}
// Route 2: golden-section maximiser of schottkyC itself (shares no code with the transcendental).
export function schottkyPeakMaximise({ lo = 0.5, hi = 6, iters = 200 } = {}) {
    const phi = (Math.sqrt(5) - 1) / 2;
    let a = lo, b = hi, c = b - phi * (b - a), d = a + phi * (b - a), fc = schottkyC(c), fd = schottkyC(d);
    for (let i = 0; i < iters; i++) {
        if (fc > fd) { b = d; d = c; fd = fc; c = b - phi * (b - a); fc = schottkyC(c); }
        else { a = c; c = d; fc = fd; d = a + phi * (b - a); fd = schottkyC(d); }
    }
    return 0.5 * (a + b);
}
export const schottkyResidual = (x) => x * tanhE(x / 2) - 2;   // 0 at the peak

// v3818 -- MEASURED by the gate, not trusted from this comment.
export const MEASURED_V3818 = {
    brillouin: "B_{1/2}(y) = tanh(y) exact; B_J -> Langevin coth(y)-1/y as J->inf; slope (J+1)/3J; saturates at 1",
    curie: "chi = C/T, C = J(J+1)/3 (per spin, gmu=k=1); high-T 1/T -- ising's T>>T_c limit",
    schottky: "C/(Nk) = x^2 e^x/(e^x+1)^2 peaks at x* solving x tanh(x/2)=2: x*=2.3994, C_max/(Nk)=0.43923",
    bounded: "C -> 0 as T -> infinity (not the classical constant); entropy -> ln 2 and -> 0 at T=0 (third law honoured)",
    note: "independent localised spins, k_B=1. No interactions (that is ising.js). The heat capacity that peaks.",
};
