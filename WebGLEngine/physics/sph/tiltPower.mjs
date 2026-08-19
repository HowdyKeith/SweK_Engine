// physics/sph/tiltPower.mjs
//
// v3545 -- DOES THE TILT SLOPE HAVE ANY POWER AT SIX COLUMNS? IT DOES NOT, AND THAT IS THE WHOLE ANSWER.
//
// v3544 measured a settled TILTED pool and reported its surface slope against tan(theta) -- 0.075x, 2.20x and
// 2.82x at 5/10/20 degrees -- then REFUSED to claim the closed form, writing "whoever explains it turns that
// line into the key". This file explains it, and the explanation is not about the fluid.
//
// *** THE BOX IS SIX COLUMNS WIDE. *** SHIPPED_FLOOR is 0.6 and h is 0.1, so surfaceSlope least-squares fits
// SIX x-positions, and the rise across the whole box is 0.53 / 1.06 / 2.18 cells at 5/10/20 degrees. A
// statistic whose quantum is ONE CELL is being asked to resolve a signal of one or two cells across its entire
// domain.
//
// THE METHOD IS THE ONE THING THIS ARC KEPT GETTING RIGHT ONLY BY ACCIDENT: separate the instrument from the
// specimen. `planePool` builds a pool whose free surface is an EXACT PLANE at a slope chosen by the caller --
// no solver, no settling, no fluid at all -- so any departure the statistic reports is the STATISTIC'S OWN.
// That is v3540's container-floor negative from the other side: there, a control that could not fail read the
// same zero as the thing under test; here, a control that cannot be wrong reads a slope that is.
//
// THREE MEASURED LEGS, AND NO ONE OF THEM WOULD BE ENOUGH ALONE:
//
//   1. QUANTISATION. The real 5-degree pool's per-column profile reads 8.00 in EVERY ONE of six columns and
//      the fitted slope is EXACTLY 0.0000 against tan(5) = 0.0875. The surface lies wholly inside one cell
//      band, so the statistic cannot see it at all. `planePool` reproduces this on a surface known to be
//      sloped by construction, which is what makes it the instrument's fault rather than the fluid's.
//
//   2. SUB-CELL PHASE. Hold the plane's slope FIXED and slide its mean depth through ONE cell: at six columns
//      the reported ratio ranges from 0.000x to about 2.2x of a truth that never moved. THE SPAN IS THE
//      FINDING -- v3544's three reported ratios sit inside the range the statistic produces on a surface that
//      is exactly right -- BUT ONLY THE 5-DEGREE ONE. 2.20x and 2.82x lie ABOVE the phase range at their own
//      tilts (1.319 and 1.115) and are leg 3's, not leg 2's. I DRAFTED THIS FILE CLAIMING THE PHASE RANGE
//      COVERED ALL THREE AND THE FIRST RUN OF MY OWN FRONT DOOR REFUTED IT. Widen the box and the span collapses: by 24 columns the ratio is within a few percent
//      of 1, and by 96 columns it is 1.000. THE INSTRUMENT CONVERGES, so its power is a property of the
//      FIXTURE'S WIDTH and not of the claim.
//
//   3. ONE-COLUMN LEVERAGE. At 20 degrees the profile is 7.00 7.00 7.81 7.90 8.00 11.00 -- a THREE-CELL
//      pile-up in the single column against the downhill wall, where v3543's clamp puts every particle driven
//      past x = W. In a six-point fit that column carries enormous leverage: a drop-one jackknife moves the
//      ratio from 1.81x to 0.80x, a 56% shift, and at 10 degrees from 1.45x to 0.90x. A FIT WHOSE ANSWER
//      DEPENDS ON ONE POINT OF SIX IS NOT REPORTING A SLOPE, IT IS REPORTING THAT POINT.
//
// *** WHAT THIS DOES NOT SHOW. *** It does NOT show that the settled surface IS perpendicular to gravity. It
// shows the six-column fixture CANNOT TELL, which is a different and weaker statement, and conflating them
// would be the numerology v3544 correctly refused. NO KEY IS REGISTERED HERE.
//
// THE ANTIDOTE, AND IT NAMES THE CORRECT RESPONSE IN ADVANCE (v3196's idiom): when somebody settles a tilted
// pool in a box of AT LEAST 24 columns -- where leg 2 proves the transfer faithful -- section 5 GOES RED and
// should be rewritten to assert that the measured slope equals tan(theta) within the transfer error measured
// HERE. That is the key. IT MUST NOT BE WEAKENED AND IT MUST NOT BE DELETED, and the tolerance must come from
// the transfer table rather than from whatever the first run happens to produce.
//
// A NOTE ON WHY THE NUMBERS HERE DIFFER FROM MEASURED_V3544's. v3544's tilt sweep starts from a DAM BREAK
// (damColumns: 5); the profiles above start from the UNIFORM fill. Same box, same solver, different starting
// shape, and the ratios differ (1.45x/1.81x here against 2.20x/2.82x there) while the MECHANISM is identical.
// THAT DIFFERENCE IS ITSELF EVIDENCE: a statistic whose answer moves with the initial condition of a state
// that has settled is reporting the transient it kept, not the surface.
"use strict";
import { settlePool, perCellFullDeclared, SHIPPED_FLOOR } from "./poolFixture.mjs";
import { surfaceHeights, surfaceSlope } from "./levelClaim.mjs";
import { LATTICE } from "./materialKnobs.mjs";

