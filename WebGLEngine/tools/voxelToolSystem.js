// FILE: tools/voxelToolSystem.js
// VERSION: v2 - SPHERICAL FALLOFF SCULPTING

export class VoxelToolSystem {

    constructor(world, dispatcher) {

        this.world = world;
        this.dispatcher = dispatcher;

        this.tool = "paint";     // paint | erase
        this.shape = "sphere";
        this.radius = 3;

        // threshold determines how "strong" voxel must be to exist
        this.threshold = 0.5;
    }

    setTool(tool) { this.tool = tool; }
    setShape(shape) { this.shape = shape; }
    setRadius(r) { this.radius = Math.max(1, r); }

    // ============================================================
    // MAIN ENTRY
    // ============================================================
    apply(x, y, z) {

        if (this.shape === "sphere") {
            this.applySphereFalloff(x, y, z);
        }
    }

    // ============================================================
    // SPHERE WITH SMOOTH FALLBACK
    // ============================================================
    applySphereFalloff(x, y, z) {

        const r = this.radius;
        const r2 = r * r;

        for (let dx = -r; dx <= r; dx++) {
            for (let dy = -r; dy <= r; dy++) {
                for (let dz = -r; dz <= r; dz++) {

                    const dist2 = dx*dx + dy*dy + dz*dz;

                    if (dist2 > r2) continue;

                    const dist = Math.sqrt(dist2);

                    // ====================================================
                    // FALLOFF CURVE (CORE OF SMOOTH SCULPTING)
                    // ====================================================
                    let strength = 1 - (dist / r);

                    // sharpen curve slightly (feels more natural)
                    strength = strength * strength;

                    this.applyVoxel(
                        x + dx,
                        y + dy,
                        z + dz,
                        strength
                    );
                }
            }
        }
    }

    // ============================================================
    // VOXEL APPLICATION LOGIC
    // ============================================================
    applyVoxel(x, y, z, strength) {

        const existing = this.world.voxelAt(x, y, z);

        let value = existing;

        if (this.tool === "paint") {

            // additive terrain sculpting
            if (strength > this.threshold) {
                value = 1;
            }

        } else if (this.tool === "erase") {

            // carve based on strength
            if (strength > this.threshold) {
                value = 0;
            }
        }

        if (value !== existing) {
            this.world.setVoxel(x, y, z, value);

            const cx = Math.floor(x / this.world.chunkSize);
            const cz = Math.floor(z / this.world.chunkSize);

            this.dispatcher.forceRebuildChunk(cx, cz);
        }
    }
}