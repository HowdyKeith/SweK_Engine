// WebGLEngine/render/fleetTsl.mjs -- v4329
//
// THE FLEETS' LOOKS AS TSL GRAPHS, AND THE SHELLS THEY CROSS INTO. Split out of render/physicsTsl.mjs, which was
// named for what it held at v4321 -- swk_lyapunov and the Heidler current as node functions -- and had since
// accumulated three shells and five looks that are not physics at all: a bitmap sprite, a filtered sprite, an ink
// wash. The note at v4326 said the module wanted a split, v4327 and v4328 said it again while adding to it, and
// this is that round rather than a fourth mention.
//
// THE LINE THE SPLIT DRAWS: render/physicsTsl.mjs keeps the PHYSICS -- lyapunovNodes, heidlerNodes and the two
// KEYS whose pictures decode to ln 2 and the Heidler peak, which is what a physics module is for. This file keeps
// everything about the FLEETS: the shells (render/tslSource.mjs transplants a graph INTO one of these), the looks
// built on them, and the hand-written twins the graders hold those looks to. A look that happens to paint physics
// on a hull -- the Chaos race's Lyapunov shade, the Pixel race's lightning -- is a LOOK, and it lives here and
// imports its arithmetic from there.
//
// WHAT IT COST, MEASURED -- AND IT IS LESS THAN THE ROUND THAT PROMISED IT SAID. v4328's note priced this split at
// "four numbers and a list entry" in render/backendParity.mjs's census. It cost ONE LIST ENTRY AND NO NUMBERS: the
// census counts a module by the shader markers it carries, and physicsTsl.mjs carried them ONLY because of the
// shells -- so it left the census in the same move that brought this file in. GLSL 145, WGSL 56, BOTH 13, GLSL-only
// 132, WGSL-only 43, before and after. The estimate was made without checking which side the markers were on.
"use strict";

import { LOOK_KNOBS, LOOK_UNIFORMS, LYAPUNOV_LOOK_WGSL } from "./lyapunovWgsl.mjs";
import { PARAMS, truePeak } from "../physics/discharge/heidler.mjs";
import { LN2, lyapunovNodes, heidlerNodes } from "./physicsTsl.mjs";

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
    // v4325 -- `locals`: what this shell calls three's positionLocal, normalLocal, position and normal. The lit layout carries
    // all four; the sprite shell below carries two, and a displacement reading the normal is refused there by name.
    const locals = { positionLocal: "pl", normalLocal: "nl", position: "p", normal: "n" };
    return { name: "lyapunov look", uniforms, buffers, topology: null,
             wgsl: { prefix, vertexTemplate, uniformVar: "cam", varyingParam: "v", varyings: { uv: "v.local", normal: "v.n", color: "v.color" }, locals },
             glsl: { vertex: glslTemplate.replace("{{DISPLACE}}", displace), vertexTemplate: glslTemplate, fragmentPrefix: `#version 300 es\nprecision highp float;\n${glslUniforms}\nin vec4 vColor; in vec3 vN; in vec2 vLocal; out vec4 fragColor;`, varyings: { uv: "vLocal", normal: "vN", color: "vColor" }, locals } };
}

// ---- v4325: a race that is NOT the Lyapunov one -- the SPRITE layout, and the lightning painted on its quad ----------
/**
 * The Heidler return-stroke current as a SPRITE race's look: the quad's own uv is the picture -- t runs across uv.x on a
 * geometric grid from `tLo` to `tHi`, the current over i0 is the brightness, and uv.y fades it to the quad's edges. The
 * peak is an exact 1 at the true eta, the same key physics/discharge/heidler.mjs and render/heidlerWgsl.mjs are held to.
 *
 * It reads uv and the vertex colour and NOTHING ELSE -- no normal, because the sprite layout (p, color, uv) has none.
 * That is the point of it: the shell transplant is not welded to the lit layout, and a graph that asked for the normal
 * here would be refused by name rather than drawn wrong.
 *
 * The knobs are packed as two labelled vec4s (bolt = i0, t1, t2, eta; span = tLo, tHi), the way the fleet's own looks
 * pack theirs, so the shell's uniform struct stays short and the page binds the same numbers the graph was built with.
 */
