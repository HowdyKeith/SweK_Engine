// WebGLEngine/tools/ship/takeSeaPatch.mjs -- UNNUMBERED (the version is chosen at ship time).
//
// The command for tools/ship/seaPatch.mjs: `node tools/ship/takeSeaPatch.mjs` prints the patch report, `--write` regenerates
// world/ocean/seaMain.mjs and world/ocean/seaOceanWgsl.mjs from the pinned upstream bytes. NO EXPORTS ON PURPOSE: a library with exports
// and no caller but its gate is an orphan in the census, so the library (seaPatch.mjs, named after its gate) is held here by a command.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    UPSTREAM_PATH, UPSTREAM_SHA256, PATCHES, PATCHED_PATH,
    OCEAN_UPSTREAM_PATH, OCEAN_UPSTREAM_SHA256, OCEAN_PATCHES, OCEAN_PATCHED_PATH,
    applyPatches, reportLines, sha256,
} from "./seaPatch.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const jobs = [[UPSTREAM_PATH, UPSTREAM_SHA256, PATCHES, PATCHED_PATH], [OCEAN_UPSTREAM_PATH, OCEAN_UPSTREAM_SHA256, OCEAN_PATCHES, OCEAN_PATCHED_PATH]];
for (const [src, pin, list, dst] of jobs) {
    const up = fs.readFileSync(path.join(ENG, src));
    if (sha256(up) !== pin) { console.error(src + " is not the pinned one"); process.exit(1); }
    const out = applyPatches(up.toString("utf8"), list);
    if (process.argv.includes("--write")) { fs.writeFileSync(path.join(ENG, dst), out); console.log("wrote " + dst + " " + out.length + " bytes sha256 " + sha256(out)); }
    else console.log(reportLines(up.toString("utf8"), list).join("\n"));
}
