// FILE: gpu/hardpointMeshes.js
//
// Round 94 — procedural dome+barrel composite geometry for OGRE
// hardpoints (and the main chassis turret). Replaces the cube primitives
// that hardpoints had been rendering as.
//
// MESH FORMAT
//   Each kind produces an OBJ text string. The asset loader parses it
//   into a standard mesh entry, which is then served by name to any
//   entity that calls entity:spawnMesh with the matching kind.
//
// PER-KIND DESIGN
//   ogre_hp_weapon : standard dome + medium barrel facing +Z (forward)
//   ogre_hp_engine : exhaust block — cylinder along -Z, no dome
//   ogre_hp_tech   : low dome only — reads as a sensor blister
//   ogre_hp_sensor : tiny dome with tall thin antenna along +Y
//   ogre_turret    : the chassis's main turret — large dome + long barrel
//                    along +Z. yawMode is "aim" so the whole mesh
//                    rotates to track targets.
//
// COORDINATE CONVENTION
//   +Z = forward (matches OgreScenario's ogreFwdZ convention)
//   +Y = up
//   +X = right
//   Dome sits at origin opening downward. Barrel extends from origin
//   along its configured axis.

// ============================================================
// HARDPOINT_GEOMETRY — params per kind
// ============================================================

export const HARDPOINT_GEOMETRY = {
    ogre_hp_weapon: {
        domeRadius:   0.70,
        barrelRadius: 0.18,
        barrelLength: 1.40,
        barrelAxis:   "z",
        tint:         [1.00, 0.45, 0.20],
    },
    ogre_hp_engine: {
        // No dome — an exhaust stack only. Cylinder facing backward.
        // The "barrel" reads as a chunky exhaust port.
        domeRadius:   0.0,
        barrelRadius: 0.55,
        barrelLength: 0.80,
        barrelAxis:   "-z",
        tint:         [1.00, 0.60, 0.15],
    },
    ogre_hp_tech: {
        // Dome only — a sensor / coolant blister bolted to the armor.
        domeRadius:   0.55,
        barrelRadius: 0.0,
        barrelLength: 0,
        tint:         [0.50, 0.90, 1.00],
    },
    ogre_hp_sensor: {
        // Tall thin antenna with a tiny dome at its base.
        domeRadius:   0.22,
        barrelRadius: 0.05,
        barrelLength: 1.60,
        barrelAxis:   "y",
        tint:         [0.40, 1.00, 0.85],
    },
    ogre_turret: {
        // Big main turret on top of chassis.
        domeRadius:   0.90,
        barrelRadius: 0.22,
        barrelLength: 1.80,
        barrelAxis:   "z",
        tint:         [0.78, 0.78, 0.80],
    },
    // Round 106 — underside weapon. Small dome with a short barrel
    // pointing DOWN (anti-personnel / strafing turret for use against
    // defenders that get under the chassis). Mounts on the OGRE belly
    // via face:"bottom" in HARDPOINTS_DEF.
    ogre_hp_underside: {
        domeRadius:   0.45,
        barrelRadius: 0.15,
        barrelLength: 0.70,
        barrelAxis:   "-y",      // points straight down
        tint:         [0.85, 0.35, 0.15],   // hot orange
    },
    // Round 106 — hover jet thruster for sub-OGRE flying variants.
    // No dome — a downward exhaust cone. The "barrel" reads as the
    // exhaust nozzle with a small flare at the tip. Variant.special=
    // "flying_hover" places 4 of these at the underside corners and
    // the OGRE gets a flight Y offset so it hovers above the terrain.
    ogre_hover_jet: {
        domeRadius:   0.0,
        barrelRadius: 0.40,
        barrelLength: 0.90,
        barrelAxis:   "-y",
        tint:         [0.20, 0.65, 1.00],   // cyan exhaust glow
    },
    // Round 107 — jet engine pod for "flying_jets" propulsion variant.
    // Cylindrical pod mounted on the OGRE sides with exhaust facing
    // backward (-z), reads as horizontal-thrust aircraft engine.
    // Bigger than hover_jet — these are the primary forward-thrust
    // engines. Two of them, one per side.
    ogre_jet_engine: {
        domeRadius:   0.45,        // small nose cone at front (+z)
        barrelRadius: 0.55,
        barrelLength: 1.60,
        barrelAxis:   "-z",        // exhaust faces backward
        tint:         [1.00, 0.55, 0.20],   // orange-hot exhaust
    },
    // Round 107 — demon entity for "flying_demons" propulsion variant.
    // Four of these fly ahead of the OGRE in a V formation, visually
    // towing it through the air. Small dome (head) with a downward
    // body cylinder (torso/limbs hanging). Dark red infernal tint.
    ogre_demon: {
        domeRadius:   0.35,
        barrelRadius: 0.14,
        barrelLength: 0.60,
        barrelAxis:   "-y",
        tint:         [0.60, 0.10, 0.12],   // dark blood red
    },
};

// Round 95 — tread geometry. Long flat plate with periodic raised
// bumps along the chassis-forward (Z) axis. Reads as a tank track
// belt; combined with shader anim mode 5 (Z-axis belt scroll, also
// used by the ammo belt) the whole mesh subtly shifts back-and-forth
// giving a sense of track rotation.
export const TREAD_GEOMETRY = {
    ogre_tread: {
        length:       2.4,     // along Z (chassis depth direction)
        width:        0.65,    // along X
        height:       0.45,    // along Y (above the ground plane)
        bumpCount:    6,
        bumpHeight:   0.10,    // bump rise above plate top
        bumpFrac:     0.45,    // fraction of each segment occupied by bump
        tint:         [0.18, 0.18, 0.20],
    },
};

