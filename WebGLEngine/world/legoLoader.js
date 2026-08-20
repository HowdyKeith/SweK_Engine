// ===================================================================
// world/legoLoader.js
// -------------------------------------------------------------------
// Load an LDraw LEGO model (.ldr / .mpd) and voxelize it so you can walk
// around it — feeds the SAME normalized { width,height,length,voxelAt }
// shape the Minecraft loader produces, so loadSchematicIntoWorld + the
// BUILD VIEWER work unchanged.
//
// There's no LDraw parts library here (thousands of .dat meshes), so each
// brick is voxelized as a box at its stud footprint on a 1-voxel-per-stud
// grid. Common bricks/plates/tiles get their real footprint from a built-in
// table; anything unknown gets a sensible default. Brick orientation comes
// from the LDraw 3×3 matrix (axis-aligned bounding box of the rotated box,
// which is exact for the 90° rotations LEGO uses). LDraw colour codes map
// to the engine's voxel materials. LDraw Y is DOWN — we flip it to Y-up.
//
// LDU reference: 1 stud = 20 LDU wide, 1 brick = 24 LDU tall, 1 plate = 8.
// ===================================================================

const V = { AIR: 0, STONE: 1, DIRT: 2, GRASS: 3, SAND: 4, SNOW: 5, ASH: 6, WATER: 10, LAVA: 12 };
const STUD = 20;   // LDU per stud — also our voxel pitch (1 voxel = 1 stud)

// LDraw colour code → voxel material. Greys are split light/dark for contrast
// on the typically-monochrome models; trans/odd codes fall back to stone.
const LDRAW_COLOR = {
    0: V.ASH,    // black
    1: V.WATER,  // blue
    2: V.GRASS,  // green
    3: V.WATER,  // teal
    4: V.LAVA,   // red
    5: V.LAVA,   // dark pink
    6: V.DIRT,   // brown
    7: V.SNOW,   // light grey (old)
    8: V.STONE,  // dark grey (old)
    14: V.SAND,  // yellow
    15: V.SNOW,  // white
    19: V.SAND,  // tan
    25: V.LAVA,  // orange
    27: V.GRASS, // lime
    28: V.DIRT,  // dark tan
    70: V.DIRT,  // reddish brown
    71: V.STONE, // light bluish grey
    72: V.ASH,   // dark bluish grey
    47: V.SNOW,  // trans clear
};
export function ldrawColorToVoxel(code) {
    return LDRAW_COLOR[code] ?? V.STONE;
}

// Common LDraw part → [studsX, studsZ, plates]. Covers the bricks/plates/tiles
// that make up the bulk of most models; everything else uses DEFAULT_FOOTPRINT.
const DEFAULT_FOOTPRINT = [1, 1, 1];
const PART_STUDS = {
    // bricks (3 plates tall)
    "3005": [1, 1, 3], "3004": [2, 1, 3], "3622": [3, 1, 3], "3010": [4, 1, 3], "3009": [6, 1, 3], "3008": [8, 1, 3],
    "3003": [2, 2, 3], "3002": [3, 2, 3], "3001": [4, 2, 3], "2456": [6, 2, 3], "3007": [8, 2, 3],
    // plates (1 plate tall)
    "3024": [1, 1, 1], "3023": [2, 1, 1], "3623": [3, 1, 1], "3710": [4, 1, 1], "3666": [6, 1, 1], "3460": [8, 1, 1],
    "3022": [2, 2, 1], "3021": [3, 2, 1], "3020": [4, 2, 1], "3795": [6, 2, 1], "3034": [8, 2, 1],
    "3031": [4, 4, 1], "3032": [6, 4, 1], "3035": [8, 4, 1], "3030": [10, 4, 1], "3033": [10, 6, 1], "3036": [8, 6, 1],
    "41539": [8, 8, 1], "3958": [6, 6, 1], "3029": [12, 4, 1],
    // tiles (1 plate tall, smooth)
    "3070": [1, 1, 1], "3069": [2, 1, 1], "3068": [2, 2, 1], "63864": [3, 1, 1], "6636": [6, 1, 1], "3068B": [2, 2, 1], "3069B": [2, 1, 1],
    // slopes / wedges (approx as their footprint)
    "3040": [2, 1, 3], "3039": [2, 2, 3], "3038": [3, 2, 3], "3040B": [2, 1, 3],
    "3933": [4, 3, 1], "3934": [4, 3, 1], "3935": [2, 4, 1],
};
function footprintFor(part) {
    const key = String(part).replace(/\.dat$/i, "").toUpperCase();
    return PART_STUDS[key] || PART_STUDS[key.replace(/[A-Z]$/, "")] || DEFAULT_FOOTPRINT;
}

