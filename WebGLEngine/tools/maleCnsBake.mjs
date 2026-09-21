// WebGLEngine/tools/maleCnsBake.mjs
//
// Run: node tools/maleCnsBake.mjs --in <raw-neuprint-fetch.json> [--out vendor/male-cns/giant-fiber-circuit.json]
//
// Converts the raw JSON produced by a local run of the Neuprint fetch script (see the fly-connectome
// integration work) into the compact vendored shape SweK actually ships and loads at runtime.
//
// The raw fetch encodes each SWC skeleton point as an object ({id,type,x,y,z,radius,parent}) -- readable,
// but bulky: ~11 MB for 34 neurons / 58k points, almost entirely repeated key names. This bake step
// flattens each neuron's skeleton into parallel arrays (xyz, radius, kind, parent) addressed by point
// index, which both shrinks the vendored file and matches the typed-array shape the loader wants to hand
// to render/fleets.mjs's polylinesToMesh(). A point's `parent` here is a 0-based index into that SAME
// neuron's own arrays (-1 for a root), NOT the original SWC id -- the raw ids are sequential from 1 within
// each neuron (verified against the actual fetch before relying on it), so `parent - 1` is exact.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function arg(name, fallback) {
    const i = process.argv.indexOf(`--${name}`);
    return i === -1 ? fallback : process.argv[i + 1];
}

const inPath = arg("in");
if (!inPath) {
    console.error("usage: node tools/maleCnsBake.mjs --in <raw-neuprint-fetch.json> [--out vendor/male-cns/giant-fiber-circuit.json]");
    process.exit(1);
}
const outPath = path.resolve(ROOT, arg("out", "vendor/male-cns/giant-fiber-circuit.json"));

const raw = JSON.parse(fs.readFileSync(path.resolve(inPath), "utf8"));

if (!Array.isArray(raw.neurons) || raw.neurons.length === 0) throw new Error("maleCnsBake: raw fetch has no neurons");
if (!Array.isArray(raw.edges)) throw new Error("maleCnsBake: raw fetch has no edges array");

const bodyIds = new Set(raw.neurons.map((n) => n.bodyId));

const neurons = raw.neurons.map((n) => {
    const skeleton = n.skeleton;
    if (!Array.isArray(skeleton) || skeleton.length === 0) {
        throw new Error(`maleCnsBake: neuron ${n.bodyId} has no skeleton points`);
    }
    // Verify the id-is-sequential-from-1 assumption this bake relies on, rather than trusting it silently.
    skeleton.forEach((p, i) => {
        if (p.id !== i + 1) throw new Error(`maleCnsBake: neuron ${n.bodyId} skeleton id ${p.id} is not sequential at index ${i} -- parent-index remap is unsafe`);
    });

    const xyz = new Array(skeleton.length * 3);
    const radius = new Array(skeleton.length);
    const kind = new Array(skeleton.length);
    const parent = new Array(skeleton.length);
    skeleton.forEach((p, i) => {
        xyz[i * 3] = p.x;
        xyz[i * 3 + 1] = p.y;
        xyz[i * 3 + 2] = p.z;
        radius[i] = p.radius;
        kind[i] = p.type;
        parent[i] = p.parent === -1 ? -1 : p.parent - 1;
    });

    return {
        bodyId: n.bodyId,
        type: n.type,
        instance: n.instance,
        pre: n.pre,
        post: n.post,
        pointCount: skeleton.length,
        xyz,
        radius,
        kind,
        parent,
    };
});

const edges = raw.edges.map((e) => {
    if (!bodyIds.has(e.from) || !bodyIds.has(e.to)) {
        throw new Error(`maleCnsBake: edge ${e.from}->${e.to} references a bodyId outside the vendored neuron set`);
    }
    return [e.from, e.to, e.weight];
});

const baked = {
    dataset: raw.dataset,
    server: raw.server,
    fetchedAt: raw.fetchedAt,
    license: raw.license,
    citation: raw.citation,
    typePattern: raw.typePattern,
    neuronCount: neurons.length,
    edgeCount: edges.length,
    neurons,
    edges,
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(baked));

const rawBytes = fs.statSync(path.resolve(inPath)).size;
const bakedBytes = fs.statSync(outPath).size;
console.log(`[maleCnsBake] ${neurons.length} neurons, ${edges.length} edges, ${neurons.reduce((s, n) => s + n.pointCount, 0)} skeleton points`);
console.log(`[maleCnsBake] ${rawBytes} bytes raw -> ${bakedBytes} bytes baked (${(100 * bakedBytes / rawBytes).toFixed(1)}%)`);
console.log(`[maleCnsBake] wrote ${path.relative(ROOT, outPath)}`);
