// WebGLEngine/physics/mechanics/rigidKeys.mjs -- v3568
// ---------------------------------------------------------------------------------------------------------------
// FOUR KEYS THAT GRADE THE SHIPPED box3d SOLVER, and the round where the FIRST DESIGN OF TWO OF THEM WAS WRONG
// FOR THE SAME REASON AND HAD TO BE REBUILT AS RATIOS.
//
// freeRotation.mjs grades Euler's equations, which this lab wrote. This grades the WASM, which it did not: 970 KB
// of clang-built erincatto/box3d sitting in vendor/, driven through a shim, and until now checked by exactly one
// thing -- stateHash() agreeing across peers. THAT IS A DETERMINISM CHECK AND NOT A PHYSICS CHECK. Two peers
// computing the same wrong answer agree perfectly.
//
// ================================================================================================================
// 1. MOMENTUM, AND THE BODY TYPE THAT CAN CARRY THE CLAIM
// ================================================================================================================
//
// Total linear momentum of an isolated pair is invariant across a collision. Measured on SHIP bodies (planar,
// rotation-locked, DAMPING ZERO by deliberate choice at shim line ~68), two boxes of unequal mass driven into
// each other and run 600 ticks through contact and out the far side:
//
//     p0 = (-1.096000000000, -0.419200006247)    p1 = (-1.096000380754, -0.419200001478)    |dp| = 3.8e-7
//
// That is about three ULP of float32 at this magnitude, which is the floor the solver can be held to and not a
// tolerance anybody picked. *** IT CANNOT BE RUN ON A BOX BODY, AND THAT IS THE INTERESTING PART. *** swk_body_box
// sets linearDamping = 0.05, so a box PAIR loses momentum on purpose. The key therefore has to name its body type,
// and naming it turns physics/damping.js's decision from a comment into a measurable.
//
// ================================================================================================================
// 2. THE DAMPING CONSTANT, RECOVERED FROM A TRAJECTORY -- AND SUBSTEPS CHANGE IT
// ================================================================================================================
//
// physics/damping.js says the engine chose 0.05 /s and says why. Free flight, v0 = 10, no gravity, no contact,
// 2.0 s, measured against the discrete law v <- v/(1 + c*h) applied once per SUBSTEP:
//
//     substeps 1   measured 0.904871464   predicted 0.904875099      exp(-0.1) = 0.904837418
//     substeps 2   measured 0.904864120   predicted 0.904856264
//     substeps 4   measured 0.904834843   predicted 0.904846842
//     substeps 8   measured 0.904813004   predicted 0.904842130
//
// At substeps 1 the discrete law is recovered to 4e-6 WITHOUT READING THE CONSTANT -- two routes, one number.
//
// *** AND THE COLUMN IS THE FINDING: THE DECAY DEPENDS ON substeps. *** 1 vs 8 differ by 6.5e-5 relative over two
// seconds. substeps is a caller-chosen argument on w.step(dt, substeps), so IT IS NOT AN ACCURACY KNOB, IT IS A
// PHYSICS KNOB, and box3dLockstep's cross-peer determinism assumes every peer passes the same one. Nothing in the
// tree pins it. This does not assert that it is a bug; it measures the size of the exposure and names where it
// lands.
//
// ================================================================================================================
// 3. THE INTERMEDIATE AXIS, AS AN INTEGER, AND CROSS-CHECKED AGAINST A MODULE THAT SHARES NO CODE
// ================================================================================================================
//
// A free box spun about each principal axis in turn, identical perturbation, 40 s, counting sign reversals of the
// spin axis:
//
//     axis 0   I = 0.33333   LARGEST         0 flips
//     axis 1   I = 0.27733   INTERMEDIATE    6 flips
//     axis 2   I = 0.07733   SMALLEST        0 flips
//
// TWO EXACT ZEROS AND A NONZERO. Not a tolerance, not a correlation -- three integers, and the pattern is what
// freeRotation.mjs derives from Euler's equations without touching the wasm. THE ANSWER KEY IS ANOTHER GATED
// INSTRUMENT, which is the Fresnel-to-far-field move this lab already rates as its best available check.
//
// The flip INTERVALS grow -- 3.58, 4.37, 5.67, 7.80, 12.63 -- because angularDamping 0.05 bleeds the spin, and the
// separatrix period diverges as the spin decays. That is consistent and it is NOT claimed as a key: the closed
// form for the damped period is not clean, and a number that cannot be derived is decoration. THE COUNTS ARE THE
// CLAIM. The intervals are reported so a reader can see why the counts are not more precise than they are.
//
// ================================================================================================================
// 4. THE COMPOUND PENDULUM -- WHERE THE FIRST DESIGN WAS WRONG, TWICE, AND THE FIX IS THE SAME FIX
// ================================================================================================================
//
// A revolute joint plus a box is a compound pendulum, T = 2*pi*sqrt(I_pivot/(m g d)). Measured against the closed
// form it comes back 1.0005690 -- 0.057% high, from finite amplitude plus joint softness. *** SO THE ABSOLUTE
// PERIOD IS A TOLERANCED CHECK AND THIS LAB DOES NOT WANT ONE. ***
//
// Both interesting statements are RATIOS, and a ratio is exact here BECAUSE the systematic is common-mode: the
// same solver, the same softness, the same amplitude, divided out.
//
//     MASS INDEPENDENCE    T(density 7) / T(density 1)  =  1.0000000    seven times the mass, and T is
//                                                                       independent of m -- which the solver is
//                                                                       never told, because it is never given T
//     HUYGENS RECIPROCITY  T(d') / T(d)                 =  0.9999989    d = 0.5 and d' = L - d = 0.168333, two
//                                                                       PHYSICALLY DIFFERENT pendulums, 1.1 ppm
//
// Huygens' centre of oscillation, L = I_pivot/(m d), is the reciprocity: hang the same body from the centre of
// oscillation and the period is unchanged. Neither pivot knows about the other and the solver has no term for it.
//
// ================================================================================================================
// WHAT IS NOT HERE, AND WHY, STATED RATHER THAN OMITTED
// ================================================================================================================
//
// The friction cone (a box slides iff tan(theta) > mu, an exact threshold found by bisection on a binary outcome)
// and the bounce ratio (h_n = e^(2n) h_0, geometric, with e = 0 an EXACT zero -- the body must not leave the
// ground at all) are the two best remaining rigid-body keys and BOTH ARE BLOCKED ON THE SAME THING: the shim had
// no way to set friction or restitution. swk_body_set_friction and swk_body_set_restitution are now written into
// box3d_shim.c, and the vendored artifact does not export them because IT WAS BUILT AT v2560 AND IS ALREADY THREE
// FUNCTIONS BEHIND ITS OWN SOURCE (see box3dNode.mjs). frictionRestitutionAvailable() reports the capability and
// the gate SKIPS rather than fails, which is box3dLoader's own convention applied one level in.
"use strict";
import { pathToFileURL } from "node:url";
import { initNode, mod, has, exportReport } from "../box3d/box3dNode.mjs";

