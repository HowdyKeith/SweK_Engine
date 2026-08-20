// FILE: tools/wadLoader.js
// VERSION: v2 — round 365 (v1 was round 71)
//
// WAD (Where's All the Data) parser — Doom's level archive format.
// v1 (round 71): VERTEXES + LINEDEFS only for the AI Brain's 2D
// wireframe. v2 (round 365): full geometry — SECTORS, SIDEDEFS, THINGS
// — needed for the voxelization round (v366) and texture work (v367).
//
// Format:
//   Header (12 bytes):
//     4 bytes ASCII   "IWAD" or "PWAD"
//     4 bytes uint32  numLumps  (little-endian)
//     4 bytes uint32  dirOffset
//
//   Directory (numLumps × 16 bytes):
//     4 bytes uint32  lump offset
//     4 bytes uint32  lump size
//     8 bytes ASCII   lump name (null-padded)
//
//   Map structure (the map name is a 0-size marker lump, followed by
//   the data lumps in a fixed order):
//     <MAPNAME>   marker
//     THINGS      monsters/items/spawns
//     LINEDEFS    edges
//     SIDEDEFS    texture refs per linedef side
//     VERTEXES    2D points
//     SEGS, SSECTORS, NODES   BSP data
//     SECTORS     floor/ceiling heights + light + textures
//     REJECT, BLOCKMAP
//
//   Lump layouts (all little-endian):
//     VERTEX (4 bytes):  int16 x, int16 y
//     LINEDEF (14 bytes): u16 v1, v2, flags, special, tag, right_sd, left_sd
//     SIDEDEF (30 bytes): i16 xoff, yoff; 8-char upper, lower, middle textures; u16 sector
//     SECTOR (26 bytes):  i16 floorH, ceilH; 8-char floorTex, ceilTex; i16 light, special, tag
//     THING (10 bytes):   i16 x, y; u16 angle, type, flags
//
// Map name pattern: "E#M#" (Doom 1) or "MAP##" (Doom 2 / Freedoom).
// Discovery: any lump whose name matches that pattern is treated as a
// map marker, provided VERTEXES + LINEDEFS lumps follow within ~10
// lumps after it. Other lumps (SECTORS, SIDEDEFS, THINGS) are scanned
// in the same window and recorded when present — absent ones leave
// the corresponding indices at -1 and parseMap silently skips them.

export const WAD = {};

WAD.parse = function parse(arrayBuffer) {
    const dv = new DataView(arrayBuffer);
    const u8 = new Uint8Array(arrayBuffer);

    if (arrayBuffer.byteLength < 12) {
        throw new Error("file too small to be a WAD");
    }

    // Header magic
    const magic = String.fromCharCode(u8[0], u8[1], u8[2], u8[3]);
    if (magic !== "IWAD" && magic !== "PWAD") {
        throw new Error(`not a WAD (magic "${magic}")`);
    }
    const numLumps  = dv.getUint32(4, true);
    const dirOffset = dv.getUint32(8, true);

    if (dirOffset + numLumps * 16 > arrayBuffer.byteLength) {
        throw new Error("WAD directory extends past EOF");
    }

    // Read directory
    const lumps = [];
    for (let i = 0; i < numLumps; i++) {
        const off  = dirOffset + i * 16;
        const lOff = dv.getUint32(off, true);
        const lSz  = dv.getUint32(off + 4, true);
        // 8-char name, null-padded
        let name = "";
        for (let j = 0; j < 8; j++) {
            const c = u8[off + 8 + j];
            if (c === 0) break;
            name += String.fromCharCode(c);
        }
        lumps.push({ index: i, name, offset: lOff, size: lSz });
    }

    // Discover maps: any lump named E#M# or MAP## that is followed
    // (within the next 10 lumps) by both VERTEXES and LINEDEFS lumps.
    // v365 — also locate SECTORS, SIDEDEFS, THINGS in the same window.
    // v382 — also locate SSECTORS + SEGS for exact convex-polygon
    // floor reconstruction (replaces the approximate right-sidedef
    // chain walk for complex maps).
    const MAP_NAME_RE = /^(E\dM\d|MAP\d\d)$/;
    const maps = [];
    for (let i = 0; i < lumps.length; i++) {
        if (!MAP_NAME_RE.test(lumps[i].name)) continue;
        let vIdx = -1, lIdx = -1, sIdx = -1, sdIdx = -1, tIdx = -1, ssIdx = -1, segIdx = -1, nodeIdx = -1;
        for (let j = i + 1; j < Math.min(i + 11, lumps.length); j++) {
            const n = lumps[j].name;
            if (n === "VERTEXES") vIdx  = j;
            if (n === "LINEDEFS") lIdx  = j;
            if (n === "SECTORS")  sIdx  = j;
            if (n === "SIDEDEFS") sdIdx = j;
            if (n === "THINGS")   tIdx  = j;
            if (n === "SSECTORS") ssIdx = j;
            if (n === "SEGS")      segIdx = j;
            if (n === "NODES")     nodeIdx = j;
        }
        if (vIdx >= 0 && lIdx >= 0) {
            maps.push({
                name:          lumps[i].name,
                markerIdx:     i,
                vertexesIdx:   vIdx,
                linedefsIdx:   lIdx,
                sectorsIdx:    sIdx,
                sidedefsIdx:   sdIdx,
                thingsIdx:     tIdx,
                ssectorsIdx:   ssIdx,
                segsIdx:       segIdx,
                nodesIdx:      nodeIdx,
            });
        }
    }

    return { magic, numLumps, lumps, maps, arrayBuffer };
};

