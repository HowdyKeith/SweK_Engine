# kenney-city -- provenance

Recorded at the Racing city 0 round (task 63), beside kenney-racing: the city builder kit's road tiles are the 1-unit
grammar (straight, corner, split, intersection) the flat track is laid from, and its small buildings are the reference
CityGen's voxel buildings stand beside.

| field | value |
|---|---|
| upstream | https://github.com/KenneyNL/Starter-Kit-City-Builder |
| commit | 4535092b740b378b700efd9df9e27a631815b84a (2026-03-12, the head when it was cloned on 2026-09-06) |
| licence | MIT -- `LICENSE.md` beside this file, Copyright (c) 2025 Kenney, sha256 8e99e4045f71... |
| models | the README says "Sprites and 3D Models (CC0 licensed)"; the LICENSE.md is the repository's MIT and names no separate grant for the models, so the MIT is what is carried here and the CC0 is the README's word |

## What is vendored, and what is not

Vendored: `models/*.glb` (15 files: road-straight, road-straight-lightposts, road-corner, road-split, road-intersection,
pavement, pavement-fountain, grass, grass-trees, grass-trees-tall, building-garage, building-small-a / -b / -c / -d) and
`models/Textures/colormap.png`, the kit's own 512 x 512 palette texture (NOT byte-identical to the racing kit's: the two
differ from byte 46 on). 436 KB.

Not vendored: the Godot project (project.godot, scenes/, scripts/, structures/, the .import sidecars), the sample map,
fonts/ (Kenney's own font under its own licence.txt, unused here), sounds/, sprites/, vector/, screenshots/, the icon and
splash.

## What was read, and a discrepancy

LICENSE.md says Copyright (c) 2025 Kenney and has no trailing newline. The README's own License section says Copyright (c)
2026 Kenney. The file is what is vendored and what world/vendoredLicences.mjs records; the README's year is noted here so
the disagreement is a known one. Both are MIT with the same operative body as the racing kit's LICENSE.
