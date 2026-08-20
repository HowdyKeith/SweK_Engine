// WebGLEngine/ev/resourceFork.js — clean-room reader for the classic Mac OS resource-fork format that
// Escape Velocity (and its plug-ins) store their data in. This file ships NO game content: it only turns a
// USER-SUPPLIED data file into typed resources. You decode the per-type structs (ship/system/planet/...)
// elsewhere. Format per Inside Macintosh (Resource Manager) + the Kaitai/ciderpress specs; big-endian.
//
//   import { loadResourceFork } from "./resourceFork.js";
//   const rf = loadResourceFork(arrayBuffer);   // auto-unwraps MacBinary / AppleSingle / AppleDouble
//   rf.typeList();          // ["shïp", "spöb", "sÿst", ...]   (Mac-Roman decoded 4-char codes)
//   rf.list("shïp");        // [{ id, name, length }, ...]
//   rf.get("shïp", 128);    // Uint8Array of that resource's raw bytes (or null)
//   rf.count;               // total resource count
//
// Milestone 1 of the EV-compatible engine. Reads the container; the schema layer (sÿst/spöb/shïp/...) is next.

// --- Mac Roman (0x80-0xFF) -> Unicode, so type codes like shïp/spöb/sÿst + resource names decode correctly.
const MAC_ROMAN_HIGH = [
    0x00C4,0x00C5,0x00C7,0x00C9,0x00D1,0x00D6,0x00DC,0x00E1,0x00E0,0x00E2,0x00E4,0x00E3,0x00E5,0x00E7,0x00E9,0x00E8,
    0x00EA,0x00EB,0x00ED,0x00EC,0x00EE,0x00EF,0x00F1,0x00F3,0x00F2,0x00F4,0x00F6,0x00F5,0x00FA,0x00F9,0x00FB,0x00FC,
    0x2020,0x00B0,0x00A2,0x00A3,0x00A7,0x2022,0x00B6,0x00DF,0x00AE,0x00A9,0x2122,0x00B4,0x00A8,0x2260,0x00C6,0x00D8,
    0x221E,0x00B1,0x2264,0x2265,0x00A5,0x00B5,0x2202,0x2211,0x220F,0x03C0,0x222B,0x00AA,0x00BA,0x03A9,0x00E6,0x00F8,
    0x00BF,0x00A1,0x00AC,0x221A,0x0192,0x2248,0x2206,0x00AB,0x00BB,0x2026,0x00A0,0x00C0,0x00C3,0x00D5,0x0152,0x0153,
    0x2013,0x2014,0x201C,0x201D,0x2018,0x2019,0x00F7,0x25CA,0x00FF,0x0178,0x2044,0x20AC,0x2039,0x203A,0xFB01,0xFB02,
    0x2021,0x00B7,0x201A,0x201E,0x2030,0x00C2,0x00CA,0x00C1,0x00CB,0x00C8,0x00CD,0x00CE,0x00CF,0x00CC,0x00D3,0x00D4,
    0xF8FF,0x00D2,0x00DA,0x00DB,0x00D9,0x0131,0x02C6,0x02DC,0x00AF,0x02D8,0x02D9,0x02DA,0x00B8,0x02DD,0x02DB,0x02C7,
];
function macRoman(bytes, start, len) {
    let s = "";
    for (let i = 0; i < len; i++) {
        const b = bytes[start + i];
        s += String.fromCharCode(b < 0x80 ? b : MAC_ROMAN_HIGH[b - 0x80]);
    }
    return s;
}

function _u32(dv, o) { return dv.getUint32(o, false); }   // big-endian
function _u16(dv, o) { return dv.getUint16(o, false); }
function _i16(dv, o) { return dv.getInt16(o, false); }

function _toU8(buf) {
    if (buf instanceof Uint8Array) return buf;
    if (buf instanceof ArrayBuffer) return new Uint8Array(buf);
    if (buf && buf.buffer instanceof ArrayBuffer) return new Uint8Array(buf.buffer, buf.byteOffset || 0, buf.byteLength);
    throw new Error("resourceFork: expected ArrayBuffer/typed array");
}

