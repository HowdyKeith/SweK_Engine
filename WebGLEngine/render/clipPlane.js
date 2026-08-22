// FILE: render/clipPlane.js
// VERSION: v1 - PORTAL CLIP PLANE SYSTEM

export class ClipPlane {

    constructor(nx = 0, ny = 0, nz = 1, d = 0) {

        this.normal = { x: nx, y: ny, z: nz };
        this.d = d;
    }

    // ------------------------------------------------------------
    // APPLY TO SHADER (vec4 clip plane)
    // ------------------------------------------------------------
    toVec4() {
        return new Float32Array([
            this.normal.x,
            this.normal.y,
            this.normal.z,
            this.d
        ]);
    }

    // ------------------------------------------------------------
    // FROM PORTAL SURFACE
    // ------------------------------------------------------------
    static fromPortalSurface(point, normal) {

        const d =
            -(normal.x * point.x +
              normal.y * point.y +
              normal.z * point.z);

        return new ClipPlane(normal.x, normal.y, normal.z, d);
    }
}