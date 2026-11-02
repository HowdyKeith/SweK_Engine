#!/usr/bin/env node
// WebGLEngine/tools/ship/takeCapabilityMap.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/takeCapabilityMap.mjs [--check]
// Writes ../docs/BRAIN-CAPABILITY-MAP.md from brain/capabilityMap.mjs (the library, held by brain/capabilityMap-selfcheck.mjs). --check writes nothing and exits 1 when the file on disk is not what the data renders.
// No exports on purpose: the library has this command as its caller that is not a gate.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderMarkdown, reportLines } from "../../brain/capabilityMap.mjs";

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "docs", "BRAIN-CAPABILITY-MAP.md"), text = renderMarkdown() + "\n";
if (process.argv.includes("--check")) {
    const have = fs.existsSync(out) ? fs.readFileSync(out, "utf8") : null;
    console.log(have === text ? "BRAIN-CAPABILITY-MAP.md is current" : "BRAIN-CAPABILITY-MAP.md is NOT current: run node tools/ship/takeCapabilityMap.mjs");
    process.exitCode = have === text ? 0 : 1;
} else { fs.writeFileSync(out, text); console.log("wrote " + out); for (const l of reportLines()) console.log(l); }
