// ============================================================================
// ui/parallaxPreview.js
//
// Round 175 — live parallax preview. Floating panel with its own WebGL2
// context. Subscribes to the material set registry; whenever a set is
// registered (or one already exists at boot), the panel updates the
// preview to render a rotating quad with parallax occlusion mapping
// against that set's textures.
//
// What this gives the user: visual confirmation that the diffuser
// output + height + normal triplet actually behaves like a 3D material
// when shaded. The grazing-angle parallax displacement is dramatic on
// the kaiju textures the user has been generating.
//
// Architecture:
//   - Single floating panel toggleable via window.parallaxPreview.toggle()
//   - Subscribes to materialSets.addListener so it auto-updates when the
//     bench's "Send to engine" button fires
//   - Dropdown to cycle through registered kinds (since multiple kaiju
//     materials end up registered over time)
//   - Auto-rotation; click+drag to manually pose; slider for height scale
//
// Shader is lifted from parallax_studio.js (same project) with one
// addition: a normal-map sampler. parallax_studio derives normals from
// the height field inside the shader; here we have the normal map
// already, so we can use it directly for higher-quality lighting.
//
// Why a separate file instead of folding into the bench: the bench is
// already large, and this preview is useful outside the bench too
// (could be hooked into the AI MODELS panel, or shown when a registered
// kind is hovered over in the entity browser). Keeping it standalone
// makes that future reuse trivial.
// ============================================================================

import { materialSets } from "../ai/MaterialSetRegistry.js";
import { heightScaleFor } from "../render/entityVisuals.js";

const CANVAS_W = 320;
const CANVAS_H = 240;
const DEFAULT_HEIGHT_SCALE = 0.10;

// ---------------------------------------------------------------------------
// Shaders. Identical to parallax_studio's POM but with a tangent-space
// normal map for lighting (instead of deriving normals from height).
// ---------------------------------------------------------------------------
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
out vec3 vViewDirTS;
out vec3 vLightDirTS;

void main() {
    vec4 wp = uModel * vec4(aPos, 1.0);
    vUV = aUV;

    mat3 model3 = mat3(uModel);
    vec3 T = normalize(model3 * aTangent);
    vec3 B = normalize(model3 * aBitangent);
    vec3 N = normalize(model3 * aNormal);
    mat3 TBN = mat3(T, B, N);
    mat3 invTBN = transpose(TBN);

    vec3 viewDirWS = normalize(uCamPos - wp.xyz);
    vViewDirTS = invTBN * viewDirWS;

    vec3 lightDirWS = normalize(vec3(0.4, 0.7, 0.6));
    vLightDirTS = invTBN * lightDirWS;

    gl_Position = uMVP * vec4(aPos, 1.0);
}`;

const FS = `#version 300 es
precision highp float;
in vec2 vUV;
in vec3 vViewDirTS;
in vec3 vLightDirTS;

uniform sampler2D uAlbedo;
uniform sampler2D uHeight;
uniform sampler2D uNormal;
uniform float uHeightScale;
uniform int uMode;          // 0=off, 1=offset, 2=POM (default)

out vec4 outColor;

