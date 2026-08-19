// ui/navPad.js — a manual on-screen navigation pad for the main engine's 3D camera, toggled from the
// left-bottom mini-icon rail (🧭). Click the rail icon to show the pad, click again to hide. Each button
// drives the engine `camera` (fly/observer cam: position {x,y,z}, yaw, pitch) and its hover title shows
// the equivalent keyboard key. Self-contained; degrades gracefully if the camera API isn't present.
export async function mountNavPad(camera) {
    if (typeof document === "undefined" || !camera) return null;

    // ---- the pad ----
    const pad = document.createElement("div");
    pad.id = "ve-navpad";
    pad.style.cssText = [
        "position:fixed", "left:56px", "bottom:60px", "z-index:10040", "display:none",
        "background:rgba(6,12,10,0.82)", "border:1px solid rgba(120,200,160,0.4)", "border-radius:12px",
        "padding:8px", "backdrop-filter:blur(6px)", "box-shadow:0 6px 20px rgba(0,0,0,.45)",
        "font:12px ui-rounded,system-ui,sans-serif"
    ].join(";");

    const BTNS = [
        { nav: "up",       sym: "▲", key: "R / PageUp",   t: "Move up" },
        { nav: "rotUp",    sym: "⤒", key: "W",            t: "Look up" },
        { nav: "in",       sym: "＋", key: "+ / =",        t: "Move forward / zoom in" },
        { nav: "left",     sym: "◀", key: "A / ←",        t: "Move left" },
        { nav: "recenter", sym: "⊚", key: "Home",         t: "Re-center on the world" },
        { nav: "right",    sym: "▶", key: "D / →",        t: "Move right" },
        { nav: "down",     sym: "▼", key: "F / PageDown", t: "Move down" },
        { nav: "rotDown",  sym: "⤓", key: "S",            t: "Look down" },
        { nav: "out",      sym: "－", key: "- / _",        t: "Move back / zoom out" },
        { nav: "rotLeft",  sym: "⟲", key: "Q",            t: "Rotate left (yaw)" },
        { nav: "orient",   sym: "⌂", key: "Backspace",    t: "Reset view (face front)" },
        { nav: "rotRight", sym: "⟳", key: "E",            t: "Rotate right (yaw)" },
    ];
    const grid = document.createElement("div");
    grid.style.cssText = "display:grid;grid-template-columns:repeat(3,36px);grid-auto-rows:32px;gap:5px;";
    for (const b of BTNS) {
        const el = document.createElement("button");
        el.textContent = b.sym;
        el.title = b.t + " · key: " + b.key;
        el.setAttribute("data-nav", b.nav);
        el.style.cssText = "background:rgba(12,26,20,0.9);color:#8effc4;border:1px solid rgba(80,160,120,0.5);border-radius:8px;font-size:15px;cursor:pointer;padding:0;line-height:1;";
        el.onmouseenter = () => el.style.background = "rgba(30,80,55,0.95)";
        el.onmouseleave = () => el.style.background = "rgba(12,26,20,0.9)";
        grid.appendChild(el);
    }
    pad.appendChild(grid);
    const hint = document.createElement("div");
    hint.textContent = "hover a button for its key";
    hint.style.cssText = "margin-top:6px;color:rgba(150,200,175,0.7);font-size:10.5px;text-align:center;";
    pad.appendChild(hint);
    document.body.appendChild(pad);

    // ---- movement: drive the fly/observer camera directly ----
    const PAN = () => (camera.moveSpeed || 25) * 0.25;   // scale nudge to the camera's own speed
    function fwdRight() {
        const cy = Math.cos(camera.yaw || 0), sy = Math.sin(camera.yaw || 0);
        return { fwd: { x: sy, z: cy }, right: { x: cy, z: -sy } };   // matches the engine's yaw convention
    }
    function nav(action) {
        try {
            const s = PAN(), { fwd, right } = fwdRight(), p = camera.position;
            switch (action) {
                case "left":   p.x -= right.x * s; p.z -= right.z * s; break;
                case "right":  p.x += right.x * s; p.z += right.z * s; break;
                case "up":     p.y += s; break;
                case "down":   p.y -= s; break;
                case "in":     p.x += fwd.x * s; p.z += fwd.z * s; break;
                case "out":    p.x -= fwd.x * s; p.z -= fwd.z * s; break;
                case "rotLeft":  camera.yaw = (camera.yaw || 0) - 0.12; break;
                case "rotRight": camera.yaw = (camera.yaw || 0) + 0.12; break;
                case "rotUp":    camera.pitch = Math.max(-1.4, (camera.pitch || 0) + 0.10); break;
                case "rotDown":  camera.pitch = Math.min(1.4, (camera.pitch || 0) - 0.10); break;
                case "recenter": p.x = 0; p.z = 0; break;
                case "orient":   camera.yaw = 0; camera.pitch = -0.4; p.x = 0; p.y = 50; p.z = 50; break;
            }
        } catch (e) { /* never break the frame loop */ }
    }
    grid.addEventListener("click", (e) => { const b = e.target.closest("button[data-nav]"); if (b) nav(b.getAttribute("data-nav")); });

    // ---- hardware joystick / gamepad (Gamepad API) ----
    // Left stick = move (strafe/forward), Right stick = look (yaw/pitch), triggers/bumpers = up/down,
    // A/X = zoom in, B/Y = zoom out, Start/Home button = recenter. Continuous while held; scales with dt.
    let padOn = false, padId = "", _lastT = performance.now();
    const DEAD = 0.16;   // stick deadzone
    function dz(v){ return Math.abs(v) < DEAD ? 0 : v; }
    function gamepadTick(){
        const now = performance.now(), dt = Math.min(0.05, (now - _lastT) / 1000); _lastT = now;
        let gp = null;
        try { const pads = navigator.getGamepads ? navigator.getGamepads() : []; for (const p of pads) if (p && p.connected) { gp = p; break; } } catch {}
        if (gp) {
            if (!padOn) { padOn = true; padId = gp.id; hint.textContent = "🎮 " + gp.id.slice(0, 28); hint.style.color = "#8effc4"; }
            const s = (camera.moveSpeed || 25) * dt * 2.2;
            const { fwd, right } = fwdRight(), p = camera.position, ax = gp.axes || [];
            const lx = dz(ax[0] || 0), ly = dz(ax[1] || 0), rx = dz(ax[2] || 0), ry = dz(ax[3] || 0);
            // move (left stick): ly forward/back, lx strafe
            p.x += (fwd.x * -ly + right.x * lx) * s; p.z += (fwd.z * -ly + right.z * lx) * s;
            // look (right stick): rx yaw, ry pitch
            if (rx) camera.yaw = (camera.yaw || 0) + rx * dt * 2.2;
            if (ry) camera.pitch = Math.max(-1.4, Math.min(1.4, (camera.pitch || 0) - ry * dt * 2.2));
            // buttons: bumpers/triggers up-down, face buttons zoom, start recenter
            const btn = (i) => gp.buttons && gp.buttons[i] && gp.buttons[i].pressed;
            const val = (i) => (gp.buttons && gp.buttons[i]) ? gp.buttons[i].value : 0;
            if (btn(4)) p.y += s; if (btn(5)) p.y -= s;                       // LB up / RB down
            if (val(6) > 0.2) p.y -= s * val(6); if (val(7) > 0.2) p.y += s * val(7); // LT down / RT up
            if (btn(0)) { p.x += fwd.x * s; p.z += fwd.z * s; }               // A/✕ forward
            if (btn(1)) { p.x -= fwd.x * s; p.z -= fwd.z * s; }               // B/○ back
            if (btn(9) || btn(8)) { camera.yaw = 0; camera.pitch = -0.4; p.x = 0; p.y = 50; p.z = 50; }  // Start/Select recenter
            // d-pad (12-15) mirrors the arrow nav
            if (btn(12)) p.y += s; if (btn(13)) p.y -= s;
            if (btn(14)) { p.x -= right.x * s; p.z -= right.z * s; } if (btn(15)) { p.x += right.x * s; p.z += right.z * s; }
        } else if (padOn) { padOn = false; hint.textContent = "hover a button for its key"; hint.style.color = "rgba(150,200,175,0.7)"; }
        requestAnimationFrame(gamepadTick);
    }
    try {
        window.addEventListener("gamepadconnected", (e) => { hint.textContent = "🎮 " + (e.gamepad && e.gamepad.id || "").slice(0, 28); hint.style.color = "#8effc4"; });
        requestAnimationFrame(gamepadTick);
    } catch {}

    // ---- rail toggle ----
    let btn = null;
    try {
        const { mountMiniIcon } = await import("./miniIconStack.js");
        btn = mountMiniIcon({
            id: "ve-navpad-btn",
            icon: "🧭",
            label: "Navigate",
            color: "green",
            title: "Show / hide the 3D navigation pad (move, zoom, rotate, re-center)",
            onClick: () => { pad.style.display = (pad.style.display === "none") ? "block" : "none"; },
            getActive: () => pad.style.display !== "none",
        });
    } catch (e) {
        // fallback: a small floating toggle if the rail helper isn't available
        btn = document.createElement("button");
        btn.textContent = "🧭";
        btn.title = "Show / hide the 3D navigation pad";
        btn.style.cssText = "position:fixed;left:10px;bottom:10px;z-index:10041;width:34px;height:34px;border-radius:8px;background:rgba(20,80,40,0.85);color:#dfffe7;border:1px solid rgba(120,220,140,0.55);cursor:pointer;";
        btn.onclick = () => { pad.style.display = (pad.style.display === "none") ? "block" : "none"; };
        document.body.appendChild(btn);
    }
    return { pad, nav, remove() { try { pad.remove(); } catch {} try { btn && btn.remove && btn.remove(); } catch {} } };
}
