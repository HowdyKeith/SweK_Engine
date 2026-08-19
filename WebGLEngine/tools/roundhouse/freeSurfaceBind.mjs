// tools/roundhouse/freeSurfaceBind.mjs
//
// v3728 -- roundhouse device: WHERE THE LIQUID ENDS (fluid/freeSurface.mjs). The curriculum has proposed
// GRADE fluid/freeSurface.mjs for many rounds; gradedCoverage's rule is exactly this file existing and
// importing that module, so the module under grade here is the MEASUREMENT code, not the solver.
//
// *** READ THIS FIRST: THE BRIEF THIS ROUND WAS BUILT FROM WAS WRONG, AND ONE COMMAND SAID SO. *** The note
// carried into this round claimed a shipped units defect -- that flip2d.fillBlock's `perCell` is PER AXIS
// (step = h/perCell, laid in both axes, so a cell gets perCell^2) while freeSurface's `perCellFull` means PER
// CELL, and that fluid/freeSurface-selfcheck.mjs PASSES THE SAME 4 TO BOTH. The first half is true and
// checkable: N = 56*per^2 exactly at per = 2/3/4/8 on the shipped block. *** THE SECOND HALF IS FALSE. *** The
// gate reads `const PER_CELL = 2, PPC = PER_CELL * PER_CELL`, hands PER_CELL to fillBlock and PPC to the
// surface functions, and ASSERTS median occupancy === perCell^2 by name in its own section 1. The gate had the
// unit right all along. The 66.1% volume miss in the brief was reproduced here EXACTLY -- and only by passing
// per=4 into fillBlock while passing 4 into perCellFull, which is the PROBE's mismatch and not the tree's.
// A DEFECT MEASURED THROUGH A FIXTURE THE MEASURER WROTE IS A DEFECT IN THE FIXTURE UNTIL PROVEN OTHERWISE,
// and the shipped gate's own assertion was the thing that would have said so before a round was planned on it.
//
// WHAT IS GRADED HERE: COMMUNICATING VESSELS. Fill the left and right halves of one container to DIFFERENT
// depths over a shared floor, let it settle, and the free surface must reach the SAME height on both sides.
// Nothing hands the solver that height; it comes out of the projection transmitting pressure sideways.
//
// *** WHY THIS FIXTURE AND NOT THE SHIPPED ONE, WHICH IS THE WHOLE ARGUMENT OF THE ROUND. *** The shipped
// fixture drops ONE flat block, so its surface spread reads sd = 0.0000 at step 0 -- FLAT BY CONSTRUCTION --
// and the container floor reads the same zero, which is v3540's own caught bug seen from the other side. A
// key whose ideal value is also its starting value has to lean on the EXCURSION between them to have any
// power at all. The vessels fixture does not need that: its initial state is WRONG BY AN EXACT AMOUNT.
// gapInitial = leftTall - rightTall to the digit (verified at 12, 8, 18 and 2 cells), and sdInitial is exactly
// half of it when the halves are equally wide. THE STARTING VALUE IS DERIVED FROM THE FILL AND THE FINAL VALUE
// IS BOUNDED BY THE GRID.
//
// THE BOUND IS DERIVED, NOT TYPED. A column's surface is an INTEGER cell index. Two level sides sample one
// true surface height lying somewhere between cells k and k+1, so each side's mean lies in [k, k+1] and the
// gap between them is strictly less than ONE CELL. That is gapBoundCells, and it is 1 whatever h is, because
// the gap is measured in cell indices.
//
// MEASURED at 40x40, per=2, 3000 steps, envelope over the last 600 sampled every 60:
//   gapInitial 12.0000 (exact) -> gapEnvelope 0.0526.  Across six seeds at per=2 the envelope tops out at
//   0.3684; across asymmetries 16/4, 12/4, 20/2, 8/6 at 0.4737.
//
// *** AND THE MARGIN THIS FILE FIRST CLAIMED (0.4737, 2.11x) WAS MEASURED ON TOO NARROW A SWEEP -- A SECOND
// SWEEP MOVED IT AND THE HONEST NUMBER IS WORSE. *** At per=3 the envelope reads 0.1053 / 0.3684 / 0.8421 /
// 0.8947 across seeds 3 / 4 / 2 / 5. *** SO THE WORST HONEST READING IS 0.8947 AGAINST A BOUND OF 1: A MARGIN
// OF 1.12x, NOT 2.11x. *** IT IS NOT AN UNSETTLED RUN AND THAT WAS CHECKED RATHER THAN ASSUMED -- seed 2 reads
// 0.8421 at 3000 steps and 0.7895 at BOTH 4500 and 6000, a STATIONARY offset of 15 grid quanta, not a decaying
// slosh. per=2 and per=4 stay under 0.3684 on every seed tried, so the tight readings are ODD-per only and
// WHY IS NOT KNOWN HERE; NOT CLAIMED: that it is a fill artefact. THE BOUND ITSELF MUST NOT MOVE -- it is
// derived from the surface being an integer cell index, so widening it would be inventing resolution the grid
// does not have. THE DEVICE DEFAULT IS per=2 AND THE GATE ASSERTS AT THE DEFAULT; the per=3 census is recorded
// here so the next reader inherits the margin rather than the first sweep's flattering half of it.
//
// *** THE CLAIM IS NOT VACUOUS AND THE SAME FIXTURE PROVES IT: run it SHORTER and it FAILS. Envelope 6.2632
// at 300 steps, 4.1053 at 600, 2.3684 at 1200, 1.8421 at 1800, 0.6316 at 2400, 0.0526 at 3000. A claim that
// is false on its own fixture until the physics has actually happened is a claim with power. ***
//
// *** IT IS THE ENVELOPE AND NOT A LATE SAMPLE, BECAUSE A SLOSH PASSES THROUGH LEVEL TWICE A PERIOD. *** At
// step 420 the point gap reads 0.0526 -- level, by any bar -- while the envelope from 420 to 3000 is 2.9474.
// A device sampling one late frame would certify a violently sloshing fluid. This is v3544's lesson (a
// statistic sampled only where it has converged cannot show whether it has power) arriving in its harder
// form: here the statistic is not converged at all, it is OSCILLATING THROUGH the converged value.
//
// *** WHY A DIFFERENCE AND NOT A HEIGHT: THE PACKING CONSTANT CANCELS. *** volumeHeight predicts a depth from
// the particle count divided by the CALLER'S fill density, and the density a fluid relaxes into is a RESULT,
// NOT AN INPUT. Measured on this solver: settled interior occupancy over the fill's perCell^2 reads 1.021 at
// per=2 and 0.868 at per=4 on the same physical fluid -- the fill density does not survive settling, and it
// misses in OPPOSITE DIRECTIONS at the two densities. The SPH thread refused the volume claim for this reason
// at v3543/v3546; THIS IS THE SAME CONCLUSION BY A DIFFERENT SOLVER AND A DIFFERENT FIXTURE, measured here
// rather than quoted from there. The gap is a difference between two halves of ONE fluid, so whatever that
// packing constant is, it appears on both sides and subtracts out exactly.
//
// *** THE TWO MODES COVER EACH OTHER'S BLINDNESS, AND NEITHER IS REDUNDANT. *** `vessels` cannot see a fluid
// that is level AT THE WRONG HEIGHT: reimplement v3540's shipped bug (take the MINIMUM cell per column
// instead of the maximum) and the gap reads 0.0000 -- a perfect pass -- because the container floor is level
// too. `depth` catches exactly that, reading a ratio of 0.1056 against a bound of 0.15 on the error fraction.
// Conversely `depth` cannot see a sloped surface at the right mean height. ASK WHETHER THE OBSERVABLE EVER
// CLAIMED TO LOOK: the gap never claimed to know the height, so this is a PAIR, not a gap in either.
//
// depth's honest range was measured before its bar was set: depthErrFrac spans 0.0500 (per=2) to 0.0417
// (per=4) across three seeds each, so 0.15 leaves a 2.84x margin, and the minimum-cell plant fires at 0.8944
// -- 5.96x the bar. THE RESIDUE IS THE PACKING, NOT NOISE, which is why the bar is 15% and not 1%.
//
// *** PLANTED AT v3845, AND THE PLANT IS THE ONE THIS HEADER ALREADY NAMED AND MEASURED. *** The paragraph
// above about the two modes covering each other's blindness says it outright: reimplement v3540's shipped bug
// -- take the MINIMUM cell per column instead of the maximum -- and `vessels` reads a gap of 0.0000, A PERFECT
// PASS, because the container floor is level too. That was written as an argument for keeping `depth`. IT IS
// ALSO A PLANT, and leaving it as prose meant the census could not ask this device what it would catch.
//
// *** SO THE PLANT'S REAL SUBJECT IS THE GATE'S OWN BLIND SPOT, WHICH IS THE STRONGEST THING A PLANT CAN DO
// HERE. The declared observable is `depthErrFrac` and NOT `gapEnvelope`, because gapEnvelope IMPROVES under
// the defect -- 0.0526 -> 0.0000 -- and a plant declared against it would read as the code getting BETTER.
// A DEFECT THAT MOVES A KEY THE RIGHT WAY IS THE FAILURE MODE THE MODE-PLANT CONTRACT EXISTS TO EXPOSE, and
// naming the wrong observable here would have shipped a plant that certified the bug. ***
//
// MEASURED, the two arms at the device default: depthErrFrac 0.0500 -> 0.8944 (17.9x, and 5.96x its bar of
// 0.15) while gapEnvelope goes 0.0526 -> 0.0000. THE PAIR IS THE POINT.
//
// The plant reimplements ONLY the max/min decision and reuses the shipped `occupancy` binning, so what it
// perturbs is the one line v3540 got wrong and nothing else.
//
// NOT CLAIMED: that fluid/freeSurface.mjs is verified. occupancy's binning, the `frac` threshold and
// volumeHeight's arithmetic are exercised; nothing here grades a 3D free surface or a moving container.

