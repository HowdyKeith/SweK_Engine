// fx/voxelize/pageVoxels.js -- turn any 2D page (a comic panel, a rendered sprite, anything on a canvas) into a
// colored voxel slab, then run FILTERS over it. This is round one of "content -> voxels -> effect filters": the
// voxelization + a fire-dissolve that ignites the page from one edge and carries it up into embers. The grid
// resolution is a dial, so pushing it high is the voxel-count stress test. All the per-voxel state is plain math,
// verifiable headless; a renderer (instanced cubes, or Canvas2D) just draws px/py/pz + cr/cg/cb + alpha.
"use strict";

function _h(n) { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); }
function _mix(a, b, t) { return a + (b - a) * t; }

// canvas pixels -> voxels. cell = pixels per voxel (smaller = higher resolution = more voxels).
function voxelizePage(data, W, H, opts = {}) {
    const cell = Math.max(1, opts.cell || 6), aT = opts.alphaThresh == null ? 8 : opts.alphaThresh;
    const nx = Math.floor(W / cell), ny = Math.floor(H / cell), voxels = [];
    for (let gy = 0; gy < ny; gy++) for (let gx = 0; gx < nx; gx++) {
        let r = 0, g = 0, b = 0, a = 0, n = 0;
        for (let dy = 0; dy < cell; dy++) for (let dx = 0; dx < cell; dx++) { const px = gx * cell + dx, py = gy * cell + dy; if (px >= W || py >= H) continue; const i = (py * W + px) * 4; r += data[i]; g += data[i + 1]; b += data[i + 2]; a += data[i + 3]; n++; }
        if (!n) continue; a /= n; if (a < aT) continue;
        voxels.push({ x: (gx - nx / 2) / ny, y: (gy - ny / 2) / ny, z: 0, gx, gy, r: r / n / 255, g: g / n / 255, b: b / n / 255 });
    }
    return { voxels, nx, ny, cell };
}

// assign each voxel an ignition time: a front from one edge (default bottom-up) plus per-voxel stagger.
function igniteState(vg, opts = {}) {
    const dir = opts.dir || "up";
    for (const v of vg.voxels) {
        const base = dir === "up" ? (vg.ny - v.gy) / vg.ny : dir === "down" ? v.gy / vg.ny : (vg.nx - v.gx) / vg.nx;
        v.ig = base + _h(v.gx * 13.1 + v.gy * 7.7) * 0.16; v.seed = _h(v.gx * 3.3 + v.gy * 9.13);
    }
    vg.burnDur = opts.burnDur || 0.5;
}
function firePalette(p) { if (p < 0.5) return [1.0, _mix(0.85, 0.35, p * 2), _mix(0.35, 0.05, p * 2)]; return [_mix(1.0, 0.22, (p - 0.5) * 2), _mix(0.35, 0.2, (p - 0.5) * 2), _mix(0.05, 0.2, (p - 0.5) * 2)]; }

// advance the fire to time t; mutates render fields px,py,pz,cr,cg,cb,alpha on each voxel.
function updateFire(vg, t) {
    const bd = vg.burnDur || 0.5;
    for (const v of vg.voxels) {
        const p = (t - v.ig) / bd;
        if (p <= 0) { v.px = v.x; v.py = v.y; v.pz = v.z; v.cr = v.r; v.cg = v.g; v.cb = v.b; v.alpha = 1; continue; }
        if (p >= 1) { v.alpha = 0; continue; }
        const rise = p * 0.55, flick = Math.sin(t * 8 + v.seed * 10) * 0.02 * (1 - p);
        v.px = v.x + flick; v.py = v.y - rise; v.pz = v.z + (v.seed - 0.5) * 0.12 * p;
        const f = firePalette(p), k = Math.min(1, p * 2);
        v.cr = _mix(v.r, f[0], k); v.cg = _mix(v.g, f[1], k); v.cb = _mix(v.b, f[2], k);
        v.alpha = 1 - Math.max(0, (p - 0.6) / 0.4);
    }
}
function burnedFraction(vg) { let b = 0; for (const v of vg.voxels) if (v.alpha === 0) b++; return b / vg.voxels.length; }

