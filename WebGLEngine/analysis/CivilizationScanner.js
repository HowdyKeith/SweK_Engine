// FILE: analysis/CivilizationScanner.js
// VERSION: v2 - CIVILIZATION FEEDER (NOT JUST ANALYZER)

export class CivilizationScanner {

    constructor(memoryField) {

        this.memory = memoryField;
    }

    tick(bounds, step = 5) {

        const found = [];

        for (let x = bounds.minX; x < bounds.maxX; x += step) {
            for (let y = bounds.minY; y < bounds.maxY; y += step) {
                for (let z = bounds.minZ; z < bounds.maxZ; z += step) {

                    const cluster = this._analyzeCluster(x, y, z, step);

                    if (cluster.score > 0.6) {

                        found.push(cluster);
                    }
                }
            }
        }

        return found;
    }

    _analyzeCluster(cx, cy, cz, size) {

        let count = 0;
        let strength = 0;

        for (let x = cx; x < cx + size; x++) {
            for (let y = cy; y < cy + size; y++) {
                for (let z = cz; z < cz + size; z++) {

                    const mem = this.memory.get(x, y, z);

                    if (!mem) continue;

                    count++;
                    strength += mem.strength;
                }
            }
        }

        const density = count / (size ** 3);

        const stability = strength / Math.max(count, 1);

        return {
            x: cx,
            y: cy,
            z: cz,
            score: (density + stability) / 2,
            stability
        };
    }
}