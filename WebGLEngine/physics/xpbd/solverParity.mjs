// WebGLEngine/physics/xpbd/solverParity.mjs -- v3606
// ---------------------------------------------------------------------------------------------------------------
// TWO CLOTH SOLVERS ARE GATED AGAINST EACH OTHER BYTE-FOR-BYTE, AND THE COMPARISON HAS NEVER RUN THE COLLISION
// PASS. Once it does, they disagree -- and they have disagreed since v3603.
//
// clothStep.js's clothSubstep is the v2661 monolith; clothLoop.js's clothFrame is the GPU-shaped decomposition.
// clothLoop-selfcheck's spine check is that the second reproduces the first EXACTLY over 40 frames, and it
// drives them at radius 0.08. v3604 measured the same 5x5 fixture's closest non-adjacent approach at 0.642478,
// SO THE PASS FIRST FIRES AT r = 0.321239 -- four times the radius that gate uses.
//
// ================================================================================================================
// FINDING 1: THE EQUIVALENCE GATE'S COLLISION COMPARISON IS VACUOUS, AND TWO ROUNDS HAD BOTH HALVES
// ================================================================================================================
//
// MEASURED over 40 frames on that gate's own fixture:
//
//     radius 0.08   frames with pairs   0/40    total pairs   0     <- what the gate uses
//     radius 0.15   frames with pairs   0/40    total pairs   0
//     radius 0.33   frames with pairs   6/40    total pairs  11
//     radius 0.40   frames with pairs  40/40    total pairs 735
//
// `if (radius > 0)` is TRUE, so the branch is entered, findCollisionPairs runs and returns an EMPTY LIST, and
// the collision solve loops over nothing. THE CHECK PASSES THROUGH THE COLLISION CODE WITHOUT EVER SOLVING A
// CONTACT -- the v3541 vacuous-knob shape, one level up: not a parameter nothing reads, a whole PASS nothing
// exercises, inside the check that certifies the two solvers identical.
//
// NEITHER ROUND COULD HAVE SEEN IT ALONE. v3479 chose 0.08 when nothing had measured the activation floor;
// v3604 measured the floor and was asking about the honest radius, not about this gate. THE TWO FACTS SAT ONE
// FILE APART FOR A HUNDRED AND TWENTY-FIVE VERSIONS.
//
// ================================================================================================================
// FINDING 2: RUN IT WHERE THE PASS FIRES AND THE TWO SOLVERS DIVERGE -- SINCE v3603
// ================================================================================================================
//
// v3603 gave clothFrame collisionIterations and collisionCompliance and LEFT clothSubstep HARDCODED at 1 sweep
// and compliance 0. From v3603 to v3605 one solver read the knobs and the other silently did not, so the
// equivalence claim was CONDITIONAL ON THE DEFAULTS with nothing saying so. On v3604's honest drape fixture
// (5x17, r = h/2 = 0.15, 37 real contacts), BEFORE the fix:
//
//     defaults                    BIT-IDENTICAL     0.000e+0
//     collisionIterations 2       DIVERGE           9.437e-15
//     collisionIterations 20      DIVERGE           8.882e-15
//     collisionCompliance 1e-4    DIVERGE           9.914e-3
//     collisionCompliance 1e-3    DIVERGE           5.461e-2      <- 18% OF THE MESH SPACING
//     collisionCompliance 1e-2    DIVERGE           2.232e-2
//
// 5.461e-2 against a spacing of 0.3 is not round-off; it is a different cloth. AND THE SHAPE OF THE FAILURE IS
// THE REASON THE GATE COULD NOT SEE IT: a comparison that only ever runs at the defaults is structurally
// incapable of noticing that ONE OF THE TWO IMPLEMENTATIONS GAINED A PARAMETER.
//
// v3606 gives clothSubstep the same two knobs, defaults unchanged, and the default path is held to a hash
// captured from the PRISTINE v3605 EXTRACT BEFORE THE EDIT -- because a check reading the ?? fallback would
// pass on a knob exposed and then quietly re-defaulted (v3603's own antidote, in the second solver).
//
// WHAT IS NOT CLAIMED: that either solver is right. This is a PARITY instrument -- it says the two agree, and
// v3604's soak is what says whether the setting they agree on is worth shipping. NO DEFAULT MOVED.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import { pathToFileURL } from "node:url";
import { buildClothConstraints } from "./clothMesh.js";
import { colorConstraints } from "./xpbd.js";
import { clothSubstep } from "./clothStep.js";
import { clothFrame } from "./clothLoop.js";
import { findCollisionPairs } from "./selfCollide.js";
import { drape, SPACING, coherenceCeiling, CLOSE_FRAMES } from "./clothSoak.mjs";

