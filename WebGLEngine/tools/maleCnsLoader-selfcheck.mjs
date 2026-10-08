// WebGLEngine/tools/maleCnsLoader-selfcheck.mjs
//
// Run: node tools/maleCnsLoader-selfcheck.mjs
//
// GATES vendor/male-cns/giant-fiber-circuit.json (the baked output of tools/maleCnsBake.mjs) and
// render/maleCnsLoader.mjs, the module that turns it into per-neuron line-list meshes for fly-connectome.html.
//
// Two things could be wrong and only one shows up by looking at the real data: the vendored file could drift
// from what PROVENANCE.md claims about it (a stale count, same species as case-study.html's baked gate count
// this tree has been bitten by before), or the loader's parent-index remap / centering / scaling could be
// subtly wrong in a way that "looks like neurons" without being the right shape. Section 2 checks the former
// against the real file; section 3 checks the latter against a hand-built fixture where every output number
// is known in advance, since the real data has no independent ground truth to compare against.
//
// SABOTAGE LOG: section 3 was tested by changing render/maleCnsLoader.mjs's edge-endpoint lookup from
// `n.xyz[p * 3]` (the parent's own position) to `n.xyz[i * 3]` (the child's, a plausible copy-paste of the
// line just above it) -- every edge collapsed to a zero-length segment at the child's own position, and both
// "transformed positions are EXACTLY the hand-computed..." checks went red as expected. Reverted.
// Section 4 (activationColor) was tested by hardcoding its interpolation factor `t` to 0 (activation never
// reaches `hot`, always the dim floor) -- 3 of section 4's 6 checks went red (saturation, custom-hot, and the
// scale-sensitivity check), and separately tools/ship/flyConnectomePage-selfcheck.mjs's own real-GPU-pixel
// check for the gunner replay's brightest recorded moment went red too (0 near-white pixels instead of the
// expected 777) -- the same sabotage caught by a pure-function test and by an independent offscreen render.
// Reverted.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { maleCnsBounds, maleCnsNeuronMeshes, maleCnsConnections, maleCnsNeuronByBodyId, colorForType, activationColor } from "../render/maleCnsLoader.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };

console.log("maleCnsLoader-selfcheck -- the vendored data's own shape, and the loader against a known fixture\n");

// ---------------------------------------------------------------------------
console.log("1. *** THE VENDORED FILE EXISTS AND MATCHES WHAT IT CLAIMS ***");
const DATA_PATH = path.join(ROOT, "vendor", "male-cns", "giant-fiber-circuit.json");
const PROV_PATH = path.join(ROOT, "vendor", "male-cns", "PROVENANCE.md");
let data = null;
{
    ok("vendor/male-cns/giant-fiber-circuit.json exists", fs.existsSync(DATA_PATH));
    ok("vendor/male-cns/PROVENANCE.md exists", fs.existsSync(PROV_PATH));
    if (fs.existsSync(DATA_PATH)) {
        data = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
        ok("dataset is male-cns:v1.0", data.dataset === "male-cns:v1.0", String(data.dataset));
        ok("license is stated", typeof data.license === "string" && data.license.length > 0, String(data.license));
        ok("neuronCount matches neurons.length", data.neuronCount === data.neurons.length,
            `claimed ${data.neuronCount}, actual ${data.neurons.length}`);
        ok("edgeCount matches edges.length", data.edgeCount === data.edges.length,
            `claimed ${data.edgeCount}, actual ${data.edges.length}`);
        ok("!! 34 neurons -- the Giant Fiber Circuit's own known size (GFC1:3 GFC2:10 GFC3:13 GFC4:8)",
            data.neurons.length === 34, String(data.neurons.length));
        const counts = { GFC1: 0, GFC2: 0, GFC3: 0, GFC4: 0 };
        for (const n of data.neurons) counts[n.type] = (counts[n.type] || 0) + 1;
        ok("!! type counts match PROVENANCE.md's table exactly",
            counts.GFC1 === 3 && counts.GFC2 === 10 && counts.GFC3 === 13 && counts.GFC4 === 8, JSON.stringify(counts));
        ok("every edge references a bodyId inside this 34-neuron set (no dangling connectivity)",
            data.edges.every(([from, to]) => data.neurons.some((n) => n.bodyId === from) && data.neurons.some((n) => n.bodyId === to)));
        ok("every neuron's array lengths agree with its own pointCount",
            data.neurons.every((n) => n.xyz.length === n.pointCount * 3 && n.radius.length === n.pointCount && n.kind.length === n.pointCount && n.parent.length === n.pointCount));
        // !! NOT "exactly one root": 2 of the 34 real neurons (906088, 810440, both GFC3) genuinely have TWO
        // parent===-1 points -- a disconnected second fragment in the traced skeleton, real biological
        // tracing data rather than corruption. Checked by hand against the vendored file before relaxing
        // this from an earlier "exactly one" assertion that failed on exactly those two.
        ok("every neuron has at least one root (parent === -1) -- zero would mean an unparseable/corrupt tree",
            data.neurons.every((n) => n.parent.filter((p) => p === -1).length >= 1));
    }
}

