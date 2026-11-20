// WebGLEngine/tools/ship/stealthFigure4Cmd.mjs -- UNNUMBERED (export-free on purpose: the command; the library is brain/stealthMotion.mjs, held by brain/stealthMotion-selfcheck.mjs)
//   node tools/ship/stealthFigure4Cmd.mjs [--seconds 3] [--fps 60] [--wc 1]
// THE MOTION-DETECTOR NUMBERS OF SANTON ET AL. 2025's FIGURE 4, as brain/stealthMotion.mjs computes them (brain/STEALTH_ROUNDS_WIP.md): the expanding ellipse with no stripes, static stripes and moving
// stripes, run through the receiver's filter and the two-pixel detector, printed as R (alignment), M (net strength) and the moving/static ratio of M. Only the ORDERING and rough ratios are comparable
// with the paper's (its pixel scale and noise threshold were not reported); a short sequence (the default 3 s at 60 fps) is enough for the ordering. Writes nothing.
// 2026-11-20 -- added at the v4932 merge: the library had no caller but its gate (tools/ship/orphanScan-selfcheck.mjs), and this is the use its note describes.
"use strict";
import { parseOrExit } from "./cliArgs.mjs";
import { figure4 } from "../../brain/stealthMotion.mjs";

const cli = parseOrExit("stealthFigure4Cmd", { values: { "--seconds": "number", "--fps": "number", "--wc": "number" } }), v = cli.values;
const T = v["--seconds"] || 3, fps = v["--fps"] || 60, wc = v["--wc"] === undefined ? 1 : v["--wc"];
if (!(T > 0) || !(fps > 0) || !(wc > 0 && wc <= 1)) { console.error("[stealthFigure4] --seconds and --fps must be positive and --wc in (0, 1]"); process.exit(2); }
const r = figure4({ T, fps, wc });
for (const k of ["none", "static", "moving"]) console.log(`[stealthFigure4] ${k.padEnd(6)}  R ${r[k].R.toFixed(3)}  M ${r[k].M.toFixed(1)}  total ${r[k].total.toFixed(1)}`);
console.log(`[stealthFigure4] moving / static M: ${Number.isFinite(r.movingOverStatic) ? r.movingOverStatic.toFixed(2) : "inf"}   (${T} s at ${fps} fps, Weber contrast ${wc})`);
