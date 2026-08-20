// vendor/three/jsm/libs/meshoptGltf.js — v2243
//
// One place to switch on EXT_meshopt_compression for three.js GLTFLoader across the engine, so a
// gltfpack -c/-cc compressed .glb (see the gltfpack catalog entry) loads everywhere SweK loads glTF.
// three r160's GLTFLoader already ships the EXT_meshopt_compression plugin; it only needs the decoder.
// KHR_mesh_quantization (gltfpack's default) is handled by GLTFLoader natively -- no wiring needed.
//
// meshopt_decoder.module.js is meshoptimizer's official WASM decoder (MIT, (C) Arseny Kapoulkine),
// vendored verbatim from three r160's examples/jsm/libs so it matches this GLTFLoader exactly.

import { MeshoptDecoder } from "./meshopt_decoder.module.js";

// Attach the decoder to a loader. Idempotent, and guarded so a missing/older GLTFLoader (no
// setMeshoptDecoder) never throws -- an uncompressed .glb still loads, a compressed one just won't.
export function enableMeshopt(loader) {
    try { if (loader && typeof loader.setMeshoptDecoder === "function") loader.setMeshoptDecoder(MeshoptDecoder); }
    catch (e) { /* leave the loader usable for uncompressed assets */ }
    return loader;
}

export { MeshoptDecoder };