/** Least-squares slope of [x, y] points. The SAME arithmetic surfaceSlope uses, on plain pairs. */
export function slopeOf(pts) {
    if (pts.length < 2) return NaN;
    const mx = pts.reduce((a, b) => a + b[0], 0) / pts.length;
    const my = pts.reduce((a, b) => a + b[1], 0) / pts.length;
    const num = pts.reduce((a, [x, y]) => a + (x - mx) * (y - my), 0);
    const den = pts.reduce((a, [x]) => a + (x - mx) ** 2, 0);
    return den > 0 ? num / den : NaN;
}

/**
 * *** A POOL WHOSE SURFACE IS AN EXACT PLANE. NO SOLVER RUNS. ***
 * Particles are laid so each cell below the plane holds a full complement and the cell the plane passes
 * through holds the right FRACTION of one, which is precisely the state surfaceHeights claims to read. The
 * truth is the caller's `slope` argument, so the statistic has nothing to be right about except itself.
 * `full` is DERIVED from the material exactly as surfaceHeights derives it -- passing a different number here
 * would test the statistic against a fill it would never see.
 */
export function planePool({ W = SHIPPED_FLOOR, h = 0.1, mass = 0.02, meanDepth = 8, slope = 0 } = {}) {
    const n = Math.ceil(W / h - 1e-9), particles = [];
    const full = Math.round(perCellFullDeclared(h, mass));
    for (let cx = 0; cx < n; cx++) {
        const Y = meanDepth + slope * (cx + 0.5 - n / 2);        // TRUE surface height, in cells
        if (!(Y > 0)) continue;
        for (let cz = 0; cz < n; cz++) {
            const whole = Math.floor(Y);
            for (let cy = 0; cy < whole; cy++)
                for (let q = 0; q < full; q++)
                    particles.push({ x: (cx + 0.5) * h, y: (cy + 0.5) * h, z: (cz + 0.5) * h });
            const part = Math.round(full * (Y - whole));
            for (let q = 0; q < part; q++)
                particles.push({ x: (cx + 0.5) * h, y: (whole + 0.5) * h, z: (cz + 0.5) * h });
        }
    }
    return { w: { particles }, W, h, mass, columns: n };
}

/** What the statistic reports, divided by the truth it was built from. 1 means faithful. */
export function transferRatio(deg, opts = {}) {
    const t = Math.tan(deg * Math.PI / 180);
    if (!(t > 0)) return NaN;
    return surfaceSlope(surfaceHeights(planePool({ slope: t, ...opts }))) / t;
}

/**
 * LEG 2a -- slide the surface through ONE cell at a FIXED slope. The span is the instrument's phase error, and
 * it is measured rather than argued: nothing about the plane's slope changes across these rows.
 */
export function phaseSwing({ deg = 5, W = SHIPPED_FLOOR, base = 8, steps = 8 } = {}) {
    const rows = [];
    for (let i = 0; i < steps; i++) {
        const ph = i / steps;
        rows.push([ph, transferRatio(deg, { W, meanDepth: base + ph })]);
    }
    const vals = rows.map((r) => r[1]).filter(Number.isFinite);
    return { deg, W, columns: Math.ceil(W / 0.1 - 1e-9), rows,
             lo: Math.min(...vals), hi: Math.max(...vals), span: Math.max(...vals) - Math.min(...vals) };
}

/**
 * LEG 2b -- THE CONVERGENCE. Same tilt, same depth, WIDER BOX. The transfer error is a property of how many
 * columns the fit has, and it goes away. This is what makes the diagnosis actionable instead of a complaint.
 */
export function transferByWidth({ widths = [0.6, 1.2, 2.4, 4.8, 9.6], degs = [5, 10, 20], base = 8.5 } = {}) {
    return widths.map((W) => ({
        W, columns: Math.ceil(W / 0.1 - 1e-9),
        ratios: degs.map((d) => [d, transferRatio(d, { W, meanDepth: base })]),
    }));
}

