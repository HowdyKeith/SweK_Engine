// WebGLEngine/tools/ship/mikktSpace-selfcheck.mjs -- v4611 (task #41, backlog id "mikktspace-wasm")
//
// Run: node tools/ship/mikktSpace-selfcheck.mjs
//
// GATES physics/mesh/mikktSpace.mjs's computeTangents(positions, normals, uvs, indices), a from-scratch JS
// port of MikkTSpace (see that module's own header for the full "why a hand-port, not the WASM package"
// reasoning and the exact deferred-scope list).
//
// *** SAME DISCIPLINE AS tools/mesh/xatlasRef-selfcheck.mjs: GRADED AGAINST THE REAL REFERENCE, NOT ONLY
// AGAINST ITSELF. *** tools/mesh/mikktRef.mjs builds and runs the ACTUAL, UNMODIFIED vendor/mikktspace/
// mikktspace.c (zlib, Morten S. Mikkelsen) as a native oracle. Section 1 checks the RECORDED oracle
// (tools/mesh/mikkt-oracle.json) is still current for what it was taken from; section 2 is the core claim,
// this module's output against that record, corner for corner; section 7 re-derives the record live whenever
// a compiler happens to be cached and current, the same "re-derive, don't just trust the record" pattern
// xatlasRef-selfcheck.mjs already established.
//
// ---- SABOTAGE LOG (each entry: the real code mutated, the exact red(s) it produced, restored after) --------
// A. eq18/19 swapped (t21<->t31 in the tangent formula) -> section 2 red on ALL FOUR fixtures then in the set
//    (quad/quadMirrored/cube/cylinder; fan/seam did not exist yet). Section 3 stayed green -- the swap still
//    produces a vector perpendicular to the normal, just pointing the wrong way, so perpendicularity alone
//    cannot see this bug; only the exact-match against the real reference (section 2) can.
// B. sign always forced to +1 (drop the fS orientation flip in InitTriInfo's port) -> section 2 red ONLY on
//    quadMirrored (the one fixture whose whole point is a negative sign). Section 3's "sign is always exactly
//    +/-1" check stayed green (still +/-1, just the WRONG one) -- confirming section 3 alone is not
//    sufficient and section 2's exact-match against the real reference is load-bearing.
// C. Gram-Schmidt projection skipped (average the raw per-face tangent directly) -> section 3's
//    tangent-perpendicular-to-normal check went red (24 of then-432 corners) and section 4's bitangent
//    orthogonality check went red with it; section 2's cylinder also went red. quad/quadMirrored/cube ALL
//    stayed accidentally green in section 2 and section 3 alike -- every one of those three fixtures happens
//    to have each contributing face's raw tangent ALREADY in-plane with its own vertex normal (axis-aligned
//    quads/cube faces), so skipping the projection changes nothing there. Only cylinder's continuously-
//    varying normal actually exercises the projection -- the reason cube and cylinder are both in the
//    fixture set rather than just the two hand-derived planar ones, and neither alone would have been enough.
// D. *** FOUND A REAL GATE GAP: WENT 0 RED ON THE FIRST RUN. *** angle-weighting replaced with equal
//    (count-based) weighting produced NO failing check against quad/quadMirrored/cube/cylinder -- the
//    cylinder's own uniform grid gives every contributing triangle at a shared welded vertex the SAME corner
//    angle by symmetry, so angle-weighted and equal-weighted sums renormalize to the identical direction
//    there; a uniform mesh cannot discriminate the two weighting schemes at all. Fixed by adding the "fan"
//    fixture (tools/mesh/mikktRef.mjs) -- two triangles sharing one vertex at deliberately unequal wedge
//    angles (10 degrees vs 170 degrees) with UV chosen (by a small numeric search, not guessed) so their raw
//    tangent directions are nearly orthogonal rather than accidentally near-parallel. Re-run after adding it:
//    section 2 red on fan ONLY (max diff 0.617 against a 1e-4 tolerance), everything else still green.
// E. *** FOUND A SECOND REAL GATE GAP, SAME SHAPE. *** UV dropped from the weld key (weld by position+normal
//    only) also went 0 red against the five fixtures then in the set. The obvious candidate --
//    cylinder's own i=0/i=nu UV-wraparound seam -- turned out not to test it: `2*Math.PI*nu/nu` and
//    `2*Math.PI*0/nu` do not reduce to bit-identical cos/sin in float64 (argument-reduction noise on an
//    argument near 2*PI), so that pair never collides on POSITION either, UV or no UV. Fixed by adding the
//    "seam" fixture -- two otherwise-unrelated, disconnected triangles sharing one corner with a LITERAL,
//    trig-free bit-identical position+normal (0,0,0)/(0,0,1) but different UV. Re-run after adding it:
//    section 2 red on seam ONLY (got tangent (0,0,0) where the reference says (1,0,0) -- the broken key
//    blended two unrelated triangles' contributions into a near-cancelling sum), everything else still green.
// Both D and E are logged as gate-design corrections, not module bugs -- physics/mesh/mikktSpace.mjs itself
// was never wrong; the gate's original fixture set (inherited from tools/mesh/xatlasRef.mjs's own four, which
// were built for a different algorithm) just could not see these two failure classes until fan/seam existed.
//
// F and G were found by an independent adversarial review (not this round's author), which re-derived the
// math against a freshly-fetched copy of the real reference source, independently re-ran sabotages D and E,
// and then went looking for coverage sections 4 and 6 could not actually prove -- correctly, on both counts:
// F. cross-product operand order swapped in bitangentFromTangent (cross(N,T) -> cross(T,N)) -> section 4's
//    ORIGINAL check (unit length + perpendicular to N and T) stayed GREEN, because any unit vector orthogonal
//    to two orthogonal unit vectors is EITHER cross(N,T) or its negation -- orthogonality alone cannot tell
//    them apart. Fixed by adding two exact-value checks (not just orthogonality) pinned against a hand-
//    derived example: bitangentFromTangent(N=(0,0,1), T=(1,0,0), sign=1) must be EXACTLY (0,1,0). Re-run with
//    the swap: BOTH new checks red (got (0,-1,0) and (0,1,0), the sign-negated wrong answer), the original
//    orthogonality check still green as predicted.
// G. orthogonalTo() hardcoded to unconditionally return [1,0,0], ignoring its nx/ny/nz arguments -> section
//    6's ORIGINAL check (one fixture, normal fixed at (0,0,1)) stayed GREEN, because [1,0,0] happens to be
//    unit-length and perpendicular to that one normal by coincidence, and only ONE of orthogonalTo's three
//    branches was ever exercised by any fixture in the gate. Fixed by running the SAME degenerate shape
//    through three normals, one per dominant axis ((0,0,1), (1,0,0), (0,1,0)), checked against each
//    fixture's OWN normal rather than a value assumed from a single case. Re-run with the stub: RED on the
//    N=(1,0,0) fixture only ([1,0,0] is NOT perpendicular to itself, dot=1), green on the other two (a fixed
//    [1,0,0] output is trivially perpendicular to any normal with zero x-component, which is exactly why a
//    single fixture could not have caught this and three orthogonal ones, collectively, can).
import fs from "node:fs";
import * as R from "../mesh/mikktRef.mjs";
import { gateReport } from "./gateReport.mjs";
import { computeTangents, bitangentFromTangent } from "../../physics/mesh/mikktSpace.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const REC = JSON.parse(fs.readFileSync(R.RECORD_PATH, "utf8"));
const REPORT = gateReport("tools/ship/mikktSpace-selfcheck.mjs");

