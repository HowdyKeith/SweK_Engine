// WebGLEngine/render/volumetricFog.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// VOLUMETRIC FOG, FOR WEBGL2 AND WEBGPU. Backlog: render/BACKLOG_2026-11-21_PLAYCANVAS.md, `volumetric-fog` (PlayCanvas src/extras/effects/volumetric-fog/). Keith: "keep going with
// volumetric fog". A post pass: each pixel's ray, from the eye to what the depth buffer says is there (or `maxDistance` for the sky), is marched through a fog whose density is
//      sigma(p) = density * exp(-max(0, h(p) - baseHeight) / falloff)        h the height (y, or z for a z-up page); falloff 0 is fog of one density everywhere
// lit by a directional light (towards `lightDir`, `lightColor`, scattered by the Henyey-Greenstein phase with anisotropy `g`: forward-scattering for g > 0, the glow round the
// sun) and an `ambient` colour, with single-scattering albedo `albedo`. Each step is ENERGY-CONSERVING (Hillaire 2015): over a step of optical depth tau the light added is
// T * albedo * source * (1 - e^-tau) and T falls by e^-tau. The source does not change along a ray, so the light added over the whole ray TELESCOPES to exactly
//      albedo * source * (1 - T_ray)        and the pixel becomes   scene * T_ray + albedo * source * (1 - T_ray)
// -- only the transmittance T_ray is a quadrature (and for fog of one density, exact). The steps are jittered by interleaved gradient noise (Jimenez 2014) per pixel, so too few
// steps band into noise, not into rings; `jitter: false` takes each step's midpoint (the gate's exact case).
//
//   FOG_DEFAULTS                                 every parameter, with its default
//   createFogGL(gl) -> { draw({ colorTex, depthTex, invViewProj, eye, width, height, params, zRange: "gl" }) }   a full-screen pass into the bound framebuffer; depthTex a
//                                                DEPTH_COMPONENT texture (NEAREST, no compare)
//   FOG_WGSL; createFogGPU(device, format) -> { encode(encoder, targetView, { colorView, depthView, invViewProj, eye, width, height, params, zRange: "zo" }) }   depthView a
//                                                depth32float texture made with TEXTURE_BINDING
//   fogCPU(params, { origin, dir, distance, color, px, py }) -> [r, g, b]   the same sum on the CPU (px, py the pixel in the backend's own coordinates -- WebGL2's
//                                                gl_FragCoord counts rows from the BOTTOM, WebGPU's position from the top -- for the jitter)
//   transmittanceExact(params, origin, dir, distance)                the closed form of T_ray, for a gate (height fog: an exponential's integral along a line)
// LIGHT SHAFTS (2026-11-22, Keith's "shadows inside the fog"): createFogGPU(device, format, { lighting }) with a render/clusteredLights.mjs createClusteredLightingGPU object
//   samples the sun's cascaded shadow at every step, so the sun's share of the light scattered there is cut where the sun is hidden: the fog behind a pillar, seen from the
//   side, is darker -- shafts. The light added over a step is then T * albedo * (phase * lightColor * visible + ambient) * (1 - e^-tau), summed step by step (it no longer
//   telescopes; with nothing hidden it is the same sum). The fog's lightDir should be the sun's (towards it). fogCPU(params, { ..., shadowOf(p) }) is the same march on the CPU.
// Held by tools/ship/volumetricFog-selfcheck.mjs; the shafts by tools/ship/softShadows-selfcheck.mjs.
"use strict";
import { clusteredWGSL } from "./clusteredLights.mjs";

export const FOG_DEFAULTS = Object.freeze({ density: 0.08, falloff: 2.5, baseHeight: 0, up: "y", albedo: 0.9, ambient: [0.55, 0.62, 0.72], lightDir: [0.35, 0.8, 0.45], lightColor: [1.0, 0.92, 0.78], g: 0.6, maxDistance: 80, steps: 32, jitter: true });
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const phaseHG = (cos, g) => (1 - g * g) / (4 * Math.PI * Math.pow(1 + g * g - 2 * g * cos, 1.5));
/** Interleaved gradient noise at a pixel (Jimenez 2014), in [0, 1); the shaders compute the same in float32. */
export const ign = (x, y) => { const f = (v) => v - Math.floor(v); return f(52.9829189 * f(0.06711056 * x + 0.00583715 * y)); };
const with_ = (p) => { const q = { ...FOG_DEFAULTS, ...p }; return { ...q, L: norm(q.lightDir) }; };

