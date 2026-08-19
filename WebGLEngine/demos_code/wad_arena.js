// demos_code/wad_arena.js
//
// Round 154 — Option A: multiplayer waves inside a real WAD level
// (or the procedural test arena fallback). Self-contained overlay:
// creates its own fullscreen WebGL canvas, fetches level geometry
// from the bridge, renders with a first-person camera, hooks the
// full multiplayer state machine (waves, HP, leaderboard, bombs)
// from SharedOgreClient.
//
// Controls:
//   WASD / arrows     — move
//   mouse drag        — look (click on canvas first to engage)
//   click             — attack OGRE (in range)
//   ESC               — release mouse lock
//   START WAVE button — begin combat
//
// Architecture:
//   * Overlay canvas at z-index 900 covers the engine. Engine still
//     runs in the background but is hidden.
//   * Our own WebGL2 context renders the WAD level (via
//     WadLevelRenderer) plus a colored sphere for the OGRE.
//   * SharedOgreClient handles all multiplayer state.
//   * FrameStreamer hooks our canvas, so Excel sees this level.

import { SharedOgreClient }    from "../multiplayer/sharedOgreClient.js";
import { FrameStreamer }       from "../multiplayer/frameStreamer.js";
import { WadLevelRenderer }    from "../multiplayer/wadLevelRenderer.js";

const ATTACK_DAMAGE = 12;
const ATTACK_RANGE  = 14;
const WAVE_HP       = 200;
const MOVE_SPEED    = 6.0;          // world units / sec
const LOOK_SENS     = 0.0025;       // radians per pixel
const EYE_HEIGHT    = 1.6;          // above floor
const NEAR = 0.05, FAR = 200;

let canvas = null;
let gl = null;
let level = null;             // WadLevelRenderer
let client = null;
let streamer = null;
let streaming = false;
let panel = null;
let hud = null;
let camera = { x: 0, y: EYE_HEIGHT, z: 0, yaw: 0, pitch: 0 };
let keys = {};
let dragging = false;
let dragLastX = 0, dragLastY = 0;
let lastClickAt = 0;
let damageDealtByMe = 0;
let ctxRef = null;
let animRAF = null;
let lastFrameT = 0;
let myName = null, myColor = null;
let ogreSphere = null;        // tiny WebGL prog for OGRE+player markers
let unloadHandler = null;

// ============================================================
// Minimal sphere shader for OGRE + player markers (no shared progs)
// ============================================================

const MARKER_VS = `#version 300 es
layout(location=0) in vec3 aPos;
uniform mat4 uMVP;
uniform mat4 uModel;
out vec3 vNormal;
void main() {
    vNormal = mat3(uModel) * aPos;   // sphere mesh's pos is also its normal
    gl_Position = uMVP * uModel * vec4(aPos, 1.0);
}`;
const MARKER_FS = `#version 300 es
precision highp float;
in vec3 vNormal;
uniform vec3 uColor;
out vec4 outColor;
void main() {
    vec3 N = normalize(vNormal);
    float lambert = max(0.3, dot(N, normalize(vec3(0.4, 0.7, 0.6))));
    outColor = vec4(uColor * lambert, 1.0);
}`;

function makeSphereMesh(segments = 12, rings = 8) {
    const verts = [];
    const idx = [];
    for (let r = 0; r <= rings; r++) {
        const phi = (r / rings) * Math.PI;
        const y = Math.cos(phi);
        const sr = Math.sin(phi);
        for (let s = 0; s <= segments; s++) {
            const theta = (s / segments) * Math.PI * 2;
            verts.push(Math.sin(theta) * sr, y, Math.cos(theta) * sr);
        }
    }
    const cols = segments + 1;
    for (let r = 0; r < rings; r++) {
        for (let s = 0; s < segments; s++) {
            const a = r * cols + s, b = a + cols;
            idx.push(a, b, a + 1, a + 1, b, b + 1);
        }
    }
    return { verts: new Float32Array(verts), idx: new Uint16Array(idx) };
}

