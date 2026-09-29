// WebGLEngine/physics/mechanics/aircraftAssembly.mjs
//
// AN AIRCRAFT ASSEMBLY -- the "wing + tail + rudder surfaces with control mixing" slice named as the NEXT step
// in tools/ship/nextRounds.mjs's rcforge-realistic-flight-model entry, built directly on the two primitives that
// entry shipped separately and standalone: physics/mechanics/aeroSurface.mjs (one lifting surface's force) and
// physics/mechanics/rigidBody6dof.mjs (the 6DOF integrator). This module adds nothing new to the aerodynamics or
// the integration itself -- it is purely ASSEMBLY: four aeroSurface.mjs surfaces (two wing halves, an elevator,
// a rudder) mounted on one rigidBody6dof.mjs body, plus CONTROL MIXING (three-axis pilot input -> the per-surface
// deflection each one actually needs) and a single per-tick integration that sums all four into one
// rigidBody6dof.mjs accumulator, matching how rigidBody6dofWeapon.mjs and rigidBody6dofCollision.mjs each added
// one capability on top of the same integrator rather than reaching back into it.
//
// BODY-AXIS CONVENTION -- reused, not re-derived: nose = +X (rigidBody6dofWeapon.mjs's own FORWARD_BODY=[1,0,0],
// so a hull built for that module's projectiles needs no re-orientation to also carry aero surfaces), and
// aeroSurface.mjs's own default span=[0,1,0]/chord=[1,0,0] already derives normal=[0,0,1] -- so right = +Y and
// up = +Z follow directly from the already-gated Gram-Schmidt derivation in aeroSurface.mjs, not asserted fresh
// here. Every surface below is built with an explicit span/chord consistent with this same X-forward/Y-right/
// Z-up frame, so all four normals land the "physically expected" way (wings and elevator lift toward +Z/up,
// rudder pushes toward the lateral +/-Y) by the same derivation aeroSurface.mjs already proves, not by
// coincidence checked only here.
//
// CONTROL MIXING, AND WHY ITS GATE PROVES EXACT-ZERO CROSS-AXIS TORQUE RATHER THAN "MOSTLY ONE AXIS". At the
// zero-control baseline every surface's chord is exactly aligned with the relative airflow (alpha=0, cl=0
// exactly -- Cl's own closed form in aeroSurface.mjs is ODD about alpha=0), so a pure single-axis command
// produces EQUAL-MAGNITUDE, OPPOSITE-SIGN alpha/cl on any surface pair symmetric about the axis being driven.
// Combined with every surface's mount point sitting exactly on the relevant symmetry line (elevator and rudder
// at y=0,z=0 on the centreline; the two wing halves at +/-y with matching x,z), this makes each single-axis
// torque EXACTLY zero on the other two axes -- not approximately, and not merely "small" -- a property this
// module's own gate checks with === rather than a tolerance. Getting a mount point or a sign wrong here would
// show up as a nonzero cross-axis torque under a pure single-axis command, which is exactly what the gate looks
// for; verified in a standalone derivation script (this file's own commit) before being written here, the same
// discipline aeroSurface.mjs's own sign-convention bug was caught under. NOTE (an adversarial review's own
// finding): the PITCH and YAW isolation checks are structural zeros guaranteed by a literal 0 coordinate
// multiplying a finite value (exact under IEEE-754 regardless of platform). The ROLL isolation check is
// slightly different -- it additionally needs Math.cos(-a)===Math.cos(a) and Math.sin(-a)===-Math.sin(a)
// bit-exact between the two wing halves' opposite alphas, a property of how a JS engine's Math library
// extracts the sign before argument reduction rather than something the ECMAScript spec itself guarantees.
// Verified to hold (a 100k-value sweep, and against a non-default wingMountX) rather than merely assumed, but
// worth naming as a different kind of "exact" than the other two axes'.
//
// FORCE DOES NOT NAIVELY SUPERPOSE ACROSS SINGLE-AXIS SCENARIOS -- BASELINE-SUBTRACTED FORCE DOES, EXACTLY. A
// pure single-axis scenario (e.g. roll alone) still carries the OTHER three surfaces' own nonzero zero-
// deflection DRAG (Cd(0) = cd0, not zero -- only Cl is zero at alpha=0), so naively summing three single-axis
// scenarios' net force triple-counts that shared baseline drag. Torque is unaffected by this because baseline
// (pure-drag-along-X) force produces EXACTLY zero torque at every one of these four mount points (proven above),
// so re-including it extra times adds exactly zero each time -- but force has no such cancellation. The correct
// identity, checked in the gate: (combined force) - (zero-control baseline force) EXACTLY EQUALS the sum of
// each single axis's OWN (that axis's force - baseline force). This holds independent of any nonlinearity in
// aeroSurface.mjs's Cl/Cd formulas -- it falls out purely from mixControls() giving each surface a deflection
// driven by exactly one input axis, so combined and single-axis scenarios agree surface-by-surface once the
// shared baseline is subtracted out; not an approximation, an algebraic identity, verified before this module
// existed in its current form the same way aeroSurface.mjs's own crossflow fix was.
"use strict";
import { createSurface, relativeAirflow, applySurfaceForce } from "./aeroSurface.mjs";
import { createAccumulator, applyForceAtPoint, createBody, boxInertia, step } from "./rigidBody6dof.mjs";

