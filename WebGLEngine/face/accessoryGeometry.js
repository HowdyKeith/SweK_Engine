// FILE: face/accessoryGeometry.js
// VERSION: v864 — Procedural accessory geometry generators
//
// Each function returns a geometry bundle compatible with the existing
// skinning shader (robotFaceAvatar.js):
//   {
//     positions: Float32Array,  // 3 floats per vertex
//     normals:   Float32Array,  // 3 floats per vertex
//     indices:   Uint32Array,   // triangle indices
//     joints:    Uint8Array,    // 4 joint slots per vertex (all weight on slot 0)
//     weights:   Float32Array,  // 4 weights per vertex (1, 0, 0, 0)
//   }
// The caller (robotFaceAvatar.js) overrides joints to point at the
// target bone index after lookup; here we just emit slot 0 + weight 1
// so the skinning math becomes "bone matrix × vertex" cleanly.
//
// Vertex positions are in the LOCAL space of the attach bone. For
// hats this means +Y is the top of the head; the geometry pre-offsets
// so the hat sits above the bone origin without needing extra math
// in the render path.
//
// Color is per-accessory: emitted as PER-VERTEX (location=4) so the
// fragment shader's vColor input picks it up. uTint still multiplies
// the final composed color so the avatar's costume color extends to
// its accessories too.

// ─── Helpers ──────────────────────────────────────────────────
function _buildBundle({ positions, normals, indices, color }) {
    const vertCount = positions.length / 3;
    const joints  = new Uint8Array(vertCount * 4);    // all zeros = slot 0
    const weights = new Float32Array(vertCount * 4);
    for (let i = 0; i < vertCount; i++) {
        weights[i * 4 + 0] = 1.0;                     // slot 0 gets all the weight
    }
    // Per-vertex color attribute (location=4) — solid for the whole accessory
    const colors = new Float32Array(vertCount * 3);
    const [r, g, b] = color || [0.8, 0.8, 0.85];
    for (let i = 0; i < vertCount; i++) {
        colors[i * 3 + 0] = r;
        colors[i * 3 + 1] = g;
        colors[i * 3 + 2] = b;
    }
    // Empty UVs (location=5) — accessories use vertex color, not textures
    const uvs = new Float32Array(vertCount * 2);
    return { positions, normals, indices, joints, weights, colors, uvs, vertCount };
}

// Cone (or truncated cone) along +Y, centered on X=0/Z=0.
// y0 = bottom y, y1 = top y, r0 = bottom radius, r1 = top radius (0 for sharp cone).
// segments = circumferential resolution.
function _coneGeom(y0, y1, r0, r1, segments, color) {
    const positions = [];
    const normals = [];
    const indices = [];
    // Side ring
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const a = t * Math.PI * 2;
        const cx = Math.cos(a), sx = Math.sin(a);
        // Bottom rim vertex
        positions.push(cx * r0, y0, sx * r0);
        // Outward normal (approximate; ignore slant for simplicity)
        const slantInvLen = 1 / Math.hypot(r0 - r1, y1 - y0);
        const nY = (r0 - r1) * slantInvLen;
        const nXZ = (y1 - y0) * slantInvLen;
        normals.push(cx * nXZ, nY, sx * nXZ);
        // Top rim vertex
        positions.push(cx * r1, y1, sx * r1);
        normals.push(cx * nXZ, nY, sx * nXZ);
    }
    for (let i = 0; i < segments; i++) {
        const b0 = i * 2;
        const b1 = i * 2 + 1;
        const b2 = i * 2 + 2;
        const b3 = i * 2 + 3;
        indices.push(b0, b2, b1);
        indices.push(b1, b2, b3);
    }
    // Cap at top (only if r1 > 0)
    if (r1 > 0.001) {
        const center = positions.length / 3;
        positions.push(0, y1, 0);
        normals.push(0, 1, 0);
        const ringStart = positions.length / 3;
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const a = t * Math.PI * 2;
            positions.push(Math.cos(a) * r1, y1, Math.sin(a) * r1);
            normals.push(0, 1, 0);
        }
        for (let i = 0; i < segments; i++) {
            indices.push(center, ringStart + i, ringStart + i + 1);
        }
    }
    // Cap at bottom
    {
        const center = positions.length / 3;
        positions.push(0, y0, 0);
        normals.push(0, -1, 0);
        const ringStart = positions.length / 3;
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const a = t * Math.PI * 2;
            positions.push(Math.cos(a) * r0, y0, Math.sin(a) * r0);
            normals.push(0, -1, 0);
        }
        for (let i = 0; i < segments; i++) {
            indices.push(center, ringStart + i + 1, ringStart + i);
        }
    }
    return _buildBundle({
        positions: new Float32Array(positions),
        normals:   new Float32Array(normals),
        indices:   new Uint32Array(indices),
        color,
    });
}

