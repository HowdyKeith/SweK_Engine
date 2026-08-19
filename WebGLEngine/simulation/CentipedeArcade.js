// FILE: simulation/CentipedeArcade.js
// VERSION: v612 (round 118 — player movement strip + mushroom field + camera lock)
//
// Centipede arcade gameplay v2. Builds on v611:
//   - Player turret now MOVES in a 2D strip at the bottom of the arena
//     (arrow keys). Constrained to x in [-26, +26], z in [-27, -15] so
//     you can dodge threats but can't walk into the chain's wander zone.
//   - Mushroom field: ~25 LAVA-orange voxel mushrooms scattered above
//     the player strip. 4 hits to destroy (+5). Bullets collide with
//     mushrooms first, then with chain segments — closest hit wins.
//   - Camera lock: while this demo is active, force-set camera position
//     + lookAt + clear camera.keys each tick so the engine's WASD/orbit
//     can't drift the arcade view. Restored on uninstall.
//
// Self-contained: own rAF tick, DOM overlays (crosshair / bullet / turret /
// score / hint), arrow-key listeners. install() / uninstall() from the
// demo's start() / stop().
//
// NOT in v612 (intentional, smallest-scope follow-ups):
//   - Spider that drops on a web, scorpion across the top, flea — the
//     user knows about the spider + scorpion ("snail bonus" was their
//     hazy memory of the scorpion). I'd google-and-build those once the
//     base game feels right.
//   - Centipede dodging mushrooms: chains currently walk THROUGH mushrooms
//     (would need CentipedeManager pathfinding changes). Hits still work.
//   - Chain auto-respawn when destroyed: use the centipedeManager.spawn()
//     console hint to spawn another chain manually.

const FLOOR_Y         = 1;              // matches the centipede demo's floor
const TARGET_Y        = FLOOR_Y + 1;    // crosshair / bullet flight plane
const BULLET_SPEED    = 30;             // world units / sec
const BULLET_LIFETIME = 3.0;            // sec before despawn timeout
const HIT_RADIUS      = 1.8;            // distance for centipede-segment hit
const MUSH_HIT_RADIUS = 1.2;            // smaller for mushroom hits (tighter than segments)
const ARENA_R         = 28;             // matches demo
const STRIP_X_MIN     = -26;
const STRIP_X_MAX     =  26;
const STRIP_Z_MIN     = -27;
const STRIP_Z_MAX     = -15;
const PLAYER_SPEED    = 14;             // units / sec
const MUSHROOM_COUNT  = 25;
const MUSHROOM_HP     = 4;              // classic Centipede: 4 hits, +5 on destroy
const VOXEL_LAVA      = 12;             // see world/voxelFormat.js — orange-glow
const VOXEL_AIR       = 0;

// Arcade-locked camera target. Top-down-ish with slight forward tilt so
// segments + mushrooms read as 3D rather than flat sprites.
const CAM_POS    = { x: 0,  y: 38, z: 10 };
const CAM_LOOKAT = { x: 0,  y:  2, z: -2 };

export class CentipedeArcade {
    constructor({ world, camera, canvas, centipedeManager }) {
        this.world = world;
        this.camera = camera;
        this.canvas = canvas;
        this.cm = centipedeManager;

        this.player = { x: 0, y: TARGET_Y + 1, z: -22 };   // mid-strip
        this.bullet = null;
        this.target = null;
        this.score = 0;
        this.mushrooms = [];          // [{ gridX, gridZ, hp }, ...]

        this.keys = new Set();        // own arrow-key state (separate from camera.keys)

        this._dom = {};
        this._rafId = null;
        this._lastT = 0;

        this._onMove   = this._onMove.bind(this);
        this._onClick  = this._onClick.bind(this);
        this._onKeyDn  = this._onKeyDn.bind(this);
        this._onKeyUp  = this._onKeyUp.bind(this);
    }

