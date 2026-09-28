#!/usr/bin/env node
// WebGLEngine/tools/ship/genGateAbsolute.mjs -- v4700: the runner render/learned-absolute-preregistration.md names.
//
// *** A THIN CLI OVER v4698's RUNNER, NOT A SECOND RUNNER. *** harvestAll and runFolds are genGateFolds.mjs's,
// driven with ARMS_H5 and the H5 document's constants. A second loop would be a second implementation of
// leave-one-scene-out that could drift from the one v4699 measured through.
//
// *** IT WRITES ITS CACHE GZIPPED. *** v4699's runner wrote plain JSON and the round compressed it by hand; a
// storage step a person must remember is a step that gets skipped. NOT RUN in the round that commits it.
"use strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ARMS_H5, PREREG_H5, declared, readDoc, usableFolds, h5, c11 } from "./foldStats.mjs";
import { harvestAll, runFolds } from "./genGateFolds.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const CACHE_H5 = "tools/ship/genGate-absolute4.json.gz";
export const RESULT_H5 = "tools/ship/genGate-absolute4-result.json";

export function analyse(run, d) {
    const { usable } = usableFolds(run.meta, d);
    return { c11: c11(run.results, usable, d.alpha, "SHUF1_A", "SHUF1_B"), h5: h5(run.results, run.meta, d) };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const d = declared(readDoc(PREREG_H5));
    const byScene = await harvestAll(d);
    fs.writeFileSync(path.join(ENG, CACHE_H5), zlib.gzipSync(JSON.stringify(byScene), { level: 9 }));
    const run = runFolds(byScene, d, ARMS_H5);
    const out = { declared: d, arms: ARMS_H5, ...run, ...analyse(run, d) };
    fs.writeFileSync(path.join(ENG, RESULT_H5), JSON.stringify(out, null, 1) + "\n");
    console.log(JSON.stringify({ c11: out.c11.fired, h5: out.h5.reportable ? out.h5.supported : out.h5.why }));
}
