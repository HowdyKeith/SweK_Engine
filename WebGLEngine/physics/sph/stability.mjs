// physics/sph/stability.mjs
//
// v3542 -- *** THE COLUMN WAS NEVER FAILING TO SETTLE. IT WAS MANUFACTURING ENERGY. ***
//
// v3541 closed by naming the next round: "make the column settle -- that is the prerequisite for everything
// the placement agent needs". It read the symptom as a fluid that would not come to rest. IT IS NOT. Measured
// at the shipped viscosity, TOTAL MECHANICAL ENERGY QUADRUPLES:
//
//     KE+PE per particle   3.679 -> 5.333 -> 8.584 -> 11.916 -> 16.215   over 2000 steps
//
// GRAVITY IS THE ONLY EXTERNAL FORCE AND THE ONLY BOUNDARY IS LOSSY (the wall clamp reverses velocity at
// restitution 0.3, so it can only ever REMOVE energy). There is nowhere for that to come from. The fluid
// climbs to y = 5.906 under a lid at 6.0 -- NINE TIMES ITS OWN STARTING HEIGHT -- and would climb through any
// lid you gave it.
//
// *** WHICH CORRECTS MY OWN v3541 ONE ROUND LATER, AND MAKES ITS FINDING WORSE RATHER THAN WRONG. *** v3541
// found that `retained` is a measurement of the container: the topmost particle sits a millimetre under the
// shipped lid, and raising the lid moves the number. TRUE, AND THE REASON IS NOT THAT THE FLUID EXPANDS TO A
// TALLER EQUILIBRIUM -- IT IS THAT IT NEVER REACHES ONE. And v3541's `FREE_LID = 3.0`, described as "a box the
// fluid does not touch", IS ONLY FREE FOR ABOUT 1200 STEPS: at 2000 the top reads 2.988. A STATEMENT ABOUT A
// BOX THE FLUID DOES NOT REACH NEEDS A STEP BUDGET ATTACHED, and mine had none.
//
// THE KNOB CENSUS IS NOT WITHDRAWN. It correctly measured WHICH PARAMETERS THE SOLVER READS, which is a fact
// about the code and does not need a fluid at rest. What it must not be read as is a statement about a settled
// liquid -- and the same goes for MEASURED_V2881's whole table, which has been quoted since v2881.
//
// ---- THE KEY IS A BIFURCATION (v3200's friction shape) ------------------------------------------------------
//
// THE BOUNDARY IS PHYSICAL AND NOT CHOSEN: in a system whose only external force is gravity and whose only
// boundary is dissipative, total mechanical energy MAY NOT RISE. So E(T)/E(0) > 1 IS the instability, with no
// tolerance to argue about, and bisecting on it finds where the solver stops inventing energy.
//
//     MEASURED: viscosity threshold in [0.4532, 0.4698]. THE SHIPPED DEFAULT IS 0.1, A FACTOR OF ~4.6 BELOW IT.
//
// ---- AND THE TWO OBVIOUS CURES WERE TESTED AGAINST EACH OTHER, BECAUSE THEY ARE OPPOSITE ---------------------
//
// IT IS NOT THE TIME STEP. Refining dt fourfold AT CONSTANT SIMULATED TIME -- so a smaller step is a
// REFINEMENT and not a shorter run, which is the trap v3512 caught on blackhole's dt -- moves the threshold
// 0.4574 -> 0.4018 -> 0.4018. *** IT CONVERGES TO A NONZERO FLOOR AND THE LAST TWO ARE IDENTICAL. *** No step
// size makes the shipped viscosity sufficient.
//
// IT IS THE SOUND SPEED. c = 8 / 15 / 30 moves the threshold 0.1242 / 0.4586 / 0.8304 -- a factor of 6.7
// across a factor of 3.75 in c.
//
// *** ONE PARAMETER MOVES THE THRESHOLD AND THE OTHER CANNOT, AND THAT CONTRAST IS THE DIAGNOSIS. *** A
// threshold that scales with the sound speed and survives time-step refinement is the signature of MISSING
// PHYSICAL DISSIPATION rather than of an integrator overstepping -- which is what the standard SPH artificial
// viscosity (a term proportional to c and h) exists to supply, and this solver has no such term: its viscosity
// is a plain constant the caller passes. THE TWO CURES ARE OPPOSITE, "step it smaller" IS MEASURED TO DO
// NOTHING, and a round that had guessed would have had a fifty-fifty chance of spending itself on the dt.
//
// ---- WHAT IS DELIBERATELY NOT DONE --------------------------------------------------------------------------
//
// THE DEFAULT IS NOT CHANGED. viscosity 0.1 is read by every frozen lab row that touches this solver, and
// moving it is a change to what the device PROMISES -- v3132's battery-change rule, and v3513 left ising's
// temperature-dependent tolerance alone for the same reason. NAMED, MEASURED, NOT SLIPPED IN. Whether the fix
// is a raised default, an artificial-viscosity term proportional to c*h, or a boundary that pushes back, is
// a physics judgement and it is KEITH'S.
"use strict";
import { createSphWorld } from "./sph.js";
import { pathToFileURL } from "node:url";
import { LATTICE, packedDensity } from "./materialKnobs.mjs";