/** The fog's source term (light per unit of scattering) for a ray going `dir`: phase-weighted light plus ambient (4 pi times the isotropic phase is 1, so ambient is as given). */
export function sourceOf(P, dir) { const c = dir[0] * P.L[0] + dir[1] * P.L[1] + dir[2] * P.L[2], ph = phaseHG(c, P.g) * 4 * Math.PI; return [0, 1, 2].map((i) => ph * P.lightColor[i] + P.ambient[i]); }
const sigmaAt = (P, h) => (P.falloff > 0 ? P.density * Math.exp(-Math.max(0, h - P.baseHeight) / P.falloff) : P.density);

/** The CPU twin of the shaders. `origin` the eye; `dir` unit; `distance` to the surface (clamped to maxDistance); `color` the scene's [r, g, b] in 0..1. */
export function fogCPU(params, { origin, dir, distance, color, px = 0, py = 0, shadowOf = null }) {
    const P = with_(params), d = Math.min(distance, P.maxDistance), n = P.steps, dt = d / n, j = P.jitter ? ign(px, py) : 0.5, k = P.up === "z" ? 2 : 1;
    if (shadowOf) {   // the shafts' march: the sun's share at each step times how much of the sun that step sees
        const c = dir[0] * P.L[0] + dir[1] * P.L[1] + dir[2] * P.L[2], ph = phaseHG(c, P.g) * 4 * Math.PI; let T = 1; const acc = [0, 0, 0];
        for (let i = 0; i < n; i++) { const s = (i + j) * dt, a = Math.exp(-sigmaAt(P, origin[k] + dir[k] * s) * dt), vis = shadowOf([0, 1, 2].map((q) => origin[q] + dir[q] * s)); for (let q = 0; q < 3; q++) acc[q] += T * (ph * P.lightColor[q] * vis + P.ambient[q]) * (1 - a); T *= a; }
        return [0, 1, 2].map((q) => color[q] * T + P.albedo * acc[q]);
    }
    let tau = 0;
    for (let i = 0; i < n; i++) { const s = (i + j) * dt, h = origin[k] + dir[k] * s; tau += sigmaAt(P, h) * dt; }
    const T = Math.exp(-tau), S = sourceOf(P, dir);
    return [0, 1, 2].map((i) => color[i] * T + P.albedo * S[i] * (1 - T));
}
/** T along a ray, in closed form. */
export function transmittanceExact(params, origin, dir, distance) {
    const P = with_(params), d = Math.min(distance, P.maxDistance), k = P.up === "z" ? 2 : 1, h0 = origin[k], v = dir[k];
    if (!(P.falloff > 0)) return Math.exp(-P.density * d);
    // the integral of sigma along s in [0, d], split where the height crosses baseHeight (constant below, exponential above)
    const seg = (a, b) => { if (b <= a) return 0; const ha = h0 + v * a, hb = h0 + v * b, mid = h0 + v * (a + b) / 2;
        if (mid <= P.baseHeight) return P.density * (b - a);
        if (Math.abs(v) < 1e-12) return sigmaAt(P, ha) * (b - a);
        return P.density * P.falloff / v * (Math.exp(-(ha - P.baseHeight) / P.falloff) - Math.exp(-(hb - P.baseHeight) / P.falloff)); };
    const sc = Math.abs(v) > 1e-12 ? (P.baseHeight - h0) / v : -1;
    return Math.exp(-(sc > 0 && sc < d ? seg(0, sc) + seg(sc, d) : seg(0, d)));
}

