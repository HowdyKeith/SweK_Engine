// tools/roundhouse/cflBind.mjs -- v3774
//
// *** TIER 2. physics/sph/cfl.js was ungraded, and the obvious key is a MIRROR: cflStep() returns the dt that
// would hit a target courant and cflNumber() reads that courant back out. Feeding one into the other is a
// round trip through a single formula and proves nothing. THE NON-MIRROR QUESTION IS WHETHER THE BOUNDARY IS
// REAL -- whether a simulation stepped across it actually goes unstable -- and that is a fact about the
// INTEGRATOR, not about the arithmetic. ***
//
// *** IT IS REAL, AND IT IS NOT THE ONE THE SHIPPED CHECK MEASURES. Stepping a 216-particle Tait world and
// sweeping dt, the blow-up tracks h/c AND NOT h/maxSpeed:
//     c = 15   h/c = 6.67e-3   breaks between 0.002 and 0.003
//     c = 30   h/c = 3.33e-3   breaks between 0.001 and 0.002
//     c = 60   h/c = 1.67e-3   breaks between 0.0005 and 0.001
// THE BREAK dt HALVES WHEN c DOUBLES, and break/(h/c) stays near 0.45-0.60 while the max particle speed barely
// moves. For a WEAKLY-COMPRESSIBLE fluid the fastest signal is the artificial SOUND wave, not the flow. ***
//
// *** SO THE SHIPPED cflNumber IS OPTIMISTIC BY ROUGHLY c / maxSpeed. At c = 15 with a max particle speed near
// 3.6 that is A FACTOR OF FOUR: it reports courant 0.072 at dt = 0.002 where the acoustic courant is 0.30.
// THAT IS NOT CALLED A BUG HERE. cflNumber's own documented job is the ADVECTIVE courant, and its `ok` still
// requires finiteness; what this device adds is the ACOUSTIC number beside it, so the gap is a reported
// quantity rather than a thing a reader has to know. ***

import { createSphWorld } from "../../physics/sph/sph.js";
import { cflNumber, cflStep } from "../../physics/sph/cfl.js";

export const CFL_OBSERVABLES = [
    "acousticCourant", "advectiveCourant", "optimismFactor", "maxSpeed", "soundSpeed",
    "breakDt", "lastGoodDt", "breakOverHOverC", "scalesWithC", "allFinite", "finiteButBroken",
    "h", "dt", "steps", "particles",
    // v4085 -- COMPLETED: ratioSpread -- the device's OWN plantFlips target -- and ladder (the per-regime
    // sweep table it is computed from) were returned by sweep/advectiveonly and never declared. Same defect
    // as v3850/v4082/v4084.
    "ratioSpread", "ladder",
];

export const CFL_MODES = ["sweep", "acoustic", "runaway", "advectiveonly"];

const DEF = { h: 0.1, mass: 0.02, soundSpeed: 15, visc: 0.1, dt: 0.002, steps: 200, n: 6 };
const G = 9.81;

export function cflDefaults(hyp) {
    const h = { mode: "acoustic", ...(hyp || {}) };
    const c = { ...DEF, ...(h.config || {}) };
    const num = (v, d) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : d);
    c.h = Math.min(0.5, Math.max(0.02, num(c.h, DEF.h)));
    c.soundSpeed = Math.min(200, Math.max(1, num(c.soundSpeed, DEF.soundSpeed)));
    c.dt = Math.min(0.05, Math.max(1e-5, num(c.dt, DEF.dt)));
    c.steps = Math.min(2000, Math.max(20, num(c.steps, DEF.steps) | 0));
    c.n = Math.min(10, Math.max(3, num(c.n, DEF.n) | 0));   // n^3 particles; the dense matrix of cost is O(n^6)
    h.config = c;
    if (!CFL_MODES.includes(h.mode)) h.mode = "acoustic";
    return h;
}

const packedDensity = (h, m) => m / Math.pow(h / 1.3, 3);
const BOX = [0, 0, 0, 0.6, 3.0, 0.6];

function makeWorld(c) {
    const w = createSphWorld({ h: c.h, mass: c.mass, restDensity: packedDensity(c.h, c.mass), stiffness: 8,
                               viscosity: c.visc, gravity: [0, -G, 0], eos: "tait", gamma: 7, soundSpeed: c.soundSpeed });
    for (let i = 0; i < c.n; i++) for (let j = 0; j < c.n; j++) for (let k = 0; k < c.n; k++) {
        w.addParticle([0.15 + i * 0.07, 0.15 + j * 0.07, 0.15 + k * 0.07]);
    }
    return w;
}

/** Step a fresh world and report what the two courant numbers say about it. */
function run(c, dt, soundSpeed) {
    const w = makeWorld({ ...c, soundSpeed });
    for (let t = 0; t < c.steps; t++) w.step(dt, BOX);
    const adv = cflNumber(w, c.h, dt);
    return { maxSpeed: adv.maxSpeed, advective: adv.courant,
             acoustic: (soundSpeed * dt) / c.h,
             allFinite: w.particles.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)) };
}

const DT_LADDER = [0.0005, 0.001, 0.002, 0.003, 0.004, 0.005, 0.007, 0.01];
const RUNAWAY_SPEED = 20;   // an order above the free-fall speeds this fixture reaches honestly

/** The dt where this world stops behaving, found by walking the ladder. */
function findBreak(c, soundSpeed) {
    let lastGood = null, breakDt = null;
    for (const dt of DT_LADDER) {
        const r = run(c, dt, soundSpeed);
        if (r.maxSpeed < RUNAWAY_SPEED) lastGood = dt; else { breakDt = dt; break; }
    }
    return { lastGood, breakDt };
}

