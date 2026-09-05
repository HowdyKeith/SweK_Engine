// WebGLEngine/physics/backendLimits.mjs -- v4397
//
// *** physics/backend.js CALLS THE TWO BACKENDS INTERCHANGEABLE. THIS IS THE LIST OF WAYS THEY ARE NOT, WITH
//     NUMBERS. ***
//
// v2468 established the method and the reason. box3d carried no drag at all while Jolt carried 5%/s, two
// identical worlds drifted 0.973 m apart in 2.5 seconds, and the facade had been promising they were the same
// substrate the whole time. Neither library was wrong; the ENGINE had never chosen. That finding came from
// running one experiment on both engines and comparing, and this file is the same move applied to what v4396
// measured on box3d alone.
//
// v4396's own footer could not tell two things apart, and said so: are the aliasing bands and the 34 m/s hole
// properties of DISCRETE-TIMESTEP PHYSICS, or properties of BOX3D? A single engine cannot answer that. A second
// one can, and the answer is one of each.
//
// ---- WHAT IS SHARED, AND WHAT IS BOX3D'S ALONE ------------------------------------------------------------
//
//   SHARED -- a speed cap exists in both, and neither documents it.       Both engines silently clamp. box3d at
//             400 m/s, Jolt at 500. Both numbers are MEASURED: box3d's default is assigned in its own .c and
//             the vendored headers state it nowhere, and Jolt's PhysicsSettings in this build does not even
//             expose the field (mMaxLinearVelocity reads undefined) so it cannot be quoted at all.
//
//   SHARED -- there is no tunnelling THRESHOLD in either.                 Both are non-monotonic: box3d passes a
//             body through at 13 m/s and stops one at 90, and Jolt passes at 52 and stops at 100. So v4396's
//             correction generalises: pass-through is a question of PHASE, and a bisection for a threshold
//             returns a property of its own bracket in either engine.
//
//   BOX3D'S ALONE -- the hole in continuous collision.                    With continuous enabled, box3d still
//             passes a body through at exactly 34 m/s while 33, 35 and 36 all bounce -- 1 of 96 sampled speeds.
//             Jolt's LinearCast stops all 96. So "continuous collision is necessary and not sufficient" is a
//             statement about box3d, and v4396 was right to ship a counterexample rather than a law.
//
//   DIVERGENT -- the same ship flies at two different speeds.             The caps differ by 100 m/s, and
//             physics/esBox3d.js clamps a ship to its hull's `speed` and hands that to whichever backend the
//             router picked. ev/tools/es-arena.mjs's Fighter asks for 430: it gets 400 on box3d and 430 on
//             Jolt. Same species as the v2468 damping divergence, found the same way.
//
// ---- AND THE SENSOR APIS ARE SHAPED DIFFERENTLY IN A WAY THAT MATTERS ---------------------------------------
//
// box3d has a DEDICATED event buffer: b3World_GetSensorEvents returns begin/end arrays that contain sensor
// overlaps and nothing else. Jolt routes sensor overlaps through the ORDINARY ContactListener -- the same
// OnContactAdded that reports a crate landing on the floor -- so a portable reader must ask Body.IsSensor()
// to tell a trigger from a collision. Measured: a sensor above a solid floor produces two contact events, one
// with IsSensor() true on side A and one with it false on both.
//
// *** THE NAIVE NORMALISATION IS THEREFORE WRONG, AND WRONG IN THE DANGEROUS DIRECTION: *** counting contact
// events on Jolt reports every solid collision as a trigger firing. The discriminator is not optional.
//
// One more asymmetry, and it is the reverse of the usual one: Jolt's Body has SetIsSensor, so a body can BECOME
// a sensor after creation. box3d's b3Shape_IsSensor is a getter with no setter, which is exactly why v4396's
// shim needed a second creation entry point rather than a flag.
"use strict";

export const BACKENDS = Object.freeze(["box3d", "jolt"]);

/**
 * The measured speed cap per backend, in metres per second. Neither is quoted from a header -- see the block
 * above on why neither CAN be.
 */
export const SPEED_CAP = Object.freeze({ box3d: 400, jolt: 500 });

/** What a requested speed actually becomes on a given backend. */
export function effectiveSpeed(asked, backend) {
    const cap = SPEED_CAP[backend];
    if (cap == null) throw new Error("backendLimits: unknown backend " + backend);
    return Math.min(Math.abs(asked), cap);
}

/** Does this speed survive on every backend, or does the answer depend on which one the router picked? */
export function speedDivergesAcrossBackends(asked) {
    const seen = new Set(BACKENDS.map((b) => effectiveSpeed(asked, b)));
    return seen.size > 1;
}

/**
 * The tunnelling profile: 5..100 m/s in 1 m/s steps, a 0.2 m cube driven at a 0.1 m-thick static wall, 60 Hz,
 * 4 substeps, LINEAR DAMPING MATCHED AT 0.05 ON BOTH ENGINES.
 *
 * *** THE MATCH IS NOT A DETAIL AND v2468 IS THE REASON. *** box3d's swk_body_box hard-codes damping 0.05;
 * the first Jolt scan used 0 and read 25/96 with an onset at 45 m/s. Matching box3d's value moved it to 19/96
 * and 52 m/s. An unmatched comparison would have reported a 45-vs-13 difference between the engines that was
 * partly a difference between two damping settings -- which is the exact mistake v2468 caught the facade making.
 */