    install() {
        // ---- DOM overlays ----
        this._dom.crosshair = _mkDiv({
            position: "fixed", width: "22px", height: "22px",
            border: "2px solid #fc6", borderRadius: "50%",
            background: "rgba(255,200,80,0.15)",
            pointerEvents: "none", transform: "translate(-50%, -50%)",
            zIndex: "9090", display: "none",
        });
        this._dom.bullet = _mkDiv({
            position: "fixed", width: "10px", height: "10px",
            background: "#fc6", borderRadius: "50%",
            boxShadow: "0 0 14px #f80, 0 0 6px #fc6",
            pointerEvents: "none", transform: "translate(-50%, -50%)",
            zIndex: "9091", display: "none",
        });
        this._dom.turret = _mkDiv({
            position: "fixed", width: "16px", height: "16px",
            background: "#6cf", borderRadius: "50%",
            boxShadow: "0 0 12px #6cf, 0 0 4px #fff",
            pointerEvents: "none", transform: "translate(-50%, -50%)",
            zIndex: "9085", display: "none",
        });
        this._dom.score = _mkDiv({
            position: "fixed", top: "60px", right: "20px",
            color: "#fc6", fontFamily: "ui-monospace, 'Antonio', monospace",
            fontSize: "22px", fontWeight: "700",
            textShadow: "0 0 10px #f80, 0 0 4px #fc6",
            letterSpacing: "0.1em",
            pointerEvents: "none", zIndex: "9090",
        });
        this._dom.score.textContent = "SCORE  00000";
        this._dom.hint = _mkDiv({
            position: "fixed", bottom: "70px", left: "50%", transform: "translateX(-50%)",
            color: "#cde", fontFamily: "ui-monospace, monospace", fontSize: "11px",
            background: "rgba(10,30,60,0.7)", padding: "4px 12px", borderRadius: "12px",
            border: "1px solid #356", pointerEvents: "none", zIndex: "9090",
            whiteSpace: "nowrap",
        });
        this._dom.hint.textContent = "ARROWS: MOVE   MOUSE: AIM   CLICK: FIRE (one bullet at a time)";
        for (const el of Object.values(this._dom)) document.body.appendChild(el);

        // ---- mushroom field ----
        this._buildMushrooms();

        // ---- input ----
        this.canvas.addEventListener("mousemove", this._onMove);
        this.canvas.addEventListener("click", this._onClick);
        window.addEventListener("keydown", this._onKeyDn);
        window.addEventListener("keyup",   this._onKeyUp);

        // ---- rAF loop ----
        this._lastT = performance.now();
        const loop = (now) => {
            const dt = Math.min(0.1, (now - this._lastT) / 1000);
            this._lastT = now;
            this.update(dt);
            this._rafId = requestAnimationFrame(loop);
        };
        this._rafId = requestAnimationFrame(loop);
    }

    uninstall() {
        if (this._rafId) cancelAnimationFrame(this._rafId);
        this._rafId = null;
        this.canvas.removeEventListener("mousemove", this._onMove);
        this.canvas.removeEventListener("click", this._onClick);
        window.removeEventListener("keydown", this._onKeyDn);
        window.removeEventListener("keyup",   this._onKeyUp);
        for (const el of Object.values(this._dom)) { try { el.remove(); } catch {} }
        this._dom = {};
        this._removeMushrooms();
        this.bullet = null;
        this.target = null;
        this.keys.clear();
    }