console.log("mikktSpace-selfcheck -- a from-scratch JS port of MikkTSpace, graded against the real C reference\n");

console.log("1. *** THE RECORD IS ONLY WORTH ITS INPUTS, SO ITS INPUTS ARE HASHED ***");
{
    const now = R.inputHashes();
    const bad = Object.entries(REC.inputs).filter(([f, h]) => now[f] !== h);
    const missing = Object.keys(now).filter((f) => !(f in REC.inputs));
    ok("!! the vendored mikktspace.c/.h and the harness are the ones the record was taken from",
        bad.length === 0 && missing.length === 0,
        `${Object.keys(REC.inputs).length} hashed inputs, ${bad.length} changed, ${missing.length} unrecorded. Pinned at ${REC.pin.slice(0, 12)}.`);

    const drift = Object.entries(REC.meshes).filter(([n, m]) => !R.FIXTURES[n] || R.meshHash(R.FIXTURES[n]()) !== m.meshHash);
    ok("!! and every fixture still generates the exact vertex/normal/uv/index bytes the reference was run on",
        drift.length === 0 && Object.keys(R.FIXTURES).length === Object.keys(REC.meshes).length,
        `${Object.keys(REC.meshes).length} fixtures, ${drift.length} whose bytes no longer hash to the recorded value.`);
}

