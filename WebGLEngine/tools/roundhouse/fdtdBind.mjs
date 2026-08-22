// tools/roundhouse/fdtdBind.mjs
//
// v3318 -- roundhouse device: MAXWELL ON A GRID (simulation/em/fdtd1d.js), and the only solver in this engine
// that can be told in advance EXACTLY HOW WRONG IT WILL BE.
//
// The solver has existed since v2487, is exercised by tools/ship/physicsSuite.mjs, and was never bound. Its
// neighbour in the same directory (born.js) has been a device since v2818. Electromagnetism was absent from all
// thirteen instrument areas while the physics sat there, written and passing.
//
// WHY THIS IS THE BEST ANSWER KEY IN THE LAB, and it is not close. Every other device asks "does the simulation
// match the right answer". FDTD's error is not a mystery to be measured -- it is a CLOSED FORM that can be
// written down before the code runs. Discretising Maxwell gives waves that travel slightly slow, by
//
//     omega = (2/dt) asin(S sin(k dx / 2)),   S = c dt / dx
//
// so the numerical phase velocity is a formula. The claim graded here is not "the answer is right" but "THE
// ANSWER IS WRONG BY EXACTLY THIS MUCH, and here is the arithmetic that says so". If the grid and the formula
// agree on the error, the model of the model is correct.
//
// AND THE MAGIC STEP IS THE COUNTERINTUITIVE HALF. At S = 1 exactly, asin(sin(x)) = x and the dispersion
// collapses to omega = c k: NO ERROR AT ALL, at every frequency, forever. Taking a SMALLER timestep "to be safe"
// makes it WORSE, which is the opposite of every instinct about numerical methods. A device that measures a
// monotone improvement as the step shrinks would be measuring something else.
//
// Modes:
//   "dispersion" -- predicted vs measured phase velocity at a chosen S and points-per-wavelength. The formula is
//                   the reference; the grid is the measurement.
//   "magic"      -- S = 1 against S = 0.9 and S = 0.5. The error must be ZERO at the magic step and GROW as the
//                   step shrinks. This is the mode that would catch a "safer smaller dt" regression.
//   "lightspeed" -- time of flight between two probes, in absolute units. THE ONE CHECK C0 CANNOT CANCEL OUT OF:
//                   v2496's mutation sweep changed the speed of light by 3% and every FDTD check stayed green,
//                   because vp/c and reflection coefficients are ratios. This mode exists because of that hole.
//   "dielectric" -- v3734. A wave inside epsR must travel at c/sqrt(epsR), which is an EXACT external answer.
//   "indexconfusion" -- v3734, THE DECLARED PLANT. See below.
//
// *** v3734 -- AND THE ROUND THAT ADDED THOSE OPENED BY CORRECTING A CLAIM I HAD MADE ONE ROUND EARLIER. ***
// v3733's notes announced, from two plant rounds, that "a device that grades SHAPE cannot see SCALE" as though
// it were new. IT IS WRITTEN IN THIS FILE'S OWN HEADER, AT v3318, FROM v2496: a mutation sweep moved the speed
// of light by 3% and every FDTD check stayed green because vp/c and reflection coefficients are RATIOS, and
// `lightspeed` was built precisely to close that. THE TREE KNEW. What was true is narrower and duller: the
// lesson had not propagated to ct or eccentric, and two plant rounds rediscovered it because nothing carried
// it across. A TALLY REPEATED FROM MEMORY RECRUITS NEIGHBOURING CASES, and "I found a pattern" is the most
// flattering form that takes. THE DENOMINATOR IS: two devices I happened to plant, out of 86.
//
// *** THE PLANT THIS ROUND DOES ADD IS A DIFFERENT HOLE, AND IT IS THE ONE v3730 NAMED: A KEY EVALUATED ONLY
// WHERE ITS PARAMETER IS ONE IS BLIND TO EVERY TERM THAT PARAMETER MULTIPLIES. *** The Yee update sets
// cE[i] = S / epsR[i], and the mistake the API invites is `S / Math.sqrt(epsR[i])` -- confusing PERMITTIVITY
// with REFRACTIVE INDEX, which are related by n = sqrt(epsR) and are one square root apart in exactly the
// place a reader expects to see one. It makes the wave speed c/epsR^(1/4) instead of c/sqrt(epsR): at
// epsR = 4 that is 0.7071 c where the truth is 0.5 c, A 41% ERROR. AND ALL THREE ORIGINAL MODES RUN IN VACUUM,
// where sqrt(1) = 1 and the two spellings are THE SAME LINE. Measured: the plant leaves dispersion, magic and
// lightspeed bit-identical.
//
// MEASURED HONEST: v/c reads 1.000000 / 0.706714 / 0.498753 / 0.331950 at epsR = 1 / 2 / 4 / 9 against an exact
// 1 / 0.707107 / 0.500000 / 0.333333 -- relative error 0.0e+0 / 5.6e-4 / 2.5e-3 / 4.2e-3. *** THE RESIDUE
// GROWS WITH epsR AND THAT IS PREDICTED BY THIS FILE'S OWN HEADER, NOT SLACK: inside the slab the effective
// Courant number is S/sqrt(epsR), so a run launched at the magic step S = 1 IS NO LONGER AT IT once the wave
// crosses in, and the numerical dispersion the magic step suppresses comes back. The bar is 1e-2, above the
// worst honest reading, and the growth is asserted rather than averaged away. ***