// ---- reading the world ------------------------------------------------------------------------------------------
const XF_STRIDE = 7, V_STRIDE = 3;

function transforms(m = mod()) {
    const n = m._swk_body_count(), p = m._malloc(n * XF_STRIDE * 4);
    m._swk_transforms(p, n);
    const a = Array.from(m.HEAPF32.subarray(p / 4, p / 4 + n * XF_STRIDE));
    m._free(p);
    return a;
}
function velocities(m = mod()) {
    const n = m._swk_body_count(), p = m._malloc(n * V_STRIDE * 4);
    m._swk_velocities(p, n);
    const a = Array.from(m.HEAPF32.subarray(p / 4, p / 4 + n * V_STRIDE));
    m._free(p);
    return a;
}
export const quatOf = (xf, i) => xf.slice(i * XF_STRIDE + 3, i * XF_STRIDE + 7);
export const posOf = (xf, i) => xf.slice(i * XF_STRIDE, i * XF_STRIDE + 3);

/** Rotate a vector by a quaternion (x,y,z,w). Cross-product form: no trig, so it is bit-identical across machines. */
export function rotate(q, v) {
    const [x, y, z, w] = q;
    const t = [2 * (y * v[2] - z * v[1]), 2 * (z * v[0] - x * v[2]), 2 * (x * v[1] - y * v[0])];
    return [v[0] + w * t[0] + (y * t[2] - z * t[1]),
            v[1] + w * t[1] + (z * t[0] - x * t[2]),
            v[2] + w * t[2] + (x * t[1] - y * t[0])];
}