import { surfaceCells, levelness, volumeHeight, occupancy } from "../../fluid/freeSurface.mjs";
import { Flip2D } from "../../fluid/flip2d.mjs";

export const FREESURFACE_MODES = ["vessels", "depth", "mincell"];

export const FREESURFACE_OBSERVABLES = [
    "gapInitial", "gapInitialExact", "sdInitial",
    "gapEnvelope", "gapFinal", "gapBoundCells", "gapQuantum",
    "sdEnvelope", "sdFinal",
    "depthObserved", "depthPredicted", "depthRatio", "depthErrFrac",
    "columns", "particles", "steps", "settleWindow", "samples",
];

const DEF = {
    nx: 40, ny: 40, h: 1, gravity: -9.81, dt: 1 / 60,
    leftTall: 16, rightTall: 4, per: 2,
    steps: 3000, settleWindow: 600, sample: 60, iters: 60, seed: 1,
};

export function freeSurfaceDefaults(hyp) {
    const h = { mode: "vessels", ...(hyp || {}) };
    const c = { ...DEF, ...(h.config || {}) };
    const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);
    c.nx = Math.min(96, Math.max(16, num(c.nx, DEF.nx) | 0));
    c.ny = Math.min(96, Math.max(16, num(c.ny, DEF.ny) | 0));
    c.h = Math.min(10, Math.max(0.05, num(c.h, DEF.h)));
    c.gravity = Math.min(-0.1, Math.max(-100, num(c.gravity, DEF.gravity)));   // downward, and never zero
    c.dt = Math.min(0.1, Math.max(1e-4, num(c.dt, DEF.dt)));
    c.per = Math.min(6, Math.max(1, num(c.per, DEF.per) | 0));
    c.steps = Math.min(8000, Math.max(60, num(c.steps, DEF.steps) | 0));
    c.sample = Math.min(600, Math.max(10, num(c.sample, DEF.sample) | 0));
    c.settleWindow = Math.min(c.steps, Math.max(c.sample * 2, num(c.settleWindow, DEF.settleWindow) | 0));
    c.iters = Math.min(400, Math.max(1, num(c.iters, DEF.iters) | 0));
    // The two fills must differ, or the fixture is the flat block again and gapInitial is zero BY CONSTRUCTION
    // -- which is the exact defect this device exists to avoid. Clamped so a caller cannot ask for it.
    c.leftTall = Math.min(c.ny - 4, Math.max(2, num(c.leftTall, DEF.leftTall) | 0));
    c.rightTall = Math.min(c.leftTall - 1, Math.max(1, num(c.rightTall, DEF.rightTall) | 0));
    h.config = c;
    // *** THE VALIDATOR MUST LIST THE PLANT MODE. Written as a two-name test it SILENTLY REVERTS `mincell`
    // to `vessels`, both arms read an identical number, and the plant fires at nothing -- v3806 lost a round
    // to exactly that shape on flip2d. REACHABLE AND FINDABLE ARE TWO DIFFERENT EDITS (v3766). ***
    if (!FREESURFACE_MODES.includes(h.mode)) h.mode = "vessels";
    if (!h.claim || !h.claim.observable) {
        h.claim = (h.mode === "depth" || h.mode === "mincell")
            ? { observable: "depthErrFrac", max: 0.15 }
            : { observable: "gapEnvelope", max: 1 };
    }
    return h;
}

