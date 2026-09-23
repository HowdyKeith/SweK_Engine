// WebGLEngine/tools/mesh/mikktRef.mjs -- v4611 (task #41, backlog id "mikktspace-wasm")
//
// *** A REFERENCE ORACLE FOR physics/mesh/mikktSpace.mjs, THE SAME ROLE tools/mesh/xatlasRef.mjs PLAYS FOR
// physics/mesh/uvLscm.mjs. *** vendor/mikktspace is the ORIGINAL, UNMODIFIED reference implementation (zlib,
// Morten S. Mikkelsen, pinned at 3e895b49). It is C and there is no emscripten here, so it will never ship to
// the browser -- but clang++/g++ ARE here, so it can be built and RUN, and the two implementations can be
// given the same mesh and diffed corner-for-corner.
"use strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = path.join(ENG, "vendor", "mikktspace");
const CLI = path.join(ENG, "tools", "mesh", "mikktRef.cpp");

/** Which C++ compiler is available, or null. Checked rather than assumed: this is why the gate can SKIP. */
export function compiler() {
    for (const c of ["g++", "clang++"]) {
        const r = spawnSync(c, ["--version"], { encoding: "utf8" });
        if (!r.error && r.status === 0) return c;
    }
    return null;
}

/** Build the reference binary into a cache dir. Returns its path, or null when nothing can build it. */
export function build({ out = path.join(os.tmpdir(), "swek-mikktRef") } = {}) {
    const cc = compiler();
    if (!cc) return null;
    const srcFiles = [CLI, path.join(SRC, "mikktspace.c"), path.join(SRC, "mikktspace.h")];
    if (fs.existsSync(out)) {
        const bin = fs.statSync(out).mtimeMs;
        const newest = Math.max(...srcFiles.map((f) => fs.statSync(f).mtimeMs));
        if (bin > newest) return out;                    // still current
    }
    execFileSync(cc, ["-O2", "-std=c++11", "-I" + SRC, CLI, path.join(SRC, "mikktspace.c"), "-o", out],
        { stdio: ["ignore", "ignore", "pipe"], timeout: 900000 });
    return out;
}

/**
 * The cached binary IF it is already built and newer than its sources, and null otherwise -- WITHOUT ever
 * compiling. Same reasoning as xatlasRef.mjs's binaryIfCurrent(): a gate that calls build() pays a cold-build
 * cost that can blow a sweep budget, so it asks this first and falls back to a recorded oracle when the
 * answer is null.
 */
export function binaryIfCurrent({ out = path.join(os.tmpdir(), "swek-mikktRef") } = {}) {
    if (!fs.existsSync(out)) return null;
    const srcFiles = [CLI, path.join(SRC, "mikktspace.c"), path.join(SRC, "mikktspace.h")];
    const bin = fs.statSync(out).mtimeMs;
    const newest = Math.max(...srcFiles.map((f) => fs.statSync(f).mtimeMs));
    return bin > newest ? out : null;
}

/**
 * Run the REAL mikktspace.c on an indexed mesh (positions/normals/uvs shared per unique vertex, a flat
 * triangle index list) -- the same input shape physics/mesh/mikktSpace.mjs's own computeTangents() takes.
 * Returns a Float32Array of length indices.length*4 (one [tx,ty,tz,sign] per triangle CORNER, unindexed --
 * matching the real algorithm's own documented output shape), or null when unbuildable.
 */
export function run(positions, normals, uvs, indices, { bin = null } = {}) {
    const exe = bin || build();
    if (!exe) return null;
    const nv = positions.length / 3, nt = indices.length / 3;
    const lines = [nv + " " + nt];
    for (let i = 0; i < nv; i++)
        lines.push(positions[i * 3] + " " + positions[i * 3 + 1] + " " + positions[i * 3 + 2] + " " +
            normals[i * 3] + " " + normals[i * 3 + 1] + " " + normals[i * 3 + 2] + " " +
            uvs[i * 2] + " " + uvs[i * 2 + 1]);
    for (let i = 0; i < nt; i++) lines.push(indices[i * 3] + " " + indices[i * 3 + 1] + " " + indices[i * 3 + 2]);
    const outText = execFileSync(exe, [], { input: lines.join("\n") + "\n", encoding: "utf8", maxBuffer: 1 << 28 });
    const L = outText.split("\n");
    const n = +L[0].split(" ")[1];
    const out = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
        const p = L[i + 1].split(" ");
        out[i * 4] = +p[0]; out[i * 4 + 1] = +p[1]; out[i * 4 + 2] = +p[2]; out[i * 4 + 3] = +p[3];
    }
    return out;
}

