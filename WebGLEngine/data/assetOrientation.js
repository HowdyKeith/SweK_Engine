// FILE: data/assetOrientation.js
// VERSION: v1 (v800 — heuristic orientation auto-detect for voxel assets)
//
// Most voxel generation APIs (Gemini, others) return a raw voxel grid
// with no canonical orientation. To support "move the drunken elephant
// FORWARD and have it face its movement direction," we need to know
// which way is forward for each asset.
//
// This module's heuristic:
//   1. Compute the filled-voxel axis-aligned bounding box (AABB)
//   2. Pick the longest horizontal axis (X or Z) — that's the
//      "long direction" of the model (most quadrupeds, vehicles,
//      elongated shapes have a length axis that's their direction)
//   3. Compute center-of-mass (COM) over filled voxels
//   4. The "front" of the model is the END that the COM is offset
//      TOWARD along the long axis (heads/snouts/etc weight more than
//      tails/rears). Confidence is proportional to how far the COM
//      is offset from the bbox center.
//   5. Up defaults to +Y. We don't have a reliable "which way is up"
//      heuristic for arbitrary voxel models — the gen process tends
//      to put things up-Y already.
//
// Voxel input format expected (matches the engine's existing format):
//   - Array of { x, y, z, c? } objects, OR
//   - Array of [x, y, z, c?] tuples, OR
//   - { voxels: <one of the above> } wrapper
//
// Returns:
//   {
//     forward: "+x" | "-x" | "+z" | "-z",
//     up: "+y",
//     confidence: 0..1   // higher = more decisive bias along long axis
//     reasoning: string,  // human-readable explanation
//   }
// or null if the input has too few filled voxels (< 4) to be analyzed.

export function autoDetectOrientation(input) {
    const voxels = _normalizeVoxels(input);
    if (!voxels || voxels.length < 4) {
        return null;
    }

    // bbox + COM in one pass
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    let sumX = 0, sumY = 0, sumZ = 0;
    const n = voxels.length;
    for (const v of voxels) {
        if (v.x < minX) minX = v.x; if (v.x > maxX) maxX = v.x;
        if (v.y < minY) minY = v.y; if (v.y > maxY) maxY = v.y;
        if (v.z < minZ) minZ = v.z; if (v.z > maxZ) maxZ = v.z;
        sumX += v.x; sumY += v.y; sumZ += v.z;
    }
    const com = { x: sumX / n, y: sumY / n, z: sumZ / n };
    const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 };
    const ext = { x: maxX - minX, y: maxY - minY, z: maxZ - minZ };

    // Pick the longer horizontal axis as the "length"
    let longAxis, shortAxis;
    if (ext.x >= ext.z) { longAxis = "x"; shortAxis = "z"; }
    else                { longAxis = "z"; shortAxis = "x"; }

    // How far is COM offset from center along the long axis, normalized
    // by half the bbox extent? 0 = perfectly centered (no bias); 1 = COM
    // sits at one extreme.
    const longExt = ext[longAxis];
    const offset = com[longAxis] - center[longAxis];
    const offsetNorm = longExt > 0 ? Math.abs(offset) / (longExt / 2) : 0;
    // Confidence: low if model is roughly symmetric, high if obviously
    // weighted to one end. Cap at 1.0.
    const confidence = Math.min(1.0, offsetNorm);

    // Forward direction: the COM is offset TOWARD this direction
    let forwardSign;
    if (Math.abs(offset) < 1e-3) {
        // Symmetric — pick a deterministic default (positive direction)
        forwardSign = "+";
    } else {
        forwardSign = offset > 0 ? "+" : "-";
    }
    const forward = forwardSign + longAxis;

    // Reasoning string for the UI
    const isLongElongated = (longExt / Math.max(0.5, ext[shortAxis])) > 1.5;
    let reasoning;
    if (confidence < 0.15) {
        reasoning = `Symmetric along ${longAxis.toUpperCase()} (low confidence). Default ${forward}.`;
    } else if (isLongElongated) {
        reasoning = `Elongated along ${longAxis.toUpperCase()}; COM weighted toward ${forwardSign}${longAxis} (conf ${confidence.toFixed(2)}).`;
    } else {
        reasoning = `Roughly cubic, but COM leans ${forwardSign}${longAxis} (conf ${confidence.toFixed(2)}).`;
    }

    return {
        forward,
        up: "+y",
        confidence,
        reasoning,
        bbox: { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] },
        com: [com.x, com.y, com.z],
    };
}

/**
 * Apply an orientation override to a base rotation when spawning an
 * entity. Returns a yaw adjustment (radians) that aligns the asset's
 * "forward" axis with whatever direction the calling code intends as
 * "forward" in world space.
 *
 *   const yawAdjust = orientationToYawOffset(asset.orientation);
 *   entity.yaw = movementYaw + yawAdjust;
 *
 * Convention: the engine treats +Z as forward by default. Mapping:
 *   asset's +z  → no adjustment        (0)
 *   asset's +x  → +90° rotation       (PI/2)
 *   asset's -z  → 180° rotation        (PI)
 *   asset's -x  → -90° rotation       (-PI/2)
 */
export function orientationToYawOffset(orientation) {
    if (!orientation?.forward) return 0;
    switch (orientation.forward) {
        case "+z": return 0;
        case "+x": return Math.PI / 2;
        case "-z": return Math.PI;
        case "-x": return -Math.PI / 2;
        // Vertical "forward" doesn't have a yaw meaning — return 0
        case "+y": case "-y": return 0;
        default: return 0;
    }
}

function _normalizeVoxels(input) {
    if (!input) return null;
    let arr;
    if (Array.isArray(input)) arr = input;
    else if (Array.isArray(input.voxels)) arr = input.voxels;
    else return null;
    if (arr.length === 0) return null;
    // Already-object form
    if (typeof arr[0] === "object" && !Array.isArray(arr[0]) && arr[0].x !== undefined) {
        return arr;
    }
    // Tuple form [x, y, z, c?]
    if (Array.isArray(arr[0]) && arr[0].length >= 3) {
        return arr.map(t => ({ x: t[0], y: t[1], z: t[2], c: t[3] }));
    }
    return null;
}