/** Deterministic jitter, so the same build gives the same pool on every machine. */
function lcg(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; }

/**
 * The fixture itself, EXPORTED so the gate drives THE SAME FILL rather than a second spelling of it. Two
 * copies of a fixture are two declarations about one experiment that nobody ever compares -- and a plant
 * measured against a fixture the plant's own file wrote proves nothing about the shipped one.
 */
/**
 * *** THE PLANT: v3540'S SHIPPED BUG, REIMPLEMENTED AS ONE COMPARISON. *** surfaceCells keeps the MAXIMUM
 * occupied cell per column because gravity decreases y here, so the maximum is the free surface and the
 * minimum is the container floor. Taking the minimum reports THE BOTTOM OF THE FLUID -- flat by construction,
 * sitting on the floor -- which is why it reads as a perfect level and a wrecked depth. Everything else is the
 * shipped path: the same `occupancy` binning, the same `frac * perCellFull` threshold, the same sort.
 */
function surfaceCellsMIN(px, py, h, perCellFull, frac = 0.5) {
    const cnt = occupancy(px, py, h);
    const bot = new Map();
    for (const [k, v] of cnt) {
        if (v < frac * perCellFull) continue;
        const i = k.indexOf(","), cx = +k.slice(0, i), cy = +k.slice(i + 1);
        if (!bot.has(cx) || cy < bot.get(cx)) bot.set(cx, cy);   // MIN -- the floor, not the surface
    }
    return [...bot.entries()].sort((a, b) => a[0] - b[0]).map(([cx, cy]) => ({ cx, cy }));
}