import { createFdtd1d, numericalPhaseVelocity, C0 } from "../../simulation/em/fdtd1d.js";

const FDTD_OBSERVABLES = [
    "S", "pointsPerWavelength", "vpPredicted", "vpMeasured", "vpErrAbs",
    "magicErr", "offMagicErr", "errorGrowsAsStepShrinks",
    "cMeasured", "cExact", "cErrFrac", "steps",
    // v3734 -- THE DIELECTRIC PATH. `eps` has been a parameter of createFdtd1d since v2487 and NO device mode
    // ever passed it, so every key above ran at epsR = 1 -- where the plant below is invisible BY CONSTRUCTION.
    "epsR", "indexMeasured", "indexExact", "indexErrFrac", "vpInSlab",
];

const num = (v, d) => (Number.isFinite(+v) ? +v : d);

export function fdtdDefaults(hyp = {}) {
    const h = { ...(hyp || {}) };
    const c = { ...(h.config || {}) };
    c.S = Math.min(1.0, Math.max(0.1, num(c.S, 0.9)));            // S > 1 is unstable; the device will not offer it
    c.pointsPerWavelength = Math.max(4, Math.min(64, num(c.pointsPerWavelength, 12) | 0));
    c.n = Math.max(200, Math.min(4000, num(c.n, 1200) | 0));
    c.steps = Math.max(400, Math.min(8000, num(c.steps, 2600) | 0));
    h.config = c;
    if (!["dispersion", "magic", "lightspeed", "dielectric", "indexconfusion"].includes(h.mode)) h.mode = "dispersion";
    return h;
}

/**
 * Measure vp/c off the grid: drive one end at a fixed period, then read the SPACING OF ZERO CROSSINGS in the
 * settled interior. Wavelength in cells divided by points-per-wavelength is vp/c directly, with no reference to
 * c anywhere -- which is exactly why the lightspeed mode has to exist separately.
 */
// *** THE RUN MUST STOP BEFORE THE REFLECTION COMES BACK, AND THAT IS AN S-DEPENDENT LIMIT. ***
// fdtd1d's absorbing ends are exact ONLY at S = 1, where the wave moves exactly one cell per step so copying the
// neighbour IS the outgoing wave. Off-magic they leak, and the leaked reflection re-enters the measurement
// window and corrupts the zero-crossing spacing. A fixed 2600 steps measured vp/c = 1.000628 at S = 0.7 --
// FASTER THAN LIGHT ON THE GRID, which FDTD cannot do and which is therefore a measurement artefact rather than
// a physics result. The one-signed error check caught it: a predicted vp/c is always <= 1, so anything above is
// the apparatus.
//
// The window is n/4 to 3n/4, so the wave must reach 3n/4 (fill it) and the reflection must not get back there
// before we look. Travelling S cells per step, both conditions hold at S*steps ~ 1.15n.
function stepsFor(S, n, requested) {
    const safe = Math.floor(1.15 * n / S);
    return Math.max(400, Math.min(requested, safe));
}