// Round 102 — OGRE_HULL geometry. Previously mk1-mk9 used kind="tech"
// which fell back to a generic cube primitive — the "large planes"
// look the user was seeing (turret/cannon/treads floating around a
// flat slab). This generator produces a proper brutalist tank hull
// that the hardpoints attach TO instead of floating on:
//
//   - Lower hull (main body): a rectangular box with sloped front
//     glacis plate (military-tank-style angled forward armor).
//   - Upper deck (raised superstructure): narrower box on top of
//     lower hull. Turret/cannon/antenna mount onto this.
//   - Rear armor plate: vertical slab at the back, separate from
//     the body so engine grilles / exhaust read as detached.
//   - Side fender skirts: thin plates over the tread mount points.
//
// Vertex coordinates are in chassis-local units divided by BASE_SCALE
// (4.0) — the OGRE entity's variant.scale=4 multiplier expands the
// mesh back to chassis-local size at render. This way mk1-mk9 with
// scale=4..5 render the hull at the correct chassis-aligned size and
// hardpoint positions (already at chassis-local coords up to ±2.5)
// land on the hull surface, not floating in space.
//
// All dimensions match OGRE_CHASSIS_DIMS in simulation/OgreScenario.js.
export const HULL_GEOMETRY = {
    ogre_hull: {
        // Lower hull box (chassis-local coords)
        lower:    { halfWidth: 2.4, halfDepth: 2.0, bottomY: 0.4, topY: 1.4 },
        // Upper deck (superstructure)
        upper:    { halfWidth: 1.7, halfDepth: 1.3, topY: 2.25 },
        // Front glacis — sloped plate from upper-deck-front down to
        // lower-hull-front-extended-forward. Gives the tank an angled
        // forward armor signature.
        glacis:   { forwardZ: 2.5, halfWidth: 2.0, topY: 1.4, bottomZ: 2.0 },
        // Rear armor plate
        rearPlate: { halfWidth: 2.0, topY: 1.8, bottomY: 0.4, backZ: -2.3 },
        // Side fender skirts (above the tread mount line)
        fenders:  { topY: 1.0, bottomY: 0.4, halfDepth: 2.2 },
        // Reference scale — divide all coords by this so entity.scale=4
        // multiplies back to chassis-local. mk1-mk9 use variant.scale=4
        // or 5; the 5-scale variants come out 25% bigger naturally.
        baseScale: 4.0,
        tint:     [0.34, 0.36, 0.40],   // gunmetal grey-blue
    },
};

// ============================================================
// GEOMETRY GENERATOR
// ============================================================

/**
 * Generates OBJ text for a dome+barrel composite. Any component can be
 * disabled by setting its size to 0.
 *
 *   domeRadius   — radius of the hemisphere; 0 to skip
 *   barrelRadius — radius of the barrel cylinder; 0 to skip
 *   barrelLength — length of the barrel
 *   barrelAxis   — "z" / "-z" / "y" / "-y" / "x" / "-x"
 *   domeLat      — latitudinal segments on the dome (4 is plenty)
 *   domeLng      — longitudinal segments on the dome (8 for cleanish silhouette)
 *   barrelSeg    — segments around the barrel (6 = hex; 8 = clean cylinder)
 */
export function makeDomeBarrelOBJ({
    domeRadius   = 0.7,
    barrelRadius = 0.18,
    barrelLength = 1.4,
    barrelAxis   = "z",
    domeLat      = 4,
    domeLng      = 8,
    barrelSeg    = 8,
} = {}) {
    const verts = [];      // each: [x, y, z]
    const norms = [];      // each: [nx, ny, nz]
    const faces = [];      // each: [i1, i2, i3]  (1-indexed for OBJ)

    function pushVert(x, y, z, nx, ny, nz) {
        verts.push([x, y, z]);
        norms.push([nx, ny, nz]);
        return verts.length;       // OBJ is 1-indexed
    }

    // ----- DOME (upper hemisphere, opening down) -----
    if (domeRadius > 0) {
        // Generate rings from pole (top) to equator (bottom of dome)
        const rings = [];
        for (let lat = 0; lat <= domeLat; lat++) {
            const theta = (lat / domeLat) * (Math.PI / 2);       // 0 (pole) to pi/2 (equator)
            const y = domeRadius * Math.cos(theta);
            const r = domeRadius * Math.sin(theta);
            const ring = [];
            for (let lng = 0; lng < domeLng; lng++) {
                const phi = (lng / domeLng) * 2 * Math.PI;
                const x = r * Math.cos(phi);
                const z = r * Math.sin(phi);
                // Outward-facing normal from sphere center
                const nx = x / domeRadius;
                const ny = y / domeRadius;
                const nz = z / domeRadius;
                ring.push(pushVert(x, y, z, nx, ny, nz));
            }
            rings.push(ring);
        }
        // Connect with quads → 2 triangles each
        for (let lat = 0; lat < domeLat; lat++) {
            const r1 = rings[lat];
            const r2 = rings[lat + 1];
            for (let lng = 0; lng < domeLng; lng++) {
                const a = r1[lng];
                const b = r1[(lng + 1) % domeLng];
                const c = r2[(lng + 1) % domeLng];
                const d = r2[lng];
                faces.push([a, b, c]);
                faces.push([a, c, d]);
            }
        }
    }

    // ----- BARREL (cylinder + capped tip along configured axis) -----
    if (barrelRadius > 0 && barrelLength > 0) {
        // Axis basis vectors (along = axis direction, perp1/perp2 = ring plane)
        const A = _axisVectors(barrelAxis);
        // Anchor: base of barrel slightly inside dome so it embeds.
        // For axes pointing up/forward/right, anchor is at origin;
        // dome center is at origin, so barrel emerges from inside.
        // Embed depth lets the dome surface "swallow" the barrel base
        // for a clean composite read.
        const embed = domeRadius > 0 ? -domeRadius * 0.4 : 0;
        const baseRing = [];
        const tipRing  = [];
        for (let seg = 0; seg < barrelSeg; seg++) {
            const phi = (seg / barrelSeg) * 2 * Math.PI;
            const cP = Math.cos(phi), sP = Math.sin(phi);
            // Ring plane = perp1 * cos(phi) + perp2 * sin(phi), scaled by radius
            const rx = (A.p1[0] * cP + A.p2[0] * sP) * barrelRadius;
            const ry = (A.p1[1] * cP + A.p2[1] * sP) * barrelRadius;
            const rz = (A.p1[2] * cP + A.p2[2] * sP) * barrelRadius;
            // Base position: embed * along
            const bx = A.along[0] * embed + rx;
            const by = A.along[1] * embed + ry;
            const bz = A.along[2] * embed + rz;
            // Tip position: barrelLength * along
            const tx = A.along[0] * barrelLength + rx;
            const ty = A.along[1] * barrelLength + ry;
            const tz = A.along[2] * barrelLength + rz;
            // Outward-radial normal
            const nx = rx / barrelRadius;
            const ny = ry / barrelRadius;
            const nz = rz / barrelRadius;
            baseRing.push(pushVert(bx, by, bz, nx, ny, nz));
            tipRing.push (pushVert(tx, ty, tz, nx, ny, nz));
        }
        // Side quads
        for (let seg = 0; seg < barrelSeg; seg++) {
            const a = baseRing[seg];
            const b = baseRing[(seg + 1) % barrelSeg];
            const c = tipRing [(seg + 1) % barrelSeg];
            const d = tipRing [seg];
            faces.push([a, b, c]);
            faces.push([a, c, d]);
        }
        // Cap the tip with a triangle fan from the center point
        const tipCenter = pushVert(
            A.along[0] * (barrelLength + 0.02),
            A.along[1] * (barrelLength + 0.02),
            A.along[2] * (barrelLength + 0.02),
            A.along[0], A.along[1], A.along[2],
        );
        for (let seg = 0; seg < barrelSeg; seg++) {
            const a = tipRing[seg];
            const b = tipRing[(seg + 1) % barrelSeg];
            faces.push([a, b, tipCenter]);
        }
    }

    // ----- SERIALIZE TO OBJ TEXT -----
    let obj = "# Procedural dome+barrel composite\n";
    for (const v of verts) {
        obj += `v ${v[0].toFixed(4)} ${v[1].toFixed(4)} ${v[2].toFixed(4)}\n`;
    }
    for (const n of norms) {
        obj += `vn ${n[0].toFixed(4)} ${n[1].toFixed(4)} ${n[2].toFixed(4)}\n`;
    }
    for (const f of faces) {
        // Face format: v//n v//n v//n (no UVs)
        obj += `f ${f[0]}//${f[0]} ${f[1]}//${f[1]} ${f[2]}//${f[2]}\n`;
    }
    return obj;
}

