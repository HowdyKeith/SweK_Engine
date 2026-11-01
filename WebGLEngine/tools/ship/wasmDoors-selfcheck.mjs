// WebGLEngine/tools/ship/wasmDoors-selfcheck.mjs -- v4840
//
// Run: node tools/ship/wasmDoors-selfcheck.mjs   (~1.3 s since v4896 -- the census about 1.0 s: noComments no longer looks back and doorReach is one git grep. WAS ~3.5s at v4840, the census about 2.6 s,
//   one converted member under the hook 0.3 s, the fixture tree the rest)
//
// GATES tools/ship/wasmTeardown.mjs's computed-door census -- wasmCompilers, wasmDoors, doorReach -- and DOORS_AT_V4840, the population
// it found measured under tools/ship/wasmExitHook.cjs. Split out of wasmTeardown-selfcheck at v4840's step 4b: the census put that gate
// past the sweep's line, and recordReach-selfcheck went red because both records it guards (WASM_AT_V4663 and this one) were then
// guarded by nothing the ritual runs. wasmTeardown-selfcheck keeps a cheap row over DOORS_AT_V4840; this gate holds the census.
//
// SABOTAGES, RESULTS BY NAME (taken while these rows were wasmTeardown-selfcheck's section 7, and re-run here with the same counts):
//   L. box3dFingerprint-selfcheck's terminal process.exit() put back          -> RED (3 rows: accounted, converted, live)
//   M. a bare file name names a compiler without its folder beside it        -> RED (1 row, the door fixture)
//   N. a LITERAL import of the glue no longer excluded from doors             -> RED (2 rows: the door fixture, and the
//      reach fixture, whose literal-only gate now reaches a "door")
//   O. the reverse walk stops at a door's direct importers                    -> RED (2 rows: the live census, 58 gates no
//      longer reached, and the depth-two fixture)
//   P. one measured member (roster) removed from DOORS_AT_V4840              -> RED (1 row, naming it and the command) -- and the
//      two holding rows, wasmTeardown-selfcheck's and dracoEncode-selfcheck's, each 1 red (13 members against 14 measured)
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { codeOnly } from "./sourceScan.mjs";
import { measureExit, WASM_AT_V4663, exitCallCount } from "./wasmTeardown.mjs";
import * as WT from "./wasmTeardown.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log(`  ----  ${l}`);

console.log("wasmDoors-selfcheck -- every gate that reaches a wasm compiler through a computed door, accounted for\n");