export function makeHeidlerSpriteTsl(THREE, TSL, { i0 = PARAMS.first.i0, t1 = PARAMS.first.t1, t2 = PARAMS.first.t2, eta = null, tLo = PARAMS.first.t1 / 50, tHi = PARAMS.first.t2 * 8 } = {}) {
    const { Fn, float, vec3, vec4, uv, uniform, exp, log, mix, abs, vertexColor } = TSL;
    for (const n of ["vertexColor", "mix", "abs", "exp", "log"]) if (typeof TSL[n] !== "function") throw new Error(`physicsTsl: the TSL namespace has no ${n}()`);
    const { heidler } = heidlerNodes(TSL);
    const e0 = eta == null ? truePeak(t1, t2).peak : eta;
    const uniforms = { bolt: uniform(vec4(i0, t1, t2, e0)).label("bolt"), span: uniform(vec4(tLo, tHi, 0, 0)).label("span") };
    const material = new THREE.NodeMaterial();
    material.fragmentNode = Fn(() => {
        const t = uniforms.span.x.mul(exp(log(uniforms.span.y.div(uniforms.span.x)).mul(uv().x)));
        const cur = heidler(t, uniforms.bolt.x, uniforms.bolt.y, uniforms.bolt.z, uniforms.bolt.w).div(uniforms.bolt.x).clamp(0.0, 1.0);
        const glow = float(1.0).sub(abs(uv().y.mul(2.0).sub(1.0))).clamp(0.0, 1.0);
        const hot = vec3(1.0, 0.95, 0.7), cold = vec3(0.05, 0.05, 0.16);
        return vec4(mix(cold, hot, cur.mul(glow)).mul(vertexColor().rgb), vertexColor().a);
    })();
    // a mesh carrying exactly what the graph reads -- uv and colour, no normals asked for
    const geo = new THREE.PlaneGeometry(2, 2); geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(16).fill(1), 4));
    const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    scene.add(new THREE.Mesh(geo, material));
    return { material, scene, camera, uniforms, knobs: heidlerSpriteKnobs({ i0, t1, t2, eta: e0, tLo, tHi }) };
}
/** The two vec4s the graph was built with, for the fleet's bind hook: { bolt, span }. */
export function heidlerSpriteKnobs({ i0 = PARAMS.first.i0, t1 = PARAMS.first.t1, t2 = PARAMS.first.t2, eta = null, tLo = PARAMS.first.t1 / 50, tHi = PARAMS.first.t2 * 8 } = {}) {
    return { bolt: [i0, t1, t2, eta == null ? truePeak(t1, t2).peak : eta], span: [tLo, tHi, 0, 0] };
}
/** The sprite look's uniform struct: the camera and the two knob vectors. */
export const SPRITE_UNIFORMS = Object.freeze([{ name: "viewProj", type: "mat4" }, { name: "bolt", type: "vec4" }, { name: "span", type: "vec4" }]);
/**
 * THE SECOND SHELL (docs/TSL-ROADMAP.md, the thing tslRace-selfcheck said was unchecked at v4324): the SPRITE layout's
 * vertex stage -- p, color, uv, the instance record -- its Cam struct, its two varyings, and a {{DISPLACE}} hook. It is
 * the fleets' own sprite vertex stage (render/fleets.mjs SPRITE_WGSL / SPRITE_VERTEX_GLSL) with the hook and its local
 * added; the gate holds the emptied template to that shipped text. `turned` is the same spin every look shares.
 */
