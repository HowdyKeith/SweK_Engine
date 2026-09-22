// WebGLEngine/physics/mechanics/aeroSurface.mjs
//
// A PER-SURFACE AERODYNAMIC FORCE MODEL -- lift and drag on one lifting surface (a wing, tail, or control
// fin), computed from real dynamic pressure, a closed-form lift/drag coefficient pair, and the surface's own
// body-frame geometry, feeding into physics/mechanics/rigidBody6dof.mjs's own applyForceAtPoint() exactly like
// this tree's other force sources (rigidBody6dofWeapon.mjs's projectiles, an engine's thrust). Logged as
// tools/ship/nextRounds.mjs's rcforge-realistic-flight-model entry: adithya-s-k/RCForge (a browser RC flight
// simulator) was read for the SHAPE of a per-surface lift/drag model -- one aerodynamic surface at a time, each
// with its own span/chord/incidence, airflow taken in the AIRCRAFT'S OWN body frame, angle of attack derived
// from the flow geometrically, control-surface deflection entering as an effective angle-of-attack shift -- but
// NOT vendored: RCForge's own README says its presets are "not calibrated against real flight data", and this
// module's actual coefficient formulas (below) are independently derived from established aerodynamics theory
// and checked against closed-form/textbook results in this file's own gate, not copied from RCForge's tables.
//
// THE COEFFICIENT MODEL, derived and verified (not fitted) in a standalone script before being written here:
//   Cl(alpha) = clAlpha * sin(alpha) * cos(alpha)     -- thin-airfoil / flat-plate normal-force theory
//   Cd(alpha) = cd0 + k * Cl(alpha)^2,  k = 1/(pi * oswaldEfficiency * aspectRatio)   -- the classic parabolic
//               drag polar from lifting-line theory (induced drag grows with the square of the lift coefficient)
// Cl's closed form is EXACT thin-airfoil theory for a flat plate across the FULL angle range (not just small
// angles): it is zero at alpha=0 and alpha=90deg, odd about alpha=0, and peaks at alpha=45deg -- a real,
// theoretically grounded "rolls over past a peak" shape, standing in for a viscous stall without an ad hoc
// cutoff. d/dalpha[Cl] at alpha=0 is exactly `clAlpha` (verified in the gate by numerical differentiation), so
// `clAlpha` carries its ordinary physical meaning: the small-angle lift-curve slope.
//
// SIGN CONVENTION -- proven, not assumed, because a naive version of this file got it backwards and it took a
// standalone derivation script to catch it before it ever reached a gate: alpha is measured so that POSITIVE
// alpha (the relative wind hitting the surface from the -normal side, i.e. "from below") gives POSITIVE Cl and
// a force along +normal, the ordinary "lift points up" convention. That constrains BOTH the angle formula
// (atan2(-normalComp, chordComp), not the more naively-obvious atan2(normalComp, chordComp)) AND the lift
// direction formula (cross(planarDir, span), not cross(span, planarDir)) -- getting either one wrong alone
// still produces a numerically consistent-looking result (the two signs can cancel for a SPECIFIC test case)
// but the wrong ONE flips independently of the other under a mirrored input, which is exactly what section
// 2/2b of this file's gate checks: mirrored inputs must give mirrored (not merely "some") signs.
//
// TWO FURTHER ISSUES an ADVERSARIAL REVIEW found in the first version of this file, before it was ever
// committed, both fixed here:
//
// (1) DYNAMIC PRESSURE (and force DIRECTION) USE ONLY THE CROSSFLOW COMPONENT, NOT THE FULL 3D FLOW SPEED.
// The classic "independence principle" for a lifting surface says a velocity component ALONG the span slides
// past without contributing to that 2D section's lift/drag generation -- only the component perpendicular to
// the span (the "planar" flow already computed for the angle-of-attack) should drive q. An earlier version
// used the FULL flow magnitude for q while already correctly stripping the spanwise component for alpha --
// consistent for pure pitch/AoA cases (planar == flow there), but a stray 100 m/s of pure SPANWISE flow (a
// sideslip or roll rate, nothing to do with lift) inflated the force by 397x with the alpha/Cl completely
// unaffected -- caught numerically, not by inspection, before this file existed in its current form. force
// DIRECTION (both lift and drag) is derived from the same planar flow now too, for the same reason: this
// module's per-surface theory is a 2D-section model, and using a 3D direction for force while a 2D magnitude
// for its size was the same inconsistency in a different guise.
//
// (2) `normal` IS DERIVED, NEVER A FREE PARAMETER. createSurface() used to accept span/chord/normal as three
// independent vectors and trust they formed a right-handed orthonormal triad. A caller-supplied triad that was
// perfectly orthonormal but LEFT-handed (chord x span pointing opposite the supplied normal) silently reversed
// the sign of every lift force with no error, warning, or NaN -- and a caller-supplied chord that was merely
// unit-length but not exactly perpendicular to span silently corrupted alpha even at intended zero AoA.
// createSurface() now takes only `span` and `chord` and Gram-Schmidt-orthonormalises them, then derives
// `normal = chord x span` -- an inconsistent or left-handed triad is no longer constructible at all, closing
// the failure mode at its source rather than validating for it after the fact.
"use strict";
import { worldToBody, createAccumulator, applyForceAtPoint, createBody, boxInertia, step } from "./rigidBody6dof.mjs";

