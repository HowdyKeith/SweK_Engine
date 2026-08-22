// demos_code/texture_studio.js — AI texture generation with 3D preview.
//
// Generates square seamless textures via OllamaDiffuser and previews
// them on a rotating 3D mesh (sphere/cube/flat plane) so you can see
// how they'll wrap before saving. Round 150 — auto-derives a
// heightmap alongside each color texture and previews with parallax
// occlusion mapping live on the 3D mesh. Optionally generates an
// AI heightmap via a separate diffuser call.
//
// Pipeline:
//   1. User picks a prompt template (or types custom) + a mesh shape
//   2. Generate color via OllamaDiffuser (512x512, 4 steps)
//   3. Derive heightmap (luminance method by default; AI mode triggers
//      a second diffuser call with a heightmap-specific prompt)
//   4. Display thumbnail pair in gallery
//   5. Apply both to preview mesh with POM shader — depth illusion live
//   6. Download saves color.png and height.png as a pair
//
// VBA-side counterpart: modTextureGen.bas v1.2 has the same heightmap
// derivation (inline GDI+ luminance pass) so the two runtimes produce
// matching color+height pairs from the same prompt.

import { OllamaDiffuserClient } from "../ai/OllamaDiffuserClient.js";
import { deriveFromLuminance, generateViaDiffuser, heightmapPromptFor } from "../ai/HeightmapDeriver.js";

const TEXTURE_SIZE = 512;
const PREVIEW_PX   = 240;
const STEPS        = 4;

const PROMPT_LIBRARY = [
    { name: "Alien Skin (Red)",   prompt: "seamless texture, alien reptile skin, dark red scales, organic, photorealistic, square tile, no logos no text" },
    { name: "Alien Skin (Green)", prompt: "seamless texture, alien organic membrane, dark green veins, wet glossy, square tile, no logos no text" },
    { name: "Metal Hull (Scuffed)", prompt: "seamless texture, scuffed metal hull plating, rivets, weathered sci-fi, square tile, no logos no text" },
    { name: "Volcanic Rock",      prompt: "seamless texture, volcanic rock with lava cracks, glowing orange seams, square tile, no logos no text" },
    { name: "Crystalline Ice",    prompt: "seamless texture, fractured crystalline ice, blue glow, fractal patterns, square tile, no logos no text" },
    { name: "Tech Circuit",       prompt: "seamless texture, alien tech circuit board, glowing cyan traces, sci-fi, square tile, no logos no text" },
    { name: "Organic Tissue",     prompt: "seamless texture, alien organic tissue, pulsing veins, biological, dark red, square tile, no logos no text" },
    { name: "Ancient Stone",      prompt: "seamless texture, ancient weathered stone wall, alien hieroglyphs, gray, square tile, no logos no text" },
    { name: "Bone / Chitin",      prompt: "seamless texture, alien bone chitin armor, ivory, ridged, organic, square tile, no logos no text" },
    { name: "Plasma Surface",     prompt: "seamless texture, plasma energy surface, swirling purple white, glowing, square tile, no logos no text" },
];

const SHAPES = ["sphere", "cube", "flat"];

// ---- module state ---------------------------------------------------
let client = null;
let overlay = null;
let panel = null;
let previewCanvas = null;
let previewGL = null;
let previewProgram = null;
let previewBuffers = null;
let previewTexture = null;
let previewHeightTex = null;     // round 150 — heightmap texture
let previewDummyTex = null;
let previewDummyHeight = null;   // 0.5 grayscale dummy
let promptInput = null;
let gallery = [];   // { dataUrl, prompt, image, heightDataUrl, heightImage, heightSource }
let galleryIdx = -1;
let busy = false;
let busyDetail = "";
let message = "";
let messageColor = "#9fd";
let currentShape = "sphere";
let rotateAngle = 0;
let animRAF = null;
let ctxRef = null;
let usePOM = true;                // round 150 — POM preview on by default
let heightScale = 0.06;
let useAIHeightmap = false;       // round 150 — toggle for diffuser-generated heightmaps

