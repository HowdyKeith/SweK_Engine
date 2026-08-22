// FILE: simulation/Thunderstorm.js
// VERSION: v1 — lightning ground strikes for the storm weather state
//
// The `storm` weather already does screen-flashes; this adds STRIKES that touch
// the ground and leave a mark. A strike chars the top voxel it hits to ASH
// (scorch) — water and lava are left alone. Lightning favours high ground, so a
// strike point is the tallest column among a few random nearby samples.
// The bolt/spark visuals are spawned by the driver via gpuParticles.

import { VOXEL } from "../world/voxelFormat.js";

function _maxY(world) { return world.chunks?.values?.().next?.().value?.height ?? 64; }

// Strike a column: char its top voxel to ASH (skip water/lava). Returns the hit point.
export function lightningStrike(world, x, z, { char = true } = {}) {
    x = Math.round(x); z = Math.round(z);
    if (!world.getChunk(x, z)) return null;
    const maxY = _maxY(world);
    for (let y = maxY - 1; y >= 1; y--) {
        const v = world.voxelAt(x, y, z);
        if (v === VOXEL.AIR) continue;
        if (char && v !== VOXEL.WATER && v !== VOXEL.FLOWING_WATER && v !== VOXEL.LAVA && v !== VOXEL.ASH) {
            world.setVoxel(x, y, z, VOXEL.ASH);
        }
        return { x, y, z, hit: v };
    }
    return null;
}

// Lightning favours high ground: sample a few points near (cx,cz), strike the tallest.
export function pickStrike(world, cx, cz, radius = 30, samples = 6) {
    let best = null, bestY = -1;
    const maxY = _maxY(world);
    for (let i = 0; i < samples; i++) {
        const x = Math.round(cx + (Math.random() * 2 - 1) * radius);
        const z = Math.round(cz + (Math.random() * 2 - 1) * radius);
        if (!world.getChunk(x, z)) continue;
        for (let y = maxY - 1; y >= 1; y--) {
            if (world.voxelAt(x, y, z) !== VOXEL.AIR) { if (y > bestY) { bestY = y; best = { x, z }; } break; }
        }
    }
    return best;
}
