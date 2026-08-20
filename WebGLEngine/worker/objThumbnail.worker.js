// FILE: worker/objThumbnail.worker.js
// VERSION: v1 — round 283
//
// Renders an animated turntable preview of an OBJ mesh to an
// OffscreenCanvas that was transferControlToOffscreen()'d from the
// main thread. One worker per thumbnail keeps the GL context isolated;
// the main thread sees a normal-looking <canvas> updating in place,
// but the actual drawing happens off-thread.
//
// Protocol:
//   main → worker: { type: "init", canvas, width, height }
//                  canvas is an OffscreenCanvas transferable
//   main → worker: { type: "mesh", objText }
//                  Parses + uploads buffers
//   main → worker: { type: "dispose" }
//                  Stops the render loop, deletes GL resources
//
// Falls back gracefully if the worker's GL context can't be created
// (some browsers/headless modes don't support webgl2 in workers) —
// posts back { type: "init_fail" } and the main-thread helper falls
// back to the old createObjPreview path.

let gl = null;
let canvas = null;
let program = null;
let vao = null;
let vbo = null;
let nbo = null;
let ebo = null;
let vertexCount = 0;
let triangleCount = 0;
let modelCenter = [0, 0, 0];
let modelRadius = 1;
let rafId = 0;
let angle = 0;
let lastTickMs = 0;

const VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
uniform mat4 uMVP;
uniform mat4 uModel;
out vec3 vNormal;
out vec3 vWorldPos;
void main() {
    gl_Position = uMVP * vec4(aPos, 1.0);
    vNormal     = mat3(uModel) * aNormal;
    vWorldPos   = (uModel * vec4(aPos, 1.0)).xyz;
}`;

const FS = `#version 300 es
precision highp float;
in vec3 vNormal;
in vec3 vWorldPos;
out vec4 outColor;
uniform vec3 uSunDir;
void main() {
    vec3 n = normalize(vNormal);
    float ndl = max(0.0, dot(n, normalize(uSunDir)));
    // Two-tone shading: rim highlight + diffuse
    vec3 base = vec3(0.65, 0.78, 0.92);
    vec3 col  = base * (0.25 + 0.75 * ndl);
    // Slight fresnel for depth
    float fres = pow(1.0 - max(0.0, n.z), 2.0);
    col += vec3(0.15, 0.25, 0.35) * fres * 0.4;
    outColor = vec4(col, 1.0);
}`;

function compile(src, type) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(sh);
        gl.deleteShader(sh);
        throw new Error("shader compile: " + log);
    }
    return sh;
}

function buildProgram() {
    const vs = compile(VS, gl.VERTEX_SHADER);
    const fs = compile(FS, gl.FRAGMENT_SHADER);
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        throw new Error("link: " + gl.getProgramInfoLog(prog));
    }
    return prog;
}

// Minimal OBJ parser — v + f only, fan-triangulates n-gons. Same logic
// as ai-bridge/objIO.js, duplicated here so the worker is self-contained.
function parseObj(text) {
    const positions = [];
    const indices   = [];
    const lines = text.split(/\r?\n/);
    for (const line of lines) {
        if (!line || line[0] === "#") continue;
        const c0 = line.charCodeAt(0);
        if (c0 === 118 && (line[1] === " " || line[1] === "\t")) {
            const parts = line.split(/\s+/);
            if (parts.length >= 4) positions.push(+parts[1], +parts[2], +parts[3]);
        } else if (c0 === 102 && (line[1] === " " || line[1] === "\t")) {
            const parts = line.trim().split(/\s+/);
            const verts = [];
            for (let i = 1; i < parts.length; i++) {
                const ref = parts[i];
                const slash = ref.indexOf("/");
                const idx = parseInt(slash >= 0 ? ref.slice(0, slash) : ref, 10);
                if (Number.isFinite(idx)) verts.push(idx - 1);
            }
            for (let i = 1; i < verts.length - 1; i++) {
                indices.push(verts[0], verts[i], verts[i + 1]);
            }
        }
    }
    return {
        positions: Float32Array.from(positions),
        indices:   Uint32Array.from(indices),
    };
}

function computeNormals(positions, indices) {
    const N = positions.length / 3;
    const normals = new Float32Array(positions.length);
    for (let i = 0; i < indices.length; i += 3) {
        const a = indices[i], b = indices[i + 1], c = indices[i + 2];
        const ax = positions[a*3], ay = positions[a*3+1], az = positions[a*3+2];
        const bx = positions[b*3], by = positions[b*3+1], bz = positions[b*3+2];
        const cx = positions[c*3], cy = positions[c*3+1], cz = positions[c*3+2];
        const e1x = bx-ax, e1y = by-ay, e1z = bz-az;
        const e2x = cx-ax, e2y = cy-ay, e2z = cz-az;
        const nx = e1y*e2z - e1z*e2y;
        const ny = e1z*e2x - e1x*e2z;
        const nz = e1x*e2y - e1y*e2x;
        normals[a*3]+=nx; normals[a*3+1]+=ny; normals[a*3+2]+=nz;
        normals[b*3]+=nx; normals[b*3+1]+=ny; normals[b*3+2]+=nz;
        normals[c*3]+=nx; normals[c*3+1]+=ny; normals[c*3+2]+=nz;
    }
    for (let i = 0; i < N; i++) {
        const x = normals[i*3], y = normals[i*3+1], z = normals[i*3+2];
        const len = Math.hypot(x, y, z) || 1;
        normals[i*3]   = x/len;
        normals[i*3+1] = y/len;
        normals[i*3+2] = z/len;
    }
    return normals;
}

function uploadMesh(positions, indices) {
    if (vbo) gl.deleteBuffer(vbo);
    if (nbo) gl.deleteBuffer(nbo);
    if (ebo) gl.deleteBuffer(ebo);
    if (vao) gl.deleteVertexArray(vao);
    const normals = computeNormals(positions, indices);
    // Center + radius for camera fitting
    let minX=Infinity, minY=Infinity, minZ=Infinity, maxX=-Infinity, maxY=-Infinity, maxZ=-Infinity;
    for (let i = 0; i < positions.length; i += 3) {
        if (positions[i] < minX) minX = positions[i];
        if (positions[i+1] < minY) minY = positions[i+1];
        if (positions[i+2] < minZ) minZ = positions[i+2];
        if (positions[i] > maxX) maxX = positions[i];
        if (positions[i+1] > maxY) maxY = positions[i+1];
        if (positions[i+2] > maxZ) maxZ = positions[i+2];
    }
    modelCenter = [(minX+maxX)/2, (minY+maxY)/2, (minZ+maxZ)/2];
    modelRadius = Math.hypot(maxX-minX, maxY-minY, maxZ-minZ) / 2 || 1;

    vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    nbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, nbo);
    gl.bufferData(gl.ARRAY_BUFFER, normals, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    ebo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    vertexCount   = positions.length / 3;
    triangleCount = indices.length / 3;
}

// Matrix helpers (row-major, used as gl.uniformMatrix4fv with transpose=false)
function mat4Identity() { return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]); }
function mat4Mul(a, b) {
    const out = new Float32Array(16);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
        let s = 0;
        for (let k = 0; k < 4; k++) s += a[r*4+k] * b[k*4+c];
        out[r*4+c] = s;
    }
    return out;
}
function mat4Perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2);
    const nf = 1 / (near - far);
    return new Float32Array([
        f/aspect, 0, 0, 0,
        0, f, 0, 0,
        0, 0, (far+near)*nf, 2*far*near*nf,
        0, 0, -1, 0,
    ]);
}
function mat4LookAt(eye, center, up) {
    const fx = center[0]-eye[0], fy = center[1]-eye[1], fz = center[2]-eye[2];
    let fl = Math.hypot(fx, fy, fz) || 1;
    const fxn = fx/fl, fyn = fy/fl, fzn = fz/fl;
    let sx = fyn*up[2] - fzn*up[1];
    let sy = fzn*up[0] - fxn*up[2];
    let sz = fxn*up[1] - fyn*up[0];
    const sl = Math.hypot(sx, sy, sz) || 1;
    sx /= sl; sy /= sl; sz /= sl;
    const ux = sy*fzn - sz*fyn;
    const uy = sz*fxn - sx*fzn;
    const uz = sx*fyn - sy*fxn;
    return new Float32Array([
        sx, sy, sz, -(sx*eye[0]+sy*eye[1]+sz*eye[2]),
        ux, uy, uz, -(ux*eye[0]+uy*eye[1]+uz*eye[2]),
        -fxn,-fyn,-fzn, fxn*eye[0]+fyn*eye[1]+fzn*eye[2],
        0, 0, 0, 1,
    ]);
}
function mat4RotateY(theta) {
    const c = Math.cos(theta), s = Math.sin(theta);
    return new Float32Array([
        c,0,s,0, 0,1,0,0, -s,0,c,0, 0,0,0,1,
    ]);
}
function mat4Translate(x, y, z) {
    return new Float32Array([1,0,0,x, 0,1,0,y, 0,0,1,z, 0,0,0,1]);
}

function render(now) {
    if (!gl || !canvas) return;
    const dt = (lastTickMs ? (now - lastTickMs) : 16) / 1000;
    lastTickMs = now;
    angle += dt * 0.6;     // ~10s per rotation

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.04, 0.04, 0.07, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.useProgram(program);

    if (vertexCount > 0) {
        const aspect = canvas.width / canvas.height;
        const eyeDist = modelRadius * 2.6;
        const proj   = mat4Perspective(Math.PI / 4, aspect, 0.1, modelRadius * 20);
        const view   = mat4LookAt(
            [modelCenter[0] + Math.cos(angle) * eyeDist,
             modelCenter[1] + modelRadius * 0.4,
             modelCenter[2] + Math.sin(angle) * eyeDist],
            modelCenter,
            [0, 1, 0]
        );
        const model = mat4Translate(-modelCenter[0], -modelCenter[1], -modelCenter[2]);
        const mvp   = mat4Mul(proj, mat4Mul(view, mat4Identity()));

        const locMvp   = gl.getUniformLocation(program, "uMVP");
        const locModel = gl.getUniformLocation(program, "uModel");
        const locSun   = gl.getUniformLocation(program, "uSunDir");
        gl.uniformMatrix4fv(locMvp,   true, mvp);
        gl.uniformMatrix4fv(locModel, true, mat4Identity());
        gl.uniform3f(locSun, 0.6, 0.9, 0.4);

        gl.bindVertexArray(vao);
        gl.drawElements(gl.TRIANGLES, vertexCount && triangleCount * 3, gl.UNSIGNED_INT, 0);
        gl.bindVertexArray(null);
    }

    rafId = requestAnimationFrame(render);
}

self.onmessage = (ev) => {
    const msg = ev.data;
    if (!msg || !msg.type) return;
    try {
        if (msg.type === "init") {
            canvas = msg.canvas;
            gl = canvas.getContext("webgl2", { antialias: true, alpha: false });
            if (!gl) {
                self.postMessage({ type: "init_fail", reason: "webgl2 unavailable in worker" });
                return;
            }
            program = buildProgram();
            self.postMessage({ type: "init_ok" });
            rafId = requestAnimationFrame(render);
        } else if (msg.type === "mesh") {
            const { positions, indices } = parseObj(msg.objText || "");
            if (positions.length === 0 || indices.length === 0) {
                self.postMessage({ type: "mesh_fail", reason: "empty mesh after parse" });
                return;
            }
            uploadMesh(positions, indices);
            self.postMessage({
                type: "mesh_ok",
                vertexCount, triangleCount,
                center: modelCenter, radius: modelRadius,
            });
        } else if (msg.type === "dispose") {
            if (rafId) cancelAnimationFrame(rafId);
            rafId = 0;
            // Workers don't have a way to truly free a GL context;
            // dropping references is what we have.
            gl = null;
            canvas = null;
        }
    } catch (e) {
        self.postMessage({ type: "error", message: e?.message ?? String(e) });
    }
};