// --- Unwrap common transport wrappers so we end up with the raw resource-fork bytes.
//   AppleSingle (magic 0x00051600) / AppleDouble (0x00051607): resource fork is entry id 2.
//   MacBinary: 128-byte header; resource fork follows the (128-padded) data fork.
//   Otherwise: assume the bytes already ARE a resource fork.
function unwrapContainer(input) {
    const u8 = _toU8(input);
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    if (u8.byteLength >= 4) {
        const magic = _u32(dv, 0);
        if (magic === 0x00051600 || magic === 0x00051607) {   // AppleSingle / AppleDouble
            const n = _u16(dv, 24);
            for (let i = 0; i < n; i++) {
                const e = 26 + i * 12;
                if (_u32(dv, e) === 2) {   // entry id 2 = resource fork
                    const off = _u32(dv, e + 4), len = _u32(dv, e + 8);
                    return { kind: magic === 0x00051600 ? "applesingle" : "appledouble", rsrc: u8.subarray(off, off + len) };
                }
            }
        }
    }
    // MacBinary: byte0 (old version) == 0, byte74 == 0, filename length 1..63, sane fork lengths.
    if (u8.byteLength >= 128 && u8[0] === 0 && u8[74] === 0 && u8[1] >= 1 && u8[1] <= 63) {
        const dataLen = _u32(dv, 83), rsrcLen = _u32(dv, 87);
        const rsrcStart = 128 + Math.ceil(dataLen / 128) * 128;
        if (rsrcLen > 0 && rsrcStart + rsrcLen <= u8.byteLength) {
            return { kind: "macbinary", rsrc: u8.subarray(rsrcStart, rsrcStart + rsrcLen) };
        }
    }
    return { kind: "raw", rsrc: u8 };
}

// --- Parse a raw resource fork into typed resources.
function parseResourceFork(input) {
    const u8 = _toU8(input);
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    if (u8.byteLength < 16) throw new Error("resourceFork: too short to be a resource fork");

    const dataOff = _u32(dv, 0), mapOff = _u32(dv, 4), dataLen = _u32(dv, 8), mapLen = _u32(dv, 12);
    if (dataOff + dataLen > u8.byteLength || mapOff + mapLen > u8.byteLength || mapLen < 28) {
        throw new Error("resourceFork: header out of bounds (not a resource fork, or wrong wrapper)");
    }

    const typeListRel = _u16(dv, mapOff + 24);   // offset from map start to type list
    const nameListRel = _u16(dv, mapOff + 26);   // offset from map start to name list
    const typeListAbs = mapOff + typeListRel;
    const nameListAbs = mapOff + nameListRel;

    const numTypes = _u16(dv, typeListAbs) + 1;   // stored as count-1
    const types = {};   // decodedType -> [{ id, name, length, _dataAbs }]
    let total = 0;

    const typeRaw = {};   // decodedType -> "73 d8 73 74" raw hex, for diagnostics
    for (let t = 0; t < numTypes; t++) {
        const te = typeListAbs + 2 + t * 8;
        const typeCode = macRoman(u8, te, 4);
        typeRaw[typeCode] = `${u8[te].toString(16).padStart(2,"0")} ${u8[te+1].toString(16).padStart(2,"0")} ${u8[te+2].toString(16).padStart(2,"0")} ${u8[te+3].toString(16).padStart(2,"0")}`;
        const numRefs = _u16(dv, te + 4) + 1;             // count-1
        const refListAbs = typeListAbs + _u16(dv, te + 6); // offset from type-list start
        const arr = [];
        for (let r = 0; r < numRefs; r++) {
            const re = refListAbs + r * 12;
            const id = _i16(dv, re);
            const nameRel = _u16(dv, re + 2);
            // 3-byte data offset (re+5..re+7); re+4 is the attribute byte
            const dOff = (u8[re + 5] << 16) | (u8[re + 6] << 8) | u8[re + 7];
            const dataAbs = dataOff + dOff;
            const length = (dataAbs + 4 <= u8.byteLength) ? _u32(dv, dataAbs) : 0;
            let name = "";
            if (nameRel !== 0xFFFF) {
                const np = nameListAbs + nameRel;
                if (np < u8.byteLength) { const nl = u8[np]; name = macRoman(u8, np + 1, nl); }
            }
            arr.push({ id, name, length, _dataAbs: dataAbs });
            total++;
        }
        types[typeCode] = arr;
    }

    const api = {
        count: total,
        typeList() { return Object.keys(types); },
        typeRaw() { return typeRaw; },
        list(type) { return (types[type] || []).map(({ id, name, length }) => ({ id, name, length })); },
        get(type, id) {
            const arr = types[type]; if (!arr) return null;
            const e = arr.find((x) => x.id === id); if (!e) return null;
            const start = e._dataAbs + 4;
            if (start + e.length > u8.byteLength) return null;
            return u8.subarray(start, start + e.length);
        },
        has(type, id) { const arr = types[type]; return !!(arr && arr.some((x) => x.id === id)); },
        _raw: u8,
    };
    return api;
}

