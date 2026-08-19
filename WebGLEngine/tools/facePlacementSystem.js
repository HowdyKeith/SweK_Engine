// FILE: tools/facePlacementSystem.js
// VERSION: v1 - FACE-AWARE VOXEL PLACEMENT LOGIC

export class FacePlacementSystem {

    constructor(world) {
        this.world = world;
    }

    // PLACE voxel on correct surface face
    place(hit, value = 1) {

        if (!hit || !hit.hit) return;

        const x = hit.prevX;
        const y = hit.prevY;
        const z = hit.prevZ;

        this.world.setVoxel(x, y, z, value);
    }

    // REMOVE voxel directly
    erase(hit) {

        if (!hit || !hit.hit) return;

        this.world.setVoxel(hit.x, hit.y, hit.z, 0);
    }

    // FUTURE USE (slope tools, sculpting, etc)
    getNormal(hit) {
        return {
            x: hit.normalX,
            y: hit.normalY,
            z: hit.normalZ
        };
    }
}