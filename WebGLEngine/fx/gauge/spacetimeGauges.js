// fx/gauge/spacetimeGauges.js -- two gauges that read a value as a piece of spacetime instead of a bar.
//
//   wormhole  -- the throat OPENS as the value rises. Rings recede into it, twisting as they go and fading with
//                depth, so the reading is "how far open is the way through".
//   blackhole -- the horizon GROWS as the value rises, and because the disk's outer edge is fixed by the bezel, the
//                accretion band gets squeezed into a narrower, faster ring. High values look tight and violent.
//                Disk rings orbit Keplerian-ish (faster the closer they are), which is what sells it as a real object.
//
// The geometry is pure and separate from the painting, so the instrument's behaviour is verifiable in a terminal --
// which matters for a gauge, because a gauge that lies is worse than no gauge. Painting is plain Canvas2D.
"use strict";
const clamp01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;

// The numbers that ARE the instrument. Both the Canvas2D painters and the GLSL stage styles are built from these --
// the shader source interpolates them rather than hard-coding its own, so the 3D gauge and the 2D gauge cannot drift
// apart. (Lava got written three times in this engine by exactly that kind of drift. Once was enough.)
const GAUGE_CONST = {
    throatBase: 0.10, throatGain: 0.52, ringPow: 0.75, twistBase: 1.6, twistGain: 2.8,
    horizonBase: 0.08, horizonGain: 0.46, photonMul: 1.5, innerMul: 1.04, outer: 0.98, kepler: 1.5
};

// --- wormhole: the throat opens with the value ---
function wormholeGeometry(value, t = 0, opts = {}) {
    const C = GAUGE_CONST, v = clamp01(value), n = opts.rings || 9;
    const throat = C.throatBase + v * C.throatGain;       // fraction of the bezel radius -- OPENS with the value
    const rings = [];
    for (let i = 0; i < n; i++) {
        const depth = i / (n - 1);                        // 0 at the rim, 1 deep in the throat
        const r = 1 - (1 - throat) * Math.pow(depth, C.ringPow);
        rings.push({ depth, r, twist: depth * (C.twistBase + v * C.twistGain) + t * (0.5 + v * 1.5), alpha: (1 - depth * 0.82) * (0.35 + v * 0.5) });
    }
    return { throat, rings, flow: 0.5 + v * 1.5, open: v };
}
// --- black hole: the horizon grows, so the disk is squeezed ---
function blackHoleGeometry(value, t = 0, opts = {}) {
    const C = GAUGE_CONST, v = clamp01(value), n = opts.rings || 10;
    const horizon = C.horizonBase + v * C.horizonGain;    // GROWS with the value
    const photon = horizon * C.photonMul;                 // photon ring sits outside the horizon, always
    const inner = photon * C.innerMul, outer = C.outer;
    const band = Math.max(0, outer - inner);              // the accretion band -- SQUEEZED as the horizon grows
    const disk = [];
    for (let i = 0; i < n; i++) {
        const u = n === 1 ? 0 : i / (n - 1), r = inner + band * u;
        disk.push({ r, u, w: Math.pow(inner / r, C.kepler) * (0.6 + v * 1.9), alpha: (0.25 + 0.6 * (1 - u)) * (0.35 + v * 0.6), phase: t * Math.pow(inner / r, C.kepler) });
    }
    return { horizon, photon, inner, outer, band, disk, doppler: 0.3 + v * 0.7 };
}

function _rgba(c, a) { return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a.toFixed(3) + ")"; }
function paintWormhole(ctx, cx, cy, R, value, t, opts = {}) {
    const g = wormholeGeometry(value, t, opts), col = opts.color || [120, 200, 255];
    ctx.save();
    const bg = ctx.createRadialGradient(cx, cy, 1, cx, cy, R); bg.addColorStop(0, "rgba(4,8,18,0.95)"); bg.addColorStop(1, "rgba(8,14,30,0.35)");
    ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.283); ctx.fill();
    for (const ring of g.rings) {                                     // rings receding into the throat
        ctx.strokeStyle = _rgba(col, ring.alpha); ctx.lineWidth = Math.max(0.6, 2.4 * (1 - ring.depth * 0.6));
        ctx.beginPath();
        for (let k = 0; k <= 40; k++) { const a = (k / 40) * 6.283 + ring.twist, wob = 1 + 0.05 * Math.sin(a * 3 + ring.twist * 2);
            const rr = R * ring.r * wob, x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr * 0.82; k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        ctx.closePath(); ctx.stroke();
    }
    const th = ctx.createRadialGradient(cx, cy, 1, cx, cy, R * g.throat);   // the way through
    th.addColorStop(0, "rgba(255,255,255," + (0.25 + g.open * 0.55).toFixed(3) + ")"); th.addColorStop(0.6, _rgba(col, 0.35 * g.open + 0.1)); th.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = th; ctx.beginPath(); ctx.arc(cx, cy, R * g.throat, 0, 6.283); ctx.fill();
    ctx.strokeStyle = _rgba(col, 0.5); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.283); ctx.stroke();
    ctx.restore(); return g;
}
function paintBlackHole(ctx, cx, cy, R, value, t, opts = {}) {
    const g = blackHoleGeometry(value, t, opts), col = opts.color || [255, 170, 90];
    ctx.save();
    ctx.fillStyle = "rgba(4,6,14,0.92)"; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.283); ctx.fill();
    ctx.globalCompositeOperation = "lighter";
    for (const d of g.disk) {                                          // the squeezed accretion band, faster inside
        const rr = R * d.r; ctx.strokeStyle = _rgba([col[0], Math.round(col[1] * (1 - d.u * 0.35)), Math.round(col[2] * (1 - d.u * 0.6))], d.alpha);
        ctx.lineWidth = Math.max(0.8, R * g.band * 0.16);
        ctx.beginPath();
        for (let k = 0; k <= 44; k++) { const a = (k / 44) * 6.283, br = 1 + 0.35 * g.doppler * Math.cos(a + d.phase) * 0;
            const x = cx + Math.cos(a + d.phase) * rr * br, y = cy + Math.sin(a + d.phase) * rr * 0.30; k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        ctx.closePath(); ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#000"; ctx.beginPath(); ctx.arc(cx, cy, R * g.horizon, 0, 6.283); ctx.fill();          // the horizon itself
    ctx.strokeStyle = _rgba([255, 225, 190], 0.55 + value * 0.4); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(cx, cy, R * g.photon, 0, 6.283); ctx.stroke();   // photon ring
    ctx.restore(); return g;
}

// ONE AT A TIME. A gauge cluster that shows everything at once is wallpaper; one instrument, held long enough to read,
// is an instrument. The stack owns which single gauge is showing and rotates on a timer (or by hand).
function makeGaugeStack(defs, opts = {}) {
    const period = opts.period == null ? 6 : opts.period;
    let i = 0, t = 0, auto = opts.auto !== false;
    function step(dt) { if (auto && defs.length > 1) { t += dt; if (t >= period) { t -= period; i = (i + 1) % defs.length; } } return defs[i]; }
    function next() { i = (i + 1) % defs.length; t = 0; return defs[i]; }
    function visible() { return defs.map((d, k) => k === i); }   // exactly one true, always
    return { step, next, visible, get current() { return defs[i]; }, get index() { return i; }, get n() { return defs.length; },
        set auto(v) { auto = !!v; }, get auto() { return auto; }, set index(k) { i = ((k % defs.length) + defs.length) % defs.length; t = 0; } };
}
export { wormholeGeometry, blackHoleGeometry, paintWormhole, paintBlackHole, makeGaugeStack, GAUGE_CONST };