console.log("\n2. *** THE CORE CLAIM: this module's output matches the REAL mikktspace.c, corner for corner ***");
const MINE = {};
{
    const TOL = 1e-4;   // record is stored rounded to 6 decimals; this module computes in float64 then casts
                         // to Float32Array, so the real noise floor is float32 epsilon, not algorithmic
    for (const [name, make] of Object.entries(R.FIXTURES)) {
        const m = make();
        const got = computeTangents(m.positions, m.normals, m.uvs, m.indices);
        const want = REC.meshes[name].tangents;
        MINE[name] = { mesh: m, got };
        let maxDiff = 0, worst = -1;
        for (let i = 0; i < want.length; i++) {
            const d = Math.abs(got[i] - want[i]);
            if (d > maxDiff) { maxDiff = d; worst = i; }
        }
        ok(`!! ${name}: ${want.length / 4} corners match the reference within ${TOL}`,
            got.length === want.length && maxDiff <= TOL,
            `outLen ${got.length} vs ${want.length}, max abs diff ${maxDiff.toExponential(3)} at flat index ${worst}` +
            (worst >= 0 ? ` (got ${got[worst].toFixed(6)}, want ${want[worst].toFixed(6)})` : ""));
    }
}

console.log("\n3. *** STRUCTURAL PROPERTIES EVERY OUTPUT CORNER MUST HAVE, INDEPENDENT OF THE RECORD ***");
{
    let badUnit = 0, badPerp = 0, badSign = 0, totalCorners = 0;
    for (const [name, { mesh, got }] of Object.entries(MINE)) {
        const nt = mesh.indices.length / 3;
        for (let c = 0; c < nt * 3; c++) {
            totalCorners++;
            const tx = got[c * 4], ty = got[c * 4 + 1], tz = got[c * 4 + 2], sign = got[c * 4 + 3];
            const len = Math.hypot(tx, ty, tz);
            if (Math.abs(len - 1) > 1e-3) badUnit++;
            const vi = mesh.indices[c];   // c already indexes triangle-corner order == index-buffer order
            const nx = mesh.normals[vi * 3], ny = mesh.normals[vi * 3 + 1], nz = mesh.normals[vi * 3 + 2];
            if (Math.abs(tx * nx + ty * ny + tz * nz) > 1e-3) badPerp++;
            if (sign !== 1 && sign !== -1) badSign++;
        }
    }
    ok("!! every tangent is unit length", badUnit === 0, `${badUnit} of ${totalCorners} corners off by >1e-3`);
    ok("!! every tangent is perpendicular to its own vertex normal (the Gram-Schmidt projection actually ran)",
        badPerp === 0, `${badPerp} of ${totalCorners} corners with |T.N| > 1e-3`);
    ok("!! sign is always exactly +1 or -1, never anything else", badSign === 0, `${badSign} of ${totalCorners} corners`);
}

