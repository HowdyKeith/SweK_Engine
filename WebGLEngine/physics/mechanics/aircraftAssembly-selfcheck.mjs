// WebGLEngine/physics/mechanics/aircraftAssembly-selfcheck.mjs
//
// Run: node physics/mechanics/aircraftAssembly-selfcheck.mjs
//
// THE SIBLING GATE OF physics/mechanics/aircraftAssembly.mjs. Two properties are load-bearing, both derived and
// verified in a standalone scratch script BEFORE this module or its gate existed, the same discipline
// aeroSurface.mjs's own sign-convention bug was caught under:
//   SECTIONS 4/5/6 -- a pure single-axis control command produces torque EXACTLY isolated to that axis, zero
//     (not merely small) on the other two -- a consequence of every surface's mount point sitting exactly on
//     the relevant symmetry line and Cl being exactly odd about alpha=0 (see aircraftAssembly.mjs's own header).
//     A wrong mount coordinate or a mis-wired span axis shows up here as a nonzero cross-axis torque.
//   SECTION 7 -- combined-control force/torque, once the zero-control BASELINE is subtracted out, equals the
//     sum of each single axis's own baseline-subtracted delta -- an exact algebraic identity that falls out of
//     mixControls() giving each surface a deflection driven by exactly one input axis (not an approximation;
//     see aircraftAssembly.mjs's own header for why the UN-subtracted sum does NOT hold for force, only torque).
//
// SABOTAGE LOG -- each applied to physics/mechanics/aircraftAssembly.mjs, the gate run, the module restored
// (diffed to confirm byte-identical). Counts below are what actually ran, not predicted:
//   A  mixControls()'s rightWing sign flipped back to +roll*aileronMaxDeflection (dropping the aileron
//      differential -- both wings would deflect the SAME way under a roll command) -> 5 red: section 2's direct
//      "opposite sign" checks (both the raw value check and the leftWing===-rightWing check), section 4's
//      "leftWing/rightWing alpha exactly opposite" and "torque.x is nonzero" checks (identical deflection on
//      both wings produces perfectly cancelling lift at +/-y, net roll torque exactly zero), and section 9's
//      "w.x changed" check (zero torque -> zero angular acceleration).
//   B  the rudder's mount moved off the y=0 centreline ([tailMountX, 0.05, 0] instead of [tailMountX, 0, 0]) --
//      a plausible copy-paste mistake from the wing's own off-centreline mount -> 5 red, WIDER than the yaw-only
//      leak this was expected to cause: the rudder's own BASELINE (zero-deflection) drag now has a nonzero
//      moment arm too, so torque.z leaks into section 4's roll-isolation check and section 5's pitch-isolation
//      check as well (both now carry the rudder's constant off-axis drag torque, present regardless of which
//      control channel is active), plus section 6's own mirrored-yaw-torque check and section 8's zero-control
//      trim check (net torque no longer exactly [0,0,0] even with nothing commanded).
//   C  the rudder's span swapped from UP_BODY to RIGHT_BODY (the same axis the wings use) -- a plausible
//      mis-wire that turns the rudder into a third aileron (lift toward +Z) instead of a yaw surface (force
//      toward +/-Y) -> 2 red: section 6's "torque.y (pitch) is EXACTLY zero" (a yaw command now produces a
//      vertical force at an x-offset mount, which is a PITCH moment, not a yaw one) and "torque.z (yaw) is
//      NONZERO" (yaw authority is gone entirely -- the misdirected force produces zero torque about Z).
//   D  withDeflection() changed to `{ ...surface, control: { deflection } }` (dropping the `...surface.control`
//      spread, losing `effectiveness`) -- a plausible refactor mistake -> 25 red, essentially every section:
//      `effectiveness` becomes undefined, `deflection * effectiveness` is NaN in aeroSurface.mjs's own alpha
//      formula, and NaN propagates through alpha/cl/cd/force into every torque/force/state comparison
//      downstream, including section 10's dedicated finite-number sweep.
//   E  withDeflection()'s `if (!surface.control) throw ...` guard removed (an ADVERSARIAL REVIEW's own
//      finding: a control-less surface silently produced a NaN-filled object instead of a clear error) -> 1
//      red: section 3b's own dedicated "throws on control:null" check. Nothing else goes red -- this module's
//      own four surfaces all carry a real control object, so removing the guard is invisible everywhere else,
//      which is exactly why the review flagged it as a latent footgun for a future caller rather than a live bug.
"use strict";
import { createBody, boxInertia } from "./rigidBody6dof.mjs";
import * as AC from "./aircraftAssembly.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const near3 = (a, b, eps = 1e-9) => near(a[0], b[0], eps) && near(a[1], b[1], eps) && near(a[2], b[2], eps);
const finite3 = (v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);

