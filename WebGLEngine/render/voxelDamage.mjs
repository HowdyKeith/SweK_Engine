// WebGLEngine/render/voxelDamage.mjs -- v4520 (Sandbox on the device, round 4: weapons and damage)
//
// *** THE SANDBOX'S DAMAGE, ON THE DEVICE WORLD, THROUGH THE SANDBOX'S OWN CODE. *** world/CityGen.js gives every building hit
// points (one per voxel), crumble passes at 75 / 50 / 25 % and a topple at zero, and writes all of it straight into the world with
// world.setVoxel; world/voxelDebrisSystem.js bursts six cubes out of a broken voxel. Neither knows about round 2's slots. What
// they DO leave behind is the chunk's dirty flag (world/chunk.js sets it on every write), so this module's first function is
//
//   syncDirty(state)                every chunk the world marked dirty, plus its eight neighbours (a seam face and the corner AO
//                                   read the neighbour), re-meshed into its slot through round 2's remeshChunks -- so ANY writer,
//                                   CityGen's topple included, reaches the device without knowing how.
//   carveSphere(world, c, r)        the sandbox's blast shape: every voxel whose centre lies within r of c becomes air; the
//                                   removed voxels (with their ids) come back for the debris and the damage.
//   blastAt(state, ctx, c, r)       carve, burst debris for every solid voxel removed (ctx.debris), charge every CityGen building
//                                   the voxels it lost (ctx.city.damageAt, the sandbox's own crumble and topple), then syncDirty.
//   shootAt(state, ctx, o, d, opts) the weapon: a ray through the voxels (round 1's DDA) and a blast where it lands.
//   debrisRecords(debris, cap)      the debris particles as gpuDriven records (x, y, z, scale) with the colour in the extras
//   debrisLitPipelineDesc()         litSphere's lit shader with the colour read from `extra` instead of the mesh, both languages
//   damageScene(device, state, bw, debris, G, L)   the fleets: the world's slots, the crates (round 3, optional), the debris
//
// Not claimed: the sandbox's kaiju, its FPS shooter and the dungeon kit's grenade (their pages, not this one); debris that
// collides (the sandbox's does not either); a topple as rigid bodies (kaijuBox3d's, opt-in there, not here).
"use strict";
import { remeshChunks } from "./voxelDeviceEdit.mjs";
import { raycastVoxels, SUN } from "./voxelDevice.mjs";
import { litBind, litWgsl, litVertexGlsl, litFragmentGlsl, litPipelineDesc } from "./litSphere.mjs";
import { boxMesh } from "./buildingLab.mjs";
import { bodyLitPipelineDesc } from "./voxelBodies.mjs";

export const DAMAGE = Object.freeze({ radius: 1.5, maxDist: 400, debrisCap: 400, park: [0, -500, 0] });

/** the dirty chunks plus their neighbours, re-meshed; { chunks, dirty, rebuilt, ms } */
export function syncDirty(state, { neighbours = true } = {}) {
    const { world } = state, dirty = [], keys = new Set();
    for (const c of world.chunks.values()) if (c.dirty) dirty.push(c);
    for (const c of dirty) for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { if (!neighbours && (dx || dz)) continue; const k = (c.cx + dx) + "," + (c.cz + dz); if (world.chunks.has(k)) keys.add(k); }
    if (!keys.size) return { chunks: [], dirty: 0, rebuilt: false, ms: 0 };
    const r = remeshChunks(state, [...keys]);
    for (const c of dirty) c.dirty = false;
    return { ...r, dirty: dirty.length };
}

/** every voxel whose CENTRE lies within r of c becomes air; returns the removed solid voxels */
export function carveSphere(world, c, r) {
    const removed = [], r2 = r * r;
    for (let y = Math.max(0, Math.floor(c[1] - r)); y <= Math.min(world.chunkHeight - 1, Math.floor(c[1] + r)); y++)
        for (let z = Math.floor(c[2] - r); z <= Math.floor(c[2] + r); z++) for (let x = Math.floor(c[0] - r); x <= Math.floor(c[0] + r); x++) {
            const dx = x + 0.5 - c[0], dy = y + 0.5 - c[1], dz = z + 0.5 - c[2]; if (dx * dx + dy * dy + dz * dz > r2) continue;
            const id = world.voxelAt(x, y, z); if (!id) continue;
            world.setVoxel(x, y, z, 0); removed.push({ x, y, z, id });
        }
    return removed;
}

/** the blast: carve, debris, the buildings charged what they lost, the device synced */
export function blastAt(state, ctx = {}, c, r = DAMAGE.radius) {
    const t0 = Date.now(), { world } = state, removed = carveSphere(world, c, r), buildings = [];
    if (ctx.debris) for (const v of removed) ctx.debris.spawn(v.x, v.y, v.z, v.id);
    if (ctx.city) {
        const lost = new Map();
        for (const v of removed) { const b = ctx.city.buildingAt(v.x, v.z); if (b && v.y >= (ctx.groundY ?? 0)) lost.set(b, (lost.get(b) || 0) + 1); }
        for (const [b, n] of lost) { const res = ctx.city.damageAt(b.x + b.w / 2, b.z + b.d / 2, n, { x: b.x + b.w / 2 - c[0], z: b.z + b.d / 2 - c[2] }); buildings.push({ building: b, lost: n, hp: b.hp, maxHp: b.maxHp, state: b.state, crumbled: !!(res && res.crumbled), toppled: !!(res && res.toppled) }); }
    }
    const sync = syncDirty(state);
    return { removed, debris: ctx.debris ? removed.length * 6 : 0, buildings, sync, ms: Date.now() - t0 };
}

