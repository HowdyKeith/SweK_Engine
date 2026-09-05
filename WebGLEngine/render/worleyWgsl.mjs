// WebGLEngine/render/worleyWgsl.mjs -- v4480 (git terrain, step 2)
//
// *** THE WORLEY BIOME FIELD AS A COMPUTE PASS, WITH world/worleyBiomes.js AS ITS TWIN. *** The voxel world has
// classified its ground by Worley cells since v2779: jittered feature points on a grid, a (heat, moisture) climate
// per cell from value noise, a Whittaker lookup to one of eight biomes, and a blend toward the second-nearest cell
// near a border (F2 - F1). That module is pure integer hashing and a little float arithmetic, feature-flagged off
// in the voxel world and never on a device. This kernel evaluates the same function per texel of a terrain field
// and writes, for every texel, the primary biome, the secondary biome and the blend -- the two channels the height
// field of render/gpuTerrain.mjs had free, filled by the GPU.
//
// THE TWIN IS ONE IMPLEMENTATION WITH ONE ROUNDING KNOB (the shape tools/roundhouse/hmcGpu.mjs and physics/xpbd/
// xpbdWgsl.mjs settled on): biomeFlat(x, z, seed, opts, R) with R the identity is worleyBiomes.js's biomeAt to the
// bit in f64 -- the gate pins it over thousands of samples -- and with R = Math.fround it is what the kernel
// computes, operation for operation. So the claim on the device is BIT IDENTITY of the biome ids and the packed
// bytes against the f32 knob, and the f32 knob's disagreement with the shipped f64 solver is COUNTED, not hidden:
// it can only happen where two feature points tie to within f32 rounding, which is a set of measure zero the gate
// reports by number. The integer half (the hashes) is exact on both sides by construction: Math.imul, logical
// shifts and xor are u32 arithmetic in both languages.
//
// THE SEED IS THE BODY'S. world/orrerySeed.mjs folds the commit that brought a vendored body in with its name, so
// the biome map of a body's ground is a fact about that commit; the same body lands with the same climates on every
// machine. The per-extension biome world/repoHeightfield.js assigns (a language per file) is a different layer and
// travels in the field's ALPHA channel from the CPU, so a consumer can colour by either.
//
// NOT CLAIMED: the voxel materials worleyBiomes chooses (surface, sub), altitude cooling, and any biome the eight
// do not name.
"use strict";
import { biomeAt, BIOMES, classify } from "../world/worleyBiomes.js";

export const UNIFORM_FLOATS = 8;
export const OUT_PER_TEXEL = 2;   // (packed ids + blend byte) then the blend itself, per texel
export const DEFAULTS = Object.freeze({ cellScale: 2, borderBand: 0.18 });

/** The biome table by id, and the id by key, from the shipped module -- never retyped. */
export const BIOME_IDS = Object.freeze(Object.fromEntries(Object.entries(BIOMES).map(([k, v]) => [k, v.id])));
export const BIOME_BY_ID = Object.freeze(Object.fromEntries(Object.entries(BIOMES).map(([k, v]) => [v.id, k])));

