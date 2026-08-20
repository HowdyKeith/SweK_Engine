// WebGLEngine/ev/galaxyMap.js — renders an EV universe graph (from evData.js buildUniverse) as a galaxy map in
// WebGL2: systems as glowing points colored by government, hyperspace links as lines, with pan / zoom / hover.
// Pure geometry+transform+color helpers are split out and unit-testable; the GalaxyMap factory does the GL.
//
//   import { buildUniverse } from "./evData.js";
//   import { GalaxyMap } from "./galaxyMap.js";
//   const map = GalaxyMap(canvas, { onHover: (sys)=>{...} });
//   map.setUniverse(buildUniverse(rf));   // builds buffers + fits view
//   // pan = drag, zoom = wheel, hover = mousemove
//
// Milestone 3 of the EV-compatible engine: first time a real mod's universe shows up on screen.

// ---------- pure helpers (no WebGL / DOM) ----------

function hslToRgb(h, s, l) {
    const f = (n) => { const k = (n + h * 12) % 12; const a = s * Math.min(l, 1 - l); return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
    return [f(0), f(8), f(4)];
}

// Stable distinct color per government; independent systems (govt < 128 / unset) get a neutral steel color.
function govtColor(govtId) {
    if (govtId == null || govtId < 128) return [0.62, 0.65, 0.72];
    const hash = (Math.imul(govtId, 2654435761) >>> 0) / 4294967296;   // 0..1
    return hslToRgb(hash, 0.55, 0.62);
}

function computeBounds(systems) {
    if (!systems || !systems.length) return { minX: -100, minY: -100, maxX: 100, maxY: 100, cx: 0, cy: 0, w: 200, h: 200 };
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const s of systems) { if (s.x < minX) minX = s.x; if (s.y < minY) minY = s.y; if (s.x > maxX) maxX = s.x; if (s.y > maxY) maxY = s.y; }
    const w = Math.max(1, maxX - minX), h = Math.max(1, maxY - minY);
    return { minX, minY, maxX, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, w, h };
}

function buildPointData(systems) {
    const pos = new Float32Array(systems.length * 2), col = new Float32Array(systems.length * 3);
    systems.forEach((s, i) => {
        pos[i * 2] = s.x; pos[i * 2 + 1] = s.y;
        const c = govtColor(s.govt); col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
    });
    return { pos, col };
}

// Each undirected hyperspace link once, only when both endpoints exist.
function buildLinkData(systems, systemById) {
    const seen = new Set(), seg = [];
    for (const s of systems) for (const id of (s.links || [])) {
        const t = systemById[id]; if (!t) continue;
        const key = s.id < id ? s.id + ":" + id : id + ":" + s.id;
        if (seen.has(key)) continue; seen.add(key);
        seg.push(s.x, s.y, t.x, t.y);
    }
    return new Float32Array(seg);
}

// v2172 -- wormholes: a separate segment list, drawn in their own colour. Only `mappable` ones appear;
// the rest are meant to be found by flying into them, and putting them on the map would give the game
// away. Links are directed in the data, but a line has no direction, so each pair is drawn once.
function buildWormholeData(wormholes, systemById) {
    const seen = new Set(), seg = [];
    for (const wh of wormholes || []) {
        if (!wh.mappable) continue;
        for (const l of wh.links || []) {
            const a = systemById[l.from], b = systemById[l.to];
            if (!a || !b) continue;
            const key = l.from < l.to ? l.from + ":" + l.to : l.to + ":" + l.from;
            if (seen.has(key)) continue; seen.add(key);
            seg.push(a.x, a.y, b.x, b.y);
        }
    }
    return new Float32Array(seg);
}

// view = { x, y, scale }: world point (x,y) sits at screen center; scale = pixels per world unit.
function fitView(bounds, W, H, margin = 1.25) {
    const sc = Math.min(W / (bounds.w * margin), H / (bounds.h * margin));
    return { x: bounds.cx, y: bounds.cy, scale: (isFinite(sc) && sc > 0) ? sc : 1 };
}
function worldToScreen(view, W, H, wx, wy) { return { sx: (wx - view.x) * view.scale + W / 2, sy: (wy - view.y) * view.scale + H / 2 }; }
function screenToWorld(view, W, H, sx, sy) { return { wx: (sx - W / 2) / view.scale + view.x, wy: (sy - H / 2) / view.scale + view.y }; }

// Nearest system to a world point within maxDist (world units), or null.
function pickSystem(systems, wx, wy, maxDist) {
    let best = null, bestD = maxDist * maxDist;
    for (const s of systems) { const dx = s.x - wx, dy = s.y - wy, d = dx * dx + dy * dy; if (d <= bestD) { bestD = d; best = s; } }
    return best;
}

