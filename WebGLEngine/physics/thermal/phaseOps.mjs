// WebGLEngine/physics/thermal/phaseOps.mjs -- v3669
//
// *** THE PHASE-CHANGE ARITHMETIC A BROWSER CAN ACTUALLY IMPORT. NO IMPORTS AT ALL, NO MAIN BLOCK, NO DOM. ***
//
// THE DEFECT THIS FIXES IS STRUCTURAL AND IT IS THE THIRD INSTANCE OF ONE SHAPE. v3618-v3621 shipped four
// graded phase changes -- melt, freeze, vaporize, crystallize -- each with a module-level gate and a roundhouse
// device bind, and EVERY ONE OF THEM WAS UNREACHABLE FROM ANY PAGE. Not because nobody had drawn one: because
// stefan.mjs, freeze.mjs, vaporize.mjs and crystallize.mjs each `import { pathToFileURL } from "node:url"` AT
// MODULE SCOPE for their main-block guard, and a browser cannot resolve that specifier. THEY WERE
// STRUCTURALLY UNABLE TO HAVE A VISUAL DOOR. v3617 found exactly this in sirt/adjoint/matchedAdjoint/ambiguity
// and fixed it with reconOps.mjs; v3630 found it again in contactKeys.mjs and fixed it with reposeOps.mjs.
// THIS IS THE SAME FIX AND THE SAME FILE SHAPE, THIRD TIME.
//
// *** AND deviceInstrumentMap HAD BEEN REPORTING IT FOR FIFTY VERSIONS WITHOUT NAMING IT. *** Those four
// devices have sat in its `unexplained` list -- "either overlaps an instrument or is EXEMPT WITH A STATED
// REASON" -- since v3618, and the reconcile it prints carries `frontDoors: []` for each. The gate knew the
// pages were absent and could not know WHY, and the cheap answer available at any point was to write four
// exemptions. THAT WOULD HAVE BEEN WRONG: an exemption says "never meant to have a front door", and these four
// wanted one and could not have had one. AN EXEMPTION IS NOT A PLACE TO PUT A DEFECT.
//
// *** EVERYTHING HERE WAS **MOVED**, NOT COPIED, AND THE GATE ASSERTS THAT BY FUNCTION IDENTITY. *** The four
// modules now import these names and re-export them, so every existing caller, every gate and every
// hash-pinned reading still resolves to ONE DECLARATION. A COPY WOULD PASS A BEHAVIOUR TEST AND FAIL AN
// IDENTITY TEST, which is why the gate tests identity (stefan.lambdaFor === phaseOps.lambdaFor) and not
// agreement -- two copies of the same arithmetic agree right up until somebody edits one of them.
//
// WHAT DELIBERATELY STAYED BEHIND: each module's own reportLines() and its MEASURED_Vxxxx register. Those are
// the CLI reporting half and the round's recorded readings, they belong beside the main block that prints
// them, and reportLines is DECLARED FOUR TIMES ACROSS THE FOUR FILES -- moving them here would have forced
// four renames and broken the reportingTools rows that run each file by path. The seam is the arithmetic, not
// the report.
//
// SCOPE, STATED: this file makes the physics REACHABLE. It does not make it right -- every key here was
// graded at v3618-v3621 by the four gates that still own it, and those gates are re-run against this file
// rather than trusted to have been unaffected.

// --------------------------------------------------------------------------------------------------------
// MELTING -- the one-phase Stefan problem (v3618). Moved from physics/thermal/stefan.mjs.
// --------------------------------------------------------------------------------------------------------

export const MATERIALS = {
    ice:      { name: "ice / water",  rho: 917,  c: 2100, k: 2.22, Tm: 273.15, L: 334000 },
    aluminum: { name: "aluminium",    rho: 2700, c: 900,  k: 237,  Tm: 933.47, L: 397000 },
    iron:     { name: "iron",         rho: 7874, c: 449,  k: 80.4, Tm: 1811,   L: 247000 },
    lead:     { name: "lead",         rho: 11340, c: 129, k: 35.3, Tm: 600.61, L: 23200 },
    paraffin: { name: "paraffin wax", rho: 900,  c: 2100, k: 0.25, Tm: 330,    L: 210000 },
};
export const alphaOf = (m) => m.k / (m.rho * m.c);
export const stefanNumber = (m, Twall) => m.c * (Twall - m.Tm) / m.L;