function compile(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.error("[wad_arena marker]", gl.getShaderInfoLog(sh));
    }
    return sh;
}

function buildMarkerProg() {
    const vs = compile(gl, gl.VERTEX_SHADER, MARKER_VS);
    const fs = compile(gl, gl.FRAGMENT_SHADER, MARKER_FS);
    const p = gl.createProgram();
    gl.attachShader(p, vs); gl.attachShader(p, fs);
    gl.linkProgram(p);
    p.uMVP   = gl.getUniformLocation(p, "uMVP");
    p.uModel = gl.getUniformLocation(p, "uModel");
    p.uColor = gl.getUniformLocation(p, "uColor");
    // Sphere mesh
    const sphere = makeSphereMesh(14, 10);
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, sphere.verts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, sphere.idx, gl.STATIC_DRAW);
    ogreSphere = { prog: p, vao, vb, ib, count: sphere.idx.length };
}

// ============================================================
// Matrix helpers (column-major)
// ============================================================

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
function mat4Translate(x, y, z) {
    return [1,0,0,0, 0,1,0,0, 0,0,1,0, x,y,z,1];
}
function mat4Scale(s) {
    return [s,0,0,0, 0,s,0,0, 0,0,s,0, 0,0,0,1];
}
// View matrix from yaw + pitch + position. Camera looks toward -Z
// at zero yaw, and yaw rotates around +Y.
function viewFromCamera(cam) {
    // R = Rx(-pitch) * Ry(-yaw); then translate by -position
    const cy = Math.cos(-cam.yaw),  sy = Math.sin(-cam.yaw);
    const cp = Math.cos(-cam.pitch), sp = Math.sin(-cam.pitch);
    // Ry first (around y), Rx second (around x in resulting frame)
    const ryx = cy,  ryy = 0, ryz = sy;
    const rxy = 0,   ryy2 = cp, rxz = -sp;
    // Compose manually for clarity
    // R = Rx * Ry
    const r00 = cy;
    const r01 = 0;
    const r02 = sy;
    const r10 = sp * sy;
    const r11 = cp;
    const r12 = -sp * cy;
    const r20 = -cp * sy;
    const r21 = sp;
    const r22 = cp * cy;
    // Translation: -R * cam
    const tx = -(r00 * cam.x + r01 * cam.y + r02 * cam.z);
    const ty = -(r10 * cam.x + r11 * cam.y + r12 * cam.z);
    const tz = -(r20 * cam.x + r21 * cam.y + r22 * cam.z);
    // Column-major float[16]
    return [
        r00, r10, r20, 0,
        r01, r11, r21, 0,
        r02, r12, r22, 0,
        tx,  ty,  tz,  1,
    ];
}

// ============================================================
// HUD
// ============================================================

function shortId(id) { return id ? id.slice(0, 8) : "—"; }