// Flat ring (e.g. hat brim, halo) at fixed Y between innerR and outerR.
function _ringGeom(y, innerR, outerR, segments, color) {
    const positions = [];
    const normals = [];
    const indices = [];
    for (let i = 0; i <= segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        const cx = Math.cos(a), sx = Math.sin(a);
        positions.push(cx * innerR, y, sx * innerR);
        normals.push(0, 1, 0);
        positions.push(cx * outerR, y, sx * outerR);
        normals.push(0, 1, 0);
    }
    for (let i = 0; i < segments; i++) {
        const b0 = i * 2;
        const b1 = i * 2 + 1;
        const b2 = i * 2 + 2;
        const b3 = i * 2 + 3;
        indices.push(b0, b2, b1);
        indices.push(b1, b2, b3);
    }
    return _buildBundle({
        positions: new Float32Array(positions),
        normals:   new Float32Array(normals),
        indices:   new Uint32Array(indices),
        color,
    });
}

// Combine two bundles into one (concatenating buffers + re-offsetting indices)
function _combine(a, b) {
    const posCat = new Float32Array(a.positions.length + b.positions.length);
    posCat.set(a.positions, 0);
    posCat.set(b.positions, a.positions.length);
    const nrmCat = new Float32Array(a.normals.length + b.normals.length);
    nrmCat.set(a.normals, 0);
    nrmCat.set(b.normals, a.normals.length);
    const indCat = new Uint32Array(a.indices.length + b.indices.length);
    indCat.set(a.indices, 0);
    const aVerts = a.positions.length / 3;
    for (let i = 0; i < b.indices.length; i++) {
        indCat[a.indices.length + i] = b.indices[i] + aVerts;
    }
    const jntCat = new Uint8Array(a.joints.length + b.joints.length);
    const wgtCat = new Float32Array(a.weights.length + b.weights.length);
    for (let i = 0; i < a.weights.length; i += 4) wgtCat[i] = a.weights[i] || 0;
    for (let i = 0; i < b.weights.length; i += 4) wgtCat[a.weights.length + i] = b.weights[i] || 0;
    // joints stay zero (slot 0 for all)
    const colCat = new Float32Array(a.colors.length + b.colors.length);
    colCat.set(a.colors, 0);
    colCat.set(b.colors, a.colors.length);
    const uvCat = new Float32Array(a.uvs.length + b.uvs.length);
    return {
        positions: posCat, normals: nrmCat, indices: indCat,
        joints: jntCat, weights: wgtCat, colors: colCat, uvs: uvCat,
        vertCount: (a.vertCount || a.positions.length / 3) + (b.vertCount || b.positions.length / 3),
    };
}

// ─── Hats ─────────────────────────────────────────────────────
// Sits on top of the head bone. Head bone origin in most rigs is at
// the neck base; the hat geometry pre-offsets up by ~0.45 units to
// land on the head's top. Tuned for RobotExpressive's scale.

export function makeTopHat() {
    const COLOR = [0.10, 0.10, 0.12];       // near-black
    const baseY = 0.45;
    const brim  = _ringGeom(baseY,        0.18, 0.30, 20, COLOR);
    const crown = _coneGeom(baseY, baseY + 0.30, 0.16, 0.16, 18, COLOR);
    return _combine(brim, crown);
}

export function makeWizardHat() {
    const COLOR = [0.18, 0.10, 0.30];       // deep purple
    const baseY = 0.42;
    const brim   = _ringGeom(baseY,        0.15, 0.28, 20, COLOR);
    const cone   = _coneGeom(baseY, baseY + 0.55, 0.14, 0.01, 16, COLOR);
    return _combine(brim, cone);
}