/** Worst distance from a faithful 1 across the tilts, per width -- the one number the convergence needs. */
export function worstError(row) {
    return Math.max(...row.ratios.map(([, r]) => Math.abs(r - 1)));
}

/**
 * LEG 3 -- DROP-ONE JACKKNIFE. How much of the answer rests on a single column. Returns the full-fit slope and
 * the refit with each column removed, so the leverage is a MEASUREMENT and not an eyeball of the profile.
 */
export function columnLeverage(profile) {
    const full = slopeOf(profile);
    const drops = profile.map((p, i) => {
        const s = slopeOf(profile.filter((_, j) => j !== i));
        return { x: p[0], slope: s, shift: Math.abs(s - full) / Math.abs(full) };
    });
    const worst = drops.reduce((a, b) => (b.shift > a.shift ? b : a), drops[0]);
    return { full, drops, worst };
}

/** Collapse a wetted-column list to ONE mean height per x-column, which is what the profile above shows. */
export function xProfile(heights) {
    const byX = new Map();
    for (const [c, y] of heights) {
        const x = Number(c.split(",")[0]);
        if (!byX.has(x)) byX.set(x, []);
        byX.get(x).push(y);
    }
    return [...byX.entries()].sort((a, b) => a[0] - b[0])
        .map(([x, ys]) => [x, ys.reduce((a, b) => a + b, 0) / ys.length]);
}

/** Settle a real tilted pool and hand back its x-profile -- the LIVE leg, and the only expensive one. */
export function tiltedProfile({ deg = 20, targetN = 2800, viscosity = 3, steps = 3000 } = {}) {
    const pool = settlePool({ targetN, viscosity, steps, tiltDeg: deg });
    const heights = surfaceHeights(pool);
    const profile = xProfile(heights);
    return { deg, pool, heights, profile, slope: surfaceSlope(heights),
             tan: Math.tan(deg * Math.PI / 180), energyRatio: pool.energyRatio };
}

export const MEASURED_V3545 = {
    W: SHIPPED_FLOOR, h: 0.1, columns: 6, targetN: 2800, viscosity: 3, steps: 3000, spacing: LATTICE.spacing,
    riseAcrossBox: [[5, 0.525], [10, 1.058], [20, 2.184]],           // columns * tan(theta), in CELLS
    // The real pool, UNIFORM fill (v3544's tilt sweep used a dam break -- see the header note).
    profiles: {
        0:  [8.00, 8.00, 8.00, 8.00, 8.00, 8.00],
        5:  [8.00, 8.00, 8.00, 8.00, 8.00, 8.00],
        10: [7.21, 8.00, 8.00, 8.00, 8.00, 9.00],
        20: [7.00, 7.00, 7.81, 7.90, 8.00, 11.00],
    },
    liveRatios: [[5, 0.000], [10, 1.450], [20, 1.813]],
    phaseSpanAt6: [[5, 0.000, 2.160], [10, 0.494, 1.319], [20, 0.848, 1.115]],   // deg, lo, hi
    transferWorstByColumns: [[6, 0.944], [12, 0.228], [24, 0.026], [48, 0.011], [96, 0.001]],
    jackknife: { 10: { full: 1.450, worstDrop: 0.896, at: 5, shift: 0.382 },
                 20: { full: 1.813, worstDrop: 0.797, at: 5, shift: 0.560 } },
    note: "*** THE SLOPE STATISTIC HAS NO POWER AT SIX COLUMNS. *** At 5 degrees every column reads the same " +
          "integer and the fit is EXACTLY zero against a real tan of 0.0875. On an EXACT PLANE -- a surface " +
          "the statistic cannot be wrong about -- sliding the mean depth through one cell moves the reported " +
          "ratio from 0.000x to 2.16x while the truth never moves -- which covers v3544's 0.075x AND ONLY " +
          "THAT ONE. Its 2.20x and 2.82x are ABOVE the phase range (1.319 and 1.115) and are carried by the " +
          "jackknife leg instead; a first draft of this file claimed all three and its own first run refuted " +
          "it. The error is a property of the fixture's WIDTH and it converges: " +
          "worst departure from a faithful 1 falls 0.944 -> 0.026 -> 0.001 at 6 -> 24 -> 96 columns. And at 20 " +
          "degrees one wall column holds a THREE-CELL pile-up that carries 56% of the answer on a drop-one " +
          "jackknife. NO KEY IS REGISTERED: this shows the fixture cannot tell, NOT that the surface is level.",
};

