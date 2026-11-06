// WebGLEngine/tools/takeTankFlyCxBench.mjs -- UNNUMBERED
//
// Run: node tools/takeTankFlyCxBench.mjs [--ids 12] [--seconds 160] [--json]
//      node tools/takeTankFlyCxBench.mjs --paired [--ids 24] [--seconds 240] [--json]
//
// The export-free command for tools/tankFlyCxBench.mjs: the bench is a library the gate holds, and a library only a gate imports is an orphan
// (the ship skill, step 3c). The arguments, the tables and the exit status are the library's own `command`; this file only calls it.
"use strict";
import { command } from "./tankFlyCxBench.mjs";

process.exitCode = command(process.argv.slice(2));
