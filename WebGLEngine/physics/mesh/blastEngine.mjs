// WebGLEngine/physics/mesh/blastEngine.mjs
//
// *** BVH-CSG ROUND 13: meshBoolean BEHIND A FLAG IN THE ENGINE. *** The arc's notes: "only after rounds 9-12 would I
// consider putting meshBoolean behind a flag in the engine; nothing calls it today." One thing in the engine cuts a
// mesh -- destructible.html's blast, which calls meshCSG.mjs's blast() (a BSP, localised to the polygons the blob's
// box reaches) -- and one contract comes out of it that the rest of the engine reads: POLYGONS, each with its exact
// plane `pl` and a `src` tag, SKIN (the surface that was always there) or CUT (made by a blast), which
// render/solidTexture.mjs, render/rebar.mjs and physics/mesh/uvUnwrap.mjs select by. This file puts the two engines
// behind one call with that contract:
//
//   blastWith(engine, polys, blob, opts) -> { polys, stats }      engine: "bsp" (DEFAULT_BLAST_ENGINE) or "bvh"
//
// "bsp" is meshCSG.blast() exactly. "bvh" is meshBoolean.mjs's subtract, and its output is brought back into the
// contract by meshBoolean's per-triangle provenance (`from`, round 13): a piece of the wall keeps its source polygon's
// plane (exactly -- the same object, as the BSP's splitPolygon shares it) and tag (SKIN if it had none); a piece of the
// blob gets the blob polygon's plane turned round and the tag CUT. The wall goes in as polygons of any size and comes
// out as triangles -- meshBoolean's output is a triangle soup -- so a BVH wall is all triangles from its first shot.
"use strict";

import * as M from "./meshCSG.mjs";
import { meshBoolean } from "./meshBoolean.mjs";
import { MeshBVH } from "../../mesh/meshBVH.mjs";

export const BLAST_ENGINES = ["bsp", "bvh"];
export const DEFAULT_BLAST_ENGINE = "bsp";

// polygons -> flat triangle buffer, with each triangle's source polygon: meshCSG.toTriangles' own fan, polygon by
// polygon, so the triangles are exactly the ones meshCSG would make (it drops fan triangles that cover nothing)
function trianglesOf(polys) {
    const tris = [], owner = [];
    polys.forEach((p, i) => { for (const t of M.toTriangles([p])) { tris.push(t); owner.push(i); } });
    const buf = new Float64Array(tris.length * 9);
    tris.forEach((t, i) => { for (let v = 0; v < 3; v++) for (let c = 0; c < 3; c++) buf[i * 9 + v * 3 + c] = t[v][c]; });
    return { buf, owner: Int32Array.from(owner) };
}

/**
 * The BVH engine's blast: wall - blob by meshBoolean, back in blast()'s contract.
 * @param {{vs:number[][], pl:{n:number[], w:number}, src?:string}[]} polys  the wall, closed
 * @param {{vs:number[][], pl:{n:number[], w:number}}[]} blob  the blast shape, closed
 * @param {object} [opts]  passed to meshBoolean (e.g. contacts, normalize)
 * @returns {{polys:object[], stats:object}}
 */
export function blastBVH(polys, blob, opts = {}) {
    const t0 = Date.now();
    const A = trianglesOf(polys), B = trianglesOf(blob);
    const r = meshBoolean(A.buf, new MeshBVH(A.buf), B.buf, new MeshBVH(B.buf), "subtract", opts);
    const out = new Array(r.triCount);
    const flipped = new Map();
    let unknown = 0;
    for (let i = 0; i < r.triCount; i++) {
        const o = i * 9, t = r.tris;
        const vs = [[t[o], t[o + 1], t[o + 2]], [t[o + 3], t[o + 4], t[o + 5]], [t[o + 6], t[o + 7], t[o + 8]]];
        const f = r.from[i];
        // a `from` out of either operand's range is no provenance at all: counted with the untraced, never indexed
        const p = f >= 0 && f < A.owner.length ? polys[A.owner[f]] : null;
        const q = f < 0 && -f - 1 < B.owner.length ? blob[B.owner[-f - 1]] : null;
        if (p) {
            out[i] = { vs, pl: p.pl, src: p.src ?? M.SKIN };
        } else if (q) {
            let pl = flipped.get(q);
            if (!pl) { pl = { n: [-q.pl.n[0], -q.pl.n[1], -q.pl.n[2]], w: -q.pl.w }; flipped.set(q, pl); }
            out[i] = { vs, pl, src: M.CUT };
        } else {
            unknown++;                                       // no provenance: not reached by any path today
            out[i] = { vs, pl: M.planeOf(vs), src: M.CUT };
        }
    }
    const sa = r.stats.a, sb = r.stats.b;
    return {
        polys: out,
        stats: { engine: "bvh", triangles: r.triCount, fallbackTris: (sa.fallbackTris || 0) + (sb.fallbackTris || 0),
                 ambiguous: r.ambiguousTriIndices.length, capped: r.capped, emptyOperand: r.emptyOperand, unknown,
                 ms: Date.now() - t0 },
    };
}

/**
 * One blast through the named engine. `select` is the BSP's polygon query (meshCSG.bvhSelect(polys).select); it is
 * built here when not given, and the BVH engine does not use it.
 */
export function blastWith(engine, polys, blob, { select = null, ...opts } = {}) {
    if (engine === "bsp") {
        const t0 = Date.now();
        const r = M.blast(polys, blob, { select: select || M.bvhSelect(polys).select });
        return { polys: r.polys, stats: { engine: "bsp", ...r.stats, ms: Date.now() - t0 } };
    }
    if (engine === "bvh") return blastBVH(polys, blob, opts);
    throw new Error('blastEngine: unrecognized engine "' + engine + '" (expected "bsp" or "bvh")');
}