function renderHUD() {
    if (!hud || !client) return;
    const ogreFrac = client.getHpFraction();
    const myFrac   = client.getMyHpFrac();
    const respawn  = client.getRespawnRemaining();
    const cd       = client.getWaveCountdownRemaining();
    const cdInfo   = client.getNextWaveInfo();
    const lb       = client.getLeaderboard();

    let status;
    if (!client.connected)                status = "<span style='color:#f99'>● disconnected</span>";
    else if (cd != null)                  status = `<span style='color:#fc4'>● WAVE ${cdInfo.nextWave} INCOMING in ${cd.toFixed(1)}s</span>`;
    else if (!client.alive)               status = `<span style='color:#f99'>● YOU DIED — respawn ${respawn.toFixed(1)}s</span>`;
    else if (!client.active)              status = "<span style='color:#9fd'>● ready — START WAVE</span>";
    else                                  status = "<span style='color:#0fa'>● live</span>";

    const lbLines = lb.slice(0, 5).map((e, i) => {
        const me = e.playerId === client.myPlayerId;
        const tag = me ? "<span style='color:#fd0'>YOU</span>"
                       : `<span style='color:#9fd'>${shortId(e.playerId)}</span>`;
        return `<div>${i + 1}. ${tag} · <b>${e.totalDamage}</b> dmg · <b>${e.kills}</b>k</div>`;
    }).join("");

    const bar = (frac, color) => {
        frac = Math.max(0, Math.min(1, frac));
        const fill = Math.floor(frac * 18);
        return `<span style="color:${color}">${"█".repeat(fill)}${"·".repeat(18 - fill)}</span>`;
    };

    hud.innerHTML = `
        <div style="color:#fd0;font-weight:bold;font-size:13px;letter-spacing:1px;margin-bottom:6px">
            🏛️ WAD ARENA · ${level?.getName() ?? "loading"}
        </div>
        <div style="font-size:10px;color:#9aa;margin-bottom:6px">
            tex: <b style="color:#dca">${level?.getTextureInfo()?.wall?.name ?? "?"}</b> /
            <b style="color:#dca">${level?.getTextureInfo()?.floor?.name ?? "?"}</b>
            · <i>${level?.getTextureInfo()?.source ?? ""}</i>
        </div>
        <div style="font-size:11px;line-height:1.5;color:#9fd">
            ${status}<br/>
            You: <span style="color:${myColor}">${myName}</span> ·
            WASD = move · drag = look · click = attack
        </div>
        <div style="font-size:11px;line-height:1.5;color:#ddd;margin-top:8px">
            <div>YOUR HP <b>${client.getMyHp()}/${client.getMyMaxHp()}</b></div>
            ${bar(myFrac, myFrac > 0.5 ? "#0fa" : myFrac > 0.25 ? "#fc4" : "#f55")}
        </div>
        <div style="font-size:11px;line-height:1.5;color:#ddd;margin-top:6px">
            <div>OGRE HP <b>${Math.round(client.hp)}/${client.maxHp}</b> · wave ${client.wave || (cdInfo?.nextWave ?? "—")}</div>
            ${bar(ogreFrac, "#f55")}
        </div>
        ${lbLines ? `<div style="font-size:11px;line-height:1.5;color:#9fd;margin-top:8px">
            <div style="color:#ddd">SESSION LEADERBOARD</div>${lbLines}
        </div>` : ""}
        <div style="margin-top:8px;display:flex;gap:4px">
            <button class="mp_start" style="flex:1;background:#062;color:#0fa;border:1px solid #0a6;padding:5px;font:10px monospace;cursor:pointer;pointer-events:auto;border-radius:3px">START WAVE</button>
            <button class="mp_stop"  style="flex:1;background:#400;color:#f99;border:1px solid #800;padding:5px;font:10px monospace;cursor:pointer;pointer-events:auto;border-radius:3px">STOP</button>
        </div>
        <div style="margin-top:5px;display:flex;gap:4px">
            <button class="mp_stream" style="flex:1;background:${streaming ? "#420" : "#222"};color:${streaming ? "#fc8" : "#9fd"};border:1px solid ${streaming ? "#a80" : "#444"};padding:5px;font:10px monospace;cursor:pointer;pointer-events:auto;border-radius:3px">
                ${streaming ? "📡 STREAMING TO EXCEL" : "📡 STREAM TO EXCEL"}
            </button>
        </div>
        <div style="margin-top:5px;display:flex;gap:4px;align-items:center">
            <button class="mp_pom" style="flex:1;background:${level?.isPomEnabled() ? "#062" : "#222"};color:${level?.isPomEnabled() ? "#9fd" : "#888"};border:1px solid ${level?.isPomEnabled() ? "#0a6" : "#444"};padding:5px;font:10px monospace;cursor:pointer;pointer-events:auto;border-radius:3px">
                ${level?.isPomEnabled() ? "⛰ POM ON" : "⛰ POM OFF"}
            </button>
            <span style="font-size:10px;color:#888">strength ${(level?.getPomStrength() ?? 0).toFixed(2)}</span>
        </div>
        <div style="margin-top:5px;display:flex;gap:4px;align-items:center">
            <button class="mp_floor" style="flex:1;background:${level?.noFloor ? "#222" : "#062"};color:${level?.noFloor ? "#888" : "#9fd"};border:1px solid ${level?.noFloor ? "#444" : "#0a6"};padding:5px;font:10px monospace;cursor:pointer;pointer-events:auto;border-radius:3px">
                ${level?.noFloor ? "▓ NO FLOOR" : "▓ FLOOR ON"}
            </button>
            <span style="font-size:10px;color:#888">walls only — see voxel terrain</span>
        </div>`;

    hud.querySelector(".mp_start").onclick = () => {
        client.startWave({ maxHp: WAVE_HP, wave: client.wave + 1 });
        damageDealtByMe = 0;
    };
    hud.querySelector(".mp_stop").onclick = () => client.stopWave();
    hud.querySelector(".mp_stream").onclick = () => {
        if (streaming) {
            if (streamer) { streamer.stop(); streamer = null; }
            streaming = false;
        } else {
            streamer = new FrameStreamer({
                targetWidth: 48, targetHeight: 36, fps: 2,
                source: myName || "wad_arena",
            });
            streamer.start();
            streaming = true;
        }
        renderHUD();
    };
    hud.querySelector(".mp_pom").onclick = () => {
        if (!level) return;
        level.setPomEnabled(!level.isPomEnabled());
        renderHUD();
    };
    hud.querySelector(".mp_floor").onclick = () => {
        if (!level) return;
        level.setNoFloor(!level.noFloor);
        // When floor is off, make the overlay canvas transparent so
        // the engine voxel terrain is visible through it. When floor
        // is back on, restore the dark background.
        if (canvas) {
            canvas.style.background = level.noFloor ? "transparent" : "#080610";
        }
        renderHUD();
    };
}

