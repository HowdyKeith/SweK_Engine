// FILE: input/gamepadInput.js
//
// v1409 — XInput / standard gamepad support via the browser Gamepad API. Polls
// each frame (called from the main loop just before camera.update) and drives the
// camera with ANALOG move + look, plus FPS fire — no extra deps, works in Chrome
// for Xbox/standard controllers (and on the Android TV Device).
//
// Standard mapping (Xbox layout): axes[0],[1] = LEFT stick (move), axes[2],[3] =
// RIGHT stick (look), button 7 = RT and button 0 = A (fire), button 5 = RB (jump).
// Left stick feeds camera._extMove (forward/strafe -1..1) so movement runs through
// the camera's existing collision/ground-clamp; right stick nudges yaw/pitch.

export function makeGamepadInput({ camera, win } = {}) {
    const W = win || (typeof window !== "undefined" ? window : null);
    const state = {
        enabled: true,
        deadzone: 0.18,
        lookSpeed: 2.4,     // rad/sec at full right-stick deflection
        invertY: false,
        index: null,        // active gamepad slot
        _fireCool: 0,
        _last: 0,
        _prevBtn: {},
    };

    // Rescale past the deadzone so the stick ramps smoothly from 0 at the edge.
    function _dz(v) {
        const a = Math.abs(v);
        if (a < state.deadzone) return 0;
        return Math.sign(v) * (a - state.deadzone) / (1 - state.deadzone);
    }
    function _pads() { try { return (W && W.navigator && W.navigator.getGamepads) ? (W.navigator.getGamepads() || []) : []; } catch { return []; } }
    function _active() {
        const pads = _pads();
        if (state.index != null && pads[state.index] && pads[state.index].connected) return pads[state.index];
        for (let i = 0; i < pads.length; i++) if (pads[i] && pads[i].connected) { state.index = i; return pads[i]; }
        state.index = null; return null;
    }
    function _pressed(b) { return !!b && (b.pressed || (b.value || 0) > 0.5); }

    function update() {
        const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
        let dt = state._last ? (now - state._last) / 1000 : 0; state._last = now;
        if (dt > 0.1) dt = 0.1;
        if (!state.enabled || !camera) { if (camera) camera._extMove = null; return; }
        const gp = _active();
        if (!gp) { camera._extMove = null; return; }

        const ax = gp.axes || [];
        const lx = _dz(ax[0] || 0), ly = _dz(ax[1] || 0);   // left stick = move
        const rx = _dz(ax[2] || 0), ry = _dz(ax[3] || 0);   // right stick = look

        // LEFT stick -> analog move (stick up = forward). null when centered so the
        // camera's key-driven movement is untouched while no stick input is present.
        camera._extMove = (lx || ly) ? { fwd: -ly, strafe: lx } : null;

        // RIGHT stick -> look (yaw/pitch), pitch clamped just shy of straight up/down.
        if ((rx || ry) && !camera._rotLock) {   // v1735 - respect the rotation lock during load (#2)
            camera.yaw -= rx * state.lookSpeed * dt;
            camera.pitch += (state.invertY ? ry : -ry) * state.lookSpeed * dt;
            const lim = Math.PI / 2 - 0.02;
            if (camera.pitch > lim) camera.pitch = lim;
            if (camera.pitch < -lim) camera.pitch = -lim;
        }

        // FIRE: RT (7) or A (0). Small cooldown gives a steady autofire while held.
        const btn = gp.buttons || [];
        const firing = _pressed(btn[7]) || _pressed(btn[0]);
        state._fireCool -= dt;
        if (firing && state._fireCool <= 0) {
            try { const fs = W && W.fpsShooter; if (fs && fs.active && fs.fire) fs.fire(); } catch {}
            state._fireCool = 0.16;
        }
        // JUMP: RB (5) or B (1) -> tap the camera's jump key for one frame.
        if (camera.keys) {
            if (_pressed(btn[5]) || _pressed(btn[1])) camera.keys.add("Space");
            else camera.keys.delete("Space");
        }

        // v1412 — DEMO CONTROLS: X(2), Y(3), d-pad U/D/L/R (12-15) edge-fire the active
        // demo's padControls[0..5] (same list the phone shows), so the pad is a universal
        // demo controller too.
        const demoBtns = [2, 3, 12, 13, 14, 15];
        let _ctrls = null;
        for (let i = 0; i < demoBtns.length; i++) {
            const bi = demoBtns[i];
            const nowP = _pressed(btn[bi]);
            const wasP = !!state._prevBtn[bi];
            state._prevBtn[bi] = nowP;
            if (nowP && !wasP) {
                if (_ctrls === null) { try { _ctrls = (W && W.demoManager && W.demoManager.getPadControls) ? (W.demoManager.getPadControls() || []) : []; } catch { _ctrls = []; } }
                const c = _ctrls[i];
                if (c) { try { W.demoManager.fireAction(c.id); } catch {} }
            }
        }
    }

    function status() {
        const gp = _active();
        return { enabled: state.enabled, connected: !!gp, id: gp ? gp.id : null, slot: state.index, deadzone: state.deadzone, lookSpeed: state.lookSpeed, invertY: state.invertY };
    }

    if (W && W.addEventListener) {
        W.addEventListener("gamepadconnected", (e) => { state.index = e.gamepad.index; console.log(`[gamepad] connected: ${e.gamepad.id} (slot ${e.gamepad.index}) \u2014 left stick = move, right = look, RT/A = fire, RB/B = jump.`); });
        W.addEventListener("gamepaddisconnected", (e) => { if (state.index === e.gamepad.index) { state.index = null; if (camera) camera._extMove = null; } console.log(`[gamepad] disconnected: ${e.gamepad.id}`); });
    }

    return {
        update, status, _state: state,
        enable:  () => { state.enabled = true;  console.log("[gamepad] enabled");  return true; },
        disable: () => { state.enabled = false; if (camera) camera._extMove = null; console.log("[gamepad] disabled"); return false; },
        setDeadzone:  (v) => { state.deadzone  = Math.max(0,   Math.min(0.6, +v || 0));   return state.deadzone; },
        setLookSpeed: (v) => { state.lookSpeed = Math.max(0.3, Math.min(8,   +v || 2.4)); return state.lookSpeed; },
        setInvertY:   (v) => { state.invertY   = !!v; return state.invertY; },
    };
}