console.log("\n4. bitangentFromTangent -- the documented reconstruction, orthogonal to both N and T");
{
    let bad = 0, n = 0;
    for (const { mesh, got } of Object.values(MINE)) {
        const nt = mesh.indices.length / 3;
        for (let c = 0; c < nt * 3; c++) {
            n++;
            const vi = mesh.indices[c];
            const nx = mesh.normals[vi * 3], ny = mesh.normals[vi * 3 + 1], nz = mesh.normals[vi * 3 + 2];
            const tx = got[c * 4], ty = got[c * 4 + 1], tz = got[c * 4 + 2], sign = got[c * 4 + 3];
            const [bx, by, bz] = bitangentFromTangent(nx, ny, nz, tx, ty, tz, sign);
            const bLen = Math.hypot(bx, by, bz);
            const dotN = bx * nx + by * ny + bz * nz, dotT = bx * tx + by * ty + bz * tz;
            if (Math.abs(bLen - 1) > 1e-3 || Math.abs(dotN) > 1e-3 || Math.abs(dotT) > 1e-3) bad++;
        }
    }
    ok("!! bitangent is unit length and perpendicular to both N and T on every corner", bad === 0, `${bad} of ${n} corners`);

    // *** ORTHOGONALITY ALONE CANNOT SEE A HANDEDNESS BUG. *** Any unit vector orthogonal to two orthogonal
    // unit vectors N and T is EITHER cross(N,T) or its negation cross(T,N) -- so the check above would pass
    // just as happily on a swapped-operand-order cross product, which flips every binormal a future normal-
    // mapping consumer would compute. Pin the EXACT component values against a hand-derived example instead
    // of only orthogonality+unit-length: cross((0,0,1),(1,0,0)) = (0*0-1*0, 1*1-0*0, 0*0-0*1) = (0,1,0).
    const [hx, hy, hz] = bitangentFromTangent(0, 0, 1, 1, 0, 0, 1);
    ok("!! bitangentFromTangent(N=(0,0,1), T=(1,0,0), sign=1) is EXACTLY (0,1,0), not (0,-1,0) -- pins cross(N,T) vs. cross(T,N)",
        Math.abs(hx) < 1e-9 && Math.abs(hy - 1) < 1e-9 && Math.abs(hz) < 1e-9, `got (${hx}, ${hy}, ${hz})`);
    const [hx2, hy2, hz2] = bitangentFromTangent(0, 0, 1, 1, 0, 0, -1);
    ok("!! ...and sign=-1 negates it to exactly (0,-1,0)",
        Math.abs(hx2) < 1e-9 && Math.abs(hy2 + 1) < 1e-9 && Math.abs(hz2) < 1e-9, `got (${hx2}, ${hy2}, ${hz2})`);
}

console.log("\n5. output shape -- exactly one [tx,ty,tz,sign] per triangle corner, unindexed");
{
    let ok5 = true, detail = "";
    for (const [name, { mesh, got }] of Object.entries(MINE)) {
        const expected = mesh.indices.length * 4;
        if (got.length !== expected) { ok5 = false; detail = `${name}: got ${got.length}, expected ${expected}`; break; }
    }
    ok("!! output length is indices.length*4 for every fixture", ok5, detail || `${Object.keys(MINE).length} fixtures checked`);
}

