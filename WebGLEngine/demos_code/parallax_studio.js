// demos_code/parallax_studio.js — parallax occlusion mapping demo.
//
// Split-screen comparison: left half shows the textured plane WITHOUT
// parallax (plain diffuse sampling), right half shows the same plane
// with parallax occlusion mapping. Same texture, same lighting, same
// camera — only the fragment shader differs. The visual difference
// becomes dramatic at grazing angles.
//
// Three modes selectable via radio buttons:
//   * OFF              — flat texture
//   * OFFSET (1 tap)   — cheap single-step parallax (visible at low angles)
//   * POM (16 + 8)     — linear search + binary refinement, looks proper
//
// Heightmap is generated procedurally from the color texture's
// luminance, inverted + contrast-boosted so dark areas (mortar lines)
// become deep grooves and light areas (brick faces) stand out.
//
// Mouse drag = rotate plane. Idle for 1.5s = auto-rotate resumes.
// Slider = adjust height scale (depth strength).
//
// VBA-side counterpart: vba/polish_bundle/D3D11ParallaxHLSL.bas
// has the HLSL equivalent for the D3D11 pipeline.

const CANVAS_W = 480;
const CANVAS_H = 320;
const TEXTURE_SIZE = 512;
const DEFAULT_HEIGHT_SCALE = 0.08;

let overlay = null;
let panel = null;
let canvas = null;
let gl = null;
let program = null;
let plane = null;
let diffuseTex = null;
let heightTex = null;
let yaw = 0.3;
let pitch = -0.35;
let dragLastX = 0;
let dragLastY = 0;
let dragging = false;
let autoRotate = true;
let idleSince = 0;
let heightScale = DEFAULT_HEIGHT_SCALE;
let modeLeft  = 0;  // 0=off, 1=offset, 2=POM
let modeRight = 2;
let animRAF = null;
let mouseHandlers = null;

