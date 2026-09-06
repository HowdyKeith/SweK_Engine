// WebGLEngine/render/slugShatter.mjs -- v4503
//
// *** A TICKER GLYPH SHATTERS INTO RECTANGULAR SHARDS (task 50). *** The task 43 body is one box carrying one glyph quad;
// here its em box is cut into nx x ny cells and each cell becomes a SMALLER box3d box carrying the glyph's SUB-RECTANGLE --
// a quad whose texcoords are the cell's corners in em and whose positions are the cell centred at its own body's origin,
// written in text/slugShader.js's vertex layout with the glyph's atlas words (loc, flags, band transform) unchanged. Slug
// evaluates coverage from the texcoord, so a quad that spans a quarter of the em box draws that quarter of the glyph and
// nothing else; nothing in the shader changes. At the shatter the shards spawn where the cells were -- the body's position
// plus its rotation applied to each cell's offset -- inherit the body's velocity, and burst the way world/voxelDebrisSystem.js
// bursts its six cubes (outward from the centre, upward, a spin), from a seeded generator so a run is deterministic under
// stateHash. box3d bodies cannot be removed, so shards live in a POOL: a dead shard is parked static far below the floor
// and reused by the next shatter; the shattered glyph is parked the same way and returns at the near end when its shards die.
"use strict";
import { VERTEX_STRIDE } from "../text/slugShader.js";
import { packGlyphLoc, packGlyphFlags } from "../text/slugAtlas.js";
import { mat4 } from "./slugTicker.mjs";

export const SHATTER = Object.freeze({
    nx: 3, ny: 3,                     // cells across and up (the sabotage-proof default: nine shards)
    life: 90,                         // ticks a shard flies before it is parked
    burst: Object.freeze({ out: [0.6, 1.4], up: [2.0, 3.5], spin: [1, 4] }),   // world units a second (a rise of 0.2 to 0.6 under 9.8), radians a second
    park: -60,                        // y where dead shards and the shattered glyph wait
});

/** the cells of a rectangle: nx across, ny up, each { x0, y0, x1, y1, i, j }, left to right then bottom to top */
export function splitRect(bb, nx = SHATTER.nx, ny = SHATTER.ny) {
    const out = [], w = (bb.x1 - bb.x0) / nx, h = (bb.y1 - bb.y0) / ny;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) out.push({ x0: bb.x0 + i * w, y0: bb.y0 + j * h, x1: i === nx - 1 ? bb.x1 : bb.x0 + (i + 1) * w, y1: j === ny - 1 ? bb.y1 : bb.y0 + (j + 1) * h, i, j });
    return out;
}

/**
 * One shard's vertex stream: a quad for `cell` (em) of the glyph `e`, its positions the cell scaled by `size` and CENTRED on
 * the origin (the shard's body places it), its texcoords the cell's corners, the atlas words the glyph's. buildVertices'
 * layout, corner for corner; the corner normals are the outward diagonals SlugDilate expands along.
 */
export function shardStream(e, cell, size, color = [1, 1, 1, 1]) {
    const buffer = new ArrayBuffer(4 * VERTEX_STRIDE), f32 = new Float32Array(buffer), u32 = new Uint32Array(buffer), F = VERTEX_STRIDE / 4;
    const loc = packGlyphLoc(e.loc[0], e.loc[1]), flags = packGlyphFlags(e.bandMax[0], e.bandMax[1], false), invS = 1 / size;
    const cx = (cell.x0 + cell.x1) / 2, cy = (cell.y0 + cell.y1) / 2;
    const corners = [[cell.x0, cell.y0, -1, -1], [cell.x1, cell.y0, 1, -1], [cell.x1, cell.y1, 1, 1], [cell.x0, cell.y1, -1, 1]];
    corners.forEach(([ex, ey, nx, ny], v) => { const o = v * F;
        f32[o] = (ex - cx) * size; f32[o + 1] = (ey - cy) * size; f32[o + 2] = nx; f32[o + 3] = ny;
        f32[o + 4] = ex; f32[o + 5] = ey; u32[o + 6] = loc; u32[o + 7] = flags;
        f32[o + 8] = invS; f32[o + 9] = 0; f32[o + 10] = 0; f32[o + 11] = invS;
        f32[o + 12] = e.transform[0]; f32[o + 13] = e.transform[1]; f32[o + 14] = e.transform[2]; f32[o + 15] = e.transform[3];
        f32[o + 16] = color[0]; f32[o + 17] = color[1]; f32[o + 18] = color[2]; f32[o + 19] = color[3]; });
    return { buffer, indices: new Uint32Array([0, 1, 2, 0, 2, 3]), vertexCount: 4, quadCount: 1 };
}

/**
 * The plan for one glyph body: its cells, each with half extents (the cell's halves at `size`, the body's depth), its offset
 * from the body's centre (world units, the body's frame), and its stream. `body` is a glyphBodies record; `e` its entry.
 */
