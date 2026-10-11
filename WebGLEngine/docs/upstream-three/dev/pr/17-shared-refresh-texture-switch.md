# PR 17: Bindings: Fully update a bind group whose texture node switched textures.

<!-- DRAFT, NOT POSTED. The pull request for the issue in ../17-transmission-backdrop-other-target.md. Post that issue first: its number replaces every
#<issue number> below. Placeholders naming another slot's number (#<issue number of NN>) take that issue's number. -->

- **For the issue:** [Transmission: after a render into another target, the material shows that target's backdrop](../17-transmission-backdrop-other-target.md)
- **Title:** `` Bindings: Fully update a bind group whose texture node switched textures. ``
- **Base:** `mrdoob/three.js`, branch `dev`
- **Branch in your fork:** `shared-refresh-texture-switch`
- **Patch:** [`patches/17-shared-refresh-texture-switch.diff`](../patches/17-shared-refresh-texture-switch.diff) -- `src/renderers/common/Bindings.js`

To make the branch, in a clone of your fork:

```sh
git checkout dev
git pull https://github.com/mrdoob/three.js.git dev
git checkout -b shared-refresh-texture-switch
git apply <path to>/docs/upstream-three/dev/patches/17-shared-refresh-texture-switch.diff
npm run lint && npm run test-unit
git commit -am "Bindings: Fully update a bind group whose texture node switched textures." -m "Related issue: #<issue number>"
git push -u origin shared-refresh-texture-switch
```

Then open a pull request from that branch into `mrdoob/three.js` `dev`, with the title above and the body below.

## Body

Related issue: #<issue number>

**Description**

Since #34162 a transmission material drawn into one render target and then another shows, in the second, the backdrop copied for the first: an unchanged render object takes a `SHARED` refresh, which updates the shared uniform buffers but not the sampled texture binding, and the viewport texture node switches its texture per render target.

`updateSharedForRender()` runs the full update for a bind group whose sampled texture no longer refers to its node's current texture (`binding.texture !== binding.textureNode.value`), and only for that group, so an unchanged render object still skips the rest.

Tested with the issue's reproduction, headless Chromium with SwiftShader, on WebGPU and on the WebGL 2 backend: when the wall behind the lens moves, 0 of the 8 pixels seen through it change on `dev` and 8 with this patch, as on r185. `npm run lint` is clean with this patch. With this patch and the fifteen others I am filing applied together on `dev`, the unit tests give what `dev` gives (1524 passed, 1 todo, 0 failed), and every e2e example's outcome is the same as on `dev`, on WebGPU and on the WebGL 2 backend.
