// ===================================================================
// simulation/verletTentacle.js
// -------------------------------------------------------------------
// A tiny, real Verlet-integration rope. The "ocean systems" teardown
// (OCEAN_TEARDOWN.md #4) flagged that the dumped GPU soft-body/tentacle
// code never actually wired (no buffer binds, no rasterizer discard).
// This is the wireable version: CPU Verlet points + distance constraints,
// anchored at one end, with gravity, drag and a current/sway force. Each
// node is just an {x,y,z, px,py,pz} — the caller renders nodes however it
// likes (we drive small spawned `tentacle_seg` voxel entities).
//
//   const arm = createTentacle(ax,ay,az, dirX,dirZ, nodeCount, restLen);
//   stepTentacle(arm, {x,y,z}, dt, {gravity,damping,iters,floorY,swayX,swayZ});
//   // then move an entity to each arm.nodes[i] (i>=1; node 0 is the anchor)
//
// node 0 is the anchor (pinned to the mantle each step); nodes 1..N follow.
// ===================================================================

/**
 * Build a tentacle pre-splayed outward from an anchor so the first frame
 * isn't a degenerate stack of coincident points.
 */
export function createTentacle(ax, ay, az, dirX, dirZ, nodeCount, restLen) {
    const nodes = [];
    for (let i = 0; i < nodeCount; i++) {
        const x = ax + dirX * restLen * i;
        const y = ay - 0.18 * restLen * i;   // slight initial droop
        const z = az + dirZ * restLen * i;
        nodes.push({ x, y, z, px: x, py: y, pz: z });
    }
    return { nodes, restLen };
}

/**
 * One Verlet step. Pins node 0 to `anchor`, integrates the rest under
 * gravity + current sway with velocity damping, then relaxes the
 * fixed-length distance constraints and clamps to the seabed.
 *
 * env: { gravity, damping, iters, floorY, swayX, swayZ }
 */
export function stepTentacle(arm, anchor, dt, env) {
    const nodes = arm.nodes;
    const g = env.gravity ?? 1.4, damp = env.damping ?? 0.86;
    const iters = env.iters ?? 3, floorY = env.floorY ?? -1e9;
    const swayX = env.swayX ?? 0, swayZ = env.swayZ ?? 0;

    // Pin the anchor.
    nodes[0].x = anchor.x; nodes[0].y = anchor.y; nodes[0].z = anchor.z;
    nodes[0].px = anchor.x; nodes[0].py = anchor.y; nodes[0].pz = anchor.z;

    // Integrate the free nodes (Verlet: x += (x - px)*damp + accel*dt^2).
    for (let i = 1; i < nodes.length; i++) {
        const n = nodes[i];
        const vx = (n.x - n.px) * damp, vy = (n.y - n.py) * damp, vz = (n.z - n.pz) * damp;
        n.px = n.x; n.py = n.y; n.pz = n.z;
        n.x += vx + swayX * dt;
        n.y += vy - g * dt * dt;          // gravity pulls arms down toward the floor
        n.z += vz + swayZ * dt;
    }

    // Relax distance constraints (anchor stays put; child moves fully when
    // its parent is the anchor, otherwise both halves move).
    const rest = arm.restLen;
    for (let it = 0; it < iters; it++) {
        for (let i = 1; i < nodes.length; i++) {
            const a = nodes[i - 1], b = nodes[i];
            let dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
            const d = Math.hypot(dx, dy, dz) || 1e-4;
            const diff = (d - rest) / d;
            if (i - 1 === 0) {            // parent is the pinned anchor
                b.x -= dx * diff; b.y -= dy * diff; b.z -= dz * diff;
            } else {
                a.x += dx * diff * 0.5; a.y += dy * diff * 0.5; a.z += dz * diff * 0.5;
                b.x -= dx * diff * 0.5; b.y -= dy * diff * 0.5; b.z -= dz * diff * 0.5;
            }
        }
        // Seabed clamp.
        for (let i = 1; i < nodes.length; i++) if (nodes[i].y < floorY) nodes[i].y = floorY;
    }
}
