// simulation/lbm/lbm3dShader.js -- D3Q19 as a WGSL compute kernel.
//
// A confession up front, because it belongs in the file rather than in a commit message: THIS CODE HAS NEVER RUN HERE.
// There is no GPU and no browser in the sandbox it was written in. Everything else in this arc was checked against an
// exact analytic answer before it was claimed; this cannot be, and "it looks right" has been wrong roughly fifteen
// times in this project already.
//
// So two defences, neither of which is my word.
//
// FIRST: not one constant is retyped. The velocity set, the weights, the opposites and the speed of sound are all
// interpolated out of lbm3d.js -- the same module the CPU solver uses, the one that earned Hagen-Poiseuille to half a
// percent. If someone edits the lattice tomorrow, this kernel changes with it. There is no second copy to drift.
//
// SECOND, and the real one: this ships with an adjudicator. lbm3d-gpu-check.html runs this kernel against the verified
// CPU solver from the same initial state, on the reader's own hardware, and compares them cell by cell -- and then
// asks the GPU to reproduce Hagen-Poiseuille's paraboloid on its own. If the GPU is wrong, it says so. I cannot prove
// this file. I can ship the thing that proves it.
"use strict";
import { E3, W3, OPP3, Q3 } from "./lbm3d.js";
import { CS2 } from "./lbm2d.js";

const _v3 = (v) => `vec3<f32>(${v[0].toFixed(1)}, ${v[1].toFixed(1)}, ${v[2].toFixed(1)})`;

// Pull scheme: each invocation gathers the populations that stream INTO its cell, takes the moments, collides, writes.
// One kernel, ping-ponged between two buffers -- no separate streaming pass and no race, because every invocation
// writes only its own cell.
const LBM3D_WGSL = `
struct Params {
  dims  : vec4<u32>,          // nx, ny, nz, padding
  force : vec4<f32>,          // fx, fy, fz, tau
};
@group(0) @binding(0) var<storage, read>       fSrc  : array<f32>;
@group(0) @binding(1) var<storage, read_write> fDst  : array<f32>;
@group(0) @binding(2) var<storage, read>       solid : array<u32>;
@group(0) @binding(3) var<storage, read_write> moments : array<f32>;   // rho, ux, uy, uz per cell
@group(0) @binding(4) var<uniform>             P     : Params;

const Q  : u32 = ${Q3}u;
const CS2 : f32 = ${CS2.toFixed(10)};
const K1 : f32 = ${(1 / CS2).toFixed(10)};                  // 1/cs^2   -- derived, never typed
const K2 : f32 = ${(1 / (2 * CS2 * CS2)).toFixed(10)};      // 1/(2cs^4)
const K3 : f32 = ${(1 / (2 * CS2)).toFixed(10)};            // 1/(2cs^2)
const E : array<vec3<f32>, ${Q3}> = array<vec3<f32>, ${Q3}>(${E3.map(_v3).join(", ")});
const W : array<f32, ${Q3}> = array<f32, ${Q3}>(${W3.map(w => w.toFixed(10)).join(", ")});
const OPP : array<u32, ${Q3}> = array<u32, ${Q3}>(${OPP3.map(o => o + "u").join(", ")});

fn cellIndex(x: u32, y: u32, z: u32) -> u32 { return (z * P.dims.y + y) * P.dims.x + x; }
fn wrap(v: i32, n: u32) -> u32 { let m = i32(n); return u32(((v % m) + m) % m); }

fn equilibrium(i: u32, rho: f32, u: vec3<f32>) -> f32 {
  let eu = dot(E[i], u);
  let u2 = dot(u, u);
  return W[i] * rho * (1.0 + K1 * eu + K2 * eu * eu - K3 * u2);
}

@compute @workgroup_size(4, 4, 4)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let nx = P.dims.x; let ny = P.dims.y; let nz = P.dims.z;
  if (gid.x >= nx || gid.y >= ny || gid.z >= nz) { return; }
  let k = cellIndex(gid.x, gid.y, gid.z);
  let base = k * Q;
  let tau = P.force.w;
  let F = P.force.xyz;

  if (solid[k] == 1u) {
    // bounce-back: what arrives leaves the way it came. Gathered, so it matches the CPU's collide-then-stream exactly.
    for (var i: u32 = 0u; i < Q; i = i + 1u) {
      let e = E[OPP[i]];
      let sx = wrap(i32(gid.x) - i32(e.x), nx);
      let sy = wrap(i32(gid.y) - i32(e.y), ny);
      let sz = wrap(i32(gid.z) - i32(e.z), nz);
      fDst[base + i] = fSrc[cellIndex(sx, sy, sz) * Q + OPP[i]];
    }
    moments[k * 4u] = 1.0; moments[k * 4u + 1u] = 0.0; moments[k * 4u + 2u] = 0.0; moments[k * 4u + 3u] = 0.0;
    return;
  }

  // gather the populations that stream in
  var fi : array<f32, ${Q3}>;
  var rho : f32 = 0.0;
  var mom : vec3<f32> = vec3<f32>(0.0, 0.0, 0.0);
  for (var i: u32 = 0u; i < Q; i = i + 1u) {
    let e = E[i];
    let sx = wrap(i32(gid.x) - i32(e.x), nx);
    let sy = wrap(i32(gid.y) - i32(e.y), ny);
    let sz = wrap(i32(gid.z) - i32(e.z), nz);
    let sk = cellIndex(sx, sy, sz);
    var v : f32;
    if (solid[sk] == 1u) { v = fSrc[k * Q + OPP[i]]; } else { v = fSrc[sk * Q + i]; }   // halfway bounce-back
    fi[i] = v;
    rho = rho + v;
    mom = mom + v * e;
  }
  // half-force correction: the force acts across the step, so the velocity is the mid-step one
  var u = mom / rho + 0.5 * F;
  moments[k * 4u] = rho; moments[k * 4u + 1u] = u.x; moments[k * 4u + 2u] = u.y; moments[k * 4u + 3u] = u.z;

  let cf = 1.0 - 1.0 / (2.0 * tau);
  for (var i: u32 = 0u; i < Q; i = i + 1u) {
    let e = E[i];
    let eu = dot(e, u);
    let Fi = W[i] * cf * rho * (K1 * dot(e - u, F) + K2 * 2.0 * eu * dot(e, F));   // Guo forcing
    fDst[base + i] = fi[i] - (fi[i] - equilibrium(i, rho, u)) / tau + Fi;
  }
}
`;
export { LBM3D_WGSL };
