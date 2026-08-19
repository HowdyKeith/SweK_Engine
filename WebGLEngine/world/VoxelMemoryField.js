// FILE: world/VoxelMemoryField.js
// VERSION: v3 - VALUE-AWARE ADAPTER + ORIGINAL STRENGTH/DECAY
//
// Original purpose: "temporal intelligence layer" tracking strength + age
// per voxel cell, used by civilization scanners to detect emergent
// patterns (write/get/queryNear/tick/_applyDecay all unchanged).
//
// New in v3: set(x,y,z, value, source) + get returns entry that includes
// `value` and `source` fields. This bridges the contract VoxelSignalBus
// expects (memory.set, memory.get with .value) to the existing strength-
// based store. Each set() also bumps strength by 1 so the decay/cleanup
// logic still ages out signals naturally.

export class VoxelMemoryField {
    constructor(world, opts = {}) {
        this.world = world;

        // key: "x,y,z" -> { x, y, z, strength, first, last, value?, source? }
        this.memory = new Map();

        this._externalDecayRate = null;
        this.time = 0;

        // Optional GPU mirror — every write also pushes to the GPU heatmap.
        // CPU stays canonical (queryNear/get use the Map). Mirror is
        // visualization-only.
        this.mirror = opts.mirror || null;
    }

    // --- ORIGINAL API (strength-based) -----------------------------

    write(x, y, z, strength = 1) {
        const key = this._key(x, y, z);
        const existing = this.memory.get(key);
        const now = this.time;

        if (existing) {
            existing.strength += strength;
            existing.last = now;
        } else {
            this.memory.set(key, {
                x, y, z,
                strength,
                first: now,
                last: now,
            });
        }

        // Forward to GPU heatmap if attached.
        if (this.mirror) this.mirror.write(x, y, z, strength, now);
    }

    queryNear(cx, cy, cz, radius = 5) {
        const r2 = radius * radius;
        const out = [];
        for (const mem of this.memory.values()) {
            const dx = mem.x - cx, dy = mem.y - cy, dz = mem.z - cz;
            if (dx*dx + dy*dy + dz*dz <= r2) out.push(mem);
        }
        return out;
    }

    tick(deltaTime = 1) {
        this.time += deltaTime;
        this._applyDecay(deltaTime);
    }

    _applyDecay(dt) {
        const decayRate = this._externalDecayRate ?? 0.00001;
        for (const [key, mem] of this.memory) {
            const age = this.time - mem.last;
            mem.strength -= age * decayRate * dt;
            if (mem.strength <= 0) this.memory.delete(key);
        }
    }

    setDecayRate(rate)  { this._externalDecayRate = rate; }
    resetDecayRate()    { this._externalDecayRate = null; }

    // --- VALUE-AWARE ADAPTER (bridges VoxelSignalBus contract) -----

    // Stores a signal value at the given cell. Used by VoxelSignalBus.emit().
    set(x, y, z, value, source = "ai") {
        // Reuse write() so strength + age fields stay consistent.
        this.write(x, y, z, 1);
        const entry = this.memory.get(this._key(x, y, z));
        if (entry) {
            entry.value = value;
            entry.source = source;
        }
    }

    // Returns the entry (with value/source if set), or null.
    get(x, y, z) {
        return this.memory.get(this._key(x, y, z)) || null;
    }

    // --- UTIL -----------------------------------------------------

    _key(x, y, z) { return `${x},${y},${z}`; }
    size()        { return this.memory.size; }
    snapshot()    { return { size: this.memory.size, time: this.time }; }
}