export function vesselFixture(c) {
    const full = c.per * c.per;                 // fillBlock lays perCell particles PER AXIS -- a cell gets its square
    const mid = Math.floor(c.nx / 2);
    const f = new Flip2D(c.nx, c.ny, { h: c.h, gravity: c.gravity, iters: c.iters });
    const rng = lcg(c.seed);
    f.fillBlock(2 * c.h, c.h, mid * c.h, (1 + c.leftTall) * c.h, c.per, rng);
    f.fillBlock(mid * c.h, c.h, (c.nx - 2) * c.h, (1 + c.rightTall) * c.h, c.per, rng);
    return { f, full, mid };
}

export async function buildFreeSurface(hyp, base = {}) {
    const h = freeSurfaceDefaults({ ...hyp, config: { ...(base || {}), ...(hyp && hyp.config) } });
    const c = h.config;
    const { f, full, mid } = vesselFixture(c);
    const particles = f.count();
    if (particles < 4 * full) return { error: "not-enough-particles (the fill produced nothing to measure)" };

    const surfaceOf = h.mode === "mincell" ? surfaceCellsMIN : surfaceCells;
    const read = () => {
        const s = surfaceOf(f.px, f.py, f.h, full, 0.5);
        const L = s.filter((e) => e.cx < mid), R = s.filter((e) => e.cx >= mid);
        const mean = (a) => (a.length ? a.reduce((x, e) => x + e.cy, 0) / a.length : NaN);
        const lv = levelness(s);
        // A side with no surface at all is not a small gap, it is an unreadable one.
        const gap = (L.length && R.length) ? Math.abs(mean(L) - mean(R)) : Infinity;
        return { gap, sd: lv.sd, surface: s, sides: Math.min(L.length, R.length) };
    };

    const first = read();
    let gapEnvelope = 0, sdEnvelope = 0, samples = 0;
    for (let s = 1; s <= c.steps; s++) {
        await f.step(c.dt);
        if (s % c.sample) continue;
        if (s <= c.steps - c.settleWindow) continue;
        const cur = read();
        gapEnvelope = Math.max(gapEnvelope, cur.gap);
        sdEnvelope = Math.max(sdEnvelope, cur.sd);
        samples++;
    }
    if (!samples) return { error: "no-samples-in-settle-window (sample stride is larger than the window)" };

    const last = read();
    const V = volumeHeight({ px: f.px, py: f.py, h: f.h, perCellFull: full, floorCell: 0, surface: last.surface });

    // The smallest non-zero gap the grid can express: one column of one side differing by one cell.
    const gapQuantum = last.sides > 0 ? 1 / last.sides : Infinity;

    return {
        gapInitial: first.gap,
        gapInitialExact: c.leftTall - c.rightTall,     // from the FILL, never from the state being judged
        sdInitial: first.sd,
        gapEnvelope, gapFinal: last.gap,
        gapBoundCells: 1,                              // the surface is resolved to a cell; see the header
        gapQuantum,
        sdEnvelope, sdFinal: last.sd,
        depthObserved: V.observed,
        depthPredicted: V.predicted,
        depthRatio: V.predicted > 0 ? V.observed / V.predicted : Infinity,
        depthErrFrac: V.errFrac,
        columns: last.surface.length,
        particles, steps: c.steps, settleWindow: c.settleWindow, samples,
    };
}

