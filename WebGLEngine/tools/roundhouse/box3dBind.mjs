// tools/roundhouse/box3dBind.mjs
//
// v2804 -- roundhouse device #3: REAL Box3D rigid-body physics (vendor/box3d/box3d.wasm), bound through the same
// Node-side raw-wasm adapter pattern box3dConformance-selfcheck.mjs established (the browser loader fetches its glue
// over HTTP and cannot run here; the adapter mirrors box3dLoader.js call for call -- read from that file, not
// invented). Third device through the deviceBind seam, and the first ASYNC one: the wasm instantiates on first build.
//
// Ground truths this device can crystallize against:
//   "drop"    -- free fall h(t) = 0.5*g*t^2. The engine's fixed-step integrator lands within ~1.5% of the closed
//                form at 1/60 x 4 substeps (measured 4.840 vs 4.900 over 1s at g=9.8); fallErrFrac carries the
//                relative error so claims stay honest about discretization.
//   "toss"    -- projectile apex v0^2 / (2g), same discretization caveat, apexErrFrac.
//   "impulse" -- momentum bookkeeping: speed after impulse j on mass m (= 8*hx*hy*hz*density) is j/m EXACTLY
//                (measured 5.0000 for j=5, m=1); momentumErrFrac.
//   "hash"    -- swk_state_hash over a scripted 600-tick pile: run twice, `deterministic` (equals) says whether the
//                hashes matched, and `stateHash` (hex string) is claimable cross-machine -- the lockstep-safety
//                question ("do two peers compute the identical world?") becomes a roundhouse claim.
//
// Missing wasm degrades, never crashes: build() returns { error: "box3d-wasm-missing..." }, the numeric verdict
// refuses, and the history tells the proposer why -- same contract as every other failure in the loop.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_WASM = path.join(here, "..", "..", "vendor", "box3d", "box3d.wasm");

let _exports = null;
let _loadErr = null;

async function loadBox3D(wasmPath = DEFAULT_WASM) {
    if (_exports || _loadErr) return { e: _exports, err: _loadErr };
    try {
        if (!fs.existsSync(wasmPath)) throw new Error("not built at " + wasmPath + " -- run physics/box3d/build-box3d-wasm-clang.sh");
        const { instance } = await WebAssembly.instantiate(fs.readFileSync(wasmPath), {
            wasi_snapshot_preview1: new Proxy({}, { get: () => () => 0 }),
        });
        _exports = instance.exports;
    } catch (err) {
        _loadErr = "box3d-wasm-missing: " + (err.message || err);
    }
    return { e: _exports, err: _loadErr };
}

// test seam: reset the memoized module (used by the selfcheck's missing-wasm case)
export function __resetBox3D() { _exports = null; _loadErr = null; }

const readY = (e, i) => new Float32Array(e.memory.buffer, e.swk_transforms(), e.swk_body_count() * 7)[i * 7 + 1];
const readV = (e, i) => {
    const v = new Float32Array(e.memory.buffer, e.swk_velocities(), e.swk_body_count() * 3);
    return [v[i * 3], v[i * 3 + 1], v[i * 3 + 2]];
};

export const B3D_OBSERVABLES = [
    "fallDistance", "fallErrFrac", "apexHeight", "apexErrFrac",
    "speedAfter", "momentumErrFrac", "deterministic", "stateHash",
];

const DEF = { g: 9.8, seconds: 1, h0: 10, v0: 7, j: 5, density: 1, half: 0.5, dt: 1 / 60, sub: 4, hashTicks: 600 };