// Read an 8-char null-padded ASCII name from a DataView at offset.
function _readName8(dv, offset) {
    let s = "";
    for (let j = 0; j < 8; j++) {
        const c = dv.getUint8(offset + j);
        if (c === 0) break;
        s += String.fromCharCode(c);
    }
    return s;
}

// Parse VERTEXES + LINEDEFS for a single map and return a normalized
// geometry record. With opts.full=true (v365 default true), also
// includes parsed SECTORS, SIDEDEFS, and THINGS when present.
//
// Returns (v1 fields, always present):
//   {
//     name:      "E1M1" / "MAP01" / ...
//     vertices:  Float32Array (x0, y0, x1, y1, ...)    // raw WAD coords
//     lines:     Uint16Array  (v1, v2, twoSided)        // 3 entries per line
//     bounds:    { minX, maxX, minY, maxY }
//   }
//
// v365 — additional fields when opts.full !== false AND the lumps
// were present in the WAD:
//
//   linedefs:  array of full LINEDEF records (v1, v2, flags, special,
//              tag, rightSide, leftSide) so the voxelizer can look up
//              sidedef refs without re-parsing.
//   sidedefs:  array of { xoff, yoff, upper, lower, middle, sector }
//   sectors:   array of { floorH, ceilH, floorTex, ceilTex, light,
//                          special, tag }
//   things:    array of { x, y, angle, type, flags } where type 1 is
//              the Doom player_start; types 2/3/4 are other coop
//              starts; 11 is deathmatch start; 88 is a Boss Brain; etc.
//
// WAD's Y axis points "north" (positive Y is forward in-game). We keep
// it raw; the caller decides whether to flip for display. Brain map
// uses Y as Z (top-down with north up), no flip needed.
WAD.parseMap = function parseMap(wad, mapName, opts = {}) {
    const m = wad.maps.find(x => x.name === mapName);
    if (!m) throw new Error(`map ${mapName} not in WAD`);
    const dv = new DataView(wad.arrayBuffer);

    const vLump = wad.lumps[m.vertexesIdx];
    const lLump = wad.lumps[m.linedefsIdx];

    // VERTEXES: int16 x, int16 y per vertex (4 bytes each)
    const vCount = vLump.size >> 2;
    const vertices = new Float32Array(vCount * 2);
    let minX =  Infinity, maxX = -Infinity, minY =  Infinity, maxY = -Infinity;
    for (let i = 0; i < vCount; i++) {
        const x = dv.getInt16(vLump.offset + i * 4,     true);
        const y = dv.getInt16(vLump.offset + i * 4 + 2, true);
        vertices[i * 2]     = x;
        vertices[i * 2 + 1] = y;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
    }

    // LINEDEFS: 14 bytes each — v1, v2, flags, special, tag, right_sd, left_sd
    const lCount = (lLump.size / 14) | 0;
    const lines = new Uint16Array(lCount * 3);   // v1, v2, twoSided
    const linedefs = [];
    for (let i = 0; i < lCount; i++) {
        const base = lLump.offset + i * 14;
        const v1       = dv.getUint16(base,      true);
        const v2       = dv.getUint16(base + 2,  true);
        const flags    = dv.getUint16(base + 4,  true);
        const special  = dv.getUint16(base + 6,  true);
        const tag      = dv.getUint16(base + 8,  true);
        const rightSd  = dv.getUint16(base + 10, true);   // sidedef index
        const leftSd   = dv.getUint16(base + 12, true);   // 0xFFFF if one-sided
        const twoSided = leftSd !== 0xFFFF ? 1 : 0;
        lines[i * 3]     = v1;
        lines[i * 3 + 1] = v2;
        lines[i * 3 + 2] = twoSided;
        linedefs.push({ v1, v2, flags, special, tag, rightSide: rightSd, leftSide: leftSd });
    }

    const result = {
        name: mapName,
        vertices,
        lines,
        bounds: { minX, maxX, minY, maxY },
    };

    // v365 — full-geometry mode (default on; pass opts.full=false to
    // keep v1's lean wireframe-only output).
    if (opts.full === false) return result;

    // SIDEDEFS: 30 bytes each — xoff(i16), yoff(i16), upper(8), lower(8), middle(8), sector(u16)
    if (m.sidedefsIdx >= 0) {
        const sdLump = wad.lumps[m.sidedefsIdx];
        const sdCount = (sdLump.size / 30) | 0;
        const sidedefs = new Array(sdCount);
        for (let i = 0; i < sdCount; i++) {
            const base = sdLump.offset + i * 30;
            const xoff   = dv.getInt16(base,      true);
            const yoff   = dv.getInt16(base + 2,  true);
            const upper  = _readName8(dv, base + 4);
            const lower  = _readName8(dv, base + 12);
            const middle = _readName8(dv, base + 20);
            const sector = dv.getUint16(base + 28, true);
            sidedefs[i] = { xoff, yoff, upper, lower, middle, sector };
        }
        result.sidedefs = sidedefs;
        result.linedefs = linedefs;
    }

    // SECTORS: 26 bytes each — floorH(i16), ceilH(i16), floorTex(8),
    // ceilTex(8), light(i16), special(i16), tag(i16)
    if (m.sectorsIdx >= 0) {
        const sLump = wad.lumps[m.sectorsIdx];
        const sCount = (sLump.size / 26) | 0;
        const sectors = new Array(sCount);
        for (let i = 0; i < sCount; i++) {
            const base = sLump.offset + i * 26;
            const floorH   = dv.getInt16(base,      true);
            const ceilH    = dv.getInt16(base + 2,  true);
            const floorTex = _readName8(dv, base + 4);
            const ceilTex  = _readName8(dv, base + 12);
            const light    = dv.getInt16(base + 20, true);
            const special  = dv.getInt16(base + 22, true);
            const tag      = dv.getInt16(base + 24, true);
            sectors[i] = { floorH, ceilH, floorTex, ceilTex, light, special, tag };
        }
        result.sectors = sectors;
    }

    // THINGS: 10 bytes each — x(i16), y(i16), angle(u16), type(u16), flags(u16)
    if (m.thingsIdx >= 0) {
        const tLump = wad.lumps[m.thingsIdx];
        const tCount = (tLump.size / 10) | 0;
        const things = new Array(tCount);
        for (let i = 0; i < tCount; i++) {
            const base = tLump.offset + i * 10;
            const x     = dv.getInt16(base,     true);
            const y     = dv.getInt16(base + 2, true);
            const angle = dv.getUint16(base + 4, true);
            const type  = dv.getUint16(base + 6, true);
            const flags = dv.getUint16(base + 8, true);
            things[i] = { x, y, angle, type, flags };
        }
        result.things = things;
    }

    // v382 — SEGS + SSECTORS for exact convex-polygon floor
    // reconstruction. Each subsector is a convex polygon whose edges
    // are SEGs (line segments). Segs may reference newly-introduced
    // BSP vertices beyond the original VERTEXES count; the parser
    // returns subsectors with vertex coords resolved to (x, y) pairs
    // so callers don't need to track vertex indices separately.
    //
    // SEG layout (12 bytes each):
    //   i16 v1           start vertex
    //   i16 v2           end vertex
    //   i16 angle        binary angle (not needed for poly rebuild)
    //   i16 linedef      parent linedef index
    //   i16 side         0 = right side, 1 = left side
    //   i16 offset       distance along linedef from its v1
    //
    // SSECTOR layout (4 bytes each):
    //   u16 segCount     number of consecutive SEGs that form this subsector
    //   u16 firstSeg     index of the first seg
    if (opts.full !== false && m.ssectorsIdx >= 0 && m.segsIdx >= 0) {
        const segsLump = wad.lumps[m.segsIdx];
        const ssLump   = wad.lumps[m.ssectorsIdx];
        const segCount = (segsLump.size / 12) | 0;
        const segs = new Array(segCount);
        for (let i = 0; i < segCount; i++) {
            const off = segsLump.offset + i * 12;
            segs[i] = {
                v1:      dv.getInt16(off + 0, true),
                v2:      dv.getInt16(off + 2, true),
                angle:   dv.getInt16(off + 4, true),
                linedef: dv.getInt16(off + 6, true),
                side:    dv.getInt16(off + 8, true),
                offset:  dv.getInt16(off + 10, true),
            };
        }
        result.segs = segs;

        const ssCount = (ssLump.size / 4) | 0;
        const subsectors = new Array(ssCount);
        for (let i = 0; i < ssCount; i++) {
            const off = ssLump.offset + i * 4;
            const segCount2 = dv.getUint16(off + 0, true);
            const firstSeg  = dv.getUint16(off + 2, true);
            subsectors[i] = { segCount: segCount2, firstSeg };
        }
        result.subsectors = subsectors;
    }

    // NODES — BSP tree for point-to-subsector lookup. Each node is
    // 28 bytes:
    //   i16 partX, partY        partition line origin
    //   i16 partDX, partDY      partition line direction
    //   i16 rightBox[4]          top, bottom, left, right
    //   i16 leftBox[4]
    //   u16 rightChild           low 15 bits = node/subsector index,
    //   u16 leftChild              high bit set = it's a subsector
    // The root is the LAST node in the array.
    if (opts.full !== false && m.nodesIdx >= 0) {
        const nodesLump = wad.lumps[m.nodesIdx];
        const nodeCount = (nodesLump.size / 28) | 0;
        const nodes = new Array(nodeCount);
        for (let i = 0; i < nodeCount; i++) {
            const off = nodesLump.offset + i * 28;
            nodes[i] = {
                partX:  dv.getInt16(off + 0, true),
                partY:  dv.getInt16(off + 2, true),
                partDX: dv.getInt16(off + 4, true),
                partDY: dv.getInt16(off + 6, true),
                rightChild: dv.getUint16(off + 24, true),
                leftChild:  dv.getUint16(off + 26, true),
            };
        }
        result.nodes = nodes;
        result.rootNodeIdx = nodeCount - 1;
    }

    return result;
};

