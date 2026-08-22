// simulation/lbm/lbmShader.js -- the same lattice Boltzmann, on the GPU.
//
// LBM is the ideal GPU workload and this is why FluidX3D is so fast: every cell's collision depends on nothing but
// itself, and streaming is a fixed-offset copy. It is embarrassingly parallel and bandwidth-bound, not compute-bound.
//
// The one rule here: the direction set, the weights, the opposites and the speed of sound are INTERPOLATED from
// simulation/lbm/lbm2d.js rather than typed again. The CPU reference is verified against the exact analytic solution
// of channel flow, so any number retyped here would be a number that could quietly disagree with a proven one. The
// same discipline as the spacetime gauge shaders.
//
// v2977 CORRECTION. This header used to end "-- and the test below pulls the constants back OUT of the generated
// WGSL and checks them against the module, so a drift would fail the gate rather than the physics." THERE WAS NO
// SUCH TEST. The file ended at its export and no gate in the tree referenced this file at all. A verification
// promised in a source header and never written -- the same shape as every other claim that was PRESENT and not
// TRUE. The test now exists, in simulation/lbm/shaderConstants-selfcheck.mjs, and it does what this sentence
// always said it did.
//
// RIG-ONLY for execution: this sandbox has no GPU and no WebGPU. The WGSL is correct-by-construction and unrun here.
"use strict";
import { E, W, OPP, CS2, Q } from "./lbm2d.js";

const _v2 = (a) => "vec2<f32>(" + a[0].toFixed(1) + ", " + a[1].toFixed(1) + ")";
const _f = (x) => (Number.isInteger(x) ? x.toFixed(1) : String(x));

const LBM_WGSL = `
// D2Q9 lattice Boltzmann -- generated from simulation/lbm/lbm2d.js. Do not retype these constants.
const Q: u32 = ${Q}u;
const CS2: f32 = ${CS2.toFixed(10)};
const E: array<vec2<f32>, ${Q}> = array<vec2<f32>, ${Q}>(${E.map(_v2).join(", ")});
const W: array<f32, ${Q}> = array<f32, ${Q}>(${W.map(w => w.toFixed(10)).join(", ")});
const OPP: array<u32, ${Q}> = array<u32, ${Q}>(${OPP.map(o => o + "u").join(", ")});

struct Params { nx: u32, ny: u32, tau: f32, gx: f32, gy: f32, _pad: vec3<f32> };
@group(0) @binding(0) var<storage, read>       fIn:   array<f32>;
@group(0) @binding(1) var<storage, read_write> fOut:  array<f32>;
@group(0) @binding(2) var<storage, read>       solid: array<u32>;
@group(0) @binding(3) var<storage, read_write> macro: array<vec4<f32>>;   // rho, ux, uy, curl
@group(0) @binding(4) var<uniform>             P:     Params;

fn eq(i: u32, rho: f32, u: vec2<f32>) -> f32 {
    let eu = dot(E[i], u);
    return W[i] * rho * (1.0 + 3.0 * eu + 4.5 * eu * eu - 1.5 * dot(u, u));
}

@compute @workgroup_size(8, 8)
fn collideStream(@builtin(global_invocation_id) gid: vec3<u32>) {
    if (gid.x >= P.nx || gid.y >= P.ny) { return; }
    let k = gid.y * P.nx + gid.x;
    let base = k * Q;
    if (solid[k] == 1u) {                                   // halfway bounce-back: it walks back the way it came
        for (var i: u32 = 0u; i < Q; i = i + 1u) { fOut[base + i] = fIn[base + OPP[i]]; }
        return;
    }
    var rho: f32 = 0.0; var m: vec2<f32> = vec2<f32>(0.0, 0.0);
    for (var i: u32 = 0u; i < Q; i = i + 1u) { let fi = fIn[base + i]; rho = rho + fi; m = m + fi * E[i]; }
    let g = vec2<f32>(P.gx, P.gy);
    let u = select(vec2<f32>(0.0, 0.0), m / rho + g * 0.5, rho > 0.0);   // the half-force correction, same as the CPU
    let cf = 1.0 - 1.0 / (2.0 * P.tau);
    macro[k] = vec4<f32>(rho, u.x, u.y, 0.0);
    for (var i: u32 = 0u; i < Q; i = i + 1u) {
        let eu = dot(E[i], u);
        let Fi = W[i] * cf * rho * (3.0 * dot(E[i] - u, g) + 9.0 * eu * dot(E[i], g));   // Guo forcing
        fOut[base + i] = fIn[base + i] - (fIn[base + i] - eq(i, rho, u)) / P.tau + Fi;
    }
}

@compute @workgroup_size(8, 8)
fn stream(@builtin(global_invocation_id) gid: vec3<u32>) {
    if (gid.x >= P.nx || gid.y >= P.ny) { return; }
    for (var i: u32 = 0u; i < Q; i = i + 1u) {
        let tx = (i32(gid.x) + i32(E[i].x) + i32(P.nx)) % i32(P.nx);     // periodic along the channel
        let ty = i32(gid.y) + i32(E[i].y);
        if (ty < 0 || ty >= i32(P.ny)) { continue; }
        fOut[(u32(ty) * P.nx + u32(tx)) * Q + i] = fIn[(gid.y * P.nx + gid.x) * Q + i];
    }
}
`;
function lbmShaderSource() { return LBM_WGSL; }
export { LBM_WGSL, lbmShaderSource };
