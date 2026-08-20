// multiplayer/wadLevelRenderer.js
//
// Round 155 — Option B: textures + parallax occlusion mapping.
//
// Fetches WAD level geometry + a feature wall texture + a feature
// floor flat from the bridge, derives heightmaps client-side via
// HeightmapDeriver, applies POM in the shader on top of per-vertex
// sector lighting + distance fog.
//
// Vertex format (unchanged from round 154, stride = 7 floats):
//   x, y, z, nx, ny, nz, light
//
// Tangent space + UV are computed in the vertex shader from world
// position + normal — no extra vertex data needed. The fragment
// shader branches on |normal.y| > 0.5 to pick UV style:
//   walls:    UV = (dot(pos, tangent), pos.y) / TEX_WORLD_SIZE
//             tangent = normalize(cross(up, normal))
//   floors+ceiling: UV = (pos.x, pos.z) / TEX_WORLD_SIZE
//             tangent = (1, 0, 0)

import { deriveFromLuminance } from "../ai/HeightmapDeriver.js";

const BRIDGE_URL_DEFAULT = "http://localhost:8787";
const TEX_WORLD_SIZE = 2.0;     // 2 world units per texture repeat

const VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in float aLight;

uniform mat4 uMVP;

out vec3 vWorldPos;
out vec3 vNormal;
out float vLight;

void main() {
    vWorldPos = aPos;
    vNormal = aNormal;
    vLight = aLight;
    gl_Position = uMVP * vec4(aPos, 1.0);
}`;

const FS = `#version 300 es
precision highp float;

in vec3 vWorldPos;
in vec3 vNormal;
in float vLight;

uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform sampler2D uColorTex;
uniform sampler2D uHeightTex;
uniform float uTexWorldSize;
uniform float uPomStrength;     // 0 disables POM; 0.04 = subtle, 0.10 = strong
uniform int   uPomEnabled;      // 1 = parallax on, 0 = plain texturing

out vec4 outColor;

const int LINEAR_STEPS = 16;
const int BINARY_STEPS = 6;

// Compute (UV, tangent, bitangent) from world pos + normal.
// Branches on whether the surface is a floor/ceiling or a wall.
void surfaceFrame(vec3 pos, vec3 N, out vec2 uv, out vec3 T, out vec3 B) {
    if (abs(N.y) > 0.5) {
        // Floor or ceiling: UV from world XZ, tangent = world X axis.
        // For the ceiling we flip bitangent so the depth direction is
        // consistent when sampling the heightmap.
        uv = pos.xz / uTexWorldSize;
        T = vec3(1.0, 0.0, 0.0);
        B = vec3(0.0, 0.0, N.y > 0.0 ? 1.0 : -1.0);
    } else {
        // Wall: tangent runs along the wall in the floor plane.
        // bitangent is world up. UV.x = projection along tangent,
        // UV.y = world Y.
        T = normalize(cross(vec3(0.0, 1.0, 0.0), N));
        B = vec3(0.0, 1.0, 0.0);
        uv = vec2(dot(pos, T), pos.y) / uTexWorldSize;
    }
}

// POM: 16 linear steps + 6 binary steps. Heightmap convention:
// white=high, black=low; shader inverts to depth (1 - h).
vec2 parallaxOcclusion(vec2 uv, vec3 viewTS, float strength) {
    if (strength < 0.001) return uv;
    float vz = max(0.05, abs(viewTS.z));
    vec2 maxOffset = (viewTS.xy / vz) * strength;

    float layerDepth = 1.0 / float(LINEAR_STEPS);
    float currentDepth = 0.0;
    vec2 deltaUV = -maxOffset * layerDepth;
    vec2 currentUV = uv;
    float currentH = 1.0 - texture(uHeightTex, currentUV).r;

    for (int i = 0; i < LINEAR_STEPS; i++) {
        if (currentDepth >= currentH) break;
        currentUV += deltaUV;
        currentH = 1.0 - texture(uHeightTex, currentUV).r;
        currentDepth += layerDepth;
    }

    vec2 prevUV = currentUV - deltaUV;
    float prevDepth = currentDepth - layerDepth;
    for (int i = 0; i < BINARY_STEPS; i++) {
        vec2 midUV = mix(prevUV, currentUV, 0.5);
        float midDepth = mix(prevDepth, currentDepth, 0.5);
        float h = 1.0 - texture(uHeightTex, midUV).r;
        if (midDepth < h) {
            prevUV = midUV; prevDepth = midDepth;
        } else {
            currentUV = midUV; currentDepth = midDepth;
        }
    }
    return currentUV;
}