/** Mass and principal inertias of a solid box from HALF-extents, which is what the shim's API takes. */
export function boxInertia(hx, hy, hz, density = 1) {
    const m = density * 8 * hx * hy * hz;
    return { m, I: [(m / 3) * (hy * hy + hz * hz), (m / 3) * (hx * hx + hz * hz), (m / 3) * (hx * hx + hy * hy)] };
}

export const DAMPING_BOX = 0.05;            // read from box3d_shim.c swk_body_box; see physics/damping.js
export const DAMPING_SHIP = 0.0;            // read from box3d_shim.c swk_body_ship -- drag-free, on purpose

// =================================================================================================================
// KEY 1 -- LINEAR MOMENTUM ACROSS A COLLISION, ON THE DRAG-FREE BODY TYPE
// =================================================================================================================
export function momentumAcrossCollision({ hA = 0.5, hB = 0.8, dA = 1, dB = 1,
                                          vA = [3, 0.4], vB = [-1, -0.2], ticks = 600 } = {}) {
    const m = mod();
    m._swk_world_create(0, 0, 0);
    const mA = dA * Math.pow(2 * hA, 3), mB = dB * Math.pow(2 * hB, 3);
    const a = m._swk_body_ship(-4, 0, hA, dA), b = m._swk_body_ship(4, 0, hB, dB);
    m._swk_body_set_velocity(a, vA[0], 0, vA[1]);
    m._swk_body_set_velocity(b, vB[0], 0, vB[1]);
    const P = () => { const v = velocities(m); return [mA * v[0] + mB * v[3], mA * v[2] + mB * v[5]]; };
    const p0 = P();
    for (let i = 0; i < ticks; i++) m._swk_world_step(1 / 60, 4);
    const p1 = P();
    const xf = transforms(m), sep = Math.abs(posOf(xf, 0)[0] - posOf(xf, 1)[0]);
    m._swk_world_destroy();
    return {
        mA, mB, p0, p1,
        dp: Math.hypot(p1[0] - p0[0], p1[1] - p0[1]),
        relative: Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) / Math.hypot(p0[0], p0[1]),
        // Resting contact at exactly the sum of half-extents is the proof the collision HAPPENED. Without it a
        // perfectly conserved momentum would only mean the two bodies never met.
        separation: sep, touchedAt: hA + hB, collided: Math.abs(sep - (hA + hB)) < 1e-3,
    };
}

// =================================================================================================================
// KEY 2 -- THE DAMPING CONSTANT, RECOVERED, AND ITS DEPENDENCE ON SUBSTEPS
// =================================================================================================================
export function dampingDecay({ substeps = 1, seconds = 2, v0 = 10, dt = 1 / 60 } = {}) {
    const m = mod();
    m._swk_world_create(0, 0, 0);
    const b = m._swk_body_box(1, 0, 0, 0, 0.5, 0.5, 0.5, 1);
    m._swk_body_set_velocity(b, v0, 0, 0);
    const N = Math.round(seconds / dt);
    for (let i = 0; i < N; i++) m._swk_world_step(dt, substeps);
    const measured = velocities(m)[0] / v0;
    m._swk_world_destroy();
    const h = dt / substeps;
    return {
        substeps, seconds, measured,
        discrete: Math.pow(1 / (1 + DAMPING_BOX * h), N * substeps),   // v <- v/(1+c h) once per SUBSTEP
        continuous: Math.exp(-DAMPING_BOX * seconds),
    };
}

