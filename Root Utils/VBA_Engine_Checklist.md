# VBA OpenGL Engine — Work Checklist

> Collated from our project history + the actual `EngineCore_63_Enemies.xlsm`
> module inventory (226 modules). Items marked **(verify)** are reconstructed
> from past-chat records and should be confirmed against the live files — chat
> summaries are reliable but not a substitute for the real module list.

---

## 1. DONE — present in EngineCore63 (the 226-module baseline)

- [x] Dual render backends: **OpenGL** (active) + **D3D11** ("the wrapper", present, integrated, *not yet utilized*) via `BackendManager`
- [x] Interactive engine loop: `OpenGLFacade.StartEngine` → `OpenGLWindow` → `IRenderer.Update/Render` → `Present`
- [x] Real window + input: `Win32GL` (WndProc, `WM_KEYDOWN`, per-window keystate, mouse + `LockMouse` for mouselook, `PumpMessages`)
- [x] Scene/entities: `Scene.cls` (implements `IRenderer`), `CreateEntity`, `RenderEntityMesh`
- [x] Shooting: `modRaycast.RaycastScene` (ray vs entity AABBs); enemies carry `IsDead`/`Health` (`SpatialGrid`, `Quadtree`)
- [x] Model loading: `OBJLoader.bas`, `modSTLLoader.bas`, `MeshData`/`GLMesh`/`mesh`
- [x] ECS: `EntityManager`, `ComponentStore`, `ISystem`, `SystemScheduler`, `TransformComponent`, `*System.cls`
- [x] BVH culling: `BVHBuilder/Culling/Traversal/Wavefront/System`
- [x] Meshlet pipeline: `MeshletBuilder/Stream/SSECuller/Registry/Exporter/Manager`
- [x] Hi-Z occlusion: `HiZBuffer/Pyramid/Occlusion/System`
- [x] Frame graph + render graph: `FrameGraphCompiler/Adapter`, `RenderGraph`
- [x] GPU compute particles: `ComputeParticleSystem`, `GPUSimPipeline`
- [x] Lighting: `DirectionalLight`, `PointLight`, `SpotLight`, `LightingSystem`, shadows
- [x] Physics: `PhysicsEngine`, `PhysicsSystem`, `CollisionPipeline`, spatial grid / quadtree / octree
- [x] Audio: `AudioSystem_ECS`, `AudioVoicePool`, `modNativeAudio`, `modAudioVisualizer` (mic oscilloscope in the GLUT demo)
- [x] Texture atlas / bindless materials
- [x] Self-tuning governor layer: `EngineAuto*`, `EnginePAM*`, frame-budget/stability controllers
- [x] VBASync git/import tooling: `VBASyncEngine`, `VBASyncGitHub`, `VBASyncImport`
- [x] Working demos: `FreeGLUT_Demo.RunGLUT`, `DemoD3D11.RunCube`, `DemoLevel.RunWorld` (headless 63-enemy AI/physics/combat sim → JSON export)

---

## 2. CHANGES SINCE EngineCore63 — to fold back into the engine

> These were made after / alongside the baseline and are **not in the .xlsm**.

