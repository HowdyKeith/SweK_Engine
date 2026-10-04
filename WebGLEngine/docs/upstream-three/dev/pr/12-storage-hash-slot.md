# PR 12: StorageBufferNode: Do not share a hash with the buffer's attribute node.

<!-- DRAFT, NOT POSTED. The pull request for the issue in ../12-webgl2-storage-without-count.md. Post that issue first: its number replaces every
#<issue number> below. Placeholders naming another slot's number (#<issue number of NN>) take that issue's number. -->

- **For the issue:** [WebGLBackend: a storage buffer named without its count shares its attribute node's hash, and the compute never links](../12-webgl2-storage-without-count.md)
- **Title:** `` StorageBufferNode: Do not share a hash with the buffer's attribute node. ``
- **Base:** `mrdoob/three.js`, branch `dev`
- **Branch in your fork:** `storage-hash-slot`
- **Patch:** [`patches/12-storage-hash-own-slot.diff`](../patches/12-storage-hash-own-slot.diff) -- `src/nodes/accessors/BufferAttributeNode.js`, `src/nodes/accessors/StorageBufferNode.js`

To make the branch, in a clone of your fork:

```sh
git checkout dev
git pull https://github.com/mrdoob/three.js.git dev
git checkout -b storage-hash-slot
git apply <path to>/docs/upstream-three/dev/patches/12-storage-hash-own-slot.diff
npm run lint && npm run test-unit
git commit -am "StorageBufferNode: Do not share a hash with the buffer's attribute node." -m "Related issue: #<issue number>"
git push -u origin storage-hash-slot
```

Then open a pull request from that branch into `mrdoob/three.js` `dev`, with the title above and the body below.

## Body

Related issue: #<issue number>

**Description**

On the WebGL backend, a compute using a storage buffer built without its count never links: the storage node and the `BufferAttributeNode` WebGL 2 reads the buffer through share one entry in `builder.globalCache`, get one hash, and the builder registers the same transform-feedback varying twice.

Each of the two node classes keeps a slot of its own in the buffer's shared entry, so a storage node and an attribute node of one buffer never share a hash.

Tested with the issue's reproduction, headless Chromium with SwiftShader, on WebGPU and on the WebGL 2 backend: the compute without a count writes `0 0 0 0 0 0` on WebGL 2 on `dev` and `1 2 3 4 5 6` with this patch, as with a count. `npm run lint` is clean with this patch. With this patch and the fifteen others I am filing applied together on `dev`, the unit tests give what `dev` gives (1524 passed, 1 todo, 0 failed), and every e2e example's outcome is the same as on `dev`, on WebGPU and on the WebGL 2 backend.