// v365 — convenience: list every map name in a parsed WAD.
WAD.listMaps = function listMaps(wad) {
    return wad.maps.map(m => m.name);
};

// v365 — return a short, human-readable summary of a map. Useful for
// console pokes: WAD.dumpMap(wad, "E1M1") prints counts + bounds.
WAD.dumpMap = function dumpMap(wad, mapName) {
    const m = WAD.parseMap(wad, mapName);
    const sectorCount  = m.sectors?.length  ?? "(absent)";
    const sidedefCount = m.sidedefs?.length ?? "(absent)";
    const thingCount   = m.things?.length   ?? "(absent)";
    const playerStarts = m.things?.filter(t => t.type === 1).length ?? 0;
    return {
        name:      m.name,
        vertices:  m.vertices.length / 2,
        linedefs:  m.lines.length / 3,
        sidedefs:  sidedefCount,
        sectors:   sectorCount,
        things:    thingCount,
        playerStarts,
        bounds:    m.bounds,
    };
};

// v365 — Doom thing-type lookup for the most common types. Used by
// the voxelization round to plant the player spawn and (later) to
// place AI agents at the right thing positions.
export const THING_TYPES = {
    1:    "player1_start",
    2:    "player2_start",
    3:    "player3_start",
    4:    "player4_start",
    11:   "dm_start",
    14:   "teleport_dest",
    // Monsters (Doom 1)
    3004: "zombieman",
    9:    "shotgun_guy",
    65:   "chaingunner",
    3001: "imp",
    3002: "demon",
    3003: "baron",
    16:   "cyberdemon",
    7:    "spider_mastermind",
    // Items
    2014: "health_bonus",
    2015: "armor_bonus",
    2018: "armor",
    2019: "megaarmor",
    2011: "stimpak",
    2012: "medikit",
    8:    "backpack",
    // Weapons
    2001: "shotgun",
    2002: "chaingun",
    2003: "rocket_launcher",
    2004: "plasma_rifle",
    2005: "chainsaw",
    2006: "bfg",
    // Powerups
    2026: "computer_map",
    2024: "berserk",
    2025: "invuln",
};