export function dampingAcrossSubsteps(list = [1, 2, 4, 8]) {
    const rows = list.map((s) => dampingDecay({ substeps: s }));
    const vals = rows.map((r) => r.measured);
    return { rows, spread: (Math.max(...vals) - Math.min(...vals)) / Math.min(...vals) };
}

// =================================================================================================================
// KEY 3 -- THE INTERMEDIATE AXIS, AS THREE INTEGERS
// =================================================================================================================
export function flipCounts({ hx = 0.2, hy = 0.5, hz = 1.0, density = 1,
                             spin = 6, nudge = 0.05, seconds = 40, dt = 1 / 60 } = {}) {
    const m = mod();
    const { I } = boxInertia(hx, hy, hz, density);
    const rank = [0, 1, 2].sort((a, b) => I[a] - I[b]);      // smallest, intermediate, largest
    const out = [];
    for (const ax of [0, 1, 2]) {
        m._swk_world_create(0, 0, 0);
        const b = m._swk_body_box(1, 0, 0, 0, hx, hy, hz, density);
        const w = [0, 0, 0];
        w[ax] = spin;
        w[(ax + 1) % 3] = nudge;                              // the perturbation that lets an unstable axis leave
        m._swk_body_ang_impulse(b, I[0] * w[0], I[1] * w[1], I[2] * w[2]);
        const probe = [0, 0, 0]; probe[ax] = 1;
        let prev = null, t = 0; const at = [];
        const steps = Math.round(seconds / dt);
        for (let i = 0; i < steps; i++) {
            m._swk_world_step(dt, 4); t += dt;
            const s = Math.sign(rotate(quatOf(transforms(m), 0), probe)[ax]);
            if (prev !== null && s !== prev && s !== 0) at.push(t);
            if (s !== 0) prev = s;
        }
        m._swk_world_destroy();
        const gaps = at.slice(1).map((x, i) => x - at[i]);
        out.push({ axis: ax, I: I[ax], role: ax === rank[0] ? "smallest" : ax === rank[1] ? "intermediate" : "largest",
                   flips: at.length, at, gaps });
    }
    return { I, rank, axes: out,
             intermediate: out.find((o) => o.role === "intermediate"),
             stable: out.filter((o) => o.role !== "intermediate") };
}

// =================================================================================================================
// KEY 4 -- THE COMPOUND PENDULUM, AND ITS TWO RATIOS
// =================================================================================================================
/**
 * A box hung from a revolute joint. `d` is the pivot's distance ABOVE the body centre. Crossings are interpolated
 * WITHIN the step -- without that the period quantises to the tick and both ratios below collapse to noise, which
 * is how the first version of this function reported nothing.
 */
export function pendulumPeriod({ density = 1, d = 0.5, hx = 0.05, hy = 0.5, hz = 0.05,
                                 g = 9.8, kick = 0.5, seconds = 24, dt = 1 / 240 } = {}) {
    const m = mod();
    m._swk_world_create(0, -g, 0);
    m._swk_body_box(0, 0, 1, 0, 0.02, 0.02, 0.02, 1);                     // static anchor
    const bob = m._swk_body_box(1, 0, 1 - d, 0, hx, hy, hz, density);
    m._swk_joint_revolute(0, 1, 0, 1, 0, 0, 0, 1, 1, -1);                 // axis +z, lo>hi disables the limit
    const mm = density * 8 * hx * hy * hz;
    const Icm = (mm / 3) * (hx * hx + hy * hy), Ip = Icm + mm * d * d;
    m._swk_body_ang_impulse(bob, 0, 0, Ip * kick);
    let prev = null, prevZ = 0, t = 0; const cross = [];
    const steps = Math.round(seconds / dt);
    for (let i = 0; i < steps; i++) {
        m._swk_world_step(dt, 1); t += dt;
        const z = quatOf(transforms(m), 1)[2], s = Math.sign(z);
        if (prev !== null && s !== prev && s !== 0) cross.push(t - dt * (z / (z - prevZ)));
        if (s !== 0) prev = s;
        prevZ = z;
    }
    m._swk_world_destroy();
    const T = cross.length >= 3 ? 2 * (cross[cross.length - 1] - cross[0]) / (cross.length - 1) : NaN;
    return { T, theory: 2 * Math.PI * Math.sqrt(Ip / (mm * g * d)),
             centreOfOscillation: Ip / (mm * d), d, mass: mm, crossings: cross.length };
}

