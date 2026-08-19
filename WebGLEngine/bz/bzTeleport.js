// WebGLEngine/bz/bzTeleport.js — the doorway, and what happens when you walk through it.
//
// The other half of round nine. `bz/bzLinks.js` decides WHICH face you arrive at; this decides whether you
// crossed one and where exactly you land.
//
// From src/obstacle/Teleporter.cxx (2.4 branch):
//
//   isCrossing   the tank's oriented rectangle against the teleporter's HOLE -- `width` by
//                `breadth - border`, and z within `height - border`. Not the frame: the frame is solid, and
//                a tank that is inside the frame is not crossing anything, it is stuck.
//
//   getPointWRT  the transfer. Translate to the source's origin, undo its rotation, THROW THE X COORDINATE
//                AWAY and replace it with the destination's own half-thickness on the far side, scale y and
//                z by the ratio of the two holes, re-rotate, translate. The angle changes by exactly the
//                difference of the two face rotations.
//
// The x coordinate is discarded, and that is the whole trick: you do not arrive "where you were relative to
// the door", you arrive AT the far door, on its far side, at the same height and offset across it. A wide
// teleporter linked to a narrow one squeezes you; that is the `dimsScale`, and it is deliberate.
//
// `face == 0` is the +x side of a teleporter's own frame, `face == 1` the -x side. Entering one face and
// leaving the other -- which is what an unlinked teleporter does, by `doLinking`'s passthru rule -- turns
// out to preserve the tank's heading exactly, because the two 180-degree spins cancel. bz/tools/
// bz-teleport-selfcheck.mjs asserts that, because it is the difference between a doorway and a spinner.

"use strict";

import { testRectRect } from "./bzCollide.js";

const TELEPORT_COOLDOWN = 0.25;   // seconds. You arrive AT the far face, which is still inside its hole.

// The hole, not the frame. `size` is the hole (round two established that `outerSize` carries the border).
function holeOf(t) {
    return { width: t.size[0], breadth: t.size[1], height: t.size[2] };
}

// Which face of a teleporter a point is on. 0 is +x in the teleporter's own frame, 1 is -x.
function sideOf(t, px, py) {
    const c = Math.cos(-t.rotation), s = Math.sin(-t.rotation);
    const x = c * (px - t.pos[0]) - s * (py - t.pos[1]);
    return x < 0 ? 1 : 0;
}

// Is the tank's box in the doorway? The hole's half-breadth is `size[1]`, and BZFlag writes it as
// `getBreadth() - getBorder()` because by then `size[1]` has already grown by two borders. Same number.
function isCrossing(t, px, py, pz, angle, dx, dy) {
    const h = holeOf(t);
    if (pz < t.pos[2] || pz > t.pos[2] + h.height) return false;
    return testRectRect(t.pos[0], t.pos[1], t.rotation || 0, h.width, h.breadth, px, py, angle, dx, dy);
}

// getPointWRT. `face1` is the face crossed on the way in, `face2` the face arrived at.
function transfer(t1, face1, t2, face2, pos, angle) {
    const h1 = holeOf(t1), h2 = holeOf(t2);
    // The relative sizes of the two holes. A wide door into a narrow one squeezes what goes through it.
    const scaleY = h2.breadth / h1.breadth;
    const scaleZ = h2.height / h1.height;

    // NOTE, and it is BZFlag's own: if face1 === face2 there is an extra 180 degrees of spin. That falls
    // out of these two lines and is not a special case.
    const r1 = (t1.rotation || 0) + (face1 === 0 ? 0 : Math.PI);
    const r2 = (t2.rotation || 0) + (face2 === 1 ? 0 : Math.PI);

    // Translate to the source's origin and undo its rotation.
    let x = pos[0] - t1.pos[0], y = pos[1] - t1.pos[1];
    const c1 = Math.cos(-r1), s1 = Math.sin(-r1);
    let lx = c1 * x - s1 * y, ly = s1 * x + c1 * y;
    let lz = pos[2] - t1.pos[2];

    // Throw the x coordinate away. You arrive AT the far door, not where you were relative to this one.
    lx = -h2.width;
    ly *= scaleY;
    lz *= scaleZ;

    // Re-rotate into the destination's frame and translate.
    const c2 = Math.cos(r2), s2 = Math.sin(r2);
    const outX = c2 * lx - s2 * ly + t2.pos[0];
    const outY = s2 * lx + c2 * ly + t2.pos[1];
    const outZ = lz + t2.pos[2];

    return { pos: [outX, outY, outZ], angle: angle + (r2 - r1), delta: r2 - r1 };
}

// The whole step, for a tank. Returns null when nothing happened.
//
// `state` is the tank's own cooldown. Without it you arrive at the far face, which is inside its own hole,
// and cross straight back: two teleporters and a tank become a pendulum. BZFlag keeps the player's
// `teleporterProximity` for the same reason; a quarter of a second is ours, and it is named as ours.
function tryTeleport(world, linking, tank, dt, rnd) {
    if (tank.teleCooldown > 0) { tank.teleCooldown -= dt; return null; }
    const teles = world.obstacles.filter((o) => o.type === "teleporter");
    for (let i = 0; i < teles.length; i++) {
        const t = teles[i];
        if (!isCrossing(t, tank.pos[0], tank.pos[1], tank.pos[2], tank.angle, tank.spec.dx, tank.spec.dy)) continue;
        const face = sideOf(t, tank.pos[0], tank.pos[1]);
        const target = getTargetFace(linking, i * 2 + face, rnd);
        const t2 = teles[Math.floor(target / 2)];
        if (!t2) continue;
        const out = transfer(t, face, t2, target % 2, tank.pos, tank.angle);
        tank.pos = out.pos;
        tank.angle = out.angle;
        tank.teleCooldown = TELEPORT_COOLDOWN;
        return { from: i * 2 + face, to: target, spun: Math.abs(out.delta) > 1e-6 };
    }
    return null;
}

// Kept separate so bz-teleport-selfcheck can inject a deterministic rng without reaching into bzLinks.
let getTargetFace = (linking, face, rnd) => {
    const list = linking.dsts[face];
    if (!list || !list.length) return face;
    if (list.length === 1) return list[0];
    return list[Math.min(list.length - 1, Math.floor((rnd || Math.random)() * list.length))];
};

export { isCrossing, sideOf, transfer, tryTeleport, holeOf, TELEPORT_COOLDOWN };
if (typeof module !== "undefined" && module.exports)
    module.exports = { isCrossing, sideOf, transfer, tryTeleport, holeOf, TELEPORT_COOLDOWN };