export function worleyWgsl() {
    return `
struct U { originX: f32, originZ: f32, extent: f32, cellScale: f32, borderBand: f32, size: f32, seed: u32, pad: u32 };
@group(0) @binding(0) var<storage, read_write> out: array<f32>;
@group(0) @binding(1) var<uniform> u: U;

// world/worleyBiomes.js _hash, in u32: imul is wrapping multiply, >>> is a logical shift, ^ is xor -- exact on both sides
fn hashU(ix: i32, iz: i32, seed: u32) -> u32 {
  var h: u32 = (u32(ix) * 374761393u) ^ (u32(iz) * 668265263u) ^ (seed * 982451653u);
  h = (h ^ (h >> 13u)) * 1274126177u;
  h = h ^ (h >> 16u);
  return h;
}
fn hashF(ix: i32, iz: i32, seed: u32) -> f32 { return f32(hashU(ix, iz, seed)) / 4294967295.0; }
fn valueNoise(x: f32, z: f32, seed: u32) -> f32 {
  let x0 = floor(x); let z0 = floor(z); let fx = x - x0; let fz = z - z0;
  let uu = fx * fx * (3.0 - 2.0 * fx); let vv = fz * fz * (3.0 - 2.0 * fz);
  let ix = i32(x0); let iz = i32(z0);
  let h00 = hashF(ix, iz, seed); let h10 = hashF(ix + 1, iz, seed);
  let h01 = hashF(ix, iz + 1, seed); let h11 = hashF(ix + 1, iz + 1, seed);
  let a = h00 * (1.0 - uu) * (1.0 - vv); let b = h10 * uu * (1.0 - vv); let c = h01 * (1.0 - uu) * vv; let d = h11 * uu * vv;
  return ((a + b) + c) + d;
}
// classify(heat, moisture): the Whittaker lookup, returning the table's id
fn classifyId(heat: f32, moisture: f32) -> u32 {
  if (heat < 0.25) { if (moisture < 0.40) { return 1u; } return 2u; }
  if (heat < 0.50) { if (moisture < 0.35) { return 3u; } if (moisture < 0.70) { return 4u; } return 5u; }
  if (heat < 0.75) { if (moisture < 0.30) { return 6u; } if (moisture < 0.60) { return 7u; } return 5u; }
  if (moisture < 0.35) { return 6u; } if (moisture < 0.65) { return 7u; } return 8u;
}
fn biomeForCell(cx: i32, cz: i32, seed: u32) -> u32 {
  let heat = valueNoise(f32(cx) * 0.35, f32(cz) * 0.35, seed);
  let moisture = valueNoise(f32(cx) * 0.35 + 41.7, f32(cz) * 0.35 + 17.3, seed ^ 0x5a5a5a5au);
  return classifyId(heat, moisture);
}

@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) g: vec3<u32>) {
  let i = g.x;
  let n = u32(u.size) * u32(u.size);
  if (i >= n) { return; }
  let tx = i % u32(u.size); let tz = i / u32(u.size);
  let x = u.originX + (f32(tx) + 0.5) / u.size * u.extent;
  let z = u.originZ + (f32(tz) + 0.5) / u.size * u.extent;
  let seedB = u.seed ^ 0x9e3779b9u;
  let gx = i32(floor(x / u.cellScale)); let gz = i32(floor(z / u.cellScale));
  var f1 = 1e30; var f2 = 1e30; var cx1 = 0; var cz1 = 0; var cx2 = 0; var cz2 = 0;
  for (var dj = -1; dj <= 1; dj = dj + 1) { for (var di = -1; di <= 1; di = di + 1) {
    let cx = gx + di; let cz = gz + dj;
    let jx = (f32(cx) + hashF(cx, cz, u.seed)) * u.cellScale;
    let jz = (f32(cz) + hashF(cx, cz, seedB)) * u.cellScale;
    let dx = x - jx; let dz = z - jz; let d = sqrt(dx * dx + dz * dz);
    if (d < f1) { f2 = f1; cx2 = cx1; cz2 = cz1; f1 = d; cx1 = cx; cz1 = cz; }
    else if (d < f2) { f2 = d; cx2 = cx; cz2 = cz; }
  } }
  let id1 = biomeForCell(cx1, cz1, u.seed);
  let id2 = biomeForCell(cx2, cz2, u.seed);
  let band = u.borderBand * u.cellScale;
  let t = clamp((f2 - f1) / band, 0.0, 1.0);
  let blend = 0.5 * (1.0 - t);
  let bb = u32(floor(blend * 255.0 + 0.5));
  out[2u * i] = f32(id1 * 65536u + id2 * 256u + bb);
  out[2u * i + 1u] = blend;
}
`;
}
export const WORLEY_WGSL = worleyWgsl();

/** The uniform block: six f32 then the seed as u32 bits, 32 bytes. */
export function packWorleyUniforms({ originX = -4, originZ = -4, extent = 8, cellScale = DEFAULTS.cellScale, borderBand = DEFAULTS.borderBand, size = 64, seed = 1 } = {}) {
    const buf = new ArrayBuffer(UNIFORM_FLOATS * 4), dv = new DataView(buf);
    [originX, originZ, extent, cellScale, borderBand, size].forEach((v, k) => dv.setFloat32(4 * k, v, true));
    dv.setUint32(24, seed >>> 0, true); dv.setUint32(28, 0, true);
    return new Float32Array(buf);
}

