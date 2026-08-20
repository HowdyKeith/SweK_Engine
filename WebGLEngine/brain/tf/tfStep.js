// brain/tf/tfStep.js
//
// The deterministic twin for a WebGL2 TRANSFORM-FEEDBACK agent integrator: a vertex shader that reads each agent's
// position/velocity, integrates one step under a flow field (plus a ring coupling to its neighbour), and writes the
// result straight into a GPU buffer for the next frame -- no CPU readback. Thousands of agents advance per frame
// entirely on the GPU.
//
// The catch transform feedback hands you is the same shape as the one graph coloring solved for XPBD: the GPU runs
// the vertices in an UNDEFINED order, in parallel. So the update has to be a PURE FUNCTION OF THE PREVIOUS FRAME --
// read the source buffer, write a separate destination buffer, then swap (ping-pong). Do that and vertex order can
// never change the answer. Write the new positions back INTO the buffer you are still reading and you get an
// order-dependent read-after-write race -- an agent that reads its neighbour sees a value that may or may not have
// been updated yet, depending on who ran first. tfStep is the pure double-buffered version; tfStepInPlace is the
// hazard, kept so the gate can show the difference. Only +,-,*,/ -- no trig, no random -- so it is bit-identical.

// A fixed divergence-light rotational flow field. Pure arithmetic; deterministic across machines.
export function swirl(px, py, pz) {
    return [py * 0.5 - pz * 0.3, pz * 0.4 - px * 0.5, px * 0.3 - py * 0.4];
}

const order0 = (N) => { const a = new Array(N); for (let i = 0; i < N; i++) a[i] = i; return a; };

// PURE ping-pong step: reads only `src`, returns a fresh `dst`. Agent processing order cannot matter.
// Each agent is coupled to the next in a ring (agent a pulled toward agent (a+1)%N) -- a real cross-agent read,
// but always read from `src`, so it stays a pure function of the previous frame.
export function tfStep(src, opts = {}) {
    const N = src.pos.length / 3;
    const dt = opts.dt ?? 0.02, k = opts.coupling ?? 0.6;
    const order = opts.order || order0(N);
    const dst = { pos: new Float64Array(src.pos.length), vel: new Float64Array(src.vel.length) };
    for (const a of order) {
        const o = 3 * a, no = 3 * ((a + 1) % N);
        const px = src.pos[o], py = src.pos[o + 1], pz = src.pos[o + 2];
        const [sx, sy, sz] = swirl(px, py, pz);
        const fx = sx + k * (src.pos[no] - px), fy = sy + k * (src.pos[no + 1] - py), fz = sz + k * (src.pos[no + 2] - pz);
        const vx = src.vel[o] + fx * dt, vy = src.vel[o + 1] + fy * dt, vz = src.vel[o + 2] + fz * dt;
        dst.vel[o] = vx; dst.vel[o + 1] = vy; dst.vel[o + 2] = vz;
        dst.pos[o] = px + vx * dt; dst.pos[o + 1] = py + vy * dt; dst.pos[o + 2] = pz + vz * dt;
    }
    return dst;
}

// THE HAZARD: reads and writes the SAME buffer, so a neighbour may already be updated. Order-dependent by design --
// this is exactly what the double-buffer above avoids, and what would happen without transform feedback's separate
// output buffer. Present only so the gate can prove the pure version is not vacuously order-invariant.
export function tfStepInPlace(buf, opts = {}) {
    const N = buf.pos.length / 3;
    const dt = opts.dt ?? 0.02, k = opts.coupling ?? 0.6;
    const order = opts.order || order0(N);
    for (const a of order) {
        const o = 3 * a, no = 3 * ((a + 1) % N);
        const px = buf.pos[o], py = buf.pos[o + 1], pz = buf.pos[o + 2];
        const [sx, sy, sz] = swirl(px, py, pz);
        const fx = sx + k * (buf.pos[no] - px), fy = sy + k * (buf.pos[no + 1] - py), fz = sz + k * (buf.pos[no + 2] - pz);
        buf.vel[o] += fx * dt; buf.vel[o + 1] += fy * dt; buf.vel[o + 2] += fz * dt;
        buf.pos[o] = px + buf.vel[o] * dt; buf.pos[o + 1] = py + buf.vel[o + 1] * dt; buf.pos[o + 2] = pz + buf.vel[o + 2] * dt;
    }
}

// Ping-pong run: each step produces a fresh destination buffer, which becomes the next step's source. This is the
// exact pattern the transform-feedback loop uses (two buffers, swapped each frame).
export function tfRun(init, steps, opts = {}) {
    let s = { pos: Float64Array.from(init.pos), vel: Float64Array.from(init.vel) };
    for (let i = 0; i < steps; i++) s = tfStep(s, opts);
    return s;
}
