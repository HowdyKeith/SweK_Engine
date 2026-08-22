// FILE: multiplayer/wadLevelHost.js
//
// Reusable first-person WAD-level host, factored out of demos_code/wad_arena.js.
// Loads a WAD level via WadLevelRenderer, runs a fullscreen WebGL2 overlay with
// a first-person camera + controller, and drives a pluggable GAME MODE. Any FPS
// mode (deathmatch, CTF, bomb-defusal, ...) mounts into this instead of each
// re-implementing the level + controls.
//
//   import { WadLevelHost } from "../multiplayer/wadLevelHost.js";
//   const host = new WadLevelHost({ bridgeUrl });
//   await host.start(myMode);     // myMode implements the GameMode hooks (see wadModes.js)
//   ...
//   host.stop();
//
// GameMode hooks the host calls (all optional):
//   mode.init(host)             once, after level load (spawn bots, set state)
//   mode.update(dt, host)       each frame (tick AI / rules)
//   mode.onShoot(host, ray)     player fired (ray = {ox,oy,oz, dx,dy,dz})
//   mode.updateHUD(hudEl, host) each frame (write scoreboard HTML)
//   mode.dispose(host)          on stop
//   mode.entities (array)       {x,y,z,r,g,b,scale} drawn as billboards by the host
//
// Host services for modes: host.gl, host.canvas, host.level, host.camera,
// host.getBounds(), host.spawnPoints(n), host.castRay(), host.kpop.
import { WadLevelRenderer } from "./wadLevelRenderer.js";
import { NavGrid } from "../simulation/navGrid.js";
import { WEAPONS, DEFAULT_LOADOUT } from "../simulation/weapons.js";

const EYE_HEIGHT = 1.6, MOVE_SPEED = 6.0, LOOK_SENS = 0.0025;
const NEAR = 0.05, FAR = 200, FOVY = (70 * Math.PI) / 180;

// ---- tiny mat4 (column-major), factored from wad_arena ----------------------
function mPerspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  return [f/aspect,0,0,0, 0,f,0,0, 0,0,(far+near)*nf,-1, 0,0,2*far*near*nf,0];
}
function mMul(a, b) {
  const o = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    o[c*4+r] = a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];
  }
  return o;
}
function mTranslate(x, y, z) { return [1,0,0,0, 0,1,0,0, 0,0,1,0, x,y,z,1]; }
function mScale(s) { return [s,0,0,0, 0,s,0,0, 0,0,s,0, 0,0,0,1]; }
function viewFromCamera(cam) {
  const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  // forward, then a look-at style basis
  const fx = sy*cp, fy = sp, fz = -cy*cp;
  const rx = cy, ry = 0, rz = sy;            // right
  const ux = -sy*sp, uy = cp, uz = cy*sp;    // up
  const e = cam;
  return [ rx,ux,-fx,0, ry,uy,-fy,0, rz,uz,-fz,0,
           -(rx*e.x+ry*e.y+rz*e.z), -(ux*e.x+uy*e.y+uz*e.z), (fx*e.x+fy*e.y+fz*e.z), 1 ];
}

function compile(gl, type, src) {
  const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn(gl.getShaderInfoLog(s));
  return s;
}

export class WadLevelHost {
  constructor(opts = {}) {
    this.opts = opts;
    this.bridgeUrl = opts.bridgeUrl;
    this.kpop = opts.kpop || null;
    this.canvas = null; this.gl = null; this.level = null;
    this.camera = { x: 0, y: EYE_HEIGHT, z: 0, yaw: 0, pitch: 0 };
    this.keys = Object.create(null);
    this.mode = null; this.hud = null; this._raf = 0; this._last = 0;
    this.weaponSet = DEFAULT_LOADOUT.slice();   // number keys 1..N select these
    this.playerWeapon = this.weaponSet[1] || this.weaponSet[0];   // default rifle
    this._fireCd = 0; this._mouseDown = false;
    this._dragging = false; this._marker = null;
  }

