// physics/mesh/marchingCubes-selfcheck.mjs
//
// Run: node physics/mesh/marchingCubes-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// The surface extractor held to the surface it is supposed to be extracting. We march a field we know exactly, so the mesh
// is checkable three ways. It must be watertight -- a closed manifold, every edge shared by exactly two triangles, no holes
// -- for both a plain sphere and an organic metaball blob. The volume it encloses must converge to the analytic 4/3 pi R^3
// as the grid refines, a number nobody feeds it. And every vertex it places must sit ON the isosurface, closer as the grid
// tightens, because the crossing is found by interpolating the field, not by snapping to a midpoint. The sabotage does
// exactly that -- snaps every vertex to its edge midpoint instead of the field crossing -- and the vertices leave the
// surface and the volume goes wrong, which the gate refuses.
import { sphereField, wyvill, wyvillGrad, marchingTets, meshVolume, watertight, maxSurfaceDeviation } from "./marchingCubes.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const R = 1.0, sph = sphereField(R);
const balls = [{ cx: -0.3, cy: 0, cz: 0, r: 0.9, s: 1 }, { cx: 0.4, cy: 0.2, cz: 0, r: 0.8, s: 1 }, { cx: 0.1, cy: -0.4, cz: 0.3, r: 0.7, s: 1 }];
const wf = (x, y, z) => wyvill(balls, x, y, z), wg = (x, y, z) => wyvillGrad(balls, x, y, z);

// ---- 1. THE MESH IS A WATERTIGHT CLOSED MANIFOLD (sphere and metaball blob) -------------------------
{
    const s = watertight(marchingTets(sph.f, sph.g, { N: 32 }).tris);
    const b = watertight(marchingTets(wf, wg, { N: 32, lo: -1.6, hi: 1.6, iso: 0.25 }).tris);
    ok("!! the extracted surface is watertight -- a closed manifold with no holes", s.watertight && b.watertight,
       "both the sphere and a three-ball metaball blob close up: every edge is shared by exactly two triangles (" + s.boundaryEdges + " and " + b.boundaryEdges + " boundary edges) -- the six-tet decomposition is consistent across cells.");
}

// ---- 2. THE ENCLOSED VOLUME CONVERGES TO THE ANALYTIC 4/3 pi R^3 -----------------------------------
{
    const vLo = meshVolume(...Object.values(pick(marchingTets(sph.f, sph.g, { N: 16 }))));
    const vHi = meshVolume(...Object.values(pick(marchingTets(sph.f, sph.g, { N: 48 }))));
    const eLo = Math.abs(vLo - sph.volume) / sph.volume, eHi = Math.abs(vHi - sph.volume) / sph.volume;
    ok("!! the enclosed volume converges to the analytic 4/3 pi R^3", eHi < 0.005 && eHi < eLo,
       "mesh volume approaches " + sph.volume.toFixed(4) + ": error falls from " + (eLo * 100).toFixed(2) + "% at N=16 to " + (eHi * 100).toFixed(2) + "% at N=48 -- the surface tightens onto the sphere it was cut from.");
}

// ---- 3. EVERY VERTEX SITS ON THE ISOSURFACE, CLOSER AS THE GRID TIGHTENS ---------------------------
{
    const m32 = marchingTets(sph.f, sph.g, { N: 32 }), m64 = marchingTets(sph.f, sph.g, { N: 64 });
    const d32 = maxSurfaceDeviation(m32.verts, sph.f, 0), d64 = maxSurfaceDeviation(m64.verts, sph.f, 0);
    const unit = m32.normals.every((n) => Math.abs(Math.hypot(n[0], n[1], n[2]) - 1) < 1e-9);
    ok("!! vertices lie on the isosurface (from interpolation) with unit gradient normals", d64 < d32 && d64 < 1e-2 && unit,
       "the worst vertex sits " + d64.toExponential(1) + " off the surface at N=64, down from " + d32.toExponential(1) + " at N=32, and every normal is a unit vector from the analytic gradient -- the flesh shades smoothly.");
}

function pick(m) { return { verts: m.verts, tris: m.tris }; }

console.log(fails ? "\nmarchingCubes-selfcheck: " + fails + " FAILED" : "\nmarchingCubes-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
