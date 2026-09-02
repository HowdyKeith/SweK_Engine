// WebGLEngine/render/heidlerWgsl.mjs -- v4315
//
// THE LIGHTNING, AS A SHADER WITH A KEY. physics/discharge/heidler.mjs is the Heidler return-stroke current, the
// standard analytic lightning waveform: i(t) = (i0 / eta) (t/t1)^2 / (1 + (t/t1)^2) exp(-t/t2). Every sample is a
// closed form of t alone, so a pixel can be a time and the picture the stroke -- no neighbours, no time steps.
// Its key: normalised by the shape's TRUE peak (truePeak(), a scan and a golden-section search on the CPU), the
// peak of the waveform over i0 is exactly 1; normalised by the PUBLISHED eta it is 1.0667 for the first-stroke
// set, and that 6.7% belongs to the reference formula, not to any code (the module's own finding, v3193). A GPU
// that reproduces both numbers has the physics; one that reproduces neither has a typo somewhere in the exponent.
"use strict";

import { shape, heidler, etaStandard, truePeak, PARAMS } from "../physics/discharge/heidler.mjs";

export { PARAMS, etaStandard, truePeak };
export const HEIDLER_FN_WGSL = `
fn heidlerShape(t: f32, t1: f32, t2: f32) -> f32 {
  if (t <= 0.0) { return 0.0; }
  let x = (t / t1) * (t / t1);
  return (x / (1.0 + x)) * exp(-t / t2);
}
fn heidler(t: f32, i0: f32, t1: f32, t2: f32, eta: f32) -> f32 { return (i0 / eta) * heidlerShape(t, t1, t2); }
`;
/** Uniforms: i0, t1, t2, eta, tLo, tHi, count, geometric (0 = linear grid in t, 1 = geometric, which is how the CPU finds the peak). */
export const PROBE_UNIFORM_FLOATS = 8;
export function packProbeUniforms({ i0, t1, t2, eta, tLo, tHi, count, geometric = 1 }) { return new Float32Array([i0, t1, t2, eta, tLo, tHi, count, geometric ? 1 : 0]); }
/** The probe: invocation i is a time on the grid; the value is i(t) / i0 -- so the peak reads 1 when eta is the true one. */
export function heidlerProbeWgsl() {
    return `${HEIDLER_FN_WGSL}
struct Knobs { i0: f32, t1: f32, t2: f32, eta: f32, tLo: f32, tHi: f32, count: f32, geometric: f32 };
@group(0) @binding(0) var<storage, read_write> outv: array<f32>;
@group(0) @binding(1) var<uniform> knobs: Knobs;

@compute @workgroup_size(64) fn probe(@builtin(global_invocation_id) g: vec3<u32>) {
  let i = g.x;
  let n = u32(knobs.count);
  if (i >= n) { return; }
  let u = (f32(i) + 0.5) / f32(n);
  var t = knobs.tLo + (knobs.tHi - knobs.tLo) * u;
  if (knobs.geometric > 0.5) { t = knobs.tLo * exp(log(knobs.tHi / knobs.tLo) * u); }
  outv[i] = heidler(t, knobs.i0, knobs.t1, knobs.t2, knobs.eta) / knobs.i0;
}
`;
}
/** The twin, in f32 in the shader's order. */
export function probeCpu({ i0, t1, t2, eta, tLo, tHi, count, geometric = 1 }) {
    const f = Math.fround, out = new Float32Array(count);
    for (let i = 0; i < count; i++) {
        const u = f(f(i + 0.5) / count);
        const t = geometric ? f(tLo * f(Math.exp(f(f(Math.log(f(tHi / tLo))) * u)))) : f(tLo + f(f(tHi - tLo) * u));
        let v = 0; if (t > 0) { const x = f(f(t / t1) * f(t / t1)); v = f(f(x / f(1 + x)) * f(Math.exp(f(-t / t2)))); }
        out[i] = f(f(f(i0 / eta) * v) / i0);
    }
    return out;
}
/** The two etas for a parameter set: the published one and the true one (the shape's real peak). */
export function etasFor(set = PARAMS.first) { const tp = truePeak(set.t1, set.t2); return { standard: etaStandard(set.t1, set.t2), trueEta: tp.peak, tPeak: tp.tPeak, ratio: tp.peak / etaStandard(set.t1, set.t2) }; }
/** The CPU's own number for the key, from the module the gate trusts: the waveform's peak over i0 at the true eta, and at the standard one. */
export function keyCpu(set = PARAMS.first) { const e = etasFor(set); return { atTrueEta: heidler(e.tPeak, set.i0, set.t1, set.t2, e.trueEta) / set.i0, atStandardEta: heidler(e.tPeak, set.i0, set.t1, set.t2) / set.i0, shapePeak: shape(e.tPeak, set.t1, set.t2), ...e }; }
