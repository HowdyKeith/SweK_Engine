// =============================================================================
// FILE: /world/carrierAssets.js
// ROUND: 208
// =============================================================================
//
// Procedural OBJ meshes for the three carrier OGRE forms used by the
// carrier-driven reveal modes (round 208):
//
//   • ogre_sub_carrier   — submarine that surfaces from water, drops kaiju
//                          on deck, then submerges
//   • ogre_boat_carrier  — boat that cruises to offshore drop position,
//                          deposits kaiju into water
//   • ogre_flying_carrier — flying ogre with 4 demon-propulsion pods at
//                          the corners (matches OGRE flying_demons concept)
//
// These are simple silhouettes built from box primitives — recognizable
// at a glance, but not detailed OGRE meshes. The intent is to give the
// player a HINT of what OGRE forms look like during kaiju reveals.
// Real OGRE assets can replace these later (the asset names are stable;
// just call installOBJText / swapMesh with the same name to upgrade).
//
// Each mesh is anchored such that y=0 is the BOTTOM. So a sub at
// position.y = surfaceY sits with its hull bottom on the surface;
// trajectory functions in birthSpawner.js use position.y offsets to
// drive surfacing / submerging / flight altitude.
// =============================================================================

// =============================================================================
// Submarine carrier — long hull (16 × 5 × 5) with a conning tower (4 × 3 × 3)
// =============================================================================
//
// Silhouette (top view, +X right, +Z forward):
//
//                ┌──┐
//   ────────────┤  ├────────────
//   hull         └──┘    hull
//   ────────────────────────────
//                tower at center
//
// Side view (+Y up):
//
//          ▄
//        ▄███▄        ← conning tower
//   ▄▄▄██████████▄▄▄  ← hull
// =============================================================================

export const OGRE_SUB_OBJ = `# ogre_sub_carrier — round 208
# 16-unit long hull, 5 wide, 5 tall, anchored at y=0 (hull bottom)
# Conning tower rises +3 above hull top

# --- hull (16 × 5 × 5) ---
v -8 0 -2.5
v  8 0 -2.5
v  8 0  2.5
v -8 0  2.5
v -8 5 -2.5
v  8 5 -2.5
v  8 5  2.5
v -8 5  2.5

# --- conning tower (4 × 3 × 3) on top, slightly aft of center ---
v -1 5 -1.5
v  3 5 -1.5
v  3 5  1.5
v -1 5  1.5
v -1 8 -1.5
v  3 8 -1.5
v  3 8  1.5
v -1 8  1.5

# --- periscope (1 × 2 × 1) on top of tower ---
v  0 8 -0.5
v  1 8 -0.5
v  1 8  0.5
v  0 8  0.5
v  0 10 -0.5
v  1 10 -0.5
v  1 10  0.5
v  0 10  0.5

# --- hull faces ---
f 1 4 3 2
f 5 6 7 8
f 1 2 6 5
f 2 3 7 6
f 3 4 8 7
f 4 1 5 8

# --- tower faces ---
f 9 12 11 10
f 13 14 15 16
f 9 10 14 13
f 10 11 15 14
f 11 12 16 15
f 12 9 13 16

# --- periscope faces ---
f 17 20 19 18
f 21 22 23 24
f 17 18 22 21
f 18 19 23 22
f 19 20 24 23
f 20 17 21 24
`;

// =============================================================================
// Boat carrier — wide flat hull (14 × 2 × 6) with raised bridge (4 × 3 × 3)
// =============================================================================
//
// Top view:
//
//   ┌──────────┐
//   │   ┌──┐   │   ← bridge (raised)
//   │   └──┘   │
//   └──────────┘   ← hull
//
// Side view:
//
//          ▄▄▄
//        ▄█████▄        ← bridge
//   ▄▄▄▄█████████▄▄▄▄   ← hull
// =============================================================================

export const OGRE_BOAT_OBJ = `# ogre_boat_carrier — round 208
# Flat hull 14 × 2 × 6, anchored at y=0 (waterline)
# Bridge rises +3 above hull top, slightly aft of center

# --- hull ---
v -7 0 -3
v  7 0 -3
v  7 0  3
v -7 0  3
v -7 2 -3
v  7 2 -3
v  7 2  3
v -7 2  3

# --- bridge (4 × 3 × 3) ---
v -1 2 -1.5
v  3 2 -1.5
v  3 2  1.5
v -1 2  1.5
v -1 5 -1.5
v  3 5 -1.5
v  3 5  1.5
v -1 5  1.5

# --- prow (forward triangular tip, 4 verts) ---
v  7 0 -3
v  7 0  3
v 10 1  0
v  7 2 -3
v  7 2  3

# --- hull faces ---
f 1 4 3 2
f 5 6 7 8
f 1 2 6 5
f 2 3 7 6
f 3 4 8 7
f 4 1 5 8

# --- bridge faces ---
f 9 12 11 10
f 13 14 15 16
f 9 10 14 13
f 10 11 15 14
f 11 12 16 15
f 12 9 13 16

# --- prow faces (triangles) ---
f 17 19 21
f 18 19 22
f 17 21 22 18
`;

