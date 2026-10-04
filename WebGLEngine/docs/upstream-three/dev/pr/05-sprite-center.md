# PR 05: SpriteNodeMaterial: Read `center` from the sprite being drawn.

<!-- DRAFT, NOT POSTED. The pull request for the issue in ../05-sprite-center-shared-program.md. Post that issue first: its number replaces every
#<issue number> below. Placeholders naming another slot's number (#<issue number of NN>) take that issue's number. -->

- **For the issue:** [SpriteNodeMaterial: `center` is taken from the first sprite that built a shared program](../05-sprite-center-shared-program.md)
- **Title:** `` SpriteNodeMaterial: Read `center` from the sprite being drawn. ``
- **Base:** `mrdoob/three.js`, branch `dev`
- **Branch in your fork:** `sprite-center`
- **Patch:** [`patches/05-sprite-center-per-object.diff`](../patches/05-sprite-center-per-object.diff) -- `src/materials/nodes/SpriteNodeMaterial.js`

To make the branch, in a clone of your fork:

```sh
git checkout dev
git pull https://github.com/mrdoob/three.js.git dev
git checkout -b sprite-center
git apply <path to>/docs/upstream-three/dev/patches/05-sprite-center-per-object.diff
npm run lint && npm run test-unit
git commit -am "SpriteNodeMaterial: Read \`center\` from the sprite being drawn." -m "Related issue: #<issue number>"
git push -u origin sprite-center
```

Then open a pull request from that branch into `mrdoob/three.js` `dev`, with the title above and the body below.

## Body

Related issue: #<issue number>

**Description**

Sprites that share a program all take `center` from the first sprite that built it: `setupPositionView()` builds `reference( 'center', 'vec2', object )`, bound to that one sprite, and the cache key holds nothing of it.

`center` is read through a reference that is not bound to one object, so each sprite's own is used.

Tested with the issue's reproduction, headless Chromium with SwiftShader, on WebGPU and on the WebGL 2 backend: `centredAfter`, a centred sprite drawn after an off-centre one with a like material, is at 38.5 px on `dev`, where the off-centre one is, and at 31.5 with this patch, as `centredUnlike` (a centred sprite with an unlike material) is on both. `npm run lint` is clean with this patch. With this patch and the fifteen others I am filing applied together on `dev`, the unit tests give what `dev` gives (1524 passed, 1 todo, 0 failed), and every e2e example's outcome is the same as on `dev`, on WebGPU and on the WebGL 2 backend.
