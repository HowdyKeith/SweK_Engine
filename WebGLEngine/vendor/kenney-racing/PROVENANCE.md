# kenney-racing -- provenance

Recorded at the Racing city 0 round (task 63), when the racing city needed road tiles, a finish line and cars that a
brain can learn to drive before any of them is modelled here. Everything in this directory is Kenney's, taken from the
Godot starter kit and nothing else.

| field | value |
|---|---|
| upstream | https://github.com/KenneyNL/Starter-Kit-Racing |
| commit | 2f2e5f2646dda89cb21d4e8539bab60c6e955dc8 (2026-08-21, the head when it was cloned on 2026-09-06) |
| licence | MIT -- `LICENSE` beside this file, Copyright (c) 2023 Kenney, sha256 db2c350e9673... |
| models | the README says "3D Models & sounds (CC0 licensed)"; the LICENSE file is the repository's MIT and names no separate grant for the models, so the MIT is what is carried here and the CC0 is the README's word |

## What is vendored, and what is not

Vendored: `models/*.glb` (13 files: track-straight, track-corner, track-finish, track-bump, track-tents, decoration-empty,
decoration-forest, decoration-tents, vehicle-truck-red / -green / -purple / -yellow, vehicle-motorcycle) and
`models/Textures/colormap.png`, the one 512 x 512 palette texture every model's UVs index. 1.3 MB.

Not vendored: the Godot project (project.godot, scenes/, scripts/, the .import sidecars), `models/Library/` (a Godot
MeshLibrary), `models/collision-track-*.fbx` (FBX collision hulls this tree has no reader for -- the track collider is
built from the tile footprints instead), audio/, sprites/, screenshots/, the icon and splash.

## What was read, and a discrepancy

The LICENSE file says Copyright (c) 2023 Kenney. The README's own License section says Copyright (c) 2026 Kenney. The file
is what is vendored and what world/vendoredLicences.mjs records; the year in the README is noted here so a later reader
who finds the two disagreeing knows it was seen. Both are MIT with the same operative body.