// --- erf, two ways, so neither is a restatement of the other -------------------------------------------------------

export function erfSeries(x) {
    let t = x, s = x, n = 0;
    while (Math.abs(t) > 1e-18 && n < 200) { n++; t *= -x * x / n; s += t / (2 * n + 1); }
    return 2 / Math.sqrt(Math.PI) * s;
}
export function erfQuad(x, n = 20000) {
    const h = x / n; let s = 0;
    for (let i = 0; i <= n; i++) { const u = i * h, f = Math.exp(-u * u); s += (i === 0 || i === n ? 1 : (i % 2 ? 4 : 2)) * f; }
    return 2 / Math.sqrt(Math.PI) * s * h / 3;
}

/** THE TRANSCENDENTAL, AND ITS RESIDUAL IS REPORTED so "solved" is a measurement. */
export const stefanEq = (lambda, St) => lambda * Math.exp(lambda * lambda) * erfSeries(lambda) - St / Math.sqrt(Math.PI);
export function lambdaFor(St, { iters = 200 } = {}) {
    let lo = 1e-9, hi = 10;
    for (let i = 0; i < iters; i++) { const m = 0.5 * (lo + hi); if (stefanEq(m, St) > 0) hi = m; else lo = m; }
    const lambda = 0.5 * (lo + hi);
    return { lambda, residual: Math.abs(stefanEq(lambda, St)) };
}

/** THE EXACT FRONT. Nothing here knows about a grid. */
export const stefanFront = (St, alpha, t) => 2 * lambdaFor(St).lambda * Math.sqrt(alpha * t);

// --- the solvers: one that carries enthalpy, and one that does not ---------------------------------------------------

/**
 * ENTHALPY METHOD. H is enthalpy per unit volume measured from "solid at Tm", so H = 0 is solid at the melting
 * point and H = rho*L is fully liquid at it. THE STALL FALLS OUT OF THIS DEFINITION rather than being written.
 * Dimensionless by default (rho = c = k = 1, Tm = 0, Tw = 1) so the Stefan number is set by L alone.
 */
export function meltEnthalpy(L, { n = 800, len = 4, tEnd = 1, cfl = 0.25, Tw = 1, naive = false } = {}) {
    const dx = len / n, alpha = 1, dt = cfl * dx * dx / alpha, steps = Math.round(tEnd / dt);
    const H = new Float64Array(n);
    const Tof = (h) => (h < 0 ? h : (h <= L ? 0 : h - L));
    // THE NEGATIVE CONTROL: temperature as the state, flipped to liquid on crossing Tm. It absorbs no latent
    // heat at all, which is exactly the defect the enthalpy method exists to avoid.
    const T2 = new Float64Array(n);
    let wallFlux = 0;
    for (let s = 0; s < steps; s++) {
        if (naive) {
            const nT = Float64Array.from(T2);
            for (let i = 0; i < n; i++) {
                const Tl = i === 0 ? Tw : T2[i - 1], Tr = i === n - 1 ? T2[i] : T2[i + 1];
                nT[i] += dt * (Tl - 2 * T2[i] + Tr) / (dx * dx);
            }
            T2.set(nT);
        } else {
            const T = Array.from(H, Tof), nH = Float64Array.from(H);
            for (let i = 0; i < n; i++) {
                const Tl = i === 0 ? Tw : T[i - 1], Tr = i === n - 1 ? T[i] : T[i + 1];
                nH[i] += dt * (Tl - 2 * T[i] + Tr) / (dx * dx);
            }
            wallFlux += dt * (Tw - T[0]) / dx;
            H.set(nH);
        }
    }
    const field = naive ? T2 : H;
    const liquid = naive ? (v) => v > 0 : (v) => v > L;
    let idx = 0; while (idx < n && liquid(field[idx])) idx++;
    // *** front === null MEANS THERE IS NO INTERFACE, WHICH IS NOT THE SAME AS AN INTERFACE AT ZERO. My first
    // version returned 0 for both and the gate read it as "the naive solver melted nothing" when what actually
    // happens is that it melts EVERYTHING -- 400 of 400 cells above Tm, because with no latent heat nothing
    // absorbs energy at the interface and there is no boundary to hold in place. A zero meaning two things is
    // this tree's most repeated defect, committed in my own return value. ***
    const moltenFraction = idx / n;
    let front = null;
    if (idx > 0 && idx < n) {
        const a = field[idx - 1], b = field[idx], thr = naive ? 0 : L;
        const frac = (a - thr) / ((a - b) || 1);
        front = (idx - 1 + 0.5 + Math.max(0, Math.min(1, frac))) * dx;
    }
    let total = 0; for (const v of field) total += v * dx;
    return { front, moltenFraction, total, wallFlux, dx, dt, steps, n };
}

