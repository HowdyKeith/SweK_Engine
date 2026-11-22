// WebGLEngine/render/cameraControls.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// ONE SET OF CAMERA CONTROLS: ORBIT, FLY AND FOCUS. Backlog: render/BACKLOG_2026-11-21_PLAYCANVAS.md, `camera-controllers` (PlayCanvas src/extras/input/controllers/:
// OrbitController, FlyController, FocusController). Keith: "lets do both playcanvas backlog items". Twelve pages here carry their own drag-to-orbit code, each a little
// different; this is one, in two halves:
//
//   createCameraControls(opts)   THE CAMERA AS STATE, NO DOM. Where the camera is going (a target pose) and where it is (the pose it draws from), the second easing
//                                toward the first every update(dt) by PlayCanvas's frame-rate-independent rule, alpha = 1 - damping^(dt x 1000) (damping 0.98 by default;
//                                0 is no easing). One pose serves all three ways of moving -- a target point, a yaw, a pitch and a distance:
//      orbit(dYaw, dPitch)       turn the eye about the target                     pan(dx, dy)   slide the target (and the eye) across the view, in view units
//      zoom(factor)              the distance times factor (under 1 is nearer)     look(dYaw, dPitch)   FLY: turn the view about the EYE, which stays where it is
//      move(right, up, forward)  FLY: the eye and the target together, along the view's own axes, in world units
//      focus(center, radius)     FOCUS: target the centre at the distance that fits a sphere of that radius in the view (the vertical field of view, `margin`)
//      update(dt) -> pose()      { eye, target, up, yaw, pitch, distance } of the drawn pose; settled() once it has arrived (within 1e-4)
//   bindCameraControls(element, controls, opts)   THE DOM: left drag orbits (fly mode: looks), right or middle drag or shift-drag pans, the wheel zooms, two fingers
//                                pinch to zoom and drag to pan, W A S D / arrows and Q E fly (shift: faster), F focuses (opts.focusOn() gives the sphere). tick(dt) applies the
//                                held keys and calls update. detach() removes every listener.
//
// THE UP AXIS IS A CHOICE: "y" (eye = target + d (cos p sin y, sin p, cos p cos y), the splat page's) or "z" (eye = target + d (cos p sin y, -cos p cos y, sin p), the orrery's
// render/orbitCamera.mjs). Pitch is held short of the poles by POLE_MARGIN so a lookAt basis never collapses (and within [minPitch, maxPitch] when a page gives them);
// the distance is held within [minDistance, maxDistance].
// NOT HERE: inertia after release (the easing is toward where the input put the target, nothing more), roll, a first-person collision, gamepads.
"use strict";

export const POLE_MARGIN = 0.02;
export const DEFAULTS = Object.freeze({ up: "y", yaw: 0, pitch: 0.3, distance: 3, target: [0, 0, 0], damping: 0.98, minDistance: 1e-3, maxDistance: 1e5, fovY: 0.9, margin: 1.1, flySpeed: 1, mode: "orbit", minPitch: null, maxPitch: null });
/** PlayCanvas's easing (src/extras/input/math.js): the share of the way to go this step, for a damping per millisecond. Pure. */
export const damp = (damping, dt) => 1 - Math.pow(damping, dt * 1e3);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v)), wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** The view's axes for a yaw and pitch: { back (target to eye, unit), right, up } in world space, for the up axis "y" or "z". Pure. */
export function axesOf(yaw, pitch, up = "y") {
    const cp = Math.cos(pitch), sp = Math.sin(pitch), sy = Math.sin(yaw), cy = Math.cos(yaw);
    const back = up === "z" ? [cp * sy, -cp * cy, sp] : [cp * sy, sp, cp * cy], world = up === "z" ? [0, 0, 1] : [0, 1, 0];
    const cr = [world[1] * back[2] - world[2] * back[1], world[2] * back[0] - world[0] * back[2], world[0] * back[1] - world[1] * back[0]], rl = Math.hypot(...cr) || 1, right = cr.map((v) => v / rl);
    const vu = [back[1] * right[2] - back[2] * right[1], back[2] * right[0] - back[0] * right[2], back[0] * right[1] - back[1] * right[0]];
    return { back, right, up: vu };
}