// ---- preview mesh data ----------------------------------------------
function buildSphere(segments = 32, rings = 24) {
    const positions = [], uvs = [], normals = [], indices = [];
    const tangents = [], bitangents = [];
    for (let r = 0; r <= rings; r++) {
        const phi = (r / rings) * Math.PI;
        const y = Math.cos(phi);
        const rad = Math.sin(phi);
        for (let s = 0; s <= segments; s++) {
            const theta = (s / segments) * Math.PI * 2;
            const x = Math.sin(theta) * rad;
            const z = Math.cos(theta) * rad;
            positions.push(x, y, z);
            normals.push(x, y, z);
            uvs.push(s / segments, r / rings);
            // Tangent = dPos/dtheta (around the sphere), bitangent = dPos/dphi
            tangents.push(Math.cos(theta), 0, -Math.sin(theta));
            bitangents.push(
                Math.sin(theta) * Math.cos(phi),
                -Math.sin(phi),
                Math.cos(theta) * Math.cos(phi)
            );
        }
    }
    const cols = segments + 1;
    for (let r = 0; r < rings; r++) {
        for (let s = 0; s < segments; s++) {
            const a = r * cols + s;
            const b = a + cols;
            indices.push(a, b, a + 1, a + 1, b, b + 1);
        }
    }
    return { positions, uvs, normals, indices, tangents, bitangents };
}