// --- Merge several loaded resource forks into one combined API. EV Nova's
//     Windows release splits the universe across multiple .rez files (Nova Data
//     1-6, etc.); the engine wants them as one set. Later files override earlier
//     ones on a (type,id) clash, matching how EV layers data + plug-ins.
function mergeForks(forks) {
    const merged = {};   // type -> Map(id -> {id,name,get})
    const rawAgg = {};
    let order = [];
    for (const rf of forks) {
        if (!rf || typeof rf.typeList !== "function") continue;
        const raw = (typeof rf.typeRaw === "function") ? rf.typeRaw() : {};
        for (const type of rf.typeList()) {
            if (!merged[type]) { merged[type] = new Map(); order.push(type); }
            if (raw[type] && !rawAgg[type]) rawAgg[type] = raw[type];
            for (const meta of rf.list(type)) {
                merged[type].set(meta.id, { id: meta.id, name: meta.name, length: meta.length, _src: rf });
            }
        }
    }
    let total = 0;
    for (const t of Object.keys(merged)) total += merged[t].size;
    return {
        count: total,
        container: "merged(" + forks.map((f) => f && f.container).filter(Boolean).join("+") + ")",
        typeList() { return Object.keys(merged); },
        typeRaw() { return rawAgg; },
        list(type) { return merged[type] ? [...merged[type].values()].map(({ id, name, length }) => ({ id, name, length })) : []; },
        get(type, id) { const m = merged[type]; const e = m && m.get(id); return e ? e._src.get(type, id) : null; },
        has(type, id) { const m = merged[type]; return !!(m && m.has(id)); },
    };
}

function loadResourceFork(input) {
    const u8 = _toU8(input);
    // Windows EV Nova .rez files are BurgerLib "BRGR" archives, not Mac resource
    // forks -- a different container that the Mac path can't read. Detect the
    // magic and route to the BRGR parser, which yields the identical resource API.
    if (u8.byteLength >= 4 && u8[0] === 0x42 && u8[1] === 0x52 && u8[2] === 0x47 && u8[3] === 0x52) {
        const rf = parseBRGR(u8);
        rf.container = "brgr";
        return rf;
    }
    const { kind, rsrc } = unwrapContainer(input);
    const rf = parseResourceFork(rsrc);
    rf.container = kind;
    return rf;
}

