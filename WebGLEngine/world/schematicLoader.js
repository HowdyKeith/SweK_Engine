// ===================================================================
// world/schematicLoader.js
// -------------------------------------------------------------------
// Load a Minecraft schematic and drop it into the voxel world to walk
// around — same shape as the WAD voxelizer (parse → setVoxel → spawn).
//
// Supports the two common formats:
//   • .schem      — Sponge / modern WorldEdit (Palette + varint BlockData)
//   • .schematic  — MCEdit / legacy WorldEdit (numeric Blocks byte array)
// Both are gzip-compressed NBT. Decompression uses the browser's native
// DecompressionStream (Chrome) so there's no library dependency.
//
// Minecraft has hundreds of blocks; the engine has a small fixed voxel
// palette, so blocks are mapped to the nearest material by name/id. The
// build reads as the right shape with sensible colors — richer color
// would need an expanded voxel material set (noted as a follow-up).
// ===================================================================

// ---- NBT ----------------------------------------------------------
async function gunzipIfNeeded(arrayBuffer) {
    const u8 = new Uint8Array(arrayBuffer);
    if (u8.length >= 2 && u8[0] === 0x1f && u8[1] === 0x8b) {
        const stream = new Blob([arrayBuffer]).stream().pipeThrough(new DecompressionStream("gzip"));
        return await new Response(stream).arrayBuffer();
    }
    return arrayBuffer;
}

function parseNBT(arrayBuffer) {
    const dv = new DataView(arrayBuffer);
    const td = new TextDecoder();
    let off = 0;
    const u8 = () => dv.getUint8(off++);
    const i8 = () => dv.getInt8(off++);
    const i16 = () => { const v = dv.getInt16(off); off += 2; return v; };
    const u16 = () => { const v = dv.getUint16(off); off += 2; return v; };
    const i32 = () => { const v = dv.getInt32(off); off += 4; return v; };
    const i64 = () => { const v = dv.getBigInt64(off); off += 8; return v; };
    const f32 = () => { const v = dv.getFloat32(off); off += 4; return v; };
    const f64 = () => { const v = dv.getFloat64(off); off += 8; return v; };
    const str = () => { const len = u16(); const s = td.decode(new Uint8Array(arrayBuffer, off, len)); off += len; return s; };
    function payload(type) {
        switch (type) {
            case 1: return i8();
            case 2: return i16();
            case 3: return i32();
            case 4: return i64();
            case 5: return f32();
            case 6: return f64();
            case 7: { const len = i32(); const a = new Int8Array(arrayBuffer.slice(off, off + len)); off += len; return a; }
            case 8: return str();
            case 9: { const it = u8(); const len = i32(); const out = new Array(len); for (let i = 0; i < len; i++) out[i] = payload(it); return out; }
            case 10: { const o = {}; for (;;) { const t = u8(); if (t === 0) break; const n = str(); o[n] = payload(t); } return o; }
            case 11: { const len = i32(); const a = new Int32Array(len); for (let i = 0; i < len; i++) a[i] = i32(); return a; }
            case 12: { const len = i32(); const a = new Array(len); for (let i = 0; i < len; i++) a[i] = i64(); return a; }
            default: throw new Error("NBT: unknown tag " + type + " @ " + off);
        }
    }
    const rootType = u8();
    if (rootType !== 10) throw new Error("NBT: root is not a compound");
    str();                       // root name (usually "" or "Schematic")
    return payload(10);
}

// ---- block → voxel material --------------------------------------
// Engine voxel ids: AIR0 STONE1 DIRT2 GRASS3 SAND4 SNOW5 ASH6 WATER10 LAVA12.
const V = { AIR: 0, STONE: 1, DIRT: 2, GRASS: 3, SAND: 4, SNOW: 5, ASH: 6, WATER: 10, LAVA: 12 };