// ---- the flat twin: one implementation, one rounding knob ------------------------------------------------------
const hashU = (ix, iz, seed) => { let h = (Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(seed, 982451653)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h = h ^ (h >>> 16); return h >>> 0; };
function valueNoiseFlat(x, z, seed, R) {
    const x0 = Math.floor(x), z0 = Math.floor(z), fx = R(x - x0), fz = R(z - z0);
    const uu = R(R(fx * fx) * R(3 - R(2 * fx))), vv = R(R(fz * fz) * R(3 - R(2 * fz)));
    const hf = (ix, iz) => R(R(hashU(ix, iz, seed)) / R(4294967295));
    const h00 = hf(x0, z0), h10 = hf(x0 + 1, z0), h01 = hf(x0, z0 + 1), h11 = hf(x0 + 1, z0 + 1);
    const a = R(R(h00 * R(1 - uu)) * R(1 - vv)), b = R(R(h10 * uu) * R(1 - vv)), c = R(R(h01 * R(1 - uu)) * vv), d = R(R(h11 * uu) * vv);
    return R(R(R(a + b) + c) + d);
}
function biomeForCellFlat(cx, cz, seed, R) {
    const heat = valueNoiseFlat(R(cx * R(0.35)), R(cz * R(0.35)), seed, R);
    const moisture = valueNoiseFlat(R(R(cx * R(0.35)) + R(41.7)), R(R(cz * R(0.35)) + R(17.3)), (seed ^ 0x5a5a5a5a) >>> 0, R);
    return BIOME_IDS[classify(heat, moisture)];
}
/**
 * The kernel's arithmetic for one point, in the same operation order. R = (v) => v is the f64 reference (pinned to
 * worleyBiomes.biomeAt by the gate); R = Math.fround is the kernel.
 * @returns { id1, id2, blend, blendByte, packed, f1, f2 }
 */
export function biomeFlat(x, z, seed, { cellScale = DEFAULTS.cellScale, borderBand = DEFAULTS.borderBand } = {}, R = (v) => v) {
    const S = seed >>> 0, seedB = (S ^ 0x9e3779b9) >>> 0;
    const gx = Math.floor(R(x / cellScale)), gz = Math.floor(R(z / cellScale));
    let f1 = Infinity, f2 = Infinity, cx1 = 0, cz1 = 0, cx2 = 0, cz2 = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const cx = gx + di, cz = gz + dj;
        const jx = R(R(cx + R(R(hashU(cx, cz, S)) / R(4294967295))) * cellScale);
        const jz = R(R(cz + R(R(hashU(cx, cz, seedB)) / R(4294967295))) * cellScale);
        const dx = R(x - jx), dz = R(z - jz), d = R(Math.sqrt(R(R(dx * dx) + R(dz * dz))));
        if (d < f1) { f2 = f1; cx2 = cx1; cz2 = cz1; f1 = d; cx1 = cx; cz1 = cz; }
        else if (d < f2) { f2 = d; cx2 = cx; cz2 = cz; }
    }
    const id1 = biomeForCellFlat(cx1, cz1, S, R), id2 = biomeForCellFlat(cx2, cz2, S, R);
    const band = R(borderBand * cellScale);
    const t = Math.max(0, Math.min(1, R(R(f2 - f1) / band)));
    const blend = R(0.5 * R(1 - t));
    const blendByte = Math.floor(R(R(blend * 255) + 0.5));
    return { id1, id2, blend, blendByte, packed: id1 * 65536 + id2 * 256 + blendByte, f1, f2 };
}

/** The texel's world point, the kernel's way: origin + (t + 0.5) / size * extent, under the knob. */
export function texelPoint(tx, tz, { originX, originZ, extent, size }, R = (v) => v) {
    return [R(originX + R(R(R(tx + 0.5) / size) * extent)), R(originZ + R(R(R(tz + 0.5) / size) * extent))];
}

/** The whole field on the CPU, as the kernel lays it out: [packed, blend] per texel, row-major. */
export function fieldCpu(params, R = (v) => v) {
    const p = { originX: -4, originZ: -4, extent: 8, size: 64, seed: 1, ...params };
    const n = p.size * p.size, out = new Float32Array(n * OUT_PER_TEXEL);
    for (let tz = 0; tz < p.size; tz++) for (let tx = 0; tx < p.size; tx++) {
        const [x, z] = texelPoint(tx, tz, p, R);
        const b = biomeFlat(x, z, p.seed, p, R);
        out[(tz * p.size + tx) * 2] = b.packed; out[(tz * p.size + tx) * 2 + 1] = b.blend;
    }
    return out;
}
/** The f32 twin, the one the device is held to bit for bit. */
export const fieldCpuF32 = (params) => fieldCpu(params, Math.fround);
/** The shipped module's own answer at a point, for the pin. */
export function shippedAt(x, z, seed, { cellScale = DEFAULTS.cellScale, borderBand = DEFAULTS.borderBand } = {}) {
    const r = biomeAt(x, z, seed >>> 0, { cellScale, borderBand });
    return { id1: BIOME_IDS[r.primary], id2: BIOME_IDS[r.secondary], blend: r.blend };
}
export function unpack(v) { const p = Math.round(v); return { id1: (p >>> 16) & 255, id2: (p >>> 8) & 255, blendByte: p & 255 }; }

