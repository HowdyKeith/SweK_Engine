// WebGLEngine/physics/box3d/sensorTrigger.mjs -- v4395
//
// The JS side of the sensor and continuous-collision block added to box3d_shim.c this round: strides, event
// decoding, and the two things the measurement turned up that are not in any header.
//
// ---- WHAT A SENSOR IS, AND THE ONE-CHARACTER WAY TO GET NOTHING ------------------------------------------------
//
// A sensor reports overlaps and pushes nothing. Measured: a box falling through a static sensor volume ends at
// the same y, to six decimals, as the same box falling through empty space -- and a solid box in the same place
// stops it at 0.399930. That identity is the property, and it is worth having as a number rather than a belief.
//
// *** BUT SENSOR EVENTS ARE OFF BY DEFAULT ON BOTH ENDS, AND A SILENT SENSOR LOOKS EXACTLY LIKE NO SENSOR. ***
// b3ShapeDef.enableSensorEvents is false by default EVEN FOR SENSORS, and it must also be true on the VISITOR.
// swk_body_sensor turns it on for the sensor it creates; the visitor is the caller's job. Measured: the same
// fall with the visitor's events left off reports begins=0, ends=0 -- a live sensor, a body passing through it,
// and nothing at all.
//
// ---- CONTINUOUS COLLISION IS TWO INDEPENDENT SWITCHES AND THE TRUTH TABLE IS NOT THE OBVIOUS ONE ---------------
//
// b3World_EnableContinuous defaults ON and covers dynamic-versus-STATIC. b3Body_SetBullet defaults off and is
// documented as covering dynamic-versus-dynamic. What the 2x2x2 actually says is stronger than the header:
// against a static wall the bullet flag does NOTHING, and against a dynamic wall the bullet flag does nothing
// EITHER unless the world switch is also on. The bullet flag is not an alternative to continuous, it is a
// second gate behind it, and no sentence in the vendored header says so.
//
// ---- AND THE THING NOBODY WENT LOOKING FOR ---------------------------------------------------------------------
//
// A tunnelling sweep read the same final position for 640 m/s and 1280 m/s, to the last decimal. That is
// b3WorldDef.maximumLinearSpeed, whose default the vendored headers never state because it is assigned in
// box3d's own .c -- so 400 m/s here is a MEASUREMENT, taken from the shipped wasm as well as the native build.
// swk_body_set_velocity accepts any speed and reads back unchanged until the world steps.
//
// It reaches this engine. physics/esBox3d.js clamps a ship to its hull's `speed` and hands that to box3d, and
// ev/tools/es-arena.mjs's Fighter has speed 430. The engine's own clamp is overridden by a library clamp it
// never knew about, for that hull, in the artifact that ships.
"use strict";

/** Packed sensor event rows: sensorBodyIndex, visitorBodyIndex. -1 means a body the table no longer knows. */
export const SENSOR_STRIDE = 2;
export const SENSOR_FIELDS = Object.freeze(["sensor", "visitor"]);

/** Decode `count` packed rows out of a flat Int32Array-like buffer. */
export function readEvents(buf, count) {
    const out = [];
    for (let i = 0; i < count; i++) {
        out.push({ sensor: buf[i * SENSOR_STRIDE], visitor: buf[i * SENSOR_STRIDE + 1] });
    }
    return out;
}

/**
 * box3d's default maximum linear speed, in metres per second. MEASURED, not quoted: the vendored headers
 * declare b3WorldDef.maximumLinearSpeed and both accessors and state no default anywhere.
 */
export const MAX_LINEAR_SPEED_DEFAULT = 400;

/** What a requested speed actually becomes. Above the cap, every speed is the same speed. */
export function effectiveSpeed(asked, cap = MAX_LINEAR_SPEED_DEFAULT) {
    return Math.min(Math.abs(asked), cap);
}

/** Is this hull's top speed a number box3d will honour? */
export function speedIsHonoured(topSpeed, cap = MAX_LINEAR_SPEED_DEFAULT) { return Math.abs(topSpeed) <= cap; }

/**
 * THE RULE, and it is NECESSARY AND NOT SUFFICIENT. Continuous collision can stop a fast body only when:
 *   - the world switch is on, AND
 *   - if the obstacle is DYNAMIC, the moving body is also a bullet.
 *
 * The measured table is eight rows; this is one predicate, and the gate checks the predicate reproduces every
 * row rather than asserting the rows one at a time -- eight hand-written expectations are eight chances to
 * write down what I expected instead of what happened.
 *
 * *** BUT SATISFYING IT DOES NOT GUARANTEE A STOP, AND CCD_HOLE IS THE COUNTEREXAMPLE. *** The table was
 * measured at 500 m/s. Scanning 5..100 m/s with the world switch ON found one speed in ninety-six where the
 * body passes clean through anyway -- 34 m/s, while 33, 35 and 36 all bounce. So `ccdStops` returning true
 * means "nothing here forbids a stop", not "it stops".
 */
