// WebGLEngine/tools/mesh/xatlasRef.mjs -- v4560
//
// *** A REFERENCE ORACLE FOR physics/mesh/uvLscm.mjs, WHICH UNTIL NOW WAS GRADED ONLY AGAINST ITSELF. ***
//
// That module welds a mesh, segments it into charts and solves LSCM -- the xatlas pipeline in miniature -- and
// every property its gate holds it to is a property it asserts about its own output: charts do not overlap,
// distortion is under a bound, the pack fits. All true, all self-referential. None of them can say whether the
// segmentation is GOOD, because "good" is a comparison and there was nothing to compare with.
//
// vendor/xatlas is the reference implementation of that pipeline (MIT, Jonathan Young, pinned at f700c779).
// It is C++ and there is no emscripten here, so it will never ship to the browser -- but clang++ and g++ ARE
// here, so it can be built and RUN, and the two unwrappers can be given the same mesh.
//
// *** THE METRIC IS COMPUTED HERE, BY ONE FUNCTION, OVER BOTH OUTPUTS. *** Asking each tool for its own
// quality number would compare two definitions rather than two unwrappers -- xatlas's `utilization` and
// uvLscm's `distortion` do not mean the same thing and never will. What this module does instead is take
// (positions, indices, uv) from either side and measure the same three things about it.
"use strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = path.join(ENG, "vendor", "xatlas");
const CLI = path.join(ENG, "tools", "mesh", "xatlasRef.cpp");

/** Which C++ compiler is available, or null. Checked rather than assumed: this is why the gate can SKIP. */
export function compiler() {
    for (const c of ["g++", "clang++"]) {
        const r = spawnSync(c, ["--version"], { encoding: "utf8" });
        if (!r.error && r.status === 0) return c;
    }
    return null;
}

/** Build the reference binary into a cache dir. Returns its path, or null when nothing can build it. */
export function build({ out = path.join(os.tmpdir(), "swek-xatlasRef") } = {}) {
    const cc = compiler();
    if (!cc) return null;
    if (fs.existsSync(out)) {
        const bin = fs.statSync(out).mtimeMs;
        const newest = Math.max(...[CLI, path.join(SRC, "xatlas.cpp"), path.join(SRC, "xatlas.h")]
            .map((f) => fs.statSync(f).mtimeMs));
        if (bin > newest) return out;                    // still current
    }
    execFileSync(cc, ["-O2", "-std=c++11", "-I" + SRC, CLI, path.join(SRC, "xatlas.cpp"), "-o", out],
        { stdio: ["ignore", "ignore", "pipe"], timeout: 900000 });
    return out;
}

/**
 * The cached binary IF it is already built and newer than its sources, and null otherwise -- WITHOUT ever
 * compiling. A gate cannot call build(): the cold build is 5,166 ms measured, the sweep budget is 3,000 ms,
 * and a gate recorded over budget is skipped, never re-timed, and so stays over budget. So the gate asks this
 * instead, verifies the record when the answer is a path, and says which of the two it did.
 */
export function binaryIfCurrent({ out = path.join(os.tmpdir(), "swek-xatlasRef") } = {}) {
    if (!fs.existsSync(out)) return null;
    const bin = fs.statSync(out).mtimeMs;
    const newest = Math.max(...[CLI, path.join(SRC, "xatlas.cpp"), path.join(SRC, "xatlas.h")]
        .map((f) => fs.statSync(f).mtimeMs));
    return bin > newest ? out : null;
}

