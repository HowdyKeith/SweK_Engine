// FILE: gpu/defaultMeshes.js
// Round 44 — pre-designed default OBJ meshes. Used when no GLB / OBJ
// is supplied for a kaiju kind or civ style. The "generic" mesh
// replaces the old tall-cube fallback as the LAST resort.
//
// Authoring scale: ~3 units tall, centered at origin, +Y is up.
// Geometry kept low-poly (8-30 faces) so hundreds of fallback markers
// stay cheap to render.

// HUMANOID — civ default. Stacked boxes: legs + torso + head.
export const HUMANOID_OBJ = `
# Humanoid — head + torso + 2 legs + 2 arms
# Torso (cube)
v -0.4 0.6 -0.2
v  0.4 0.6 -0.2
v  0.4 1.6 -0.2
v -0.4 1.6 -0.2
v -0.4 0.6  0.2
v  0.4 0.6  0.2
v  0.4 1.6  0.2
v -0.4 1.6  0.2
f 1 2 3 4
f 5 6 7 8
f 1 4 8 5
f 2 3 7 6
f 4 3 7 8
f 1 2 6 5
# Head (small cube above torso)
v -0.25 1.6 -0.18
v  0.25 1.6 -0.18
v  0.25 2.1 -0.18
v -0.25 2.1 -0.18
v -0.25 1.6  0.18
v  0.25 1.6  0.18
v  0.25 2.1  0.18
v -0.25 2.1  0.18
f 9 10 11 12
f 13 14 15 16
f 9 12 16 13
f 10 11 15 14
f 12 11 15 16
f 9 10 14 13
# Left leg (cube)
v -0.4 0.0 -0.18
v -0.05 0.0 -0.18
v -0.05 0.6 -0.18
v -0.4 0.6 -0.18
v -0.4 0.0  0.18
v -0.05 0.0  0.18
v -0.05 0.6  0.18
v -0.4 0.6  0.18
f 17 18 19 20
f 21 22 23 24
f 17 20 24 21
f 18 19 23 22
# Right leg
v  0.05 0.0 -0.18
v  0.4 0.0 -0.18
v  0.4 0.6 -0.18
v  0.05 0.6 -0.18
v  0.05 0.0  0.18
v  0.4 0.0  0.18
v  0.4 0.6  0.18
v  0.05 0.6  0.18
f 25 26 27 28
f 29 30 31 32
f 25 28 32 29
f 26 27 31 30
`;

// BEAST — quadruped kaiju default. Body + 4 legs + head.
export const BEAST_OBJ = `
# Beast — body + 4 stubby legs + low head
# Body (wide horizontal box)
v -0.7 0.7 -0.4
v  0.7 0.7 -0.4
v  0.9 1.5 -0.4
v -0.9 1.5 -0.4
v -0.7 0.7  0.4
v  0.7 0.7  0.4
v  0.9 1.5  0.4
v -0.9 1.5  0.4
f 1 2 3 4
f 5 6 7 8
f 1 4 8 5
f 2 3 7 6
f 4 3 7 8
f 1 2 6 5
# Head (forward-protruding cube)
v  0.7 0.9 -0.3
v  1.3 0.9 -0.3
v  1.3 1.4 -0.3
v  0.7 1.4 -0.3
v  0.7 0.9  0.3
v  1.3 0.9  0.3
v  1.3 1.4  0.3
v  0.7 1.4  0.3
f 9 10 11 12
f 13 14 15 16
f 10 11 15 14
f 12 11 15 16
f 9 10 14 13
# 4 leg stubs
v -0.65 0.0 -0.35
v -0.35 0.0 -0.35
v -0.35 0.7 -0.35
v -0.65 0.7 -0.35
v -0.65 0.0 -0.05
v -0.35 0.0 -0.05
v -0.35 0.7 -0.05
v -0.65 0.7 -0.05
f 17 18 19 20
f 21 22 23 24
v  0.35 0.0 -0.35
v  0.65 0.0 -0.35
v  0.65 0.7 -0.35
v  0.35 0.7 -0.35
v  0.35 0.0 -0.05
v  0.65 0.0 -0.05
v  0.65 0.7 -0.05
v  0.35 0.7 -0.05
f 25 26 27 28
f 29 30 31 32
v -0.65 0.0  0.05
v -0.35 0.0  0.05
v -0.35 0.7  0.05
v -0.65 0.7  0.05
v -0.65 0.0  0.35
v -0.35 0.0  0.35
v -0.35 0.7  0.35
v -0.65 0.7  0.35
f 33 34 35 36
f 37 38 39 40
v  0.35 0.0  0.05
v  0.65 0.0  0.05
v  0.65 0.7  0.05
v  0.35 0.7  0.05
v  0.35 0.0  0.35
v  0.65 0.0  0.35
v  0.65 0.7  0.35
v  0.35 0.7  0.35
f 41 42 43 44
f 45 46 47 48
`;

