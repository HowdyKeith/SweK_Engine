// simulation/euler/eulerShader.js -- compressible Euler as a WGSL compute kernel.
//
// The same confession as the D3Q19 kernel, and the same two defences. This has never run: there is no GPU where it
// was written. So it ships with an adjudicator, and it is deliberately scoped to something that can be got RIGHT
// blind rather than something impressive that would be a coin flip.
//
// WHY FIRST ORDER, ON PURPOSE. The CPU solver is MUSCL-Hancock: reconstruction, minmod limiting, Strang-alternated
// sweeps -- about forty lines of subtle indexing. Writing that in a language I cannot compile, for a device I cannot
// run, would be gambling. Plain Godunov with the same HLLC flux is a fraction of the code and vastly likelier to be
// correct on the first try. It costs accuracy and nothing else: first order smears a shock across more cells, so its
// peak sits low at any finite grid -- measured, on the CPU: 13.7% off at 200 cells, 4.0% at 400, 0.42% at 800. It
// converges to the exact jump from below. The CPU grew a matching first-order mode so the two can be compared like
// for like, and the adjudicator runs at 800 cells where first order genuinely earns 6.000.
//
// HLLC and not HLL, for the same reason as the CPU: three waves, so the contact survives.
"use strict";

const EULER_WGSL = `
struct Params {
  dims  : vec4<u32>,        // nx, ny, dir (0=x, 1=y), pad
  scal  : vec4<f32>,        // dt, gamma, pad, pad
};
@group(0) @binding(0) var<storage, read>       uSrc : array<f32>;   // rho, rho*u, rho*v, E
@group(0) @binding(1) var<storage, read_write> uDst : array<f32>;
@group(0) @binding(2) var<uniform>             P    : Params;

const NV : u32 = 4u;

fn at(i: i32, j: i32) -> u32 {
  // outflow: clamp into the domain, which copies the edge cell -- exactly what the CPU's ghost cells do
  let x = u32(clamp(i, 0, i32(P.dims.x) - 1));
  let y = u32(clamp(j, 0, i32(P.dims.y) - 1));
  return (y * P.dims.x + x) * NV;
}
fn prim(k: u32) -> vec4<f32> {
  let r = uSrc[k];
  let u = uSrc[k + 1u] / r;
  let v = uSrc[k + 2u] / r;
  let p = (P.scal.y - 1.0) * (uSrc[k + 3u] - 0.5 * r * (u * u + v * v));
  return vec4<f32>(r, u, v, max(p, 1e-12));
}
// HLLC in the sweep direction. q = (rho, u_normal, u_tangent, p) -- the caller swaps the components for the y sweep,
// so one flux function serves both directions and there is no second copy to get wrong.
fn fluxHLLC(qL: vec4<f32>, qR: vec4<f32>, g: f32) -> vec4<f32> {
  let rL = qL.x; let uL = qL.y; let vL = qL.z; let pL = qL.w;
  let rR = qR.x; let uR = qR.y; let vR = qR.z; let pR = qR.w;
  let aL = sqrt(g * pL / rL); let aR = sqrt(g * pR / rR);
  let EL = pL / (g - 1.0) + 0.5 * rL * (uL * uL + vL * vL);
  let ER = pR / (g - 1.0) + 0.5 * rR * (uR * uR + vR * vR);
  let SL = min(uL - aL, uR - aR);
  let SR = max(uL + aL, uR + aR);
  let FL = vec4<f32>(rL * uL, rL * uL * uL + pL, rL * uL * vL, uL * (EL + pL));
  let FR = vec4<f32>(rR * uR, rR * uR * uR + pR, rR * uR * vR, uR * (ER + pR));
  if (SL >= 0.0) { return FL; }
  if (SR <= 0.0) { return FR; }
  let SM = (pR - pL + rL * uL * (SL - uL) - rR * uR * (SR - uR)) / (rL * (SL - uL) - rR * (SR - uR));
  if (SM >= 0.0) {
    let f = rL * (SL - uL) / (SL - SM);
    let US = vec4<f32>(f, f * SM, f * vL, f * (EL / rL + (SM - uL) * (SM + pL / (rL * (SL - uL)))));
    let UL = vec4<f32>(rL, rL * uL, rL * vL, EL);
    return FL + SL * (US - UL);
  }
  let f = rR * (SR - uR) / (SR - SM);
  let US = vec4<f32>(f, f * SM, f * vR, f * (ER / rR + (SM - uR) * (SM + pR / (rR * (SR - uR)))));
  let UR = vec4<f32>(rR, rR * uR, rR * vR, ER);
  return FR + SR * (US - UR);
}
// rotate the primitive so the sweep direction is always "normal", then rotate the flux back
fn swap(q: vec4<f32>, dir: u32) -> vec4<f32> {
  if (dir == 0u) { return q; }
  return vec4<f32>(q.x, q.z, q.y, q.w);
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let nx = P.dims.x; let ny = P.dims.y; let dir = P.dims.z;
  if (gid.x >= nx || gid.y >= ny) { return; }
  let i = i32(gid.x); let j = i32(gid.y);
  let k = at(i, j);
  let dt = P.scal.x; let g = P.scal.y;

  // step offsets: which way is "along the sweep"
  var di: i32 = 0; var dj: i32 = 0;
  if (dir == 0u) { di = 1; } else { dj = 1; }

  // Each invocation computes BOTH of its faces. Redundant -- every face is computed twice, once by each neighbour --
  // and that redundancy is the point: no shared state, no barrier, nothing to race.
  let qM = swap(prim(at(i - di, j - dj)), dir);
  let qC = swap(prim(k), dir);
  let qP = swap(prim(at(i + di, j + dj)), dir);
  let fL = fluxHLLC(qM, qC, g);       // face on the low side
  let fR = fluxHLLC(qC, qP, g);       // face on the high side
  var d = fR - fL;
  d = swap(d, dir);                   // rotate the update back into world axes
  uDst[k]      = uSrc[k]      - dt * d.x;
  uDst[k + 1u] = uSrc[k + 1u] - dt * d.y;
  uDst[k + 2u] = uSrc[k + 2u] - dt * d.z;
  uDst[k + 3u] = uSrc[k + 3u] - dt * d.w;
}
`;
export { EULER_WGSL };
