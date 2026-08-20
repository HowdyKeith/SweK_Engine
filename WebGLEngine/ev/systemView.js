// WebGLEngine/ev/systemView.js — renders ONE EV system: its stellar objects placed by their in-system x/y
// (0,0 = system center, where the player ship sits), planets vs stations drawn differently, govt-colored,
// landable ones flagged. Pan / zoom / hover / click-to-land. Reuses the pure transform helpers from galaxyMap.
//
//   import { SystemView } from "./systemView.js";
//   const sv = SystemView(canvas, { onSelectSpob:(s)=>{}, onHover:(s)=>{}, onRender:(labels)=>{} });
//   sv.setSystem(universe.systemById[128]);   // a system from buildUniverse
//
// Milestone 4 of the EV-compatible engine: drop into a system and land.

import { govtColor, computeBounds, fitView, worldToScreen, screenToWorld, pickSystem } from "./galaxyMap.js";

// ---------- pure helpers ----------
// kind: 0 = planet, 1 = station, 2 = ship marker
function spobKind(spob) { return spob.isStation ? 1 : 0; }
function spobStyle(spob) {
    const kind = spobKind(spob);
    return { kind, color: govtColor(spob.govt), size: kind === 1 ? 24 : 28, land: !!spob.canLand };
}
// Bounds that always include the system center (0,0) so the ship stays on screen even with off-center planets.
function systemBounds(spobs) {
    const pts = spobs.map((s) => ({ x: s.x, y: s.y })).concat([{ x: 0, y: 0 }]);
    const b = computeBounds(pts);
    // pad so edge planets aren't flush against the frame
    const padX = Math.max(40, b.w * 0.15), padY = Math.max(40, b.h * 0.15);
    return { minX: b.minX - padX, maxX: b.maxX + padX, minY: b.minY - padY, maxY: b.maxY + padY,
        cx: b.cx, cy: b.cy, w: b.w + padX * 2, h: b.h + padY * 2 };
}

// ---------- WebGL2 ----------
const VS = `#version 300 es
precision highp float;
in vec2 a_pos; in vec3 a_color; in float a_kind; in float a_land; in float a_size;
uniform vec2 u_center; uniform float u_scale; uniform vec2 u_res; uniform float u_zoom;
out vec3 v_color; out float v_kind; out float v_land;
void main(){
  vec2 screen = (a_pos - u_center) * u_scale + u_res * 0.5;
  vec2 clip = vec2(screen.x / u_res.x * 2.0 - 1.0, 1.0 - screen.y / u_res.y * 2.0);
  gl_Position = vec4(clip, 0.0, 1.0);
  gl_PointSize = a_size * u_zoom;
  v_color = a_color; v_kind = a_kind; v_land = a_land;
}`;
const FS = `#version 300 es
precision highp float;
in vec3 v_color; in float v_kind; in float v_land; out vec4 frag;
void main(){
  float r = length(gl_PointCoord - vec2(0.5)) * 2.0;
  vec4 c = vec4(0.0);
  if (v_kind < 0.5) {                                   // planet: filled disc, bright core
    float disc = smoothstep(1.0, 0.86, r);
    float core = smoothstep(0.9, 0.0, r);
    c = vec4(mix(v_color, vec3(1.0), pow(core, 4.0) * 0.35), disc);
  } else if (v_kind < 1.5) {                            // station: hollow ring
    c = vec4(v_color, smoothstep(0.12, 0.0, abs(r - 0.78)));
  } else {                                              // ship marker
    c = vec4(0.55, 0.92, 1.0, smoothstep(0.55, 0.0, r));
  }
  if (v_land > 0.5 && v_kind < 1.5) {                   // landable ring
    float ring = smoothstep(0.07, 0.0, abs(r - 1.0));
    c.rgb += vec3(0.35, 0.75, 1.0) * ring; c.a = max(c.a, ring);
  }
  if (c.a < 0.02) discard;
  frag = c;
}`;
function compile(gl, t, s) { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error("shader: " + gl.getShaderInfoLog(sh)); return sh; }
function program(gl, vs, fs) { const p = gl.createProgram(); gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error("link: " + gl.getProgramInfoLog(p)); return p; }