export { createAccumulator, applyForceAtPoint };   // re-exported for a caller building a full aero-driven tick

const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const add3 = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const scale3 = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const sub3 = (a, b) => add3(a, b, -1);
const norm3 = (v) => Math.hypot(v[0], v[1], v[2]);
const unit3 = (v) => { const n = norm3(v); return n > 1e-12 ? scale3(v, 1 / n) : [0, 0, 0]; };

export const AIR_DENSITY_SEA_LEVEL = 1.225;   // kg/m^3, standard atmosphere at 15C -- matches this tree's own
                                                // ballistics.mjs convention of naming a real physical constant
                                                // rather than burying it in a formula.

/** A body-frame lifting surface. `span` (the axis the surface extends along) and `chord` (its own zero-
 * deflection "forward"/flow-tangent direction) are Gram-Schmidt-orthonormalised here -- `chord`'s component
 * along `span` is removed, both are unit-length, and `normal` is DERIVED as `chord x span`, never accepted as
 * an independent input: an inconsistent (non-orthogonal) or left-handed triad is not constructible through
 * this function at all (found by an adversarial review: a caller-supplied, independently-specified `normal`
 * could silently disagree with `chord x span`, flipping every lift force's sign with no error or NaN).
 * `mount` is the body-frame point aero force is applied at (the surface's own centre of pressure,
 * approximated as its geometric centre -- the same "centre of mass == geometric centre" simplification
 * physics/mechanics/rigidBody6dof.mjs's own boxInertia() already makes). `control`, if present, is
 * {effectiveness, deflection} -- deflection in radians, positive meaning whatever sign convention the caller
 * chooses (it enters symmetrically as +effectiveness*deflection, see reportLines() for a worked example). */
export function createSurface({ mount = [0, 0, 0], span = [0, 1, 0], chord = [1, 0, 0], area = 1, aspectRatio = 6, clAlpha = 2 * Math.PI, cd0 = 0.02, oswaldEfficiency = 0.85, incidence = 0, zeroLiftAlpha = 0, control = null } = {}) {
    const spanU = unit3(span);
    const chordU = unit3(sub3(chord, scale3(spanU, dot3(chord, spanU))));
    const normal = unit3(cross3(chordU, spanU));
    return { mount: [...mount], span: spanU, chord: chordU, normal, area, aspectRatio, clAlpha, cd0, oswaldEfficiency, incidence, zeroLiftAlpha, control: control ? { ...control } : null };
}

/** Body-frame relative airflow at a rigidBody6dof body -- the aircraft's own velocity minus the wind, rotated
 * into its own body frame via rigidBody6dof.mjs's own worldToBody() bridge. `windWorld` defaults to still air. */
export function relativeAirflow(body, windWorld = [0, 0, 0]) {
    return worldToBody(body.q, sub3(body.vel, windWorld));
}

/** The lift+drag force (body-frame) on one surface, given the body-frame relative airflow it sits in. This is
 * a 2D-SECTION model: everything -- angle of attack, dynamic pressure, AND force direction -- is derived from
 * the "planar" flow (the component perpendicular to `span`), never the raw 3D flow, per the independence
 * principle (a spanwise velocity component doesn't drive a 2D section's lift/drag). Returns {force, cl, cd,
 * alpha, q} -- q is dynamic pressure, alpha in radians. force is [0,0,0] (not NaN) for near-zero OR purely
 * spanwise flow (zero planar component either way), where a 2D section has nothing to generate force from. */
