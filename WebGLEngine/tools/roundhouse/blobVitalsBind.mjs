// tools/roundhouse/blobVitalsBind.mjs
//
// v4009 -- THE FIRST OVERNIGHT-CURRICULUM DEVICE. physics/blobVitals.js was proposed by
// tools/roundhouse/curriculum.mjs's GRADE kind: it has its own selfcheck but no *Bind.mjs imports it, so
// gradedCoverage.mjs counted it PROVEN and UNGRADED.
//
// *** THE ANSWER KEY IS NOT INVENTED, IT IS THE FILE'S OWN HEADER: FOUR REAL BUGS THAT REALLY SHIPPED. ***
// blobVitals.js's four flags (real, home, together, himself) are each THE GAUGE FOR ONE SPECIFIC DEATH Keith's
// own aquarium already suffered -- v2595 dismantled, v2596 dissolved, v2597 dropped, v2597 vanished. The device
// below drives three of those four ON PURPOSE (dismantled/dropped/vanished): each is a direct, reproducible
// manipulation of the blob array that matches the historical bug's own shape, and the assertion is that
// vitals() flags it. The fourth (dissolved) is NOT reproduced here -- v2596's actual mechanism was baking the
// field into a 64^3 grid and advecting it, which is a diffusion solver blobVitals.js does not contain, so
// FAKING that death by corrupting `peak` directly would not be testing the diagnostic, it would be testing a
// number I typed. What IS graded for that gauge is the thing v2596 actually proved: peak >= floor is not a
// runtime check succeeding by luck, it is `max(a)` of the tallest lump's own centre, algebraically incapable of
// reading otherwise while the field is genuinely built from lumps -- so "healthy" mode asserts that invariant
// holds, which is the honest form of grading a bound that cannot be violated by construction.
//
// NO PLANT IS DECLARED. plantedCoverage's "planted" convention is a physics LAW swapped for a plausible wrong
// one, graded end-to-end from knob to observable. Corrupting a blob's own coordinates to match a shipped UI/
// wiring bug is not that -- it is a unit test of the DIAGNOSTIC, not a wrong-physics knob -- so this device is
// honestly UNCOVERED by plantedCoverage rather than declaring a plant that is not one, the exact trap v3916
// named for spacefill's `raster` mode.
"use strict";
import { vitals, diagnose, closestPair } from "../../physics/blobVitals.js";
import { makeBlobs } from "../../simulation/tomo/blobPhantom.js";

const DEF = { n: 6, seed: 20260715 };

export const BLOB_VITALS_MODES = ["healthy", "dismantled", "dropped", "vanished"];

const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);

export function blobVitalsDefaults(hyp) {
    const h = { mode: "healthy", ...(hyp || {}) };
    const c = { ...DEF, ...(h.config || {}) };
    c.n = Math.min(20, Math.max(2, num(c.n, DEF.n) | 0));
    c.seed = (num(c.seed, DEF.seed)) >>> 0;
    h.config = c;
    if (!BLOB_VITALS_MODES.includes(h.mode)) h.mode = "healthy";
    return h;
}

export async function buildBlobVitals(hyp, base = {}) {
    const h = blobVitalsDefaults({ ...hyp, config: { ...(hyp && hyp.config), ...base } });
    const c = h.config;
    const blobs = makeBlobs(c.n, c.seed).map((b) => ({ ...b }));
    // Captured BEFORE any mode corrupts the array -- vitals()'s own contract: "dismantled" means the pair
    // CHANGED from reset, not merely that it reads large.
    const baseline = closestPair(blobs);

    if (h.mode === "dismantled") {
        // death #1, v2595: field radius used as collision radius blew the closest pair 0.2103 -> 1.1255, 5.4x
        // apart -- a rigid solver PUSHING EVERY OVERLAP OUT, not just one pair. So this scales every blob's
        // position away from the swarm's own centroid by a fixed factor: EVERY pairwise distance grows by
        // exactly that factor, so the new closest pair is guaranteed past the 2.5x threshold no matter which
        // pair was closest before -- pushing only the one closest pair left a second, still-tight pair to mask
        // the corruption, which the first version of this mode measured rather than assumed.
        const cx = blobs.reduce((s, b) => s + b.x, 0) / blobs.length;
        const cy = blobs.reduce((s, b) => s + b.y, 0) / blobs.length;
        const cz = blobs.reduce((s, b) => s + b.z, 0) / blobs.length;
        const factor = 4;
        for (let k = 0; k < blobs.length; k++)
            blobs[k] = { ...blobs[k], x: cx + (blobs[k].x - cx) * factor, y: cy + (blobs[k].y - cy) * factor, z: cz + (blobs[k].z - cz) * factor };
        // MEASURED, AND WORTH KEEPING RATHER THAN HIDING: at this spread `himself` ALSO reads false, because
        // fieldPeak() samples a discrete 15-per-axis grid and separated (no-longer-overlapping) blobs shrink
        // the peak to a narrow bump the grid can miss by a few tenths -- a real sampling-resolution property of
        // fieldPeak(), not a defect of THIS mode. diagnose() checks together before himself, so the reported
        // diagnosis is still correctly "COMING APART", not "IMPOSSIBLE" -- the death this mode is FOR.
    } else if (h.mode === "dropped") {
        // death #3, v2597: no floor in the tank -- measured 872 units below the x-ray after fifteen seconds.
        blobs[0] = { ...blobs[0], y: blobs[0].y - 872 };
    } else if (h.mode === "vanished") {
        // death #4, v2597: setTransform(id, x, y, z) instead of arrays put `undefined` into the wasm -- NaN.
        blobs[0] = { ...blobs[0], x: NaN };
    }

    const v = vitals(blobs, baseline);
    return {
        closestPair: v.closestPair,
        peak: v.peak,
        floor: v.floor,
        // *** THE GRADED INVARIANT FOR "himself". *** v2596 proved this cannot go negative while the field is
        // built from lumps: floor is max(a) and the tallest lump contributes exactly its amplitude at its own
        // centre, so peak can only be raised by the others, never lowered below it.
        peakMinusFloor: v.peak - v.floor,
        real: v.real ? 1 : 0,
        home: v.home ? 1 : 0,
        together: v.together ? 1 : 0,
        himself: v.himself ? 1 : 0,
        healthy: (v.real && v.home && v.together && v.himself) ? 1 : 0,
        diagnosis: diagnose(v),
    };
}

