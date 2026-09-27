# three.js bug reports -- DRAFTS, NOT POSTED

Found while building SweK_Engine's FSR3 frame generation on three.js r185 (v4752-v4762). Each draft carries a minimal
standalone reproduction that imports three from a CDN; `tools/ship/threeUpstream-selfcheck.mjs` runs every reproduction
against the vendored r185 on both backends and holds the numbers each draft states. Posting them is the maintainer's call.

- [VelocityNode: an InstancedMesh's velocity ignores its previous instance matrix](01-velocity-instancedmesh.md) -- observed: plain 5.612, instanced 1.871 (px, both backends)
- [VelocityNode: a BatchedMesh's previous position never gets the instance's matrix](02-velocity-batchedmesh.md) -- observed: plain 5.612, batched 1.871 (px, both backends)
- [VelocityNode: a morphed mesh's previous position is the unmorphed one](03-velocity-morph.md) -- observed: plain 5.612, morphed 1.871 (px, both backends)
- [VelocityNode: a skinned mesh's velocity is not its motion](04-velocity-skinned.md) -- observed: plain 5.612, skinned -9.311 (px, both backends)
- [Sprite: `center` is taken from the first sprite that built a shared program](05-sprite-center-shared-program.md) -- observed: offCentre 38.5, centredAfter 38.5, centredUnlike 31.5 (both backends)
- [WebGL2 backend: only the first particle system's compute runs](06-webgl2-second-compute.md) -- observed: webgpu moved [true, true]; webgl2 moved [true, false]