export function mcNameToVoxel(name) {
    if (!name) return V.AIR;
    const n = name.replace(/^minecraft:/, "").replace(/\[.*\]$/, "");   // strip ns + blockstate
    if (n === "air" || n === "cave_air" || n === "void_air" || n === "structure_void") return V.AIR;
    // fluids
    if (n.includes("water") || n === "kelp" || n === "seagrass") return V.WATER;
    if (n.includes("lava") || n === "magma_block" || n.includes("fire")) return V.LAVA;
    // white / light
    if (n.includes("snow") || n === "quartz_block" || n.startsWith("white_") || n === "diorite"
        || n.includes("calcite") || n === "smooth_quartz" || n === "iron_block") return V.SNOW;
    // greens / foliage
    if (n.includes("grass") || n.includes("leaves") || n.includes("moss") || n.includes("vine")
        || n.endsWith("_sapling") || n === "lily_pad" || n.includes("green")) return V.GRASS;
    // sand / yellow
    if (n.includes("sand") || n === "glowstone" || n.startsWith("yellow_") || n === "gold_block"
        || n === "hay_block" || n.startsWith("orange_")) return V.SAND;
    // dark / wood / black
    if (n.includes("log") || n.includes("wood") || n.includes("plank") || n === "obsidian"
        || n.includes("coal") || n.startsWith("black_") || n.startsWith("dark_") || n.includes("netherrack")) return V.ASH;
    // brown / dirt
    if (n.includes("dirt") || n === "podzol" || n === "mud" || n === "soul_sand" || n === "soul_soil"
        || n.startsWith("brown_") || n.includes("clay") || n.includes("mycelium")) return V.DIRT;
    // everything else solid → stone
    return V.STONE;
}

// Legacy numeric block id → voxel (pre-1.13 .schematic).
const LEGACY = {
    1: V.STONE, 2: V.GRASS, 3: V.DIRT, 4: V.STONE, 5: V.ASH, 7: V.STONE,
    8: V.WATER, 9: V.WATER, 10: V.LAVA, 11: V.LAVA, 12: V.SAND, 13: V.STONE,
    14: V.STONE, 15: V.STONE, 16: V.ASH, 17: V.ASH, 18: V.GRASS, 20: V.SNOW,
    24: V.SAND, 35: V.SNOW, 41: V.SAND, 45: V.STONE, 48: V.GRASS, 49: V.ASH,
    79: V.SNOW, 80: V.SNOW, 82: V.DIRT, 87: V.ASH, 89: V.SAND, 98: V.STONE,
    155: V.SNOW, 159: V.SAND, 251: V.STONE,
};
export function mcLegacyToVoxel(id) {
    if (id === 0) return V.AIR;
    return LEGACY[id] ?? V.STONE;
}

// Litematica packs palette indices into a long array as a CONTIGUOUS bit
// stream (an entry can straddle two longs) — distinct from MC's chunk format.
function readLitematicEntry(longs, index, bits) {
    const startBit = index * bits;
    const startLong = Math.floor(startBit / 64);
    const endLong = Math.floor((startBit + bits - 1) / 64);
    const startOffset = BigInt(startBit % 64);
    const mask = (1n << BigInt(bits)) - 1n;
    const lo = BigInt.asUintN(64, longs[startLong] ?? 0n);
    if (startLong === endLong) return Number((lo >> startOffset) & mask);
    const hi = BigInt.asUintN(64, longs[endLong] ?? 0n);
    const bitsInFirst = 64n - startOffset;
    return Number(((lo >> startOffset) | (hi << bitsInFirst)) & mask);
}

