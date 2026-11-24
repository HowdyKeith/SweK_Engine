// WebGLEngine/render/infiniteGrid.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// AN INFINITE GROUND GRID, FOR WEBGL2 AND WEBGPU. Backlog `gizmos` (PlayCanvas src/extras/grid/). A full-screen pass: each pixel's ray (through the inverse view-projection,
// near to far) meets the ground plane -- y = 0, or z = 0 for a z-up page -- and where it meets it in front of the eye the pixel shows grid lines: a fine line every `cell`,
// a stronger one every `major` cells, the two axes through the origin in their own colours (x red; the other ground axis blue for y up, green for z up), each line one
// pixel wide however far away (the coordinate's screen derivative, fwidth), the whole fading out with distance from the eye (`fade` world units to half). It writes the
// PLANE's own depth (gl_FragDepth / @builtin(frag_depth)), so drawn after the scene with the depth test on it is hidden behind what stands on it and in front of what lies
// under it; the sky above the horizon is left alone (discarded). Blended over what is there (src-alpha, one-minus-src-alpha).
//
//   GLSL:  const grid = createGridGL(gl);  grid.draw({ invViewProj, viewProj, eye, up: "y", cell: 1, major: 10, fade: 40 })   (the page's framebuffer, viewport and depth state)
//   WGSL:  GRID_WGSL; createGridGPU(device, format, { depthFormat }) -> { encode(pass, { invViewProj, viewProj, eye, ... }) } in the page's own render pass
//   gridAlphaCPU({ ... }, x, y, width, height) the same sum on the CPU, for a gate
// Depth: `zRange` "gl" (-1..1, WebGL2: gl_FragDepth = z/w * 0.5 + 0.5) or "zo" (0..1, WebGPU's perspZO: frag_depth = z/w).
// Held by tools/ship/gizmoOverlay-selfcheck.mjs (the grid's pixels on gizmo-demo.html against gridAlphaCPU) and tools/ship/infiniteGrid-selfcheck.mjs.
"use strict";

const UNI = () => `
float gridLine(vec2 c) { vec2 d = fwidth(c); vec2 g = abs(fract(c - 0.5) - 0.5) / max(d, vec2(1e-6)); return 1.0 - min(min(g.x, g.y), 1.0); }`;

export const GRID_VS_GLSL = `#version 300 es
out vec2 vNdc;
void main() { vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)) * 2.0 - 1.0; vNdc = p; gl_Position = vec4(p, 0.0, 1.0); }`;
export const GRID_FS_GLSL = `#version 300 es
precision highp float;
in vec2 vNdc; out vec4 outColor;
uniform mat4 uInvViewProj; uniform mat4 uViewProj; uniform vec3 uEye; uniform vec4 uParams;   // cell, major, fade, z-up (1) or y-up (0)
uniform float uZo;
${UNI()}
void main() {
    vec4 a = uInvViewProj * vec4(vNdc, uZo > 0.5 ? 0.0 : -1.0, 1.0), b = uInvViewProj * vec4(vNdc, 1.0, 1.0);
    vec3 p0 = a.xyz / a.w, p1 = b.xyz / b.w, d = p1 - p0;
    bool zUp = uParams.w > 0.5;
    float dn = zUp ? d.z : d.y, on = zUp ? p0.z : p0.y;
    bool edgeOn = abs(dn) < 1e-9; float t = -on / (edgeOn ? 1e-9 : dn);   // the derivatives below need every pixel of the quad: the discards come after them
    vec3 p = p0 + d * t; vec2 g = zUp ? p.xy : p.xz;
    float fine = gridLine(g / uParams.x), major = gridLine(g / (uParams.x * uParams.y));
    vec2 w = fwidth(g); float ax = 1.0 - min(abs(g.y) / max(w.y, 1e-6), 1.0), az = 1.0 - min(abs(g.x) / max(w.x, 1e-6), 1.0);
    float fade = exp(-0.693147 * length(p - uEye) / uParams.z);
    vec3 col = vec3(0.55, 0.6, 0.7); float alpha = max(fine * 0.35, major * 0.7);
    if (ax > 0.0) { col = mix(col, vec3(0.94, 0.36, 0.36), ax); alpha = max(alpha, ax); }
    if (az > 0.0) { col = mix(col, zUp ? vec3(0.44, 0.83, 0.44) : vec3(0.36, 0.55, 1.0), az); alpha = max(alpha, az); }
    alpha *= fade; if (edgeOn || t <= 0.0 || alpha < 0.004) discard;
    vec4 q = uViewProj * vec4(p, 1.0); float z = q.z / q.w;
    gl_FragDepth = uZo > 0.5 ? z : z * 0.5 + 0.5;
    outColor = vec4(col, alpha);
}`;

