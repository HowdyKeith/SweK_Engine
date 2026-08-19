// ui/targetScanHud.js -- drops the tactical scan into the flight view's corner as a live HUD. When the player has a
// target (the nearest live enemy the guns track), this shows a "ship's computer" scan of it: an LCARS schematic with
// the sweep, reticle, and a hull/shield/weapon readout driven by the target's real state. The flight view just calls
// window.swekTargetScan.scan(target) each frame and .hide() when there's none; a new target id restarts the sweep.
//
// The scan subject: ideally the target's actual sprite, but the flight view keeps sprites as GPU textures, so until
// the loader retains a source image this uses one of a few procedural silhouettes chosen by ship class -- the sweep,
// reticle, and (real) stats read correct; swapping in the true sprite is a drop-in once the source canvas exists.
"use strict";

import { TacticalScan } from "./tacticalScan.js";

function silhouette(kind) {
    const S = 100, sc = document.createElement("canvas"); sc.width = S; sc.height = S; const g = sc.getContext("2d"); g.translate(S / 2, S / 2); g.fillStyle = "#8fa8c8";
    if (kind === 0) { g.beginPath(); g.moveTo(0, -42); g.lineTo(13, 16); g.lineTo(32, 30); g.lineTo(8, 26); g.lineTo(0, 38); g.lineTo(-8, 26); g.lineTo(-32, 30); g.lineTo(-13, 16); g.closePath(); g.fill(); g.fillStyle = "#5a7196"; g.fillRect(-5, 26, 4, 10); g.fillRect(1, 26, 4, 10); }
    else if (kind === 1) { g.fillRect(-17, -34, 34, 70); g.beginPath(); g.moveTo(-17, -34); g.lineTo(0, -44); g.lineTo(17, -34); g.closePath(); g.fill(); g.fillStyle = "#5a7196"; g.fillRect(-27, -6, 10, 30); g.fillRect(17, -6, 10, 30); }
    else { g.beginPath(); g.moveTo(0, -44); g.lineTo(6, 0); g.lineTo(36, 22); g.lineTo(4, 16); g.lineTo(0, 34); g.lineTo(-4, 16); g.lineTo(-36, 22); g.lineTo(-6, 0); g.closePath(); g.fill(); }
    return sc;
}
function hashCode(s) { s = String(s); let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
// pull the target's actual rotation frame out of the retained sprite sheet (same frame math as drawSpriteQuad)
function extractFrame(atlas, headingDeg) {
    try {
        const per = atlas.perRotation, h = ((headingDeg % 360) + 360) % 360, frame = Math.round(h / 360 * per) % per;
        const gx = (frame % atlas.gridW) * atlas.frameW, gy = Math.floor(frame / atlas.gridW) * atlas.frameH;
        const c = document.createElement("canvas"); c.width = atlas.frameW; c.height = atlas.frameH;
        c.getContext("2d").drawImage(atlas.sheetCanvas, gx, gy, atlas.frameW, atlas.frameH, 0, 0, atlas.frameW, atlas.frameH);
        return c;
    } catch (e) { return null; }
}

let overlay = null, ctx = null, scan = null, curId = null, subj = null, last = performance.now(), raf = 0;
const sil = [silhouette(0), silhouette(1), silhouette(2)];

function ensure() {
    if (overlay) return;
    overlay = document.createElement("canvas");
    overlay.style.cssText = "position:fixed;right:16px;bottom:16px;width:240px;height:240px;z-index:9000;pointer-events:none;";
    overlay.width = 240; overlay.height = 240; document.body.appendChild(overlay); ctx = overlay.getContext("2d"); scan = new TacticalScan();
    (function loop() { raf = requestAnimationFrame(loop); if (!overlay || overlay.style.display === "none") return;
        const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now; scan.step(dt);
        ctx.clearRect(0, 0, 240, 240); ctx.fillStyle = "rgba(4,6,13,0.55)"; ctx.fillRect(0, 0, 240, 240);
        ctx.strokeStyle = "#16233c"; ctx.strokeRect(0.5, 0.5, 239, 239);
        if (subj) scan.draw(ctx, 100, 120, 1.0);
    })();
}

const api = {
    scan(target) {
        ensure(); overlay.style.display = "block";
        const id = target && (target.id != null ? target.id : target.name);
        if (id !== curId) { curId = id;
            subj = (target.atlas && target.atlas.sheetCanvas && extractFrame(target.atlas, target.heading)) || sil[hashCode(id || "0") % sil.length];
            scan.start(subj, { name: target.name, hull: clamp(target.hull), shield: clamp(target.shield), weapon: clamp(target.weapon) }); }
        else if (scan) { scan.state.hull = clamp(target.hull); scan.state.shield = clamp(target.shield); scan.state.weapon = clamp(target.weapon); }
    },
    hide() { if (overlay) overlay.style.display = "none"; curId = null; subj = null; }
};
function clamp(v) { return v == null ? 1 : Math.max(0, Math.min(1, v)); }

if (typeof window !== "undefined") window.swekTargetScan = api;
export { api };