/** THE STALL, ASKED DIRECTLY: a cell in the mushy range must read EXACTLY Tm, whatever its enthalpy. */
export function stallCheck(L, samples = 9) {
    const Tof = (h) => (h < 0 ? h : (h <= L ? 0 : h - L));
    const out = [];
    for (let i = 0; i <= samples; i++) { const h = L * i / samples; out.push({ h, T: Tof(h) }); }
    return out;
}

/** Refinement: the ERROR RATIO under doubling is the claim, not any single error. */
export function refinement(L = 1, counts = [200, 400, 800, 1600], { tEnd = 1 } = {}) {
    const exact = stefanFront(1 / L, 1, tEnd);
    const rows = counts.map((n) => {
        const r = meltEnthalpy(L, { n, tEnd });
        return { n, front: r.front, relErr: Math.abs(r.front - exact) / exact };
    });
    for (let i = 1; i < rows.length; i++) rows[i].ratio = rows[i - 1].relErr / rows[i].relErr;
    return { exact, rows };
}

// --------------------------------------------------------------------------------------------------------
// FREEZING -- the same equation about different substances (v3619). Moved from physics/thermal/freeze.mjs.
// --------------------------------------------------------------------------------------------------------

export const LIQUIDS = {
    ice: { name: "liquid water", rho: 1000, c: 4186, k: 0.6 },
    aluminum: { name: "molten aluminium", rho: 2375, c: 1180, k: 91 },
    iron: { name: "molten iron", rho: 7020, c: 820, k: 40 },
    lead: { name: "molten lead", rho: 10660, c: 148, k: 16 },
};
export const pairFor = (key) => ({ solid: MATERIALS[key], liquid: LIQUIDS[key], L: MATERIALS[key].L, Tm: MATERIALS[key].Tm });
export const alpha = (m) => m.k / (m.rho * m.c);

/** The one-phase closed form on whichever side is doing the work. Melting rides the LIQUID, freezing the SOLID. */
export function frontExact({ solid, liquid, L, dT, t, freeze }) {
    const driver = freeze ? solid : liquid;
    const St = driver.c * dT / L;
    const { lambda, residual } = lambdaFor(St);
    return { St, lambda, residual, alpha: alpha(driver), front: 2 * lambda * Math.sqrt(alpha(driver) * t) };
}

/** THE DECOMPOSITION -- the ratio is two competing factors and neither alone predicts it. */
export function ratioParts({ solid, liquid, L, dT, t }) {
    const m = frontExact({ solid, liquid, L, dT, t, freeze: false });
    const f = frontExact({ solid, liquid, L, dT, t, freeze: true });
    const diffusivity = Math.sqrt(alpha(solid) / alpha(liquid));
    const lambdaPart = f.lambda / m.lambda;
    return { melt: m, freeze: f, diffusivity, lambdaPart, product: diffusivity * lambdaPart, ratio: f.front / m.front };
}

/**
 * TWO-PHASE ENTHALPY SOLVER. H is per unit volume from SOLID AT Tm; the conductivity is the cell's PHASE
 * conductivity and faces take the HARMONIC MEAN, which is what a jump in k requires. `freeze` starts the
 * domain LIQUID at Tm with a wall below it; melting starts SOLID with a wall above.
 */