export function surfaceForce(flowBody, surface) {
    const flowSpan = dot3(flowBody, surface.span);
    const planar = sub3(flowBody, scale3(surface.span, flowSpan));
    const speed = norm3(planar);
    if (speed < 1e-6) return { force: [0, 0, 0], cl: 0, cd: 0, alpha: 0, q: 0 };

    const chordComp = dot3(planar, surface.chord), normalComp = dot3(planar, surface.normal);
    const alphaGeo = Math.atan2(-normalComp, chordComp);
    const deflectTerm = surface.control ? surface.control.deflection * surface.control.effectiveness : 0;
    const alpha = alphaGeo + surface.incidence - surface.zeroLiftAlpha + deflectTerm;

    const cl = surface.clAlpha * Math.sin(alpha) * Math.cos(alpha);
    const k = 1 / (Math.PI * surface.oswaldEfficiency * surface.aspectRatio);
    const cd = surface.cd0 + k * cl * cl;

    const planarDir = unit3(planar);
    const liftDir = unit3(cross3(planarDir, surface.span));
    const q = 0.5 * AIR_DENSITY_SEA_LEVEL * speed * speed;
    const force = add3(scale3(liftDir, cl * q * surface.area), scale3(planarDir, -cd * q * surface.area));
    return { force, cl, cd, alpha, q };
}

/** Convenience: compute surfaceForce() and apply it to `acc` via rigidBody6dof.mjs's own applyForceAtPoint(),
 * at the surface's own mount point. Returns the same {force, cl, cd, alpha, q} surfaceForce() does. */
export function applySurfaceForce(acc, flowBody, surface) {
    const r = surfaceForce(flowBody, surface);
    applyForceAtPoint(acc, r.force, surface.mount);
    return r;
}

// ---- FRONT DOOR -------------------------------------------------------------------------------------------------
export function reportLines() {
    const I = boxInertia({ m: 5, hx: 0.5, hy: 2, hz: 0.15 });
    // level flight at 25 m/s, nose along +X, a small nose-up trim so the main wing actually generates lift.
    // freeRotation.mjs's own [qw,qx,qy,qz] convention about +Y here rotates the nose (+X) TOWARD -Z, so a
    // nose-UP pitch (toward +Z, "up" in this world) needs a NEGATIVE angle -- checked directly with
    // rotateByQuat(q,[1,0,0]) before trusting it, not assumed from the sign of the number alone.
    const pitchUp = -0.05;
    const q = [Math.cos(pitchUp / 2), 0, Math.sin(pitchUp / 2), 0];
    let s = createBody({ mass: 5, I, pos: [0, 100, 0], vel: [25, 0, 0], q });
    const wing = createSurface({ mount: [0, 0, 0], area: 0.6, aspectRatio: 7, clAlpha: 5.7, cd0: 0.02 });
    const tail = createSurface({ mount: [-0.9, 0, 0], area: 0.08, aspectRatio: 4, clAlpha: 4.5, cd0: 0.015, control: { effectiveness: 0.5, deflection: -0.05 } });
    const flow = relativeAirflow(s);
    const acc = createAccumulator();
    const wr = applySurfaceForce(acc, flow, wing);
    const tr = applySurfaceForce(acc, flow, tail);
    const s2 = step(s, acc, 1 / 30);
    return [
        "[aeroSurface] per-surface lift/drag from a closed-form thin-airfoil-style Cl/Cd, fed into",
        "              rigidBody6dof.mjs's own applyForceAtPoint() -- one primitive, real aerodynamics.",
        `  wing: alpha=${(wr.alpha * 180 / Math.PI).toFixed(2)}deg  cl=${wr.cl.toFixed(3)}  cd=${wr.cd.toFixed(4)}  |F|=${norm3(wr.force).toFixed(2)}N`,
        `  tail: alpha=${(tr.alpha * 180 / Math.PI).toFixed(2)}deg  cl=${tr.cl.toFixed(3)}  cd=${tr.cd.toFixed(4)}  |F|=${norm3(tr.force).toFixed(2)}N`,
        `  net torque this tick (body frame): ${acc.torque.map((v) => v.toFixed(3))}`,
        `  1 tick later: w=${s2.w.map((v) => v.toFixed(4))}  (the wing+tail's differing lever arms are already turning the aircraft)`,
    ];
}

// GUARDED (this tree's established idiom -- see physics/stabilityMeter.mjs's own v3900/v3951 notes and
// tools/ship/browserSafety-selfcheck.mjs, the gate that exists because of exactly this bug): this module is
// loaded by a PAGE as well as run as a CLI, and `process` at module top level is a ReferenceError in a
// browser -- not a caught failure, an EVALUATION failure, so the whole module fails to load and every page
// that imports it dies with it. The node:url import itself must be INSIDE the guard too, dynamically -- a
// bare top-level `import ... from "node:url"` is resolved before this line ever runs, so an unguarded import
// crashes the browser before the guard below would even get a chance to skip it.
if (typeof process !== "undefined" && Array.isArray(process.argv)) {
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
        for (const l of reportLines()) console.log(l);
        process.exit(0);
    }
}