// Return {along, p1, p2} unit basis vectors for the given axis string.
// `along` is the axis direction; `p1` and `p2` span the perpendicular plane.
function _axisVectors(axisStr) {
    switch (axisStr) {
        case "z":  return { along: [0, 0, 1],  p1: [1, 0, 0],  p2: [0, 1, 0]  };
        case "-z": return { along: [0, 0, -1], p1: [1, 0, 0],  p2: [0, 1, 0]  };
        case "y":  return { along: [0, 1, 0],  p1: [1, 0, 0],  p2: [0, 0, 1]  };
        case "-y": return { along: [0, -1, 0], p1: [1, 0, 0],  p2: [0, 0, 1]  };
        case "x":  return { along: [1, 0, 0],  p1: [0, 1, 0],  p2: [0, 0, 1]  };
        case "-x": return { along: [-1, 0, 0], p1: [0, 1, 0],  p2: [0, 0, 1]  };
        default:   return { along: [0, 0, 1],  p1: [1, 0, 0],  p2: [0, 1, 0]  };
    }
}

// ============================================================
// TREAD GEOMETRY GENERATOR
// ============================================================

/**
 * Round 95 — generates OBJ for a tank-tread plate with periodic raised
 * bumps along Z. The base is a flat slab; the top surface alternates
 * between flat sections and raised "plate" bumps that read as
 * articulated track segments. Combined with shader anim mode 5
 * (belt scroll along Z, ±0.06u displacement), the bumps appear to
 * shift back and forth visibly during chassis motion.
 *
 *   length     — total Z length (along chassis depth direction)
 *   width      — X width (chassis-perpendicular)
 *   height     — Y height of the base slab
 *   bumpCount  — number of raised bumps along the top
 *   bumpHeight — additional Y rise above the slab top for each bump
 *   bumpFrac   — fraction of each segment occupied by the bump (0..1)
 */
