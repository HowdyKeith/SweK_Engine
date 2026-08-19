// physics/sph/materialKnobs.mjs
//
// v3541 -- WHICH PARAMETERS OF THIS FLUID ARE MATERIAL, AND THE OBSERVABLE THAT ANSWERED WAS THE CONTAINER.
//
// v3540 closed with a next round: "viscosity and surface tension as MEASURED knobs (Flip2D already carries
// stflip/stSubsteps), each proven live by knobMoves". *** THAT SENTENCE IS WRONG TWICE AND BOTH HALVES ARE
// CORRECTED HERE. ***
//
//   1. ST-FLIP IS **SPACETIME**, NOT SURFACE TENSION. flip2d.mjs says so in its own words at the seam:
//      "motion-blur the deposit across the time-slab ... the SIGGRAPH 2026 ST-FLIP large-time-step technique".
//      A two-letter abbreviation was read as the words the sentence wanted. There is no surface tension
//      anywhere in this tree, and the only occurrence of the phrase was that proposal.
//   2. Flip2D EXPOSES NO MATERIAL PARAMETER AT ALL. Every one of its options is numerical -- flipRatio, iters,
//      solver, omega, overRelax, stflip, stSubsteps, twoWay, forceScale -- which is what an incompressible
//      projection solver IS. So the knobs cannot live where the free-surface score lives.
//
// THE MATERIAL PARAMETERS LIVE ON SPH, AND THE CENSUS BELOW IS ABOUT THEM. Four findings, each measured:
//
// *** A. THREE OF THE FOUR CANDIDATES COULD NOT REACH THE SOLVER THROUGH THE TREE'S OWN HARNESS. ***
//   makeColumn's signature carried neither `viscosity` nor `gamma` -- it hardcoded viscosity 0.1 and never
//   mentioned gamma -- and it dropped `soundSpeed` unless eos === "tait". Proven by reading world.opts back
//   rather than by reading source: gamma 5 in, gamma 7 out. So a sweep over gamma reported EXACTLY ZERO
//   movement and gamma would have been registered VACUOUS -- and gamma is LIVE. That is kepler's dead `mu`
//   (v3517) in the fluid: INVARIANT BECAUSE UNREAD. makeColumn now passes both, defaults unchanged.
//
// *** B. WHICH KNOBS EXIST IS A PROPERTY OF THE EQUATION OF STATE, NOT OF THE FLUID. ***
//   pressureOf has two branches: ideal reads `stiffness`, tait reads `_taitB` and `gamma`. So each law's
//   parameters are EXACTLY VACUOUS under the other -- 0.000e+0, structurally rather than numerically, which is
//   why v3537's `rel > 1e-9` float-dust hole cannot arise here. A register listing "the SPH material knobs"
//   without naming the law would be wrong half the time (v3137: a device's modes do not share assumptions
//   just because they share a device).
//
// *** C. THE HEADLINE OBSERVABLE IS A MEASUREMENT OF THE LID. ***
//   Under tait the column expands until it touches the ceiling and stops. At the shipped BOX the topmost
//   particle sits ONE MILLIMETRE below y = 1.2 -- a hundredth of a smoothing length -- and raising the lid
//   moves `retained` straight up with it. MEASURED_V2881's three tait rows agree across c = 8/15/25 not
//   because the fluid ignores sound speed but because ALL THREE ARE PRESSED FLAT AGAINST THE SAME CEILING.
//   *** AND THE CENSUS INVERTS WHEN THE LID IS RAISED: soundSpeed goes from the WEAKEST knob to the STRONGEST.
//   A knob census run in the shipped container would have ranked the most important material parameter last.
//   *** stiffness reads EXACTLY ZERO IN BOTH BOXES, which is the control: it proves the vacuity verdict is a
//   property of the equation of state and NOT an artefact of the container.
//
// *** D. restDensity IS REFUSED, AND THE REFUSAL IS A NEW SPECIES FOR THIS REGISTER. ***
//   It is not vacuous -- moved alone it DESTROYS the answer -- and it is not live either. Scale `mass` with it
//   so the lattice still delivers rho0 and the answer is invariant across a sevenfold range. rho0 is a
//   statement about the PACKING, so a fluid-type selector keyed on density alone changes nothing when it is
//   done right and collapses the column when it is done wrong. NEITHER A NUISANCE KNOB NOR A REFINEMENT KNOB:
//   A CONSTRAINT BETWEEN TWO PARAMETERS. hydrostatic.mjs's own v2883 correction says exactly this in prose
//   ("rest density MUST equal m/d^3 for the lattice being built") where nothing re-derives it.
//
// *** AND THAT IS WHY THE FREE-SURFACE SCORE IS NOT USED HERE, WHICH IS THE ROUND'S REAL ANSWER TO ITS OWN
// PROPOSAL. *** A free surface is only level if the liquid is AT REST. Measured: under ideal the column is
// still collapsing at 3000 steps (monotone, 1.157 -> 0.307); under tait at the shipped lid it is stationary
// only because it is against the ceiling; under tait in a free box it wanders by ~15% and is not monotone.
// NEITHER EQUATION OF STATE PRODUCES A RESTING COLUMN, so there is nothing for a level surface to be level
// about. The score was never the missing half -- A SETTLED COLUMN IS.
"use strict";
import { createSphWorld } from "./sph.js";
import { knobMoves } from "../../tools/ship/floors.mjs";
import { pathToFileURL } from "node:url";

