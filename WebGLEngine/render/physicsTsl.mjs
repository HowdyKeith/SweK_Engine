// WebGLEngine/render/physicsTsl.mjs -- v4321
//
// PHYSICS AS TSL NODES, THE OTHER TWO (docs/TSL-ROADMAP.md step 5): swk_lyapunov's exponent (render/lyapunovWgsl.mjs,
// physics/chaos/logistic.js) and the Heidler return-stroke current (render/heidlerWgsl.mjs, physics/discharge/
// heidler.mjs) as TSL functions any node material can take, with the SAME keys the WGSL and GLSL are held to: ln 2
// at r = 4, and the lightning's peak over i0 an exact 1 at the true eta and 1.0667 at the published one. The
// iteration is a TSL Loop; the constants are the modules' (interpolated, not retyped); the uniforms are labelled
// so render/tslSource.mjs can transplant the emitted fragments into gfx/device.js pipelines.
"use strict";

import { LN2, DEFAULTS as LY_DEFAULTS, PERIOD3, LOOK_KNOBS, LOOK_UNIFORMS, LYAPUNOV_LOOK_WGSL, LYAPUNOV_LOOK_VERTEX_GLSL } from "./lyapunovWgsl.mjs";
import { PARAMS, etaStandard, truePeak } from "../physics/discharge/heidler.mjs";

export { LN2, LY_DEFAULTS, PERIOD3, PARAMS, etaStandard, truePeak };

/** lyapunov(r, x0): the logistic map iterated `warmup` then `samples` times, the mean log-slope; the counts are baked in (a Loop bound). */
export function lyapunovNodes(TSL, { samples = LY_DEFAULTS.samples, warmup = LY_DEFAULTS.warmup } = {}) {
    const { Fn, float, Loop, log, abs } = TSL;
    for (const n of ["Fn", "float", "Loop", "log", "abs"]) if (typeof TSL[n] !== "function") throw new Error(`physicsTsl: the TSL namespace has no ${n}()`);
    const lyapunov = Fn(([r, x0]) => {
        const x = float(x0).toVar();
        Loop({ start: 0, end: warmup }, () => { x.assign(r.mul(x).mul(float(1.0).sub(x))); });
        const acc = float(0.0).toVar();
        Loop({ start: 0, end: samples }, () => { acc.addAssign(log(abs(r.mul(float(1.0).sub(x.mul(2.0)))))); x.assign(r.mul(x).mul(float(1.0).sub(x))); });
        return acc.div(samples);
    });
    return { lyapunov, samples, warmup };
}
/** heidlerShape(t, t1, t2) and heidler(t, i0, t1, t2, eta): the return-stroke current, a closed form of t. */
export function heidlerNodes(TSL) {
    const { Fn, float, exp, select } = TSL;
    const heidlerShape = Fn(([t, t1, t2]) => { const x = t.div(t1).mul(t.div(t1)); return select(t.lessThanEqual(0.0), float(0.0), x.div(float(1.0).add(x)).mul(exp(t.negate().div(t2)))); });
    const heidler = Fn(([t, i0, t1, t2, eta]) => i0.div(eta).mul(heidlerShape(t, t1, t2)));
    return { heidlerShape, heidler };
}
/** The Lyapunov key: r across [rLo, rHi] (uv.x), the seed down [seedLo, seedHi] (uv.y); red+green carry (lam + 3) / 4 in 16 bits, as lyapunovWgsl's key. */
export function makeLyapunovKeyTsl(THREE, TSL, { rLo = LY_DEFAULTS.rLo, rHi = LY_DEFAULTS.rHi, seedLo = LY_DEFAULTS.seedLo, seedHi = LY_DEFAULTS.seedHi, samples = LY_DEFAULTS.samples, warmup = LY_DEFAULTS.warmup } = {}) {
    const { Fn, float, vec4, uv, uniform } = TSL;
    const { lyapunov } = lyapunovNodes(TSL, { samples, warmup });
    const uniforms = { rLo: uniform(float(rLo)).label("rLo"), rHi: uniform(float(rHi)).label("rHi"), seedLo: uniform(float(seedLo)).label("seedLo"), seedHi: uniform(float(seedHi)).label("seedHi") };
    const material = new THREE.NodeMaterial();
    material.fragmentNode = Fn(() => {
        const r = uniforms.rLo.add(uniforms.rHi.sub(uniforms.rLo).mul(uv().x));
        const x0 = uniforms.seedLo.add(uniforms.seedHi.sub(uniforms.seedLo).mul(uv().y));
        const e = lyapunov(r, x0).add(3.0).div(4.0).clamp(0.0, 1.0);
        return vec4(e.mul(255.0).floor().div(255.0), e.mul(255.0).fract(), 0.0, 1.0);
    })();
    const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
    return { material, scene, camera, uniforms, samples, warmup };
}
export function decodeLyapunov(px, i) { return ((px[i] + px[i + 1] / 255) / 255) * 4 - 3; }
/** The Heidler key: t on a geometric grid from tLo to tHi across uv.x; red+green carry i(t) / i0 / 2 in 16 bits (the published eta's 1.0667 fits). */
export function makeHeidlerKeyTsl(THREE, TSL, { i0 = PARAMS.first.i0, t1 = PARAMS.first.t1, t2 = PARAMS.first.t2, eta = null, tLo = PARAMS.first.t1 / 50, tHi = PARAMS.first.t2 * 8 } = {}) {
    const { Fn, float, vec4, uv, uniform, exp, log } = TSL;
    const { heidler } = heidlerNodes(TSL);
    const e0 = eta == null ? truePeak(t1, t2).peak : eta;
    const uniforms = { i0: uniform(float(i0)).label("i0"), t1: uniform(float(t1)).label("t1"), t2: uniform(float(t2)).label("t2"), eta: uniform(float(e0)).label("eta"), tLo: uniform(float(tLo)).label("tLo"), tHi: uniform(float(tHi)).label("tHi") };
    const material = new THREE.NodeMaterial();
    material.fragmentNode = Fn(() => {
        const t = uniforms.tLo.mul(exp(log(uniforms.tHi.div(uniforms.tLo)).mul(uv().x)));
        const e = heidler(t, uniforms.i0, uniforms.t1, uniforms.t2, uniforms.eta).div(uniforms.i0).div(2.0).clamp(0.0, 1.0);
        return vec4(e.mul(255.0).floor().div(255.0), e.mul(255.0).fract(), 0.0, 1.0);
    })();
    const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
    return { material, scene, camera, uniforms, trueEta: truePeak(t1, t2).peak, standardEta: etaStandard(t1, t2) };
}
export function decodeHeidler(px, i) { return ((px[i] + px[i + 1] / 255) / 255) * 2; }