/** Run xatlas on a mesh. Returns { charts, width, height, util, P, tris, xref } or null when unbuildable. */
export function run(positions, indices, { bin = null } = {}) {
    const exe = bin || build();
    if (!exe) return null;
    const nv = positions.length / 3, nt = indices.length / 3;
    const lines = [nv + " " + nt];
    for (let i = 0; i < nv; i++) lines.push(positions[i * 3] + " " + positions[i * 3 + 1] + " " + positions[i * 3 + 2]);
    for (let i = 0; i < nt; i++) lines.push(indices[i * 3] + " " + indices[i * 3 + 1] + " " + indices[i * 3 + 2]);
    const outText = execFileSync(exe, [], { input: lines.join("\n") + "\n", encoding: "utf8", maxBuffer: 1 << 28 });
    const L = outText.split("\n");
    let k = 0;
    const charts = +L[k++].split(" ")[1];
    const [, w, h] = L[k++].split(" ").map(Number);
    const util = +L[k++].split(" ")[1];
    const nOut = +L[k++].split(" ")[1];
    const P = new Float64Array(nOut * 3), uv = new Float64Array(nOut * 2), xref = new Uint32Array(nOut);
    for (let i = 0; i < nOut; i++) {
        const p = L[k++].split(" ");
        P[i * 3] = +p[0]; P[i * 3 + 1] = +p[1]; P[i * 3 + 2] = +p[2];
        uv[i * 2] = +p[3]; uv[i * 2 + 1] = +p[4]; xref[i] = +p[5];
    }
    const ntOut = +L[k++].split(" ")[1];
    const tris = new Uint32Array(ntOut * 3);
    for (let i = 0; i < ntOut; i++) { const t = L[k++].split(" ");
        tris[i * 3] = +t[0]; tris[i * 3 + 1] = +t[1]; tris[i * 3 + 2] = +t[2]; }
    return { charts, width: w, height: h, util, P, uv, tris };
}

/**
 * *** THE SHARED METRIC. *** Given positions, triangles and per-vertex UVs from EITHER unwrapper, measure:
 *
 *   uvArea      total area covered in UV space, as a fraction of the unit square. What a packer wins.
 *   stretchP90  the 90th percentile of per-triangle 3D-to-UV area ratio, normalised so a perfectly uniform
 *               map reads 1. Scale-invariant by construction -- the ratio is divided by its own median --
 *               because a global scale is a packing choice and not a distortion.
 *   flipped     triangles whose UV winding is opposite to the majority. A flipped triangle samples its
 *               texture mirrored and is the one defect that is always wrong rather than a matter of degree.
 *
 * All three are computed the same way for both sides, which is the whole point: a comparison of two tools
 * through one definition rather than a comparison of two definitions.
 */
export function measure(P, tris, uv) {
    const nt = tris.length / 3;
    const a3 = [], a2 = [];
    let uvArea = 0, ccw = 0, cw = 0;
    for (let t = 0; t < nt; t++) {
        const i = tris[t * 3], j = tris[t * 3 + 1], k = tris[t * 3 + 2];
        const ax = P[j * 3] - P[i * 3], ay = P[j * 3 + 1] - P[i * 3 + 1], az = P[j * 3 + 2] - P[i * 3 + 2];
        const bx = P[k * 3] - P[i * 3], by = P[k * 3 + 1] - P[i * 3 + 1], bz = P[k * 3 + 2] - P[i * 3 + 2];
        const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
        const A3 = 0.5 * Math.hypot(cx, cy, cz);
        const ux = uv[j * 2] - uv[i * 2], uy = uv[j * 2 + 1] - uv[i * 2 + 1];
        const vx = uv[k * 2] - uv[i * 2], vy = uv[k * 2 + 1] - uv[i * 2 + 1];
        const cross = ux * vy - uy * vx;
        const A2 = 0.5 * Math.abs(cross);
        uvArea += A2;
        if (cross > 0) ccw++; else if (cross < 0) cw++;
        if (A3 > 1e-12 && A2 > 1e-12) { a3.push(A3); a2.push(A2); }
    }
    const ratios = a3.map((v, i) => a2[i] / v).sort((x, y) => x - y);
    const med = ratios.length ? ratios[ratios.length >> 1] : 1;
    const norm = ratios.map((r) => r / (med || 1));
    const q = (p) => (norm.length ? norm[Math.min(norm.length - 1, Math.floor(norm.length * p))] : null);
    return {
        triangles: nt, measured: ratios.length,
        uvArea: +uvArea.toFixed(6),
        stretchP90: q(0.9) == null ? null : +q(0.9).toFixed(4),
        stretchMax: norm.length ? +norm[norm.length - 1].toFixed(4) : null,
        flipped: Math.min(ccw, cw),
    };
}