void main() {
    vec3 N = normalize(vNormal);
    vec2 uv; vec3 T, B;
    surfaceFrame(vWorldPos, N, uv, T, B);

    vec3 viewWS = normalize(uCamPos - vWorldPos);
    vec3 viewTS = vec3(dot(viewWS, T), dot(viewWS, B), dot(viewWS, N));

    vec2 finalUV = (uPomEnabled == 1)
        ? parallaxOcclusion(uv, viewTS, uPomStrength)
        : uv;

    vec3 albedo = texture(uColorTex, finalUV).rgb;

    float lambert = max(0.25, dot(N, normalize(uSunDir)));
    float lit = vLight * 0.55 + lambert * 0.45;

    float dist = length(vWorldPos - uCamPos);
    float fog = clamp(1.0 - exp(-dist * 0.018), 0.0, 0.7);

    vec3 col = albedo * lit;
    vec3 fogCol = vec3(0.10, 0.08, 0.12);
    col = mix(col, fogCol, fog);
    outColor = vec4(col, 1.0);
}`;

function compile(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.error("[wadLevel shader]", gl.getShaderInfoLog(sh));
    }
    return sh;
}

function base64ToFloat32(b64) {
    const binStr = atob(b64);
    const bytes = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
    return new Float32Array(bytes.buffer);
}

// Fetch raw RGBA bytes from the bridge for one texture slot. Returns
// { width, height, name, source, canvas } where canvas is an
// HTMLCanvasElement holding the pixels (so HeightmapDeriver can
// consume it via drawImage).
async function fetchTexture(bridgeUrl, which) {
    const res = await fetch(`${bridgeUrl}/api/wad/textures/${which}.bin`);
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${which}`);
    const w = parseInt(res.headers.get("X-Texture-Width"), 10);
    const h = parseInt(res.headers.get("X-Texture-Height"), 10);
    const name   = res.headers.get("X-Texture-Name")   || "?";
    const source = res.headers.get("X-Texture-Source") || "?";
    const buf = new Uint8ClampedArray(await res.arrayBuffer());
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    const img = new ImageData(buf, w, h);
    ctx.putImageData(img, 0, 0);
    return { width: w, height: h, name, source, canvas: c };
}

function uploadGLTexture(gl, canvas) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);
    return tex;
}

export class WadLevelRenderer {
    constructor(gl, opts = {}) {
        this.gl = gl;
        this.bridgeUrl = opts.bridgeUrl ?? BRIDGE_URL_DEFAULT;
        this.geometry = null;
        this.program = null;
        this.floor = null;
        this.ceiling = null;
        this.walls = null;
        this.wallColorTex = null;
        this.wallHeightTex = null;
        this.floorColorTex = null;
        this.floorHeightTex = null;
        this.textureInfo = null;
        this.loaded = false;
        this.pomEnabled = true;
        this.pomStrength = 0.05;
        this._buildProgram();
    }

