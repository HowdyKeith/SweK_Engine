# Pull requests for the issues -- DRAFTS, NOT POSTED

One per issue in [`../README.md`](../README.md), each with its title, the branch to make in your fork, the commands to make
it, and the body to paste into three's pull request form (its template: `Related issue`, then `**Description**`). Post the
issue first; its number goes where a text says `#<issue number>`. Each patch applies alone to `dev` at the commit the README
names, and `npm run lint` is clean on each alone; the unit and e2e results each body quotes were taken with all sixteen applied
together. 11 and 14 both fix issue 11 -- 14 by a wider change -- and 08 and 16 edit one import line of `Instance.js`
(each text says so).

- [03: Morph: Morph the previous position by the last draw's influences.](03-velocity-morph.md)
- [04: NodeBuilder: Build previous data when the material draws velocity.](04-velocity-outside-mrt.md)
- [05: SpriteNodeMaterial: Read `center` from the sprite being drawn.](05-sprite-center.md)
- [06: Pipelines: Key compute stages by their buffers on the WebGL backend.](06-webgl-compute-stage.md)
- [07: Skinning: Update the skeleton once per render.](07-skinning-per-render.md)
- [08: Instance: Sync large instance buffers before each draw.](08-instanced-sync-per-draw.md)
- [09: RenderObject: Add the batch's matrices texture to the dynamic cache key.](09-batched-grown-texture.md)
- [10: NodeBuilder: Need no previous data in compute builds.](10-compute-no-previous.md)
- [11: GLSLNodeBuilder: Fix `instanceIndex` in computes that are not instanced.](11-webgl-compute-instance-index.md)
- [12: StorageBufferNode: Do not share a hash with the buffer's attribute node.](12-storage-hash-slot.md)
- [13: Morph: Read each instance's base from its `morphTexture` row.](13-instanced-morph-base.md)
- [14: WebGLBackend: Dispatch every compute instanced.](14-webgl-compute-per-invocation.md)
- [15: Batch: Remake the previous matrices when the batch grows.](15-batch-previous-grown.md)
- [16: Instance: Keep previous storage instance matrices on the GPU.](16-instance-previous-on-gpu.md)
- [17: Bindings: Fully update a bind group whose texture node switched textures.](17-shared-refresh-texture-switch.md)
- [18: WebGLState: Track the read framebuffer binding.](18-webgl-framebuffer-read-binding.md)