export function createGridGL(gl) {
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error("infiniteGrid: " + gl.getShaderInfoLog(o)); return o; };
    const prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, GRID_VS_GLSL)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, GRID_FS_GLSL)); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error("infiniteGrid: " + gl.getProgramInfoLog(prog));
    const U = Object.fromEntries(["uInvViewProj", "uViewProj", "uEye", "uParams", "uZo"].map((n) => [n, gl.getUniformLocation(prog, n)])), vao = gl.createVertexArray();
    return {
        draw({ invViewProj, viewProj, eye, up = "y", cell = 1, major = 10, fade = 40, zRange = "gl" }) {
            gl.useProgram(prog); gl.bindVertexArray(vao);
            gl.uniformMatrix4fv(U.uInvViewProj, false, Float32Array.from(invViewProj)); gl.uniformMatrix4fv(U.uViewProj, false, Float32Array.from(viewProj));
            gl.uniform3fv(U.uEye, Float32Array.from(eye)); gl.uniform4f(U.uParams, cell, major, fade, up === "z" ? 1 : 0); gl.uniform1f(U.uZo, zRange === "zo" ? 1 : 0);
            const blend = gl.isEnabled(gl.BLEND); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
            gl.drawArrays(gl.TRIANGLES, 0, 3); if (!blend) gl.disable(gl.BLEND); gl.bindVertexArray(null);
        },
        destroy() { gl.deleteProgram(prog); gl.deleteVertexArray(vao); },
    };
}

export const GRID_WGSL = `
struct GU { invViewProj: mat4x4f, viewProj: mat4x4f, eye: vec4f, params: vec4f, zo: vec4f };   // params = (cell, major, fade, z-up); zo.x 1 for a 0..1 depth range
@group(0) @binding(0) var<uniform> U: GU;
struct VO { @builtin(position) pos: vec4f, @location(0) ndc: vec2f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> VO { let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u)) * 2.0 - 1.0; var o: VO; o.pos = vec4f(p, 0.0, 1.0); o.ndc = p; return o; }
fn gridLine(c: vec2f) -> f32 { let d = fwidth(c); let g = abs(fract(c - 0.5) - 0.5) / max(d, vec2f(1e-6)); return 1.0 - min(min(g.x, g.y), 1.0); }
struct FO { @location(0) color: vec4f, @builtin(frag_depth) depth: f32 };
@fragment fn fs(v: VO) -> FO {
    let a = U.invViewProj * vec4f(v.ndc, select(-1.0, 0.0, U.zo.x > 0.5), 1.0); let b = U.invViewProj * vec4f(v.ndc, 1.0, 1.0);
    let p0 = a.xyz / a.w; let d = b.xyz / b.w - p0; let zUp = U.params.w > 0.5;
    let dn = select(d.y, d.z, zUp); let on = select(p0.y, p0.z, zUp);
    let t = -on / select(dn, 1e-9, abs(dn) < 1e-9);
    let p = p0 + d * t; let g = select(p.xz, p.xy, zUp);
    let fine = gridLine(g / U.params.x); let major = gridLine(g / (U.params.x * U.params.y));
    let w = fwidth(g); let ax = 1.0 - min(abs(g.y) / max(w.y, 1e-6), 1.0); let az = 1.0 - min(abs(g.x) / max(w.x, 1e-6), 1.0);
    let fade = exp(-0.693147 * length(p - U.eye.xyz) / U.params.z);
    var col = vec3f(0.55, 0.6, 0.7); var alpha = max(fine * 0.35, major * 0.7);
    col = mix(col, vec3f(0.94, 0.36, 0.36), ax); alpha = max(alpha, ax);
    col = mix(col, select(vec3f(0.36, 0.55, 1.0), vec3f(0.44, 0.83, 0.44), zUp), az); alpha = max(alpha, az);
    alpha = alpha * fade;
    if (abs(dn) < 1e-9 || t <= 0.0 || alpha < 0.004) { discard; }
    let q = U.viewProj * vec4f(p, 1.0); let z = q.z / q.w;
    var o: FO; o.color = vec4f(col, alpha); o.depth = select(z * 0.5 + 0.5, z, U.zo.x > 0.5); return o;
}`;