    update(dt) {
        // 1. camera lock — overrides any engine input drift
        try {
            if (this.camera.position) {
                this.camera.position.x = CAM_POS.x;
                this.camera.position.y = CAM_POS.y;
                this.camera.position.z = CAM_POS.z;
            }
            if (this.camera.lookAt) this.camera.lookAt(CAM_LOOKAT.x, CAM_LOOKAT.y, CAM_LOOKAT.z);
            // also drain engine's WASD set so its update() doesn't spend a
            // frame accelerating away before we snap it back next tick.
            if (this.camera.keys && this.camera.keys.size > 0) this.camera.keys.clear();
        } catch (e) {}

        // 2. player movement from arrow keys (clamped to strip)
        let dx = 0, dz = 0;
        if (this.keys.has("ArrowLeft"))  dx -= 1;
        if (this.keys.has("ArrowRight")) dx += 1;
        if (this.keys.has("ArrowUp"))    dz -= 1;   // up = -z (toward chain)
        if (this.keys.has("ArrowDown"))  dz += 1;
        if (dx || dz) {
            const L = Math.hypot(dx, dz);
            this.player.x = _clamp(this.player.x + (dx / L) * PLAYER_SPEED * dt, STRIP_X_MIN, STRIP_X_MAX);
            this.player.z = _clamp(this.player.z + (dz / L) * PLAYER_SPEED * dt, STRIP_Z_MIN, STRIP_Z_MAX);
        }

        // 3. bullet advance + closest-first collision check
        if (this.bullet) {
            this.bullet.x += this.bullet.vx * dt;
            this.bullet.y += this.bullet.vy * dt;
            this.bullet.z += this.bullet.vz * dt;
            this.bullet.t += dt;

            // mushrooms first (closer to player)
            let hitMush = -1, hitMushD2 = Infinity;
            for (let i = 0; i < this.mushrooms.length; i++) {
                const m = this.mushrooms[i];
                if (m.hp <= 0) continue;
                // distance check on x/z only (mushrooms are a column)
                const d2 = (this.bullet.x - m.gridX) ** 2 + (this.bullet.z - m.gridZ) ** 2;
                if (d2 < MUSH_HIT_RADIUS * MUSH_HIT_RADIUS && d2 < hitMushD2) {
                    hitMush = i; hitMushD2 = d2;
                }
            }
            // centipede segments
            let hitChain = null, hitSeg = 0, hitSegD2 = Infinity;
            for (const c of this.cm.centipedes.values()) {
                const dh2 = _dist2(this.bullet, c);
                if (dh2 < HIT_RADIUS * HIT_RADIUS && dh2 < hitSegD2) {
                    hitChain = c.id; hitSeg = -1; hitSegD2 = dh2;
                }
                for (let i = 0; i < c.segments.length; i++) {
                    const d2 = _dist2(this.bullet, c.segments[i]);
                    if (d2 < HIT_RADIUS * HIT_RADIUS && d2 < hitSegD2) {
                        hitChain = c.id; hitSeg = i; hitSegD2 = d2;
                    }
                }
            }
            // resolve closest hit
            if (hitMush !== -1 && hitMushD2 <= hitSegD2) {
                this._damageMushroom(hitMush);
                this.bullet = null;
            } else if (hitChain != null) {
                this.cm.hit(hitChain, hitSeg);
                this.score += (hitSeg === -1 ? 100 : 5);
                this._renderScore();
                this.bullet = null;
            } else if (this.bullet.t > BULLET_LIFETIME ||
                       Math.abs(this.bullet.x) > ARENA_R + 2 ||
                       Math.abs(this.bullet.z) > ARENA_R + 2) {
                this.bullet = null;
            }
        }

        // 4. project DOM overlays
        this._projectDom(this._dom.bullet, this.bullet);
        this._projectDom(this._dom.turret, this.player);
    }

    // ---- mushroom field ----
    _buildMushrooms() {
        this.mushrooms = [];
        const placed = new Set();   // "gx,gz" to avoid duplicates
        let tries = 0;
        while (this.mushrooms.length < MUSHROOM_COUNT && tries < MUSHROOM_COUNT * 8) {
            tries++;
            const gx = Math.round(_lerp(-25, 25, Math.random()));
            // z range: above the player strip but inside the arena
            const gz = Math.round(_lerp(-14, 24, Math.random()));
            const key = gx + "," + gz;
            if (placed.has(key)) continue;
            placed.add(key);
            this.mushrooms.push({ gridX: gx, gridZ: gz, hp: MUSHROOM_HP });
            try { this.world.setVoxel(gx, FLOOR_Y + 1, gz, VOXEL_LAVA); } catch {}
        }
    }
    _removeMushrooms() {
        for (const m of this.mushrooms) {
            try { this.world.setVoxel(m.gridX, FLOOR_Y + 1, m.gridZ, VOXEL_AIR); } catch {}
        }
        this.mushrooms = [];
    }
    _damageMushroom(idx) {
        const m = this.mushrooms[idx];
        if (!m || m.hp <= 0) return;
        m.hp--;
        if (m.hp <= 0) {
            try { this.world.setVoxel(m.gridX, FLOOR_Y + 1, m.gridZ, VOXEL_AIR); } catch {}
            this.score += 5;
            this._renderScore();
        }
    }