/**
 * *** THE ABSOLUTE METRIC, WHICH IS THE ONE THE NORMALISED ONE CANNOT REPLACE. ***
 *
 * stretchP90 above divides by its own median, so it grades UNIFORMITY and is blind to an atlas that shrank:
 * halve every chart and it does not move. This is the same per-triangle ratio left RAW -- UV area per unit
 * surface area, texels per square metre in all but name -- reported at the 10th percentile, so it answers
 * "how much texture does the worst-served tenth of this mesh get". Packing efficiency and stretch are both
 * inside it, which is why it is the number that says xatlas is ahead when the normalised one says otherwise.
 */
export function density(P, tris, uv) {
    const nt = tris.length / 3, d = [];
    for (let t = 0; t < nt; t++) {
        const i = tris[t * 3], j = tris[t * 3 + 1], k = tris[t * 3 + 2];
        const ax = P[j * 3] - P[i * 3], ay = P[j * 3 + 1] - P[i * 3 + 1], az = P[j * 3 + 2] - P[i * 3 + 2];
        const bx = P[k * 3] - P[i * 3], by = P[k * 3 + 1] - P[i * 3 + 1], bz = P[k * 3 + 2] - P[i * 3 + 2];
        const A3 = 0.5 * Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx);
        const ux = uv[j * 2] - uv[i * 2], uy = uv[j * 2 + 1] - uv[i * 2 + 1];
        const vx = uv[k * 2] - uv[i * 2], vy = uv[k * 2 + 1] - uv[i * 2 + 1];
        const A2 = 0.5 * Math.abs(ux * vy - uy * vx);
        if (A3 > 1e-12 && A2 > 1e-12) d.push(A2 / A3);
    }
    d.sort((a, b) => a - b);
    const q = (p) => (d.length ? d[Math.min(d.length - 1, Math.floor(d.length * p))] : 0);
    return { p10: q(0.10), median: q(0.5), n: d.length };
}

/** Largest and smallest UV coordinate in a flat uv array -- the containment question, asked of either side. */
export function uvRange(uv) {
    let lo = Infinity, hi = -Infinity, outside = 0;
    for (let i = 0; i < uv.length; i++) {
        if (uv[i] < lo) lo = uv[i];
        if (uv[i] > hi) hi = uv[i];
        if (uv[i] < 0 || uv[i] > 1) outside++;
    }
    return { lo, hi, outside, n: uv.length };
}

/**
 * *** THE FIXTURES LIVE HERE SO ONE FILE'S HASH COVERS THEM. *** The record below stores what xatlas said
 * about each of these, and a stored number is only trustworthy while its inputs are. Both are pinned by
 * sha256 in the record and re-derived by the gate, so a changed fixture or a changed vendor drop reads as
 * STALE rather than as agreement.
 *
 * The cylinder is the control and is the most informative of the four: it is developable, so an exact
 * unwrap exists, both tools find it, and every remaining difference is the ATLAS.
 */
export const FIXTURES = {
    "cylinder 16x6": () => grid(16, 6, (i, j, nu, nv) => {
        const a = 1.5 * Math.PI * i / nu; return [Math.cos(a), Math.sin(a), 2 * j / nv];
    }, { wrapU: false, wrapV: false }),
    "torus 16x10": () => grid(16, 10, (i, j, nu, nv) => {
        const a = 2 * Math.PI * i / nu, b = 2 * Math.PI * j / nv, R = 1, r = 0.35;
        return [(R + r * Math.cos(b)) * Math.cos(a), (R + r * Math.cos(b)) * Math.sin(a), r * Math.sin(b)];
    }, { wrapU: true, wrapV: true }),
    "sphere 12x8": () => sphere(12, 8),
    "sphere 24x16": () => sphere(24, 16),
};

// a quad grid over a parametric patch; wrapU/wrapV close the seam by index rather than by duplicating a ring
function grid(nu, nv, at, { wrapU, wrapV }) {
    const su = wrapU ? nu : nu + 1, sv = wrapV ? nv : nv + 1;
    const P = [], I = [];
    for (let j = 0; j < sv; j++) for (let i = 0; i < su; i++) P.push(...at(i, j, nu, nv));
    const id = (i, j) => (j % sv) * su + (i % su);
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++)
        I.push(id(i, j), id(i + 1, j), id(i + 1, j + 1), id(i, j), id(i + 1, j + 1), id(i, j + 1));
    return { positions: Float64Array.from(P), indices: Uint32Array.from(I) };
}

