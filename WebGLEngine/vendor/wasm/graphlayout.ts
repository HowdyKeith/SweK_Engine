// graphlayout.ts — force-directed graph layout kernels, compiled to graphlayout.wasm.
// The O(n^2) all-pairs repulsion + gravity pass is the bottleneck in graph_viewer
// (self-documented "fine to ~1.5k nodes"); this is the exact tight numeric loop
// WASM accelerates. The edge/spring pass stays in JS (it's O(edges), cheap, and
// walks JS edge objects). Same math as the JS mirror, so outputs are identical.
//
// Memory layout (fixed offsets; the page writes pos/vel, calls the step, reads back):
//   POS_OFF   0        n*3 float32   positions (x,y,z per node)
//   VEL_OFF   6MB      n*3 float32   velocities
// 6MB / 12 bytes = 524288 nodes max — far beyond any real graph.

const POS_OFF: usize = 0;
const VEL_OFF: usize = 6 * 1024 * 1024;

export function posPtr(): usize { return POS_OFF; }
export function velPtr(): usize { return VEL_OFF; }

// @ts-ignore: decorator
@inline function px(i: i32): f32 { return load<f32>(POS_OFF + (<usize>(i * 3)) * 4); }
// @ts-ignore: decorator
@inline function py(i: i32): f32 { return load<f32>(POS_OFF + (<usize>(i * 3 + 1)) * 4); }
// @ts-ignore: decorator
@inline function pz(i: i32): f32 { return load<f32>(POS_OFF + (<usize>(i * 3 + 2)) * 4); }

// The O(n^2) repulsion + centering-gravity + velocity integrate for repulsion only.
// Mirrors graph_viewer's stepLayout inner loop EXACTLY:
//   kRep=2200, grav=0.012, damp=0.86, the *0.001*cooling velocity scale, d2 floor at 1.
// Spring/edge forces and the final position update are applied in JS after this.
export function repulse(n: i32, kRep: f32, grav: f32, damp: f32, cooling: f32): void {
  for (let i = 0; i < n; i++) {
    let fx: f32 = 0.0, fy: f32 = 0.0, fz: f32 = 0.0;
    const ix = px(i), iy = py(i), iz = pz(i);
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      let dx = ix - px(j), dy = iy - py(j), dz = iz - pz(j);
      let d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < 1.0) d2 = 1.0;
      const inv: f32 = 1.0 / d2;
      const f: f32 = kRep * inv;
      const d: f32 = <f32>Math.sqrt(d2);
      fx += dx / d * f; fy += dy / d * f; fz += dz / d * f;
    }
    fx -= ix * grav; fy -= iy * grav; fz -= iz * grav;
    const vo = VEL_OFF + (<usize>(i * 3)) * 4;
    const vx = load<f32>(vo), vy = load<f32>(vo + 4), vz = load<f32>(vo + 8);
    store<f32>(vo,     (vx + fx * 0.001 * cooling) * damp);
    store<f32>(vo + 4, (vy + fy * 0.001 * cooling) * damp);
    store<f32>(vo + 8, (vz + fz * 0.001 * cooling) * damp);
  }
}

// Final integrate: pos += vel over n*3 components. (Cheap, but keeping it in WASM
// avoids a JS pass over the same 6MB and a second typed-array round-trip.)
export function integrate(n: i32): void {
  const c = n * 3;
  for (let i = 0; i < c; i++) {
    const po = POS_OFF + (<usize>i) * 4;
    const vo = VEL_OFF + (<usize>i) * 4;
    store<f32>(po, load<f32>(po) + load<f32>(vo));
  }
}