// ---- v4322: the Chaos race painted by the TSL node ---------------------------------------------------------------------
/**
 * The Lyapunov LOOK as a TSL graph, the arithmetic of lyapunovWgsl's LYAPUNOV_LOOK: r across the hull's local x, the seed
 * down local y, the exponent as the shade, lit by the normal against `light`, times the vertex colour. The iteration counts
 * are BAKED (a Loop bound is a constant) at the fleet's own knobs (LOOK_KNOBS: 96 samples, 32 warmup), where the WGSL reads
 * them from chaos.zw at run time; the fleet binds the same numbers, so the pictures can be compared to the byte.
 */
export function makeLyapunovLookTsl(THREE, TSL, { rLo = LOOK_KNOBS[0], rHi = LOOK_KNOBS[1], samples = LOOK_KNOBS[2], warmup = LOOK_KNOBS[3], light = [0.4, 0.7, 0.6, 0.35], breathe = null } = {}) {
    const { Fn, float, vec3, vec4, uv, uniform, normalLocal, vertexColor, max, dot, normalize, mix, positionLocal, sin } = TSL;
    const { lyapunov } = lyapunovNodes(TSL, { samples, warmup });
    const uniforms = { light: uniform(vec4(...light)).label("light"), chaos: uniform(vec4(rLo, rHi, samples, warmup)).label("chaos") };
    const material = new THREE.NodeMaterial();
    // v4324 -- `breathe`: the hull moves along its own normal by amp * (sin(4 x) + 1), a positionNode three puts in the VERTEX stage;
    // the shell transplant (render/tslSource.mjs) carries it into the fleet's own vertex stage. `amp` is a labelled uniform.
    if (breathe != null) { uniforms.amp = uniform(float(breathe)).label("amp"); material.positionNode = positionLocal.add(normalLocal.mul(uniforms.amp.mul(sin(positionLocal.x.mul(4.0)).add(1.0)))); }
    material.fragmentNode = Fn(() => {
        const r = uniforms.chaos.x.add(uniforms.chaos.y.sub(uniforms.chaos.x).mul(uv().x.mul(0.5).add(0.5).clamp(0.0, 1.0)));
        const x0 = float(0.05).add(uv().y.mul(0.5).add(0.5).clamp(0.0, 1.0).mul(0.9));
        const chaos = lyapunov(r, x0).div(LN2).clamp(-1.0, 1.0);
        const l = max(dot(normalize(normalLocal), normalize(uniforms.light.xyz)), 0.0);
        const shade = uniforms.light.w.add(float(1.0).sub(uniforms.light.w).mul(l));
        const hot = vec3(0.35, 0.95, 0.85), cold = vec3(0.08, 0.06, 0.2);
        return vec4(mix(cold, hot, max(chaos, 0.0)).mul(shade).mul(vertexColor().rgb), vertexColor().a);
    })();
    // a mesh that carries every attribute the graph reads (uv, normal, colour), so three emits every varying
    const geo = new THREE.PlaneGeometry(2, 2); geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(16).fill(1), 4));
    const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    scene.add(new THREE.Mesh(geo, material));
    return { material, scene, camera, uniforms, samples, warmup };
}
/** The Lyapunov look's shell for render/tslSource.mjs transplantIntoShell: its vertex stage, struct Cam, VOut and varyings, in both languages. */
export function lyapunovLookShell(buffers, { extraUniforms = [], displace = "" } = {}) {
    // the shell's vertex stage as a TEMPLATE: {{DISPLACE}} is where a graph's position node lands (pl, nl are the hull's point and
    // normal, p and n the attributes); with nothing there it is the hand-written vertex stage, byte for byte in what it draws.
    // `displace` puts a hand-written displacement there instead -- the gate's twin for a generated one.
    const uniforms = [...LOOK_UNIFORMS.map((u) => ({ ...u })), ...extraUniforms];
    const camStruct = `struct Cam { ${uniforms.map((u) => `${u.name}: ${{ mat4: "mat4x4<f32>", vec4: "vec4<f32>", vec3: "vec3<f32>", vec2: "vec2<f32>", f32: "f32" }[u.type]}`).join(", ")} };`;
    const vertexTemplate = `@vertex fn vs(@location(0) p: vec3<f32>, @location(1) color: vec4<f32>, @location(2) rec: vec4<f32>, @location(3) ident: vec4<f32>, @location(5) extra: vec4<f32>, @location(4) n: vec3<f32>) -> VOut {
  var o: VOut; var pl = p; var nl = n;
  {{DISPLACE}}
  o.pos = cam.viewProj * vec4<f32>(rec.xyz + turned(pl, extra.x) * rec.w, 1.0);
  o.color = color; o.n = turned(n, extra.x); o.local = p.xy;
  return o;
}`;
    const rest = LYAPUNOV_LOOK_WGSL.split("@fragment")[0].trim();
    const helpers = rest.slice(rest.indexOf("fn turned"), rest.indexOf("@vertex")).trim();   // turned() and VOut, as the look wrote them
    // the prefix carries the RAW template (the transplant fills {{DISPLACE}}, with nothing when the graph moves no vertex); a hand-written
    // `displace` fills it here instead, for a twin drawn as a plain descriptor
    const prefix = `${camStruct}\n@group(0) @binding(0) var<uniform> cam: Cam;\n${helpers}\n${displace ? vertexTemplate.replace("{{DISPLACE}}", displace) : vertexTemplate}`;
    const glslUniforms = uniforms.map((u) => `uniform ${{ mat4: "mat4", vec4: "vec4", vec3: "vec3", vec2: "vec2", f32: "float" }[u.type]} ${u.name};`).join(" ");
    const glslTemplate = `#version 300 es
precision highp float;
${glslUniforms}
in vec3 p; in vec4 color; in vec4 rec; in vec4 ident; in vec4 extra; in vec3 n;
out vec4 vColor; out vec3 vN; out vec2 vLocal;
vec3 turned(vec3 q, float yaw) { float ca = cos(yaw), sa = sin(yaw); return vec3(q.x * ca - q.y * sa, q.x * sa + q.y * ca, q.z); }
void main() { vec3 pl = p; vec3 nl = n;
  {{DISPLACE}}
  gl_Position = viewProj * vec4(rec.xyz + turned(pl, extra.x) * rec.w, 1.0); vColor = color; vN = turned(n, extra.x); vLocal = p.xy; }
`;
    return { name: "lyapunov look", uniforms, buffers, topology: null,
             wgsl: { prefix, vertexTemplate, uniformVar: "cam", varyingParam: "v", varyings: { uv: "v.local", normal: "v.n", color: "v.color" } },
             glsl: { vertex: glslTemplate.replace("{{DISPLACE}}", displace), vertexTemplate: glslTemplate, fragmentPrefix: `#version 300 es\nprecision highp float;\n${glslUniforms}\nin vec4 vColor; in vec3 vN; in vec2 vLocal; out vec4 fragColor;`, varyings: { uv: "vLocal", normal: "vN", color: "vColor" } } };
}
