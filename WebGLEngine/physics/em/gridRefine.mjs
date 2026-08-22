// physics/em/gridRefine.mjs
//
// WHAT A GRID REFINEMENT INTERFACE COSTS, AND THE ANSWER KEY IS ZERO.
//
// v3631 refused WAVELET's headline feature -- "a dynamic grid that adapts as transmitters are added" -- under the
// greedyMesh3d rule, and recorded the key hiding inside the refusal: A REFINEMENT INTERFACE IS AN IMPEDANCE
// DISCONTINUITY AND REFLECTS. This file measures that, and the reason it is worth measuring is the cleanest kind
// of answer key this tree has:
//
// *** IN THE CONTINUUM THERE IS NO INTERFACE. The medium is IDENTICAL on both sides -- same eps, same mu, same c.
// A change of CELL SIZE is a change in how we are writing the problem down, not in the problem. So the true
// reflection is EXACTLY ZERO, with no reference value to compute and nothing to tune. EVERY PHOTON THAT COMES
// BACK IS PURE NUMERICAL ARTEFACT, and its size IS the price of adaptivity. That is the div-B shape: an identity
// a wrong scheme cannot hide from. ***
//
// AND THERE IS A SECOND COST, WHICH IS ARITHMETIC RATHER THAN MEASUREMENT, AND IT IS THE ONE NOBODY QUOTES:
//
//     ONE TIME STEP IS SHARED BY THE WHOLE GRID, so with a refinement ratio r = dx_coarse / dx_fine the two
//     Courant numbers are locked together:  S_fine = r * S_coarse.
//     Stability needs S <= 1 EVERYWHERE, so the whole domain is limited by the FINEST cell: S_coarse <= 1/r.
//
// *** THEREFORE THE MAGIC TIME STEP EXISTS ON AT MOST ONE SIDE OF A REFINEMENT INTERFACE, AND IF THE FINE SIDE
// TAKES IT (S_fine = 1) THE COARSE SIDE RUNS AT S = 1/r AND IS DISPERSIVE. Refining part of a grid does not
// merely add an interface -- IT TAKES THE ONE CONFIGURATION IN WHICH FDTD IS EXACT AWAY FROM EVERYWHERE ELSE.
// tools/roundhouse/fdtd-selfcheck.mjs already grades that exactness; this is what adaptivity costs to have it. ***
//
// THE SCHEME. A non-uniform 1D Yee. E lives at nodes, H between them. dx[i] is the gap between node i and i+1,
// so H[i] sees dx[i]; the dual cell around node i has width (dx[i-1] + dx[i])/2, which is what makes the E update
// non-uniform. On a uniform grid both reduce to the usual constants -- and section 1 of the gate proves that by
// measuring EXACTLY ZERO reflection at r = 1, which is the control that says the machinery itself adds nothing.
//
// BROWSER-SAFE: no imports, no DOM, no node builtins.

/** Cell widths for a domain that is coarse on the left and refined by `ratio` from `splitAt` onward. */
export function makeGrid({ nCoarse = 300, nFine = 300, ratio = 2, dxCoarse = 1 } = {}) {
    const dx = new Float64Array(nCoarse + nFine);
    for (let i = 0; i < nCoarse; i++) dx[i] = dxCoarse;
    for (let i = nCoarse; i < dx.length; i++) dx[i] = dxCoarse / ratio;
    return { dx, splitAt: nCoarse, ratio, dxCoarse, dxFine: dxCoarse / ratio };
}

/** The Courant numbers the shared time step forces on each side, and whether the pair is stable. */
export function courantPair({ ratio = 2, sFine = 1 } = {}) {
    const sCoarse = sFine / ratio;
    return {
        ratio, sFine, sCoarse,
        stable: sFine <= 1 && sCoarse <= 1,
        // The magic step is S == 1 exactly. It can hold on ONE side at most, unless ratio == 1.
        magicOnFine: sFine === 1, magicOnCoarse: sCoarse === 1,
        magicSidesPossible: ratio === 1 ? 2 : 1,
    };
}

/**
 * Run a pulse through the grid. `dt` is shared. Units: c = 1, so dt = sFine * dxFine.
 * A pulse is launched in the COARSE region and travels toward the interface.
 */