const UNIFORMS = ["uColor", "uDepth", "uInvViewProj", "uEye", "uFog", "uFog2", "uAmbient", "uLightDir", "uLightColor", "uSteps"];
export const FOG_VS_GLSL = `#version 300 es
out vec2 vNdc; void main() { vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)) * 2.0 - 1.0; vNdc = p; gl_Position = vec4(p, 0.0, 1.0); }`;
export const FOG_FS_GLSL = `#version 300 es
precision highp float;
in vec2 vNdc; out vec4 outColor;
uniform sampler2D uColor; uniform highp sampler2D uDepth; uniform mat4 uInvViewProj; uniform vec3 uEye;
uniform vec4 uFog;    // density, falloff, baseHeight, albedo
uniform vec4 uFog2;   // g, maxDistance, z-up (1) or y-up (0), jitter (1) or midpoints (0)
uniform vec3 uAmbient, uLightDir, uLightColor; uniform vec2 uSteps;   // steps, zo depth (1) or gl (0)
float ign(vec2 p) { return fract(52.9829189 * fract(0.06711056 * p.x + 0.00583715 * p.y)); }
float sigmaAt(float h) { return uFog.y > 0.0 ? uFog.x * exp(-max(0.0, h - uFog.z) / uFog.y) : uFog.x; }
void main() {
    ivec2 ip = ivec2(gl_FragCoord.xy); vec3 scene = texelFetch(uColor, ip, 0).rgb; float z = texelFetch(uDepth, ip, 0).r;
    float zn = uSteps.y > 0.5 ? z : z * 2.0 - 1.0;
    vec4 w = uInvViewProj * vec4(vNdc, zn, 1.0); vec3 p = w.xyz / w.w, toP = p - uEye;
    vec4 f = uInvViewProj * vec4(vNdc, 1.0, 1.0); vec3 dir = z >= 1.0 ? normalize(f.xyz / f.w - uEye) : normalize(toP);
    float d = z >= 1.0 ? uFog2.y : min(length(toP), uFog2.y);
    int n = int(uSteps.x); float dt = d / float(n), j = uFog2.w > 0.5 ? ign(gl_FragCoord.xy - 0.5) : 0.5, tau = 0.0;
    bool zUp = uFog2.z > 0.5; float h0 = zUp ? uEye.z : uEye.y, v = zUp ? dir.z : dir.y;
    for (int i = 0; i < 256; i++) { if (i >= n) break; tau += sigmaAt(h0 + v * (float(i) + j) * dt) * dt; }
    float T = exp(-tau), c = dot(dir, normalize(uLightDir)), g = uFog2.x, ph = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * c, 1.5);
    vec3 S = ph * uLightColor + uAmbient;
    outColor = vec4(scene * T + uFog.w * S * (1.0 - T), 1.0);
}`;

export function createFogGL(gl) {
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error("volumetricFog: " + gl.getShaderInfoLog(o)); return o; };
    const prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, FOG_VS_GLSL)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FOG_FS_GLSL)); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error("volumetricFog: " + gl.getProgramInfoLog(prog));
    const U = Object.fromEntries(UNIFORMS.map((n) => [n, gl.getUniformLocation(prog, n)])), vao = gl.createVertexArray();
    return {
        draw({ colorTex, depthTex, invViewProj, eye, params = {}, zRange = "gl" }) {
            const P = with_(params);
            if (!(P.steps >= 1 && P.steps <= 256)) throw new Error("volumetricFog: steps is 1 to 256");
            gl.useProgram(prog); gl.bindVertexArray(vao);
            gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, colorTex); gl.uniform1i(U.uColor, 0);
            gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, depthTex); gl.uniform1i(U.uDepth, 1);
            gl.uniformMatrix4fv(U.uInvViewProj, false, Float32Array.from(invViewProj)); gl.uniform3fv(U.uEye, Float32Array.from(eye));
            gl.uniform4f(U.uFog, P.density, P.falloff, P.baseHeight, P.albedo); gl.uniform4f(U.uFog2, P.g, P.maxDistance, P.up === "z" ? 1 : 0, P.jitter ? 1 : 0);
            gl.uniform3fv(U.uAmbient, Float32Array.from(P.ambient)); gl.uniform3fv(U.uLightDir, Float32Array.from(P.L)); gl.uniform3fv(U.uLightColor, Float32Array.from(P.lightColor));   // the phase in the shader is 4 pi times Henyey-Greenstein's (isotropic is 1), as sourceOf's
            gl.uniform2f(U.uSteps, P.steps, zRange === "zo" ? 1 : 0);
            gl.drawArrays(gl.TRIANGLES, 0, 3); gl.bindVertexArray(null); gl.activeTexture(gl.TEXTURE0);
        },
        destroy() { gl.deleteProgram(prog); gl.deleteVertexArray(vao); },
    };
}