function buildCube() {
    // 6 faces × 4 verts each. Tangent/bitangent in each face's plane.
    const positions = [], uvs = [], normals = [], indices = [];
    const tangents = [], bitangents = [];
    const faces = [
        { n:[ 1, 0, 0], t:[ 0, 0,-1], b:[ 0, 1, 0], v:[[ 1,-1, 1],[ 1, 1, 1],[ 1, 1,-1],[ 1,-1,-1]] },
        { n:[-1, 0, 0], t:[ 0, 0, 1], b:[ 0, 1, 0], v:[[-1,-1,-1],[-1, 1,-1],[-1, 1, 1],[-1,-1, 1]] },
        { n:[ 0, 1, 0], t:[ 1, 0, 0], b:[ 0, 0,-1], v:[[-1, 1, 1],[ 1, 1, 1],[ 1, 1,-1],[-1, 1,-1]] },
        { n:[ 0,-1, 0], t:[ 1, 0, 0], b:[ 0, 0, 1], v:[[-1,-1,-1],[ 1,-1,-1],[ 1,-1, 1],[-1,-1, 1]] },
        { n:[ 0, 0, 1], t:[ 1, 0, 0], b:[ 0, 1, 0], v:[[-1,-1, 1],[ 1,-1, 1],[ 1, 1, 1],[-1, 1, 1]] },
        { n:[ 0, 0,-1], t:[-1, 0, 0], b:[ 0, 1, 0], v:[[ 1,-1,-1],[-1,-1,-1],[-1, 1,-1],[ 1, 1,-1]] },
    ];
    for (const f of faces) {
        const base = positions.length / 3;
        for (let i = 0; i < 4; i++) {
            positions.push(...f.v[i]);
            normals.push(...f.n);
            tangents.push(...f.t);
            bitangents.push(...f.b);
            uvs.push(i === 0 ? 0 : i === 1 ? 1 : i === 2 ? 1 : 0,
                     i === 0 ? 0 : i === 1 ? 0 : i === 2 ? 1 : 1);
        }
        indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    return { positions, uvs, normals, indices, tangents, bitangents };
}

function buildFlat() {
    return {
        positions: [-1,-1,0, 1,-1,0, 1,1,0, -1,1,0],
        uvs:       [0,0, 3,0, 3,3, 0,3],     // 3× tiling
        normals:   [0,0,1, 0,0,1, 0,0,1, 0,0,1],
        tangents:  [1,0,0, 1,0,0, 1,0,0, 1,0,0],
        bitangents:[0,1,0, 0,1,0, 0,1,0, 0,1,0],
        indices:   [0, 1, 2, 0, 2, 3],
    };
}

// ---- preview WebGL2 setup ------------------------------------------
// Round 150 — POM-capable shader. Vertex outputs view direction in
// tangent space; fragment optionally does parallax occlusion mapping
// using a heightmap derived from the color texture.
const VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUV;
layout(location=2) in vec3 aNormal;
layout(location=3) in vec3 aTangent;
layout(location=4) in vec3 aBitangent;
uniform mat4 uMVP;
uniform mat4 uModel;
uniform vec3 uCamPos;
out vec2 vUV;
out vec3 vNormal;
out vec3 vViewTS;
void main() {
    vec4 wp = uModel * vec4(aPos, 1.0);
    vUV = aUV;
    mat3 m3 = mat3(uModel);
    vec3 T = normalize(m3 * aTangent);
    vec3 B = normalize(m3 * aBitangent);
    vec3 N = normalize(m3 * aNormal);
    vNormal = N;
    mat3 invTBN = transpose(mat3(T, B, N));
    vec3 viewWS = normalize(uCamPos - wp.xyz);
    vViewTS = invTBN * viewWS;
    gl_Position = uMVP * vec4(aPos, 1.0);
}`;

const FS = `#version 300 es
precision highp float;
in vec2 vUV;
in vec3 vNormal;
in vec3 vViewTS;
out vec4 outColor;
uniform sampler2D uTex;
uniform sampler2D uHeight;
uniform vec3 uLightDir;
uniform int uUsePOM;
uniform float uHeightScale;

vec2 parallaxOcclusion(vec2 uv, vec3 viewTS) {
    const int LINEAR_STEPS = 16;
    float vz = max(viewTS.z, 0.1);
    float layerDepth = 1.0 / float(LINEAR_STEPS);
    vec2 deltaUV = (viewTS.xy / vz) * uHeightScale * layerDepth;
    vec2 curUV = uv;
    float curLayerDepth = 0.0;
    float curSample = 1.0 - texture(uHeight, curUV).r;
    for (int i = 0; i < LINEAR_STEPS; i++) {
        if (curLayerDepth >= curSample) break;
        curUV -= deltaUV;
        curSample = 1.0 - texture(uHeight, curUV).r;
        curLayerDepth += layerDepth;
    }
    vec2 prevUV = curUV + deltaUV;
    float depthAfter = curSample - curLayerDepth;
    float depthBefore = (1.0 - texture(uHeight, prevUV).r) - (curLayerDepth - layerDepth);
    float weight = depthAfter / max(depthAfter - depthBefore, 0.001);
    return mix(curUV, prevUV, weight);
}

void main() {
    vec3 viewTS = normalize(vViewTS);
    vec2 finalUV = vUV;
    if (uUsePOM == 1) {
        finalUV = parallaxOcclusion(vUV, viewTS);
        if (finalUV.x < 0.0 || finalUV.x > 1.0 ||
            finalUV.y < 0.0 || finalUV.y > 1.0) discard;
    }
    vec3 N = normalize(vNormal);
    float lambert = max(0.0, dot(N, normalize(uLightDir)));
    float ambient = 0.35;
    vec3 baseCol = texture(uTex, finalUV).rgb;
    // Height-driven AO so recessed areas read distinctly
    float h = texture(uHeight, finalUV).r;
    float ao = mix(0.65, 1.0, h);
    vec3 lit = baseCol * (ambient + lambert * 0.85) * ao;
    outColor = vec4(lit, 1.0);
}`;

function compile(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.error("[texture_studio]", gl.getShaderInfoLog(sh));
    }
    return sh;
}

function initPreviewGL() {
    const gl = previewCanvas.getContext("webgl2", { antialias: true, depth: true });
    if (!gl) {
        console.warn("[texture_studio] WebGL2 unavailable for preview");
        return false;
    }
    previewGL = gl;
    const vs = compile(gl, gl.VERTEX_SHADER, VS);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FS);
    previewProgram = gl.createProgram();
    gl.attachShader(previewProgram, vs);
    gl.attachShader(previewProgram, fs);
    gl.linkProgram(previewProgram);
    if (!gl.getProgramParameter(previewProgram, gl.LINK_STATUS)) {
        console.error("[texture_studio] link:", gl.getProgramInfoLog(previewProgram));
        return false;
    }
    // Uniforms
    previewProgram.uMVP = gl.getUniformLocation(previewProgram, "uMVP");
    previewProgram.uModel = gl.getUniformLocation(previewProgram, "uModel");
    previewProgram.uCamPos = gl.getUniformLocation(previewProgram, "uCamPos");
    previewProgram.uTex = gl.getUniformLocation(previewProgram, "uTex");
    previewProgram.uHeight = gl.getUniformLocation(previewProgram, "uHeight");
    previewProgram.uLightDir = gl.getUniformLocation(previewProgram, "uLightDir");
    previewProgram.uUsePOM = gl.getUniformLocation(previewProgram, "uUsePOM");
    previewProgram.uHeightScale = gl.getUniformLocation(previewProgram, "uHeightScale");

    // Dummy color texture (1x1 light gray)
    previewDummyTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, previewDummyTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
                  new Uint8Array([180, 180, 200, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    // Dummy heightmap (1x1, 0.5 = flat surface, no parallax shift)
    previewDummyHeight = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, previewDummyHeight);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
                  new Uint8Array([128, 128, 128, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    rebuildMesh(currentShape);
    return true;
}

function rebuildMesh(shape) {
    if (!previewGL) return;
    const gl = previewGL;
    const data = shape === "cube"  ? buildCube()
              : shape === "flat"   ? buildFlat()
                                   : buildSphere();
    // Cleanup previous buffers
    if (previewBuffers) {
        for (const k of ["pos", "uv", "norm", "tan", "bit", "idx"]) {
            if (previewBuffers[k]) gl.deleteBuffer(previewBuffers[k]);
        }
        if (previewBuffers.vao) gl.deleteVertexArray(previewBuffers.vao);
    }
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    function attrib(loc, arr, size) {
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
        return buf;
    }
    const pos  = attrib(0, data.positions,  3);
    const uv   = attrib(1, data.uvs,        2);
    const norm = attrib(2, data.normals,    3);
    const tan  = attrib(3, data.tangents,   3);
    const bit  = attrib(4, data.bitangents, 3);
    const idx = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idx);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(data.indices), gl.STATIC_DRAW);
    previewBuffers = { vao, pos, uv, norm, tan, bit, idx, count: data.indices.length };
}

// 4x4 matrix helpers — column-major
function mat4Identity() { return [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]; }
function mat4Perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2);
    const nf = 1 / (near - far);
    return [
        f / aspect, 0, 0, 0,
        0, f, 0, 0,
        0, 0, (far + near) * nf, -1,
        0, 0, 2 * far * near * nf, 0,
    ];
}
function mat4LookAt(ex, ey, ez, cx, cy, cz) {
    const zx = ex - cx, zy = ey - cy, zz = ez - cz;
    let zl = Math.hypot(zx, zy, zz); if (zl < 1e-6) zl = 1;
    const Zx = zx / zl, Zy = zy / zl, Zz = zz / zl;
    const upX = 0, upY = 1, upZ = 0;
    const Xx = upY * Zz - upZ * Zy;
    const Xy = upZ * Zx - upX * Zz;
    const Xz = upX * Zy - upY * Zx;
    let xl = Math.hypot(Xx, Xy, Xz); if (xl < 1e-6) xl = 1;
    const Xn = [Xx / xl, Xy / xl, Xz / xl];
    const Yn = [Zy * Xn[2] - Zz * Xn[1], Zz * Xn[0] - Zx * Xn[2], Zx * Xn[1] - Zy * Xn[0]];
    return [
        Xn[0], Yn[0], Zx, 0,
        Xn[1], Yn[1], Zy, 0,
        Xn[2], Yn[2], Zz, 0,
        -(Xn[0]*ex + Xn[1]*ey + Xn[2]*ez),
        -(Yn[0]*ex + Yn[1]*ey + Yn[2]*ez),
        -(Zx*ex + Zy*ey + Zz*ez), 1,
    ];
}
function mat4RotY(a) {
    const c = Math.cos(a), s = Math.sin(a);
    return [c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1];
}
function mat4Mul(a, b) {
    const r = new Array(16);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        r[j*4+i] = a[0*4+i]*b[j*4+0] + a[1*4+i]*b[j*4+1] + a[2*4+i]*b[j*4+2] + a[3*4+i]*b[j*4+3];
    }
    return r;
}

function drawPreview() {
    if (!previewGL || !previewBuffers) return;
    const gl = previewGL;
    gl.viewport(0, 0, PREVIEW_PX, PREVIEW_PX);
    gl.clearColor(0.04, 0.05, 0.08, 1.0);
    gl.enable(gl.DEPTH_TEST);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.useProgram(previewProgram);
    const proj = mat4Perspective(Math.PI / 4, 1, 0.1, 20);
    const eyeX = 0, eyeY = 1.2, eyeZ = 3.2;
    const view = mat4LookAt(eyeX, eyeY, eyeZ, 0, 0, 0);
    const model = mat4RotY(rotateAngle);
    const mv = mat4Mul(view, model);
    const mvp = mat4Mul(proj, mv);
    gl.uniformMatrix4fv(previewProgram.uMVP, false, mvp);
    gl.uniformMatrix4fv(previewProgram.uModel, false, model);
    gl.uniform3f(previewProgram.uCamPos, eyeX, eyeY, eyeZ);
    gl.uniform1i(previewProgram.uTex, 0);
    gl.uniform1i(previewProgram.uHeight, 1);
    gl.uniform3f(previewProgram.uLightDir, 0.4, 0.7, 0.6);
    gl.uniform1i(previewProgram.uUsePOM, (usePOM && previewHeightTex) ? 1 : 0);
    gl.uniform1f(previewProgram.uHeightScale, heightScale);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, previewTexture || previewDummyTex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, previewHeightTex || previewDummyHeight);
    gl.bindVertexArray(previewBuffers.vao);
    gl.drawElements(gl.TRIANGLES, previewBuffers.count, gl.UNSIGNED_SHORT, 0);
}

function animate() {
    rotateAngle += 0.012;
    drawPreview();
    animRAF = requestAnimationFrame(animate);
}

// ---- image / texture handling --------------------------------------
function applyTexture(img) {
    if (!previewGL) return;
    const gl = previewGL;
    if (previewTexture) gl.deleteTexture(previewTexture);
    previewTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, previewTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.generateMipmap(gl.TEXTURE_2D);
}

// Round 150 — upload heightmap (or canvas) as second texture.
function applyHeightmap(img) {
    if (!previewGL) return;
    const gl = previewGL;
    if (previewHeightTex) gl.deleteTexture(previewHeightTex);
    previewHeightTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, previewHeightTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
}

async function doGenerate(prompt) {
    if (busy) return;
    if (!client) {
        message = "client not initialized";
        messageColor = "#f99";
        renderUI();
        return;
    }
    busy = true;
    busyDetail = "color";
    message = "generating color…";
    messageColor = "#fc4";
    renderUI();

    // 1. Generate color texture
    const res = await client.generate(prompt, {
        width:  TEXTURE_SIZE,
        height: TEXTURE_SIZE,
        steps:  STEPS,
    });
    if (!res.ok) {
        busy = false; busyDetail = "";
        message = "error: " + res.error;
        messageColor = "#f99";
        renderUI();
        return;
    }
    const img = await new Promise((resolve) => {
        const im = new Image();
        im.onload  = () => resolve(im);
        im.onerror = () => resolve(null);
        im.src = res.dataUrl;
    });
    if (!img) {
        busy = false; busyDetail = "";
        message = "decode failed";
        messageColor = "#f99";
        renderUI();
        return;
    }

    // 2. Derive heightmap. Luminance-derived by default — fast and
    // reliable. If useAIHeightmap is on, fire a second diffuser call.
    let heightImage = null;
    let heightDataUrl = null;
    let heightSource = "luminance";
    let heightDuration = 0;

    if (useAIHeightmap) {
        busyDetail = "AI heightmap";
        message = "generating AI heightmap…";
        renderUI();
        const t0 = performance.now();
        const heightRes = await generateViaDiffuser(client, prompt, {
            width:  TEXTURE_SIZE,
            height: TEXTURE_SIZE,
            steps:  STEPS,
        });
        if (heightRes.ok) {
            const hImg = await new Promise((resolve) => {
                const im = new Image();
                im.onload  = () => resolve(im);
                im.onerror = () => resolve(null);
                im.src = heightRes.dataUrl;
            });
            if (hImg) {
                // Pass diffuser output through luminance derivation to
                // normalize whatever color/contrast it returned into a
                // proper grayscale heightmap.
                const heightCanvas = deriveFromLuminance(hImg, {
                    contrast: 1.4,
                    centerLuma: 128,
                });
                heightImage = heightCanvas;
                heightDataUrl = heightCanvas.toDataURL("image/png");
                heightSource = "diffuser+luma";
                heightDuration = performance.now() - t0;
            }
        }
        if (!heightImage) {
            // Diffuser path failed — fall back to luminance
            console.warn("[texture_studio] AI heightmap failed, falling back to luminance");
        }
    }

    if (!heightImage) {
        // Luminance derivation from the color image — sync, fast
        const heightCanvas = deriveFromLuminance(img, {
            contrast: 1.6,
            centerLuma: 96,
        });
        heightImage = heightCanvas;
        heightDataUrl = heightCanvas.toDataURL("image/png");
    }

    busy = false;
    busyDetail = "";

    gallery.unshift({
        dataUrl: res.dataUrl,
        prompt,
        image: img,
        heightDataUrl,
        heightImage,
        heightSource,
    });
    if (gallery.length > 8) gallery.length = 8;
    galleryIdx = 0;
    applyTexture(img);
    applyHeightmap(heightImage);
    const heightTag = heightSource === "luminance"
        ? "+ heightmap (luminance)"
        : `+ heightmap (${heightSource}, ${(heightDuration / 1000).toFixed(1)}s)`;
    message = `color ${(res.duration_ms / 1000).toFixed(1)}s ${heightTag}`;
    messageColor = "#0fa";
    renderUI();
}

function downloadCurrent() {
    const cur = gallery[galleryIdx];
    if (!cur) return;
    const base = "texture_" + cur.prompt.slice(0, 24).replace(/[^a-z0-9]+/gi, "_").replace(/_+$/, "");
    // Color
    const a1 = document.createElement("a");
    a1.href = cur.dataUrl; a1.download = base + "_color.png";
    document.body.appendChild(a1); a1.click(); a1.remove();
    // Heightmap (if present, delayed slightly so browser handles both)
    if (cur.heightDataUrl) {
        setTimeout(() => {
            const a2 = document.createElement("a");
            a2.href = cur.heightDataUrl; a2.download = base + "_height.png";
            document.body.appendChild(a2); a2.click(); a2.remove();
        }, 150);
        message = "saved " + base + "_color.png + _height.png";
    } else {
        message = "saved " + base + "_color.png";
    }
    messageColor = "#9fd";
    renderUI();
}

// ---- UI ------------------------------------------------------------
function renderUI() {
    if (!panel) return;
    const cur = gallery[galleryIdx];
    const stats = client ? client.stats() : {};
    const status = busy
        ? `<span style="color:#fc4">generating…</span>`
        : (message ? `<span style="color:${messageColor}">${message}</span>` : `<span style="opacity:0.6">ready</span>`);

    const libraryOpts = PROMPT_LIBRARY.map((p, i) =>
        `<option value="${i}">${p.name}</option>`).join("");

    // Round 150 — each gallery entry shows color thumbnail with a tiny
    // heightmap thumbnail tucked in the corner (mini-map style).
    const thumbs = gallery.map((g, i) => {
        const sel = (i === galleryIdx) ? "outline:2px solid #fd0;" : "outline:1px solid #333;";
        const heightPin = g.heightDataUrl
            ? `<img src="${g.heightDataUrl}" style="position:absolute;right:0;bottom:0;width:18px;height:18px;border:1px solid #000;border-radius:1px;pointer-events:none"/>`
            : "";
        return `<div data-idx="${i}" class="ts_thumb"
                     style="position:relative;width:46px;height:46px;cursor:pointer;${sel};border-radius:2px;margin-right:3px;margin-bottom:3px;overflow:hidden;display:inline-block">
                  <img src="${g.dataUrl}" style="width:46px;height:46px;object-fit:cover;display:block"/>
                  ${heightPin}
                </div>`;
    }).join("");

    panel.innerHTML = `
        <div style="color:#fd0;font-weight:bold;font-size:13px;letter-spacing:1px;margin-bottom:6px">
            🎨 TEXTURE STUDIO
        </div>
        <div style="font-size:11px;color:#9fd;line-height:1.5">
            Diffuser: <b>${client?.available === true ? "ok" : client?.available === false ? "offline" : "..."}</b> ·
            ${stats.totalCalls ?? 0} gens · avg ${stats.avgDurationMs ?? 0}ms
        </div>
        <div style="margin-top:6px">
            <select class="ts_library" style="width:100%;background:#000;color:#9fd;border:1px solid #2a4;padding:3px 4px;font:10px monospace;border-radius:3px;pointer-events:auto">
                <option value="-1">— prompt library —</option>
                ${libraryOpts}
            </select>
        </div>
        <div style="margin-top:4px">
            <input type="text" class="ts_prompt"
                   value="${(promptInput?.value ?? PROMPT_LIBRARY[0].prompt).replace(/"/g, '&quot;')}"
                   placeholder="prompt"
                   style="width:100%;background:#000;color:#9fd;border:1px solid #2a4;padding:4px 6px;font:10px monospace;border-radius:3px;box-sizing:border-box;pointer-events:auto"/>
        </div>
        <div style="margin-top:5px;display:flex;gap:3px">
            <button class="ts_gen"   style="flex:2;background:#062;color:#0fa;border:1px solid #0a6;padding:4px;font:10px monospace;cursor:pointer;pointer-events:auto;border-radius:3px">GENERATE</button>
            <button class="ts_dl"    style="flex:1;background:#222;color:#9fd;border:1px solid #444;padding:4px;font:10px monospace;cursor:pointer;pointer-events:auto;border-radius:3px">SAVE BOTH</button>
        </div>
        <div style="margin-top:5px;font-size:10px;color:#9fd;display:flex;gap:8px;align-items:center">
            <label style="display:flex;align-items:center;gap:4px;cursor:pointer">
                <input type="checkbox" class="ts_aiheight" ${useAIHeightmap ? "checked" : ""}
                       style="pointer-events:auto"/>
                AI heightmap <span style="opacity:0.6">(2× slower)</span>
            </label>
            <label style="display:flex;align-items:center;gap:4px;margin-left:auto;cursor:pointer">
                <input type="checkbox" class="ts_pom" ${usePOM ? "checked" : ""}
                       style="pointer-events:auto"/>
                POM preview
            </label>
        </div>
        <div style="margin-top:6px">${thumbs || '<span style="opacity:0.5;font-size:10px">no textures yet</span>'}</div>
        <div style="margin-top:4px">
            <canvas class="ts_preview" width="${PREVIEW_PX}" height="${PREVIEW_PX}"
                    style="width:${PREVIEW_PX}px;height:${PREVIEW_PX}px;display:block;border:1px solid #333;background:#000;border-radius:3px"></canvas>
        </div>
        <div style="margin-top:4px;display:flex;gap:3px">
            ${SHAPES.map(s => {
                const sel = s === currentShape ? "background:#444;color:#fd0;border-color:#fd0" : "background:#222;color:#9fd;border-color:#444";
                return `<button class="ts_shape" data-shape="${s}" style="flex:1;${sel};border:1px solid;padding:3px;font:10px monospace;cursor:pointer;pointer-events:auto;border-radius:3px">${s.toUpperCase()}</button>`;
            }).join("")}
        </div>
        <div style="margin-top:5px;font-size:10px;color:#9fd;display:flex;gap:6px;align-items:center">
            <span>Height scale</span>
            <input type="range" class="ts_hscale" min="0" max="200" value="${Math.round(heightScale * 1000)}"
                   style="flex:1;pointer-events:auto"/>
            <span class="ts_hscaleVal" style="color:#fd0;min-width:40px;text-align:right">${heightScale.toFixed(3)}</span>
        </div>
        <div style="margin-top:5px;font-size:10px">${status}</div>
        ${cur ? `<div style="margin-top:4px;font-size:9px;opacity:0.6;line-height:1.3;max-height:24px;overflow:hidden">${cur.prompt}${cur.heightSource ? ' · height: ' + cur.heightSource : ''}</div>` : ""}`;

    // Reattach refs + wire events
    const newCanvas = panel.querySelector(".ts_preview");
    if (newCanvas && newCanvas !== previewCanvas) {
        // Canvas was rebuilt — re-init GL context
        previewCanvas = newCanvas;
        if (animRAF) cancelAnimationFrame(animRAF);
        const ok = initPreviewGL();
        if (ok && gallery[galleryIdx]?.image) applyTexture(gallery[galleryIdx].image);
        if (ok && gallery[galleryIdx]?.heightImage) applyHeightmap(gallery[galleryIdx].heightImage);
        animate();
    }
    promptInput = panel.querySelector(".ts_prompt");
    panel.querySelector(".ts_gen").onclick = () => doGenerate(promptInput.value);
    panel.querySelector(".ts_dl").onclick = downloadCurrent;
    panel.querySelector(".ts_aiheight").onchange = (ev) => { useAIHeightmap = ev.target.checked; };
    panel.querySelector(".ts_pom").onchange = (ev) => { usePOM = ev.target.checked; };
    const hslider = panel.querySelector(".ts_hscale");
    const hlabel = panel.querySelector(".ts_hscaleVal");
    hslider.oninput = (ev) => {
        heightScale = parseInt(ev.target.value, 10) / 1000;
        hlabel.textContent = heightScale.toFixed(3);
    };
    panel.querySelector(".ts_library").onchange = (ev) => {
        const i = parseInt(ev.target.value, 10);
        if (i >= 0 && PROMPT_LIBRARY[i]) {
            promptInput.value = PROMPT_LIBRARY[i].prompt;
            ev.target.value = "-1";
        }
    };
    for (const t of panel.querySelectorAll(".ts_thumb")) {
        t.onclick = () => {
            galleryIdx = parseInt(t.dataset.idx, 10);
            const g = gallery[galleryIdx];
            if (g?.image) applyTexture(g.image);
            if (g?.heightImage) applyHeightmap(g.heightImage);
            renderUI();
        };
    }
    for (const b of panel.querySelectorAll(".ts_shape")) {
        b.onclick = () => {
            currentShape = b.dataset.shape;
            rebuildMesh(currentShape);
            renderUI();
        };
    }
}

// ---- lifecycle ------------------------------------------------------
export default {
    id:    "texture_studio",
    label: "TEXTURE STUDIO (OLLAMADIFFUSER)",
    hint:  "Generate seamless textures with Z-Image-Turbo, preview on 3D mesh, save for VBA engine",
    controls: [
        "Pick a prompt template or write custom; click GENERATE",
        "Preview rotates the texture on sphere/cube/flat plane",
        "SAVE downloads PNG; load it in VBA via modTextureGen.LoadGeneratedTexture(path)",
    ],

    async start(ctx) {
        ctxRef = ctx;
        // Round 159 — prefer the shared singleton so the user's
        // per-task texture model choice (set in the AI MODELS panel)
        // is honored. Fall back to a fresh client if no singleton.
        client = window._diffuser ?? new OllamaDiffuserClient();
        gallery = [];
        galleryIdx = -1;
        message = "";
        busy = false;
        currentShape = "sphere";
        rotateAngle = 0;

        overlay = document.createElement("div");
        overlay.style.cssText = [
            "position:fixed",
            "left:20px",
            "top:140px",
            "width:280px",
            "background:rgba(4,12,20,0.94)",
            "border:1px solid #066",
            "border-radius:5px",
            "box-shadow:0 0 18px rgba(0,200,100,0.25), inset 0 0 18px rgba(0,80,40,0.15)",
            "padding:12px 14px",
            "color:#0fa",
            "font:11px 'Courier New', monospace",
            "z-index:1000",
            "pointer-events:auto",
        ].join(";");
        panel = overlay;
        document.body.appendChild(overlay);

        await client.probe();
        message = client.available
            ? "diffuser ready"
            : "diffuser offline (start: ollamadiffuser serve)";
        messageColor = client.available ? "#0fa" : "#fc4";
        renderUI();
        ctx.kpop?.info?.("Texture Studio", message);
        console.log("[texture_studio] started; diffuser:", client.available);
    },

    tick(ctx, dt) {
        // 3D preview animation is on its own RAF loop; nothing per-tick.
    },

    stop(ctx) {
        if (animRAF) { cancelAnimationFrame(animRAF); animRAF = null; }
        if (previewGL) {
            if (previewTexture) previewGL.deleteTexture(previewTexture);
            if (previewHeightTex) previewGL.deleteTexture(previewHeightTex);
            if (previewDummyTex) previewGL.deleteTexture(previewDummyTex);
            if (previewDummyHeight) previewGL.deleteTexture(previewDummyHeight);
            if (previewBuffers) {
                for (const k of ["pos","uv","norm","tan","bit","idx"]) {
                    if (previewBuffers[k]) previewGL.deleteBuffer(previewBuffers[k]);
                }
                if (previewBuffers.vao) previewGL.deleteVertexArray(previewBuffers.vao);
            }
            if (previewProgram) previewGL.deleteProgram(previewProgram);
        }
        previewGL = null; previewProgram = null; previewBuffers = null;
        previewTexture = null; previewHeightTex = null;
        previewDummyTex = null; previewDummyHeight = null;
        if (overlay?.parentNode) overlay.parentNode.removeChild(overlay);
        overlay = null; panel = null; promptInput = null; previewCanvas = null;
        gallery = []; ctxRef = null;
        console.log("[texture_studio] stopped");
    },
};
