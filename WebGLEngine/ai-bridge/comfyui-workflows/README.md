# ComfyUI workflow templates for mesh-gen

The bridge's `/comfyui/mesh-gen` endpoint loads workflow JSON from this folder.
Each workflow file is a ComfyUI workflow saved via **Save (API Format)** from
the ComfyUI web UI (not "Save" — that's the editor format, which the API
won't accept).

## How to export your working workflow

1. Open ComfyUI in the browser (default http://localhost:8188)
2. Build the workflow you want — e.g. image → Trellis2 → save GLB
3. Run it once with a test image to confirm it works
4. Click **Save (API Format)** → save the JSON to this folder
5. Naming: `<short-name>.json` (e.g. `trellis2.json`, `hunyuan3d.json`)
6. The first node that has class type `LoadImage` becomes the input
   slot — the bridge replaces its `inputs.image` filename with the
   uploaded image path before submitting

## What the bridge looks for in a workflow

When `/comfyui/mesh-gen` is called with `{workflow:"trellis2", image: <dataUrl>}`:

1. Read `trellis2.json` from this folder
2. Upload the user's image to ComfyUI via `/upload/image`
3. Walk the workflow JSON nodes; find any whose `class_type` matches
   one of: `LoadImage`, `LoadImage|pysssss`, `LoadImageFromPath`
4. Patch that node's `inputs.image` to the uploaded filename
5. POST the patched workflow to ComfyUI's `/prompt` endpoint
6. Return the resulting `prompt_id` to the caller, who polls
   `/comfyui/mesh-gen/<prompt_id>` for completion

## Honest gaps

- **No workflow is shipped with the project.** The Trellis2 / Hunyuan3D /
  LGM nodes that produce meshes vary by which custom-node pack is
  installed (ComfyUI-3D-Pack, ComfyUI-Trellis, etc.) and version. The
  user's local install IS the source of truth; export from there.
- The bridge can't validate the workflow before submitting — if a node
  is missing on the user's install, ComfyUI returns a clear error
  which the bridge forwards.