- [ ] **`polish_bundle`** (staged, not yet imported): `D3D11HLSLShaders.bas` v2.0 (texture sampling, sun lighting, aerial fog, ACES tonemap, color jitter — fixes the hardcoded "color blob") + `modGraphicsPolish.bas` (time-of-day, sun dir, sky/fog palette, 128-byte `b1` cbuffer) + `INTEGRATION.md`
- [ ] **Bloom + tint HLSL** (#4/#5, added on top of the polish shader): `D3D_BLOOM_BRIGHT_PS`, `D3D_BLOOM_BLUR_PS`, `D3D_BLOOM_COMPOSITE_PS`, `D3D_BASIC_TINT_HLSL` — render once `BackendManager` is switched to D3D11
- [ ] **Demo registry + addon loader** (just built): `modDemoRegistry.bas`, `modAddonLoader.bas`, `Addon_HelloDemo.bas`
- [ ] **(pending your hunt)** any other VBA edits made since the baseline

---

## 3. BUILT EARLIER, but NOT in EngineCore63 — restore or supersede? (verify)

- [ ] `DemoFPS.bas` / `FPSMap.bas` (box-maze level) / `FPSEnemy.cls` (patrol/alert/chase AI) — the **playable** first-person shooter (vs. the headless `DemoLevel` sim)
- [ ] `FeatureTogglePanel.bas` — F1–F9 engine-feature toggles, FPS-cost measurement → FeaturePanel sheet (**this is your "settings" panel**)
- [ ] `TeapotMesh.bas` (Newell teapot, Bézier) — possibly now covered by `modFreeGLUT.glutSolidTeapot`
- [ ] `DemoStarMap` / `DemoSpectra` / `DemoGasDensity` — astronomical visualizations
- [ ] `modExcelChart.bas`, `modExcelBridge.bas`, `GL.bas` — possibly renamed (`GLConstants`/`modGL`/`modGL_Declares`)

---

## 4. LIVES IN A SEPARATE WORKBOOK — `VBAOpenGL_Demos_v2_67.xlsm` (71 modules) (verify in scope)

- [ ] 20+ GPU-compute sims (reaction-diffusion, slime mold, boids, cellular automata, Lotka-Volterra, game theory, 5/7/9-species ecosystems)
- [ ] **FPS-with-neural-enemies:** `StartFullBioFPSDemo` (`modMultiBioDemoLoop`), `NeuralEnemyBrain`, `EnemyEvolutionManager`, weapon/health/trail/upgrade, screen-shake + bloom + explosion VFX
- [ ] Ollama dual-chat, `RayMarchingVisualizer`, `TuringPatternAnalyzer`, music-from-ecosystem

---

## 5. INTENDED / not done

- [ ] **Utilize the D3D11 wrapper** — switch `BackendManager` to D3D11 so the polish + bloom + tint actually render
- [ ] **The bridge architecture (portfolio centerpiece):**
  - [ ] WebGL as **AI brain** — voxelengine computes enemy AI / target selection, feeds positions to the OpenGL FPS over the Node bridge
  - [ ] **Debug/observability dashboard** — browser minimap + FPS graph + state, bidirectional (click enemy in browser → highlight in game)
  - [ ] **Split-brain commander** — OpenGL first-person body + browser top-down commander
- [x] **Blank-world boot + DEMO menu** — menu A (Demos sheet, one button per demo → `RunDemoButton`) + menu B (in-view `MenuRenderer`/`modMenu`, title-bar selection) + addon folder. Verified against the real `IRenderer`/`OpenGLFacade`/`Win32GL` API. *(Shipped in the bundle; verify in Excel.)*
- [ ] Multi-window / split-screen OpenGL (`wglShareLists`) or render-to-texture over the bridge
- [ ] Winsock VBA (awaiting paste), Tasker PIP avatar
- [ ] Portfolio polish: per-module README / "VBA OpenGL engine reference" doc, architecture diagram, demo video/GIF, writeup, GitHub cleanup

---

## Sequenced integration roadmap (dependency-ordered)

The bridge (WebGL brain ↔ OpenGL body) is the portfolio centerpiece; most steps
lead toward it. Each item is a discrete, shippable integration.

1. **Canonical FPS room** — settle the "First-Person Room" entry (today it's a
   blank `StartEngine`). Either wire EngineCore63's `Scene` + `modRaycast` into a
   real room-loader sub (load room + props, mouselook, shoot, enemy takes hits/
   dies) or restore/port the older `DemoFPS`/`FPSMap`/`FPSEnemy`. **Prereq for the
   bridge** — the FPS is the "body". *(Needs your call on which FPS is canonical.)*
2. **In-GL bitmap text** (`wglUseFontBitmaps`) — a small text module so menu B
   shows labels in-world (not just the title bar) and the FPS gets a HUD
   (health/ammo/hit-markers). Unlocks readable overlays everywhere downstream.
3. **D3D11 backend switch + polish** — flip `BackendManager` to D3D11, wire
   `modGraphicsPolish`'s `b1` cbuffer so the polish shader + bloom + tint render.
   The "it looks good now" milestone; independent of the FPS work.
4. **Bridge pattern 1 — WebGL AI brain** — voxelengine computes enemy AI / target
   selection, feeds positions to the OpenGL FPS over the Node bridge (transport
   already exists on the voxel side).
5. **Bridge pattern 2 — debug/observability dashboard** — browser minimap + FPS
   graph + engine state, bidirectional (click enemy in browser → highlight in
   game). Builds on #4's transport.
6. **Bridge pattern 3 — split-brain commander** — OpenGL first-person body +
   browser top-down commander ("asymmetry as feature").
7. **Settings panel** — restore/supersede `FeatureTogglePanel` (F1–F9 feature
   toggles + FPS-cost readout), now that the FPS + HUD exist.
8. **Multi-window / split-screen** — `wglShareLists` or render-to-texture over the
   bridge (may be redundant once the bridge patterns land).
9. **Winsock + Tasker PIP** — when you paste the Winsock code; PIP avatar.
10. **Portfolio polish** — reference doc, architecture diagram, demo video/GIF,
    writeup, GitHub cleanup.

---

## Open structural decisions

- [x] **Canonical zip layout** — `VBAEngine/` (exploded EngineCore, from-scratch import) + workbook + listener. *(Done — `EngineCore_Bundle`.)*
- [x] **Init() pattern** — `Workbook_Open` → `modInit.Init`: non-destructively ensure custom sheets, land on the menu; does NOT auto-launch the blocking loop. *(Done.)*
- [ ] **Which FPS is canonical** — EngineCore63's `Scene`+`StartEngine` room, the older `DemoFPS`/`FPSMap`/`FPSEnemy`, or the demos-workbook `StartFullBioFPSDemo`. **(Roadmap step 1 — your call.)**