export { voxelizePage, igniteState, updateFire, firePalette, burnedFraction };
if (typeof module !== "undefined" && module.exports) module.exports = { voxelizePage, igniteState, updateFire, firePalette, burnedFraction };

// --- WATER filter (round 2): treat the page as a surface and ripple it with a 2D wave equation. Height + velocity
// buffers live on the full grid; drops perturb the height, the laplacian propagates it, damping decays it. Each
// voxel rides its cell's height (pz) and tints brighter at crests -- the comic page undulates like ink on water.
function waterState(vg) { const n = vg.nx * vg.ny; vg.wh = new Float32Array(n); vg.wv = new Float32Array(n); }
function dropAt(vg, gx, gy, strength) { gx = Math.round(gx); gy = Math.round(gy); if (gx < 1 || gy < 1 || gx >= vg.nx - 1 || gy >= vg.ny - 1) return; const s = strength == null ? 1.2 : strength; const nx = vg.nx; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) vg.wh[(gy + dy) * nx + (gx + dx)] += s * (dx || dy ? 0.5 : 1); }
function updateWater(vg, dt, opts = {}) {
    const nx = vg.nx, ny = vg.ny, h = vg.wh, v = vg.wv, c = opts.c || 12, damp = opts.damp == null ? 0.994 : opts.damp, amp = opts.amp || 0.16;
    const step = Math.min(0.03, dt);
    for (let y = 1; y < ny - 1; y++) for (let x = 1; x < nx - 1; x++) { const i = y * nx + x; v[i] += (h[i - 1] + h[i + 1] + h[i - nx] + h[i + nx] - 4 * h[i]) * c * step; }
    for (let i = 0; i < h.length; i++) { h[i] += v[i] * step; v[i] *= damp; }
    for (const vx of vg.voxels) { const hh = h[vx.gy * nx + vx.gx]; const tint = 1 + hh * 0.5; vx.px = vx.x; vx.py = vx.y; vx.pz = hh * amp; vx.cr = Math.min(1, vx.r * tint); vx.cg = Math.min(1, vx.g * tint); vx.cb = Math.min(1, vx.b * tint); vx.alpha = 1; }
}
function waterEnergy(vg) { let e = 0; for (let i = 0; i < vg.wh.length; i++) e += vg.wh[i] * vg.wh[i] + vg.wv[i] * vg.wv[i]; return e; }

export { waterState, dropAt, updateWater, waterEnergy };