export function twoPhase({ solid, liquid, L, Tm, dT, freeze, n = 400, len, tEnd, cfl = 0.2 }) {
    const rhoL = solid.rho * L, dx = len / n;
    const Tof = (h) => (h < 0 ? Tm + h / (solid.rho * solid.c) : (h <= rhoL ? Tm : Tm + (h - rhoL) / (liquid.rho * liquid.c)));
    const kOf = (h) => (h < 0 ? solid.k : (h <= rhoL ? 0.5 * (solid.k + liquid.k) : liquid.k));
    const H = new Float64Array(n).fill(freeze ? rhoL : 0);
    const Tw = Tm + (freeze ? -dT : dT);
    const dt = cfl * dx * dx / Math.max(alpha(solid), alpha(liquid));
    const steps = Math.round(tEnd / dt);
    for (let s = 0; s < steps; s++) {
        const T = Array.from(H, Tof), K = Array.from(H, kOf), nH = Float64Array.from(H);
        for (let i = 0; i < n; i++) {
            const kL = i === 0 ? K[0] : 2 * K[i] * K[i - 1] / (K[i] + K[i - 1]);
            const kR = i === n - 1 ? K[i] : 2 * K[i] * K[i + 1] / (K[i] + K[i + 1]);
            const TL = i === 0 ? Tw : T[i - 1], TR = i === n - 1 ? T[i] : T[i + 1];
            nH[i] += dt * (kL * (TL - T[i]) + kR * (TR - T[i])) / (dx * dx);
        }
        H.set(nH);
    }
    let idx = 0;
    if (freeze) { while (idx < n && H[idx] < 0) idx++; } else { while (idx < n && H[idx] > rhoL) idx++; }
    // front === null MEANS NO INTERFACE, never an interface at zero -- v3618's own lesson, kept.
    const transformedFraction = idx / n;
    // H IS RETURNED because the front alone is a CELL INDEX and therefore quantised: two runs that genuinely
    // differ can land on the same cell and read "identical". A sabotage that nudged the freeze timestep by 3%
    // passed the front-based control for exactly that reason. THE FIELD IS WHAT THE CONTROL MUST COMPARE.
    return { front: idx > 0 && idx < n ? idx * dx : null, transformedFraction, steps, dx, n, H, rhoL };
}

/**
 * REVERSIBILITY: H -> T -> H must be the identity. THE POINT IS THAT THE MAP HAS AN INVERSE ONLY BECAUSE H IS
 * THE STATE -- a solver tracking T with a separate phase flag has no way back through the mushy range, where
 * every enthalpy shares one temperature.
 */
export function reversibility({ solid, liquid, L, Tm }, samples = 40, q = 1e4) {
    const rhoL = solid.rho * L;
    const Tof = (h) => (h < 0 ? Tm + h / (solid.rho * solid.c) : (h <= rhoL ? Tm : Tm + (h - rhoL) / (liquid.rho * liquid.c)));
    const Hof = (T, phase) => (phase === "solid" ? (T - Tm) * solid.rho * solid.c : rhoL + (T - Tm) * liquid.rho * liquid.c);
    // (a) THE REAL CLAIM: add heat, remove the same heat, land back EXACTLY. This holds EVERYWHERE, mushy
    //     range included, because H IS THE STATE and the update is additive on it.
    let addRemove = 0;
    for (let i = 0; i <= samples; i++) {
        const h = -rhoL * 0.5 + (2 * rhoL) * i / samples;
        const back = (h + q) - q;
        addRemove = Math.max(addRemove, Math.abs(back - h));
    }
    // (b) H -> T -> H IS A DIFFERENT QUESTION AND MY FIRST VERSION CONFLATED THEM. It read 3.063e+8 because I
    //     excluded the mushy range with STRICT inequalities, and the ENDPOINTS ARE MUSHY TOO: H = 0 is solid
    //     AT Tm and H = rho*L is liquid AT Tm, so both map to Tm and neither can be recovered. v3618's own
    //     stallCheck says exactly that and I did not carry it across. THE NON-INVERTIBLE SET IS CLOSED, NOT
    //     OPEN -- which is itself the point: a solver tracking T with a phase flag has no way back through
    //     [0, rho*L], where every enthalpy shares one temperature.
    let roundTrip = 0, mushy = 0;
    for (let i = 0; i <= samples; i++) {
        const h = -rhoL * 0.5 + (2 * rhoL) * i / samples;
        if (h >= 0 && h <= rhoL) { mushy++; continue; }
        const back = Hof(Tof(h), h < 0 ? "solid" : "liquid");
        roundTrip = Math.max(roundTrip, Math.abs(back - h) / Math.abs(h));
    }
    return { addRemove, roundTrip, mushySamples: mushy, samples: samples + 1, rhoL };
}

// --------------------------------------------------------------------------------------------------------
// GASIFICATION -- mass, volume, density: pick two (v3620). Moved from physics/thermal/vaporize.mjs.
// --------------------------------------------------------------------------------------------------------

export const R_GAS = 8.314462618;