export function makeTreadOBJ({
    length     = 2.4,
    width      = 0.65,
    height     = 0.45,
    bumpCount  = 6,
    bumpHeight = 0.10,
    bumpFrac   = 0.45,
} = {}) {
    const verts = [];
    const norms = [];
    const faces = [];

    function pushVert(x, y, z, nx, ny, nz) {
        verts.push([x, y, z]);
        norms.push([nx, ny, nz]);
        return verts.length;
    }
    function pushQuad(a, b, c, d) {
        // Two triangles forming a quad
        faces.push([a, b, c]);
        faces.push([a, c, d]);
    }

    const hw = width / 2;
    const hl = length / 2;
    const topY = height;
    const bumpTopY = height + bumpHeight;

    // ----- BASE SLAB -----
    // 6 quads (bottom, 4 sides, NOT top — top is replaced by the
    // bumpy surface below). Each face gets its own duplicated vertex
    // set so normals are face-correct (flat shading).

    // Bottom (y=0, normal -Y)
    const b0 = pushVert(-hw, 0,    -hl, 0, -1, 0);
    const b1 = pushVert( hw, 0,    -hl, 0, -1, 0);
    const b2 = pushVert( hw, 0,     hl, 0, -1, 0);
    const b3 = pushVert(-hw, 0,     hl, 0, -1, 0);
    pushQuad(b3, b2, b1, b0);     // reversed winding so outward normal points -Y

    // Front (+Z, normal +Z)
    const fr0 = pushVert(-hw, 0,    hl, 0, 0, 1);
    const fr1 = pushVert( hw, 0,    hl, 0, 0, 1);
    const fr2 = pushVert( hw, topY, hl, 0, 0, 1);
    const fr3 = pushVert(-hw, topY, hl, 0, 0, 1);
    pushQuad(fr0, fr1, fr2, fr3);

    // Back (-Z, normal -Z)
    const bk0 = pushVert(-hw, 0,    -hl, 0, 0, -1);
    const bk1 = pushVert( hw, 0,    -hl, 0, 0, -1);
    const bk2 = pushVert( hw, topY, -hl, 0, 0, -1);
    const bk3 = pushVert(-hw, topY, -hl, 0, 0, -1);
    pushQuad(bk3, bk2, bk1, bk0); // reversed → outward -Z

    // Right (+X, normal +X)
    const rt0 = pushVert(hw, 0,    -hl, 1, 0, 0);
    const rt1 = pushVert(hw, 0,     hl, 1, 0, 0);
    const rt2 = pushVert(hw, topY,  hl, 1, 0, 0);
    const rt3 = pushVert(hw, topY, -hl, 1, 0, 0);
    pushQuad(rt0, rt1, rt2, rt3);

    // Left (-X, normal -X)
    const lt0 = pushVert(-hw, 0,    -hl, -1, 0, 0);
    const lt1 = pushVert(-hw, 0,     hl, -1, 0, 0);
    const lt2 = pushVert(-hw, topY,  hl, -1, 0, 0);
    const lt3 = pushVert(-hw, topY, -hl, -1, 0, 0);
    pushQuad(lt3, lt2, lt1, lt0); // reversed → outward -X

    // ----- TOP SURFACE WITH BUMPS -----
    // Build top as alternating flat | bump segments along Z. Each segment:
    //   - flat portion at topY
    //   - bump portion at bumpTopY (with sloped sides between them)
    // Bumps inset slightly from X edges so left/right walls of bumps
    // are visible against the slab edges.

    const segLen   = length / bumpCount;
    const bumpLen  = segLen * bumpFrac;
    const flatLen  = segLen - bumpLen;
    const halfFlat = flatLen / 2;
    const bumpInset = width * 0.05;    // X inset for bump (5% on each side)
    const bumpHW   = hw - bumpInset;

    for (let i = 0; i < bumpCount; i++) {
        const segStart  = -hl + i * segLen;
        // Pre-flat strip (before the bump rises)
        const z0 = segStart;
        const z1 = segStart + halfFlat;
        // Flat top quad
        const f0 = pushVert(-hw, topY, z0, 0, 1, 0);
        const f1 = pushVert( hw, topY, z0, 0, 1, 0);
        const f2 = pushVert( hw, topY, z1, 0, 1, 0);
        const f3 = pushVert(-hw, topY, z1, 0, 1, 0);
        pushQuad(f0, f1, f2, f3);
        // Bump section. Vertical rise on -Z side, plateau, vertical fall on +Z side
        const zRiseStart = z1;
        const zPlateauStart = z1;
        const zPlateauEnd = z1 + bumpLen;
        const zFallEnd = z1 + bumpLen;

        // Riser (back face of bump, normal -Z) — small wall from topY to bumpTopY
        const rb0 = pushVert(-bumpHW, topY,     zRiseStart, 0, 0, -1);
        const rb1 = pushVert( bumpHW, topY,     zRiseStart, 0, 0, -1);
        const rb2 = pushVert( bumpHW, bumpTopY, zRiseStart, 0, 0, -1);
        const rb3 = pushVert(-bumpHW, bumpTopY, zRiseStart, 0, 0, -1);
        pushQuad(rb3, rb2, rb1, rb0);   // outward -Z

        // Top of bump (flat at bumpTopY)
        const bt0 = pushVert(-bumpHW, bumpTopY, zPlateauStart, 0, 1, 0);
        const bt1 = pushVert( bumpHW, bumpTopY, zPlateauStart, 0, 1, 0);
        const bt2 = pushVert( bumpHW, bumpTopY, zPlateauEnd,   0, 1, 0);
        const bt3 = pushVert(-bumpHW, bumpTopY, zPlateauEnd,   0, 1, 0);
        pushQuad(bt0, bt1, bt2, bt3);

        // Left side of bump (-X face, normal -X)
        const bl0 = pushVert(-bumpHW, topY,     zPlateauStart, -1, 0, 0);
        const bl1 = pushVert(-bumpHW, topY,     zPlateauEnd,   -1, 0, 0);
        const bl2 = pushVert(-bumpHW, bumpTopY, zPlateauEnd,   -1, 0, 0);
        const bl3 = pushVert(-bumpHW, bumpTopY, zPlateauStart, -1, 0, 0);
        pushQuad(bl3, bl2, bl1, bl0);

        // Right side of bump (+X face, normal +X)
        const br0 = pushVert(bumpHW, topY,     zPlateauStart, 1, 0, 0);
        const br1 = pushVert(bumpHW, topY,     zPlateauEnd,   1, 0, 0);
        const br2 = pushVert(bumpHW, bumpTopY, zPlateauEnd,   1, 0, 0);
        const br3 = pushVert(bumpHW, bumpTopY, zPlateauStart, 1, 0, 0);
        pushQuad(br0, br1, br2, br3);

        // Faller (front of bump, normal +Z)
        const fa0 = pushVert(-bumpHW, topY,     zFallEnd, 0, 0, 1);
        const fa1 = pushVert( bumpHW, topY,     zFallEnd, 0, 0, 1);
        const fa2 = pushVert( bumpHW, bumpTopY, zFallEnd, 0, 0, 1);
        const fa3 = pushVert(-bumpHW, bumpTopY, zFallEnd, 0, 0, 1);
        pushQuad(fa0, fa1, fa2, fa3);

        // Post-flat strip (after the bump)
        const z2 = zFallEnd;
        const z3 = segStart + segLen;
        const p0 = pushVert(-hw, topY, z2, 0, 1, 0);
        const p1 = pushVert( hw, topY, z2, 0, 1, 0);
        const p2 = pushVert( hw, topY, z3, 0, 1, 0);
        const p3 = pushVert(-hw, topY, z3, 0, 1, 0);
        pushQuad(p0, p1, p2, p3);
    }

    // ----- SERIALIZE -----
    let obj = "# Procedural tread plate with bumps\n";
    for (const v of verts) obj += `v ${v[0].toFixed(4)} ${v[1].toFixed(4)} ${v[2].toFixed(4)}\n`;
    for (const n of norms) obj += `vn ${n[0].toFixed(4)} ${n[1].toFixed(4)} ${n[2].toFixed(4)}\n`;
    for (const f of faces) obj += `f ${f[0]}//${f[0]} ${f[1]}//${f[1]} ${f[2]}//${f[2]}\n`;
    return obj;
}

// ============================================================
// HULL GEOMETRY GENERATOR
// ============================================================
// Round 102 — composite hull mesh for OGRE chassis. Produces:
//   - Lower hull box (main body)
//   - Upper deck box (raised superstructure)
//   - Front glacis slab (angled forward armor)
//   - Rear armor plate (separate slab at the back)
//   - Side fender skirts (covers above the treads)
//
// All vertex coordinates are divided by params.baseScale (default 4.0)
// so that when the OGRE entity renders at variant.scale=4..5 the
// final world geometry exactly fills OGRE_CHASSIS_DIMS in
// simulation/OgreScenario.js (halfWidth=2.5, halfDepth=2.5, topY=2.25).