/** The lattice makeColumn builds, restated here so the census does not depend on its defaults drifting. */
export const LATTICE = { spacing: 0.05, nx: 7, ny: 14, nz: 7, x0: 0.15, y0: 0.05, z0: 0.15 };

/** The shipped container. hydrostatic.mjs's BOX, and finding C is about its lid. */
export const SHIPPED_LID = 1.2;
/** A lid the fluid does not reach, DERIVED from the measurement rather than chosen: see lidReach(). */
export const FREE_LID = 3.0;

export const CANDIDATES = ["stiffness", "viscosity", "gamma", "soundSpeed"];

function fill(w) {
    const L = LATTICE;
    for (let i = 0; i < L.nx; i++) for (let j = 0; j < L.ny; j++) for (let k = 0; k < L.nz; k++)
        w.addParticle([L.x0 + i * L.spacing, L.y0 + j * L.spacing, L.z0 + k * L.spacing]);
}

/**
 * The density this packing ACTUALLY delivers, with gravity off. This is the quantity restDensity has to equal,
 * and measuring it is why makeColumn measures it too -- see the refusal below.
 */
export function packedDensity(h = 0.1, mass = 0.02) {
    const p = createSphWorld({ h, mass, restDensity: 1, gravity: [0, 0, 0] });
    fill(p); p.computeDensity();
    const interior = p.particles.filter((q) => q.y > 0.15 && q.y < 0.6).map((q) => q.rho);
    return interior.reduce((a, b) => a + b, 0) / interior.length;
}

/**
 * A floors.mjs-shaped spec, so the instrument is knobMoves rather than a sweep written here. `lidY` is a
 * FIRST-CLASS PARAMETER of the spec and not a constant, because finding C is that the answer depends on it.
 */
export function columnSpec({ eos = "tait", lidY = SHIPPED_LID, steps = 1200, dt = 1 / 1000 } = {}) {
    const spec = {
        id: `sph-column-${eos}-lid${lidY}`,
        nominal: { h: 0.1, mass: 0.02, stiffness: 8, viscosity: 0.1, gamma: 7, soundSpeed: 15, eos, lidY, steps, dt },
        knobs: eos === "tait" ? ["viscosity", "gamma", "soundSpeed"] : ["viscosity", "stiffness"],
        vacuousKnobs: eos === "tait"
            ? { stiffness: "pressureOf's tait branch reads _taitB and gamma and never reads stiffness. EXACTLY 0.000e+0, structural rather than numerical." }
            : { gamma: "pressureOf's ideal branch is k(rho - rho0); gamma appears only in the tait branch. EXACTLY 0.000e+0.",
                soundSpeed: "the ideal law has no sound speed; makeColumn does not even pass it. EXACTLY 0.000e+0." },
        measure(k = {}) {
            const c = { ...spec.nominal, ...k };
            const rho0 = c.restDensity != null ? c.restDensity : packedDensity(c.h, c.mass);
            const o = { h: c.h, mass: c.mass, restDensity: rho0, stiffness: c.stiffness, viscosity: c.viscosity,
                        gravity: [0, -9.81, 0], eos: c.eos, gamma: c.gamma };
            if (c.eos === "tait") o.soundSpeed = c.soundSpeed;
            const w = createSphWorld(o); fill(w);
            const y0 = w.particles.map((p) => p.y);
            const h0 = Math.max(...y0) - Math.min(...y0);
            const BOX = [0, 0, 0, 0.6, c.lidY, 0.6];
            for (let t = 0; t < c.steps; t++) w.step(c.dt, BOX);
            const ys = w.particles.map((p) => p.y);
            if (!ys.every(Number.isFinite)) return NaN;
            return (Math.max(...ys) - Math.min(...ys)) / h0;      // `retained`, the column's shipped observable
        },
    };
    return spec;
}