export const DT = 0.016, GRAVITY = [0, -10, 0];
export const V3605_DEFAULT_PATH = { pos: "79fa2d70bee94487", vel: "a9360b138c81bad8" };

/** The fixture clothLoop-selfcheck itself uses, rebuilt here so the vacuity is measured and not quoted. */
export function gateScene(W = 5, H = 5) {
    const { cons, adj } = buildClothConstraints(W, H, SPACING, { structural: 0.0, shear: 0.001, bending: 0.01 });
    const N = W * H, pos = new Float64Array(3 * N), vel = new Float64Array(3 * N), invMass = new Float64Array(N);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x;
        pos[3 * i] = x * SPACING; pos[3 * i + 2] = -y * SPACING; invMass[i] = (y === 0) ? 0 : 1;
    }
    return { cons, adj, colors: colorConstraints(cons), init: { pos, vel, invMass }, W, H };
}

/** HOW MANY CONTACTS DOES A GIVEN RADIUS ACTUALLY PRODUCE ON THAT FIXTURE? The answer at 0.08 is none. */
export function contactCensus(radii = [0.08, 0.15, 0.33, 0.4], frames = 40, sc = gateScene()) {
    return radii.map((radius) => {
        const st = { pos: Float64Array.from(sc.init.pos), vel: Float64Array.from(sc.init.vel), invMass: sc.init.invMass };
        let framesWith = 0, total = 0;
        for (let f = 0; f < frames; f++) {
            clothSubstep(st, sc.cons, sc.colors, { dt: DT, iterations: 5, gravity: GRAVITY, radius, adj: sc.adj });
            const p = findCollisionPairs(st.pos, sc.init.invMass.length, 2 * radius, 2 * radius, sc.adj);
            if (p.length) { framesWith++; total += p.length; }
        }
        return { radius, framesWith, frames, total };
    });
}

/**
 * FRAME-LOCKED PARITY on v3604's honest drape: the two solvers are stepped side by side with the SAME pin
 * schedule, so the comparison is between the solvers and not between two different experiments. clothLoop()
 * cannot be used here because it loops internally and the drape's far row moves every frame -- clothFrame is
 * the right level, and it is the same function clothLoop calls.
 */
export function parity(knobs = {}, { hold = 60, radius = coherenceCeiling(), plant = false } = {}) {
    const sc = drape(5, 17, 0.6), W = sc.W, H = sc.H, im = sc.init.invMass, n = sc.init.pos.length;
    const A = { pos: Float64Array.from(sc.init.pos), vel: Float64Array.from(sc.init.vel), invMass: im };
    const B = { pos: Float64Array.from(sc.init.pos), vel: Float64Array.from(sc.init.vel), pred: new Float64Array(n), prev: new Float64Array(n) };
    const O = { dt: DT, iterations: 5, gravity: GRAVITY, radius, adj: sc.adj, ...knobs };
    let contacts = 0;
    for (let f = 0; f < CLOSE_FRAMES + hold; f++) {
        const t = Math.min(1, f / CLOSE_FRAMES), z = sc.z0 + (sc.span - sc.z0) * t;
        for (let x = 0; x < W; x++) { A.pos[3 * ((H - 1) * W + x) + 2] = z; B.pos[3 * ((H - 1) * W + x) + 2] = z; }
        // THE PLANT IS A PARAMETER, NOT A SOURCE EDIT (v3603's idiom): stripping the two keys from the
        // monolith's options reproduces EXACTLY the v3603-to-v3605 state, where clothFrame read them and
        // clothSubstep did not. A gate that could only quote the divergence from a header has not seen it.
        clothSubstep(A, sc.cons, sc.colors, plant ? { ...O, collisionIterations: undefined, collisionCompliance: undefined } : O);
        clothFrame(B, im, sc.cons, sc.colors, O);
        if (f >= CLOSE_FRAMES)
            contacts += findCollisionPairs(A.pos, im.length, 2 * radius, 2 * radius, sc.adj).filter(([i, j]) => im[i] + im[j] > 0).length;
    }
    let maxDiff = 0;
    for (let i = 0; i < A.pos.length; i++) maxDiff = Math.max(maxDiff, Math.abs(A.pos[i] - B.pos[i]));
    return { maxDiff, identical: maxDiff === 0, contacts, radius, knobs, plant };
}

