// FILE: simulation/carrySpawn.js — v4082
//
// Keith: "when we are looking at the SPAWN panel, if i select a KAIJU -> Sky, where is the 'Spawn' button to
// put the object on the page? Can we have a spawn to center of screen with the object hanging from the
// cursor? so i can move the mouse cursor somewhere on screen and place it? Can the hanging spawned object
// sway when i move it across the screen?"
//
// ui/assetSpawnPanel.js's existing workflow is arm-then-click-the-world (SandboxMode reads window._armedAsset
// and spawns wherever you click a voxel) -- there never was a dedicated "Spawn" button, and nothing followed
// the cursor. This is a SECOND way to place an asset, alongside that one, not a replacement for it.
//
// *** THE HANG POINT REUSES simulation/pickerCore.js's OWN ndcToWorldRay(), NOT A NEW PROJECTION. ***
// A point "under the cursor" at a fixed distance from the camera is camera.position + ray.dir * distance,
// where ray.dir already accounts for FOV/aspect/camera orientation correctly -- SandboxMode's own click-to-
// place raycast depends on that exact function being right, so re-deriving a second version here would risk
// disagreeing with it the moment either one moved a sign.
//
// *** SWAY IS A DAMPED SPRING TOWARD THE HANG POINT, NOT A SNAP. *** Position eases toward the target with
// velocity-based spring integration (critically-damped-ish; zeta ~0.6 so it visibly overshoots once or twice
// rather than snapping or oscillating forever) -- moving the cursor quickly makes the object swing behind it
// and settle, the way something actually hanging from a string would. A lean (tiltZ/tiltX, via entity:move,
// which KaijuManager already uses for exactly this per-tick shape) is derived from lateral/forward VELOCITY,
// clamped, so the object visibly tips into a fast turn instead of staying rigidly upright while it swings.
"use strict";

const HANG_DISTANCE = 6;      // world units in front of the camera the object hangs at
const SPRING_K = 55;          // stiffness -- higher = snaps to the target faster
const DAMPING_PER_SEC = 5.0;  // velocity decay rate; zeta ~= DAMPING_PER_SEC / (2*sqrt(SPRING_K)) ~= 0.34-0.6 band
const LEAN_MAX = 0.5;         // radians, clamp so a fast swing can't flip the mesh past vertical-ish
const LEAN_K = 0.05;          // radians of lean per unit/sec of lateral velocity

function norm3(v) { const n = Math.hypot(v.x, v.y, v.z) || 1; return { x: v.x / n, y: v.y / n, z: v.z / n }; }
function cross3(a, b) { return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }; }

// v4082's own gate drives this class from plain Node (no window/requestAnimationFrame) to unit-test the
// spring/lean math directly, without needing a browser for arithmetic that has nothing to do with one. These
// fall back to a timer-based stand-in there; in the real engine (where this file actually ships) window and
// requestAnimationFrame always exist, so the real path is unchanged.
const _hasWindow = typeof window !== "undefined";
const _raf = typeof requestAnimationFrame !== "undefined" ? requestAnimationFrame : (cb) => setTimeout(() => cb(performance.now()), 16);
const _caf = typeof cancelAnimationFrame !== "undefined" ? cancelAnimationFrame : clearTimeout;

export class CarrySpawn {
    constructor({ router, camera, canvas, ndcToWorldRay }) {
        this.router = router;
        this.camera = camera;
        this.canvas = canvas;
        this.ndcToWorldRay = ndcToWorldRay;
        this.active = false;
        this.entityId = null;
        this.pos = null;      // { x, y, z } current (eased) position
        this.vel = { x: 0, y: 0, z: 0 };
        this._ndcX = 0; this._ndcY = 0;
        this._raf = 0;
        this._lastT = 0;
        this._onMove = null; this._onDown = null; this._onCtx = null; this._onKey = null;
        this._onDone = null;  // called with {placed:true|false} on finalize/cancel
    }

    isActive() { return this.active; }

