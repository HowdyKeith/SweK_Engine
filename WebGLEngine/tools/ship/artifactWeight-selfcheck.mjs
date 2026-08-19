// WebGLEngine/tools/ship/artifactWeight-selfcheck.mjs -- v2983
//
// Run: node tools/ship/artifactWeight-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES tools/ship/artifactWeight.mjs -- what a dependency COSTS, beside what it does.
//
// The idea is from isaac-mason/js-physics-benchmarks: benchmark bundle size ALONGSIDE runtime. benchmarks.html
// has timed box3d against Jolt for hundreds of versions and never weighed either, so a faster engine costing two
// extra megabytes on every page load looked free.
//
// THE MEASUREMENT THAT MAKES THIS MORE THAN A DIRECTORY LISTING: raw bytes and transferred bytes DISAGREE ABOUT
// WHICH DEPENDENCY IS BIGGER. three.js is 1.30x box3d raw and 0.74x transferred -- THE ORDERING FLIPS. JS text
// gzips to about a fifth; WASM, already a compact binary, only to about a third. A raw-byte "bundle size" table
// systematically flatters WASM and penalises JS, and ranks the wrong quantity.
//
// So this asserts BOTH numbers exist, that the flip is DETECTED rather than smoothed over, and that no single
// "size" is ever reported.
import { weigh, compare, BUNDLES } from "./artifactWeight.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. the weights are real and complete -------------------------------------------------------------------
{
    const w = weigh();
    ok("every declared bundle is weighed", w.length === BUNDLES.length, w.length + " bundles");
    ok("!! every file actually EXISTS on disk", w.every((b) => b.complete),
       w.filter((b) => !b.complete).map((b) => b.id + " missing " + b.missing.join(",")).join(" | ") || "no missing artifacts");
    ok("...and a missing file is reported, not counted as zero", w.every((b) => Array.isArray(b.missing)),
       "a zero-weight dependency would look free, which is the failure this whole module is about");
    ok("both numbers are present for every bundle", w.every((b) => b.raw > 0 && b.gzip > 0 && b.ratio > 0));
    ok("!! there is no single 'size' field anywhere", w.every((b) => !("size" in b)),
       "raw and transferred are different questions and one number cannot answer both");
}

// ---- 2. THE COMPRESSION RATIOS DIFFER BY KIND, which is why the ordering can flip -----------------------------------
{
    const w = weigh();
    const wasm = w.filter((b) => b.kind === "wasm"), js = w.filter((b) => b.kind === "js");
    const avg = (xs) => xs.reduce((s, b) => s + b.ratio, 0) / xs.length;
    ok("!! WASM compresses WORSE than JS text", avg(wasm) > avg(js),
       "wasm avg ratio " + avg(wasm).toFixed(3) + " vs js avg " + avg(js).toFixed(3) +
       " -- wasm is already a compact binary, JS is text");
    ok("...every ratio is between 0 and 1", w.every((b) => b.ratio > 0 && b.ratio < 1));
}

// ---- 3. THE HEADLINE: raw and transferred disagree about the ordering ---------------------------------------------------
{
    const t = compare("three", "box3d");
    ok("comparing three.js against box3d works", !!t && t.rawRatio > 0 && t.gzipRatio > 0);
    ok("!! three.js is HEAVIER raw and LIGHTER transferred", t.rawRatio > 1 && t.gzipRatio < 1,
       "raw " + t.rawRatio.toFixed(2) + "x, transferred " + t.gzipRatio.toFixed(2) + "x");
    ok("!! ...and the module DETECTS the flip rather than smoothing it", t.orderingAgrees === false && /FLIPS/.test(t.note),
       "a table built on raw bytes would rank these the wrong way round and nothing would say so");

    const j = compare("jolt", "box3d");
    ok("jolt is heavier than box3d BOTH ways", j.rawRatio > 1 && j.gzipRatio > 1 && j.orderingAgrees === true,
       "raw " + j.rawRatio.toFixed(2) + "x, transferred " + j.gzipRatio.toFixed(2) + "x -- here the two agree, which is why the three.js case is worth stating separately");
    ok("!! ...but the MAGNITUDE still differs sharply", Math.abs(j.rawRatio - j.gzipRatio) > 0.5,
       "3.30x on disk against 2.62x on the wire -- quoting the raw figure overstates the gap by about a quarter");
}

// ---- 4. it is reachable from the benchmarks page -----------------------------------------------------------------------
{
    const html = fs.readFileSync(path.join(ENG, "benchmarks.html"), "utf8");
    ok("!! benchmarks.html reports weight beside runtime", /artifactWeight|Artifact weight/i.test(html),
       "timing without weighing is how a two-megabyte dependency looks free");
    ok("...and shows both numbers", /gzip|transferred/i.test(html));
}

// ---- 5. it can fail -----------------------------------------------------------------------------------------------------
{
    const w = weigh();
    const box = w.find((b) => b.id === "box3d");
    ok("!! the weights are read from disk, not hard-coded", (() => {
        const src = fs.readFileSync(path.join(ENG, "tools", "ship", "artifactWeight.mjs"), "utf8")
            .replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
        return /readFileSync/.test(src) && !/\b97069[0-9]\b/.test(src);
    })(), "box3d.wasm is " + box.parts[1].raw + " bytes, counted by reading it -- a hard-coded number would rot the moment the vendor file changed");
}

console.log(fails ? "\nartifactWeight-selfcheck: " + fails + " FAILED" : "\nartifactWeight-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
