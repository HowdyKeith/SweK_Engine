#!/usr/bin/env node
// WebGLEngine/tools/ship/erosionMeasure-selfcheck.mjs -- v4482
//
// *** EROSION MEASURED BEFORE ANY PORT, AND THE MEASUREMENT IS THE REASON THERE IS NO PORT. *** The fourth step of
// the git terrain (docs/TSL-ROADMAP.md step 10) asked whether world/erosion.js's hydraulic and thermal passes are a
// render/stepLoop.mjs candidate -- two heightfields ping-ponged N steps, one readback, held to the CPU erosion per
// texel at a stated tolerance. This gate holds the numbers that answer it, so the answer cannot drift into an
// opinion, and it holds the decision record (tools/ship/todo.mjs, the roadmap) to those numbers.
//
// WHAT IT MEASURES (this box, v4482; the timings are REPORTED, the shapes are HELD):
//   cost      a 160x160 padded tile on the synthetic base: fill 1.9 / hydraulic 3.0 / thermal 2.4 ms, median of 6;
//             on the engine's own generator 12.3 ms per tile in JavaScript and 8.3 ms in the WASM crate (1.5x),
//             while the shipped path prewarms a tile in 3 ms slices, one tile per 128 voxels of travel.
//   determinism   two fresh caches agree on 25,600 of 25,600 cells.
//   sensitivity   one cell moved by one f32 ulp changes 1 cell within 1 cell of it; by half a voxel, 2 cells.
//             EVERY cell moved by one f32 ulp changes 25,120 of 25,600 (max 1.2151 voxels, 5 cells by a voxel or
//             more) -- the "ulp-chaos" world/world.js's tile-ownership rule is written for, measured; every cell
//             moved by one f64 ulp changes NOTHING, because the field is a Float32Array and swallows it.
//   sequence  the thermal pass is Gauss-Seidel (each cell reads the cells already moved this iteration); the
//             Jacobi pass a parallel dispatch computes differs from it on 2,678 cells (max 0.0911 voxels). The
//             hydraulic pass is 1,500 droplets in RNG order: 6,485 of the 13,162 cells it touches are written by
//             two or more droplets, and running the same droplets in reverse order moves 12,393 cells, up to
//             2.4319 voxels. *** A DEVICE PASS IS THEREFORE A DIFFERENT ALGORITHM, NOT A PORT: *** no tolerance
//             short of voxels holds it to world/erosion.js, and a twin that differs by voxels is a THIRD generator
//             under a rule that already forbids mixing two inside one tile.
//   wasm      the crate's erosion runs its heights in f64 and stores f32 at extract; on one tile its eroded columns
//             differ from the JavaScript's on 1,207 of 16,384 (max 2 voxels) -- inside tools/terrain-parity.mjs's
//             own "ulp-chaos can explain" bound (max 3), and the same order as the whole-field ulp figure above.
//             The comparison runs only where cargo has built the crate for wasm32 (never committed: the crate's
//             target/ is ignored, as vendor/box3d/native/ is); elsewhere the section reports that and passes.
//
// THE DECISION, WITH THE NUMBERS BESIDE IT: won't-do-yet, in todo.mjs as `erosion-device-port`. A tile costs a
// frame's worth of milliseconds once per 128 voxels and is already sliced under a 3 ms budget, so there is no
// cost to remove; the passes are sequential, so a kernel could not be held to them; and nothing on the device
// consumes an eroded field yet -- the voxel world fills chunks on the CPU, so a device pass would be a compute
// plus a readback that the JavaScript already does in 12 ms. RE-OPEN when a device consumer exists (the orrery
// landing's terrain is the natural one) -- and then as a Jacobi pass gated to ITSELF in f32 under the contract,
// not as a twin of this file.
//
// SABOTAGE (v4482): A  todo.mjs's entry set to status "open"                      -> exit=1, red: section 6, the decision row
//                   B  the gate's own Jacobi twin written in place (made sequential)  -> exit=1, red: "the Jacobi pass differs"
//                   C  the gate's copy of the droplet loop with EROSION_RATE 0.31     -> exit=1, red: "the copied loop IS the shipped pass"
//
// Run: node tools/ship/erosionMeasure-selfcheck.mjs      (~1 s; ~4 s where the wasm crate is built)
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ErosionCache } from "../../world/erosion.js";
import { TODO } from "./todo.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (c, name, detail) => {
    console.log(`  ${c ? "PASS" : "FAIL"}${c ? "  " : "  !! "}${name}${detail ? "   " + detail : ""}`);
    if (!c) fails++;
};
const report = (name, detail) => console.log(`  ----  ${name}   ${detail}`);
const sec = (t) => console.log("\n" + t);
const read = (f) => fs.readFileSync(path.join(ENG, f), "utf8");
const median = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
const ms = (t) => t.toFixed(1) + " ms";

