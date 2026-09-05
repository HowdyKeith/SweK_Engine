// WebGLEngine/render/tslWide.mjs -- v4483
//
// *** THE WIDENED TRANSPLANT'S FIRST CONSUMERS: a shell with COMPUTED and FLAT varyings and the camera in its fragment,
// and a compute pass whose frustum lives INSIDE its uniform struct. *** render/tslSource.mjs transplantIntoShell carried
// three varyings since v4322 -- but only ones that were bare attribute copies (uv, the normal, the vertex colour), because
// that is what varyingSemantics could read. A graph that makes a varying of an EXPRESSION -- a texcoord scaled by a
// uniform, a flat integer band constant over a cell, a length -- had three write the expression in the vertex stage,
// and the transplant refused it as "unknown". That is what kept a Slug graph (five computed varyings, one flat) out of
// the device shell. At v4483 the shell says where they land ({{VARYINGS}} in its VOut and {{ASSIGN}} in its vertex
// stage) and names its own matrices for three's (`matrices`), and this module is the shell that does, with its hand-
// written twin and the graph that suits it.
//
// THE QUAD SHELL: a grid of cells, each a quad of two triangles, one vertex buffer (p: vec2, uv: vec2). The graph
// computes three varyings -- vScaled = uv * scale (vec2), vLin = 0.3 x + 0.2 y + 0.5 (f32, LINEAR in the position, so the rasteriser's interpolation of it is exact and a CPU twin can say what a pixel holds -- a length was tried first and parted from the twin by 4 of 255 at pixel centres), vBand = the CELL's column,
// flat (i32) -- and its fragment reads the camera's projection matrix. The band is computed from the cell CENTRE
// (position - (uv - 0.5) * cell), so every vertex of a cell agrees on it: *** A FLAT VARYING WHOSE VERTICES DISAGREE
// IS BACKEND-DEPENDENT *** (WebGPU takes the first vertex of a triangle, OpenGL ES the last), and the gate measures
// that with the per-vertex band the graph can also emit, as a REPORTED number, never a held one.
//
// THE PLANES PASS: for each point, the least signed distance to six frustum planes -- the planes a uniformArray
// labelled "planes", which three emits as a binding of its own and computeShell now folds into the struct as
// `planes: array<vec4<f32>, 6>` at the front, the layout render/gpuDriven.mjs packCullUniforms writes. So the
// generated pass reads the SAME bytes the hand-written cull pass reads, from one buffer.
"use strict";

// ---- the quad shell ---------------------------------------------------------------------------------------------
export const QUAD_UNIFORMS = Object.freeze([{ name: "scale", type: "vec2" }, { name: "tint", type: "vec3" }, { name: "proj", type: "mat4" }]);
export const QUAD_KNOBS = Object.freeze({ scale: [2, 3], tint: [1, 0.5, 0.25], cell: 0.25 });
/** An orthographic projection that maps x to 0.5 * x + 0.25 (so the camera term is visible and small): column-major. */
export const QUAD_PROJ = Object.freeze([0.5, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.25, 0, 0, 1]);

/** The grid: `cells` x `cells` quads over clip space, each vertex p (vec2) and uv (vec2, 0..1 within its cell). 6 vertices a cell. */
export function quadGrid(cells = 8) {
    const out = new Float32Array(cells * cells * 6 * 4);
    const w = 2 / cells;
    let k = 0;
    const put = (x, y, u, v) => { out[k++] = x; out[k++] = y; out[k++] = u; out[k++] = v; };
    for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) {
        const x0 = -1 + i * w, y0 = -1 + j * w, x1 = x0 + w, y1 = y0 + w;
        put(x0, y0, 0, 0); put(x1, y0, 1, 0); put(x1, y1, 1, 1);
        put(x0, y0, 0, 0); put(x1, y1, 1, 1); put(x0, y1, 0, 1);
    }
    return out;
}
export const QUAD_BUFFERS = Object.freeze([{ stride: 16, stepMode: "vertex", attributes: [{ name: "p", location: 0, format: "float32x2", offset: 0 }, { name: "uv", location: 1, format: "float32x2", offset: 8 }] }]);