/** the weapon: a ray through the voxels and a blast where it lands */
export function shootAt(state, ctx, origin, dir, { radius = DAMAGE.radius, maxDist = DAMAGE.maxDist } = {}) {
    const hit = raycastVoxels(state.world, origin, dir, maxDist);
    if (!hit) return { hit: null, removed: [], debris: 0, buildings: [], sync: { chunks: [] }, ms: 0 };
    return { hit, ...blastAt(state, ctx, [hit.x + 0.5, hit.y + 0.5, hit.z + 0.5], radius) };
}

/** the debris particles as records and colour extras, parked past the live count */
export function debrisRecords(debris, cap = DAMAGE.debrisCap) {
    const rec = new Float32Array(cap * 4), ext = new Float32Array(cap * 4), d = debris.getInstanceData(), n = Math.min(cap, d.count);
    for (let i = 0; i < cap; i++) { rec[i * 4 + 1] = DAMAGE.park[1]; rec[i * 4 + 3] = 0.01; ext[i * 4 + 3] = 1; }
    for (let i = 0; i < n; i++) { const o = i * 7; rec[i * 4] = d.data[o]; rec[i * 4 + 1] = d.data[o + 1]; rec[i * 4 + 2] = d.data[o + 2]; rec[i * 4 + 3] = d.data[o + 3]; ext[i * 4] = d.data[o + 4]; ext[i * 4 + 1] = d.data[o + 5]; ext[i * 4 + 2] = d.data[o + 6]; ext[i * 4 + 3] = 1; }
    return { records: rec, extras: ext, count: n };
}

// ---- the debris pipeline: litSphere's lit shader in its "colour" mode (the instance's colour in extra.rgb) ------------------------
export const DEBRIS_LIT_WGSL = litWgsl(null, { extra: "colour" }), DEBRIS_LIT_VERTEX_GLSL = litVertexGlsl({ extra: "colour" }), DEBRIS_LIT_FRAGMENT_GLSL = litFragmentGlsl(null, { extra: "colour" });
export function debrisLitPipelineDesc({ cull = null } = {}) { return litPipelineDesc({ cull, extra: "colour" }); }

/** the fleets: the world (record 0), the crates (bw, optional), the debris; records and extras assembled each frame */
export function damageScene(device, state, bw, debris, G, L, { light = SUN, cap = DAMAGE.debrisCap, bodyColour = [0.85, 0.25, 0.2, 1] } = {}) {
    const nb = bw ? bw.count() : 0, count = 1 + nb + cap, fleetOf = new Uint32Array(count);
    for (let i = 1; i <= nb; i++) fleetOf[i] = 1; for (let i = 1 + nb; i < count; i++) fleetOf[i] = bw ? 2 : 1;
    const rec = new Float32Array(count * 4), ext = new Float32Array(count * 4); rec[3] = 1;
    const fill = () => { if (bw) { rec.set(bw.records(), 4); ext.set(bw.extras(), 4); } const d = debrisRecords(debris, cap); rec.set(d.records, (1 + nb) * 4); ext.set(d.extras, (1 + nb) * 4); };
    // *** ON WEBGPU A { count, cpu } SOURCE IS UPLOADED ONCE *** (gpuDriven's Level 12 contract: a moving source brings a `buffer`); the
    // first draft's debris, born parked, never appeared on WebGPU while WebGL2's twin route drew it. The scene owns the storage buffer
    // and writes it on every frame's extras read, which both paths make.
    fill(); const buffer = device.backend === "webgpu" ? device.buffer({ data: rec, usage: "storage" }) : null;   // WebGL2 has no storage buffers and culls from cpu()
    const records = { count, cpu: () => { fill(); return rec; }, ...(buffer ? { buffer } : {}) }, headings = { cpu: () => { fill(); if (buffer) buffer.write(rec); return ext; } };
    const fleets = [{ name: "world", lods: [{ name: "only", mesh: state.mesh }], layout: G.LAYOUTS.lit, pipeline: L.litPipelineDesc({ cull: "none" }), bind: L.litBind(light) }];
    if (bw) fleets.push({ name: "bodies", lods: [{ name: "only", mesh: boxMesh(bodyColour) }], layout: G.LAYOUTS.lit, pipeline: bodyLitPipelineDesc(), bind: litBind(light) });
    fleets.push({ name: "debris", lods: [{ name: "only", mesh: boxMesh([1, 1, 1, 1]) }], layout: G.LAYOUTS.lit, pipeline: debrisLitPipelineDesc(), bind: litBind(light) });
    const sc = G.makeGpuDrivenScene(device, { fleets, fleetOf, thresholds: [], records, headings });
    state.vbuf = sc.fleets[0].vbuf; state.scene = sc;
    return sc;
}