export const FOG_WGSL = fogWGSL();
/** The fog's WGSL; `shafts` adds the sun's shadow (render/clusteredLights.mjs's bindings at group 1) at every step. */
export function fogWGSL({ shafts = false } = {}) { return `${shafts ? `${clusteredWGSL({ group: 1 })}
fn fogSun(p: vec3f) -> f32 {
    _ = arrayLength(&clCells); _ = clCookieSampler; _ = textureDimensions(clCookies);   // unread here but bound: the auto layout keeps every binding of the group
    if (clP.sun.x < 0.0) { return 1.0; }
    let l = clLights[u32(clP.sun.x)];
    return clShadow(p, vec3f(0.0), -l.dirCosOuter.xyz, vec3f(0.0), true, u32(l.cosInnerFaces.y), u32(l.cosInnerFaces.z));
}` : ""}
struct FU { invViewProj: mat4x4f, eye: vec4f, fog: vec4f, fog2: vec4f, ambient: vec4f, lightDir: vec4f, lightColor: vec4f, steps: vec4f };
@group(0) @binding(0) var<uniform> U: FU;
@group(0) @binding(1) var colorTex: texture_2d<f32>;
@group(0) @binding(2) var depthTex: texture_depth_2d;
struct VO { @builtin(position) pos: vec4f, @location(0) ndc: vec2f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> VO { let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u)) * 2.0 - 1.0; var o: VO; o.pos = vec4f(p, 0.0, 1.0); o.ndc = p; return o; }
fn ign(p: vec2f) -> f32 { return fract(52.9829189 * fract(0.06711056 * p.x + 0.00583715 * p.y)); }
fn sigmaAt(h: f32) -> f32 { if (U.fog.y > 0.0) { return U.fog.x * exp(-max(0.0, h - U.fog.z) / U.fog.y); } return U.fog.x; }
@fragment fn fs(v: VO) -> @location(0) vec4f {
    let ip = vec2i(v.pos.xy); let scene = textureLoad(colorTex, ip, 0).rgb; let z = textureLoad(depthTex, ip, 0);
    let zn = select(z * 2.0 - 1.0, z, U.steps.y > 0.5);
    let w = U.invViewProj * vec4f(v.ndc, zn, 1.0); let p = w.xyz / w.w; let toP = p - U.eye.xyz;
    let f = U.invViewProj * vec4f(v.ndc, 1.0, 1.0); let sky = z >= 1.0;
    let dir = select(normalize(toP), normalize(f.xyz / f.w - U.eye.xyz), sky);
    let d = select(min(length(toP), U.fog2.y), U.fog2.y, sky);
    let n = i32(U.steps.x); let dt = d / f32(n); let j = select(0.5, ign(v.pos.xy - 0.5), U.fog2.w > 0.5);
    let zUp = U.fog2.z > 0.5; let h0 = select(U.eye.y, U.eye.z, zUp); let vv = select(dir.y, dir.z, zUp);
${shafts ? `    let c = dot(dir, U.lightDir.xyz); let g = U.fog2.x; let ph = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * c, 1.5); let sunC = ph * U.lightColor.rgb;
    var T = 1.0; var acc = vec3f(0.0);
    for (var i = 0; i < n; i++) { let s = (f32(i) + j) * dt; let a = exp(-sigmaAt(h0 + vv * s) * dt); acc += T * (sunC * fogSun(U.eye.xyz + dir * s) + U.ambient.rgb) * (1.0 - a); T *= a; }
    return vec4f(scene * T + U.fog.w * acc, 1.0);` : `    var tau = 0.0;
    for (var i = 0; i < n; i++) { tau += sigmaAt(h0 + vv * (f32(i) + j) * dt) * dt; }
    let T = exp(-tau); let c = dot(dir, U.lightDir.xyz); let g = U.fog2.x; let ph = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * c, 1.5);
    let S = ph * U.lightColor.rgb + U.ambient.rgb;
    return vec4f(scene * T + U.fog.w * S * (1.0 - T), 1.0);`}
}`; }

export function createFogGPU(device, format, { lighting = null } = {}) {
    const BU = globalThis.GPUBufferUsage, mod = device.createShaderModule({ code: lighting ? fogWGSL({ shafts: true }) : FOG_WGSL }), ubuf = device.createBuffer({ size: 176, usage: BU.UNIFORM | BU.COPY_DST });
    const pipe = device.createRenderPipeline({ layout: "auto", vertex: { module: mod, entryPoint: "vs" }, fragment: { module: mod, entryPoint: "fs", targets: [{ format }] }, primitive: { topology: "triangle-list" } });
    return {
        encode(enc, target, { colorView, depthView, invViewProj, eye, params = {}, zRange = "zo" }) {
            const P = with_(params), u = new Float32Array(44);
            u.set(invViewProj, 0); u.set([...eye, 0], 16); u.set([P.density, P.falloff, P.baseHeight, P.albedo], 20); u.set([P.g, P.maxDistance, P.up === "z" ? 1 : 0, P.jitter ? 1 : 0], 24);
            u.set([...P.ambient, 0], 28); u.set([...P.L, 0], 32); u.set([...P.lightColor, 0], 36); u.set([P.steps, zRange === "zo" ? 1 : 0, 0, 0], 40);
            device.queue.writeBuffer(ubuf, 0, u);
            const bg = device.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: ubuf } }, { binding: 1, resource: colorView }, { binding: 2, resource: depthView }] });
            const pass = enc.beginRenderPass({ colorAttachments: [{ view: target, loadOp: "clear", clearValue: [0, 0, 0, 1], storeOp: "store" }] });
            pass.setPipeline(pipe); pass.setBindGroup(0, bg); if (lighting) pass.setBindGroup(1, lighting.bindGroupFor(pipe, 1)); pass.draw(3); pass.end();
        },
        destroy() { ubuf.destroy(); },
    };
}