// a UV sphere with poles: the rings wrap in u, and the two pole fans are triangles rather than quads
function sphere(nu, nv) {
    const P = [0, 1, 0], I = [];
    for (let j = 1; j < nv; j++) for (let i = 0; i < nu; i++) {
        const th = Math.PI * j / nv, ph = 2 * Math.PI * i / nu;
        P.push(Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph));
    }
    const south = P.length / 3;
    P.push(0, -1, 0);
    const ring = (j, i) => 1 + (j - 1) * nu + (i % nu);
    for (let i = 0; i < nu; i++) I.push(0, ring(1, i + 1), ring(1, i));
    for (let j = 1; j < nv - 1; j++) for (let i = 0; i < nu; i++)
        I.push(ring(j, i), ring(j, i + 1), ring(j + 1, i + 1), ring(j, i), ring(j + 1, i + 1), ring(j + 1, i));
    for (let i = 0; i < nu; i++) I.push(south, ring(nv - 1, i), ring(nv - 1, i + 1));
    return { positions: Float64Array.from(P), indices: Uint32Array.from(I) };
}

/**
 * sha256 of everything the recorded xatlas figures actually depend on: the vendor drop and the harness that
 * drives it. NOT this file -- hashing the module would mark the record stale for a comment edit, and a
 * staleness signal that fires on things that cannot change the answer is one people learn to regenerate
 * past. What the fixtures contribute is hashed as DATA instead, per mesh, in meshHash below.
 */
export function inputHashes() {
    const h = {};
    for (const f of [path.join(SRC, "xatlas.cpp"), path.join(SRC, "xatlas.h"), CLI])
        h[path.relative(ENG, f)] = createHash("sha256").update(fs.readFileSync(f)).digest("hex").slice(0, 16);
    return h;
}

/** sha256 of a fixture's actual vertex and index bytes -- the mesh itself, not the code that spells it. */
export function meshHash(m) {
    const h = createHash("sha256");
    for (const v of m.positions) h.update(v.toFixed(12) + " ");
    for (const v of m.indices) h.update(v + " ");
    return h.digest("hex").slice(0, 16);
}

export const RECORD_PATH = path.join(ENG, "tools", "mesh", "xatlas-oracle.json");

/** Run the reference over every fixture and return the record. Needs a compiler; returns null without one. */
export function makeRecord() {
    if (!compiler()) return null;
    const bin = build();
    const meshes = {};
    for (const [name, make] of Object.entries(FIXTURES)) {
        const m = make();
        const x = run(m.positions, m.indices, { bin });
        const d = density(x.P, x.tris, x.uv), s = measure(x.P, x.tris, x.uv), r = uvRange(x.uv);
        meshes[name] = {
            meshHash: meshHash(m), charts: x.charts, atlas: [x.width, x.height], util: +x.util.toFixed(6),
            verts: x.P.length / 3, triangles: s.triangles,
            stretchP90: s.stretchP90, densityP10: +d.p10.toExponential(4), densityMedian: +d.median.toExponential(4),
            uvArea: s.uvArea, uvLo: +r.lo.toFixed(6), uvHi: +r.hi.toFixed(6), uvOutside: r.outside,
        };
    }
    return {
        note: "xatlas run over tools/mesh/xatlasRef.mjs FIXTURES. Regenerate: node tools/mesh/xatlasRef.mjs --record",
        pin: "f700c7790aaa030e794b52ba7791a05c085faf0c", inputs: inputHashes(), meshes,
    };
}

if (process.argv[1] && process.argv[1].endsWith("xatlasRef.mjs")) {
    if (process.argv.includes("--record")) {
        const rec = makeRecord();
        if (!rec) { console.error("no C++ compiler: nothing recorded"); process.exit(1); }
        fs.writeFileSync(RECORD_PATH, JSON.stringify(rec, null, 2) + "\n");
        console.log("wrote " + path.relative(ENG, RECORD_PATH));
    } else if (process.argv.includes("--build")) {
        console.log(build() || "no C++ compiler");
    } else {
        console.log("usage: node tools/mesh/xatlasRef.mjs [--record|--build]");
    }
}
