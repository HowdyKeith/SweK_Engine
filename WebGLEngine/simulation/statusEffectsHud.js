// FILE: simulation/statusEffectsHud.js
// VERSION: v1 (v770 — honest gap visualization)
//
// Status effect HUD. Walks ranged-attack targets each frame, projects
// each effect-bearing unit's position to screen, and draws a stack of
// emoji icons near it. Lets you see at a glance which tanks are
// acid-burning, slow-pinned, EMP-disabled, or getting tractor-yanked.
//
// Lives as a single absolute-positioned container with reusable child
// nodes; per-frame cost is O(targets × effects) which is fine for the
// city demo (~30-50 units max, ~3 effects each).
//
// Wire-up:
//   import { mount, tickAndDraw } from "./statusEffectsHud.js";
//   mount(camera, canvas);
//   ... per frame after status effects tick:
//   tickAndDraw(window._extraRangedTargets);
//
// Auto-hides when no effects are active. Cheap when idle.

const ICON_BY_TYPE = {
    acid:      "🟢",   // green for toxic
    slow:      "🐌",   // snail = slow
    disabled:  "⚡",    // electric = EMP'd
    pulled:    "🧲",   // magnet = tractor
};

let _container = null;
let _camera = null;
let _canvas = null;
let _pool = [];       // reusable badge nodes
let _activeCount = 0; // how many of _pool are currently visible

// Lazily allocate a DOM badge for a target. Returns a div positioned
// absolutely inside _container; caller updates style.left/top/textContent.
function _allocBadge(idx) {
    if (_pool[idx]) return _pool[idx];
    const el = document.createElement("div");
    el.style.cssText = [
        "position: absolute",
        "left: 0",                    // v773 — anchored at origin so
        "top: 0",                     //         translate3d moves the badge
        "pointer-events: none",
        "font-size: 14px",
        "line-height: 1",
        "padding: 2px 4px",
        "background: rgba(0,0,0,0.55)",
        "color: #fff",
        "border-radius: 4px",
        "white-space: nowrap",
        "will-change: transform",     // v773 — promote to compositor layer
        "text-shadow: 0 1px 2px rgba(0,0,0,0.8)",
        "display: none",
    ].join("; ");
    _container.appendChild(el);
    _pool[idx] = el;
    return el;
}

// Project a world-space point to 2D screen coords using the engine's
// shared view/proj. Returns null if behind the camera or off-screen.
// We rely on _camera.getViewProjMatrix() + _canvas.width/height — both
// are stable engine APIs used by pickerCore, vegetation, turretRenderer.
function _project(x, y, z) {
    if (!_camera || !_canvas) return null;
    let vp;
    try { vp = _camera.getViewProjMatrix?.(); } catch { return null; }
    if (!vp) return null;
    // Column-major 4x4 * (x,y,z,1)
    const cx = vp[0]*x + vp[4]*y + vp[8]*z  + vp[12];
    const cy = vp[1]*x + vp[5]*y + vp[9]*z  + vp[13];
    const cz = vp[2]*x + vp[6]*y + vp[10]*z + vp[14];
    const cw = vp[3]*x + vp[7]*y + vp[11]*z + vp[15];
    if (cw <= 0.1) return null;   // behind camera
    const ndcX = cx / cw;
    const ndcY = cy / cw;
    if (Math.abs(ndcX) > 1.2 || Math.abs(ndcY) > 1.2) return null;   // off-screen margin
    const sx = (ndcX * 0.5 + 0.5) * _canvas.width;
    const sy = (1 - (ndcY * 0.5 + 0.5)) * _canvas.height;
    return { x: sx, y: sy };
}

export function mount(camera, canvas) {
    if (typeof document === "undefined") return;
    if (_container) return;
    _camera = camera;
    _canvas = canvas;
    _container = document.createElement("div");
    _container.id = "_statusEffectsHud";
    _container.style.cssText = [
        "position: absolute",
        "left: 0", "top: 0", "right: 0", "bottom: 0",
        "pointer-events: none",
        "z-index: 1500",
    ].join("; ");
    // Match canvas parent so coords align
    const parent = canvas?.parentElement || document.body;
    parent.appendChild(_container);
    console.log("[statusEffectsHud] mounted — overlay ready");
}

// Walk targets, project + draw a badge for each with effects. Hidden
// badges from prior frames are recycled. Idempotent / cheap when
// no targets have effects (early return without DOM thrash).
//
// v773 — accepts heterogeneous targets:
//   _extraRangedTargets (tanks/planes) expose .x/.y/.z directly
//   civs expose .center.x/.center.y/.center.z
// Reads positions via the polyfill in _readPos so both shapes work.
//
// Positioning uses transform: translate3d() to keep the badge on the
// GPU compositor layer — avoids per-frame layout reflow that the
// previous left/top approach triggered.
export function tickAndDraw(targets) {
    if (!_container || !Array.isArray(targets)) return;
    const now = (typeof performance !== "undefined") ? performance.now() : Date.now();
    let writeIdx = 0;
    for (const t of targets) {
        if (!t || !Array.isArray(t._statusEffects) || t._statusEffects.length === 0) continue;
        // Per type: pick the LONGEST remaining duration. Multiple stacks
        // of the same effect collapse to one icon, but the countdown
        // shows when the *last* stack expires.
        const typeTimes = new Map();
        for (const e of t._statusEffects) {
            if (!ICON_BY_TYPE[e.type]) continue;
            const rem = Math.max(0, e.expiresAt - now);
            const prev = typeTimes.get(e.type) ?? 0;
            if (rem > prev) typeTimes.set(e.type, rem);
        }
        if (typeTimes.size === 0) continue;
        // v773 — polymorphic position read: direct or via .center
        const tx = (typeof t.x === "number") ? t.x : (t.center?.x ?? 0);
        const ty = (typeof t.y === "number") ? t.y : (t.center?.y ?? 0);
        const tz = (typeof t.z === "number") ? t.z : (t.center?.z ?? 0);
        // Project the target's position 1.5u above its base so the badge
        // hovers above the unit (especially planes at y=8+)
        const yLift = ty + (t._type === "city_plane" ? 1.2 : (t.center ? 2.2 : 1.6));
        const p = _project(tx, yLift, tz);
        if (!p) continue;
        // Compose icon + tiny remaining-seconds tag per type.
        // "🟢 2.3s" reads at a glance — players know when the effect
        // wears off without having to console.describe().
        const parts = [];
        for (const [type, ms] of typeTimes) {
            const sec = (ms / 1000).toFixed(1);
            parts.push(`${ICON_BY_TYPE[type]}${sec}s`);
        }
        const badge = _allocBadge(writeIdx++);
        badge.textContent = parts.join(" ");
        // v773 — translate3d positions + apply centering offset in same transform
        badge.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) translate(-50%, -100%)`;
        badge.style.display = "block";
    }
    // Hide any leftover badges from a previous frame with more targets
    for (let i = writeIdx; i < _activeCount; i++) {
        if (_pool[i]) _pool[i].style.display = "none";
    }
    _activeCount = writeIdx;
}

export function unmount() {
    if (_container) {
        try { _container.remove(); } catch {}
        _container = null;
    }
    _pool = [];
    _activeCount = 0;
}