export function makeCrown() {
    const COLOR = [0.95, 0.75, 0.20];       // gold
    // Crown is a short cylinder section with a top ring
    const baseY = 0.45;
    const band  = _coneGeom(baseY, baseY + 0.10, 0.17, 0.17, 18, COLOR);
    const top   = _ringGeom(baseY + 0.10, 0.13, 0.18, 18, COLOR);
    return _combine(band, top);
}

// ─── Eyewear ──────────────────────────────────────────────────
// Sits in front of the head bone. Positioned forward (+Z) of bone
// origin and slightly above center (eye level on most rigs).

export function makeRoundGlasses() {
    const COLOR = [0.05, 0.05, 0.05];       // black frame
    // Two thin rings + a bridge. Use _ringGeom but tilted ~90deg.
    // For simplicity: emit them flat on XY plane at Z=+0.16, in front of face.
    const eyeR = 0.05;
    const ringT = 0.012;                    // ring thickness
    const positions = [];
    const normals = [];
    const indices = [];
    const eyeY = 0.20;                      // eye level above bone origin
    const eyeOffX = 0.07;                   // distance between eye centers
    const segs = 20;
    let vBase = 0;
    for (const sign of [-1, +1]) {
        // Ring in XY plane (Z = 0.16 forward of head)
        const cx0 = sign * eyeOffX;
        for (let i = 0; i <= segs; i++) {
            const a = (i / segs) * Math.PI * 2;
            const c = Math.cos(a), s = Math.sin(a);
            // Inner edge
            positions.push(cx0 + c * (eyeR - ringT * 0.5), eyeY + s * (eyeR - ringT * 0.5), 0.18);
            normals.push(0, 0, 1);
            // Outer edge
            positions.push(cx0 + c * (eyeR + ringT * 0.5), eyeY + s * (eyeR + ringT * 0.5), 0.18);
            normals.push(0, 0, 1);
        }
        for (let i = 0; i < segs; i++) {
            const b0 = vBase + i * 2;
            const b1 = vBase + i * 2 + 1;
            const b2 = vBase + i * 2 + 2;
            const b3 = vBase + i * 2 + 3;
            indices.push(b0, b2, b1);
            indices.push(b1, b2, b3);
        }
        vBase += (segs + 1) * 2;
    }
    // Bridge between rings
    {
        const bridgeY1 = eyeY + 0.005;
        const bridgeY2 = eyeY - 0.005;
        const bX0 = -eyeOffX + (eyeR - ringT * 0.5);
        const bX1 = +eyeOffX - (eyeR - ringT * 0.5);
        const bZ = 0.18;
        const v = vBase;
        positions.push(bX0, bridgeY1, bZ);  normals.push(0, 0, 1);
        positions.push(bX0, bridgeY2, bZ);  normals.push(0, 0, 1);
        positions.push(bX1, bridgeY1, bZ);  normals.push(0, 0, 1);
        positions.push(bX1, bridgeY2, bZ);  normals.push(0, 0, 1);
        indices.push(v, v + 2, v + 1);
        indices.push(v + 1, v + 2, v + 3);
        vBase += 4;
    }
    return _buildBundle({
        positions: new Float32Array(positions),
        normals:   new Float32Array(normals),
        indices:   new Uint32Array(indices),
        color: COLOR,
    });
}

export function makeSunglasses() {
    // Same shape as round glasses but wider + darker color
    const g = makeRoundGlasses();
    // Override color in-place
    for (let i = 0; i < g.colors.length; i += 3) {
        g.colors[i + 0] = 0.04;
        g.colors[i + 1] = 0.04;
        g.colors[i + 2] = 0.04;
    }
    return g;
}

// ─── Cape ─────────────────────────────────────────────────────
// Attaches to the spine bone. Drapes from shoulders down the back.
// Pre-tilted slightly to flow naturally. Simple rectangular plane
// with one mid-fold for visual depth.