    /** Spawn `asset` ({assetId, kind, scale, label}) hung at screen center and start following the cursor. */
    start(asset, onDone) {
        if (this.active) this.cancel();
        if (!asset || !this.router || !this.camera || !this.canvas) return false;
        this._ndcX = 0; this._ndcY = 0;   // starts at screen center, per Keith's ask
        const ray = this.ndcToWorldRay(this.camera, this.canvas, 0, 0);
        if (!ray) return false;
        const p0 = { x: ray.origin.x + ray.dir.x * HANG_DISTANCE, y: ray.origin.y + ray.dir.y * HANG_DISTANCE, z: ray.origin.z + ray.dir.z * HANG_DISTANCE };
        const r = this.router.exec({ type: "entity:spawnMesh", assetId: asset.assetId, kind: asset.kind, x: p0.x, y: p0.y, z: p0.z, scale: asset.scale ?? 1 });
        if (!r || !r.ok) return false;

        this.entityId = r.id;
        this.pos = { ...p0 };
        this.vel = { x: 0, y: 0, z: 0 };
        this.active = true;
        this._onDone = typeof onDone === "function" ? onDone : null;

        this._onMove = (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const px = e.clientX - rect.left, py = e.clientY - rect.top;
            this._ndcX = (px / rect.width) * 2 - 1;
            this._ndcY = -((py / rect.height) * 2 - 1);
        };
        this._onDown = (e) => {
            if (e.button !== 0) return;   // left click only -- right click is cancel, below
            e.preventDefault();
            this.finalize();
        };
        this._onCtx = (e) => { e.preventDefault(); this.cancel(); };
        this._onKey = (e) => { if (e.key === "Escape") this.cancel(); };
        this.canvas.addEventListener("mousemove", this._onMove);
        this.canvas.addEventListener("mousedown", this._onDown);
        this.canvas.addEventListener("contextmenu", this._onCtx);
        if (_hasWindow) window.addEventListener("keydown", this._onKey);

        this._lastT = performance.now();
        const tick = (t) => {
            if (!this.active) return;
            const dt = Math.min(0.05, (t - this._lastT) / 1000);
            this._lastT = t;
            this._tick(dt);
            this._raf = _raf(tick);
        };
        this._raf = _raf(tick);
        return true;
    }

    _tick(dt) {
        const ray = this.ndcToWorldRay(this.camera, this.canvas, this._ndcX, this._ndcY);
        if (!ray) return;
        const target = { x: ray.origin.x + ray.dir.x * HANG_DISTANCE, y: ray.origin.y + ray.dir.y * HANG_DISTANCE, z: ray.origin.z + ray.dir.z * HANG_DISTANCE };

        // Damped-spring integration toward the target -- the sway. Velocity gains toward the target every
        // frame, then decays; a lighter decay (a lower DAMPING_PER_SEC) would ring longer, a heavier one would
        // just ease in, which is why this is a named constant rather than a value picked once and forgotten.
        const decay = Math.exp(-DAMPING_PER_SEC * dt);
        this.vel.x = (this.vel.x + (target.x - this.pos.x) * SPRING_K * dt) * decay;
        this.vel.y = (this.vel.y + (target.y - this.pos.y) * SPRING_K * dt) * decay;
        this.vel.z = (this.vel.z + (target.z - this.pos.z) * SPRING_K * dt) * decay;
        this.pos.x += this.vel.x * dt;
        this.pos.y += this.vel.y * dt;
        this.pos.z += this.vel.z * dt;

        // Lean into the swing: the camera's own right/up vectors turn lateral/vertical VELOCITY into a
        // tiltZ/tiltX lean, clamped -- a hanging object tips opposite the direction it is being dragged FROM,
        // i.e. it visibly lags and leans as the cursor moves, not just slides.
        const fwd = this.camera.getForwardVector?.() || { x: 0, y: 0, z: -1 };
        const wup = Math.abs(fwd.y) > 0.99 ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 };
        const right = norm3(cross3(fwd, wup));
        const lateralSpeed = this.vel.x * right.x + this.vel.y * right.y + this.vel.z * right.z;
        const vertSpeed = this.vel.y;
        const tiltZ = clamp(-lateralSpeed * LEAN_K, -LEAN_MAX, LEAN_MAX);
        const tiltX = clamp(vertSpeed * LEAN_K, -LEAN_MAX, LEAN_MAX);

        this.router.exec({ type: "entity:move", id: this.entityId, x: this.pos.x, y: this.pos.y, z: this.pos.z, tiltX, tiltZ });
    }

    /** Left click: drop it where it is. The entity stays; carry mode ends. */
    finalize() {
        if (!this.active) return;
        // settle the lean back to upright rather than leaving it mid-swing
        this.router.exec({ type: "entity:move", id: this.entityId, x: this.pos.x, y: this.pos.y, z: this.pos.z, tiltX: 0, tiltZ: 0 });
        this._stop();
        try { this._onDone?.({ placed: true, id: this.entityId }); } catch {}
    }

    /** Right click / Escape: despawn the carried entity and end carry mode. */
    cancel() {
        if (!this.active) return;
        const id = this.entityId;
        this._stop();
        try { this.router.exec({ type: "entity:despawn", id }); } catch {}
        try { this._onDone?.({ placed: false, id }); } catch {}
    }

    _stop() {
        this.active = false;
        if (this._raf) _caf(this._raf);
        this._raf = 0;
        if (this.canvas) {
            this.canvas.removeEventListener("mousemove", this._onMove);
            this.canvas.removeEventListener("mousedown", this._onDown);
            this.canvas.removeEventListener("contextmenu", this._onCtx);
        }
        if (_hasWindow) window.removeEventListener("keydown", this._onKey);
        this._onMove = this._onDown = this._onCtx = this._onKey = null;
    }
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