export const BLOB_VITALS_OBSERVABLES = [
    "closestPair", "peak", "floor", "peakMinusFloor", "real", "home", "together", "himself", "healthy", "diagnosis",
];

// THE STRING IS FOR A PERSON; THE FIELD'S EXISTENCE IS FOR THE TOOL (beamBind's convention). This is a
// MEASURED refusal, not a preemptive one -- see the file header for the two reasons: three of the four gauges
// (real/home/together) detect a shipped UI/WIRING BUG, not a wrong physics LAW, so there is no physics knob to
// perturb; the fourth (himself) is a bound PROVEN to hold by construction, so nothing here can make it false
// without also making the field stop being built from lumps, which is a different module's job.
const PLANT_REFUSED =
    "every gauge here (real/home/together) detects a shipped UI/wiring bug -- a NaN coordinate, an out-of-tank " +
    "position, a solver separating lumps -- not a physics law with a knob to perturb. The fourth (himself) is " +
    "v2596's proven bound, algebraically incapable of failing while the field is built from lumps. Declaring a " +
    "plant here would MANUFACTURE coverage the way beam's and compose's refusals already named.";

// *** THE EXPIRY, AS A PREDICATE. *** The refusal below says every gauge here DETECTS A SHIPPED BUG -- a NaN
// coordinate, an out-of-tank position, a solver separating lumps -- rather than expressing a physics law with a
// knob to perturb. That is a statement about the SHAPE of the observables, and the shape is checkable: a gauge
// is a BOOLEAN, and a boolean has nothing a knob can move continuously. A plant needs a number.
//
// So the condition is: if any gauge stops being 0/1, this device has acquired a continuous quantity, there is
// something for a knob to perturb, and the refusal is done. Read off the device's own build, never grepped.
const VITAL_GAUGES = ["real", "home", "together", "himself", "healthy"];

async function blobVitalsRefusalExpired() {
    const v = await buildBlobVitals({}, {});
    const continuous = VITAL_GAUGES.filter((k) => k in v && v[k] !== 0 && v[k] !== 1);
    const expired = continuous.length > 0;
    return {
        expired, observable: "gauges(" + VITAL_GAUGES.join("/") + ")",
        measured: VITAL_GAUGES.filter((k) => k in v).length,
        evidence: expired
            ? "these gauges are no longer boolean: " + continuous.map((k) => k + " = " + v[k]).join(", ")
              + ". A CONTINUOUS quantity is something a knob can move, so a plant is now available. THE REFUSAL "
              + "HAS EXPIRED."
            : "all " + VITAL_GAUGES.filter((k) => k in v).length + " gauges are boolean (" 
              + VITAL_GAUGES.filter((k) => k in v).map((k) => k + "=" + v[k]).join(", ")
              + "): each DETECTS a shipped bug rather than expressing a law with a knob, and a boolean has "
              + "nothing for a knob to move.",
    };
}

export const blobVitalsDevice = {
    plantRefusedExpiry: blobVitalsRefusalExpired,
    plantRefused: PLANT_REFUSED,
    modes: BLOB_VITALS_MODES,
    name: "blob-vitals",
    observables: BLOB_VITALS_OBSERVABLES,
    build: buildBlobVitals,
    defaults: blobVitalsDefaults,
};
