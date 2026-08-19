// physics/xpbd/xpbd-distance.wgsl -- WebGPU graph-colored XPBD distance-constraint solve. RIG-ONLY.
//
// One thread per constraint in the CURRENT color batch. Because graph coloring guarantees no two constraints in a
// batch share a particle, every thread writes particles[c.i] and particles[c.j] with NO atomics and NO race -- the
// deterministic escape from the atomicAdd approach the reference doc used. The math below is byte-for-byte the twin's
// Eq (18)/(17) in physics/xpbd/xpbd.js, so the CPU twin is the verified reference; ray-... er, solve parity (this
// shader vs the twin, per color, per iteration) is the Galaxina check. Dispatch: for each iteration, for each color
// batch, set u_batch to that batch's constraint indices and dispatch ceil(count/64).
struct Particle { pos: vec3<f32>, inv_mass: f32, };
struct Constraint { i: u32, j: u32, rest: f32, compliance: f32, };

@group(0) @binding(0) var<storage, read_write> particles   : array<Particle>;
@group(0) @binding(1) var<storage, read>       constraints : array<Constraint>;
@group(0) @binding(2) var<storage, read>       batch       : array<u32>;      // constraint indices in this color
@group(0) @binding(3) var<storage, read_write> lambda      : array<f32>;      // per-constraint total multiplier (persists across iterations)
@group(0) @binding(4) var<uniform>             dt          : f32;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let t = gid.x;
    if (t >= arrayLength(&batch)) { return; }
    let ci = batch[t];
    let c = constraints[ci];
    let w1 = particles[c.i].inv_mass;
    let w2 = particles[c.j].inv_mass;
    let wsum = w1 + w2;
    if (wsum == 0.0) { return; }
    let d = particles[c.i].pos - particles[c.j].pos;
    let len = length(d);
    if (len < 1e-12) { return; }
    let C = len - c.rest;
    let aTilde = c.compliance / (dt * dt);
    let dLambda = (-C - aTilde * lambda[ci]) / (wsum + aTilde);   // Eq (18) -- same as the twin, including -aTilde*lambda
    lambda[ci] = lambda[ci] + dLambda;
    let s = dLambda / len;                                        // Eq (17)
    // no two threads in this batch touch the same particle -> direct writes are safe, no atomics
    particles[c.i].pos = particles[c.i].pos + w1 * s * d;
    particles[c.j].pos = particles[c.j].pos - w2 * s * d;
}
