// ===================================================================
// world/schematicWriter.js -- v4259
// -------------------------------------------------------------------
// THE OTHER HALF OF world/schematicLoader.js: voxels OUT, as a Sponge
// v2 .schem that Minecraft's WorldEdit will paste.
//
// The loader has read .schem, .schematic and .litematic since round
// ~200 and nothing has ever written one. So a build could come INTO
// this engine and never leave it -- you could walk around someone
// else's cathedral and not hand back the one you made.
//
// *** WHAT MAKES THIS CHECKABLE RATHER THAN PLAUSIBLE: THE READER IS
// *** ALREADY HERE. A writer with no reader is graded by opening the
// file in Minecraft and squinting. A writer whose output goes back
// through parseSchematic is graded by comparing every voxel, and the
// gate needs no game, no network and no second implementation of NBT.
//
// ---- AND THE ROUND TRIP ONLY CLOSES IN ONE DIRECTION ---------------
//
// mcNameToVoxel is MANY-TO-ONE by construction: Minecraft has
// thousands of blocks and this engine has nine voxel materials, so
// cobblestone, granite, andesite, bedrock and deepslate all arrive as
// STONE. That is a deliberate lossy projection and the loader's own
// header says so.
//
// The consequence is exact and worth stating before anyone assumes
// otherwise: *** schem -> voxels -> schem IS NOT IDENTITY, and
// *** voxels -> schem -> voxels IS. *** Writing STONE back has to pick
// one name out of the hundreds that map to it, and the pick is a
// CHOICE this file makes rather than information it recovers. The gate
// measures the collapse rather than glossing it.
// ===================================================================

// ---- the inverse of mcNameToVoxel, which is a choice per id -------
//
// One canonical Minecraft block per voxel material. Each is chosen so
// that mcNameToVoxel(name) returns the id it came from -- asserted in
// the gate rather than trusted, because the loader's matcher is a
// chain of substring tests whose ORDER decides the answer, and a name
// that looks obviously right can be captured by an earlier rule.
export const VOXEL_TO_MC = Object.freeze({
    0:  "minecraft:air",
    1:  "minecraft:stone",
    2:  "minecraft:dirt",
    3:  "minecraft:grass_block",
    4:  "minecraft:sand",
    5:  "minecraft:snow_block",
    6:  "minecraft:obsidian",
    10: "minecraft:water",
    12: "minecraft:lava",
});

// ---- and the five materials that are NOT invertible ---------------
//
// world/voxelFormat.js defines fourteen voxel codes; the LOADER can only
// ever produce the nine above, because mcNameToVoxel has no branch that
// returns RUBBLE, FLOWING_WATER, ICE, SCREEN or MEMORY. So a build that
// came from Minecraft round-trips exactly, and a build made HERE can
// carry materials Minecraft can show but this engine cannot read back.
//
// Each name below is chosen for what a Minecraft client will RENDER,
// not for what SweK will re-read -- exporting is for the other program.
// The re-read result is measured in the gate rather than guessed, and
// it is a genuine loss in four cases out of five:
//
//   RUBBLE 7  -> gravel          -> STONE 1   (lost: no gravel branch)
//   FLOWING 11-> water           -> WATER 10  (lost: flow state)
//   ICE    13 -> ice             -> STONE 1   (lost: no ice branch)
//   SCREEN 20 -> black_concrete  -> ASH 6     (lost: startsWith black_)
//   MEMORY 30 -> amethyst_block  -> STONE 1   (lost: no branch)
export const VOXEL_TO_MC_EXTRA = Object.freeze({
    7:  "minecraft:gravel",
    11: "minecraft:water",
    13: "minecraft:ice",
    20: "minecraft:black_concrete",
    30: "minecraft:amethyst_block",
});

/** Every voxel code this engine can put in a world, and the block name it exports as. */
export const MC_NAME_FOR = Object.freeze({ ...VOXEL_TO_MC, ...VOXEL_TO_MC_EXTRA });