/** knobMoves over every candidate. THE VERDICT IS THE RATIO, NEVER AN ABSOLUTE FLOOR (v3537). */
export function census({ eos = "tait", lidY = SHIPPED_LID, eps = 0.2, steps = 1200 } = {}) {
    const spec = columnSpec({ eos, lidY, steps });
    const rows = CANDIDATES.map((knob) => {
        const r = knobMoves(spec, knob, eps);
        return { knob, rel: r.relativeMovement, base: r.base, moved: r.moved,
                 verdict: r.relativeMovement === 0 ? "EXACTLY VACUOUS" : "live" };
    });
    const live = rows.filter((r) => r.verdict === "live");
    return {
        eos, lidY, eps, rows,
        // The ORDERING is the finding, not the magnitudes: the lid changes which knob comes first.
        ranking: live.slice().sort((a, b) => b.rel - a.rel).map((r) => r.knob),
        vacuous: rows.filter((r) => r.verdict !== "live").map((r) => r.knob),
    };
}

/**
 * IS THE COLUMN TOUCHING THE LID? The gap is reported IN SMOOTHING LENGTHS, so "touching" is derived from the
 * solver's own scale rather than from a distance somebody picked.
 */
export function lidReach({ lidY = SHIPPED_LID, steps = 1200, eos = "tait", h = 0.1 } = {}) {
    const rho0 = packedDensity(h, 0.02);
    const o = { h, mass: 0.02, restDensity: rho0, stiffness: 8, viscosity: 0.1,
                gravity: [0, -9.81, 0], eos, gamma: 7 };
    if (eos === "tait") o.soundSpeed = 15;
    const w = createSphWorld(o); fill(w);
    const y0 = w.particles.map((p) => p.y);
    const h0 = Math.max(...y0) - Math.min(...y0);
    const BOX = [0, 0, 0, 0.6, lidY, 0.6];
    for (let t = 0; t < steps; t++) w.step(1 / 1000, BOX);
    const ys = w.particles.map((p) => p.y);
    const top = Math.max(...ys);
    return { lidY, top, gap: lidY - top, gapInH: (lidY - top) / h, retained: (top - Math.min(...ys)) / h0, h0 };
}

/**
 * THE REFUSAL, MEASURED FROM BOTH SIDES. Moved alone, rho0 destroys the answer; moved WITH the mass that makes
 * the packing deliver it, the answer does not move. A parameter with those two properties is a CONSTRAINT.
 */
export function restDensityProbe({ values = [200, 400, 1000], steps = 1200, lidY = SHIPPED_LID } = {}) {
    const spec = columnSpec({ eos: "tait", lidY, steps });
    const packed = packedDensity();
    const rows = values.map((rho0) => ({
        rho0,
        alone: spec.measure({ restDensity: rho0 }),
        compensated: spec.measure({ restDensity: rho0, mass: 0.02 * rho0 / packed }),
    }));
    const spread = (xs) => { const f = xs.filter(Number.isFinite); return f.length ? Math.max(...f) - Math.min(...f) : Infinity; };
    const nominal = spec.measure();
    return { packed, nominal, rows,
             aloneSpread: spread([nominal, ...rows.map((r) => r.alone)]),
             compensatedSpread: spread([nominal, ...rows.map((r) => r.compensated)]) };
}

// ---- THE REGISTER ------------------------------------------------------------------------------------------
//
// RECORDED, AND THE GATE RE-DERIVES EVERY NUMBER RATHER THAN QUOTING IT -- a register of verdicts is exactly
// the kind of file that rots (v3512), and this one is being written in the same round that found the previous
// proposal wrong twice.
export const MEASURED_V3541 = {
    eps: 0.2, steps: 1200, observable: "retained = settled height / start height",
    ideal: { stiffness: 2.447e-2, viscosity: 1.671e-1, gamma: 0, soundSpeed: 0 },
    taitShippedLid: { viscosity: 2.644e-2, gamma: 3.188e-3, soundSpeed: 8.366e-4, stiffness: 0 },
    taitFreeLid: { viscosity: 1.335e-1, gamma: 2.766e-1, soundSpeed: 3.619e-1, stiffness: 0 },
    lidGap: { 1.2: 0.0010, 1.6: 0.0356, 2.0: 0.0313, 3.0: 0.8019 },
    note: "AT THE SHIPPED LID soundSpeed IS THE WEAKEST KNOB AND AT A FREE LID IT IS THE STRONGEST -- a 433x " +
          "suppression that INVERTS the ranking. stiffness is exactly 0 in both, which is the control.",
};

