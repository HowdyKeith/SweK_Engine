// WebGLEngine/tools/ship/artifactWeight.mjs -- v2983
//
// WHAT A DEPENDENCY COSTS, NOT ONLY WHAT IT DOES.
//
// The idea is from isaac-mason/js-physics-benchmarks, which benchmarks JS and WASM physics engines for BUNDLE
// SIZE ALONGSIDE RUNTIME. The same author's crashcat argues the point directly: a WASM engine can add megabytes
// to a bundle, and that cost is invisible to every benchmark that only counts frames.
//
// benchmarks.html times box3d against Jolt and HAS NEVER WEIGHED EITHER. A faster engine that costs two extra
// megabytes on every page load may still be the wrong trade, and nothing here could say so.
//
// MEASURE WHAT IS TRANSFERRED, NOT WHAT IS ON DISK -- and that distinction is not pedantry, it CHANGES THE
// ANSWER. Measured on this tree:
//
//     three.module.js     1.21 MB raw   0.25 MB gzip   (ratio 0.202)
//     box3d .js + .wasm   0.93 MB raw   0.33 MB gzip   (ratio 0.358)
//
// BY RAW BYTES three.js is HEAVIER than box3d. BY WHAT A BROWSER ACTUALLY DOWNLOADS IT IS LIGHTER. The ordering
// FLIPS. JS text compresses to about a fifth; WASM, already a compact binary, only to about a third. So a raw
// byte count systematically flatters WASM and penalises JS, and any "bundle size" table built on it is ranking
// the wrong quantity.
//
// This reports both, always, and never a single "size".
"use strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");

/**
 * The artifacts a PAGE pulls, grouped by the dependency a reader would choose between. Files, not directories --
 * a directory total would include things no page loads.
 */
export const BUNDLES = [
    { id: "box3d", label: "box3d (WASM physics)", kind: "wasm",
      files: ["vendor/box3d/box3d.js", "vendor/box3d/box3d.wasm"] },
    { id: "jolt", label: "Jolt (WASM physics)", kind: "wasm",
      files: ["vendor/jolt/jolt-physics.wasm-compat.js"] },
    { id: "three", label: "three.js (renderer)", kind: "js",
      files: ["vendor/three/three.module.js"] },
    { id: "htmx", label: "htmx", kind: "js",
      files: ["vendor/htmx/htmx.2.0.10.min.js"] },
];

function weighFile(rel) {
    const full = path.join(ENG, rel);
    let buf;
    try { buf = fs.readFileSync(full); } catch { return { file: rel, present: false, raw: 0, gzip: 0 }; }
    const gz = zlib.gzipSync(buf, { level: 9 });
    return { file: rel, present: true, raw: buf.length, gzip: gz.length, ratio: gz.length / buf.length };
}

/** Weigh every bundle. Missing files are reported as missing rather than counted as zero. */
export function weigh() {
    return BUNDLES.map((b) => {
        const parts = b.files.map(weighFile);
        const raw = parts.reduce((s, p) => s + p.raw, 0);
        const gzip = parts.reduce((s, p) => s + p.gzip, 0);
        return {
            id: b.id, label: b.label, kind: b.kind, parts,
            raw, gzip, ratio: raw ? gzip / raw : null,
            complete: parts.every((p) => p.present),
            missing: parts.filter((p) => !p.present).map((p) => p.file),
        };
    });
}

/** Compare two bundles both ways, because the two ways can disagree. */
export function compare(aId, bId) {
    const all = weigh();
    const a = all.find((x) => x.id === aId), b = all.find((x) => x.id === bId);
    if (!a || !b) return null;
    const rawRatio = b.raw ? a.raw / b.raw : null;
    const gzipRatio = b.gzip ? a.gzip / b.gzip : null;
    return {
        a: a.id, b: b.id, rawRatio, gzipRatio,
        // The honest headline: do raw and transferred bytes even agree on which is bigger?
        orderingAgrees: (a.raw > b.raw) === (a.gzip > b.gzip),
        note: (a.raw > b.raw) === (a.gzip > b.gzip)
            ? "raw and transferred bytes agree on the ordering here"
            : "THE ORDERING FLIPS between raw and transferred bytes -- a raw-byte table would rank these the wrong way round",
    };
}

const mb = (n) => (n / 1048576).toFixed(2);

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    console.log("[weight] artifact cost -- raw on disk vs what a browser downloads\n");
    for (const b of weigh()) {
        console.log("  " + b.label.padEnd(24) + mb(b.raw).padStart(6) + " MB raw   " + mb(b.gzip).padStart(6) +
                    " MB gzip   ratio " + (b.ratio ? b.ratio.toFixed(3) : "n/a") + (b.complete ? "" : "   MISSING: " + b.missing.join(", ")));
    }
    const c = compare("jolt", "box3d");
    if (c) console.log("\n  jolt vs box3d:  raw " + c.rawRatio.toFixed(2) + "x   transferred " + c.gzipRatio.toFixed(2) + "x");
    const t = compare("three", "box3d");
    if (t) console.log("  three vs box3d: raw " + t.rawRatio.toFixed(2) + "x   transferred " + t.gzipRatio.toFixed(2) + "x   -> " + t.note);
}