export async function buildCfl(hyp, base = {}) {
    const h = cflDefaults({ ...hyp, config: { ...(hyp && hyp.config), ...base } });
    const c = h.config;
    const out = { h: c.h, dt: c.dt, steps: c.steps, particles: c.n * c.n * c.n, soundSpeed: c.soundSpeed };

    if (h.mode === "runaway") {
        // *** THE BLINDNESS WORTH REPORTING: A RUNAWAY IS ALL FINITE. Stepped far past the limit this fixture
        // reaches speeds around 1e13 and EVERY COORDINATE IS STILL A FINITE FLOAT -- so a check asking only
        // "did it produce NaN", which is the check most people reach for, PASSES A COMPLETELY BROKEN RUN. ***
        //
        // *** v4193 -- THE STEP WAS 0.02 AND THE DEMONSTRATION HAD STOPPED DEMONSTRATING. *** Two upstream
        // changes to the SPH core landed after this fixture was chosen -- f350286's direct-indexed spatial grid
        // (crossover 1000 -> 128) and 1efe978's pinned equation of state -- and TOGETHER THEY MADE THE SOLVER
        // STABLE AT ACOUSTIC COURANT 3.0, which is where dt = 0.02 sits. MEASURED on the shipped module: at
        // courant 3.0 the run tops out at 1.75e2 and stays bounded even at 2000 steps (1.12e2), so
        // `finiteButBroken` -- the whole point of this mode -- had quietly become FALSE. Proven to be the code
        // and not this host by running the fixture at the freeze commit dc04ec4 in a worktree: 8.7966e8 there,
        // bit-identical to the frozen row, on the same machine and the same Node.
        //
        // THE FIX IS THE STEP, NOT THE THRESHOLD. Lowering the 1e4 bar to meet 1.75e2 would be moving the goal
        // posts to keep a green light; the mode's claim is about a run stepped FAR PAST its limit, so the step
        // goes far past the NEW limit. MEASURED across the ladder: courant 4.5 (dt 0.03) -> 5.30e12, courant
        // 7.5 (dt 0.05) -> 1.63e13, courant 15 (dt 0.1) -> 1.74e13, all allFinite. 0.05 is chosen over 0.03 for
        // margin: 4.5 is one rung off the new stability edge and would be a fixture waiting to go quiet again.
        const r = run(c, 0.05, c.soundSpeed);
        out.maxSpeed = r.maxSpeed;
        out.allFinite = r.allFinite;
        out.finiteButBroken = r.allFinite && r.maxSpeed > 1e4;
        out.acousticCourant = r.acoustic;
        out.advectiveCourant = r.advective;
        return out;
    }

    if (h.mode === "sweep" || h.mode === "advectiveonly") {
        // *** THE KEY: THE BREAK POINT SCALES WITH THE SOUND SPEED. Three values of c, and the dt at which the
        // world runs away must move WITH h/c. `advectiveonly` is the plant -- see the device declaration. ***
        const speeds = [c.soundSpeed, c.soundSpeed * 2, c.soundSpeed * 4];
        const rows = speeds.map((s) => {
            const b = findBreak(c, s);
            // The plant predicts the limit from the MAX PARTICLE SPEED instead of the sound speed.
            const probe = run(c, DT_LADDER[2], s);
            const scale = h.mode === "advectiveonly" ? probe.maxSpeed : s;
            return { s, ...b, hOverScale: c.h / scale, ratio: b.breakDt === null ? null : b.breakDt / (c.h / scale) };
        });
        const ratios = rows.map((r) => r.ratio).filter((v) => v !== null);
        const spread = ratios.length > 1 ? (Math.max(...ratios) - Math.min(...ratios)) / Math.min(...ratios) : null;
        out.breakDt = rows[0].breakDt;
        out.lastGoodDt = rows[0].lastGood;
        out.breakOverHOverC = rows[0].ratio;
        // *** A BINARY, BECAUSE "IT SCALES" IS A CLAIM ABOUT THE SHAPE OF THE LAW AND NOT A TOLERANCE. ***
        out.scalesWithC = spread !== null && spread < 0.6;
        out.ratioSpread = spread;
        out.ladder = rows.map((r) => ({ c: r.s, lastGood: r.lastGood, breakDt: r.breakDt, ratio: r.ratio }));
        return out;
    }

    const r = run(c, c.dt, c.soundSpeed);
    out.maxSpeed = r.maxSpeed;
    out.advectiveCourant = r.advective;
    out.acousticCourant = r.acoustic;
    out.optimismFactor = r.advective > 0 ? r.acoustic / r.advective : null;
    out.allFinite = r.allFinite;
    return out;
}

export const cflDevice = {
    modes: CFL_MODES,
    // "sweep" owns the scaling key, so it is the plant's baseline -- but the mode-plant contract compares
    // against the FIRST OTHER mode, so `sweep` must precede `advectiveonly` in this list.
    plantMode: "advectiveonly", plantFlips: "ratioSpread", plantKind: "mode",
    plantIdeal: 0, plantIdealWhy:
        "ratioSpread is how much the measured CFL ratio varies across the swept regimes, and a correct stability limit gives one ratio everywhere, so 0; dropping the acoustic term takes it 0.333 -> 44.1",
    name: "sph-cfl-boundary", observables: CFL_OBSERVABLES,
    build: buildCfl, defaults: cflDefaults,
};
