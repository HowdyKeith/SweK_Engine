// =============================================================================
// FILE: /ui/objPreview.js
// ROUND: 187
// =============================================================================
//
// Standalone WebGL2 OBJ previewer for the bench's step-2 results card.
// Takes an OBJ text string, returns a DOM container with:
//   - A small canvas rendering the mesh flat-shaded with one directional light
//   - Auto-rotation by default; mouse-drag temporarily overrides
//   - A "raw text" toggle to fall back to the previous plain-text view
//   - A "vertex / triangle" count badge bottom-left
//
// Parses only the OBJ subset the C3D model emits: `v x y z` and `f` lines
// (handles `f a b c`, `f a/t b/t c/t`, `f a//n b//n c//n`, `f a/t/n b/t/n c/t/n`).
// Faces with > 3 vertices are triangulated as a fan. Everything else (vt, vn,
// usemtl, o, g, mtllib, comments) is silently skipped.
//
// No external dependencies — uses WebGL2 directly. Math is just enough to
// build a perspective-projected, Y-rotating camera at fixed distance,
// auto-fit to the mesh's bounding box.
//
// Public API:
//   createObjPreview(objText, opts?) → { element, dispose() }
//     element   — HTMLElement to append into the step result panel
//     dispose() — stop animation, free GL resources
//
//   opts: { width=260, height=180, autoRotate=true, bg="#0a0a0a" }
// =============================================================================

const VERT_SRC = `#version 300 es
in vec3 aPos;
in vec3 aNormal;
uniform mat4 uMVP;
uniform mat3 uNormalMat;
out vec3 vWorldNormal;
void main() {
    vWorldNormal = normalize(uNormalMat * aNormal);
    gl_Position = uMVP * vec4(aPos, 1.0);
}`;

const FRAG_SRC = `#version 300 es
precision mediump float;
in vec3 vWorldNormal;
out vec4 outColor;
const vec3 LIGHT_DIR = normalize(vec3(0.5, 0.8, 0.6));
const vec3 BASE      = vec3(0.55, 0.62, 0.72);
const vec3 RIM       = vec3(0.95, 0.85, 0.65);
const float AMBIENT  = 0.22;
void main() {
    vec3 n = normalize(vWorldNormal);
    float ndl = max(dot(n, LIGHT_DIR), 0.0);
    // Wrap-around half-lambert keeps the shadow side from going black.
    float wrap = (dot(n, LIGHT_DIR) * 0.5 + 0.5);
    wrap *= wrap;
    vec3 col = BASE * (AMBIENT + 0.85 * wrap) + RIM * pow(ndl, 4.0) * 0.4;
    outColor = vec4(col, 1.0);
}`;

// ----- OBJ parser -----