export function ccdStops({ continuous, bullet, wallDynamic }) {
    if (!continuous) return false;
    return wallDynamic ? !!bullet : true;
}

/** The speed every CCD_TABLE row was measured at. The table is a slice, and this names where the slice is. */
export const CCD_TABLE_SPEED = 500;

/**
 * A MEASURED COUNTEREXAMPLE to reading ccdStops() as a guarantee: the rule is satisfied and the body still
 * goes through. Its neighbours a metre per second either side do not, which is what makes it a hole rather
 * than a threshold.
 */
export const CCD_HOLE = Object.freeze({
    speed: 34, continuous: 1, bullet: 0, wallDynamic: 0,
    finalY: -61.1576, neighboursStopAt: Object.freeze([33, 35, 36]),
});

/** The 2x2x2, as measured natively at CCD_TABLE_SPEED against a 0.1 m-thick wall. y below -0.5 is a pass. */
export const CCD_TABLE = Object.freeze([
    Object.freeze({ wallDynamic: 0, continuous: 0, bullet: 0, stopped: false }),
    Object.freeze({ wallDynamic: 0, continuous: 0, bullet: 1, stopped: false }),
    Object.freeze({ wallDynamic: 0, continuous: 1, bullet: 0, stopped: true }),
    Object.freeze({ wallDynamic: 0, continuous: 1, bullet: 1, stopped: true }),
    Object.freeze({ wallDynamic: 1, continuous: 0, bullet: 0, stopped: false }),
    Object.freeze({ wallDynamic: 1, continuous: 0, bullet: 1, stopped: false }),
    Object.freeze({ wallDynamic: 1, continuous: 1, bullet: 0, stopped: false }),
    Object.freeze({ wallDynamic: 1, continuous: 1, bullet: 1, stopped: true }),
]);

/** Rows the rule gets wrong. Empty is the claim; a non-empty list is the finding. */
export function ruleDisagreements(table = CCD_TABLE) {
    return table.filter((r) => ccdStops(r) !== r.stopped);
}

/**
 * *** THERE IS NO TUNNELLING THRESHOLD, AND THIS ROUND MEASURED ONE TWICE BEFORE NOTICING. ***
 *
 * Two bisections of the same experiment, differing only in their upper bracket, returned 22.58 m/s and
 * 30.08 m/s. A bisection cannot disagree with itself on a monotonic predicate, so the predicate is not
 * monotonic -- and a dense scan says why. With the world switch OFF, pass-through ALTERNATES IN BANDS:
 * stopped at 20, through at 21, stopped at 22, through at 23-24, stopped at 25, through at 26-28, stopped
 * at 29-30, and so on with the bands widening. It is an ALIASING pattern, not a threshold: whether the
 * discrete samples happen to land inside the wall is a question of phase, and 90 m/s can stop while 13 m/s
 * goes through.
 *
 * So the number worth reporting is not a threshold but a RATE -- what fraction of sampled speeds pass
 * through -- plus the existence of an inversion, which is the fact that kills the threshold framing.
 * travelPerStep stays because it is the right intuition for WHY, and tunnellingSpeed is deliberately named
 * as the speed at which travel first exceeds the gap rather than "the threshold", because it is not one.
 */
export function travelPerStep(speed, hz = 60) { return speed / hz; }
export function tunnellingSpeed(gapMetres, hz = 60) { return gapMetres * hz; }

/** The dense scan of 5..100 m/s in 1 m/s steps, measured natively against the same 0.1 m static wall. */
export const ALIASING_SCAN = Object.freeze({
    from: 5, to: 100, step: 1, samples: 96,
    withoutContinuous: Object.freeze({ tunnelled: 64, lowestTunnel: 13, highestStop: 90 }),
    withContinuous: Object.freeze({ tunnelled: 1, lowestTunnel: 34, highestStop: 100 }),
});

/** An inversion is a speed that passes through BELOW a speed that stops. One is enough to kill a threshold. */
export function hasInversion({ lowestTunnel, highestStop }) { return lowestTunnel < highestStop; }

/** The names added to box3d_shim.c this round, in one place, so PENDING_REBUILD cannot drift from the shim. */
export const ADDED_AT_V4395 = Object.freeze([
    "swk_sensor_stride", "swk_body_sensor", "swk_body_is_sensor", "swk_body_enable_sensor_events",
    "swk_sensor_begin_count", "swk_sensor_end_count", "swk_sensor_begin", "swk_sensor_end",
    "swk_world_enable_continuous", "swk_world_continuous_enabled",
    "swk_body_set_bullet", "swk_body_is_bullet",
    "swk_world_set_max_linear_speed", "swk_world_max_linear_speed",
]);