export const G = 9.81;
/** A lid high enough that the first contact is a MEASUREMENT rather than a wall. See lidBudget(). */
export const TALL_LID = 6.0;

function fill(w) {
    const L = LATTICE;
    for (let i = 0; i < L.nx; i++) for (let j = 0; j < L.ny; j++) for (let k = 0; k < L.nz; k++)
        w.addParticle([L.x0 + i * L.spacing, L.y0 + j * L.spacing, L.z0 + k * L.spacing]);
}

function world({ visc = 0.1, c = 15, eos = "tait", h = 0.1, mass = 0.02 } = {}) {
    const o = { h, mass, restDensity: packedDensity(h, mass), stiffness: 8, viscosity: visc,
                gravity: [0, -G, 0], eos, gamma: 7 };
    if (eos === "tait") o.soundSpeed = c;
    const w = createSphWorld(o); fill(w); return w;
}

/** KE + PE per particle. THE ONLY STATISTIC THAT SEPARATES "converting potential energy" FROM "creating it". */
export function mechanicalEnergy(w) {
    const P = w.particles, n = P.length;
    const ke = P.reduce((s, p) => s + 0.5 * (p.vx * p.vx + p.vy * p.vy + p.vz * p.vz), 0) / n;
    const pe = P.reduce((s, p) => s + G * p.y, 0) / n;
    return { ke, pe, total: ke + pe };
}

/**
 * The budget over time. A COLLAPSING COLUMN GAINS KINETIC ENERGY FROM POTENTIAL ENERGY AND CREATES NOTHING --
 * reading KE alone cannot tell that from an instability, which is why the first probe of this round measured
 * the wrong quantity and the second one settled it.
 */
export function energyBudget({ visc = 0.1, c = 15, T = 2.0, dt = 1 / 1000, lidY = TALL_LID, samples = 5 } = {}) {
    const w = world({ visc, c });
    const BOX = [0, 0, 0, 0.6, lidY, 0.6];
    const n = Math.round(T / dt), every = Math.max(1, Math.floor(n / samples));
    const rows = [{ step: 0, ...mechanicalEnergy(w) }];
    for (let t = 0; t < n; t++) { w.step(dt, BOX); if ((t + 1) % every === 0) rows.push({ step: t + 1, ...mechanicalEnergy(w) }); }
    const ys = w.particles.map((p) => p.y);
    const finite = ys.every(Number.isFinite);
    return { rows, finite, top: finite ? Math.max(...ys) : NaN, lidY,
             ratio: finite ? rows[rows.length - 1].total / rows[0].total : Infinity };
}

/** E(T)/E(0). ratio > 1 IS the instability -- a physical boundary, so nothing here is a chosen tolerance. */
export function energyRatio({ visc = 0.1, c = 15, T = 1.0, dt = 1 / 1000 } = {}) {
    const w = world({ visc, c });
    const BOX = [0, 0, 0, 0.6, TALL_LID, 0.6];
    const e0 = mechanicalEnergy(w).total;
    const n = Math.round(T / dt);
    for (let t = 0; t < n; t++) w.step(dt, BOX);
    if (!w.particles.every((p) => Number.isFinite(p.y))) return Infinity;
    return mechanicalEnergy(w).total / e0;
}