// =============================================================================
// Flying carrier — boxy body (6 × 4 × 6) with 4 demon-propulsion pods
//                  at the corners (sphere-like 2-unit cubes representing
//                  airborne demons)
// =============================================================================
//
// Top view:
//
//   ●         ●         ← demon pods
//      ┌───┐
//      │   │            ← body
//      └───┘
//   ●         ●         ← demon pods
//
// Side view:
//
//   ●     ●             ← demons hovering at body's mid-height
//   ┌─────┐
//   │     │             ← body
//   └─────┘
// =============================================================================

export const OGRE_FLYING_OBJ = `# ogre_flying_carrier — round 208
# Body 6 × 4 × 6, anchored at y=0 (body bottom)
# 4 demon pods (2-unit cubes) at corners, offset diagonally outward

# --- body (6 × 4 × 6) ---
v -3 0 -3
v  3 0 -3
v  3 0  3
v -3 0  3
v -3 4 -3
v  3 4 -3
v  3 4  3
v -3 4  3

# --- demon pod NE (corner +X +Z, hovering at mid-body height) ---
v  4 1  4
v  6 1  4
v  6 1  6
v  4 1  6
v  4 3  4
v  6 3  4
v  6 3  6
v  4 3  6

# --- demon pod NW (corner -X +Z) ---
v -6 1  4
v -4 1  4
v -4 1  6
v -6 1  6
v -6 3  4
v -4 3  4
v -4 3  6
v -6 3  6

# --- demon pod SE (corner +X -Z) ---
v  4 1 -6
v  6 1 -6
v  6 1 -4
v  4 1 -4
v  4 3 -6
v  6 3 -6
v  6 3 -4
v  4 3 -4

# --- demon pod SW (corner -X -Z) ---
v -6 1 -6
v -4 1 -6
v -4 1 -4
v -6 1 -4
v -6 3 -6
v -4 3 -6
v -4 3 -4
v -6 3 -4

# --- body faces ---
f 1 4 3 2
f 5 6 7 8
f 1 2 6 5
f 2 3 7 6
f 3 4 8 7
f 4 1 5 8

# --- demon pod NE faces ---
f 9 12 11 10
f 13 14 15 16
f 9 10 14 13
f 10 11 15 14
f 11 12 16 15
f 12 9 13 16

# --- demon pod NW faces ---
f 17 20 19 18
f 21 22 23 24
f 17 18 22 21
f 18 19 23 22
f 19 20 24 23
f 20 17 21 24

# --- demon pod SE faces ---
f 25 28 27 26
f 29 30 31 32
f 25 26 30 29
f 26 27 31 30
f 27 28 32 31
f 28 25 29 32

# --- demon pod SW faces ---
f 33 36 35 34
f 37 38 39 40
f 33 34 38 37
f 34 35 39 38
f 35 36 40 39
f 36 33 37 40
`;

export const CARRIER_ASSETS = [
    { id: "ogre_sub_carrier",    obj: OGRE_SUB_OBJ    },
    { id: "ogre_boat_carrier",   obj: OGRE_BOAT_OBJ   },
    { id: "ogre_flying_carrier", obj: OGRE_FLYING_OBJ },
];

// Install all three carriers via assetLoader.installOBJText. Idempotent
// (returns immediately if already installed). Returns Promise<boolean>
// — true if all assets are now in the cache.
let _installed = false;
let _installPromise = null;

export async function installCarrierAssets(assetLoader) {
    if (_installed) return true;
    if (_installPromise) return _installPromise;
    if (!assetLoader?.installOBJText) {
        console.warn("[carrierAssets] assetLoader.installOBJText not available");
        return false;
    }
    _installPromise = (async () => {
        try {
            for (const { id, obj } of CARRIER_ASSETS) {
                await assetLoader.installOBJText(id, obj);
            }
            _installed = true;
            console.log(`[carrierAssets] installed ${CARRIER_ASSETS.length} carrier OGRE forms (sub / boat / flying)`);
            return true;
        } catch (e) {
            console.warn("[carrierAssets] install threw:", e?.message || e);
            return false;
        } finally {
            _installPromise = null;
        }
    })();
    return _installPromise;
}
