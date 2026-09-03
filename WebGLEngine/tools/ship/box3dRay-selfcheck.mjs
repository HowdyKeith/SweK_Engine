#!/usr/bin/env node
// WebGLEngine/tools/ship/box3dRay-selfcheck.mjs -- v4382
//
// GRADES physics/box3d/box3d_shim.c's swk_world_cast_ray and physics/box3d/rayCast.mjs.
//
// *** THE SHIM HAS SIMULATED THIS WORLD FOR HUNDREDS OF ROUNDS AND NOTHING COULD ASK IT WHAT A RAY HITS. ***
// Bodies, filters, three joint types, impulses, transforms, contacts, a deterministic record/replay with
// divergence detection -- and no cast, while box3d has carried b3World_CastRayClosest the whole time.
//
// Section 1 counts what the tree has instead, and the count corrected the round's own premise: not "several
// modules roll their own ray", which a loose grep suggested, but exactly ONE -- mesh/meshBVH.mjs, with three
// consumers, one of which (multiplayer/wadLevelHost.js) has a castRay() that delegates to it. So box3d's cast
// is the SECOND ray implementation this tree has ever had, which is precisely what lets it check the first.
//
// *** AND THE VERIFICATION IS THE REASON THIS ROUND IS WORTH DOING AT ALL. *** A new entry point that only its
// own gate can check is a claim about itself. mesh/meshBVH.mjs is a SECOND ray implementation that already
// shipped -- Moller-Trumbore over a BVH, written for a different purpose at v4247 -- so the same boxes go into
// box3d as hulls and into the BVH as triangles, and the two are asked the same question. Neither was written
// to agree with the other.
//
// Run: node tools/ship/box3dRay-selfcheck.mjs
"use strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { MeshBVH } from "../../mesh/meshBVH.mjs";
import { RAY_FIELDS, readRay, translationFor, distanceOf, boxTriangles, boxesTriangles } from "../../physics/box3d/rayCast.mjs";
import { codeOnly } from "./orreryFleetScan.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const NAT = path.join(ENG, "vendor/box3d/native");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log("  ----  " + s);
const SHIM = fs.readFileSync(path.join(ENG, "physics/box3d/box3d_shim.c"), "utf8");

// FOUR BOXES, and the shapes are deliberately unequal: a cube, a second cube offset along +x so a ray can pass
// one and hit the other, a tall thin slab, and a wide flat one off the axis. A ray set over four identical
// cubes would agree about a great deal less than it looked like.
const BOXES = Object.freeze([
    { x: 0, y: 0, z: 0, hx: 1, hy: 1, hz: 1 },
    { x: 5, y: 0, z: 0, hx: 1, hy: 1, hz: 1 },
    { x: 0, y: 3, z: 2, hx: 0.5, hy: 2, hz: 0.75 },
    { x: -4, y: -1, z: -3, hx: 1.5, hy: 0.4, hz: 2 },
]);
// ALL SIX AXES, and section 4 explains why that is not padding.
const RAYS = Object.freeze([
    { tag: "+y up into the slab's underside", o: [0, -10, 2], d: [0, 1, 0], r: 20 },
    { tag: "-z back into the first cube",     o: [0, 0, 10],  d: [0, 0, -1], r: 20 },
    { tag: "+x through both cubes",           o: [-10, 0, 0], d: [1, 0, 0], r: 20 },
    { tag: "-x, so the far cube is first",    o: [10, 0, 0],  d: [-1, 0, 0], r: 20 },
    { tag: "-y down onto the slab's top",     o: [0, 10, 2],  d: [0, -1, 0], r: 20 },
    { tag: "+x at the slab's height",         o: [-10, 3, 2], d: [1, 0, 0], r: 20 },
    { tag: "+z into the first cube",          o: [0, 0, -10], d: [0, 0, 1], r: 20 },
    { tag: "+x into the flat slab",           o: [-10, -1, -3], d: [1, 0, 0], r: 20 },
    { tag: "an oblique direction",            o: [-9, 4, 1],  d: [1, -0.3, 0.2], r: 25 },
    { tag: "a clean miss, well above",        o: [-10, 50, 0], d: [1, 0, 0], r: 20 },
    { tag: "starting BETWEEN the two cubes",  o: [3, 0, 0],   d: [1, 0, 0], r: 20 },
]);
const F = (v) => Number(v).toFixed(6) + "f";

