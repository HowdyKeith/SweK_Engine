// WebGLEngine/ev/flightView.js — real-time in-system flight for the EV-compatible engine. Camera follows your
// ship (drawn centered, pointing along its heading); planets/stations sit in space at their spöb coordinates with a
// parallax starfield behind; you turn/thrust with the keyboard, drift with inertia, and land by flying up to a
// landable stellar and pressing L. Pure helpers (nearestLandable, shipTriangle, makeStarfield) are unit-testable;
// the GL + rAF loop + input are not (rig check).
//
//   import { FlightView } from "./flightView.js";
//   const fv = FlightView(canvas, { onHud, onLand:(spob)=>{}, onExit:()=>{} });
//   fv.enter(system, flightStats);   // flightStats from shipFlightStats(ship)
//
// Milestone 5a.

import { stepFlight, speedOf } from "./flightModel.js";
import { createESBox3D } from "../physics/esBox3d.js";           // v2266 -- experimental: fly the EV view on box3d (collisions)
import { box3d } from "../physics/box3d/box3dLoader.js";
import { planarFallbackWorld } from "../physics/planarFallbackWorld.js";
import { govtColor, worldToScreen, screenToWorld } from "./galaxyMap.js";
import { FireControl, stepShots } from "./shots.js";
import { stepAI, resolveHits, rechargeShield, spawnEnemies, spawnFromDudes } from "./combat.js";
import { DEFAULT_W, decide as tacticsDecide, applyBrainWeights } from "./esTactics.js";   // v2166 -- ES combat tactics
import { makeRng, spawnSeed, ownsNpc, packNpcs, mergeRemoteNpcs, ghostAt,                            // v2168/v2169 -- co-op authority
    validateDamage, noteAccepted, damageEvent, applyDamageEvent,                                     // v2171 -- the damage wire
    makeDeadBoard, noteDead, deadPack, MAX_NPCS_PER_PACKET } from "./esAuthority.js";   // v2172 -- kill credit
import { intentGhostAt } from "./npcGhost.js";   // v2252 -- curved (flight-model) ghost extrapolation, falls back to ghostAt
import { recordGrudges, clearGrudges, decayGrudges } from "./evData.js";

const LAND_RANGE = 90;   // world units within which a landable stellar can be landed on
const ESCORT_ENGAGE = 1500;   // an escort peels off to intercept a hostile within this range of the player

// A stable wing slot for escort `i`, in the player's frame (behind + alternating sides, ranked back). Returns a world
// point the escort flies to so it flanks the player and rotates with the player's heading.
function escortSlot(i, p) {
    const rank = Math.floor(i / 2) + 1, side = (i % 2 === 0) ? -1 : 1;
    const h = (p.heading || 0) * Math.PI / 180;
    const fwd = { x: Math.sin(h), y: -Math.cos(h) }, right = { x: Math.cos(h), y: Math.sin(h) };
    const back = 160 + rank * 70, lat = side * (130 + rank * 30);
    return { x: p.x - fwd.x * back + right.x * lat, y: p.y - fwd.y * back + right.y * lat };
}
// Decide an escort's move this frame: intercept the nearest hostile if one threatens the player's bubble, else hold the
// wing slot. Pure. Returns { target, engaging }.
function escortTarget(e, player, ships, slotIndex, engageR) {
    let ne = null, neD = Infinity;
    for (const o of ships) { if (o.dead || (o.team || "enemy") !== "enemy") continue; const dx = o.x - e.x, dy = o.y - e.y, d = dx * dx + dy * dy; if (d < neD) { neD = d; ne = o; } }
    if (ne && Math.hypot(ne.x - player.x, ne.y - player.y) < engageR) return { target: ne, engaging: true };
    return { target: escortSlot(slotIndex, player), engaging: false };
}
const ESCORT_ENGAGE_LINES = ["Engaging!", "On the pirate!", "I've got this one.", "Breaking to attack!", "Tally - moving in."];
const ESCORT_FORM_LINES = ["Re-forming on you.", "Back on your wing.", "Threat clear, forming up."];
// One quick-chat callout when an escort changes engagement state (forms <-> attacks), throttled per escort so it never
// spams. Pure: keeps its state on the ship (_engaging/_calloutAt/_calloutN). Returns a line or null.
function escortCallout(e, engaging, now, cooldownMs = 4000) {
    const was = !!e._engaging;
    if (engaging === was) return null;                 // no transition
    e._engaging = engaging;
    if (e._calloutAt != null && now - e._calloutAt < cooldownMs) return null;   // too soon since the last callout
    e._calloutAt = now; e._calloutN = (e._calloutN || 0) + 1;
    const pool = engaging ? ESCORT_ENGAGE_LINES : ESCORT_FORM_LINES;
    return pool[((e.id || 0) + e._calloutN - 1) % pool.length];
}
// The line to bubble over an escort right now: its last callout while still within the display window, else null.
function calloutBubble(e, now) { return (e._callout && e._callout.until > now) ? e._callout.line : null; }
// Ghost colour by allegiance: real pilots teal, bot pirate crews split red vs blue (a teamless bot defaults to red crew).
function ghostColor(pr) {
    if (!pr.bot) return [0.35, 0.95, 0.7];                 // real pilot - teal
    return pr.team === "blue" ? [0.40, 0.55, 1.0] : [1.0, 0.40, 0.30];   // blue crew / red crew
}
const GHOST_GROUPS = [
    { c: ghostColor({ bot: false }),              pick: (pr) => !pr.bot },                       // real pilots
    { c: ghostColor({ bot: true, team: "red" }),  pick: (pr) => pr.bot && pr.team !== "blue" },  // red crew (+ teamless bots)
    { c: ghostColor({ bot: true, team: "blue" }), pick: (pr) => pr.bot && pr.team === "blue" },  // blue crew
];