export function spriteLookShell(buffers, { uniforms: base = SPRITE_UNIFORMS, textures = [], sampler = null, extraUniforms = [], displace = "" } = {}) {
    const uniforms = [...base.map((u) => ({ ...u })), ...extraUniforms];
    const wgslType = { mat4: "mat4x4<f32>", vec4: "vec4<f32>", vec3: "vec3<f32>", vec2: "vec2<f32>", f32: "f32" };
    const camStruct = `struct Cam { ${uniforms.map((u) => `${u.name}: ${wgslType[u.type]}`).join(", ")} };`;
    const rest = LYAPUNOV_LOOK_WGSL.split("@fragment")[0];
    const turned = rest.slice(rest.indexOf("fn turned"), rest.indexOf("struct VOut")).trim();   // the spin helper, shared by every look
    const vout = `struct VOut { @builtin(position) pos: vec4<f32>, @location(0) color: vec4<f32>, @location(1) uv: vec2<f32> };`;
    const vertexTemplate = `@vertex fn vs(@location(0) p: vec3<f32>, @location(1) color: vec4<f32>, @location(2) rec: vec4<f32>, @location(3) ident: vec4<f32>, @location(5) extra: vec4<f32>, @location(4) uv: vec2<f32>) -> VOut {
  var o: VOut; var pl = p;
  {{DISPLACE}}
  o.pos = cam.viewProj * vec4<f32>(rec.xyz + turned(pl, extra.x) * rec.w, 1.0);
  o.color = color; o.uv = uv;
  return o;
}`;
    // v4326 -- the textures this shell BINDS, at the bindings the fleets' own sprite pipeline uses (the atlas at 1, after the
    // uniform struct). A graph whose texture node is labelled with one of these names transplants; any other is refused.
    const texDecl = [...textures.map((t, i) => `@group(0) @binding(${1 + i}) var ${t}: texture_2d<f32>;`),
                     // v4327 -- the SAMPLER, when the shell has one. gfx/device.js reads the bindings out of the shader and
                     // hands this one the sampler for the bound texture's own filter mode, so what it does is the texture's
                     // choice (device.texture({ nearest }) ), not the shader's: the same pipeline fetches or filters.
                     ...(sampler ? [`@group(0) @binding(${1 + textures.length}) var ${sampler}: sampler;`] : [])].join("\n");
    const prefix = `${camStruct}\n@group(0) @binding(0) var<uniform> cam: Cam;\n${texDecl}${texDecl ? "\n" : ""}${turned}\n${vout}\n${displace ? vertexTemplate.replace("{{DISPLACE}}", displace) : vertexTemplate}`;
    const glslUniforms = uniforms.map((u) => `uniform ${{ mat4: "mat4", vec4: "vec4", vec3: "vec3", vec2: "vec2", f32: "float" }[u.type]} ${u.name};`).join(" ");
    const glslTemplate = `#version 300 es
precision highp float;
${glslUniforms}
in vec3 p; in vec4 color; in vec4 rec; in vec4 ident; in vec4 extra; in vec2 uv;
out vec4 vColor; out vec2 vUv;
vec3 turned(vec3 q, float yaw) { float ca = cos(yaw), sa = sin(yaw); return vec3(q.x * ca - q.y * sa, q.x * sa + q.y * ca, q.z); }
void main() { vec3 pl = p;
  {{DISPLACE}}
  gl_Position = viewProj * vec4(rec.xyz + turned(pl, extra.x) * rec.w, 1.0); vColor = color; vUv = uv; }
`;
    // no normal in this layout, so `locals` has no name for one: a graph displacing along normalLocal is refused here
    const locals = { positionLocal: "pl", position: "p" };
    return { name: textures.length ? `sprite (${textures.join(", ")}${sampler ? " + sampler" : ""})` : "heidler sprite", uniforms, buffers, topology: null, textures,
             wgsl: { prefix, vertexTemplate, uniformVar: "cam", varyingParam: "v", varyings: { uv: "v.uv", color: "v.color" }, locals, ...(sampler ? { sampler } : {}) },
             glsl: { vertex: glslTemplate.replace("{{DISPLACE}}", displace), vertexTemplate: glslTemplate, fragmentPrefix: `#version 300 es\nprecision highp float;\nprecision highp sampler2D;\n${glslUniforms}${textures.map((t) => ` uniform sampler2D ${t};`).join("")}\nin vec4 vColor; in vec2 vUv; out vec4 fragColor;`, varyings: { uv: "vUv", color: "vColor" }, locals } };
}
/** v4325's name for it, when the shell is the lightning's: the sprite layout with the bolt and span knobs and no texture. */
export function heidlerSpriteShell(buffers, opts = {}) { return spriteLookShell(buffers, opts); }
/**
 * The HAND-WRITTEN twin of makeHeidlerSpriteTsl, in both languages, in the same shell: the grader's other half. Every
 * grouping is the node graph's own -- ((i0 / eta) * shape) / i0, ((t / t1) * (t / t1)), clamp last -- because float
 * addition is not associative and the claim is byte equality, not likeness.
 */