export const freeSurfaceDevice = {
    // "vessels" stays FIRST so the contract compares the plant against the mode that owns the fixture.
    modes: FREESURFACE_MODES,
    // *** `depthErrFrac` AND NOT `gapEnvelope`: the defect IMPROVES the gap (0.0526 -> 0.0000). See the header.
    plantMode: "mincell", plantFlips: "depthErrFrac", plantKind: "mode",
    name: "freesurface-vessels",
    observables: FREESURFACE_OBSERVABLES,
    build: buildFreeSurface,
    defaults: freeSurfaceDefaults,
};

// ---- front door ------------------------------------------------------------------------------------------
// device.html lists every name in DEVICE_NAMES from /device/list and runs it, so registering is the door; this
// block is the one that works without a server.
if (import.meta.url === `file://${process.argv[1]}`) {
    const r = await buildFreeSurface({ mode: "vessels" });
    console.log("[freesurface] COMMUNICATING VESSELS -- two unequal columns over one floor must find one level\n");
    if (r.error) { console.log("  REFUSED:", r.error); }
    else {
        console.log("  gap at step 0    ", r.gapInitial.toFixed(4), " cells -- exact from the fill:", r.gapInitialExact,
            `(sd ${r.sdInitial.toFixed(4)}, exactly half when the halves are equally wide)`);
        console.log("  gap ENVELOPE     ", r.gapEnvelope.toFixed(4), " cells over the last", r.settleWindow,
            "steps  (" + r.samples + " samples) vs bound", r.gapBoundCells, "cell");
        console.log("  gap at the end   ", r.gapFinal.toFixed(4), " -- and the grid cannot express a gap below",
            r.gapQuantum.toFixed(4));
        console.log("  surface spread   ", r.sdFinal.toFixed(4), " sd at the end, envelope", r.sdEnvelope.toFixed(4));
        console.log("  depth            ", r.depthObserved.toFixed(4), "observed vs", r.depthPredicted.toFixed(4),
            `predicted from the particles (err ${(r.depthErrFrac * 100).toFixed(2)}%)`);
        console.log("  measured over    ", r.columns, "columns,", r.particles, "particles,", r.steps, "steps");
    }
    console.log("\n  THE ENVELOPE, NOT A LATE SAMPLE: a slosh passes THROUGH level twice a period -- at step 420");
    console.log("  the point gap reads 0.0526 while the envelope from there to 3000 is 2.9474.");
    console.log("  THE GAP IS A DIFFERENCE, so the settled packing constant cancels -- which is the thing");
    console.log("  volumeHeight cannot do, since the density a fluid relaxes into is a RESULT, not an input.");
    console.log("  NOT CLAIMED: that freeSurface.mjs is verified. PLANTED at v3845: `mincell` takes the floor instead\n  of the surface -- depthErrFrac 0.0500 -> 0.8944 WHILE gapEnvelope IMPROVES to 0.0000.");
}