export const EXPLAINS_V3544 = {
    line: "v3544 reported the tilt slope at 0.075x / 2.20x / 2.82x of tan(theta) and wrote that whoever " +
          "explains it turns that line into the key.",
    explanation: "The departure is the INSTRUMENT, not the fluid. Six columns, a one-cell quantum and a " +
                 "one-to-two-cell signal, with one wall column carrying the leverage. The fluid is not " +
                 "exonerated and it is not accused -- the fixture cannot decide, and that is a narrower " +
                 "claim than either.",
    owed: "A tilted pool settled in a box of AT LEAST 24 COLUMNS. Then section 5 goes red and the slope " +
          "becomes a real key against tan(theta), with the tolerance READ OFF the transfer table here.",
};

// ---- FRONT DOOR -------------------------------------------------------------------------------------------
export function reportLines({ live = false } = {}) {
    const L = [];
    L.push("[tiltPower] DOES THE TILT SLOPE HAVE ANY POWER AT SIX COLUMNS? NO -- and that explains v3544's line");
    L.push("");
    L.push("  THE FIXTURE: W " + SHIPPED_FLOOR + " / h 0.1 = " + MEASURED_V3545.columns +
           " x-columns. Rise across the WHOLE box, in cells:");
    L.push("    " + MEASURED_V3545.riseAcrossBox.map(([d, r]) => d + "deg " + r.toFixed(3)).join("   ") +
           "   -- against a statistic whose quantum is ONE cell");
    L.push("");
    L.push("  THE REAL POOL'S PER-COLUMN SURFACE (uniform fill, settled 3000 steps):");
    for (const d of [0, 5, 10, 20])
        L.push("    " + String(d).padStart(2) + "deg  " +
               MEASURED_V3545.profiles[d].map((v) => v.toFixed(2).padStart(7)).join("") +
               (d === 5 ? "   <- EVERY COLUMN THE SAME INTEGER, slope exactly 0.0000" : "") +
               (d === 20 ? "   <- a THREE-CELL pile-up in the wall column" : ""));
    L.push("");
    L.push("  LEG 1+2 -- THE STATISTIC ON AN EXACT PLANE (no solver runs; the truth is the argument):");
    for (const [d, lo, hi] of MEASURED_V3545.phaseSpanAt6)
        L.push("    " + String(d).padStart(2) + "deg   sliding the depth through ONE cell reports " +
               lo.toFixed(3) + "x to " + hi.toFixed(3) + "x of a truth that never moved");
    L.push("  *** THE PHASE LEG COVERS 5deg AND ONLY 5deg -- v3544's 0.075x is inside [0.000, 2.160] and its");
    L.push("      2.20x / 2.82x ARE NOT. I wrote 'all three sit inside that range' and the numbers refuted it on");
    L.push("      the first run: 2.20 > 1.319 and 2.82 > 1.115. THE THREE LEGS COVER DIFFERENT TILTS and no one");
    L.push("      of them explains the whole line -- phase kills 5deg, LEVERAGE below carries 10 and 20. ***");
    L.push("");
    L.push("  ...AND IT CONVERGES, so the error belongs to the WIDTH and not to the claim:");
    L.push("    columns   " + MEASURED_V3545.transferWorstByColumns.map(([c]) => String(c).padStart(7)).join(""));
    L.push("    worst |r-1|" + MEASURED_V3545.transferWorstByColumns.map(([, e]) => e.toFixed(2).padStart(7)).join(""));
    L.push("");
    L.push("  LEG 3 -- DROP-ONE JACKKNIFE, how much rests on a single column:");
    for (const d of [10, 20]) {
        const j = MEASURED_V3545.jackknife[d];
        L.push("    " + d + "deg  full fit " + j.full.toFixed(3) + "x  ->  drop column " + j.at + " and it is " +
               j.worstDrop.toFixed(3) + "x   (" + (j.shift * 100).toFixed(1) + "% of the answer)");
    }
    L.push("");
    L.push("  OWED: " + EXPLAINS_V3544.owed);
    if (live) {
        const sw = phaseSwing({ deg: 10 });
        L.push("    MEASURED NOW: phase swing at 10deg over " + sw.columns + " columns = " +
               sw.lo.toFixed(3) + "x .. " + sw.hi.toFixed(3) + "x");
    }
    return L;
}

// A REPORTING TOOL MUST PRINT AND EXIT ZERO; the gate beside it is what exits nonzero.
if (import.meta.url === `file://${process.argv[1]}`) { for (const l of reportLines({ live: true })) console.log(l); process.exit(0); }
