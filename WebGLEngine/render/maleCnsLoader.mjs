// WebGLEngine/render/maleCnsLoader.mjs
//
// Turns the vendored male-cns connectome (vendor/male-cns/giant-fiber-circuit.json, baked by
// tools/maleCnsBake.mjs) into per-neuron line-list meshes via render/fleets.mjs's polylinesToMesh().
//
// Each SWC skeleton is a PARENT-INDEXED TREE, not a simple polyline -- a neuron branches. polylinesToMesh
// builds a line-LIST (index pairs), not a strip, so there is no rendering benefit to walking branch chains
// into longer polylines: one 2-point polyline per parent-child edge is exactly as correct and far simpler.
// The cost is a modest position-buffer duplication (an internal point is repeated once per edge it touches,
// typically 2-3x) rather than the ~1x a chain-walk would give -- roughly 117k vs 58k float3s for this
// circuit, well within what either GPU backend renders as a static draw.
//
// Deliberately NOT reused: render/fleets.mjs's "ink" look / INK_WGSL and render/gpuDriven.mjs's instanced
// fleet pipeline. Both exist to draw many moving, per-instance-colored entities (a fleet of ships); this is
// one static anatomical dataset with one color per neuron, so a caller draws these meshes with a plain,
// non-instanced gfx/device.js pipeline instead (see fly-connectome.html).
import { polylinesToMesh } from "./fleets.mjs";

const TARGET_EXTENT = 3.0; // world units the circuit's longest axis is scaled to span

const TYPE_COLORS = Object.freeze({
    GFC1: Object.freeze([0.95, 0.35, 0.25, 1]),
    GFC2: Object.freeze([0.30, 0.75, 0.95, 1]),
    GFC3: Object.freeze([0.45, 0.90, 0.45, 1]),
    GFC4: Object.freeze([0.80, 0.45, 0.95, 1]),
});
const DEFAULT_COLOR = Object.freeze([0.7, 0.7, 0.7, 1]);

export function colorForType(type) {
    return TYPE_COLORS[type] || DEFAULT_COLOR;
}

/**
 * A neuron's display color for a given real activation value: dim at its base type color when inactive,
 * blending toward `hot` (white by default) as activation rises. Squashed with tanh(activation / scale) rather
 * than a linear map -- brain/gunnerPolicy.mjs's own recurrent core can produce activations from 0 into the
 * hundreds (measured directly while baking tools/bakeGunnerTrace.mjs's demo trace), and a linear map would
 * leave everything below a handful of units looking identical while one runaway unit saturates the display.
 * `activation` is assumed >= 0 (every hidden value here comes out of a relu); a negative input is clamped.
 * NOT clamped: the output color components. With `dim <= 1`, `hot` components in [0,1], and `baseColor`
 * components in [0,1] -- true of every caller in this codebase today -- the result stays in [0,1] by
 * construction (each component is a convex combination of two [0,1] values). A caller that ever passes
 * `dim > 1` or a `hot`/`baseColor` component above 1 would get an out-of-range value with nothing here to
 * catch it.
 */
export function activationColor(baseColor, activation, { scale = 30, dim = 0.15, hot = [1, 1, 1] } = {}) {
    const t = Math.tanh(Math.max(0, activation) / scale);
    return [
        baseColor[0] * dim * (1 - t) + hot[0] * t,
        baseColor[1] * dim * (1 - t) + hot[1] * t,
        baseColor[2] * dim * (1 - t) + hot[2] * t,
        baseColor[3] ?? 1,
    ];
}

/** Bounding box, center and a uniform scale that fits the whole circuit's longest axis to TARGET_EXTENT. */
export function maleCnsBounds(data) {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const n of data.neurons) {
        for (let i = 0; i < n.pointCount; i++) {
            for (let a = 0; a < 3; a++) {
                const v = n.xyz[i * 3 + a];
                if (v < min[a]) min[a] = v;
                if (v > max[a]) max[a] = v;
            }
        }
    }
    const center = [0, 1, 2].map((a) => (min[a] + max[a]) / 2);
    const extent = [0, 1, 2].map((a) => max[a] - min[a]);
    const scale = TARGET_EXTENT / Math.max(...extent, 1e-6);
    return { min, max, center, extent, scale };
}

/**
 * One line-list mesh per neuron, centered on the circuit's own center and scaled to TARGET_EXTENT, colored
 * by GFC type. Each mesh is ready for gfx/device.js: { positions: Float32Array, indices: Uint32Array,
 * color: [r,g,b,a] } plus the neuron's own bodyId/type/instance/pre/post for a picker UI.
 */
export function maleCnsNeuronMeshes(data, bounds = maleCnsBounds(data)) {
    const { center, scale } = bounds;
    return data.neurons.map((n) => {
        const polylines = [];
        for (let i = 0; i < n.pointCount; i++) {
            const p = n.parent[i];
            if (p === -1) continue; // root point: no parent edge
            const ax = (n.xyz[i * 3] - center[0]) * scale, ay = (n.xyz[i * 3 + 1] - center[1]) * scale, az = (n.xyz[i * 3 + 2] - center[2]) * scale;
            const bx = (n.xyz[p * 3] - center[0]) * scale, by = (n.xyz[p * 3 + 1] - center[1]) * scale, bz = (n.xyz[p * 3 + 2] - center[2]) * scale;
            polylines.push([[bx, by, bz], [ax, ay, az]]);
        }
        const mesh = polylinesToMesh(polylines, { color: colorForType(n.type), normalize: false });
        return { bodyId: n.bodyId, type: n.type, instance: n.instance, pre: n.pre, post: n.post, mesh };
    });
}

/** Within-circuit synaptic edges for a given bodyId, both directions, heaviest first -- for a picker's detail panel. */
export function maleCnsConnections(data, bodyId) {
    const out = data.edges
        .filter((e) => e[0] === bodyId || e[1] === bodyId)
        .map(([from, to, weight]) => ({ from, to, weight, direction: from === bodyId ? "out" : "in" }));
    out.sort((a, b) => b.weight - a.weight);
    return out;
}

export function maleCnsNeuronByBodyId(data, bodyId) {
    return data.neurons.find((n) => n.bodyId === bodyId) || null;
}