// ---------------------------------------------------------------------------
console.log("\n2. *** THE LOADER AGAINST THE REAL DATA (SHAPE ONLY -- SECTION 3 IS THE GROUND TRUTH) ***");
if (data) {
    const bounds = maleCnsBounds(data);
    ok("bounds.scale is positive and finite", Number.isFinite(bounds.scale) && bounds.scale > 0, String(bounds.scale));
    const meshes = maleCnsNeuronMeshes(data, bounds);
    ok("one mesh per neuron", meshes.length === data.neurons.length);
    ok("every mesh's indices stay inside its own positions", meshes.every((m) => {
        const nv = m.mesh.positions.length / 3;
        return m.mesh.indices.every((ix) => ix >= 0 && ix < nv);
    }));
    ok("every mesh has one edge (2 points) per non-root skeleton point", meshes.every((m, i) => {
        const nonRoot = data.neurons[i].parent.filter((p) => p !== -1).length;
        return m.mesh.indices.length === nonRoot * 2;
    }));
    const conns = maleCnsConnections(data, data.neurons[0].bodyId);
    ok("maleCnsConnections returns only edges touching the requested bodyId",
        conns.every((c) => c.from === data.neurons[0].bodyId || c.to === data.neurons[0].bodyId));
    ok("...sorted heaviest first", conns.every((c, i) => i === 0 || conns[i - 1].weight >= c.weight));
}

// ---------------------------------------------------------------------------
console.log("\n3. *** A HAND-BUILT FIXTURE WHERE EVERY OUTPUT NUMBER IS KNOWN IN ADVANCE ***");
{
    // Neuron A: a 4-point "Y" -- root, one child, that child forking into two. Type is a real GFC key, to
    // check the color table is actually consulted rather than a fixed color always coming out.
    // Neuron B: a 2-point straight line with an unrecognised type, to check the DEFAULT_COLOR fallback.
    const fixture = {
        neurons: [
            { bodyId: 1001, type: "GFC1", instance: "A", pre: 5, post: 7, pointCount: 4,
              xyz: [0, 0, 0,  0, 1, 0,  -1, 2, 0,  1, 2, 0], radius: [1, 1, 1, 1], kind: [0, 0, 0, 0], parent: [-1, 0, 1, 1] },
            { bodyId: 1002, type: "SOMETHING_UNKNOWN", instance: "B", pre: 1, post: 2, pointCount: 2,
              xyz: [10, 10, 10,  10, 11, 10], radius: [1, 1], kind: [0, 0], parent: [-1, 0] },
        ],
        edges: [[1001, 1002, 5]],
    };

    const bounds = maleCnsBounds(fixture);
    // min=(-1,0,0) max=(10,11,10) by inspection of the 6 points above.
    ok("!! bounds.min is exact", bounds.min[0] === -1 && bounds.min[1] === 0 && bounds.min[2] === 0, JSON.stringify(bounds.min));
    ok("!! bounds.max is exact", bounds.max[0] === 10 && bounds.max[1] === 11 && bounds.max[2] === 10, JSON.stringify(bounds.max));
    ok("!! bounds.center is exact", bounds.center[0] === 4.5 && bounds.center[1] === 5.5 && bounds.center[2] === 5,
        JSON.stringify(bounds.center));
    ok("!! bounds.extent is exact", bounds.extent[0] === 11 && bounds.extent[1] === 11 && bounds.extent[2] === 10,
        JSON.stringify(bounds.extent));
    ok("!! bounds.scale fits the longest axis (11) to TARGET_EXTENT (3.0)", Math.abs(bounds.scale - 3 / 11) < 1e-12,
        String(bounds.scale));

    const meshes = maleCnsNeuronMeshes(fixture, bounds);
    const A = meshes.find((m) => m.bodyId === 1001), B = meshes.find((m) => m.bodyId === 1002);

    ok("!! neuron A gets exactly 3 edges (root->child, child->left, child->right), never a chain", A.mesh.indices.length === 6,
        String(A.mesh.indices.length));
    ok("...as 3 independent 2-point polylines, indices [0,1,2,3,4,5]", A.mesh.indices.join(",") === "0,1,2,3,4,5");

    const tf = (x, y, z) => [(x - bounds.center[0]) * bounds.scale, (y - bounds.center[1]) * bounds.scale, (z - bounds.center[2]) * bounds.scale];
    const p0 = tf(0, 0, 0), p1 = tf(0, 1, 0), p2 = tf(-1, 2, 0), p3 = tf(1, 2, 0);
    const expectedA = [...p0, ...p1, ...p1, ...p2, ...p1, ...p3]; // edge(0,1) edge(1,2) edge(1,3), in point-index order
    // 1e-6, not 1e-9: mesh.positions is a Float32Array (polylinesToMesh's own Float32Array.from), and the
    // expected values here are computed in f64 -- a ~2e-8 rounding gap at these magnitudes is float32 doing
    // its job, not a bug. Measured directly before picking this bound: the first version of this check used
    // 1e-9 and failed on exactly that rounding, on values that printed identically at 7 significant figures.
    const closeArr = (a, b) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 1e-6);
    ok("!! neuron A's transformed positions are EXACTLY the hand-computed center+scale of its raw points, in edge order",
        closeArr(Array.from(A.mesh.positions), expectedA));

    ok("!! neuron B (a straight 2-point line) gets exactly 1 edge", B.mesh.indices.length === 2);
    const q0 = tf(10, 10, 10), q1 = tf(10, 11, 10);
    ok("!! neuron B's transformed positions match the hand-computed center+scale", closeArr(Array.from(B.mesh.positions), [...q0, ...q1]));

    ok("!! neuron A is colored by its GFC1 type entry, not a default", JSON.stringify(A.mesh.color) === JSON.stringify(colorForType("GFC1")));
    ok("!! neuron B falls back to the default color for an unrecognised type",
        JSON.stringify(B.mesh.color) === JSON.stringify(colorForType("SOMETHING_UNKNOWN")) &&
        JSON.stringify(B.mesh.color) !== JSON.stringify(colorForType("GFC1")));

    const connA = maleCnsConnections(fixture, 1001), connB = maleCnsConnections(fixture, 1002);
    ok("!! the one fixture edge reads OUT from A's own side", connA.length === 1 && connA[0].direction === "out" && connA[0].weight === 5);
    ok("!! ...and IN from B's own side", connB.length === 1 && connB[0].direction === "in" && connB[0].weight === 5);

    ok("maleCnsNeuronByBodyId finds the right raw neuron by id", maleCnsNeuronByBodyId(fixture, 1002).instance === "B");
    ok("...and returns null for a bodyId that is not in the set", maleCnsNeuronByBodyId(fixture, 9999) === null);
}

