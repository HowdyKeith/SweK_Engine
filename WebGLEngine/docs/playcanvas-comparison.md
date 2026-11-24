# PlayCanvas and SweK Engine: what each has, and what SweK could take

2026-11-21. PlayCanvas engine `2.25.0-beta.10` (MIT, github.com/playcanvas/engine), read from a shallow clone. Install it from the install panel: row `lib-playcanvas` (the Desktop, casting and code maps group).

**How the SweK column was filled in.** A text search of this tree, with `vendor/`, `node_modules/` and the self-checks left out. "Has" means files that implement the thing were found. It does **not** mean they were checked to match PlayCanvas's version or measured against it. "Thin" means a few files mention it. "None found" means the search found nothing; it could still be there under another name.

## What the two engines are

| | **PlayCanvas** | **SweK Engine** |
|---|---|---|
| What it is | A general-purpose game engine and editor, one library (about 1,400 source files), used by commercial web games | A large set of browser pages over a shared engine, a local Node server (the ai-bridge), and the self-checks and studies that hold it to its claims |
| Graphics | WebGL2 and WebGPU behind one device layer | WebGPU and WebGL, mostly through three.js (in `vendor/`), plus its own WebGPU passes in `render/` |
| Structure | Entities with components (camera, light, render, rigid body, sound, anim, gsplat, UI elements) and scripts | Pages wire their own pieces together; an entity system exists in `core/ecs` and `engine/` |
| Editor | A hosted visual editor (separate product); the engine ships gizmos, a view cube and a grid | No visual editor; panels and pages per feature |
| Physics | Ammo.js (Bullet) for rigid bodies and joints | Its own: position-based dynamics, mechanics, material-point and particle fluids, molecular dynamics, heat, electromagnetism, black holes, lattice fluids |
| AI | None in the engine | Connectome-wired brains, learning agents, a local AI server for models, voice and the home |
| How it is checked | Unit tests and examples | Every file has a self-check gate; studies are registered before they are flown |

## Feature by feature

| Feature | PlayCanvas | SweK (by a search of the tree) |
|---|---|---|
| Gaussian splats | **Deep**: streaming, a level-of-detail octree, a budget balancer, frustum culling, a compressed format (`.sog`), GPU and worker sorting, splat shadows (`src/scene/gsplat*`) | Has: a splat parser (`engine/splatParser.js`), splat rigs (`rig/RigSystem.js`), splat-voxel worlds. No level of detail, streaming or compressed format found |
| GPU sorting | Compute radix sort, one-sweep and multi-pass (`src/scene/graphics/radix-sort/`) | Thin: a few radix-sort files |
| Many lights | Clustered lighting (`world-clusters`), local light shadows in an atlas | None found for clustered lighting |
| Shadows | Directional cascades, local lights, a shadow-map cache | Has: cascaded shadows (see `docs/csm-integration-r302.md`) |
| Anti-aliasing | TAA and SMAA | Has TAA; no SMAA found |
| Post effects | Bloom, depth of field, SSAO, auto exposure, colour grading and LUTs, lens flare, vignette, fringing, CAS sharpening, **volumetric fog**, dynamic sky | Has bloom, depth of field, SSAO, colour grading, auto exposure. No volumetric fog found; lens flare thin |
| Upscaling and frame generation | None | **SweK leads**: FSR, a learned denoiser, learned upscaling, frame generation, each with device gates on real GPUs |
| Global illumination | A lightmapper, probe volumes, environment lighting | Thin: a few lightmap and probe files |
| Materials | Standard PBR with a shader-chunk system | Has PBR (mostly three.js's) |
| Model formats | glTF 2.0 import; **glTF and USDZ export** | Has glTF import and some glTF export; USDZ thin |
| Animation | Anim state graph with blend trees and layers, morph targets | Morph targets found; state graph or blend trees thin |
| Cameras | Orbit, fly and focus controllers (`src/extras/input/controllers`) | Per-page cameras; no shared controller set found |
| Editing tools | Translate, rotate and scale gizmos, a view cube, an infinite grid | Gizmo thin; no view cube or grid found |
| Performance overlay | Mini-stats: CPU and GPU timers per pass, graphs (`src/extras/mini-stats`) | Has its own gauges and docked stats bar; no per-pass GPU timer overlay found |
| In-world UI | Screens, elements, layout groups, scroll views, buttons | Uses the page's own HTML |
| Prefabs | Templates (instantiate a saved entity tree) | None found |
| Asset pipeline | Asset registry, bundles, handlers per type | Has asset library and ingest pages |
| WebXR | Full (`src/framework/xr`) | Has some WebXR |
| Sound | Positional sound per entity | Has an audio manager and audio pages |
| Localisation | i18n of text assets | Thin |
| Simulation physics | Rigid bodies only | **SweK leads** by a wide margin |
| Brains and agents | None | **SweK leads** |
| Home, phone, TV and installers | None | **SweK leads** (the ai-bridge) |

## What SweK could take, in the order I'd suggest

PlayCanvas is MIT. Code lifted from it keeps its copyright line (`Copyright (c) 2011-2026 PlayCanvas Ltd.`) and the licence text, in the file or beside it, the way `vendor/` already does for three.js.

1. **GPU radix sort for splats** (`src/scene/graphics/radix-sort/compute-radix-sort-onesweep.js`). It's self-contained WebGPU compute and would let SweK's splat pages sort on the card. It needs a SweK gate that compares its order with a CPU sort.
2. **The splat level-of-detail octree, budget balancer and `.sog` loader** (`src/scene/gsplat-unified/`). This is the biggest gap. It's how PlayCanvas shows very large splat scenes. It's a larger lift, and it's tied to their device layer, so port the ideas and data structures rather than the files.
3. **Mini-stats with per-pass GPU timers** (`src/extras/mini-stats/gpu-timer.js`). The real-GPU runs time passes in gates already. A live overlay that reads the same timestamp queries would show the same numbers on any page.
4. **Clustered lighting** (`src/scene/lighting/world-clusters.js`, `src/scene/renderer/world-clusters-allocator.js`). This is for pages with many lights (cities, fleets with lights). It's a medium lift, and the shader side is GLSL and WGSL chunks.
5. **SMAA and volumetric fog** (`src/extras/effects/smaa`, `volumetric-fog`). These are small, separate passes with their own shaders, so each one is a clean port.
6. **Orbit, fly and focus camera controllers** (`src/extras/input/controllers`). They're small and not tied to the device layer. One shared set would replace the per-page camera code.
7. **Gizmos, the view cube and the grid** (`src/extras/gizmo`, `grid`). These matter only if SweK wants in-page editing.
8. **The anim state graph** (`src/framework/anim`). This is for avatars and creatures that blend walk, run and idle. Port the state machine, not the component.
9. **USDZ export** (`src/extras/exporters/usdz-exporter.js`). It lets an iPhone open a SweK model in AR Quick Look.

**Not worth taking:** the entity and component framework, the asset registry and the in-world UI system. SweK's pages are organised differently, and adopting these would mean rebuilding pages rather than adding to them.

## What PlayCanvas could learn from SweK

Real-GPU device gates, a learned denoiser and frame generation, physics far beyond rigid bodies, and registered studies before claims. None of this is a request to them; it's a note on where SweK is already ahead.
