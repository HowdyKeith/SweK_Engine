// WebGLEngine/tools/ship/subEstimatorStudyV3Cmd.mjs -- UNNUMBERED. The command line of the rung 4a version 3 study (tools/ship/subEstimatorStudyV3.mjs); see there for the arguments.
import { command } from "./subEstimatorStudyV3.mjs";
process.exitCode = await command(process.argv.slice(2));