// ---------- WebGL2 renderer ----------

const PT_VS = `#version 300 es
precision highp float;
in vec2 a_pos; in vec3 a_color;
uniform vec2 u_center; uniform float u_scale; uniform vec2 u_res; uniform float u_size;
out vec3 v_color;
void main(){
  vec2 screen = (a_pos - u_center) * u_scale + u_res * 0.5;
  vec2 clip = vec2(screen.x / u_res.x * 2.0 - 1.0, 1.0 - screen.y / u_res.y * 2.0);
  gl_Position = vec4(clip, 0.0, 1.0);
  gl_PointSize = u_size;
  v_color = a_color;
}`;
const PT_FS = `#version 300 es
precision highp float;
in vec3 v_color; out vec4 frag;
void main(){
  float r = length(gl_PointCoord - vec2(0.5)) * 2.0;
  float core = smoothstep(1.0, 0.0, r);
  float a = pow(core, 2.0);
  if (a < 0.02) discard;
  vec3 c = mix(v_color, vec3(1.0), pow(core, 6.0) * 0.7);
  frag = vec4(c, a);
}`;
const LN_VS = `#version 300 es
precision highp float;
in vec2 a_pos;
uniform vec2 u_center; uniform float u_scale; uniform vec2 u_res;
void main(){
  vec2 screen = (a_pos - u_center) * u_scale + u_res * 0.5;
  vec2 clip = vec2(screen.x / u_res.x * 2.0 - 1.0, 1.0 - screen.y / u_res.y * 2.0);
  gl_Position = vec4(clip, 0.0, 1.0);
}`;
const LN_FS = `#version 300 es
precision highp float;
uniform vec4 u_color; out vec4 frag;
void main(){ frag = u_color; }`;

function compile(gl, type, src) {
    const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error("shader: " + gl.getShaderInfoLog(sh));
    return sh;
}
function program(gl, vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs)); gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error("link: " + gl.getProgramInfoLog(p));
    return p;
}