/**
 * *** THE FIXTURES LIVE HERE SO ONE FILE'S HASH COVERS THEM. *** Same discipline as xatlasRef.mjs's own
 * FIXTURES: the record below stores what the real mikktspace.c said about each of these, and a stored number
 * is only trustworthy while its inputs are, so both are pinned by sha256 in the record and re-derived by the
 * gate. "quad" and "quadMirrored" are the two hand-derived-and-verified fixtures from this round's own
 * research (a planar unit quad, identity UV vs U-mirrored UV) -- the ones a human can check by hand. "cube"
 * and "cylinder" exercise multiple welded vertices, angle-weighted averaging across more than one triangle
 * per vertex, and (cube) hard face-normal seams where NO welding occurs across a seam at all (each face's
 * corners get their own normal, so the weld key never matches across the seam) -- the one property this
 * round's simplified port needs to get right without the reference's full edge-connectivity flood fill.
 * "fan" is the one UNEVENLY-weighted fixture: a uniform grid (cylinder's own regular triangulation) gives
 * every contributing triangle at a welded vertex the SAME corner angle by symmetry, so angle-weighted and
 * naive equal-weighted averaging happen to renormalize to the same direction there -- found only by actually
 * sabotaging angle-weighting into equal-weighting and getting 0 red on the first four fixtures (recorded in
 * tools/ship/mikktSpace-selfcheck.mjs's own SABOTAGE LOG). fan's two triangles share one vertex at
 * DELIBERATELY unequal wedge angles (10 degrees and 170 degrees) with DIFFERENT per-face UV mappings (so
 * their raw tangents point in genuinely different directions, not parallel ones) -- the minimal case where
 * getting the weighting wrong is visible in the output at all.
 * "seam" tests the weld key's UV component specifically: TWO OTHERWISE UNRELATED triangles sharing one
 * bit-identical position+normal corner but DIFFERENT UV there. The obvious first attempt at this -- the
 * cylinder fixture's own i=0/i=nu UV-wraparound seam -- turned out NOT to test it: `2*Math.PI*nu/nu` and
 * `2*Math.PI*0/nu` do not reduce to bit-identical cos/sin in float64, so that pair never collides on
 * POSITION even with UV correctly excluded from nothing, and is why this dedicated fixture exists instead of
 * relying on the cylinder's own accidental near-seam. positions/normals of the shared corner are the exact
 * literal 0/1 float64 values in both triangles (bit-identical by construction, no trig involved) so this
 * isolates the weld key's UV term with nothing else able to explain a pass.
 */
export const FIXTURES = {
    quad: () => planarQuad(false),
    quadMirrored: () => planarQuad(true),
    cube: () => cube(),
    cylinder: () => cylinder(16, 4),
    fan: () => fan(),
    seam: () => seam(),
};