function SystemView(canvas, opts = {}) {
    const gl = canvas.getContext("webgl2", { antialias: true, alpha: false });
    if (!gl) throw new Error("WebGL2 not available");
    const prog = program(gl, VS, FS);
    const loc = { a_pos: gl.getAttribLocation(prog, "a_pos"), a_color: gl.getAttribLocation(prog, "a_color"),
        a_kind: gl.getAttribLocation(prog, "a_kind"), a_land: gl.getAttribLocation(prog, "a_land"), a_size: gl.getAttribLocation(prog, "a_size"),
        u_center: gl.getUniformLocation(prog, "u_center"), u_scale: gl.getUniformLocation(prog, "u_scale"),
        u_res: gl.getUniformLocation(prog, "u_res"), u_zoom: gl.getUniformLocation(prog, "u_zoom") };
    const interleave = gl.createBuffer();   // [x,y,r,g,b,kind,land,size] * n
    const STRIDE = 8 * 4;

    let sys = null, spobs = [], view = { x: 0, y: 0, scale: 1 }, nVerts = 0, dpr = 1;
    const dims = () => ({ W: canvas.width, H: canvas.height });

    function setSystem(system) {
        sys = system; spobs = (system && system.spobs) || [];
        const verts = [];
        for (const s of spobs) { const st = spobStyle(s); verts.push(s.x, s.y, st.color[0], st.color[1], st.color[2], st.kind, st.land ? 1 : 0, st.size); }
        verts.push(0, 0, 0.55, 0.92, 1.0, 2, 0, 14);   // ship marker at center
        nVerts = verts.length / 8;
        gl.bindBuffer(gl.ARRAY_BUFFER, interleave); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
        fit(); render();
    }
    function fit() { const { W, H } = dims(); view = fitView(systemBounds(spobs), W, H, 1.0); }

    function render() {
        const { W, H } = dims();
        gl.viewport(0, 0, W, H);
        gl.clearColor(0.015, 0.02, 0.04, 1); gl.clear(gl.COLOR_BUFFER_BIT);
        gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        if (nVerts) {
            gl.useProgram(prog);
            gl.uniform2f(loc.u_center, view.x, view.y); gl.uniform1f(loc.u_scale, view.scale);
            gl.uniform2f(loc.u_res, W, H); gl.uniform1f(loc.u_zoom, Math.max(0.7, Math.min(4, view.scale * 0.5)));
            gl.bindBuffer(gl.ARRAY_BUFFER, interleave);
            gl.enableVertexAttribArray(loc.a_pos);   gl.vertexAttribPointer(loc.a_pos, 2, gl.FLOAT, false, STRIDE, 0);
            gl.enableVertexAttribArray(loc.a_color); gl.vertexAttribPointer(loc.a_color, 3, gl.FLOAT, false, STRIDE, 8);
            gl.enableVertexAttribArray(loc.a_kind);  gl.vertexAttribPointer(loc.a_kind, 1, gl.FLOAT, false, STRIDE, 20);
            gl.enableVertexAttribArray(loc.a_land);  gl.vertexAttribPointer(loc.a_land, 1, gl.FLOAT, false, STRIDE, 24);
            gl.enableVertexAttribArray(loc.a_size);  gl.vertexAttribPointer(loc.a_size, 1, gl.FLOAT, false, STRIDE, 28);
            gl.drawArrays(gl.POINTS, 0, nVerts);
        }
        if (opts.onRender) {
            const { W: w, H: h } = dims();
            opts.onRender(spobs.map((s) => { const p = worldToScreen(view, w, h, s.x, s.y); return { id: s.id, name: s.name, sx: p.sx / dpr, sy: p.sy / dpr, land: !!s.canLand, station: !!s.isStation }; }));
        }
    }

    // ---- interaction ----
    let dragging = false, moved = false, lastX = 0, lastY = 0;
    function localXY(e) { const r = canvas.getBoundingClientRect(); return { sx: (e.clientX - r.left) * (canvas.width / r.width), sy: (e.clientY - r.top) * (canvas.height / r.height) }; }
    function pickAt(e) { const { sx, sy } = localXY(e), { W, H } = dims(); const w = screenToWorld(view, W, H, sx, sy); return pickSystem(spobs, w.wx, w.wy, 22 / view.scale); }
    canvas.addEventListener("pointerdown", (e) => { dragging = true; moved = false; lastX = e.clientX; lastY = e.clientY; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener("pointerup", (e) => { dragging = false; try { canvas.releasePointerCapture(e.pointerId); } catch (_) {} if (!moved && opts.onSelectSpob) { const s = pickAt(e); if (s) opts.onSelectSpob(s); } });
    canvas.addEventListener("pointermove", (e) => {
        const r = canvas.getBoundingClientRect(), scaleX = canvas.width / r.width, scaleY = canvas.height / r.height;
        if (dragging) {
            if (Math.abs(e.clientX - lastX) + Math.abs(e.clientY - lastY) > 3) moved = true;
            view.x -= (e.clientX - lastX) * scaleX / view.scale; view.y -= (e.clientY - lastY) * scaleY / view.scale;
            lastX = e.clientX; lastY = e.clientY; render();
        } else if (opts.onHover) opts.onHover(pickAt(e));
    });
    canvas.addEventListener("wheel", (e) => {
        e.preventDefault(); const { sx, sy } = localXY(e), { W, H } = dims();
        const before = screenToWorld(view, W, H, sx, sy);
        view.scale *= Math.exp(-e.deltaY * 0.0015); view.scale = Math.max(0.02, Math.min(4000, view.scale));
        const after = screenToWorld(view, W, H, sx, sy);
        view.x += before.wx - after.wx; view.y += before.wy - after.wy; render();
    }, { passive: false });

    function resize() { const r = canvas.getBoundingClientRect(); dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.max(1, Math.round(r.width * dpr)); canvas.height = Math.max(1, Math.round(r.height * dpr)); if (sys) { fit(); } render(); }

    return { setSystem, render, fit, resize, getSystem: () => sys };
}

export { SystemView, spobKind, spobStyle, systemBounds };