export { createAccumulator, applyForceAtPoint, step };   // re-exported for a caller building a full aero-driven tick

export const FORWARD_BODY = [1, 0, 0];   // matches rigidBody6dofWeapon.mjs's own nose convention, reused not redefined
export const UP_BODY = [0, 0, 1];
export const RIGHT_BODY = [0, 1, 0];

/**
 * Assemble a canonical 4-surface aircraft: two wing halves (ailerons, roll authority), one horizontal tail
 * (elevator, pitch authority), one vertical tail (rudder, yaw authority) -- see this file's header for the
 * mount-symmetry properties the control-mixing gate relies on. `surfaces` is keyed leftWing/rightWing/elevator/
 * rudder, matching mixControls()'s own output keys exactly. `limits` are each control channel's max deflection
 * (radians) -- mixControls() scales a [-1,1] input by these, matching how aeroSurface.mjs's own control.deflection
 * is defined (radians, entering alpha as +effectiveness*deflection).
 */
export function createAircraft({
    wingSpanHalf = 3, wingMountX = 0, wingArea = 2, wingAspectRatio = 7, wingClAlpha = 5.7, wingCd0 = 0.02, wingOswald = 0.85,
    aileronEffectiveness = 0.4, aileronMaxDeflection = 0.35,
    tailMountX = -3.2,
    tailArea = 0.45, tailAspectRatio = 4, tailClAlpha = 4.5, tailCd0 = 0.015, tailOswald = 0.8,
    elevatorEffectiveness = 0.5, elevatorMaxDeflection = 0.35,
    rudderArea = 0.3, rudderAspectRatio = 3, rudderClAlpha = 4.0, rudderCd0 = 0.015, rudderOswald = 0.8,
    rudderEffectiveness = 0.5, rudderMaxDeflection = 0.35,
} = {}) {
    const wingHalf = (sign) => createSurface({
        mount: [wingMountX, sign * wingSpanHalf, 0], span: RIGHT_BODY, chord: FORWARD_BODY,
        area: wingArea, aspectRatio: wingAspectRatio, clAlpha: wingClAlpha, cd0: wingCd0, oswaldEfficiency: wingOswald,
        control: { effectiveness: aileronEffectiveness, deflection: 0 },
    });
    return {
        surfaces: {
            leftWing: wingHalf(-1),
            rightWing: wingHalf(1),
            elevator: createSurface({
                mount: [tailMountX, 0, 0], span: RIGHT_BODY, chord: FORWARD_BODY,
                area: tailArea, aspectRatio: tailAspectRatio, clAlpha: tailClAlpha, cd0: tailCd0, oswaldEfficiency: tailOswald,
                control: { effectiveness: elevatorEffectiveness, deflection: 0 },
            }),
            rudder: createSurface({
                mount: [tailMountX, 0, 0], span: UP_BODY, chord: FORWARD_BODY,
                area: rudderArea, aspectRatio: rudderAspectRatio, clAlpha: rudderClAlpha, cd0: rudderCd0, oswaldEfficiency: rudderOswald,
                control: { effectiveness: rudderEffectiveness, deflection: 0 },
            }),
        },
        limits: { aileronMaxDeflection, elevatorMaxDeflection, rudderMaxDeflection },
    };
}

