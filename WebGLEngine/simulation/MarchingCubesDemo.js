// FILE: simulation/MarchingCubesDemo.js
// VERSION: v1 — round 322
//
// Visual demos for the Marching Cubes algorithm. Each demo:
//   1. Builds a 3D scalar field (sphere, metaballs, gyroid)
//   2. Marches it into a triangle mesh
//   3. Converts to OBJ text
//   4. Loads it via assetLoader._loadOBJFromText (in-memory path —
//      no bridge save, no disk round-trip)
//   5. Caches under a distinct name and spawns an entity
//
// Console:
//   mc.sphere()          — smooth sphere
//   mc.sphere({ res: 32, radius: 12, x, y, z })
//   mc.metaballs()       — three merged spheres → blob shape
//   mc.gyroid()          — triply-periodic minimal surface (organic wavy)
//   mc.list()            — show spawned MC entities
//   mc.clear()           — despawn all
//   mc.stats()           — last-generated mesh stats

import { marchScalarField, meshToOBJ } from "./MarchingCubes.js";

export class MarchingCubesDemo {
    constructor({ router, world, camera, assetLoader }) {
        this.router = router;
        this.world = world;
        this.camera = camera;
        this.assetLoader = assetLoader;
        // Track spawned entities for mc.clear()
        this._spawned = [];   // [{ id, name, kind }]
        this._lastStats = null;
        this._uniqueCounter = 0;
    }

    /**
     * Spawn a smooth sphere at the player's position (or specified).
     * @param {Object} [opts]
     * @param {number} [opts.radius=4]
     * @param {number} [opts.res=24]        grid resolution per axis
     * @param {number} [opts.x] world x — defaults to camera + 20m forward
     * @param {number} [opts.y]
     * @param {number} [opts.z]
     * @returns {Promise<number|null>} spawned entity id
     */
    async sphere(opts = {}) {
        const radius = opts.radius ?? 4;
        const res = opts.res ?? 24;
        const cellSize = (radius * 2.5) / res;   // pad ~25% beyond surface
        const halfExtent = res * cellSize / 2;

        // Field = signed distance to sphere; isovalue 0 extracts surface
        const field = new Float32Array(res * res * res);
        for (let z = 0; z < res; z++) {
            for (let y = 0; y < res; y++) {
                for (let x = 0; x < res; x++) {
                    const wx = (x - res/2) * cellSize;
                    const wy = (y - res/2) * cellSize;
                    const wz = (z - res/2) * cellSize;
                    field[z * res * res + y * res + x] =
                        Math.sqrt(wx*wx + wy*wy + wz*wz) - radius;
                }
            }
        }

        const mesh = marchScalarField(field, res, res, res, 0, {
            origin: [-halfExtent, -halfExtent, -halfExtent],
            cellSize,
        });
        return this._spawnFromMesh(mesh, "mc_sphere", opts);
    }

    /**
     * Spawn merged spherical "metaballs" — multiple soft sphere fields
     * summed, isosurface at threshold = blob/blob fusion shapes.
     */
    async metaballs(opts = {}) {
        const res = opts.res ?? 32;
        const halfExtent = 8;
        const cellSize = (halfExtent * 2) / res;

        // 3 metaball centers + radii in field space
        const centers = opts.centers ?? [
            { x: -2, y:  0, z:  0, r: 3 },
            { x:  2, y:  1, z:  0, r: 3 },
            { x:  0, y: -1, z:  2, r: 2.5 },
        ];

        const field = new Float32Array(res * res * res);
        for (let z = 0; z < res; z++) {
            for (let y = 0; y < res; y++) {
                for (let x = 0; x < res; x++) {
                    const wx = -halfExtent + x * cellSize;
                    const wy = -halfExtent + y * cellSize;
                    const wz = -halfExtent + z * cellSize;
                    // Sum of 1/r² potentials — classic metaball field
                    let sum = 0;
                    for (const c of centers) {
                        const dx = wx - c.x, dy = wy - c.y, dz = wz - c.z;
                        const d2 = dx*dx + dy*dy + dz*dz;
                        sum += (c.r * c.r) / Math.max(d2, 0.01);
                    }
                    // Negate so that "inside" (high density) is < iso
                    field[z * res * res + y * res + x] = 1.0 - sum;
                }
            }
        }
        const mesh = marchScalarField(field, res, res, res, 0, {
            origin: [-halfExtent, -halfExtent, -halfExtent],
            cellSize,
        });
        return this._spawnFromMesh(mesh, "mc_metaballs", opts);
    }