/** The two ratios. Common-mode solver bias cancels, which is the whole reason they are ratios. */
export function pendulumRatios({ d = 0.5, heavy = 7 } = {}) {
    const light = pendulumPeriod({ density: 1, d });
    const dense = pendulumPeriod({ density: heavy, d });
    const swapped = pendulumPeriod({ density: 1, d: light.centreOfOscillation - d });
    return {
        light, dense, swapped,
        massRatio: dense.T / light.T,
        huygensRatio: swapped.T / light.T,
        huygensTheory: swapped.theory / light.theory,
        absoluteBias: light.T / light.theory,
        dPrime: light.centreOfOscillation - d,
    };
}

// =================================================================================================================
// WHAT THE SHIM CANNOT DO YET
// =================================================================================================================
export function frictionRestitutionAvailable() {
    return has("swk_body_set_friction") && has("swk_body_set_restitution");
}

export const BLOCKED_ON_REBUILD = {
    // v3571 -- RETIRED AND CORRECTED RATHER THAN DELETED. v3569 rebuilt the artifact and v3570/v3571 built both
    // keys, so a register still reading "blocked" would be a stale refusal (v3202's shape) -- and deleting it
    // would lose the fact that the question was asked, and that ONE OF THE TWO PROPOSALS WAS WRONG.
    retired: true,
    frictionCone:
        "BUILT at v3570 as physics/mechanics/contactKeys.mjs. The proposal held up: a box slides iff tan(theta) " +
        "> mu, bisected on a binary outcome. WHAT THE PROPOSAL DID NOT SAY is which binary -- DISPLACEMENT gives " +
        "an angle that moves with the threshold, because a settling box creeps; the SPEED is EXACTLY ZERO below " +
        "the critical angle and gives the same answer across two decades of tolerance.",
    bounceRatio:
        "*** THE PROPOSAL WAS WRONG AND IS RECORDED HERE RATHER THAN QUIETLY REPLACED. *** It said 'e = 0 is an " +
        "EXACT zero: the body must not leave the ground at all'. At e = 0 the shipped solver rebounds at 0.0495 " +
        "of impact speed, because a contact solver must RESOLVE PENETRATION and that imparts separation " +
        "velocity whatever the material. It also assumed a geometric HEIGHT sequence, which needs a body that " +
        "lands the same way twice -- a dropped BOX rocks and catches its edges. Replaced at v3571 by the " +
        "definition itself, |v_out|/|v_in| at the first impact, whose response is affine in e with all nine " +
        "per-interval slopes identical to six digits.",
};