  async start(mode, opts = {}) {
    this.mode = mode || null;
    this._buildCanvas();
    // Room switch: ask the bridge to rebuild geometry for the chosen map first.
    if (opts.mapName) {
      try {
        await fetch((this.bridgeUrl || "") + "/api/wad/select", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ map: opts.mapName }),
        });
      } catch (e) { console.warn("[wadHost] map select failed:", e); }
    }
    this.level = new WadLevelRenderer(this.gl, { bridgeUrl: this.bridgeUrl });
    const ok = await this.level.load();
    if (!ok) { this.kpop?.warn?.("WAD Host", "level load failed"); this.stop(); return false; }
    this._buildWallTris();
    this._nav = new NavGrid(this.getBounds(), this.level?.geometry?.collisionWalls, 3);
    const sp = this.level.getPrimarySpawn?.() || { x: 0, z: 0 };
    this.camera.x = sp.x; this.camera.z = sp.z;
    this.camera.y = (this.level.getBounds?.()?.minY ?? 0) + EYE_HEIGHT;
    this._marker = this._buildMarker();
    this._setupInput();
    try { this.mode?.init?.(this); } catch (e) { console.warn("[wadHost] mode.init", e); }
    this._last = performance.now();
    this._raf = requestAnimationFrame((t) => this._frame(t));
    this.kpop?.info?.("WAD Host", `Level: ${this.level.getName?.() ?? "?"} · mode: ${mode?.name ?? "free"}`);
    return true;
  }

  stop() {
    cancelAnimationFrame(this._raf);
    try { this.mode?.dispose?.(this); } catch {}
    if (this.level) { try { this.level.dispose(); } catch {} this.level = null; }
    if (this.canvas?.parentNode) this.canvas.parentNode.removeChild(this.canvas);
    if (this.hud?.parentNode) this.hud.parentNode.removeChild(this.hud);
    document.exitPointerLock?.();
  }

  getBounds() { return this.level?.getBounds?.() || { minX:-50,maxX:50,minY:0,maxY:10,minZ:-50,maxZ:50 }; }

  // Waypoints around walls from a->b (or null). Used by bots to path corners.
  findPath(ax, az, bx, bz) { return this._nav ? this._nav.findPath(ax, az, bx, bz) : null; }

  // The player's current weapon stats (for modes' onShoot).
  weapon() { return WEAPONS[this.playerWeapon] || WEAPONS.rifle; }

  // n spawn points: prefer the WAD's deathmatch starts, then player starts
  // (both cycled), with an in-bounds scatter fallback.
  spawnPoints(n) {
    const g = this.level?.geometry;
    const starts = (g?.deathmatchStarts?.length ? g.deathmatchStarts : g?.playerStarts) || [];
    const b = this.getBounds(), out = [];
    for (let i = 0; i < n; i++) {
      if (starts.length) { const s = starts[i % starts.length]; out.push({ x: s.x, z: s.z }); }
      else out.push({ x: b.minX + 1 + Math.random()*(b.maxX-b.minX-2),
                      z: b.minZ + 1 + Math.random()*(b.maxZ-b.minZ-2) });
    }
    return out;
  }

  // Ray from the camera along the look direction (for player shots).
  castRay() {
    const c = this.camera, cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
    return { ox:c.x, oy:c.y, oz:c.z, dx:Math.sin(c.yaw)*cp, dy:sp, dz:-Math.cos(c.yaw)*cp };
  }

  // Build occlusion data: 2D collision segments (cheap, accurate for WAD walls)
  // plus a 3D wall-triangle fallback derived from wallVerts (stride 7 floats).
  _buildWallTris() {
    this._wallSegs = this.level?.geometry?.collisionWalls || null;
    this._wallTris = null;
    const wv = this.level?.geometry?.wallVerts;
    const triCount = this.level?.geometry?.wallTriCount || 0;
    if (!wv || !triCount) return;
    const out = new Float32Array(triCount * 9);
    for (let t = 0; t < triCount; t++) {
      for (let v = 0; v < 3; v++) {
        const src = (t * 3 + v) * 7, dst = (t * 3 + v) * 3;
        out[dst] = wv[src]; out[dst+1] = wv[src+1]; out[dst+2] = wv[src+2];
      }
    }
    this._wallTris = out;
  }

  // True if the segment a->b is not blocked by any wall. Used to gate bot
  // engagement and player shots so they respect geometry.
  losClear(ax, ay, az, bx, by, bz) {
    // Preferred: 2D segment-segment crossing against collisionWalls (XZ plane).
    const segs = this._wallSegs;
    if (segs && segs.length) {
      const o = (px, pz, qx, qz, rx, rz) => (qx - px) * (rz - pz) - (qz - pz) * (rx - px);
      for (let i = 0; i < segs.length; i++) {
        const w = segs[i];
        const d1 = o(w.x1, w.z1, w.x2, w.z2, ax, az);
        const d2 = o(w.x1, w.z1, w.x2, w.z2, bx, bz);
        const d3 = o(ax, az, bx, bz, w.x1, w.z1);
        const d4 = o(ax, az, bx, bz, w.x2, w.z2);
        if (((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0))) return false;
      }
      return true;
    }
    // Fallback: ray vs 3D wall triangles (Moller-Trumbore).
    const tris = this._wallTris; if (!tris) return true;
    const dx = bx-ax, dy = by-ay, dz = bz-az;
    const EPS = 1e-6;
    for (let i = 0; i < tris.length; i += 9) {
      const e1x = tris[i+3]-tris[i], e1y = tris[i+4]-tris[i+1], e1z = tris[i+5]-tris[i+2];
      const e2x = tris[i+6]-tris[i], e2y = tris[i+7]-tris[i+1], e2z = tris[i+8]-tris[i+2];
      const px = dy*e2z - dz*e2y, py = dz*e2x - dx*e2z, pz = dx*e2y - dy*e2x;
      const det = e1x*px + e1y*py + e1z*pz;
      if (det > -EPS && det < EPS) continue;
      const inv = 1/det;
      const tx = ax-tris[i], ty = ay-tris[i+1], tz = az-tris[i+2];
      const u = (tx*px + ty*py + tz*pz) * inv; if (u < 0 || u > 1) continue;
      const qx = ty*e1z - tz*e1y, qy = tz*e1x - tx*e1z, qz = tx*e1y - ty*e1x;
      const vv = (dx*qx + dy*qy + dz*qz) * inv; if (vv < 0 || u + vv > 1) continue;
      const tHit = (e2x*qx + e2y*qy + e2z*qz) * inv;
      if (tHit > EPS && tHit < 1 - EPS) return false;
    }
    return true;
  }

  // ---- internals ----------------------------------------------------------
  _buildCanvas() {
    const cv = document.createElement("canvas");
    Object.assign(cv.style, { position:"fixed", inset:"0", width:"100%", height:"100%", zIndex:"900", background:"#080610" });
    cv.width = innerWidth; cv.height = innerHeight;
    document.body.appendChild(cv); this.canvas = cv;
    this.gl = cv.getContext("webgl2", { antialias:true });
    addEventListener("resize", () => { cv.width = innerWidth; cv.height = innerHeight; });
    const hud = document.createElement("div");
    Object.assign(hud.style, { position:"fixed", left:"12px", top:"12px", zIndex:"901",
      font:"12px Consolas,monospace", color:"#ffaa44", textShadow:"0 1px 2px #000", pointerEvents:"none", whiteSpace:"pre" });
    document.body.appendChild(hud); this.hud = hud;
  }

  _buildMarker() {
    const gl = this.gl;
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER,
      `#version 300 es
       layout(location=0) in vec2 p; uniform mat4 uMVP; uniform float uS;
       void main(){ gl_Position = uMVP * vec4(p*uS,0.0,1.0); }`));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER,
      `#version 300 es
       precision mediump float; uniform vec3 uC; out vec4 o; void main(){ o=vec4(uC,1.0); }`));
    gl.linkProgram(prog);
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const vbo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, 1,1, -1,-1, 1,1, -1,1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
    gl.bindVertexArray(null);
    return { prog, vao,
      uMVP: gl.getUniformLocation(prog,"uMVP"), uC: gl.getUniformLocation(prog,"uC"), uS: gl.getUniformLocation(prog,"uS") };
  }

  _frame(now) {
    const dt = Math.min(0.05, (now - this._last) / 1000); this._last = now;
    this._move(dt);
    // player firing: hold mouse to fire at the weapon's cadence
    if (this._fireCd > 0) this._fireCd -= dt;
    if (this._mouseDown && this._fireCd <= 0) {
      try { this.mode?.onShoot?.(this, this.castRay()); } catch (e) { console.warn("[wadHost] onShoot", e); }
      this._fireCd = this.weapon().fireCd || 0.2;
    }
    try { this.mode?.update?.(dt, this); } catch (e) { console.warn("[wadHost] mode.update", e); }
    this._render();
    try {
      this.mode?.updateHUD?.(this.hud, this);
      if (this.hud) this.hud.textContent += `\nweapon: ${this.weapon().name}  (1-${this.weaponSet.length} to switch)`;
    } catch {}
    this._raf = requestAnimationFrame((t) => this._frame(t));
  }

  _move(dt) {
    let dx = 0, dz = 0;
    if (this.keys["KeyW"] || this.keys["ArrowUp"]) dz -= 1;
    if (this.keys["KeyS"] || this.keys["ArrowDown"]) dz += 1;
    if (this.keys["KeyA"] || this.keys["ArrowLeft"]) dx -= 1;
    if (this.keys["KeyD"] || this.keys["ArrowRight"]) dx += 1;
    if (dx || dz) {
      const cy = Math.cos(this.camera.yaw), sy = Math.sin(this.camera.yaw);
      let wx = dx*cy - dz*sy, wz = dx*sy + dz*cy;
      const len = Math.hypot(wx, wz) || 1;
      this.camera.x += (wx/len) * MOVE_SPEED * dt;
      this.camera.z += (wz/len) * MOVE_SPEED * dt;
      const b = this.getBounds();
      this.camera.x = Math.max(b.minX+0.5, Math.min(b.maxX-0.5, this.camera.x));
      this.camera.z = Math.max(b.minZ+0.5, Math.min(b.maxZ-0.5, this.camera.z));
    }
  }

  _render() {
    const gl = this.gl; if (!gl || !this.level?.loaded) return;
    gl.viewport(0,0,this.canvas.width,this.canvas.height);
    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0.03,0.025,0.06,1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const proj = mPerspective(FOVY, this.canvas.width/this.canvas.height, NEAR, FAR);
    const view = viewFromCamera(this.camera);
    this.level.render(view, proj, [this.camera.x, this.camera.y, this.camera.z]);
    this._renderEntities(mMul(proj, view));
  }

  _renderEntities(vp) {
    const ents = this.mode?.entities; if (!ents || !ents.length) return;
    const gl = this.gl, m = this._marker;
    gl.useProgram(m.prog); gl.bindVertexArray(m.vao);
    for (const e of ents) {
      if (e.dead) continue;
      const mvp = mMul(vp, mTranslate(e.x, (e.y ?? this.camera.y), e.z));
      gl.uniformMatrix4fv(m.uMVP, false, new Float32Array(mvp));
      gl.uniform3f(m.uC, e.r ?? 1, e.g ?? 0.3, e.b ?? 0.3);
      gl.uniform1f(m.uS, e.scale ?? 0.8);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    gl.bindVertexArray(null);
  }

  _setupInput() {
    const kd = (e) => {
      this.keys[e.code] = true;
      if (e.code === "Escape") this.stop();
      // number keys 1..N select the loadout
      if (e.code.startsWith("Digit")) {
        const i = parseInt(e.code.slice(5), 10) - 1;
        if (i >= 0 && i < this.weaponSet.length) this.playerWeapon = this.weaponSet[i];
      }
    };
    const ku = (e) => { this.keys[e.code] = false; };
    addEventListener("keydown", kd); addEventListener("keyup", ku);
    this.canvas.addEventListener("click", () => {
      if (document.pointerLockElement !== this.canvas) { this.canvas.requestPointerLock?.(); return; }
      try { this.mode?.onShoot?.(this, this.castRay()); } catch (e) { console.warn("[wadHost] onShoot", e); }
      this._fireCd = this.weapon().fireCd || 0.2;
    });
    addEventListener("mousemove", (e) => {
      if (document.pointerLockElement !== this.canvas) return;
      this.camera.yaw   += e.movementX * LOOK_SENS;
      this.camera.pitch  = Math.max(-1.4, Math.min(1.4, this.camera.pitch - e.movementY * LOOK_SENS));
    });
    // hold to keep firing (only while pointer-locked) at the weapon's cadence
    addEventListener("mousedown", () => { if (document.pointerLockElement === this.canvas) this._mouseDown = true; });
    addEventListener("mouseup",   () => { this._mouseDown = false; });
  }
}
