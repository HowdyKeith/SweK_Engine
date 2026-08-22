// WebGLEngine/world/procPlanet-selfcheck.mjs — v3830
//
// Answer key for procedural planets: determinism (the whole promise -- same seed, byte-identical planet), the
// noise's range/continuity, spec ranges by type, and that the bake honors sea level and puts ice at the poles.
// Node-only, no Three.js.

import { rng, valueNoise3, fbm3, planetSpec, heightAt, bakeEquirect } from "./procPlanet.js";

let pass = 0, fail = 0;
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  FAIL  " + m); } };

// 1) PRNG determinism + range.
{
    const a = rng(42), b = rng(42), c = rng(43);
    const A = [a(), a(), a()], B = [b(), b(), b()], C = [c(), c(), c()];
    ok(A.every((v, i) => v === B[i]), "same seed -> same stream");
    ok(A.some((v, i) => v !== C[i]), "different seed -> different stream");
    ok(A.every((v) => v >= 0 && v < 1), "rng in [0,1)");
}

// 2) NOISE range + continuity + determinism.
{
    let mn = 1, mx = 0;
    for (let i = 0; i < 2000; i++) { const v = valueNoise3(i * 0.13, i * 0.71, i * 0.29, 7); if (v < mn) mn = v; if (v > mx) mx = v; }
    ok(mn >= 0 && mx <= 1 && mx - mn > 0.5, "valueNoise3 spans within [0,1]");
    ok(valueNoise3(1.234, 5.678, 9.012, 3) === valueNoise3(1.234, 5.678, 9.012, 3), "noise deterministic");
    const p = valueNoise3(2, 3, 4, 1), q = valueNoise3(2.0005, 3, 4, 1);
    ok(Math.abs(p - q) < 0.02, "noise is continuous (tiny step -> tiny change)");
    // fbm stays in range
    let fmn = 1, fmx = 0; for (let i = 0; i < 1000; i++) { const v = fbm3(i * 0.07, i * 0.3, i * 0.9, { octaves: 5, seed: 2 }); fmn = Math.min(fmn, v); fmx = Math.max(fmx, v); }
    ok(fmn >= 0 && fmx <= 1, "fbm3 normalized to [0,1]");
}

// 3) SPEC determinism + sane ranges.
{
    const s1 = planetSpec(1000), s1b = planetSpec(1000), s2 = planetSpec(1001);
    ok(JSON.stringify(s1) === JSON.stringify(s1b), "planetSpec deterministic (same seed -> identical spec)");
    ok(JSON.stringify(s1) !== JSON.stringify(s2), "different seed -> different spec");
    ok(s1.radius > 0 && s1.seaLevel >= 0 && s1.seaLevel <= 1, "spec radius/seaLevel sane");
    ok(Array.isArray(s1.atmosphere.color) && s1.atmosphere.thickness > 0, "spec has an atmosphere");
    ok(["terran", "desert", "ice", "gas", "molten"].includes(s1.type), "spec type is a known type");
    // scan seeds: every type is reachable and every spec is well-formed
    const seen = new Set();
    for (let i = 0; i < 400; i++) { const s = planetSpec(i * 7 + 3); seen.add(s.type); ok(s.radius > 0 && s.noise.octaves >= 1, "seed " + i + " well-formed"); }
    ok(seen.size >= 4, "seed sweep reaches >=4 planet types (" + [...seen].join(",") + ")");
}

// 4) HEIGHT field in [0,1] on the sphere.
{
    const s = planetSpec(5);
    let mn = 1, mx = 0;
    for (let i = 0; i < 500; i++) {
        const a = i * 0.37, b = i * 0.11; const dx = Math.cos(a) * Math.cos(b), dy = Math.sin(b), dz = Math.sin(a) * Math.cos(b);
        const hgt = heightAt(s, dx, dy, dz); mn = Math.min(mn, hgt); mx = Math.max(mx, hgt);
    }
    ok(mn >= 0 && mx <= 1, "heightAt stays in [0,1] over the sphere");
}

// 5) BAKE -- deterministic, valid bytes, sea level honored, ice at the poles for capped worlds.
{
    const s = planetSpec(2024);
    const a = bakeEquirect(s, 48, 24), b = bakeEquirect(s, 48, 24);
    ok(a.rgba.length === 48 * 24 * 4, "bake size correct");
    ok(a.rgba.every((v) => v >= 0 && v <= 255), "bake bytes valid");
    let same = true; for (let i = 0; i < a.rgba.length; i++) if (a.rgba[i] !== b.rgba[i]) { same = false; break; }
    ok(same, "bake is byte-identical for the same spec");
    // more sea when sea level is higher: force two terran-ish specs
    const lowSea = { ...s, seaLevel: 0.1, iceCap: 0 }, highSea = { ...s, seaLevel: 0.8, iceCap: 0 };
    ok(bakeEquirect(highSea, 48, 24).seaFraction > bakeEquirect(lowSea, 48, 24).seaFraction, "higher sea level -> more sea");
    // ice cap: a capped world's top row should be lighter (icier) than its equator row on average
    const capped = planetSpec(1); if (capped.iceCap) {
        const bk = bakeEquirect(capped, 64, 32);
        const rowLum = (y) => { let s2 = 0; for (let x = 0; x < 64; x++) { const o = (y * 64 + x) * 4; s2 += bk.rgba[o] + bk.rgba[o + 1] + bk.rgba[o + 2]; } return s2 / 64; };
        ok(rowLum(0) > rowLum(16), "polar row brighter than equator (ice cap present)");
    } else ok(true, "planet(1) has no ice cap; skip cap check");
}

if (fail) { console.error(`\nprocPlanet-selfcheck: ${pass} pass, ${fail} FAIL`); process.exit(1); }
console.log(`procPlanet-selfcheck: all ${pass} pass`);