// ---- LDraw parse --------------------------------------------------
// Returns { models: Map<name, line[]>, main: name }. A line is the raw
// tokens of a type-1 (sub-file) reference; geometry lines are ignored
// (we voxelize footprints, not meshes).
function parseLDrawText(text) {
    const models = new Map();
    let mainName = null;
    let current = "__main__";
    let curLines = [];
    const flush = () => { if (curLines.length || !models.has(current)) models.set(current, curLines); };
    for (let raw of text.split(/\r?\n/)) {
        const line = raw.replace(/^\uFEFF/, "").trim();
        if (!line) continue;
        if (line.startsWith("0 ")) {
            const m = /^0\s+FILE\s+(.+)$/i.exec(line);
            if (m) {
                flush();
                current = m[1].trim().toLowerCase();
                curLines = [];
                if (!mainName) mainName = current;
            }
            continue;
        }
        if (line.startsWith("1 ")) curLines.push(line);
    }
    flush();
    if (!mainName) mainName = "__main__";
    return { models, main: mainName };
}

// 3×3 (row-major) compose: R = A·B
function mul3(A, B) {
    const r = new Array(9);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        r[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j];
    }
    return r;
}
// world point = M·(x,y,z) + T
function xform(M, x, y, z) {
    return [M[0] * x + M[1] * y + M[2] * z, M[3] * x + M[4] * y + M[5] * z, M[6] * x + M[7] * y + M[8] * z];
}

// Walk a model, resolving submodel references recursively, emitting leaf
// parts as { color, px,py,pz, M[9], part } in world LDU.
function collectParts(models, name, M, T, color, out, depth) {
    if (depth > 32) return;
    const lines = models.get(name) || models.get(name.toLowerCase());
    if (!lines) return;
    for (const line of lines) {
        const t = line.split(/\s+/);
        // 1 colour x y z a b c d e f g h i part
        const c = parseInt(t[1], 10);
        const x = +t[2], y = +t[3], z = +t[4];
        const m = [+t[5], +t[6], +t[7], +t[8], +t[9], +t[10], +t[11], +t[12], +t[13]];
        const part = t.slice(14).join(" ");
        const childColor = (c === 16 || c === 24) ? color : c;   // 16/24 inherit
        const wp = xform(M, x, y, z);
        const pos = [wp[0] + T[0], wp[1] + T[1], wp[2] + T[2]];
        const cm = mul3(M, m);
        const sub = part.replace(/\.(ldr|dat|mpd)$/i, "").toLowerCase();
        if (models.has(sub) || models.has(sub + ".ldr")) {
            collectParts(models, models.has(sub) ? sub : sub + ".ldr", cm, pos, childColor, out, depth + 1);
        } else {
            out.push({ color: childColor, px: pos[0], py: pos[1], pz: pos[2], M: cm, part });
        }
    }
}

// ---- voxelize → { width,height,length,format,voxelAt } -----------
export function parseLego(text, opts = {}) {
    const { models, main } = parseLDrawText(text);
    const parts = [];
    collectParts(models, main, [1, 0, 0, 0, 1, 0, 0, 0, 1], [0, 0, 0], 16, parts, 0);
    if (!parts.length) throw new Error("LDraw: no part references found");

    // Stamp each brick's footprint box (in LDU) into a voxel map. The box
    // half-extents are rotated by the part matrix and AABB'd (exact for 90°).
    const cells = new Map();   // "x,y,z" -> voxel id
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    const key = (x, y, z) => x + "," + y + "," + z;

    for (const p of parts) {
        const [sx, sz, pl] = footprintFor(p.part);
        const hx = (sx * STUD) / 2, hz = (sz * STUD) / 2, hy = (pl * 8) / 2;   // half-extents LDU
        const M = p.M;
        // AABB extent of the oriented box along each world axis
        const ex = Math.abs(M[0]) * hx + Math.abs(M[1]) * hy + Math.abs(M[2]) * hz;
        const ey = Math.abs(M[3]) * hx + Math.abs(M[4]) * hy + Math.abs(M[5]) * hz;
        const ez = Math.abs(M[6]) * hx + Math.abs(M[7]) * hy + Math.abs(M[8]) * hz;
        const vid = ldrawColorToVoxel(p.color);
        // voxel range (1 voxel = STUD ldu). LDraw Y is down → flip later.
        const x0 = Math.round((p.px - ex) / STUD), x1 = Math.round((p.px + ex) / STUD);
        const y0 = Math.round((p.py - ey) / STUD), y1 = Math.round((p.py + ey) / STUD);
        const z0 = Math.round((p.pz - ez) / STUD), z1 = Math.round((p.pz + ez) / STUD);
        for (let x = x0; x <= x1; x++)
            for (let y = y0; y <= y1; y++)
                for (let z = z0; z <= z1; z++) {
                    cells.set(key(x, y, z), vid);
                    if (x < minX) minX = x; if (x > maxX) maxX = x;
                    if (y < minY) minY = y; if (y > maxY) maxY = y;
                    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
                }
    }

    const width = maxX - minX + 1, heightV = maxY - minY + 1, length = maxZ - minZ + 1;
    // Normalize to local 0-based; flip Y (LDraw down → world up).
    const voxelAt = (x, y, z) => {
        const wx = x + minX;
        const wy = maxY - y;            // flip
        const wz = z + minZ;
        return cells.get(key(wx, wy, wz)) || V.AIR;
    };
    return { width, height: heightV, length, format: "ldraw", voxelAt, partCount: parts.length, filledCells: cells.size };
}