export const REFUSED_KNOBS = {
    restDensity: {
        species: "CONSTRAINT",
        why: "*** NOT A MATERIAL PARAMETER OF THIS SOLVER. *** rho0 is a statement about the PARTICLE PACKING: " +
             "the lattice delivers a density and the pressure law is written relative to it. Moved ALONE it " +
             "does not shift the material, it desynchronises the fluid from its own particles -- retained " +
             "falls to EXACTLY ZERO at rho0 = 1000, a total collapse. Moved WITH the mass that makes the " +
             "packing deliver it, the answer is invariant across a sevenfold range (mercury against water is " +
             "under one percent on this column). NEITHER VACUOUS NOR LIVE: a constraint between two " +
             "parameters, which is a species this register did not have. hydrostatic.mjs's v2883 correction " +
             "states it in prose -- 'rest density MUST equal m/d^3 for the lattice being built' -- and " +
             "v2494 shipped the opposite reading as a discovery about the engine when it was a discovery " +
             "about the test.",
    },
};

export const NOT_IN_THIS_TREE = {
    surfaceTension: "*** v3540 SAID Flip2D 'ALREADY CARRIES stflip/stSubsteps' AS EVIDENCE OF SURFACE TENSION. " +
                    "ST IS SPACETIME. *** flip2d.mjs's seam comment says what it is: motion-blur the P2G " +
                    "deposit across the time-slab, the SIGGRAPH 2026 large-time-step technique. No surface " +
                    "tension exists anywhere in fluid/ or physics/, and the only occurrence of the phrase was " +
                    "the sentence proposing the round.",
    flipMaterialParameters: "Flip2D's whole option list is numerical (flipRatio, iters, solver, omega, " +
                    "overRelax, stflip, stSubsteps, twoWay, forceScale). AN INCOMPRESSIBLE PROJECTION SOLVER " +
                    "HAS NO MATERIAL PARAMETERS TO SWEEP, which is why the knobs and the free-surface score " +
                    "are on different solvers.",
};

// ---- FRONT DOOR -------------------------------------------------------------------------------------------
export function reportLines({ live = true } = {}) {
    const L = [];
    L.push("[materialKnobs] WHICH FLUID PARAMETERS ARE MATERIAL -- and the observable that answered was the container");
    L.push("");
    L.push("  WHICH KNOBS EXIST IS A PROPERTY OF THE EQUATION OF STATE (relative movement at eps = " +
           MEASURED_V3541.eps + ", observable: " + MEASURED_V3541.observable + ")");
    L.push("    knob          ideal        tait @ lid 1.2   tait @ lid 3.0");
    for (const k of CANDIDATES) {
        const f = (v) => (v === 0 ? "  EXACTLY 0 " : v.toExponential(3));
        L.push("    " + k.padEnd(13) + f(MEASURED_V3541.ideal[k]).padEnd(13) +
               f(MEASURED_V3541.taitShippedLid[k]).padEnd(17) + f(MEASURED_V3541.taitFreeLid[k]));
    }
    L.push("  *** EVERY VACUITY IS EXACTLY ZERO, not float dust: pressureOf's two branches read disjoint");
    L.push("      parameters, so v3537's `rel > 1e-9` hole cannot arise here. ***");
    L.push("");
    L.push("  THE LID: " + MEASURED_V3541.note);
    if (live) {
        const r = lidReach({ lidY: SHIPPED_LID });
        L.push("    MEASURED NOW at the shipped BOX lid y=" + SHIPPED_LID + ": topmost particle " + r.top.toFixed(4) +
               ", gap " + r.gap.toFixed(4) + " = " + r.gapInH.toFixed(3) + " smoothing lengths, retained " +
               r.retained.toFixed(4));
        L.push("    *** THE COLUMN IS AGAINST THE CEILING. `retained` IS A MEASUREMENT OF THE BOX. ***");
    }
    L.push("");
    L.push("  REFUSED: restDensity -- " + REFUSED_KNOBS.restDensity.species);
    L.push("    " + REFUSED_KNOBS.restDensity.why.slice(0, 220) + "...");
    L.push("");
    L.push("  NOT IN THIS TREE: surface tension (ST-FLIP is SPACETIME), and Flip2D has no material parameter at all.");
    L.push("  CONSEQUENCE: the free-surface score needs a SETTLED liquid and neither equation of state produces one.");
    L.push("               The score was never the missing half. A SETTLED COLUMN IS.");
    return L;
}

// A REPORTING TOOL MUST PRINT AND EXIT ZERO; the gate beside it is what exits nonzero.
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) { for (const l of reportLines()) console.log(l); process.exit(0); }