export function makeHullOBJ(params) {
    const lower = params.lower;
    const upper = params.upper;
    const glacis = params.glacis;
    const rearPlate = params.rearPlate;
    const fenders = params.fenders;
    const scale = params.baseScale || 4.0;
    const inv = 1 / scale;

    const verts = [];   // [x, y, z]
    const norms = [];   // [nx, ny, nz]
    const faces = [];   // [a, b, c]

    function pushVert(x, y, z, nx, ny, nz) {
        verts.push([x * inv, y * inv, z * inv]);
        norms.push([nx, ny, nz]);
        return verts.length;     // 1-indexed for OBJ
    }
    function pushQuad(a, b, c, d) {
        faces.push([a, b, c]);
        faces.push([a, c, d]);
    }
    function pushBox(x0, x1, y0, y1, z0, z1, { skipFront = false, skipTop = false, skipBottom = false, skipBack = false } = {}) {
        // Bottom (-Y)
        if (!skipBottom) {
            const a = pushVert(x0, y0, z0, 0, -1, 0);
            const b = pushVert(x1, y0, z0, 0, -1, 0);
            const c = pushVert(x1, y0, z1, 0, -1, 0);
            const d = pushVert(x0, y0, z1, 0, -1, 0);
            pushQuad(a, d, c, b);
        }
        // Top (+Y)
        if (!skipTop) {
            const a = pushVert(x0, y1, z0, 0, 1, 0);
            const b = pushVert(x1, y1, z0, 0, 1, 0);
            const c = pushVert(x1, y1, z1, 0, 1, 0);
            const d = pushVert(x0, y1, z1, 0, 1, 0);
            pushQuad(a, b, c, d);
        }
        // Front (+Z)
        if (!skipFront) {
            const a = pushVert(x0, y0, z1, 0, 0, 1);
            const b = pushVert(x1, y0, z1, 0, 0, 1);
            const c = pushVert(x1, y1, z1, 0, 0, 1);
            const d = pushVert(x0, y1, z1, 0, 0, 1);
            pushQuad(a, b, c, d);
        }
        // Back (-Z)
        if (!skipBack) {
            const a = pushVert(x0, y0, z0, 0, 0, -1);
            const b = pushVert(x1, y0, z0, 0, 0, -1);
            const c = pushVert(x1, y1, z0, 0, 0, -1);
            const d = pushVert(x0, y1, z0, 0, 0, -1);
            pushQuad(a, d, c, b);
        }
        // Left (-X)
        {
            const a = pushVert(x0, y0, z0, -1, 0, 0);
            const b = pushVert(x0, y0, z1, -1, 0, 0);
            const c = pushVert(x0, y1, z1, -1, 0, 0);
            const d = pushVert(x0, y1, z0, -1, 0, 0);
            pushQuad(a, b, c, d);
        }
        // Right (+X)
        {
            const a = pushVert(x1, y0, z0, 1, 0, 0);
            const b = pushVert(x1, y0, z1, 1, 0, 0);
            const c = pushVert(x1, y1, z1, 1, 0, 0);
            const d = pushVert(x1, y1, z0, 1, 0, 0);
            pushQuad(a, d, c, b);
        }
    }

    // ----- LOWER HULL -----
    // Skip the front face — the glacis plate will cover it (and extend
    // it forward to forwardZ).
    pushBox(
        -lower.halfWidth, lower.halfWidth,
        lower.bottomY,    lower.topY,
        -lower.halfDepth, lower.halfDepth,
        { skipFront: true, skipBottom: false }
    );

    // ----- UPPER DECK -----
    pushBox(
        -upper.halfWidth, upper.halfWidth,
        lower.topY,       upper.topY,
        -upper.halfDepth, upper.halfDepth
    );

    // ----- FRONT GLACIS SLAB -----
    // Sloped plate from upper-deck front-top down to lower-hull front-
    // bottom-extended-forward. Three vertices form the slope: top edge
    // at (±glacisHW, lower.topY, lower.halfDepth) and bottom edge at
    // (±glacisHW, lower.bottomY, glacis.forwardZ). The slope normal
    // points up-and-forward.
    const ghw = glacis.halfWidth;
    const gTopZ  = lower.halfDepth;
    const gBotZ  = glacis.forwardZ;
    const gTopY  = lower.topY;
    const gBotY  = lower.bottomY;
    // Slope normal — compute from cross-product. Slope goes
    // (0, gBotY-gTopY, gBotZ-gTopZ); width-axis is (1,0,0); normal is
    // their cross, pointing outward (forward+up).
    const slopeDy = gBotY - gTopY;       // negative (downward)
    const slopeDz = gBotZ - gTopZ;       // positive (forward)
    const slen = Math.sqrt(slopeDy * slopeDy + slopeDz * slopeDz);
    const slopeN = [0, slopeDz / slen, -slopeDy / slen];   // outward
    {
        const a = pushVert(-ghw, gTopY, gTopZ, slopeN[0], slopeN[1], slopeN[2]);
        const b = pushVert( ghw, gTopY, gTopZ, slopeN[0], slopeN[1], slopeN[2]);
        const c = pushVert( ghw, gBotY, gBotZ, slopeN[0], slopeN[1], slopeN[2]);
        const d = pushVert(-ghw, gBotY, gBotZ, slopeN[0], slopeN[1], slopeN[2]);
        pushQuad(a, b, c, d);
    }
    // Side cap triangles — fill the gap between glacis edge and
    // lower-hull side at -X and +X.
    {
        // Left cap (-X)
        const a = pushVert(-ghw, gTopY, gTopZ, -1, 0, 0);
        const b = pushVert(-ghw, gBotY, gBotZ, -1, 0, 0);
        const c = pushVert(-ghw, gBotY, gTopZ, -1, 0, 0);
        faces.push([a, b, c]);
        // Right cap (+X)
        const d = pushVert( ghw, gTopY, gTopZ, 1, 0, 0);
        const e = pushVert( ghw, gBotY, gBotZ, 1, 0, 0);
        const f = pushVert( ghw, gBotY, gTopZ, 1, 0, 0);
        faces.push([d, f, e]);
    }
    // Underbelly extension — small triangle filling the bottom under
    // the glacis between lower-hull front edge and gBotZ.
    {
        const a = pushVert(-ghw, gBotY, gTopZ, 0, -1, 0);
        const b = pushVert( ghw, gBotY, gTopZ, 0, -1, 0);
        const c = pushVert( ghw, gBotY, gBotZ, 0, -1, 0);
        const d = pushVert(-ghw, gBotY, gBotZ, 0, -1, 0);
        pushQuad(a, d, c, b);
    }

    // ----- REAR ARMOR PLATE -----
    // Standalone vertical slab BEHIND the lower hull's back face.
    // Adds layered silhouette + reads as an engine grille assembly.
    {
        const rhw = rearPlate.halfWidth;
        const ry0 = rearPlate.bottomY;
        const ry1 = rearPlate.topY;
        const rz  = rearPlate.backZ;
        // 0.1u thick slab
        const rzBack = rz - 0.1;
        pushBox(-rhw, rhw, ry0, ry1, rzBack, rz);
    }

    // ----- SIDE FENDER SKIRTS -----
    // Thin vertical plates flush against the lower hull's sides, raised
    // slightly above the tread plane. Adds detail at the wheel line.
    {
        const fy0 = fenders.bottomY;
        const fy1 = fenders.topY;
        const fhd = fenders.halfDepth;
        const lhw = lower.halfWidth;
        // Left fender (just outside -X face of lower hull)
        pushBox(-lhw - 0.08, -lhw + 0.02, fy0, fy1, -fhd, fhd);
        // Right fender
        pushBox( lhw - 0.02,  lhw + 0.08, fy0, fy1, -fhd, fhd);
    }

    // ----- SERIALIZE -----
    let obj = "# Procedural OGRE hull (lower + upper + glacis + rear + fenders)\n";
    for (const v of verts) obj += `v ${v[0].toFixed(4)} ${v[1].toFixed(4)} ${v[2].toFixed(4)}\n`;
    for (const n of norms) obj += `vn ${n[0].toFixed(4)} ${n[1].toFixed(4)} ${n[2].toFixed(4)}\n`;
    for (const f of faces) obj += `f ${f[0]}//${f[0]} ${f[1]}//${f[1]} ${f[2]}//${f[2]}\n`;
    return obj;
}

