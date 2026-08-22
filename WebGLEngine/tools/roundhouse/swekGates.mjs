// tools/roundhouse/swekGates.mjs
//
// Concrete SweK gates to use as the runGate in routeWithSwekGate (v2786). The whole point of escalateRoute is
// that the verifier is a REAL SweK check, not a bigger model's opinion. These wrap actual engine computations:
//
//   faceCountGate  -- task: "a floating solid box of size w x h x d sits in a chunk; how many exposed voxel
//                     faces does it have?" The model reasons; the gate builds the real chunk and counts exposed
//                     faces through the gated RLE surface stack (yFacesFromRLE + expandSpans(sideFacesFromRLE)).
//                     Truth is owned, not guessed -- exactly the roundhouse discipline.
//   ddaHitGate     -- task: a ray + a solid voxel; the gate runs traverseDDA and checks the proposed first hit.
//
// A runGate returns { pass, truth, proposed }. Injected into swekGateVerifier, it becomes the load-bearing
// verify() escalateRoute consults. Node-side tool (imports the browser-safe voxel modules; runs headless).

import { encodeRLE, rleIndex } from "../../voxel/voxelRLE.js";
import { yFacesFromRLE } from "../../voxel/rleSurface.js";
import { sideFacesFromRLE, expandSpans } from "../../voxel/rleSideFaces.js";
import { traverseDDA } from "../../voxel/voxelDDA.js";

const isSolid = (t) => t !== 0;

// The SweK truth: exposed voxel-face count of a chunk, via the RLE surface stack (internal faces only).
export function exposedFaceCount(dims, fillFn) {
    const flat = new Uint8Array(dims.sx * dims.sy * dims.sz);
    for (let x = 0; x < dims.sx; x++)
        for (let y = 0; y < dims.sy; y++)
            for (let z = 0; z < dims.sz; z++)
                if (fillFn(x, y, z)) flat[rleIndex(x, y, z, dims)] = 1;
    const rle = encodeRLE(flat, dims);
    return yFacesFromRLE(rle, isSolid).length + expandSpans(sideFacesFromRLE(rle, isSolid)).length;
}

// Build a face-count task: a floating box (not touching any chunk boundary, so all 6 sides are internal).
export function makeFaceCountTask(w, h, d, opts = {}) {
    const pad = 2;
    const dims = { sx: w + 2 * pad, sy: h + 2 * pad, sz: d + 2 * pad };
    const box = { x0: pad, y0: pad, z0: pad, x1: pad + w, y1: pad + h, z1: pad + d };   // [x0,x1)
    return {
        kind: "faceCount",
        prompt: `A solid rectangular box of size ${w} x ${h} x ${d} voxels floats inside an empty chunk (nothing touches it). How many of its unit faces are exposed to air? Respond only as JSON {"faceCount": N}.`,
        dims, box, w, h, d,
    };
}

// runGate for face-count tasks. output = { faceCount }. Truth via the RLE surface stack.
export function faceCountGate(output, task) {
    const b = task.box;
    const truth = exposedFaceCount(task.dims, (x, y, z) => x >= b.x0 && x < b.x1 && y >= b.y0 && y < b.y1 && z >= b.z0 && z < b.z1);
    const proposed = output && typeof output.faceCount === "number" ? output.faceCount : NaN;
    return { pass: proposed === truth, truth, proposed };
}

// A second concrete gate: verify a proposed DDA first-hit against traverseDDA. task = { ro, rd, solid:[x,y,z] }.
export function ddaHitGate(output, task) {
    const [sx, sy, sz] = task.solid;
    const solid = (x, y, z) => x === sx && y === sy && z === sz;
    const hit = traverseDDA(task.ro[0], task.ro[1], task.ro[2], task.rd[0], task.rd[1], task.rd[2], solid, 256);
    const truth = hit.hit ? [hit.vx, hit.vy, hit.vz] : null;
    const p = output && Array.isArray(output.hit) ? output.hit : null;
    const pass = (truth === null && p === null) || (!!truth && !!p && p[0] === truth[0] && p[1] === truth[1] && p[2] === truth[2]);
    return { pass, truth, proposed: p };
}
