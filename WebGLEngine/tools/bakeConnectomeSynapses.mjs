// WebGLEngine/tools/bakeConnectomeSynapses.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/bakeConnectomeSynapses.mjs --in vendor/male-cns/<circuit>.json --topology brain/<x>Topology.mjs --out brain/<x>Synapses.mjs [--write]
//
// THE REST OF A VENDORED CIRCUIT, FOR A MODULE THAT RUNS IN A BROWSER. tools/bakeConnectomeTopology.mjs bakes who connects to whom; it leaves out HOW MANY synapses a connection has, each neuron's predicted transmitter and the side of its cell body, because no network in the tree used them: every synapse weight was
// learned. brain/flySteering.mjs uses them (the connectome's own weights, signed by transmitter), and a module the page loads cannot read a file. This writes them as arrays ALIGNED WITH THE BAKED TOPOLOGY: EDGE_COUNTS[k] is the synapse count of that topology's EDGES[k]; NEURON_NT[i] and NEURON_SOMA[i] are for its
// NEURON_ORDER[i]. It refuses a vendored file whose neurons or edges are not that topology's, in its order. A bake run by hand; without --write it only says what it would write.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const arg = (k) => { const i = process.argv.indexOf("--" + k); return i < 0 ? null : process.argv[i + 1]; }, inArg = arg("in"), topoArg = arg("topology"), outArg = arg("out");
    if (!inArg || !topoArg || !outArg) { console.error("bakeConnectomeSynapses: --in <vendored json>, --topology <brain/*Topology.mjs> and --out <brain/*Synapses.mjs> are required"); process.exit(2); }
    const V = JSON.parse(fs.readFileSync(inArg, "utf8")), T = await import(pathToFileURL(path.resolve(topoArg)).href), idx = new Map(V.neurons.map((n, i) => [n.bodyId, i]));
    if (T.NEURON_ORDER.join() !== V.neurons.map((n) => n.bodyId).join()) throw new Error("bakeConnectomeSynapses: the topology's neurons are not the vendored file's, in its order");
    if (T.EDGES.length !== V.edges.length || !T.EDGES.every(([to, from], k) => to === idx.get(V.edges[k][1]) && from === idx.get(V.edges[k][0]))) throw new Error("bakeConnectomeSynapses: the topology's edges are not the vendored file's, in its order");
    if (!V.neurons.every((n) => typeof n.nt === "string" && n.nt && (n.somaSide === "L" || n.somaSide === "R"))) throw new Error("bakeConnectomeSynapses: every neuron needs a predicted transmitter (`nt`) and a soma side; re-extract with --neurotransmitters");
    const text = `// WebGLEngine/${outArg.replace(/\\/g, "/")} -- BAKED by tools/bakeConnectomeSynapses.mjs from ${inArg.replace(/\\/g, "/")}; do not edit by hand.\n// Aligned with ${topoArg.replace(/\\/g, "/")}: EDGE_COUNTS[k] is the synapse count of its EDGES[k]; NEURON_NT[i] (the release's PREDICTED transmitter, a classifier's call) and NEURON_SOMA[i] are for its NEURON_ORDER[i].\n"use strict";\nexport const EDGE_COUNTS = Object.freeze(${JSON.stringify(V.edges.map((e) => e[2]))});\nexport const NEURON_NT = Object.freeze(${JSON.stringify(V.neurons.map((n) => n.nt))});\nexport const NEURON_SOMA = Object.freeze(${JSON.stringify(V.neurons.map((n) => n.somaSide))});\n`;
    console.log(`[bakeConnectomeSynapses] ${outArg}: ${V.edges.length} synapse counts (${V.edges.reduce((a, e) => a + e[2], 0)} synapses), ${V.neurons.length} neurons${process.argv.includes("--write") ? "" : " (dry run: pass --write)"}`);
    if (process.argv.includes("--write")) fs.writeFileSync(outArg, text);
    process.exit(0);
}
