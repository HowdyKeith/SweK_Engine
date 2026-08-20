// voxel/rleMesh.js
//
// The payoff of the RLE surface stack (v2769/v2770): turn the face lists into an actual GPU mesh --
// positions / normals / indices -- so the chunk can be drawn. It emits NOTHING new about which faces
// exist; it only wraps geometry around the faces the run walk already found:
//   +-Y faces  -> per-voxel unit quads          (rleSurface.js yFacesFromRLE)
//   +-X/+-Z    -> greedy vertical span quads     (rleSideFaces.js sideFacesFromRLE)
// Each quad is wound so its two triangles face OUTWARD (front-face normal == the declared face normal),
// which is the one thing that can go wrong here and the thing the gate pins: mesh triangle area must
// equal the exposed surface area (a unit per +-Y face, a span's height per side span), and every
// triangle's geometric normal must agree with its declared normal.
//
// Internal faces only -- the chunk's outer walls wait on the neighbour chunk, exactly like the face
// modules this sits on. Browser-safe: imports only sibling voxel modules, no Node builtins.

import { yFacesFromRLE } from "./rleSurface.js";
import { sideFacesFromRLE } from "./rleSideFaces.js";

// Build an indexed triangle mesh from an RLE chunk. isSolid(type)->bool. Returns typed arrays plus counts.
// opts.skipDirs (optional Set of face dirs to omit) exists ONLY so the gate can prove the area invariant is
// load-bearing by sabotaging one face family; production callers never pass it.
export function rleMesh(rle, isSolid, opts = {}) {
    const skip = opts.skipDirs || null;
    const positions = [];
    const normals = [];
    const indices = [];
    let vbase = 0;

    // 4 corners in outward-CCW order + the face normal -> two triangles (0,1,2)(0,2,3).
    const quad = (n, c) => {
        for (let i = 0; i < 4; i++) { positions.push(c[i][0], c[i][1], c[i][2]); normals.push(n[0], n[1], n[2]); }
        indices.push(vbase, vbase + 1, vbase + 2, vbase, vbase + 2, vbase + 3);
        vbase += 4;
    };

    // +-Y unit quads. dir>0: top face of voxel (x,y,z) at plane Y=y+1, normal +Y.
    //                dir<0: bottom face of voxel (x,y,z) at plane Y=y,   normal -Y.
    for (const f of yFacesFromRLE(rle, isSolid)) {
        if (f.dir > 0) {
            if (skip && skip.has("+y")) continue;
            const Y = f.y + 1;
            quad([0, 1, 0], [[f.x, Y, f.z], [f.x, Y, f.z + 1], [f.x + 1, Y, f.z + 1], [f.x + 1, Y, f.z]]);
        } else {
            if (skip && skip.has("-y")) continue;
            const Y = f.y;
            quad([0, -1, 0], [[f.x, Y, f.z], [f.x + 1, Y, f.z], [f.x + 1, Y, f.z + 1], [f.x, Y, f.z + 1]]);
        }
    }

    // +-X / +-Z greedy span quads. A span covers y in [y0, y1); the quad is 1 wide in the other horizontal
    // axis and (y1-y0) tall. Plane sits between the solid voxel and the air it faces.
    for (const s of sideFacesFromRLE(rle, isSolid)) {
        if (skip && skip.has(s.dir)) continue;
        const { x, z, y0, y1, dir } = s;
        if (dir === "+x") { const X = x + 1; quad([1, 0, 0], [[X, y0, z], [X, y1, z], [X, y1, z + 1], [X, y0, z + 1]]); }
        else if (dir === "-x") { const X = x; quad([-1, 0, 0], [[X, y0, z], [X, y0, z + 1], [X, y1, z + 1], [X, y1, z]]); }
        else if (dir === "+z") { const Z = z + 1; quad([0, 0, 1], [[x, y0, Z], [x + 1, y0, Z], [x + 1, y1, Z], [x, y1, Z]]); }
        else if (dir === "-z") { const Z = z; quad([0, 0, -1], [[x, y0, Z], [x, y1, Z], [x + 1, y1, Z], [x + 1, y0, Z]]); }
    }

    return {
        positions: new Float32Array(positions),
        normals: new Float32Array(normals),
        // WebGL2 supports 32-bit indices; use them only when a chunk exceeds the 16-bit vertex ceiling.
        indices: vbase > 65535 ? new Uint32Array(indices) : new Uint16Array(indices),
        vertexCount: vbase,
        quadCount: vbase / 4,
        triCount: indices.length / 3,
    };
}