vec2 parallaxOcclusion(vec2 uv, vec3 viewTS) {
    const int LINEAR_STEPS = 16;
    float vz = max(viewTS.z, 0.1);
    float steps = mix(float(LINEAR_STEPS) * 1.5, float(LINEAR_STEPS) * 0.6, viewTS.z);
    float layerDepth = 1.0 / steps;
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
    // Binary refinement
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
        // single-tap offset
        float h = texture(uHeight, vUV).r;
        vec2 p = (viewTS.xy / max(viewTS.z, 0.1)) * uHeightScale * (h - 0.5);
        finalUV = vUV - p;
    } else if (uMode == 2) {
        finalUV = parallaxOcclusion(vUV, viewTS);
    }
    if (finalUV.x < 0.0 || finalUV.x > 1.0 ||
        finalUV.y < 0.0 || finalUV.y > 1.0) discard;

    vec3 albedo = texture(uAlbedo, finalUV).rgb;
    // Sample the precomputed tangent-space normal map. Values are
    // [0,255] packed; remap to [-1,1] and renormalize.
    vec3 nTS = texture(uNormal, finalUV).rgb * 2.0 - 1.0;
    nTS = normalize(nTS);

    vec3 L = normalize(vLightDirTS);
    float nDotL = max(dot(L, nTS), 0.0);

    float h = texture(uHeight, finalUV).r;
    float aoFromHeight = mix(0.55, 1.0, h);
    float ambient = 0.28;
    float diffuse = 0.90 * nDotL;
    vec3 lit = albedo * (ambient + diffuse) * aoFromHeight;
    outColor = vec4(lit, 1.0);
}`;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let overlay = null;          // root container
let canvas = null;
let gl = null;
let program = null;
let uniforms = null;
let plane = null;            // { vao, indexCount }
let albedoTex = null, heightTex = null, normalTex = null;
let currentKind = null;
let yaw = 0.3, pitch = -0.35;
let dragging = false, dragLast = {x:0, y:0};
let autoRotate = true;
let idleSinceMs = 0;
let heightScale = DEFAULT_HEIGHT_SCALE;
let parallaxMode = 2;        // POM by default
let rafId = null;
let listener = null;         // registry listener
let escHandler = null;       // Round 190 — keydown handler for ESC-to-close
let kindSelect = null;
let modeSelect = null;
let heightSlider = null;

// ---------------------------------------------------------------------------
// Plane geometry — single quad with tangents/bitangents pre-baked
// ---------------------------------------------------------------------------
function buildPlane(gl) {
    // 4 verts, each with: pos(3) uv(2) normal(3) tangent(3) bitangent(3)
    const verts = new Float32Array([
        // pos          uv      normal       tangent       bitangent
        -1,-1, 0,  0, 0,  0,0,1,  1,0,0,  0,1,0,
         1,-1, 0,  1, 0,  0,0,1,  1,0,0,  0,1,0,
         1, 1, 0,  1, 1,  0,0,1,  1,0,0,  0,1,0,
        -1, 1, 0,  0, 1,  0,0,1,  1,0,0,  0,1,0,
    ]);
    const idx = new Uint16Array([0,1,2, 0,2,3]);
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    const stride = 14 * 4;
    // pos
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    // uv
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 3*4);
    // normal
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 5*4);
    // tangent
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 3, gl.FLOAT, false, stride, 8*4);
    // bitangent
    gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 3, gl.FLOAT, false, stride, 11*4);

    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return { vao, indexCount: idx.length };
}

function compileShader(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.error("[parallaxPreview] compile error:", gl.getShaderInfoLog(sh));
    }
    return sh;
}

function linkProgram(gl) {
    const p = gl.createProgram();
    gl.attachShader(p, compileShader(gl, gl.VERTEX_SHADER, VS));
    gl.attachShader(p, compileShader(gl, gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        console.error("[parallaxPreview] link error:", gl.getProgramInfoLog(p));
    }
    return p;
}

// ---------------------------------------------------------------------------
// Math — minimal mat4 helpers since the engine's globals aren't visible here
// ---------------------------------------------------------------------------
function mat4Identity() {
    return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
}
function mat4Perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2);
    const out = new Float32Array(16);
    out[0] = f / aspect;
    out[5] = f;
    out[10] = (far + near) / (near - far);
    out[11] = -1;
    out[14] = (2 * far * near) / (near - far);
    return out;
}
function mat4Mul(a, b) {
    const out = new Float32Array(16);
    for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) {
        let s = 0;
        for (let k = 0; k < 4; k++) s += a[k*4 + j] * b[i*4 + k];
        out[i*4 + j] = s;
    }
    return out;
}
function mat4RotateY(theta) {
    const c = Math.cos(theta), s = Math.sin(theta);
    return new Float32Array([c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1]);
}
function mat4RotateX(theta) {
    const c = Math.cos(theta), s = Math.sin(theta);
    return new Float32Array([1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1]);
}
function mat4Translate(x, y, z) {
    const m = mat4Identity();
    m[12] = x; m[13] = y; m[14] = z;
    return m;
}

// ---------------------------------------------------------------------------
// Texture upload — make a GL texture from a dataURL.
// Returns a Promise<WebGLTexture>.
// ---------------------------------------------------------------------------
function uploadDataUrlAsTexture(gl, dataUrl) {
    return new Promise((resolve, reject) => {
        if (!dataUrl) { resolve(null); return; }
        const img = new Image();
        img.onload = () => {
            const tex = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
            gl.generateMipmap(gl.TEXTURE_2D);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
            resolve(tex);
        };
        img.onerror = () => reject(new Error("texture load failed"));
        img.src = dataUrl;
    });
}

// ---------------------------------------------------------------------------
// Load the current registry entry into GL textures
// ---------------------------------------------------------------------------
async function loadKind(kind) {
    const entry = materialSets.get(kind);
    if (!entry) return false;
    // Delete previous textures
    if (albedoTex) { gl.deleteTexture(albedoTex); albedoTex = null; }
    if (heightTex) { gl.deleteTexture(heightTex); heightTex = null; }
    if (normalTex) { gl.deleteTexture(normalTex); normalTex = null; }
    albedoTex = await uploadDataUrlAsTexture(gl, entry.albedo?.dataUrl);
    heightTex = await uploadDataUrlAsTexture(gl, entry.height?.dataUrl);
    normalTex = await uploadDataUrlAsTexture(gl, entry.normal?.dataUrl);
    currentKind = kind;
    return true;
}

// ---------------------------------------------------------------------------
// Build (or refresh) the kind dropdown to match the registry
// ---------------------------------------------------------------------------
function refreshKindList() {
    if (!kindSelect) return;
    const items = materialSets.list();
    const prev = kindSelect.value;
    kindSelect.innerHTML = "";
    // Round 190 — surface "nothing to preview yet" visibly. Previously
    // the canvas just stayed black and the dropdown said "(no material
    // sets registered)", which was easy to mistake for the panel being
    // broken. Now we hide the canvas and show a labeled message panel.
    const emptyMsg = overlay?.querySelector(".pv-empty");
    if (items.length === 0) {
        const opt = document.createElement("option");
        opt.value = ""; opt.textContent = "(no material sets registered)";
        kindSelect.appendChild(opt);
        kindSelect.disabled = true;
        if (canvas) canvas.style.display = "none";
        if (emptyMsg) emptyMsg.style.display = "block";
        return;
    }
    kindSelect.disabled = false;
    if (canvas) canvas.style.display = "block";
    if (emptyMsg) emptyMsg.style.display = "none";
    for (const it of items) {
        const opt = document.createElement("option");
        opt.value = it.kind; opt.textContent = it.kind;
        kindSelect.appendChild(opt);
    }
    // Preserve selection if still present, else pick newest (last)
    if (items.find(i => i.kind === prev)) {
        kindSelect.value = prev;
    } else {
        kindSelect.value = items[items.length - 1].kind;
        loadKind(kindSelect.value);
    }
}

// ---------------------------------------------------------------------------
// Render loop
// ---------------------------------------------------------------------------
function frame(now) {
    rafId = requestAnimationFrame(frame);
    if (!overlay || overlay.style.display === "none") return;
    if (!gl || !program || !plane) return;

    // Auto-rotate if idle
    if (autoRotate && (now - idleSinceMs) > 1500) {
        yaw += 0.005;
    }

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.08, 0.08, 0.08, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);

    const proj = mat4Perspective(Math.PI / 4, canvas.width / canvas.height, 0.1, 20);
    const view = mat4Mul(mat4Translate(0, 0, -2.6),
                  mat4Mul(mat4RotateX(pitch), mat4RotateY(yaw)));
    const model = mat4Identity();
    const mvp = mat4Mul(proj, view);

    gl.useProgram(program);
    gl.uniformMatrix4fv(uniforms.uMVP, false, mvp);
    gl.uniformMatrix4fv(uniforms.uModel, false, model);
    gl.uniform3f(uniforms.uCamPos, 0, 0, 2.6);
    gl.uniform1f(uniforms.uHeightScale, heightScale);
    gl.uniform1i(uniforms.uMode, parallaxMode);

    if (albedoTex && heightTex && normalTex) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, albedoTex);
        gl.uniform1i(uniforms.uAlbedo, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, heightTex);
        gl.uniform1i(uniforms.uHeight, 1);
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, normalTex);
        gl.uniform1i(uniforms.uNormal, 2);
        gl.bindVertexArray(plane.vao);
        gl.drawElements(gl.TRIANGLES, plane.indexCount, gl.UNSIGNED_SHORT, 0);
        gl.bindVertexArray(null);
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export const parallaxPreview = {
    open() {
        if (overlay) {
            overlay.style.display = "block";
            return;
        }
        // ----- DOM
        overlay = document.createElement("div");
        overlay.style.cssText = `
            position:fixed; right:18px; bottom:18px; z-index:10001;
            background:rgba(15,15,15,0.95); color:#ccc; border:1px solid #444;
            border-radius:6px; padding:10px; font-family:monospace; font-size:11px;
            box-shadow:0 4px 20px rgba(0,0,0,0.6);
        `;
        overlay.innerHTML = `
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                <span style="color:#8aff9e; font-weight:bold;">PARALLAX PREVIEW</span>
                <span style="flex:1;"></span>
                <button class="pv-close" title="Close (Esc)" style="background:#2a1010; color:#ff8a8a; border:1px solid #663030; border-radius:4px; padding:4px 12px; cursor:pointer; font-size:12px; font-family:monospace; font-weight:bold;">× close</button>
            </div>
            <canvas class="pv-canvas" width="${CANVAS_W}" height="${CANVAS_H}" style="background:#000; border:1px solid #333; border-radius:3px; display:block;"></canvas>
            <div class="pv-empty" style="display:none; padding:20px 16px; color:#aaa; text-align:center; font-style:italic; font-size:11px; background:#000; border:1px solid #333; border-radius:3px;">
                No material sets registered yet.<br>
                Run the bench's <b style="color:#ff8aff;">Texture</b> step or click <b style="color:#6db9ff;">🌊 Demo</b> first<br>
                so this preview has something to show.
            </div>
            <div style="display:flex; gap:6px; align-items:center; margin-top:8px; flex-wrap:wrap;">
                <span style="color:#888;">kind</span>
                <select class="pv-kind" style="background:#1a1a1a; color:#ccc; border:1px solid #555; border-radius:3px; padding:2px 4px; font-size:10px; font-family:monospace; flex:1; min-width:120px;"></select>
                <select class="pv-mode" style="background:#1a1a1a; color:#ccc; border:1px solid #555; border-radius:3px; padding:2px 4px; font-size:10px; font-family:monospace;">
                    <option value="0">flat</option>
                    <option value="1">offset</option>
                    <option value="2" selected>POM</option>
                </select>
            </div>
            <div style="display:flex; gap:6px; align-items:center; margin-top:6px;">
                <span style="color:#888;">depth</span>
                <input type="range" class="pv-height" min="0" max="0.50" step="0.005" value="${DEFAULT_HEIGHT_SCALE}" style="flex:1;">
                <span class="pv-height-val" style="color:#aaa; min-width:36px; text-align:right;">${DEFAULT_HEIGHT_SCALE.toFixed(2)}</span>
            </div>
            <div style="font-size:9px; color:#666; margin-top:6px; font-style:italic;">drag to rotate · auto-rotates when idle · ESC or × close to dismiss · subscribes to materialSets registry</div>
        `;
        document.body.appendChild(overlay);

        canvas       = overlay.querySelector(".pv-canvas");
        kindSelect   = overlay.querySelector(".pv-kind");
        modeSelect   = overlay.querySelector(".pv-mode");
        heightSlider = overlay.querySelector(".pv-height");

        gl = canvas.getContext("webgl2");
        if (!gl) {
            overlay.innerHTML = `<div style="color:#ff8a8a;">WebGL2 unavailable in this browser.</div>`;
            return;
        }
        program = linkProgram(gl);
        uniforms = {
            uMVP:          gl.getUniformLocation(program, "uMVP"),
            uModel:        gl.getUniformLocation(program, "uModel"),
            uCamPos:       gl.getUniformLocation(program, "uCamPos"),
            uAlbedo:       gl.getUniformLocation(program, "uAlbedo"),
            uHeight:       gl.getUniformLocation(program, "uHeight"),
            uNormal:       gl.getUniformLocation(program, "uNormal"),
            uHeightScale:  gl.getUniformLocation(program, "uHeightScale"),
            uMode:         gl.getUniformLocation(program, "uMode"),
        };
        plane = buildPlane(gl);

        refreshKindList();
        // Round 179 — when the preview boots, pre-load the kind's
        // per-kind default height scale so it matches what the engine
        // would actually use. Otherwise the preview reads at a more
        // dramatic depth than reality.
        if (kindSelect.value) {
            heightScale = heightScaleFor(kindSelect.value);
            heightSlider.value = String(heightScale);
            overlay.querySelector(".pv-height-val").textContent = heightScale.toFixed(2);
            loadKind(kindSelect.value);
        }

        // ----- listeners
        kindSelect.addEventListener("change", () => {
            if (kindSelect.value) {
                // Round 179 — auto-match the engine's per-kind default
                // depth on kind switch. Slider stays user-overridable.
                heightScale = heightScaleFor(kindSelect.value);
                heightSlider.value = String(heightScale);
                overlay.querySelector(".pv-height-val").textContent = heightScale.toFixed(2);
                loadKind(kindSelect.value);
            }
        });
        modeSelect.addEventListener("change", () => {
            parallaxMode = parseInt(modeSelect.value, 10) || 0;
        });
        heightSlider.addEventListener("input", () => {
            heightScale = parseFloat(heightSlider.value);
            overlay.querySelector(".pv-height-val").textContent = heightScale.toFixed(2);
        });
        overlay.querySelector(".pv-close").addEventListener("click", () => parallaxPreview.close());

        // Round 190 — ESC closes. Tracked as a module-level handler so
        // close() can remove it; otherwise repeated open/close cycles
        // would leak listeners.
        escHandler = (ev) => {
            if (ev.key === "Escape" && overlay) parallaxPreview.close();
        };
        window.addEventListener("keydown", escHandler);

        // Mouse drag for manual posing
        canvas.addEventListener("mousedown", (e) => {
            dragging = true; dragLast.x = e.clientX; dragLast.y = e.clientY; autoRotate = false;
        });
        window.addEventListener("mousemove", (e) => {
            if (!dragging) return;
            yaw   += (e.clientX - dragLast.x) * 0.01;
            pitch += (e.clientY - dragLast.y) * 0.01;
            pitch = Math.max(-1.4, Math.min(1.4, pitch));
            dragLast.x = e.clientX; dragLast.y = e.clientY;
            idleSinceMs = performance.now();
        });
        window.addEventListener("mouseup", () => {
            if (dragging) { dragging = false; autoRotate = true; idleSinceMs = performance.now(); }
        });

        // Registry subscription — refresh dropdown + reload if our
        // current kind was updated.
        listener = (ev) => {
            refreshKindList();
            if (ev.kind && ev.kind === currentKind && ev.type === "register") {
                // The texture was re-registered for the same kind. Reload.
                loadKind(currentKind);
            }
            if (ev.kind && ev.type === "remove" && ev.kind === currentKind) {
                // Our active kind was deleted. Pick another, or blank out.
                const items = materialSets.list();
                if (items.length > 0) {
                    kindSelect.value = items[items.length - 1].kind;
                    loadKind(kindSelect.value);
                } else {
                    currentKind = null;
                    if (albedoTex) { gl.deleteTexture(albedoTex); albedoTex = null; }
                    if (heightTex) { gl.deleteTexture(heightTex); heightTex = null; }
                    if (normalTex) { gl.deleteTexture(normalTex); normalTex = null; }
                }
            }
        };
        materialSets.addListener(listener);

        idleSinceMs = performance.now();
        rafId = requestAnimationFrame(frame);
        console.log("[parallaxPreview] opened");
    },

    close() {
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        if (listener) { materialSets.removeListener(listener); listener = null; }
        // Round 190 — remove the ESC keydown handler so re-opens don't
        // accumulate listeners.
        if (escHandler) { window.removeEventListener("keydown", escHandler); escHandler = null; }
        if (overlay?.parentNode) overlay.parentNode.removeChild(overlay);
        overlay = null;
        try { if (gl) { const _ext = gl.getExtension("WEBGL_lose_context"); if (_ext) _ext.loseContext(); } } catch {}   // v2778 - release now, don't wait for GC (was leaking per open/close)
        albedoTex = heightTex = normalTex = null;
        gl = program = plane = null;
        console.log("[parallaxPreview] closed");
    },

    toggle() {
        if (overlay && overlay.style.display !== "none") {
            this.close();
        } else {
            this.open();
        }
    },

    isOpen() { return !!overlay; },
};