export function heidlerSpriteHand(buffers, opts = {}) {
    const shell = heidlerSpriteShell(buffers, opts);
    const wgsl = `${shell.wgsl.prefix.replace("{{DISPLACE}}", opts.displace || "")}
@fragment fn fs(v: VOut) -> @location(0) vec4<f32> {
  let t = cam.span.x * exp(log(cam.span.y / cam.span.x) * v.uv.x);
  let x = (t / cam.bolt.y) * (t / cam.bolt.y);
  let shape = select(0.0, (x / (1.0 + x)) * exp(-t / cam.bolt.z), t > 0.0);
  let cur = clamp(((cam.bolt.x / cam.bolt.w) * shape) / cam.bolt.x, 0.0, 1.0);
  let glow = clamp(1.0 - abs((v.uv.y * 2.0) - 1.0), 0.0, 1.0);
  return vec4<f32>(mix(vec3<f32>(0.05, 0.05, 0.16), vec3<f32>(1.0, 0.95, 0.7), cur * glow) * v.color.rgb, v.color.a);
}
`;
    const glsl = `${shell.glsl.fragmentPrefix}
void main() {
  float t = span.x * exp(log(span.y / span.x) * vUv.x);
  float x = (t / bolt.y) * (t / bolt.y);
  float shape = t > 0.0 ? (x / (1.0 + x)) * exp(-t / bolt.z) : 0.0;
  float cur = clamp(((bolt.x / bolt.w) * shape) / bolt.x, 0.0, 1.0);
  float glow = clamp(1.0 - abs((vUv.y * 2.0) - 1.0), 0.0, 1.0);
  fragColor = vec4(mix(vec3(0.05, 0.05, 0.16), vec3(1.0, 0.95, 0.7), cur * glow) * vColor.rgb, vColor.a);
}
`;
    return { shaders: { wgsl, glsl: { vertex: shell.glsl.vertex, fragment: glsl } }, vs: "vs", fs: "fs", buffers: shell.buffers, uniforms: shell.uniforms, shell: shell.name };
}

// ---- v4326: the fleets' OWN bitmap look as a graph, and a texture across the shell boundary -------------------------
/**
 * THE SPRITE RACE'S SHIPPED LOOK, WRITTEN AS A GRAPH: the atlas texel fetched by integer coordinate (no sampler, no
 * filtering), transparent texels discarded, times the vertex colour -- the arithmetic of render/fleets.mjs SPRITE_WGSL
 * and SPRITE_FRAGMENT_GLSL, node for node. Nothing here is a twin written for the occasion: the grader draws the fleets'
 * own Pixel race beside it and holds the two to each other, so the hand-written half of the claim is shipped code.
 *
 * THE UV IS GIVEN AT CONSTRUCTION, and that is not a style choice. three's TextureNode constructor runs
 * setUpdateMatrix(uvNode === null): a texture node built WITHOUT a uv turns on the texture's uv-transform matrix, and
 * every clone of it -- textureLoad() makes one -- keeps the flag. Spelled the obvious way (texture(tex) first, the
 * coordinate later) the emitted fragment multiplies the fetch coordinate by an unlabelled mat3, which the transplant
 * refuses by name and should. Spelled with the uv up front there is no matrix and no uniform at all.
 */