console.log("aircraftAssembly-selfcheck -- wing+tail+rudder assembled on rigidBody6dof.mjs, control mixing\n");

const aircraft = AC.createAircraft();
const body = createBody({ mass: 5, I: boxInertia({ m: 5, hx: 0.5, hy: 3, hz: 0.15 }), vel: [30, 0, 0] });   // pure +X relative airflow -> zero baseline AoA on every surface (chord aligned)

/** Drive stepAircraft()'s own control-mixing + per-surface force pipeline (against `body`'s pure +X relative
 * airflow -- zero baseline AoA on every surface), then reconstitute the AGGREGATE accumulator (force+torque)
 * from its perSurface breakdown via rigidBody6dof.mjs's own applyForceAtPoint() -- exactly the aggregation
 * stepAircraft() performs internally, redone here explicitly so this gate can inspect the summed torque/force
 * directly rather than only the integrated end state. */
function applyControlsReal(controls) {
    const { perSurface } = AC.stepAircraft(aircraft, body, controls, 1 / 30);
    const acc = AC.createAccumulator();
    for (const name of Object.keys(aircraft.surfaces)) AC.applyForceAtPoint(acc, perSurface[name].force, aircraft.surfaces[name].mount);
    return { acc, perSurface };
}

console.log("1. createAircraft() DEFAULTS -- ALL FOUR SURFACES PRESENT, ZERO-AoA BASELINE, KEYS MATCH mixControls()");
{
    const keys = Object.keys(aircraft.surfaces).sort();
    ok("!! exactly the four expected surfaces, correctly keyed", JSON.stringify(keys) === JSON.stringify(["elevator", "leftWing", "rightWing", "rudder"]), `${keys}`);
    ok("limits carry all three control channels", "aileronMaxDeflection" in aircraft.limits && "elevatorMaxDeflection" in aircraft.limits && "rudderMaxDeflection" in aircraft.limits);
}

console.log("\n2. mixControls() -- DIRECT NUMERIC VALUES, AND THE AILERON DIFFERENTIAL BY CONSTRUCTION");
{
    const d = AC.mixControls(aircraft, { pitch: 0.5, roll: 0.4, yaw: -0.3 });
    ok("!! leftWing === +roll * aileronMaxDeflection, EXACTLY", d.leftWing === 0.4 * aircraft.limits.aileronMaxDeflection, `${d.leftWing}`);
    ok("!! rightWing === -roll * aileronMaxDeflection, EXACTLY -- the differential", d.rightWing === -0.4 * aircraft.limits.aileronMaxDeflection, `${d.rightWing}`);
    ok("!! elevator === pitch * elevatorMaxDeflection, EXACTLY", d.elevator === 0.5 * aircraft.limits.elevatorMaxDeflection, `${d.elevator}`);
    ok("!! rudder === yaw * rudderMaxDeflection, EXACTLY", d.rudder === -0.3 * aircraft.limits.rudderMaxDeflection, `${d.rudder}`);
    ok("!! leftWing === -rightWing (opposite sign, equal magnitude -- the defining aileron property)", d.leftWing === -d.rightWing, `${d.leftWing} vs ${d.rightWing}`);
    const zero = AC.mixControls(aircraft, {});
    ok("all-zero input gives all-zero deflections (defaults are 0)", Object.values(zero).every((v) => v === 0), `${JSON.stringify(zero)}`);
}