// ---- NBT tag ids, as the loader's parser reads them ---------------
export const TAG = Object.freeze({
    END: 0, BYTE: 1, SHORT: 2, INT: 3, LONG: 4, FLOAT: 5, DOUBLE: 6,
    BYTE_ARRAY: 7, STRING: 8, LIST: 9, COMPOUND: 10, INT_ARRAY: 11, LONG_ARRAY: 12,
});

/** A growable big-endian byte sink. NBT is big-endian throughout, which is the one thing easiest to get wrong. */
class Sink {
    constructor() { this.buf = new Uint8Array(1024); this.len = 0; }
    _room(n) {
        if (this.len + n <= this.buf.length) return;
        let cap = this.buf.length; while (cap < this.len + n) cap *= 2;
        const b = new Uint8Array(cap); b.set(this.buf.subarray(0, this.len)); this.buf = b;
    }
    u8(v) { this._room(1); this.buf[this.len++] = v & 0xff; return this; }
    i16(v) { this._room(2); const d = new DataView(this.buf.buffer); d.setInt16(this.len, v); this.len += 2; return this; }
    i32(v) { this._room(4); const d = new DataView(this.buf.buffer); d.setInt32(this.len, v); this.len += 4; return this; }
    bytes(a) { this._room(a.length); this.buf.set(a, this.len); this.len += a.length; return this; }
    /** NBT strings are a uint16 LENGTH IN BYTES then modified UTF-8; ASCII block names make the two agree. */
    str(s) { const b = new TextEncoder().encode(s); this._room(2 + b.length);
             const d = new DataView(this.buf.buffer); d.setUint16(this.len, b.length); this.len += 2;
             this.buf.set(b, this.len); this.len += b.length; return this; }
    done() { return this.buf.slice(0, this.len); }
}

/**
 * Varint, LEB128, exactly as the loader decodes it: seven bits per byte, high bit set while more follow.
 *
 * Palette indices are non-negative, so there is no zigzag and no sign extension to get wrong -- which is
 * worth saying because the SAME format uses zigzag varints elsewhere and mixing them is a silent corruption.
 */
export function writeVarint(value, out = []) {
    let v = value >>> 0;
    do { let b = v & 0x7f; v >>>= 7; if (v !== 0) b |= 0x80; out.push(b); } while (v !== 0);
    return out;
}

/** Total bytes a varint sequence needs -- so a caller can size a buffer without building it twice. */
export const varintLength = (v) => { let n = 1, x = v >>> 0; while ((x >>>= 7) !== 0) n++; return n; };

/**
 * Serialise a plain object as an NBT compound. Types are chosen from the JS value, with an explicit
 * `_types` override for the cases where JS cannot tell -- an integer that must be a SHORT, for instance,
 * which .schem's Width/Height/Length are in the specification.
 */
export function writeNBT(root, rootName = "Schematic", types = {}) {
    const s = new Sink();
    const writeValue = (tag, v, t) => {
        switch (tag) {
            case TAG.BYTE: s.u8(v); break;
            case TAG.SHORT: s.i16(v); break;
            case TAG.INT: s.i32(v); break;
            case TAG.STRING: s.str(v); break;
            case TAG.BYTE_ARRAY: s.i32(v.length).bytes(v instanceof Uint8Array ? v : Uint8Array.from(v)); break;
            case TAG.INT_ARRAY: { s.i32(v.length); for (const x of v) s.i32(x); break; }
            case TAG.COMPOUND: writeCompound(v, t || {}); break;
            case TAG.LIST: {
                const it = v.length ? tagFor(v[0], undefined) : TAG.END;
                s.u8(it).i32(v.length);
                for (const x of v) writeValue(it, x, undefined);
                break;
            }
            default: throw new Error("writeNBT: unsupported tag " + tag);
        }
    };
    const tagFor = (v, forced) => {
        if (forced) return forced;
        if (typeof v === "string") return TAG.STRING;
        if (typeof v === "number") return Number.isInteger(v) ? TAG.INT : TAG.DOUBLE;
        if (v instanceof Uint8Array || v instanceof Int8Array) return TAG.BYTE_ARRAY;
        if (Array.isArray(v)) return TAG.LIST;
        if (v && typeof v === "object") return TAG.COMPOUND;
        throw new Error("writeNBT: cannot type " + typeof v);
    };
    function writeCompound(obj, t) {
        for (const [k, v] of Object.entries(obj)) {
            if (v === undefined) continue;
            const forced = t[k];
            const tag = tagFor(v, typeof forced === "number" ? forced : undefined);
            s.u8(tag).str(k);
            writeValue(tag, v, typeof forced === "object" ? forced : undefined);
        }
        s.u8(TAG.END);
    }
    s.u8(TAG.COMPOUND).str(rootName);
    writeCompound(root, types);
    return s.done();
}

