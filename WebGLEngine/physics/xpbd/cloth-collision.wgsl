// physics/xpbd/cloth-collision.wgsl -- WebGPU graph-colored UNILATERAL self-collision. RIG-ONLY.
// v4465 -- SUPERSEDED by physics/xpbd/xpbdWgsl.mjs solveWgsl() with the unilateral flag, which ACCUMULATES lambda as clothFrame does (this file did not, and diverged from the twin at collisionIterations > 1). Never loaded by anything.
//
// The structural, shear and bending constraints are ordinary distance constraints -- physics/xpbd/xpbd-distance.wgsl
// already solves them. This shader adds self-collision: one thread per collision pair in the current color batch,
// pushing two particles apart only when they are closer than the contact distance (unilateral). The pairs are
// discovered on the CPU by physics/xpbd/selfCollide.js, SORTED, then greedily colored, so this dispatch is a pure
// function of the previous positions with no atomics and no race. Math mirrors the unilateral branch of
// physics/xpbd/clothStep.js. rig-only: the CPU twin is the verified reference.
struct Particle { pos: vec3<f32>, inv_mass: f32, };
struct Contact  { i: u32, j: u32, rest: f32, pad: f32, };   // rest = 2 * contact radius

@group(0) @binding(0) var<storage, read_write> particles : array<Particle>;
@group(0) @binding(1) var<storage, read>       contacts  : array<Contact>;
@group(0) @binding(2) var<storage, read>       batch     : array<u32>;   // contact indices in this color
@group(0) @binding(3) var<uniform>             dt        : f32;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let t = gid.x;
    if (t >= arrayLength(&batch)) { return; }
    let c = contacts[batch[t]];
    let w1 = particles[c.i].inv_mass;
    let w2 = particles[c.j].inv_mass;
    let wsum = w1 + w2;
    if (wsum == 0.0) { return; }
    let d = particles[c.i].pos - particles[c.j].pos;
    let len = length(d);
    if (len < 1e-12) { return; }
    let C = len - c.rest;
    if (C >= 0.0) { return; }                 // unilateral: only push apart when penetrating
    let dLambda = -C / wsum;                   // compliance 0 (hard contact), lambda not accumulated for one-shot contact
    let s = dLambda / len;
    particles[c.i].pos = particles[c.i].pos + w1 * s * d;
    particles[c.j].pos = particles[c.j].pos - w2 * s * d;
}