/**
 * Write a packed field into an RGBA8 terrain field: green = primary * 16 + secondary (both ids are 1..8, so the byte
 * holds both and the fragment can lerp their colours), blue = the blend byte, alpha = the caller's layer (the treemap's
 * language biome + 1, so 0 means "no layer" and 1 the lake bed) -- the bytes render/gpuTerrain.mjs's looks read.
 */
export function paintField(field, packed, alphaOf = null) {
    const n = field.width * field.height;
    if (packed.length !== n * OUT_PER_TEXEL) throw new Error(`worleyWgsl: ${packed.length / OUT_PER_TEXEL} texels of biome for a ${field.width}x${field.height} field`);
    for (let i = 0; i < n; i++) { const u = unpack(packed[2 * i]); field.data[i * 4 + 1] = u.id1 * 16 + u.id2; field.data[i * 4 + 2] = u.blendByte; field.data[i * 4 + 3] = alphaOf ? (alphaOf(i) & 255) : 0; }
    return field;
}
/** The green byte back into its two ids. */
export function unpackGreen(g) { return { id1: Math.floor(g / 16), id2: g % 16 }; }

/**
 * Paint a landing's field with its biomes: the kernel through gfx/device.js on WebGPU, the f32 twin elsewhere -- the
 * two agree bit for bit (the gate's claim), so a page reads one picture whichever ran. Returns { path, params }.
 */
export async function paintBiomes(device, bt, { seed = 1, cellScale = null, borderBand = DEFAULTS.borderBand } = {}) {
    const p = { originX: bt.params.originX, originZ: bt.params.originZ, extent: bt.params.extent, size: bt.field.width,
                cellScale: cellScale == null ? bt.params.extent / 4 : cellScale, borderBand, seed: seed >>> 0 };
    const alphaOf = bt.repo && bt.repo.biomes ? (i) => bt.repo.biomes[i] + 1 : null;   // + 1: alpha 0 is "no language layer", 1 the lake bed
    if (device && device.backend === "webgpu" && typeof device.compute === "function") {
        const { runCompute } = await import("./computeRun.mjs");
        const n = p.size * p.size;
        const r = await runCompute(device, { code: WORLEY_WGSL, workgroups: Math.ceil(n / 64),
                                             buffers: { u: { data: packWorleyUniforms(p), usage: "uniform" }, out: { size: n * OUT_PER_TEXEL * 4 } }, read: ["out"] });
        paintField(bt.field, new Float32Array(r.out), alphaOf);
        return { path: "compute", params: p };
    }
    paintField(bt.field, fieldCpuF32(p), alphaOf);
    return { path: "cpu", params: p };
}

/** The manifest, per docs/GPU-KERNEL-CONTRACT.md: the f32 twin is the claim, bit for bit. */
export const PROBE_ARGS = Object.freeze({ originX: -4, originZ: -4, extent: 8, cellScale: 2, borderBand: 0.18, size: 64, seed: 0x5eed1234 });
export const PROBES = Object.freeze([Object.freeze({
    id: "worleyWgsl.worleyWgsl", code: () => worleyWgsl(), entryPoint: "main",
    args: PROBE_ARGS, pack: packWorleyUniforms, cpu: fieldCpuF32, outCount: 64 * 64 * OUT_PER_TEXEL, workgroups: 64,
    // MEASURED at v4480 on Dawn/SwiftShader: the packed element (ids and the blend byte) identical on 4,096 of 4,096 texels; the raw
    // blend identical on 3,686 and within 5.4e-7 on the rest -- one f32 ulp of a value under 0.5, the device's sqrt or division
    // rounding a hair differently from V8's. The tolerance is that floor doubled; the gate holds the packed half to the bit.
    tol: 1e-6,
    key: () => ({ ids: "world/worleyBiomes.js biomeAt, pinned to the f64 knob by tools/ship/worleyDevice-selfcheck.mjs", biomes: Object.keys(BIOMES).length }),
})]);