// Returns { positions: Float32Array, normals: Float32Array,
//           vertexCount, triangleCount, parseError? }
// Triangulates fan polygons. Computes flat (per-triangle) normals,
// expanded out so each triangle has its own 3 verts — keeps the
// shader trivial and the preview crisp at low poly counts.
function _parseObj(text) {
    const rawVerts = [];           // [[x,y,z], ...]
    const faces    = [];           // [[i0, i1, i2], ...] (1-indexed -> we'll fix)
    let parseError = null;

    const lines = text.split(/\r?\n/);
    for (let li = 0; li < lines.length; li++) {
        const line = lines[li].trim();
        if (!line || line.startsWith("#")) continue;
        const parts = line.split(/\s+/);
        const tag = parts[0];
        if (tag === "v") {
            const x = parseFloat(parts[1]);
            const y = parseFloat(parts[2]);
            const z = parseFloat(parts[3]);
            if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
                rawVerts.push([x, y, z]);
            }
        } else if (tag === "f") {
            // Each face vertex is "v", "v/t", "v//n", or "v/t/n".
            // We only want the v index (first slot).
            const idxs = [];
            for (let i = 1; i < parts.length; i++) {
                const slot0 = parts[i].split("/")[0];
                const n = parseInt(slot0, 10);
                if (Number.isFinite(n) && n !== 0) idxs.push(n);
            }
            if (idxs.length < 3) continue;
            // Fan-triangulate. OBJ indices are 1-based; negative means
            // "from end" per spec — handle both. Skip the face if any
            // index references a vert we don't have.
            const resolved = idxs.map(n =>
                n > 0 ? n - 1 : rawVerts.length + n
            );
            for (let i = 1; i + 1 < resolved.length; i++) {
                const a = resolved[0], b = resolved[i], c = resolved[i + 1];
                if (a >= 0 && b >= 0 && c >= 0 &&
                    a < rawVerts.length && b < rawVerts.length && c < rawVerts.length) {
                    faces.push([a, b, c]);
                }
            }
        }
        // Everything else (vt, vn, usemtl, o, g, mtllib, s) — skip.
    }

    if (rawVerts.length === 0 || faces.length === 0) {
        parseError = `parsed ${rawVerts.length} verts and ${faces.length} tris — not enough to render`;
        return { positions: null, normals: null, vertexCount: 0, triangleCount: 0, parseError };
    }

    // Expand triangles with flat normals: 3 verts per triangle, no sharing.
    // This costs 3x memory but the preview is small and the shading
    // looks correct without per-vertex normal averaging.
    const triCount = faces.length;
    const positions = new Float32Array(triCount * 9);
    const normals   = new Float32Array(triCount * 9);
    for (let t = 0; t < triCount; t++) {
        const [ia, ib, ic] = faces[t];
        const a = rawVerts[ia], b = rawVerts[ib], c = rawVerts[ic];
        // Flat normal via cross product of two edges
        const ex = b[0] - a[0], ey = b[1] - a[1], ez = b[2] - a[2];
        const fx = c[0] - a[0], fy = c[1] - a[1], fz = c[2] - a[2];
        let nx = ey * fz - ez * fy;
        let ny = ez * fx - ex * fz;
        let nz = ex * fy - ey * fx;
        const nlen = Math.hypot(nx, ny, nz) || 1.0;
        nx /= nlen; ny /= nlen; nz /= nlen;
        const o = t * 9;
        positions[o + 0] = a[0]; positions[o + 1] = a[1]; positions[o + 2] = a[2];
        positions[o + 3] = b[0]; positions[o + 4] = b[1]; positions[o + 5] = b[2];
        positions[o + 6] = c[0]; positions[o + 7] = c[1]; positions[o + 8] = c[2];
        normals[o + 0] = nx; normals[o + 1] = ny; normals[o + 2] = nz;
        normals[o + 3] = nx; normals[o + 4] = ny; normals[o + 5] = nz;
        normals[o + 6] = nx; normals[o + 7] = ny; normals[o + 8] = nz;
    }
    return {
        positions, normals,
        vertexCount:   rawVerts.length,
        triangleCount: triCount,
    };
}

// ----- Tiny matrix math (just enough for one orbital camera) -----
//
// Round 295 — pooled. The render loop calls _perspective × 1, _rotY ×1,
// _rotX ×1, _translate ×2, _scale ×1, _mul4 ×4 per frame. Allocating
// fresh Float32Array(16)s for each was ~9 allocations/render × ~30fps
// = ~270 small GC objects/sec while the preview is visible. Now each
// builder writes into a passed `out` buffer; _mul4 needs an output
// distinct from its inputs, so we use a small pool of 6 scratch
// matrices the render loop cycles through.

const _MATBUF = [
    new Float32Array(16), new Float32Array(16), new Float32Array(16),
    new Float32Array(16), new Float32Array(16), new Float32Array(16),
];
const _PROJ_SCRATCH = new Float32Array(16);
let _matCursor = 0;
function _nextMat() {
    const m = _MATBUF[_matCursor];
    _matCursor = (_matCursor + 1) % _MATBUF.length;
    return m;
}

function _identity4(out) {
    out = out || _nextMat();
    out[0]=1; out[1]=0; out[2]=0; out[3]=0;
    out[4]=0; out[5]=1; out[6]=0; out[7]=0;
    out[8]=0; out[9]=0; out[10]=1; out[11]=0;
    out[12]=0; out[13]=0; out[14]=0; out[15]=1;
    return out;
}