function GalaxyMap(canvas, opts = {}) {
    const gl = canvas.getContext("webgl2", { antialias: true, alpha: false });
    if (!gl) throw new Error("WebGL2 not available");
    const ptProg = program(gl, PT_VS, PT_FS), lnProg = program(gl, LN_VS, LN_FS);
    const ptLoc = { a_pos: gl.getAttribLocation(ptProg, "a_pos"), a_color: gl.getAttribLocation(ptProg, "a_color"),
        u_center: gl.getUniformLocation(ptProg, "u_center"), u_scale: gl.getUniformLocation(ptProg, "u_scale"),
        u_res: gl.getUniformLocation(ptProg, "u_res"), u_size: gl.getUniformLocation(ptProg, "u_size") };
    const lnLoc = { a_pos: gl.getAttribLocation(lnProg, "a_pos"), u_center: gl.getUniformLocation(lnProg, "u_center"),
        u_scale: gl.getUniformLocation(lnProg, "u_scale"), u_res: gl.getUniformLocation(lnProg, "u_res"), u_color: gl.getUniformLocation(lnProg, "u_color") };
    const posBuf = gl.createBuffer(), colBuf = gl.createBuffer(), lnBuf = gl.createBuffer(), whBuf = gl.createBuffer();

    let uni = null, view = { x: 0, y: 0, scale: 1 }, nPoints = 0, nLineVerts = 0, nWormVerts = 0;
    const dims = () => ({ W: canvas.width, H: canvas.height });

    function setUniverse(u) {
        uni = u;
        const { pos, col } = buildPointData(u.systems);
        const lines = buildLinkData(u.systems, u.systemById);
        const worms = buildWormholeData(u.wormholes, u.systemById);
        nPoints = u.systems.length; nLineVerts = lines.length / 2; nWormVerts = worms.length / 2;
        gl.bindBuffer(gl.ARRAY_BUFFER, posBuf); gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, colBuf); gl.bufferData(gl.ARRAY_BUFFER, col, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, lnBuf); gl.bufferData(gl.ARRAY_BUFFER, lines, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, whBuf); gl.bufferData(gl.ARRAY_BUFFER, worms, gl.STATIC_DRAW);
        fit(); render();
    }
    function fit() { const { W, H } = dims(); if (uni) view = fitView(computeBounds(uni.systems), W, H); }

    function render() {
        const { W, H } = dims();
        gl.viewport(0, 0, W, H);
        gl.clearColor(0.02, 0.025, 0.05, 1); gl.clear(gl.COLOR_BUFFER_BIT);
        gl.enable(gl.BLEND);
        if (!uni) return;
        // links (normal alpha)
        if (nLineVerts) {
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
            gl.useProgram(lnProg);
            gl.uniform2f(lnLoc.u_center, view.x, view.y); gl.uniform1f(lnLoc.u_scale, view.scale);
            gl.uniform2f(lnLoc.u_res, W, H); gl.uniform4f(lnLoc.u_color, 0.30, 0.45, 0.75, 0.35);
            gl.bindBuffer(gl.ARRAY_BUFFER, lnBuf); gl.enableVertexAttribArray(lnLoc.a_pos);
            gl.vertexAttribPointer(lnLoc.a_pos, 2, gl.FLOAT, false, 0, 0);
            gl.drawArrays(gl.LINES, 0, nLineVerts);
        }
        // wormhole links, on top of the hyperspace lanes and in a colour you cannot mistake for one
        if (nWormVerts) {
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
            gl.useProgram(lnProg);
            gl.uniform2f(lnLoc.u_center, view.x, view.y); gl.uniform1f(lnLoc.u_scale, view.scale);
            gl.uniform2f(lnLoc.u_res, W, H); gl.uniform4f(lnLoc.u_color, 0.55, 0.90, 0.75, 0.55);
            gl.bindBuffer(gl.ARRAY_BUFFER, whBuf); gl.enableVertexAttribArray(lnLoc.a_pos);
            gl.vertexAttribPointer(lnLoc.a_pos, 2, gl.FLOAT, false, 0, 0);
            gl.drawArrays(gl.LINES, 0, nWormVerts);
        }
        // points (additive glow)
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        gl.useProgram(ptProg);
        gl.uniform2f(ptLoc.u_center, view.x, view.y); gl.uniform1f(ptLoc.u_scale, view.scale);
        gl.uniform2f(ptLoc.u_res, W, H); gl.uniform1f(ptLoc.u_size, Math.max(6, Math.min(22, view.scale * 5)));
        gl.bindBuffer(gl.ARRAY_BUFFER, posBuf); gl.enableVertexAttribArray(ptLoc.a_pos); gl.vertexAttribPointer(ptLoc.a_pos, 2, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, colBuf); gl.enableVertexAttribArray(ptLoc.a_color); gl.vertexAttribPointer(ptLoc.a_color, 3, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.POINTS, 0, nPoints);
    }

    // ---- interaction ----
    let dragging = false, moved = false, lastX = 0, lastY = 0;
    function localXY(e) { const r = canvas.getBoundingClientRect(); return { sx: (e.clientX - r.left) * (canvas.width / r.width), sy: (e.clientY - r.top) * (canvas.height / r.height) }; }
    canvas.addEventListener("pointerdown", (e) => { dragging = true; moved = false; lastX = e.clientX; lastY = e.clientY; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener("pointerup", (e) => {
        dragging = false; try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
        if (!moved && uni && opts.onSelect) { const { sx, sy } = localXY(e), { W, H } = dims(); const w = screenToWorld(view, W, H, sx, sy); const s = pickSystem(uni.systems, w.wx, w.wy, 14 / view.scale); if (s) opts.onSelect(s); }
    });
    canvas.addEventListener("pointermove", (e) => {
        const r = canvas.getBoundingClientRect(), scaleX = canvas.width / r.width, scaleY = canvas.height / r.height;
        if (dragging) {
            if (Math.abs(e.clientX - lastX) + Math.abs(e.clientY - lastY) > 3) moved = true;
            view.x -= (e.clientX - lastX) * scaleX / view.scale; view.y -= (e.clientY - lastY) * scaleY / view.scale;
            lastX = e.clientX; lastY = e.clientY; render();
        } else if (uni && opts.onHover) {
            const { sx, sy } = localXY(e), { W, H } = dims();
            const w = screenToWorld(view, W, H, sx, sy);
            opts.onHover(pickSystem(uni.systems, w.wx, w.wy, 14 / view.scale), { sx, sy });
        }
    });
    canvas.addEventListener("wheel", (e) => {
        e.preventDefault(); const { sx, sy } = localXY(e), { W, H } = dims();
        const before = screenToWorld(view, W, H, sx, sy);
        view.scale *= Math.exp(-e.deltaY * 0.0015);
        view.scale = Math.max(0.02, Math.min(2000, view.scale));
        const after = screenToWorld(view, W, H, sx, sy);
        view.x += before.wx - after.wx; view.y += before.wy - after.wy; render();
    }, { passive: false });

    function resize() { const r = canvas.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.max(1, Math.round(r.width * dpr)); canvas.height = Math.max(1, Math.round(r.height * dpr)); render(); }

    return { setUniverse, render, fit, resize, getView: () => view,
        focusSystem(s) { if (s) { view.x = s.x; view.y = s.y; render(); } } };
}

export { GalaxyMap, govtColor, computeBounds, buildPointData, buildLinkData, buildWormholeData, fitView, worldToScreen, screenToWorld, pickSystem };