/**
 * Bisect for the viscosity at which the solver stops inventing energy.
 *
 * *** SIMULATED TIME IS HELD CONSTANT AND NOT STEP COUNT. *** Halving dt at a fixed step count halves the run
 * and truncates the question rather than refining it -- v3512 registered dt as a refinement knob on exactly
 * that mistake and had to retract it.
 */
export function viscosityThreshold({ c = 15, dt = 1 / 1000, T = 1.0, lo = 0.01, hi = 40, steps = 6 } = {}) {
    let a = lo, b = hi;
    for (let i = 0; i < steps; i++) {
        const m = Math.sqrt(a * b);
        if (energyRatio({ visc: m, c, dt, T }) > 1) a = m; else b = m;
    }
    return { threshold: Math.sqrt(a * b), bracket: [a, b], c, dt, T, cfl: c * dt / 0.1 };
}

/** How long v3541's "free" lid stays free. A BOX THE FLUID DOES NOT REACH IS A CLAIM WITH A STEP BUDGET. */
export function lidBudget({ lidY = 3.0, visc = 0.1, c = 15, dt = 1 / 1000, marks = [1200, 2000] } = {}) {
    const w = world({ visc, c });
    const BOX = [0, 0, 0, 0.6, lidY, 0.6];
    const out = []; let done = 0;
    for (const m of marks.slice().sort((x, y) => x - y)) {
        for (; done < m; done++) w.step(dt, BOX);
        const top = Math.max(...w.particles.map((p) => p.y));
        out.push({ step: m, top, gap: lidY - top });
    }
    return { lidY, marks: out };
}

/**
 * The settled state, and the free-surface attempt on it.
 *
 * *** perCellFull IS DERIVED FROM THE MATERIAL AND NOT FROM THE STATE BEING JUDGED: a cell of side h at rest
 * density holds rho0 * h^3 / mass particles. *** That is a fact about the fluid, so freeSurface's own rule --
 * the caller knows how full a cell is, the function does not get to decide -- is satisfied without letting a
 * collapsed fluid redefine "full" and then pass.
 */
export function settledSurface({ visc = 3, c = 15, T = 3.0, dt = 1 / 1000, h = 0.1, mass = 0.02, frac = 0.5 } = {}) {
    const rho0 = packedDensity(h, mass);
    const perCellFull = rho0 * h * h * h / mass;
    const w = world({ visc, c, h, mass });
    const BOX = [0, 0, 0, 0.6, TALL_LID, 0.6];
    const n = Math.round(T / dt);
    for (let t = 0; t < n; t++) w.step(dt, BOX);
    const P = w.particles;
    const cnt = new Map();
    for (const p of P) {
        const k = Math.floor(p.x / h) + "," + Math.floor(p.y / h) + "," + Math.floor(p.z / h);
        cnt.set(k, (cnt.get(k) || 0) + 1);
    }
    const top = new Map();
    for (const [k, v] of cnt) {
        if (v < frac * perCellFull) continue;
        const [cx, cy, cz] = k.split(",").map(Number);
        const col = cx + "," + cz;
        if (!top.has(col) || cy > top.get(col)) top.set(col, cy);
    }
    const ys = [...top.values()];
    const mean = ys.reduce((a, b) => a + b, 0) / Math.max(1, ys.length);
    const sd = Math.sqrt(ys.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, ys.length));
    const volume = P.length * mass / rho0;
    const footprint = top.size * h * h;
    const ke = P.reduce((s, p) => s + 0.5 * (p.vx * p.vx + p.vy * p.vy + p.vz * p.vz), 0) / P.length;
    const predictedCells = volume / footprint / h, observedCells = mean + 1;
    return { visc, perCellFull, columns: top.size, meanCell: mean, sd, ke,
             predictedCells, observedCells,
             errFrac: Math.abs(observedCells - predictedCells) / predictedCells };
}

