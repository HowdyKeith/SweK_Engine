THeads -- head/torso presentation models
========================================

Drop separate HEAD / TORSO .glb (or .gltf) models here -- e.g. the ones you
download from Sketchfab. These are used by the demo-chrome "head" presentation
tier (the docked avatar strip), which cycles:

    full rigged  ->  mini (docked)  ->  head/torso  ->  svg dials  ->  full

How it works
------------
- When you enter the head tier, the chrome calls setHeadView(true) (the tight
  head/torso camera frame) AND tries to swap the stage avatar to a model from
  this folder via /GPU_Assets/list/THeads.
- Each time you cycle back into the head tier it advances to the NEXT model in
  this folder, so a whole set of heads rotates through one per lap.
- Leaving the head tier restores your primary avatar and clears the head frame.
- Jaw / lips: on load the stage auto-detects a jaw bone on the model
  (_wireJaw), so if your Sketchfab head/torso rig has a jaw bone, talk drives
  it automatically. No bone -> no jaw motion (harmless).

Notes / caveats
---------------
- The MODEL SWAP only happens when the docked stage scene is one of:
  diorama / screen / surf / focus (that's the constraint in avatarStage
  setAvatar). In any other scene the head tier still works -- it just
  head-zooms your CURRENT rig instead of loading a separate model.
- If this folder is empty, the head tier gracefully falls back to head-zooming
  the current rigged avatar (no error).
- Keep files reasonably light for the GTX 1070/1080 target. Sketchfab "download
  -> glTF (.glb)" is the easiest format; .gltf also works.

This folder ships with the engine (the strip only drops top-level GPU_Assets
*.glb, not subfolders), so the location is always here ready for you to fill.