function _perspective(fovYRad, aspect, near, far, out) {
    const f = 1 / Math.tan(fovYRad / 2);
    const nf = 1 / (near - far);
    out = out || _nextMat();
    out[0]=f/aspect; out[1]=0; out[2]=0; out[3]=0;
    out[4]=0; out[5]=f; out[6]=0; out[7]=0;
    out[8]=0; out[9]=0; out[10]=(far+near)*nf; out[11]=-1;
    out[12]=0; out[13]=0; out[14]=2*far*near*nf; out[15]=0;
    return out;
}

function _mul4(a, b, out) {
    out = out || _nextMat();
    // Caller must ensure `out` doesn't alias `a` or `b` — the pool
    // cursor handles this by always returning a different slot.
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
        let s = 0;
        for (let k = 0; k < 4; k++) s += a[r + k*4] * b[k + c*4];
        out[r + c*4] = s;
    }
    return out;
}

function _rotY(rad, out) {
    const c = Math.cos(rad), s = Math.sin(rad);
    out = out || _nextMat();
    out[0]=c; out[1]=0; out[2]=-s; out[3]=0;
    out[4]=0; out[5]=1; out[6]=0; out[7]=0;
    out[8]=s; out[9]=0; out[10]=c; out[11]=0;
    out[12]=0; out[13]=0; out[14]=0; out[15]=1;
    return out;
}
function _rotX(rad, out) {
    const c = Math.cos(rad), s = Math.sin(rad);
    out = out || _nextMat();
    out[0]=1; out[1]=0; out[2]=0; out[3]=0;
    out[4]=0; out[5]=c; out[6]=s; out[7]=0;
    out[8]=0; out[9]=-s; out[10]=c; out[11]=0;
    out[12]=0; out[13]=0; out[14]=0; out[15]=1;
    return out;
}
function _translate(x, y, z, out) {
    out = out || _nextMat();
    out[0]=1; out[1]=0; out[2]=0; out[3]=0;
    out[4]=0; out[5]=1; out[6]=0; out[7]=0;
    out[8]=0; out[9]=0; out[10]=1; out[11]=0;
    out[12]=x; out[13]=y; out[14]=z; out[15]=1;
    return out;
}
function _scale(s, out) {
    out = out || _nextMat();
    out[0]=s; out[1]=0; out[2]=0; out[3]=0;
    out[4]=0; out[5]=s; out[6]=0; out[7]=0;
    out[8]=0; out[9]=0; out[10]=s; out[11]=0;
    out[12]=0; out[13]=0; out[14]=0; out[15]=1;
    return out;
}

const _NORMAL_SCRATCH = new Float32Array(9);
// Extract upper-left 3x3 from a 4x4, transpose-inverse skipped (uniform scale
// means rotation matrix is already orthogonal; for our case scale is uniform).
function _normalMat3FromMV(mv, out) {
    out = out || _NORMAL_SCRATCH;
    out[0]=mv[0]; out[1]=mv[1]; out[2]=mv[2];
    out[3]=mv[4]; out[4]=mv[5]; out[5]=mv[6];
    out[6]=mv[8]; out[7]=mv[9]; out[8]=mv[10];
    return out;
}

// ----- Public factory -----