// ---- THE REGISTER. RECORDED; THE GATE RE-DERIVES EVERY NUMBER RATHER THAN QUOTING IT. -----------------------
export const MEASURED_V3542 = {
    shippedViscosity: 0.1,
    budgetAtShipped: [3.679, 5.333, 8.584, 11.916, 16.215],   // KE+PE per particle, 400-step marks
    threshold: { c15dt1e3: [0.4532, 0.4698] },
    // *** ADDED v3542 BY A SECOND SURFACE THAT BUILT THIS SAME ROUND AND DELETED ITS DUPLICATE (v3511's
    // precedent). THE ONE THING IT CARRIED THAT THIS FILE DID NOT: the threshold was refined against dt and
    // swept against c, AND NOBODY REFINED THE HORIZON. It moves. The two brackets DO NOT OVERLAP. ***
    thresholdByHorizon: { "T=1": [0.4287, 0.4881], "T=4": [0.4881, 0.5556] },
    ratioAt0p47: { "T=1": 0.7755, "T=2": 0.8182, "T=4": 1.0631 },
    soundSpeedSweep: { 8: 0.1242, 15: 0.4586, 30: 0.8304 },
    dtRefinement: { "1e-3": 0.4574, "5e-4": 0.4018, "2.5e-4": 0.4018 },
    freeLidBudget: { lidY: 3.0, topAt1200: 2.60, topAt2000: 2.988 },
    settled: { visc3: { columns: 36, sd: 0, predictedCells: 2.640, observedCells: 2.000 } },
    note: "THE THRESHOLD SCALES WITH THE SOUND SPEED AND SURVIVES A FOURFOLD dt REFINEMENT UNCHANGED -- " +
          "BUT IT DOES **NOT** SURVIVE REFINING THE HORIZON, WHICH IS THE THIRD AXIS AND THE ONE NOBODY " +
          "TESTED: the brackets at T=1 and T=4 are DISJOINT, and viscosity 0.47 reads 0.7755 / 0.8182 / " +
          "1.0631 across T = 1/2/4, crossing back over the boundary once the run is long enough. SO WHAT IS " +
          "REGISTERED IS A THRESHOLD-AT-A-HORIZON AND NOT A THRESHOLD, and a gate frozen on the number would " +
          "have pinned a run length wearing a physical constant. One " +
          "parameter moves it and the other cannot, and that contrast is what separates missing physical " +
          "dissipation from an integrator overstepping. THE TWO CURES ARE OPPOSITE.",
};

// *** MEASURED AT v3542, AND IT IS THE SECOND INSTANCE OF A PATTERN v3541 NAMED ONCE. ***
// graveyard-selfcheck reads 103 orphaned utilities BOTH ROUNDS -- unchanged -- WHILE THE MEMBERSHIP MOVED BY
// ONE IN EACH DIRECTION BOTH TIMES. At v3541 tools/ship/floors.mjs came OFF (materialKnobs became its first
// consumer outside its own gate) and materialKnobs went ON; at v3542 materialKnobs came OFF (this file imports
// its LATTICE and packedDensity) and this file went ON. *** A COUNT THAT DID NOT MOVE ACROSS TWO ROUNDS IN
// WHICH FOUR MODULES CHANGED CLASSIFICATION IS NOT WATCHING ANYTHING. *** And both new modules landed in the
// list DESPITE CARRYING A FRONT DOOR, because graveyard's classifier does not read reportingTools -- a third
// legitimate shape it cannot name, after a graded physics module and a per-call analysis primitive. REPORTED
// AND NOT RE-FROZEN: a blanket re-freeze cannot tell "nothing moved" from "everything moved and I stopped
// looking", and these two rounds are the proof, since the count did not move while the list did. Twice.
export const GRAVEYARD_CHURN_V3542 = {
    countBothRounds: 103, baseline: 100,
    v3541: { off: "tools/ship/floors.mjs", on: "physics/sph/materialKnobs.mjs" },
    v3542: { off: "physics/sph/materialKnobs.mjs", on: "physics/sph/stability.mjs" },
    why: "the classifier does not read reportingTools, so a module with a front door still reads as debt",
};