/** Water, ordinary reference figures. Molar mass kg/mol, latent heat J/mol at the anchor. */
export const WATER = {
    name: "water", M: 0.018015, Tboil: 373.15, Pboil: 101325, Lmol: 2.257e6 * 0.018015,
    Tcrit: 647.096, Pcrit: 22.064e6, rhoCrit: 322.0,
};

/** EXTERNAL ANCHORS -- ordinary steam-table vapour pressures. NOTHING HERE COMES FROM OUR GRID. */
export const VAPOUR_PRESSURE = [
    { T: 273.16, P: 611.657 }, { T: 293.15, P: 2339 }, { T: 323.15, P: 12344 },
    { T: 373.15, P: 101325 }, { T: 423.15, P: 476000 }, { T: 473.15, P: 1555000 },
];

/** EXTERNAL ANCHORS -- saturated densities along the coexistence curve, kg/m3. */
export const SATURATION = [
    { T: 373.15, liq: 958.0, vap: 0.5977 }, { T: 423.15, liq: 917.0, vap: 2.548 },
    { T: 473.15, liq: 864.7, vap: 7.862 }, { T: 523.15, liq: 798.9, vap: 19.96 },
    { T: 573.15, liq: 712.1, vap: 46.19 }, { T: 603.15, liq: 649.4, vap: 78.5 },
    { T: 623.15, liq: 574.7, vap: 113.6 }, { T: 643.15, liq: 402.4, vap: 242.7 },
    { T: 647.096, liq: 322.0, vap: 322.0 },
];

/** Clausius-Clapeyron with L held constant -- exact at the anchor, approximate away from it BY CONSTRUCTION. */
export function satPressure(T, { T0 = WATER.Tboil, P0 = WATER.Pboil, L = WATER.Lmol } = {}) {
    return P0 * Math.exp(-(L / R_GAS) * (1 / T - 1 / T0));
}

/** How far the key is from the external anchors, reported per point rather than as one worst number. */
export function keyAccuracy(opts) {
    return VAPOUR_PRESSURE.map(({ T, P }) => {
        const cc = satPressure(T, opts);
        return { T, known: P, cc, rel: Math.abs(cc - P) / P };
    });
}

/** Ideal-gas expansion ratio: molar volume of vapour over molar volume of the condensed phase. */
export function expansionRatio({ T, P, rhoLiquid, M = WATER.M }) {
    return (R_GAS * T / P) / (M / rhoLiquid);
}

/** The ratio taken from MEASURED saturated densities instead -- no ideal-gas assumption at all. */
export const densityRatio = (row) => row.liq / row.vap;

/**
 * THE TRILEMMA. One liquid voxel of unit volume, three ways to draw what it becomes, and r decides every
 * penalty. Returns the error IN EACH QUANTITY so nobody has to take the sentence on trust.
 */
export function representationChoices(r) {
    return {
        r,
        inPlaceAsGas: { voxels: 1, massFactor: 1 / r, volumeFactor: 1, densityFactor: 1, wrong: "mass" },
        expanded: { voxels: r, massFactor: 1, volumeFactor: 1, densityFactor: 1, wrong: "voxel budget" },
        inPlaceDense: { voxels: 1, massFactor: 1, volumeFactor: 1 / r, densityFactor: r, wrong: "density" },
        // EXACTLY ONE PENALTY EACH, AND ALL THREE ARE r. There is no fourth scheme hiding here.
        penalties: [r, r, r],
    };
}

/** Voxels needed to hold one liquid voxel's mass at the correct gas density, and the cube root of that. */
export const voxelCost = (r) => ({ voxels: r, side: Math.cbrt(r) });

// --------------------------------------------------------------------------------------------------------
// CRYSTALLISATION -- the Avrami exponent is geometry (v3621). Moved from physics/thermal/crystallize.mjs.
// --------------------------------------------------------------------------------------------------------

export const AVRAMI = {
    "3d-site-saturated": { n: 3, why: "three growth dimensions, every nucleus present at t=0" },
    "3d-continuous": { n: 4, why: "three growth dimensions plus one for the nucleation rate integrated over time" },
    "2d-site-saturated": { n: 2, why: "two growth dimensions, site-saturated" },
    "2d-continuous": { n: 3, why: "two growth dimensions plus the nucleation rate" },
};
export const MODE_GAP = AVRAMI["3d-continuous"].n - AVRAMI["3d-site-saturated"].n;