export function run({ grid, sFine = 1, steps = 700, pulseAt = 150, pulseWidth = 14, probeCell = 150 } = {}) {
    const { dx } = grid, N = dx.length;
    const dt = sFine * grid.dxFine;
    const E = new Float64Array(N), H = new Float64Array(N);
    // Position of each node, so a Gaussian is laid down in SPACE rather than in cell index -- a pulse defined by
    // index would be a different physical pulse on each side of the interface, which would fake the very
    // reflection this file measures.
    const x = new Float64Array(N);
    for (let i = 1; i < N; i++) x[i] = x[i - 1] + dx[i - 1];
    const x0 = x[pulseAt], w = pulseWidth * grid.dxCoarse;
    for (let i = 0; i < N; i++) E[i] = Math.exp(-Math.pow((x[i] - x0) / w, 2));
    const trace = new Float64Array(steps);
    for (let n = 0; n < steps; n++) {
        for (let i = 0; i < N - 1; i++) H[i] -= dt * (E[i + 1] - E[i]) / dx[i];
        for (let i = 1; i < N - 1; i++) {
            const dual = 0.5 * (dx[i - 1] + dx[i]);
            E[i] -= dt * (H[i] - H[i - 1]) / dual;
        }
        E[0] = 0; E[N - 1] = 0;
        trace[n] = E[probeCell];
    }
    return { E, H, trace, dt, x };
}

/**
 * Reflection from the interface, and nothing else: the same pulse on a UNIFORM grid of the coarse spacing, with
 * the same shared dt, subtracted. The reference never meets an interface, so the difference at a probe BEHIND the
 * pulse is exactly what the refinement sent back.
 *
 * THE REFERENCE IS UNIFORM AT THE COARSE SPACING ON PURPOSE. It is the grid you would have had if you had not
 * refined -- so the number this returns is the price of the REFINEMENT, not of the resolution.
 */
export function interfaceReflection({ ratio = 2, sFine = 1, pulseWidth = 14,
    standoff = 6, nCoarse = null, pulseAt = null, steps = null } = {}) {
    // *** THE GEOMETRY IS DERIVED FROM THE PULSE WIDTH, NOT FIXED, AND MY FIRST VERSION FIXED IT. Two artefacts
    // came straight out of that and both looked like physics. (1) With steps fixed, dt = sFine * dxCoarse / ratio,
    // so the pulse travels FEWER COARSE CELLS as the ratio rises -- at ratio 3 and 4 the reflection had not yet
    // returned to the probe and the fixture read 1.1e-11 and 0.000e+0, i.e. "refining more reflects less". THE
    // TIME BUDGET HAS TO BE PHYSICAL, so steps scales with ratio. (2) With the geometry fixed, a pulse 56 cells
    // wide already STRADDLED the interface at t = 0, so its "reflection" included the initial condition, and a
    // resolution sweep was secretly a geometry sweep. Both are now impossible by construction. ***
    pulseAt = pulseAt === null ? Math.ceil(standoff * pulseWidth) : pulseAt;
    nCoarse = nCoarse === null ? 2 * pulseAt : nCoarse;                 // interface a full standoff beyond the pulse
    const roundTrip = 2 * (nCoarse - pulseAt) + 6 * pulseWidth;          // coarse cells the echo must cover
    steps = steps === null ? Math.ceil(roundTrip * ratio / sFine) : steps;
    // (3) AND A THIRD ARTEFACT FROM THE SAME CAUSE: the fine zone is counted in CELLS but has to be long enough in
    // SPACE, so its cell count must scale with the ratio. Sized as "1.5 cells of fine zone" it was physically
    // shorter than the pulse at ratio 2, the pulse hit the fine side's own PEC wall and bounced, and the fixture
    // read |r| = 0.50 -- the WHOLE PULSE -- at every ratio from 1.5 up. A reflection coefficient that saturates at
    // one half for every setting is the give-away: it was measuring my far wall, not the interface.
    const nFine = Math.ceil(ratio * (nCoarse - pulseAt + 3 * pulseWidth));
    const probeCell = pulseAt;
    const grid = makeGrid({ nCoarse, nFine, ratio });
    const test = run({ grid, sFine, steps, pulseAt, pulseWidth, probeCell });
    // A uniform grid long enough that the pulse never reaches its far wall within `steps`.
    const flat = makeGrid({ nCoarse: nCoarse + nFine + steps + 40, nFine: 0, ratio: 1 });
    const ref = run({ grid: { ...flat, dxFine: grid.dxFine }, sFine, steps, pulseAt, pulseWidth, probeCell });
    let diff = 0, inc = 0;
    for (let n = 0; n < steps; n++) {
        diff = Math.max(diff, Math.abs(test.trace[n] - ref.trace[n]));
        inc = Math.max(inc, Math.abs(ref.trace[n]));
    }
    return { reflected: diff, incident: inc, coefficient: diff / Math.max(inc, 1e-300),
             courant: courantPair({ ratio, sFine }), dt: test.dt,
             geometry: { nCoarse, nFine, pulseAt, steps, pulseWidth, standoff } };
}
