# Your_Avatars/ — personal rigged GLB folder

Drop rigged 3D avatars (`.glb` or `.gltf`) into this folder and they will:

1. **Appear in the phone avatar cycle** (KPop Listener tab → tap the cycle button)
2. **Resolve transparently** when other engine code requests them — fetching
   `/GPU_Assets/Astronaut.glb` checks here too if the file isn't at top-level
3. **Show up in the asset spawn panel** (left rail in SANDBOX demo)

## Recommended downloads (CC0)

- **RobotExpressive** (the REAL one, by Tomás Laulhé):
  https://github.com/google/model-viewer/raw/master/packages/shared-assets/models/RobotExpressive.glb
  — clips: Idle, Walking, Running, Death, ThumbsUp, Wave, Dance, Sitting,
    Standing, Punch. Replaces the procedural "Robot Man" stub.
- **Astronaut**:
  https://modelviewer.dev/shared-assets/models/Astronaut.glb
- **NeilArmstrong** (Smithsonian spacesuit scan):
  https://modelviewer.dev/shared-assets/models/NeilArmstrong.glb
- **Horse** (animated):
  https://modelviewer.dev/shared-assets/models/Horse.glb
- **RocketShip**:
  https://modelviewer.dev/shared-assets/models/RocketShip.glb

## Fallback behavior

If this folder is empty, the phone avatar cycle falls back to the built-in
procedural stubs (RobotMan / RobotWoman). Drop a real rigged GLB here and the
stubs vanish from the cycle automatically on next reload.

## Folder pairs

- `Your_Avatars/` — rigged avatars (what you see as "you")
- `../characters/` — NPC characters (KayKit Adventurers, etc.) — same merge
  behavior, just keeps personal vs population separate

## Pack folders (NOT merged)

These are isolated and don't pollute the asset list:
- `../city/` — Quaternius Downtown (100+ modular parts)
- `../medieval/` — future
- `../nature/` — future