console.log("\n4. *** activationColor -- fly-connectome.html's gunner-replay mode colors these same meshes by real activation ***");
{
    const base = [0.3, 0.75, 0.95, 1], close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

    ok("!! activation 0 is EXACTLY base color x dim (no color component escapes the floor)",
        (() => { const c = activationColor(base, 0, { scale: 10, dim: 0.2 }); return close(c[0], base[0] * 0.2) && close(c[1], base[1] * 0.2) && close(c[2], base[2] * 0.2) && c[3] === base[3]; })());
    ok("!! a very large activation saturates toward `hot`, not past it", (() => { const c = activationColor(base, 1e9, { scale: 10, hot: [1, 1, 1] }); return c.every((v, i) => i === 3 || close(v, 1, 1e-6)); })());
    ok("!! a custom hot color is reached at saturation, not always white", (() => { const c = activationColor(base, 1e9, { scale: 10, hot: [1, 0, 0] }); return close(c[0], 1, 1e-6) && close(c[1], 0, 1e-6) && close(c[2], 0, 1e-6); })());
    ok("monotonic in activation: more activation is never a dimmer color", (() => {
        let prev = -1;
        for (const a of [0, 1, 5, 10, 30, 100, 1000]) { const c = activationColor(base, a, { scale: 10 }); const bright = c[0] + c[1] + c[2]; if (bright < prev - 1e-9) return false; prev = bright; }
        return true;
    })());
    ok("!! a negative activation (should never happen -- every real hidden value here comes out of a relu) clamps to the same floor as 0, rather than going darker or inverting",
        (() => { const c0 = activationColor(base, 0, { scale: 10 }), cn = activationColor(base, -50, { scale: 10 }); return c0.every((v, i) => close(v, cn[i])); })());
    ok("!! the SAME activation reads brighter under a smaller scale -- this is why tools/bakeGunnerTrace.mjs bakes each trace's own MEAN nonzero activation as its scale (~0.66 hand vs ~83.5 trained, ~126x apart) rather than sharing one fixed number across a hand gunner (peak ~1) and a trained one (peak ~263)",
        (() => { const wide = activationColor(base, 5, { scale: 100 }), narrow = activationColor(base, 5, { scale: 2 }); return (narrow[0] + narrow[1] + narrow[2]) > (wide[0] + wide[1] + wide[2]); })());
}

console.log("\n" + (fails ? `${fails} FAILED` : "ALL PASS"));
process.exit(fails ? 1 : 0);