// a unit quad in the XY plane, two triangles sharing one diagonal, flat normal -- optionally U-mirrored UVs
function planarQuad(mirrorU) {
    const positions = Float64Array.from([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]);
    const normals = Float64Array.from([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
    const uvs = mirrorU
        ? Float64Array.from([1, 0, 0, 0, 0, 1, 1, 1])
        : Float64Array.from([0, 0, 1, 0, 1, 1, 0, 1]);
    const indices = Uint32Array.from([0, 1, 2, 0, 2, 3]);
    return { positions, normals, uvs, indices };
}

// a unit cube, EACH FACE its own 4 vertices (hard face normals -- no welding across an edge), a full [0,1]^2
// UV square per face so every face's tangent is unambiguous and hand-checkable
function cube() {
    const faces = [
        { n: [1, 0, 0], p: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
        { n: [-1, 0, 0], p: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] },
        { n: [0, 1, 0], p: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]] },
        { n: [0, -1, 0], p: [[0, 0, 1], [0, 0, 0], [1, 0, 0], [1, 0, 1]] },
        { n: [0, 0, 1], p: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
        { n: [0, 0, -1], p: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
    ];
    const positions = [], normals = [], uvs = [], indices = [];
    for (const f of faces) {
        const base = positions.length / 3;
        for (let i = 0; i < 4; i++) { positions.push(...f.p[i]); normals.push(...f.n); }
        uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
        indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    return { positions: Float64Array.from(positions), normals: Float64Array.from(normals),
              uvs: Float64Array.from(uvs), indices: Uint32Array.from(indices) };
}

// an open cylinder (smooth side normals, no caps), nu around x nv along -- exercises angle-weighted
// averaging over MORE than 2 triangles at an interior welded vertex, and a seam where UV wraps but position
// does not repeat (so the seam column is NOT welded to the opposite end -- same convention uvLscm's own
// fixtures use)
function cylinder(nu, nv) {
    const positions = [], normals = [], uvs = [], indices = [];
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
        const a = 2 * Math.PI * i / nu;
        positions.push(Math.cos(a), j / nv, Math.sin(a));
        normals.push(Math.cos(a), 0, Math.sin(a));
        uvs.push(i / nu, j / nv);
    }
    const idx = (i, j) => j * (nu + 1) + i;
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
        indices.push(idx(i, j), idx(i + 1, j), idx(i + 1, j + 1));
        indices.push(idx(i, j), idx(i + 1, j + 1), idx(i, j + 1));
    }
    return { positions: Float64Array.from(positions), normals: Float64Array.from(normals),
              uvs: Float64Array.from(uvs), indices: Uint32Array.from(indices) };
}

// two triangles sharing vertex C at deliberately UNEQUAL wedge angles (10 and 170 degrees), each face's own
// UV mapping chosen so their raw per-face tangents point in genuinely different (non-parallel) directions --
// isolates angle-weighted averaging from naive equal-weighted averaging, which a uniform grid cannot (see
// the FIXTURES doc comment above).
function fan() {
    const d2r = Math.PI / 180;
    const C = [0, 0, 0], R0 = [1, 0, 0];
    const R1 = [Math.cos(10 * d2r), Math.sin(10 * d2r), 0];
    const R2 = [Math.cos(180 * d2r), Math.sin(180 * d2r), 0];
    const positions = Float64Array.from([...C, ...R0, ...R1, ...R2]);
    const normals = Float64Array.from([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
    // UVs chosen (by numeric search, not guessed) so T0's raw per-face tangent direction and T1's are
    // nearly ORTHOGONAL (dot ~0.09) rather than accidentally near-parallel -- an earlier attempt at this
    // fixture used UV=position directly and produced two nearly-parallel raw tangents despite the very
    // different wedge angles, which cannot discriminate angle- from equal-weighted averaging at all.
    const uvs = Float64Array.from([0, 0, 1, 0, 0, 1, -2, -1]);
    const indices = Uint32Array.from([0, 1, 2, 0, 2, 3]);
    return { positions, normals, uvs, indices };
}

// two DISCONNECTED triangles, no shared edge or index, whose FIRST corner is a bit-identical
// position+normal (0,0,0)/(0,0,1) but DIFFERENT uv ((0,0) vs (0.5,0.5)) -- isolates whether the weld key
// actually requires a UV match, not just position+normal. If it does not, this corner's tangent (which
// should be triangle A's own, unaveraged) gets pulled toward an incorrect blend with triangle B's.
function seam() {
    const positions = Float64Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0, 0, 0, -1, 0]);
    const normals = Float64Array.from([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
    const uvs = Float64Array.from([0, 0, 1, 0, 0, 1, 0.5, 0.5, 1.5, 0.5, 0.5, 1.5]);
    const indices = Uint32Array.from([0, 1, 2, 3, 4, 5]);
    return { positions, normals, uvs, indices };
}

/** sha256 of everything the recorded figures actually depend on: the vendor drop and the harness that drives it. */
export function inputHashes() {
    const h = {};
    for (const f of [path.join(SRC, "mikktspace.c"), path.join(SRC, "mikktspace.h"), CLI])
        h[path.relative(ENG, f)] = createHash("sha256").update(fs.readFileSync(f)).digest("hex").slice(0, 16);
    return h;
}

/** sha256 of a fixture's actual vertex/normal/uv/index bytes -- the mesh itself, not the code that spells it. */
export function meshHash(m) {
    const h = createHash("sha256");
    for (const v of m.positions) h.update(v.toFixed(12) + " ");
    for (const v of m.normals) h.update(v.toFixed(12) + " ");
    for (const v of m.uvs) h.update(v.toFixed(12) + " ");
    for (const v of m.indices) h.update(v + " ");
    return h.digest("hex").slice(0, 16);
}

export const RECORD_PATH = path.join(ENG, "tools", "mesh", "mikkt-oracle.json");

/** Run the reference over every fixture and return the record. Needs a compiler; returns null without one. */
export function makeRecord() {
    if (!compiler()) return null;
    const bin = build();
    const meshes = {};
    for (const [name, make] of Object.entries(FIXTURES)) {
        const m = make();
        const out = run(m.positions, m.normals, m.uvs, m.indices, { bin });
        meshes[name] = { meshHash: meshHash(m), tangents: Array.from(out).map((v) => +v.toFixed(6)) };
    }
    return {
        note: "mikktspace.c run over tools/mesh/mikktRef.mjs FIXTURES. Regenerate: node tools/mesh/mikktRef.mjs --record",
        pin: "3e895b49d05ea07e4c2133156cfa94369e19e409", inputs: inputHashes(), meshes,
    };
}

if (process.argv[1] && process.argv[1].endsWith("mikktRef.mjs")) {
    if (process.argv.includes("--record")) {
        const rec = makeRecord();
        if (!rec) { console.error("no C++ compiler: nothing recorded"); process.exit(1); }
        fs.writeFileSync(RECORD_PATH, JSON.stringify(rec, null, 2) + "\n");
        console.log("wrote " + path.relative(ENG, RECORD_PATH));
    } else if (process.argv.includes("--build")) {
        console.log(build() || "no C++ compiler");
    } else {
        console.log("usage: node tools/mesh/mikktRef.mjs [--record|--build]");
    }
}