export const MEASURED_V3568 = {
    theRatiosAreTheFix:
        "*** THE ABSOLUTE PENDULUM PERIOD IS 0.057% HIGH AND THAT IS NOT A KEY THIS LAB WANTS. *** Finite " +
        "amplitude plus joint softness, and no tolerance on it would be principled. Both interesting statements " +
        "are RATIOS instead, and a ratio is exact here BECAUSE the systematic is common-mode: same solver, same " +
        "softness, same amplitude, divided out. Mass independence came back 1.0000000 at seven times the mass; " +
        "Huygens reciprocity 0.9999989 between two physically different pendulums. THE FIX FOR BOTH WAS THE SAME " +
        "FIX, which is why they are one section.",
    momentumNamesItsBodyType:
        "Momentum invariance CANNOT be run on a box body, because swk_body_box sets linearDamping = 0.05 on " +
        "purpose. The key had to name SHIP bodies, and naming them turns physics/damping.js's decision from a " +
        "comment into a measurable. A key that ignored the body type would have reported a defect that is a " +
        "documented choice.",
    substepsIsAPhysicsKnob:
        "The measured decay over 2 s moves by 6.5e-5 relative between substeps 1 and 8. substeps is a " +
        "CALLER-CHOSEN argument on w.step(dt, substeps), so it is not an accuracy knob, it is a physics knob, and " +
        "box3dLockstep's cross-peer determinism assumes every peer passes the same one. Nothing in the tree pins " +
        "it. Measured, located, and not asserted to be a bug.",
    theKeyIsAnotherInstrument:
        "The intermediate-axis pattern -- 0 flips, 6 flips, 0 flips -- is derived by freeRotation.mjs from " +
        "Euler's equations, which share no line of code with 970 KB of clang-built wasm. Two exact zeros and a " +
        "nonzero, as integers.",
};

// ---- FRONT DOOR --------------------------------------------------------------------------------------------------
export async function reportLines() {
    const st = await initNode();
    const L = [];
    L.push("[rigidKeys] Four keys that grade the shipped box3d wasm, not the maths this lab wrote");
    L.push("");
    if (!st.ready) { L.push("  box3d wasm not loadable: " + st.reason); return L; }

    const rep = await exportReport();
    L.push("  ARTIFACT vs SOURCE: " + rep.declaredCount + " swk_* declared in box3d_shim.c, " +
           rep.builtCount + " exported by box3d.wasm");
    L.push(rep.stale.length ? "    *** STALE, missing from the build: " + rep.stale.join(", ") + " ***"
                            : "    the artifact MATCHES its source -- rebuilt at v3569, gap zero");
    if (rep.documentedButMissing.length)
        L.push("    documented but never defined: " + rep.documentedButMissing.join(", "));
    L.push("");

    const mom = momentumAcrossCollision();
    L.push("  1. MOMENTUM across a collision, SHIP bodies (damping " + DAMPING_SHIP + "):");
    L.push("       |dp| = " + mom.dp.toExponential(3) + "   relative " + mom.relative.toExponential(3) +
           "   collided: " + mom.collided);
    L.push("");

    const d = dampingAcrossSubsteps();
    L.push("  2. DAMPING recovered from a trajectory (box bodies, c = " + DAMPING_BOX + "):");
    for (const r of d.rows)
        L.push("       substeps " + String(r.substeps).padStart(2) + "   measured " + r.measured.toFixed(9) +
               "   discrete law " + r.discrete.toFixed(9));
    L.push("       spread across substeps " + d.spread.toExponential(2) + " -- substeps is a PHYSICS knob");
    L.push("");

    const f = flipCounts();
    L.push("  3. INTERMEDIATE AXIS, as three integers:");
    for (const a of f.axes)
        L.push("       axis " + a.axis + "  I = " + a.I.toFixed(5) + "  " + a.role.padEnd(13) + a.flips + " flips");
    L.push("");

    const p = pendulumRatios();
    L.push("  4. COMPOUND PENDULUM, and why the claims are ratios:");
    L.push("       absolute T / theory   " + p.absoluteBias.toFixed(7) + "   <- toleranced, so NOT the key");
    L.push("       mass independence     " + p.massRatio.toFixed(7) + "   at 7x the mass");
    L.push("       Huygens reciprocity   " + p.huygensRatio.toFixed(7) + "   d = " + p.light.d +
           ", d' = " + p.dPrime.toFixed(6));
    L.push("");
    L.push("  BLOCKED ON A REBUILD: friction cone, bounce ratio. " +
           (frictionRestitutionAvailable() ? "setters PRESENT" : "setters absent from the artifact"));
    return L;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    for (const l of await reportLines()) console.log(l);
    process.exit(0);
}