const WGSL_T = { mat4: "mat4x4<f32>", vec4: "vec4<f32>", vec3: "vec3<f32>", vec2: "vec2<f32>", f32: "f32" };
const GLSL_T = { mat4: "mat4", vec4: "vec4", vec3: "vec3", vec2: "vec2", f32: "float" };

/**
 * The shell: its Cam struct, its VOut with {{VARYINGS}} at the end, its vertex stage with {{DISPLACE}} and {{ASSIGN}},
 * `matrices` naming what three's cameraProjectionMatrix is here (cam.proj), `locals` naming three's attributes (uv, position,
 * positionLocal) in the vertex stage. `varyings` and `assign` fill the hooks by hand -- the twin's route; the transplant's
 * route leaves them and fills them from the graph.
 */
export function quadShell({ cells = 8, varyings = "", assign = "", fragmentIns = "" } = {}) {
    const uniforms = QUAD_UNIFORMS.map((u) => ({ ...u }));
    const camStruct = `struct Cam { ${uniforms.map((u) => `${u.name}: ${WGSL_T[u.type]}`).join(", ")} };`;
    const vout = `struct VOut { @builtin(position) pos: vec4<f32>, @location(0) uv: vec2<f32>{{VARYINGS}} };`;
    const vertexTemplate = `@vertex fn vs(@location(0) p: vec2<f32>, @location(1) uv: vec2<f32>) -> VOut {
  var o: VOut; var pl = vec3<f32>(p, 0.0);
  {{DISPLACE}}
  o.pos = vec4<f32>(pl.xy, 0.0, 1.0); o.uv = uv;
  {{ASSIGN}}
  return o;
}`;
    const prefix = `${camStruct}\n@group(0) @binding(0) var<uniform> cam: Cam;\n${vout.replace("{{VARYINGS}}", varyings ? ", " + varyings : "{{VARYINGS}}")}\n${varyings || assign ? vertexTemplate.replace("{{DISPLACE}}", "").replace("{{ASSIGN}}", assign) : vertexTemplate}`;
    const glslUniforms = uniforms.map((u) => `uniform ${GLSL_T[u.type]} ${u.name};`).join(" ");
    const glslTemplate = `#version 300 es
precision highp float; precision highp int;
${glslUniforms}
in vec2 p; in vec2 uv;
out vec2 vUv; {{VARYINGS}}
void main() { vec3 pl = vec3(p, 0.0);
  {{DISPLACE}}
  gl_Position = vec4(pl.xy, 0.0, 1.0); vUv = uv;
  {{ASSIGN}}
}
`;
    const locals = { positionLocal: "pl", position: "pl", uv: "uv" };
    const matricesW = { cameraProjectionMatrix: "cam.proj" }, matricesG = { cameraProjectionMatrix: "proj" };
    const glslVertex = glslTemplate.replace("{{DISPLACE}}", "").replace("{{ASSIGN}}", assign ? assign.replace(/\bcam\./g, "").replace(/\bo\./g, "") : "").replace("{{VARYINGS}}", varyings ? "" : "{{VARYINGS}}");
    return { name: "quad", uniforms, buffers: QUAD_BUFFERS.map((b) => ({ ...b, attributes: b.attributes.map((a) => ({ ...a })) })), topology: null, textures: [], cells,
             wgsl: { prefix, vertexTemplate, uniformVar: "cam", varyingParam: "v", outVar: "o", nextLocation: 1, varyings: { uv: "v.uv" }, locals, matrices: matricesW },
             glsl: { vertex: glslVertex, vertexTemplate: glslTemplate, fragmentPrefix: `#version 300 es\nprecision highp float; precision highp int;\n${glslUniforms}\nin vec2 vUv; ${fragmentIns || "{{VARYINGS}}"} out vec4 fragColor;`, varyings: { uv: "vUv" }, locals, matrices: matricesG } };
}