// ---------- pure helpers ----------
function nearestLandable(spobs, x, y, range) {
    let best = null, bestD = range * range;
    for (const s of spobs) { if (!s.canLand) continue; const dx = s.x - x, dy = s.y - y, d = dx * dx + dy * dy; if (d <= bestD) { bestD = d; best = s; } }
    return best ? { spob: best, dist: Math.sqrt(bestD) } : null;
}
// Three screen-space vertices of the ship marker, nose along heading (deg, 0 = up).
function shipTriangle(cx, cy, headingDeg, size) {
    const a = headingDeg * Math.PI / 180, pt = (ang, r) => [cx + Math.sin(ang) * r, cy - Math.cos(ang) * r];
    const tip = pt(a, size), l = pt(a + 140 * Math.PI / 180, size * 0.85), r = pt(a - 140 * Math.PI / 180, size * 0.85);
    return [tip[0], tip[1], l[0], l[1], r[0], r[1]];
}
function mulberry32(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function makeStarfield(n, spread, seed = 1) {
    const rnd = mulberry32(seed), out = new Float32Array(n * 8);
    for (let i = 0; i < n; i++) {
        const b = 0.55 + rnd() * 0.45;   // brightness
        out.set([(rnd() * 2 - 1) * spread, (rnd() * 2 - 1) * spread, b * 0.85, b * 0.9, b, 3, 0, 1.4 + rnd() * 1.6], i * 8);
    }
    return out;
}

// ---------- WebGL2 ----------
const P_VS = `#version 300 es
precision highp float;
in vec2 a_pos; in vec3 a_color; in float a_kind; in float a_land; in float a_size;
uniform vec2 u_center; uniform float u_scale; uniform vec2 u_res; uniform float u_zoom;
out vec3 v_color; out float v_kind; out float v_land;
void main(){
  vec2 screen = (a_pos - u_center) * u_scale + u_res * 0.5;
  gl_Position = vec4(screen.x / u_res.x * 2.0 - 1.0, 1.0 - screen.y / u_res.y * 2.0, 0.0, 1.0);
  gl_PointSize = a_size * u_zoom;
  v_color = a_color; v_kind = a_kind; v_land = a_land;
}`;
// v3178 -- THE LIGHT DIRECTION, DRAGGABLE.
//
// Kept as a module-level vector rather than threaded through every draw call, because it is a PROPERTY OF THE
// SCENE and not of one frame. The default is v3177's constant, so a page that never touches it renders
// EXACTLY as it did -- a control nobody uses must not change what anybody sees.
let _lightDir = [-0.45, 0.55, 0.70];

/** Set the sun direction. Not normalized here: the shader does it, so a caller cannot make it wrong. */
export function setLightDir(x, y, z) {
    // A ZERO VECTOR HAS NO DIRECTION, and normalize(vec3(0)) is NaN in GLSL -- which would paint every planet
    // black-or-worse rather than reporting anything. Refused, and the previous direction kept.
    if (!(Math.abs(x) + Math.abs(y) + Math.abs(z) > 1e-6)) return { ok: false, why: "zero vector has no direction" };
    _lightDir = [x, y, z];
    return { ok: true, dir: _lightDir.slice() };
}
export function lightDir() { return _lightDir.slice(); }

const P_FS = `#version 300 es
precision highp float;
in vec3 v_color; in float v_kind; in float v_land; out vec4 frag;
// v3178 -- THE LIGHT IS A UNIFORM NOW, AND THAT IS WHAT MAKES THE CLAIM FALSIFIABLE.
//
// v3177 lit these as sphere impostors against a FIXED direction, and a fixed light cannot prove anything: A
// STATIC LIT SPHERE AND A STATIC SHADED DISC LOOK THE SAME. Both are bright on one side. The difference only
// appears IN MOTION -- a flat disc's light/dark boundary is STRAIGHT and slides across, while a sphere's
// TERMINATOR BOWS and collapses to a crescent near grazing. One frame is plausible; a moving light is proof.
uniform vec3 u_light;
void main(){
  float r = length(gl_PointCoord - vec2(0.5)) * 2.0;
  vec4 c = vec4(0.0);
  // v3177 -- LIT AS A SPHERE, NOT SHADED AS A DISC.
  //
  // These are gl_PointCoord sprites drawn procedurally from vertex colour -- THERE IS NO TEXTURE HERE, so a
  // normal MAP is the wrong tool: there is nothing to sample. But a point sprite standing in for a sphere has
  // an ANALYTIC normal, and it costs one sqrt: for p in [-1,1]^2 across the quad, N = vec3(p, sqrt(1 - p.p)).
  // That is the classic sphere impostor, and it is exact rather than approximated.
  //
  // *** THE TERMINATOR IS THE POINT. *** A flat disc lit by a constant reads as a COIN; a sphere impostor has a
  // curved day/night boundary that moves as the light does, which is the single cue that says "this is a ball".
  // render/EntityMeshRenderer.js has bound normals for meshes since Round 175 and NOTHING IN THE BILLBOARD PATH
  // EVER HAD ONE -- ev/flightView.js and render/entityVisuals.js both read a colour and stop.
  //
  // GUARDED AT THE RIM: outside the disc 1 - p.p goes NEGATIVE and sqrt of it is NaN, which propagates through
  // the dot product and paints the whole sprite. The disc is discarded there anyway, but relying on a discard
  // that happens LATER to protect an earlier NaN is trusting the order of two unrelated decisions.
  vec2 sp = (gl_PointCoord - vec2(0.5)) * 2.0;
  float sz = 1.0 - dot(sp, sp);
  vec3 sphN = vec3(sp.x, -sp.y, sqrt(max(sz, 0.0)));
  // A FIXED LIGHT, and it is a choice rather than an oversight: these sprites carry no world transform, so a
  // scene light would need one. Up-left-toward-viewer is the convention every planet render uses.
  // NORMALIZED HERE, not trusted from the caller. A uniform is whatever somebody last wrote into it, and an
  // unnormalized direction scales the lambert term by its length -- a brightness change that reads as a
  // material choice and is an arithmetic error. Normalizing twice costs nothing; trusting once costs a bug.
  float lam = max(dot(sphN, normalize(u_light)), 0.0);
  float shade = 0.25 + 0.75 * lam;      // ambient floor, so the night side is dim rather than black
  if (v_kind < 0.5) { float disc = smoothstep(1.0,0.86,r); float core = smoothstep(0.9,0.0,r); c = vec4(mix(v_color, vec3(1.0), pow(core,4.0)*0.35), disc); }
  else if (v_kind < 1.5) { c = vec4(v_color, smoothstep(0.12,0.0,abs(r-0.78))); }
  else if (v_kind < 3.5) { c = vec4(v_color, smoothstep(1.0,0.0,r) * 0.7); }
  else { float core = smoothstep(1.0,0.0,r); c = vec4(mix(v_color, vec3(1.0), 0.5), pow(core,1.5)); }   // shot
  if (v_kind < 0.5) c.rgb *= shade;      // planets only: shots and rings are emissive, not lit
  if (v_land > 0.5 && v_kind < 1.5) { float ring = smoothstep(0.07,0.0,abs(r-1.0)); c.rgb += vec3(0.35,0.75,1.0)*ring; c.a = max(c.a, ring); }
  if (c.a < 0.02) discard;
  frag = c;
}`;
const S_VS = `#version 300 es
precision highp float;
in vec2 a_screen; uniform vec2 u_res;
void main(){ gl_Position = vec4(a_screen.x / u_res.x * 2.0 - 1.0, 1.0 - a_screen.y / u_res.y * 2.0, 0.0, 1.0); }`;
const S_FS = `#version 300 es
precision highp float;
uniform vec4 u_color; out vec4 frag;
void main(){ frag = u_color; }`;
// Stage 3: textured ship sprite. A screen-space quad with UVs into a sprite
// atlas; the fragment samples the chosen rotation frame's sub-rectangle.
const T_VS = `#version 300 es
precision highp float;
in vec2 a_screen; in vec2 a_uv; uniform vec2 u_res; out vec2 v_uv;
void main(){ v_uv = a_uv; gl_Position = vec4(a_screen.x / u_res.x * 2.0 - 1.0, 1.0 - a_screen.y / u_res.y * 2.0, 0.0, 1.0); }`;
const T_FS = `#version 300 es
precision highp float;
in vec2 v_uv; uniform sampler2D u_tex; uniform float u_alpha; out vec4 frag;
void main(){ vec4 c = texture(u_tex, v_uv); if (c.a < 0.02) discard; frag = vec4(c.rgb, c.a * u_alpha); }`;
function compile(gl, t, s) { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error("shader: " + gl.getShaderInfoLog(sh)); return sh; }
function program(gl, vs, fs) { const p = gl.createProgram(); gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs)); gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error("link: " + gl.getProgramInfoLog(p)); return p; }

