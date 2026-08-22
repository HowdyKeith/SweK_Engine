// physics/xpbd/weaveKey.mjs
//
// v3464 -- WIRING, NOT NEW KEYS, AND SAYING WHICH.
//
// *** ALL NINE REMAINING "UNGRADED" xpbd MODULES ALREADY HAVE PASSING SELFCHECKS. *** anisotropy, attach,
// clothLoop, fluid, modulate, muscle, sampledField, tear and windCloth are every one of them gated, and gated
// well -- anisotropy asserts that the softer thread direction stretches more, that swapping the two compliances
// swaps which direction gives, and that equal compliances make the cloth isotropic; tear asserts that the torn
// set is independent of constraint scan order, that the active count only ever decreases, and that runs are
// byte-identical under two hundred within-colour shuffles.
//
// They count as ungraded because gradedCoverage measures what a *Bind.mjs file IMPORTS, and no bind imports
// them. The number is measuring BIND WIRING, not whether the physics is checked, and for these nine the gap
// between those two is the whole of it.
//
// SO THIS ROUND ADDS NO PHYSICS KEY. What wiring buys is real but different: a module reachable from a device
// becomes reachable by the lab's machinery -- sweepDevice can sweep it, the sensitivity matrix can look for dead
// knobs in it, resultBaseline pins its numbers against silent drift, and valueMatch can find couplings against
// it. None of that was available to a module gated only by its own selfcheck.
//
// It is worth being explicit that this is a DIFFERENT ACT from the earlier refusal to add a decorative import to
// xpbdBind purely to move the coverage number. A device mode exposes observables that are pinned, swept and
// compared; an import that nothing calls exposes nothing. The first is integration and the second is decoration.

import { colorConstraints } from "./xpbd.js";
import { buildAnisotropicCloth, anisotropicSubstep, extent } from "./anisotropy.js";
import { evaluateTears, applyTears, tearSubstep, activeCount } from "./tear.js";

const W = 10, H = 10, SP = 0.2;

/** Pull a woven sheet along one axis and report how far it gave. Mirrors the existing gate's rig exactly. */
export function stretchAlong(warpComp, weftComp, axis, steps = 80) {
    const cons = buildAnisotropicCloth(W, H, SP, warpComp, weftComp);
    const batches = colorConstraints(cons);
    const N = W * H;
    const pos = new Float64Array(3 * N), vel = new Float64Array(3 * N), invMass = new Float64Array(N).fill(1);
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
        const i = z * W + x;
        pos[3 * i] = x * SP; pos[3 * i + 1] = 0; pos[3 * i + 2] = z * SP;
        // PIN THE LEADING EDGE. Without it every particle takes the same force and the sheet TRANSLATES --
        // extent is unchanged and the measured stretch came out at 1e-14, which reads as "the fabric is
        // infinitely stiff" rather than "the rig applies no strain". Copied from the module's own gate.
        if (axis === 0 && x === 0) invMass[i] = 0;
        if (axis === 2 && z === 0) invMass[i] = 0;
    }
    const rest = extent(pos, N, axis);
    const force = axis === 0 ? [6, 0, 0] : [0, 0, 6];
    const st = { pos, vel, invMass };
    for (let s = 0; s < steps; s++) anisotropicSubstep(st, cons, batches, { dt: 0.016, iterations: 14, force });
    return { stretch: extent(st.pos, N, axis) - rest, finite: Number.isFinite(extent(st.pos, N, axis)) };
}

/**
 * The directional key: under the same pull, the softer thread direction must give more.
 * Reported as a RATIO so it is comparable across fabrics, and with the swap so the asymmetry is shown to follow
 * the compliances rather than the axis.
 */
export function weaveAnisotropy({ soft = 1e-3, stiff = 1e-5 } = {}) {
    const softWarp = stretchAlong(soft, stiff, 0).stretch;
    const stiffWeft = stretchAlong(soft, stiff, 2).stretch;
    const swappedWarp = stretchAlong(stiff, soft, 0).stretch;
    const iso = stretchAlong(stiff, stiff, 0).stretch;
    const isoOther = stretchAlong(stiff, stiff, 2).stretch;
    return {
        softWarp, stiffWeft, swappedWarp, iso, isoOther,
        anisotropyRatio: softWarp / stiffWeft,
        swapReverses: swappedWarp < softWarp,
        isotropicWhenEqual: Math.abs(iso - isoOther) / Math.max(Math.abs(iso), 1e-30),
        finite: [softWarp, stiffWeft, swappedWarp, iso, isoOther].every(Number.isFinite),
    };
}

/** Tearing: the active-constraint count may only fall, and never rise. */
export function tearRun({ strain = 1.06, steps = 60, dt = 0.016, iterations = 8 } = {}) {
    const cons = buildAnisotropicCloth(W, H, SP, 1e-5, 1e-5);
    const batches = colorConstraints(cons);
    const N = W * H;
    const pos = new Float64Array(3 * N), vel = new Float64Array(3 * N), invMass = new Float64Array(N).fill(1);
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
        const i = z * W + x;
        pos[3 * i] = x * SP; pos[3 * i + 1] = 0; pos[3 * i + 2] = z * SP;
        if (z === 0) invMass[i] = 0;      // hang the sheet from its top row
    }
    const active = new Uint8Array(cons.length).fill(1);
    const st = { pos, vel, invMass };
    const counts = [activeCount(active)];
    for (let s = 0; s < steps; s++) {
        tearSubstep(st, cons, batches, active, { dt: 0.02, iterations: 5, gravity: [0, -50, 0], tearStrain: strain });
        counts.push(activeCount(active));
    }
    return {
        counts, start: counts[0], end: counts[counts.length - 1],
        monotoneDown: counts.every((c, i) => i === 0 || c <= counts[i - 1]),
        tore: counts[counts.length - 1] < counts[0],
        finite: counts.every(Number.isFinite),
    };
}