console.log("box3dRay-selfcheck -- the physics world, asked what a ray hits, and a second opinion\n");

// =============================================================================================================
console.log("1. *** WHAT THE TREE BUILT BECAUSE IT COULD NOT ASK THE PHYSICS WORLD ***");
{
    // *** THE ROUND'S FIRST CLAIM HERE WAS "SEVERAL MODULES ROLL THEIR OWN" AND THE TREE SAYS OTHERWISE. ***
    // A loose grep found five files and three of them were gates or comment matches. Counted properly --
    // an actual triangle intersection in code, comments stripped -- there is exactly ONE: mesh/meshBVH.mjs.
    // multiplayer/wadLevelHost.js has a castRay(), and it DELEGATES, to intersectsSegment on that same BVH.
    //
    // That is a better finding than the one it replaced, and it sharpens what section 5 is worth. The tree
    // does not have scattered ray code to unify; it has ONE ray, with consumers, and until this round the
    // physics world was not among the things it could be asked about. So box3d's cast is the SECOND
    // implementation this tree has ever had -- which is exactly what makes it able to check the first.
    const impl = [], users = [];
    for (const rel of ["mesh/meshBVH.mjs", "render/perspectiveWarp.mjs", "multiplayer/wadLevelHost.js",
                       "physics/mesh/meshCSG.mjs", "tools/krbn/krbnCompare.js"]) {
        let src = ""; try { src = codeOnly(fs.readFileSync(path.join(ENG, rel), "utf8")); } catch { continue; }
        if (/function rayTriangle|invDet|edge2\[0\]/.test(src)) impl.push(rel);
        else if (/raycastFirst|intersectsSegment|new MeshBVH/.test(src)) users.push(rel);
    }
    ok("*** the tree has exactly ONE ray implementation, and it is not the physics ***",
        impl.length === 1 && impl[0] === "mesh/meshBVH.mjs" && users.length >= 2,
        `${impl[0]}, used by ${users.length} others (${users.join(", ")}) -- wadLevelHost's castRay() ` +
        `delegates to it. Nothing here could ask the world that is actually being SIMULATED`);
    ok("*** and the shim now has a cast, which it did not for hundreds of rounds ***",
        /int swk_world_cast_ray\(/.test(SHIM) && /b3World_CastRayClosest/.test(SHIM),
        "over box3d's b3World_CastRayClosest, which the vendored library has carried the whole time");
    ok("  it answers in BODY INDICES, like every other entry point in the shim",
        /B3_ID_EQUALS\(g_bodies\[i\], hitBody\)/.test(SHIM) && /return idx;/.test(SHIM),
        "b3RayResult names a SHAPE; returning that would make this the one function the rest of the shim " +
        "cannot use. A body the table does not know returns -1, because 0 is a real body");
}

// =============================================================================================================
console.log("\n2. THE ROW LAYOUT IS THE SHIM'S, NOT A SECOND COPY OF IT");
{
    const m = SHIM.match(/#define SWK_RAY_STRIDE (\d+)/);
    ok("*** the shim publishes the stride and rayCast.mjs names the fields ***",
        !!m && Number(m[1]) === RAY_FIELDS.length,
        `SWK_RAY_STRIDE ${m ? m[1] : "?"} against ${RAY_FIELDS.length} named fields: ${RAY_FIELDS.join(", ")}`);
    ok("  and there is a swk_ray_stride() to ask, as swk_contact_stride() set the precedent",
        /int swk_ray_stride\(void\) \{ return SWK_RAY_STRIDE; \}/.test(SHIM),
        "the shim's own note: two declarations of a packed layout is the eight-defect law waiting to happen");
    const row = [1, 3, 0.25, 1, 2, 3, 0, -1, 0];
    const r = readRay(row, RAY_FIELDS.length);
    ok("  a row reads back by name", r.hit === true && r.bodyIndex === 3 && r.fraction === 0.25 && r.ny === -1,
        `hit ${r.hit}, body ${r.bodyIndex}, fraction ${r.fraction}`);
    let threw = false;
    try { readRay(row, 4); } catch { threw = true; }
    ok("  and a stride narrower than the field list is refused rather than read short", threw,
        "a shim that changed its row and a reader that did not would otherwise disagree in silence");
}

// =============================================================================================================
console.log("\n3. *** THE SEGMENT CONVENTION, WHICH FAILS SILENTLY AND IS THE FIRST THING A CALLER GETS WRONG ***");
{
    const t = translationFor([1, 0, 0], 20);
    ok("*** a direction and a range become the TRANSLATION box3d wants ***",
        t[0] === 20 && t[1] === 0 && t[2] === 0,
        "box3d covers origin -> origin + translation; meshBVH covers origin -> origin + dir * maxT. Those are " +
        "not the same call with the arguments renamed");
    ok("  and the direction is NOT normalised on the caller's behalf",
        translationFor([2, 0, 0], 3)[0] === 6,
        "a direction of length 2 and a range of 3 means three lots of that vector; rescaling it would be this " +
        "module deciding what the caller meant");
    ok("  the hit distance is the fraction TIMES the translation's length, not the fraction",
        Math.abs(distanceOf(0.45, [20, 0, 0]) - 9) < 1e-12, "0.45 of a 20-unit translation is 9 units");
}

// =============================================================================================================
console.log("\n4. *** EVERY FACE WOUND OUTWARD -- A CLAIM ABOUT THE TABLE, NOT ABOUT THE RAYS ***");
{
    // *** THIS SECTION EXISTS BECAUSE THE ROUND'S OWN TABLE HAD A FACE BACKWARDS. *** Seven of the first nine
    // probe rays travelled along x or z and all agreed with box3d on body, distance AND normal. The eighth
    // pointed down, hit the slab's top, and the winding gave (0,-1,0) against box3d's (0,+1,0) -- a gap of 2.0
    // on a unit vector. The hit point and the distance were right in that case too, which is why nothing else
    // saw it. A ray set is a sample; this is the property.
    const T = boxTriangles(0, 0, 0, 1, 2, 3);
    const inward = [];
    for (let t = 0; t < 12; t++) {
        const o = t * 9;
        const e1 = [T[o + 3] - T[o], T[o + 4] - T[o + 1], T[o + 5] - T[o + 2]];
        const e2 = [T[o + 6] - T[o], T[o + 7] - T[o + 1], T[o + 8] - T[o + 2]];
        const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
        const c = [(T[o] + T[o + 3] + T[o + 6]) / 3, (T[o + 1] + T[o + 4] + T[o + 7]) / 3, (T[o + 2] + T[o + 5] + T[o + 8]) / 3];
        if (!(n[0] * c[0] + n[1] * c[1] + n[2] * c[2] > 0)) inward.push(t);
    }
    ok("*** all twelve triangles of a box face away from its centre ***", inward.length === 0,
        inward.length ? `inward-facing: ${inward.join(", ")}` :
        "12 of 12, on a box with three unequal half-extents so a cube's symmetry cannot hide a swap");
    const { tris, owner } = boxesTriangles(BOXES);
    ok("  and many boxes keep their ownership", tris.length === BOXES.length * 12 * 9 && owner.length === BOXES.length * 12
        && owner[0] === 0 && owner[owner.length - 1] === BOXES.length - 1,
        `${owner.length} triangles over ${BOXES.length} boxes, 12 each`);
}

// =============================================================================================================
console.log("\n5. *** BOX3D'S CAST AGAINST A SECOND IMPLEMENTATION THAT ALREADY SHIPPED ***");
{
    const lib = path.join(NAT, "libbox3d.a"), obj = path.join(NAT, "shim.o");
    if (!fs.existsSync(lib) || !fs.existsSync(obj)) {
        report("SKIPPED -- vendor/box3d/native/{libbox3d.a,shim.o} absent. Build them with " +
               "physics/box3d/build-box3d-native.sh (needs cc + cmake + network once). They are deliberately " +
               "NOT committed: x86_64 Linux binaries would be wrong everywhere else.");
        report("*** A SKIP, NOT A PASS. When this was written the eleven rays agreed with mesh/meshBVH.mjs on " +
               "the body and the face every time, worst distance gap 2.400e-7 and worst normal gap exactly 0.");
    } else {
        const decl = BOXES.map((b) => `  swk_body_box(0, ${F(b.x)}, ${F(b.y)}, ${F(b.z)}, ${F(b.hx)}, ${F(b.hy)}, ${F(b.hz)}, 1000.0f);`).join("\n");
        const casts = RAYS.map((R) => { const t = translationFor(R.d, R.r);
            return `  swk_world_cast_ray(${F(R.o[0])},${F(R.o[1])},${F(R.o[2])}, ${F(t[0])},${F(t[1])},${F(t[2])}, out); pr(out);`; }).join("\n");
        const src = path.join(NAT, "ray_probe.c"), bin = path.join(NAT, "ray_probe");
        fs.writeFileSync(src, `#include <stdio.h>
int swk_world_create(float,float,float); void swk_world_destroy(void);
int swk_body_box(int,float,float,float,float,float,float,float);
int swk_world_cast_ray(float,float,float,float,float,float,float*); int swk_ray_stride(void);
static float out[16];
static void pr(float*o){ printf("%d %d %.9g %.9g %.9g %.9g %.9g %.9g %.9g\\n",(int)o[0],(int)o[1],o[2],o[3],o[4],o[5],o[6],o[7],o[8]); }
int main(void){ swk_world_create(0.0f,0.0f,0.0f); printf("stride %d\\n", swk_ray_stride());
${decl}
${casts}
  swk_world_destroy(); return 0; }
`);
        execFileSync("cc", ["-O2", "-I../include", "ray_probe.c", "shim.o", "libbox3d.a", "-lm", "-o", "ray_probe"], { cwd: NAT });
        const lines = execFileSync(bin, { encoding: "utf8" }).trim().split("\n");
        const stride = Number(lines[0].split(" ")[1]);
        ok("  the running shim's stride is the one the source declares", stride === RAY_FIELDS.length,
            `swk_ray_stride() returned ${stride}`);
        const { tris, owner } = boxesTriangles(BOXES);
        const bvh = new MeshBVH(tris);
        let agree = 0, disagree = [], worstD = 0, worstN = 0, misses = 0;
        RAYS.forEach((R, n) => {
            const f = lines[n + 1].split(" ").map(Number);
            const row = readRay(f, stride);
            const t = translationFor(R.d, R.r);
            const bh = bvh.raycastFirst(R.o[0], R.o[1], R.o[2], R.d[0], R.d[1], R.d[2], R.r);
            if (row.hit !== !!bh) { disagree.push(`${R.tag}: box3d ${row.hit}, bvh ${!!bh}`); return; }
            if (!row.hit) { misses++; agree++; return; }
            const dBox = distanceOf(row.fraction, t);
            const dBvh = bh.t * Math.hypot(R.d[0], R.d[1], R.d[2]);
            // THE BVH RETURNS NO NORMAL -- {t, tri, point}. It is derived from the hit triangle's own winding,
            // which is what makes section 4's property load-bearing rather than tidy.
            const o9 = bh.tri * 9;
            const e1 = [tris[o9 + 3] - tris[o9], tris[o9 + 4] - tris[o9 + 1], tris[o9 + 5] - tris[o9 + 2]];
            const e2 = [tris[o9 + 6] - tris[o9], tris[o9 + 7] - tris[o9 + 1], tris[o9 + 8] - tris[o9 + 2]];
            let nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
            const L = Math.hypot(nx, ny, nz); nx /= L; ny /= L; nz /= L;
            const dd = Math.abs(dBox - dBvh);
            const nd = Math.max(Math.abs(row.nx - nx), Math.abs(row.ny - ny), Math.abs(row.nz - nz));
            worstD = Math.max(worstD, dd); worstN = Math.max(worstN, nd);
            if (row.bodyIndex === owner[bh.tri] && dd < 1e-4 && nd < 1e-5) agree++;
            else disagree.push(`${R.tag}: box3d body ${row.bodyIndex} d=${dBox.toFixed(6)}, bvh box ${owner[bh.tri]} d=${dBvh.toFixed(6)}, normal gap ${nd.toExponential(2)}`);
        });
        ok("*** box3d and mesh/meshBVH.mjs agree on every ray: body, distance and face ***",
            disagree.length === 0 && agree === RAYS.length,
            `${agree} of ${RAYS.length} agree (${misses} of them a shared miss), worst distance gap ` +
            `${worstD.toExponential(3)}, worst normal gap ${worstN.toExponential(3)}` +
            (disagree.length ? " -- " + disagree.slice(0, 2).join("; ") : ". box3d computes in f32 over hulls, " +
             "the BVH in f64 over triangles, and neither was written to agree with the other"));
        ok("  and at least one ray really misses, so 'agrees' is not agreement about nothing",
            misses >= 1, `${misses} shared miss(es)`);
        // THE SEGMENT CONVENTION, MEASURED ON THE DEVICE RATHER THAN ASSERTED IN SECTION 3.
        const shortSrc = path.join(NAT, "ray_short.c");
        fs.writeFileSync(shortSrc, `#include <stdio.h>
int swk_world_create(float,float,float); void swk_world_destroy(void);
int swk_body_box(int,float,float,float,float,float,float,float);
int swk_world_cast_ray(float,float,float,float,float,float,float*);
static float out[16];
int main(void){ swk_world_create(0.0f,0.0f,0.0f);
  swk_body_box(0, 0.0f,0.0f,0.0f, 1.0f,1.0f,1.0f, 1000.0f);
  int a = swk_world_cast_ray(-10.0f,0.0f,0.0f, 20.0f,0.0f,0.0f, out); float fa = out[2];
  int b = swk_world_cast_ray(-10.0f,0.0f,0.0f,  1.0f,0.0f,0.0f, out);
  printf("%d %.6f %d\\n", a, fa, b); swk_world_destroy(); return 0; }
`);
        execFileSync("cc", ["-O2", "-I../include", "ray_short.c", "shim.o", "libbox3d.a", "-lm", "-o", "ray_short"], { cwd: NAT });
        const [hitIdx, frac, shortIdx] = execFileSync(path.join(NAT, "ray_short"), { encoding: "utf8" }).trim().split(" ").map(Number);
        ok("*** CONTROL: a UNIT direction where a translation belongs hits nothing, and says nothing ***",
            hitIdx === 0 && Math.abs(frac - 0.45) < 1e-4 && shortIdx === -1,
            `the same ray hits body ${hitIdx} at fraction ${frac.toFixed(4)} with a translation of 20, and ` +
            `returns ${shortIdx} with a translation of 1 -- no error, no complaint, only an absence. That is ` +
            `the failure mode translationFor() exists to remove`);
    }
}

// ---- SABOTAGE LOG -- applied to the working tree, exit code and FAIL count read together, restored
// md5-identical (physics/box3d/box3d_shim.c 82d44e1b, physics/box3d/rayCast.mjs 96910b88). The two shim
// sabotages were REBUILT natively before running, so what went red is the compiled physics and not a regex.
//
//   A  the +y face wound backwards again -- the round's own bug, put back.
//      -> exit=1, 2 red: section 4 names the two inward triangles (8, 9), and section 5 drops to 10 of 11
//      with a normal gap of 2.0. Only ONE of the eleven rays sees it, which is the whole reason section 4
//      checks the property instead of trusting the ray set: the ray sample caught it by luck the first time.
//
//   B  the returned fraction bent by 2%.
//      -> exit=1, 2 red: 1 of 11 agree, worst distance gap 2.200e-1 against a tolerance of 1e-4 -- and the
//      segment CONTROL too, because the reference fraction 0.45 it pins moved to 0.459. Two independent
//      checks on one number, which is what a control is for.
//
//   C  the shape never resolved to its body: idx hard-wired to 0.
//      -> exit=1, 2 red: the source-level check on B3_ID_EQUALS, and section 5 at 4 of 11. FOUR, not one --
//      the rays that genuinely hit body 0 still agree, so a hard-wired index is right a third of the time on
//      this fixture. A single-ray test could have passed it.
//
//   D  translationFor "helpfully" normalises the direction.
//      -> exit=1, 1 red, and only in section 3. That is correct and worth saying: every ray in section 5
//      already passes a unit direction, so the eleven-ray comparison is BLIND to this by construction. The
//      one check that sees it is the one that hands in a direction of length 2 on purpose.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: the WASM packaging. build-box3d-native.sh needs only cc and cmake, so the physics " +
    "is built, run and measured in this sandbox; getting swk_world_cast_ray into vendor/box3d/box3d.wasm needs " +
    "emsdk and stays rig work, exactly as #125's note said of the filter. Also unchecked: shape casts, sensors, " +
    "and joint motors -- box3d has all three and this shim still has none of them.");
process.exit(fails ? 1 : 0);
