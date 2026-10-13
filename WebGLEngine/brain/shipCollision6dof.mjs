// WebGLEngine/brain/shipCollision6dof.mjs -- v4848
//
// SHIP-SHIP COLLISIONS FOR THE 6DOF SPACE BATTLE, ONCE, FOR THE PAGE AND FOR THE DUEL THAT TRAINS ITS PILOTS. es-box3d-6dof.html resolved these in a function of its own (resolveCollisions) and
// brain/pilot6dofPolicy.mjs's duel() did not resolve them at all, so every pilot this tree trained had never once been rammed or been able to ram. This is that function moved out, line for line:
// the SAT hit from physics/mechanics/rigidBody6dofCollision.mjs, the contact manifold from physics/obbManifold.js, the impulse solver over the manifold (restitution 0.35, friction 0.5), one positional
// correction at the deepest point, and ram damage -- the summed impulse times RAM_DAMAGE_PER_IMPULSE, capped at RAM_DAMAGE_CAP -- taken by BOTH ships, equally.
//
// *** EQUAL DAMAGE IS A FACT ABOUT THIS RULE THAT MATTERS TO ANYTHING THAT LEARNS ON IT. *** A ram costs the rammer exactly what it costs the rammed, so ramming is never free -- and a ship that is ahead on
// hit points can still gain by it. Whether a trained pilot learns to ram on purpose is a measurement (tools/ship/ramBaseline6dof.mjs), not an assumption either way.
//
// The page's order is kept: both fleets move, THEN collisions, THEN shots. A ship is not marked dead here; the caller does, after the tick's shots, as the page's syncScene always has.
// Pure: no DOM, no clock, no random. brain/shipCollision6dof-selfcheck.mjs holds this to a verbatim copy of the page's v4846 function on bit-for-bit scenes.
"use strict";
import * as RBC from "../physics/mechanics/rigidBody6dofCollision.mjs";
import * as OM from "../physics/obbManifold.js";

export const RAM_DAMAGE_PER_IMPULSE = 0.3, RAM_DAMAGE_CAP = 25, RESTITUTION = 0.35, FRICTION = 0.5;

/**
 * Resolve every overlapping pair among `ships` (objects with .body, .hp and .dead; all the same hull, half-extents `half`). Mutates .body and .hp as the page always did. Returns the contacts of this call:
 * [{ a, b, impulse, dmg }] -- `a` and `b` are the ship objects, `impulse` the summed impulse over the manifold, `dmg` the hit points each of them lost. A call with nothing touching returns [].
 */
export function resolveShipCollisions(ships, half) {
    const events = [];
    for (let i = 0; i < ships.length; i++) {
        if (ships[i].dead) continue;
        for (let j = i + 1; j < ships.length; j++) {
            const a = ships[i], b = ships[j];
            if (b.dead) continue;
            const c = RBC.checkContact(a.body, half, b.body, half);
            // obbContact reads a NaN body as a HIT WITH NO NORMAL (every axis comparison against NaN is false, so no axis is ever chosen); the manifold then throws and, on the page, the frame loop dies. A body in that state
            // is not touching anything. This is the only line that differs from the page's v4846 function, and it differs only where that function threw.
            if (!c.hit || !c.normal) continue;
            const manifold = OM.obbManifold(RBC.bodyOBB(a.body, half), RBC.bodyOBB(b.body, half), c);
            const { totalImpulse: impulse, a: a2, b: b2 } = RBC.resolveManifold(a.body, b.body, manifold.points, { restitution: RESTITUTION, friction: FRICTION });
            const deepest = manifold.points.reduce((best, p) => (p.depth > best.depth ? p : best));
            const { a: a3, b: b3 } = RBC.positionalCorrection(a2, b2, deepest);
            a.body = a3; b.body = b3;
            let dmg = 0;
            if (impulse > 0) { dmg = Math.min(RAM_DAMAGE_CAP, impulse * RAM_DAMAGE_PER_IMPULSE); a.hp -= dmg; b.hp -= dmg; }
            events.push({ a, b, impulse, dmg });
        }
    }
    return events;
}