export function createObjPreview(objText, opts = {}) {
    const width      = opts.width      ?? 260;
    const height     = opts.height     ?? 180;
    const autoRotate = opts.autoRotate ?? true;
    const bg         = opts.bg         ?? "#0a0a0a";

    const parsed = _parseObj(objText || "");
    const container = document.createElement("div");
    container.style.cssText =
        "position:relative; display:inline-block; border:1px solid #333; " +
        "border-radius:4px; background:" + bg + "; overflow:hidden;";

    // Parse-failure fallback: render the raw text in a <pre>
    if (parsed.parseError) {
        const note = document.createElement("div");
        note.style.cssText = "padding:8px 10px; color:#ff8a8a; font-size:10px; font-style:italic;";
        note.textContent = "couldn't render preview: " + parsed.parseError + ". Showing raw text below.";
        container.appendChild(note);
        const pre = document.createElement("pre");
        pre.style.cssText = "margin:0; padding:8px 10px; font-size:10px; color:#bbb; max-height:200px; overflow:auto; white-space:pre-wrap; background:#000;";
        pre.textContent = objText;
        container.appendChild(pre);
        return { element: container, dispose() {} };
    }

    const canvas = document.createElement("canvas");
    canvas.width  = width;
    canvas.height = height;
    canvas.style.cssText = "display:block; cursor:grab;";
    container.appendChild(canvas);

    // Vertex / triangle badge bottom-left
    const badge = document.createElement("div");
    badge.style.cssText =
        "position:absolute; left:6px; bottom:4px; font-size:9px; color:#888; " +
        "background:rgba(0,0,0,0.55); padding:1px 5px; border-radius:2px; " +
        "pointer-events:none; font-family:monospace;";
    badge.textContent = `${parsed.vertexCount}v · ${parsed.triangleCount}△`;
    container.appendChild(badge);

    // "Raw text" toggle top-right
    const toggle = document.createElement("button");
    toggle.style.cssText =
        "position:absolute; right:4px; top:4px; font-size:9px; padding:2px 6px; " +
        "background:#1a1a1a; color:#aaa; border:1px solid #444; border-radius:3px; " +
        "cursor:pointer; font-family:monospace;";
    toggle.textContent = "raw";
    toggle.title = "Toggle raw OBJ text";
    container.appendChild(toggle);

    // Hidden raw-text pane (lazy)
    let rawPane = null;
    let showingRaw = false;
    toggle.addEventListener("click", (ev) => {
        ev.stopPropagation();
        showingRaw = !showingRaw;
        if (showingRaw) {
            if (!rawPane) {
                rawPane = document.createElement("pre");
                rawPane.style.cssText =
                    "position:absolute; inset:0; margin:0; padding:8px 10px; " +
                    "font-size:9px; color:#bbb; background:#000; overflow:auto; " +
                    "white-space:pre-wrap; word-break:break-word;";
                rawPane.textContent = objText;
                container.appendChild(rawPane);
            }
            rawPane.style.display = "block";
            toggle.textContent = "3D";
        } else {
            if (rawPane) rawPane.style.display = "none";
            toggle.textContent = "raw";
        }
    });

    // ----- WebGL2 setup -----
    const gl = canvas.getContext("webgl2", { antialias: true, alpha: false });
    if (!gl) {
        const fb = document.createElement("div");
        fb.style.cssText = "padding:10px; color:#ff8a8a; font-size:10px;";
        fb.textContent = "WebGL2 unavailable — preview disabled.";
        container.replaceChild(fb, canvas);
        return { element: container, dispose() {} };
    }
    const compile = (type, src) => {
        const sh = gl.createShader(type);
        gl.shaderSource(sh, src); gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
            console.error("[objPreview] shader compile:", gl.getShaderInfoLog(sh));
            gl.deleteShader(sh); return null;
        }
        return sh;
    };
    const vs = compile(gl.VERTEX_SHADER,   VERT_SRC);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG_SRC);
    const program = gl.createProgram();
    gl.attachShader(program, vs); gl.attachShader(program, fs);
    gl.bindAttribLocation(program, 0, "aPos");
    gl.bindAttribLocation(program, 1, "aNormal");
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error("[objPreview] program link:", gl.getProgramInfoLog(program));
    }
    const uMVP        = gl.getUniformLocation(program, "uMVP");
    const uNormalMat  = gl.getUniformLocation(program, "uNormalMat");

    // Center + scale model to fit unit-ish bounds (auto-fit to camera)
    const positions = parsed.positions;
    let minX=+Infinity, minY=+Infinity, minZ=+Infinity;
    let maxX=-Infinity, maxY=-Infinity, maxZ=-Infinity;
    for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i], y = positions[i+1], z = positions[i+2];
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    const cx = (minX + maxX) * 0.5;
    const cy = (minY + maxY) * 0.5;
    const cz = (minZ + maxZ) * 0.5;
    const ext = Math.max(maxX - minX, maxY - minY, maxZ - minZ) || 1;
    const fit = 1.5 / ext;     // target ~1.5 units across, camera at z=4

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    const nbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, nbo);
    gl.bufferData(gl.ARRAY_BUFFER, parsed.normals, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    gl.enable(gl.DEPTH_TEST);
    const bgRgb = _parseHex(bg);
    gl.clearColor(bgRgb[0], bgRgb[1], bgRgb[2], 1);

    const proj = _perspective(Math.PI / 4, width / height, 0.1, 100, _PROJ_SCRATCH);

    // ----- Interaction state -----
    let yaw   = 0.6;        // start at a 3/4 view
    let pitch = -0.25;
    let autoYawSpeed = autoRotate ? 0.5 : 0;   // rad/sec
    let dragging = false;
    let lastX = 0, lastY = 0;
    let userTouched = false;       // pauses auto-rotate permanently after first drag

    canvas.addEventListener("mousedown", (ev) => {
        dragging = true; userTouched = true;
        lastX = ev.clientX; lastY = ev.clientY;
        canvas.style.cursor = "grabbing";
        ev.preventDefault();
    });
    window.addEventListener("mousemove", (ev) => {
        if (!dragging) return;
        const dx = ev.clientX - lastX, dy = ev.clientY - lastY;
        lastX = ev.clientX; lastY = ev.clientY;
        yaw   += dx * 0.01;
        pitch += dy * 0.01;
        pitch = Math.max(-1.4, Math.min(1.4, pitch));
    });
    window.addEventListener("mouseup", () => {
        dragging = false;
        canvas.style.cursor = "grab";
    });
    canvas.addEventListener("dblclick", () => {
        yaw = 0.6; pitch = -0.25;
        userTouched = false;       // double-click also re-enables auto-rotate
        autoYawSpeed = autoRotate ? 0.5 : 0;
    });

    // ----- Render loop -----
    let rafId = 0;
    let disposed = false;
    let lastT = performance.now();
    const tri9 = parsed.triangleCount * 3;

    const draw = (now) => {
        if (disposed) return;
        const dt = Math.min(0.05, (now - lastT) * 0.001);
        lastT = now;
        if (!userTouched) yaw += autoYawSpeed * dt;

        // Model = translate(-center) → scale(fit) → rotY(yaw) → rotX(pitch) → translate(0,0,-4)
        let m = _translate(-cx, -cy, -cz);
        m = _mul4(_scale(fit), m);
        m = _mul4(_rotY(yaw), m);
        m = _mul4(_rotX(pitch), m);
        m = _mul4(_translate(0, 0, -4), m);
        const mvp       = _mul4(proj, m);
        const normalMat = _normalMat3FromMV(m);

        gl.viewport(0, 0, width, height);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.useProgram(program);
        gl.uniformMatrix4fv(uMVP, false, mvp);
        gl.uniformMatrix3fv(uNormalMat, false, normalMat);
        gl.bindVertexArray(vao);
        gl.drawArrays(gl.TRIANGLES, 0, tri9);
        gl.bindVertexArray(null);

        rafId = requestAnimationFrame(draw);
    };
    rafId = requestAnimationFrame(draw);

    return {
        element: container,
        dispose() {
            disposed = true;
            if (rafId) cancelAnimationFrame(rafId);
            try { gl.deleteBuffer(vbo); } catch {}
            try { gl.deleteBuffer(nbo); } catch {}
            try { gl.deleteVertexArray(vao); } catch {}
            try { gl.deleteProgram(program); } catch {}
            try { gl.deleteShader(vs); } catch {}
            try { gl.deleteShader(fs); } catch {}
            try { const _ext = gl.getExtension("WEBGL_lose_context"); if (_ext) _ext.loseContext(); } catch {}   // v2778 - release the context (was leaking on dispose)
        },
    };
}

function _parseHex(c) {
    // "#rgb" or "#rrggbb"
    if (typeof c !== "string") return [0.04, 0.04, 0.04];
    const m = c.replace("#", "");
    if (m.length === 3) {
        return [
            parseInt(m[0]+m[0],16)/255,
            parseInt(m[1]+m[1],16)/255,
            parseInt(m[2]+m[2],16)/255,
        ];
    }
    if (m.length === 6) {
        return [
            parseInt(m.slice(0,2),16)/255,
            parseInt(m.slice(2,4),16)/255,
            parseInt(m.slice(4,6),16)/255,
        ];
    }
    return [0.04, 0.04, 0.04];
}