// --- BLOB filter (round 3): the page coalesces into a living blob that REACHES OUT -- a pseudopod extends toward a
// target, probing (a wobble that eases off as it commits), and swarms it, while the body holds as a coalesced mass.
// This is the "tests its environment / reaches to a target" behaviour: reach grows core->target, tendril voxels
// stream along it (jitter + wiggle fading toward the hot tip), body voxels pull into the core.
function blobState(vg, opts = {}) {
    const frac = opts.tendrilFrac == null ? 0.5 : opts.tendrilFrac; let cx = 0, cy = 0;
    for (const v of vg.voxels) { cx += v.x; cy += v.y; } cx /= vg.voxels.length || 1; cy /= vg.voxels.length || 1; vg.core = { x: cx, y: cy };
    vg.voxels.forEach((v, i) => { v.isTendril = _h(i + 1) < frac; v.u = _h(i * 3.7 + 2); v.jx = _h(i * 1.1 + 3) - 0.5; v.jy = _h(i * 2.3 + 4) - 0.5; v.bx = v.x - cx; v.by = v.y - cy; });
}
function updateBlob(vg, t, target, opts = {}) {
    const c = vg.core, reachDur = opts.reachDur || 2.2;
    let reach = Math.min(1, t / reachDur); reach = reach * (1 - 0.12 * Math.sin(t * 3) * (1 - reach));   // probe wobble that fades as it commits
    const dx = target.x - c.x, dy = target.y - c.y, dist = Math.hypot(dx, dy) || 1, nx = dx / dist, ny = dy / dist, ex = -ny, ey = nx;
    for (const v of vg.voxels) {
        if (v.isTendril) {
            const along = reach * v.u, wob = Math.sin(t * 6 + v.u * 10) * 0.02 * (1 - v.u), off = (v.jx * 0.06) * (1 - v.u) + wob;
            v.px = c.x + nx * dist * along + ex * off; v.py = c.y + ny * dist * along + ey * off; v.pz = Math.sin(t * 4 + v.u * 8) * 0.05 * v.u;
            const heat = v.u * reach; v.cr = Math.min(1, v.r * (1 - heat) + (0.9) * heat); v.cg = Math.min(1, v.g * (1 - heat) + 0.95 * heat); v.cb = Math.min(1, v.b * (1 - heat) + 1.0 * heat); v.alpha = 1;
        } else {
            const co = Math.min(0.6, t * 0.5);
            v.px = c.x + v.bx * (1 - co) + v.jx * 0.04 * Math.sin(t * 2 + v.u * 6); v.py = c.y + v.by * (1 - co) + v.jy * 0.04 * Math.cos(t * 2 + v.u * 6); v.pz = 0;
            v.cr = v.r; v.cg = v.g; v.cb = v.b; v.alpha = 1;
        }
    }
    return reach;
}

export { blobState, updateBlob };

// --- PHYSICS filter (round 4): the page is a slab of little rigid bodies. An impact blows them outward, gravity
// pulls them down, and a floor catches them so they pile up and settle -- the page shatters and collapses. This is
// the generalization "any content -> voxels -> a physics filter": lightweight CPU dynamics (impulse + gravity +
// restitution + friction + sleep) that runs everywhere; routing it through the real Jolt backend (backend.js, which
// already owns the destructible path) is the drop-in upgrade for true collisions/constraints. In render space +py is
// down (voxelRender flips it to Y-up), so gravity is +py and the floor is a large py.
function physicsState(vg, opts = {}) {
    vg.phys = { g: opts.g || 2.2, floor: opts.floor || 0.9, rest: opts.rest == null ? 0.32 : opts.rest, fric: opts.fric == null ? 0.84 : opts.fric };
    for (const v of vg.voxels) { v.px = v.x; v.py = v.y; v.pz = 0; v.vx = 0; v.vy = 0; v.vz = 0; v.cr = v.r; v.cg = v.g; v.cb = v.b; v.alpha = 1; v.settled = false; }
}
function impact(vg, point, strength) {
    const s = strength == null ? 1.4 : strength;
    for (const v of vg.voxels) {
        const dx = v.px - point.x, dy = v.py - point.y, dz = v.pz - point.z, d = Math.hypot(dx, dy, dz) + 0.06, e = Math.exp(-d * 1.4), f = s * e / d;
        v.vx += dx * f; v.vy += dy * f - 0.35 * s * e; v.vz += (dz + 0.4) * f; v.settled = false;   // outward, a lift, and a push toward the viewer
    }
}
function updatePhysics(vg, dt) {
    const P = vg.phys, step = Math.min(0.03, dt); let moving = 0;
    for (const v of vg.voxels) {
        if (v.settled) continue; moving++;
        v.vy += P.g * step; v.px += v.vx * step; v.py += v.vy * step; v.pz += v.vz * step;
        if (v.py > P.floor) { v.py = P.floor; if (v.vy > 0) { v.vy = -v.vy * P.rest; v.vx *= P.fric; v.vz *= P.fric; } if (Math.abs(v.vy) < 0.06 && Math.hypot(v.vx, v.vz) < 0.05) { v.settled = true; v.vy = 0; v.vx = 0; v.vz = 0; } }
    }
    return moving;
}