export const STILL_BLOCKED = {
    freeSurfaceScore:
        "*** THE BLOCKER MOVED RATHER THAN CLEARED, AND THE NEW ONE IS A FIXTURE SIZE. *** Above the threshold " +
        "the column DOES settle (KE falls to ~4e-5 and total energy decreases monotonically), so v3541's " +
        "'neither equation of state produces a resting column' is answered: one of them does, at a viscosity " +
        "four times the shipped default. BUT THE SETTLED STATE IS A TWO-CELL PUDDLE SPREAD OVER THE WHOLE BOX " +
        "FLOOR, and at that depth levelness reads sd EXACTLY 0.0000 across all 36 columns -- WHICH IS THE " +
        "SIGNATURE OF THE BUG v3540 SHIPPED AND THEN CAUGHT, where the statistic was measuring the container " +
        "rather than the fluid. A surface resolved to a cell has a spread floor set by THE GRID, and with two " +
        "cells of depth there is nothing left for the physics to say. The volume claim carries a 24% shortfall " +
        "for the same reason (2.000 observed against 2.640 predicted). WHAT IS OWED IS A FIXTURE WHOSE SETTLED " +
        "DEPTH IS MANY CELLS -- more particles or a smaller h against the same box -- and that is its own round.",
};

// ---- FRONT DOOR ---------------------------------------------------------------------------------------------
export function reportLines({ live = true } = {}) {
    const L = [];
    L.push("[stability] THE SPH COLUMN WAS NEVER FAILING TO SETTLE -- IT WAS MANUFACTURING ENERGY");
    L.push("");
    L.push("  At the shipped viscosity " + MEASURED_V3542.shippedViscosity + ", KE+PE per particle over 2000 steps:");
    L.push("    " + MEASURED_V3542.budgetAtShipped.join("  ->  ") + "   *** IT QUADRUPLES ***");
    L.push("  Gravity is the only external force and the wall clamp is LOSSY (restitution 0.3), so it can only");
    L.push("  ever REMOVE energy. There is nowhere for that to come from.");
    if (live) {
        const b = energyBudget({ T: 1.0, samples: 2 });
        L.push("    MEASURED NOW (1.0s): E(T)/E(0) = " + b.ratio.toFixed(4) + ", topmost particle " + b.top.toFixed(3) +
               " under a lid at " + b.lidY + (b.ratio > 1 ? "   -- ENERGY CREATED" : ""));
    }
    L.push("");
    L.push("  THE KEY IS A BIFURCATION, and its boundary is PHYSICAL rather than chosen: E(T)/E(0) > 1.");
    L.push("    viscosity threshold at c=15, dt=1e-3:  [" + MEASURED_V3542.threshold.c15dt1e3.join(", ") + "]");
    L.push("    THE SHIPPED DEFAULT IS " + MEASURED_V3542.shippedViscosity + " -- ABOUT A FACTOR OF 4.6 BELOW IT.");
    L.push("");
    L.push("  IT IS NOT THE TIME STEP (simulated time held constant, so smaller dt is a REFINEMENT):");
    for (const [k, v] of Object.entries(MEASURED_V3542.dtRefinement)) L.push("    dt " + k.padEnd(8) + " -> " + v);
    L.push("    *** IT CONVERGES TO A NONZERO FLOOR AND THE LAST TWO ARE IDENTICAL. ***");
    L.push("  IT IS THE SOUND SPEED:");
    for (const [k, v] of Object.entries(MEASURED_V3542.soundSpeedSweep)) L.push("    c " + k.padEnd(8) + " -> " + v);
    L.push("  " + MEASURED_V3542.note);
    L.push("");
    L.push("  STILL BLOCKED: " + STILL_BLOCKED.freeSurfaceScore.slice(0, 260) + "...");
    L.push("  THE DEFAULT IS NOT CHANGED: every frozen lab row that touches this solver reads it, and moving it");
    L.push("  is a change to what the device PROMISES. Named and measured, not slipped in.");
    return L;
}

// A REPORTING TOOL MUST PRINT AND EXIT ZERO; the gate beside it is what exits nonzero.
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) { for (const l of reportLines()) console.log(l); process.exit(0); }
