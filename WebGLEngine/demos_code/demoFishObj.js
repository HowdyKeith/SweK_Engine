// FILE: demos_code/demoFishObj.js
// VERSION: v1 — round 422
//
// A tiny hand-built low-poly fish in Wavefront OBJ text, used by
// fishModels.demoFish() so the whole OBJ → GPU mesh → spawnMesh path can
// be verified end-to-end without any external asset on hand (the same
// idea as wadSprites.test()). Forward is +Z; a stretched octahedral body
// with a flared tail fin. Winding isn't fussy — the entity renderer draws
// meshes double-sided (cull disabled), so this reads from any angle.

export const DEMO_FISH_OBJ = `# demo fish
v 0 0 1.0
v 0.3 0 0
v -0.3 0 0
v 0 0.35 0
v 0 -0.35 0
v 0 0 -0.6
v 0 0.45 -1.1
v 0 -0.45 -1.1
# body: nose to mid-ring
f 1 2 4
f 1 4 3
f 1 3 5
f 1 5 2
# mid-ring to tail base
f 2 6 4
f 4 6 3
f 3 6 5
f 5 6 2
# tail fin
f 6 7 8
`;