console.log("\n3. withDeflection() -- GEOMETRY UNCHANGED, ONLY control.deflection MOVES, ORIGINAL SURFACE UNTOUCHED");
{
    const base = aircraft.surfaces.rightWing;
    const live = AC.withDeflection(base, 0.2);
    ok("!! span/chord/normal identical (deflection does not touch geometry)", near3(live.span, base.span) && near3(live.chord, base.chord) && near3(live.normal, base.normal));
    ok("!! effectiveness preserved from the base surface", live.control.effectiveness === base.control.effectiveness, `${live.control.effectiveness} vs ${base.control.effectiveness}`);
    ok("!! deflection updated to the requested value", live.control.deflection === 0.2, `${live.control.deflection}`);
    ok("the ORIGINAL surface's own deflection is untouched (no mutation)", base.control.deflection === 0, `${base.control.deflection}`);
}

console.log("\n3b. withDeflection() REFUSES A CONTROL-LESS SURFACE -- LOUD FAILURE, NOT A SILENT NaN");
{
    // an adversarial review found the FIRST version silently spread a null control into `{}`, leaving
    // `effectiveness` undefined and `deflection*effectiveness` NaN deep inside aeroSurface.mjs's own alpha
    // formula -- reachable today only via a fixed, uncontrolled surface (createSurface()'s own `control: null`
    // default), which none of this module's four surfaces are, but withDeflection() is exported as a general
    // utility a future caller could hand one to.
    const fixedFin = { ...aircraft.surfaces.rudder, control: null };
    let threw = false, message = "";
    try { AC.withDeflection(fixedFin, 0.1); } catch (e) { threw = true; message = e.message; }
    ok("!! withDeflection() THROWS on a surface with control:null, instead of returning a NaN-producing object", threw, message);
}

console.log("\n4. PURE ROLL COMMAND -- torque EXACTLY isolated to the body's own +X axis, zero pitch/yaw leak");
{
    const r = applyControlsReal({ roll: 0.6 });
    ok("!! leftWing and rightWing alpha are exactly opposite (differential)", r.perSurface.leftWing.alpha === -r.perSurface.rightWing.alpha, `${r.perSurface.leftWing.alpha} vs ${r.perSurface.rightWing.alpha}`);
    ok("elevator and rudder untouched by a pure roll command (cl exactly 0)", r.perSurface.elevator.cl === 0 && r.perSurface.rudder.cl === 0);
    ok("!! torque.x (roll) is NONZERO", r.acc.torque[0] !== 0, `torque=${r.acc.torque}`);
    ok("!! torque.y (pitch) is EXACTLY zero", r.acc.torque[1] === 0, `torque=${r.acc.torque}`);
    ok("!! torque.z (yaw) is EXACTLY zero", r.acc.torque[2] === 0, `torque=${r.acc.torque}`);
    const neg = applyControlsReal({ roll: -0.6 });
    ok("!! mirrored roll command gives EXACTLY mirrored torque.x (not just 'some' torque)", neg.acc.torque[0] === -r.acc.torque[0], `+roll=${r.acc.torque[0]} -roll=${neg.acc.torque[0]}`);
}

console.log("\n5. PURE PITCH COMMAND -- torque EXACTLY isolated to the body's own +Y axis, zero roll/yaw leak");
{
    const r = applyControlsReal({ pitch: 0.6 });
    ok("only elevator deflected (wings and rudder at exact zero-cl baseline)", r.perSurface.elevator.cl !== 0 && r.perSurface.leftWing.cl === 0 && r.perSurface.rightWing.cl === 0 && r.perSurface.rudder.cl === 0);
    ok("!! torque.x (roll) is EXACTLY zero", r.acc.torque[0] === 0, `torque=${r.acc.torque}`);
    ok("!! torque.y (pitch) is NONZERO", r.acc.torque[1] !== 0, `torque=${r.acc.torque}`);
    ok("!! torque.z (yaw) is EXACTLY zero", r.acc.torque[2] === 0, `torque=${r.acc.torque}`);
    const neg = applyControlsReal({ pitch: -0.6 });
    ok("!! mirrored pitch command gives EXACTLY mirrored torque.y", neg.acc.torque[1] === -r.acc.torque[1], `+pitch=${r.acc.torque[1]} -pitch=${neg.acc.torque[1]}`);
}

