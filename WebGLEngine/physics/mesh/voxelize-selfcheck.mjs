// WebGLEngine/physics/mesh/voxelize-selfcheck.mjs -- v2874
//
// Run: node physics/mesh/voxelize-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// Grades the GLB -> solid-mask pipeline that lets the wind tunnel be pointed at a real model.
//
// THE MODEL IS THE TEST. There is no .glb anywhere in this tree -- the models live in an external assets dir by
// design since v978 -- so a reader graded only against real files could not be graded here at all. Instead the
// writer emits a mesh of a KNOWN ANALYTIC SHAPE and the pipeline is graded against its closed form.
//
// TWO KEYS, AND SEPARATING THEM WAS THE WHOLE FIX. My first version graded voxel volume against (4/3)pi r^3 and
// watched convergence flatten at a few tenths of a percent, which looked like a voxeliser bug. It was not: a
// tessellated sphere is an inscribed POLYHEDRON with its own deficit, so that comparison had a floor under it.
// Split apart, both halves are exact:
//     voxel volume -> meshVolume()     grades the VOXELISER
//     meshVolume() -> (4/3)pi r^3      grades the TESSELLATION
import { parseGLB, writeGLB, sphereMesh, boxMesh, bounds } from "./glb.mjs";
import { voxelize, voxelVolume, meshVolume, crossSection, sectionArea, isClosed } from "./voxelize.mjs";
import fs from "node:fs";
globalThis.__fsForCheck = fs;

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. the container round-trips ------------------------------------------------------------------------------
{
    const src = sphereMesh(1, 24, 16);
    const back = parseGLB(writeGLB(src));
    ok("a written GLB parses back", back.triangles === src.indices.length / 3 && back.vertices === src.positions.length / 3,
       back.vertices + " verts, " + back.triangles + " tris");
    const b = bounds(back);
    ok("...with the geometry intact", b.size.every((v) => Math.abs(v - 2) < 1e-6), b.size.map((v) => v.toFixed(4)).join(" x "));
    // Refusals must be loud: a mesh that silently reads as zero triangles voxelises to an empty tunnel and looks
    // like a body with no drag.
    ok("a non-GLB is refused by reason", (() => { try { parseGLB(new Uint8Array(40)); return false; } catch (e) { return /bad magic|shorter/.test(e.message); } })());
    ok("...and so is a truncated one", (() => { try { const g = writeGLB(boxMesh()); return parseGLB(g.subarray(0, g.length - 40)) && false; } catch (e) { return true; } })());
}

// ---- 2. THE MESH MUST BE CLOSED, and the detector found a real defect in my own generator -------------------------
{
    const s = sphereMesh(1, 24, 16);
    const c = isClosed(s);
    ok("!! the sphere generator produces a CLOSED surface", c.closed,
       c.boundaryEdges + " boundary edges, " + c.nonManifoldEdges + " non-manifold -- the first version had 160, from an unwelded seam and pole fans");
    ok("the box is closed too", isClosed(boxMesh(2, 1, 0.5)).closed);
    // Why it matters: ray parity on an OPEN surface flips once and never flips back.
    const open = { positions: boxMesh(1, 1, 1).positions, indices: boxMesh(1, 1, 1).indices.slice(0, 30) };
    ok("!! an OPEN mesh is detectable before it is voxelised", !isClosed(open).closed,
       "ray-parity fill of an open surface produces confident nonsense -- half the domain solid");
}

// ---- 3. KEY: exact volume of a closed mesh (divergence theorem) ----------------------------------------------------
{
    ok("!! a box's mesh volume is EXACT", Math.abs(meshVolume(boxMesh(2, 1, 0.5)) - 1) < 1e-12,
       meshVolume(boxMesh(2, 1, 0.5)).toFixed(12) + " vs exactly 1 -- no discretisation, it is a closed form");
    ok("...and scales as a volume should", Math.abs(meshVolume(boxMesh(2, 2, 2)) - 8) < 1e-12);
}