export { physicsState, impact, updatePhysics };

// --- PLASMA filter (round 5): the page becomes a plasma field with lightning arcs that REACH toward targets -- the
// electric cousin of the blob's pseudopod. Each strike builds a jagged arc (midpoint displacement) from a core to a
// target; voxels near an arc glow hot cyan-white and flicker, the rest dim to a faint gas. Arcs re-strike rapidly so
// it crackles. Reaches for the cursor in the reader.
function plasmaState(vg) { let cx = 0, cy = 0; for (const v of vg.voxels) { cx += v.x; cy += v.y; } cx /= vg.voxels.length || 1; cy /= vg.voxels.length || 1; vg.pcore = { x: cx, y: cy }; vg.pArcs = []; vg.pStrike = -1; }
function _arc(ax, ay, bx, by, seed, jit) {
    let pts = [[ax, ay], [bx, by]];
    for (let it = 0; it < 4; it++) { const np = []; for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1]; np.push(a); const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1e-6, nx = -dy / L, ny = dx / L, d = (_h(seed * 7.1 + i * 3.3 + it * 11.7) - 0.5) * jit * L; np.push([mx + nx * d, my + ny * d]); } np.push(pts[pts.length - 1]); pts = np; }
    return pts;
}
function _distSeg(px, py, ax, ay, bx, by) { const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy; let t = L2 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t; const cx = ax + t * dx, cy = ay + t * dy; return Math.hypot(px - cx, py - cy); }
function updatePlasma(vg, t, targets, opts = {}) {
    const core = vg.pcore, rate = opts.strikeRate || 11, jit = opts.jitter || 0.42, glowR = opts.glowR || 0.13, strike = Math.floor(t * rate);
    if (strike !== vg.pStrike) {
        vg.pStrike = strike; const tg = (targets && targets.length) ? targets : [{ x: core.x + 0.8, y: core.y }], arcs = [];
        tg.forEach((T, i) => arcs.push(_arc(core.x, core.y, T.x, T.y, strike * 3.1 + i * 17.3, jit)));
        if (opts.branch !== false) {   // forked side-branches off each main bolt
            const main = arcs.slice();
            for (const arc of main) { const nb = 1 + ((_h(strike + arc.length) * 2) | 0); for (let b = 0; b < nb; b++) { const j = 1 + Math.floor(_h(strike * 5 + b * 3.1 + arc.length) * (arc.length - 2)), s0 = arc[j], ang = _h(strike * 2.3 + b * 7.7 + arc.length) * 6.2831853, len = 0.14 + _h(strike + b * 1.7) * 0.22; arcs.push(_arc(s0[0], s0[1], s0[0] + Math.cos(ang) * len, s0[1] + Math.sin(ang) * len, strike * 13 + b * 4.4 + arc.length, jit * 1.3)); } }
        }
        vg.pArcs = arcs;
    }
    const flick = 0.65 + 0.35 * Math.sin(t * 42);
    for (const v of vg.voxels) {
        let md = 1e9; for (const arc of vg.pArcs) for (let i = 0; i < arc.length - 1; i++) { const d = _distSeg(v.x, v.y, arc[i][0], arc[i][1], arc[i + 1][0], arc[i + 1][1]); if (d < md) md = d; }
        const glow = Math.max(0, 1 - md / glowR), e = glow * glow * flick;
        v.px = v.x; v.py = v.y; v.pz = e * 0.1;
        v.cr = Math.min(1, v.r * 0.25 + e * 0.7); v.cg = Math.min(1, v.g * 0.25 + e * 0.95); v.cb = Math.min(1, v.b * 0.3 + e * 1.0); v.alpha = 1;
    }
}

export { plasmaState, updatePlasma };