export function b3dDefaults(hyp) {
    const h = { mode: "drop", ...(hyp || {}) };
    const cfg = { ...DEF, ...(h.config || {}) };
    const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);
    cfg.g = Math.min(100, Math.max(0.1, num(cfg.g, DEF.g)));
    cfg.seconds = Math.min(30, Math.max(0.1, num(cfg.seconds, DEF.seconds)));
    cfg.h0 = Math.min(1000, Math.max(1, num(cfg.h0, DEF.h0)));
    cfg.v0 = Math.min(100, Math.max(0.5, num(cfg.v0, DEF.v0)));
    cfg.j = Math.min(1000, Math.max(0.01, num(cfg.j, DEF.j)));
    cfg.density = Math.min(100, Math.max(0.01, num(cfg.density, DEF.density)));
    cfg.half = Math.min(10, Math.max(0.05, num(cfg.half, DEF.half)));
    cfg.planted = !!cfg.planted;
    cfg.dt = Math.min(0.05, Math.max(1 / 480, num(cfg.dt, DEF.dt)));
    cfg.sub = Math.min(16, Math.max(1, num(cfg.sub, DEF.sub) | 0));
    cfg.hashTicks = Math.min(5000, Math.max(10, num(cfg.hashTicks, DEF.hashTicks) | 0));
    if (!["drop", "toss", "impulse", "hash"].includes(h.mode)) h.mode = "drop";
    h.config = cfg;
    if (!h.claim || !h.claim.observable) h.claim = { observable: "fallErrFrac", max: 0.02 };
    return h;
}

// ---- THE PLANTED ERROR (v3725) ---------------------------------------------------------------------------
// *** _swk_body_box TAKES THREE HALF-EXTENTS, AND THE MOST PLAUSIBLE WRONG DERIVATION AGAINST THAT API IS
// PASSING FULL EXTENTS. It type-checks, it runs, and it builds a body 2x on every axis -- EIGHT TIMES THE
// VOLUME AND EIGHT TIMES THE MASS. It is a PLANT ON THE PHYSICS rather than on the key: the wasm simulates
// faithfully and what it was asked to simulate is wrong, which is the only kind of plant available here,
// since nobody in this sandbox can recompile the solver. ***
// The knob is read at EVERY body-creation site, because the real mistake would be spelled once and repeated.
const hx = (cfg, h) => (cfg.planted ? 2 * h : h);

function dropRun(e, cfg) {
    e.swk_world_create(0, -cfg.g, 0);
    e.swk_body_box(1, 0, cfg.h0, 0, hx(cfg, 0.5), hx(cfg, 0.5), hx(cfg, 0.5), 1.0);
    const steps = Math.round(cfg.seconds / cfg.dt);
    for (let i = 0; i < steps; i++) e.swk_world_step(cfg.dt, cfg.sub);
    const t = steps * cfg.dt;                       // honest elapsed time (rounding)
    const fall = cfg.h0 - readY(e, 0);
    const ideal = 0.5 * cfg.g * t * t;
    return { fallDistance: fall, fallIdeal: ideal, fallErrFrac: Math.abs(fall - ideal) / ideal };
}

function tossRun(e, cfg) {
    e.swk_world_create(0, -cfg.g, 0);
    const b = e.swk_body_box(1, 0, 0, 0, hx(cfg, 0.5), hx(cfg, 0.5), hx(cfg, 0.5), 1.0);
    e.swk_body_set_velocity(b, 0, cfg.v0, 0);
    let maxY = 0;
    const maxSteps = Math.round((2 * cfg.v0 / cfg.g) / cfg.dt) + 10;
    for (let i = 0; i < maxSteps; i++) {
        e.swk_world_step(cfg.dt, cfg.sub);
        const y = readY(e, 0);
        if (y > maxY) maxY = y;
        if (readV(e, 0)[1] <= 0 && y < maxY) break;   // past apex
    }
    const ideal = (cfg.v0 * cfg.v0) / (2 * cfg.g);
    return { apexHeight: maxY, apexIdeal: ideal, apexErrFrac: Math.abs(maxY - ideal) / ideal };
}

function impulseRun(e, cfg) {
    e.swk_world_create(0, 0, 0);
    const b = e.swk_body_box(1, 0, 0, 0, hx(cfg, cfg.half), hx(cfg, cfg.half), hx(cfg, cfg.half), cfg.density);
    e.swk_body_impulse(b, cfg.j, 0, 0);
    const v = readV(e, 0);
    const speed = Math.hypot(v[0], v[1], v[2]);
    const mass = 8 * cfg.half * cfg.half * cfg.half * cfg.density;
    const ideal = cfg.j / mass;
    return { speedAfter: speed, speedIdeal: ideal, momentumErrFrac: Math.abs(speed - ideal) / ideal, massImplied: speed > 0 ? cfg.j / speed : null };
}