/** Deterministic per-seed stream, so a "seed spread" is a spread over seeds and not over runs. */
function mulberry(a) {
    return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

/**
 * THE TRANSFORMATION TIME OF EVERY CELL. A cell belongs to whichever grain reaches it first, so impingement is
 * the MINIMUM and never an assumption. Distances are minimum-image periodic: without that, cells near a face
 * are starved of nuclei and transform late for a reason that is geometry rather than kinetics.
 */
export function transformTimes({ L = 32, nNuclei = 30, seed = 1, continuous = false, tMax = 20, periodic = true }) {
    const rnd = mulberry(seed), N = L * L * L, T = new Float64Array(N);
    const xs = [], ys = [], zs = [], ts = [];
    for (let i = 0; i < nNuclei; i++) {
        xs.push(rnd() * L); ys.push(rnd() * L); zs.push(rnd() * L);
        ts.push(continuous ? rnd() * tMax : 0);
    }
    for (let z = 0; z < L; z++) for (let y = 0; y < L; y++) for (let x = 0; x < L; x++) {
        let best = Infinity;
        for (let i = 0; i < nNuclei; i++) {
            // v3721 -- `periodic` is the PLANTED knob: dropping minimum-image wrapping is the slip this
            // function's own header warns about, and crystallizeBind measures what it costs.
            let dx = Math.abs(x - xs[i]); if (periodic && dx > L / 2) dx = L - dx;
            let dy = Math.abs(y - ys[i]); if (periodic && dy > L / 2) dy = L - dy;
            let dz = Math.abs(z - zs[i]); if (periodic && dz > L / 2) dz = L - dz;
            const t = ts[i] + Math.sqrt(dx * dx + dy * dy + dz * dz);   // unit growth velocity
            if (t < best) best = t;
        }
        T[(z * L + y) * L + x] = best;
    }
    return T;
}

/**
 * Fit n from the transformed fraction. THE FIT WINDOW IS DELIBERATELY NOT [0,1]: below a few percent the
 * lattice has transformed a handful of cells and the log of a quantised fraction is noise, and above ~0.9 the
 * remaining untransformed pockets are single cells. Both ends are LATTICE artefacts rather than kinetics, so
 * the window is stated rather than tuned until n came out right.
 */
export function fitExponent(T, { lo = 0.05, hi = 0.85, step = 0.02 } = {}) {
    const N = T.length, sorted = Float64Array.from(T).sort();
    const pts = [];
    for (let f = lo; f <= hi + 1e-12; f += step) {
        const t = sorted[Math.min(N - 1, Math.floor(f * N))];
        if (t > 0 && Number.isFinite(t)) pts.push([Math.log(t), Math.log(-Math.log(1 - f))]);
    }
    const n = pts.length;
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (const [x, y] of pts) { sx += x; sy += y; sxx += x * x; sxy += x * y; }
    return { slope: (n * sxy - sx * sy) / (n * sxx - sx * sx), points: n };
}

/** THE SEED ENSEMBLE. This is the function the round exists for -- one seed is never the answer. */
export function seedEnsemble({ seeds = [1, 2, 3, 4, 5, 6], ...opts }) {
    const ns = seeds.map((seed) => fitExponent(transformTimes({ ...opts, seed })).slope);
    const mean = ns.reduce((a, b) => a + b, 0) / ns.length;
    const sd = Math.sqrt(ns.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, ns.length - 1));
    return { ns, mean, sd, min: Math.min(...ns), max: Math.max(...ns), seeds: seeds.length };
}

/**
 * THE CLAIM, STATED AGAINST THE NOISE. Returns the ratio of the effect to the spread, and the ACTUAL margin
 * between the two populations -- which is the tighter and more honest of the two.
 */
export function discriminationPower(opts = {}) {
    const sat = seedEnsemble({ ...opts, continuous: false });
    const con = seedEnsemble({ ...opts, continuous: true });
    return {
        saturated: sat, continuous: con, gap: MODE_GAP,
        effectOverNoise: MODE_GAP / Math.max(sat.sd, con.sd),
        populationMargin: con.min - sat.max,
        separated: con.min > sat.max,
        satErr: Math.abs(sat.mean - AVRAMI["3d-site-saturated"].n),
        conErr: Math.abs(con.mean - AVRAMI["3d-continuous"].n),
    };
}