/**
 * The hand-written twin: the same three varyings and the same fragment, both languages, over the same shell. `perVertexBand`
 * computes the band from the VERTEX's own x (so a cell's vertices disagree, and the provoking vertex decides) instead of the cell's centre.
 */
export function quadHand({ cells = 8, perVertexBand = false } = {}) {
    const cell = (2 / cells).toFixed(6);
    const bandW = perVertexBand ? `i32(floor(pl.x * 4.0))` : `i32(floor((pl.x - (uv.x - 0.5) * ${cell} + 1.0) * 2.0))`;
    const bandG = perVertexBand ? `int(floor(pl.x * 4.0))` : `int(floor((pl.x - (uv.x - 0.5) * ${cell} + 1.0) * 2.0))`;
    const shell = quadShell({ cells,
        varyings: "@location(1) vScaled: vec2<f32>, @location(2) vLin: f32, @location(3) @interpolate(flat) vBand: i32",
        assign: `o.vScaled = uv * cam.scale; o.vLin = pl.x * 0.3 + pl.y * 0.2 + 0.5; o.vBand = ${bandW};` });
    const fragW = `@fragment fn fs(v: VOut) -> @location(0) vec4<f32> {
  let c = vec4<f32>(v.vScaled.x, v.vLin, f32(v.vBand + 4) * 0.1 + (cam.proj * vec4<f32>(v.vScaled, 0.0, 1.0)).x * 0.05, 1.0);
  return c * vec4<f32>(cam.tint, 1.0);
}`;
    const wgsl = `${shell.wgsl.prefix}\n${fragW}\n`;
    const glslVertex = shell.glsl.vertexTemplate.replace("{{DISPLACE}}", "").replace("{{VARYINGS}}", "out vec2 vScaled; out float vLin; flat out int vBand;")
        .replace("{{ASSIGN}}", `vScaled = uv * scale; vLin = pl.x * 0.3 + pl.y * 0.2 + 0.5; vBand = ${bandG};`);
    const glslFragment = `${shell.glsl.fragmentPrefix.replace("{{VARYINGS}}", "in vec2 vScaled; in float vLin; flat in int vBand;")}
void main() {
  vec4 c = vec4(vScaled.x, vLin, float(vBand + 4) * 0.1 + (proj * vec4(vScaled, 0.0, 1.0)).x * 0.05, 1.0);
  fragColor = c * vec4(tint, 1.0);
}
`;
    return { shaders: { wgsl, glsl: { vertex: glslVertex, fragment: glslFragment } }, vs: "vs", fs: "fs", buffers: shell.buffers, uniforms: shell.uniforms, shell: shell.name };
}
/** The twin's WGSL, rendered once, for the corpus. */
export const QUAD_WGSL = quadHand().shaders.wgsl;

/** The graph: the same three varyings as nodes (named, the band flat), the fragment reading cameraProjectionMatrix. */
export function makeQuadVaryingsTsl(THREE, TSL, { cells = 8, perVertexBand = false, knobs = QUAD_KNOBS } = {}) {
    const { uniform, varying, uv, positionLocal, int, float, floor, vec4, cameraProjectionMatrix } = TSL;
    const scale = uniform(new THREE.Vector2(knobs.scale[0], knobs.scale[1])).label("scale");
    const tint = uniform(new THREE.Color(knobs.tint[0], knobs.tint[1], knobs.tint[2])).label("tint");
    const cell = 2 / cells;
    const vScaled = varying(uv().mul(scale), "vScaled");
    const vLin = varying(positionLocal.x.mul(0.3).add(positionLocal.y.mul(0.2)).add(0.5), "vLin");
    const bandNode = perVertexBand ? int(floor(positionLocal.x.mul(4.0))) : int(floor(positionLocal.x.sub(uv().x.sub(0.5).mul(cell)).add(1.0).mul(2.0)));
    const vBand = varying(bandNode, "vBand"); vBand.setInterpolation("flat");
    const mat = new THREE.NodeMaterial();
    const camX = cameraProjectionMatrix.mul(vec4(vScaled, 0.0, 1.0)).x;
    mat.fragmentNode = vec4(vScaled.x, vLin, float(vBand.add(4)).mul(0.1).add(camX.mul(0.05)), 1.0).mul(vec4(tint, 1.0));
    const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); scene.add(mesh);
    return { scene, camera, mesh, material: mat };
}

