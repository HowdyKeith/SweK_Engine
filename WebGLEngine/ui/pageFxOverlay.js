// ui/pageFxOverlay.js -- runs the voxel filters on a REAL comic page, live in the reader. The page <img> is drawn to
// a canvas, voxelized, and the chosen filter plays over a fullscreen overlay: Burn, Ripple, Melt, Shatter, Plasma.
// Toolbar switches filters (remembered across opens), a Rec button records the run to a webm devlog clip, and when
// Shatter is active an engine toggle runs it on cpu / box3d / Jolt via the real physics facade. Same verified filter
// modules + shared renderer as the rest of the series.
"use strict";

import { voxelizePage, igniteState, updateFire, waterState, dropAt, updateWater, blobState, updateBlob, physicsState, impact, updatePhysics, plasmaState, updatePlasma } from "../fx/voxelize/pageVoxels.js";
import { initVoxelGL, initVoxelCanvas } from "../fx/voxelize/voxelRender.js";
import { makeVoxelPhysics } from "../fx/voxelize/voxelPhysicsBackends.js";

function imgToCanvas(img, maxW) {
    const iw = img.naturalWidth || img.width || 480, ih = img.naturalHeight || img.height || 620, sc = Math.min(1, maxW / iw);
    const w = Math.max(8, Math.round(iw * sc)), h = Math.max(8, Math.round(ih * sc)), c = document.createElement("canvas"); c.width = w; c.height = h;
    c.getContext("2d").drawImage(img, 0, 0, w, h); return c;
}
function lastFilter() { try { return localStorage.getItem("swekPageFxFilter") || "burn"; } catch (e) { return "burn"; } }
function saveFilter(k) { try { localStorage.setItem("swekPageFxFilter", k); } catch (e) {} }
async function makePhys(vg, backend) {
    let box3d = null, joltFactory = null;
    if (backend !== "cpu") { try { box3d = (await import("../physics/box3d/box3dLoader.js")).box3d; } catch (e) {} try { joltFactory = (await import("../physics/jolt/joltLoader.js")).createJoltBackend; } catch (e) {} }
    return makeVoxelPhysics(vg, backend, { g: 2.4, floor: 0.85, box3d, joltFactory });
}

const FILTERS = {
    burn: { label: "\uD83D\uDD25 Burn", init: (vg) => igniteState(vg, { dir: "up", burnDur: 0.55 }), update: (vg, t, dt, s) => updateFire(vg, t) },
    ripple: { label: "\uD83C\uDF0A Ripple", init: (vg) => waterState(vg), update: (vg, t, dt, s) => { s.rainT = (s.rainT || 0) + dt; if (s.rainT > 0.45) { s.rainT = 0; dropAt(vg, 2 + Math.random() * (vg.nx - 4), 2 + Math.random() * (vg.ny - 4), 1.3); } updateWater(vg, dt, { c: 11, amp: 0.18 }); } },
    melt: { label: "\uD83E\uDDA0 Melt", init: (vg) => blobState(vg, { tendrilFrac: 0.5 }), update: (vg, t, dt, s) => updateBlob(vg, t, s.target || { x: 1.1, y: 0 }, { reachDur: 2.0 }) },
    shatter: { label: "\uD83D\uDCA5 Shatter", init: async (vg, s) => { s.phys = await makePhys(vg, s.physBackend); s.phys.impact({ x: 0, y: 0, z: 0 }, 1.8); s.backendName = s.phys.name; }, update: (vg, t, dt, s) => { if (s.phys) s.phys.step(dt); } },
    plasma: { label: "\u26A1 Plasma", init: (vg) => plasmaState(vg), update: (vg, t, dt, s) => updatePlasma(vg, t, [s.target || { x: 1, y: 0 }, { x: -1.1, y: 0.5 }, { x: 0.4, y: -1.1 }], { glowR: 0.13 }) }
};

let host = null;
const _thumbs = {};
// tiny rendered preview of a filter, run on a small sample once and cached, for the picker buttons
function thumbnailFor(key) {
    if (_thumbs[key]) return _thumbs[key];
    const S = 30, sc = document.createElement("canvas"); sc.width = S; sc.height = Math.round(S * 1.3); const g = sc.getContext("2d");
    g.fillStyle = "#8ec5e8"; g.fillRect(3, 3, S - 6, sc.height - 6); g.fillStyle = "#e5544b"; g.fillRect(7, sc.height * 0.45, S - 14, sc.height * 0.35);
    const d = g.getImageData(0, 0, sc.width, sc.height).data, vg = voxelizePage(d, sc.width, sc.height, { cell: 2 });
    if (key === "shatter") { physicsState(vg, { g: 2.4, floor: 0.9 }); impact(vg, { x: 0, y: 0, z: 0 }, 1.6); for (let i = 0; i < 12; i++) updatePhysics(vg, 0.05); }
    else { const st = { target: { x: 1, y: 0 }, rainT: 0 }; try { FILTERS[key].init(vg, st); let t = 0; for (let i = 0; i < 14; i++) { t += 0.05; FILTERS[key].update(vg, t, 0.05, st); } } catch (e) {} }
    const tc = document.createElement("canvas"); tc.width = 44; tc.height = 44; const tx = tc.getContext("2d"); tx.fillStyle = "#0a1120"; tx.fillRect(0, 0, 44, 44);
    const pts = []; for (const v of vg.voxels) { if (v.alpha <= 0.02) continue; pts.push({ x: 22 + v.px * 30, y: 22 + v.py * 30, z: v.pz, v }); } pts.sort((a, b) => a.z - b.z);
    for (const p of pts) { tx.globalAlpha = Math.max(0, Math.min(1, p.v.alpha)); tx.fillStyle = "rgb(" + (p.v.cr * 255 | 0) + "," + (p.v.cg * 255 | 0) + "," + (p.v.cb * 255 | 0) + ")"; tx.fillRect(p.x - 1.6, p.y - 1.6, 3.2, 3.2); }
    return (_thumbs[key] = tc.toDataURL());
}

