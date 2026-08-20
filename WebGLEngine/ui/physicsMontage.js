// ui/physicsMontage.js -- a physics-comparison reel, fronted by the SweK avatar and bolted to Render QA. The avatar
// (narrator.js) introduces the reel and names each engine; its onLine hook drives the actual engine switch, so the
// page shatters on SweK CPU / box3d / Jolt exactly as the avatar says each name. After each engine's run a QA row is
// captured -- physics invariants (no voxel through the floor, settled fraction, all-finite) plus the render-QA image
// check (notAllBlack) -- and shown in a panel, so the reel proves each engine, not just shows it. Only engines that
// actually initialise are cycled; the whole thing records to one webm clip.
"use strict";

import { voxelizePage, physicsState } from "../fx/voxelize/pageVoxels.js";
import { makeVoxelPhysics } from "../fx/voxelize/voxelPhysicsBackends.js";
import { initVoxelGL, initVoxelCanvas } from "../fx/voxelize/voxelRender.js";
import { startNarration } from "./narrator.js";

function imgToCanvas(img, maxW) { const iw = img.naturalWidth || img.width || 480, ih = img.naturalHeight || img.height || 620, s = Math.min(1, maxW / iw), w = Math.max(8, Math.round(iw * s)), h = Math.max(8, Math.round(ih * s)), c = document.createElement("canvas"); c.width = w; c.height = h; c.getContext("2d").drawImage(img, 0, 0, w, h); return c; }
async function detectBackends() {
    const out = [{ id: "cpu", label: "SweK CPU" }];
    try { const b = await import("../physics/box3d/box3dLoader.js"); const st = await b.box3d.init(); if (st && st.ready) out.push({ id: "box3d", label: "box3d", box3d: b.box3d }); } catch (e) {}
    try { const j = await import("../physics/jolt/joltLoader.js"); const jb = await j.createJoltBackend(); if (jb) out.push({ id: "jolt", label: "Jolt", joltFactory: j.createJoltBackend }); } catch (e) {}
    return out;
}

// physics invariants on the current voxel state (the render-QA idea, applied to the sim)
function physicsQA(vg, floorPy) {
    let clip = 0, settled = 0, finite = true;
    for (const v of vg.voxels) { if (v.py > floorPy + 0.02) clip++; if (v.settled) settled++; if (![v.px, v.py, v.pz].every(Number.isFinite)) finite = false; }
    return { noClip: clip === 0, clip, settledFrac: settled / (vg.voxels.length || 1), finite };
}
// render-QA image check: use the real checks.mjs when the harness is servable, else an equivalent inline notAllBlack
async function imageQA(canvas) {
    try { const ctx = canvas.getContext("2d") || canvas.getContext("webgl2"); let data;
        if (canvas.getContext("2d")) { data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data; }
        else { const gl = canvas.getContext("webgl2"); const px = new Uint8Array(canvas.width * canvas.height * 4); gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, px); data = px; }
        const img = { data, width: canvas.width, height: canvas.height };
        try { const C = await import("/tools/render-qa/checks.mjs"); return { notAllBlack: C.notAllBlack(img).ok, source: "render-qa" }; }
        catch (e) { let nb = 0; const n = data.length / 4, step = Math.max(1, (n / 40000) | 0); for (let i = 0; i < n; i += step) { if (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2] > 24) nb++; } return { notAllBlack: (nb / (n / step)) > 0.02, source: "inline" }; }
    } catch (e) { return { notAllBlack: null, source: "err" }; }
}