function measureVp(S, ppw, n, steps) {
    steps = stepsFor(S, n, steps);
    const f = createFdtd1d({ n, S });
    const period = ppw / S;
    for (let k = 0; k < steps; k++) f.step((t) => Math.sin(2 * Math.PI * t / period));
    const cross = [];
    const lo = Math.floor(n * 0.25), hi = Math.floor(n * 0.75);
    for (let i = lo; i < hi; i++) if (f.Ez[i] <= 0 && f.Ez[i + 1] > 0)
        cross.push(i + (-f.Ez[i] / (f.Ez[i + 1] - f.Ez[i])));
    if (cross.length < 3) return null;
    let sum = 0;
    for (let i = 1; i < cross.length; i++) sum += cross[i] - cross[i - 1];
    return (sum / (cross.length - 1)) / ppw;
}

export async function buildFdtd(hyp, base = {}) {
    const h = fdtdDefaults({ ...hyp, config: { ...(hyp && hyp.config), ...base } });
    const c = h.config;

    if (h.mode === "dispersion") {
        const vpMeasured = measureVp(c.S, c.pointsPerWavelength, c.n, c.steps);
        if (vpMeasured === null) return { error: "no-wave-in-window" };
        const vpPredicted = numericalPhaseVelocity(c.S, c.pointsPerWavelength);
        // v3734 -- the PRIMARY mode reports the dielectric key too. plantedCoverage's mode sweep builds the
        // plant against the FIRST OTHER MODE and needs the declared observable to move THERE; an observable
        // living only in the plant's branch reads DECLARED BUT DEAD. v3732 and v3733 both learned that the
        // hard way, in that order, and this is the first round that applied it BEFORE the sweep said so.
        const slab = slabFlight({ epsR: 4 });
        return {
            S: c.S, pointsPerWavelength: c.pointsPerWavelength,
            vpPredicted, vpMeasured, vpErrAbs: Math.abs(vpPredicted - vpMeasured), steps: c.steps,
            epsR: 4, vpInSlab: slab ? slab.vpInSlab : NaN,
            indexMeasured: slab ? slab.indexMeasured : NaN, indexExact: Math.sqrt(4),
            indexErrFrac: slab ? Math.abs(slab.indexMeasured - 2) / 2 : Infinity,
        };
    }

    if (h.mode === "dielectric" || h.mode === "indexconfusion") {
        const epsR = 4;
        const f = slabFlight({ epsR, bendIndex: h.mode === "indexconfusion" });
        if (!f) return { error: "pulse-did-not-reach-both-probes" };
        const indexExact = Math.sqrt(epsR);                  // n = sqrt(epsR). EXACT, and in neither file.
        return {
            epsR, vpInSlab: f.vpInSlab,
            indexMeasured: f.indexMeasured, indexExact,
            indexErrFrac: Math.abs(f.indexMeasured - indexExact) / indexExact,
            steps: 3000,
        };
    }

    if (h.mode === "magic") {
        // THE ORDER IS THE POINT: a smaller step is WORSE, not better.
        const at = (S) => {
            const m = measureVp(S, c.pointsPerWavelength, c.n, c.steps);
            return m === null ? null : Math.abs(1 - m);      // distance from the exact answer, vp/c = 1
        };
        const magicErr = at(1.0), mid = at(0.9), small = at(0.5);
        if (magicErr === null || mid === null || small === null) return { error: "no-wave-in-window" };
        return {
            S: 1.0, pointsPerWavelength: c.pointsPerWavelength,
            magicErr, offMagicErr: small,
            // measured, not asserted: shrinking the step from 1.0 to 0.9 to 0.5 must move the error UP
            errorGrowsAsStepShrinks: magicErr <= mid && mid <= small,
            steps: c.steps,
        };
    }

    // "lightspeed" -- absolute, and the only mode C0 cannot cancel out of.
    {
        const dx = 1e-3, n = Math.max(700, c.n);
        const f = createFdtd1d({ n, dx, S: 1.0 });
        const a = Math.floor(n * 0.30), b = Math.floor(n * 0.70);
        const THRESH = 1e-6;
        let tA = null, tB = null, k = 0;
        const dt = 1.0 * dx / C0;
        for (; k < c.steps * 2 && tB === null; k++) {
            f.step((t) => (t < 30 ? Math.exp(-((t - 12) ** 2) / 18) : 0));
            if (tA === null && Math.abs(f.Ez[a]) > THRESH) tA = k;
            if (tA !== null && tB === null && Math.abs(f.Ez[b]) > THRESH) tB = k;
        }
        if (tA === null || tB === null) return { error: "pulse-did-not-reach-both-probes" };
        const cMeasured = ((b - a) * dx) / ((tB - tA) * dt);
        // *** THE REFERENCE IS A LITERAL AND MUST NEVER BE THE IMPORTED CONSTANT. ***
        // dt is computed AS S*dx/C0, so cMeasured = dx/dt = C0/S: the module's own value comes straight back
        // out. Comparing that to the imported C0 gives exactly zero for ANY value of C0, including a wrong one --
        // which is precisely the hole v2496's mutation sweep found, where changing the speed of light by 3% left
        // every FDTD check green because they were all ratios. The first version of this mode reproduced that
        // hole verbatim and scored a perfect 0.0 while measuring nothing.
        //
        // 299792458 m/s is exact BY DEFINITION OF THE METRE. It is a fact about the SI system, not about this
        // repository, so it belongs here as a literal that no mutation of the module can reach.
        const C_SI = 299792458;
        return {
            cMeasured, cExact: C_SI, cErrFrac: Math.abs(cMeasured - C_SI) / C_SI,
            S: 1.0, steps: k,
        };
    }
}

