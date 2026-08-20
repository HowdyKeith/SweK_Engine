// fx/voxelize/voxelRender.js -- shared voxel-slab renderer for the content->voxels->filters series. Every filter
// (fire, water, blob, physics) produces the same per-voxel fields (px,py,pz,cr,cg,cb,alpha) on vg.voxels; this draws
// them, so each new filter is just a new update over the slab, never a new renderer. WebGL2 instanced cubes for the
// high-voxel-count path, Canvas2D projected quads as the universal fallback. mvp() is the standard-composition matrix
// verified in the fire round (origin centres, +x right, nearer voxels larger).
"use strict";

function mMul(a, b) { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; }
function mPersp(fovy, asp, n, f) { const t = 1 / Math.tan(fovy / 2), o = new Float32Array(16); o[0] = t / asp; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = 2 * f * n / (n - f); return o; }
function mRotY(a) { const c = Math.cos(a), s = Math.sin(a), o = new Float32Array(16); o[0] = c; o[2] = -s; o[5] = 1; o[8] = s; o[10] = c; o[15] = 1; return o; }
function mRotX(a) { const c = Math.cos(a), s = Math.sin(a), o = new Float32Array(16); o[0] = 1; o[5] = c; o[6] = s; o[9] = -s; o[10] = c; o[15] = 1; return o; }
function mTrans(x, y, z) { const o = new Float32Array(16); o[0] = o[5] = o[10] = o[15] = 1; o[12] = x; o[13] = y; o[14] = z; return o; }
function mvp(W, H, ry, rx, dist) { return mMul(mPersp(1.05, W / H, 0.1, 100), mMul(mTrans(0, 0, -(dist || 2.4)), mMul(mRotX(rx), mRotY(ry)))); }

function initVoxelGL(cv, getVG, getArgs) {
    const gl = cv.getContext("webgl2"); if (!gl) return null;
    const vs = `#version 300 es
    layout(location=0) in vec3 aPos; layout(location=1) in vec3 iOff; layout(location=2) in vec3 iCol; layout(location=3) in float iA;
    uniform mat4 uMVP; uniform float uVox; out vec3 vCol; out float vA; out float vShade;
    void main(){ vec3 p=aPos*uVox+iOff; gl_Position=uMVP*vec4(p,1.0); vCol=iCol; vA=iA; vShade=0.55+0.45*(aPos.z+0.5); }`;
    const fs = `#version 300 es
    precision highp float; in vec3 vCol; in float vA; in float vShade; out vec4 o;
    void main(){ if(vA<0.02) discard; o=vec4(vCol*vShade, vA); }`;
    const sh = (t, src) => { const o = gl.createShader(t); gl.shaderSource(o, src); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw gl.getShaderInfoLog(o); return o; };
    const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw gl.getProgramInfoLog(pr);
    const cube = new Float32Array([-.5, -.5, -.5, .5, -.5, -.5, .5, .5, -.5, -.5, .5, -.5, -.5, -.5, .5, .5, -.5, .5, .5, .5, .5, -.5, .5, .5]);
    const idx = new Uint16Array([0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 3, 2, 6, 3, 6, 7, 1, 5, 6, 1, 6, 2, 0, 3, 7, 0, 7, 4]);
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, cube, gl.STATIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    const inst = gl.createBuffer(); const stride = 7 * 4; gl.bindBuffer(gl.ARRAY_BUFFER, inst);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 0); gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 12); gl.vertexAttribDivisor(2, 1);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 24); gl.vertexAttribDivisor(3, 1);
    gl.enable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    const uMVP = gl.getUniformLocation(pr, "uMVP"), uVox = gl.getUniformLocation(pr, "uVox"); let data = new Float32Array(0);
    return { draw() {
        const vg = getVG(), a = getArgs(); gl.viewport(0, 0, a.W, a.H); gl.clearColor(0.02, 0.02, 0.03, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        const N = vg.voxels.length; if (data.length < N * 7) data = new Float32Array(N * 7);
        let m = 0; for (const v of vg.voxels) { if (v.alpha <= 0.02) continue; const o = m * 7; data[o] = v.px; data[o + 1] = -v.py; data[o + 2] = v.pz; data[o + 3] = v.cr; data[o + 4] = v.cg; data[o + 5] = v.cb; data[o + 6] = v.alpha; m++; }
        gl.useProgram(pr); gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, inst); gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, m * 7), gl.DYNAMIC_DRAW);
        gl.uniformMatrix4fv(uMVP, false, mvp(a.W, a.H, a.ry, a.rx, a.dist)); gl.uniform1f(uVox, 0.92 / vg.ny);
        gl.drawElementsInstanced(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0, m); return m;
    } };
}
function initVoxelCanvas(cv, getVG, getArgs) {
    const ctx = cv.getContext("2d");
    return { draw() {
        const vg = getVG(), a = getArgs(); ctx.fillStyle = "#03060b"; ctx.fillRect(0, 0, a.W, a.H);
        const cy = Math.cos(a.ry), sy = Math.sin(a.ry), cx = Math.cos(a.rx), sx = Math.sin(a.rx), sc = Math.min(a.W, a.H) * 0.42, ox = a.W / 2, oy = a.H / 2, vox = Math.max(2, sc * 0.92 / vg.ny), dist = a.dist || 2.4;
        const pts = []; for (const v of vg.voxels) { if (v.alpha <= 0.02) continue; let X = v.px * cy + v.pz * sy, Z = -v.px * sy + v.pz * cy, Y = (-v.py) * cx - Z * sx, Z2 = (-v.py) * sx + Z * cx; const pp = dist / (dist - Z2); pts.push({ x: ox + X * sc * pp, y: oy - Y * sc * pp, z: Z2, v, s: vox * pp }); }
        pts.sort((p, q) => p.z - q.z);
        for (const p of pts) { ctx.globalAlpha = p.v.alpha; ctx.fillStyle = "rgb(" + (p.v.cr * 255 | 0) + "," + (p.v.cg * 255 | 0) + "," + (p.v.cb * 255 | 0) + ")"; ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s); }
        ctx.globalAlpha = 1; return pts.length;
    } };
}
export { initVoxelGL, initVoxelCanvas, mvp };