/** The picture's CPU twin at a point: the colour the fragment returns at clip (x, y) inside cell (i, j) with the cell's own uv. */
export function quadColourAt(x, y, { cells = 8, knobs = QUAD_KNOBS, proj = QUAD_PROJ } = {}) {
    const w = 2 / cells, i = Math.min(cells - 1, Math.floor((x + 1) / w)), j = Math.min(cells - 1, Math.floor((y + 1) / w));
    const u = (x - (-1 + i * w)) / w, v = (y - (-1 + j * w)) / w;
    const vScaled = [u * knobs.scale[0], v * knobs.scale[1]];
    const vLin = x * 0.3 + y * 0.2 + 0.5;
    const cx = x - (u - 0.5) * w;
    const band = Math.floor((cx + 1) * 2);
    const projX = proj[0] * vScaled[0] + proj[4] * vScaled[1] + proj[12];
    const c = [vScaled[0], vLin, (band + 4) * 0.1 + projX * 0.05];
    return c.map((q, k) => Math.max(0, Math.min(1, q * knobs.tint[k])));
}

// ---- the planes pass: the frustum inside the struct -----------------------------------------------------------------
export const PLANES_UNIFORMS = Object.freeze([{ name: "planes", array: { element: "vec4<f32>", length: 6 } }, { name: "info", type: "vec4" }]);
/** The graph: out[i] = min over the six planes of dot(plane.xyz, p) + plane.w, for the first info.x points. */
export function makePlanesTsl(TSL, { count = 64 } = {}) {
    const { Fn, If, Loop, int, float, vec4, uniform, uniformArray, instanceIndex, instancedArray, dot, min } = TSL;
    const info = uniform(vec4(count, 0, 0, 0)).label("info");
    const planes = uniformArray([0, 0, 0, 0, 0, 0].map(() => ({ x: 0, y: 0, z: 0, w: 0 })), "vec4").label("planes");
    const pts = instancedArray(count, "vec4").label("pts");
    const outv = instancedArray(count, "float").label("dist");
    const node = Fn(() => {
        const i = instanceIndex;
        If(float(i).lessThan(info.x), () => {
            const p = pts.element(i);
            const best = float(1e9).toVar();
            Loop({ start: int(0), end: int(6), type: "int", condition: "<" }, ({ i: k }) => {
                const pl = planes.element(k);
                best.assign(min(best, dot(pl.xyz, p.xyz).add(pl.w)));
            });
            outv.element(i).assign(best);
        });
    })().compute(count);
    return { node, count };
}
/** The CPU twin, in f32: `planes` 24 floats, `pts` count * 4 floats. */
export function planesCpu(planes, pts, count) {
    const out = new Float32Array(count), f = Math.fround;
    for (let i = 0; i < count; i++) {
        let best = f(1e9);
        for (let k = 0; k < 6; k++) {
            const d = f(f(f(f(planes[k * 4] * pts[i * 4]) + f(planes[k * 4 + 1] * pts[i * 4 + 1])) + f(planes[k * 4 + 2] * pts[i * 4 + 2])) + planes[k * 4 + 3]);
            best = Math.min(best, d);
        }
        out[i] = best;
    }
    return out;
}
/** Six planes of a box |x|,|y|,|z| <= 1 (inward normals), as packCullUniforms lays them: 24 floats. */
export function boxPlanes(half = 1) {
    return Float32Array.from([1, 0, 0, half, -1, 0, 0, half, 0, 1, 0, half, 0, -1, 0, half, 0, 0, 1, half, 0, 0, -1, half]);
}