    // ---- input handlers ----
    _onMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const t = this._screenToFloor(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height);
        if (t && Math.abs(t.x) <= ARENA_R && Math.abs(t.z) <= ARENA_R) {
            this.target = t;
            this._dom.crosshair.style.display = "block";
            this._dom.crosshair.style.left = e.clientX + "px";
            this._dom.crosshair.style.top  = e.clientY + "px";
        } else {
            this.target = null;
            this._dom.crosshair.style.display = "none";
        }
    }
    _onClick(e) {
        if (e.button !== 0) return;
        if (this.bullet || !this.target) return;
        const dx = this.target.x - this.player.x;
        const dy = this.target.y - this.player.y;
        const dz = this.target.z - this.player.z;
        const L = Math.sqrt(dx*dx + dy*dy + dz*dz);
        if (L < 0.01) return;
        this.bullet = {
            x: this.player.x, y: this.player.y, z: this.player.z,
            vx: (dx / L) * BULLET_SPEED,
            vy: (dy / L) * BULLET_SPEED,
            vz: (dz / L) * BULLET_SPEED,
            t: 0,
        };
    }
    _onKeyDn(e) {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown") {
            this.keys.add(e.key);
            e.preventDefault();
        }
    }
    _onKeyUp(e) {
        this.keys.delete(e.key);
    }

    // ---- camera math ----
    _screenToFloor(mx, my, w, h) {
        const ndcX = (mx / w) * 2 - 1;
        const ndcY = -((my / h) * 2 - 1);
        const fov = (this.camera.fov || (60 * Math.PI / 180));
        const aspect = w / h;
        const t = Math.tan(fov / 2);
        const fwd = (this.camera.getForwardVector?.() || { x: 0, y: 0, z: -1 });
        const wup = { x: 0, y: 1, z: 0 };
        const right = _norm(_cross(fwd, wup));
        const up    = _norm(_cross(right, fwd));
        const d = _norm({
            x: fwd.x + right.x * ndcX * t * aspect + up.x * ndcY * t,
            y: fwd.y + right.y * ndcX * t * aspect + up.y * ndcY * t,
            z: fwd.z + right.z * ndcX * t * aspect + up.z * ndcY * t,
        });
        if (Math.abs(d.y) < 1e-6) return null;
        const cam = this.camera.position || { x: 0, y: 30, z: 0 };
        const tHit = (TARGET_Y - cam.y) / d.y;
        if (tHit < 0) return null;
        return { x: cam.x + d.x * tHit, y: TARGET_Y, z: cam.z + d.z * tHit };
    }
    _projectDom(el, p) {
        if (!el) return;
        if (!p) { el.style.display = "none"; return; }
        const w = this.canvas.width, h = this.canvas.height;
        const cam = this.camera.position;
        const fwd = (this.camera.getForwardVector?.() || { x: 0, y: 0, z: -1 });
        const wup = { x: 0, y: 1, z: 0 };
        const right = _norm(_cross(fwd, wup));
        const up    = _norm(_cross(right, fwd));
        const rel = { x: p.x - cam.x, y: (p.y ?? TARGET_Y) - cam.y, z: p.z - cam.z };
        const fC = _dot(rel, fwd);
        if (fC <= 0.05) { el.style.display = "none"; return; }
        const rC = _dot(rel, right);
        const uC = _dot(rel, up);
        const aspect = w / h;
        const fov = (this.camera.fov || (60 * Math.PI / 180));
        const t = Math.tan(fov / 2);
        const ndcX = rC / (fC * t * aspect);
        const ndcY = uC / (fC * t);
        if (Math.abs(ndcX) > 1.4 || Math.abs(ndcY) > 1.4) { el.style.display = "none"; return; }
        const sx = (ndcX + 1) * 0.5 * w;
        const sy = (1 - ndcY) * 0.5 * h;
        const rect = this.canvas.getBoundingClientRect();
        el.style.display = "block";
        el.style.left = (rect.left + sx * (rect.width / w)) + "px";
        el.style.top  = (rect.top  + sy * (rect.height / h)) + "px";
    }

    _renderScore() {
        this._dom.score.textContent = "SCORE  " + String(this.score).padStart(5, "0");
    }
}

// ---- helpers ----
function _mkDiv(styles) { const d = document.createElement("div"); Object.assign(d.style, styles); return d; }
function _cross(a, b) { return { x: a.y*b.z - a.z*b.y, y: a.z*b.x - a.x*b.z, z: a.x*b.y - a.y*b.x }; }
function _dot(a, b)   { return a.x*b.x + a.y*b.y + a.z*b.z; }
function _norm(v)     { const L = Math.hypot(v.x, v.y, v.z); return L < 1e-6 ? v : { x: v.x/L, y: v.y/L, z: v.z/L }; }
function _dist2(a, b) { const dx = a.x - b.x, dy = (a.y||0) - (b.y||0), dz = a.z - b.z; return dx*dx + dy*dy + dz*dz; }
function _clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function _lerp(a, b, t) { return a + (b - a) * t; }