/** gzip, so the loader's gunzipIfNeeded takes the same path a real WorldEdit file does. */
export async function gzip(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Build a Sponge v2 .schem from a voxel volume.
 *
 * `voxelAt(x, y, z)` is the same signature parseSchematic RETURNS, so a parsed schematic can be handed
 * straight back to this function -- which is what makes the round trip a one-liner rather than a fixture.
 *
 * The block order is YZX: index = (y * length + z) * width + x. That is not a preference, it is what the
 * loader indexes with and what the format specifies, and getting it wrong produces a file that is valid,
 * readable, and transposed.
 */
export function buildSchem({ width, height, length, voxelAt, dataVersion = 2975 }) {
    if (!(width > 0 && height > 0 && length > 0)) throw new Error("buildSchem: zero or negative dimensions");
    // Palette only of the materials actually PRESENT -- a fixed fourteen-entry palette would ship air and
    // lava into a file containing neither, and the palette is what a reader shows a human first.
    //
    // *** KEYED BY NAME, NOT BY VOXEL ID. *** MC_NAME_FOR is not injective: WATER 10 and FLOWING_WATER 11
    // are both "minecraft:water". Deduping by voxel id gives two palette INDICES for one palette NAME, and
    // a .schem palette is a JSON-ish name -> index map, so the second write silently clobbers the first and
    // every block at the lost index re-reads as stone. That is a corrupt file, not a lossy one, and the
    // round trip over the nine invertible materials cannot see it because those nine names are distinct.
    const byName = new Map();                     // block name -> palette index
    const order = [];                             // palette index -> block name
    const ids = new Int32Array(width * height * length);
    for (let y = 0; y < height; y++) {
        for (let z = 0; z < length; z++) {
            for (let x = 0; x < width; x++) {
                const v = voxelAt(x, y, z) | 0;
                const name = MC_NAME_FOR[v];
                if (name === undefined) throw new Error("buildSchem: no Minecraft name for voxel id " + v);
                if (!byName.has(name)) { byName.set(name, order.length); order.push(name); }
                ids[(y * length + z) * width + x] = byName.get(name);
            }
        }
    }
    const palette = {};
    order.forEach((name, i) => { palette[name] = i; });
    const data = [];
    for (let i = 0; i < ids.length; i++) writeVarint(ids[i], data);

    const root = {
        Version: 2,
        DataVersion: dataVersion,
        Width: width, Height: height, Length: length,
        PaletteMax: order.length,
        Palette: palette,
        BlockData: Uint8Array.from(data),
        Offset: new Int32Array([0, 0, 0]),
        Metadata: { Name: "SweK export" },
    };
    // Width/Height/Length are SHORT in the specification. The loader coerces with Number() either way, but a
    // file this tree writes should be right for OTHER readers, which is the whole point of exporting.
    const types = { Width: TAG.SHORT, Height: TAG.SHORT, Length: TAG.SHORT, Version: TAG.INT,
                    DataVersion: TAG.INT, PaletteMax: TAG.INT, Offset: TAG.INT_ARRAY,
                    Palette: {}, Metadata: {} };
    return { nbt: writeNBT(root, "Schematic", types), palette, paletteSize: order.length,
             blockDataBytes: data.length };
}

/** The whole export: voxels in, a gzipped .schem out, ready to write to disk or hand to a download. */
export async function writeSchem(volume) {
    const built = buildSchem(volume);
    return { bytes: await gzip(built.nbt), ...built };
}
