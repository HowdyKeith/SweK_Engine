# PR 13: Morph: Read each instance's base from its `morphTexture` row.

<!-- DRAFT, NOT POSTED. The pull request for the issue in ../13-instanced-morph-absolute-and-mesh-level.md. Post that issue first: its number replaces every
#<issue number> below. Placeholders naming another slot's number (#<issue number of NN>) take that issue's number. -->

- **For the issue:** [InstancedMesh with per-instance morphs: absolute targets throw, and so does a mesh-level morphTargetInfluences](../13-instanced-morph-absolute-and-mesh-level.md)
- **Title:** `` Morph: Read each instance's base from its `morphTexture` row. ``
- **Base:** `mrdoob/three.js`, branch `dev`
- **Branch in your fork:** `instanced-morph-base`
- **Patch:** [`patches/13-morph-per-instance-base.diff`](../patches/13-morph-per-instance-base.diff) -- `src/nodes/accessors/Morph.js`

To make the branch, in a clone of your fork:

```sh
git checkout dev
git pull https://github.com/mrdoob/three.js.git dev
git checkout -b instanced-morph-base
git apply <path to>/docs/upstream-three/dev/patches/13-morph-per-instance-base.diff
npm run lint && npm run test-unit
git commit -am "Morph: Read each instance's base from its \`morphTexture\` row." -m "Related issue: #<issue number>"
git push -u origin instanced-morph-base
```

Then open a pull request from that branch into `mrdoob/three.js` `dev`, with the title above and the body below.

## Body

Related issue: #<issue number>

**Description**

An `InstancedMesh` with per-instance morphs throws with absolute morph targets (`morphTargetsRelative = false`), and throws beside a mesh-level `morphTargetInfluences`: the base is read from the mesh's own influences, which per instance it has not got, and the mesh-level influences buffer is updated though its node is never built.

Each instance's base is read from column 0 of its `morphTexture` row, which `setMorphAt()` already writes, and the mesh-level influences are built and updated only where they are read.

Tested with the issue's reproduction, headless Chromium with SwiftShader, on WebGPU and on the WebGL 2 backend: absolute targets, and either kind beside mesh-level influences, throw on `dev` and draw what relative targets draw with this patch. `npm run lint` is clean with this patch. With this patch and the fifteen others I am filing applied together on `dev`, the unit tests give what `dev` gives (1524 passed, 1 todo, 0 failed), and every e2e example's outcome is the same as on `dev`, on WebGPU and on the WebGL 2 backend.
