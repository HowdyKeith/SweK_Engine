# GPU_Assets/pipboy/ — Pip-Boy prop models

Drop the Pip-Boy `.glb` / `.gltf` files here. The bridge serves this folder
statically, so each file is reachable at:

    http://localhost:8787/GPU_Assets/pipboy/<filename>.glb

Unlike `../Your_Avatars/`, this folder is **isolated** — models here do NOT join
the phone avatar cycle or the asset-spawn list. That keeps a Pip-Boy from showing
up as a selectable "you" avatar. It's purely a prop folder the Pip-Boy (Fallout)
demo points at.

## .glb vs .gltf — prefer .glb

- **`.glb`** is a single self-contained binary (geometry + textures + materials
  in one file). Drop it in and it just works. **Use this if you have it.**
- **`.gltf`** is JSON that references *external* `.bin` + texture image files. If
  you use the `.gltf`, you MUST keep its sibling `.bin` and texture files next to
  it in this same folder, or it will load untextured / broken.

## Multi-part models

The Printables Pip-Boy (model 907060) is a multi-part print — the STLs are cut
into pieces to fit print beds and are glued/screwed together IRL. The `.glb`
export may likewise be one piece per file. If so, either:

1. drop the single combined/preview `.glb` here (easiest — shows the whole prop), or
2. drop the separate piece files here and we position them together in the demo.

Tell me which you have and I'll wire `fallout.html` (the Pip-Boy demo) to render
it in a `<model-viewer>` so it mocks in place inside the Pip-Boy UI.

## Viewer: pipboy-models.html

Open **`/pipboy-models.html`** (tray: Open Engine -> Pip-Boy Models, or the
"PIP-BOY MODELS" demo). It's a Three.js viewer (local `vendor/three`, no CDN)
with a model picker, a Spin slider to face the screen forward, auto-spin, and a
"Copy placement" button that emits the current `{rotationY, camera, target}` as
JSON. Tune a model, copy the placement, paste it back to me, and I'll bake it
into the registry so it always opens framed with the screen in place.

The four Sketchfab models are pre-registered. Drop each `.glb` here using these
exact names (or tell me your real filenames and I'll update the registry):

| file | model | source |
|------|-------|--------|
| `retro-modernized-pip-boy-editable-screen.glb` | Retro-Modernized (editable screen) | sketchfab.com/3d-models/...02df9777058e4cdea4fadee7660f7b43 |
| `the-famous-pip-boy-3-billion.glb` | The Famous Pip-Boy (3 billion) | ...adec10493e06436c967d5797f7085225 |
| `pipboy.glb` | Pip-Boy | ...d4216090cfa740a491eb89d608971d3a |
| `fo76-pipboy.glb` | FO76 Pip-Boy (untextured/grey) | ...d78412ada76b422d9a015fa4c293765d |

If a file is missing, the viewer shows a wireframe placeholder + the download
link, so the page never breaks.