// ============================================================
// PLANE (defender_plane / ogre_plane)
// ============================================================
// Round 118 — proper plane silhouette: tubular fuselage tapering to
// nose + tail, swept wings, vertical fin, horizontal stabilizers,
// cockpit canopy bump. Compared to the cube fallback the plane now
// reads from any angle: nose forward, wings spread, tail upward.
//
// Coordinate convention matches other hardpoint meshes:
//   +Z = forward (direction of flight)
//   +Y = up
//   +X = right wing
//
// Dimensions are scaled so the result fits roughly in a unit cube
// when rendered at scale 1; entityVisuals applies the per-kind scale
// (1.2 by default) on top.

export const PLANE_GEOMETRY = {
    defender_plane: {
        fuselageLen:   2.2,   // total nose-to-tail
        fuselageWidth: 0.32,
        fuselageHeight:0.28,
        noseFraction:  0.18,  // taper region as fraction of fuselageLen
        tailFraction:  0.22,
        wingSpan:      2.4,   // total tip-to-tip
        wingChord:     0.6,
        wingThickness: 0.06,
        wingSweep:     0.18,  // wing tips trail back (Z offset at tip)
        wingY:        -0.02,  // wing root attach point (slightly low-mid)
        finHeight:     0.42,
        finChord:      0.42,
        finBaseZ:     -0.85,
        stabSpan:      0.9,
        stabChord:     0.32,
        canopyLen:     0.55,
        canopyHeight:  0.10,
        tint: [0.78, 0.82, 0.88],   // chrome — entityVisuals overrides
    },
    ogre_plane: {
        // Slightly chunkier, darker military variant. Shape only —
        // entityVisuals applies the actual color (military gray) at
        // instance time.
        fuselageLen:   2.4,
        fuselageWidth: 0.38,
        fuselageHeight:0.34,
        noseFraction:  0.16,
        tailFraction:  0.24,
        wingSpan:      2.6,
        wingChord:     0.7,
        wingThickness: 0.08,
        wingSweep:     0.22,
        wingY:        -0.02,
        finHeight:     0.48,
        finChord:      0.5,
        finBaseZ:     -0.95,
        stabSpan:      1.0,
        stabChord:     0.36,
        canopyLen:     0.6,
        canopyHeight:  0.12,
        tint: [0.30, 0.32, 0.36],
    },
};

