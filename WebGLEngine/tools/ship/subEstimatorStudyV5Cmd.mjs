// WebGLEngine/tools/ship/subEstimatorStudyV5Cmd.mjs -- UNNUMBERED. The command line of the rung 4a version 5 study (tools/ship/subEstimatorStudyV5.mjs); see there for the arguments.
import { command } from "./subEstimatorStudyV5.mjs";
process.exitCode = await command(process.argv.slice(2));