// the loader's documented determinism scene (box3dLoader.selfTest), run TWICE from scratch
function hashScene(e, cfg) {
    e.swk_world_create(0, -9.8, 0);
    e.swk_body_box(0, 0, -0.5, 0, hx(cfg, 20), hx(cfg, 0.5), hx(cfg, 20), 1.0);
    for (let i = 0; i < 40; i++) {
        e.swk_body_box(1, (i % 5) - 2, 2 + Math.floor(i / 5) * 1.2, ((i * 7) % 5) - 2, hx(cfg, 0.4), hx(cfg, 0.4), hx(cfg, 0.4), 1.0);
    }
    for (let t = 0; t < cfg.hashTicks; t++) e.swk_world_step(1 / 60, 4);
    return (e.swk_state_hash() >>> 0).toString(16).padStart(8, "0");
}

function hashRun(e, cfg) {
    const h1 = hashScene(e, cfg);
    const h2 = hashScene(e, cfg);
    return { stateHash: h1, stateHashRepeat: h2, deterministic: h1 === h2 };
}

export async function buildB3D(hyp, base = {}) {
    const h = b3dDefaults({ ...hyp, config: { ...(base || {}), ...(hyp && hyp.config) } });
    const { e, err } = await loadBox3D(base && base.wasmPath);
    if (err) return { kind: h.mode, error: err };
    try {
        if (h.mode === "toss") return { kind: "toss", ...tossRun(e, h.config) };
        if (h.mode === "impulse") return { kind: "impulse", ...impulseRun(e, h.config) };
        if (h.mode === "hash") return { kind: "hash", ...hashRun(e, h.config) };
        return { kind: "drop", ...dropRun(e, h.config) };
    } finally {
        try { e.swk_world_destroy(); } catch {}
    }
}

export const box3dDevice = {
    // *** WHAT THE PLANT OVERTURNS, AS DATA, AND WHICH MODES CAN SEE IT -- MEASURED, NOT ASSUMED.
    // FULL extents where the API wants HALF: the body is 8x the volume and 8x the mass.
    //   impulse  FIRES     speedAfter 5 -> 0.625, momentumErrFrac 0 -> 0.875, massImplied 1 -> 8 (EXACTLY 8x)
    //   drop     BLIND     4.839765548706055 -> BIT-IDENTICAL. Free fall is mass-independent; the observable
    //                      never claimed to see the body's size, so this is a DECLARED BLINDNESS, not a gap.
    //   toss     BLIND     2.4272096157073975 -> BIT-IDENTICAL, same reason.
    //   hash     SPLIT, AND IT IS THE SHARP ONE: stateHash MOVES (adb0305e -> 682fe802) while `deterministic`
    //                      STAYS TRUE, because it compares a run against ITSELF. A WRONG WORLD IS STILL A
    //                      DETERMINISTIC WORLD. The observable saw it and the verdict did not.
    plantKind: "knob",   // v3725 -- config.planted passes FULL extents where _swk_body_box wants HALF
    planted: { knob: "planted", observable: "massImplied",
               note: "full extents passed where _swk_body_box wants half -- 8x the volume, so implied mass 1 -> 8 and speed after a unit impulse falls by the same factor; drop and toss are BIT-IDENTICAL because free fall is mass-independent, and the hash mode's determinism verdict holds while its hash moves" },
    // v3192 -- EXPORTED. This device reported as ONE-MODE to the census because its own mode names were
    // not in the probe's candidate list -- the LOWER BOUND, biting for the third time. Derived from
    // this file's own default plus every mode its own build() branches on, each verified to give a
    // DISTINCT answer. *** A MODE NOBODY CAN DISCOVER IS A MODE NOBODY WILL USE. ***
    modes: ["drop", "toss", "impulse", "hash"],
    name: "box3d-rigid-body",
    observables: B3D_OBSERVABLES,
    build: buildB3D,
    defaults: b3dDefaults,
};