function flashHit(color) {
    const f = document.createElement("div");
    f.style.cssText = `position:fixed;left:0;top:0;right:0;bottom:0;background:${color};z-index:998;pointer-events:none`;
    document.body.appendChild(f);
    setTimeout(() => { if (f.parentNode) f.parentNode.removeChild(f); }, 200);
}

// ============================================================
// Frame loop
// ============================================================

function tick() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - (lastFrameT || now)) / 1000);
    lastFrameT = now;

    // Movement
    if (level?.loaded && client?.isAlive?.()) {
        let fwd = 0, str = 0;
        if (keys.w || keys.arrowup)    fwd += 1;
        if (keys.s || keys.arrowdown)  fwd -= 1;
        if (keys.a || keys.arrowleft)  str -= 1;
        if (keys.d || keys.arrowright) str += 1;
        if (fwd !== 0 || str !== 0) {
            const cy = Math.cos(camera.yaw), sy = Math.sin(camera.yaw);
            const dx =  sy * fwd + cy * str;
            const dz = -cy * fwd + sy * str;
            const len = Math.hypot(dx, dz) || 1;
            camera.x += (dx / len) * MOVE_SPEED * dt;
            camera.z += (dz / len) * MOVE_SPEED * dt;
            // Keep camera within level bounds (simple clamp; proper
            // collision is server-side)
            const b = level.getBounds();
            if (b) {
                camera.x = Math.max(b.minX + 0.5, Math.min(b.maxX - 0.5, camera.x));
                camera.z = Math.max(b.minZ + 0.5, Math.min(b.maxZ - 0.5, camera.z));
            }
            // Send our position to the bridge so the OGRE knows
            // where to head
            if (client?.connected && client.ws?.readyState === 1) {
                client.ws.send(JSON.stringify({
                    type: "player:state",
                    data: { pos: { x: camera.x, y: camera.y - EYE_HEIGHT, z: camera.z }, yaw: camera.yaw },
                }));
            }
        }
    }

    // Render
    if (gl && level?.loaded) {
        renderFrame(now);
    }

    if (((Math.floor(now / 166)) & 1) === 0) renderHUD();
    animRAF = requestAnimationFrame(tick);
}