// The shipped shape, read from the source so a retuned constant moves these numbers with it.
const src = read("world/erosion.js");
const constant = (name) => Number((src.match(new RegExp("const " + name + "\\s*=\\s*([\\d.]+)")) || [])[1]);
const N_PARTICLES = constant("HYDRAULIC_PARTICLES"), MAX_STEPS = constant("PARTICLE_MAX_STEPS"), THERMAL_ITERS = constant("THERMAL_ITERATIONS");
const TILE = constant("TILE_SIZE"), PADDING = constant("PADDING"), W = TILE + PADDING * 2, CELLS = W * W;
const INERTIA = constant("PARTICLE_INERTIA"), CAP_K = constant("SEDIMENT_CAPACITY_K"), MIN_SLOPE = constant("MIN_SLOPE");
const EROSION_RATE = constant("EROSION_RATE"), DEPOSITION_RATE = constant("DEPOSITION_RATE"), EVAPORATION = constant("EVAPORATION_RATE");
const TALUS = constant("TALUS_ANGLE"), TRANSFER = constant("THERMAL_TRANSFER");

// A synthetic base: three waves, no noise tables, so the measurement is of the EROSION and not of the generator.
const base = (wx, wz) => 40 + 6 * Math.sin(wx * 0.05) * Math.cos(wz * 0.037) + 3 * Math.sin(wx * 0.21 + wz * 0.17) + 1.5 * Math.cos(wx * 0.6 - wz * 0.45);
const TX = 2, TZ = 5;
/** Run the three phases on a fresh cache; returns { heights, fill, hyd, therm } with the phase times. */
function erode(fn, tx = TX, tz = TZ) {
    const c = new ErosionCache(fn), ctx = c._newTileCtx(tx, tz);
    const t0 = performance.now(); c._stepFill(ctx, 1e9);
    const t1 = performance.now(); c._stepHydraulic(ctx, 1e9);
    const t2 = performance.now(); c._stepThermal(ctx, 1e9);
    const t3 = performance.now();
    return { heights: ctx.heights, fill: t1 - t0, hyd: t2 - t1, therm: t3 - t2 };
}
/** Compare two fields: cells that differ, the largest difference, cells off by a voxel or more, the farthest changed cell from (cx, cz). */
function diff(a, b, cx = -1, cz = -1) {
    let changed = 0, max = 0, voxel = 0, far = 0;
    for (let i = 0; i < a.length; i++) {
        const d = Math.abs(a[i] - b[i]);
        if (d > 0) { changed++; if (cx >= 0) far = Math.max(far, Math.hypot(i % W - cx, Math.floor(i / W) - cz)); }
        if (d > max) max = d;
        if (d >= 1) voxel++;
    }
    return { changed, max, voxel, far };
}

// ---------------------------------------------------------------------------------------------------------
sec("1. THE SHIPPED SHAPE: what one tile runs, read from world/erosion.js and mirrored by the crate");
// ---------------------------------------------------------------------------------------------------------
ok(N_PARTICLES === 1500 && MAX_STEPS === 30 && THERMAL_ITERS === 3 && W === 160,
   "one tile is 1,500 droplets of up to 30 steps, then 3 thermal iterations over 160 x 160 padded cells",
   `${N_PARTICLES} x ${MAX_STEPS} droplet steps at most, ${THERMAL_ITERS} iterations, ${CELLS} cells`);