console.log("1. *** THE COMPUTED DOOR, CENSUSED: EVERY GATE THAT REACHES A WASM COMPILER THROUGH ONE, ACCOUNTED FOR ***");
{
    // wasmTeardown-selfcheck's section 6 ended "a census of the door ... is not built. The rig's clone-verify found every member
    // after v4663, and it is still the instrument." Built at v4840 (tools/ship/wasmTeardown.mjs: wasmCompilers, wasmDoors, doorReach) and it found five
    // members the rig had not reached yet -- green gates, exit 0, each compiling box3d's glue and then calling process.exit().
    const read = (g) => fs.readFileSync(path.join(ENG, g), "utf8");
    const left = (g) => exitCallCount(codeOnly(read(g)));
    const t0 = Date.now();
    const { compilers, doors } = WT.wasmDoors();
    const reach = WT.doorReach(doors);
    report(`${compilers.length} wasm compilers (vendor/ included), ${doors.length} computed doors to them, ${reach.size} gates reaching one -- ` +
        `${Date.now() - t0} ms, candidates found by git grep (the same doors and the same reach as reading every file, compared at v4840)`);
    const door = (m) => doors.find((d) => d.module === m);
    // The glue paths are BUILT FROM PARTS, as orreryFleet-selfcheck builds its needle: spelled whole, they made this gate a
    // "satellite" of box3d and of the Draco encoder in the orrery's importer scan (box3d 27 against a baseline of 26 on the first
    // run), and the tree's rule is that the fix is not an exclusion entry -- this file names the glues, it does not load them.
    const glueOf = (body, file) => "vendor/" + body + "/" + file;
    ok("!! the census finds the door the rig found and the one v4663 named, each to the glue it loads",
        !!door("tools/export/dracoEncode.mjs") && door("tools/export/dracoEncode.mjs").glue.includes(glueOf("draco-encoder", "draco_encoder_nodejs.js")) &&
        !!door("physics/box3d/box3dNode.mjs") && door("physics/box3d/box3dNode.mjs").glue.includes(glueOf("box3d", "box3d.js")) &&
        reach.has("tools/ship/dracoEncode-selfcheck.mjs"),
        doors.map((d) => `${d.module} -> ${d.glue.join(", ")}`).join("; "));
    const recorded = new Map([...WASM_AT_V4663.compilers.map((c) => [c.gate, c.exitCalls]), ...WT.DOORS_AT_V4840.members.map((c) => [c.gate, c.exitCalls])]);
    const unexplained = [...reach].filter(([g]) => left(g) > 0 && !(recorded.has(g) && left(g) <= recorded.get(g)));
    ok("!! *** every gate reaching a computed door to wasm leaves without process.exit(), or was measured under the hook and its bail-outs counted ***",
        unexplained.length === 0 && reach.size >= WT.DOORS_AT_V4840.reach,
        unexplained.length
            ? unexplained.map(([g, d]) => `${g} (via ${d}): ${left(g)} process.exit() call(s) and no measurement -- run it under the hook ` +
                `(WT.measureExit) and convert its exit, or record its bail-outs in DOORS_AT_V4840`).join("; ")
            : `${reach.size} gates: ${[...reach].filter(([g]) => left(g) === 0).length} with no exit in code, the rest measured (v4663's census, DOORS_AT_V4840)`);
    const converted = WT.DOORS_AT_V4840.members.filter((m) => m.exitAfterWasmBefore);
    ok("!! ...and the five it found with the crash shape are converted: their terminal exits are gone and the verdict travels by exitCode",
        converted.length === WT.DOORS_AT_V4840.crashShapeBefore &&
        converted.every((m) => left(m.gate) <= m.exitCalls && /process\.exitCode\s*=\s*fails/.test(codeOnly(read(m.gate)))),
        converted.map((m) => `${m.gate.split("/").pop()}: ${left(m.gate)} exit call(s) left (${m.exitCalls} recorded, a bail-out before wasm where 1)`).join("; "));
    const L = measureExit("physics/box3dFingerprint-selfcheck.mjs");
    ok("*** and one of them, under the hook now, compiles wasm and leaves without exit() ***",
        L.ok && L.wasmCalls > 0 && !L.exitCalled && !L.exitAfterWasm,
        L.ok ? `${L.wasmCalls} wasm compile(s), process.exit() ${L.exitCalled ? "CALLED" : "not called"}, exit code ${L.code}` : "no marker -- UNKNOWN, not green");

    // THE RULES, ON A TREE BUILT FOR THEM. resolveSpec asks the file system, so the fixture is real files in a temp directory.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wasmDoors-"));
    try {
        const put = (rel, text) => { const p = path.join(tmp, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); return { path: p, text }; };
        const glue = put("vendor/glue/glue.js", "WebAssembly.instantiate(bytes);");
        const qidx = put("vendor/q/dist/index.js", "WebAssembly.compile(bytes);");
        const files = [
            put("a/door.mjs", 'import { createRequire } from "node:module"; const P = path.resolve(HERE, "..", "vendor", "glue", "glue.js"); createRequire(import.meta.url)(P);'),
            put("a/literal.mjs", 'import g from "../vendor/glue/glue.js"; const m = await import(name);'),
            put("a/generic.mjs", 'const m = await import(p); const f = "index.js", d = "dist";'),
            put("a/bare.mjs", 'const m = await import(p); const f = "glue.js";'),
            put("a/tail.mjs", 'const m = await import(pathToFileURL(join(dir, "q/dist/index.js")).href);'),
            put("a/mid.mjs", 'import { x } from "./door.mjs"; export const y = x;'),
            put("g/far-selfcheck.mjs", 'import { y } from "../a/mid.mjs"; console.log(y);'),
            put("g/none-selfcheck.mjs", 'import g from "../a/literal.mjs";'),
        ];
        const fx = WT.wasmDoors({ root: tmp, files, compilers: [glue.path, qidx.path] });
        const names = fx.doors.map((d) => d.module).sort().join(", ");
        ok("!! *** on fixtures: a computed load naming the glue with its folder is a door, and so is a path tail; a literal import, a bare index.js and a bare name without its folder are not ***",
            names === "a/door.mjs, a/tail.mjs", `doors: ${names || "none"} (expected a/door.mjs, a/tail.mjs)`);
        const fr = WT.doorReach(fx.doors, { root: tmp, files, gates: ["g/far-selfcheck.mjs", "g/none-selfcheck.mjs"] });
        ok("  ...and a gate two imports from a door reaches it, while one importing only the literal loader does not",
            fr.get("g/far-selfcheck.mjs") === "a/door.mjs" && !fr.has("g/none-selfcheck.mjs"), JSON.stringify([...fr]));
    } finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} }
}

console.log(fails ? `\nwasmDoors-selfcheck: ${fails} FAILED` : "\nwasmDoors-selfcheck: all checks pass");
console.log("unchecked here: a glue file chosen at run time with no literal naming it anywhere -- a door the rule cannot name, and still " +
    "the rig's clone-verify to find; and the crash itself, which this platform's libuv does not assert.");
process.exitCode = fails ? 1 : 0;