function FlightView(canvas, opts = {}) {
    const gl = canvas.getContext("webgl2", { antialias: true, alpha: false });
    if (!gl) throw new Error("WebGL2 not available");
    const pProg = program(gl, P_VS, P_FS), sProg = program(gl, S_VS, S_FS), tProg = program(gl, T_VS, T_FS);
    const pl = { a_pos: gl.getAttribLocation(pProg, "a_pos"), a_color: gl.getAttribLocation(pProg, "a_color"), a_kind: gl.getAttribLocation(pProg, "a_kind"),
        a_land: gl.getAttribLocation(pProg, "a_land"), a_size: gl.getAttribLocation(pProg, "a_size"), u_center: gl.getUniformLocation(pProg, "u_center"),
        u_scale: gl.getUniformLocation(pProg, "u_scale"), u_res: gl.getUniformLocation(pProg, "u_res"), u_zoom: gl.getUniformLocation(pProg, "u_zoom"), u_light: gl.getUniformLocation(pProg, "u_light") };
    const sl = { a_screen: gl.getAttribLocation(sProg, "a_screen"), u_res: gl.getUniformLocation(sProg, "u_res"), u_color: gl.getUniformLocation(sProg, "u_color") };
    const tl = { a_screen: gl.getAttribLocation(tProg, "a_screen"), a_uv: gl.getAttribLocation(tProg, "a_uv"), u_res: gl.getUniformLocation(tProg, "u_res"),
        u_tex: gl.getUniformLocation(tProg, "u_tex"), u_alpha: gl.getUniformLocation(tProg, "u_alpha") };
    const starBuf = gl.createBuffer(), planetBuf = gl.createBuffer(), shipBuf = gl.createBuffer(), shotBuf = gl.createBuffer(), enemyBuf = gl.createBuffer(), peerBuf = gl.createBuffer();
    const spriteQuadBuf = gl.createBuffer();
    // Stage 3 sprite atlas state: { tex, sheetW, sheetH, frameW, frameH, frameCount, gridW, perRotation }
    let sprite = null;              // the player ship's sprite
    const shipSprites = new Map();  // ship class id -> sprite atlas (for enemies/peers)
    const STRIDE = 8 * 4;

    let st = { x: 0, y: 0, vx: 0, vy: 0, heading: 0 }, stats = { accel: 300, speed: 300, turn: 90 };
    let system = null, spobs = [], nStars = 0, nPlanets = 0, camScale = 0.7, dpr = 1, dims = { W: 1, H: 1 };
    // Render-quality control (addresses the classic EV scaling/resolution gripes):
    //   renderScale multiplies the backing-store resolution. 1 = match display;
    //   >1 supersamples for razor-sharp ships/text on any display; the old engine
    //   capped effective DPR at ~1 and blurred on HiDPI. dprCap lets HiDPI panels
    //   render at their true pixel density (up to 3x) instead of the old 2x clamp.
    let renderScale = 1;      // 0.75 (perf) .. 2 (supersampled)
    let dprCap = 3;           // was effectively 2; modern displays go higher
    let running = false, raf = null, lastT = 0, landTarget = null;
    let shots = [], fc = new FireControl([]), speedScale = 1;
    let enemies = [], explosions = [], hp = { shield: 100, armor: 100, maxShield: 100, maxArmor: 100, shieldRech: 0 };

    // v2266/v2316 -- fly the player + owned NPCs on the box3d substrate so ships COLLIDE, on the deterministic
    // WASM once it's ready and the JS planarFallbackWorld until then. box3d owns position/velocity/collision;
    // heading stays flight-model-owned. DEFAULT-ON as of v2316 (localStorage voxelengine.evBox3d = "0" forces
    // classic stepFlight). Any failure permanently falls back to stepFlight via `dead`, so the classic flight
    // path is never at risk -- when EVBOX.on is false the frame runs exactly as before.
    const EVBOX = (() => {
        let world = null, adapter = null, key = "", on = false, ready = false, tried = false, dead = false, builtWasm = false;
        function ensure() { if (tried) return; tried = true; box3d.init().then((s) => { ready = !!(s && s.ready); }).catch(() => { ready = false; }); }
        function want() { try { return localStorage.getItem("voxelengine.evBox3d") !== "0"; } catch { return true; } }   // default-on; "0" forces classic stepFlight
        return {
            get on() { return on; },
            reconcile(ships) {
                if (dead) { on = false; return; }
                ensure();
                if (!want()) { on = false; return; }
                try {
                    const k = ships.map((s) => (s._bxid || (s._bxid = Math.random().toString(36).slice(2)))).join(",");
                    if (k !== key || !adapter || (ready && !builtWasm)) {   // rebuild on ship-set change OR to upgrade fallback -> WASM once it loads
                        if (adapter) { try { adapter.destroy(); } catch {} }
                        world = ready ? box3d.createWorld({ gravity: [0, 0, 0] }) : planarFallbackWorld();
                        builtWasm = ready;
                        adapter = createESBox3D(world, { shipHalf: 40 });
                        for (const s of ships) s._bx = adapter.add(s, s.stats || stats);
                        key = k;
                    }
                    on = true;
                } catch (e) { dead = true; on = false; }
            },
            drive(ship, input, dt) { try { if (ship._bx != null) adapter.driveShip(ship._bx, input, dt); } catch { dead = true; on = false; } },
            settle(dt) { try { adapter.step(dt); adapter.sync(); } catch { dead = true; on = false; } },
            mode() { return dead ? "classic\u00b7fallback" : (!on ? "classic" : (builtWasm ? "box3d" : "box3d\u00b7js")); },
        };
    })();
    try { if (typeof window !== "undefined") window.evBox3d = { enable() { localStorage.removeItem("voxelengine.evBox3d"); return "box3d EV flight ON (default) - ships collide on the deterministic substrate; JS fallback until the WASM loads"; }, disable() { localStorage.setItem("voxelengine.evBox3d", "0"); return "box3d EV flight OFF - classic stepFlight"; } }; } catch {}
    const _ctorOpts = opts; let entryOpts = opts;   // render()/frame() are siblings of enter(); use the merged view
    let net = null, callsign = "Pilot", shipNameStr = "", shipClassId = null, lastNet = 0, calloutSeq = 0;
    const keys = {};
    // v2171 -- the damage wire. `dmgSeq` numbers the hits WE report and must never restart: a peer's
    // replay guard drops any sequence it has already passed, so a counter reset on enter() would make
    // every subsequent hit look stale. It lives for the life of the view, across system jumps.
    // `dmgSeen` is the mirror image: the last sequence we accepted from each shooter.
    let dmgSeq = 0, inDmg = [], deadBoard = makeDeadBoard();
    const dmgSeen = new Map();
    const MAX_INBOUND = 256;      // a flood costs a frame's worth of events, never the loop
    const MAX_ENEMIES = 128;      // ...and a hostile peer cannot conjure an unbounded fleet
    const HIT_RR = 90 * 90;       // resolveHits' radius, squared. Foreign ships are hit on the same terms.
    const coopOn = () => !!(net && entryOpts && entryOpts.room && net.worldPeerIds && net.myId);

    function bindPoints() {
        gl.enableVertexAttribArray(pl.a_pos);   gl.vertexAttribPointer(pl.a_pos, 2, gl.FLOAT, false, STRIDE, 0);
        gl.enableVertexAttribArray(pl.a_color); gl.vertexAttribPointer(pl.a_color, 3, gl.FLOAT, false, STRIDE, 8);
        gl.enableVertexAttribArray(pl.a_kind);  gl.vertexAttribPointer(pl.a_kind, 1, gl.FLOAT, false, STRIDE, 20);
        gl.enableVertexAttribArray(pl.a_land);  gl.vertexAttribPointer(pl.a_land, 1, gl.FLOAT, false, STRIDE, 24);
        gl.enableVertexAttribArray(pl.a_size);  gl.vertexAttribPointer(pl.a_size, 1, gl.FLOAT, false, STRIDE, 28);
    }

    function enter(sys, flightStats, opts = {}) {
        system = sys; spobs = (sys && sys.spobs) || []; stats = flightStats; entryOpts = Object.assign({}, _ctorOpts, opts); decayGrudges(entryOpts.universe);
        fc = new FireControl(opts.loadout || []); speedScale = opts.speedScale != null ? opts.speedScale : 1; shots = [];
        st = { x: opts.x || 0, y: opts.y || 0, vx: 0, vy: 0, heading: opts.heading || 0 };
        const verts = [];
        for (const s of spobs) { const c = govtColor(s.govt), kind = s.isStation ? 1 : 0; verts.push(s.x, s.y, c[0], c[1], c[2], kind, s.canLand ? 1 : 0, kind === 1 ? 26 : 32); }
        nPlanets = verts.length / 8;
        gl.bindBuffer(gl.ARRAY_BUFFER, planetBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
        const stars = makeStarfield(500, 14000, (sys && sys.id) || 1); nStars = stars.length / 8;
        gl.bindBuffer(gl.ARRAY_BUFFER, starBuf); gl.bufferData(gl.ARRAY_BUFFER, stars, gl.STATIC_DRAW);
        // player hull
        const ps = opts.playerShip || {};
        hp = { shield: ps.shield > 0 ? ps.shield : 100, armor: ps.armor > 0 ? ps.armor : 100,
            maxShield: ps.shield > 0 ? ps.shield : 100, maxArmor: ps.armor > 0 ? ps.armor : 100, shieldRech: ps.shieldRech || 0 };
        // presence (co-op)
        net = opts.net || null; callsign = opts.callsign || "Pilot"; shipNameStr = opts.shipName || ""; lastNet = 0;
        shipClassId = (ps && ps.id != null) ? ps.id : null;
        // hostile wing
        explosions = [];
        enemies = [];
        inDmg = []; deadBoard = makeDeadBoard();   // v2171 -- a new system: no corpses to announce, no hits in flight
        // Engine-agnostic spawn hook: the host supplies the ship mix (used by the ES path to drop ambient
        // fleets + this system's mission NPCs). Returns ship entities shaped like combat.makeEnemy's output.
        // v2168 -- co-op determinism. combat.js already accepts an injectable `rnd`; seed it from
        // (room, system) and every pilot in the room meets the SAME hostiles, with no server and no
        // handshake. Solo play passes no room and keeps Math.random, so nothing changes.
        const coopRnd = opts.room != null && system ? makeRng(spawnSeed(opts.room, system.id)) : undefined;
        // v2172 -- ...and the spawn hook gets it too. Until now `coopRnd` reached only the two fallback
        // spawners below, so the ES path -- which always takes the hook -- rolled Math.random on every
        // client and handed out ids 1..n. Two pilots in a room spawned DIFFERENT ships with IDENTICAL
        // ids, and the ring then split them: each adopted the other's state onto the wrong hull. The
        // hook is also told who we are, so it can namespace the ships only WE have.
        if (opts.spawn) {
            const ctx = { rnd: coopRnd, room: opts.room, systemId: system ? system.id : null,
                me: (net && net.myId && opts.room != null) ? net.myId() : null };
            try { enemies = opts.spawn(system, { x: st.x, y: st.y }, speedScale, ctx) || []; } catch (e) { enemies = []; }
        }
        if (!enemies.length && opts.universe && opts.universe.dudes && system && (system.dudeTypes || []).some((d) => d >= 128)) {
            enemies = spawnFromDudes(system, opts.universe, { x: st.x, y: st.y }, { speedScale, minR: 1100, spread: 900, rnd: coopRnd });
        }
        if (!enemies.length && opts.enemyClasses && opts.enemyClasses.length) {
            enemies = spawnEnemies(opts.enemyClasses, opts.weapons || {}, { x: st.x, y: st.y }, { count: opts.enemyCount || 3, govt: opts.enemyGovt, speedScale, minR: 1100, spread: 800, rnd: coopRnd });
        }
        start();
    }

    function render() {
        const { W, H } = dims;
        const eff = dpr * renderScale;   // effective device pixels per CSS pixel
        gl.viewport(0, 0, W, H);
        gl.clearColor(0.01, 0.012, 0.03, 1); gl.clear(gl.COLOR_BUFFER_BIT);
        gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.useProgram(pProg); gl.uniform1f(pl.u_scale, camScale); gl.uniform2f(pl.u_res, W, H);
        // starfield (parallax: camera moves slower)
        if (nStars) { gl.uniform2f(pl.u_center, st.x * 0.4, st.y * 0.4); gl.uniform1f(pl.u_zoom, 1);
            gl.bindBuffer(gl.ARRAY_BUFFER, starBuf); bindPoints(); gl.drawArrays(gl.POINTS, 0, nStars); }
        // planets / stations
        if (nPlanets) { gl.uniform2f(pl.u_center, st.x, st.y); gl.uniform1f(pl.u_zoom, Math.max(0.7, Math.min(6, camScale * 0.5)));
            // SET EVERY FRAME, not once at init. A uniform is per-program state and this program is also used
            // for stars and shots; setting it once would leave whatever the last caller happened to write.
            if (pl.u_light) gl.uniform3f(pl.u_light, _lightDir[0], _lightDir[1], _lightDir[2]);
            gl.bindBuffer(gl.ARRAY_BUFFER, planetBuf); bindPoints(); gl.drawArrays(gl.POINTS, 0, nPlanets); }
        const view = { x: st.x, y: st.y, scale: camScale };
        // enemy ships: draw as their real sprite if the class has one loaded,
        // otherwise the team-colored triangle. Sprited ones are drawn per-ship
        // (blended); the rest batch by team as before.
        if (enemies.length) {
            const TEAMCOL = { enemy: [1.0, 0.42, 0.34], ally: [0.45, 0.95, 0.55], neutral: [0.72, 0.74, 0.8] };
            const eScale = Math.max(0.5, Math.min(2.2, camScale)) * eff;
            const sprited = [], plain = [];
            for (const e of enemies) { (shipSprites.has(e.cls && e.cls.id) ? sprited : plain).push(e); }
            // sprite ships first (textured, blended)
            if (sprited.length) {
                gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
                for (const e of sprited) { const p = worldToScreen(view, W, H, e.x, e.y); drawSpriteQuad(p.sx, p.sy, e.heading, eScale, e.dead ? 0.35 : 1, shipSprites.get(e.cls.id)); }
            }
            // triangle ships (grouped by team color)
            if (plain.length) {
                gl.useProgram(sProg); gl.uniform2f(sl.u_res, W, H);
                for (const tm of ["neutral", "ally", "enemy"]) {
                    const list = plain.filter((e) => (e.team || "enemy") === tm); if (!list.length) continue;
                    const tri = new Float32Array(list.length * 6);
                    for (let i = 0; i < list.length; i++) { const e = list[i], p = worldToScreen(view, W, H, e.x, e.y); tri.set(shipTriangle(p.sx, p.sy, e.heading, 11 * eff), i * 6); }
                    const c = TEAMCOL[tm] || TEAMCOL.enemy; gl.uniform4f(sl.u_color, c[0], c[1], c[2], 0.95);
                    gl.bindBuffer(gl.ARRAY_BUFFER, enemyBuf); gl.bufferData(gl.ARRAY_BUFFER, tri, gl.DYNAMIC_DRAW);
                    gl.enableVertexAttribArray(sl.a_screen); gl.vertexAttribPointer(sl.a_screen, 2, gl.FLOAT, false, 0, 0);
                    gl.drawArrays(gl.TRIANGLES, 0, list.length * 3);
                }
            }
        }
        // remote pilots (presence) - real pilots teal, the two bot pirate crews red vs blue.
        // Draw peers whose ship CLASS we have a sprite for as that sprite; the rest as
        // ghost-colored triangles (grouped by crew).
        const peers = net ? net.peers(system ? system.id : null) : [];
        if (peers.length) {
            const eScale = Math.max(0.5, Math.min(2.2, camScale)) * eff;
            const spritedPeers = peers.filter((pr) => shipSprites.has(pr.shipClass));
            const plainPeers = peers.filter((pr) => !shipSprites.has(pr.shipClass));
            if (spritedPeers.length) {
                gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
                for (const pr of spritedPeers) { const p = worldToScreen(view, W, H, pr.x, pr.y); drawSpriteQuad(p.sx, p.sy, pr.heading, eScale, 0.95, shipSprites.get(pr.shipClass)); }
            }
            if (plainPeers.length) {
                gl.useProgram(sProg); gl.uniform2f(sl.u_res, W, H);
                for (const grp of GHOST_GROUPS) {
                    const list = plainPeers.filter(grp.pick); if (!list.length) continue;
                    const tri = new Float32Array(list.length * 6);
                    for (let i = 0; i < list.length; i++) { const pr = list[i], p = worldToScreen(view, W, H, pr.x, pr.y); tri.set(shipTriangle(p.sx, p.sy, pr.heading, 11 * eff), i * 6); }
                    gl.uniform4f(sl.u_color, grp.c[0], grp.c[1], grp.c[2], 0.95);
                    gl.bindBuffer(gl.ARRAY_BUFFER, peerBuf); gl.bufferData(gl.ARRAY_BUFFER, tri, gl.DYNAMIC_DRAW);
                    gl.enableVertexAttribArray(sl.a_screen); gl.vertexAttribPointer(sl.a_screen, 2, gl.FLOAT, false, 0, 0);
                    gl.drawArrays(gl.TRIANGLES, 0, list.length * 3);
                }
            }
        }
        if (entryOpts.onPeers) entryOpts.onPeers(peers.map((pr) => { const p = worldToScreen(view, W, H, pr.x, pr.y); return { id: pr.id, name: pr.name, sx: p.sx / eff, sy: p.sy / eff, bot: !!pr.bot, hp: pr.hp, team: pr.team }; }));
        if (entryOpts.onCalloutBubbles) {
            const cbs = [];
            for (const e of enemies) { const line = (!e.dead && (e.team || "enemy") === "ally") ? calloutBubble(e, lastT) : null; if (!line) continue; if (!e._cid) e._cid = "esc" + (++calloutSeq); const p = worldToScreen(view, W, H, e.x, e.y); cbs.push({ id: e._cid, line, sx: p.sx / eff, sy: p.sy / eff }); }
            entryOpts.onCalloutBubbles(cbs);
        }
        // shots (team-colored) + explosions, additive
        const extra = shots.length + explosions.length;
        if (extra) {
            const arr = new Float32Array(extra * 8); let o = 0;
            for (const s of shots) { const en = s.team === "enemy"; const beam = s.kind === "beam"; const g = en ? (beam ? 0.55 : 0.32) : (beam ? 0.98 : 0.55); const b = en ? (beam ? 0.55 : 0.32) : (beam ? 0.98 : 0.55); const sz = beam ? 9 : (s.kind === "homing" ? 7 : 6); arr.set([s.x, s.y, 1.0, g, b, 4, 0, sz], o); o += 8; }
            for (const e of explosions) { const f = Math.max(0, 1 - e.t / e.life), sz = (e.big ? 16 : 8) + (e.t / e.life) * (e.big ? 70 : 28); arr.set([e.x, e.y, f, 0.6 * f, 0.25 * f, 4, 0, sz], o); o += 8; }
            gl.useProgram(pProg); gl.uniform1f(pl.u_scale, camScale); gl.uniform2f(pl.u_res, W, H);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
            gl.uniform2f(pl.u_center, st.x, st.y); gl.uniform1f(pl.u_zoom, Math.max(0.8, Math.min(5, camScale * 0.6)));
            gl.bindBuffer(gl.ARRAY_BUFFER, shotBuf); gl.bufferData(gl.ARRAY_BUFFER, arr, gl.DYNAMIC_DRAW); bindPoints(); gl.drawArrays(gl.POINTS, 0, extra);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        }
        // ship marker at screen center, pointing along heading. Stage 3: draw the
        // textured sprite if one is loaded; otherwise the vector triangle.
        if (sprite) {
            gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
            const eff = dpr * renderScale;   // keep on-screen size constant under supersampling
            const s = Math.max(0.6, Math.min(3, camScale)) * eff;
            drawSpriteQuad(W / 2, H / 2, st.heading, s, 1);
        } else {
            const tri = shipTriangle(W / 2, H / 2, st.heading, 13 * dpr * renderScale);
            gl.useProgram(sProg); gl.uniform2f(sl.u_res, W, H);
            gl.bindBuffer(gl.ARRAY_BUFFER, shipBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(tri), gl.DYNAMIC_DRAW);
            gl.enableVertexAttribArray(sl.a_screen); gl.vertexAttribPointer(sl.a_screen, 2, gl.FLOAT, false, 0, 0);
            gl.uniform4f(sl.u_color, 0.55, 0.92, 1.0, 0.95); gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
    }

    function frame(t) {
        if (!running) return;
        const dt = Math.min(0.05, lastT ? (t - lastT) / 1000 : 0); lastT = t;
        const input = { turn: (keys.left ? -1 : 0) + (keys.right ? 1 : 0), thrust: !!keys.thrust };
        const _bxLocal = [st]; for (const e of enemies) if (!e._foreign && !e.dead) _bxLocal.push(e); EVBOX.reconcile(_bxLocal);
        if (EVBOX.on) EVBOX.drive(st, input, dt); else st = stepFlight(st, input, stats, dt);
        // broadcast presence (throttled)
        if (net && t - lastNet > 100) {
            // v2169 -- ride the npcs we own on the presence packet we already send at 10Hz. packNpcs
            // filters to owned + alive and caps the count, so a big brawl cannot inflate the packet.
            // v2171 -- corpses go FIRST. A dead ship announced for a grace window is what stops the
            // other clients dead-reckoning it forever; if the packet has to be truncated, the news of
            // a kill matters more than one more position update.
            let ownedNpcs;
            if (coopOn() && net.count()) {
                const ids = net.worldPeerIds(system ? system.id : null);
                const alive = packNpcs(enemies.filter((e) => !e.dead && !e._foreign), net.myId(), ids);
                const corpses = deadPack(deadBoard, Date.now());
                ownedNpcs = corpses.length ? corpses.concat(alive).slice(0, MAX_NPCS_PER_PACKET) : alive;
            }
            net.send({ name: callsign, system: system ? system.id : null, x: st.x, y: st.y, vx: st.vx, vy: st.vy, heading: st.heading, shipName: shipNameStr, shipClass: shipClassId, hp: Math.max(0, Math.min(100, Math.round((hp.shield + hp.armor) / Math.max(1, hp.maxShield + hp.maxArmor) * 100))), npcs: ownedNpcs });
            lastNet = t;
        }
        // player fire — turret + homing weapons aim at the nearest live enemy
        let pTarget = null, pBest = Infinity;
        for (const e of enemies) { if (e.dead || (e.team || "enemy") === "ally") continue; const dx = e.x - st.x, dy = e.y - st.y, d = dx * dx + dy * dy; if (d < pBest) { pBest = d; pTarget = e; } }
        for (const sh of fc.tick(dt, !!keys.fire, st, speedScale, pTarget)) { sh.team = "player"; shots.push(sh); if (entryOpts.onSound) entryOpts.onSound("fire", sh.weaponId); }
        try { if (typeof window !== "undefined" && window.swekTargetScan) {
            if (pTarget) { const mA = pTarget.maxArmor || pTarget.armorMax, mS = pTarget.maxShield || pTarget.shieldMax;
                window.swekTargetScan.scan({ id: pTarget.id, name: (pTarget.cls && pTarget.cls.name) || "TARGET",
                    hull: mA ? (pTarget.armor != null ? pTarget.armor : mA) / mA : 0.8, shield: mS ? (pTarget.shield != null ? pTarget.shield : mS) / mS : 0.5, weapon: 0.85,
                    atlas: (pTarget.cls && shipSprites.get(pTarget.cls.id)) || null, heading: pTarget.heading || 0 }); }
            else window.swekTargetScan.hide(); } } catch (e) {}   // v2376 -- tactical scan of the player's target
        // enemy AI: fly with the same model, fire with the same pipeline (turrets/homing aim at the player)
        // faction AI: enemies hunt the player + his escorts; escorts hunt hostiles; neutral traffic drifts until
        // provoked (resolveHits flips a shot-at neutral to "enemy"). Each ship flies + fires tagged with its own team.
        // v2166 -- weights come from the brain when it has served any; otherwise the hand policy.
        // applyBrainWeights validates: a garbage payload degrades to the hand policy, it never
        // produces a ship that stands still.
        const tacticsW = entryOpts.tacticsWeights ? applyBrainWeights(entryOpts.tacticsWeights, DEFAULT_W) : DEFAULT_W;
        // v2166 -- tactics scores a target on health and threat, so the player must arrive as a real
        // combatant, not a bare {x,y}. Without its live hp the player reads as undamaged AND harmless,
        // and hostiles would never finish a wounded pilot or fear a dangerous one. `dps` is left to the
        // default for everyone (NPC dps is not modelled either), so strength compares durability on
        // equal terms across player and NPC rather than pretending to a precision we do not have.
        const pPos = { id: "player", x: st.x, y: st.y, team: "player", isPlayer: true,
            shield: hp.shield, armor: hp.armor, maxShield: hp.maxShield, maxArmor: hp.maxArmor };
        const allies = enemies.filter((e) => !e.dead && (e.team || "enemy") === "ally");
        // v2169 -- co-op replication. Exactly one peer simulates each npc (esAuthority.ownsNpc). A
        // non-owner must NOT run the AI, must NOT fire, and must NOT recharge shields: two simulations
        // of the same ship diverge within seconds and then disagree about who is alive. Instead it
        // adopts the owner's last broadcast state, dead-reckoned. Solo play has no peer list, owns
        // everything, and this whole block is a no-op.
        const coop = coopOn();
        const worldPeers = coop ? net.worldPeerIds(system ? system.id : null) : null;
        const isMine = (e) => !coop || ownsNpc(net.myId(), e.id, worldPeers);
        let remote = null;
        if (coop) {
            const packets = net.peers(system ? system.id : null)
                .filter((pr) => Array.isArray(pr.npcs) && pr.npcs.length)
                .map((pr) => ({ from: pr.id, npcs: pr.npcs, t: pr.npcT }));
            remote = mergeRemoteNpcs(packets, net.myId(), worldPeers, { now: Date.now() }).states;

            // v2171 -- ADOPT foreign ships. A remote state whose id we have never seen used to be
            // merged into a Map that nothing then read: the GPU Brain's whole wing was replicated and
            // silently discarded. Its shots arrived (they route through ingestShot) and its ships did
            // not, which is exactly "they shoot you but can't be shot". Adopt each one as an inert
            // stub: drawn, targetable, shootable -- never simulated, because it isn't ours.
            const have = new Set(enemies.map((e) => e.id));
            for (const [id, s] of remote) {
                if (have.has(id) || s.dead || isMine({ id })) continue;
                if (enemies.length >= MAX_ENEMIES) break;
                enemies.push({ id, x: s.x, y: s.y, vx: 0, vy: 0, heading: s.heading, cls: null, fc: null, stats: null,
                    shield: s.shield, armor: s.armor, maxShield: Math.max(1, s.shield), maxArmor: Math.max(1, s.armor),
                    team: "enemy", govt: -1, dead: false, _foreign: true });
            }
            // ...and let them go when their owner does. A stub has no stats; no survivor can fly it.
            if (enemies.some((e) => e._foreign && !remote.has(e.id))) enemies = enemies.filter((e) => !e._foreign || remote.has(e.id));
        }

        for (const e of enemies) {
            const team = e.team || "enemy";
            if (coop && !isMine(e)) {
                const st2 = remote && remote.get(e.id);
                const g = st2 ? intentGhostAt(st2, Date.now()) : null;
                if (g) {
                    e.x = g.x; e.y = g.y; e.heading = g.heading;
                    e.shield = g.shield; e.armor = g.armor;
                    // The owner says it died. That is the only word we take on the matter -- and it is
                    // the payoff for reporting our hits: we see the ship we shot come apart.
                    // v2172 -- and if the owner named US as the one who finished it, the kill is ours
                    // to score. Only the named peer acts; to everyone else a ship simply died. No local
                    // tactics sample: we never ran a decision for a ship we do not simulate.
                    if (g.dead && !e.dead) {
                        e.dead = true;
                        explosions.push({ x: e.x, y: e.y, t: 0, life: 0.55, big: true });
                        if (entryOpts.onSound) entryOpts.onSound("explosion");
                        if (g.by != null && String(g.by) === String(net.myId()) && entryOpts.onKill) { try { entryOpts.onKill(e); } catch (err) {} }
                    }
                    e._ghost = true; e._stale = g.stale;
                }
                // No AI, no shots, no shield recharge. We are a spectator on this ship.
                continue;
            }
            let target = null, engaging = true;
            if (team === "enemy") {
                // v2166 -- TACTICS. The old rule was "nearest thing, forever, never break off". With
                // opts.tactics on (the ES path), esTactics picks a target worth shooting and decides
                // whether the fight is already lost. It only chooses; combat.js's stepAI still flies.
                // Gated so the EV path keeps its exact previous behaviour.
                const foes = [pPos];
                for (const o of enemies) { if (o.dead || o === e) continue; if ((o.team || "enemy") === "ally") foes.push(o); }
                if (entryOpts.tactics) {
                    const d = tacticsDecide(e, foes, tacticsW, { lastTargetId: e._tgtId, wasFleeing: e._fleeing, range: 1400 });
                    target = d.target; engaging = d.engaging;
                    e._fleeing = d.fleeing;
                    e._tgtId = (d.target && !d.target._flee) ? d.target.id : null;
                    // v2167 -- keep the decision AND its counterfactual so a later kill/death can be
                    // attributed to it. Without the runner-up there is no gradient (see tacticsPolicy).
                    if (d.feat && d.altFeat) { e._tacFeat = d.feat; e._tacAlt = d.altFeat; }
                } else {
                    let bestD = Infinity;
                    const consider = (o) => { const dx = o.x - e.x, dy = o.y - e.y, d = dx * dx + dy * dy; if (d < bestD) { bestD = d; target = o; } };
                    for (const o of foes) consider(o);
                }
            } else if (team === "ally") {
                const r = escortTarget(e, st, enemies, allies.indexOf(e), ESCORT_ENGAGE); target = r.target; engaging = r.engaging;
                if (engaging && entryOpts.tactics) {   // v2321 -- allied GPU wingmen: when a hostile is in the player's bubble, pick the target the brain would (health/threat-weighted), not just the nearest
                    const hostiles = enemies.filter((o) => !o.dead && (o.team || "enemy") === "enemy");
                    const d = tacticsDecide(e, hostiles, tacticsW, { lastTargetId: e._tgtId, wasFleeing: e._fleeing, range: ESCORT_ENGAGE });
                    if (d.target) { target = d.target; e._tgtId = d.target.id; if (d.feat && d.altFeat) { e._tacFeat = d.feat; e._tacAlt = d.altFeat; } }
                }
            } else { engaging = false; }   // neutral: drift
            let ai = target ? stepAI(e, target, { range: 1400, standoff: engaging ? 160 : 28 }) : { turn: 0, thrust: false, firing: false };
            if (!engaging && target && Math.hypot(target.x - e.x, target.y - e.y) < 60) ai = { turn: 0, thrust: false, firing: false };   // settle into the wing slot
            if (EVBOX.on) { EVBOX.drive(e, { turn: ai.turn, thrust: ai.thrust }, dt); }
            else { const ns = stepFlight(e, { turn: ai.turn, thrust: ai.thrust }, e.stats, dt); e.x = ns.x; e.y = ns.y; e.vx = ns.vx; e.vy = ns.vy; e.heading = ns.heading; }
            if (engaging && target && ai.firing) for (const sh of e.fc.tick(dt, ai.firing, e, speedScale, target)) { sh.team = team; shots.push(sh); }
            if (team === "ally") { const line = escortCallout(e, engaging, t); if (line) { e._callout = { line, until: t + 3000 }; if (entryOpts.onCallout) entryOpts.onCallout(line, e); } }
            rechargeShield(e, dt);
        }
        if (EVBOX.on) EVBOX.settle(dt);   // v2266 -- one shared box3d step: local ships collide, positions synced back
        // homing shots steer toward the nearest opposing target: player + live enemies, tagged by team
        const homingTargets = [{ x: st.x, y: st.y, team: "player" }];
        for (const e of enemies) if (!e.dead) homingTargets.push({ x: e.x, y: e.y, team: e.team || "enemy" });
        shots = stepShots(shots, dt, spobs, 60, homingTargets).shots;
        // hits
        // v2171 -- OUTBOUND DAMAGE. A shot that lands on a ship we do not own is not ours to resolve:
        // if both clients decremented the same hull it would die twice as fast, and the desync is
        // invisible until someone notices kills happening early. So we swallow the shot, draw the
        // spark, and send the owner an addressed event. What it did with the hit comes back as state.
        if (coop && entryOpts.onNpcHit) {
            const foreign = enemies.filter((e) => !e.dead && !isMine(e));
            if (foreign.length) {
                const keep = [];
                for (const sh of shots) {
                    if (sh.team === "player" || sh.team === "ally") {
                        let hit = null;
                        for (const e of foreign) { const dx = e.x - sh.x, dy = e.y - sh.y; if (dx * dx + dy * dy <= HIT_RR) { hit = e; break; } }
                        if (hit) {
                            try { entryOpts.onNpcHit(damageEvent(hit.id, net.myId(), ++dmgSeq, sh.dmgShield || 0, sh.dmgArmor || 0, system ? system.id : null)); } catch (err) {}
                            explosions.push({ x: sh.x, y: sh.y, t: 0, life: 0.18, big: false });
                            if (entryOpts.onSound) entryOpts.onSound("impact");
                            continue;   // consumed. The owner decides whether it hurt.
                        }
                    }
                    keep.push(sh);
                }
                shots = keep;
            }
        }
        const pp = { x: st.x, y: st.y, shield: hp.shield, armor: hp.armor };
        // Only the ships we own take local damage. Foreign hulls are the owner's to move.
        const res = resolveHits(shots, pp, coop ? enemies.filter(isMine) : enemies, 90); shots = res.shots; hp.shield = pp.shield; hp.armor = pp.armor;
        if (res.provoked && res.provoked.length) recordGrudges(entryOpts.universe, res.provoked);   // they (and their allies) remember across systems
        // v2171 -- INBOUND DAMAGE. Other peers report their hits on the ships WE own, and we are the
        // only client permitted to decrement those hulls. validateDamage is deliberately suspicious
        // (ownership, finiteness, a cap, a per-shooter replay guard); noteAccepted closes the sequence
        // so the same hit can never land twice, however many times it is redelivered.
        const netKilled = [];
        if (inDmg.length) {
            const q = inDmg; inDmg = [];
            for (const ev of q) {
                if (!coop) continue;
                const v = validateDamage(ev, net.myId(), worldPeers, { seen: dmgSeen, maxDamage: 2000 });
                if (!v.ok) continue;
                noteAccepted(dmgSeen, ev);
                const e = enemies.find((x) => x.id === ev.npcId && !x.dead && !x._foreign);
                if (!e) continue;                                       // already dead, or never ours
                explosions.push({ x: e.x, y: e.y, t: 0, life: 0.18, big: false });
                if (applyDamageEvent(e, ev)) { e.dead = true; e._killedBy = ev.from; netKilled.push(e); }
            }
        }
        const killed = netKilled.length ? res.killed.concat(netKilled) : res.killed;
        // Announce it, or they fly a corpse -- and name the killer, so a peer who shot one of our ships
        // learns that it landed. Anything we resolved locally, we killed.
        if (coop) for (const k of killed) noteDead(deadBoard, k, Date.now(), k._killedBy || net.myId());
        // player fire vs networked bot ghosts: resolve here, tell the bot via an onBotHit event, swallow the shot
        if (entryOpts.onBotHit && net) {
            const ghosts = net.peers(system ? system.id : null).filter((g) => g.bot);
            if (ghosts.length) {
                const keep = [];
                for (const sh of shots) {
                    if (sh.team === "player") {
                        let hit = null;
                        for (const g of ghosts) { const dx = g.x - sh.x, dy = g.y - sh.y; if (dx * dx + dy * dy <= 8100) { hit = g; break; } }
                        if (hit) { entryOpts.onBotHit(hit.id, sh.dmgShield || 0, sh.dmgArmor || 0); explosions.push({ x: sh.x, y: sh.y, t: 0, life: 0.18, big: false }); continue; }
                    }
                    keep.push(sh);
                }
                shots = keep;
            }
        }
        for (const k of killed) { explosions.push({ x: k.x, y: k.y, t: 0, life: 0.55, big: true }); if (entryOpts.onSound) entryOpts.onSound("explosion"); if (entryOpts.onKill) entryOpts.onKill(k); }
        // v2167 -- tactics reward. Attribution is deliberately conservative: we only credit a decision
        // we can actually tie to an outcome, and we never invent a sample without its counterfactual.
        //   a hostile died                  -> its OWN last decision was bad          (-1)
        //   a hostile's target was destroyed-> that hostile's decision was good       (+1)
        // Ships with no recorded decision (spawned this tick, or tactics off) contribute nothing.
        if (entryOpts.tactics && entryOpts.onTacticsOutcome && killed.length) {
            const out = [];
            for (const k of killed) {
                if ((k.team || "enemy") === "enemy" && k._tacFeat && k._tacAlt) out.push({ chosen: k._tacFeat, alt: k._tacAlt, reward: -1 });
                for (const e of enemies) {
                    if (e.dead || (e.team || "enemy") !== "enemy") continue;
                    if (e._tgtId != null && e._tgtId === k.id && e._tacFeat && e._tacAlt) out.push({ chosen: e._tacFeat, alt: e._tacAlt, reward: +1 });
                }
            }
            if (out.length) { try { entryOpts.onTacticsOutcome(out); } catch (err) {} }
        }
        if (entryOpts.tactics && entryOpts.onTacticsOutcome && res.playerDead) {
            const out = [];
            for (const e of enemies) {
                if (e.dead || (e.team || "enemy") !== "enemy") continue;
                if (e._tgtId === "player" && e._tacFeat && e._tacAlt) out.push({ chosen: e._tacFeat, alt: e._tacAlt, reward: +1 });
            }
            if (out.length) { try { entryOpts.onTacticsOutcome(out); } catch (err) {} }
        }
        for (const im of res.impacts) { explosions.push({ x: im.x, y: im.y, t: 0, life: 0.18, big: false }); if (entryOpts.onSound) entryOpts.onSound("impact"); }
        // v2171 -- a ghost the owner reported dead is dead too, and it is in nobody's `killed` list.
        if (killed.length || enemies.some((e) => e.dead)) enemies = enemies.filter((e) => !e.dead);
        rechargeShield(hp, dt);
        explosions = explosions.filter((x) => (x.t += dt) < x.life);
        const near = nearestLandable(spobs, st.x, st.y, LAND_RANGE); landTarget = near ? near.spob : null;
        render();
        if (entryOpts.onHud) entryOpts.onHud({ speed: speedOf(st), maxSpeed: stats.speed, heading: st.heading, physics: EVBOX.mode(),
            landPrompt: landTarget ? (landTarget.name || "stellar") : null, system: system ? system.name : "",
            armed: fc.armed ? fc.armedNames.join(", ") : "unarmed",
            shield: hp.shield, maxShield: hp.maxShield, armor: hp.armor, maxArmor: hp.maxArmor, enemies: enemies.length,
            pilots: net ? net.count() : 0 });
        if (res.playerDead) { stop(); if (entryOpts.onDeath) entryOpts.onDeath(); return; }
        raf = requestAnimationFrame(frame);
    }
    function start() { if (running) return; running = true; lastT = 0; window.addEventListener("keydown", onKey); window.addEventListener("keyup", onKey); raf = requestAnimationFrame(frame); }
    function stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = null; window.removeEventListener("keydown", onKey); window.removeEventListener("keyup", onKey); }

    function onKey(e) {
        const down = e.type === "keydown", k = e.key.toLowerCase();
        if (k === "arrowleft" || k === "a") keys.left = down;
        else if (k === "arrowright" || k === "d") keys.right = down;
        else if (k === "arrowup" || k === "w") keys.thrust = down;
        else if (k === " " || k === "spacebar") keys.fire = down;
        else if (down && k === "l") { if (landTarget && opts.onLand) { stop(); opts.onLand(landTarget); } }
        else if (down && (k === "escape" || k === "q")) { if (opts.onExit) { stop(); opts.onExit(); } }
        else return;
        if (["arrowleft", "arrowright", "arrowup", "arrowdown", " "].includes(e.key.toLowerCase())) e.preventDefault();
    }

    canvas.addEventListener("wheel", (e) => { e.preventDefault(); camScale *= Math.exp(-e.deltaY * 0.0012); camScale = Math.max(0.15, Math.min(6, camScale)); }, { passive: false });
    // touch pinch-zoom (mobile), same camScale as the wheel. Two-finger only, so single-finger steering passes through.
    let _pinchD = 0;
    canvas.addEventListener("touchmove", (e) => { if (e.touches.length === 2) { const dx = e.touches[0].clientX - e.touches[1].clientX, dy = e.touches[0].clientY - e.touches[1].clientY, d = Math.hypot(dx, dy); if (_pinchD) { camScale = Math.max(0.15, Math.min(6, camScale * (d / _pinchD))); e.preventDefault(); } _pinchD = d; } }, { passive: false });
    canvas.addEventListener("touchend", () => { _pinchD = 0; });
    function resize() { const r = canvas.getBoundingClientRect(); dpr = Math.min(dprCap, window.devicePixelRatio || 1);
        // backing store = CSS size * device pixel ratio * renderScale (supersampling).
        const eff = dpr * renderScale;
        canvas.width = Math.max(1, Math.round(r.width * eff)); canvas.height = Math.max(1, Math.round(r.height * eff)); dims = { W: canvas.width, H: canvas.height }; if (running) render(); }
    // Live render-quality controls. renderScale: 0.5..2 (supersampling for sharp
    // ships/UI); crisp: NEAREST vs LINEAR sprite filtering (pixel-art vs smooth).
    function setRenderScale(s) { renderScale = Math.max(0.5, Math.min(2, +s || 1)); resize(); }
    function setDprCap(c) { dprCap = Math.max(1, Math.min(4, +c || 3)); resize(); }
    function setCrisp(on) {
        if (!sprite) return;
        const f = on ? gl.NEAREST : gl.LINEAR;
        gl.bindTexture(gl.TEXTURE_2D, sprite.tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
        if (running) render();
    }
    function getRenderInfo() { return { renderScale, dprCap, dpr, backingW: dims.W, backingH: dims.H, cssW: Math.round(dims.W / (dpr * renderScale)), cssH: Math.round(dims.H / (dpr * renderScale)) }; }

    // Push a networked bot shot into the local sim, advanced to "now" so it appears + lands correctly. The frame's
    // resolveHits then damages the player if it connects (incoming bot shots are team "enemy").
    function ingestShot(ev) {
        if (!ev) return;
        if (ev.system != null && system && ev.system !== system.id) return;   // only shots in our current system
        const age = Math.max(0, (Date.now() - (ev.t || Date.now())) / 1000);
        const life = Math.min(2, (+ev.life || 1.2)) - age; if (life <= 0) return;
        const vx = +ev.vx || 0, vy = +ev.vy || 0;
        shots.push({ x: (+ev.x || 0) + vx * age, y: (+ev.y || 0) + vy * age, vx, vy, life,
            dmgShield: +ev.dmgShield || 0, dmgArmor: +ev.dmgArmor || 0, kind: ev.kind || "shot", team: ev.team || "enemy", _net: true });
    }
    // v2171 -- queue a damage event addressed to one of our npcs. Queued, not applied: the frame owns
    // the peer set, and validation without the peer set is guesswork. Bounded, because the sender may
    // be hostile or merely broken.
    function ingestDamage(ev) {
        if (!ev || ev.npcId == null) return;
        if (ev.system != null && system && ev.system !== system.id) return;   // not our system, not our ship
        if (inDmg.length >= MAX_INBOUND) return;
        inDmg.push(ev);
    }
    // --- Stage 3: give the flight view a decoded sprite atlas so ships render as
    //     textured, rotating sprites instead of triangles. buildAtlas uploads the
    //     decoded rlëD sheet as a GL texture and stores frame/grid metadata.
    function buildAtlas(dec, baseSetCount) {
        if (!dec || !dec.ok || !dec.frames || !dec.frames[0]) return null;
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, dec.sheetW, dec.sheetH, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(dec.frames[0].buffer));
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        const setCount = baseSetCount > 0 ? baseSetCount : 1;
        // v2377 -- also keep the decoded sheet as a 2D canvas so the tactical scan can read the REAL sprite
        // (the GL texture alone isn't reachable from Canvas2D). Cheap: one putImageData at load time.
        let sheetCanvas = null;
        try { if (typeof OffscreenCanvas !== "undefined") { sheetCanvas = new OffscreenCanvas(dec.sheetW, dec.sheetH); sheetCanvas.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(dec.frames[0].buffer), dec.sheetW, dec.sheetH), 0, 0); } } catch (e) { sheetCanvas = null; }
        return { tex, sheetW: dec.sheetW, sheetH: dec.sheetH, frameW: dec.width, frameH: dec.height,
            frameCount: dec.frameCount, gridW: dec.gridW, perRotation: Math.max(1, Math.round(dec.frameCount / setCount)), sheetCanvas };
    }
    // Player ship sprite. Pass null to revert to the triangle.
    function setSprite(dec, baseSetCount) { sprite = buildAtlas(dec, baseSetCount); return !!sprite; }
    // Register a sprite for an enemy/peer ship CLASS (keyed by ship resource id), so
    // AI ships draw as their real sprites too. Silently ignores undecodable input.
    function setShipSprite(classId, dec, baseSetCount) {
        if (classId == null) return false;
        const a = buildAtlas(dec, baseSetCount);
        if (a) shipSprites.set(classId, a); return !!a;
    }
    function clearShipSprites() { shipSprites.clear(); }

    // Draw a textured ship sprite centered at (cx,cy) screen px, oriented by heading.
    // Uses `atlas` if given, else the player sprite. Picks the rotation frame from
    // heading and maps its atlas sub-rect as UVs.
    function drawSpriteQuad(cx, cy, headingDeg, scale, alpha, atlas) {
        const sp = atlas || sprite;
        if (!sp) return false;
        const per = sp.perRotation;
        const h = ((headingDeg % 360) + 360) % 360;
        const frame = Math.round(h / 360 * per) % per;
        const gx = (frame % sp.gridW) * sp.frameW, gy = Math.floor(frame / sp.gridW) * sp.frameH;
        const u0 = gx / sp.sheetW, v0 = gy / sp.sheetH;
        const u1 = (gx + sp.frameW) / sp.sheetW, v1 = (gy + sp.frameH) / sp.sheetH;
        const hw = sp.frameW * 0.5 * scale, hh = sp.frameH * 0.5 * scale;
        const q = new Float32Array([
            cx - hw, cy - hh, u0, v0,   cx + hw, cy - hh, u1, v0,   cx - hw, cy + hh, u0, v1,
            cx + hw, cy - hh, u1, v0,   cx + hw, cy + hh, u1, v1,   cx - hw, cy + hh, u0, v1,
        ]);
        gl.useProgram(tProg); gl.uniform2f(tl.u_res, dims.W, dims.H); gl.uniform1f(tl.u_alpha, alpha == null ? 1 : alpha);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, sp.tex); gl.uniform1i(tl.u_tex, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, spriteQuadBuf); gl.bufferData(gl.ARRAY_BUFFER, q, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(tl.a_screen); gl.vertexAttribPointer(tl.a_screen, 2, gl.FLOAT, false, 16, 0);
        gl.enableVertexAttribArray(tl.a_uv); gl.vertexAttribPointer(tl.a_uv, 2, gl.FLOAT, false, 16, 8);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        return true;
    }

    // Nearest AI ship (or peer) to the player, for hailing/comms. Returns a light
    // descriptor { name, govt, team, cls, dist } or null.
    function nearestShip() {
        let best = null, bestD = Infinity;
        for (const e of enemies) { if (e.dead) continue; const dx = e.x - st.x, dy = e.y - st.y, d = dx * dx + dy * dy; if (d < bestD) { bestD = d; best = { name: e.name || (e.cls && e.cls.name) || "Unidentified ship", govt: e.govt, team: e.team || "enemy", cls: e.cls || null, dist: Math.sqrt(d) }; } }
        const peers = net ? net.peers(system ? system.id : null) : [];
        for (const pr of peers) { const dx = pr.x - st.x, dy = pr.y - st.y, d = dx * dx + dy * dy; if (d < bestD) { bestD = d; best = { name: pr.name || "Pilot", govt: -1, team: pr.team || "peer", cls: pr.shipClass != null ? { id: pr.shipClass } : null, peer: true, dist: Math.sqrt(d) }; } }
        return best;
    }

    return { enter, start, stop, resize, ingestShot, ingestDamage, setSprite, setShipSprite, clearShipSprites, nearestShip, setRenderScale, setDprCap, setCrisp, getRenderInfo, isRunning: () => running, state: () => st, clearRecord: () => clearGrudges(entryOpts.universe) };
}

export { FlightView, nearestLandable, shipTriangle, makeStarfield, escortSlot, escortTarget, escortCallout, calloutBubble, ghostColor };