export function makePlaneOBJ(p) {
    const verts = [];   // [x, y, z]
    const norms = [];   // [nx, ny, nz]
    const faces = [];   // [a, b, c] (1-indexed)

    function pushVert(x, y, z, nx, ny, nz) {
        verts.push([x, y, z]);
        norms.push([nx, ny, nz]);
        return verts.length;
    }
    function pushQuad(a, b, c, d) {
        faces.push([a, b, c]);
        faces.push([a, c, d]);
    }
    function pushBox(x0, x1, y0, y1, z0, z1) {
        // bottom (-Y)
        { const a = pushVert(x0, y0, z0, 0, -1, 0);
          const b = pushVert(x1, y0, z0, 0, -1, 0);
          const c = pushVert(x1, y0, z1, 0, -1, 0);
          const d = pushVert(x0, y0, z1, 0, -1, 0);
          pushQuad(a, d, c, b); }
        // top (+Y)
        { const a = pushVert(x0, y1, z0, 0, 1, 0);
          const b = pushVert(x1, y1, z0, 0, 1, 0);
          const c = pushVert(x1, y1, z1, 0, 1, 0);
          const d = pushVert(x0, y1, z1, 0, 1, 0);
          pushQuad(a, b, c, d); }
        // front (+Z)
        { const a = pushVert(x0, y0, z1, 0, 0, 1);
          const b = pushVert(x1, y0, z1, 0, 0, 1);
          const c = pushVert(x1, y1, z1, 0, 0, 1);
          const d = pushVert(x0, y1, z1, 0, 0, 1);
          pushQuad(a, b, c, d); }
        // back (-Z)
        { const a = pushVert(x0, y0, z0, 0, 0, -1);
          const b = pushVert(x1, y0, z0, 0, 0, -1);
          const c = pushVert(x1, y1, z0, 0, 0, -1);
          const d = pushVert(x0, y1, z0, 0, 0, -1);
          pushQuad(a, d, c, b); }
        // left (-X)
        { const a = pushVert(x0, y0, z0, -1, 0, 0);
          const b = pushVert(x0, y1, z0, -1, 0, 0);
          const c = pushVert(x0, y1, z1, -1, 0, 0);
          const d = pushVert(x0, y0, z1, -1, 0, 0);
          pushQuad(a, b, c, d); }
        // right (+X)
        { const a = pushVert(x1, y0, z0, 1, 0, 0);
          const b = pushVert(x1, y1, z0, 1, 0, 0);
          const c = pushVert(x1, y1, z1, 1, 0, 0);
          const d = pushVert(x1, y0, z1, 1, 0, 0);
          pushQuad(a, d, c, b); }
    }

    const fhw = p.fuselageWidth  * 0.5;
    const fhh = p.fuselageHeight * 0.5;
    const halfLen = p.fuselageLen * 0.5;
    const noseLen = p.fuselageLen * p.noseFraction;
    const tailLen = p.fuselageLen * p.tailFraction;
    const bodyFrontZ = halfLen - noseLen;
    const bodyBackZ  = -halfLen + tailLen;

    // ---- FUSELAGE BODY (central box) ----
    pushBox(-fhw, fhw, -fhh, fhh, bodyBackZ, bodyFrontZ);

    // ---- NOSE CONE (point at +Z) ----
    // Single point at (0, 0, halfLen), quad base at body front
    {
        const tip = pushVert(0, 0, halfLen, 0, 0, 1);
        const a = pushVert(-fhw, -fhh, bodyFrontZ, 0, -0.5, 0.87);
        const b = pushVert( fhw, -fhh, bodyFrontZ, 0, -0.5, 0.87);
        const c = pushVert( fhw,  fhh, bodyFrontZ, 0,  0.5, 0.87);
        const d = pushVert(-fhw,  fhh, bodyFrontZ, 0,  0.5, 0.87);
        // Four triangle faces around the tip
        faces.push([tip, a, b]);    // bottom
        faces.push([tip, b, c]);    // right
        faces.push([tip, c, d]);    // top
        faces.push([tip, d, a]);    // left
    }

    // ---- TAIL CONE (point at -Z) ----
    {
        const tip = pushVert(0, 0, -halfLen, 0, 0, -1);
        const a = pushVert(-fhw, -fhh, bodyBackZ, 0, -0.5, -0.87);
        const b = pushVert( fhw, -fhh, bodyBackZ, 0, -0.5, -0.87);
        const c = pushVert( fhw,  fhh, bodyBackZ, 0,  0.5, -0.87);
        const d = pushVert(-fhw,  fhh, bodyBackZ, 0,  0.5, -0.87);
        faces.push([tip, b, a]);
        faces.push([tip, c, b]);
        faces.push([tip, d, c]);
        faces.push([tip, a, d]);
    }

    // ---- WINGS (swept) ----
    // Trapezoid quad on each side. Root chord at fuselage edge, tip
    // chord at wingSpan/2 with backward Z offset (sweep). Wing has
    // thickness via top+bottom faces.
    const wingTipX = p.wingSpan * 0.5;
    const wingRootX = fhw;
    const wingTopY = p.wingY + p.wingThickness * 0.5;
    const wingBotY = p.wingY - p.wingThickness * 0.5;
    const wingRootFrontZ = p.wingChord * 0.5;
    const wingRootBackZ  = -p.wingChord * 0.5;
    const wingTipFrontZ  = p.wingChord * 0.3 - p.wingSweep;
    const wingTipBackZ   = -p.wingChord * 0.3 - p.wingSweep;

    // Right wing (+X)
    {
        // Top
        const a = pushVert(wingRootX, wingTopY, wingRootBackZ,  0, 1, 0);
        const b = pushVert(wingRootX, wingTopY, wingRootFrontZ, 0, 1, 0);
        const c = pushVert(wingTipX,  wingTopY, wingTipFrontZ,  0, 1, 0);
        const d = pushVert(wingTipX,  wingTopY, wingTipBackZ,   0, 1, 0);
        pushQuad(a, b, c, d);
        // Bottom
        const e = pushVert(wingRootX, wingBotY, wingRootBackZ,  0, -1, 0);
        const f = pushVert(wingRootX, wingBotY, wingRootFrontZ, 0, -1, 0);
        const g = pushVert(wingTipX,  wingBotY, wingTipFrontZ,  0, -1, 0);
        const h = pushVert(wingTipX,  wingBotY, wingTipBackZ,   0, -1, 0);
        pushQuad(e, h, g, f);
        // Leading edge (+Z facing)
        const i = pushVert(wingRootX, wingBotY, wingRootFrontZ, 0, 0, 1);
        const jv= pushVert(wingTipX,  wingBotY, wingTipFrontZ,  0, 0, 1);
        const k = pushVert(wingTipX,  wingTopY, wingTipFrontZ,  0, 0, 1);
        const l = pushVert(wingRootX, wingTopY, wingRootFrontZ, 0, 0, 1);
        pushQuad(i, jv, k, l);
        // Trailing edge (-Z)
        const m = pushVert(wingRootX, wingBotY, wingRootBackZ,  0, 0, -1);
        const n = pushVert(wingTipX,  wingBotY, wingTipBackZ,   0, 0, -1);
        const o = pushVert(wingTipX,  wingTopY, wingTipBackZ,   0, 0, -1);
        const pV= pushVert(wingRootX, wingTopY, wingRootBackZ,  0, 0, -1);
        pushQuad(m, pV, o, n);
        // Tip cap
        const q = pushVert(wingTipX, wingBotY, wingTipBackZ,   1, 0, 0);
        const r = pushVert(wingTipX, wingBotY, wingTipFrontZ,  1, 0, 0);
        const s = pushVert(wingTipX, wingTopY, wingTipFrontZ,  1, 0, 0);
        const tt= pushVert(wingTipX, wingTopY, wingTipBackZ,   1, 0, 0);
        pushQuad(q, r, s, tt);
    }
    // Left wing (-X) — mirror
    {
        const a = pushVert(-wingRootX, wingTopY, wingRootBackZ,  0, 1, 0);
        const b = pushVert(-wingRootX, wingTopY, wingRootFrontZ, 0, 1, 0);
        const c = pushVert(-wingTipX,  wingTopY, wingTipFrontZ,  0, 1, 0);
        const d = pushVert(-wingTipX,  wingTopY, wingTipBackZ,   0, 1, 0);
        pushQuad(a, d, c, b);
        const e = pushVert(-wingRootX, wingBotY, wingRootBackZ,  0, -1, 0);
        const f = pushVert(-wingRootX, wingBotY, wingRootFrontZ, 0, -1, 0);
        const g = pushVert(-wingTipX,  wingBotY, wingTipFrontZ,  0, -1, 0);
        const h = pushVert(-wingTipX,  wingBotY, wingTipBackZ,   0, -1, 0);
        pushQuad(e, f, g, h);
        const i = pushVert(-wingRootX, wingBotY, wingRootFrontZ, 0, 0, 1);
        const jv= pushVert(-wingTipX,  wingBotY, wingTipFrontZ,  0, 0, 1);
        const k = pushVert(-wingTipX,  wingTopY, wingTipFrontZ,  0, 0, 1);
        const l = pushVert(-wingRootX, wingTopY, wingRootFrontZ, 0, 0, 1);
        pushQuad(i, l, k, jv);
        const m = pushVert(-wingRootX, wingBotY, wingRootBackZ,  0, 0, -1);
        const n = pushVert(-wingTipX,  wingBotY, wingTipBackZ,   0, 0, -1);
        const o = pushVert(-wingTipX,  wingTopY, wingTipBackZ,   0, 0, -1);
        const pV= pushVert(-wingRootX, wingTopY, wingRootBackZ,  0, 0, -1);
        pushQuad(m, n, o, pV);
        const q = pushVert(-wingTipX, wingBotY, wingTipBackZ,   -1, 0, 0);
        const r = pushVert(-wingTipX, wingBotY, wingTipFrontZ,  -1, 0, 0);
        const s = pushVert(-wingTipX, wingTopY, wingTipFrontZ,  -1, 0, 0);
        const tt= pushVert(-wingTipX, wingTopY, wingTipBackZ,   -1, 0, 0);
        pushQuad(q, tt, s, r);
    }

    // ---- VERTICAL FIN (tail) ----
    // Box at -Z back of fuselage, going upward in +Y
    {
        const finHw = p.fuselageWidth * 0.18 * 0.5;   // thin fin
        const finZ0 = p.finBaseZ - p.finChord * 0.5;
        const finZ1 = p.finBaseZ + p.finChord * 0.5;
        const finY0 = fhh;
        const finY1 = fhh + p.finHeight;
        pushBox(-finHw, finHw, finY0, finY1, finZ0, finZ1);
    }

    // ---- HORIZONTAL STABILIZERS (tail) ----
    {
        const stabHs = p.stabSpan * 0.5;
        const stabZ0 = p.finBaseZ - p.stabChord * 0.5;
        const stabZ1 = p.finBaseZ + p.stabChord * 0.5;
        const stabY0 = -p.wingThickness * 0.5;
        const stabY1 = p.wingThickness * 0.5;
        pushBox(-stabHs, stabHs, stabY0, stabY1, stabZ0, stabZ1);
    }

    // ---- CANOPY (cockpit bump on top) ----
    {
        const canHw = p.fuselageWidth * 0.35;
        const canZ0 = 0.05;
        const canZ1 = canZ0 + p.canopyLen;
        const canY0 = fhh;
        const canY1 = fhh + p.canopyHeight;
        pushBox(-canHw, canHw, canY0, canY1, canZ0, canZ1);
    }

    // ---- ASSEMBLE OBJ TEXT ----
    let obj = "# generated plane mesh\n";
    for (const v of verts) obj += `v ${v[0].toFixed(4)} ${v[1].toFixed(4)} ${v[2].toFixed(4)}\n`;
    for (const n of norms) obj += `vn ${n[0].toFixed(4)} ${n[1].toFixed(4)} ${n[2].toFixed(4)}\n`;
    for (const f of faces) {
        obj += `f ${f[0]}//${f[0]} ${f[1]}//${f[1]} ${f[2]}//${f[2]}\n`;
    }
    return obj;
}

