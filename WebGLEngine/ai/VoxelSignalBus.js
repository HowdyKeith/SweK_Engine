// FILE: ai/VoxelSignalBus.js
// VERSION: v2 - MEMORY-INTEGRATED SIGNAL LAYER

export class VoxelSignalBus {

    constructor(world, memoryField) {

        this.world = world;
        this.memory = memoryField;
    }

    emit(x, y, z, value, meta = {}) {

        this.world.setVoxel(x, y, z, value);

        // write into memory layer
        this.memory.set(x, y, z, value, meta.source || "ai");
    }

    sense(x, y, z, radius = 3) {

        const results = [];

        for (let dx = -radius; dx <= radius; dx++) {
            for (let dy = -radius; dy <= radius; dy++) {
                for (let dz = -radius; dz <= radius; dz++) {

                    const mem = this.memory.get(
                        x + dx,
                        y + dy,
                        z + dz
                    );

                    if (mem) results.push(mem);
                }
            }
        }

        return results;
    }
}