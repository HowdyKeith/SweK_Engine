// WebGLEngine/brain/pilotSubFish.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE FISH'S CIRCUIT AS THE SUBMARINE'S PILOT, AND THE CONTROL THAT SAYS WHAT THE WIRING DID: brain/pilotSubPolicy.mjs's createSubPolicy() takes any circuit as a parameter, and this file makes two more of it.
//
//   FISH     the 34-neuron, 153-synapse core of the Fish1 larval-zebrafish connectome's TEN analysis set (brain/zebrafishTopology.mjs, baked from vendor/zebrafish/fish1-ten-core.json; vendor/zebrafish/PROVENANCE.md says
//            where it came from and what it is: mostly inputs to the dorsal motor nucleus of the vagus, the densest real wiring in a package that was open, NOT a circuit anybody has shown steers a body). 14 x 34 + 34 + 153 + 34 x 4 + 4 = 803 weights.
//   CONTROL  a RANDOM circuit of the fish's size: 34 neurons and 153 edges, the edges drawn uniformly (no self-loop, no repeat) from a seed. It exists for one question the fly's result could not answer: is anything a real
//            connectome's wiring does, in this role, different from what ANY sparse recurrent core of that size does? One draw, seed 4242, and it is one draw: a difference from it is a hint and not a measurement.
//
// What a circuit does here is set WHICH recurrent weights may exist; the hand weights are the PD autopilot's laws written through the network (the recurrent core is zero at the start, so all three pilots START as the same
// pilot), and training moves them. A result says what a connectome-shaped recurrent core costs or buys over the PD laws -- not that a fish can pilot a submarine. Pure: no I/O, no clock, no Math.random.
"use strict";
import { createSubPolicy, mulberry } from "./pilotSubPolicy.mjs";
import * as ZF from "./zebrafishTopology.mjs";

/** A random circuit with the neuron count and the edge count of `topo`: edges [toIdx, fromIdx] drawn uniformly without a self-loop or a repeat. Deterministic for a seed. */
export function controlTopology(topo, seed = 4242) {
    const n = topo.NEURON_ORDER.length, m = topo.EDGES.length, rng = mulberry(seed), seen = new Set(), edges = [];
    if (m > n * (n - 1)) throw new Error(`pilotSubFish.controlTopology: ${m} edges do not fit among ${n} neurons`);
    while (edges.length < m) {
        const to = Math.floor(rng() * n), from = Math.floor(rng() * n), key = to * n + from;
        if (to === from || seen.has(key)) continue;
        seen.add(key); edges.push([to, from]);
    }
    return Object.freeze({ NEURON_ORDER: Object.freeze(Array.from({ length: n }, (_, i) => 9000 + i)), EDGES: Object.freeze(edges) });
}
export const CONTROL_SEED = 4242;
export const FISH = createSubPolicy(ZF, "the Fish1 TEN-analysis core");
export const CONTROL_TOPOLOGY = controlTopology(ZF, CONTROL_SEED);
export const CONTROL = createSubPolicy(CONTROL_TOPOLOGY, "a random circuit of the fish circuit's size");

export function reportLines() {
    return [...FISH.reportLines(), ...CONTROL.reportLines()];
}
if (typeof process !== "undefined" && Array.isArray(process.argv)) {
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) { for (const l of reportLines()) console.log(l); process.exit(0); }
}