/**
 * v3734 -- time of flight through a DIELECTRIC SLAB, in cells the wave crosses entirely inside epsR.
 * EXPORTED so a gate drives the same measurement rather than a second spelling of it.
 * `bendIndex` is THE PLANT: cE = S/sqrt(epsR) instead of S/epsR, the permittivity-versus-index confusion.
 * It is applied HERE, by handing the solver a doctored eps array, so the graded module is untouched --
 * v3725's rule, a plant on the SETUP and not on the READBACK. Feeding eps^2 makes the shipped S/epsR read
 * S/epsR^2... so the plant instead feeds sqrt(eps), which makes S/sqrt(epsR) EXACTLY the wrong spelling.
 */
export function slabFlight({ epsR = 4, n = 1200, dx = 1e-3, S = 1, steps = 3000, iA = 500, iB = 900, bendIndex = false } = {}) {
    const eps = new Float64Array(n).fill(1);
    const inside = bendIndex ? Math.sqrt(epsR) : epsR;      // the solver divides by this
    for (let i = 400; i < n; i++) eps[i] = inside;
    const g = createFdtd1d({ n, dx, S, eps });
    const src = (t) => Math.exp(-((t - 40) ** 2) / (2 * 12 * 12));
    let tA = null, tB = null, pkA = 0, pkB = 0;
    for (let k = 0; k < steps; k++) {
        g.step(src);
        if (Math.abs(g.Ez[iA]) > pkA) { pkA = Math.abs(g.Ez[iA]); tA = g.t; }
        if (Math.abs(g.Ez[iB]) > pkB) { pkB = Math.abs(g.Ez[iB]); tB = g.t; }
    }
    if (tA === null || tB === null || tB <= tA) return null;
    const v = (iB - iA) * dx / ((tB - tA) * g.dt);
    return { vpInSlab: v / C0, indexMeasured: C0 / v, tA, tB };
}

export const fdtdDevice = {
    modes: ["dispersion", "magic", "lightspeed", "dielectric", "indexconfusion"],
    name: "fdtd-maxwell-on-a-grid",
    // v3734 -- the declared plant: permittivity mistaken for refractive index, one square root apart.
    plantMode: "indexconfusion", plantFlips: "indexErrFrac", plantKind: "mode",
    observables: FDTD_OBSERVABLES, build: buildFdtd, defaults: fdtdDefaults,
};