function renderFrame(now) {
    // Resize canvas to window
    const w = window.innerWidth, h = window.innerHeight;
    if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w; canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
    gl.clearColor(0.05, 0.04, 0.08, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const proj = mat4Perspective(Math.PI / 3, w / h, NEAR, FAR);
    const view = viewFromCamera(camera);

    level.render(view, proj, [camera.x, camera.y, camera.z]);

    // OGRE marker
    if (ogreSphere && client?.active) {
        const interp = client.getInterpolatedState();
        if (interp) {
            const b = level.getBounds();
            const yBase = b?.minY ?? 0;
            // Place sphere with bottom at floor level
            const ogreSize = 1.8;
            const model = mat4Mul(mat4Translate(interp.x, yBase + ogreSize, interp.z),
                                  mat4Scale(ogreSize));
            const mvp = mat4Mul(mat4Mul(proj, view), model);
            gl.useProgram(ogreSphere.prog);
            // OGRE color tints red as HP drops
            const frac = client.getHpFraction();
            const r = 0.9, g = 0.2 + frac * 0.3, b2 = 0.15 + frac * 0.15;
            gl.uniform3f(ogreSphere.prog.uColor, r, g, b2);
            gl.uniformMatrix4fv(ogreSphere.prog.uMVP, false, mvp);
            gl.uniformMatrix4fv(ogreSphere.prog.uModel, false, model);
            gl.bindVertexArray(ogreSphere.vao);
            gl.drawElements(gl.TRIANGLES, ogreSphere.count, gl.UNSIGNED_SHORT, 0);
        }
    }

    // v1465 — grunt squad markers (mirror the OGRE marker: smaller, colored by brain state)
    if (ogreSphere && client?.active && client.getSquad) {
        const squad = client.getSquad();
        if (squad && squad.length) {
            const sb = level.getBounds(); const yB = sb?.minY ?? 0; const gs = 0.9;
            gl.useProgram(ogreSphere.prog);
            gl.bindVertexArray(ogreSphere.vao);
            for (const g of squad) {
                const gm = mat4Mul(mat4Translate(g.x, yB + gs, g.z), mat4Scale(gs));
                const gmvp = mat4Mul(mat4Mul(proj, view), gm);
                let cr = 0.95, cg = 0.8, cbl = 0.2;                                              // default minion: yellow
                if (g.state === "guard") { cr = 0.3; cg = 0.6; cbl = 1.0; }                       // guard the king: blue
                else if (g.state === "closing" || g.state === "attacking") { cr = 1.0; cg = 0.35; cbl = 0.2; }   // attacking: red
                gl.uniform3f(ogreSphere.prog.uColor, cr, cg, cbl);
                gl.uniformMatrix4fv(ogreSphere.prog.uMVP, false, gmvp);
                gl.uniformMatrix4fv(ogreSphere.prog.uModel, false, gm);
                gl.drawElements(gl.TRIANGLES, ogreSphere.count, gl.UNSIGNED_SHORT, 0);
            }
        }
    }
}

// ============================================================
// Input
// ============================================================

function setupInput() {
    const onKey = (down) => (ev) => {
        const k = ev.key.toLowerCase();
        keys[k] = down;
    };
    const kd = onKey(true), ku = onKey(false);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);

    const md = (ev) => {
        if (ev.target !== canvas) return;
        dragging = true; dragLastX = ev.clientX; dragLastY = ev.clientY;
        canvas.style.cursor = "grabbing";
    };
    const mm = (ev) => {
        if (!dragging) return;
        const dx = ev.clientX - dragLastX, dy = ev.clientY - dragLastY;
        dragLastX = ev.clientX; dragLastY = ev.clientY;
        camera.yaw   += dx * LOOK_SENS;
        camera.pitch += dy * LOOK_SENS;
        camera.pitch = Math.max(-Math.PI / 2.1, Math.min(Math.PI / 2.1, camera.pitch));
    };
    const mu = () => { dragging = false; if (canvas) canvas.style.cursor = "crosshair"; };
    canvas.addEventListener("mousedown", md);
    window.addEventListener("mousemove", mm);
    window.addEventListener("mouseup", mu);

    const click = (ev) => {
        // Don't fire on HUD buttons
        if (ev.target.closest("button, input, select")) return;
        if (ev.target !== canvas) return;
        const now = performance.now();
        if (now - lastClickAt < 200) return;
        lastClickAt = now;
        if (!client?.active || !client?.isAlive?.()) return;
        const interp = client.getInterpolatedState();
        if (!interp) return;
        const dx = interp.x - camera.x, dz = interp.z - camera.z;
        const d = Math.hypot(dx, dz);
        if (d <= ATTACK_RANGE) {
            client.applyDamage(ATTACK_DAMAGE);
            damageDealtByMe += ATTACK_DAMAGE;
        } else if (ctxRef?.kpop?.info) {
            ctxRef.kpop.info("Out of range", `OGRE is ${d.toFixed(1)}u away`);
        }
    };
    canvas.addEventListener("click", click);

    return () => {
        window.removeEventListener("keydown", kd);
        window.removeEventListener("keyup", ku);
        canvas.removeEventListener("mousedown", md);
        window.removeEventListener("mousemove", mm);
        window.removeEventListener("mouseup", mu);
        canvas.removeEventListener("click", click);
    };
}