export function makeCape() {
    const COLOR = [0.65, 0.15, 0.18];       // crimson
    const positions = [];
    const normals = [];
    const indices = [];
    // 4x6 grid plane behind the bone (Z slightly negative = behind)
    // Y range: 0 (top, shoulders) down to -0.9 (knee-ish)
    // X range: ±0.35 (shoulder width)
    const cols = 4;
    const rows = 6;
    const topY = 0.0;
    const botY = -0.9;
    const widthX = 0.35;
    const zBack = -0.08;
    const zFold = -0.18;    // mid-fold sticks out further back
    for (let r = 0; r <= rows; r++) {
        const ty = r / rows;
        const y = topY + (botY - topY) * ty;
        // Cape widens slightly as it drapes
        const w = widthX * (1.0 + ty * 0.35);
        // Fold curve: peak at row 3 of 6
        const foldT = Math.max(0, 1 - Math.abs(r - 3) / 3);
        for (let c = 0; c <= cols; c++) {
            const tx = c / cols;
            const x = -w + tx * (w * 2);
            // Wave the surface slightly per column for a fabric look
            const colWave = Math.sin(tx * Math.PI) * 0.03 * foldT;
            const z = zBack + (zFold - zBack) * foldT - colWave;
            positions.push(x, y, z);
            // Approximate outward normal (pointing back)
            normals.push(0, 0, -1);
        }
    }
    const stride = cols + 1;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const b0 = r * stride + c;
            const b1 = r * stride + c + 1;
            const b2 = (r + 1) * stride + c;
            const b3 = (r + 1) * stride + c + 1;
            indices.push(b0, b2, b1);
            indices.push(b1, b2, b3);
        }
    }
    const bundle = _buildBundle({
        positions: new Float32Array(positions),
        normals:   new Float32Array(normals),
        indices:   new Uint32Array(indices),
        color: COLOR,
    });
    // v865 — cloth simulation metadata. cape is the only accessory
    // that participates in physics; hats + glasses stay rigid.
    bundle.cloth = {
        cols,
        rows,
        stride,                              // verts per row
        pinnedIndices: [],                   // top row (r=0): 0..cols
    };
    for (let c = 0; c <= cols; c++) bundle.cloth.pinnedIndices.push(c);
    return bundle;
}

// ─── Magic Carpet (v869) ──────────────────────────────────────
// A horizontal rug positioned below the avatar's feet. Pinned at
// all four corners so it stays flat (vs the cape's single top edge
// pin which lets the lower body hang). Wind + gravity from the
// existing cloth sim cause subtle rippling in the interior — the
// "magic floating carpet" feel comes for free.
//
// Attached to the SAME bone as the cape (spine), but the bind-local
// Y is -1.25 (well below the spine bone at chest height) so the
// carpet renders at approximately floor level. Avatar standing on
// the carpet visually rests on its surface.
//
// Geometry: 5×5 grid (25 verts, 32 triangles), 0.9 × 0.7 dimensions
// with slight upward dome at center for a magic-rug aesthetic.

export function makeMagicCarpet() {
    // Warm Persian rug palette — deep crimson with gold accents.
    // Single color for whole carpet (per-region pattern would need
    // per-quad colors which the current renderer doesn't expose).
    const COLOR = [0.65, 0.20, 0.20];
    const positions = [];
    const normals = [];
    const indices = [];
    const cols = 4;          // 5 columns of vertices
    const rows = 4;          // 5 rows of vertices
    const stride = cols + 1; // 5
    const baseY = -1.25;     // below spine bone (which is at chest height ~1.2)
    const halfW = 0.90;      // X range: -0.90 to +0.90 (v871: 2× larger than v869 original 0.45)
    const halfD = 0.70;      // Z range: -0.70 to +0.70 (v871: 2× larger than v869 original 0.35)
    const domeY = 0.05;      // slight upward dome at center for magic-rug vibe

    for (let r = 0; r <= rows; r++) {
        const tz = r / rows;
        const z = -halfD + tz * (halfD * 2);
        for (let c = 0; c <= cols; c++) {
            const tx = c / cols;
            const x = -halfW + tx * (halfW * 2);
            // Dome curve: (1 - 4*cx²)(1 - 4*cz²) is parabolic peak at center
            const cx = (tx - 0.5);
            const cz = (tz - 0.5);
            const dome = Math.max(0, (1 - 4 * cx * cx) * (1 - 4 * cz * cz)) * domeY;
            const y = baseY + dome;
            positions.push(x, y, z);
            // Initial normal: +Y (carpet faces up). v868 face-normal
            // recompute overwrites this each frame anyway; this is
            // just the bind-pose default.
            normals.push(0, 1, 0);
        }
    }
    // Triangles — same CCW winding convention as the cape so face
    // normals come out pointing +Y (camera/world up).
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const b0 = r * stride + c;
            const b1 = r * stride + c + 1;
            const b2 = (r + 1) * stride + c;
            const b3 = (r + 1) * stride + c + 1;
            indices.push(b0, b2, b1);
            indices.push(b1, b2, b3);
        }
    }
    const bundle = _buildBundle({
        positions: new Float32Array(positions),
        normals:   new Float32Array(normals),
        indices:   new Uint32Array(indices),
        color: COLOR,
    });
    bundle.cloth = {
        cols,
        rows,
        stride,
        // Pin all 4 corners — keeps the carpet flat instead of
        // hanging like a cape. Interior ripples with wind.
        pinnedIndices: [
            0,                              // TL  (r=0, c=0)
            cols,                           // TR  (r=0, c=cols)
            rows * stride,                  // BL  (r=rows, c=0)
            rows * stride + cols,           // BR  (r=rows, c=cols)
        ],
    };
    return bundle;
}

