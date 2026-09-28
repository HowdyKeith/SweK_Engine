# three.js bug reports -- DRAFTS, NOT POSTED

Found while building SweK_Engine's FSR3 frame generation on three.js r185 (v4752-v4762). Each draft carries a minimal
standalone reproduction that imports three from a CDN, the cause, and a patch against three's `src/` at the r185 tag
(`patches/`, v4771). `tools/ship/threeUpstream-selfcheck.mjs` runs every reproduction against the vendored r185 on both backends
and holds the numbers each draft states; then applies each draft's patch alone to a copy of r185's build, runs the reproduction
on it, and holds the fix and the numbers the draft states for it. Posting them is the maintainer's call.

- [VelocityNode: an InstancedMesh's previous instance matrix is its current one](01-velocity-instancedmesh.md) -- observed: plain 5.612, instanced 0.000, many 11.224 (px, both backends); patched: plain 5.612, instanced 5.612, many 5.612 (px, both backends)
- [VelocityNode: a BatchedMesh's previous position never gets the instance's matrix](02-velocity-batchedmesh.md) -- observed: plain 5.612, batched 1.871 (px, both backends); patched: plain 5.612, batched 5.612 (px, both backends)
- [VelocityNode: a morphed mesh's previous position is the unmorphed one](03-velocity-morph.md) -- observed: plain 5.612, morphed 1.871 (px, both backends); patched: plain 5.612, morphed 5.612 (px, both backends)
- [VelocityNode drawn outside MRT: the previous positions are never built](04-velocity-outside-mrt.md) -- observed: plain 5.612, drawn 1.871, mrt 5.612, mrtSameFrame 0.000 (px, both backends); patched: plain 5.612, drawn 5.612, mrt 5.612, mrtSameFrame 0.000 (px, both backends)
- [Sprite: `center` is taken from the first sprite that built a shared program](05-sprite-center-shared-program.md) -- observed: offCentre 38.5, centredAfter 38.5, centredUnlike 31.5 (both backends); patched: offCentre 38.5, centredAfter 31.5, centredUnlike 31.5 (both backends)
- [WebGL2 backend: only the first particle system's compute runs](06-webgl2-second-compute.md) -- observed: webgpu moved [true, true]; webgl2 moved [true, false]; patched: webgpu moved [true, true]; webgl2 moved [true, true]