let cleanupInput = null;

// ============================================================
// Demo lifecycle
// ============================================================

export default {
    id:    "wad_arena",
    minimap: true,   // v460 — WAD level map
    label: "WAD ARENA — MULTIPLAYER IN A DOOM LEVEL",
    hint:  "Server loads a WAD (or fallback arena); fight an OGRE through real corridors",
    controls: [
        "WASD to move, drag mouse to look",
        "Click in the world to attack",
        "OPEN A SECOND TAB to fight alongside another player",
        "STREAM TO EXCEL: same frame view as before, now of an actual level",
    ],

    async start(ctx) {
        ctxRef = ctx;

        // Build the overlay canvas
        canvas = document.createElement("canvas");
        canvas.style.cssText = [
            "position:fixed", "left:0", "top:0", "right:0", "bottom:0",
            "width:100vw", "height:100vh",
            "z-index:900",
            "background:#080610",
            "cursor:crosshair",
        ].join(";");
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        document.body.appendChild(canvas);

        gl = canvas.getContext("webgl2", { antialias: true });
        if (!gl) {
            ctx.kpop?.info?.("WebGL2 unavailable", "Demo cannot run");
            return;
        }
        gl.enable(gl.DEPTH_TEST);
        gl.enable(gl.CULL_FACE);

        // HUD overlay (separate div for normal pointer events)
        hud = document.createElement("div");
        hud.style.cssText = [
            "position:fixed", "left:20px", "top:140px",
            "width:280px", "max-height:80vh", "overflow-y:auto",
            "background:rgba(8,12,24,0.94)",
            "border:1px solid #466", "border-radius:5px",
            "box-shadow:0 0 18px rgba(80,160,200,0.20)",
            "padding:12px 14px", "color:#9fd",
            "font:11px 'Courier New', monospace",
            "z-index:1000", "pointer-events:auto",
        ].join(";");
        document.body.appendChild(hud);

        // Load level
        level = new WadLevelRenderer(gl);
        const ok = await level.load();
        if (!ok) {
            hud.innerHTML = `<div style="color:#f99">Could not fetch /api/wad/geometry from the bridge.<br/>Is the server running?</div>`;
            return;
        }
        buildMarkerProg();

        // Spawn at the level's primary player start
        const spawn = level.getPrimarySpawn();
        camera.x = spawn.x;
        camera.z = spawn.z;
        camera.y = (level.getBounds()?.minY ?? 0) + EYE_HEIGHT;
        camera.yaw = (spawn.angle ?? 0) * Math.PI / 180;
        camera.pitch = 0;

        // Multiplayer client
        client = new SharedOgreClient();
        myName  = ctx?.kpop?.userName?.() || "Player_" + Math.floor(Math.random() * 999);
        myColor = `hsl(${Math.floor(Math.random() * 360)}, 70%, 60%)`;
        setTimeout(() => {
            if (client?.connected && client.ws) {
                client.ws.send(JSON.stringify({
                    type: "player:announce",
                    data: { name: myName, color: myColor },
                }));
            }
        }, 200);

        client.onAttack((msg) => {
            if (client.isAttackingMe(msg)) {
                flashHit("rgba(255,40,40,0.35)");
                ctx.kpop?.info?.("⚠ OGRE hit you", `-${msg.damage} HP`);
            }
        });
        client.onPlayerDied((msg) => {
            if (msg.playerId === client.myPlayerId) {
                ctx.kpop?.info?.("☠ YOU DIED", `Respawn in ${(msg.respawnInMs / 1000).toFixed(1)}s`);
            }
        });
        client.onPlayerRespawned((msg) => {
            if (msg.playerId === client.myPlayerId) {
                ctx.kpop?.info?.("✦ Respawned", "Back in the fight");
                // Reset to spawn position
                const sp = level.getPrimarySpawn();
                camera.x = sp.x; camera.z = sp.z;
            }
        });
        client.onWaveCountdown((msg) => {
            ctx.kpop?.info?.(`WAVE ${msg.nextWave} INCOMING`,
                `${msg.nextMaxHp} HP · spawning in ${(msg.startsInMs / 1000).toFixed(0)}s`);
        });
        client.onBomb((msg) => {
            flashHit("radial-gradient(circle at center, rgba(255,160,40,0.45), rgba(255,80,20,0.10))");
            ctx.kpop?.info?.(`💣 ${msg.source}`, msg.damage > 0 ? `-${msg.damage} HP` : "miss");
        });
        client.onKilled((msg) => {
            ctx.kpop?.info?.(`🎯 WAVE ${msg.wave} CLEARED`, "next wave incoming");
        });

        cleanupInput = setupInput();
        unloadHandler = () => { if (client) client.close(); if (streamer) streamer.stop(); };
        window.addEventListener("beforeunload", unloadHandler);

        lastFrameT = performance.now();
        tick();
        renderHUD();
        ctx.kpop?.info?.("WAD Arena", `Level: ${level.getName()} · click START WAVE`);
        console.log("[wad_arena] started in", level.getName());
    },

    tick() {
        // Driven by our own RAF loop in tick() above
    },

    stop(ctx) {
        if (animRAF) { cancelAnimationFrame(animRAF); animRAF = null; }
        if (cleanupInput) cleanupInput();
        cleanupInput = null;
        if (unloadHandler) window.removeEventListener("beforeunload", unloadHandler);
        unloadHandler = null;
        if (streamer) { streamer.stop(); streamer = null; }
        streaming = false;
        if (client) { client.close(); client = null; }
        if (level) { level.dispose(); level = null; }
        if (ogreSphere) {
            gl.deleteProgram(ogreSphere.prog);
            gl.deleteBuffer(ogreSphere.vb);
            gl.deleteBuffer(ogreSphere.ib);
            gl.deleteVertexArray(ogreSphere.vao);
            ogreSphere = null;
        }
        gl = null;
        if (canvas?.parentNode) canvas.parentNode.removeChild(canvas);
        if (hud?.parentNode)    hud.parentNode.removeChild(hud);
        canvas = null; hud = null;
        keys = {};
        ctxRef = null;
        console.log("[wad_arena] stopped");
    },
};