// --- Parse a BurgerLib "BRGR" (.rez) archive into the same typed-resource API
//     as parseResourceFork. Layout is authoritative from andrews05/evstuff
//     plugconvert.c (reader rez2npif + writer npif2rez):
//       Header1 : 'BRGR'(4) | version(4) | header2Length(4)     [version+len LITTLE-endian]
//       Header2 : unknown(4) | firstIndex(4) | numEntries(4)    [LITTLE-endian, raw fwrite]
//       Offsets : numEntries * { offset(4) | size(4) | unknown(4) }  [LITTLE-endian]
//       "resource.map\0" (13 bytes)  -- part of header2Length, we skip via offsets
//       [ resource data blobs, index order ]
//       Map blob  (pointed to by the LAST offset entry, i.e. index numResources):
//          MapHeader : unknown(4) | numTypes(4)                       [BIG-endian]
//          TypeInfo  : numTypes * { type(4) | mapOffset(4) | numResources(4) }  [BIG-endian]
//          ResInfo   : numResources * { index(4) | type(4) | id(2) | name[256] } [BIG-endian, 266 bytes]
//     numEntries = numResources + 1; the +1 map entry is LAST (not first). Each
//     resource's bytes are at offsets[index - firstIndex], pointing straight at
//     the data (no 4-byte length prefix like the Mac data section).
function parseBRGR(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const LE = (o) => dv.getUint32(o, true);    // header + offset table: little-endian
    const BE = (o) => dv.getUint32(o, false);   // map: big-endian
    const BEi16 = (o) => dv.getInt16(o, false);
    if (u8.byteLength < 24) throw new Error("resourceFork: BRGR too short");

    // Header2 at offset 12: unknown(12), firstIndex(16), numEntries(20) -- little-endian.
    const firstIndex = LE(16);
    const numEntries = LE(20);
    if (numEntries < 1 || numEntries > 5_000_000) throw new Error("resourceFork: BRGR numEntries insane (" + numEntries + ")");
    const numResources = numEntries - 1;

    // Offset table at 24: numEntries * 12 bytes, little-endian.
    const OFF_BASE = 24;
    if (OFF_BASE + numEntries * 12 > u8.byteLength) throw new Error("resourceFork: BRGR offset table out of bounds");
    const offsets = [];
    for (let i = 0; i < numEntries; i++) {
        const e = OFF_BASE + i * 12;
        offsets.push({ offset: LE(e), size: LE(e + 4) });
    }

    // The MAP is the LAST entry (index numResources), and it's BIG-endian.
    const map = offsets[numResources];
    if (!map || map.offset + 8 > u8.byteLength) throw new Error("resourceFork: BRGR map entry out of bounds");
    const numTypes = BE(map.offset + 4);      // MapHeader: unknown(4), numTypes(4)
    if (numTypes > 2000) throw new Error("resourceFork: BRGR numTypes insane (" + numTypes + ")");

    // TypeInfo list (big-endian) right after MapHeader.
    const typeListBase = map.offset + 8;
    const typeEntries = [];
    for (let t = 0; t < numTypes; t++) {
        const te = typeListBase + t * 12;
        if (te + 12 > u8.byteLength) break;
        typeEntries.push({
            typeCode: macRoman(u8, te, 4),
            mapOffset: BE(te + 4),            // relative to the map blob start
            numResources: BE(te + 8),
        });
    }

    // ResourceInfo entries (big-endian), 266 bytes each, at map.offset+mapOffset.
    const REZ_INFO_SIZE = 4 + 4 + 2 + 256;
    const types = {};
    let total = 0;
    for (const te of typeEntries) {
        const arr = [];
        const base = map.offset + te.mapOffset;
        for (let r = 0; r < te.numResources; r++) {
            const re = base + r * REZ_INFO_SIZE;
            if (re + 10 > u8.byteLength) break;
            const index = BE(re);
            const id = BEi16(re + 8);
            let nameLen = 0;
            const nameStart = re + 10;
            while (nameLen < 256 && nameStart + nameLen < u8.byteLength && u8[nameStart + nameLen] !== 0) nameLen++;
            const name = macRoman(u8, nameStart, nameLen);
            const oi = index - firstIndex;    // offset table is index-firstIndex based
            const off = (oi >= 0 && oi < offsets.length) ? offsets[oi] : null;
            arr.push({ id, name, length: off ? off.size : 0, _dataAbs: off ? off.offset : 0, _rawLen: off ? off.size : 0 });
            total++;
        }
        types[te.typeCode] = arr;
    }

    return {
        count: total,
        typeList() { return Object.keys(types); },
        list(type) { return (types[type] || []).map(({ id, name, length }) => ({ id, name, length })); },
        get(type, id) {
            const a = types[type]; if (!a) return null;
            const e = a.find((x) => x.id === id); if (!e) return null;
            if (e._dataAbs + e._rawLen > u8.byteLength) return null;
            return u8.subarray(e._dataAbs, e._dataAbs + e._rawLen);
        },
        has(type, id) { const a = types[type]; return !!(a && a.some((x) => x.id === id)); },
        _raw: u8,
    };
}

export { loadResourceFork, parseResourceFork, parseBRGR, mergeForks, unwrapContainer, macRoman };
