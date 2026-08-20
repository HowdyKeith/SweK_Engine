// ui/touchCamera.js -- drop-in orbit controls so every SweK 3D demo is "perfectly easy" to manipulate on a phone (and a
// desktop). Built on ui/touchGestures.js: one-finger drag orbits, pinch zooms, two-finger drag pans; mouse drag orbits
// and the wheel zooms. It keeps a small camera state (azimuth / elevation / distance / target) and computes the eye
// position -- demos read that. The state math is pure and verified; attach() is the DOM wiring.
"use strict";
import { attachGestures } from "./touchGestures.js";
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

function makeOrbitControls(opts = {}) {
    const st = { az: opts.az ?? 0, el: opts.el ?? 0.35, dist: opts.dist ?? 5, target: (opts.target || [0, 0, 0]).slice(),
        minEl: opts.minEl ?? -1.45, maxEl: opts.maxEl ?? 1.45, minDist: opts.minDist ?? 0.5, maxDist: opts.maxDist ?? 60, orbitSpeed: opts.orbitSpeed ?? 0.006, idle: 0 };
    function orbit(dx, dy) { st.az -= dx * st.orbitSpeed; st.el = clamp(st.el - dy * st.orbitSpeed, st.minEl, st.maxEl); st.idle = 0; }
    function zoom(factor) { st.dist = clamp(st.dist / (factor || 1), st.minDist, st.maxDist); st.idle = 0; }
    function pan(dx, dy) { const s = st.dist * 0.0015; st.target[0] -= (dx * Math.cos(st.az)) * s; st.target[2] -= (dx * Math.sin(st.az)) * s; st.target[1] += dy * s; st.idle = 0; }
    function eye() { const ce = Math.cos(st.el); return [st.target[0] + st.dist * ce * Math.sin(st.az), st.target[1] + st.dist * Math.sin(st.el), st.target[2] + st.dist * ce * Math.cos(st.az)]; }
    function autospin(dt, speed) { if ((st.idle += dt) > 2) st.az += (speed ?? 0.15) * dt; }   // gently auto-rotate after 2s of no input
    return { st, orbit, zoom, pan, eye, autospin };
}

function attachOrbit(el, ctl) {
    attachGestures(el, { onPan: (p, fingers) => { if (fingers === 1) ctl.orbit(p.dx, p.dy); else ctl.pan(p.dx, p.dy); }, onPinch: (s) => ctl.zoom(s) });
    let down = false, lx = 0, ly = 0;
    el.addEventListener("mousedown", e => { down = true; lx = e.clientX; ly = e.clientY; });
    window.addEventListener("mousemove", e => { if (!down) return; ctl.orbit(e.clientX - lx, e.clientY - ly); lx = e.clientX; ly = e.clientY; });
    window.addEventListener("mouseup", () => down = false);
    el.addEventListener("wheel", e => { ctl.zoom(e.deltaY < 0 ? 1.1 : 0.9); e.preventDefault(); }, { passive: false });
    return ctl;
}
export { makeOrbitControls, attachOrbit };
if (typeof module !== "undefined" && module.exports) module.exports = { makeOrbitControls, attachOrbit };
