// ================================
// FILE: /core/greedyMesher.js
// FIXED v1 - Surface Mesh Generator (Correct Voxels)
// ================================

export function greedyMesh(chunk) {

    const size = chunk.size;

    const vertices = [];
    const indices = [];

    function get(x, y, z) {
        if (
            x < 0 || y < 0 || z < 0 ||
            x >= size || y >= size || z >= size
        ) return 0;

        return chunk.get(x, y, z);
    }

    function isSolid(v) {
        return v > 0;
    }

    function pushFace(x, y, z, voxel, dir) {

        const base = vertices.length / 7;

        let v = [];

        // Each face = 4 vertices (pos + normal + voxel id)

        switch (dir) {

            // ================= +X =================
            case "px":
                v = [
                    x + 1, y,     z,
                    x + 1, y + 1, z,
                    x + 1, y + 1, z + 1,
                    x + 1, y,     z + 1,
                ];
                break;

            // ================= -X =================
            case "nx":
                v = [
                    x, y,     z + 1,
                    x, y + 1, z + 1,
                    x, y + 1, z,
                    x, y,     z,
                ];
                break;

            // ================= +Y =================
            case "py":
                v = [
                    x,     y + 1, z,
                    x,     y + 1, z + 1,
                    x + 1, y + 1, z + 1,
                    x + 1, y + 1, z,
                ];
                break;

            // ================= -Y =================
            case "ny":
                v = [
                    x,     y, z + 1,
                    x,     y, z,
                    x + 1, y, z,
                    x + 1, y, z + 1,
                ];
                break;

            // ================= +Z =================
            case "pz":
                v = [
                    x,     y,     z + 1,
                    x + 1, y,     z + 1,
                    x + 1, y + 1, z + 1,
                    x,     y + 1, z + 1,
                ];
                break;

            // ================= -Z =================
            case "nz":
                v = [
                    x + 1, y,     z,
                    x,     y,     z,
                    x,     y + 1, z,
                    x + 1, y + 1, z,
                ];
                break;
        }

        for (let i = 0; i < v.length; i += 3) {
            vertices.push(
                v[i],
                v[i + 1],
                v[i + 2],
                dir === "py" ? 0 : dir === "ny" ? 0 : dir === "px" ? 1 : dir === "nx" ? -1 : 0,
                dir === "py" ? 1 : dir === "ny" ? -1 : 0,
                dir === "pz" ? 1 : dir === "nz" ? -1 : 0,
                voxel
            );
        }

        indices.push(
            base, base + 1, base + 2,
            base, base + 2, base + 3
        );
    }

    for (let y = 0; y < size; y++) {
        for (let z = 0; z < size; z++) {
            for (let x = 0; x < size; x++) {

                const voxel = get(x, y, z);
                if (!isSolid(voxel)) continue;

                // =========================
                // 6-direction exposure check
                // =========================

                if (!isSolid(get(x + 1, y, z))) pushFace(x, y, z, voxel, "px");
                if (!isSolid(get(x - 1, y, z))) pushFace(x, y, z, voxel, "nx");

                if (!isSolid(get(x, y + 1, z))) pushFace(x, y, z, voxel, "py");
                if (!isSolid(get(x, y - 1, z))) pushFace(x, y, z, voxel, "ny");

                if (!isSolid(get(x, y, z + 1))) pushFace(x, y, z, voxel, "pz");
                if (!isSolid(get(x, y, z - 1))) pushFace(x, y, z, voxel, "nz");
            }
        }
    }

    return {
        vertices: new Float32Array(vertices),
        indices: new Uint16Array(indices)
    };
}