// FLYER — central body with 2 wide wings spread horizontally.
export const FLYER_OBJ = `
# Flyer — narrow body + 2 wide wings
# Body (long thin rectangle)
v -0.2 0.8 -0.7
v  0.2 0.8 -0.7
v  0.2 1.4 -0.7
v -0.2 1.4 -0.7
v -0.2 0.8  0.7
v  0.2 0.8  0.7
v  0.2 1.4  0.7
v -0.2 1.4  0.7
f 1 2 3 4
f 5 6 7 8
f 1 4 8 5
f 2 3 7 6
f 4 3 7 8
f 1 2 6 5
# Left wing (thin plane)
v -1.6 1.0 -0.5
v -0.2 1.0 -0.5
v -0.2 1.0  0.5
v -1.6 1.0  0.5
v -1.6 1.05 -0.5
v -0.2 1.05 -0.5
v -0.2 1.05  0.5
v -1.6 1.05  0.5
f 9 10 11 12
f 13 14 15 16
f 9 12 16 13
f 10 11 15 14
# Right wing
v  0.2 1.0 -0.5
v  1.6 1.0 -0.5
v  1.6 1.0  0.5
v  0.2 1.0  0.5
v  0.2 1.05 -0.5
v  1.6 1.05 -0.5
v  1.6 1.05  0.5
v  0.2 1.05  0.5
f 17 18 19 20
f 21 22 23 24
f 17 20 24 21
f 18 19 23 22
`;

// FLOATER — bulbous body with tendrils. Suits water kaiju.
export const FLOATER_OBJ = `
# Floater — bulbous body + 4 hanging tendrils
# Bulb (octahedron-ish, 8 verts)
v  0.0 1.5  0.0
v  0.6 1.0  0.0
v  0.0 1.0  0.6
v -0.6 1.0  0.0
v  0.0 1.0 -0.6
v  0.0 0.5  0.0
f 1 2 3
f 1 3 4
f 1 4 5
f 1 5 2
f 6 3 2
f 6 4 3
f 6 5 4
f 6 2 5
# Tendrils — 4 thin vertical strips
v  0.4 0.0  0.0
v  0.5 0.5  0.0
v  0.4 0.0  0.05
v  0.5 0.5  0.05
f 7 8 10 9
v -0.4 0.0  0.0
v -0.5 0.5  0.0
v -0.4 0.0  0.05
v -0.5 0.5  0.05
f 11 12 14 13
v  0.0 0.0  0.4
v  0.0 0.5  0.5
v  0.05 0.0  0.4
v  0.05 0.5  0.5
f 15 16 18 17
v  0.0 0.0 -0.4
v  0.0 0.5 -0.5
v  0.05 0.0 -0.4
v  0.05 0.5 -0.5
f 19 20 22 21
`;

// GENERIC — last-resort. Replaces the tall-cube fallback. Hexagonal
// prism stretched vertically — clearly not a cube, vaguely "object."
export const GENERIC_OBJ = `
# Generic placeholder — hex prism with chamfered top
# Bottom hex
v  0.5  0.0  0.0
v  0.25 0.0  0.43
v -0.25 0.0  0.43
v -0.5  0.0  0.0
v -0.25 0.0 -0.43
v  0.25 0.0 -0.43
# Top hex (smaller — chamfered)
v  0.35 1.5  0.0
v  0.18 1.5  0.30
v -0.18 1.5  0.30
v -0.35 1.5  0.0
v -0.18 1.5 -0.30
v  0.18 1.5 -0.30
# Apex
v  0.0 1.8 0.0
# Bottom face (fan from vert 1)
f 1 2 3
f 1 3 4
f 1 4 5
f 1 5 6
# Side quads
f 1 7 8 2
f 2 8 9 3
f 3 9 10 4
f 4 10 11 5
f 5 11 12 6
f 6 12 7 1
# Top fan to apex
f 7 13 8
f 8 13 9
f 9 13 10
f 10 13 11
f 11 13 12
f 12 13 7
`;

// Map archetype name → OBJ text. Used by GPUAssetLoader as the
// fallback chain when no on-disk asset matches.
export const DEFAULT_MESHES = {
    humanoid: HUMANOID_OBJ,
    beast:    BEAST_OBJ,
    flyer:    FLYER_OBJ,
    floater:  FLOATER_OBJ,
    generic:  GENERIC_OBJ,
};

// Map kind/style → archetype. Falls through to "generic" if not listed.
export const KIND_TO_ARCHETYPE = {
    // kaiju kinds
    sky:         "flyer",
    space:       "flyer",
    hell:        "beast",
    underground: "beast",
    cave:        "beast",
    water:       "floater",
    tech:        "flyer",        // tech aliens hover
    frost:       "beast",        // modded
    // civ styles — most are "humanoid"
    crystal:     "generic",
    organic:     "humanoid",
    mechanical:  "humanoid",
    fungal:      "floater",
};