// ---- procedural color texture (brick pattern) ----------------------
function generateBrickTexture() {
    const c = document.createElement("canvas");
    c.width = TEXTURE_SIZE; c.height = TEXTURE_SIZE;
    const ctx = c.getContext("2d");
    // Mortar background
    ctx.fillStyle = "#2a1d15";
    ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
    const brickW = TEXTURE_SIZE / 6;
    const brickH = TEXTURE_SIZE / 12;
    for (let row = 0; row < 12; row++) {
        const xoff = row % 2 ? brickW / 2 : 0;
        for (let col = -1; col < 7; col++) {
            const x = col * brickW + xoff;
            const y = row * brickH;
            // Color variation per brick
            const hue = 15 + (Math.random() - 0.5) * 16;
            const sat = 30 + Math.random() * 25;
            const lum = 28 + Math.random() * 22;
            ctx.fillStyle = `hsl(${hue}, ${sat}%, ${lum}%)`;
            ctx.fillRect(x + 4, y + 3, brickW - 8, brickH - 6);
            // Add brick speckle for texture
            ctx.fillStyle = `rgba(20, 10, 5, 0.15)`;
            for (let s = 0; s < 6; s++) {
                const sx = x + 4 + Math.random() * (brickW - 8);
                const sy = y + 3 + Math.random() * (brickH - 6);
                ctx.fillRect(sx, sy, 2 + Math.random() * 3, 1 + Math.random() * 2);
            }
        }
    }
    // Light gradient overlay for subtle weathering
    const grad = ctx.createLinearGradient(0, 0, 0, TEXTURE_SIZE);
    grad.addColorStop(0, "rgba(255, 240, 200, 0.10)");
    grad.addColorStop(1, "rgba(0, 0, 0, 0.10)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
    return c;
}

// Heightmap from color: invert luminance + contrast boost. Dark areas
// (mortar) → deep (low height), light areas (brick face) → high.
function generateHeightmap(colorCanvas) {
    const c2 = document.createElement("canvas");
    c2.width = colorCanvas.width;
    c2.height = colorCanvas.height;
    const cx = c2.getContext("2d");
    cx.drawImage(colorCanvas, 0, 0);
    const data = cx.getImageData(0, 0, c2.width, c2.height);
    const px = data.data;
    for (let i = 0; i < px.length; i += 4) {
        const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
        // Contrast boost: push dark darker, light lighter
        const boosted = Math.max(0, Math.min(255, 128 + (lum - 96) * 1.6));
        px[i] = px[i + 1] = px[i + 2] = boosted;
        px[i + 3] = 255;
    }
    cx.putImageData(data, 0, 0);
    return c2;
}

// ---- shaders -------------------------------------------------------

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
out vec3 vViewDirTS;     // view direction in tangent space
out vec3 vLightDirTS;    // directional light in tangent space
out vec3 vWorldPos;

void main() {
    vec4 wp = uModel * vec4(aPos, 1.0);
    vWorldPos = wp.xyz;
    vUV = aUV;

    // Tangent space basis (transformed to world via uModel's 3x3)
    mat3 model3 = mat3(uModel);
    vec3 T = normalize(model3 * aTangent);
    vec3 B = normalize(model3 * aBitangent);
    vec3 N = normalize(model3 * aNormal);
    mat3 TBN = mat3(T, B, N);
    // Inverse of orthonormal matrix is its transpose
    mat3 invTBN = transpose(TBN);

    vec3 viewDirWS = normalize(uCamPos - wp.xyz);
    vViewDirTS = invTBN * viewDirWS;

    // Hard-coded directional light from upper-front
    vec3 lightDirWS = normalize(vec3(0.4, 0.7, 0.6));
    vLightDirTS = invTBN * lightDirWS;

    gl_Position = uMVP * vec4(aPos, 1.0);
}`;

// Fragment shader supports three modes. uMode = 0 (off) / 1 (offset
// 1-tap) / 2 (parallax occlusion mapping with linear+binary search).
const FS = `#version 300 es
precision highp float;
in vec2 vUV;
in vec3 vViewDirTS;
in vec3 vLightDirTS;
in vec3 vWorldPos;

uniform sampler2D uDiffuse;
uniform sampler2D uHeight;
uniform int uMode;
uniform float uHeightScale;

out vec4 outColor;

// Single-tap parallax offset — cheap, breaks at grazing angles
vec2 parallaxOffset(vec2 uv, vec3 viewTS) {
    float h = texture(uHeight, uv).r;
    // Conventional sign: dark/low height steps "back" along the view
    // (negates V when sampling height as depth)
    vec2 p = (viewTS.xy / max(viewTS.z, 0.1)) * uHeightScale * (h - 0.5);
    return uv - p;
}

// Parallax occlusion mapping with linear search + binary refinement
vec2 parallaxOcclusion(vec2 uv, vec3 viewTS) {
    const int LINEAR_STEPS = 16;
    const int BINARY_STEPS = 6;

    float vz = max(viewTS.z, 0.1);
    // More steps at grazing angles for quality preservation
    float steps = mix(float(LINEAR_STEPS) * 1.5, float(LINEAR_STEPS) * 0.6, viewTS.z);
    float layerDepth = 1.0 / steps;
    vec2 deltaUV = (viewTS.xy / vz) * uHeightScale * layerDepth;

    vec2 curUV = uv;
    float curLayerDepth = 0.0;
    // Note: heightmap convention — 1.0 = surface, 0.0 = max depth.
    // We invert so currentSample is the "depth" at this UV.
    float curSample = 1.0 - texture(uHeight, curUV).r;

    for (int i = 0; i < LINEAR_STEPS; i++) {
        if (curLayerDepth >= curSample) break;
        curUV -= deltaUV;
        curSample = 1.0 - texture(uHeight, curUV).r;
        curLayerDepth += layerDepth;
    }

    // Binary refinement between previous step and current step
    vec2 prevUV = curUV + deltaUV;
    float depthAfter  = curSample - curLayerDepth;
    float depthBefore = (1.0 - texture(uHeight, prevUV).r) - (curLayerDepth - layerDepth);
    float weight = depthAfter / max(depthAfter - depthBefore, 0.001);
    return mix(curUV, prevUV, weight);
}

void main() {
    vec3 viewTS = normalize(vViewDirTS);

    vec2 finalUV = vUV;
    if (uMode == 1) {
        finalUV = parallaxOffset(vUV, viewTS);
    } else if (uMode == 2) {
        finalUV = parallaxOcclusion(vUV, viewTS);
    }

    // Reject samples outside [0,1] for proper edge dropoff at grazing
    // angles (POM can step beyond the texture if heightScale is large)
    if (finalUV.x < 0.0 || finalUV.x > 1.0 ||
        finalUV.y < 0.0 || finalUV.y > 1.0) {
        discard;
    }

    vec3 albedo = texture(uDiffuse, finalUV).rgb;

    // Simple lighting from the tangent-space light. Sample height for
    // a fake self-shadow tint — POM-shifted UVs in shadow areas look
    // darker if the heightfield blocks them from the light.
    vec3 L = normalize(vLightDirTS);
    float nDotL = max(dot(L, vec3(0.0, 0.0, 1.0)), 0.0);

    float h = texture(uHeight, finalUV).r;
    float aoFromHeight = mix(0.55, 1.0, h);   // recessed areas darker

    float ambient = 0.30;
    float diffuse = 0.85 * nDotL;
    vec3 lit = albedo * (ambient + diffuse) * aoFromHeight;

    outColor = vec4(lit, 1.0);
}`;

function compile(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.error("[parallax_studio]", gl.getShaderInfoLog(sh));
    }
    return sh;
}

// ---- plane geometry with tangent space -----------------------------
function buildPlane() {
    // Quad in XY (Z = 0), normal +Z, tangent +X, bitangent +Y. Tiled
    // 2× so parallax effects are visible at multiple repeats.
    const tile = 2.0;
    const positions = [
        -1, -1, 0,
         1, -1, 0,
         1,  1, 0,
        -1,  1, 0,
    ];
    const uvs = [
        0, 0,
        tile, 0,
        tile, tile,
        0, tile,
    ];
    const normals = [0,0,1, 0,0,1, 0,0,1, 0,0,1];
    const tangents = [1,0,0, 1,0,0, 1,0,0, 1,0,0];
    const bitangents = [0,1,0, 0,1,0, 0,1,0, 0,1,0];
    const indices = [0, 1, 2, 0, 2, 3];

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    function attrib(loc, data, size) {
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
        return buf;
    }
    const bufs = {};
    bufs.pos  = attrib(0, positions, 3);
    bufs.uv   = attrib(1, uvs, 2);
    bufs.norm = attrib(2, normals, 3);
    bufs.tan  = attrib(3, tangents, 3);
    bufs.bit  = attrib(4, bitangents, 3);
    bufs.idx  = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bufs.idx);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
    bufs.count = indices.length;
    bufs.vao = vao;
    return bufs;
}

function uploadTexture(canvas, generateMips = true) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER,
        generateMips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    if (generateMips) gl.generateMipmap(gl.TEXTURE_2D);
    return tex;
}

// ---- matrix helpers ------------------------------------------------
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
    let zx = ex - cx, zy = ey - cy, zz = ez - cz;
    let zl = Math.hypot(zx, zy, zz) || 1; zx /= zl; zy /= zl; zz /= zl;
    let xx = 0 * zz - 1 * zy, xy = 1 * zx - 0 * zz, xz = 0 * zy - 0 * zx;
    let xl = Math.hypot(xx, xy, xz) || 1; xx /= xl; xy /= xl; xz /= xl;
    const yx = zy * xz - zz * xy;
    const yy = zz * xx - zx * xz;
    const yz = zx * xy - zy * xx;
    return [
        xx, yx, zx, 0,
        xy, yy, zy, 0,
        xz, yz, zz, 0,
        -(xx*ex + xy*ey + xz*ez),
        -(yx*ex + yy*ey + yz*ez),
        -(zx*ex + zy*ey + zz*ez), 1,
    ];
}
function mat4RotY(a) {
    const c = Math.cos(a), s = Math.sin(a);
    return [c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1];
}
function mat4RotX(a) {
    const c = Math.cos(a), s = Math.sin(a);
    return [1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1];
}
function mat4Mul(a, b) {
    const r = new Array(16);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        r[j*4+i] = a[0*4+i]*b[j*4+0] + a[1*4+i]*b[j*4+1] + a[2*4+i]*b[j*4+2] + a[3*4+i]*b[j*4+3];
    }
    return r;
}

// ---- render --------------------------------------------------------
function render() {
    if (!gl || !plane) return;
    const w = canvas.width, h = canvas.height;
    gl.viewport(0, 0, w, h);
    gl.clearColor(0.06, 0.07, 0.10, 1.0);
    gl.enable(gl.DEPTH_TEST);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(program);

    const proj = mat4Perspective(Math.PI / 4, w / h, 0.1, 20);
    const view = mat4LookAt(0, 0, 2.5, 0, 0, 0);
    const model = mat4Mul(mat4RotY(yaw), mat4RotX(pitch));
    const mv = mat4Mul(view, model);
    const mvp = mat4Mul(proj, mv);

    gl.uniformMatrix4fv(program.uMVP, false, mvp);
    gl.uniformMatrix4fv(program.uModel, false, model);
    gl.uniform3f(program.uCamPos, 0, 0, 2.5);
    gl.uniform1f(program.uHeightScale, heightScale);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, diffuseTex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, heightTex);
    gl.uniform1i(program.uDiffuse, 0);
    gl.uniform1i(program.uHeight, 1);

    gl.bindVertexArray(plane.vao);

    // Split-screen via scissor test
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(0, 0, Math.floor(w / 2), h);
    gl.uniform1i(program.uMode, modeLeft);
    gl.drawElements(gl.TRIANGLES, plane.count, gl.UNSIGNED_SHORT, 0);
    gl.scissor(Math.floor(w / 2), 0, w - Math.floor(w / 2), h);
    gl.uniform1i(program.uMode, modeRight);
    gl.drawElements(gl.TRIANGLES, plane.count, gl.UNSIGNED_SHORT, 0);
    gl.disable(gl.SCISSOR_TEST);
}

function animate() {
    const now = performance.now();
    if (autoRotate && (now - idleSince) > 1500 && !dragging) {
        yaw += 0.008;
    }
    render();
    animRAF = requestAnimationFrame(animate);
}

function modeLabel(m) {
    return m === 0 ? "OFF" : m === 1 ? "OFFSET" : "POM";
}

function renderUI() {
    if (!panel) return;
    const opt = (m) => `<option value="${m}">${modeLabel(m)}</option>`;
    panel.innerHTML = `
        <div style="color:#fd0;font-weight:bold;font-size:13px;letter-spacing:1px;margin-bottom:6px">
            🪨 PARALLAX STUDIO
        </div>
        <div style="font-size:11px;line-height:1.5;color:#9fd;margin-bottom:8px">
            Split-screen comparison · drag to rotate · idle = auto-rotate
        </div>
        <canvas class="px_canvas" width="${CANVAS_W}" height="${CANVAS_H}"
                style="width:${CANVAS_W}px;height:${CANVAS_H}px;display:block;border:1px solid #333;background:#000;border-radius:3px;cursor:grab"></canvas>
        <div style="position:relative;width:${CANVAS_W}px">
            <div style="position:absolute;left:8px;top:-${CANVAS_H + 4}px;color:#fd0;font-size:10px;background:rgba(0,0,0,0.6);padding:2px 5px;border-radius:2px;pointer-events:none">
                LEFT: <select class="px_modeL">${[0,1,2].map(opt).join("")}</select>
            </div>
            <div style="position:absolute;right:8px;top:-${CANVAS_H + 4}px;color:#fd0;font-size:10px;background:rgba(0,0,0,0.6);padding:2px 5px;border-radius:2px;pointer-events:none">
                RIGHT: <select class="px_modeR">${[0,1,2].map(opt).join("")}</select>
            </div>
            <div style="position:absolute;left:50%;top:-${CANVAS_H}px;height:${CANVAS_H}px;width:1px;background:rgba(255,200,80,0.6);pointer-events:none"></div>
        </div>
        <div style="margin-top:8px;font-size:11px;color:#9fd">
            <label style="display:flex;align-items:center;gap:8px">
                <span>Height scale</span>
                <input type="range" class="px_scale" min="0" max="200" value="${Math.round(heightScale * 1000)}"
                       style="flex:1;pointer-events:auto"/>
                <span class="px_scaleVal" style="min-width:42px;text-align:right;color:#fd0">${heightScale.toFixed(3)}</span>
            </label>
        </div>
        <div style="margin-top:6px;font-size:10px;color:#aaa;line-height:1.4">
            POM = 16 linear steps + 6 binary refinement. Visible difference biggest at low pitch (look across plane).<br/>
            Procedural brick texture; heightmap = inverted luminance. HLSL counterpart in vba/polish_bundle/D3D11ParallaxHLSL.bas.
        </div>`;

    // Wire events
    canvas = panel.querySelector(".px_canvas");
    if (canvas && !gl) initGL();
    // Mode selectors — set initial value
    const sL = panel.querySelector(".px_modeL");
    const sR = panel.querySelector(".px_modeR");
    sL.value = modeLeft;
    sR.value = modeRight;
    sL.onchange = (ev) => { modeLeft  = parseInt(ev.target.value, 10); };
    sR.onchange = (ev) => { modeRight = parseInt(ev.target.value, 10); };
    const slider = panel.querySelector(".px_scale");
    const slabel = panel.querySelector(".px_scaleVal");
    slider.oninput = (ev) => {
        heightScale = parseInt(ev.target.value, 10) / 1000;
        slabel.textContent = heightScale.toFixed(3);
    };

    // Mouse drag rotation
    if (mouseHandlers) {
        canvas.removeEventListener("mousedown", mouseHandlers.down);
        window.removeEventListener("mousemove", mouseHandlers.move);
        window.removeEventListener("mouseup",   mouseHandlers.up);
    }
    mouseHandlers = {
        down: (ev) => {
            dragging = true;
            dragLastX = ev.clientX;
            dragLastY = ev.clientY;
            idleSince = performance.now();
            canvas.style.cursor = "grabbing";
        },
        move: (ev) => {
            if (!dragging) return;
            const dx = ev.clientX - dragLastX;
            const dy = ev.clientY - dragLastY;
            dragLastX = ev.clientX;
            dragLastY = ev.clientY;
            yaw   += dx * 0.008;
            pitch += dy * 0.005;
            pitch = Math.max(-Math.PI / 2.1, Math.min(Math.PI / 2.1, pitch));
            idleSince = performance.now();
        },
        up: () => {
            if (dragging) {
                dragging = false;
                idleSince = performance.now();
                if (canvas) canvas.style.cursor = "grab";
            }
        },
    };
    canvas.addEventListener("mousedown", mouseHandlers.down);
    window.addEventListener("mousemove", mouseHandlers.move);
    window.addEventListener("mouseup",   mouseHandlers.up);
}

function initGL() {
    gl = canvas.getContext("webgl2", { antialias: true, depth: true });
    if (!gl) { console.warn("[parallax_studio] WebGL2 unavailable"); return; }
    const vs = compile(gl, gl.VERTEX_SHADER, VS);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FS);
    program = gl.createProgram();
    gl.attachShader(program, vs); gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error("[parallax_studio] link:", gl.getProgramInfoLog(program));
    }
    program.uMVP = gl.getUniformLocation(program, "uMVP");
    program.uModel = gl.getUniformLocation(program, "uModel");
    program.uCamPos = gl.getUniformLocation(program, "uCamPos");
    program.uDiffuse = gl.getUniformLocation(program, "uDiffuse");
    program.uHeight = gl.getUniformLocation(program, "uHeight");
    program.uMode = gl.getUniformLocation(program, "uMode");
    program.uHeightScale = gl.getUniformLocation(program, "uHeightScale");

    // Generate procedural brick texture + derive heightmap
    const colorCanvas = generateBrickTexture();
    const heightCanvas = generateHeightmap(colorCanvas);
    diffuseTex = uploadTexture(colorCanvas, true);
    heightTex  = uploadTexture(heightCanvas, false);

    plane = buildPlane();
    idleSince = performance.now();
    animate();
}

export default {
    id:    "parallax_studio",
    label: "PARALLAX STUDIO (OFF vs POM)",
    hint:  "Split-screen comparison — drag to rotate, see depth illusion from heightmap",
    controls: [
        "Drag the plane to rotate; idle 1.5s and it auto-rotates",
        "Dropdowns set the mode per half — try LEFT=OFF, RIGHT=POM",
        "Slider adjusts height scale (depth strength)",
    ],

    start(ctx) {
        overlay = document.createElement("div");
        overlay.style.cssText = [
            "position:fixed",
            "right:20px",
            "top:140px",
            "width:" + (CANVAS_W + 28) + "px",
            "background:rgba(8,12,24,0.94)",
            "border:1px solid #555",
            "border-radius:5px",
            "box-shadow:0 0 18px rgba(180,140,80,0.20)",
            "padding:12px 14px",
            "color:#9fd",
            "font:11px 'Courier New', monospace",
            "z-index:1000",
            "pointer-events:auto",
        ].join(";");
        panel = overlay;
        document.body.appendChild(overlay);

        yaw = 0.3;
        pitch = -0.35;
        heightScale = DEFAULT_HEIGHT_SCALE;
        modeLeft = 0;
        modeRight = 2;
        autoRotate = true;
        dragging = false;
        idleSince = performance.now();

        renderUI();
        ctx.kpop?.info?.("Parallax Studio", "Procedural brick texture + POM");
        console.log("[parallax_studio] started");
    },

    tick(ctx, dt) {
        // RAF-driven; nothing per-tick
    },

    stop(ctx) {
        if (animRAF) { cancelAnimationFrame(animRAF); animRAF = null; }
        if (mouseHandlers) {
            if (canvas) canvas.removeEventListener("mousedown", mouseHandlers.down);
            window.removeEventListener("mousemove", mouseHandlers.move);
            window.removeEventListener("mouseup",   mouseHandlers.up);
        }
        mouseHandlers = null;
        if (gl) {
            if (diffuseTex) gl.deleteTexture(diffuseTex);
            if (heightTex) gl.deleteTexture(heightTex);
            if (plane) {
                for (const k of ["pos","uv","norm","tan","bit","idx"]) {
                    if (plane[k]) gl.deleteBuffer(plane[k]);
                }
                if (plane.vao) gl.deleteVertexArray(plane.vao);
            }
            if (program) gl.deleteProgram(program);
        }
        gl = null; program = null; plane = null; diffuseTex = null; heightTex = null;
        if (overlay?.parentNode) overlay.parentNode.removeChild(overlay);
        overlay = null; panel = null; canvas = null;
        console.log("[parallax_studio] stopped");
    },
};