ok(/_stepFill\(ctx, 16\)/.test(src) && /_stepHydraulic\(ctx, 120\)/.test(src) && /_stepThermal\(ctx, 1\)/.test(src) && /budgetMs = 3/.test(src),
   "and the shipped path already slices it: 16 rows, 120 droplets or 1 iteration per slice under a 3 ms prewarm budget",
   "ErosionCache.prewarm -- the hitch the port would remove is already removed");
{
    const rust = read("wasm-terrain/src/lib.rs");
    const rc = (name) => Number((rust.match(new RegExp("const " + name + ":\\s*\\w+\\s*=\\s*([\\d.]+)")) || [])[1]);
    ok(rc("HYDRAULIC_PARTICLES") === N_PARTICLES && rc("THERMAL_ITERATIONS") === THERMAL_ITERS && rc("TALUS_ANGLE") === TALUS && rc("THERMAL_TRANSFER") === TRANSFER,
       "the WASM crate runs the same counts and talus constants", "wasm-terrain/src/lib.rs");
    ok(/let mut heights = fill_base_heights\(/.test(rust) && /-> Vec<f64>/.test(rust.slice(rust.indexOf("fn fill_base_heights"))) && /new Float32Array\(PADDED \* PADDED\)/.test(src),
       "but erodes an f64 field where the JavaScript erodes a Float32Array -- the two are not one arithmetic even before libm",
       "fill_base_heights -> Vec<f64>; ctx.heights = new Float32Array");
}

// ---------------------------------------------------------------------------------------------------------
sec("2. COST: the three phases on the synthetic base, median of 6 tiles (reported, not held)");
// ---------------------------------------------------------------------------------------------------------
const runs = []; for (let k = 0; k < 6; k++) runs.push(erode(base, k, 3));
const fill = median(runs.map((r) => r.fill)), hyd = median(runs.map((r) => r.hyd)), therm = median(runs.map((r) => r.therm));
report("fill / hydraulic / thermal", `${ms(fill)} / ${ms(hyd)} / ${ms(therm)}   (v4482 on the build box: 1.9 / 3.0 / 2.4)`);
ok(Number.isFinite(fill + hyd + therm) && fill + hyd + therm < 250,
   "one tile costs milliseconds, not frames: under 250 ms on any box this runs on (the ceiling is thirty times the measurement)",
   `${ms(fill + hyd + therm)} per tile, once per ${TILE} voxels of travel`);

// ---------------------------------------------------------------------------------------------------------
sec("3. DETERMINISM: two fresh caches, the same tile");
// ---------------------------------------------------------------------------------------------------------
const A = erode(base).heights, B = erode(base).heights;
{
    const d = diff(A, B);
    ok(d.changed === 0, `two runs agree on every cell`, `${CELLS - d.changed} of ${CELLS} identical`);
}

// ---------------------------------------------------------------------------------------------------------
sec("4. SENSITIVITY: one cell moved, then every cell moved -- the ulp-chaos the tile-ownership rule is written for");
// ---------------------------------------------------------------------------------------------------------
{
    const CX = TX * TILE + 70, CZ = TZ * TILE + 70, lx = CX - (TX * TILE - PADDING), lz = CZ - (TZ * TILE - PADDING);
    const F32_ULP = 2 ** -23, F64_ULP = 2 ** -52;
    const at = (delta) => (wx, wz) => (wx === CX && wz === CZ) ? delta(base(wx, wz)) : base(wx, wz);
    const one = diff(A, erode(at((h) => h * (1 + F32_ULP))).heights, lx, lz);
    ok(one.changed <= 2 && one.far <= 1.5, "one cell moved by one f32 ulp: the change stays within one cell of it",
       `${one.changed} cell(s) changed, farthest ${one.far.toFixed(1)} away, max ${one.max.toExponential(2)} voxels`);
    const half = diff(A, erode(at((h) => h + 0.5)).heights, lx, lz);
    ok(half.changed <= 4 && half.far <= 2, "one cell moved by half a voxel: still local",
       `${half.changed} cell(s) changed, farthest ${half.far.toFixed(1)} away, max ${half.max.toFixed(4)} voxels`);
    const all32 = diff(A, erode((wx, wz) => base(wx, wz) * (1 + F32_ULP)).heights);
    ok(all32.changed > 0.9 * CELLS && all32.max >= 1,
       "*** every cell moved by one f32 ulp: most of the tile moves, some of it by a voxel -- the chaos is real ***",
       `${all32.changed} of ${CELLS} differ, max ${all32.max.toFixed(4)} voxels, ${all32.voxel} cell(s) by a voxel or more`);
    const all64 = diff(A, erode((wx, wz) => base(wx, wz) * (1 + F64_ULP)).heights);
    ok(all64.changed === 0, "every cell moved by one f64 ulp: nothing moves, because the field is a Float32Array and rounds it away",
       `${all64.changed} differ -- so the chaos lives at f32, which is where a device field would live too`);
}

// ---------------------------------------------------------------------------------------------------------
sec("5. SEQUENCE: both passes depend on their order, so a parallel pass is another algorithm");
// ---------------------------------------------------------------------------------------------------------
{
    // The post-hydraulic field, then the shipped thermal pass beside a Jacobi pass (every cell reads the PREVIOUS
    // iteration's field), which is what one dispatch per iteration computes.
    const c = new ErosionCache(base), ctx = c._newTileCtx(4, 4); c._stepFill(ctx, 1e9); c._stepHydraulic(ctx, 1e9);
    const pre = Float32Array.from(ctx.heights);
    const seq = Float32Array.from(pre); c._stepThermal({ heights: seq, thermIter: 0, phase: 2 }, 1e9);
    let jac = Float32Array.from(pre);
    for (let it = 0; it < THERMAL_ITERS; it++) {
        const next = Float32Array.from(jac);
        for (let z = 1; z < W - 1; z++) for (let x = 1; x < W - 1; x++) {
            const i = x + z * W, h = jac[i];
            let lo = h, li = -1;
            for (const ni of [i - 1, i + 1, i - W, i + W]) if (jac[ni] < lo) { lo = jac[ni]; li = ni; }
            if (li < 0) continue;
            const dh = h - lo;
            if (dh > TALUS) { const mv = (dh - TALUS) * TRANSFER * 0.5; next[i] -= mv; next[li] += mv; }
        }
        jac = next;
    }
    const moved = diff(pre, seq).changed, tj = diff(seq, jac);
    ok(moved > 1000, "the thermal pass does work on this tile", `${moved} cells moved by the shipped (Gauss-Seidel) pass`);
    ok(tj.changed > 1000, "*** the Jacobi pass a dispatch computes differs from the shipped pass on thousands of cells ***",
       `${tj.changed} cells differ, max ${tj.max.toFixed(4)} voxels -- same constants, same field, different algorithm`);

    // The droplet loop, copied so the spawn order can be chosen: first shown to BE the shipped pass, then reversed.
    const PAD = 2, xMax = W - PAD - 1, zMax = W - PAD - 1;
    const droplets = (heights, spawns) => {
        for (const [sx, sz] of spawns) {
            let px = sx, pz = sz, vx = 0, vz = 0, water = 1.0, sediment = 0;
            for (let step = 0; step < MAX_STEPS; step++) {
                const cx = Math.floor(px), cz = Math.floor(pz); if (cx < PAD || cx > xMax || cz < PAD || cz > zMax) break;
                const fx = px - cx, fz = pz - cz, i = cx + cz * W;
                const h00 = heights[i], h10 = heights[i + 1], h01 = heights[i + W], h11 = heights[i + W + 1];
                const dhdx = (h10 - h00) * (1 - fz) + (h11 - h01) * fz, dhdz = (h01 - h00) * (1 - fx) + (h11 - h10) * fx;
                vx = vx * INERTIA + (-dhdx) * (1 - INERTIA); vz = vz * INERTIA + (-dhdz) * (1 - INERTIA);
                const speedSq = vx * vx + vz * vz; if (speedSq < 1e-8) break;
                const speed = Math.sqrt(speedSq); vx /= speed; vz /= speed;
                const npx = px + vx, npz = pz + vz, ncx = Math.floor(npx), ncz = Math.floor(npz);
                if (ncx < PAD || ncx > xMax || ncz < PAD || ncz > zMax) break;
                const nfx = npx - ncx, nfz = npz - ncz, ni = ncx + ncz * W;
                const newH = heights[ni] * (1 - nfx) * (1 - nfz) + heights[ni + 1] * nfx * (1 - nfz) + heights[ni + W] * (1 - nfx) * nfz + heights[ni + W + 1] * nfx * nfz;
                const oldH = h00 * (1 - fx) * (1 - fz) + h10 * fx * (1 - fz) + h01 * (1 - fx) * fz + h11 * fx * fz;
                const dh = newH - oldH, cap = Math.max(MIN_SLOPE, -dh) * speed * water * CAP_K;
                if (sediment > cap || dh > 0) {
                    const d = (dh > 0) ? Math.min(dh, sediment) : (sediment - cap) * DEPOSITION_RATE; sediment -= d;
                    heights[i] += d * (1 - fx) * (1 - fz); heights[i + 1] += d * fx * (1 - fz); heights[i + W] += d * (1 - fx) * fz; heights[i + W + 1] += d * fx * fz;
                } else {
                    const e = Math.min((cap - sediment) * EROSION_RATE, -dh); sediment += e;
                    heights[i] -= e * (1 - fx) * (1 - fz); heights[i + 1] -= e * fx * (1 - fz); heights[i + W] -= e * (1 - fx) * fz; heights[i + W + 1] -= e * fx * fz;
                }
                px = npx; pz = npz; water *= (1 - EVAPORATION); if (water < 0.01) break;
            }
        }
        return heights;
    };
    const c1 = new ErosionCache(base), ctx1 = c1._newTileCtx(TX, TZ); c1._stepFill(ctx1, 1e9);
    const flat = Float32Array.from(ctx1.heights);
    const spawns = []; for (let p = 0; p < N_PARTICLES; p++) { const px = PAD + ctx1.rng() * (W - PAD * 2 - 1), pz = PAD + ctx1.rng() * (W - PAD * 2 - 1); spawns.push([px, pz]); }
    const c2 = new ErosionCache(base), ctx2 = c2._newTileCtx(TX, TZ); c2._stepFill(ctx2, 1e9); c2._stepHydraulic(ctx2, 1e9);
    const fwd = droplets(Float32Array.from(flat), spawns);
    const twin = diff(fwd, ctx2.heights);
    ok(twin.changed === 0, "CONTROL: the copied loop IS the shipped pass -- identical on every cell from the same spawns",
       `${CELLS - twin.changed} of ${CELLS} identical`);
    const rev = droplets(Float32Array.from(flat), spawns.slice().reverse());
    const touched = diff(flat, fwd).changed, order = diff(fwd, rev);
    ok(order.changed > 1000, "*** the same droplets in reverse order carve a different tile ***",
       `${order.changed} of the ${touched} cells the pass touches differ, max ${order.max.toFixed(4)} voxels`);
    const count = new Uint16Array(CELLS);
    for (const s of spawns) { const h = Float32Array.from(flat); droplets(h, [s]); for (let i = 0; i < CELLS; i++) if (h[i] !== flat[i]) count[i]++; }
    let once = 0, multi = 0; for (let i = 0; i < CELLS; i++) { if (count[i] > 1) multi++; else if (count[i] === 1) once++; }
    ok(multi > 1000, "because the droplets share cells: thousands are written by two or more, each reading what the earlier ones left",
       `${once} cells by one droplet alone, ${multi} by two or more`);
}

// ---------------------------------------------------------------------------------------------------------
sec("6. THE WASM CRATE: where cargo has built it, timed and compared on the engine's own generator");
// ---------------------------------------------------------------------------------------------------------
{
    const wasmPath = path.join(ENG, "wasm-terrain/target/wasm32-unknown-unknown/release/terrain_wasm.wasm");
    ok(/^wasm-terrain\/target\/$/m.test(read(".gitignore")), "the crate's build output is ignored, so a box that builds it cannot commit it",
       "WebGLEngine/.gitignore: wasm-terrain/target/");
    if (!fs.existsSync(wasmPath)) {
        ok(true, "not built on this box -- `cargo build --release --target wasm32-unknown-unknown` in wasm-terrain/ produces it; reported, not failed",
           "v4482 on the build box: JavaScript 12.3 ms per tile, WASM 8.3 ms; 1,207 of 16,384 columns differ on one tile, max 2 voxels");
    } else {
        // The raw cdylib, not wasm-pack's package: its imports are wasm-bindgen's describe hooks, which a stub satisfies
        // for the numeric-only exports used here (new, prewarm_tile, height_at).
        const mod = new WebAssembly.Module(fs.readFileSync(wasmPath)), imports = {};
        for (const im of WebAssembly.Module.imports(mod)) (imports[im.module] ||= {})[im.name] = (...a) => { if (/throw/.test(im.name)) throw new Error("wasm threw " + a); return 0; };
        const ex = new WebAssembly.Instance(mod, imports).exports;
        const fn = (p) => ex[Object.keys(ex).find((k) => k.startsWith(p))];
        const gen = fn("terraingen_new")(1337, 0, 16, 64), prewarm = fn("terraingen_prewarm_tile"), heightAt = fn("terraingen_height_at");
        const quiet = console.log; console.log = () => {};
        globalThis.window = { __swekWasmGen: false, __swekBiomes: false };
        const { VoxelWorld } = await import("../../world/world.js");
        const world = new VoxelWorld(); world._heightAt(1000, 1000);
        console.log = quiet;
        const TX0 = 8, TZ0 = 3, jsT = [], wasmT = [];
        for (let k = 0; k < 6; k++) { const t0 = performance.now(); world._erosionCache._generateTile(TX0 + k, TZ0); jsT.push(performance.now() - t0); }
        for (let k = 0; k < 6; k++) { const t0 = performance.now(); prewarm(gen, TX0 + k, TZ0); wasmT.push(performance.now() - t0); }
        report("JavaScript / WASM per tile, median of 6", `${ms(median(jsT))} / ${ms(median(wasmT))}   (v4482 on the build box: 12.3 / 8.3)`);
        let differ = 0, max = 0;
        for (let z = 0; z < TILE; z++) for (let x = 0; x < TILE; x++) {
            const wx = TX0 * TILE + x, wz = TZ0 * TILE + z, d = Math.abs(world._heightAt(wx, wz) - heightAt(gen, wx, wz));
            if (d > 0) differ++; if (d > max) max = d;
        }
        ok(differ < 0.2 * TILE * TILE && max <= 3,
           "the two generators' eroded columns differ on a fraction of one tile by a voxel or two -- tools/terrain-parity.mjs's ulp-chaos bound (max 3)",
           `${differ} of ${TILE * TILE} columns, max ${max} voxel(s)`);
    }
}

// ---------------------------------------------------------------------------------------------------------
sec("7. THE DECISION RECORD holds these numbers, not a preference");
// ---------------------------------------------------------------------------------------------------------
{
    const t = TODO.find((x) => x.id === "erosion-device-port");
    ok(!!t && t.status === "wont" && /\d+(\.\d+)? ms/.test(t.reason || "") && /cells/.test(t.reason || "") && /erosionMeasure-selfcheck/.test(t.evidence || ""),
       "*** tools/ship/todo.mjs: erosion-device-port is a won't-do-yet whose reason carries the milliseconds and the cell counts, and whose evidence is this gate ***",
       t ? `status ${t.status}` : "entry missing");
    const road = read("../docs/TSL-ROADMAP.md");
    const line = (road.match(/4\. \(task 41\)[^\n]*(\n {8}[^\n]*)*/) || [""])[0];
    ok(/MEASURED at v4482/.test(line) && /won't-do/.test(line) && /Jacobi/.test(line) && /reverse order/.test(line),
       "docs/TSL-ROADMAP.md step 10 item 4 says MEASURED, won't-do, and names the two sequence findings", `${line.split("\n").length} lines`);
}

console.log(fails ? `\nFAIL -- ${fails} check(s)` : "\nall checks pass");
console.log("unchecked here: the erosion's LOOK (whether a Jacobi tile would read as eroded to a viewer, which only a viewer decides); the Worker path (world/terrainWorker.js runs the same crate); and any device consumer of an eroded field, which is what re-opens the item.");
process.exit(fails ? 1 : 0);