// ---- 4. KEY B: the TESSELLATION converges to the sphere ---------------------------------------------------------------
{
    const exact = (4 / 3) * Math.PI;
    const errs = [12, 24, 48, 96].map((seg) => Math.abs(meshVolume(sphereMesh(1, seg, Math.round(seg * 0.7))) / exact - 1));
    ok("!! mesh volume converges to (4/3)pi r^3", errs[errs.length - 1] < 2e-3,
       errs.map((e) => (100 * e).toFixed(3) + "%").join(" -> "));
    ok("...MONOTONICALLY, and about 4x per doubling (second order)",
       errs.every((e, i) => i === 0 || e < errs[i - 1]) && errs[0] / errs[1] > 3 && errs[1] / errs[2] > 3,
       "an inscribed polyhedron's deficit falls as h^2");
}

// ---- 5. KEY A: the VOXELISER converges to the mesh ------------------------------------------------------------------
{
    const m = parseGLB(writeGLB(sphereMesh(1, 64, 48)));
    const mv = meshVolume(m);
    const err = (n) => Math.abs(voxelVolume(voxelize(m, { nx: n, ny: n, nz: n, pad: 0.05 })) / mv - 1);
    const coarse = err(16), mid = err(32), fine = err(64);
    ok("!! voxel volume converges to the MESH volume", fine < 2e-3,
       "16^3 " + (100 * coarse).toFixed(3) + "% -> 32^3 " + (100 * mid).toFixed(4) + "% -> 64^3 " + (100 * fine).toFixed(4) + "%");
    ok("...a large drop from coarse to fine", coarse > 10 * fine, "2% down to hundredths of a percent");
    // NOT asserted: monotonicity. The residual is surface-cell alignment luck and it oscillates at the 0.05%
    // level. Demanding a monotone sequence the arithmetic cannot deliver is how a gate becomes a liar -- the
    // same call the logistic instrument made about its Feigenbaum estimates.
    ok("...and the tail stays small even where it is not monotone", err(48) < 3e-3 && err(96) < 3e-3,
       "grid/surface alignment, not a bug -- stated rather than dressed up as convergence");
    // A BOX IS NOT THE EASY CASE I ASSUMED. Its faces are FLAT, so every face loses a partial cell along its
    // whole area at once -- an O(h) error per axis with no curvature to average it out, which is WORSE than the
    // sphere at the same resolution (4.1% at 40^3). My first assertion was a 3% threshold at 80^3 and it failed
    // on arithmetic, not on a bug. The honest key is CONVERGENCE, the same one used for the sphere above.
    const bx = parseGLB(writeGLB(boxMesh(2, 1, 0.5)));
    const berr = (n) => Math.abs(voxelVolume(voxelize(bx, { nx: n, ny: n, nz: n, pad: 0.05 })) / meshVolume(bx) - 1);
    const b40 = berr(40), b160 = berr(160), b240 = berr(240);
    ok("!! a box's voxel volume CONVERGES to its exact volume", b240 < b160 && b160 < b40 && b240 < 0.005,
       "40^3 " + (100 * b40).toFixed(2) + "% -> 160^3 " + (100 * b160).toFixed(3) + "% -> 240^3 " + (100 * b240).toFixed(3) + "%");
    ok("...and a FLAT face converges slower than a curved one, as it must", b40 > coarse,
       "every flat face loses a partial cell across its whole area at once; a sphere's curvature averages that out");
}

// ---- 6. the 2D cross-section, and the caveat that MUST travel with it --------------------------------------------------
{
    const m = parseGLB(writeGLB(sphereMesh(1, 64, 48)));
    const s = crossSection(m, { nx: 120, ny: 120, pad: 0.05 });
    const area = sectionArea(s);
    ok("!! a sphere's mid cross-section is its great circle", Math.abs(area / Math.PI - 1) < 0.05,
       "area " + area.toFixed(4) + " vs pi = " + Math.PI.toFixed(4));
    ok("solidAt is a usable predicate for the LBM", typeof s.solidAt === "function" && s.solidAt(60, 60) === true && s.solidAt(0, 0) === false);
    const src = "" + crossSection;
    ok("!! the 2D caveat is recorded IN THE FUNCTION", /not the drag coefficient of the BODY|SLICE/.test(
        require_src()), "a slice's Cd is not the body's -- a sphere's slice is a cylinder, whose Cd is roughly double");
}
function require_src() {
    // read the module text rather than Function.toString, which drops the leading comment block
    return require_fs().readFileSync(new URL("./voxelize.mjs", import.meta.url), "utf8");
}
function require_fs() { return globalThis.__fsForCheck; }

console.log(fails ? "\nvoxelize-selfcheck: " + fails + " FAILED" : "\nvoxelize-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