export function makeSpriteAtlasTsl(THREE, TSL, { texture: image, name = "atlas", cutoff = 0.5, color = [1, 1, 1, 1] } = {}) {
    const { Fn, vec2, vec4, ivec2, uv, texture, textureLoad, textureSize, vertexColor, clamp, Discard } = TSL;
    for (const n of ["textureLoad", "textureSize", "Discard", "ivec2"]) if (typeof TSL[n] !== "function") throw new Error(`physicsTsl: the TSL namespace has no ${n}()`);
    if (!image) throw new Error("physicsTsl: makeSpriteAtlasTsl needs a THREE texture to fetch from");
    const base = texture(image, uv());
    const material = new THREE.NodeMaterial();
    material.fragmentNode = Fn(() => {
        const dim = vec2(textureSize(base, 0));
        const t = textureLoad(base, ivec2(clamp(uv().mul(dim), vec2(0.0), dim.sub(1.0)))).label(name);
        Discard(t.a.lessThan(cutoff));
        return vec4(t.rgb.mul(vertexColor().rgb), 1.0);
    })();
    const geo = new THREE.PlaneGeometry(2, 2); geo.setAttribute("color", new THREE.BufferAttribute(Float32Array.from([...color, ...color, ...color, ...color]), 4));
    const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    scene.add(new THREE.Mesh(geo, material));
    return { material, scene, camera, texture: base, name };
}
/** The shell the fleets' sprite pipeline actually has: viewProj alone, the atlas bound at 1, and the sprite layout's vertex stage. */
export function spriteAtlasShell(buffers, { name = "atlas", displace = "" } = {}) {
    return spriteLookShell(buffers, { uniforms: [{ name: "viewProj", type: "mat4" }], textures: [name], displace });
}

// ---- v4327: a SAMPLER in a fleet shell -- the same picture, filtered ------------------------------------------------
/**
 * THE SAME SPRITE, SAMPLED INSTEAD OF FETCHED: the atlas read through a sampler at the quad's uv, transparent texels
 * discarded, times the vertex colour. Beside makeSpriteAtlasTsl (v4326, which fetches a texel by integer coordinate)
 * this is the one node's difference between a hard bitmap and a smooth one.
 *
 * WHAT DECIDES IS THE TEXTURE, NOT THE GRAPH. three emits textureLoad() for a texture whose filters are Nearest and
 * textureSample() for one whose filters are Linear -- the same TSL line, two different shaders -- so a graph asking
 * for a filtered sample must be handed a filtered texture or it silently becomes a fetch and the shell's sampler goes
 * unused. On the device the mirror of that holds: gfx/device.js picks the sampler by the BOUND texture's `nearest`
 * flag, so one generated pipeline draws hard or smooth by what is bound to it.
 */
export function makeSpriteSampledTsl(THREE, TSL, { texture: image, name = "atlas", cutoff = 0.5, color = [1, 1, 1, 1] } = {}) {
    const { Fn, vec4, uv, texture, vertexColor, Discard } = TSL;
    if (!image) throw new Error("physicsTsl: makeSpriteSampledTsl needs a THREE texture to sample");
    if (image.magFilter === THREE.NearestFilter) throw new Error("physicsTsl: makeSpriteSampledTsl was handed a NEAREST texture; three would emit a texel fetch and the shell's sampler would go unused. Hand it a LinearFilter texture, or use makeSpriteAtlasTsl.");
    const material = new THREE.NodeMaterial();
    material.fragmentNode = Fn(() => {
        const t = texture(image, uv()).label(name);   // the uv at construction, as v4326's finding requires
        Discard(t.a.lessThan(cutoff));
        return vec4(t.rgb.mul(vertexColor().rgb), 1.0);
    })();
    const geo = new THREE.PlaneGeometry(2, 2); geo.setAttribute("color", new THREE.BufferAttribute(Float32Array.from([...color, ...color, ...color, ...color]), 4));
    const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    scene.add(new THREE.Mesh(geo, material));
    return { material, scene, camera, name };
}
/** The sprite shell with a sampler beside the atlas: viewProj, the atlas at 1, the sampler at 2. */
export function spriteSampledShell(buffers, { name = "atlas", sampler = "samp", displace = "" } = {}) {
    return spriteLookShell(buffers, { uniforms: [{ name: "viewProj", type: "mat4" }], textures: [name], sampler, displace });
}
/** The HAND-WRITTEN twin of makeSpriteSampledTsl in that shell, both languages -- the grader's other half. */
export function spriteSampledHand(buffers, opts = {}) {
    const shell = spriteSampledShell(buffers, opts);
    const wgsl = `${shell.wgsl.prefix.replace("{{DISPLACE}}", opts.displace || "")}
@fragment fn fs(v: VOut) -> @location(0) vec4<f32> {
  let t = textureSample(atlas, samp, v.uv);
  if (t.a < 0.5) { discard; }
  return vec4<f32>(t.rgb * v.color.rgb, 1.0);
}
`;
    const glsl = `${shell.glsl.fragmentPrefix}
void main() {
  vec4 t = texture(atlas, vUv);
  if (t.a < 0.5) discard;
  fragColor = vec4(t.rgb * vColor.rgb, 1.0);
}
`;
    return { shaders: { wgsl, glsl: { vertex: shell.glsl.vertex, fragment: glsl } }, vs: "vs", fs: "fs", buffers: shell.buffers, uniforms: shell.uniforms, textures: shell.textures, shell: shell.name };
}

