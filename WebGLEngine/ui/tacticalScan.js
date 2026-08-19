// ui/tacticalScan.js -- a "ship's computer" tactical-scan overlay: point it at a targeted ship's sprite and it
// renders an LCARS vector schematic -- the ship's edges traced in amber, a scan line sweeping down it and lighting
// the outline as it passes, a corner reticle, and a subsystem readout tied to the ship's real hull/shield state.
// This works with our 2D sprites TODAY (no 3D model needed): a Sobel edge pass turns the sprite into a clean
// outline, everything else is drawn over it. The edge pass is verifiable; the rest is Canvas2D.
"use strict";

// Sobel edge magnitude (0..1) from a sprite's alpha (ships are alpha-cut sprites, so alpha edges = the silhouette
// + interior detail). Deterministic + testable.
function edgeMap(data, W, H) {
    const lum = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) lum[i] = data[i * 4 + 3] / 255;   // alpha
    const e = new Float32Array(W * H);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        const tl = lum[(y - 1) * W + x - 1], tm = lum[(y - 1) * W + x], tr = lum[(y - 1) * W + x + 1];
        const ml = lum[y * W + x - 1], mr = lum[y * W + x + 1];
        const bl = lum[(y + 1) * W + x - 1], bm = lum[(y + 1) * W + x], br = lum[(y + 1) * W + x + 1];
        const gx = -tl - 2 * ml - bl + tr + 2 * mr + br, gy = -tl - 2 * tm - tr + bl + 2 * bm + br;
        e[y * W + x] = Math.min(1, Math.hypot(gx, gy));
    }
    return e;
}

// tight bounding box of non-transparent pixels (so the reticle frames the ship, not the sprite cell)
function alphaBounds(data, W, H) {
    let x0 = W, y0 = H, x1 = 0, y1 = 0, any = false;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (data[(y * W + x) * 4 + 3] > 24) { any = true; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return any ? { x0, y0, x1, y1 } : { x0: 0, y0: 0, x1: W - 1, y1: H - 1 };
}

// build the schematic from a source canvas (the ship sprite drawn at some size)
function computeSchematic(srcCanvas) {
    const W = srcCanvas.width, H = srcCanvas.height, data = srcCanvas.getContext("2d").getImageData(0, 0, W, H).data;
    return { W, H, edges: edgeMap(data, W, H), bounds: alphaBounds(data, W, H) };
}

// animated overlay. state = { hull, shield, weapon, name } (0..1 gauges) drives the readout.
class TacticalScan {
    constructor() { this.t = 0; this.dur = 1.6; this.schematic = null; this.state = {}; }
    start(srcCanvas, state) { this.schematic = computeSchematic(srcCanvas); this.state = state || {}; this.t = 0; }
    step(dt) { this.t += dt; }
    progress() { return Math.min(1, this.t / this.dur); }
    // draw into ctx over a WxH region (the on-screen ship footprint at cx,cy scaled). amber = --amber, cyan = --cyan.
    draw(ctx, cx, cy, scale) {
        const s = this.schematic; if (!s) return; const p = this.progress();
        const AM = "#f6a623", CY = "#59d1ff"; const b = s.bounds, bw = (b.x1 - b.x0) * scale, bh = (b.y1 - b.y0) * scale;
        const ox = cx - ((b.x0 + b.x1) / 2) * scale, oy = cy - ((b.y0 + b.y1) / 2) * scale;   // center the ship at cx,cy
        // edges, lit up to the sweep line (progress fraction of height)
        const sweepY = b.y0 + (b.y1 - b.y0) * p;
        ctx.save();
        for (let y = b.y0; y <= b.y1; y += 1) for (let x = b.x0; x <= b.x1; x += 1) {
            const m = s.edges[y * s.W + x]; if (m < 0.35) continue;
            const lit = y <= sweepY; ctx.fillStyle = lit ? AM : "rgba(246,166,35,0.18)";
            ctx.globalAlpha = lit ? Math.min(1, m) : 0.18 * m; ctx.fillRect(ox + x * scale, oy + y * scale, Math.max(1, scale), Math.max(1, scale));
        }
        ctx.globalAlpha = 1;
        // scan line
        if (p < 1) { ctx.strokeStyle = CY; ctx.lineWidth = 1.5; ctx.shadowColor = CY; ctx.shadowBlur = 8; ctx.beginPath(); ctx.moveTo(ox + b.x0 * scale, oy + sweepY * scale); ctx.lineTo(ox + b.x1 * scale, oy + sweepY * scale); ctx.stroke(); ctx.shadowBlur = 0; }
        // corner reticle
        const rx = ox + b.x0 * scale - 8, ry = oy + b.y0 * scale - 8, rw = bw + 16, rh = bh + 16, cc = 14;
        ctx.strokeStyle = CY; ctx.lineWidth = 2;
        for (const [sx, sy, dx, dy] of [[rx, ry, 1, 1], [rx + rw, ry, -1, 1], [rx, ry + rh, 1, -1], [rx + rw, ry + rh, -1, -1]]) { ctx.beginPath(); ctx.moveTo(sx, sy + dy * cc); ctx.lineTo(sx, sy); ctx.lineTo(sx + dx * cc, sy); ctx.stroke(); }
        // readout
        ctx.font = "11px ui-monospace, monospace"; ctx.textAlign = "left";
        const lines = [(this.state.name || "TARGET").toUpperCase(), "SCAN " + Math.round(p * 100) + "%",
            "HULL   " + bar(this.state.hull), "SHIELD " + bar(this.state.shield), "WEAPON " + bar(this.state.weapon)];
        ctx.fillStyle = "rgba(4,8,16,0.6)"; ctx.fillRect(rx + rw + 10, ry, 132, lines.length * 15 + 8);
        ctx.strokeStyle = AM; ctx.lineWidth = 1; ctx.strokeRect(rx + rw + 10, ry, 132, lines.length * 15 + 8);
        lines.forEach((L, i) => { ctx.fillStyle = i === 0 ? AM : CY; ctx.fillText(L, rx + rw + 18, ry + 16 + i * 15); });
        ctx.restore();
    }
}
function bar(v) { v = Math.max(0, Math.min(1, v == null ? 1 : v)); const n = Math.round(v * 8); return "[" + "|".repeat(n) + " ".repeat(8 - n) + "]"; }

export { edgeMap, alphaBounds, computeSchematic, TacticalScan };
if (typeof module !== "undefined" && module.exports) module.exports = { edgeMap, alphaBounds, computeSchematic, TacticalScan };
