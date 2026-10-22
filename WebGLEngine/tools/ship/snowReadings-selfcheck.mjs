// WebGLEngine/tools/ship/snowReadings-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time).
//
// Run: node tools/ship/snowReadings-selfcheck.mjs
//
// GRADES THE SNOW STACK'S READINGS: that every kernel-versus-twin comparison in the snow gates prints its worst difference, its limit and the margin
// between them as a measured line, and that tools/ship/realGpuRun.mjs carries those lines into the report a rig run writes.
//
// *** WHY THIS EXISTS: v4895 SHIPPED A KERNEL THAT WAS WRONG ON D3D12 AND RIGHT EVERYWHERE THIS BOX CAN REACH. *** render/taaResolve.mjs read its frame size as
// u32(1.0 / invRes). A D3D12 reciprocal gave 23.999998 for 24, the size became 23, and the rig's gate printed "worst 1.00e+6" -- ONE number, with nothing before it to compare
// against. realGpuRun.mjs keeps a gate's FAIL rows and its "----" lines and drops the PASS rows, so the other eleven kernels, which passed on D3D12, left no number behind: a
// kernel at 9e-4 against a limit of 1e-3 and one at 1e-8 were the same green tick. The readings are the numbers that come BEFORE a failure.
//
// WHAT THIS CAN AND CANNOT CLAIM. It can show the readings are printed, formatted and carried; that each one's worst is inside its limit on this box's adapter. It CANNOT show
// what any real GPU reads: the numbers on this box are a software rasteriser's, and the first D3D12 entry is a rig run's.
//
// SABOTAGES (each applied, run, restored md5-identical; every one red BY NAME): see the bottom of this file.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readingLine } from "./headlessGpu.mjs";
import { parseRows, nativeGateList, gateList } from "./realGpuRun.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const code = (rel) => fs.readFileSync(path.join(ENG, rel), "utf8").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");

console.log("snowReadings-selfcheck -- the numbers that come before a failure\n");

console.log("1. THE LINE");
{
    const l = readingLine("x: kernel vs twin", 2.5e-7, 1e-3, 1152, "NVIDIA GeForce GTX 1080");
    ok("!! a reading names the comparison, the worst, the limit, the MARGIN, how many values and the adapter", /^  ----  reading x: kernel vs twin: worst 2\.50e-7 against a limit of 1\.00e-3, margin 4000\.0x over 1152 values, adapter NVIDIA GeForce GTX 1080$/.test(l), l);
    ok("a worst of exactly zero has no margin to print (not Infinity), and a missing count and adapter degrade to nothing and '?'", !/margin/.test(readingLine("z", 0, 1e-3, null, null)) && /adapter \?$/.test(readingLine("z", 0, 1e-3, null, null)) && !/ over /.test(readingLine("z", 0, 1e-3, null, null)));
    ok("!! a NaN or infinite worst prints as itself rather than as a number, so a broken kernel is not rounded into a reading", /worst NaN against/.test(readingLine("n", NaN, 1e-3, 4, "a")) && /worst Infinity against/.test(readingLine("n", Infinity, 1e-3, 4, "a")) && !/margin/.test(readingLine("n", NaN, 1e-3, 4, "a")));
    const rows = parseRows(["  PASS  a row that passes", l, "  FAIL  a row that failed   worst 1.00e+6", "  ----  an ordinary measured line", "ALL GREEN"].join("\n"));
    ok("!! realGpuRun's parser carries the reading into the report's measured lines (it drops PASS rows, which is why the readings exist)", rows.measured.length === 2 && /^reading x: kernel vs twin/.test(rows.measured[0]) && rows.fails.length === 1, JSON.stringify(rows.measured.map((m) => m.slice(0, 40))));
}

console.log("\n2. EVERY SNOW KERNEL GATE PRINTS ITS READINGS");
const NATIVE = ["taaResolve", "snowShading", "aerial", "skyBake", "pcssShadow", "snowFine", "clipmapTerrain", "deformRead", "toroidalDeform"];
{
    const native = nativeGateList(ENG);
    ok("!! each of the nine native kernel gates is in realGpuRun's native sweep (derived from the code, so it joins without a list)", NATIVE.every((g) => native.includes(`render/${g}-selfcheck.mjs`)), NATIVE.length + " gates");
    ok("!! and the snow stack's browser gate is in the real-hardware run's own list", gateList(ENG).includes("render/snowGpu-selfcheck.mjs"));
    for (const g of NATIVE) {
        const src = code(`render/${g}-selfcheck.mjs`);
        const calls = (src.match(/\breading\(/g) || []).length;
        ok(`${g}: imports reading from headlessGpu and calls it where it compares the kernel to its twin`, /import \{[^}]*\breading\b[^}]*\} from "\.\.\/tools\/ship\/headlessGpu\.mjs"/.test(src) && calls >= 1, calls + " call site" + (calls === 1 ? "" : "s"));
    }
    ok("snowGpu: the live loop prints its rate as a reading line", /console\.log\("  ----  reading snowGpu: live loop "/.test(code("render/snowGpu-selfcheck.mjs")));
}

console.log("\n3. THE READINGS A RUN ACTUALLY PRODUCES (the two cheapest gates, run here)");
{
    for (const g of ["deformRead", "taaResolve"]) {
        const r = spawnSync(process.execPath, [path.join(ENG, "render", `${g}-selfcheck.mjs`)], { encoding: "utf8", timeout: 120000 });
        const out = r.stdout || "";
        const lines = out.split("\n").filter((l) => /^  ----  reading /.test(l));
        if (/SKIPPED|kernel half SKIPPED/.test(out) && lines.length === 0) { say(`${g}: SKIPPED -- no native adapter on this box. THAT IS A SKIP, NOT A PASS: the readings are printed only where a device exists.`); continue; }
        const m = lines.map((l) => l.match(/worst ([\d.e+-]+|NaN|Infinity) against a limit of ([\d.e+-]+)/)).filter(Boolean);
        ok(`!! ${g}: prints at least one reading, each with a finite worst inside its limit, and the adapter named`, r.status === 0 && lines.length >= 1 && m.length === lines.length && m.every((x) => Number.isFinite(+x[1]) && +x[1] < +x[2]) && lines.every((l) => /adapter \S/.test(l) && !/adapter \?$/.test(l)), lines[0] ? lines[0].replace(/^  ----  /, "") : "no reading line; exit " + r.status);
        ok(`${g}: the report's parser sees them as measured lines`, parseRows(out).measured.filter((l) => /^reading /.test(l)).length === lines.length);
    }
}

say("NOT RUN: any real GPU. The numbers the lines carry here are a software rasteriser's; the first D3D12 entry is the rig's: node tools\\ship\\realGpuRun.mjs --native --out snow-d3d12.json (and without --native for the browser half).");
console.log(`\nsnowReadings-selfcheck: ${fails === 0 ? "all passed" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);

// SABOTAGES (each applied, run, restored md5-identical; every one red BY NAME; the number is rows red):
//   deformRead stops calling reading() ............. 2 (the call-site row; the produced-readings row)     the line prefix no longer "----" ........ 4 (the format row; the parser row; both produced-readings rows)
//   the margin dropped ............................. 1                                                    snowGpu's rate line removed ............. 1
//   snowGpu left out of the real-hardware run list . 1                                                    a NaN worst printed as 0.00e+0 .......... 1 (a broken kernel rounded into a reading)