// ---- v4328: the INK layout -- a line-list, one varying, and no uv anywhere ------------------------------------------
/** The ink shell's uniform struct: the camera and the wash knobs (wash, gain). */
export const INK_UNIFORMS = Object.freeze([{ name: "viewProj", type: "mat4" }, { name: "ink", type: "vec4" }]);
/**
 * THE THIRD SHELL, AND THE LEAN ONE: the fleets' ink look (render/fleets.mjs INK_WGSL -- the Krbn race's strokes on a
 * LINE-LIST) has the flat layout, p and colour and nothing else. No normal, no uv, not even the hull's own x and y
 * standing in for one: its whole fragment is `return v.color;`. A graph transplanted here may read the vertex colour
 * and no other varying, and one that reaches for a uv is refused by name rather than handed something that is not one.
 *
 * It is also the first shell whose TOPOLOGY is not the default. The descriptor carries "line-list" out to the device,
 * where a triangle-list pipeline over the same vertices would draw a different picture entirely.
 */
export function inkLookShell(buffers, { extraUniforms = [], displace = "" } = {}) {
    const uniforms = [...INK_UNIFORMS.map((u) => ({ ...u })), ...extraUniforms];
    const wgslType = { mat4: "mat4x4<f32>", vec4: "vec4<f32>", vec3: "vec3<f32>", vec2: "vec2<f32>", f32: "f32" };
    const camStruct = `struct Cam { ${uniforms.map((u) => `${u.name}: ${wgslType[u.type]}`).join(", ")} };`;
    const rest = LYAPUNOV_LOOK_WGSL.split("@fragment")[0];
    const turned = rest.slice(rest.indexOf("fn turned"), rest.indexOf("struct VOut")).trim();
    const vout = `struct VOut { @builtin(position) pos: vec4<f32>, @location(0) color: vec4<f32> };`;
    const vertexTemplate = `@vertex fn vs(@location(0) p: vec3<f32>, @location(1) color: vec4<f32>, @location(2) rec: vec4<f32>, @location(3) ident: vec4<f32>, @location(5) extra: vec4<f32>) -> VOut {
  var o: VOut; var pl = p;
  {{DISPLACE}}
  o.pos = cam.viewProj * vec4<f32>(rec.xyz + turned(pl, extra.x) * rec.w, 1.0);
  o.color = color;
  return o;
}`;
    const prefix = `${camStruct}\n@group(0) @binding(0) var<uniform> cam: Cam;\n${turned}\n${vout}\n${displace ? vertexTemplate.replace("{{DISPLACE}}", displace) : vertexTemplate}`;
    const glslUniforms = uniforms.map((u) => `uniform ${{ mat4: "mat4", vec4: "vec4", vec3: "vec3", vec2: "vec2", f32: "float" }[u.type]} ${u.name};`).join(" ");
    const glslTemplate = `#version 300 es
precision highp float;
${glslUniforms}
in vec3 p; in vec4 color; in vec4 rec; in vec4 ident; in vec4 extra;
out vec4 vColor;
vec3 turned(vec3 q, float yaw) { float ca = cos(yaw), sa = sin(yaw); return vec3(q.x * ca - q.y * sa, q.x * sa + q.y * ca, q.z); }
void main() { vec3 pl = p;
  {{DISPLACE}}
  gl_Position = viewProj * vec4(rec.xyz + turned(pl, extra.x) * rec.w, 1.0); vColor = color; }
`;
    const locals = { positionLocal: "pl", position: "p" };   // a line has no normal to move along either
    return { name: "ink", uniforms, buffers, topology: "line-list", textures: [],
             wgsl: { prefix, vertexTemplate, uniformVar: "cam", varyingParam: "v", varyings: { color: "v.color" }, locals },
             glsl: { vertex: glslTemplate.replace("{{DISPLACE}}", displace), vertexTemplate: glslTemplate, fragmentPrefix: `#version 300 es\nprecision highp float;\n${glslUniforms}\nin vec4 vColor; out vec4 fragColor;`, varyings: { color: "vColor" }, locals } };
}
/**
 * THE INK WASH as a TSL graph: the stroke's own colour washed toward its luminance by `wash` and lifted by `gain`.
 * It is a function of the vertex colour and nothing else, because that is all the layout carries -- which is the
 * point of grading it: a graph with one varying to read still crosses, and three emits exactly one varying for it.
 */