export const TUNNEL_GRID = Object.freeze({ from: 5, to: 100, step: 1, samples: 96, hz: 60, damping: 0.05 });

export const TUNNEL_PROFILE = Object.freeze({
    box3d: Object.freeze({
        ccdOff: Object.freeze({ tunnelled: 64, lowestTunnel: 13, highestStop: 90 }),
        ccdOn: Object.freeze({ tunnelled: 1, lowestTunnel: 34, highestStop: 100 }),
        ccdOffSource: "native build only -- swk_world_enable_continuous is not in the shipped wasm yet",
        ccdOnSource: "BOTH the native build and vendor/box3d/box3d.wasm, which agree on the hole at 34",
    }),
    jolt: Object.freeze({
        ccdOff: Object.freeze({ tunnelled: 19, lowestTunnel: 52, highestStop: 100 }),
        ccdOn: Object.freeze({ tunnelled: 0, lowestTunnel: -1, highestStop: 100 }),
        ccdOffSource: "vendor/jolt, EMotionQuality_Discrete -- no rebuild involved",
        ccdOnSource: "vendor/jolt, EMotionQuality_LinearCast",
    }),
});

/** An inversion is a speed that passes through BELOW a speed that stops. One is enough to kill a threshold. */
export function hasInversion({ lowestTunnel, highestStop }) {
    return lowestTunnel > 0 && lowestTunnel < highestStop;
}

/** Does continuous collision stop EVERY sampled speed on this backend? Only Jolt does. */
export function ccdIsAbsolute(backend, profile = TUNNEL_PROFILE) {
    return profile[backend].ccdOn.tunnelled === 0;
}

/**
 * How the two engines deliver a sensor overlap. The `discriminator` is the part a portable reader cannot skip.
 */
export const SENSOR_API = Object.freeze({
    box3d: Object.freeze({
        delivery: "dedicated buffer", call: "b3World_GetSensorEvents",
        discriminator: null,          // the buffer holds sensor overlaps and nothing else
        settableAfterCreation: false, // b3Shape_IsSensor is a getter with no setter
    }),
    jolt: Object.freeze({
        delivery: "ordinary contact listener", call: "ContactListener.OnContactAdded",
        discriminator: "Body.IsSensor()",
        settableAfterCreation: true,  // Body.SetIsSensor exists
    }),
});

/** Backends whose sensor events arrive mixed in with ordinary collisions, so a reader MUST discriminate. */
export function needsSensorDiscriminator(api = SENSOR_API) {
    return BACKENDS.filter((b) => api[b].discriminator != null);
}

/**
 * Every capability where the two backends measurably disagree, DERIVED rather than listed. v4387's lesson: a
 * hand-written list of divergences beside the measurements drifts away from them.
 */
export function divergences({ cap = SPEED_CAP, profile = TUNNEL_PROFILE, api = SENSOR_API } = {}) {
    const out = [];
    if (cap.box3d !== cap.jolt) {
        out.push({ what: "maximum linear speed", box3d: cap.box3d, jolt: cap.jolt,
                   consequence: "a hull asking for more than " + Math.min(cap.box3d, cap.jolt) +
                                " m/s flies at a different speed depending on the backend" });
    }
    if (profile.box3d.ccdOff.tunnelled !== profile.jolt.ccdOff.tunnelled) {
        out.push({ what: "tunnelling with CCD off", box3d: profile.box3d.ccdOff.tunnelled + "/" + TUNNEL_GRID.samples,
                   jolt: profile.jolt.ccdOff.tunnelled + "/" + TUNNEL_GRID.samples,
                   consequence: "the same fast body is far likelier to pass through a wall on box3d" });
    }
    if (ccdIsAbsolute("box3d") !== ccdIsAbsolute("jolt")) {
        out.push({ what: "CCD stops every sampled speed", box3d: ccdIsAbsolute("box3d"), jolt: ccdIsAbsolute("jolt"),
                   consequence: "box3d has a hole at " + profile.box3d.ccdOn.lowestTunnel + " m/s and Jolt has none" });
    }
    if (api.box3d.delivery !== api.jolt.delivery) {
        out.push({ what: "sensor event delivery", box3d: api.box3d.delivery, jolt: api.jolt.delivery,
                   consequence: "a portable reader must call " + api.jolt.discriminator +
                                " or it reports solid collisions as triggers" });
    }
    if (api.box3d.settableAfterCreation !== api.jolt.settableAfterCreation) {
        out.push({ what: "a body can become a sensor after creation", box3d: api.box3d.settableAfterCreation,
                   jolt: api.jolt.settableAfterCreation,
                   consequence: "box3d needs a second creation entry point; Jolt does not" });
    }
    return out;
}

/** What BOTH engines do, which is the half a single-engine round cannot establish. */
export function shared({ cap = SPEED_CAP, profile = TUNNEL_PROFILE } = {}) {
    return {
        cappedSilently: BACKENDS.every((b) => cap[b] > 0),
        capUndocumented: true,   // see the header: box3d's is in its own .c, Jolt's field reads undefined here
        noTunnellingThreshold: BACKENDS.every((b) => hasInversion(profile[b].ccdOff)),
    };
}