console.log("\n6. degenerate-triangle fallback: a zero-UV-area triangle still gets a valid unit tangent");
{
    // A "triangle" whose three UVs are collinear (zero UV area) -- degenerate per faceDegenerate's own test.
    // Its one non-degenerate neighbor (sharing 2 of its 3 vertices, same position+normal+uv at the shared
    // corners) should hand it a real tangent via the shared weld group; here there IS no such neighbor, so
    // this exercises the orthogonalTo() fallback specifically.
    //
    // *** ONE FIXED NORMAL EXERCISES ONLY ONE OF orthogonalTo's THREE BRANCHES. *** A single (0,0,1) fixture
    // only ever takes the "z is not the smallest component" path -- a hardcoded, input-ignoring stub
    // (`return [1,0,0]` regardless of nx/ny/nz) happens to be unit-length and perpendicular to THAT one
    // normal and would still pass. Three normals, one per dominant axis, are run through the SAME degenerate
    // shape so all three of orthogonalTo's branches (x-, y-, z-smallest) actually fire, and the returned
    // vector is checked against each fixture's OWN normal rather than a value hardcoded for just one of them.
    for (const [label, nrm] of [["N=(0,0,1)", [0, 0, 1]], ["N=(1,0,0)", [1, 0, 0]], ["N=(0,1,0)", [0, 1, 0]]]) {
        const positions = Float64Array.from([0, 0, 0, 1, 0, 0, 2, 0, 0]);
        const normals = Float64Array.from([...nrm, ...nrm, ...nrm]);
        const uvs = Float64Array.from([0, 0, 0.5, 0, 1, 0]);   // collinear in UV -> zero signed area
        const indices = Uint32Array.from([0, 1, 2]);
        const got = computeTangents(positions, normals, uvs, indices);
        let allUnit = true, allPerp = true;
        for (let c = 0; c < 3; c++) {
            const tx = got[c * 4], ty = got[c * 4 + 1], tz = got[c * 4 + 2];
            if (Math.abs(Math.hypot(tx, ty, tz) - 1) > 1e-6) allUnit = false;
            if (Math.abs(tx * nrm[0] + ty * nrm[1] + tz * nrm[2]) > 1e-6) allPerp = false;
        }
        ok(`!! a wholly-degenerate triangle with ${label} (no non-degenerate neighbor) still returns a unit, N-perpendicular fallback tangent`,
            allUnit && allPerp, JSON.stringify(Array.from(got)));
    }
}

console.log("\n7. *** AND WHEN A BINARY IS ALREADY THERE, THE RECORD IS RE-DERIVED RATHER THAN TRUSTED ***");
{
    const bin = R.binaryIfCurrent();
    if (!bin) {
        console.log("  NOTE  no current mikktRef binary in the temp cache -- the record was NOT re-derived this run. " +
            "Section 1's hashes are what stands in, and `node tools/mesh/mikktRef.mjs --record` after `--build` " +
            "is what refreshes the record.");
        ok("the gate is not vacuous without a compiler: every fixture ran in sections 2-6",
            Object.keys(MINE).length === Object.keys(REC.meshes).length,
            `${Object.keys(MINE).length} fixtures graded against the record on this run.`);
    } else {
        let diffs = 0;
        for (const [name, make] of Object.entries(R.FIXTURES)) {
            const m = make();
            const live = R.run(m.positions, m.normals, m.uvs, m.indices, { bin });
            const recorded = REC.meshes[name].tangents;
            let bad = false;
            for (let i = 0; i < live.length; i++) if (Math.abs(live[i] - recorded[i]) > 1e-4) { bad = true; break; }
            if (bad) diffs++;
        }
        ok("!! *** the recorded reference reproduces exactly, which is also what says mikktspace.c is deterministic ***",
            diffs === 0, `${Object.keys(R.FIXTURES).length} fixtures re-run through the built binary at ${bin}, ${diffs} disagreeing with the record.`);
    }
}

REPORT.write();
console.log("\n" + (fails ? `FAIL -- ${fails} check(s)` : "ALL GREEN") +
    "\nunchecked here, and named in physics/mesh/mikktSpace.mjs's own header as a deliberate scope cut: quad-" +
    "face input (this engine's meshes are already triangle-only); the reference's edge-connectivity 4-rule-" +
    "group flood fill for a welded vertex shared by topologically DISCONNECTED same-winding triangle fans " +
    "(a non-manifold pinch point -- none of this gate's fixtures are non-manifold); the angle-threshold hard-" +
    "edge subgroup split (disabled by default in the reference itself); and the reference's own elaborate " +
    "DegenEpilogue donor-triangle search, in place of this module's simpler deterministic-orthonormal-basis " +
    "fallback. Also unchecked: no live caller exists yet -- gpu/GLBParser.js reads no TANGENT accessor and " +
    "render/EntityMeshRenderer.js's cotangentFrame needs none, per this round's own backlog entry.");
process.exit(fails ? 1 : 0);