// "shatter into the next page": the current page shatters on a TRANSPARENT overlay while onDone advances the reader
// underneath, so the pieces fall away to reveal the new page.
function shatterTransition(img, onDone) {
    const src = imgToCanvas(img, 400), d = src.getContext("2d").getImageData(0, 0, src.width, src.height).data, vg = voxelizePage(d, src.width, src.height, { cell: 6 });
    physicsState(vg, { g: 3.0, floor: 1.7 }); impact(vg, { x: 0, y: 0, z: 0 }, 2.4);
    const el = document.createElement("canvas"); el.style.cssText = "position:fixed;inset:0;width:100%;height:100%;z-index:99997;pointer-events:none;"; document.body.appendChild(el);
    const DPR = Math.min(2, devicePixelRatio || 1); let W = el.width = Math.floor(innerWidth * DPR), H = el.height = Math.floor(innerHeight * DPR); const ctx = el.getContext("2d");
    if (onDone) { try { onDone(); } catch (e) {} }   // advance underneath now; pieces reveal the new page as they fall
    let t = 0, last = performance.now();
    (function loop() {
        const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt; updatePhysics(vg, dt);
        ctx.clearRect(0, 0, W, H);
        const sc = Math.min(W, H) * 0.42, ox = W / 2, oy = H * 0.42, vox = Math.max(2, sc * 0.92 / vg.ny), fade = Math.max(0, 1 - t / 2.0);
        const pts = []; for (const v of vg.voxels) { if (v.alpha <= 0.02) continue; const pp = 3.0 / (3.0 - v.pz); pts.push({ x: ox + v.px * sc * pp, y: oy + v.py * sc * pp, z: v.pz, v, s: vox * pp }); }
        pts.sort((a, b) => a.z - b.z);
        for (const p of pts) { ctx.globalAlpha = Math.max(0, Math.min(1, p.v.alpha)) * fade; ctx.fillStyle = "rgb(" + (p.v.cr * 255 | 0) + "," + (p.v.cg * 255 | 0) + "," + (p.v.cb * 255 | 0) + ")"; ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s); }
        ctx.globalAlpha = 1;
        if (t < 2.1) requestAnimationFrame(loop); else el.remove();
    })();
}
async function openPageFx(img, initial) {
    if (host) closePageFx();
    const src = imgToCanvas(img, 460);
    host = document.createElement("div"); host.style.cssText = "position:fixed;inset:0;z-index:100000;background:#04060d;";
    const cv = document.createElement("canvas"); cv.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;"; host.appendChild(cv);
    const bar = document.createElement("div"); bar.style.cssText = "position:absolute;left:50%;bottom:20px;transform:translateX(-50%);display:flex;gap:7px;flex-wrap:wrap;justify-content:center;max-width:96vw;"; host.appendChild(bar);
    document.body.appendChild(host);
    try { const rec = await import("./canvasRecorder.js"); if (rec.installRecorder && !window.swekRecord) rec.installRecorder(); } catch (e) {}
    let W = 0, H = 0, DPR = Math.min(2, devicePixelRatio || 1);
    function resize() { W = Math.floor(innerWidth * DPR); H = Math.floor(innerHeight * DPR); cv.width = W; cv.height = H; }
    // v4434 -- the handler is stashed on `host` AT REGISTRATION, not on the last line of openPageFx.
    // Assigning it at the end means anything that throws in between leaves the listener registered with
    // nothing holding a reference to remove it by.
    resize(); host._resize = resize; addEventListener("resize", resize);
    const state = { vg: null, t: 0, filter: initial || lastFilter(), ry: 0, rx: -0.12, target: { x: 1.1, y: 0 }, rainT: 0, phys: null, physBackend: "cpu", backendName: "cpu" };
    async function build() { const d = src.getContext("2d").getImageData(0, 0, src.width, src.height).data; state.vg = voxelizePage(d, src.width, src.height, { cell: 6 }); state.t = 0; state.phys = null; await FILTERS[state.filter].init(state.vg, state); refreshBar(); }
    function mkBtn(txt, on, hot) { const b = document.createElement("button"); b.textContent = txt; b.style.cssText = "background:rgba(10,16,28,.85);color:" + (hot || "#59d1ff") + ";border:1px solid #1c2942;border-radius:8px;padding:9px 13px;font:600 12px ui-monospace,monospace;letter-spacing:.04em;cursor:pointer;"; b.onclick = on; return b; }
    let engineBtn = null, recBtn = null, recording = false;
    function refreshBar() {
        bar.innerHTML = "";
        for (const k of Object.keys(FILTERS)) { const active = k === state.filter; const b = mkBtn(FILTERS[k].label, async () => { state.filter = k; saveFilter(k); await build(); }, active ? "#f6a623" : "#59d1ff"); try { const th = thumbnailFor(k); b.style.backgroundImage = "url(" + th + ")"; b.style.backgroundSize = "22px"; b.style.backgroundRepeat = "no-repeat"; b.style.backgroundPosition = "7px center"; b.style.paddingLeft = "34px"; } catch (e) {} if (active) b.style.borderColor = "#f6a623"; bar.appendChild(b); }
        if (state.filter === "shatter") { engineBtn = mkBtn("engine: " + state.physBackend, async () => { state.physBackend = state.physBackend === "cpu" ? "box3d" : state.physBackend === "box3d" ? "jolt" : "cpu"; await build(); }); bar.appendChild(engineBtn); }
        recBtn = mkBtn(recording ? "\u25A0 rec" : "\u25CF Rec", () => { if (!window.swekRecord) { recBtn.textContent = "no rec"; return; } if (recording) { window.swekRecord.stop(); recording = false; refreshBar(); } else if (window.swekRecord.start(20, cv)) { recording = true; refreshBar(); setTimeout(() => { recording = false; refreshBar(); }, 20200); } }, recording ? "#ff6a6a" : "#9be15d"); bar.appendChild(recBtn);
        bar.appendChild(mkBtn("Replay", () => build()));
        bar.appendChild(mkBtn("\u2715 Close", closePageFx, "#f6a623"));
    }
    await build();
    let drag = false, lx = 0, ly = 0;
    cv.addEventListener("pointerdown", e => { if (e.shiftKey) { drag = true; lx = e.clientX; ly = e.clientY; } else if (state.filter === "shatter" && state.phys) { const mx = (e.clientX / innerWidth - .5) * 1.6, my = (e.clientY / innerHeight - .5) * 1.6; state.phys.impact({ x: mx, y: my, z: 0 }, 1.6); } });
    // v4434 -- *** THIS LEAKED ONE WINDOW LISTENER PER OPEN, MEASURED AT EXACTLY ONE PER CYCLE OVER FIVE. ***
    // It was an anonymous arrow, so closePageFx had nothing to pass to removeEventListener, and each
    // orphan closes over the same scope as `state` -- retaining the whole voxel grid (2,120 voxels of 8
    // numbers for a 240x320 page, ~136 KB) and, in shatter, a live physics backend.
    host._pointerup = () => { drag = false; };
    addEventListener("pointerup", host._pointerup);
    cv.addEventListener("pointermove", e => { if (drag) { state.ry += (e.clientX - lx) * .008; state.rx += (e.clientY - ly) * .008; lx = e.clientX; ly = e.clientY; } else { state.target.x = (e.clientX / innerWidth - .5) * 2.2; state.target.y = (e.clientY / innerHeight - .5) * 2.2; } });
    let R = null; const args = () => ({ W, H, ry: state.ry, rx: state.rx, dist: state.filter === "shatter" ? 3.0 : 2.4 });
    try { R = initVoxelGL(cv, () => state.vg, args); } catch (e) { R = null; } if (!R) R = initVoxelCanvas(cv, () => state.vg, args);
    host._raf = 1; let last = performance.now();
    (function loop() { if (!host) return; host._raf = requestAnimationFrame(loop); const now = performance.now(), dt = Math.min(.05, (now - last) / 1000); last = now; state.t += dt; try { FILTERS[state.filter].update(state.vg, state.t, dt, state); R.draw(); } catch (e) {} })();
}
function closePageFx() { if (!host) return; try { if (window.swekRecord && window.swekRecord.recording && window.swekRecord.recording()) window.swekRecord.stop(); } catch (e) {} cancelAnimationFrame(host._raf); removeEventListener("resize", host._resize); removeEventListener("pointerup", host._pointerup); host.remove(); host = null; }

if (typeof window !== "undefined") window.swekPageFx = { open: openPageFx, close: closePageFx, shatterTo: shatterTransition };
// v4434 -- FILTERS is exported so a gate can DRIVE each entry rather than read the table and hope. It was
// module-private and the first draft of the gate could only count the keys, which says nothing about
// whether an entry does anything.
export { openPageFx, closePageFx, shatterTransition, FILTERS };