// ============================================================
// REGISTRATION
// ============================================================
// Pre-build every hardpoint mesh and inject into the asset loader's
// cache. After this, any entity:spawnMesh referencing one of the
// configured kinds renders with the procedural composite rather than
// the EntityCubeRenderer fallback. Call once at engine startup,
// AFTER the GPUAssetLoader is constructed.

export function registerAllHardpointMeshes(assetLoader) {
    if (!assetLoader || !assetLoader._loadOBJFromText) {
        console.warn("[hardpointMeshes] asset loader unsupported; skipping");
        return 0;
    }
    let registered = 0;
    // Dome+barrel composites (turret, weapon, engine, tech, sensor)
    for (const [kind, params] of Object.entries(HARDPOINT_GEOMETRY)) {
        try {
            const objText = makeDomeBarrelOBJ(params);
            const mesh = assetLoader._loadOBJFromText(kind, objText, { tint: params.tint });
            if (mesh) {
                assetLoader.cache.set(kind, mesh);
                assetLoader._ollamaRequested?.add?.(kind);
                registered++;
            }
        } catch (e) {
            console.warn(`[hardpointMeshes] failed to build "${kind}":`, e);
        }
    }
    // Round 95 — tread plates with bumps
    for (const [kind, params] of Object.entries(TREAD_GEOMETRY)) {
        try {
            const objText = makeTreadOBJ(params);
            const mesh = assetLoader._loadOBJFromText(kind, objText, { tint: params.tint });
            if (mesh) {
                assetLoader.cache.set(kind, mesh);
                assetLoader._ollamaRequested?.add?.(kind);
                registered++;
            }
        } catch (e) {
            console.warn(`[hardpointMeshes] failed to build "${kind}":`, e);
        }
    }
    // Round 102 — OGRE hull (lower + upper + glacis + rear plate + fenders)
    for (const [kind, params] of Object.entries(HULL_GEOMETRY)) {
        try {
            const objText = makeHullOBJ(params);
            const mesh = assetLoader._loadOBJFromText(kind, objText, { tint: params.tint });
            if (mesh) {
                assetLoader.cache.set(kind, mesh);
                assetLoader._ollamaRequested?.add?.(kind);
                registered++;
            }
        } catch (e) {
            console.warn(`[hardpointMeshes] failed to build "${kind}":`, e);
        }
    }
    // Round 118 — proper plane silhouettes (defender + ogre)
    for (const [kind, params] of Object.entries(PLANE_GEOMETRY)) {
        try {
            const objText = makePlaneOBJ(params);
            const mesh = assetLoader._loadOBJFromText(kind, objText, { tint: params.tint });
            if (mesh) {
                assetLoader.cache.set(kind, mesh);
                assetLoader._ollamaRequested?.add?.(kind);
                registered++;
            }
        } catch (e) {
            console.warn(`[hardpointMeshes] failed to build "${kind}":`, e);
        }
    }
    console.log(`[hardpointMeshes] registered ${registered} composite meshes`);
    return registered;
}
