// WebGLEngine/render/tools/meshopt-selfcheck.mjs — proves the EXT_meshopt_compression wiring.
//
// The full "load a gltfpack -cc .glb" is RIG-ONLY (needs a browser + a real compressed asset), but the
// two things that must be right are checkable headlessly: (1) the vendored meshopt decoder initializes
// its WASM and exposes the API three's setMeshoptDecoder needs, and (2) enableMeshopt actually hands that
// decoder to a loader and never throws on a loader that lacks the method.
//
//   run: node render/tools/meshopt-selfcheck.mjs

const dec = await import("../../vendor/three/jsm/libs/meshopt_decoder.module.js");
const { enableMeshopt } = await import("../../vendor/three/jsm/libs/meshoptGltf.js");

let pass = 0, total = 0;
const ok = (n, c, d = "") => { total++; if (c) { pass++; console.log(`  ok   ${n}`); } else { console.log(`  FAIL ${n}${d ? "  -- " + d : ""}`); } };

console.log("meshopt-selfcheck: decoder initializes");
const D = dec.MeshoptDecoder;
await D.ready;
ok("MeshoptDecoder.ready resolves", true);
ok("decoder reports supported", D.supported === true);
ok("has decodeGltfBuffer (used by EXT_meshopt_compression)", typeof D.decodeGltfBuffer === "function");
ok("has decodeVertexBuffer", typeof D.decodeVertexBuffer === "function");
ok("has decodeIndexBuffer", typeof D.decodeIndexBuffer === "function");

console.log("meshopt-selfcheck: enableMeshopt wires the decoder into a loader");
{
    let got = null;
    const mockLoader = { setMeshoptDecoder(d) { got = d; return this; } };
    const ret = enableMeshopt(mockLoader);
    ok("enableMeshopt returns the loader", ret === mockLoader);
    ok("setMeshoptDecoder was called", got !== null);
    ok("it was handed a real decoder (has decodeGltfBuffer)", got && typeof got.decodeGltfBuffer === "function");
}

console.log("meshopt-selfcheck: never throws on a loader without the method");
{
    let threw = false;
    try { const r = enableMeshopt({}); ok("plain object returned unchanged", typeof r === "object"); } catch { threw = true; }
    ok("enableMeshopt({}) did not throw", !threw);
    let threw2 = false;
    try { enableMeshopt(null); } catch { threw2 = true; }
    ok("enableMeshopt(null) did not throw", !threw2);
}

console.log(`\nmeshopt-selfcheck: ${pass}/${total} passed`);
if (pass !== total && typeof process !== "undefined" && process.exit) process.exit(1);
