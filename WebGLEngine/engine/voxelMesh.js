// FILE: voxel.mesh.js

export const FACE_VERTS = {
    top:    [0,1,0, 1,1,0, 1,1,1, 0,1,1],
    bottom: [0,0,0, 0,0,1, 1,0,1, 1,0,0],
    north:  [0,0,0, 1,0,0, 1,1,0, 0,1,0],
    south:  [0,0,1, 0,1,1, 1,1,1, 1,0,1],
    west:   [0,0,0, 0,1,0, 0,1,1, 0,0,1],
    east:   [1,0,0, 1,0,1, 1,1,1, 1,1,0]
};

export const FACE_NORMALS = {
    top:    [0,1,0],
    bottom: [0,-1,0],
    north:  [0,0,-1],
    south:  [0,0,1],
    west:   [-1,0,0],
    east:   [1,0,0]
};

export function createMesh() {
    return {
        positions: [],
        normals: [],
        uvs: [],
        indices: []
    };
}

export function addFace(mesh, x, y, z, face) {
    const i = mesh.positions.length / 3;

    const v = FACE_VERTS[face];
    const n = FACE_NORMALS[face];

    // positions
    mesh.positions.push(
        x+v[0], y+v[1], z+v[2],
        x+v[3], y+v[4], z+v[5],
        x+v[6], y+v[7], z+v[8],
        x+v[9], y+v[10], z+v[11]
    );

    // indices
    mesh.indices.push(
        i, i+1, i+2,
        i, i+2, i+3
    );

    // normals (correct 4x)
    for (let k=0;k<4;k++) {
        mesh.normals.push(n[0], n[1], n[2]);
    }

    // UVs (FIXED — no duplication bug)
    mesh.uvs.push(
        0,0,
        1,0,
        1,1,
        0,1
    );
}