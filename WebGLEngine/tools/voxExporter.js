// FILE: tools/voxExporter.js
// MagicaVoxel .vox WRITER — the inverse of tools/voxParser.js, round-trip compatible with it.
//
// Format ref: https://github.com/ephtracy/voxel-model (vox + vox-extension). All ints little-endian.
//   header : "VOX " + version(i32, 150)
//   MAIN chunk (content 0) holding children: SIZE, XYZI, RGBA, and one MATL per emissive palette index
//   chunk  : id(4) + contentSize(i32) + childrenSize(i32) + content + children
//   SIZE   : sx, sy, sz (3 x i32)
//   XYZI   : count(i32) + (x,y,z,colorIdx) x count  (each a byte)
//   RGBA   : 256 x (r,g,b,a) bytes. Palette is 1-indexed: voxel colour index c reads palette[c]; the file stores
//            palette[1..255] in byte-entries 0..254 (the last entry is unused). This matches voxParser exactly.
//   MATL   : materialId(i32) + DICT, where DICT = numPairs(i32) + (STRING key, STRING value) x numPairs and
//            STRING = len(i32) + bytes. An emissive material is { _type:_emit, _emit:1, _flux:<power> }.

// EV-flavoured voxel KINDS. Each kind maps to a palette colour; "energy" is emissive (glows via a MATL chunk).
const VOXEL_KINDS = {
    solid:  { color: [180, 184, 196], emissive: 0 },            // neutral hull grey
    energy: { color: [70, 220, 255],  emissive: 1, flux: 4 },   // electric cyan — glows
    face:   { color: [232, 188, 152], emissive: 0 },            // warm skin tone
};

function i32(n) { return [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]; }
function fourcc(s) { return [s.charCodeAt(0), s.charCodeAt(1), s.charCodeAt(2), s.charCodeAt(3)]; }
function voxStr(s) { const b = []; for (let i = 0; i < s.length; i++) b.push(s.charCodeAt(i) & 255); return i32(b.length).concat(b); }
function voxDict(pairs) { let out = i32(pairs.length); for (const [k, v] of pairs) out = out.concat(voxStr(k), voxStr(v)); return out; }
function chunk(id, content, children) { children = children || []; return fourcc(id).concat(i32(content.length), i32(children.length), content, children); }

// Build a model from kind-tagged voxels: assign each distinct kind a palette index, build the palette + emissive list.
// voxels: [{x,y,z,kind}]  ->  { voxels:[{x,y,z,c}], palette:[[r,g,b,a]x256], emissive:[{idx,flux}], kindIndex }.
function modelFromKinds(voxels) {
    const kindIndex = {}, palette = new Array(256);
    for (let i = 0; i < 256; i++) palette[i] = [0, 0, 0, 0];
    const emissive = [], out = [];
    let next = 1;
    for (const v of voxels || []) {
        const kind = v.kind || "solid";
        if (kindIndex[kind] == null) {
            if (next > 255) throw new Error("too many voxel kinds (>255)");
            const def = VOXEL_KINDS[kind] || VOXEL_KINDS.solid;
            const idx = next++;
            kindIndex[kind] = idx;
            palette[idx] = [def.color[0], def.color[1], def.color[2], 255];
            if (def.emissive) emissive.push({ idx, flux: def.flux || 2 });
        }
        out.push({ x: v.x | 0, y: v.y | 0, z: v.z | 0, c: kindIndex[kind] });
    }
    return { voxels: out, palette, emissive, kindIndex };
}

// v3442 -- THE LIMITS BELOW ARE READ OFF THE BYTE LAYOUT, NOT CHOSEN. XYZI stores x, y, z and the colour index as
// SINGLE BYTES, so a grid can be at most 256 on a side and a coordinate at most 255; SIZE is i32 and can therefore
// DECLARE a box the XYZI encoding cannot address, which is a self-contradictory file rather than a large one.
// Colour index 0 means EMPTY in this format, so a voxel carrying it is a voxel that is not there.
const VOX_MAX_DIM = 256;   // = 2^8: one byte of coordinate, values 0..255

function badDim(n) { return !Number.isInteger(n) || n < 1 || n > VOX_MAX_DIM; }