export function createCameraControls(opts = {}) {
    const o = { ...DEFAULTS, ...opts };
    if (o.up !== "y" && o.up !== "z") throw new Error(`cameraControls: up is "y" or "z" (got ${o.up})`);
    // 2026-11-22: a page may hold the pitch to its own range (an ocean seen from above only, say), always inside the poles' margin
    const pole = Math.PI / 2 - POLE_MARGIN, pitchMin = clamp(o.minPitch ?? -pole, -pole, pole), pitchMax = clamp(o.maxPitch ?? pole, pitchMin, pole), dist = (d) => clamp(d, o.minDistance, o.maxDistance);
    const goal = { target: [...o.target], yaw: o.yaw, pitch: clamp(o.pitch, pitchMin, pitchMax), distance: dist(o.distance) }, now = { target: [...goal.target], yaw: goal.yaw, pitch: goal.pitch, distance: goal.distance };
    const eyeOf = (p) => { const b = axesOf(p.yaw, p.pitch, o.up).back; return p.target.map((t, i) => t + p.distance * b[i]); };
    const c = {
        get mode() { return o.mode; }, set mode(m) { if (m !== "orbit" && m !== "fly") throw new Error(`cameraControls: a mode is "orbit" or "fly" (got ${m})`); o.mode = m; },
        options: o, goal, now,
        orbit(dYaw, dPitch) { goal.yaw += dYaw; goal.pitch = clamp(goal.pitch + dPitch, pitchMin, pitchMax); return c; },
        /** FLY: turn about the eye -- the target swings round it, the eye stays put. */
        look(dYaw, dPitch) { const eye = eyeOf(goal); goal.yaw += dYaw; goal.pitch = clamp(goal.pitch + dPitch, pitchMin, pitchMax); const b = axesOf(goal.yaw, goal.pitch, o.up).back; goal.target = eye.map((e, i) => e - goal.distance * b[i]); return c; },
        pan(dx, dy) { const a = axesOf(goal.yaw, goal.pitch, o.up), s = goal.distance; goal.target = goal.target.map((t, i) => t - (a.right[i] * dx - a.up[i] * dy) * s); return c; },
        zoom(factor) { if (factor > 0 && Number.isFinite(factor)) goal.distance = dist(goal.distance * factor); return c; },
        /** FLY: eye and target together along the view's right, up and forward (the forward is the way the camera faces), in world units. */
        move(right, up, forward) { const a = axesOf(goal.yaw, goal.pitch, o.up); goal.target = goal.target.map((t, i) => t + a.right[i] * right + a.up[i] * up - a.back[i] * forward); return c; },
        /** FOCUS: the centre as the target, at the distance where a sphere of `radius` fills the vertical field of view with `margin` to spare; the view's direction kept. */
        focus(center, radius) { goal.target = [...center]; goal.distance = dist((o.margin * Math.max(radius, 1e-9)) / Math.sin(o.fovY / 2)); return c; },
        /** Jump: the drawn pose becomes the goal at once (no easing). */
        snap() { now.target = [...goal.target]; now.yaw = goal.yaw; now.pitch = goal.pitch; now.distance = goal.distance; return c; },
        update(dt) {
            const a = o.damping > 0 ? damp(o.damping, Math.max(0, dt)) : 1;
            now.target = now.target.map((t, i) => t + (goal.target[i] - t) * a);
            now.yaw += wrapPi(goal.yaw - now.yaw) * a; now.pitch += (goal.pitch - now.pitch) * a;
            now.distance *= Math.pow(goal.distance / now.distance, a);   // eased in log distance, so a zoom of 10x feels like one of 1/10
            return c.pose();
        },
        settled(eps = 1e-4) { return Math.abs(wrapPi(goal.yaw - now.yaw)) < eps && Math.abs(goal.pitch - now.pitch) < eps && Math.abs(Math.log(goal.distance / now.distance)) < eps && goal.target.every((t, i) => Math.abs(t - now.target[i]) < eps * Math.max(1, goal.distance)); },
        pose() { const ax = axesOf(now.yaw, now.pitch, o.up); return { eye: eyeOf(now), target: [...now.target], up: ax.up, yaw: now.yaw, pitch: now.pitch, distance: now.distance }; },
    };
    return c;
}