export function makeInkTsl(THREE, TSL, { wash = 0.5, gain = 1.6 } = {}) {
    const { Fn, vec3, vec4, uniform, vertexColor, mix, dot } = TSL;
    const uniforms = { ink: uniform(vec4(wash, gain, 0, 0)).label("ink") };
    const material = new THREE.NodeMaterial();
    material.fragmentNode = Fn(() => {
        const c = vertexColor();
        const lum = dot(c.rgb, vec3(0.299, 0.587, 0.114));
        return vec4(mix(c.rgb, vec3(lum), uniforms.ink.x).mul(uniforms.ink.y), c.a);
    })();
    // a mesh carrying ONLY a colour: no uv read, no normal read, so three emits one varying and no more
    const geo = new THREE.PlaneGeometry(2, 2); geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array([0.9, 0.4, 0.2, 1, 0.2, 0.8, 0.5, 1, 0.3, 0.3, 0.9, 1, 1, 1, 1, 1]), 4));
    const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    scene.add(new THREE.Mesh(geo, material));
    return { material, scene, camera, uniforms, knobs: [wash, gain, 0, 0] };
}
/** The HAND-WRITTEN twin of makeInkTsl in that shell, both languages -- every grouping the graph's own. */
export function inkHand(buffers, opts = {}) {
    const shell = inkLookShell(buffers, opts);
    const wgsl = `${shell.wgsl.prefix.replace("{{DISPLACE}}", opts.displace || "")}
@fragment fn fs(v: VOut) -> @location(0) vec4<f32> {
  let lum = dot(v.color.rgb, vec3<f32>(0.299, 0.587, 0.114));
  return vec4<f32>(mix(v.color.rgb, vec3<f32>(lum), cam.ink.x) * cam.ink.y, v.color.a);
}
`;
    const glsl = `${shell.glsl.fragmentPrefix}
void main() {
  float lum = dot(vColor.rgb, vec3(0.299, 0.587, 0.114));
  fragColor = vec4(mix(vColor.rgb, vec3(lum), ink.x) * ink.y, vColor.a);
}
`;
    return { shaders: { wgsl, glsl: { vertex: shell.glsl.vertex, fragment: glsl } }, vs: "vs", fs: "fs", buffers: shell.buffers, uniforms: shell.uniforms, topology: shell.topology, shell: shell.name };
}
