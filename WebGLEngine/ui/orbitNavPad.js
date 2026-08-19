// ui/orbitNavPad.js — a shared manual navigation pad for any OrbitControls-based Three.js viewer.
// Mounts a small floating button pad (pan / zoom / rotate / recenter) that drives the given OrbitControls,
// plus matching keyboard shortcuts (each button's hover title shows its key) and optional hardware
// gamepad/joystick support. One import + one call per page:
//
//   import { mountOrbitNavPad } from "/ui/orbitNavPad.js";
//   mountOrbitNavPad({ camera, controls, THREE });      // after you create camera + controls
//
// Self-contained, self-styling, wrapped so it can never break the host page.
export function mountOrbitNavPad(opts = {}) {
    const { camera, controls, THREE } = opts;
    if (typeof document === "undefined" || !camera || !controls || !THREE) return null;
    const home = { pos: camera.position.clone(), tgt: controls.target.clone() };

    // ---- movement primitives (operate relative to the current view) ----
    function panBy(dx, dy) {
        const step = camera.position.distanceTo(controls.target) * 0.12;
        const e = new THREE.Matrix4().extractRotation(camera.matrixWorld);
        const right = new THREE.Vector3(1, 0, 0).applyMatrix4(e).multiplyScalar(dx * step);
        const up = new THREE.Vector3(0, 1, 0).applyMatrix4(e).multiplyScalar(dy * step);
        const mv = right.add(up); camera.position.add(mv); controls.target.add(mv);
    }
    function dolly(factor) {
        const off = new THREE.Vector3().subVectors(camera.position, controls.target).multiplyScalar(factor);
        camera.position.copy(controls.target).add(off);
    }
    function orbit(dTheta, dPhi) {
        const off = new THREE.Vector3().subVectors(camera.position, controls.target);
        const sph = new THREE.Spherical().setFromVector3(off);
        sph.theta += dTheta; sph.phi = Math.max(0.05, Math.min(Math.PI - 0.05, sph.phi + dPhi));
        off.setFromSpherical(sph); camera.position.copy(controls.target).add(off);
    }
    function nav(action, k) {
        k = k || 1;
        try {
            switch (action) {
                case "left":   panBy(-0.5 * k, 0); break;
                case "right":  panBy(0.5 * k, 0);  break;
                case "up":     panBy(0, 0.5 * k);  break;
                case "down":   panBy(0, -0.5 * k); break;
                case "in":     dolly(1 / (1 + 0.14 * k)); break;
                case "out":    dolly(1 + 0.14 * k); break;
                case "rotLeft":  orbit(-0.13 * k, 0); break;
                case "rotRight": orbit(0.13 * k, 0);  break;
                case "rotUp":    orbit(0, -0.11 * k); break;
                case "rotDown":  orbit(0, 0.11 * k);  break;
                case "recenter": controls.target.set(0, 0, 0); break;
                case "orient": case "home": camera.position.copy(home.pos); controls.target.copy(home.tgt); break;
            }
            controls.update();
        } catch (e) { /* never break the host */ }
    }

    // ---- the pad ----
    const pad = document.createElement("div");
    pad.id = "swek-orbit-navpad";
    pad.style.cssText = [
        "position:fixed", "left:12px", "bottom:12px", "z-index:2147482000", "display:none",
        "background:rgba(6,12,10,0.82)", "border:1px solid rgba(120,200,160,0.4)", "border-radius:12px",
        "padding:8px", "backdrop-filter:blur(6px)", "box-shadow:0 6px 20px rgba(0,0,0,.45)",
        "font:12px ui-rounded,system-ui,sans-serif"
    ].join(";");
    const BTNS = [
        { nav: "up",       sym: "▲", key: "R / PageUp",   t: "Pan up" },
        { nav: "rotUp",    sym: "⤒", key: "W / ↑",        t: "Orbit up" },
        { nav: "in",       sym: "＋", key: "+ / =",        t: "Zoom in" },
        { nav: "left",     sym: "◀", key: "A / ←",        t: "Pan left" },
        { nav: "recenter", sym: "⊚", key: "Home",         t: "Re-center on origin" },
        { nav: "right",    sym: "▶", key: "D / →",        t: "Pan right" },
        { nav: "down",     sym: "▼", key: "F / PageDown", t: "Pan down" },
        { nav: "rotDown",  sym: "⤓", key: "S / ↓",        t: "Orbit down" },
        { nav: "out",      sym: "－", key: "- / _",        t: "Zoom out" },
        { nav: "rotLeft",  sym: "⟲", key: "Q",            t: "Orbit left" },
        { nav: "orient",   sym: "⌂", key: "Backspace",    t: "Reset view" },
        { nav: "rotRight", sym: "⟳", key: "E",            t: "Orbit right" },
    ];
    const grid = document.createElement("div");
    grid.style.cssText = "display:grid;grid-template-columns:repeat(3,34px);grid-auto-rows:30px;gap:5px;";
    for (const b of BTNS) {
        const el = document.createElement("button");
        el.textContent = b.sym; el.title = b.t + " · key: " + b.key; el.setAttribute("data-nav", b.nav);
        el.style.cssText = "background:rgba(12,26,20,0.9);color:#8effc4;border:1px solid rgba(80,160,120,0.5);border-radius:8px;font-size:14px;cursor:pointer;padding:0;line-height:1;";
        el.onmouseenter = () => el.style.background = "rgba(30,80,55,0.95)";
        el.onmouseleave = () => el.style.background = "rgba(12,26,20,0.9)";
        grid.appendChild(el);
    }
    pad.appendChild(grid);
    const hint = document.createElement("div");
    hint.textContent = "hover for keys";
    hint.style.cssText = "margin-top:6px;color:rgba(150,200,175,0.7);font-size:10px;text-align:center;";
    pad.appendChild(hint);
    grid.addEventListener("click", (e) => { const b = e.target.closest("button[data-nav]"); if (b) nav(b.getAttribute("data-nav")); });
    document.body.appendChild(pad);

    // ---- toggle button (bottom-left, above the pad) ----
    const toggle = document.createElement("button");
    toggle.textContent = "🧭";
    toggle.title = "Show / hide the navigation pad (move · zoom · rotate · re-center)";
    toggle.style.cssText = "position:fixed;left:12px;bottom:12px;z-index:2147482001;width:34px;height:34px;border-radius:9px;background:rgba(20,80,40,0.9);color:#dfffe7;border:1px solid rgba(120,220,140,0.55);cursor:pointer;font-size:15px;";
    toggle.onclick = () => {
        const on = pad.style.display === "none";
        pad.style.display = on ? "block" : "none";
        toggle.style.display = on ? "none" : "block";   // pad's ⊚ area covers the same corner; hide toggle while open
        pad.style.left = "12px"; pad.style.bottom = "12px";
    };
    // when the pad closes, bring the toggle back — add a small close affordance in the pad
    const closer = document.createElement("button");
    closer.textContent = "✕"; closer.title = "Hide the nav pad";
    closer.style.cssText = "position:absolute;top:-9px;right:-9px;width:20px;height:20px;border-radius:50%;background:#123;color:#9fd;border:1px solid #2a5a3a;cursor:pointer;font-size:11px;line-height:1;padding:0;";
    closer.onclick = () => { pad.style.display = "none"; toggle.style.display = "block"; };
    pad.style.position = "fixed"; pad.appendChild(closer);
    document.body.appendChild(toggle);

    // ---- keyboard ----
    const KEYMAP = { KeyA:"left", ArrowLeft:"left", KeyD:"right", ArrowRight:"right", KeyR:"up", PageUp:"up",
        KeyF:"down", PageDown:"down", Equal:"in", NumpadAdd:"in", Minus:"out", NumpadSubtract:"out",
        KeyW:"rotUp", ArrowUp:"rotUp", KeyS:"rotDown", ArrowDown:"rotDown", KeyQ:"rotLeft", KeyE:"rotRight",
        Home:"recenter", Backspace:"orient" };
    window.addEventListener("keydown", (e) => {
        const t = e.target; if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
        const a = KEYMAP[e.code]; if (a) { e.preventDefault(); nav(a); }
    });

    // ---- optional hardware gamepad / joystick ----
    let padOn = false, _lastT = performance.now();
    const DEAD = 0.16, dz = (v) => Math.abs(v) < DEAD ? 0 : v;
    function tick() {
        const now = performance.now(), dt = Math.min(0.05, (now - _lastT) / 1000); _lastT = now;
        let gp = null;
        try { const ps = navigator.getGamepads ? navigator.getGamepads() : []; for (const p of ps) if (p && p.connected) { gp = p; break; } } catch {}
        if (gp) {
            if (!padOn) { padOn = true; hint.textContent = "🎮 " + gp.id.slice(0, 22); hint.style.color = "#8effc4"; }
            const k = dt * 60, ax = gp.axes || [];
            const lx = dz(ax[0] || 0), ly = dz(ax[1] || 0), rx = dz(ax[2] || 0), ry = dz(ax[3] || 0);
            if (lx) nav("right", Math.abs(lx) * (lx < 0 ? -1 : 1) * k * 0.05), nav(lx < 0 ? "left" : "right", Math.abs(lx) * k * 0.05);
            if (ly) nav(ly < 0 ? "up" : "down", Math.abs(ly) * k * 0.05);
            if (rx) orbit(rx * dt * 1.6, 0);
            if (ry) orbit(0, ry * dt * 1.6);
            const btn = (i) => gp.buttons && gp.buttons[i] && gp.buttons[i].pressed;
            const val = (i) => (gp.buttons && gp.buttons[i]) ? gp.buttons[i].value : 0;
            if (val(6) > 0.2) dolly(1 + 0.02 * k); if (val(7) > 0.2) dolly(1 / (1 + 0.02 * k));   // triggers zoom
            if (btn(4)) nav("up", k * 0.04); if (btn(5)) nav("down", k * 0.04);
            if (btn(9) || btn(8)) nav("orient");
            if (btn(12)) nav("up", k*0.04); if (btn(13)) nav("down", k*0.04); if (btn(14)) nav("left", k*0.04); if (btn(15)) nav("right", k*0.04);
            controls.update();
        } else if (padOn) { padOn = false; hint.textContent = "hover for keys"; hint.style.color = "rgba(150,200,175,0.7)"; }
        requestAnimationFrame(tick);
    }
    try { requestAnimationFrame(tick); } catch {}

    return { pad, toggle, nav, remove() { try { pad.remove(); } catch {} try { toggle.remove(); } catch {} } };
}