/** The DOM half. `controls` from createCameraControls; opts: { radiansPerPixel 0.008, panPerPixel 0.0015 (of the distance), zoomPerWheel 0.001, flyFaster 4,
 *  focusOn: () => ({ center, radius }) | null, keyTarget: window }. Returns { tick(dt), detach(), keys (held), state }. */
export function bindCameraControls(element, controls, opts = {}) {
    const o = { radiansPerPixel: 0.008, panPerPixel: 0.0015, zoomPerWheel: 0.001, flyFaster: 4, focusOn: null, keyTarget: typeof window !== "undefined" ? window : null, ...opts };
    const pointers = new Map(), keys = new Set(), state = { dragging: 0 }, on = [], listen = (t, ev, fn, opt) => { if (!t) return; t.addEventListener(ev, fn, opt); on.push([t, ev, fn, opt]); };
    const panning = (e) => e.button === 1 || e.button === 2 || e.shiftKey;
    listen(element, "contextmenu", (e) => e.preventDefault());
    listen(element, "pointerdown", (e) => { if (element.setPointerCapture) try { element.setPointerCapture(e.pointerId); } catch { /* a synthetic pointer */ } pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, pan: panning(e) }); state.dragging = pointers.size; });
    listen(element, "pointermove", (e) => {
        const p = pointers.get(e.pointerId); if (!p) return;
        const dx = e.clientX - p.x, dy = e.clientY - p.y;
        if (pointers.size === 2) {   // two fingers: the change in their spread zooms, their mid-point's motion pans (half each finger's share)
            const [a, b] = [...pointers.values()], other = a === p ? b : a, before = Math.hypot(p.x - other.x, p.y - other.y), after = Math.hypot(e.clientX - other.x, e.clientY - other.y);
            if (before > 0 && after > 0) controls.zoom(before / after);
            controls.pan((dx / 2) * o.panPerPixel, (dy / 2) * o.panPerPixel);
        } else if (p.pan) controls.pan(dx * o.panPerPixel, dy * o.panPerPixel);
        else if (controls.mode === "fly") controls.look(-dx * o.radiansPerPixel, dy * o.radiansPerPixel);
        else controls.orbit(-dx * o.radiansPerPixel, dy * o.radiansPerPixel);
        p.x = e.clientX; p.y = e.clientY;
    });
    const up = (e) => { pointers.delete(e.pointerId); state.dragging = pointers.size; };
    listen(element, "pointerup", up); listen(element, "pointercancel", up);
    listen(element, "wheel", (e) => { e.preventDefault(); controls.zoom(Math.exp(e.deltaY * o.zoomPerWheel)); }, { passive: false });
    const FLY = { KeyW: [0, 0, 1], ArrowUp: [0, 0, 1], KeyS: [0, 0, -1], ArrowDown: [0, 0, -1], KeyA: [-1, 0, 0], ArrowLeft: [-1, 0, 0], KeyD: [1, 0, 0], ArrowRight: [1, 0, 0], KeyE: [0, 1, 0], KeyQ: [0, -1, 0] };
    listen(o.keyTarget, "keydown", (e) => {
        if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName || "")) return;   // typing in a field is not flying
        if (e.code === "KeyF" && o.focusOn) { const f = o.focusOn(); if (f) controls.focus(f.center, f.radius); return; }
        if (FLY[e.code]) { keys.add(e.code); if (e.shiftKey) keys.add("Shift"); }
    });
    listen(o.keyTarget, "keyup", (e) => { keys.delete(e.code); if (!e.shiftKey) keys.delete("Shift"); });
    listen(o.keyTarget, "blur", () => keys.clear());
    return {
        keys, state,
        /** Apply the held keys (fly speed x the distance, per second; shift faster) and ease the pose. Returns the pose. */
        tick(dt) {
            if (keys.size) { const m = [0, 0, 0]; for (const k of keys) if (FLY[k]) for (let i = 0; i < 3; i++) m[i] += FLY[k][i]; const s = controls.options.flySpeed * controls.goal.distance * dt * (keys.has("Shift") ? o.flyFaster : 1); if (m.some((v) => v)) controls.move(m[0] * s, m[1] * s, m[2] * s); }
            return controls.update(dt);
        },
        detach() { for (const [t, ev, fn, opt] of on.splice(0)) t.removeEventListener(ev, fn, opt); pointers.clear(); keys.clear(); },
    };
}