// Export a .vox file as a Uint8Array.
// model = { sizeX, sizeY, sizeZ, voxels:[{x,y,z,c}], palette?:[[r,g,b,a]x256], emissive?:[{idx,flux}] }.
//
// *** REFUSES RATHER THAN COERCES (v3442). *** This function used to write `model.sizeX | 0`, so a caller handing it
// a model of the WRONG SHAPE -- voxelizeBall returns { size, voxels:[{x,y,z,kind}] }, not { sizeX, sizeY, sizeZ,
// voxels:[{x,y,z,c}] } -- got a file declaring a 0x0x0 grid holding 925 voxels, with every colour index silently
// `undefined & 255` = 0 = EMPTY. Both halves were plausible-looking bytes that no consumer can use, and the round
// trip through parseVox reported the positions as perfect because positions were the only thing being compared.
// A WRITER THAT TURNS A MISSING FIELD INTO A VALID-LOOKING ZERO IS THE BINARY-FORMAT VERSION OF A PLAUSIBLE SMALL
// ANSWER. The dimensions and the voxel bounds are now a contract, checked here, where the file is made.
function exportVox(model) {
    const voxels = model.voxels || [];
    const sx = model.sizeX, sy = model.sizeY, sz = model.sizeZ;
    if (badDim(sx) || badDim(sy) || badDim(sz)) {
        throw new Error(`exportVox: grid dimensions must be integers in 1..${VOX_MAX_DIM} (XYZI stores each coordinate ` +
            `in ONE BYTE); got ${sx}x${sy}x${sz}` +
            (model.size != null ? `. This model carries \`size: ${model.size}\` -- voxelizeBall/voxelizeShell return ` +
                `{ size, voxels:[{x,y,z,kind}] }, which is the input to exportVoxFromKinds(sx, sy, sz, voxels), not to exportVox.` : ""));
    }
    for (let i = 0; i < voxels.length; i++) {
        const v = voxels[i];
        if (!Number.isInteger(v.x) || !Number.isInteger(v.y) || !Number.isInteger(v.z) ||
            v.x < 0 || v.y < 0 || v.z < 0 || v.x >= sx || v.y >= sy || v.z >= sz) {
            throw new Error(`exportVox: voxel ${i} at (${v.x},${v.y},${v.z}) lies outside the declared ${sx}x${sy}x${sz} grid`);
        }
        if (!Number.isInteger(v.c) || v.c < 1 || v.c > 255) {
            throw new Error(`exportVox: voxel ${i} has colour index ${v.c}; the palette is 1-indexed and 0 means EMPTY, ` +
                `so 1..255 is the only range a present voxel can carry` +
                (v.kind !== undefined ? `. This voxel carries \`kind: "${v.kind}"\` -- run it through modelFromKinds first.` : ""));
        }
    }
    const sizeContent = i32(sx).concat(i32(sy), i32(sz));
    const xyziContent = i32(voxels.length);
    for (const v of voxels) xyziContent.push(v.x & 255, v.y & 255, v.z & 255, v.c & 255);

    let children = chunk("SIZE", sizeContent).concat(chunk("XYZI", xyziContent));

    if (model.palette) {
        const rgba = [];
        for (let i = 0; i < 256; i++) { const p = model.palette[i + 1] || [0, 0, 0, 0]; rgba.push(p[0] & 255, p[1] & 255, p[2] & 255, (p[3] == null ? 255 : p[3]) & 255); }
        children = children.concat(chunk("RGBA", rgba));
    }
    for (const e of (model.emissive || [])) {
        const content = i32(e.idx).concat(voxDict([["_type", "_emit"], ["_emit", "1"], ["_flux", String(e.flux || 2)]]));
        children = children.concat(chunk("MATL", content));
    }

    const main = chunk("MAIN", [], children);
    return Uint8Array.from(fourcc("VOX ").concat(i32(150), main));
}

// Convenience: kind-tagged voxels straight to .vox bytes.
function exportVoxFromKinds(sizeX, sizeY, sizeZ, voxels) {
    const m = modelFromKinds(voxels);
    return exportVox({ sizeX, sizeY, sizeZ, voxels: m.voxels, palette: m.palette, emissive: m.emissive });
}

// Voxelize a solid ball into kind-tagged voxels, centred in a (2r+1)^3 grid. Voxels within `coreR` of the centre are
// tagged "energy" (a glowing core); the rest "solid". Pure -> testable. Returns { size, voxels:[{x,y,z,kind}] }.
function voxelizeBall(radius, coreR = 0) {
    radius = Math.max(1, radius | 0); coreR = Math.max(0, coreR);
    const n = radius * 2 + 1, c = radius, voxels = [];
    for (let z = 0; z < n; z++) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const dx = x - c, dy = y - c, dz = z - c, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d <= radius + 0.001) voxels.push({ x, y, z, kind: d <= coreR ? "energy" : "solid" });
    }
    return { size: n, voxels };
}

// Voxelize a HOLLOW ball: an outer shell of "solid" voxels (one `thickness` layer thick) around a solid "energy" core,
// with an empty gap between them. Pure -> testable. The gap means the glowing core shows through the shell's seams when
// rendered with sub-unit cubes - the look the EV dock uses. Returns { size, voxels:[{x,y,z,kind}] }.
function voxelizeShell(radius, coreR = 0, thickness = 1) {
    radius = Math.max(1, radius | 0); coreR = Math.max(0, coreR); thickness = Math.max(1, thickness);
    const n = radius * 2 + 1, c = radius, voxels = [];
    for (let z = 0; z < n; z++) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const dx = x - c, dy = y - c, dz = z - c, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d <= coreR) voxels.push({ x, y, z, kind: "energy" });                                  // solid glowing core
        else if (d <= radius + 0.001 && d > radius - thickness) voxels.push({ x, y, z, kind: "solid" });  // outer shell
    }
    return { size: n, voxels };
}

export { VOXEL_KINDS, modelFromKinds, exportVox, exportVoxFromKinds, voxelizeBall, voxelizeShell, VOX_MAX_DIM };