    /**
     * Spawn a gyroid (triply periodic minimal surface).
     * f = sin(x)cos(y) + sin(y)cos(z) + sin(z)cos(x). Iso=0.
     * Visually a 3D mesh of wavy interconnected tunnels.
     */
    async gyroid(opts = {}) {
        const res = opts.res ?? 40;
        const halfExtent = opts.size ?? 6;
        const cellSize = (halfExtent * 2) / res;
        const freq = opts.freq ?? 1.0;

        const field = new Float32Array(res * res * res);
        for (let z = 0; z < res; z++) {
            for (let y = 0; y < res; y++) {
                for (let x = 0; x < res; x++) {
                    const wx = (-halfExtent + x * cellSize) * freq;
                    const wy = (-halfExtent + y * cellSize) * freq;
                    const wz = (-halfExtent + z * cellSize) * freq;
                    field[z * res * res + y * res + x] =
                        Math.sin(wx)*Math.cos(wy) +
                        Math.sin(wy)*Math.cos(wz) +
                        Math.sin(wz)*Math.cos(wx);
                }
            }
        }
        const mesh = marchScalarField(field, res, res, res, 0, {
            origin: [-halfExtent, -halfExtent, -halfExtent],
            cellSize,
        });
        return this._spawnFromMesh(mesh, "mc_gyroid", opts);
    }

    /**
     * Shared spawn path. Registers the mesh under a unique asset name
     * (so re-running the demo doesn't collide with a cached version)
     * and spawns one entity using it.
     */
    async _spawnFromMesh(mesh, baseName, opts) {
        if (mesh.triangleCount === 0) {
            console.warn(`[mc] ${baseName}: empty mesh (isovalue might not cross the field)`);
            return null;
        }
        const objText = meshToOBJ(mesh.positions, mesh.normals);
        const name = `${baseName}_${++this._uniqueCounter}`;

        // In-memory load: parses OBJ, uploads to GPU, no disk save.
        let glMesh;
        try {
            glMesh = this.assetLoader._loadOBJFromText(name, objText);
        } catch (e) {
            console.warn(`[mc] _loadOBJFromText failed: ${e.message}`);
            return null;
        }
        // Cache it so subsequent loadAsset(name) returns this mesh.
        this.assetLoader.cache?.set(name, glMesh);
        this.assetLoader._knownAssets?.add(name);

        // Default spawn position: 15m in front of camera at ground level
        let { x, y, z } = opts;
        if (x == null || y == null || z == null) {
            const cam = this.camera;
            if (cam?.position) {
                // Project ~20m along the camera's forward direction (assume yaw exists)
                const yaw = cam.yaw ?? 0;
                const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
                x = (cam.position.x ?? 0) + fx * 20;
                z = (cam.position.z ?? 0) + fz * 20;
                y = (cam.position.y ?? 10) - 2;
            } else {
                x = 0; y = 8; z = 0;
            }
        }

        const result = this.router.exec({
            type: "entity:spawnMesh",
            assetId: name,
            kind: name,
            x, y, z,
            scale: opts.scale ?? 1,
        });
        const id = result?.id ?? null;
        if (id != null) {
            this._spawned.push({ id, name, kind: baseName });
        }
        this._lastStats = {
            kind: baseName,
            triangles: mesh.triangleCount,
            vertices: mesh.positions.length / 3,
            assetName: name,
            entityId: id,
        };
        console.log(
            `[mc] ${baseName}: ${mesh.triangleCount} triangles, ` +
            `${mesh.positions.length / 3} verts, asset="${name}", entity=${id}`
        );
        return id;
    }

    /** Despawn all MC-spawned entities. */
    clear() {
        let n = 0;
        for (const e of this._spawned) {
            try {
                this.router.exec({ type: "entity:despawn", id: e.id });
                n++;
            } catch {}
        }
        this._spawned.length = 0;
        console.log(`[mc] cleared ${n} entities`);
        return n;
    }

    /** Return active spawn list. */
    list() {
        return [...this._spawned];
    }

    /** Return stats for the last generated mesh. */
    stats() {
        return this._lastStats;
    }
}