// ─── Streamer (v871) ──────────────────────────────────────────
// Cloth-sim ribbon/banner attached to the spine bone with a right-
// side X offset so it hangs from the avatar's right shoulder area
// like a held flag or streaming material. Pinned at the top short
// edge so the rest trails behind as the avatar moves.
//
// New "streamer" slot (separate from cape) so user can stack BOTH
// a cape and a streamer at the same time.

function _makeStreamer({ color, ribbonW, ribbonLen, cols, rows, offsetX }) {
    const positions = [];
    const normals = [];
    const indices = [];
    const stride = cols + 1;
    const topY = 0.0;        // pinned at spine bone origin (chest level)
    for (let r = 0; r <= rows; r++) {
        const tr = r / rows;
        const y = topY - tr * ribbonLen;
        for (let c = 0; c <= cols; c++) {
            const tc = c / cols;
            const x = offsetX - ribbonW * 0.5 + tc * ribbonW;
            positions.push(x, y, 0);
            normals.push(0, 0, 1);   // placeholder; face-normal recompute overwrites
        }
    }
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const b0 = r * stride + c;
            const b1 = r * stride + c + 1;
            const b2 = (r + 1) * stride + c;
            const b3 = (r + 1) * stride + c + 1;
            indices.push(b0, b2, b1);
            indices.push(b1, b2, b3);
        }
    }
    const bundle = _buildBundle({
        positions: new Float32Array(positions),
        normals:   new Float32Array(normals),
        indices:   new Uint32Array(indices),
        color,
    });
    bundle.cloth = {
        cols, rows, stride,
        pinnedIndices: [],   // top row only (the "hand"/shoulder end)
    };
    for (let c = 0; c <= cols; c++) bundle.cloth.pinnedIndices.push(c);
    return bundle;
}

export function makeRibbon() {
    // Thin and long — pink/magenta — pure streamer effect
    return _makeStreamer({
        color:    [0.85, 0.20, 0.55],
        ribbonW:  0.10,
        ribbonLen: 1.4,
        cols:     2,
        rows:     12,
        offsetX:  0.30,
    });
}

export function makeBanner() {
    // Wider and slightly shorter — blue — flag-like
    return _makeStreamer({
        color:    [0.20, 0.45, 0.85],
        ribbonW:  0.30,
        ribbonLen: 1.0,
        cols:     3,
        rows:     8,
        offsetX:  0.35,
    });
}

// ─── Catalog ──────────────────────────────────────────────────
// Maps slot → variant → factory function. Used by avatarAccessories.
// "none" is implicit (no geometry generated).
export const ACCESSORY_CATALOG = {
    hat: {
        none:    null,
        tophat:  makeTopHat,
        wizard:  makeWizardHat,
        crown:   makeCrown,
    },
    eyewear: {
        none:        null,
        round:       makeRoundGlasses,
        sunglasses:  makeSunglasses,
    },
    cape: {
        none:    null,
        cape:    makeCape,
        carpet:  makeMagicCarpet,           // v869
    },
    streamer: {                             // v871 — new slot
        none:   null,
        ribbon: makeRibbon,
        banner: makeBanner,
    },
};
