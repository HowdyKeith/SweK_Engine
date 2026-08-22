// FILE: mesh/greedyMesher.js
// VERSION: v1 - BASIC 2.5D GREEDY VOXEL MESHER

export function buildGreedyMesh(chunk, size, height) {

    const voxels = chunk.voxels;

    const quads = [];

    const visited = new Uint8Array(voxels.length);

    const index = (x, y, z) =>
        x + size * (z + size * y);

    // ============================================================
    // ONLY XZ PLANE MERGING (FASTEST SAFE WIN FIRST)
    // ============================================================
    for (let y = 0; y < height; y++) {

        for (let z = 0; z < size; z++) {

            for (let x = 0; x < size; x++) {

                const i = index(x, y, z);

                if (visited[i]) continue;
                if (!voxels[i]) continue;

                // start quad
                let w = 1;

                // expand X
                while (
                    x + w < size &&
                    voxels[index(x + w, y, z)] &&
                    !visited[index(x + w, y, z)]
                ) {
                    w++;
                }

                let h = 1;

                // expand Z
                let expand = true;

                while (expand && z + h < size) {

                    for (let k = 0; k < w; k++) {

                        const idx = index(x + k, y, z + h);

                        if (!voxels[idx] || visited[idx]) {
                            expand = false;
                            break;
                        }
                    }

                    if (expand) h++;
                }

                // mark visited
                for (let dz = 0; dz < h; dz++) {
                    for (let dx = 0; dx < w; dx++) {
                        visited[index(x + dx, y, z + dz)] = 1;
                    }
                }

                // push quad
                quads.push({
                    x, y, z,
                    w, h,
                    normal: { x: 0, y: 1, z: 0 } // top-face simplification
                });
            }
        }
    }

    return quads;
}