async function physicsMontage(img, opts = {}) {
    const src = imgToCanvas(img, 400), backends = await detectBackends(), perSecs = opts.perSecs || 4.2;
    const host = document.createElement("div"); host.style.cssText = "position:fixed;inset:0;z-index:100001;background:#04060d;";
    const cv = document.createElement("canvas"); cv.style.cssText = "position:absolute;inset:0;width:100%;height:100%;"; host.appendChild(cv);
    const label = document.createElement("div"); label.style.cssText = "position:absolute;left:0;right:0;top:22px;text-align:center;color:#f6a623;font:800 22px ui-monospace,monospace;letter-spacing:.16em;text-transform:uppercase;text-shadow:0 2px 12px #000;"; host.appendChild(label);
    const qa = document.createElement("div"); qa.style.cssText = "position:absolute;right:16px;top:70px;min-width:230px;background:rgba(6,10,20,.82);border:1px solid #1c2942;border-radius:10px;padding:12px 14px;color:#cfe0ff;font:12px ui-monospace,monospace;line-height:1.7;"; qa.innerHTML = "<div style='color:#59d1ff;letter-spacing:.12em'>RENDER QA</div>"; host.appendChild(qa);
    const closeB = document.createElement("button"); closeB.textContent = "\u2715"; closeB.style.cssText = "position:absolute;left:16px;top:16px;z-index:3;background:rgba(10,16,28,.85);color:#f6a623;border:1px solid #1c2942;border-radius:8px;padding:8px 12px;font:600 13px ui-monospace,monospace;cursor:pointer;"; host.appendChild(closeB);
    document.body.appendChild(host);
    let W = 0, H = 0, DPR = Math.min(2, devicePixelRatio || 1), curVG = null, curPhys = null, curLabel = "", ry = 0.3, killed = false, narr = null;
    const floorPy = 0.85;
    function resize() { W = cv.width = Math.floor(innerWidth * DPR); H = cv.height = Math.floor(innerHeight * DPR); }
    resize(); addEventListener("resize", resize);
    let R = null; const args = () => ({ W, H, ry, rx: -0.12, dist: 3.0 });
    try { R = initVoxelGL(cv, () => curVG, args); } catch (e) { R = null; } if (!R) R = initVoxelCanvas(cv, () => curVG, args);
    function cleanup() { if (killed) return; killed = true; removeEventListener("resize", resize); try { if (narr && narr.stop) narr.stop(); } catch (e) {} try { if (window.swekRecord && window.swekRecord.recording && window.swekRecord.recording()) window.swekRecord.stop(); } catch (e) {} host.remove(); }
    closeB.onclick = cleanup;
    async function recordQA(name) { if (!curVG) return; const p = physicsQA(curVG, floorPy), im = await imageQA(cv); const ok = (x) => x ? "<span style='color:#5ce08a'>PASS</span>" : "<span style='color:#ff6a6a'>FAIL</span>"; const row = document.createElement("div"); row.style.marginTop = "8px"; row.innerHTML = "<b style='color:#f6a623'>" + name + "</b><br>no clip-through " + ok(p.noClip) + "<br>settled " + Math.round(p.settledFrac * 100) + "%<br>all-finite " + ok(p.finite) + "<br>render notAllBlack " + ok(im.notAllBlack) + " <span style='color:#5f7aa0'>(" + im.source + ")</span>"; qa.appendChild(row); }
    async function switchTo(be) {
        if (curVG && curLabel) await recordQA(curLabel);
        label.textContent = be.label; curPhys = null;
        const d = src.getContext("2d").getImageData(0, 0, src.width, src.height).data; curVG = voxelizePage(d, src.width, src.height, { cell: opts.cell || 6 });
        const phys = await makeVoxelPhysics(curVG, be.id, { g: 2.4, floor: floorPy, box3d: be.box3d, joltFactory: be.joltFactory });
        phys.impact({ x: 0, y: 0, z: 0 }, 1.95); curPhys = phys; curLabel = be.label + (phys.fellBack ? " \u2192 CPU" : "");
        if (phys.fellBack) label.textContent += "  (\u2192 CPU)";
    }
    // avatar out front: intro, then a line per engine; onLine drives the shatter so it lands on the spoken name
    const lines = [{ text: "One page. One impact. Every physics engine on this rig.", gap: 500 }];
    backends.forEach((be, i) => lines.push({ text: "Engine " + (i + 1) + ": " + be.label + ".", gap: Math.max(400, Math.round(perSecs * 1000) - 1500) }));
    lines.push({ text: "Every run verified by render QA.", gap: 300 });
    let last = performance.now();
    (function loop() { if (killed) return; requestAnimationFrame(loop); const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now; if (curPhys) { curPhys.step(dt); ry += dt * 0.22; } try { R.draw(); } catch (e) {} })();
    { const d0 = src.getContext("2d").getImageData(0, 0, src.width, src.height).data; curVG = voxelizePage(d0, src.width, src.height, { cell: opts.cell || 6 }); physicsState(curVG, { floor: floorPy }); }   // intact page during the intro
    if (opts.record && window.swekRecord) { try { window.swekRecord.start(Math.ceil(backends.length * perSecs + 6), cv); } catch (e) {} }
    narr = startNarration(lines, { rate: 0.98, delay: 600, onLine: (i) => { if (i >= 1 && i <= backends.length) switchTo(backends[i - 1]); }, onDone: async () => { if (curVG && curLabel) await recordQA(curLabel); label.textContent = "Comparison complete"; try { if (window.swekRecord && window.swekRecord.recording && window.swekRecord.recording()) window.swekRecord.stop(); } catch (e) {} setTimeout(cleanup, 2600); } });
    return backends.map(b => b.label);
}

if (typeof window !== "undefined") window.swekPhysicsMontage = physicsMontage;
export { physicsMontage, detectBackends, physicsQA };