// ---- parse → normalized { width,height,length, voxelAt(x,y,z) } ---
export async function parseSchematic(arrayBuffer) {
    const root = parseNBT(await gunzipIfNeeded(arrayBuffer));

    // ---- Litematica (.litematic): Regions, each with a palette + packed
    // long block states. Multiple regions are stitched into one volume. ----
    if (root.Regions) {
        const meta = root.Metadata || {};
        const regions = [];
        let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        for (const r of Object.values(root.Regions)) {
            const pos = r.Position || {}, size = r.Size || {};
            const px = Number(pos.x || 0), py = Number(pos.y || 0), pz = Number(pos.z || 0);
            const sx = Number(size.x || 0), sy = Number(size.y || 0), sz = Number(size.z || 0);
            const ax = Math.abs(sx), ay = Math.abs(sy), az = Math.abs(sz);
            if (!ax || !ay || !az) continue;
            const cx = px + (sx < 0 ? sx + 1 : 0);   // min corner (handle negative size)
            const cy = py + (sy < 0 ? sy + 1 : 0);
            const cz = pz + (sz < 0 ? sz + 1 : 0);
            const pal = (r.BlockStatePalette || []).map((b) => mcNameToVoxel(b && b.Name));
            const bits = Math.max(2, Math.ceil(Math.log2(Math.max(2, pal.length))));
            const longs = r.BlockStates || [];
            regions.push({ cx, cy, cz, ax, ay, az, pal, bits, longs });
            minX = Math.min(minX, cx); minY = Math.min(minY, cy); minZ = Math.min(minZ, cz);
            maxX = Math.max(maxX, cx + ax); maxY = Math.max(maxY, cy + ay); maxZ = Math.max(maxZ, cz + az);
        }
        if (!regions.length) throw new Error("litematic: no usable regions");
        const enc = meta.EnclosingSize || {};
        const width = enc.x ? Math.abs(Number(enc.x)) : (maxX - minX);
        const height = enc.y ? Math.abs(Number(enc.y)) : (maxY - minY);
        const length = enc.z ? Math.abs(Number(enc.z)) : (maxZ - minZ);
        const voxelAt = (x, y, z) => {
            const wx = minX + x, wy = minY + y, wz = minZ + z;
            for (const r of regions) {
                const lx = wx - r.cx, ly = wy - r.cy, lz = wz - r.cz;
                if (lx >= 0 && lx < r.ax && ly >= 0 && ly < r.ay && lz >= 0 && lz < r.az) {
                    const i = (ly * r.az + lz) * r.ax + lx;     // YZX within region
                    return r.pal[readLitematicEntry(r.longs, i, r.bits)] ?? V.STONE;
                }
            }
            return V.AIR;       // gaps between regions
        };
        return { width, height, length, format: "litematic", voxelAt };
    }

    const s = root.Schematic || root;     // Sponge v3 nests under "Schematic"
    const width = Number(s.Width), height = Number(s.Height), length = Number(s.Length);
    if (!width || !height || !length) throw new Error("schematic: missing/zero dimensions");
    const idx = (x, y, z) => (y * length + z) * width + x;   // YZX order (both formats)

    // Sponge v3: blocks under s.Blocks.{Palette, Data}; v2: s.Palette + s.BlockData.
    const blocksTag = s.Blocks && s.Blocks.Palette ? s.Blocks : s;
    const palette = blocksTag.Palette;
    const blockData = blocksTag.BlockData || blocksTag.Data;

    let voxelAt;
    let format;
    if (palette && blockData) {
        // Modern .schem — varint palette indices.
        format = "schem";
        const idxToVoxel = [];
        for (const [name, i] of Object.entries(palette)) idxToVoxel[Number(i)] = mcNameToVoxel(name);
        const total = width * height * length;
        const ids = new Uint16Array(total);
        let di = 0, bi = 0;
        const data = blockData;
        while (di < data.length && bi < total) {
            let value = 0, shift = 0, b;
            do { b = data[di++] & 0xff; value |= (b & 0x7f) << shift; shift += 7; } while (b & 0x80);
            ids[bi++] = value;
        }
        voxelAt = (x, y, z) => idxToVoxel[ids[idx(x, y, z)]] ?? V.STONE;
    } else if (s.Blocks instanceof Int8Array || s.Blocks) {
        // Legacy .schematic — numeric ids.
        format = "schematic";
        const blocks = s.Blocks;
        voxelAt = (x, y, z) => mcLegacyToVoxel(blocks[idx(x, y, z)] & 0xff);
    } else {
        throw new Error("schematic: unrecognized format (no Palette/BlockData or Blocks)");
    }

    return { width, height, length, format, voxelAt };
}

// ---- voxelize into the world -------------------------------------
// opts: { origin:{x,y,z}, maxVoxels }. Returns { voxels, dims, spawn, clipped }.
export function loadSchematicIntoWorld(world, parsed, opts = {}) {
    const { width, height, length, voxelAt } = parsed;
    const maxVoxels = opts.maxVoxels ?? 700000;
    const o = opts.origin || { x: 0, y: 0, z: 0 };
    const ox = Math.floor(o.x), oy = Math.floor(o.y), oz = Math.floor(o.z);

    let count = 0, clipped = false;
    for (let y = 0; y < height; y++) {
        for (let z = 0; z < length; z++) {
            for (let x = 0; x < width; x++) {
                const v = voxelAt(x, y, z);
                if (!v) continue;                 // air
                if (count >= maxVoxels) { clipped = true; break; }
                world.setVoxel(ox + x, oy + y, oz + z, v);
                count++;
            }
            if (clipped) break;
        }
        if (clipped) break;
    }

    // Spawn just above the top of the build, at its centre, so the player
    // drops onto / next to it ready to walk around.
    const spawn = {
        x: ox + Math.floor(width / 2),
        y: oy + height + 2,
        z: oz + Math.floor(length / 2),
    };
    return { voxels: count, dims: { width, height, length }, spawn, clipped, format: parsed.format };
}