console.log("\n6. PURE YAW COMMAND -- torque EXACTLY isolated to the body's own +Z axis, zero roll/pitch leak");
{
    const r = applyControlsReal({ yaw: 0.6 });
    ok("only rudder deflected (wings and elevator at exact zero-cl baseline)", r.perSurface.rudder.cl !== 0 && r.perSurface.leftWing.cl === 0 && r.perSurface.rightWing.cl === 0 && r.perSurface.elevator.cl === 0);
    ok("!! torque.x (roll) is EXACTLY zero", r.acc.torque[0] === 0, `torque=${r.acc.torque}`);
    ok("!! torque.y (pitch) is EXACTLY zero", r.acc.torque[1] === 0, `torque=${r.acc.torque}`);
    ok("!! torque.z (yaw) is NONZERO", r.acc.torque[2] !== 0, `torque=${r.acc.torque}`);
    const neg = applyControlsReal({ yaw: -0.6 });
    ok("!! mirrored yaw command gives EXACTLY mirrored torque.z", neg.acc.torque[2] === -r.acc.torque[2], `+yaw=${r.acc.torque[2]} -yaw=${neg.acc.torque[2]}`);
}

console.log("\n7. SUPERPOSITION (BASELINE-SUBTRACTED) -- combined controls' force/torque delta from the zero-");
console.log("   control baseline EXACTLY equals the sum of each axis's OWN delta from that same baseline");
{
    // NOT the naive un-subtracted sum -- each single-axis scenario still carries the OTHER three surfaces'
    // own nonzero zero-deflection DRAG (Cd(0)=cd0, not zero), so summing three such scenarios directly would
    // triple-count that shared baseline force. Torque is unaffected (baseline force produces exactly zero
    // torque at every one of these centreline/symmetric mount points -- see aircraftAssembly.mjs's header) but
    // force is not, so the correct identity subtracts the baseline first. Verified in scratch before this gate.
    const baseline = applyControlsReal({}).acc;
    const roll = applyControlsReal({ roll: 0.4 }).acc;
    const pitch = applyControlsReal({ pitch: -0.2 }).acc;
    const yaw = applyControlsReal({ yaw: 0.3 }).acc;
    const combined = applyControlsReal({ roll: 0.4, pitch: -0.2, yaw: 0.3 }).acc;
    for (let i = 0; i < 3; i++) {
        const sumDelta = (roll.torque[i] - baseline.torque[i]) + (pitch.torque[i] - baseline.torque[i]) + (yaw.torque[i] - baseline.torque[i]);
        const combinedDelta = combined.torque[i] - baseline.torque[i];
        ok(`!! torque[${i}] delta: combined === sum of per-axis deltas`, near(combinedDelta, sumDelta, 1e-9), `combined=${combinedDelta} sum=${sumDelta}`);
    }
    for (let i = 0; i < 3; i++) {
        const sumDelta = (roll.force[i] - baseline.force[i]) + (pitch.force[i] - baseline.force[i]) + (yaw.force[i] - baseline.force[i]);
        const combinedDelta = combined.force[i] - baseline.force[i];
        ok(`!! force[${i}] delta: combined === sum of per-axis deltas`, near(combinedDelta, sumDelta, 1e-9), `combined=${combinedDelta} sum=${sumDelta}`);
    }
}

