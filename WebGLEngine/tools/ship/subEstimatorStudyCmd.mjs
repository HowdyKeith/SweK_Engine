// WebGLEngine/tools/ship/subEstimatorStudyCmd.mjs -- UNNUMBERED. THE COMMAND for tools/ship/subEstimatorStudy.mjs (see its header for the two lines that call it). NO EXPORTS ON PURPOSE.
"use strict";
import { command } from "./subEstimatorStudy.mjs";

process.exit(await command(process.argv.slice(2)));