export function shardPlan(body, e, size, depth, opts = {}) {
    const bb = e.bbox, ccx = (bb.x0 + bb.x1) / 2, ccy = (bb.y0 + bb.y1) / 2;
    return splitRect(bb, opts.nx || SHATTER.nx, opts.ny || SHATTER.ny).map((cell) => ({
        cell, half: [(cell.x1 - cell.x0) / 2 * size, (cell.y1 - cell.y0) / 2 * size, depth],
        offset: [((cell.x0 + cell.x1) / 2 - ccx) * size, ((cell.y0 + cell.y1) / 2 - ccy) * size, 0],
        built: shardStream(e, cell, size, opts.color),
    }));
}

/** a small deterministic generator (mulberry32) so a shatter is the same on every run */
export function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** a body-frame offset carried to the world: p + R(q) offset */
export function placeOffset(p, q, offset) { const M = mat4.fromPosQuat(p, q); const w = mat4.apply(M, [offset[0], offset[1], offset[2], 1]); return [w[0], w[1], w[2]]; }

/** the shard pool over a world: bodies made once and reused; { take(half) -> idx, give(idx), live: Set, made } */
export function createPool(world) {
    const free = [], live = new Set(); let made = 0;
    return {
        get made() { return made; }, live, free,
        take(half) {
            let i = free.pop();
            if (i == null) { i = world.addBox({ type: "dynamic", pos: [0, SHATTER.park, 0], half, density: 1 }); made++; }
            live.add(i); return i;
        },
        give(i) { world.setType(i, "static"); world.setVelocity(i, [0, 0, 0]); world.setTransform(i, [0, SHATTER.park, 0], [0, 0, 0, 1]); live.delete(i); free.push(i); },
    };
}

/**
 * Shatter glyph body `k` now: its shards spawn where its cells are, inherit its velocity, and burst; the glyph itself is parked.
 * `xf` and `vel` are the world's transforms and velocities this tick. Returns the record tickShatter drives.
 */
export function shatterBody(world, pool, k, id, plan, xf, vel, tick, opts = {}) {
    const o = id * 7, p = [xf[o], xf[o + 1], xf[o + 2]], q = [xf[o + 3], xf[o + 4], xf[o + 5], xf[o + 6]], v = [vel[id * 3], vel[id * 3 + 1], vel[id * 3 + 2]];
    const R = rng((opts.seed != null ? opts.seed : 7) * 1000003 + tick * 131 + k), B = { ...SHATTER.burst, ...(opts.burst || {}) };
    const shards = plan.map((s) => {
        const idx = pool.take(s.half);
        // a pooled box keeps its first shape: half extents are per body, so a reused body may be a little off its cell -- recorded here
        const pos = placeOffset(p, q, s.offset);
        world.setType(idx, "dynamic"); world.setTransform(idx, pos, q); world.setVelocity(idx, v);
        const mass = 8 * s.half[0] * s.half[1] * s.half[2];   // density 1
        const n = Math.hypot(s.offset[0], s.offset[1]) || 1, dir = n > 1e-9 && (s.offset[0] || s.offset[1]) ? [s.offset[0] / n, s.offset[1] / n] : [Math.cos(R() * 6.283), Math.sin(R() * 6.283)];
        const out = B.out[0] + R() * (B.out[1] - B.out[0]), up = B.up[0] + R() * (B.up[1] - B.up[0]), zk = (R() - 0.5) * out;
        const dv = placeOffset([0, 0, 0], q, [dir[0] * out, dir[1] * out, zk]);   // the burst in the body's frame, carried to the world
        world.impulse(idx, [dv[0] * mass, (dv[1] + up) * mass, dv[2] * mass]);
        const spin = B.spin[0] + R() * (B.spin[1] - B.spin[0]), ax = [R() - 0.5, R() - 0.5, R() - 0.5], an = Math.hypot(...ax) || 1;
        const I = mass * (s.half[0] * s.half[0] + s.half[1] * s.half[1]) / 3;   // a box's inertia about its centre, roughly: enough for a spin
        world.angularImpulse(idx, ax.map((c) => c / an * spin * I));
        return { idx, cell: s.cell, built: s.built, half: s.half };
    });
    world.setType(id, "static"); world.setVelocity(id, [0, 0, 0]); world.setTransform(id, [0, SHATTER.park - 1 - k, 0], [0, 0, 0, 1]);
    return { body: k, id, born: tick, shards, spawn: opts.spawn || null };
}

/**
 * One tick of the shatters: a shatter older than `life` parks its shards and puts its glyph back at the near end of the conveyor
 * (dynamic, at the ticker's drop height and speed). Returns the records still flying.
 */
export function tickShatter(world, pool, shatters, tick, plan, life = SHATTER.life) {
    const keep = [];
    for (const s of shatters) {
        if (tick - s.born < life) { keep.push(s); continue; }
        for (const sh of s.shards) pool.give(sh.idx);
        const spawn = s.spawn || [-plan.lane, plan.dropHeight, 0];
        world.setType(s.id, "dynamic"); world.setTransform(s.id, spawn, [0, 0, 0, 1]); world.setVelocity(s.id, [plan.speed, 0, 0]);
    }
    return keep;
}

/** the body nearest the conveyor's centre (x = 0) that is not shattered now */
export function nearestBody(xf, ids, busy = new Set()) { let best = -1, bd = Infinity; ids.forEach((id, k) => { if (busy.has(k)) return; const d = Math.abs(xf[id * 7]); if (d < bd) { bd = d; best = k; } }); return best; }
