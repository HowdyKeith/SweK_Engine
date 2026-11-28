// WebGLEngine/tools/ship/takeFlyCourseLift.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// DO THE COURSE-CHOSEN FLIES GAIN LEAST FROM THE RICHER SCENE? THE COMMAND (registered in brain/FLY_COURSE_LIFT_WIP.md; the arithmetic is tools/ship/flyCourseLift.mjs).
//
//   node tools/ship/takeFlyCourseLift.mjs read     the checks and the reading, from the tally-share round's committed results file. Nothing is flown.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as FS from "./flyTallyShare.mjs";
import * as PF from "./flyCourseLift.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", ".."), FILE = path.join(ENG, FS.RESULTS);
const argv = process.argv.slice(2);
if (!(argv.length === 1 && argv[0] === "read")) { console.error("usage: node tools/ship/takeFlyCourseLift.mjs read"); process.exitCode = 2; }
else if (!fs.existsSync(FILE)) { console.error(`${FS.RESULTS} is not there: the tally-share round has not been run`); process.exitCode = 1; }
else {
    const F = Object.fromEntries(Object.entries(PF.FILES).map(([k, f]) => [k, FS.fileOf(fs.readFileSync(path.join(ENG, f)))]));
    const R = PF.reading(FS.fileOf(fs.readFileSync(FILE)).lines, F);
    for (const l of PF.readingLines(R)) console.log(l);
    process.exitCode = R.checks.length ? 1 : 0;
}