export const KNOB_MATRIX = [
    {}, { collisionIterations: 2 }, { collisionIterations: 20 },
    { collisionCompliance: 1e-4 }, { collisionCompliance: 1e-3 }, { collisionCompliance: 1e-2 },
];

export function parityMatrix(opts = {}) { return KNOB_MATRIX.map((k) => parity(k, opts)); }

export const MEASURED_V3606 = {
    gateRadiusIsVacuous: { radius: 0.08, framesWithPairs: 0, of: 40, activationFloor: 0.321239, source: "v3604" },
    divergenceBeforeTheFix: {
        "collisionIterations 2": 9.437e-15, "collisionIterations 20": 8.882e-15,
        "collisionCompliance 1e-4": 9.914e-3, "collisionCompliance 1e-3": 5.461e-2, "collisionCompliance 1e-2": 2.232e-2,
        spacing: SPACING, worstAsFractionOfSpacing: 0.182,
    },
    verdict: "THE TWO CLOTH SOLVERS ARE GATED AGAINST EACH OTHER BYTE-FOR-BYTE AT A RADIUS WHERE THE COLLISION " +
             "PASS FINDS ZERO PAIRS, so the spine check has never compared the collision path. Run it where the " +
             "pass fires and they diverge by up to 18% OF THE MESH SPACING, because v3603 gave one of them two " +
             "knobs and left the other hardcoded. A COMPARISON THAT ONLY EVER RUNS AT THE DEFAULTS CANNOT NOTICE " +
             "THAT ONE IMPLEMENTATION GAINED A PARAMETER.",
    fix: "clothSubstep takes collisionIterations (default 1) and collisionCompliance (default 0), matching " +
         "clothFrame. Defaults unchanged and PROVEN so against a hash captured from the pristine v3605 extract " +
         "BEFORE the edit -- pos 79fa2d70bee94487 / vel a9360b138c81bad8 over 40 frames.",
    notClaimed: "This says the two solvers AGREE, not that either is right. Whether a setting is worth shipping " +
                "is v3604's soak and Keith's rig. NO DEFAULT MOVED.",
};

export function reportLines() {
    const L = [], say = (s) => L.push(s);
    say("[solverParity] two cloth solvers, gated against each other, compared where the collision pass fires");
    say("");
    say("1. THE EQUIVALENCE GATE'S OWN RADIUS FINDS NO CONTACTS AT ALL");
    say("     radius   frames with pairs   total pairs");
    for (const c of contactCensus()) {
        say("     " + String(c.radius).padEnd(9) + (c.framesWith + "/" + c.frames).padEnd(20) + c.total +
            (c.radius === 0.08 ? "   <- what clothLoop-selfcheck drives" : ""));
    }
    say("     v3604 measured this fixture's activation floor at r = 0.321239. The branch is ENTERED and the");
    say("     pair list is EMPTY, so the collision solve loops over nothing.");
    say("");
    say("2. PARITY ON v3604'S HONEST DRAPE (5x17, r = h/2 = " + coherenceCeiling().toFixed(3) + ") ACROSS THE KNOB MATRIX");
    say("     knobs                            result           maxDiff        contacts");
    for (const r of parityMatrix()) {
        say("     " + JSON.stringify(r.knobs).padEnd(33) + (r.identical ? "BIT-IDENTICAL" : "*** DIVERGE ***").padEnd(17) +
            r.maxDiff.toExponential(3).padEnd(15) + r.contacts);
    }
    say("     BEFORE v3606 every non-default row DIVERGED, worst 5.461e-2 -- 18% of the mesh spacing.");
    say("");
    say("  " + MEASURED_V3606.verdict);
    say("  FIX: " + MEASURED_V3606.fix);
    say("  " + MEASURED_V3606.notClaimed);
    return L;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    for (const l of reportLines()) console.log(l);
    process.exit(0);
}