console.log("\n8. ZERO-CONTROL TRIM -- net torque EXACTLY [0,0,0], net force is pure drag (no lateral/vertical leak)");
{
    const r = applyControlsReal({});
    ok("!! net torque is EXACTLY [0,0,0] (centreline-symmetric mounting, zero baseline AoA)", r.acc.torque.every((v) => v === 0), `torque=${r.acc.torque}`);
    ok("!! net force.y and force.z are EXACTLY zero", r.acc.force[1] === 0 && r.acc.force[2] === 0, `force=${r.acc.force}`);
    ok("!! net force.x (drag) is negative (opposes the flight direction)", r.acc.force[0] < 0, `force=${r.acc.force}`);
}

console.log("\n9. stepAircraft() -- REAL INTEGRATION: A ROLL COMMAND ACTUALLY SPINS THE AIRCRAFT ON THE RIGHT AXIS");
{
    const { state, perSurface } = AC.stepAircraft(aircraft, body, { roll: 0.6 }, 1 / 30);
    ok("returned state is a genuine rigidBody6dof state (has pos/vel/q/w)", "pos" in state && "vel" in state && "q" in state && "w" in state);
    ok("!! w.x (roll rate) changed from the zero-w starting body", state.w[0] !== 0, `w=${state.w}`);
    ok("!! w.y and w.z stayed EXACTLY zero (pure roll torque, zero initial w)", state.w[1] === 0 && state.w[2] === 0, `w=${state.w}`);
    ok("perSurface is keyed exactly like aircraft.surfaces", JSON.stringify(Object.keys(perSurface).sort()) === JSON.stringify(Object.keys(aircraft.surfaces).sort()));
    ok("the ORIGINAL `body` passed in is untouched (step() does not mutate)", body.w.every((v) => v === 0) && near3(body.vel, [30, 0, 0]), `body.w=${body.w}`);
}

console.log("\n10. NO NaN, EVER -- across a spread of control combinations including extreme (well past +/-1) inputs");
{
    let anyBad = false;
    for (const c of [{}, { roll: 1 }, { roll: -1 }, { pitch: 1 }, { pitch: -1 }, { yaw: 1 }, { yaw: -1 }, { roll: 5, pitch: -5, yaw: 5 }, { roll: 0.001, pitch: -0.001, yaw: 0.001 }]) {
        const { state, perSurface } = AC.stepAircraft(aircraft, body, c, 1 / 30);
        if (!finite3(state.pos) || !finite3(state.vel) || !finite3(state.w) || Object.values(perSurface).some((r) => !finite3(r.force) || !Number.isFinite(r.alpha) || !Number.isFinite(r.cl) || !Number.isFinite(r.cd))) anyBad = true;
    }
    ok("!! every combination stays fully finite -- no NaN/Infinity anywhere in state or per-surface output", !anyBad);
}

console.log("\n11. FORWARD_BODY/UP_BODY/RIGHT_BODY -- the shared axis convention actually matches aeroSurface.mjs's own");
{
    ok("FORWARD_BODY === [1,0,0], matching rigidBody6dofWeapon.mjs's own nose convention", near3(AC.FORWARD_BODY, [1, 0, 0]));
    ok("!! UP_BODY matches the wing surface's own DERIVED normal at default span/chord (aeroSurface.mjs's own Gram-Schmidt result, not asserted fresh here)", near3(AC.UP_BODY, aircraft.surfaces.elevator.normal), `${AC.UP_BODY} vs ${aircraft.surfaces.elevator.normal}`);
}

console.log("\n12. THE FRONT DOOR");
{
    const L = AC.reportLines();
    ok("reportLines names the module and shows a roll-driven wing/tail breakdown plus resulting spin", L.some((l) => /aircraftAssembly/.test(l)) && L.some((l) => /leftWing/.test(l)) && L.some((l) => /rightWing/.test(l)) && L.some((l) => /elevator/.test(l)));
    ok("...and no report line stringifies a missing field as the literal word \"undefined\"", L.every((l) => !/\bundefined\b/.test(l)));
}

console.log(fails ? `\naircraftAssembly-selfcheck: ${fails} FAILED` : "\naircraftAssembly-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