export function createGridGPU(device, format, { depthFormat = null } = {}) {
    const BU = globalThis.GPUBufferUsage, mod = device.createShaderModule({ code: GRID_WGSL }), ubuf = device.createBuffer({ size: 176, usage: BU.UNIFORM | BU.COPY_DST });
    const pipe = device.createRenderPipeline({ layout: "auto", vertex: { module: mod, entryPoint: "vs" }, fragment: { module: mod, entryPoint: "fs", targets: [{ format, blend: { color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" }, alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" } } }] }, primitive: { topology: "triangle-list" }, ...(depthFormat ? { depthStencil: { format: depthFormat, depthWriteEnabled: true, depthCompare: "less-equal" } } : {}) });
    const bg = device.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: ubuf } }] });
    return {
        encode(pass, { invViewProj, viewProj, eye, up = "y", cell = 1, major = 10, fade = 40, zRange = "zo" }) {
            const u = new Float32Array(44); u.set(invViewProj, 0); u.set(viewProj, 16); u.set([...eye, 0], 32); u.set([cell, major, fade, up === "z" ? 1 : 0], 36); u.set([zRange === "zo" ? 1 : 0, 0, 0, 0], 40);
            device.queue.writeBuffer(ubuf, 0, u); pass.setPipeline(pipe); pass.setBindGroup(0, bg); pass.draw(3);
        },
        destroy() { ubuf.destroy(); },
    };
}

/** The grid's alpha at pixel (x, y) (y down, pixel centres at + 0.5) computed on the CPU with the shader's sum, the screen derivative taken as the change to the next
 *  pixel (as a GPU's fwidth does over a 2 x 2 quad, to within that). Returns 0 where the shader discards. For a gate. */
export function gridAlphaCPU({ invViewProj, eye, up = "y", cell = 1, major = 10, fade = 40, zRange = "gl" }, x, y, width, height) {
    const T = (m, v) => [0, 1, 2, 3].map((r) => m[r] * v[0] + m[4 + r] * v[1] + m[8 + r] * v[2] + m[12 + r] * v[3]);
    const at = (px, py) => { const nx = (px / width) * 2 - 1, ny = 1 - (py / height) * 2, a = T(invViewProj, [nx, ny, zRange === "zo" ? 0 : -1, 1]), b = T(invViewProj, [nx, ny, 1, 1]);
        const p0 = [a[0] / a[3], a[1] / a[3], a[2] / a[3]], d = [b[0] / b[3] - p0[0], b[1] / b[3] - p0[1], b[2] / b[3] - p0[2]], k = up === "z" ? 2 : 1;
        if (Math.abs(d[k]) < 1e-9) return null; const t = -p0[k] / d[k]; if (t <= 0) return null; const p = p0.map((v, i) => v + d[i] * t); return { p, g: up === "z" ? [p[0], p[1]] : [p[0], p[2]] }; };
    const c = at(x + 0.5, y + 0.5), r = at(x + 1.5, y + 0.5), dn = at(x + 0.5, y + 1.5);
    if (!c || !r || !dn) return 0;
    const fw = [Math.abs(r.g[0] - c.g[0]) + Math.abs(dn.g[0] - c.g[0]), Math.abs(r.g[1] - c.g[1]) + Math.abs(dn.g[1] - c.g[1])];
    const line = (s) => { const g = [0, 1].map((i) => Math.abs(((c.g[i] / s - 0.5) % 1 + 1) % 1 - 0.5) / Math.max(fw[i] / s, 1e-6)); return 1 - Math.min(Math.min(g[0], g[1]), 1); };
    const ax = 1 - Math.min(Math.abs(c.g[1]) / Math.max(fw[1], 1e-6), 1), az = 1 - Math.min(Math.abs(c.g[0]) / Math.max(fw[0], 1e-6), 1);
    let alpha = Math.max(line(cell) * 0.35, line(cell * major) * 0.7, ax, az);
    alpha *= Math.exp(-0.693147 * Math.hypot(c.p[0] - eye[0], c.p[1] - eye[1], c.p[2] - eye[2]) / fade);
    return alpha < 0.004 ? 0 : alpha;
}
