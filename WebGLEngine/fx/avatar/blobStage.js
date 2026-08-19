// fx/avatar/blobStage.js -- drawn to the gauges, but never off the stage.
//
// Two ideas that have to coexist honestly. The blobs WANT the gauges: each one is pulled toward whichever gauge is
// nearest, so the instruments become attractors and the stage develops opinions about where to be. But the stage is a
// stage -- they can lean on the walls, they can hit them hard, and they never leave. That second part is written as an
// invariant rather than a force: containment is applied AFTER integration and clamps position outright, so no amount
// of speed, attraction or bad luck can tunnel a blob through a wall. A soft "wall force" would be a wall that mostly
// works, and mostly is not a wall.
//
// Gravity is untouched -- the blob still has to earn its altitude (fx/avatar/blobGravity.js). This only governs where
// it drifts and where it may not go.
"use strict";

function makeStage(opts = {}) {
    const b = opts.bounds || { x: [-3.2, 3.2], z: [-1.2, 1.2], yMax: 6.0 };
    const attractors = opts.attractors || [];
    const pull = opts.pull == null ? 2.4 : opts.pull;        // how badly they want the gauge
    const drag = opts.drag == null ? 1.1 : opts.drag;
    const bounce = opts.bounce == null ? 0.35 : opts.bounce; // walls take most of the energy: they lean, not pinball
    const sep = opts.separation == null ? 0.9 : opts.separation;

    function nearest(x, z) {
        let best = null, bd = Infinity;
        for (const a of attractors) { const d = Math.hypot(a.p[0] - x, (a.p[2] || 0) - z); if (d < bd) { bd = d; best = a; } }
        return best ? { a: best, dist: bd } : null;
    }
    const inside = (x, z, y) => x >= b.x[0] && x <= b.x[1] && z >= b.z[0] && z <= b.z[1] && y >= 0 && y <= b.yMax;
    // THE INVARIANT: clamp after integrating. A blob cannot be outside the stage at the end of a step, ever.
    function contain(body) {
        if (body.x < b.x[0]) { body.x = b.x[0]; if (body.vx < 0) body.vx = -body.vx * bounce; }
        if (body.x > b.x[1]) { body.x = b.x[1]; if (body.vx > 0) body.vx = -body.vx * bounce; }
        if (body.z < b.z[0]) { body.z = b.z[0]; if (body.vz < 0) body.vz = -body.vz * bounce; }
        if (body.z > b.z[1]) { body.z = b.z[1]; if (body.vz > 0) body.vz = -body.vz * bounce; }
        if (body.agent) { const st = body.agent.st; if (st.y > b.yMax) { st.y = b.yMax; if (st.vy > 0) st.vy = -st.vy * bounce; } if (st.y < 0) { st.y = 0; if (st.vy < 0) st.vy = 0; } }
        return body;
    }
    // one lateral step: want the nearest gauge, drag, integrate, then be contained no matter what
    function step(bodies, dt) {
        for (const body of bodies) {
            const n = nearest(body.x, body.z);
            if (n) { const dx = n.a.p[0] - body.x, dz = (n.a.p[2] || 0) - body.z, d = Math.max(0.15, Math.hypot(dx, dz));
                const k = pull * (n.a.strength == null ? 1 : n.a.strength);
                body.vx += (dx / d) * k * dt; body.vz += (dz / d) * k * dt; body.want = n.a.id; }
            body.vx -= body.vx * drag * dt; body.vz -= body.vz * drag * dt;
            body.x += body.vx * dt; body.z += body.vz * dt;
        }
        for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {   // they crowd, they don't stack
            const A = bodies[i], B = bodies[j], dx = B.x - A.x, dz = B.z - A.z, d = Math.hypot(dx, dz) || 1e-6;
            if (d < sep) { const k = (sep - d) * 0.5 / d; A.x -= dx * k; A.z -= dz * k; B.x += dx * k; B.z += dz * k; }
        }
        for (const body of bodies) contain(body);   // last word: the stage
        return bodies;
    }
    return { step, contain, nearest, inside, bounds: b, attractors, get n() { return attractors.length; } };
}
function makeBody(opts = {}) { return { id: opts.id || "b", x: opts.x || 0, z: opts.z || 0, vx: 0, vz: 0, agent: opts.agent || null, want: null }; }
export { makeStage, makeBody };
