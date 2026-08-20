// WebGLEngine/ev/esFlight3dMath.js — v3825 (Long Silence, Round A)
//
// THE PURE CORE OF THE 3D RENDER PASS, WITH NO THREE.JS IN IT so a gate can check the one thing that can go
// silently wrong: the map from the sim's numbers to a mesh's transform. es-box3d.js runs the fight on box3d and
// keeps ES coordinates -- a ship is {x, y, heading(deg)} on a plane, ES (x, y) living on box3d's (x, z) with
// box3d's Y locked to 0. Round A does NOT change that; it only reads it and points a mesh at it. So the whole
// risk is a coordinate/heading convention slip, and that is exactly what belongs behind an answer key rather
// than an eyeball on a rotating ship. The Three.js scene (es-box3d-3d.html) imports these and does nothing to
// the numbers itself.
//
// Conventions, fixed here once:
//   world position  : ES (x, y) -> (x, 0, y)          -- box3d's plane, Y up and out of it, held at 0
//   facing          : headingVector(heading) = (sin, -cos) in ES -> (hv.x, 0, hv.y) in world
//   hull local nose : +X (matches shipview.js's procedural ship, nose along +X)
//   yaw to aim +X along the facing : atan2(-hv.y, hv.x)

import { headingVector } from "./flightModel.js";

// The transform for one ship this frame. pos/forward are world (Three) space; rotY is the Y-yaw to apply to a
// hull whose local nose is +X. forward is (cos rotY, 0, -sin rotY) by construction -- returned too so a gate can
// assert the yaw and the facing agree without re-deriving the rotation matrix.
export function shipTransform(ship) {
    const hv = headingVector((ship && ship.heading) || 0);
    return {
        pos: [(ship && ship.x) || 0, 0, (ship && ship.y) || 0],
        rotY: Math.atan2(-hv.y, hv.x),
        forward: [hv.x, 0, hv.y],
    };
}

// The world-space forward a hull actually points after a Y-yaw of rotY (rotate local +X about Y). This is the
// INVERSE of the rotY above; a round-trip through it must return shipTransform().forward, which is the check
// that the rotation sense is right rather than merely self-consistent.
export function forwardFromYaw(rotY) {
    return [Math.cos(rotY), 0, -Math.sin(rotY)];
}

// Fleet bounds in world space, for a camera that frames the whole fight without being hand-tuned per battle.
// radius is the distance from center to the farthest ship on the plane; a caller pulls the camera back by a
// multiple of it. Empty fleet -> a sane unit box so the scene is never degenerate.
export function fleetBounds(ships) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, n = 0;
    for (const s of ships || []) {
        if (!s || s.dead) continue;
        const x = s.x || 0, z = s.y || 0;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
        n++;
    }
    if (!n) return { center: [0, 0, 0], radius: 1, min: [-1, 0, -1], max: [1, 0, 1], count: 0 };
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
    const radius = Math.max(1, Math.hypot(maxX - cx, maxZ - cz));
    return { center: [cx, 0, cz], radius, min: [minX, 0, minZ], max: [maxX, 0, maxZ], count: n };
}

// A tiny helper the page and the gate share: the scene-space scale that maps a world half-extent to a target
// number of Three units, so positions and hull sizes stay in a comfortable range for the camera and the depth
// buffer regardless of how big the battle box is.
export function sceneScale(worldHalfExtent, targetUnits = 30) {
    const h = Math.abs(worldHalfExtent) || 1;
    return targetUnits / h;
}