/** A cheap per-tick copy of `surface` with a new control deflection. span/chord/normal are unaffected by
 * deflection (aeroSurface.mjs derives them from geometry alone), so this avoids re-running createSurface()'s
 * own Gram-Schmidt derivation every tick just to move a control surface. THROWS if `surface.control` is null
 * (aeroSurface.mjs's own createSurface() allows a surface with no control authority at all, e.g. a fixed
 * fin) -- found by an adversarial review: silently spreading a null control would leave `effectiveness`
 * undefined, making `deflection * effectiveness` NaN inside aeroSurface.mjs's own alpha formula with no error
 * at the point of the actual mistake. This module's own four surfaces all carry a control object today, so
 * the throw is unreached in this file, but withDeflection() is exported as a general utility a future caller
 * (an autopilot, most plausibly) could hand an uncontrolled surface to. */
export function withDeflection(surface, deflection) {
    if (!surface.control) throw new Error("withDeflection(): surface.control is null -- this surface has no control authority to deflect");
    return { ...surface, control: { ...surface.control, deflection } };
}

/**
 * CONTROL MIXING: three-axis pilot input (pitch/roll/yaw, each nominally [-1,1]) to per-surface deflections
 * (radians), scaled by `aircraft.limits`. Roll drives the two wing halves in OPPOSITE directions -- the
 * defining property of an aileron pair, checked directly in the gate -- pitch drives the elevator alone, yaw
 * drives the rudder alone. Each output key maps to exactly one input axis (no surface's deflection depends on
 * more than one control channel), which is what makes this file's superposition identity (see header) hold
 * exactly rather than approximately. The actual SIGN of a channel's real-world effect (which way "positive
 * roll" spins the aircraft) is not asserted here from pilot terminology -- it is derived and reported by the
 * gate's own mirrored-input torque checks, the same discipline aeroSurface.mjs's own sign convention was
 * proven under.
 */
export function mixControls(aircraft, { pitch = 0, roll = 0, yaw = 0 } = {}) {
    const { aileronMaxDeflection, elevatorMaxDeflection, rudderMaxDeflection } = aircraft.limits;
    return {
        leftWing: roll * aileronMaxDeflection,
        rightWing: -roll * aileronMaxDeflection,
        elevator: pitch * elevatorMaxDeflection,
        rudder: yaw * rudderMaxDeflection,
    };
}

/**
 * One tick: mix `controls` into per-surface deflections, compute each surface's aero force against the SAME
 * body-frame relative airflow (aeroSurface.mjs's own relativeAirflow() -- this first slice has no per-surface
 * local flow variation, downwash, or prop wash), sum all four into one accumulator, and integrate via
 * rigidBody6dof.mjs's own step(). Returns { state, perSurface } -- perSurface is keyed exactly like
 * aircraft.surfaces, each entry the same {force,cl,cd,alpha,q} aeroSurface.mjs's own surfaceForce() returns, so
 * a caller (or the gate) can inspect the per-surface breakdown without re-deriving it.
 */
export function stepAircraft(aircraft, state, controls, dt, windWorld = [0, 0, 0], opt) {
    const deflections = mixControls(aircraft, controls);
    const flow = relativeAirflow(state, windWorld);
    const acc = createAccumulator();
    const perSurface = {};
    for (const name of Object.keys(aircraft.surfaces)) {
        const live = withDeflection(aircraft.surfaces[name], deflections[name]);
        perSurface[name] = applySurfaceForce(acc, flow, live);
    }
    return { state: step(state, acc, dt, opt), perSurface };
}

// ---- FRONT DOOR -------------------------------------------------------------------------------------------------
export function reportLines() {
    const aircraft = createAircraft();
    const I = boxInertia({ m: 5, hx: 0.5, hy: 3, hz: 0.15 });
    let s = createBody({ mass: 5, I, pos: [0, 100, 0], vel: [30, 0, 0] });   // level flight, nose along +X, no trim needed: zero controls already give zero net torque (see header)
    const { state: s2, perSurface } = stepAircraft(aircraft, s, { roll: 0.6 }, 1 / 30);
    return [
        "[aircraftAssembly] wing (2 halves, ailerons) + elevator + rudder atop rigidBody6dof.mjs, driven by",
        "                    three-axis control mixing -- aeroSurface.mjs's own force model, assembled.",
        `  roll command 0.6: leftWing alpha=${(perSurface.leftWing.alpha * 180 / Math.PI).toFixed(2)}deg  rightWing alpha=${(perSurface.rightWing.alpha * 180 / Math.PI).toFixed(2)}deg`,
        `  elevator/rudder untouched: elevator.cl=${perSurface.elevator.cl}  rudder.cl=${perSurface.rudder.cl}`,
        `  1 tick later: w=${s2.w.map((v) => v.toFixed(4))}  (roll authority alone, isolated to the body's own roll axis)`,
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
