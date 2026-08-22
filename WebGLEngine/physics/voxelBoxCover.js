// WebGLEngine/physics/voxelBoxCover.js — v2634
//
// Turn a voxel body into a handful of box3d box colliders -- for FREE, MIT-clean, no collider to port.
//
// greedyMesh3d makes the visible SURFACE (a solid cube -> 6 face quads). Collision needs the opposite: a SOLID
// decomposition of the filled volume into a small set of axis-aligned boxes. box3d already has box-vs-box; hand
// it these boxes and voxel collision falls out.
//
// THE ONE GUARANTEE that makes this sound: the boxes EXACTLY PARTITION the filled voxels -- every filled cell sits
// in exactly one box, and no empty cell is ever inside a box. When that holds, box3d colliding against these boxes
// IS box3d colliding against the voxel body; there is no gap the sim could fall through and no phantom wall.
//
// boxCover(solid, dims):
//   solid : (x, y, z) => boolean   -- same occupancy convention as greedyMesh3d
//   dims  : [sx, sy, sz]
//   -> [ { min:[x,y,z], max:[x,y,z] } ]   inclusive integer voxel-index boxes
//
// A solid NxNxN cube returns ONE box. A 3D checkerboard returns one box per cell (nothing to merge) -- the honest
// limit, exactly as the surface mesher is 1.0x on a checkerboard.

export function boxCover(solid, dims) {
    const [sx, sy, sz] = dims;
    const covered = new Uint8Array(sx * sy * sz);
    const idx = (x, y, z) => x + sx * (y + sy * z);
    const free = (x, y, z) =>
        x >= 0 && y >= 0 && z >= 0 && x < sx && y < sy && z < sz && !!solid(x, y, z) && !covered[idx(x, y, z)];

    const boxes = [];
    for (let z = 0; z < sz; z++) {
        for (let y = 0; y < sy; y++) {
            for (let x = 0; x < sx; x++) {
                if (!free(x, y, z)) continue;

                // grow along x
                let ex = x;
                while (free(ex + 1, y, z)) ex++;

                // grow along y: the whole x-run [x..ex] must be free at the new row
                let ey = y;
                growY: for (;;) {
                    const ny = ey + 1;
                    if (ny >= sy) break;
                    for (let xx = x; xx <= ex; xx++) if (!free(xx, ny, z)) break growY;
                    ey = ny;
                }

                // grow along z: the whole [x..ex] x [y..ey] slab must be free at the new layer
                let ez = z;
                growZ: for (;;) {
                    const nz = ez + 1;
                    if (nz >= sz) break;
                    for (let yy = y; yy <= ey; yy++)
                        for (let xx = x; xx <= ex; xx++) if (!free(xx, yy, nz)) break growZ;
                    ez = nz;
                }

                for (let zz = z; zz <= ez; zz++)
                    for (let yy = y; yy <= ey; yy++)
                        for (let xx = x; xx <= ex; xx++) covered[idx(xx, yy, zz)] = 1;

                boxes.push({ min: [x, y, z], max: [ex, ey, ez] });
            }
        }
    }
    return boxes;
}

// Convert one inclusive voxel-index box to a box3d add-box spec in WORLD units.
// Cell x spans world [x*v, (x+1)*v], so a box [min..max] spans [min*v, (max+1)*v]:
//   half   = (max - min + 1) / 2 * v
//   centre = (min + max + 1) / 2 * v + origin
export function boxToCollider(box, opts = {}) {
    const v = opts.voxelSize || 1;
    const o = opts.origin || [0, 0, 0];
    const half = [0, 1, 2].map((i) => (box.max[i] - box.min[i] + 1) / 2 * v);
    const pos = [0, 1, 2].map((i) => (box.min[i] + box.max[i] + 1) / 2 * v + o[i]);
    return { pos, half };
}

// Add a voxel body to a box3d world as a set of box colliders. `world` is any object with addBox({type,pos,half})
// -- the real box3d world, or a mock/reference in a test. Returns { boxes, handles }.
export function addVoxelBody(world, solid, dims, opts = {}) {
    const type = opts.type || "static";
    const boxes = boxCover(solid, dims);
    const handles = boxes.map((b) => {
        const c = boxToCollider(b, opts);
        return world.addBox({ type, pos: c.pos, half: c.half });
    });
    return { boxes, handles };
}