    _buildProgram() {
        const gl = this.gl;
        const vs = compile(gl, gl.VERTEX_SHADER, VS);
        const fs = compile(gl, gl.FRAGMENT_SHADER, FS);
        const prog = gl.createProgram();
        gl.attachShader(prog, vs); gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            console.error("[wadLevel] link:", gl.getProgramInfoLog(prog));
            return;
        }
        prog.uMVP          = gl.getUniformLocation(prog, "uMVP");
        prog.uCamPos       = gl.getUniformLocation(prog, "uCamPos");
        prog.uSunDir       = gl.getUniformLocation(prog, "uSunDir");
        prog.uColorTex     = gl.getUniformLocation(prog, "uColorTex");
        prog.uHeightTex    = gl.getUniformLocation(prog, "uHeightTex");
        prog.uTexWorldSize = gl.getUniformLocation(prog, "uTexWorldSize");
        prog.uPomStrength  = gl.getUniformLocation(prog, "uPomStrength");
        prog.uPomEnabled   = gl.getUniformLocation(prog, "uPomEnabled");
        this.program = prog;
    }

    async load() {
        try {
            const [geomRes, wallTex, floorTex] = await Promise.all([
                fetch(this.bridgeUrl + "/api/wad/geometry"),
                fetchTexture(this.bridgeUrl, "wall"),
                fetchTexture(this.bridgeUrl, "floor"),
            ]);
            if (!geomRes.ok) throw new Error("geometry HTTP " + geomRes.status);
            const data = await geomRes.json();
            this.geometry = {
                name: data.name,
                scale: data.scale,
                bounds: data.bounds,
                floorVerts:    base64ToFloat32(data.floorVertsB64),
                floorTriCount: data.floorTriCount,
                ceilingVerts:    base64ToFloat32(data.ceilingVertsB64),
                ceilingTriCount: data.ceilingTriCount,
                wallVerts:    base64ToFloat32(data.wallVertsB64),
                wallTriCount: data.wallTriCount,
                playerStarts: data.playerStarts,
                deathmatchStarts: data.deathmatchStarts || [],
                collisionWalls:   data.collisionWalls || [],
                info: data.info,
            };
            this._uploadBatches();

            // Derive heightmaps via the shared HeightmapDeriver.
            // contrast 1.6 + center 96 works for both procedural brick
            // and Doom STARTAN/BROWN-style textures.
            const wallHeight  = deriveFromLuminance(wallTex.canvas,  { contrast: 1.6, centerLuma: 96 });
            const floorHeight = deriveFromLuminance(floorTex.canvas, { contrast: 1.6, centerLuma: 96 });

            this.wallColorTex   = uploadGLTexture(this.gl, wallTex.canvas);
            this.wallHeightTex  = uploadGLTexture(this.gl, wallHeight);
            this.floorColorTex  = uploadGLTexture(this.gl, floorTex.canvas);
            this.floorHeightTex = uploadGLTexture(this.gl, floorHeight);
            this.textureInfo = {
                wall:  { name: wallTex.name,  w: wallTex.width,  h: wallTex.height  },
                floor: { name: floorTex.name, w: floorTex.width, h: floorTex.height },
                source: wallTex.source,
            };
            this.loaded = true;
            console.log(`[wadLevel] loaded ${this.geometry.name} + textures `
                      + `wall=${wallTex.name} floor=${floorTex.name} (source=${wallTex.source})`);
            return true;
        } catch (e) {
            console.warn("[wadLevel] load failed:", e);
            return false;
        }
    }

    _uploadBatches() {
        this.floor   = this._uploadBatch(this.geometry.floorVerts,   this.geometry.floorTriCount);
        this.ceiling = this._uploadBatch(this.geometry.ceilingVerts, this.geometry.ceilingTriCount);
        this.walls   = this._uploadBatch(this.geometry.wallVerts,    this.geometry.wallTriCount);
    }

    _uploadBatch(verts, triCount) {
        const gl = this.gl;
        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
        const stride = 7 * 4;
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 24);
        return { vao, buf, triCount };
    }

    setPomEnabled(on)      { this.pomEnabled = !!on; }
    setPomStrength(value)  { this.pomStrength = Math.max(0, Math.min(0.2, +value || 0)); }
    isPomEnabled()         { return this.pomEnabled; }
    getPomStrength()       { return this.pomStrength; }

    render(viewMat, projMat, camPos) {
        if (!this.loaded || !this.program) return;
        const gl = this.gl;
        gl.useProgram(this.program);
        gl.enable(gl.DEPTH_TEST);
        gl.enable(gl.CULL_FACE);
        gl.cullFace(gl.BACK);
        gl.frontFace(gl.CCW);

        const mvp = mat4Mul(projMat, viewMat);
        gl.uniformMatrix4fv(this.program.uMVP, false, mvp);
        gl.uniform3f(this.program.uCamPos, camPos[0], camPos[1], camPos[2]);
        gl.uniform3f(this.program.uSunDir, 0.4, 0.7, 0.6);
        gl.uniform1f(this.program.uTexWorldSize, TEX_WORLD_SIZE);
        gl.uniform1f(this.program.uPomStrength, this.pomStrength);
        gl.uniform1i(this.program.uPomEnabled, this.pomEnabled ? 1 : 0);
        gl.uniform1i(this.program.uColorTex,  0);
        gl.uniform1i(this.program.uHeightTex, 1);

        // Round 276 — toggleable floor/ceiling rendering. The wad_arena
        // demo uses noFloor=true to see the engine's voxel ground
        // THROUGH the WAD level (the "no voxel ground" arena option).
        // Walls always render.
        if (!this.noFloor) {
            // Floors + ceilings share the flat texture
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.floorColorTex);
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, this.floorHeightTex);
            gl.bindVertexArray(this.floor.vao);
            gl.drawArrays(gl.TRIANGLES, 0, this.floor.triCount * 3);
        }
        if (!this.noCeiling) {
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.floorColorTex);
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, this.floorHeightTex);
            gl.bindVertexArray(this.ceiling.vao);
            gl.drawArrays(gl.TRIANGLES, 0, this.ceiling.triCount * 3);
        }

        // Walls use the composite wall texture
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.wallColorTex);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.wallHeightTex);
        gl.bindVertexArray(this.walls.vao);
        gl.drawArrays(gl.TRIANGLES, 0, this.walls.triCount * 3);
    }

    // Round 276 — flat-floor option: disable WAD-level floor rendering
    // so the engine's voxel terrain shows through. Call from the demo
    // after level.load() to toggle.
    setNoFloor(flag) { this.noFloor = !!flag; }
    setNoCeiling(flag) { this.noCeiling = !!flag; }

    dispose() {
        const gl = this.gl;
        for (const batch of [this.floor, this.ceiling, this.walls]) {
            if (batch?.vao) gl.deleteVertexArray(batch.vao);
            if (batch?.buf) gl.deleteBuffer(batch.buf);
        }
        for (const tex of [this.wallColorTex, this.wallHeightTex, this.floorColorTex, this.floorHeightTex]) {
            if (tex) gl.deleteTexture(tex);
        }
        if (this.program) gl.deleteProgram(this.program);
        this.floor = this.ceiling = this.walls = null;
        this.wallColorTex = this.wallHeightTex = null;
        this.floorColorTex = this.floorHeightTex = null;
        this.program = null;
        this.loaded = false;
    }

    getPrimarySpawn() {
        if (!this.geometry?.playerStarts?.length) {
            const b = this.geometry?.bounds;
            if (!b) return { x: 0, y: 1.5, z: 0, angle: 0 };
            return {
                x: (b.minX + b.maxX) * 0.5,
                y: b.minY + 1.6,
                z: (b.minZ + b.maxZ) * 0.5,
                angle: 0,
            };
        }
        return this.geometry.playerStarts[0];
    }

    getBounds() { return this.geometry?.bounds ?? null; }
    getName()   { return this.geometry?.name ?? "?"; }
    getTextureInfo() { return this.textureInfo; }
}

function mat4Mul(a, b) {
    const r = new Array(16);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        r[j * 4 + i] = a[0 * 4 + i] * b[j * 4 + 0]
                     + a[1 * 4 + i] * b[j * 4 + 1]
                     + a[2 * 4 + i] * b[j * 4 + 2]
                     + a[3 * 4 + i] * b[j * 4 + 3];
    }
    return r;
}
