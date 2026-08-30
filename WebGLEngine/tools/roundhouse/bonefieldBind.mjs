// tools/roundhouse/bonefieldBind.mjs
//
// v3522 -- THE BONEFIELD DEVICE (Round 2, cont'd). physics/soft/boneField.js turns a skeleton into a signed
// distance field: each bone is a SEGMENT with a radius (a capsule), and the flesh is their union. It had a
// selfcheck but no device. The field is a Float32Array, so the keys are exact to single precision (~1e-8), which
// is the precision the marched mesh is built at.
//
// MODE "capsule" grades three facts, and one of them is the module's whole trick:
//
//   SEGMENT  the distance to the middle of a bone is the perpendicular distance minus the radius, to 1e-8. The
//            capsule SDF is an EXACT distance, which is why a mesh can be graded against it.
//   CAP      *** THE CLAMP IS THE TRICK. *** Beyond an endpoint the distance is to the ENDPOINT (a spherical cap),
//            |p - a| - r, not to the infinite line. "Getting the clamp wrong gives you limbs that reach out of
//            the room" -- so this is the key that separates a capsule from an infinite cylinder.
//   UNION    with blend 0 the union of two bones is plain min of their distances, to 1e-8.
//
// THE PLANT REMOVES THE SEGMENT CLAMP (t is not held to [0,1]), turning every capsule into an infinite cylinder.
// A point one unit BEYOND the endpoint, which is 0.7 outside the flesh, is reported at -0.3 -- INSIDE -- so capErr
// jumps from 1e-8 to 1.0, while the mid-segment distance and the union, which never leave the clamped interval,
// stay green. The field's determinism (a pure function of the bones, bit-identical across calls) is asserted as a
// control, because a deterministic skeleton wearing a non-deterministic skin would lose the property at the last step.

import { boneField } from "../../physics/soft/boneField.js";

// Sample the real field at one world point via a 1-cell grid whose origin is that point.
const sampleReal = (bones, p, opts = {}) => boneField(bones, 1, 1, 1, { origin: p, cellSize: 1, ...opts })[0];

// The planted distance: the segment clamp removed, so t runs off the ends and the capsule becomes an infinite line.
function distUnclamped(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], len2 = dx * dx + dy * dy + dz * dz;
    let t = 0;
    if (len2 > 1e-12) t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy + (p[2] - a[2]) * dz) / len2;   // NO clamp to [0,1]
    const cx = a[0] + t * dx, cy = a[1] + t * dy, cz = a[2] + t * dz;
    return Math.hypot(p[0] - cx, p[1] - cy, p[2] - cz);
}

export const BONEFIELD_OBSERVABLES = [
    "segmentErr", "capErr", "unionErr",
    "segmentExact", "capClamped", "unionIsMin", "deterministic", "planted",
];

function boneKeys(planted) {
    const bone = { a: [0, 0, 0], b: [2, 0, 0], r: 0.3 };
    const s = planted ? (p) => distUnclamped(p, bone.a, bone.b) - bone.r : (p) => sampleReal([bone], p);
    // SEGMENT: perpendicular distance to the middle of the bone (t in [0,1] naturally, so blind to the clamp).
    const segmentErr = Math.abs(s([1, 1, 0]) - (1 - bone.r));
    // CAP: one unit beyond endpoint a, the distance is |p - a| - r = 0.7 (spherical cap) -- the clamped answer.
    const capErr = Math.abs(s([-1, 0, 0]) - (Math.hypot(1, 0, 0) - bone.r));
    // UNION (always the real field): blend 0 gives plain min of the two capsule distances.
    const b2 = { a: [0, 3, 0], b: [2, 3, 0], r: 0.3 };
    const unionErr = Math.abs(sampleReal([bone, b2], [1, 1.5, 0], { blend: 0 }) - Math.min(1.5 - 0.3, 1.5 - 0.3));
    // DETERMINISM (control): the field is a pure function of the bones, bit-identical across two builds.
    const g = { origin: [-1, -1, -1], cellSize: 0.5 };
    const f1 = boneField([bone, b2], 8, 8, 8, g), f2 = boneField([bone, b2], 8, 8, 8, g);
    let determ = 0;
    for (let i = 0; i < f1.length; i++) determ = Math.max(determ, Math.abs(f1[i] - f2[i]));
    return {
        segmentErr, capErr, unionErr,
        segmentExact: segmentErr < 1e-5,
        capClamped: capErr < 1e-5,
        unionIsMin: unionErr < 1e-5,
        deterministic: determ === 0,
        planted,
    };
}

function buildBonefield({ mode = "capsule", config = {} } = {}) {
    const blank = {
        segmentErr: null, capErr: null, unionErr: null,
        segmentExact: null, capClamped: null, unionIsMin: null, deterministic: null,
        planted: !!config.planted,
    };
    if (mode === "capsule") return { ...blank, ...boneKeys(!!config.planted) };
    return blank;
}

export const bonefieldDevice = {
    // v3522 -- METHOD PLANT: the perturbation removes the segment clamp, a one-line method change that turns every
    // capsule into an infinite cylinder upstream of the cap measurement.
    plantKind: "method",
    // v4104 -- NAMED, THE SAME COMPLETION v3851/v4088-v4103 gave the rest of this family. MEASURED, both arms:
    // capErr 1e-8 -> 1.0, matching the header exactly, while segmentErr and unionErr (which never leave the
    // clamped interval) stay green.
    planted: { knob: "planted", observable: "capErr",
               note: "the segment clamp (t held to [0,1]) is removed, so t runs off the ends and every capsule becomes an infinite cylinder -- a point 0.7 outside the flesh, one unit beyond the endpoint, reads as -0.3, INSIDE" },
    modes: ["capsule"],
    name: "capsule-bone-field",
    observables: BONEFIELD_OBSERVABLES,
    build: buildBonefield,
    // GUARDED: an undeclared mode returns null rather than a silent substitution.
    defaults: ({ mode } = {}) => {
        const m = mode == null ? "capsule" : mode;
        return m === "capsule" ? { mode: m, config: {} } : null;
    },
};
